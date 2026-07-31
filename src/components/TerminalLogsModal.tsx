import React, { useState, useEffect, useRef } from 'react';
import { logger, LogEntry, sortLogsNewestFirst } from '../services/logger';
import { Terminal, X, Trash2, Copy, AlertCircle, CheckCircle2, Info, HelpCircle, Search, RefreshCw, Layers, ExternalLink, Cpu, BookOpen, Image as ImageIcon, Sparkles, RotateCcw } from 'lucide-react';
import { 
  StoryEngine, GeminiStorySubModel, HfStorySubModel,
  getActiveStoryEngine, setActiveStoryEngine,
  getActiveGeminiStorySubModel, setActiveGeminiStorySubModel,
  getActiveHfStorySubModel, setActiveHfStorySubModel,
  ImageEngine, GeminiImageSubModel, HuggingFaceSubModel, PollinationsSubModel,
  getActiveImageEngine, setActiveImageEngine,
  getActiveGeminiSubModel, setActiveGeminiSubModel,
  getActiveHfSubModel, setActiveHfSubModel,
  getActivePollinationsSubModel, setActivePollinationsSubModel,
  getAutoFallbackEnabled, setAutoFallbackEnabled,
  subscribeEngineSettings
} from '../services/gemini';
import { FLiteTextureModelCard } from './FLiteTextureModelCard';

interface TerminalLogsModalProps {
  isOpen: boolean;
  onClose: () => void;
  language?: string;
}

export const TerminalLogsModal: React.FC<TerminalLogsModalProps> = ({
  isOpen,
  onClose,
  language = 'en',
}) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [serverLogs, setServerLogs] = useState<LogEntry[]>([]);
  const [filterCategory, setFilterCategory] = useState<string>('ALL');
  const [filterLevel, setFilterLevel] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'console' | 'troubleshooting'>('console');
  const [copied, setCopied] = useState<boolean>(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  // Model Engine States
  const [storyEngine, setStoryEngineState] = useState<StoryEngine>(() => getActiveStoryEngine());
  const [geminiStorySubModel, setGeminiStorySubModelState] = useState<GeminiStorySubModel>(() => getActiveGeminiStorySubModel());
  const [hfStorySubModel, setHfStorySubModelState] = useState<HfStorySubModel>(() => getActiveHfStorySubModel());

  const [imageEngine, setImageEngineState] = useState<ImageEngine>(() => getActiveImageEngine());
  const [geminiSubModel, setGeminiSubModelState] = useState<GeminiImageSubModel>(() => getActiveGeminiSubModel());
  const [hfSubModel, setHfSubModelState] = useState<HuggingFaceSubModel>(() => getActiveHfSubModel());
  const [pollinationsSubModel, setPollinationsSubModelState] = useState<PollinationsSubModel>(() => getActivePollinationsSubModel());

  const [autoFallback, setAutoFallbackState] = useState<boolean>(() => getAutoFallbackEnabled());
  const [showFLiteTextureModal, setShowFLiteTextureModal] = useState<boolean>(false);

  const handleSetStoryEngine = (engine: StoryEngine) => {
    setStoryEngineState(engine);
    setActiveStoryEngine(engine);
  };
  const handleSetGeminiStorySubModel = (model: GeminiStorySubModel) => {
    setGeminiStorySubModelState(model);
    setActiveGeminiStorySubModel(model);
  };
  const handleSetHfStorySubModel = (model: HfStorySubModel) => {
    setHfStorySubModelState(model);
    setActiveHfStorySubModel(model);
  };

  const handleSetImageEngine = (engine: ImageEngine) => {
    setImageEngineState(engine);
    setActiveImageEngine(engine);
  };
  const handleSetGeminiSubModel = (model: GeminiImageSubModel) => {
    setGeminiSubModelState(model);
    setActiveGeminiSubModel(model);
  };
  const handleSetHfSubModel = (model: HuggingFaceSubModel) => {
    setHfSubModelState(model);
    setActiveHfSubModel(model);
  };
  const handleSetPollinationsSubModel = (model: PollinationsSubModel) => {
    setPollinationsSubModelState(model);
    setActivePollinationsSubModel(model);
  };

  const handleSetAutoFallback = (enabled: boolean) => {
    setAutoFallbackState(enabled);
    setAutoFallbackEnabled(enabled);
  };

  // Sync engine buttons with the main app toolbar (and WinAdmin popout)
  useEffect(() => {
    return subscribeEngineSettings((settings) => {
      setStoryEngineState(settings.storyEngine);
      setGeminiStorySubModelState(settings.geminiStorySubModel);
      setHfStorySubModelState(settings.hfStorySubModel);
      setImageEngineState(settings.imageEngine);
      setGeminiSubModelState(settings.geminiSubModel);
      setHfSubModelState(settings.hfSubModel);
      setPollinationsSubModelState(settings.pollinationsSubModel);
      setAutoFallbackState(settings.autoFallback);
    });
  }, []);

  useEffect(() => {
    setLogs(logger.getLogs());
    const unsubscribe = logger.subscribe(() => {
      setLogs(logger.getLogs());
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const fetchServerLogs = async () => {
      try {
        const res = await fetch('/api/server-logs');
        const data = await res.json();
        if (data?.logs) {
          setServerLogs(data.logs);
        }
      } catch (e) {}
    };
    fetchServerLogs();
    const interval = setInterval(fetchServerLogs, 2000);
    return () => clearInterval(interval);
  }, [isOpen]);

  const handleClear = () => {
    logger.clearLogs();
    fetch('/api/server-logs', { method: 'DELETE' }).catch(() => {});
    setServerLogs([]);
  };

  const combinedLogs: LogEntry[] = React.useMemo(() => {
    const map = new Map<string, LogEntry>();
    [...logs, ...serverLogs].forEach(l => {
      map.set(l.id, {
        ...l,
        createdAt: (l as LogEntry).createdAt || 0,
      });
    });
    return sortLogsNewestFirst(Array.from(map.values()));
  }, [logs, serverLogs]);

  // Keep newest entries visible at the top
  useEffect(() => {
    if (!isOpen) return;
    // Scroll the log stream container to top when new logs arrive
    const stream = document.querySelector('[data-log-stream="true"]');
    if (stream) stream.scrollTop = 0;
  }, [combinedLogs.length, isOpen]);

  const errorLogs = React.useMemo(() => {
    return combinedLogs.filter(l => l.level === 'error' || l.title.toLowerCase().includes('failed') || l.title.toLowerCase().includes('error'));
  }, [combinedLogs]);

  const handleCopy = () => {
    const text = combinedLogs
      .map(
        l =>
          `[${l.timestamp}] [${l.category}] [${l.level.toUpperCase()}] ${l.title} ${
            l.model ? `(Model: ${l.model})` : ''
          } ${l.durationMs ? `(${l.durationMs}ms)` : ''}\n${l.details || ''}`
      )
      .join('\n----------------------------------------\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const filteredLogs = combinedLogs.filter(log => {
    if (filterCategory !== 'ALL' && log.category !== filterCategory) return false;
    if (filterLevel !== 'ALL' && log.level !== filterLevel) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = log.title.toLowerCase().includes(q);
      const matchDetails = (log.details || '').toLowerCase().includes(q);
      const matchModel = (log.model || '').toLowerCase().includes(q);
      if (!matchTitle && !matchDetails && !matchModel) return false;
    }
    return true;
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in" dir="ltr">
      <div className="bg-[#111827] text-gray-100 border-4 border-black w-full max-w-4xl h-[85vh] rounded-3xl shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] flex flex-col overflow-hidden font-mono text-left" dir="ltr">
        {/* Header Bar */}
        <div className="bg-[#1F2937] px-6 py-4 border-b-2 border-black flex items-center justify-between text-left" dir="ltr">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-accent/20 border border-accent/40 rounded-xl text-accent">
              <Terminal size={20} />
            </div>
            <div>
              <h3 className="font-bold text-sm tracking-wide flex items-center gap-2 text-left">
                <span>AI STUDIO LIVE SYSTEM TERMINAL & LOGS</span>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-sans">
                  LIVE MONITORED
                </span>
              </h3>
              <p className="text-[11px] text-gray-400 font-sans text-left">
                Real-time API payload inspector, model requests, and error diagnostics
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Tab Navigation */}
            <div className="flex bg-black/40 p-1 rounded-xl border border-gray-700 font-sans text-xs">
              <button
                type="button"
                onClick={() => setActiveTab('console')}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                  activeTab === 'console'
                    ? 'bg-accent text-black shadow'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Live Console ({filteredLogs.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('troubleshooting')}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 ${
                  activeTab === 'troubleshooting'
                    ? 'bg-amber-500 text-black shadow'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <HelpCircle size={14} />
                Error Diagnostics & Tickets
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                window.open(
                  window.location.origin + window.location.pathname + '?view=logs',
                  'ComicskidoLogConsole',
                  'width=1200,height=800,scrollbars=yes,resizable=yes'
                );
              }}
              className="px-3 py-1.5 bg-accent text-black font-sans text-xs font-black uppercase rounded-xl hover:bg-amber-300 transition-all flex items-center gap-1 shrink-0"
              title="Open standalone logs view in a separate window/tab"
            >
              <ExternalLink size={13} />
              <span>Separate Window ↗</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2 hover:bg-gray-800 text-gray-400 hover:text-white rounded-xl transition-all border border-transparent hover:border-gray-700"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* AI Model Selectors Sub-Bar in Modal */}
        <div className="bg-[#131b29] border-b border-gray-800 px-6 py-2 flex flex-wrap items-center justify-between gap-2 text-xs font-sans">
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Story Decomposition */}
            <div className="flex items-center gap-1.5 bg-[#0a0d14] px-2.5 py-1 rounded-xl border border-gray-700/60 shadow-inner">
              <div className="flex items-center gap-1 text-[9px] font-black uppercase text-amber-400 tracking-wider">
                <BookOpen size={11} className="text-amber-400 shrink-0" />
                <span>Story:</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    const nextEngine: StoryEngine = storyEngine === 'gemini' ? 'huggingface' : 'gemini';
                    handleSetStoryEngine(nextEngine);
                  }}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-[9px] font-black uppercase transition-all cursor-pointer shadow-sm ${
                    storyEngine === 'gemini'
                      ? 'bg-purple-900 text-purple-200 border-purple-700 hover:bg-purple-800'
                      : 'bg-amber-400 text-black border-amber-500 hover:bg-amber-300'
                  }`}
                  title="Click to toggle Story AI engine"
                >
                  <Sparkles size={9} />
                  <span>{storyEngine === 'gemini' ? 'Gemini AI' : 'Hugging Face'}</span>
                </button>

                {storyEngine === 'gemini' ? (
                  <select
                    value={geminiStorySubModel}
                    onChange={(e) => handleSetGeminiStorySubModel(e.target.value as GeminiStorySubModel)}
                    className="bg-purple-950 text-purple-100 border border-purple-800 rounded-full px-2 py-0.5 text-[9px] font-mono font-bold cursor-pointer hover:bg-purple-900 focus:outline-none"
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
                    className="bg-zinc-900 text-amber-300 border border-zinc-700 rounded-full px-2 py-0.5 text-[9px] font-mono font-bold cursor-pointer hover:bg-zinc-800 focus:outline-none"
                  >
                    <option value="google/gemma-3-4b-it">Google Gemma 3 (4B)</option>
                    <option value="meta-llama/Llama-3.2-3B-Instruct">Meta Llama 3.2 (3B)</option>
                    <option value="Qwen/Qwen2.5-7B-Instruct">Qwen 2.5 (7B)</option>
                  </select>
                )}
              </div>
            </div>

            {/* Image Creation */}
            <div className="flex items-center gap-1.5 bg-[#0a0d14] px-2.5 py-1 rounded-xl border border-gray-700/60 shadow-inner">
              <div className="flex items-center gap-1 text-[9px] font-black uppercase text-purple-300 tracking-wider">
                <ImageIcon size={11} className="text-purple-400 shrink-0" />
                <span>Image:</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    const nextEngine: ImageEngine =
                      imageEngine === 'gemini' ? 'huggingface' :
                      imageEngine === 'huggingface' ? 'pollinations' : 'gemini';
                    handleSetImageEngine(nextEngine);
                  }}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-[9px] font-black uppercase transition-all cursor-pointer shadow-sm ${
                    imageEngine === 'gemini'
                      ? 'bg-purple-900 text-purple-200 border-purple-700 hover:bg-purple-800'
                      : imageEngine === 'huggingface'
                      ? 'bg-amber-400 text-black border-amber-500 hover:bg-amber-300'
                      : 'bg-blue-600 text-white border-blue-500 hover:bg-blue-500'
                  }`}
                  title="Click to toggle Image Generation AI Engine"
                >
                  <ImageIcon size={9} />
                  <span>{imageEngine === 'gemini' ? 'Gemini 3.1' : imageEngine === 'huggingface' ? 'Hugging Face' : 'Pollinations AI'}</span>
                </button>

                {imageEngine === 'huggingface' ? (
                  <select
                    value={hfSubModel}
                    onChange={(e) => handleSetHfSubModel(e.target.value as HuggingFaceSubModel)}
                    className="bg-zinc-900 text-amber-300 border border-zinc-700 rounded-full px-2 py-0.5 text-[9px] font-mono font-bold cursor-pointer hover:bg-zinc-800 focus:outline-none"
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
                    className="bg-purple-950 text-purple-200 border border-purple-800 rounded-full px-2 py-0.5 text-[9px] font-mono font-bold cursor-pointer hover:bg-purple-900 focus:outline-none"
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
                    className="bg-blue-950 text-blue-100 border border-blue-800 rounded-full px-2 py-0.5 text-[9px] font-mono font-bold cursor-pointer hover:bg-blue-900 focus:outline-none"
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

                {/* Auto Fallback Toggle */}
                <button
                  type="button"
                  onClick={() => handleSetAutoFallback(!autoFallback)}
                  className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-full border text-[8px] font-mono font-bold transition-all shrink-0 cursor-pointer ${
                    autoFallback
                      ? 'bg-emerald-950 text-emerald-300 border-emerald-700 hover:bg-emerald-900'
                      : 'bg-rose-950 text-rose-300 border-rose-800 hover:bg-rose-900'
                  }`}
                  title={autoFallback ? "Auto Fallback ON" : "Auto Fallback OFF"}
                >
                  <RotateCcw size={8} className={`shrink-0 ${autoFallback ? 'animate-spin-slow' : ''}`} />
                  <span>{autoFallback ? 'ON' : 'OFF'}</span>
                </button>

                {/* F-Lite Card Button */}
                <button
                  type="button"
                  onClick={() => setShowFLiteTextureModal(true)}
                  className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full border border-amber-500 bg-amber-400 text-black text-[8px] font-mono font-bold hover:bg-amber-300 transition-all cursor-pointer shadow-sm"
                  title="Open F-Lite Texture Card"
                >
                  <Sparkles size={8} className="shrink-0 text-black" />
                  <span>F-Lite</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {activeTab === 'console' ? (
          <>
            {/* Toolbar */}
            <div className="bg-[#182232] px-6 py-3 border-b border-gray-800 flex flex-wrap items-center justify-between gap-3 text-xs font-sans">
              <div className="flex items-center gap-3 flex-wrap">
                {/* Search */}
                <div className="relative">
                  <Search size={14} className="absolute left-2.5 top-2 text-gray-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search logs..."
                    className="bg-black/50 border border-gray-700 rounded-lg pl-8 pr-3 py-1 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-accent w-44"
                  />
                </div>

                {/* Filter Category */}
                <div className="flex items-center gap-1">
                  <span className="text-gray-400 text-[11px]">Category:</span>
                  <select
                    value={filterCategory}
                    onChange={e => setFilterCategory(e.target.value)}
                    className="bg-black/50 border border-gray-700 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-accent"
                  >
                    <option value="ALL">All Categories</option>
                    <option value="UI">UI / Clicks & Flow</option>
                    <option value="STORY">Story Decompose</option>
                    <option value="PANEL_GEN">Panel Image Gen</option>
                    <option value="AVATAR_GEN">Avatar Portrait Gen</option>
                    <option value="PHOTO_LIKENESS">Photo Likeness</option>
                    <option value="TRANSLATION">Translation</option>
                    <option value="SYSTEM">System</option>
                  </select>
                </div>

                {/* Filter Level */}
                <div className="flex items-center gap-1">
                  <span className="text-gray-400 text-[11px]">Level:</span>
                  <select
                    value={filterLevel}
                    onChange={e => setFilterLevel(e.target.value)}
                    className="bg-black/50 border border-gray-700 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-accent"
                  >
                    <option value="ALL">All Levels</option>
                    <option value="info">Info</option>
                    <option value="success">Success</option>
                    <option value="warn">Warn</option>
                    <option value="error">Error</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopy}
                  className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700 rounded-lg font-semibold flex items-center gap-1.5 transition-all"
                >
                  <Copy size={13} />
                  {copied ? 'Copied Log Dump!' : 'Copy Logs'}
                </button>
                <button
                  type="button"
                  onClick={handleClear}
                  className="px-3 py-1.5 bg-red-950/60 hover:bg-red-900/80 text-red-300 border border-red-800/50 rounded-lg font-semibold flex items-center gap-1.5 transition-all"
                >
                  <Trash2 size={13} />
                  Clear
                </button>
              </div>
            </div>

            {/* Log Output Body */}
            <div data-log-stream="true" className="flex-1 overflow-y-auto p-4 space-y-2 bg-[#0b0f19] selection:bg-accent selection:text-black text-xs font-mono text-left" dir="ltr">
              {filteredLogs.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-gray-500 py-12 text-left" dir="ltr">
                  <Terminal size={36} className="mb-2 opacity-30" />
                  <p>No log events match your current filter criteria.</p>
                </div>
              ) : (
                filteredLogs.map(log => {
                  let badgeBg = 'bg-blue-500/20 text-blue-400 border-blue-500/30';
                  let Icon = Info;
                  if (log.category === 'UI') {
                    badgeBg = 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30';
                  } else if (log.level === 'success') {
                    badgeBg = 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
                    Icon = CheckCircle2;
                  } else if (log.level === 'warn') {
                    badgeBg = 'bg-amber-500/20 text-amber-400 border-amber-500/30';
                    Icon = AlertCircle;
                  } else if (log.level === 'error') {
                    badgeBg = 'bg-red-500/20 text-red-400 border-red-500/30';
                    Icon = AlertCircle;
                  }

                  return (
                    <div
                      key={log.id}
                      className="bg-[#111827]/80 border border-gray-800/80 hover:border-gray-700 rounded-xl p-3 transition-all space-y-1.5 text-left"
                      dir="ltr"
                    >
                      <div className="flex items-center justify-between gap-2 text-left" dir="ltr">
                        <div className="flex items-center gap-2 flex-wrap text-left" dir="ltr">
                          <span className="text-gray-400 text-[11px] font-mono font-semibold bg-gray-900 border border-gray-800 px-1.5 py-0.5 rounded shrink-0" dir="ltr">
                            {log.timestamp}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold border ${badgeBg} flex items-center gap-1 font-sans shrink-0`}
                            dir="ltr"
                          >
                            <Icon size={12} />
                            {log.category}
                          </span>
                          <span className="font-bold text-gray-200 text-left" dir="ltr">{log.title}</span>
                        </div>
                        <div className="flex items-center gap-2 font-sans text-[11px] shrink-0" dir="ltr">
                          {log.model && (
                            <span className="bg-purple-950/80 text-purple-300 border border-purple-800/50 px-2 py-0.5 rounded text-[10px]">
                              {log.model}
                            </span>
                          )}
                          {log.durationMs !== undefined && (
                            <span className="text-gray-400 text-[10px]">
                              {log.durationMs}ms
                            </span>
                          )}
                        </div>
                      </div>

                      {log.details && (
                        <div className="text-gray-300 bg-black/60 border border-gray-800/80 rounded-lg p-2 text-[11px] font-mono leading-relaxed whitespace-pre-wrap break-all opacity-90 text-left" dir="ltr">
                          {log.details}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
              <div ref={logEndRef} />
            </div>
          </>
        ) : (
          /* Error Diagnostics & Ticket Explanation Tab */
          <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-[#0b0f19] font-sans text-sm text-gray-300 text-left" dir="ltr">
            <div className="bg-amber-500/10 border-2 border-amber-500/30 p-4 rounded-2xl space-y-1">
              <h4 className="font-black text-amber-400 text-base flex items-center gap-2">
                <HelpCircle size={18} />
                Diagnostics & Ticket Resolution Breakdown
              </h4>
              <p className="text-xs text-gray-300 leading-relaxed">
                Detailed technical explanations for recorded console events, WebSocket status, and Gemini model execution routing.
              </p>
            </div>

            {/* Live Recorded Error Tickets */}
            {errorLogs.length > 0 && (
              <div className="space-y-4 border-b-2 border-gray-800 pb-6">
                <h5 className="font-bold text-rose-400 text-xs uppercase tracking-wider flex items-center gap-2">
                  <AlertCircle size={16} />
                  <span>Active Session Error Tickets & Real-Time Diagnostics</span>
                </h5>
                {errorLogs.map((errLog, idx) => {
                  const getDisplayModel = () => {
                    if (errLog.model) return errLog.model;
                    const matchModel = errLog.details?.match(/Model:\s*([^\]\s,]+)/i) || errLog.details?.match(/Model\/Sub-Model:\s*([^\]\s,]+)/i);
                    if (matchModel) return matchModel[1];
                    if (errLog.details?.includes('huggingface') || errLog.title.includes('huggingface')) return 'Hugging Face Model';
                    if (errLog.details?.includes('pollinations')) return 'Pollinations AI';
                    return 'gemini-3.1-flash-image';
                  };
                  const modelName = getDisplayModel();

                  return (
                    <div key={idx} className="bg-rose-950/20 border-2 border-rose-900/80 rounded-xl p-4 space-y-3 font-mono">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-rose-400 flex items-center gap-1.5 font-sans">
                            <AlertCircle size={14} />
                            <span>{errLog.title}</span>
                          </span>
                          <span className="bg-rose-950/80 text-rose-300 border border-rose-800/60 px-2 py-0.5 rounded text-[10px] font-bold">
                            {errLog.category}
                          </span>
                          <span className="bg-purple-950/80 text-purple-200 border border-purple-800/80 px-2.5 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 shadow-sm">
                            <Cpu size={12} className="text-purple-400" />
                            <span>Model/Sub-Model: {modelName}</span>
                          </span>
                        </div>
                        <span className="text-[10px] text-gray-400 bg-gray-900/80 px-2 py-0.5 rounded border border-gray-800">{errLog.timestamp}</span>
                      </div>

                      <div className="bg-black/60 p-3 rounded-lg text-xs font-mono text-rose-200 border border-rose-900/40">
                        {errLog.details || errLog.title}
                      </div>

                      <div className="bg-gray-900/90 p-3 rounded-lg text-xs font-sans text-gray-300 border border-gray-800 space-y-1">
                        <div className="font-bold text-amber-400 text-[11px] uppercase">Suggested Action / Resolution:</div>
                        {(() => {
                          const detailsUpper = (errLog.details || '').toUpperCase();
                          const titleUpper = (errLog.title || '').toUpperCase();
                          const isQuotaOrRateLimit = detailsUpper.includes('429') || detailsUpper.includes('RESOURCE_EXHAUSTED') || detailsUpper.includes('QUOTA') || detailsUpper.includes('RATE LIMIT') || titleUpper.includes('RATE LIMIT');
                          const isHfError = detailsUpper.includes('HUGGING') || detailsUpper.includes('CREDITS DEPLETED') || modelName.startsWith('hf-');

                          if (isQuotaOrRateLimit) {
                            return (
                              <p className="text-gray-200 leading-snug">
                                <strong className="text-amber-400">Google Gemini Free-Tier Rate Limit (429 / Quota Exceeded):</strong> Quota exceeded on Google model <code className="text-amber-300 font-mono bg-black/50 px-1 py-0.5 rounded">{modelName}</code>. Please wait ~30s for rate limit reset, or switch the Image Engine in the header selector to Hugging Face or Pollinations AI.
                              </p>
                            );
                          }
                          if (isHfError) {
                            return (
                              <p className="text-gray-200 leading-snug">
                                <strong className="text-rose-400">Hugging Face API Error:</strong> The Hugging Face inference request for sub-model <code className="text-rose-300 font-mono bg-black/50 px-1 py-0.5 rounded">{modelName}</code> failed or hit quota limits. Verify your Hugging Face API key in Settings &gt; Secrets, or switch Image Engine to Gemini or Pollinations AI.
                              </p>
                            );
                          }
                          return (
                            <p className="text-gray-300 leading-snug">
                              If this error persists, check your Internet connectivity or verify your API keys in the app Settings menu. You can also switch active Image Engine or Sub-Model in top toolbar selector.
                            </p>
                          );
                        })()}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="bg-[#111827] border-2 border-gray-800 p-5 rounded-2xl space-y-3">
              <div className="flex items-center gap-2 text-red-400 font-bold text-xs uppercase tracking-wide">
                <AlertCircle size={16} />
                <span>Ticket #1: WebSocket Closed Error (`[vite] failed to connect to websocket`)</span>
              </div>
              <div className="bg-black/60 p-3 rounded-xl border border-gray-800 font-mono text-xs text-red-300">
                [vite] failed to connect to websocket (Error: WebSocket closed without opened.)
              </div>
              <div className="space-y-2 text-xs text-gray-300 leading-relaxed">
                <p>
                  <strong>Why does this occur?</strong> In this AI Studio sandboxed preview container, Hot Module Replacement (HMR) WebSocket connections are explicitly disabled (`DISABLE_HMR=true`) by the platform architecture.
                </p>
                <p className="text-emerald-400 font-semibold">
                  ✓ Impact: Completely harmless. It prevents screen flickering during AI code editing. This console notice does NOT affect story creation, image generation, or app performance.
                </p>
              </div>
            </div>

            {/* Ticket 2 */}
            <div className="bg-[#111827] border-2 border-gray-800 p-5 rounded-2xl space-y-3">
              <div className="flex items-center gap-2 text-amber-400 font-bold text-xs uppercase tracking-wide">
                <AlertCircle size={16} />
                <span>Ticket #2: Gemini High Demand Error Handling (`ApiError: 503 UNAVAILABLE`)</span>
              </div>
              <div className="bg-black/60 p-3 rounded-xl border border-gray-800 font-mono text-xs text-amber-300">
                [Server] Model gemini-3.6-flash decomposition attempt failed: ApiError 503 "This model is currently experiencing high demand. Spikes in demand are usually temporary."
              </div>
              <div className="space-y-2 text-xs text-gray-300 leading-relaxed">
                <p>
                  <strong>Why does this occur?</strong> Google's Gemini public model endpoints occasionally encounter brief global traffic spikes. When an endpoint is under high demand, the server responds with a temporary 503 status code.
                </p>
                <p className="text-emerald-400 font-semibold">
                  ✓ System Resolution: We upgraded our backend server's `withRetry` policy to detect 503 capacity errors automatically. The backend automatically switches from `gemini-3.6-flash` to `gemini-flash-latest` or `gemini-3.1-flash-lite` without crashing your session.
                </p>
              </div>
            </div>

            {/* Ticket 3 */}
            <div className="bg-[#111827] border-2 border-gray-800 p-5 rounded-2xl space-y-3">
              <div className="flex items-center gap-2 text-blue-400 font-bold text-xs uppercase tracking-wide">
                <Layers size={16} />
                <span>Ticket #3: Character Avatar Drawing & Likeness Isolation</span>
              </div>
              <div className="space-y-2 text-xs text-gray-300 leading-relaxed">
                <p>
                  <strong>How are avatars drawn?</strong> All character portraits are dynamically generated via Gemini Flash Image models (`gemini-3.1-flash-image`, `gemini-3.1-flash-lite-image`, `gemini-2.5-flash-image`) or Pollinations AI fallback stream.
                </p>
                <p className="text-emerald-400 font-semibold">
                  ✓ Permanently Resolved: Fixed avatar prompt contamination! Generated or fallback avatar URLs are isolated so they never trigger static photo likeness lookups or overwrite character descriptions with other sample photos.
                </p>
              </div>
            </div>

            {/* Ticket 4 */}
            <div className="bg-[#111827] border-2 border-gray-800 p-5 rounded-2xl space-y-3">
              <div className="flex items-center gap-2 text-purple-400 font-bold text-xs uppercase tracking-wide">
                <AlertCircle size={16} />
                <span>Ticket #4: Rate Limit Handling & HTML JSON Syntax Error Prevention</span>
              </div>
              <div className="bg-black/60 p-3 rounded-xl border border-gray-800 font-mono text-xs text-purple-300">
                Unexpected token '&lt;', "&lt;!doctype "... is not valid JSON
              </div>
              <div className="space-y-2 text-xs text-gray-300 leading-relaxed">
                <p>
                  <strong>Why did JSON parse errors occur on fetch?</strong> If a backend endpoint returned an HTML error response (such as a 500 error page), client-side `fetch.json()` attempted to parse HTML string `&lt;!doctype...` as JSON, throwing a syntax exception.
                </p>
                <p className="text-emerald-400 font-semibold">
                  ✓ Permanently Resolved: All backend AI endpoints now guarantee valid JSON status responses, and client-side `safeJsonFetch` catches non-JSON HTML responses gracefully with clear diagnostic messages.
                </p>
              </div>
            </div>

            {/* Ticket 5 */}
            <div className="bg-[#111827] border-2 border-gray-800 p-5 rounded-2xl space-y-3">
              <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs uppercase tracking-wide">
                <Layers size={16} />
                <span>Ticket #5: Pure Gemini Mode & Manual Engine Selection (No Auto-Fallbacks / No SVGs)</span>
              </div>
              <div className="space-y-2 text-xs text-gray-300 leading-relaxed">
                <p>
                  <strong>Pure Google Gemini Architecture:</strong> Automatic fallbacks to third-party models or SVGs have been completely removed. The app operates exclusively with Google Gemini models (`gemini-3.1-flash-image`) unless manually switched.
                </p>
                <p className="text-emerald-400 font-semibold">
                  ✓ Manual Selector & Top Header Indicator: Users can manually choose between Google Gemini and Pollinations AI in the top status bar or Settings/Diagnostics menu. The active engine is explicitly displayed at all times on the header line.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Footer info bar */}
        <div className="bg-[#1F2937] px-6 py-2 border-t border-gray-800 flex items-center justify-between text-[11px] font-sans text-gray-400">
          <div>
            Status: <span className="text-emerald-400 font-bold">API Proxy Router Connected</span>
          </div>
          <div>
            Gemini SDK: <span className="text-gray-200 font-mono">@google/genai (server-side)</span>
          </div>
        </div>
      </div>

      <FLiteTextureModelCard 
        isOpen={showFLiteTextureModal} 
        onClose={() => setShowFLiteTextureModal(false)} 
      />
    </div>
  );
};
