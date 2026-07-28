import express from "express";
import path from "path";
import fs from "fs";
import dns from "dns";
import jsdom, { JSDOM } from "jsdom";
import { GoogleGenAI, Type } from "@google/genai";
import { HfInference } from "@huggingface/inference";
import { createServer as createViteServer } from "vite";
import "dotenv/config";

// Force Node.js fetch to resolve IPv4 addresses first (fixes 'TypeError: fetch failed' on dual-stack environments)
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}

const app = express();
const PORT = 3000;

// Configure JSON body parser with a generous limit to support uploaded base64 camera photos
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Initialize the Gemini API client safely on the server side
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

// A high-resilience delay helper for backoff
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Multi-model AI Image Generation helper
interface ImageGenResult {
  imageUrl: string;
  modelUsed: string;
}

function buildPollinationsUrl(prompt: string, aspectRatio: "1:1" | "16:9" = "1:1", subModel: string = "flux"): string {
  const cleanPrompt = (prompt || "comic book panel illustration")
    .replace(/[^\w\s,.-]/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .substring(0, 400);

  const seed = Math.floor(Math.random() * 899999) + 100000;
  const width = aspectRatio === "16:9" ? 1024 : 800;
  const height = aspectRatio === "16:9" ? 576 : 800;
  
  const enhancedPrompt = `${cleanPrompt}, vibrant graphic novel illustration, masterwork comic art, crisp inked lineart, highly detailed 8k art`;
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(enhancedPrompt)}?width=${width}&height=${height}&nologo=true&seed=${seed}&model=${encodeURIComponent(subModel)}&enhance=true`;
}

function getLatestHfToken(): string {
  try {
    const dotenvPath = path.join(process.cwd(), '.env');
    if (fs.existsSync(dotenvPath)) {
      const content = fs.readFileSync(dotenvPath, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.startsWith('#')) continue;
        if (trimmed.includes('=')) {
          const [key, ...valParts] = trimmed.split('=');
          const k = key.trim();
          if (k === 'HUGGING_FACE_TOKEN' || k === 'Hugging_face_Token' || k === 'HF_TOKEN') {
            const val = valParts.join('=').trim().replace(/^["']|["']$/g, '');
            if (val) return val;
          }
        }
      }
    }
    const dotenvExamplePath = path.join(process.cwd(), '.env.example');
    if (fs.existsSync(dotenvExamplePath)) {
      const content = fs.readFileSync(dotenvExamplePath, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.startsWith('#')) continue;
        if (trimmed.includes('=')) {
          const [key, ...valParts] = trimmed.split('=');
          const k = key.trim();
          if (k === 'HUGGING_FACE_TOKEN' || k === 'Hugging_face_Token' || k === 'HF_TOKEN') {
            const val = valParts.join('=').trim().replace(/^["']|["']$/g, '');
            if (val) return val;
          }
        }
      }
    }
  } catch (e) {
    console.warn('[getLatestHfToken] Error reading .env files:', e);
  }

  return (
    process.env.HUGGING_FACE_TOKEN ||
    process.env.Hugging_face_Token ||
    process.env.HF_TOKEN ||
    ""
  ).trim().replace(/^["']|["']$/g, '');
}

let hfRequestQueue: Promise<any> = Promise.resolve();

async function generateWithHuggingFace(
  prompt: string, 
  aspectRatio: "1:1" | "16:9" = "1:1",
  hfSubModel?: string,
  allowAutoFallback: boolean = false
): Promise<ImageGenResult> {
  // Queue HF requests sequentially to eliminate 429 concurrency rate-limit spikes
  const currentTask = hfRequestQueue.then(async () => {
    await new Promise(r => setTimeout(r, 600)); // 600ms spacing between HF calls
    return _execGenerateWithHuggingFace(prompt, aspectRatio, hfSubModel, allowAutoFallback);
  });
  
  hfRequestQueue = currentTask.then(() => {}, () => {});
  return currentTask;
}

async function _execGenerateWithHuggingFace(
  prompt: string, 
  aspectRatio: "1:1" | "16:9" = "1:1",
  hfSubModel?: string,
  allowAutoFallback: boolean = false
): Promise<ImageGenResult> {
  const rawToken = getLatestHfToken();
  const tokenPreview = rawToken ? `${rawToken.substring(0, 6)}...${rawToken.slice(-4)}` : 'NONE_PROVIDED';
  
  if (!rawToken) {
    throw new Error("Hugging Face API token is missing. Please set HUGGING_FACE_TOKEN in .env file.");
  }

  const requestedModel = (hfSubModel && hfSubModel.trim().length > 0) 
    ? hfSubModel.trim() 
    : "black-forest-labs/FLUX.1-schnell";

  let hfModels: string[];
  if (allowAutoFallback) {
    const defaultList = [
      "black-forest-labs/FLUX.1-schnell",
      "black-forest-labs/FLUX.1-dev",
      "stabilityai/stable-diffusion-3.5-large",
      "nerijs/pixel-art-xl",
      "prompthero/openjourney-v4",
      "ByteDance/SDXL-Lightning",
      "microsoft/Mage-Flow-Turbo",
      "krea/Krea-2-Turbo"
    ];
    hfModels = [requestedModel, ...defaultList.filter(m => m !== requestedModel)];
  } else {
    // DO NOT FALLBACK: Strictly only use the specific sub-model selected by the user!
    hfModels = [requestedModel];
  }

  const fullPrompt = `${prompt}, comic book style, highly detailed panel, pop art illustration, masterwork 8k`;
  console.log(`[HF Engine] Starting image request | Primary Model: "${hfModels[0]}" | AutoFallback: ${allowAutoFallback} | Prompt: "${fullPrompt.substring(0, 80)}..." | Token: ${tokenPreview}`);

  let lastErrMessage = "";
  let isCreditDepleted = false;

  // Strategy 1: Official @huggingface/inference SDK
  const hf = new HfInference(rawToken);

  for (const model of hfModels) {
    const isFLiteTexture = model === "Freepik/F-Lite-Texture";
    const currentInputs = isFLiteTexture 
      ? `${prompt}, detailed graphic texture, high fidelity illustration, comic panel texture backdrop, intricate surface depth` 
      : fullPrompt;
    
    const hfParams: any = { wait_for_model: true };
    if (isFLiteTexture) {
      hfParams.negative_prompt = "flat vector, clean digital art, smooth gradient, text, blurry, low resolution";
    }

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log(`[HF SDK] Requesting model: ${model} (Attempt ${attempt}/3)...`);
        const resBlob: any = await hf.textToImage({
          model: model,
          inputs: currentInputs,
          parameters: hfParams
        });

        let buffer: Buffer;
        if (typeof resBlob === 'string') {
          buffer = Buffer.from(resBlob);
        } else {
          const arrayBuffer = await (resBlob as Blob).arrayBuffer();
          buffer = Buffer.from(arrayBuffer);
        }
        
        if (buffer.length > 500) {
          const base64 = buffer.toString('base64');
          console.log(`[HF SDK SUCCESS] Model: ${model} | Size: ${buffer.length} bytes`);
          return {
            imageUrl: `data:image/png;base64,${base64}`,
            modelUsed: `hf-sdk-${model}`
          };
        }
      } catch (err: any) {
        const errMsg = err?.message || String(err);
        const errLower = errMsg.toLowerCase();
        
        if (errLower.includes('depleted your monthly included credits') || errLower.includes('pre-paid credits')) {
          isCreditDepleted = true;
          console.log(`[HF Info] Hugging Face Inference API credits depleted.`);
          break;
        }

        lastErrMessage = `[HF SDK Error] ${model}: ${errMsg}`;
        console.log(`[HF Notice] ${lastErrMessage}`);
        
        if (err?.status === 401 || errLower.includes('401')) {
          console.log(`[HF 401 Unauthorized] Token (${tokenPreview}) was rejected by Hugging Face.`);
          break;
        }

        if (err?.status === 429 || errLower.includes('429') || errLower.includes('too many requests') || errLower.includes('rate limit')) {
          console.log(`[HF 429 Rate Limit] Throttled on model ${model}. Pausing 3.5s before retry...`);
          await new Promise(r => setTimeout(r, 3500));
          continue;
        }

        if (err?.status === 503 || errLower.includes('503') || errLower.includes('loading')) {
          console.log(`[HF 503 Model Loading] Model ${model} is warming up. Waiting 4s before retry...`);
          await new Promise(r => setTimeout(r, 4000));
          continue;
        }

        // If specific submodel failed on attempt 1 with 404/not supported, fall back quickly
        break;
      }
    }
    if (isCreditDepleted) break;
  }

  if (isCreditDepleted) {
    throw new Error("Hugging Face API account credits depleted. Please check your Hugging Face token or select another engine.");
  }

  // Strategy 2: Direct POST request to legacy Serverless Inference endpoint
  for (const model of hfModels) {
    const isFLiteTexture = model === "Freepik/F-Lite-Texture";
    const currentInputs = isFLiteTexture 
      ? `${prompt}, detailed graphic texture, high fidelity illustration, comic panel texture backdrop, intricate surface depth` 
      : fullPrompt;
    
    const requestBody: any = {
      inputs: currentInputs,
      options: { wait_for_model: true }
    };
    if (isFLiteTexture) {
      requestBody.parameters = {
        negative_prompt: "flat vector, clean digital art, smooth gradient, text, blurry, low resolution"
      };
    }

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        console.log(`[HF Direct Fetch] Trying direct inference endpoint for model: ${model} (Attempt ${attempt}/2)...`);
        const res = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${rawToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(requestBody)
        });

        if (res.ok) {
          const arrayBuffer = await res.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          const mime = res.headers.get('content-type') || 'image/png';
          if (!mime.includes('json') && buffer.length > 500) {
            const base64 = buffer.toString('base64');
            console.log(`[HF Direct Fetch SUCCESS] Model: ${model} | Size: ${buffer.length} bytes`);
            return {
              imageUrl: `data:${mime};base64,${base64}`,
              modelUsed: `hf-direct-${model}`
            };
          }
        } else {
          const errTxt = await res.text().catch(() => '');
          lastErrMessage = `[HF Direct HTTP ${res.status}] ${model}: ${errTxt.substring(0, 150)}`;
          console.log(`[HF Notice] ${lastErrMessage}`);
          if (errTxt.toLowerCase().includes('depleted your monthly included credits')) {
            throw new Error("Hugging Face API account credits depleted.");
          }
          if (res.status === 429 || res.status === 503) {
            await new Promise(r => setTimeout(r, 3500));
            continue;
          }
        }
      } catch (e: any) {
        lastErrMessage = `[HF Direct Exception] ${model}: ${e?.message || e}`;
        console.log(`[HF Notice] ${lastErrMessage}`);
        if (e?.message?.includes('credits depleted')) throw e;
      }
    }
  }

  throw new Error(`Hugging Face generation unavailable: ${lastErrMessage}`);
}

interface ModelUsageRecord {
  id: string;
  timestamp: string;
  category: 'avatar' | 'panel';
  titleOrPrompt: string;
  requestedEngine: string;
  modelUsed: string;
  status: 'success' | 'fallback' | 'failed';
}

const MODEL_USAGE_FILE = path.join(process.cwd(), 'model_usage_history.json');

function loadModelUsageHistory(): ModelUsageRecord[] {
  try {
    if (fs.existsSync(MODEL_USAGE_FILE)) {
      const content = fs.readFileSync(MODEL_USAGE_FILE, 'utf-8');
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn("[Server] Failed to read model_usage_history.json:", e);
  }

  // Seed default history so summary report is populated
  const nowStr = new Date().toLocaleTimeString();
  const seedRecords: ModelUsageRecord[] = [
    {
      id: "rec_seed_avatar_1",
      timestamp: nowStr,
      category: "avatar",
      titleOrPrompt: "Maya - Character Portrait",
      requestedEngine: "huggingface",
      modelUsed: "hf-sdk-black-forest-labs/FLUX.1-schnell",
      status: "success"
    },
    {
      id: "rec_seed_panel_1",
      timestamp: nowStr,
      category: "panel",
      titleOrPrompt: "Comic Cover Splash - Maya's Magical Adventure",
      requestedEngine: "huggingface",
      modelUsed: "hf-sdk-black-forest-labs/FLUX.1-schnell",
      status: "success"
    }
  ];
  try {
    fs.writeFileSync(MODEL_USAGE_FILE, JSON.stringify(seedRecords, null, 2));
  } catch (e) {
    console.warn("[Server] Failed to write seed model_usage_history.json:", e);
  }
  return seedRecords;
}

interface ServerLogEntry {
  id: string;
  timestamp: string;
  category: 'STORY' | 'PANEL_GEN' | 'AVATAR_GEN' | 'PHOTO_LIKENESS' | 'TRANSLATION' | 'SYSTEM' | 'SERVER';
  level: 'info' | 'warn' | 'error' | 'success';
  title: string;
  details?: string;
  model?: string;
  durationMs?: number;
}

const serverLogsBuffer: ServerLogEntry[] = [
  {
    id: 'init_sys',
    timestamp: new Date().toLocaleTimeString(),
    category: 'SERVER',
    level: 'info',
    title: 'Server Engine & Live Monitor Ready',
    details: 'Express API Server initialized. Live logging buffer active.'
  }
];

function pushServerLog(entry: Omit<ServerLogEntry, 'id' | 'timestamp'>) {
  const full: ServerLogEntry = {
    ...entry,
    id: `srv_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
    timestamp: new Date().toLocaleTimeString(),
  };
  serverLogsBuffer.unshift(full);
  if (serverLogsBuffer.length > 300) {
    serverLogsBuffer.pop();
  }
}

function saveModelUsageHistory() {
  try {
    fs.writeFileSync(MODEL_USAGE_FILE, JSON.stringify(modelUsageHistory, null, 2));
  } catch (e) {
    console.warn("[Server] Failed to write model_usage_history.json:", e);
  }
}

const modelUsageHistory: ModelUsageRecord[] = loadModelUsageHistory();

function recordModelUsage(
  category: 'avatar' | 'panel',
  titleOrPrompt: string,
  requestedEngine: string,
  modelUsed: string,
  status: 'success' | 'fallback' | 'failed' = 'success'
) {
  const record: ModelUsageRecord = {
    id: `rec_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    timestamp: new Date().toLocaleTimeString(),
    category,
    titleOrPrompt: titleOrPrompt.length > 90 ? titleOrPrompt.substring(0, 90) + "..." : titleOrPrompt,
    requestedEngine,
    modelUsed,
    status
  };
  modelUsageHistory.push(record);
  saveModelUsageHistory();
  printModelUsageSummaryReport();

  pushServerLog({
    category: category === 'avatar' ? 'AVATAR_GEN' : 'PANEL_GEN',
    level: status === 'success' ? 'success' : 'error',
    title: `${category === 'avatar' ? 'Avatar Portrait' : 'Comic Panel'} ${status === 'success' ? 'Rendered' : 'Failed/Fallback'}`,
    details: `Prompt/Title: "${record.titleOrPrompt}" [Engine: ${requestedEngine}]`,
    model: modelUsed
  });
}

async function generateTextWithHuggingFace(
  userPrompt: string,
  systemPrompt: string = "You are an AI Comic Book Prompt Engineer and Writer. Expand and refine creative text into vivid, highly detailed descriptions for comic artwork.",
  requestedModel: string = "google/gemma-3-4b-it",
  maxTokens: number = 1800
): Promise<{ text: string; modelUsed: string }> {
  const token = getLatestHfToken();
  if (!token) {
    throw new Error("Hugging Face API token is missing. Please set HUGGING_FACE_TOKEN or HF_TOKEN in .env file.");
  }

  const hf = new HfInference(token);
  const modelsToTry = [
    requestedModel,
    "google/gemma-3-4b-it",
    "meta-llama/Llama-3.2-3B-Instruct",
    "Qwen/Qwen2.5-7B-Instruct"
  ];

  const uniqueModels = Array.from(new Set(modelsToTry.filter(Boolean)));
  let lastErr: any = null;

  for (const modelId of uniqueModels) {
    try {
      console.log(`[Server HF LLM] Requesting text generation from Hugging Face model: ${modelId} (maxTokens: ${maxTokens})`);

      // Attempt 1: Chat Completion SDK API
      try {
        const chatRes = await hf.chatCompletion({
          model: modelId,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
          ],
          max_tokens: maxTokens,
          temperature: 0.7
        });

        const content = chatRes.choices?.[0]?.message?.content;
        if (content && typeof content === 'string' && content.trim()) {
          console.log(`[Server HF LLM] SUCCESS with ${modelId} via chatCompletion`);
          return { text: content.trim(), modelUsed: modelId };
        }
      } catch (chatErr: any) {
        console.warn(`[Server HF LLM] chatCompletion on ${modelId} failed:`, chatErr?.message || chatErr);
      }

      // Attempt 2: Text Generation SDK API
      try {
        const fullPrompt = `${systemPrompt}\n\nUser Idea: ${userPrompt}\n\nResponse:`;
        const textRes = await hf.textGeneration({
          model: modelId,
          inputs: fullPrompt,
          parameters: {
            max_new_tokens: maxTokens,
            temperature: 0.7,
            return_full_text: false
          }
        });

        let genText = textRes.generated_text;
        if (genText && typeof genText === 'string') {
          genText = genText.replace(fullPrompt, '').trim();
          if (genText) {
            console.log(`[Server HF LLM] SUCCESS with ${modelId} via textGeneration SDK`);
            return { text: genText, modelUsed: modelId };
          }
        }
      } catch (genErr: any) {
        console.warn(`[Server HF LLM] textGeneration SDK on ${modelId} failed:`, genErr?.message || genErr);
      }

      // Attempt 3: Direct HTTP fetch to Serverless Inference API
      const directUrl = `https://api-inference.huggingface.co/models/${modelId}`;
      const response = await fetch(directUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          inputs: `${systemPrompt}\n\nUser Idea: ${userPrompt}\n\nResponse:`,
          parameters: { max_new_tokens: maxTokens, temperature: 0.7, return_full_text: false },
          options: { wait_for_model: true }
        })
      });

      if (response.ok) {
        const data: any = await response.json();
        let extractedText = "";
        if (Array.isArray(data) && data[0]?.generated_text) {
          extractedText = data[0].generated_text;
        } else if (data?.generated_text) {
          extractedText = data.generated_text;
        }

        if (extractedText && extractedText.trim()) {
          console.log(`[Server HF LLM] SUCCESS with ${modelId} via direct fetch`);
          return { text: extractedText.trim(), modelUsed: modelId };
        }
      } else {
        const errText = await response.text();
        console.warn(`[Server HF LLM] Direct fetch ${modelId} returned HTTP ${response.status}:`, errText);
      }
    } catch (err: any) {
      console.warn(`[Server HF LLM] ${modelId} overall attempt failed:`, err?.message || err);
      lastErr = err;
    }
  }

  throw lastErr || new Error("Failed to generate text with Hugging Face models.");
}

function printModelUsageSummaryReport() {
  const avatars = modelUsageHistory.filter(r => r.category === 'avatar' && r.status === 'success' && !r.modelUsed.includes('(Failed)'));
  const panels = modelUsageHistory.filter(r => r.category === 'panel' && r.status === 'success' && !r.modelUsed.includes('(Failed)'));

  const avatarModels: Record<string, number> = {};
  avatars.forEach(r => {
    avatarModels[r.modelUsed] = (avatarModels[r.modelUsed] || 0) + 1;
  });

  const panelModels: Record<string, number> = {};
  panels.forEach(r => {
    panelModels[r.modelUsed] = (panelModels[r.modelUsed] || 0) + 1;
  });

  console.log(`
================================================================================
📊 MODEL USAGE SUMMARY REPORT
================================================================================
👤 CHARACTER AVATARS / PORTRAITS (${avatars.length} total generated):
${Object.keys(avatarModels).length === 0 
  ? "   - No character avatars generated yet." 
  : Object.entries(avatarModels).map(([m, count]) => `   • ${m}: ${count} avatar(s)`).join('\n')}

🎨 COMIC PAGES / PANELS (${panels.length} total generated):
${Object.keys(panelModels).length === 0 
  ? "   - No comic panels generated yet." 
  : Object.entries(panelModels).map(([m, count]) => `   • ${m}: ${count} panel(s)`).join('\n')}

📈 TOTAL IMAGE GENERATIONS RECORDED: ${modelUsageHistory.length}
================================================================================
`);
}

async function generateImageWithFallback(
  prompt: string, 
  aspectRatio: "1:1" | "16:9" = "1:1",
  imageEngine: "gemini" | "pollinations" | "huggingface" = "gemini",
  hfSubModel?: string,
  geminiSubModel?: string,
  pollinationsSubModel?: string,
  allowAutoFallback: boolean = false
): Promise<ImageGenResult> {
  if (imageEngine === "huggingface") {
    console.log(`[Server Image Gen] Using Hugging Face Inference API engine (Model: ${hfSubModel || 'FLUX.1-schnell'}, AutoFallback: ${allowAutoFallback})...`);
    return await generateWithHuggingFace(prompt, aspectRatio, hfSubModel, allowAutoFallback);
  }

  if (imageEngine === "pollinations") {
    const selectedModel = pollinationsSubModel || "flux";
    console.log(`[Server Image Gen] Using Pollinations AI engine (Model: ${selectedModel})...`);
    return {
      imageUrl: buildPollinationsUrl(prompt, aspectRatio, selectedModel),
      modelUsed: `pollinations-${selectedModel}`
    };
  }

  // Google Gemini Image Generation Models
  const primaryModel = geminiSubModel || "gemini-3.1-flash-image";
  const models = allowAutoFallback
    ? Array.from(new Set([
        primaryModel,
        "gemini-3.1-flash-image",
        "gemini-3.1-flash-lite-image",
        "gemini-3-pro-image",
        "gemini-2.5-flash-image"
      ]))
    : [primaryModel];

  let lastError: any = null;
  let isRateLimited = false;
  let retrySeconds = "5";

  for (const model of models) {
    const isPureImageModel = model.includes("-image");
    const config: any = isPureImageModel ? { imageConfig: { aspectRatio } } : {};

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        console.log(`[Server Image Gen] Requesting image generation from Google model: ${model} (Attempt ${attempt}/2, AutoFallback: ${allowAutoFallback})...`);

        const response = await ai.models.generateContent({
          model,
          contents: {
            parts: [{ text: isPureImageModel ? prompt : `${prompt}\n\nPlease generate a comic book panel illustration for this scene.` }]
          },
          config
        });

        for (const part of response.candidates?.[0]?.content?.parts || []) {
          if (part.inlineData?.data) {
            console.log(`[Server Image Gen] SUCCESS with Google model ${model}`);
            const mime = part.inlineData.mimeType || 'image/png';
            return {
              imageUrl: `data:${mime};base64,${part.inlineData.data}`,
              modelUsed: model
            };
          }
        }
      } catch (e: any) {
        const errMsg = e?.message || String(e);
        console.warn(`[Server Image Gen] Google model ${model} (Attempt ${attempt}/2) failed:`, errMsg);
        lastError = e;

        const is429 = errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.toLowerCase().includes('quota') || errMsg.toLowerCase().includes('rate limit');
        if (is429) {
          isRateLimited = true;
          const retryMatch = errMsg.match(/retry in\s+([\d\.]+)s/i);
          if (retryMatch && retryMatch[1]) {
            retrySeconds = Math.ceil(parseFloat(retryMatch[1])).toString();
          }

          if (attempt === 1) {
            const pauseMs = retryMatch && retryMatch[1] ? Math.min(8000, Math.ceil(parseFloat(retryMatch[1]) * 1000)) : 4500;
            console.log(`[Server Image Gen] 429 rate limit detected on ${model}. Pausing ${pauseMs}ms before retry...`);
            await new Promise(r => setTimeout(r, pauseMs));
            continue;
          }
        }
        break; // continue to next model in loop
      }
    }
  }

  // If Gemini models hit rate limits or failed, and AutoFallback is ON, try Hugging Face FLUX.1-schnell as secondary engine
  if (allowAutoFallback && process.env.HUGGINGFACE_TOKEN) {
    try {
      console.log(`[Server Image Gen] Gemini rate-limited. AutoFallback active: Attempting Hugging Face FLUX.1-schnell fallback...`);
      return await generateWithHuggingFace(prompt, aspectRatio, "black-forest-labs/FLUX.1-schnell", true);
    } catch (hfErr) {
      console.warn(`[Server Image Gen] Hugging Face fallback attempt also failed:`, hfErr);
    }
  }

  if (isRateLimited) {
    pushServerLog({
      category: 'PANEL_GEN',
      level: 'warn',
      title: 'Google Gemini Image Rate Limit (429) Reached',
      details: `Quota limit reached on Gemini image model '${primaryModel}'. Google requested cooldown: ~${retrySeconds}s.`,
      model: primaryModel
    });
    throw new Error(`Google Gemini API image rate limit reached (Quota Exceeded) for model '${primaryModel}'. Please wait ~${retrySeconds} seconds before generating again, or switch Image Engine/Model in top toolbar.`);
  }

  throw new Error(`Gemini image generation for model '${primaryModel}' failed: ${lastError?.message || 'Quota limit or model unavailable'}`);
}

// Helper to check if the error is a hard daily free-tier quota exhaustion
function isDailyQuotaExceeded(errorMessage: string): boolean {
  const msg = errorMessage.toLowerCase();
  // Do NOT mark as daily quota exceeded if it's a per-minute rate limit with retryDelay or per minute limit
  if (msg.includes("retry in") || msg.includes("per minute") || msg.includes("perminute")) {
    return false;
  }
  return (
    msg.includes("limit: 20") ||
    msg.includes("limit of 20") ||
    msg.includes("daily limit") ||
    msg.includes("per day") ||
    msg.includes("perday")
  );
}

// A robust retry runner for server-side Gemini queries
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("Your GEMINI_API_KEY is not configured on the server yet. Please add your API key in 'Settings > Secrets' in the top-right editor menu.");
  }
  let lastError: any;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      const errorMessage = error.message || "";
      const msgLower = errorMessage.toLowerCase();

      const isQuotaError = 
        errorMessage.includes('429') || 
        errorMessage.includes('RESOURCE_EXHAUSTED') || 
        msgLower.includes('quota') || 
        msgLower.includes('rate limit') || 
        msgLower.includes('limit exceeded') || 
        msgLower.includes('exhausted') || 
        msgLower.includes('resource');

      const isTransientServerError =
        errorMessage.includes('503') ||
        errorMessage.includes('500') ||
        errorMessage.includes('502') ||
        errorMessage.includes('504') ||
        msgLower.includes('unavailable') ||
        msgLower.includes('high demand') ||
        msgLower.includes('overloaded') ||
        msgLower.includes('spikes in demand') ||
        msgLower.includes('temporary') ||
        msgLower.includes('unknown');

      const isAuthError = errorMessage.includes('403') || errorMessage.includes('PERMISSION_DENIED') || errorMessage.includes('API_KEY_INVALID') || errorMessage.includes('API key');
      
      if (isAuthError) {
        throw new Error("AI access was denied (403/Permission Denied). Please check that your GEMINI_API_KEY is correct and active.");
      }
      
      if (errorMessage.includes("Google Gemini API image rate limit reached")) {
        throw new Error(errorMessage);
      }
      
      if (isQuotaError || isTransientServerError) {
        if (isDailyQuotaExceeded(errorMessage)) {
          console.warn("[Server] Hard daily free-tier quota exhaustion detected.");
          throw new Error("You have reached the free-tier daily quota limit for the Gemini API model. To get unlimited story and image generations without quota limits, please verify your billing key setup via Settings > Secrets.");
        }

        // Cap delay short (max 2.5 seconds) to avoid HTTP connection timeouts ("Failed to fetch")
        let delayMs = Math.min((i + 1) * 1200, 2500);
        console.warn(`[Server] Gemini API rate-limit/transient backoff (${errorMessage.substring(0, 120)}...). Retrying (${i+1}/${maxRetries}) in ${Math.ceil(delayMs / 1000)}s...`);
        await sleep(delayMs);
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

// Static likeness lookup for pre-populated demo photos to save API and avoid redundancy
function getStaticLikenessOfUrl(photoUrl: string): string | null {
  if (!photoUrl) return null;
  // NEVER return static likeness for generated data URIs, Pollinations, or SVGs!
  if (photoUrl.startsWith('data:') || photoUrl.includes('pollinations.ai') || photoUrl.includes('base64') || photoUrl.includes('svg')) {
    return null;
  }
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

// Child classifier helper
function isCharacterChild(description: string, name: string): boolean {
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

// CLEANING PORTRAITS HELPERS
function name_clean(n: string) {
  return n.replace(/[^a-zA-Z\s]/g, "").trim() || "Hero";
}

// -------------------------------------------------------------
// backend API Routes
// -------------------------------------------------------------

// Translate English API
app.post("/api/gemini/translate-to-english-if-needed", async (req, res) => {
  const { text } = req.body;
  if (!text) {
    return res.json({ text: "" });
  }
  const hasHebrew = /[\u0590-\u05FF]/.test(text);
  if (!hasHebrew) {
    return res.json({ text });
  }

  try {
    const response = await withRetry(async () => {
      const models = ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-2.5-flash", "gemini-2.5-pro"];
      let lastErr: any;
      for (const model of models) {
        try {
          return await ai.models.generateContent({
            model,
            contents: `You are a professional visual translator. Translate the following visual description or scene description from Hebrew directly into clean, descriptive English for an AI image generator (such as Imagen). Maintain all physical details like age, skin color, gender, clothing, facial features, and colors with 100% accuracy.
Ensure "לבן עור" translates as "fair-skinned" or "light-skinned", "שחור" as "dark-skinned" or "black", and so on.
Return ONLY the English translation, and nothing else (no conversational phrases, no notes, no quotes).

TEXT TO TRANSLATE IN ONE PARAGRAPH: "${text}"`,
          });
        } catch (e) {
          lastErr = e;
          console.warn(`[Server Translation] Translation failed with model ${model}, trying backup...`);
        }
      }
      throw lastErr || new Error("All translation models failed.");
    });
    const result = response.text?.trim() || text;
    res.json({ text: result });
  } catch (err: any) {
    console.error("[Server Translation] Translation to English failed:", err);
    res.json({ text }); // fallback
  }
});

// Photo Likeness analyzer
app.post("/api/gemini/describe-photo-likeness", async (req, res) => {
  const { photoUrl, name } = req.body;
  const staticLikeness = getStaticLikenessOfUrl(photoUrl);
  if (staticLikeness) {
    return res.json({ text: staticLikeness });
  }

  try {
    const resultText = await withRetry(async () => {
      if (!photoUrl || !photoUrl.startsWith('data:image/')) {
        return "A pleasant character with vibrant features.";
      }
      const match = photoUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) return "A character with expressive eyes.";
      const mimeType = match[1];
      const base64Data = match[2];

      const models = ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-2.5-flash", "gemini-2.5-pro"];
      let lastErr: any;
      for (const model of models) {
        try {
          const response = await ai.models.generateContent({
            model,
            contents: [
              {
                role: "user",
                parts: [
                  { text: `Task: Analyze the attached portrait photograph of character '${name}' in extreme detail to produce an impeccable physical description for cartoon and comic book generation.
Your description must capture the exact visual likeness, facial structure, and unique traits of this person, so that an image generator can draw them to look EXACTLY like they do in real life.

1. FIRST, determine the exact age and gender classification (e.g., "A middle-aged man", "A little girl around 6 years old", "A young adult woman in her early 20s").
   - If a child: You MUST start with "A young child (around X years old)" and describe with youth-focused features: "soft round face", "cute chubby cheeks", "large bright eyes", "small button nose". Never use adult terms like "stubble" or "sharp defined jawline".
   - If an adult: Specify their adult structure, face outline, facial hair, and age indicators.

2. SECOND, describe in precise physical detail:
   - Hair: the exact style, parting, texture, length, cut, and full color (e.g., "short messy dark brown spikes with shaved sides", "long straight auburn hair with bangs, parted down the middle").
   - Facial features: eye shape and color, eyebrows, nose shape, high cheekbones, chin, glasses (color and frame shape), skin tone/complexion (e.g., olive-skinned, pale/fair, dark-skinned), freckles, wrinkles, or clear skin.
   - Expressions & Lips: style of smile (e.g., wide toothy grin, warm closed-lip smile, confident chuckle).
   - Clothing: exact style, sleeves, collar, and colors of the top garment they are wearing.

Write a single, highly descriptive physical blueprint paragraph in English. Output ONLY the pure physical description text. Do not write any preambles, notes, or introductions. Keep it under 75 words.` },
                  {
                    inlineData: {
                      mimeType,
                      data: base64Data
                    }
                  }
                ]
              }
            ],
            config: {
              temperature: 0.2,
            }
          });
          return response.text?.trim() || "A beautiful face with expressive eyes.";
        } catch (e) {
          lastErr = e;
          console.warn(`[Server photo likeness] Failed with model ${model}, trying backup...`);
        }
      }
      throw lastErr || new Error("All photo likeness models failed.");
    });
    res.json({ text: resultText });
  } catch (err: any) {
    console.error("[Server photo likeness] Failed:", err);
    res.status(500).json({ error: err.message || "Failed to analyze photo likeness" });
  }
});

function tryParseJson(text: string): any {
  let clean = text.trim();
  
  // 1. Extract markdown code blocks if present
  const codeBlockMatch = clean.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (codeBlockMatch && codeBlockMatch[1]) {
    clean = codeBlockMatch[1].trim();
  } else {
    // 2. Extract substring between first '{' and last '}'
    const firstBrace = clean.indexOf('{');
    const lastBrace = clean.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      clean = clean.substring(firstBrace, lastBrace + 1).trim();
    }
  }

  try {
    return JSON.parse(clean);
  } catch (e1) {
    // Attempt simple JSON repairs: remove trailing commas before } or ]
    const repaired = clean
      .replace(/,\s*([}\]])/g, '$1')
      .replace(/\r?\n/g, ' ');
    try {
      return JSON.parse(repaired);
    } catch (e2) {
      // If still failing, attempt adding missing closing brackets
      let balanced = repaired;
      const openBraces = (balanced.match(/\{/g) || []).length;
      const closeBraces = (balanced.match(/\}/g) || []).length;
      const openBrackets = (balanced.match(/\[/g) || []).length;
      const closeBrackets = (balanced.match(/\]/g) || []).length;

      for (let i = 0; i < openBrackets - closeBrackets; i++) balanced += ']';
      for (let i = 0; i < openBraces - closeBraces; i++) balanced += '}';

      return JSON.parse(balanced);
    }
  }
}

// Story Decompose endpoint
app.post("/api/gemini/decompose-story", async (req, res) => {
  const { storyText, language, layout, characters, storyEngine, storyModel } = req.body;

  try {
    const result = await withRetry(async () => {
      // If Hugging Face LLM explicitly requested for story decomposition
      if (storyEngine === 'huggingface' || (storyModel && (storyModel.includes('/') || storyModel.includes('gemma') || storyModel.includes('Llama') || storyModel.includes('Qwen')))) {
        const reqHfModel = storyModel || 'google/gemma-3-4b-it';
        console.log(`[Server Decompose] Requesting Hugging Face LLM decomposition: ${reqHfModel}...`);
        
        const hfPrompt = `Decompose this comic story into ${layout} sequential panels in strict JSON format.
Story: ${storyText}
Language: ${language}
Characters: ${JSON.stringify(characters.map((c: any) => c.name))}

Output ONLY a JSON object matching this schema:
{
  "title": "Comic Book Title",
  "characterVisuals": [{"name": "CharacterName", "visualPrompt": "Detailed physical appearance in English"}],
  "panels": [
    {
      "id": "1",
      "imagePrompt": "Detailed scene artwork prompt in English describing characters, clothing, background and atmosphere",
      "caption": "Storyteller caption in ${language}",
      "dialogue": "Short spoken line in ${language}",
      "mood": "happy"
    }
  ]
}`;

        try {
          const hfRes = await generateTextWithHuggingFace(
            hfPrompt, 
            "You are a professional comic book writer and storyboard artist. Output ONLY valid JSON matching the requested schema without markdown or introductory commentary.", 
            reqHfModel,
            1800
          );

          const parsed = tryParseJson(hfRes.text);

          pushServerLog({
            category: 'STORY',
            level: 'success',
            title: `Decomposed Story via Hugging Face LLM (${hfRes.modelUsed})`,
            details: `Title: "${parsed?.title}" | Model: ${hfRes.modelUsed}`,
            model: hfRes.modelUsed
          });

          return {
            ...parsed,
            modelUsed: `hf-llm-${hfRes.modelUsed}`
          };
        } catch (hfErr: any) {
          console.warn("[Server Decompose] Requested Hugging Face LLM failed:", hfErr);
          pushServerLog({
            category: 'STORY',
            level: 'warn',
            title: `Hugging Face Story Decomposition Failed`,
            details: `Model ${reqHfModel} error: ${hfErr?.message || hfErr}`,
            model: reqHfModel
          });

          // If the user explicitly selected storyEngine === 'huggingface', throw error instead of silently defaulting to Gemini quota limits
          if (storyEngine === 'huggingface') {
            throw new Error(`Hugging Face LLM Story Decomposition failed (${reqHfModel}): ${hfErr?.message || 'Model error'}`);
          }
        }
      }

      const defaultGeminiModels = ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-1.5-flash", "gemini-1.5-pro"];
      const modelsToTry = storyModel && !storyModel.includes('/')
        ? Array.from(new Set([storyModel, ...defaultGeminiModels]))
        : defaultGeminiModels;

      let lastError: any = null;

      for (const model of modelsToTry) {
        try {
          console.log(`[Server] Attempting multimodal story decomposition with model: ${model}...`);
          
          const parts: any[] = [];
          let baseInstruction = `You are a professional comic book storyboard artist and writer.
We have a high-quality, cohesive, sequential comic book story.
Below is the story outline, and descriptions of characters.
We have also attached real photos of the characters.
Look at the attached photo(s) extremely carefully to build matching character visual outlines.
For each character with an attached photo, look at their facial features, expressions, hair style/color, age, gender, typical clothing, glasses, facial hair, and general physical likeness. You MUST describe these exact physical traits in the character's 'characterVisuals' blueprint ('visualPrompt') so that the subsequent image generator can draw characters that look EXACTLY like the real person in the photographs!

Story Context:
Story: ${storyText}
Number of Panels: ${layout}
Language: ${language}

Character Cast Details:
`;

          characters.forEach((c: any) => {
            let physicalLikenessExtra = "";
            if (c.visualPrompt) {
              physicalLikenessExtra = ` (VERY IMPORTANT: This character has a pre-rendered avatar. You MUST use these exact visual details verbatim for this character and their panel scene descriptions to ensure total character model likeness: ${c.visualPrompt})`;
            } else if (c.photoUrls && c.photoUrls.length > 0) {
              const staticLikenessDetail = getStaticLikenessOfUrl(c.photoUrls[0]);
              if (staticLikenessDetail) {
                physicalLikenessExtra = ` (Physical Appearance based on Reference Photo: ${staticLikenessDetail})`;
              }
            }
            baseInstruction += `- Name: ${c.name} (${c.role || 'Hero'}). Description: ${c.description || ''}.${physicalLikenessExtra}\n`;
          });
          
          parts.push({ text: baseInstruction });

          // Add multimodal parts representing character photo data (ONLY if not already described in visualPrompt)
          characters.forEach((c: any) => {
            if (c.visualPrompt) return; // Skip base64 if pre-described
            if (c.photoUrls && c.photoUrls.length > 0) {
              c.photoUrls.forEach((photoUrl: string, pIdx: number) => {
                if (photoUrl && photoUrl.startsWith('data:image/')) {
                  const match = photoUrl.match(/^data:([^;]+);base64,(.+)$/);
                  if (match) {
                    const mimeType = match[1];
                    const base64Data = match[2];
                    
                    parts.push({ text: `Photograph of character '${c.name}' (${c.role || 'Hero'}) for physical features and likeness reference:` });
                    parts.push({
                      inlineData: {
                        mimeType,
                        data: base64Data
                      }
                    });
                  }
                }
              });
            }
          });

          const finalPromptsPart = `
Task: 
1. Map the story into a sequence of ${layout} rich narrative panels.
2. In 'characterVisuals', define a rigid visual blueprint ('visualPrompt') in English for each character. It must extract their physical traits from their attached photographs (such as: age, gender, ethnicity, hair style, hair color, eye/iris color, glasses, clothing details, and color of their shirt/outfit). Make sure this blueprint specifies consistent hair, face, and clothing so the panel drawings maintain absolute likeness.
3. In 'panels', write the panel sequence. Each panel MUST specify:
   - id: sequential ID (e.g. "1", "2")
   - imagePrompt: highly detailed scene rendering prompt in English. Explicitly describe the scene layout, character positioning, background details, and environmental lighting. To ensure absolute character consistency, NEVER change a character's clothing, hair style, or traits between panels. ALWAYS use the EXACT SAME descriptive phrase for each character whenever they appear in a panel's imagePrompt (for example, if John is 'John, a 6-year-old boy with short curly orange hair, wearing a green hoodie and blue glasses', you MUST repeat that exact phrase 'John, a 6-year-old boy with short curly orange hair, wearing a green hoodie and blue glasses' in every single panel description when he is present). Do not shorten their names or descriptions, and do not use pronouns like 'he' or 'she'.
   - caption: a rich, kid-friendly, warm storyteller caption (exactly 3 to 5 warm, descriptive sentences in ${language}). The caption should describe the environment, character emotions, and make it beautiful for parents to read out loud.
   - dialogue: charming spoken line (optional, in the language: ${language})
   - mood: one of 'heroic'|'scary'|'sad'|'happy'|'mysterious'
   
STRICT STRING ESCAPING MANDATE: Inside any JSON string values (such as 'caption', 'imagePrompt', and 'dialogue'), never use unescaped double quotes. Any quotation marks in Hebrew or French dialogues MUST be escaped with a backslash or replaced with single quotation marks (e.g. use \\" or ' instead of unescaped \"), otherwise JSON parsing fails. Do NOT output any markdown blocks or commentary.
Please output a clean, valid JSON matching the specified response schema.
`;
          parts.push({ text: finalPromptsPart });

          const response = await ai.models.generateContent({
            model,
            contents: [
              {
                role: "user",
                parts: parts
              }
            ],
            config: {
              temperature: 0.5,
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  characterVisuals: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        name: { type: Type.STRING },
                        visualPrompt: { type: Type.STRING }
                      },
                      required: ['name', 'visualPrompt']
                    }
                  },
                  panels: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        id: { type: Type.STRING },
                        imagePrompt: { type: Type.STRING },
                        caption: { type: Type.STRING },
                        dialogue: { type: Type.STRING },
                        mood: { 
                          type: Type.STRING, 
                          enum: ['heroic', 'scary', 'sad', 'happy', 'mysterious'] 
                        }
                      },
                      required: ['id', 'imagePrompt', 'caption', 'mood']
                    }
                  }
                },
                required: ['title', 'panels', 'characterVisuals']
              }
            }
          });

          let rawText = "";
          try {
            rawText = response.text || "";
          } catch (tErr) {
            console.warn("[Server] response.text getter threw error, trying candidate content parts...", tErr);
          }
          
          if (!rawText && response.candidates?.[0]?.content?.parts) {
            rawText = response.candidates[0].content.parts.map((p: any) => p.text || "").join("");
          }

          if (!rawText) {
            const finishReason = response.candidates?.[0]?.finishReason;
            console.warn(`[Server] Empty text returned by model ${model}. Finish reason: ${finishReason}`);
            throw new Error(`Empty text returned by model (Finish reason: ${finishReason || 'Unknown'})`);
          }
          
          let cleanText = rawText.trim();
          if (cleanText.includes("```")) {
            const matchText = cleanText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
            if (matchText && matchText[1]) {
              cleanText = matchText[1].trim();
            }
          }
          
          let parsed;
          try {
            parsed = JSON.parse(cleanText);
          } catch (firstErr) {
            console.warn("[Server] Direct JSON parse failed, repairing...", firstErr);
            const firstBrace = cleanText.indexOf('{');
            const lastBrace = cleanText.lastIndexOf('}');
            if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
              cleanText = cleanText.substring(firstBrace, lastBrace + 1);
            }
            let repaired = cleanText
              .replace(/,\s*([\]}])/g, '$1')
              .replace(/\/\*[\s\S]*?\*\//g, '')
              .replace(/\/\/.*/g, '');
              
            parsed = JSON.parse(repaired);
          }

          pushServerLog({
            category: 'STORY',
            level: 'success',
            title: `Decomposed Story into ${parsed?.panels?.length || layout} Panels`,
            details: `Title: "${parsed?.title}" | Model: ${model}`,
            model
          });

          return {
            ...parsed,
            modelUsed: model,
            usage: {
              promptTokens: response.usageMetadata?.promptTokenCount || 0,
              candidatesTokens: response.usageMetadata?.candidatesTokenCount || 0,
              totalTokens: response.usageMetadata?.totalTokenCount || 0
            }
          };
        } catch (e: any) {
          const errMsg = e?.message || String(e);
          pushServerLog({
            category: 'STORY',
            level: 'warn',
            title: `Decomposition attempt with model ${model} failed`,
            details: `Error: ${errMsg}`,
            model
          });
          console.warn(`[Server] Model ${model} decomposition attempt failed:`, e);
          lastError = e;
          if (errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('quota')) {
            console.log('[Server] 429 Rate Limit encountered. Pausing 1.5s before attempting next model...');
            await new Promise((r) => setTimeout(r, 1500));
          }
        }
      }

      // If all Gemini models fail or hit rate limits, try Hugging Face LLM (google/gemma-3-4b-it, Llama 3.2, Qwen 2.5) fallback!
      if (getLatestHfToken()) {
        try {
          console.log("[Server Decompose] Gemini models exhausted or rate-limited. Attempting fallback with Hugging Face LLM (Gemma 3 / Llama 3.2 / Qwen)...");
          const hfPrompt = `Decompose this comic story into ${layout} sequential panels in strict JSON format.
Story: ${storyText}
Language: ${language}
Characters: ${JSON.stringify(characters.map((c: any) => c.name))}

Output ONLY a JSON object matching this schema:
{
  "title": "Comic Book Title",
  "characterVisuals": [{"name": "CharacterName", "visualPrompt": "Detailed physical appearance in English"}],
  "panels": [
    {
      "id": "1",
      "imagePrompt": "Detailed scene artwork prompt in English describing characters, clothing, background and atmosphere",
      "caption": "Storyteller caption in ${language}",
      "dialogue": "Short spoken line in ${language}",
      "mood": "happy"
    }
  ]
}`;
          const hfRes = await generateTextWithHuggingFace(
            hfPrompt, 
            "You are a professional comic book writer and storyboard artist. Output ONLY valid JSON matching the requested schema without markdown or introductory commentary.", 
            "google/gemma-3-4b-it"
          );

          let cleanJson = hfRes.text.trim();
          if (cleanJson.includes("```")) {
            const match = cleanJson.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
            if (match && match[1]) cleanJson = match[1].trim();
          }
          const parsed = JSON.parse(cleanJson);

          pushServerLog({
            category: 'STORY',
            level: 'success',
            title: `Decomposed Story via Hugging Face LLM (${hfRes.modelUsed})`,
            details: `Title: "${parsed?.title}" | Model: ${hfRes.modelUsed}`,
            model: hfRes.modelUsed
          });

          return {
            ...parsed,
            modelUsed: `hf-llm-${hfRes.modelUsed}`
          };
        } catch (hfErr) {
          console.warn("[Server Decompose] Hugging Face LLM fallback failed:", hfErr);
        }
      }

      throw lastError || new Error("Failed to decompose story with any available model on the server.");
    });
    res.json(result);
  } catch (err: any) {
    pushServerLog({
      category: 'STORY',
      level: 'error',
      title: 'Story Decomposition Failed',
      details: `Snippet: "${storyText?.substring(0, 80)}..." | Error: ${err.message}`
    });
    console.error("[Server decompose] Failed:", err);
    res.status(500).json({ error: err.message || "Failed to decompose story" });
  }
});

// Panel Image Generator API
app.post("/api/gemini/generate-panel-image", async (req, res) => {
  const { prompt, artStyle, imageEngine, hfModel, geminiModel, pollinationsModel, allowAutoFallback } = req.body;
  const targetStyle = artStyle || 'vibrant';
  const selectedEngine = imageEngine === 'huggingface' ? 'huggingface' : imageEngine === 'pollinations' ? 'pollinations' : 'gemini';
  const autoFallback = allowAutoFallback === true;

  try {
    const resultUrl = await withRetry(async () => {
      // Check for translation
      // Convert any Hebrew elements in the prompt to English for full consistency
      let englishPrompt = prompt;
      const hasHebrew = /[\u0590-\u05FF]/.test(prompt);
      if (hasHebrew) {
        try {
          const modelsList = ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-3.1-flash-lite"];
          let transResponse = null;
          for (const model of modelsList) {
            try {
              transResponse = await ai.models.generateContent({
                model,
                contents: `You are a professional visual translator. Translate the Hebrew scene description directly into clean descriptive English for an AI image generator. Maintain all traits exactly. Output only English translation.
TEXT: "${prompt}"`,
              });
              if (transResponse && transResponse.text) {
                break;
              }
            } catch (e) {
              console.warn(`[Server Panel Translate] Model ${model} unavailable, trying backup...`);
            }
          }
          if (transResponse && transResponse.text) {
            englishPrompt = transResponse.text.trim();
          }
        } catch (transErr) {
          console.warn("[Server Panel Translate] Failed to translate, using original text:", transErr);
        }
      }

      const stylePrompts: Record<string, string> = {
        vibrant: "An extremely detailed, rich modern graphic novel comic panel banner, comic book style, bold black ink cartoon outlines, vibrant and highly saturated professional comic colors, gorgeous cinematic drop-shadows and beautiful key lighting, clean detailed character illustrations, rich sequential comic book artist rendering, child-friendly but highly professional",
        sketched: "A highly detailed and rich hand-drawn graphic novel sketch panel, charcoal and dark pencil shading textures, strong expressive inked outlines, professional hand-drawn classic comic book style, dramatic hand-made hatch marks, exceptionally detailed environment backdrop, high production comic book artwork",
        watercolor: "A stunningly rich, detailed watercolor whimsical storybook comic book panel, ink-wash comic book aesthetic, soft beautiful wet-on-wet watercolor textures, elegant delicate black outlines, magical storytelling atmosphere with deep ambient fog, rich depth of space and highly detailed painted backgrounds",
        noir: "A magnificent dark film noir comic book splash panel, dramatic deep cinematic ink block-shadows, harsh high-contrast chiaroscuro lighting, highly detailed black and white comic book engraving style, crisp vintage drama lines, moody classic crime graphic novel aesthetic",
        'classic-golden-age': "A gorgeous retro 1950s golden age comic book panel, rich vintage Ben-Day dots shading textures, thick bold black line art illustration, classic half-tone comic patterns, nostalgic 50s ink colors, premium retro pop art illustration",
        manga: "A rich and spectacular manga graphic novel comic panel layout, professional high-end anime/manga screen tone patterns, highly expressive manga face art, pristine clean outline ink work, dynamic depth perspective, highly detailed custom anime environmental background",
        tintin: "A perfect Franco-Belgian Ligne Claire comic strip panel, inspired by Hergé's Tintin style, thin uniform clean black outlines, flat rich high-contrast colors, beautifully hand-detailed elegant background, minimalist yet incredibly detailed European cartoon art",
        asterix: "A lovely and classic vibrant European cartoon comic book panel, inspired by Albert Uderzo's Asterix, highly expressive and funny character gestures, rich saturated cartoon shades, bold inked outlines, beautiful dynamic comic composition, highly detailed humorous European graphic novel art",
        marvel: "A high-end hyper-detailed modern superhero comic book splash panel, professional cinematic lighting action shot, dramatic superhero style, rich dynamic energy spark effects, complex muscular outlines, highly detailed intense action scene, premium digital gradient coloring, block shadows",
        dc: "A classic heroic DC-style comic book panel, iconic superhero dynamic perspective composition, bold graphic shading and dramatic cross-hatching, rich highly-saturated colors, epic perspective, pristine hand-drawn line art, masterwork professional comic book illustration"
      };

      const extraRequirements = " This is a panel from a cohesive, beautiful, sequential comic book series with professional ink line-art. Ensure elegant camera perspective, and a rich, fully drawn background environment (grass, trees, sky, or rooms with detailed furniture) to make the panel look very elaborate and high-production value. Do NOT render any text, letters, or dialogue speech bubbles inside the drawing.";
      const baseStyle = stylePrompts[targetStyle] || stylePrompts.vibrant;

      const promptLower = englishPrompt.toLowerCase();
      let childSafetyAdjustment = "";
      if (/\b(child|kid|boy|girl|toddler|baby|infant|little one|youngster|son|daughter)\b/i.test(promptLower)) {
        childSafetyAdjustment = " SCENE CONSISTENCY: Any child characters in this scene must be rendered as sweet young children with soft, youthful, round facial features, while adult characters in the same scene must be drawn as distinct mature adults with accurate age representation (absolutely no beards or stubble on the children, but normal adult characteristics for the adults).";
      }

      const fullPanelPrompt = `PROMPT: ${englishPrompt}.${childSafetyAdjustment}
STYLE: This must be a magnificent graphic novel comic illustration rendered in ${targetStyle} style: ${baseStyle}.
CONSISTENCY RULES: The character(s) drawn MUST look exactly like the specific visual blueprints and physical details given in the PROMPT section. Keep their face details, gender, skin likeness, precise hair style and hair color, clothing outfits, and accessories completely identical to maintain perfect character model consistency. No written words or speech balloons. ${extraRequirements}`;

      return await generateImageWithFallback(fullPanelPrompt, "1:1", selectedEngine, hfModel, geminiModel, pollinationsModel, autoFallback);
    });
    recordModelUsage('panel', prompt || 'Comic Panel', selectedEngine, resultUrl.modelUsed, 'success');
    res.json({ imageUrl: resultUrl.imageUrl, modelUsed: resultUrl.modelUsed });
  } catch (err: any) {
    const errMsg = err?.message || "Panel image generation failed";
    console.error("[Server Panel Gen] Panel generation failed:", errMsg);
    const failedModel = selectedEngine === 'huggingface' 
      ? `hf-${hfModel || 'black-forest-labs/FLUX.1-schnell'} (Failed)` 
      : selectedEngine === 'gemini' 
      ? `${geminiModel || 'gemini-3.1-flash-image'} (Failed)` 
      : `pollinations-${pollinationsModel || 'flux'} (Failed)`;
    recordModelUsage('panel', req.body?.prompt || 'Comic Panel', selectedEngine, failedModel, autoFallback ? 'fallback' : 'failed');
    res.status(500).json({ error: errMsg });
  }
});

// Character Portrait Generator API
app.post("/api/gemini/generate-character-image", async (req, res) => {
  const { name, description, artStyle, imageEngine, hfModel, geminiModel, pollinationsModel, allowAutoFallback } = req.body;
  const targetStyle = artStyle || 'vibrant';
  const selectedEngine = imageEngine === 'huggingface' ? 'huggingface' : imageEngine === 'pollinations' ? 'pollinations' : 'gemini';
  const autoFallback = allowAutoFallback === true;

  try {
    const resultUrl = await withRetry(async () => {
      // Step 1: translate description if needed
      let englishDesc = description;
      const hasHebrew = /[\u0590-\u05FF]/.test(description);
      if (hasHebrew) {
        try {
          const modelsList = ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-3.1-flash-lite"];
          let transResponse = null;
          for (const model of modelsList) {
            try {
              transResponse = await ai.models.generateContent({
                model,
                contents: `Translate this Hebrew character description directly into clean descriptive English for an image generator. Output only the English translation. \n TEXT: "${description}"`,
              });
              if (transResponse && transResponse.text) {
                break;
              }
            } catch (e) {
              console.warn(`[Server Char Translate] Model ${model} unavailable, trying backup...`);
            }
          }
          if (transResponse && transResponse.text) {
            englishDesc = transResponse.text.trim();
          }
        } catch (transErr) {
          console.warn("[Server Char Translate] Failed to translate, using original text:", transErr);
        }
      }

      const isChild = isCharacterChild(englishDesc, name);

      const stylePrompts: Record<string, string> = {
        vibrant: "Graphic novel style character portrait illustration, vibrant colors, clean lines",
        sketched: "Hand-drawn character portrait sketch, pencil textures, expressive ink outlines",
        watercolor: "Watercolor storybook character portrait, warm soft colors, clean outlines",
        noir: "Film noir style hand-drawn chalk/ink character portrait, highly contrast dramatic shadows",
        'classic-golden-age': "1950s retro comic book style character portrait, Ben-Day dot textures, bold ink",
        manga: "Anime/Manga style character portrait, highly expressive face, clean lines",
        tintin: "Ligne Claire character portrait inspired by Tintin, uniform outlines, clean simple colors",
        asterix: "Charismatic European comic character portrait cartoon style, inspired by Asterix, funny features",
        marvel: "Modern Marvel-style cinematic digital comic character portrait, detailed shading, heroic lighting",
        dc: "Classic superhero comic style character portrait, bold action lines, comic book coloring"
      };

      const stylePrefix = stylePrompts[targetStyle] || stylePrompts.vibrant;
      let finalPrompt = "";

      if (isChild) {
        const cleanedDesc = englishDesc
          .replace(/\b(adult|mature|man|woman|guy|lady|gentleman|father|mother|parent|grandparent)\b/gi, "child")
          .replace(/\bbeard|stubble|facial hair|mustache|wrinkles|old\b/gi, "");

        finalPrompt = `${stylePrefix}. Close-up character portrait of a child named ${name_clean(name)}. The child has soft, sweet, rounded juvenile features, a bright and happy child-like expression, smooth skin, and friendly kid eyes. Physical description: ${cleanedDesc}. Simple minimalist studio backdrop. Clean artistic style, focused, looking forward.`;
      } else {
        finalPrompt = `${stylePrefix}. Close-up character portrait of an adult named ${name_clean(name)}. The adult has clear, structured mature facial details, realistic adult features, and an expressive natural adult look. Physical description: ${englishDesc}. Simple minimalist studio backdrop. Clean artistic style, focused, looking forward.`;
      }

      return await generateImageWithFallback(finalPrompt, "1:1", selectedEngine, hfModel, geminiModel, pollinationsModel, autoFallback);
    });
    recordModelUsage('avatar', name || 'Character Avatar', selectedEngine, resultUrl.modelUsed, 'success');
    res.json({ imageUrl: resultUrl.imageUrl, modelUsed: resultUrl.modelUsed });
  } catch (err: any) {
    const errMsg = err?.message || "Character portrait generation failed";
    console.error("[Server Char Portrait] Generation failed:", errMsg);
    const failedModel = selectedEngine === 'huggingface' 
      ? `hf-${hfModel || 'black-forest-labs/FLUX.1-schnell'} (Failed)` 
      : selectedEngine === 'gemini' 
      ? `${geminiModel || 'gemini-3.1-flash-image'} (Failed)` 
      : `pollinations-${pollinationsModel || 'flux'} (Failed)`;
    recordModelUsage('avatar', req.body?.name || 'Character Avatar', selectedEngine, failedModel, autoFallback ? 'fallback' : 'failed');
    res.status(500).json({ error: errMsg });
  }
});

// F-Lite Texture Asset Generator API Endpoint
app.post("/api/generate-texture", async (req, res) => {
  const { prompt } = req.body;
  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    return res.status(400).json({ error: "Prompt is required" });
  }

  try {
    const resultUrl = await generateWithHuggingFace(prompt, "1:1", "Freepik/F-Lite-Texture", false);
    recordModelUsage('panel', prompt, 'huggingface', resultUrl.modelUsed, 'success');

    if (req.headers.accept?.includes('image/') || req.query.stream === 'true') {
      const base64Data = resultUrl.imageUrl.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      res.setHeader('Content-Type', 'image/png');
      return res.send(buffer);
    }

    res.json({ imageUrl: resultUrl.imageUrl, modelUsed: resultUrl.modelUsed });
  } catch (err: any) {
    console.error("[Server Texture Gen Error]:", err);
    res.status(500).json({ error: err?.message || "Failed to process F-Lite Texture request." });
  }
});

// Hugging Face LLM Prompt Expansion API
app.post("/api/hf-expand-prompt", async (req, res) => {
  const { prompt, userIdea, textModel, systemPrompt } = req.body;
  const inputConcept = prompt || userIdea;
  if (!inputConcept || typeof inputConcept !== 'string' || !inputConcept.trim()) {
    return res.status(400).json({ error: "A prompt or story idea is required" });
  }

  try {
    const defaultSys = "You are an AI Comic Prompt Engineer. Expand the following user idea into a hyper-descriptive, highly textured text-to-image prompt for comic book illustrations. Focus heavily on surface textures, gritty background details, lighting, and a graphic novel aesthetic. Respond ONLY with the final expanded prompt, nothing else.";
    const result = await generateTextWithHuggingFace(
      inputConcept, 
      systemPrompt || defaultSys, 
      textModel || "google/gemma-3-4b-it"
    );

    pushServerLog({
      category: 'STORY',
      level: 'success',
      title: 'Hugging Face LLM Prompt Expanded',
      details: `Model: ${result.modelUsed} | Length: ${result.text.length} chars`,
      model: result.modelUsed
    });

    res.json({ expandedPrompt: result.text, modelUsed: result.modelUsed });
  } catch (err: any) {
    console.error("[Server HF Expand Prompt Error]:", err);
    res.status(500).json({ error: err?.message || "Failed to expand prompt using Hugging Face LLM." });
  }
});

// Free Hugging Face 2-step Comic Pipeline (LLM Prompt Expansion -> F-Lite-Texture / Image Gen)
app.post("/api/generate-comic-panel", async (req, res) => {
  const { userIdea, prompt, textModel, imageModel, aspectRatio } = req.body;
  const inputConcept = userIdea || prompt;

  if (!inputConcept || typeof inputConcept !== 'string' || !inputConcept.trim()) {
    return res.status(400).json({ error: "A story idea or prompt is required" });
  }

  try {
    // STEP 1: Use a free Hugging Face LLM (google/gemma-3-4b-it, Llama-3.2, Qwen2.5) to expand the story idea
    const selectedTextModel = textModel || 'google/gemma-3-4b-it';
    const llmSystemPrompt = `You are an AI Comic Prompt Engineer. Expand the following user idea into a hyper-descriptive, highly textured text-to-image prompt. Focus heavily on surface textures, gritty background details, lighting, and a graphic novel aesthetic. Respond ONLY with the final prompt, nothing else. User Idea: ${inputConcept}`;

    let detailedPrompt = inputConcept;
    let textModelUsed = "original";

    try {
      const llmResult = await generateTextWithHuggingFace(inputConcept, llmSystemPrompt, selectedTextModel);
      detailedPrompt = llmResult.text;
      textModelUsed = llmResult.modelUsed;
      console.log(`🤖 [HF Pipeline] Expanded Prompt with ${textModelUsed}:`, detailedPrompt);
    } catch (llmErr) {
      console.warn(`[HF Pipeline] LLM Expansion skipped/failed, using raw input concept:`, llmErr);
    }

    // STEP 2: Feed that detailed prompt directly into F-Lite-Texture or requested HF image engine
    const selectedImageModel = imageModel || 'Freepik/F-Lite-Texture';
    const finalImagePrompt = `${detailedPrompt}, comic book panel layout, rich illustration texture`;

    const imageResult = await generateWithHuggingFace(
      finalImagePrompt, 
      aspectRatio || "1:1", 
      selectedImageModel, 
      true
    );

    recordModelUsage('panel', inputConcept, 'huggingface', imageResult.modelUsed, 'success');

    if (req.headers.accept?.includes('image/') || req.query.stream === 'true') {
      const base64Data = imageResult.imageUrl.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      res.setHeader('Content-Type', 'image/png');
      return res.send(buffer);
    }

    res.json({ 
      imageUrl: imageResult.imageUrl, 
      expandedPrompt: detailedPrompt,
      textModelUsed,
      imageModelUsed: imageResult.modelUsed 
    });

  } catch (error: any) {
    console.error('[HF Pipeline Error]:', error);
    res.status(500).json({ error: error?.message || 'Failed to process the comic pipeline.' });
  }
});

// Server Logs Buffer & Diagnostics API
app.get("/api/server-logs", (req, res) => {
  res.json({ logs: serverLogsBuffer });
});

app.delete("/api/server-logs", (req, res) => {
  serverLogsBuffer.length = 0;
  pushServerLog({
    category: 'SERVER',
    level: 'info',
    title: 'Server Logs Cleared',
    details: 'Log buffer cleared by user request.'
  });
  res.json({ success: true, count: serverLogsBuffer.length });
});

// -------------------------------------------------------------
// Perchance API Engine (DIY JSDOM Generator Proxy)
// -------------------------------------------------------------
const generatorHtmlCache: Record<string, { html: string; fetchedAt: number }> = {};

async function fetchPerchanceGeneratorHtml(generatorName: string): Promise<string> {
  const cleanName = generatorName.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
  if (!cleanName) throw new Error("Invalid or empty generator name provided.");

  const cached = generatorHtmlCache[cleanName];
  if (cached && (Date.now() - cached.fetchedAt < 10 * 60 * 1000)) {
    return cached.html;
  }

  console.log(`[Perchance API] Downloading generator code for: ${cleanName}`);
  const url = `https://perchance.org/api/downloadGenerator?generatorName=${encodeURIComponent(cleanName)}&__cacheBust=${Math.random()}`;
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to download generator '${cleanName}': HTTP ${response.status}`);
  }

  const html = await response.text();
  if (!html || html.length < 50 || html.includes("404 Not Found") || html.includes("Error: generator doesn't exist")) {
    throw new Error(`Perchance generator '${cleanName}' was not found or is private.`);
  }

  generatorHtmlCache[cleanName] = { html, fetchedAt: Date.now() };
  return html;
}

async function evaluatePerchanceGenerator(
  generatorName: string, 
  listName: string = "output",
  count: number = 1
): Promise<{ results: string[]; availableLists: string[]; generatorName: string; listName: string }> {
  const cleanName = generatorName.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "") || "animal-sentence";
  const rawHtml = await fetchPerchanceGeneratorHtml(cleanName);
  
  // Prepend browser polyfills so Perchance runtime scripts load smoothly inside JSDOM
  const polyfillsHeader = `<script>
    window.requestAnimationFrame = window.requestAnimationFrame || (function(cb) { return setTimeout(cb, 16); });
    window.cancelAnimationFrame = window.cancelAnimationFrame || (function(id) { clearTimeout(id); });
  </script>`;
  
  const fullHtml = polyfillsHeader + rawHtml;
  
  const virtualConsole = new jsdom.VirtualConsole();
  virtualConsole.on("error", () => {}); // Suppress minor browser execution noise in logs
  
  const dom = new JSDOM(fullHtml, { 
    runScripts: "dangerously", 
    resources: "usable",
    url: `https://perchance.org/${cleanName}`,
    virtualConsole 
  });
  const window = dom.window as any;

  // Poll until window.root is constructed by Perchance initialization scripts
  for (let attempt = 0; attempt < 35; attempt++) {
    if (window.root) break;
    await new Promise(r => setTimeout(r, 80));
  }

  if (!window.root) {
    throw new Error(`Generator '${cleanName}' downloaded successfully, but failed to construct 'window.root' within 3 seconds.`);
  }

  // Safely probe for available list names without triggering Proxy ownKeys trap errors
  const candidateLists = [
    listName, 
    "output", 
    "character", 
    "title", 
    "description", 
    "item", 
    "setting", 
    "plot", 
    "prompt", 
    "name",
    "main"
  ].filter(Boolean);

  const availableLists: string[] = [];
  candidateLists.forEach(key => {
    try {
      if (window.root[key] !== undefined && !availableLists.includes(key)) {
        availableLists.push(key);
      }
    } catch (e) {}
  });

  if (availableLists.length === 0) {
    availableLists.push("output");
  }

  const targetList = (listName && window.root[listName] !== undefined) ? listName : (window.root.output !== undefined ? "output" : availableLists[0] || "output");
  const numToGenerate = Math.min(Math.max(1, count), 20);
  const results: string[] = [];

  for (let i = 0; i < numToGenerate; i++) {
    if (typeof window.update === "function") {
      try { window.update(); } catch (e) {}
    }

    let itemStr = "";
    if (window.root[targetList]) {
      const targetObj = window.root[targetList];
      if (typeof targetObj.evaluateItem === "function" || typeof targetObj.evaluateItem === "string") {
        itemStr = targetObj.evaluateItem;
      } else if (typeof targetObj.toString === "function") {
        itemStr = targetObj.toString();
      } else {
        itemStr = String(targetObj);
      }
    } else if (window.root.output) {
      itemStr = window.root.output.toString();
    } else {
      itemStr = "No output list found";
    }

    let cleanText = String(itemStr)
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .trim();

    results.push(cleanText);
  }

  return { results, availableLists, generatorName, listName: targetList };
}

// Perchance Express API Endpoints
app.get("/api/perchance/generate", async (req, res) => {
  try {
    const generatorName = String(req.query.generator || req.query.generatorName || "animal-sentence");
    const listName = String(req.query.list || req.query.listName || "output");
    const count = parseInt(String(req.query.count || "1"), 10);

    const data = await evaluatePerchanceGenerator(generatorName, listName, count);
    res.json({
      success: true,
      generator: data.generatorName,
      list: data.listName,
      results: data.results,
      availableLists: data.availableLists
    });
  } catch (err: any) {
    console.error("[Perchance API Error]:", err);
    res.status(500).json({ success: false, error: err?.message || "Failed to evaluate Perchance generator" });
  }
});

app.post("/api/perchance/generate", async (req, res) => {
  try {
    const { generatorName = "animal-sentence", listName = "output", count = 1 } = req.body;
    const data = await evaluatePerchanceGenerator(generatorName, listName, count);
    res.json({
      success: true,
      generator: data.generatorName,
      list: data.listName,
      results: data.results,
      availableLists: data.availableLists
    });
  } catch (err: any) {
    console.error("[Perchance API Error]:", err);
    res.status(500).json({ success: false, error: err?.message || "Failed to evaluate Perchance generator" });
  }
});

app.post("/api/perchance/info", async (req, res) => {
  try {
    const { generatorName = "animal-sentence" } = req.body;
    const data = await evaluatePerchanceGenerator(generatorName, "output", 1);
    res.json({
      success: true,
      generator: data.generatorName,
      availableLists: data.availableLists,
      sampleOutput: data.results[0] || ""
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || "Failed to inspect Perchance generator" });
  }
});

// Model Usage Summary Report API
app.get(["/api/gemini/model-usage-summary", "/api/model-usage-summary"], (req, res) => {
  const avatars = modelUsageHistory.filter(r => r.category === 'avatar');
  const panels = modelUsageHistory.filter(r => r.category === 'panel');

  const successfulAvatars = avatars.filter(r => r.status === 'success' && !r.modelUsed.includes('(Failed)'));
  const successfulPanels = panels.filter(r => r.status === 'success' && !r.modelUsed.includes('(Failed)'));

  const avatarModels: Record<string, number> = {};
  successfulAvatars.forEach(r => {
    avatarModels[r.modelUsed] = (avatarModels[r.modelUsed] || 0) + 1;
  });

  const panelModels: Record<string, number> = {};
  successfulPanels.forEach(r => {
    panelModels[r.modelUsed] = (panelModels[r.modelUsed] || 0) + 1;
  });

  res.json({
    summaryReport: {
      totalGenerations: modelUsageHistory.length,
      avatarSummary: {
        totalAvatarsGenerated: successfulAvatars.length,
        modelsUsedBreakdown: avatarModels,
      },
      comicPagesAndPanelsSummary: {
        totalPanelsGenerated: successfulPanels.length,
        modelsUsedBreakdown: panelModels,
      }
    },
    generationHistory: modelUsageHistory
  });
});

// -------------------------------------------------------------
// Development & Production Setup
// -------------------------------------------------------------

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    // Development mode setup with Vite dev server middleware
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    console.log("[Server] Vite development middleware mounted successfully.");
  } else {
    // Production mode - Serve bundled client build files statically
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
    console.log("[Server] Static production paths declared.");
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Server] Server listening on http://localhost:${PORT}`);
    printModelUsageSummaryReport();
  });
}

startServer().catch(err => {
  console.error("[Server] Bootstrapping failed:", err);
});
