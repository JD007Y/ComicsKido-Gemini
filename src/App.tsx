/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence, MotionConfig } from 'motion/react';
import { 
  BookOpen, 
  Sparkles, 
  Camera, 
  Layout, 
  Languages, 
  ArrowRight, 
  ArrowLeft,
  Volume2,
  VolumeX,
  Printer,
  Loader2,
  Download,
  Share2,
  RotateCcw,
  Palette,
  AlertCircle,
  Upload,
  Image as ImageIcon,
  Play,
  Pause,
  Bookmark,
  Trash2,
  CheckCircle2,
  Heart,
  Terminal,
  BarChart2,
  Dices
} from 'lucide-react';
import { cn } from './lib/utils';
import { Language, PanelLayout, ComicStory, CharacterCasting, Panel, ArtStyle, VoicePersona } from './types';
import { decomposeStory, generatePanelImage, generateCharacterImage, describePhotoLikeness, translateToEnglishIfNeeded, ImageEngine, getActiveImageEngine, setActiveImageEngine, getActiveHfSubModel, setActiveHfSubModel, HuggingFaceSubModel, GeminiImageSubModel, getActiveGeminiSubModel, setActiveGeminiSubModel, PollinationsSubModel, getActivePollinationsSubModel, setActivePollinationsSubModel, getAutoFallbackEnabled, setAutoFallbackEnabled, StoryEngine, GeminiStorySubModel, HfStorySubModel, getActiveStoryEngine, setActiveStoryEngine, getActiveGeminiStorySubModel, setActiveGeminiStorySubModel, getActiveHfStorySubModel, setActiveHfStorySubModel, subscribeEngineSettings } from './services/gemini';
import { IMAGE_MODELS } from './config/models';
import { speak, playComicSound } from './lib/voice';
import { exportToPdf } from './lib/pdf';
import { exportElementAsPng, downloadAllPanelsAsZip } from './lib/export';
import { translations } from './translations';
import { CameraCapture } from './components/CameraCapture';
import { TerminalLogsModal } from './components/TerminalLogsModal';
import { ModelReportModal } from './components/ModelReportModal';
import { FLiteTextureModelCard } from './components/FLiteTextureModelCard';
import { StandaloneLogConsole } from './components/StandaloneLogConsole';
import { PerchanceModal } from './components/PerchanceModal';
import { attachUiActionLogging, logFlow } from './services/flowLogger';
import { logger } from './services/logger';
import { 
  getStoredLibrary, 
  saveStoryToDB, 
  deleteStoryFromDB, 
  clearEntireLibraryFromDB, 
  calculateStorageUsage 
} from './lib/db';

type Step = 'landing' | 'story' | 'casting' | 'layout' | 'generating' | 'reader';

const VERSION_NUMBER = 'v1.1.0';
const BUILD_NUMBER = '2026.07.27.01';
const SESSION_STORAGE_KEY = 'comicskido_last_story';

type SavedSession = {
  storyText?: string;
  characters?: CharacterCasting[];
  layout?: PanelLayout;
  artStyle?: ArtStyle;
  voicePersona?: VoicePersona;
  photoPool?: string[];
  language?: Language;
  enableAnimations?: boolean;
  accentColor?: string;
  step?: Step;
  comic?: ComicStory | null;
  totalTokens?: number;
  aiStats?: any;
  activePanel?: number;
};

function readSavedSession(): SavedSession | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return data && typeof data === 'object' ? data : null;
  } catch {
    return null;
  }
}

function resolveRestoredStep(step: Step | undefined): Step {
  if (!step || step === 'landing') return 'landing';
  // Don't restore into a stuck generating spinner after a reload
  if (step === 'generating') return 'layout';
  return step;
}

function stripHeavyImageData(value: string | undefined): string | undefined {
  if (!value) return value;
  // Keep remote http(s) thumbs; drop huge base64 payloads that explode localStorage
  if (value.startsWith('data:')) return undefined;
  return value;
}

function slimSessionForStorage(state: {
  storyText: string;
  characters: CharacterCasting[];
  layout: PanelLayout;
  artStyle: ArtStyle;
  voicePersona: VoicePersona;
  photoPool: string[];
  language: Language;
  enableAnimations: boolean;
  accentColor: string;
  step: Step;
  comic: ComicStory | null;
  totalTokens: number;
  aiStats: any;
  activePanel: number;
}) {
  return {
    ...state,
    // Prefer story text; never persist megabytes of panel/avatar base64 mid-generation
    photoPool: (state.photoPool || [])
      .map(stripHeavyImageData)
      .filter((u): u is string => !!u)
      .slice(0, 24),
    characters: (state.characters || []).map((c) => ({
      ...c,
      photoUrls: (c.photoUrls || [])
        .map(stripHeavyImageData)
        .filter((u): u is string => !!u),
      drawnPortraitUrl: stripHeavyImageData(c.drawnPortraitUrl),
    })),
    comic: state.comic
      ? {
          ...state.comic,
          panels: (state.comic.panels || []).map((p) => ({
            ...p,
            // Keep panel text/layout; drop image bytes from session draft
            imageUrl: stripHeavyImageData(p.imageUrl) || '',
          })),
          characters: (state.comic.characters || []).map((c) => ({
            ...c,
            photoUrls: (c.photoUrls || [])
              .map(stripHeavyImageData)
              .filter((u): u is string => !!u),
            drawnPortraitUrl: stripHeavyImageData(c.drawnPortraitUrl),
          })),
        }
      : null,
  };
}

export default function App() {
  const [isStandaloneLogsView, setIsStandaloneLogsView] = useState(() => {
    return window.location.search.includes('view=logs') || window.location.pathname === '/logs';
  });

  useEffect(() => {
    const handlePopState = () => {
      setIsStandaloneLogsView(window.location.search.includes('view=logs') || window.location.pathname === '/logs');
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const [step, setStep] = useState<Step>(() => resolveRestoredStep(readSavedSession()?.step));
  const stepRef = useRef<Step>(step);
  const sessionHydratedRef = useRef(true); // session fields hydrate synchronously from localStorage
  useEffect(() => {
    stepRef.current = step;
  }, [step]);

  // Record every UI click / control change + step transitions in Live Terminal (category: UI)
  useEffect(() => {
    return attachUiActionLogging(() => stepRef.current);
  }, []);

  const prevStepLoggedRef = useRef<Step | null>(null);
  useEffect(() => {
    // Skip duplicate StrictMode remount logs for the same step
    if (prevStepLoggedRef.current === step) return;
    prevStepLoggedRef.current = step;
    logFlow(`Flow → ${step}`, `User is now on the "${step}" screen`);
  }, [step]);

  const [imageEngine, setImageEngineState] = useState<ImageEngine>(() => getActiveImageEngine());
  const [hfSubModel, setHfSubModelState] = useState<HuggingFaceSubModel>(() => getActiveHfSubModel());
  const [geminiSubModel, setGeminiSubModelState] = useState<GeminiImageSubModel>(() => getActiveGeminiSubModel());
  const [pollinationsSubModel, setPollinationsSubModelState] = useState<PollinationsSubModel>(() => getActivePollinationsSubModel());
  const [autoFallback, setAutoFallbackState] = useState<boolean>(() => getAutoFallbackEnabled());

  const [storyEngine, setStoryEngineState] = useState<StoryEngine>(() => getActiveStoryEngine());
  const [geminiStorySubModel, setGeminiStorySubModelState] = useState<GeminiStorySubModel>(() => getActiveGeminiStorySubModel());
  const [hfStorySubModel, setHfStorySubModelState] = useState<HfStorySubModel>(() => getActiveHfStorySubModel());

  // Keep main toolbar engines in sync with WinAdmin / Live Terminal controls
  useEffect(() => {
    return subscribeEngineSettings((settings) => {
      setImageEngineState(settings.imageEngine);
      setHfSubModelState(settings.hfSubModel);
      setGeminiSubModelState(settings.geminiSubModel);
      setPollinationsSubModelState(settings.pollinationsSubModel);
      setAutoFallbackState(settings.autoFallback);
      setStoryEngineState(settings.storyEngine);
      setGeminiStorySubModelState(settings.geminiStorySubModel);
      setHfStorySubModelState(settings.hfStorySubModel);
      setAiStats(prev => ({
        ...prev,
        imageModelName:
          settings.imageEngine === 'huggingface'
            ? `hf-${settings.hfSubModel}`
            : settings.imageEngine === 'pollinations'
            ? `pollinations-${settings.pollinationsSubModel}`
            : settings.geminiSubModel,
        textModelName:
          settings.storyEngine === 'huggingface'
            ? `hf-${settings.hfStorySubModel}`
            : settings.geminiStorySubModel,
      }));
    });
  }, []);

  const handleSetAutoFallback = (enabled: boolean) => {
    setAutoFallbackState(enabled);
    setAutoFallbackEnabled(enabled);
    logFlow(`Auto-fallback ${enabled ? 'ON' : 'OFF'}`, `Image engine auto-fallback preference changed`);
  };

  const handleSetImageEngine = (engine: ImageEngine) => {
    setImageEngineState(engine);
    setActiveImageEngine(engine);
    logFlow(`Image engine → ${engine}`, `Active image creation engine switched to ${engine}`);
    setAiStats(prev => ({
      ...prev,
      imageModelName: engine === 'huggingface' ? `hf-${hfSubModel}` : engine === 'pollinations' ? `pollinations-${pollinationsSubModel}` : geminiSubModel
    }));
  };

  const handleSetHfSubModel = (model: HuggingFaceSubModel) => {
    setHfSubModelState(model);
    setActiveHfSubModel(model);
    setAiStats(prev => ({
      ...prev,
      imageModelName: `hf-${model}`
    }));
  };

  const handleSetGeminiSubModel = (model: GeminiImageSubModel) => {
    setGeminiSubModelState(model);
    setActiveGeminiSubModel(model);
    setAiStats(prev => ({
      ...prev,
      imageModelName: model
    }));
  };

  const handleSetPollinationsSubModel = (model: PollinationsSubModel) => {
    setPollinationsSubModelState(model);
    setActivePollinationsSubModel(model);
    setAiStats(prev => ({
      ...prev,
      imageModelName: `pollinations-${model}`
    }));
  };

  const handleSetStoryEngine = (engine: StoryEngine) => {
    setStoryEngineState(engine);
    setActiveStoryEngine(engine);
    logFlow(`Story engine → ${engine}`, `Story decomposition engine switched to ${engine}`);
    setAiStats(prev => ({
      ...prev,
      textModelName: engine === 'huggingface' ? `hf-${hfStorySubModel}` : geminiStorySubModel
    }));
  };

  const handleSetGeminiStorySubModel = (model: GeminiStorySubModel) => {
    setGeminiStorySubModelState(model);
    setActiveGeminiStorySubModel(model);
    setAiStats(prev => ({
      ...prev,
      textModelName: model
    }));
  };

  const handleSetHfStorySubModel = (model: HfStorySubModel) => {
    setHfStorySubModelState(model);
    setActiveHfStorySubModel(model);
    setAiStats(prev => ({
      ...prev,
      textModelName: `hf-${model}`
    }));
  };

  const initialSession = useRef<SavedSession | null>(readSavedSession()).current;

  const [enableAnimations, setEnableAnimations] = useState(
    initialSession?.enableAnimations !== undefined ? initialSession.enableAnimations : true
  );
  const [accentColor, setAccentColor] = useState(initialSession?.accentColor || '#FF6321');
  const [language, setLanguage] = useState<Language>(initialSession?.language || 'en');
  const [storyText, setStoryText] = useState(initialSession?.storyText || '');
  const [photoPool, setPhotoPool] = useState<string[]>(
    initialSession?.photoPool?.length
      ? initialSession.photoPool
      : [
          'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=300&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=300&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=300&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300&auto=format&fit=crop&q=80',
          'https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=300&auto=format&fit=crop&q=80',
        ]
  );
  const [characters, setCharacters] = useState<CharacterCasting[]>(
    initialSession?.characters?.length
      ? initialSession.characters
      : [
          {
            role: 'protagonist',
            name: '',
            photoUrls: [],
            description: 'A brave adventurous spirit.'
          }
        ]
  );
  const [layout, setLayout] = useState<PanelLayout>(initialSession?.layout || 4);
  const [artStyle, setArtStyle] = useState<ArtStyle>(initialSession?.artStyle || 'vibrant');
  const [voicePersona, setVoicePersona] = useState<VoicePersona>(initialSession?.voicePersona || 'storyteller');
  const [comic, setComic] = useState<ComicStory | null>(initialSession?.comic || null);
  const [totalTokens, setTotalTokens] = useState(initialSession?.totalTokens || 0);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [showTerminalLogs, setShowTerminalLogs] = useState(false);
  const [showModelReportModal, setShowModelReportModal] = useState(false);
  const [showFLiteTextureModal, setShowFLiteTextureModal] = useState(false);
  const [showPerchanceModal, setShowPerchanceModal] = useState(false);
  const [aiStats, setAiStats] = useState(() => initialSession?.aiStats || {
    textPromptTokens: 0,
    textCompletionTokens: 0,
    textCalls: 0,
    imageCalls: 0,
    characterCalls: 0,
    textModelName: 'gemini-3.5-flash',
    imageModelName: 'gemini-2.5-flash-image',
    lastApiResponseTimeMs: 0,
    lastApiStatus: 'Ready / Idle'
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [activePanel, setActivePanel] = useState(initialSession?.activePanel || 0);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [quotaCountdown, setQuotaCountdown] = useState<number | null>(null);
  const [cooldownSeconds, setCooldownSeconds] = useState<number | null>(null);
  const [cooldownTotal, setCooldownTotal] = useState<number | null>(null);

  // Bind beautiful real-time background self-healing rate limit handler
  useEffect(() => {
    const handleTick = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setCooldownSeconds(detail.secondsRemaining);
      setCooldownTotal(detail.totalSeconds);
    };
    const handleEnd = () => {
      setCooldownSeconds(null);
      setCooldownTotal(null);
    };

    window.addEventListener('gemini-cooldown-tick', handleTick);
    window.addEventListener('gemini-cooldown-end', handleEnd);

    return () => {
      window.removeEventListener('gemini-cooldown-tick', handleTick);
      window.removeEventListener('gemini-cooldown-end', handleEnd);
    };
  }, []);

  // Auto-retry trigger on quota/rate-limits cooldown
  useEffect(() => {
    if (quotaCountdown === null) return;
    if (quotaCountdown <= 0) {
      setQuotaCountdown(null);
      setGenerationError(null);
      startGeneration();
      return;
    }
    const t = setTimeout(() => {
      setQuotaCountdown(prev => (prev !== null ? prev - 1 : null));
    }, 1000);
    return () => clearTimeout(t);
  }, [quotaCountdown]);
  const SESSION_CREDIT = 100000; // 100k tokens per session as a "virtual limit"

  // PDF and Print configurations
  const [printSize, setPrintSize] = useState<'A4' | 'A5' | 'A6'>('A4'); // A6 is "half A5"
  const [printOrientation, setPrintOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [printLayout, setPrintLayout] = useState<'one-per-page' | 'grid'>('one-per-page');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const comicCardRef = useRef<HTMLDivElement>(null);
  const [editingCharIndex, setEditingCharIndex] = useState<number | null>(0);
  const [showCamera, setShowCamera] = useState(false);

  // Helper to scale down images so they are lightweight (max 380px) and fast for processing
  const shrinkImage = (dataUrl: string, maxDim = 380): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width;
        let h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', 0.8));
        } else {
          resolve(dataUrl);
        }
      };
      img.onerror = () => {
        resolve(dataUrl);
      };
      img.src = dataUrl;
    });
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const rawPhoto = reader.result as string;
        try {
          const shrunkenPhoto = await shrinkImage(rawPhoto);
          setPhotoPool(prev => {
            if (prev.includes(shrunkenPhoto)) return prev;
            return [...prev, shrunkenPhoto];
          });
          if (editingCharIndex !== null) {
            togglePhotoForCharacter(editingCharIndex, shrunkenPhoto);
          }
        } catch (err) {
          console.error("Error shrinking photo", err);
          setPhotoPool(prev => [...prev, rawPhoto]);
          if (editingCharIndex !== null) {
            togglePhotoForCharacter(editingCharIndex, rawPhoto);
          }
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCameraCapture = async (imageDataUrl: string) => {
    try {
      const shrunkenPhoto = await shrinkImage(imageDataUrl);
      setPhotoPool(prev => {
        if (prev.includes(shrunkenPhoto)) return prev;
        return [...prev, shrunkenPhoto];
      });
      if (editingCharIndex !== null) {
        togglePhotoForCharacter(editingCharIndex, shrunkenPhoto);
      }
    } catch (err) {
      console.error("Error shrinking camera shot", err);
      setPhotoPool(prev => [...prev, imageDataUrl]);
      if (editingCharIndex !== null) {
        togglePhotoForCharacter(editingCharIndex, imageDataUrl);
      }
    }
    setShowCamera(false);
  };

  const t = translations[language];

  const togglePhotoForCharacter = (charIndex: number, photoUrl: string) => {
    setCharacters(prev => {
      const n = [...prev];
      const currentUrls = n[charIndex].photoUrls || [];
      if (currentUrls.includes(photoUrl) && currentUrls[0] === photoUrl && currentUrls.length === 1) {
        // Clicking the active photo again deselects it
        n[charIndex] = {
          ...n[charIndex],
          photoUrls: [],
          drawnPortraitUrl: undefined,
        };
      } else {
        // Single primary reference photo — what you see is what gets analyzed
        n[charIndex] = {
          ...n[charIndex],
          photoUrls: [photoUrl],
          drawnPortraitUrl: undefined,
        };
      }
      return n;
    });
  };

  const addCharacter = () => {
    setCharacters(prev => [
      ...prev,
      {
        role: 'helper',
        name: '',
        photoUrls: [],
        description: 'A loyal companion.'
      }
    ]);
    setEditingCharIndex(characters.length);
  };

  const removeCharacter = (index: number) => {
    if (characters.length <= 1) return;
    setCharacters(prev => prev.filter((_, i) => i !== index));
    setEditingCharIndex(0);
  };

  const [isMuted, setIsMuted] = useState(true);
  const [savedStories, setSavedStories] = useState<ComicStory[]>([]);
  const [isAutoplay, setIsAutoplay] = useState(false);
  const [saveToast, setSaveToast] = useState({ show: false, message: '' });
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [storageUsage, setStorageUsage] = useState({ usedMB: '0.00', percent: 0 });
  const isAutoplayRef = useRef(isAutoplay);

  const [isDrawnPortraitGenerating, setIsDrawnPortraitGenerating] = useState(false);

  const drawCharacterPortraitOnDemand = async (charIndex: number | null) => {
    if (charIndex === null || !characters[charIndex]) return;
    const targetIndex = charIndex;
    const char = characters[targetIndex];
    setIsDrawnPortraitGenerating(true);
    // Clear the RIGHT avatar slot immediately so redraw visibly replaces the old image
    setCharacters(prev =>
      prev.map((c, idx) => (idx === targetIndex ? { ...c, drawnPortraitUrl: undefined } : c))
    );
    logFlow(
      `Draw portrait: ${char.name || 'Hero'}`,
      `Char #${targetIndex + 1} | Photos: ${char.photoUrls?.length || 0} | Engine: ${imageEngine}`
    );
    try {
      let visualPrompt = char.description || "";
      
      // Analyze physical portrait traits from the active reference photo
      if (char.photoUrls && char.photoUrls.length > 0) {
        try {
          const likenessDesc = await describePhotoLikeness(char.photoUrls[0], char.name || "Hero");
          if (likenessDesc && likenessDesc.trim()) {
            // Photo likeness WINS for appearance (hair, age, face). Traits are personality-only hints.
            visualPrompt = [
              likenessDesc.trim(),
              char.description?.trim()
                ? `Personality/story traits only (do NOT change hair color, age, or face from the photo): ${char.description.trim()}`
                : "",
            ].filter(Boolean).join(" ");
          }
        } catch (err) {
          console.error("Failed to analyze photo likeness, falling back to description", err);
        }
      }

      // Translate description to English to bypass bugs and enable total compliance
      const englishVisualPrompt = await translateToEnglishIfNeeded(visualPrompt);

      const rawUrl = await generateCharacterImage(char.name || "Hero", englishVisualPrompt, artStyle);
      if (rawUrl) {
        let compressedUrl = rawUrl;
        try {
          if (rawUrl.startsWith('data:image/')) {
            compressedUrl = await shrinkImage(rawUrl, 380);
          }
        } catch (shrinkErr) {
          console.error("Failed to compress portrait", shrinkErr);
        }

        setCharacters(prev =>
          prev.map((c, idx) =>
            idx === targetIndex
              ? { ...c, drawnPortraitUrl: compressedUrl, visualPrompt: englishVisualPrompt }
              : c
          )
        );
        
        setAiStats(prev => ({
          ...prev,
          characterCalls: prev.characterCalls + 1,
          lastApiStatus: `200 OK - On-demand Portrait Generated for ${char.name}`
        }));
      }
    } catch (e: any) {
      console.error("On-demand avatar drawing failed", e);
      alert(language === 'he' 
        ? `שגיאה בציור הפורטרט: ${e.message || "מכסת ה-AI עמוסה, אנא נסה שוב בעוד דקה"}`
        : `Drawing failed: ${e.message || "Quota limits reached, please retry in 1 minute."}`
      );
    } finally {
      setIsDrawnPortraitGenerating(false);
    }
  };

  useEffect(() => {
    isAutoplayRef.current = isAutoplay;
  }, [isAutoplay]);

  const updateStorageUsage = async () => {
    try {
      const usage = await calculateStorageUsage();
      setStorageUsage({ usedMB: usage.usedMB, percent: usage.percent });
    } catch (e) {
      setStorageUsage({ usedMB: '0.00', percent: 0 });
    }
  };

  useEffect(() => {
    updateStorageUsage();
  }, [savedStories]);

  const clearEntireBookshelf = async () => {
    const confirmClear = window.confirm(
      language === 'he' 
        ? "⚠️ האם אתם בטוחים שברצונכם לפנות את כל מדף הספרים שלכם? פעולה זו תימחק את כל הסיפורים לצמיתות ותפנה מקום לסיפורים חדשים!" 
        : language === 'fr'
        ? "⚠️ Voulez-vous vraiment vider toute votre bibliothèque ? Vos bandes dessinées seront supprimées définitivement pour libérer de l'espace."
        : "⚠️ Are you sure you want to clear your entire bookshelf? This will delete all saved comic stories permanently to free up storage space."
    );
    if (confirmClear) {
      try {
        await clearEntireLibraryFromDB();
        localStorage.removeItem('comicskido_library_v1'); // Clean up old storage space
        localStorage.removeItem(SESSION_STORAGE_KEY);
        setSavedStories([]);
        await updateStorageUsage();
      } catch (e) {
        console.error("Failed to clear shelf", e);
      }
    }
  };

  // Load saved stories on mount, checking IndexedDB and automatically migrating legacy localStorage books
  useEffect(() => {
    const loadSavedStoriesOnMount = async () => {
      try {
        let dbStories = await getStoredLibrary();
        
        // Check if old legacy localstorage exists
        const legacyStored = localStorage.getItem('comicskido_library_v1');
        if (legacyStored) {
          try {
            const decoded = JSON.parse(legacyStored);
            if (Array.isArray(decoded) && decoded.length > 0) {
              console.log("Migrating legacy books to roomy unlimited IndexedDB storage...");
              for (const legacyStory of decoded) {
                // Generate a key if missing
                if (!legacyStory.id) {
                  legacyStory.id = 'comic_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
                }
                if (!dbStories.some(s => s.id === legacyStory.id || s.title === legacyStory.title)) {
                  await saveStoryToDB(legacyStory);
                  dbStories.push(legacyStory);
                }
              }
              // Safely delete legacy key so we don't duplicate on next startup
              localStorage.removeItem('comicskido_library_v1');
            }
          } catch (migrateErr) {
            console.error("Migration from legacy localStorage failed:", migrateErr);
          }
        }
        
        setSavedStories(dbStories);
        await updateStorageUsage();
      } catch (e) {
        console.error("Failed to load stories library from IndexedDB", e);
      }
    };
    loadSavedStoriesOnMount();
  }, []);

  const saveCurrentStoryToLibrary = async () => {
    if (!comic) return;
    try {
      // Ensure current comic has an ID to prevent overlap
      const activeId = comic.id || 'comic_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
      if (!comic.id) {
        comic.id = activeId;
      }
      
      const storyToSave = {
        ...comic,
        id: activeId,
        characters: characters, // Save with everything including references, descriptions, and character portraits!
        savedAt: Date.now()
      };

      // Put in DB
      await saveStoryToDB(storyToSave as any);

      // Reload list from DB to ensure state represents real database
      const refreshedList = await getStoredLibrary();
      setSavedStories(refreshedList);
      
      setSaveToast({ 
        show: true, 
        message: language === 'he' 
          ? '📖 הספר נשמר בהצלחה בספרייה הענקית שלכם!' 
          : language === 'fr' 
          ? '📖 Histoire enregistrée dans votre bibliothèque !' 
          : '📖 Story saved successfully to your Library!' 
      });
      setTimeout(() => setSaveToast({ show: false, message: '' }), 4000);
    } catch (e) {
      console.error("Failed to save story to library", e);
      setSaveToast({ 
        show: true, 
        message: language === 'he' 
          ? '⚠️ שגיאה בשמירת הספר בזיכרון המכשיר.' 
          : language === 'fr' 
          ? '⚠️ Erreur d\'enregistrement de l\'histoire.' 
          : '⚠️ Failed to save story to device storage.' 
      });
      setTimeout(() => setSaveToast({ show: false, message: '' }), 6000);
    }
  };

  const deleteSavedStoryFromLibrary = async (id: string | undefined, title: string) => {
    try {
      if (id) {
        await deleteStoryFromDB(id);
      } else {
        const matched = savedStories.find(s => s.title === title);
        if (matched && matched.id) {
          await deleteStoryFromDB(matched.id);
        }
      }
      const refreshedList = await getStoredLibrary();
      setSavedStories(refreshedList);
    } catch (e) {
      console.error("Failed to delete story from library", e);
    }
  };

  const THEME_COLORS = [
    { name: 'Orange', value: '#FF6321' },
    { name: 'Blue', value: '#0084FF' },
    { name: 'Green', value: '#00D166' },
    { name: 'Purple', value: '#A040FF' },
    { name: 'Pink', value: '#FF4081' },
    { name: 'Yellow', value: '#FFB800' },
    { name: 'Rainbow', value: 'rainbow' }
  ];

  useEffect(() => {
    if (accentColor === 'rainbow') {
      document.documentElement.style.setProperty('--accent', '#FF6321'); // Fallback
    } else {
      document.documentElement.style.setProperty('--accent', accentColor);
    }
  }, [accentColor]);

  // Persistence logic
  const saveState = () => {
    if (!sessionHydratedRef.current) return;
    try {
      // Never overwrite a saved story with an empty one (reload race / StrictMode)
      const existing = readSavedSession();
      const storyToSave =
        storyText.trim() || existing?.storyText || '';

      const stateToSave = slimSessionForStorage({
        storyText: storyToSave,
        characters,
        layout,
        artStyle,
        voicePersona,
        photoPool,
        language,
        enableAnimations,
        accentColor,
        // Don't persist "generating" — remount would dump users into a broken spinner
        step: step === 'generating' ? 'layout' : step,
        comic,
        totalTokens,
        aiStats,
        activePanel
      });
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(stateToSave));
    } catch (e) {
      console.warn("Failed to save state to localStorage", e);
      // Last-ditch: preserve at least the story text so Generate doesn't say "empty"
      try {
        const existing = readSavedSession();
        localStorage.setItem(
          SESSION_STORAGE_KEY,
          JSON.stringify({
            ...(existing || {}),
            storyText: storyText.trim() || existing?.storyText || '',
            step: step === 'generating' ? 'layout' : step,
          })
        );
      } catch (_) {}
    }
  };

  const loadState = () => {
    const data = readSavedSession();
    if (data) {
      try {
        setStoryText(data.storyText || '');
        setCharacters(data.characters || []);
        setLayout(data.layout || 4);
        setArtStyle(data.artStyle || 'vibrant');
        setVoicePersona(data.voicePersona || 'storyteller');
        setPhotoPool(data.photoPool || []);
        setLanguage(data.language || 'en');
        if (data.enableAnimations !== undefined) setEnableAnimations(data.enableAnimations);
        if (data.accentColor) setAccentColor(data.accentColor);
        if (data.comic) setComic(data.comic);
        if (data.totalTokens !== undefined) setTotalTokens(data.totalTokens);
        if (data.aiStats) setAiStats(data.aiStats);
        if (data.activePanel !== undefined) setActivePanel(data.activePanel);
        return true;
      } catch (e) {
        console.error("Failed to load saved story", e);
      }
    }
    return false;
  };

  // Mark session hydrated after first paint so autosave cannot wipe storyText on remount
  useEffect(() => {
    sessionHydratedRef.current = true;
    const saved = readSavedSession();
    if (saved?.storyText && !storyText.trim()) {
      setStoryText(saved.storyText);
      logFlow('Restored story text', `Recovered ${saved.storyText.length} chars from session after reload`);
    }
  }, []);

  useEffect(() => {
    saveState();
  }, [step, storyText, characters, layout, artStyle, voicePersona, photoPool, language, enableAnimations, accentColor, comic, totalTokens, aiStats, activePanel]);

  // Autoplay and sound playback coordination
  useEffect(() => {
    let autoplayTimer: NodeJS.Timeout;

    if (step === 'reader' && comic && comic.panels && comic.panels[activePanel]) {
      const panel = comic.panels[activePanel];
      
      // Stop ongoing voice syntheses immediately when panel changes
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }

      if (isAutoplay) {
        // Play the thematic sound
        if (!isMuted && panel.mood) {
          playComicSound(panel.mood);
        }

        // Run voice articulation
        speak(
          panel.caption,
          language,
          panel.mood,
          comic.voicePersona,
          () => {
            // Callback when speaking finishes successfully (or errors out)
            if (isAutoplayRef.current && step === 'reader') {
              autoplayTimer = setTimeout(() => {
                if (isAutoplayRef.current && step === 'reader') {
                  setActivePanel((currentIdx) => {
                    if (currentIdx < comic.panels.length - 1) {
                      return currentIdx + 1;
                    } else {
                      setIsAutoplay(false); // Stop when comic finishes
                      return currentIdx;
                    }
                  });
                }
              }, 1800); // 1.8-second warm breathing spacer
            }
          }
        );
      } else {
        // Regular playback of sound effect on manual navigation (if not muted)
        if (!isMuted && panel.mood) {
          playComicSound(panel.mood);
        }
      }
    }

    return () => {
      if (autoplayTimer) {
        clearTimeout(autoplayTimer);
      }
    };
  }, [activePanel, isAutoplay, step, comic, isMuted]);

  // Turn off speech and autoplay if exiting reader step or turning off autoplay explicitly
  useEffect(() => {
    if (!isAutoplay || step !== 'reader') {
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    }
  }, [isAutoplay, step]);

  const FALLBACK_IMAGES: Record<ArtStyle, string[]> = {
    vibrant: [
      'https://images.unsplash.com/photo-1544376798-89aa6b82c6cd?w=800&q=80',
      'https://images.unsplash.com/photo-1505628346881-b72b27e84530?w=800&q=80',
      'https://images.unsplash.com/photo-1590412200988-a436bb7050a8?w=800&q=80'
    ],
    sketched: [
      'https://images.unsplash.com/photo-1509248961158-e54f6934749c?w=800&q=80',
      'https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=800&q=80',
      'https://images.unsplash.com/photo-1605721911519-3dfeb3be25e7?w=800&q=80'
    ],
    watercolor: [
      'https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5?w=800&q=80',
      'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?w=800&q=80',
      'https://images.unsplash.com/photo-1582555172866-f73bb12a2ab3?w=800&q=80'
    ],
    noir: [
      'https://images.unsplash.com/photo-1478720568477-152d9b164e26?w=800&q=80',
      'https://images.unsplash.com/photo-1509248961158-e54f6934749c?w=800&q=80',
      'https://images.unsplash.com/photo-1505322101000-19457cff32ba?w=800&q=80'
    ],
    'classic-golden-age': [
      'https://images.unsplash.com/photo-1501432377862-3d0432b87a14?w=800&q=80',
      'https://images.unsplash.com/photo-1534073828943-f801091bb18c?w=800&q=80',
      'https://images.unsplash.com/photo-1518156677180-95a2893f3e9f?w=800&q=80'
    ],
    manga: [
      'https://images.unsplash.com/photo-1601850494422-3cf14624b0b3?w=800&q=80',
      'https://images.unsplash.com/photo-1578632738981-4cd905be860a?w=800&q=80',
      'https://images.unsplash.com/photo-1528496191709-bb99480a45af?w=800&q=80'
    ],
    tintin: [
      'https://images.unsplash.com/photo-1507608869274-d3177c8bb4c7?w=800&q=80',
      'https://images.unsplash.com/photo-1594911772125-07fc7a2d8d9f?w=800&q=80',
      'https://images.unsplash.com/photo-1578301978693-85fa9c0320b9?w=800&q=80'
    ],
    asterix: [
      'https://images.unsplash.com/photo-1516624683217-bf02fc6b6b7c?w=800&q=80',
      'https://images.unsplash.com/photo-1618641986557-1ecd230959aa?w=800&q=80',
      'https://images.unsplash.com/photo-1502082553048-f009c37129b9?w=800&q=80'
    ],
    marvel: [
      'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=800&q=80',
      'https://images.unsplash.com/photo-1534809027769-b00d750a6bac?w=800&q=80',
      'https://images.unsplash.com/photo-1500964757637-c85e8a162699?w=800&q=80'
    ],
    dc: [
      'https://images.unsplash.com/photo-1518156677180-95a2893f3e9f?w=800&q=80',
      'https://images.unsplash.com/photo-1531259683007-016a7b628fc3?w=800&q=80',
      'https://images.unsplash.com/photo-1508739773434-c26b3d09e071?w=800&q=80'
    ],
    colorful: [
      'https://images.unsplash.com/photo-1502082553048-f009c37129b9?w=800&q=80',
      'https://images.unsplash.com/photo-1563089145-599997674d42?w=800&q=80',
      'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?w=800&q=80'
    ]
  };

  const getFallbackImage = (style: ArtStyle, index: number) => {
    const images = FALLBACK_IMAGES[style] || FALLBACK_IMAGES.vibrant;
    return images[index % images.length];
  };

  const startGeneration = async () => {
    const resolvedStory =
      storyText.trim() ||
      readSavedSession()?.storyText?.trim() ||
      '';

    logFlow(
      'Start comic generation',
      `Layout: ${layout} panels | Style: ${artStyle} | Image engine: ${imageEngine} | Story engine: ${storyEngine} | Story chars: ${resolvedStory.length}`
    );

    if (!resolvedStory) {
      logger.addLog({
        category: 'STORY',
        level: 'error',
        title: 'Story Decomposition blocked — story text is empty',
        details: [
          `Step: ${step}`,
          `React storyText length: ${storyText.length}`,
          `Session storyText length: ${readSavedSession()?.storyText?.length ?? 0}`,
          `Characters: ${characters.map(c => c.name || '(unnamed)').join(', ') || '(none)'}`,
          'User was sent back to the Story step to paste/write the story again.',
        ].join('\n'),
      });
      setGenerationError('Story text is empty');
      setIsGenerating(false);
      setStep('story');
      return;
    }

    // Heal in-memory story if it was lost after a reload but still in session storage
    if (!storyText.trim() && resolvedStory) {
      setStoryText(resolvedStory);
      logFlow('Healed empty storyText', `Restored ${resolvedStory.length} chars from session before generate`);
    }

    setStep('generating');
    setIsGenerating(true);
    setGenerationError(null);
    setGenerationProgress(5);
    setActivePanel(0);
    
    // Safety timeout of 65 seconds for the story outline step
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error("Generation timed out during story planning.")), 65000)
    );

    // Smooth placeholder progress bar during story decomposition
    const progressInterval = setInterval(() => {
      setGenerationProgress(prev => {
        if (prev < 28) {
          return prev + Math.random() * 2 + 1;
        }
        return prev;
      });
    }, 450);

    try {
      const textCallStartTime = Date.now();
      const activeStoryModel = storyEngine === 'huggingface' ? hfStorySubModel : geminiStorySubModel;
      const resultPromise = decomposeStory(resolvedStory, language, layout, characters, storyEngine, activeStoryModel);
      const result = await Promise.race([resultPromise, timeoutPromise]) as any;
      const textCallDuration = Date.now() - textCallStartTime;
      
      clearInterval(progressInterval);

      if (!result || !result.panels || !Array.isArray(result.panels)) {
        throw new Error("AI returned an invalid story structure. Please try again.");
      }

      setGenerationProgress(30);

      if (result.usage) {
        setTotalTokens(prev => prev + (result.usage!.totalTokens || 0));
        setAiStats(prev => ({
          ...prev,
          textPromptTokens: prev.textPromptTokens + (result.usage?.promptTokens || 0),
          textCompletionTokens: prev.textCompletionTokens + (result.usage?.candidatesTokens || 0),
          textCalls: prev.textCalls + 1,
          textModelName: result.modelUsed || 'gemini-3.5-flash',
          lastApiResponseTimeMs: textCallDuration,
          lastApiStatus: '200 OK - Story Decomposed Successfully'
        }));
      }

      const initialComic: ComicStory = {
        id: 'comic_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9),
        title: result.title || "Untitled Comic",
        panels: (result.panels || []).map((p: any) => ({ ...p, imageUrl: '' })),
        language,
        layout,
        artStyle,
        voicePersona,
        characterVisuals: result.characterVisuals || [],
        characters: characters // Populate character cast with initial user uploads
      };
      setComic(initialComic);

      // Run character portraits and panel image generation in the background sequentially to avoid quota-drowning concurrency spikes!
      const generateAllImagesInBackground = async () => {
        try {
          const updatedCharacters = [...characters];

          // 1. Generate character portraits sequentially in the background if they don't have them
          for (let cIdx = 0; cIdx < updatedCharacters.length; cIdx++) {
            const char = updatedCharacters[cIdx];
            if (!char.drawnPortraitUrl) {
              try {
                // Find matching photo-derived visual blueprint if available
                let referencePrompt = char.description;
                if (char.photoUrls && char.photoUrls.length > 0) {
                  try {
                    const likenessDesc = await describePhotoLikeness(char.photoUrls[0], char.name);
                    if (likenessDesc && likenessDesc.trim()) {
                      referencePrompt = [
                        likenessDesc.trim(),
                        char.description?.trim()
                          ? `Personality/story traits only (do NOT change hair color, age, or face from the photo): ${char.description.trim()}`
                          : "",
                      ].filter(Boolean).join(" ");
                    }
                  } catch (err) {
                    console.error("Failed to analyze photo likeness for background avatar", err);
                  }
                } else {
                  const matchingBlueprint = (result.characterVisuals || []).find((cv: any) => cv.name.toLowerCase() === char.name.toLowerCase());
                  if (matchingBlueprint) {
                    referencePrompt = `${matchingBlueprint.visualPrompt}. ${char.description}`;
                  }
                }

                const imgStartTime = Date.now();
                const genUrl = await generateCharacterImage(char.name, referencePrompt, artStyle);
                if (genUrl) {
                  let shrunkenCharUrl = genUrl;
                  try {
                    if (genUrl.startsWith('data:image/')) {
                      shrunkenCharUrl = await shrinkImage(genUrl, 380);
                    }
                  } catch (shrinkErr) {
                    console.error("Failed to compress generated character portrait", shrinkErr);
                  }
                  
                  // Update our local tracking array immediately
                  updatedCharacters[cIdx] = {
                    ...char,
                    drawnPortraitUrl: shrunkenCharUrl,
                    visualPrompt: referencePrompt
                  };

                  // Update BOTH the global character pool AND the active comic representation!
                  setCharacters(prev => {
                    const updated = prev.map(c => c.name === char.name ? { ...c, drawnPortraitUrl: shrunkenCharUrl, visualPrompt: referencePrompt } : c);
                    setComic(prevComic => {
                      if (!prevComic) return null;
                      return {
                        ...prevComic,
                        characters: updated
                      };
                    });
                    return updated;
                  });

                  setAiStats(prev => ({
                    ...prev,
                    characterCalls: prev.characterCalls + 1,
                    lastApiResponseTimeMs: Date.now() - imgStartTime,
                    lastApiStatus: `200 OK - Generated Portrait: ${char.name}`
                  }));
                }

                // Small relaxation delay to prevent 429 rate issues
                await new Promise(r => setTimeout(r, 2200));
              } catch (e) {
                console.error("Character generation failed", e);
                setAiStats(prev => ({
                  ...prev,
                  lastApiStatus: 'Warning - Character Portrait Failed (Quota)'
                }));
              }
            }
          }

          // Advance progress slightly once character parsing is done
          setGenerationProgress(35);

          const panelsCount = result.panels.length;
          let completedImages = 0;

          // 2. Generate panel images sequentially to stay entirely within safety RPM and concurrency sandbox limits
          for (let i = 0; i < panelsCount; i++) {
            const panel = result.panels[i];
            try {
              const blueprintsList = updatedCharacters.map(c => {
                const matchingBlueprint = (result.characterVisuals || []).find((cv: any) => cv.name.toLowerCase() === c.name.toLowerCase());
                const vp = c.visualPrompt || (matchingBlueprint ? matchingBlueprint.visualPrompt : '') || c.description;
                return `${c.name}: ${vp}`;
              });
              const visualBlueprints = blueprintsList.join('. ');

              // Inject visual consistency guides directly to ensure drawings match nicely across panels!
              const imgStartTime = Date.now();
              const imageUrl = await generatePanelImage(
                `${panel.imagePrompt}. Specific visual blueprints of characters: ${visualBlueprints}. Style: ${artStyle}.`,
                artStyle
              );
              
              // Compress/Downscale raw image immediately to avoid LocalStorage quota overflow errors (98% size reduction)
              let finalUrl = imageUrl;
              try {
                if (imageUrl && imageUrl.startsWith('data:image/')) {
                  finalUrl = await shrinkImage(imageUrl, 640);
                }
              } catch (shrinkErr) {
                console.error("Failed to compress generated panel", shrinkErr);
              }

              setAiStats(prev => ({
                ...prev,
                imageCalls: prev.imageCalls + 1,
                lastApiResponseTimeMs: Date.now() - imgStartTime,
                lastApiStatus: `200 OK - Panel #${i + 1} Drawn`
              }));

              setComic(prev => {
                if (!prev) return null;
                const updatedPanels = [...prev.panels];
                updatedPanels[i] = { ...panel, imageUrl: finalUrl };
                return { ...prev, panels: updatedPanels };
              });

              // Add a cooldown limit to spacing commands to entirely preserve users' free trial quota key limits
              await new Promise(r => setTimeout(r, 3000));
            } catch (e) {
              console.error(`Panel ${i} generation failed`, e);
              const fallbackUrl = getFallbackImage(artStyle, i);
              setAiStats(prev => ({
                ...prev,
                lastApiStatus: `Warning - Panel #${i + 1} Sourced from Stock (429/Credits)`
              }));
              
              setComic(prev => {
                if (!prev) return null;
                const updatedPanels = [...prev.panels];
                updatedPanels[i] = { ...panel, imageUrl: fallbackUrl };
                return { ...prev, panels: updatedPanels };
              });
            } finally {
              completedImages++;
              const percent = 35 + Math.floor((completedImages / panelsCount) * 65);
              setGenerationProgress(Math.min(99, percent));
            }
          }
          
          setGenerationProgress(100);
          await new Promise(r => setTimeout(r, 650)); // let the user enjoy the 100% complete bar
          setStep('reader');
        } catch (error) {
          console.error("Background image generation task encountered an uncaught error:", error);
          setGenerationError(error instanceof Error ? error.message : "Uncaught background worker error.");
        } finally {
          setIsGenerating(false);
        }
      };

      // Execute panel generation in backgrounds
      generateAllImagesInBackground();

    } catch (error) {
      console.error("Generation failed:", error);
      clearInterval(progressInterval);
      setIsGenerating(false);
      const message = error instanceof Error ? error.message : "Oops! The AI got a bit shy. Please check your setup or try again.";
      logger.addLog({
        category: 'STORY',
        level: 'error',
        title: 'Story / generation failed',
        details: message,
      });
      setGenerationError(message);
    }
  };

  const retryPanel = async (index: number) => {
    if (!comic) return;
    
    const currentPanel = comic.panels[index];

    try {
      const blueprintsList = characters.map(c => {
        const matchingBlueprint = (comic.characterVisuals || []).find((cv: any) => cv.name.toLowerCase() === c.name.toLowerCase());
        const vp = c.visualPrompt || (matchingBlueprint ? matchingBlueprint.visualPrompt : '') || c.description;
        return `${c.name}: ${vp}`;
      });
      const visualBlueprints = blueprintsList.join('. ');

      const imageUrl = await generatePanelImage(
        `${currentPanel.imagePrompt}. Specific visual blueprints of characters: ${visualBlueprints}. Style: ${artStyle}.`,
        artStyle
      );
      
      // Compress/Downscale raw image immediately to avoid LocalStorage quota overflow errors (98% size reduction)
      let finalUrl = imageUrl;
      try {
        if (imageUrl && imageUrl.startsWith('data:image/')) {
          finalUrl = await shrinkImage(imageUrl, 640);
        }
      } catch (shrinkErr) {
        console.error("Failed to compress retried panel image", shrinkErr);
      }

      setComic(prev => {
        if (!prev) return null;
        const updatedPanels = [...prev.panels];
        updatedPanels[index] = { ...currentPanel, imageUrl: finalUrl };
        return { ...prev, panels: updatedPanels };
      });
    } catch (e) {
      console.error(`Retry Panel ${index} failed`, e);
      const fallbackUrl = getFallbackImage(artStyle, index);
      setComic(prev => {
        if (!prev) return null;
        const updatedPanels = [...prev.panels];
        updatedPanels[index] = { ...currentPanel, imageUrl: fallbackUrl };
        return { ...prev, panels: updatedPanels };
      });
    }
  };

  // Prices in USD for accurate AI API Cost Ledger
  const textPromptCost = (aiStats.textPromptTokens * 0.075) / 1000000;
  const textCompletionCost = (aiStats.textCompletionTokens * 0.30) / 1000000;
  const imageCost = aiStats.imageCalls * 0.03;
  const characterCost = aiStats.characterCalls * 0.03;
  const totalCostUSD = textPromptCost + textCompletionCost + imageCost + characterCost;

  const isRTL = language === 'he';

  const isCastingValid = characters.every(c => c.name && c.name.trim() !== '');

  if (isStandaloneLogsView) {
    return <StandaloneLogConsole />;
  }

  return (
    <div className={cn(
      "min-h-screen bg-accent text-black font-sans selection:bg-black selection:text-accent font-medium",
      accentColor === 'rainbow' && "animate-rainbow",
      isRTL && "text-right"
    )} dir={isRTL ? 'rtl' : 'ltr'}>
      
      {/* Floating Save library notification toast overlay */}
      <AnimatePresence>
        {saveToast.show && (
          <motion.div 
            initial={{ opacity: 0, y: -60, x: "-50%", scale: 0.9 }}
            animate={{ opacity: 1, y: 16, x: "-50%", scale: 1 }}
            exit={{ opacity: 0, y: -20, x: "-50%", scale: 0.95 }}
            className="fixed top-4 left-1/2 z-[100] bg-black text-accent text-sm md:text-base font-black px-6 py-4 rounded-2xl border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] flex items-center gap-3 max-w-[90%] text-center"
          >
            <Sparkles className="animate-pulse shrink-0" size={20} />
            <span>{saveToast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>
      
      <AnimatePresence>
        {showCamera && (
          <CameraCapture 
            language={language}
            onClose={() => setShowCamera(false)}
            onCapture={handleCameraCapture}
          />
        )}
      </AnimatePresence>
      
      {/* Background decoration */}
      <div className="fixed inset-0 pointer-events-none opacity-10 no-print">
        <div className="absolute top-10 left-10 rotate-12"><BookOpen size={120} /></div>
        <div className="absolute bottom-10 right-10 -rotate-12"><Sparkles size={120} /></div>
      </div>

      <header className="relative z-20 p-2 sm:p-4 md:p-6 flex justify-between items-center bg-white/40 backdrop-blur-md border-b border-black/10 no-print sticky top-0">
        {/* Left Branding & WinAdmin Logs Switch */}
        <div className="flex items-start gap-1.5 md:gap-3 shrink-0">
          <div 
            className="bg-black text-accent p-1.5 md:p-2 rounded-xl shadow-lg cursor-pointer mt-0.5" 
            onClick={() => setStep('landing')}
          >
            <Sparkles size={18} className="md:w-6 md:h-6" />
          </div>
          <div className="flex flex-col">
            <h1 
              className={cn(
                "text-lg md:text-2xl font-black tracking-tighter uppercase italic drop-shadow-sm leading-none cursor-pointer",
                accentColor === 'rainbow' && "rainbow-text"
              )}
              onClick={() => setStep('landing')}
            >
              Comicskido
            </h1>
            <div className="flex items-center gap-1 text-[9px] md:text-[10px] font-black uppercase text-amber-600 tracking-wide mt-0.5">
              <span>{VERSION_NUMBER}</span>
              <span>•</span>
              <span>Build: {BUILD_NUMBER}</span>
            </div>
            {/* Small >WinAdmin button directly below Comicskido title */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                window.open(
                  window.location.origin + window.location.pathname + '?view=logs',
                  'ComicskidoLogConsole',
                  'width=1200,height=800,scrollbars=yes,resizable=yes'
                );
              }}
              className="mt-1 inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-black text-emerald-400 hover:bg-neutral-800 rounded border border-emerald-500/50 font-mono font-bold text-[9px] tracking-tight w-max transition-all shadow-[1px_1px_0px_0px_rgba(0,0,0,0.2)] active:translate-x-0.5 active:translate-y-0.5 cursor-pointer"
              title={language === 'he' ? "פתח חלון יומנים ושרת נפרד >WinAdmin" : "Open Live System Terminal & Server Monitor in a separate window (>WinAdmin)"}
            >
              <span>&gt;WinAdmin</span>
            </button>
          </div>
        </div>

        {/* Right Header Navigation & Settings Controls */}
        <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3.5 ml-auto">
          {/* Theme Colors & Language Selector Stack */}
          <div className="flex flex-col items-center sm:items-end gap-1 shrink-0">
            {/* Theme Colors */}
            <div className="flex items-center gap-1 bg-black/5 p-1 rounded-full border border-black/5 shrink-0">
              {THEME_COLORS.map(color => (
                <button 
                  key={color.value}
                  onClick={() => setAccentColor(color.value)}
                  className={cn(
                    "w-3.5 h-3.5 sm:w-5 sm:h-5 rounded-full border border-black/10 transition-all hover:scale-125 hover:rotate-12 flex-shrink-0",
                    color.value === 'rainbow' && "animate-rainbow border-white/50",
                    accentColor === color.value ? "ring-2 ring-white scale-110 shadow-lg" : "opacity-40"
                  )}
                  style={color.value !== 'rainbow' ? { backgroundColor: color.value } : {}}
                  title={color.name}
                />
              ))}
            </div>

            {/* Language Selector (below colors) */}
            <div className="flex items-center gap-0.5 bg-white/50 rounded-2xl p-0.5 sm:p-1 border border-black/10 shadow-sm shrink-0">
              {[
                { code: 'en', label: 'EN' },
                { code: 'he', label: 'עב' },
                { code: 'fr', label: 'FR' },
                { code: 'es', label: 'ES' },
                { code: 'de', label: 'DE' }
              ].map(lang => (
                <button
                  key={lang.code}
                  onClick={() => setLanguage(lang.code as Language)}
                  className={cn(
                    "px-1.5 py-0.5 sm:px-2 sm:py-1 rounded-xl text-[8px] sm:text-[10px] font-black transition-all",
                    language === lang.code 
                      ? "bg-black text-white scale-105 shadow-md" 
                      : "text-black/40 hover:text-black/70 hover:bg-black/5"
                  )}
                >
                  {lang.label}
                </button>
              ))}
            </div>
          </div>

          {/* AI Token Budget Gauge & Model Usage Report Stack */}
          <div className="flex flex-col items-center sm:items-end gap-1 shrink-0">
            {/* Real-time Session AI Token & Budget Gauge */}
            <div 
              onClick={() => setShowDiagnostics(true)}
              className="flex items-center gap-1.5 bg-black text-white px-2.5 py-1 sm:px-3 rounded-full border-2 border-black text-[9px] sm:text-[10px] font-black uppercase cursor-pointer hover:bg-neutral-800 transition-colors shrink-0 shadow-[2px_2px_0px_0px_rgba(0,0,0,0.15)] active:translate-x-0.5 active:translate-y-0.5"
              title={language === 'he' ? "קליק לפירוט אבחון מלא" : "Click for detailed AI diagnostics"}
            >
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="tracking-tight">
                <span className="hidden xs:inline">
                  {language === 'he' ? "תקציב:" : language === 'fr' ? "Budget :" : "Budget:"}{' '}
                </span>
                <span className="font-mono text-accent">{Math.max(0, SESSION_CREDIT - totalTokens).toLocaleString()}</span>
              </span>
              <span className="opacity-40 border-l border-white/20 pl-1.5 sm:pl-2 font-mono text-[8px] sm:text-[9px]">
                {totalTokens.toLocaleString()}
              </span>
            </div>

            {/* Model Usage Summary Report Header Button (below token gauge) */}
            <button 
              onClick={() => setShowModelReportModal(true)}
              className="flex items-center gap-1 px-2 py-0.5 sm:px-2.5 sm:py-1 bg-black text-amber-400 hover:bg-neutral-800 rounded-full border-2 border-black text-[9px] sm:text-[10px] font-black uppercase transition-all shrink-0 shadow-[2px_2px_0px_0px_rgba(0,0,0,0.15)] active:translate-x-0.5 active:translate-y-0.5 cursor-pointer"
              title={language === 'he' ? "לחץ לצפייה בדוח מודלים מעודכן (אווטארים ועמודים)" : "Click to view Live Model Usage Report (Avatars & Pages)"}
            >
              <BarChart2 size={12} className="text-amber-400 shrink-0" />
              <span>{language === 'he' ? "דוח מודלים" : "Model Report"}</span>
            </button>
          </div>

          {/* Top Model Selectors: Story Decomposition AI & Image Creation AI */}
          <div className="flex flex-wrap items-center gap-2 bg-black/5 p-1.5 rounded-2xl border border-black/10 shrink-0">
            {/* PATH 1: 📖 Story Decomposition Models Selector */}
            <div className="flex flex-col items-start gap-1 p-1 bg-white/80 rounded-xl border border-black/10 shadow-sm">
              <div className="flex items-center gap-1 text-[8px] sm:text-[9px] font-black uppercase text-amber-800 tracking-wider px-0.5">
                <BookOpen size={10} className="shrink-0 text-amber-600" />
                <span>{language === 'he' ? "פירוק עלילה (Story AI)" : "Story Decomposition"}</span>
              </div>
              <div className="flex items-center gap-1">
                {/* Engine Selector Button */}
                <button
                  type="button"
                  onClick={() => {
                    const nextEngine: StoryEngine = storyEngine === 'gemini' ? 'huggingface' : 'gemini';
                    handleSetStoryEngine(nextEngine);
                  }}
                  className={cn(
                    "flex items-center gap-1 px-2 py-0.5 rounded-full border border-black/20 text-[9px] font-black uppercase transition-all shrink-0 cursor-pointer shadow-sm",
                    storyEngine === 'gemini' 
                      ? "bg-purple-900 text-purple-200 border-purple-800 hover:bg-purple-800" 
                      : "bg-amber-400 text-black border-black hover:bg-amber-300"
                  )}
                  title={language === 'he' ? "לחץ להחלפת מנוע פירוק סיפור (Gemini / Hugging Face Open LLM)" : "Click to toggle Story AI engine (Gemini AI vs Hugging Face Open LLM)"}
                >
                  <Sparkles size={9} className="shrink-0" />
                  <span>{storyEngine === 'gemini' ? 'Gemini AI' : 'Hugging Face'}</span>
                </button>

                {/* Story Sub-model Selector Dropdown */}
                {storyEngine === 'gemini' ? (
                  <select
                    value={geminiStorySubModel}
                    onChange={(e) => handleSetGeminiStorySubModel(e.target.value as GeminiStorySubModel)}
                    className="bg-purple-950 text-purple-100 border border-purple-800 rounded-full px-2 py-0.5 text-[9px] font-mono font-bold cursor-pointer hover:bg-purple-900 focus:outline-none transition-all shadow-sm"
                    title={language === 'he' ? "בחר מודל Gemini לפירוק עלילה" : "Select Gemini model for story decomposition"}
                  >
                    <option value="gemini-3.6-flash">Gemini 3.6 Flash</option>
                    <option value="gemini-3.5-flash">Gemini 3.5 Flash</option>
                    <option value="gemini-3.1-flash-lite">Gemini 3.1 Flash Lite</option>
                    <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
                  </select>
                ) : (
                  <select
                    value={hfStorySubModel}
                    onChange={(e) => handleSetHfStorySubModel(e.target.value as HfStorySubModel)}
                    className="bg-black text-amber-300 border border-black rounded-full px-2 py-0.5 text-[9px] font-mono font-bold cursor-pointer hover:bg-zinc-800 focus:outline-none transition-all shadow-sm"
                    title={language === 'he' ? "בחר מודל שפה חופשי של Hugging Face" : "Select Hugging Face Open LLM"}
                  >
                    <option value="google/gemma-3-4b-it">Google Gemma 3 (4B)</option>
                    <option value="meta-llama/Llama-3.2-3B-Instruct">Meta Llama 3.2 (3B)</option>
                    <option value="Qwen/Qwen2.5-7B-Instruct">Qwen 2.5 (7B)</option>
                  </select>
                )}
              </div>
            </div>

            {/* PATH 2: 🎨 Image Creation Models Selector */}
            <div className="flex flex-col items-start gap-1 p-1 bg-white/80 rounded-xl border border-black/10 shadow-sm">
              <div className="flex items-center gap-1 text-[8px] sm:text-[9px] font-black uppercase text-purple-800 tracking-wider px-0.5">
                <ImageIcon size={10} className="shrink-0 text-purple-600" />
                <span>{language === 'he' ? "יצירת תמונות (Image AI)" : "Image Creation"}</span>
              </div>
              <div className="flex items-center gap-1">
                {/* Engine Selector Button */}
                <button 
                  type="button"
                  onClick={() => {
                    const nextEngine: ImageEngine = 
                      imageEngine === 'gemini' ? 'huggingface' :
                      imageEngine === 'huggingface' ? 'pollinations' : 'gemini';
                    handleSetImageEngine(nextEngine);
                  }}
                  className={cn(
                    "flex items-center gap-1 px-2 py-0.5 rounded-full border border-black/20 text-[9px] font-black uppercase transition-all shrink-0 cursor-pointer shadow-sm",
                    imageEngine === 'gemini' 
                      ? "bg-purple-900 text-purple-200 border-purple-800 hover:bg-purple-800" 
                      : imageEngine === 'huggingface'
                      ? "bg-amber-400 text-black border-black hover:bg-amber-300"
                      : "bg-blue-600 text-white border-black hover:bg-blue-500"
                  )}
                  title={language === 'he' ? "לחץ להחלפת מנוע מחולל התמונות" : "Click to toggle Image Generation AI Engine"}
                >
                  <ImageIcon size={9} className="shrink-0" />
                  <span>
                    {imageEngine === 'gemini' ? 'Gemini 3.1' : imageEngine === 'huggingface' ? 'Hugging Face' : 'Pollinations AI'}
                  </span>
                </button>

                {/* Image Sub-model Selector Dropdown */}
                {imageEngine === 'huggingface' ? (
                  <select
                    value={hfSubModel}
                    onChange={(e) => handleSetHfSubModel(e.target.value as HuggingFaceSubModel)}
                    className="bg-black text-amber-300 border border-black rounded-full px-2 py-0.5 text-[9px] font-mono font-bold cursor-pointer hover:bg-zinc-800 focus:outline-none transition-all shadow-sm"
                    title={language === 'he' ? "בחר מודל תמונות ספציפי של Hugging Face" : "Select specific Hugging Face sub-model"}
                  >
                    <option value="black-forest-labs/FLUX.1-schnell">FLUX.1 Schnell</option>
                    <option value="black-forest-labs/FLUX.1-dev">FLUX.1 Dev</option>
                    <option value="Freepik/F-Lite-Texture">Freepik / F-Lite-Texture (10B)</option>
                    <option value="ByteDance/SDXL-Lightning">SDXL Lightning</option>
                    <option value="nerijs/pixel-art-xl">Pixel Art XL</option>
                    <option value="stabilityai/stable-diffusion-3.5-large">SD 3.5 Large</option>
                    <option value="microsoft/Mage-Flow-Turbo">Mage-Flow-Turbo</option>
                    <option value="krea/Krea-2-Turbo">Krea-2-Turbo</option>
                    <option value="prompthero/openjourney-v4">OpenJourney v4</option>
                  </select>
                ) : imageEngine === 'gemini' ? (
                  <select
                    value={geminiSubModel}
                    onChange={(e) => handleSetGeminiSubModel(e.target.value as GeminiImageSubModel)}
                    className="bg-purple-950 text-purple-200 border border-purple-800 rounded-full px-2 py-0.5 text-[9px] font-mono font-bold cursor-pointer hover:bg-purple-900 focus:outline-none transition-all shadow-sm"
                    title={language === 'he' ? "בחר מודל תמונות גוגל ג'מיני" : "Select Google Gemini Image Model"}
                  >
                    <option value="gemini-3.1-flash-image">Gemini 3.1 Flash Image</option>
                    <option value="gemini-3.1-flash-lite-image">Nano Banana 2 Lite</option>
                    <option value="gemini-3-pro-image">Nano Banana Pro</option>
                    <option value="gemini-2.5-flash-image">Gemini 2.5 Flash Image</option>
                  </select>
                ) : (
                  <select
                    value={pollinationsSubModel}
                    onChange={(e) => handleSetPollinationsSubModel(e.target.value as PollinationsSubModel)}
                    className="bg-blue-950 text-blue-100 border border-blue-800 rounded-full px-2 py-0.5 text-[9px] font-mono font-bold cursor-pointer hover:bg-blue-900 focus:outline-none transition-all shadow-sm"
                    title={language === 'he' ? "בחר תת-מודל של Pollinations AI" : "Select Pollinations AI Sub-model"}
                  >
                    <optgroup label="Core & Open-Source">
                      <option value="flux">Flux / Flux Schnell</option>
                      <option value="flux-realism">Flux Realism</option>
                      <option value="flux-anime">Flux Anime</option>
                      <option value="flux-3d">Flux 3D</option>
                      <option value="turbo">Turbo (Instant)</option>
                      <option value="stable-diffusion">Stable Diffusion</option>
                    </optgroup>
                    <optgroup label="Specialized & Custom">
                      <option value="z-image">Z-Image (Artistic)</option>
                      <option value="nano-banana">Nano Banana</option>
                      <option value="nano-banana-pro">Nano Banana Pro</option>
                      <option value="seedream">Seedream</option>
                      <option value="seedream-4.5">Seedream 4.5</option>
                      <option value="grok-imagine">Grok Imagine</option>
                      <option value="nova-canvas">Nova Canvas</option>
                    </optgroup>
                    <optgroup label="Premium Tier">
                      <option value="gpt-image">GPT Image</option>
                      <option value="gpt-image-1.5">GPT Image 1.5</option>
                      <option value="kontext">Kontext</option>
                      <option value="klein">Klein</option>
                    </optgroup>
                  </select>
                )}

                {/* Auto Fallback Toggle Button */}
                <button
                  type="button"
                  onClick={() => handleSetAutoFallback(!autoFallback)}
                  className={cn(
                    "flex items-center gap-0.5 px-1.5 py-0.5 rounded-full border border-black/20 text-[8px] font-mono font-bold transition-all shrink-0 cursor-pointer shadow-sm",
                    autoFallback 
                      ? "bg-emerald-400 text-black border-black hover:bg-emerald-300" 
                      : "bg-rose-950 text-rose-200 border-black hover:bg-rose-900"
                  )}
                  title={autoFallback ? "Auto Fallback ON" : "Auto Fallback OFF"}
                >
                  <RotateCcw size={8} className={cn("shrink-0", autoFallback && "animate-spin-slow")} />
                  <span>{autoFallback ? 'ON' : 'OFF'}</span>
                </button>

                {/* F-Lite Card Quick Button */}
                <button
                  type="button"
                  onClick={() => setShowFLiteTextureModal(true)}
                  className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full border border-black bg-amber-400 hover:bg-amber-300 text-black text-[8px] font-mono font-bold transition-all shrink-0 cursor-pointer shadow-sm"
                  title="F-Lite Texture Model Card"
                >
                  <Sparkles size={8} className="shrink-0 text-black" />
                  <span>F-Lite</span>
                </button>

                {/* Perchance DIY API Quick Button */}
                <button
                  type="button"
                  onClick={() => setShowPerchanceModal(true)}
                  className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full border border-purple-900 bg-purple-700 hover:bg-purple-600 text-white text-[8px] font-mono font-bold transition-all shrink-0 cursor-pointer shadow-sm"
                  title="DIY Perchance Generator API"
                >
                  <Dices size={8} className="shrink-0 text-purple-200" />
                  <span>Perchance</span>
                </button>
              </div>
            </div>
          </div>

          <button 
             onClick={() => setEnableAnimations(!enableAnimations)}
             className={cn(
               "hidden xl:flex items-center gap-2 text-[10px] font-black uppercase opacity-60 hover:opacity-100 transition-opacity",
               !enableAnimations && "line-through"
             )}
          >
            {t.toggleAnimations}
          </button>
        </div>
      </header>

      <main className="relative z-10 max-w-4xl mx-auto px-4 py-4 sm:py-6">
        <MotionConfig transition={enableAnimations ? undefined : { duration: 0 }}>
          <AnimatePresence mode="wait">
          {step === 'landing' && (
            <motion.div 
              key="landing"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="text-center space-y-5"
            >
              <div className="space-y-2">
                <h2 className={cn(
                  "text-3xl sm:text-5xl md:text-6xl font-black tracking-tight uppercase leading-tight",
                  accentColor === 'rainbow' && "rainbow-text"
                )}>
                  {t.heroMe}
                </h2>
                <p className="text-sm sm:text-base md:text-lg font-semibold max-w-xl mx-auto opacity-80 italic drop-shadow-sm">
                  {t.vision}
                </p>
              </div>

              <div className={cn("grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 max-w-4xl mx-auto pt-2 text-left select-none relative", isRTL && "text-right")} dir={isRTL ? "rtl" : "ltr"}>
                {/* Path 1: Create a New Adventure */}
                <div className="bg-white border-3 border-black rounded-2xl p-4 sm:p-5 hover:scale-[1.01] transition-transform shadow-[5px_5px_0px_0px_rgba(0,0,0,1)] flex flex-col justify-between space-y-4 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-20 h-20 bg-accent/20 rounded-full blur-xl -mr-4 -mt-4 group-hover:bg-accent/35 transition-colors" />
                  <div className="space-y-2.5 relative z-10">
                    <div className="bg-accent/15 border-2 border-black inline-flex p-2 sm:p-2.5 rounded-xl text-accent">
                      <Sparkles size={22} />
                    </div>
                    <h3 className="text-lg sm:text-xl font-black uppercase italic leading-tight text-black">
                      {language === 'he' ? "🎨 יצירת קומיקס חדש" : language === 'fr' ? "Créer une BD" : "Create New Comic"}
                    </h3>
                    <p className="text-xs sm:text-sm font-semibold leading-relaxed opacity-80">
                      {language === 'he' 
                        ? "רשמו רעיון לסיפור, בחרו צילומים אמיתיים של ילדכם, ותנו לבינה המלאכותית לאייר ספר קומיקס מדהים עם מוזיקה חיה וקריינות מותאמת אישית!"
                        : language === 'fr'
                        ? "Saisissez votre idée, importez de vraies photographies et laissez l'IA dessiner un livre entièrement illustré avec lecture vocale automatique !"
                        : "Type any story idea, cast characters with real photos, and let our generative AI design professional comic panels with live soundtracks and narration!"}
                    </p>
                  </div>

                  <div className="space-y-2.5 pt-1">
                    <button 
                      onClick={() => setStep('story')}
                      className="w-full group bg-black text-accent px-5 py-3 rounded-xl text-sm sm:text-base font-black uppercase italic flex items-center justify-center gap-2.5 transition-transform hover:scale-102 active:scale-98 shadow-md border-2 border-black"
                    >
                      <span>{language === 'he' ? "התחל הרפתקה חדשה" : language === 'fr' ? "Nouvelle Aventure" : "Start New Adventure"}</span>
                      {isRTL ? <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" /> : <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />}
                    </button>
                    
                    {localStorage.getItem(SESSION_STORAGE_KEY) && (
                      <button 
                        onClick={() => {
                          if (loadState()) setStep('story');
                        }}
                        className="w-full flex items-center justify-center gap-1.5 py-1 text-xs font-bold uppercase opacity-60 hover:opacity-100 transition-opacity animate-pulse"
                      >
                        <RotateCcw size={13} /> {t.restoreStory}
                      </button>
                    )}
                  </div>
                </div>

                {/* Path 2: Playback / Saved Bookshelf Library Fast-Jump Card */}
                <div className="bg-white border-3 border-black rounded-2xl p-4 sm:p-5 hover:scale-[1.01] transition-transform shadow-[5px_5px_0px_0px_rgba(0,0,0,1)] flex flex-col justify-between space-y-4 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-20 h-20 bg-emerald-500/10 rounded-full blur-xl -mr-4 -mt-4" />
                  <div className="space-y-2.5 relative z-10">
                    <div className="bg-emerald-500/15 border-2 border-black inline-flex p-2 sm:p-2.5 rounded-xl text-emerald-600">
                      <Play size={22} className="translate-x-0.5" fill="currentColor" />
                    </div>
                    <h3 className="text-lg sm:text-xl font-black uppercase italic leading-tight text-black">
                      {language === 'he' ? "📚 להקרין ולנגן קומיקס" : language === 'fr' ? "Bibliothèque Audio" : "Play Saved Comic"}
                    </h3>
                    <p className="text-xs sm:text-sm font-semibold leading-relaxed opacity-80">
                      {language === 'he'
                        ? "היכנסו לספריית הספרים השמורים שלכם! נגנו סיפור שוב ושוב עם החלפת עמודים אוטומטית, אפקטים קוליים וקריינות תיאטרלית מלאה לילדים."
                        : language === 'fr'
                        ? "Ouvrez votre bibliothèque personnelle. Écoutez vos histoires préférées avec passage de page automatique et effets sonores inclus."
                        : "Access your local comic collection! Play any story instantly with auto-scrolling pages, vocal synthesis narrator, and animated spatial elements!"}
                    </p>
                  </div>

                  <div className="pt-1">
                    {savedStories.length > 0 ? (
                      <button 
                        onClick={() => {
                          const bookshelfEl = document.getElementById('bookshelf-section');
                          if (bookshelfEl) {
                            bookshelfEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
                          }
                        }}
                        className="w-full bg-emerald-500 text-black border-2 border-black px-5 py-3 rounded-xl text-sm sm:text-base font-black uppercase italic flex items-center justify-center gap-2 transition-transform hover:scale-102 active:scale-98 shadow-md"
                      >
                        <span>{language === 'he' ? "מעבר לספרייה שלי" : language === 'fr' ? "Voir la bibliothèque" : "Go to Bookshelf"}</span>
                        <span>📚</span>
                      </button>
                    ) : (
                      <div className="border-2 border-dashed border-black/20 p-3 rounded-xl text-center bg-gray-50/50">
                        <p className="text-xs font-semibold text-black/60 leading-snug">
                          {language === 'he'
                            ? "המדף עדיין ריק! צרו קומיקס והוא יישמר כאן אוטומטית לנגן הספרים."
                            : language === 'fr'
                            ? "Aucune histoire enregistrée. Générez-en une pour commencer !"
                            : "No stories saved yet! Complete a generated comic book and save it to begin autoplay stories."}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Personal Library Bookshelf section */}
              <div id="bookshelf-section" className="pt-8 sm:pt-10 max-w-5xl mx-auto w-full text-left space-y-4 select-none border-t border-black/10">
                <div className={cn("pb-1 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-2", isRTL && "text-right")}>
                  <div>
                    <h3 className="text-xl sm:text-2xl font-black uppercase italic flex items-center gap-2">
                      <span>📚 {language === 'he' ? "מדף ספרי הקומיקס שלי" : language === 'fr' ? "Ma bibliothèque de BD" : "My Personal Comic Bookshelf"}</span>
                    </h3>
                    <p className="text-xs sm:text-sm font-semibold opacity-60 leading-normal">
                      {language === 'he' 
                        ? "הספרים ששמרתם – מוכנים להקרנה וקריאה אוטומטית כולל מוזקיה וקולות בכל עת!" 
                        : language === 'fr'
                        ? "Vos BD personnalisées – prêtes pour une lecture automatique avec bande son !"
                        : "Your customized generated comic books – saved locally and ready for instant automated speaking theater!"}
                    </p>
                  </div>
                  <div className="flex flex-col sm:items-end gap-1.5 shrink-0">
                    <span className="bg-black text-accent text-[10px] sm:text-xs font-black uppercase px-3 py-1 rounded-full select-none shrink-0 border border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,0.15)] self-start sm:self-auto">
                      {savedStories.length} {language === 'he' ? "ספרים שמורים" : language === 'fr' ? "livres" : "saved books"}
                    </span>
                  </div>
                </div>

                {/* Local Storage Quota Info & Clear Utility */}
                <div className="bg-gradient-to-r from-emerald-50 to-amber-50/70 border-2 border-black rounded-xl p-3 sm:p-3.5 flex flex-col md:flex-row items-center justify-between gap-3 text-black text-xs">
                  <div className="flex items-center gap-2.5 w-full md:w-auto">
                    <span className="text-lg animate-pulse">⚡</span>
                    <div className="space-y-1 w-full">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-black uppercase text-[9px] text-emerald-800 tracking-wider">
                          {language === 'he' ? "🚀 שודרג למשפר זיכרון מקומי (IndexedDB):" : "🚀 Upgraded Local Database (IndexedDB Storage):"}
                        </span>
                        <div className="flex justify-between md:justify-start gap-3 font-black uppercase text-xs">
                          <span>
                            {language === 'he' ? "נפח אחסון מנוצל:" : language === 'fr' ? "Espace BD stocké :" : "Stored Comics Storage:"}
                          </span>
                          <span className="text-emerald-700 font-mono">
                            {storageUsage.usedMB} MB / 500 MB ({storageUsage.percent}%)
                          </span>
                        </div>
                      </div>
                      <div className="w-full md:w-56 bg-black/10 h-2.5 border border-black rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-emerald-400 to-emerald-600 transition-all duration-500"
                          style={{ width: `${storageUsage.percent}%` }}
                        />
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 w-full md:w-auto justify-end">
                    <button
                      onClick={clearEntireBookshelf}
                      className="w-full md:w-auto px-3 py-1.5 bg-rose-100 hover:bg-rose-200 text-rose-800 border border-black rounded-lg text-xs font-black uppercase transition-all shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5"
                    >
                      {language === 'he' ? "🧹 פינוי מקום (מחיקת כל הספרים)" : language === 'fr' ? "🧹 Vider la bibliothèque" : "🧹 Clear Bookshelf Cache"}
                    </button>
                  </div>
                </div>

                {savedStories.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 pt-2">
                    {savedStories.map((saved, idx) => {
                      const coverImage = saved.panels && saved.panels[0]?.imageUrl;
                      const activeItemKey = saved.id || `title_${saved.title}_${idx}`;
                      const isConfirmingDelete = deletingId === activeItemKey;

                      return (
                        <div 
                          key={activeItemKey}
                          className="bg-white border-4 border-black rounded-3xl p-5 hover:scale-[1.02] transition-transform shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] flex flex-col justify-between space-y-4 text-black text-left"
                        >
                          <div className="space-y-3">
                            {/* Comic book preview cover block */}
                            <div className="aspect-[4/3] bg-neutral-100 border-2 border-black rounded-2xl overflow-hidden relative shadow-[4px_4px_0px_0px_rgba(0,0,0,0.1)]">
                              {coverImage ? (
                                <img src={coverImage} alt={saved.title} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center bg-zinc-200">
                                  <ImageIcon size={32} className="opacity-25" />
                                </div>
                              )}
                              {/* Style badge wrapper */}
                              <div className="absolute top-2.5 right-2.5 bg-black text-white px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider border border-white/20">
                                {saved.artStyle}
                              </div>
                            </div>

                            {/* Info detailing caption & meta */}
                            <div className={cn("space-y-1.5", isRTL && "text-right")}>
                              <h4 className="text-lg font-black uppercase italic leading-tight truncate text-black">{saved.title}</h4>
                              <div className={cn("flex flex-wrap items-center gap-1.5 text-[10px] font-black uppercase opacity-60", isRTL && "justify-start")}>
                                <span className="bg-neutral-100 px-2 py-0.5 rounded border border-black/5">
                                  {saved.panels.length} {language === 'he' ? "פאנלים" : language === 'fr' ? "cases" : "panels"}
                                </span>
                                <span className="bg-neutral-100 px-2 py-0.5 rounded border border-black/5">
                                  {saved.voicePersona}
                                </span>
                                <span className="bg-neutral-100 px-2 py-0.5 rounded border border-black/5 border-neutral-200">
                                  {saved.language}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Controls row */}
                          <div className="flex gap-2 pt-2 border-t border-black/5 select-none">
                            {/* Read directly button */}
                            <button
                              onClick={() => {
                                setComic(saved);
                                if (saved.characters) {
                                  setCharacters(saved.characters);
                                }
                                if (saved.artStyle) {
                                  setArtStyle(saved.artStyle);
                                }
                                if (saved.voicePersona) {
                                  setVoicePersona(saved.voicePersona);
                                }
                                if (saved.layout) {
                                  setLayout(saved.layout);
                                }
                                if (saved.language) {
                                  setLanguage(saved.language);
                                }
                                setActivePanel(0);
                                setIsMuted(false); // Enable the rich synthesized children audio narration!
                                setIsAutoplay(true); // Automatically play on loading to delight the kids!
                                setStep('reader');
                              }}
                              className="flex-1 flex items-center justify-center gap-1.5 bg-black text-accent py-2.5 rounded-xl text-xs font-black uppercase tracking-wide hover:bg-neutral-800 transition-colors shadow-[2px_2px_0px_0px_rgba(0,0,0,0.15)] active:translate-x-px active:translate-y-px"
                            >
                              <Play size={12} fill="currentColor" />
                              {language === 'he' ? "נגן סיפור אוטומטי" : language === 'fr' ? "Lecture Auto" : "Read & Play Auto"}
                            </button>

                            {/* Deletion trigger using interactive inside-card check */}
                            <button
                              onMouseLeave={() => setDeletingId(null)}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (isConfirmingDelete) {
                                  deleteSavedStoryFromLibrary(saved.id, saved.title);
                                  setDeletingId(null);
                                } else {
                                  setDeletingId(activeItemKey);
                                }
                              }}
                              className={cn(
                                "p-2.5 rounded-xl border-2 border-black transition-colors flex items-center justify-center min-w-[44px] text-xs font-black uppercase",
                                isConfirmingDelete 
                                  ? "bg-red-500 text-white border-red-500 animate-pulse text-[10px]" 
                                  : "bg-white text-zinc-500 hover:text-red-500 hover:bg-red-50 border-black"
                              )}
                              title={language === 'he' ? "מחיקה" : "Delete"}
                            >
                              {isConfirmingDelete ? (
                                <span>{language === 'he' ? "בטוח?" : "Sure?"}</span>
                              ) : (
                                <Trash2 size={13} className="text-black" />
                              )}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  /* Elegant empty-state bookshelf wrapper */
                  <div className={cn("border-4 border-dashed border-black/15 bg-white/40 backdrop-blur-sm rounded-[2rem] p-10 text-center max-w-3xl mx-auto space-y-4 shadow-sm", isRTL && "text-right")}>
                    <div className="flex justify-center">
                      <div className="text-5xl opacity-45">✨🎴✨</div>
                    </div>
                    <div className={cn("space-y-2 max-w-lg mx-auto", isRTL ? "text-right sm:text-center" : "text-left sm:text-center")}>
                      <h4 className="text-lg font-black uppercase italic leading-none text-black">
                        {language === 'he' ? "מדף הספרים הריק שלכם" : language === 'fr' ? "Étagère vide" : "Your Bookshelf is Waiting!"}
                      </h4>
                      <p className="text-xs font-bold leading-relaxed opacity-65">
                        {language === 'he'
                          ? "אין עדיין ספרי קומיקס מוקלטים בספרייה המקומית. צרו ספר קומיקס מותאם אישית חדש, ובעת הקריאה שלו בנגן לחצו על כפתור 'שמור לספרייה שלי'. הספר יישמר כאן לתמיד ויהיה מוכן להקרנות חוזרות לילדים בקליק אחד!"
                          : language === 'fr'
                          ? "Votre bibliothèque est vide. Pour commencer à sauvegarder vos histoires, créez une bande dessinée et cliquez sur 'Enregistrer' pour l'ajouter ici !"
                          : "No comic books are saved yet. Create a beautiful narrative adventure and click the 'Save to Library' button during reading. Your creation will live on this shelf forever, ready for instant theatrical playback!"}
                      </p>
                    </div>
                    <div className="flex justify-center pt-2">
                      <button 
                        onClick={() => setStep('story')}
                        className="bg-black text-accent px-6 py-3 rounded-full text-xs font-black uppercase tracking-wide hover:scale-105 active:scale-95 transition-transform"
                      >
                        {language === 'he' ? "צרו את הקומיקס הראשון שלכם! 🚀" : language === 'fr' ? "Créer ma BD ! 🚀" : "Create Your First Comic Now! 🚀"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {step === 'story' && (
            <motion.div 
              key="story"
              initial={{ opacity: 0, x: isRTL ? -50 : 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: isRTL ? 50 : -50 }}
              className="space-y-4 max-w-4xl mx-auto"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="bg-black text-accent p-2.5 rounded-xl shrink-0"><BookOpen size={24} /></div>
                <div>
                  <h3 className="text-xl sm:text-2xl font-black uppercase italic">{t.steps.story}</h3>
                  <p className="opacity-80 text-xs sm:text-sm">{t.storyP}</p>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-xs font-bold uppercase opacity-80 flex items-center gap-1">
                  <Sparkles size={14} className="text-amber-300" />
                  {language === 'he' ? "השראות ורעיונות לסיפור:" : "Story Inspirations & Generators:"}
                </span>
                <button
                  type="button"
                  onClick={() => setShowPerchanceModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1 bg-gradient-to-r from-purple-700 to-indigo-700 hover:from-purple-600 hover:to-indigo-600 text-white rounded-full text-xs font-bold shadow-md transition-all cursor-pointer border border-purple-400/40"
                >
                  <Dices size={14} className="animate-spin-slow text-purple-200" />
                  <span>{language === 'he' ? "מחולל Perchance API" : "Perchance Generator API"}</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mb-3">
                {(t.inspirations as any[]).map((insp, i) => (
                  <button 
                    key={i}
                    onClick={() => setStoryText(insp.story)}
                    className="bg-white/10 border-2 border-black p-2.5 rounded-xl text-left hover:bg-white/20 transition-all group active:scale-98"
                  >
                    <h4 className="font-black uppercase text-xs mb-0.5 group-hover:text-white transition-colors">{insp.title}</h4>
                    <p className="text-[11px] opacity-70 line-clamp-2 leading-tight">{insp.description}</p>
                  </button>
                ))}
              </div>

              <textarea 
                value={storyText}
                onChange={(e) => setStoryText(e.target.value)}
                placeholder={t.placeholderStory}
                className="w-full h-36 sm:h-44 bg-white border-3 sm:border-4 border-black p-4 rounded-2xl sm:rounded-3xl text-sm sm:text-base font-medium shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] focus:outline-none placeholder:opacity-30"
              />

              <div className="flex justify-between items-center pt-2">
                <button onClick={() => setStep('landing')} className="flex items-center gap-1.5 text-xs font-bold uppercase hover:underline">{isRTL ? <ArrowRight size={16} /> : <ArrowLeft size={16} />} {t.back}</button>
                <button 
                  disabled={!storyText.trim()}
                  onClick={() => setStep('casting')}
                  className="bg-black text-accent px-6 py-2.5 sm:px-8 sm:py-3 rounded-full text-xs sm:text-sm font-black uppercase italic flex items-center gap-2 disabled:opacity-30 hover:scale-105 active:scale-95 transition-transform shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                >
                  {t.nextHero} {isRTL ? <ArrowLeft size={16} /> : <ArrowRight size={16} />}
                </button>
              </div>
            </motion.div>
          )}

          {step === 'casting' && (
            <motion.div 
              key="casting"
              initial={{ opacity: 0, x: isRTL ? -50 : 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: isRTL ? 50 : -50 }}
              className="space-y-4 max-w-4xl mx-auto"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-3">
                  <div className="bg-black text-accent p-2.5 rounded-xl shrink-0"><Camera size={24} /></div>
                  <div>
                    <h3 className="text-xl sm:text-2xl font-black uppercase italic">{t.steps.casting}</h3>
                    <p className="opacity-80 text-xs sm:text-sm">{t.castingP}</p>
                  </div>
                </div>
                <button 
                  onClick={addCharacter}
                  className="bg-black text-white px-4 py-2 rounded-full text-xs font-bold uppercase italic flex items-center gap-1.5 hover:scale-105 active:scale-95 transition-transform self-start shrink-0 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                >
                  <Sparkles size={14} /> {t.addCharacter}
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Character List */}
                <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1 scrollbar-hide">
                  {characters.map((char, idx) => (
                    <div 
                      key={idx}
                      onClick={() => setEditingCharIndex(idx)}
                      className={cn(
                        "p-3 rounded-2xl border-3 transition-all cursor-pointer flex items-center gap-3",
                        editingCharIndex === idx 
                          ? "bg-black text-accent border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]" 
                          : "bg-white border-black hover:border-accent shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                      )}
                    >
                      <div className="w-12 h-12 rounded-lg bg-gray-100 border-2 border-black overflow-hidden flex-shrink-0">
                        {char.drawnPortraitUrl ? (
                          <img src={char.drawnPortraitUrl} alt={char.name} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                        ) : char.photoUrls && char.photoUrls.length > 0 ? (
                          <img src={char.photoUrls[0]} alt={char.name} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center opacity-20"><Camera size={18} /></div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[10px] font-black uppercase opacity-60">{(t.roles as any)[char.role]}</div>
                        <div className="font-black text-base leading-tight uppercase italic truncate">{char.name || "Untitled Hero"}</div>
                      </div>
                      {characters.length > 1 && (
                        <button 
                          onClick={(e) => { e.stopPropagation(); removeCharacter(idx); }}
                          className="p-1 opacity-40 hover:opacity-100 hover:text-red-500 transition-all shrink-0"
                        >
                          <RotateCcw size={16} className="rotate-45" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {/* Editor */}
                {editingCharIndex !== null && characters[editingCharIndex] && (
                  <motion.div 
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white border-3 border-black p-4 rounded-2xl shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] sticky top-4"
                  >
                    <div className="space-y-3 mb-3">
                      <div className="flex justify-between items-center">
                        <label className="text-[11px] font-black uppercase italic opacity-60">{t.labels.library}</label>
                        <div className="flex gap-1">
                          <button 
                            onClick={() => setShowCamera(true)}
                            className="text-[9px] bg-black text-white px-2 py-1 rounded-lg font-bold uppercase flex items-center gap-1 active:scale-95"
                          >
                            <Camera size={10} /> {t.takePhoto}
                          </button>
                          <button 
                            onClick={() => fileInputRef.current?.click()}
                            className="text-[9px] bg-black text-white px-2 py-1 rounded-lg font-bold uppercase flex items-center gap-1 active:scale-95"
                          >
                            <Upload size={10} /> {t.labels.upload}
                          </button>
                        </div>
                      </div>

                      {/* Photo Library / Pool */}
                      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide min-h-[50px]">
                        <div 
                          onClick={() => fileInputRef.current?.click()}
                          className="w-10 h-14 border-2 border-dashed border-black/30 bg-gray-50 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:bg-black/5 flex-shrink-0"
                          title={t.labels.upload}
                        >
                          <Upload size={12} className="opacity-40" />
                          <span className="text-[7px] font-bold opacity-40 uppercase mt-0.5">New</span>
                        </div>
                        {photoPool.map((url, i) => {
                          const isAssigned = characters[editingCharIndex].photoUrls?.includes(url);
                          return (
                            <div 
                              key={i}
                              onClick={() => togglePhotoForCharacter(editingCharIndex, url)}
                              className={cn(
                                "relative w-10 h-14 rounded-lg border-2 overflow-hidden flex-shrink-0 cursor-pointer transition-transform hover:scale-105",
                                isAssigned ? "border-accent ring-2 ring-accent ring-offset-1" : "border-black/10"
                              )}
                            >
                              <img src={url} className="w-full h-full object-cover" alt="Library" />
                              {isAssigned && (
                                <div className="absolute inset-0 bg-accent/20 flex items-center justify-center">
                                  <Sparkles size={10} className="text-white" />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      <input 
                        type="file" 
                        ref={fileInputRef} 
                        onChange={handlePhotoUpload} 
                        className="hidden" 
                        accept="image/*" 
                      />
                    </div>

                    {/* Photo (LEFT) + AI Avatar (RIGHT) — always LTR so sides never swap in Hebrew */}
                    <div className="grid grid-cols-2 gap-3 mb-3" dir="ltr">
                      {/* LEFT: Uploaded reference photo */}
                      <div className="aspect-square bg-gray-50 border-3 border-black rounded-xl overflow-hidden flex flex-col items-center justify-center relative">
                        <div className="absolute top-1.5 left-1.5 bg-black text-white px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider z-10">
                          {language === 'he' ? "1. תמונה" : "1. Photo"}
                        </div>
                        {characters[editingCharIndex].photoUrls && characters[editingCharIndex].photoUrls.length > 0 ? (
                          <>
                            <img 
                              src={characters[editingCharIndex].photoUrls[0]} 
                              alt="Reference Photo" 
                              className="w-full h-full object-cover" 
                            />
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setCharacters(prev => {
                                  const n = [...prev];
                                  n[editingCharIndex] = {
                                    ...n[editingCharIndex],
                                    photoUrls: [],
                                    drawnPortraitUrl: undefined,
                                  };
                                  return n;
                                });
                              }}
                              className="absolute top-1.5 right-1.5 bg-red-500 hover:bg-red-600 text-white rounded-full p-1 border border-black z-20 hover:scale-110 active:scale-95 transition-all shadow-sm flex items-center justify-center cursor-pointer"
                              title="Remove photo"
                            >
                              <Trash2 size={10} />
                            </button>
                          </>
                        ) : (
                          <div className="text-center opacity-30 p-1">
                            <Camera size={18} className="mx-auto mb-0.5" />
                            <p className="font-bold text-[8px] uppercase">
                              {language === 'he' ? "הוסף תמונה" : "Add Photo"}
                            </p>
                          </div>
                        )}
                      </div>

                      {/* RIGHT: Generated AI Avatar (replaced on every Redraw) */}
                      <div className="aspect-square bg-gray-100 border-3 border-black rounded-xl overflow-hidden flex flex-col items-center justify-center relative">
                        <div className="absolute top-1.5 left-1.5 bg-[#FF6321] text-white px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider z-10">
                          {language === 'he' ? "2. אווטאר AI" : "2. AI Avatar"}
                        </div>
                        {characters[editingCharIndex].drawnPortraitUrl ? (
                          <img 
                            key={`avatar-${editingCharIndex}-${characters[editingCharIndex].drawnPortraitUrl.length}`}
                            src={characters[editingCharIndex].drawnPortraitUrl} 
                            alt="AI Avatar" 
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover animate-fade-in"
                            onError={() => {
                              console.error("Avatar image failed to display");
                              setCharacters(prev => prev.map((c, idx) =>
                                idx === editingCharIndex
                                  ? { ...c, drawnPortraitUrl: undefined }
                                  : c
                              ));
                            }}
                          />
                        ) : !isDrawnPortraitGenerating ? (
                          <div className="flex flex-col items-center gap-1 opacity-40 p-1">
                            <Palette size={18} className="text-accent" />
                            <p className="font-bold text-[8px] uppercase text-center">
                              {language === 'he' ? "לחץ צייר אווטאר" : "Click Render Avatar"}
                            </p>
                          </div>
                        ) : null}

                        {isDrawnPortraitGenerating && (
                          <div className="absolute inset-0 z-20 bg-white/85 flex flex-col items-center justify-center gap-1.5">
                            <Loader2 className="animate-spin text-accent" size={22} />
                            <p className="font-black text-[9px] uppercase animate-pulse text-black">
                              {language === 'he' ? "מצייר אווטאר..." : "Drawing avatar..."}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Dynamic on-the-spot button to draw cartoon avatar */}
                    <button
                      type="button"
                      disabled={isDrawnPortraitGenerating || !characters[editingCharIndex].name}
                      onClick={() => drawCharacterPortraitOnDemand(editingCharIndex)}
                      className="w-full mb-2.5 bg-gradient-to-r from-[#FF6321] to-amber-500 hover:scale-[1.01] active:scale-[0.98] disabled:opacity-40 text-black border-3 border-black p-2 rounded-xl font-black uppercase italic text-[10px] tracking-wider transition-all shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      {isDrawnPortraitGenerating ? (
                        <>
                          <Loader2 size={12} className="animate-spin" />
                          <span>{language === 'he' ? "מצייר דמות..." : "AI drawing..."}</span>
                        </>
                      ) : (
                        <>
                          <Sparkles size={12} className="animate-pulse" />
                          <span>
                            {characters[editingCharIndex].drawnPortraitUrl 
                              ? (language === 'he' ? "🎨 צייר מחדש" : "🎨 Redraw Avatar")
                              : (language === 'he' ? "✨ צייר דמות מהתמונה עכשיו!" : "✨ Render Avatar now!")}
                          </span>
                        </>
                      )}
                    </button>

                    {/* Form Fields */}
                    <div className="space-y-2 text-left">
                      <div>
                        <label className="block text-[10px] font-black uppercase italic mb-0.5 opacity-60">{t.labels.role}</label>
                        <select 
                          value={characters[editingCharIndex].role}
                          onChange={(e) => setCharacters(prev => {
                            const n = [...prev];
                            n[editingCharIndex] = { ...n[editingCharIndex], role: e.target.value as any };
                            return n;
                          })}
                          className="w-full bg-gray-50 border-2 border-black p-2 rounded-lg font-bold text-xs focus:outline-none"
                        >
                          <option value="protagonist">{(t.roles as any).protagonist}</option>
                          <option value="helper">{(t.roles as any).helper}</option>
                          <option value="antagonist">{(t.roles as any).antagonist}</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-black uppercase italic mb-0.5 opacity-60">{t.labels.name}</label>
                        <input 
                          type="text" 
                          value={characters[editingCharIndex].name}
                          onChange={(e) => setCharacters(prev => {
                            const n = [...prev];
                            n[editingCharIndex] = { ...n[editingCharIndex], name: e.target.value };
                            return n;
                          })}
                          placeholder={t.placeholderName}
                          className="w-full bg-gray-50 border-2 border-black p-2 rounded-lg font-bold text-xs focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black uppercase italic mb-0.5 opacity-60">{t.labels.traits}</label>
                        <textarea 
                          value={characters[editingCharIndex].description}
                          onChange={(e) => setCharacters(prev => {
                            const n = [...prev];
                            n[editingCharIndex] = { ...n[editingCharIndex], description: e.target.value };
                            return n;
                          })}
                          placeholder={t.placeholderTraits}
                          className="w-full bg-gray-50 border-2 border-black p-2 rounded-lg font-medium text-xs focus:outline-none h-16"
                        />
                      </div>
                    </div>
                  </motion.div>
                )}
              </div>

              <div className="flex justify-between items-center pt-4">
                <button onClick={() => setStep('story')} className="flex items-center gap-1.5 text-xs font-bold uppercase hover:underline">{isRTL ? <ArrowRight size={16} /> : <ArrowLeft size={16} />} {t.back}</button>
                <button 
                  disabled={!isCastingValid}
                  onClick={() => setStep('layout')}
                  className="bg-black text-accent px-6 py-2.5 sm:px-8 sm:py-3 rounded-full text-xs sm:text-sm font-black uppercase italic flex items-center gap-2 disabled:opacity-30 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:scale-105 active:scale-95 transition-transform"
                >
                  {t.nextLayout} {isRTL ? <ArrowLeft size={16} /> : <ArrowRight size={16} />}
                </button>
              </div>
            </motion.div>
          )}

          {step === 'layout' && (
            <motion.div 
              key="layout"
              initial={{ opacity: 0, x: isRTL ? -50 : 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: isRTL ? 50 : -50 }}
              className="space-y-6 text-center max-w-4xl mx-auto"
            >
              <div className="flex flex-col items-center gap-2 mb-4">
                <div className="bg-black text-accent p-2.5 rounded-xl"><Layout size={24} /></div>
                <div>
                  <h3 className="text-xl sm:text-2xl font-black uppercase italic">{t.steps.layout}</h3>
                  <p className="opacity-80 text-xs sm:text-sm">{t.layoutP}</p>
                </div>
              </div>

              {/* Panel Count selector */}
              <div className="space-y-2">
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 max-w-2xl mx-auto">
                  {[2, 4, 8, 16, 32, 64].map((num) => (
                    <button 
                      key={num}
                      onClick={() => setLayout(num)}
                      className={cn(
                        "bg-white border-2 sm:border-3 border-black py-2 px-3 rounded-2xl shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all flex flex-col items-center justify-center active:scale-95",
                        layout === num ? "bg-black text-accent -translate-y-0.5" : "hover:-translate-y-0.5"
                      )}
                    >
                      <span className="text-lg sm:text-xl font-black block leading-none">{num}</span>
                      <span className="font-bold uppercase text-[9px] opacity-70 mt-0.5">{t.labels.panels}</span>
                    </button>
                  ))}
                </div>

                <div className="flex items-center justify-center gap-2 max-w-xs mx-auto pt-1">
                  <label className="text-xs font-black uppercase italic">{t.customCount}:</label>
                  <input 
                    type="number"
                    min="2"
                    max="128"
                    value={layout}
                    onChange={(e) => setLayout(Math.min(128, Math.max(2, parseInt(e.target.value) || 2)))}
                    className="w-20 bg-white border-2 border-black p-1.5 rounded-xl text-center text-sm font-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] focus:outline-none"
                  />
                </div>
              </div>

              {/* Art Style selection header & condensed 5-column grid */}
              <div className="pt-4 space-y-3">
                <div className="flex justify-between items-center max-w-4xl mx-auto">
                  <h4 className="text-lg sm:text-xl font-black uppercase italic">{t.artStyle}</h4>
                  <button 
                    onClick={() => setStep('story')}
                    className="flex items-center gap-1 text-[10px] sm:text-xs font-black uppercase px-2.5 py-1 bg-black/5 hover:bg-black/10 rounded-full text-black border border-black/10 transition-all active:scale-95"
                  >
                    <RotateCcw size={11} /> {t.newStory}
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 max-w-4xl mx-auto">
                  {[
                    { id: 'vibrant', name: t.styles.vibrant, color: '#FFB800', preview: 'https://images.unsplash.com/photo-1544376798-89aa6b82c6cd?w=400&q=80' },
                    { id: 'colorful', name: t.styles.colorful, color: 'rainbow', preview: 'https://images.unsplash.com/photo-1516624683217-bf02fc6b6b7c?w=400&q=80' },
                    { id: 'sketched', name: t.styles.sketched, color: '#9CA3AF', preview: 'https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=400&q=80' },
                    { id: 'watercolor', name: t.styles.watercolor, color: '#60A5FA', preview: 'https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5?w=400&q=80' },
                    { id: 'noir', name: t.styles.noir, color: '#111827', preview: 'https://images.unsplash.com/photo-1478720568477-152d9b164e26?w=400&q=80' },
                    { id: 'classic-golden-age', name: t.styles.classicGoldenAge, color: '#F97316', preview: 'https://images.unsplash.com/photo-1501432377862-3d0432b87a14?w=400&q=80' },
                    { id: 'manga', name: t.styles.manga, color: '#A855F7', preview: 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=400&q=80' },
                    { id: 'tintin', name: t.styles.tintin, color: '#3B82F6', preview: 'https://images.unsplash.com/photo-1594911772125-07fc7a2d8d9f?w=400&q=80' },
                    { id: 'asterix', name: t.styles.asterix, color: '#10B981', preview: 'https://images.unsplash.com/photo-1618641986557-1ecd230959aa?w=400&q=80' },
                    { id: 'marvel', name: t.styles.marvel, color: '#EF4444', preview: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=400&q=80' },
                    { id: 'dc', name: t.styles.dc, color: '#1D4ED8', preview: 'https://images.unsplash.com/photo-1508739773434-c26b3d09e071?w=400&q=80' }
                  ].map((style) => (
                    <button
                      key={style.id}
                      onClick={() => setArtStyle(style.id as ArtStyle)}
                      className={cn(
                        "relative group p-0 border-2 rounded-xl transition-all h-20 sm:h-24 flex flex-col items-center justify-center text-center overflow-hidden active:scale-95 duration-200 cursor-pointer",
                        artStyle === style.id 
                          ? "border-black -translate-y-0.5 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] ring-2 ring-black" 
                          : "border-black/20 hover:border-black hover:-translate-y-0.5 shadow-[2px_2px_0px_0px_rgba(0,0,0,0.06)] hover:shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]"
                      )}
                      style={artStyle === style.id ? { borderColor: style.color === 'rainbow' ? '#FF6321' : style.color } : {}}
                    >
                      <img 
                        src={style.preview} 
                        alt={style.name}
                        className={cn(
                          "absolute inset-0 w-full h-full object-cover transition-all duration-300",
                          artStyle === style.id ? "scale-105 opacity-100 contrast-110 saturate-110" : "scale-100 opacity-80 grayscale-[10%] group-hover:scale-102 group-hover:opacity-100 group-hover:grayscale-0"
                        )}
                        referrerPolicy="no-referrer"
                      />
                      <div className={cn(
                        "absolute inset-x-0 bottom-0 p-1.5 pt-3 text-left transition-all duration-200",
                        artStyle === style.id 
                          ? "bg-gradient-to-t from-black/90 via-black/60 to-transparent" 
                          : "bg-gradient-to-t from-black/80 via-black/30 to-transparent"
                      )}>
                        <div className="flex items-center gap-1">
                          <span className="font-black uppercase italic text-[10px] leading-tight block text-white truncate drop-shadow-sm">{style.name}</span>
                        </div>
                        <span className="text-[8px] font-bold opacity-80 block text-white uppercase tracking-wider truncate">{(t.styleDescriptions as any)[style.id]}</span>
                      </div>
                      
                      {artStyle === style.id && (
                        <motion.div 
                          layoutId="style-sparkle"
                          className="absolute top-1 right-1 z-20"
                        >
                          <div className={cn(
                            "p-0.5 sm:p-1 rounded shadow-sm border border-black/10",
                            accentColor === 'rainbow' || style.color === 'rainbow' ? "animate-rainbow text-white" : "bg-accent text-black"
                          )}>
                            <Sparkles size={8} className="animate-pulse" />
                          </div>
                        </motion.div>
                      )}
                    </button>
                  ))}
                </div>

                {/* Art Style Detail Spotlight Card (Condensed & Compact) */}
                {(() => {
                  const currentStyleObj = [
                    { id: 'vibrant', r: 'https://images.unsplash.com/photo-1544376798-89aa6b82c6cd?w=600&q=80' },
                    { id: 'colorful', r: 'https://images.unsplash.com/photo-1516624683217-bf02fc6b6b7c?w=600&q=80' },
                    { id: 'sketched', r: 'https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=600&q=80' },
                    { id: 'watercolor', r: 'https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5?w=600&q=80' },
                    { id: 'noir', r: 'https://images.unsplash.com/photo-1478720568477-152d9b164e26?w=600&q=80' },
                    { id: 'classic-golden-age', r: 'https://images.unsplash.com/photo-1501432377862-3d0432b87a14?w=600&q=80' },
                    { id: 'manga', r: 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=600&q=80' },
                    { id: 'tintin', r: 'https://images.unsplash.com/photo-1594911772125-07fc7a2d8d9f?w=600&q=80' },
                    { id: 'asterix', r: 'https://images.unsplash.com/photo-1618641986557-1ecd230959aa?w=600&q=80' },
                    { id: 'marvel', r: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=600&q=80' },
                    { id: 'dc', r: 'https://images.unsplash.com/photo-1508739773434-c26b3d09e071?w=600&q=80' }
                  ].find((s) => s.id === artStyle);

                  const details = (t.styleDetails as any)?.[artStyle] || { features: [], bio: "" };
                  const name = (t.styles as any)?.[artStyle] || artStyle;

                  return (
                    <motion.div 
                      key={artStyle}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={cn(
                        "mt-3 p-3 bg-white border-2 sm:border-3 border-black rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex flex-row gap-3 items-center max-w-4xl mx-auto transition-all",
                        isRTL && "flex-row-reverse text-right"
                      )}
                      dir={isRTL ? "rtl" : "ltr"}
                    >
                      <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl overflow-hidden border-2 border-black relative shrink-0 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                        <img 
                          src={currentStyleObj?.r} 
                          alt={name}
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                      <div className="w-full text-left space-y-1 flex flex-col justify-center">
                        <div className={cn("space-y-0.5", isRTL && "text-right")}>
                          <div className={cn("flex items-center gap-2 flex-wrap", isRTL && "justify-start flex-row-reverse")}>
                            <h5 className="font-black text-sm sm:text-base uppercase italic text-black tracking-tight">{name}</h5>
                            <span className="text-[9px] font-black uppercase px-1.5 py-0.5 bg-accent text-black rounded border border-black inline-block shrink-0 leading-none">
                              {(t.styleDescriptions as any)?.[artStyle] || ""}
                            </span>
                          </div>
                          <p className="text-[11px] text-black/85 leading-tight font-medium line-clamp-2">{details.bio}</p>
                        </div>
                        
                        <div className={cn("flex flex-wrap gap-1 pt-0.5", isRTL && "justify-start flex-row-reverse")}>
                          {details.features.slice(0, 4).map((feature: string, idx: number) => (
                            <span 
                              key={idx} 
                              className="text-[8px] sm:text-[9px] font-black uppercase tracking-wider px-2 py-0.5 bg-black/5 text-black border border-black/20 rounded-md shrink-0"
                            >
                              ✦ {feature}
                            </span>
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  );
                })()}
              </div>

              {/* Voice narrator section */}
              <div className="pt-3 space-y-2">
                <h4 className="text-sm sm:text-base font-black uppercase italic">{t.voiceNarrator}</h4>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 max-w-2xl mx-auto">
                  {[
                    { id: 'storyteller', name: t.voices.storyteller },
                    { id: 'child', name: t.voices.child },
                    { id: 'grandparent', name: t.voices.grandparent },
                    { id: 'hero', name: t.voices.hero },
                    { id: 'villain', name: t.voices.villain }
                  ].map((voice) => (
                    <button
                      key={voice.id}
                      onClick={() => setVoicePersona(voice.id as VoicePersona)}
                      className={cn(
                        "p-2 border-2 rounded-xl font-black uppercase italic text-[10px] transition-all cursor-pointer active:scale-95",
                        voicePersona === voice.id 
                          ? "bg-black text-accent border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]" 
                          : "bg-white border-black/20 hover:border-black"
                      )}
                    >
                      {voice.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Action buttons footer */}
              <div className="pt-4 flex justify-between items-center max-w-2xl mx-auto w-full">
                <button onClick={() => setStep('casting')} className="flex items-center gap-1.5 text-xs font-bold uppercase hover:underline">{isRTL ? <ArrowRight size={16} /> : <ArrowLeft size={16} />} {t.back}</button>
                <button 
                  onClick={startGeneration}
                  className="bg-black text-accent px-8 py-3.5 sm:px-10 sm:py-4 rounded-full text-lg sm:text-xl font-black uppercase italic flex items-center gap-2 sm:gap-3 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:scale-105 active:scale-95 transition-transform cursor-pointer"
                >
                  {t.generateComic} <Sparkles size={20} />
                </button>
              </div>
            </motion.div>
          )}

          {step === 'generating' && (
            <motion.div 
              key="generating"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center space-y-12 py-12"
            >
              {generationError ? (() => {
                const isQuotaExceeded = generationError.toLowerCase().includes('quota') ||
                  generationError.toLowerCase().includes('rate limit') ||
                  generationError.toLowerCase().includes('limit exceeded') ||
                  generationError.toLowerCase().includes('429') ||
                  generationError.toLowerCase().includes('resource_exhausted') ||
                  generationError.toLowerCase().includes('busy') ||
                  generationError.toLowerCase().includes('speed-limit');

                if (isQuotaExceeded) {
                  return (
                    <div className="max-w-xl mx-auto p-8 bg-gradient-to-br from-amber-50 to-orange-50/30 border-4 border-black rounded-[2.5rem] space-y-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] text-right">
                      <div className="flex items-center gap-4 border-b-3 border-black pb-4">
                        <div className="w-14 h-14 bg-amber-400 rounded-2xl flex items-center justify-center text-black border-3 border-black shrink-0 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                          <AlertCircle size={28} />
                        </div>
                        <div className="text-right">
                          <h4 className="text-[10px] font-black uppercase tracking-wider text-amber-800">
                            {language === 'he' ? "קצב עבודה נסיוני" : "DEVELOPMENT RATE LIMITER"}
                          </h4>
                          <h3 className="text-xl font-black uppercase text-black leading-tight">
                            {language === 'he' ? "הגענו למגבלת המהירות החינמית של גוגל" : "Google API Speed-Limit Throttle"}
                          </h3>
                        </div>
                      </div>

                      <div className="space-y-4 text-xs lg:text-sm font-bold text-gray-800 leading-relaxed text-right font-sans">
                        <p>
                          {language === 'he' 
                            ? "אל דאגה! האפליקציה שלך פותחה ועובדת ברמה מקצועית ותעשייתית מלאה. כרגע מופעל מפתח הדגמה חינמי של Google AI Studio עבור תהליך הפיתוח."
                            : "Don't fret! Your application is fully production-grade and enterprise-ready. It currently runs on a shared, free-tier Google AI Studio API key used during development."}
                        </p>
                        <p className="bg-white/95 p-4 border-2 border-black rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                          {language === 'he'
                            ? "גוגל מקציבה קצב של עד 15 איורים בדקה למשתפי בדיקות חינמיים עקב עומסי שרת חריגים. יצירת לוחות ואיורי קומיקס מרובים בבת אחת מפעילה את מנגנון האבטחה הזמני של החשבון המשותף."
                            : "The free trial key is capped at 15 panel generations per minute. Sketching multiple high-definition comic scenes consecutively is triggering Google's temporary safety buffer."}
                        </p>
                      </div>

                      {/* Cool Auto Countdown Retry Widget */}
                      <div className="bg-black text-white p-5 rounded-2xl border-3 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,0.15)] flex flex-col items-center justify-center text-center space-y-3">
                        {quotaCountdown !== null ? (
                          <div className="space-y-1">
                            <span className="block text-amber-400 font-black text-3xl uppercase tracking-widest animate-pulse">
                              {quotaCountdown}
                            </span>
                            <span className="text-xs font-bold uppercase tracking-wider block opacity-80">
                              {language === 'he' ? "המשך יצירה אוטומטי יופעל בעוד מספר שניות..." : "Resubmitting request automatically..."}
                            </span>
                          </div>
                        ) : (
                          <div className="w-full space-y-2">
                            <span className="text-xs font-black uppercase block text-amber-300">
                              {language === 'he' ? "מנגנון צינון מופעל במכשיר שלכם" : "COOLDOWN MECHANISM READY"}
                            </span>
                            <button
                              onClick={() => setQuotaCountdown(15)}
                              className="px-6 py-2.5 bg-amber-400 hover:bg-amber-300 text-black border-2 border-black rounded-xl text-xs font-black uppercase transition-all shadow-md active:translate-y-0.5"
                            >
                              {language === 'he' ? "🚀 הפעל טיימר צינון והמשך אוטומטית (15 ש')" : "🚀 Cool Down and Resume (15s)"}
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="border-t-3 border-dashed border-black/20 pt-4 space-y-3 text-xs leading-normal">
                        <div className="flex gap-2 items-start justify-end">
                          <span className="font-extrabold text-amber-700">💡</span>
                          <span className="text-gray-600 font-medium">
                            {language === 'he' 
                              ? "לשימוש מסחרי ללא מגבלות כלל, מחברים את מפתח ה-API האישי שלכם (Pay-as-you-go) בהגדרות Google Cloud לקצב בלתי מוגבל."
                              : "For production-level scaling, connecting a billing-enabled Pay-As-You-Go API key unlocks instant speeds of over 360 panels/minute with no throttling."}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-col sm:flex-row gap-2 pt-2 justify-end w-full">
                        <button 
                          onClick={() => {
                            setGenerationError(null);
                            startGeneration();
                          }}
                          className="px-6 py-3 bg-black hover:bg-gray-900 text-accent font-black uppercase italic rounded-full text-xs border-2 border-black transition-transform shadow-md"
                        >
                          {language === 'he' ? "🔄 נסה שוב ידנית" : "🔄 Force Retry"}
                        </button>
                        <button 
                          onClick={() => {
                            setGenerationError(null);
                            setIsGenerating(false);
                            setStep('layout');
                          }}
                          className="px-6 py-3 bg-white text-black hover:bg-gray-100 font-black uppercase rounded-full border-2 border-black text-xs transition-colors"
                        >
                          {language === 'he' ? "שנה פורמט / פחות לוחות" : "Fewer Panels"}
                        </button>
                        <button 
                          onClick={() => {
                            setGenerationError(null);
                            setIsGenerating(false);
                            setStep('story');
                          }}
                          className="px-4 py-3 bg-transparent text-gray-500 hover:text-black font-semibold uppercase text-xs transition-colors underline"
                        >
                          {language === 'he' ? "חזור לתחילת סיפור" : "Start Screen"}
                        </button>
                      </div>
                    </div>
                  );
                }

                // If not quota issue, fall back to standard error layout
                return (
                  <div className="max-w-md mx-auto p-8 bg-white border-4 border-black rounded-[2rem] space-y-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] text-left">
                    <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center text-red-500 border-2 border-black">
                      <AlertCircle size={32} />
                    </div>
                    <div className="space-y-2">
                      <h3 className="text-2xl font-black uppercase italic tracking-tight text-red-600">Ah, The Magic Got Sticky!</h3>
                      <p className="text-sm font-bold text-gray-700 leading-relaxed bg-gray-50 p-4 border-2 border-black rounded-xl font-mono text-xs overflow-auto max-h-40">
                        {generationError}
                      </p>
                    </div>
                    <div className="flex flex-col gap-2 pt-2">
                      <button 
                        onClick={() => {
                          setGenerationError(null);
                          startGeneration();
                        }}
                        className="w-full bg-black text-accent hover:scale-105 transition-transform font-black uppercase italic py-3 rounded-full text-sm border-2 border-black shadow-md flex items-center justify-center gap-2"
                      >
                        <Sparkles size={16} /> Try Again
                      </button>
                      <button 
                        onClick={() => {
                          setGenerationError(null);
                          setIsGenerating(false);
                          setStep('layout');
                        }}
                        className="w-full bg-white text-black hover:bg-black/5 font-bold uppercase py-2.5 rounded-full border-2 border-black transition-colors text-xs text-center"
                      >
                        Go Back & Change Format
                      </button>
                      <button 
                        onClick={() => {
                          setGenerationError(null);
                          setIsGenerating(false);
                          setStep('story');
                        }}
                        className="w-full bg-transparent text-gray-500 hover:text-black font-semibold uppercase py-1.5 transition-colors text-2xs text-center underline"
                      >
                        Start Over / New Story
                      </button>
                    </div>
                  </div>
                );
              })() : (
                <>
                  <div className="relative mx-auto w-48 h-48">
                    <div className={cn(
                      "absolute inset-0 border-8 border-t-white rounded-full animate-spin",
                      accentColor === 'rainbow' ? "animate-rainbow border-black/20" : "border-black border-t-accent"
                    )} />
                    <div className="absolute inset-4 bg-white border-4 border-black rounded-full flex items-center justify-center shadow-xl">
                      <Sparkles size={64} className="animate-pulse text-accent" />
                    </div>
                  </div>
                  <div className="space-y-4">
                    <h3 className={cn(
                      "text-5xl font-black uppercase italic tracking-tighter",
                      accentColor === 'rainbow' && "rainbow-text"
                    )}>{t.steps.generating}</h3>
                    <p className="text-xl font-bold opacity-60 animate-bounce">
                      {t.writingFor.replace('{count}', (comic?.panels.length || layout).toString()).replace('{name}', characters[0]?.name || "your hero")}
                    </p>
                    <div className="max-w-md mx-auto space-y-3 pt-4">
                      <div className="h-6 w-full bg-white border-4 border-black rounded-full overflow-hidden shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] relative p-0.5">
                        <motion.div 
                          className={cn(
                            "h-full rounded-full",
                            accentColor === 'rainbow' ? "animate-rainbow" : "bg-accent"
                          )}
                          style={{ width: `${generationProgress}%` }}
                        />
                        <div className="absolute inset-0 bg-[linear-gradient(45deg,rgba(255,255,255,0.25)_25%,transparent_25%,transparent_50%,rgba(255,255,255,0.25)_50%,rgba(255,255,255,0.25)_75%,transparent_75%,transparent)] bg-[length:24px_24px] animate-stripes pointer-events-none opacity-50 mix-blend-overlay" />
                      </div>
                      <div className="flex justify-between text-xs font-black uppercase tracking-wider px-1">
                        <span className="animate-pulse">
                          {generationProgress < 30 
                            ? (language === 'he' ? "בונים עלילה ותסריט..." : language === 'fr' ? "Planification du scénario..." : "Planning storyboard...") 
                            : (language === 'he' ? "מציירים את הקומיקס שלך..." : language === 'fr' ? "Dessin des cases de B.D..." : "Drawing your comic...")}
                        </span>
                        <span>{Math.round(generationProgress)}%</span>
                      </div>
                    </div>
                    
                    {cooldownSeconds !== null && (
                      <div className="max-w-md mx-auto mt-6 p-4 bg-orange-50/90 border-4 border-black rounded-[2rem] shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] text-right space-y-3 animate-fade-in">
                        <div className="flex items-center gap-3 border-b-2 border-black/10 pb-2 justify-end">
                          <span className="text-[10px] font-black uppercase text-orange-850">
                            {language === 'he' ? "קצב עבודה מוגבל - שירות חינמי" : "Rate limit throttle"}
                          </span>
                          <div className="w-5 h-5 bg-amber-400 rounded-lg flex items-center justify-center border-2 border-black">
                            <AlertCircle size={10} className="text-black" />
                          </div>
                        </div>
                        <p className="text-[11px] font-bold text-gray-800 leading-relaxed font-sans text-right">
                          {language === 'he' 
                            ? "הגענו למגבלת קצב זמנית של גוגל. אל דאגה! המערכת תמשיך ליצור את הספר באופן אוטומטי לחלוטין בעוד מספר שניות." 
                            : "Temporary Google API rate boundary reached. Hang tight! The app is automatically resting and will resume generation in a few seconds."}
                        </p>
                        <div className="bg-black text-white p-2.5 rounded-xl border-2 border-black flex items-center justify-between">
                          <span className="text-[9px] font-black uppercase tracking-wider text-amber-400 animate-pulse">
                            {language === 'he' ? "המשך יצירה אוטומטי..." : "Auto-resuming shortly..."}
                          </span>
                          <span className="text-sm font-black text-amber-400 font-mono select-none">
                            {cooldownSeconds}s / {cooldownTotal}s
                          </span>
                        </div>
                        <p className="text-[9px] font-medium text-gray-500 italic text-center">
                          {language === 'he'
                            ? "אין צורך ללחוץ על שום דבר או להתחיל מחדש."
                            : "No need to click anything or start over."}
                        </p>
                      </div>
                    )}
                    
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 10 }}
                      className="pt-8"
                    >
                      <p className="text-xs font-bold opacity-40 mb-4 italic">Taking longer than expected?</p>
                      <div className="flex justify-center gap-3">
                        <button 
                          onClick={() => {
                            setIsGenerating(false);
                            setStep('layout');
                          }}
                          className="text-xs font-bold uppercase border-2 border-black/20 px-4 py-2 rounded-full hover:bg-black/5"
                        >
                          Go Back & Resubmit
                        </button>
                        <button 
                          onClick={() => {
                            setIsGenerating(false);
                            setStep('story');
                          }}
                          className="text-xs font-bold uppercase border-2 border-black/20 px-4 py-2 bg-black text-accent rounded-full hover:scale-105 transition-transform"
                        >
                          Start Over / New Story
                        </button>
                      </div>
                    </motion.div>
                  </div>
                </>
              )}
            </motion.div>
          )}

          {step === 'reader' && comic && (
            <motion.div 
              key="reader"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-12"
            >
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-black text-white p-6 rounded-3xl gap-6 no-print shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] border-4 border-black">
                <div className={cn("space-y-1 w-full md:w-auto", isRTL && "text-right")}>
                  <span className="text-[10px] font-black uppercase tracking-widest text-accent">Active Story Book</span>
                  <h3 className="text-2xl font-black uppercase italic leading-tight">{comic.title}</h3>
                </div>
                 <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-start md:justify-end">
                  {/* Save to Local Library */}
                  <button 
                    onClick={saveCurrentStoryToLibrary}
                    className="flex items-center gap-2 text-xs font-black uppercase px-3.5 py-2 bg-[#FFB800] text-black rounded-full hover:bg-[#E6A600] active:scale-95 transition-all border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                  >
                    <Heart size={14} fill="currentColor" />
                    {language === 'he' ? "שמור לספרייה שלי" : language === 'fr' ? "Enregistrer" : "Save to Library"}
                  </button>

                  {/* Exit to Bookshelf */}
                  <button 
                    onClick={() => {
                      if (isAutoplay) setIsAutoplay(false);
                      setStep('landing');
                    }}
                    className="flex items-center gap-2 text-xs font-black uppercase px-3.5 py-2 bg-white text-black rounded-full hover:bg-neutral-100 active:scale-95 transition-all border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                  >
                    <span>📚</span>
                    {language === 'he' ? "חזרה לספרייה" : language === 'fr' ? "Bibliothèque" : "Back to Bookshelf"}
                  </button>

                  {/* Auto Play Player Toggle */}
                  <button 
                    onClick={() => {
                      if (isMuted) {
                        setIsMuted(false); // Unmute for visual narration
                      }
                      setIsAutoplay(!isAutoplay);
                    }}
                    className={cn(
                      "flex items-center gap-2 text-xs font-black uppercase px-3.5 py-2 rounded-full border-2 border-black transition-all shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-0.5 active:translate-y-0.5",
                      isAutoplay 
                        ? "bg-emerald-500 text-black border-black animate-pulse" 
                        : "bg-white text-black hover:bg-neutral-100"
                    )}
                  >
                    {isAutoplay ? (
                      <>
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                        </span>
                        {language === 'he' ? "הפסק ניגון" : language === 'fr' ? "Arrêter" : "Stop Autoplay"}
                      </>
                    ) : (
                      <>
                        <Play size={13} fill="currentColor" />
                        {language === 'he' ? "ניגון אוטומטי" : language === 'fr' ? "Lecture Auto" : "Auto Play"}
                      </>
                    )}
                  </button>

                  <button 
                    onClick={() => setEnableAnimations(!enableAnimations)}
                    className="flex items-center gap-2 text-xs font-black uppercase px-3 py-1.5 bg-white/15 rounded-full border border-white/10 hover:bg-white/25 transition-all text-white/90"
                  >
                    <Sparkles size={14} className={cn(!enableAnimations && "opacity-20")} />
                    <span className={cn(!enableAnimations && "line-through")}>{t.toggleAnimations}</span>
                  </button>
                  <button 
                    onClick={() => setIsMuted(!isMuted)}
                    className="flex items-center gap-2 text-xs font-black uppercase px-3 py-1.5 bg-white/15 rounded-full border border-white/10 hover:bg-white/25 transition-all text-white/90"
                  >
                    {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                    {isMuted ? t.unmute : t.mute}
                  </button>

                  {/* Save to PDF Button */}
                  <button 
                    onClick={() => exportToPdf(comic, { pageSize: printSize, orientation: printOrientation, layout: printLayout, lang: language })}
                    className="flex items-center gap-2 text-sm font-black text-black bg-accent px-4 py-2 rounded-full hover:scale-105 active:scale-95 transition-transform shadow-[4px_4px_0px_0px_rgba(255,115,0,0.4)] border-2 border-black"
                  >
                    <Download size={15} /> 
                    {language === 'he' ? "שמור כ-PDF" : language === 'fr' ? "Enregistrer PDF" : "Save PDF"}
                  </button>

                  {/* Print Button (Runs window.print() natively) */}
                  <button 
                    onClick={() => window.print()}
                    className="flex items-center gap-2 text-sm font-black text-white bg-black border-2 border-white px-4 py-2 rounded-full hover:scale-105 active:scale-95 transition-transform"
                  >
                    <Printer size={15} /> {t.print}
                  </button>

                  {/* Save single panel as PNG with Hebrew overlaid */}
                  <button 
                    onClick={() => {
                      exportElementAsPng(comic.panels[activePanel], comic.title, activePanel + 1, comic.panels.length, language);
                    }}
                    className="flex items-center gap-2 text-xs font-black uppercase px-3 py-2 bg-white/10 rounded-full hover:bg-white/25 border border-white/10"
                    title={t.downloadPng}
                  >
                    <ImageIcon size={14} /> {t.downloadPng}
                  </button>

                  {/* Download All Panels as ZIP */}
                  <button 
                    onClick={() => downloadAllPanelsAsZip(comic.panels, comic.title, language)}
                    className="flex items-center gap-2 text-xs font-black uppercase px-3 py-2 bg-white/10 rounded-full hover:bg-white/25 border border-white/10"
                  >
                    <Download size={14} /> {t.downloadAll}
                  </button>
                  
                  <button onClick={() => setStep('story')} className="flex items-center gap-2 text-xs font-black uppercase px-3 py-2 bg-white/10 rounded-full hover:bg-white/25 border border-white/10"><RotateCcw size={14} /> {t.newStory}</button>
                </div>
              </div>

              {/* Dynamic Page Layout & Print Setup Control Center */}
              <div className={cn("no-print bg-[#F9F9F7] border-4 border-black rounded-[2rem] p-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] grid grid-cols-1 md:grid-cols-3 gap-6", isRTL && "text-right")} dir={isRTL ? "rtl" : "ltr"}>
                {/* Setting 1: Page Size Selection */}
                <div className="space-y-3">
                  <label className="block text-sm font-black uppercase tracking-wider text-black/60">
                    {language === 'he' ? "גודל עמוד / נייר" : "Page & Paper Size"}
                  </label>
                  <div className="flex gap-2">
                    {(['A4', 'A5', 'A6'] as const).map((size) => (
                      <button
                        key={size}
                        onClick={() => setPrintSize(size)}
                        className={cn(
                          "flex-1 py-2 px-3 border-2 border-black rounded-xl font-bold transition-all text-xs",
                          printSize === size
                            ? "bg-black text-white shadow-[3px_3px_0px_0px_rgba(0,0,0,0.15)] scale-[1.02]"
                            : "bg-white text-black hover:bg-black/5"
                        )}
                      >
                        {size === 'A6' ? (language === 'he' ? "A6 (חצי A5)" : "A6 (Half A5)") : size}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Setting 2: Orientation Selection */}
                <div className="space-y-3">
                  <label className="block text-sm font-black uppercase tracking-wider text-black/60">
                    {language === 'he' ? "כיוון הדפסה" : "Print Orientation"}
                  </label>
                  <div className="flex gap-2">
                    {(['portrait', 'landscape'] as const).map((orient) => (
                      <button
                        key={orient}
                        onClick={() => setPrintOrientation(orient)}
                        className={cn(
                          "flex-1 py-2 px-3 border-2 border-black rounded-xl font-bold transition-all text-xs capitalize",
                          printOrientation === orient
                            ? "bg-black text-white shadow-[3px_3px_0px_0px_rgba(0,0,0,0.15)] scale-[1.02]"
                            : "bg-white text-black hover:bg-black/5"
                        )}
                      >
                        {orient === 'portrait' 
                          ? (language === 'he' ? "לאורך (Portrait)" : "Portrait")
                          : (language === 'he' ? "לרוחב (Landscape)" : "Landscape")}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Setting 3: Layout Mode selection */}
                <div className="space-y-3">
                  <label className="block text-sm font-black uppercase tracking-wider text-black/60">
                    {language === 'he' ? "סגנון סדר פאנלים" : "Panels Arrangement"}
                  </label>
                  <div className="flex gap-2">
                    {(['one-per-page', 'grid'] as const).map((lay) => (
                      <button
                        key={lay}
                        onClick={() => setPrintLayout(lay)}
                        className={cn(
                          "flex-1 py-2 px-3 border-2 border-black rounded-xl font-bold transition-all text-xs",
                          printLayout === lay
                            ? "bg-black text-white shadow-[3px_3px_0px_0px_rgba(0,0,0,0.15)] scale-[1.02]"
                            : "bg-white text-black hover:bg-black/5"
                        )}
                      >
                        {lay === 'one-per-page'
                          ? (language === 'he' ? "פאנל אחד לעמוד (מומלץ לילדים!)" : "1 Panel per page")
                          : (language === 'he' ? "רשת פאנלים (Grid)" : "Grid Layout")}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Dynamic Hint banner helping parents understand saving */}
                <div className={cn("col-span-1 md:col-span-3 border-2 border-dashed border-black/20 rounded-xl p-3 bg-white flex items-center gap-3 text-xs opacity-80", isRTL && "flex-row-reverse")}>
                  <Sparkles className="text-accent flex-shrink-0 animate-pulse" size={16} />
                  <p className="font-bold leading-tight">
                    {language === 'he' ? (
                      `💡 שינוי גודל הדף והפריסה כאן יחול מיידית גם על הדפסת הקובץ, שמירת ה-PDF ושמירת הדפים לפנקס מושלם! (מומלץ לבחור A5 לרוחב עם פאנל אחד לכל דף לספרון ילדים יפייפה עברית).`
                    ) : (
                      `💡 Adjusting these layout parameters applies instantly both to your printable page templates and generated PDF, producing perfect comic books! (For best results on children's stories, try A5 Landscape with 1 panel per page).`
                    )}
                  </p>
                </div>
              </div>

              {/* Large Card Reader */}
              <div className="relative group no-print">
                <AnimatePresence mode="wait">
                  <motion.div 
                    key={activePanel}
                    ref={comicCardRef}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 1.1 }}
                    className="bg-white border-4 border-black rounded-[2rem] overflow-hidden shadow-[16px_16px_0px_0px_rgba(0,0,0,1)] relative"
                  >
                    <div className="aspect-square bg-gray-100 relative overflow-hidden" style={{ perspective: '1200px' }}>
                      {comic.panels[activePanel] && comic.panels[activePanel].imageUrl ? (
                        <div className="w-full h-full relative" style={{ transformStyle: 'preserve-3d' }}>
                          <motion.img 
                            src={comic.panels[activePanel].imageUrl} 
                            alt={`Panel ${activePanel + 1}`}
                            className="w-full h-full object-cover origin-center shadow-inner"
                            referrerPolicy="no-referrer"
                            animate={enableAnimations ? { 
                              scale: [1.02, 1.06, 1.03, 1.05, 1.02],
                              rotateX: [0, 1.2, -1.2, 0.8, 0],
                              rotateY: [0, -1.5, 1.5, -0.8, 0],
                              rotateZ: [0, 0.3, -0.3, 0.1, 0],
                              y: [0, -3, 3, -1.5, 0],
                              x: [0, 1.5, -1.5, 0.8, 0]
                            } : {
                              scale: 1,
                              rotateX: 0,
                              rotateY: 0,
                              rotateZ: 0,
                              y: 0,
                              x: 0
                            }}
                            transition={enableAnimations ? {
                              duration: 10,
                              repeat: Infinity,
                              ease: "easeInOut"
                            } : { duration: 0 }}
                          />
                          {/* Animated subtle eye-blinking atmospheric shadow pulse */}
                          {enableAnimations && (
                            <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-black/5 via-transparent to-black/10 mix-blend-overlay animate-[pulse_6s_infinite_ease-in-out]" />
                          )}
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center h-full gap-4 text-center p-8">
                          {isGenerating ? (
                            <div className="flex flex-col items-center gap-2">
                              <Loader2 className="animate-spin text-accent" size={48} />
                              <p className="text-sm font-bold opacity-40">{t.steps.generating}</p>
                            </div>
                          ) : (
                            <div className="flex flex-col items-center gap-4">
                              <AlertCircle size={48} className="text-red-500 opacity-50" />
                              <div>
                                <p className="font-bold text-black/60 capitalize">Panel {activePanel + 1} Failed</p>
                                <p className="text-xs opacity-40">AI was busy or had an issue</p>
                              </div>
                              <button 
                                onClick={() => retryPanel(activePanel)}
                                className="flex items-center gap-2 px-6 py-2 bg-black text-white rounded-full font-black text-sm hover:scale-105 active:scale-95 transition-transform"
                              >
                                <Sparkles size={16} /> {t.retry}
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                      
                      {/* Mood Indicator */}
                      {comic.panels[activePanel] && (
                        <div className="absolute top-4 right-4 bg-black text-white px-3 py-1 rounded-full text-xs font-black uppercase italic tracking-widest">
                          {comic.panels[activePanel].mood}
                        </div>
                      )}
                    </div>

                    <div className="p-8 space-y-6 sm:p-12">
                      {comic.panels[activePanel] && comic.panels[activePanel].dialogue && (
                        <div className="flex justify-center mb-8">
                          <motion.div 
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="bg-white border-2 border-black p-4 rounded-[2rem] font-bold text-xl relative shadow-lg max-w-[80%] text-center"
                          >
                            <Sparkles className="absolute -top-4 -left-4 text-accent" />
                            {comic.panels[activePanel].dialogue}
                            <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-white border-b-2 border-r-2 border-black rotate-45" />
                          </motion.div>
                        </div>
                      )}

                      {comic.panels[activePanel] && (
                        <div 
                          onClick={() => {
                            if (isAutoplay) setIsAutoplay(false);
                            speak(comic.panels[activePanel].caption, language, comic.panels[activePanel].mood, comic.voicePersona);
                            if (!isMuted) playComicSound(comic.panels[activePanel].mood);
                          }}
                          className="bg-gray-50 border-2 border-black/10 p-6 rounded-2xl cursor-pointer hover:bg-accent/10 transition-colors group/caption relative"
                        >
                          <p className="text-2xl font-medium leading-relaxed italic opacity-90">
                            {comic.panels[activePanel].caption}
                          </p>
                          <div className="absolute top-4 right-4 text-accent opacity-0 group-hover/caption:opacity-100 transition-opacity">
                            <Volume2 size={24} />
                          </div>
                          <div className="mt-4 flex items-center justify-between text-xs font-black uppercase tracking-widest opacity-35 group-hover/caption:opacity-65 transition-opacity">
                            <span className="flex items-center gap-1.5">
                              <Volume2 size={14} /> {t.clickToHear}
                            </span>
                            {isAutoplay && (
                              <span className="text-emerald-600 font-extrabold flex items-center gap-1.5 animate-pulse">
                                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
                                {language === 'he' ? "בניגון אוטומטי..." : language === 'fr' ? "Lecture auto..." : "Autoplay ON..."}
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </motion.div>
                </AnimatePresence>

                {/* Navigation Controls */}
                <div className="absolute top-1/2 -translate-y-1/2 -left-12 opacity-0 group-hover:opacity-100 transition-opacity hidden md:block no-print">
                   <button 
                     disabled={activePanel === 0}
                     onClick={() => {
                       if (isAutoplay) setIsAutoplay(false);
                       setActivePanel(p => Math.max(0, p - 1));
                     }}
                     className="p-4 bg-black text-accent rounded-full disabled:opacity-20 transition-transform active:scale-95"
                   >
                     {isRTL ? <ArrowRight size={32} /> : <ArrowLeft size={32} />}
                   </button>
                 </div>
                 <div className="absolute top-1/2 -translate-y-1/2 -right-12 opacity-0 group-hover:opacity-100 transition-opacity hidden md:block no-print">
                   <button 
                     disabled={activePanel === comic.panels.length - 1}
                     onClick={() => {
                       if (isAutoplay) setIsAutoplay(false);
                       setActivePanel(p => Math.min(comic.panels.length - 1, p + 1));
                     }}
                     className="p-4 bg-black text-accent rounded-full disabled:opacity-20 transition-transform active:scale-95"
                   >
                     {isRTL ? <ArrowLeft size={32} /> : <ArrowRight size={32} />}
                   </button>
                 </div>
              </div>

              {/* Mobile Controls & Thumbnails */}
              <div className="flex flex-col gap-6 no-print">
                <div className="flex justify-between items-center px-4 md:hidden">
                  <button 
                    onClick={() => {
                      if (isAutoplay) setIsAutoplay(false);
                      setActivePanel(p => Math.max(0, p - 1));
                    }} 
                    className="p-4 bg-black text-accent rounded-2xl"
                  >
                    {isRTL ? <ArrowRight /> : <ArrowLeft />}
                  </button>
                  <span className="font-black italic">{activePanel + 1} / {comic.panels.length}</span>
                  <button 
                    onClick={() => {
                      if (isAutoplay) setIsAutoplay(false);
                      setActivePanel(p => Math.min(comic.panels.length - 1, p + 1));
                    }} 
                    className="p-4 bg-black text-accent rounded-2xl"
                  >
                    {isRTL ? <ArrowLeft /> : <ArrowRight />}
                  </button>
                </div>

                <div className="flex gap-4 overflow-x-auto pb-4 px-2 scrollbar-hide">
                  {comic.panels.map((p, i) => (
                    <button 
                      key={i}
                      onClick={() => {
                        if (isAutoplay) setIsAutoplay(false);
                        setActivePanel(i);
                      }}
                      className={cn(
                        "flex-shrink-0 w-24 h-24 rounded-xl border-4 overflow-hidden transition-all",
                        activePanel === i ? "border-black scale-110 shadow-lg" : "border-black/10 grayscale opacity-50 hover:opacity-100"
                      )}
                    >
                      <img src={p.imageUrl} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    </button>
                  ))}
                </div>

                {/* 🌟 Casting & Likeness Board: Visual Likeness Proof 🌟 */}
                <div className={cn("bg-white border-4 border-black rounded-3xl p-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] space-y-4 no-print", isRTL && "text-right")}>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl animate-bounce">🎭</span>
                    <h4 className="text-xl font-black uppercase italic text-black">
                      {language === 'he' ? "הכירו את הדמויות המצוירות שלכם!" : language === 'fr' ? "Casting du livre !" : "Meet your Comic Cast!"}
                    </h4>
                  </div>
                  <p className="text-xs font-black text-black/60 uppercase">
                    {language === 'he' 
                      ? "השוואה בזמן אמת בין תמונת המקור שלכם לבין הדמות המצוירת שיוצרה על ידי אמן ה-AI:" 
                      : "Compare your uploaded photo with the drawn comic book character created by AI:"}
                  </p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {(comic.characters || characters).map((char, idx) => (
                      <div key={idx} className="bg-gray-50 border-3 border-black rounded-2xl p-4 flex flex-col items-center text-center space-y-3 relative hover:scale-[1.02] transition-transform">
                        <div className="text-[10px] font-black uppercase text-[#FF6321] bg-black px-3 py-1 rounded-full absolute -top-3.5 left-1/2 -translate-x-1/2 border border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,0.15)]">
                          {(t.roles as any)[char.role] || char.role}
                        </div>
                        
                        <div className="flex items-center justify-center gap-4 w-full pt-2">
                          {/* Original Photo */}
                          <div className="flex flex-col items-center">
                            <span className="text-[9px] font-black uppercase text-black/50 mb-1">
                              {language === 'he' ? "תמונת מקור" : "Original Source"}
                            </span>
                            <div className="w-16 h-16 rounded-xl border-2 border-black overflow-hidden bg-gray-200 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                              {char.photoUrls && char.photoUrls.length > 0 ? (
                                <img src={char.photoUrls[0]} alt="Original" className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center opacity-35 bg-white"><Camera size={18} /></div>
                              )}
                            </div>
                          </div>
                          
                          {/* Connection Arrow */}
                          <div className="text-[#FF6321] font-black text-xl animate-pulse">➔</div>
                          
                          {/* Generated Cartoon Portal */}
                          <div className="flex flex-col items-center">
                            <span className="text-[9px] font-black uppercase text-[#FF6321] mb-1">
                              {language === 'he' ? "דמות מצוירת" : "Comic Sketch"}
                            </span>
                            <div className="w-16 h-16 rounded-xl border-3 border-[#FF6321] overflow-hidden bg-white shadow-[2px_2px_0px_0px_rgba(255,99,33,0.2)]">
                              {char.drawnPortraitUrl ? (
                                <img src={char.drawnPortraitUrl} alt="Comic Output" className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex flex-col items-center justify-center bg-gray-100 text-[10px] font-black text-gray-400 p-1 leading-tight">
                                  <span>🎨</span>
                                  <span>{language === 'he' ? "מצייר..." : "Drawing..."}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                        
                        <div>
                          <h5 className="font-extrabold text-sm uppercase italic text-black">{char.name || "Untitled Hero"}</h5>
                          <p className="text-[11px] font-bold opacity-60 line-clamp-2 max-w-[200px] mt-1">{char.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                 <div className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-4">
                  <button 
                    onClick={() => {
                      if (isAutoplay) setIsAutoplay(false);
                      setStep('story');
                    }}
                    className="flex items-center gap-2 px-8 py-4 bg-black text-accent hover:bg-neutral-800 rounded-full text-base font-black uppercase italic shadow-xl hover:scale-105 active:scale-95 transition-all border-2 border-black"
                  >
                    <RotateCcw size={18} /> {t.newStory}
                  </button>

                  <button 
                    onClick={() => {
                      if (isAutoplay) setIsAutoplay(false);
                      setStep('landing');
                    }}
                    className="flex items-center gap-2 px-8 py-4 bg-white text-black border-4 border-black hover:bg-neutral-50 rounded-full text-base font-black uppercase italic shadow-xl hover:scale-105 active:scale-95 transition-all"
                  >
                    <span className="text-xl">📚</span>
                    {language === 'he' ? "חזרה לספריית הקומיקס" : language === 'fr' ? "Retour à la bibliothèque" : "Back to Comic Bookshelf"}
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        </MotionConfig>
      </main>

      <footer className="relative z-10 py-12 px-6 text-center mt-auto no-print space-y-4 max-w-2xl mx-auto">
        {/* Clickable Interactive Token & Pricing Pill */}
        <button
          onClick={() => setShowDiagnostics(true)}
          className="inline-flex flex-col md:flex-row items-center justify-between gap-4 bg-white border-4 border-black p-4 rounded-3xl hover:scale-[1.02] active:scale-[0.98] cursor-pointer transition-transform shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] text-xs font-black text-black w-full"
        >
          <div className="flex items-center gap-2">
            <span className="relative flex h-3.5 w-3.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500"></span>
            </span>
            <span className="uppercase tracking-wider">
              {language === 'he' ? "סטטוס חיבור AI: פעיל" : language === 'fr' ? "Statut API IA : Actif" : "AI Connection: Active"}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-[11px]">
            <span className="bg-[#FFB800] text-black font-black px-2.5 py-1 rounded-xl border-2 border-black font-mono">
              {language === 'he' ? `עלות: $${totalCostUSD.toFixed(5)}` : language === 'fr' ? `Coût : $${totalCostUSD.toFixed(5)}` : `Cost: $${totalCostUSD.toFixed(5)}`}
            </span>
            <span className="bg-black text-[#FFB800] font-black px-2.5 py-1 rounded-xl border-2 border-black font-mono">
              {language === 'he' ? `יתרה: ${(SESSION_CREDIT - totalTokens).toLocaleString()}` : language === 'fr' ? `Reste : ${(SESSION_CREDIT - totalTokens).toLocaleString()}` : `Left: ${(SESSION_CREDIT - totalTokens).toLocaleString()}`}
            </span>
            <span className="opacity-70 font-mono">
              {language === 'he' ? `אסימונים: ${totalTokens.toLocaleString()}` : language === 'fr' ? `Jetons : ${totalTokens.toLocaleString()}` : `Tokens: ${totalTokens.toLocaleString()}`}
            </span>
            <span className="text-accent font-black uppercase hover:underline flex items-center gap-1">
              {language === 'he' ? "פרטים ➔" : language === 'fr' ? "Détails ➔" : "Details ➔"}
            </span>
          </div>
        </button>

        <div className="text-[11px] font-bold uppercase opacity-60 space-y-1 text-center">
          <div>Comicskido &copy; 2026 • Personalized Story Book Builder</div>
          <div className="flex items-center justify-center gap-2 text-accent font-black tracking-wide">
            <span title="Application Version">{VERSION_NUMBER}</span>
            <span>•</span>
            <span title="Deployment Build Timestamp">Build: {BUILD_NUMBER}</span>
          </div>
        </div>
      </footer>

      {/* Detailed Diagnostics Pop-up Drawer */}
      <AnimatePresence>
        {showDiagnostics && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 no-print">
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-[#FAF9F6] border-4 border-black p-6 rounded-[2rem] shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] max-w-md w-full text-black relative space-y-6 overflow-hidden max-h-[90vh] overflow-y-auto"
              dir={isRTL ? "rtl" : "ltr"}
            >
              {/* Heading */}
              <div className="border-b-4 border-black pb-4 flex justify-between items-start">
                <div className={cn("flex-1", isRTL ? "text-right" : "text-left")}>
                  <h2 className="text-2xl font-black uppercase italic tracking-tight text-black">
                    {language === 'he' ? "מרכז אבחון ועלויות AI" : language === 'fr' ? "Diagnostic & Coûts IA" : "AI Diagnostics & Cost"}
                  </h2>
                  <p className="text-xs font-bold text-black/60 uppercase mt-0.5">
                    {language === 'he' ? "פירוט איוש ואסימוני מערכת מדויק" : language === 'fr' ? "Métriques réelles de jetons et prix" : "Real-time Token Metrics & Cost Ledger"}
                  </p>
                </div>
              </div>

              {/* Version & Build Explained Section */}
              <div className="bg-white border-2 border-black p-3.5 rounded-2xl space-y-2 text-xs">
                <div className="flex justify-between items-center font-black uppercase text-[10px] text-black/70">
                  <span>
                    {language === 'he' ? "גרסה ומספר גרסת בנייה:" : language === 'fr' ? "Version & Tag de Build :" : "Version & Build Info:"}
                  </span>
                  <span className="text-accent font-mono font-bold">{VERSION_NUMBER} ({BUILD_NUMBER})</span>
                </div>
                <div className="text-[10px] text-black/80 font-medium space-y-1 leading-relaxed">
                  <p>
                    <strong>{VERSION_NUMBER}:</strong> {language === 'he' ? "מהדורת התכונות והעיצוב של האפליקציה." : "Application feature release tag."}
                  </p>
                  <p>
                    <strong>Build ({BUILD_NUMBER}):</strong> {language === 'he' ? "חתימת זמני הפריסה המדויקים בשרת." : "Deployment build timestamp identifier."}
                  </p>
                  <p className="text-emerald-700 font-bold">
                    ✓ Google Gemini API Key: {language === 'he' ? "מחובר ומאומת בשרת דרך process.env.GEMINI_API_KEY" : "Active & connected on server via process.env.GEMINI_API_KEY"}
                  </p>
                </div>
              </div>

              {/* API Status Table */}
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2 text-xs font-bold">
                  <div className={cn("bg-[#EFECE6] p-3 rounded-2xl border-2 border-black", isRTL ? "text-right" : "text-left")}>
                    <span className="block text-[9px] uppercase opacity-60 font-black tracking-wider mb-1">
                      {language === 'he' ? "תגובה אחרונה" : language === 'fr' ? "Dernier Statut" : "Last API Status"}
                    </span>
                    <span className="font-mono text-emerald-700 leading-tight block truncate" title={aiStats.lastApiStatus}>
                      {aiStats.lastApiStatus}
                    </span>
                  </div>
                  <div className={cn("bg-[#EFECE6] p-3 rounded-2xl border-2 border-black", isRTL ? "text-right" : "text-left")}>
                    <span className="block text-[9px] uppercase opacity-60 font-black tracking-wider mb-1">
                      {language === 'he' ? "זמן תגובה" : language === 'fr' ? "Temps réponse" : "Latency"}
                    </span>
                    <span className="font-mono text-black leading-tight block">
                      {aiStats.lastApiResponseTimeMs ? `${aiStats.lastApiResponseTimeMs.toLocaleString()}ms` : "0ms"}
                    </span>
                  </div>
                </div>

                {/* Token Usage Gauge */}
                <div className="bg-white border-2 border-black p-4 rounded-2xl space-y-3">
                  <div className="flex justify-between text-xs font-black uppercase tracking-wide">
                    <span>{language === 'he' ? "מכסת אסימונים לסשן" : language === 'fr' ? "Crédit de Session" : "Session Token Credit"}</span>
                    <span className="font-mono">
                      {totalTokens.toLocaleString()} / {SESSION_CREDIT.toLocaleString()}
                    </span>
                  </div>
                  
                  {/* Progress bar */}
                  <div className="w-full h-4 bg-gray-100 border-2 border-black rounded-full overflow-hidden p-0.5">
                    <div 
                      className="h-full bg-accent rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(100, (totalTokens / SESSION_CREDIT) * 100)}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-black/50 leading-relaxed font-semibold">
                    {language === 'he' 
                      ? "* אסימונים מדמים מגבלת בטיחות הוגנת לכל הפעלה." 
                      : language === 'fr'
                      ? "* Standard simulateur de crédit de sécurité pour l'environnement de bac à sable."
                      : "* Playground safety credit ensures heavy concurrent operations run smoothly."}
                  </p>
                </div>

                {/* Manual Image Generation Model Engine Selector Card */}
                <div className="bg-white border-2 border-black p-4 rounded-2xl space-y-3">
                  <div className="flex justify-between items-center">
                    <h4 className={cn("text-xs font-black uppercase tracking-wider text-black", isRTL ? "text-right" : "text-left")}>
                      {language === 'he' ? "בחירת מנוע מחולל תמונות (מגוון מודלים):" : "Image AI Engine (Multi-Model Selector):"}
                    </h4>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs font-bold">
                    <button
                      type="button"
                      onClick={() => handleSetImageEngine('gemini')}
                      className={cn(
                        "p-3 rounded-2xl border-2 border-black text-left flex flex-col gap-1 transition-all cursor-pointer",
                        imageEngine === 'gemini' 
                          ? "bg-purple-900 text-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]" 
                          : "bg-gray-100 text-black/60 hover:bg-gray-200"
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-extrabold uppercase text-[10px]">Google Gemini</span>
                        {imageEngine === 'gemini' && <span className="text-amber-300 font-mono text-[9px] font-black">● ACTIVE</span>}
                      </div>
                      <span className="text-[9px] opacity-80 leading-tight">
                        gemini-3.1-flash-image (Pure Google AI)
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSetImageEngine('huggingface')}
                      className={cn(
                        "p-3 rounded-2xl border-2 border-black text-left flex flex-col gap-1 transition-all cursor-pointer",
                        imageEngine === 'huggingface' 
                          ? "bg-amber-400 text-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]" 
                          : "bg-gray-100 text-black/60 hover:bg-gray-200"
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-extrabold uppercase text-[10px]">Hugging Face</span>
                        {imageEngine === 'huggingface' && <span className="font-mono text-[9px] font-black">● ACTIVE</span>}
                      </div>
                      <span className="text-[9px] opacity-80 leading-tight">
                        FLUX.1-schnell & SDXL (HF Token Auth)
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSetImageEngine('pollinations')}
                      className={cn(
                        "p-3 rounded-2xl border-2 border-black text-left flex flex-col gap-1 transition-all cursor-pointer",
                        imageEngine === 'pollinations' 
                          ? "bg-blue-600 text-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]" 
                          : "bg-gray-100 text-black/60 hover:bg-gray-200"
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-extrabold uppercase text-[10px]">Pollinations AI</span>
                        {imageEngine === 'pollinations' && <span className="font-mono text-[9px] font-black text-white">● ACTIVE</span>}
                      </div>
                      <span className="text-[9px] opacity-80 leading-tight">
                        pollinations-{pollinationsSubModel} (20+ Models)
                      </span>
                    </button>
                  </div>
                </div>

                {/* Automatic Model Fallback Switch Control Card */}
                <div className="bg-amber-100/90 border-2 border-black p-4 rounded-2xl space-y-2">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <RotateCcw size={20} className="text-black shrink-0 mt-0.5" />
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-xs font-black uppercase text-black">
                            {language === 'he' ? "החלפת מודל אוטומטית במקרה של שגיאה (Automatic Model Fallback)" : "Automatic Model Fallback"}
                          </h4>
                          <span className={cn(
                            "px-2 py-0.5 rounded-full text-[9px] font-mono font-black border border-black uppercase",
                            autoFallback ? "bg-emerald-400 text-black" : "bg-rose-950 text-rose-200"
                          )}>
                            {autoFallback ? 'ENABLED' : 'DISABLED'}
                          </span>
                        </div>
                        <p className="text-[11px] text-zinc-800 leading-snug mt-1">
                          {language === 'he'
                            ? "כאשר המפסק כבוי: השרת **לא יבצע Fallback** למודלים משניים במידה והמודל שנבחר נכשל. הוא יחזיר שגיאה ישירה ללקוח."
                            : "When OFF: the server will **NOT fallback** to backup sub-models if the selected engine/model fails. It will throw a direct error to the client."}
                        </p>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer shrink-0">
                      <input 
                        type="checkbox" 
                        checked={autoFallback} 
                        onChange={(e) => handleSetAutoFallback(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-12 h-6 bg-zinc-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-black after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-black after:border-2 after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500 border-2 border-black"></div>
                    </label>
                  </div>
                </div>

                {/* Exact Cost Breakdown */}
                <div className="space-y-2">
                  <h4 className={cn("text-xs font-black uppercase tracking-wider text-black/60", isRTL ? "text-right" : "text-left")}>
                    {language === 'he' ? "פירוט עלות ייצור מדויק (USD)" : language === 'fr' ? "Détail de facturation brute" : "Precise Production Cost Ledger"}
                  </h4>
                  
                  <div className="bg-[#E9E6DC] border-2 border-black rounded-2xl overflow-hidden divide-y-2 divide-black/10 font-mono text-[11px] font-bold">
                    {/* Input Tokens */}
                    <div className="p-2.5 flex justify-between items-center bg-white/20">
                      <span className="opacity-75 text-[10px]">Story Prompts ({aiStats.textModelName})</span>
                      <span className="font-mono">
                        {aiStats.textPromptTokens.toLocaleString()} tkn ≈ ${textPromptCost.toFixed(5)}
                      </span>
                    </div>

                    {/* Output Tokens */}
                    <div className="p-2.5 flex justify-between items-center bg-white/20">
                      <span className="opacity-75 text-[10px]">Story Outcomes ({aiStats.textModelName})</span>
                      <span className="font-mono">
                        {aiStats.textCompletionTokens.toLocaleString()} tkn ≈ ${textCompletionCost.toFixed(5)}
                      </span>
                    </div>

                    {/* Character images */}
                    <div className="p-2.5 flex justify-between items-center bg-white/20">
                      <span className="opacity-75 text-[10px]">Portraits ({aiStats.imageModelName})</span>
                      <span className="font-mono">
                        {aiStats.characterCalls} cards ≈ ${characterCost.toFixed(3)}
                      </span>
                    </div>

                    {/* Panels */}
                    <div className="p-2.5 flex justify-between items-center bg-white/20">
                      <span className="opacity-75 text-[10px]">Comic Panels ({aiStats.imageModelName})</span>
                      <span className="font-mono">
                        {aiStats.imageCalls} panels ≈ ${imageCost.toFixed(3)}
                      </span>
                    </div>

                    {/* Total */}
                    <div className="p-2.5 flex justify-between items-center bg-black text-[#FFB800] uppercase font-black tracking-wide text-xs">
                      <span>{language === 'he' ? "סה\"כ עלות ייצור" : language === 'fr' ? "Coût Total Estimé" : "Total Generated Cost"}</span>
                      <span className="font-mono">${totalCostUSD.toFixed(5)} USD</span>
                    </div>
                  </div>
                  
                  <div className="text-[9px] text-[#A05C2B] leading-normal font-bold">
                    {language === 'he' ? (
                      `* מחושב במדויק לפי תעריפי Google AI המעודכנים: $0.075 למליון אסימוני קלט, $0.30 למליון אסימוני פלט, ו-$0.03 לכל ייצור תמונת קומיקס.`
                    ) : language === 'fr' ? (
                      `* Calculé strictement sur les tarifs d'API GCP réels : $0,075/1M jetons d'entrée, $0,30/1M jetons de sortie et $0,03 par génération d'image de bande dessinée.`
                    ) : (
                      `* Calculated directly with live GCP service prices: $0.075 per 1M prompt input tokens, $0.30 per 1M completion output tokens, and $0.03 per image portrait/panel generation.`
                    )}
                  </div>
                </div>
              </div>

              {/* Open Terminal Logs Button */}
              <button
                type="button"
                onClick={() => {
                  setShowDiagnostics(false);
                  setShowTerminalLogs(true);
                }}
                className="w-full py-3 bg-gradient-to-r from-gray-900 to-black text-amber-400 border-4 border-black rounded-2xl font-black uppercase text-xs flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98] transition-all shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
              >
                <Terminal size={16} />
                {language === 'he' ? "פתח חלון לוגים וטרמינל בזמן אמת" : language === 'fr' ? "Ouvrir le Terminal & Logs en Direct" : "Open Live AI Terminal & Logs Window"}
              </button>

              {/* Close Button */}
              <button
                type="button"
                onClick={() => setShowDiagnostics(false)}
                className="w-full py-3.5 bg-black text-[#FFB800] rounded-2xl border-4 border-black font-black uppercase text-xs hover:bg-[#FF6321] hover:text-black transition-colors shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-none translate-x-0 active:translate-x-1 active:translate-y-1 block"
              >
                {language === 'he' ? "סגור לוח אבחון" : language === 'fr' ? "Fermer les paramètres" : "Close Diagnostics"}
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Floating Terminal Trigger Button */}
      <button
        type="button"
        onClick={() => setShowTerminalLogs(true)}
        title="Open Live AI Terminal & System Logs"
        className="fixed bottom-4 right-4 z-40 bg-[#111827] text-amber-400 border-4 border-black px-3.5 py-2.5 rounded-2xl font-black uppercase text-xs flex items-center gap-2 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] hover:scale-105 active:scale-95 transition-all no-print font-mono cursor-pointer"
      >
        <Terminal size={16} className="text-emerald-400 animate-pulse" />
        <span>Live Terminal Logs</span>
      </button>

      {/* Terminal Logs Modal Component */}
      <TerminalLogsModal
        isOpen={showTerminalLogs}
        onClose={() => setShowTerminalLogs(false)}
        language={language}
      />

      {/* Model Usage Summary Report Modal */}
      <ModelReportModal
        isOpen={showModelReportModal}
        onClose={() => setShowModelReportModal(false)}
        onOpenFLiteCard={() => setShowFLiteTextureModal(true)}
        language={language}
      />

      {/* Freepik / F-Lite-Texture (10B) Model Card Modal */}
      <FLiteTextureModelCard
        isOpen={showFLiteTextureModal}
        onClose={() => setShowFLiteTextureModal(false)}
        language={language}
      />

      {/* DIY Perchance Generator API Modal */}
      <PerchanceModal
        isOpen={showPerchanceModal}
        onClose={() => setShowPerchanceModal(false)}
        onInsertPrompt={(txt) => setStoryText(prev => prev ? `${prev}\n${txt}` : txt)}
        language={language}
      />

      {/* Dynamic media print overrides */}
      {comic && (
        <style dangerouslySetInnerHTML={{ __html: `
          @media print {
            @page {
              size: ${printSize.toLowerCase()} ${printOrientation};
              margin: 8mm 8mm 8mm 8mm;
            }
            body {
              background: white !important;
              color: black !important;
            }
            .no-print {
              display: none !important;
            }
            .print-only {
              display: block !important;
            }
            .page-break {
              page-break-after: always;
              break-after: page;
            }
          }
        ` }} />
      )}

      {comic && (
        <div className={cn("print-only p-4 bg-white text-black min-h-screen", isRTL && "text-right")} dir={isRTL ? 'rtl' : 'ltr'}>
          {printLayout === 'one-per-page' ? (
            /* 1 Cartoon panel per Page - Ideal for high-end storybooks & booklet binders */
            <div className="space-y-0">
              {comic.panels.map((panel, i) => (
                <div 
                  key={i} 
                  className={cn(
                    "page-break h-full flex flex-col justify-between items-center py-6 px-4 bg-white border-8 border-black rounded-[2.5rem] relative max-w-full overflow-hidden mx-auto",
                    // Use suitable sizing limits depending on landscape/portrait choice
                    printOrientation === 'landscape' ? "max-h-[140mm] my-0" : "max-h-[250mm] my-0"
                  )}
                  style={{ boxSizing: 'border-box' }}
                >
                  {/* Comic Page Header */}
                  <div className="w-full flex justify-between items-center bg-black text-[#FFB800] px-4 py-2 rounded-xl mb-4">
                    <span className="text-sm font-black uppercase italic tracking-wide">{comic.title}</span>
                    <span className="text-xs font-black uppercase">
                      {isRTL ? `פאנל ${i + 1} מתוך ${comic.panels.length}` : `Panel ${i + 1} of ${comic.panels.length}`}
                    </span>
                  </div>

                  {/* Centered Image Container */}
                  <div className="w-full max-w-[420px] aspect-square relative border-4 border-black bg-gray-50 rounded-2xl overflow-hidden shadow-md mx-auto my-auto">
                    {panel.imageUrl && (
                      <img 
                        src={panel.imageUrl} 
                        alt="" 
                        className="w-full h-full object-cover" 
                        referrerPolicy="no-referrer"
                      />
                    )}
                    {/* Panel index label in corner */}
                    <div className={cn(
                      "absolute top-3 bg-black text-white px-2.5 py-1 text-xs font-black rounded-lg",
                      isRTL ? "left-3" : "right-3"
                    )}>
                      #{i + 1}
                    </div>

                    {/* Speech bubble overlay if dialogue exists */}
                    {panel.dialogue && (
                      <div className="absolute top-4 left-1/2 -translate-x-1/2 max-w-[85%] bg-white border-2 border-black px-3 py-1.5 rounded-2xl text-center shadow-lg">
                        <p className={cn("text-xs font-black text-black leading-tight", isRTL ? "font-sans" : "italic")}>
                          "{panel.dialogue}"
                        </p>
                        <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-white border-b-2 border-r-2 border-black rotate-45" />
                      </div>
                    )}
                  </div>

                  {/* Narrative Caption under image */}
                  <div className="w-full border-t-4 border-black border-dashed pt-4 mt-4 text-center">
                    <p className={cn(
                      "text-lg font-bold leading-relaxed text-black/90 px-6",
                      isRTL ? "font-sans text-right" : "font-sans"
                    )}>
                      {panel.caption}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* Traditional multi-panel Grid view - dynamic sizing for printable pdf sheets */
            <div>
              <div className="text-center border-b-8 border-black pb-4 mb-8">
                <span className="text-[10px] font-black uppercase tracking-widest text-[#FF6321]">
                  My Comic Story Book
                </span>
                <h1 className="text-4xl font-black uppercase italic mt-1">{comic.title}</h1>
              </div>

              <div className="grid grid-cols-2 gap-6">
                {comic.panels.map((panel, i) => (
                  <div 
                    key={i} 
                    className="border-4 border-black p-4 flex flex-col justify-between shadow-md bg-white rounded-2xl break-inside-avoid"
                  >
                    <div>
                      {/* Grid Panel Header */}
                      <div className="flex justify-between items-center border-b-2 border-black pb-2 mb-3">
                        <span className="text-xs font-black">PANEL #{i + 1}</span>
                        {panel.mood && <span className="text-[10px] bg-black text-white px-1.5 py-0.5 rounded uppercase font-bold">{panel.mood}</span>}
                      </div>

                      {/* Image block */}
                      <div className="aspect-square relative border-2 border-black overflow-hidden rounded-xl bg-gray-50 mb-3">
                        {panel.imageUrl && (
                          <img 
                            src={panel.imageUrl} 
                            alt="" 
                            className="w-full h-full object-cover" 
                            referrerPolicy="no-referrer"
                          />
                        )}
                        
                        {/* Overlay dialogue if present */}
                        {panel.dialogue && (
                          <div className="absolute top-2 left-1/2 -translate-x-1/2 max-w-[90%] bg-white border border-black py-1 px-2 rounded-xl text-center text-[10px] font-black leading-tight shadow-md">
                            "{panel.dialogue}"
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Aligned captions */}
                    <div className="border-t-2 border-black pt-2 mt-auto">
                      <p className="text-xs font-bold leading-relaxed text-black">
                        {panel.caption}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

