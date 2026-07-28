import { Language, PanelLayout, Panel, TokenUsage } from "../types";
import { logger } from "./logger";

export function getStaticLikenessOfUrl(photoUrl: string): string | null {
  if (!photoUrl) return null;
  const url = photoUrl.toLowerCase();
  if (url.includes('photo-1544005313-94ddf0286df2')) {
    return "An 8-year-old girl with long vibrant red-orange hair, fair skin with cute freckles on her nose, large round black-rimmed glasses, and an amber-yellow knitted sweater.";
  }
  if (url.includes('photo-1506794778202-cad84cf45f1d')) {
    return "A 9-year-old active adventurous boy with short messy brown hair, friendly freckles, and a sporty blue hoodie.";
  }
  if (url.includes('photo-1517841905240-472988babdf9')) {
    return "A 7-year-old happy girl with curly dark hair tied in cute double space buns, sparkling dark brown eyes, a wide bright toothy smile, and a pink t-shirt.";
  }
  if (url.includes('photo-1507003211169-0a1dd7228f2d')) {
    return "A 5-year-old toddler boy with short neat blonde hair, highly expressive blue laughing eyes, a joyful giggling expression, and a bright green t-shirt.";
  }
  if (url.includes('photo-1543466835-00a7907e9de1')) {
    return "A fluffy golden-yellow retriever dog with happy floppy ears, a black wet snout, friendly eyes, wearing a neat red neck collar.";
  }
  return null;
}

export function isCharacterChild(description: string, name: string): boolean {
  const descLower = description.toLowerCase();
  const nameLower = name.toLowerCase();

  const childRegex = /\b(child|kid|toddler|baby|infant|chibi|little boy|little girl|young boy|young girl|son|daughter|9 year old|8 year old|7 year old|6 year old|5 year old|4 year old|3 year old)\b/i;
  const adultRegex = /\b(adult|mature|man|woman|gentleman|lady|father|mother|husband|wife|parent|grandpa|grandma|grandmother|grandfather)\b/i;

  let isAChild = childRegex.test(descLower) || childRegex.test(nameLower);

  const ageMatch = descLower.match(/\b(\d+)\s*(years? old|yrs? old|years? of age)\b/i);
  if (ageMatch) {
    const age = parseInt(ageMatch[1], 10);
    if (age < 13) {
      isAChild = true;
    } else {
      return false;
    }
  }

  if (adultRegex.test(descLower) || adultRegex.test(nameLower)) {
    const isExplicitBaby = /\b(baby|toddler|infant)\b/i.test(descLower);
    if (!isExplicitBaby) {
      return false;
    }
  }

  return isAChild;
}

async function safeJsonFetch(url: string, options: RequestInit): Promise<any> {
  let response: Response;
  try {
    response = await fetch(url, options);
  } catch (netErr: any) {
    throw new Error(`Network connection error: ${netErr?.message || 'Server unreachable'}`);
  }

  const text = await response.text();
  let data: any = null;
  try {
    data = JSON.parse(text);
  } catch {
    const trimmed = text.trim();
    if (trimmed.startsWith("<") || trimmed.toLowerCase().includes("<!doctype")) {
      throw new Error(`Server returned HTML (${response.status}). The backend server may be restarting or updating.`);
    }
    if (!response.ok) {
      throw new Error(`Server error (${response.status}): ${text.substring(0, 120)}`);
    }
    throw new Error("Received non-JSON response from server.");
  }

  if (!response.ok) {
    throw new Error(data?.error || `Server error (${response.status})`);
  }

  return data;
}

function formatImagePayloadDetails(imageUrl?: string): string {
  if (!imageUrl) return "No image payload returned";
  if (imageUrl.startsWith("data:")) {
    const kb = Math.round(imageUrl.length / 1024);
    return `Base64 inline image asset (${kb > 0 ? kb + " KB" : imageUrl.length + " bytes"})`;
  }
  if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) {
    return `Hosted image stream URL (${imageUrl.substring(0, 50)}...)`;
  }
  const kb = Math.round(imageUrl.length / 1024);
  return `Image payload (${kb > 0 ? kb + " KB" : imageUrl.length + " bytes"})`;
}

export async function translateToEnglishIfNeeded(text: string): Promise<string> {
  if (!text) return "";
  const hasHebrew = /[\u0590-\u05FF]/.test(text);
  if (!hasHebrew) return text;
  
  const startTime = Date.now();
  logger.addLog({
    category: 'TRANSLATION',
    level: 'info',
    title: 'Translating text to English',
    details: `Input snippet: "${text.substring(0, 60)}..."`,
    model: 'gemini-2.5-flash',
  });

  try {
    const data = await safeJsonFetch("/api/gemini/translate-to-english-if-needed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const duration = Date.now() - startTime;
    logger.addLog({
      category: 'TRANSLATION',
      level: 'success',
      title: 'Translation complete',
      details: `Translated text: "${(data.text || '').substring(0, 60)}..."`,
      durationMs: duration,
      model: 'gemini-2.5-flash',
    });
    return data.text || text;
  } catch (err: any) {
    logger.addLog({
      category: 'TRANSLATION',
      level: 'warn',
      title: 'Translation fallback',
      details: `Failed: ${err.message}. Using original input.`,
      durationMs: Date.now() - startTime,
    });
    console.warn("Client translation proxy fallback to original text:", err);
    return text;
  }
}

export async function describePhotoLikeness(photoUrl: string, name: string): Promise<string> {
  const staticLikeness = getStaticLikenessOfUrl(photoUrl);
  if (staticLikeness) {
    logger.addLog({
      category: 'PHOTO_LIKENESS',
      level: 'info',
      title: `Static photo likeness matched for ${name}`,
      details: staticLikeness,
    });
    return staticLikeness;
  }

  const startTime = Date.now();
  logger.addLog({
    category: 'PHOTO_LIKENESS',
    level: 'info',
    title: `Analyzing uploaded photo likeness for ${name}`,
    details: 'Sending photo payload to server vision model',
    model: 'gemini-2.5-flash',
  });

  try {
    const data = await safeJsonFetch("/api/gemini/describe-photo-likeness", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ photoUrl, name }),
    });
    const duration = Date.now() - startTime;
    logger.addLog({
      category: 'PHOTO_LIKENESS',
      level: 'success',
      title: `Photo likeness generated for ${name}`,
      details: data.text,
      durationMs: duration,
      model: 'gemini-2.5-flash',
    });
    return data.text || "A pleasant face with expressive features.";
  } catch (err: any) {
    logger.addLog({
      category: 'PHOTO_LIKENESS',
      level: 'error',
      title: `Photo likeness analysis failed for ${name}`,
      details: err.message,
      durationMs: Date.now() - startTime,
    });
    console.error("Client photo likeness proxy failed:", err);
    return "A pleasant face with expressive features.";
  }
}

export type ImageEngine = 'gemini' | 'pollinations' | 'huggingface';

export type HuggingFaceSubModel = 
  | 'black-forest-labs/FLUX.1-schnell' 
  | 'black-forest-labs/FLUX.1-dev' 
  | 'ByteDance/SDXL-Lightning' 
  | 'nerijs/pixel-art-xl' 
  | 'stabilityai/stable-diffusion-3.5-large'
  | 'microsoft/Mage-Flow-Turbo'
  | 'krea/Krea-2-Turbo'
  | 'Freepik/F-Lite-Texture'
  | 'prompthero/openjourney-v4';

export type GeminiImageSubModel = 
  | 'gemini-3.1-flash-image'
  | 'gemini-3.1-flash-lite-image'
  | 'gemini-3-pro-image'
  | 'gemini-2.5-flash-image';

export type PollinationsSubModel = 
  // Core & Open-Source Tier
  | 'flux'
  | 'flux-realism'
  | 'flux-anime'
  | 'flux-3d'
  | 'turbo'
  | 'stable-diffusion'
  // Specialized & Custom Aesthetic Tier
  | 'z-image'
  | 'nano-banana'
  | 'nano-banana-pro'
  | 'seedream'
  | 'seedream-4.5'
  | 'grok-imagine'
  | 'nova-canvas'
  // Premium Tier
  | 'gpt-image'
  | 'gpt-image-1.5'
  | 'kontext'
  | 'klein';

export type StoryEngine = 'gemini' | 'huggingface';

export type GeminiStorySubModel = 
  | 'gemini-3.6-flash'
  | 'gemini-3.5-flash'
  | 'gemini-3.1-flash-lite'
  | 'gemini-1.5-flash';

export type HfStorySubModel = 
  | 'google/gemma-3-4b-it'
  | 'meta-llama/Llama-3.2-3B-Instruct'
  | 'Qwen/Qwen2.5-7B-Instruct';

let activeImageEngine: ImageEngine = (typeof localStorage !== 'undefined' && (localStorage.getItem('comicskido_image_engine') as ImageEngine)) || 'gemini';
let activeHfSubModel: HuggingFaceSubModel = (typeof localStorage !== 'undefined' && (localStorage.getItem('comicskido_hf_sub_model') as HuggingFaceSubModel)) || 'black-forest-labs/FLUX.1-schnell';
let activeGeminiSubModel: GeminiImageSubModel = (typeof localStorage !== 'undefined' && (localStorage.getItem('comicskido_gemini_sub_model') as GeminiImageSubModel)) || 'gemini-3.1-flash-image';
let activePollinationsSubModel: PollinationsSubModel = (typeof localStorage !== 'undefined' && (localStorage.getItem('comicskido_pollinations_sub_model') as PollinationsSubModel)) || 'flux';
let autoFallbackEnabled: boolean = typeof localStorage !== 'undefined' ? localStorage.getItem('comicskido_auto_fallback') === 'true' : false;

let activeStoryEngine: StoryEngine = (typeof localStorage !== 'undefined' && (localStorage.getItem('comicskido_story_engine') as StoryEngine)) || 'gemini';
let activeGeminiStorySubModel: GeminiStorySubModel = (typeof localStorage !== 'undefined' && (localStorage.getItem('comicskido_gemini_story_sub_model') as GeminiStorySubModel)) || 'gemini-3.6-flash';
let activeHfStorySubModel: HfStorySubModel = (typeof localStorage !== 'undefined' && (localStorage.getItem('comicskido_hf_story_sub_model') as HfStorySubModel)) || 'google/gemma-3-4b-it';

export function getAutoFallbackEnabled(): boolean {
  return autoFallbackEnabled;
}

export function setAutoFallbackEnabled(enabled: boolean): void {
  autoFallbackEnabled = enabled;
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('comicskido_auto_fallback', enabled ? 'true' : 'false');
  }
}

export function getActiveImageEngine(): ImageEngine {
  return activeImageEngine;
}

export function setActiveImageEngine(engine: ImageEngine): void {
  activeImageEngine = engine;
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('comicskido_image_engine', engine);
  }
}

export function getActiveHfSubModel(): HuggingFaceSubModel {
  return activeHfSubModel;
}

export function setActiveHfSubModel(model: HuggingFaceSubModel): void {
  activeHfSubModel = model;
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('comicskido_hf_sub_model', model);
  }
}

export function getActiveGeminiSubModel(): GeminiImageSubModel {
  return activeGeminiSubModel;
}

export function setActiveGeminiSubModel(model: GeminiImageSubModel): void {
  activeGeminiSubModel = model;
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('comicskido_gemini_sub_model', model);
  }
}

export function getActivePollinationsSubModel(): PollinationsSubModel {
  return activePollinationsSubModel;
}

export function setActivePollinationsSubModel(model: PollinationsSubModel): void {
  activePollinationsSubModel = model;
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('comicskido_pollinations_sub_model', model);
  }
}

export function getActiveStoryEngine(): StoryEngine {
  return activeStoryEngine;
}

export function setActiveStoryEngine(engine: StoryEngine): void {
  activeStoryEngine = engine;
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('comicskido_story_engine', engine);
  }
}

export function getActiveGeminiStorySubModel(): GeminiStorySubModel {
  return activeGeminiStorySubModel;
}

export function setActiveGeminiStorySubModel(model: GeminiStorySubModel): void {
  activeGeminiStorySubModel = model;
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('comicskido_gemini_story_sub_model', model);
  }
}

export function getActiveHfStorySubModel(): HfStorySubModel {
  return activeHfStorySubModel;
}

export function setActiveHfStorySubModel(model: HfStorySubModel): void {
  activeHfStorySubModel = model;
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('comicskido_hf_story_sub_model', model);
  }
}

export async function generatePanelImage(
  prompt: string, 
  artStyle: string = "vibrant", 
  engine?: ImageEngine,
  hfSubModel?: HuggingFaceSubModel,
  geminiSubModel?: GeminiImageSubModel,
  pollinationsSubModel?: PollinationsSubModel,
  allowAutoFallback?: boolean
): Promise<string> {
  const selectedEngine = engine || getActiveImageEngine();
  const selectedHfModel = hfSubModel || getActiveHfSubModel();
  const selectedGeminiModel = geminiSubModel || getActiveGeminiSubModel();
  const selectedPollinationsModel = pollinationsSubModel || getActivePollinationsSubModel();
  const fallbackFlag = allowAutoFallback ?? getAutoFallbackEnabled();
  const startTime = Date.now();
  const targetModelName = selectedEngine === 'huggingface' ? `hf-${selectedHfModel}` : selectedEngine === 'pollinations' ? `pollinations-${selectedPollinationsModel}` : selectedGeminiModel;

  logger.addLog({
    category: 'PANEL_GEN',
    level: 'info',
    title: 'Requesting Panel Comic Illustration',
    details: `Prompt: "${prompt.substring(0, 80)}..." [Engine: ${selectedEngine}, Model: ${targetModelName}, AutoFallback: ${fallbackFlag ? 'ON' : 'OFF'}]`,
    model: targetModelName,
  });

  try {
    const data = await safeJsonFetch("/api/gemini/generate-panel-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        prompt, 
        artStyle, 
        imageEngine: selectedEngine, 
        hfModel: selectedHfModel,
        geminiModel: selectedGeminiModel,
        pollinationsModel: selectedPollinationsModel,
        allowAutoFallback: fallbackFlag
      }),
    });
    const duration = Date.now() - startTime;
    const actualModel = data.modelUsed || targetModelName;

    logger.addLog({
      category: 'PANEL_GEN',
      level: 'success',
      title: 'Panel Comic Illustration Generated',
      details: formatImagePayloadDetails(data.imageUrl),
      durationMs: duration,
      model: actualModel,
    });
    return data.imageUrl;
  } catch (err: any) {
    const duration = Date.now() - startTime;
    logger.addLog({
      category: 'PANEL_GEN',
      level: 'error',
      title: 'Panel Illustration Failed',
      details: err.message || 'Panel generation failed',
      durationMs: duration,
      model: targetModelName,
    });
    console.error("Panel image generation failed:", err);
    throw err;
  }
}

export async function generateCharacterImage(
  name: string, 
  description: string, 
  artStyle: string = "vibrant", 
  engine?: ImageEngine,
  hfSubModel?: HuggingFaceSubModel,
  geminiSubModel?: GeminiImageSubModel,
  pollinationsSubModel?: PollinationsSubModel,
  allowAutoFallback?: boolean
): Promise<string> {
  const selectedEngine = engine || getActiveImageEngine();
  const selectedHfModel = hfSubModel || getActiveHfSubModel();
  const selectedGeminiModel = geminiSubModel || getActiveGeminiSubModel();
  const selectedPollinationsModel = pollinationsSubModel || getActivePollinationsSubModel();
  const fallbackFlag = allowAutoFallback ?? getAutoFallbackEnabled();
  const startTime = Date.now();
  const targetModelName = selectedEngine === 'huggingface' ? `hf-${selectedHfModel}` : selectedEngine === 'pollinations' ? `pollinations-${selectedPollinationsModel}` : selectedGeminiModel;

  logger.addLog({
    category: 'AVATAR_GEN',
    level: 'info',
    title: `Generating Character Avatar Portrait for '${name}'`,
    details: `Description: "${description.substring(0, 80)}..." [Engine: ${selectedEngine}, Model: ${targetModelName}, AutoFallback: ${fallbackFlag ? 'ON' : 'OFF'}]`,
    model: targetModelName,
  });

  try {
    const data = await safeJsonFetch("/api/gemini/generate-character-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        name, 
        description, 
        artStyle, 
        imageEngine: selectedEngine, 
        hfModel: selectedHfModel,
        geminiModel: selectedGeminiModel,
        pollinationsModel: selectedPollinationsModel,
        allowAutoFallback: fallbackFlag
      }),
    });
    const duration = Date.now() - startTime;
    const actualModel = data.modelUsed || targetModelName;

    logger.addLog({
      category: 'AVATAR_GEN',
      level: 'success',
      title: `Avatar Portrait Rendered for '${name}'`,
      details: formatImagePayloadDetails(data.imageUrl),
      durationMs: duration,
      model: actualModel,
    });
    return data.imageUrl;
  } catch (err: any) {
    const duration = Date.now() - startTime;
    logger.addLog({
      category: 'AVATAR_GEN',
      level: 'error',
      title: `Avatar Generation Failed for '${name}'`,
      details: err.message || 'Avatar generation failed',
      durationMs: duration,
      model: targetModelName,
    });
    console.error("Character avatar generation failed:", err);
    throw err;
  }
}

export async function decomposeStory(
  storyText: string,
  language: Language,
  layout: PanelLayout,
  characters: { name: string; role: string; description: string; photoUrls?: string[]; visualPrompt?: string }[],
  storyEngine?: StoryEngine,
  storyModel?: string
): Promise<{ title: string; panels: Panel[]; characterVisuals?: { name: string; visualPrompt: string }[]; usage?: TokenUsage; modelUsed: string }> {
  const selectedEngine = storyEngine || getActiveStoryEngine();
  const selectedModel = storyModel || (selectedEngine === 'huggingface' ? getActiveHfStorySubModel() : getActiveGeminiStorySubModel());
  const startTime = Date.now();
  logger.addLog({
    category: 'STORY',
    level: 'info',
    title: 'Decomposing Story into Comic Storyboard',
    details: `Story snippet: "${storyText.substring(0, 70)}..." (${layout} panels, lang: ${language}) [Engine: ${selectedEngine}, Model: ${selectedModel}]`,
    model: selectedModel,
  });

  try {
    const result = await safeJsonFetch("/api/gemini/decompose-story", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        storyText, 
        language, 
        layout, 
        characters,
        storyEngine: selectedEngine,
        storyModel: selectedModel
      }),
    });
    const duration = Date.now() - startTime;
    logger.addLog({
      category: 'STORY',
      level: 'success',
      title: `Story Storyboard Created Successfully`,
      details: `Generated ${result.panels?.length || 0} panel blueprints. Model used: ${result.modelUsed || selectedModel}. Tokens: ${result.usage?.totalTokens || 0}`,
      durationMs: duration,
      model: result.modelUsed || selectedModel,
    });
    return result;
  } catch (err: any) {
    const duration = Date.now() - startTime;
    logger.addLog({
      category: 'STORY',
      level: 'error',
      title: 'Story Decomposition Failed',
      details: err.message || 'Failed to decompose story',
      durationMs: duration,
    });
    console.error("Client decompose story proxy failed:", err);
    throw err;
  }
}

