/**
 * Central Configuration for All AI & Image Models Accessed by the Application.
 * 
 * This file serves as the single source of truth defining all AI models, 
 * image generation engines, text reasoning models, and multimodal vision models 
 * accessed in both the server backend and client frontend.
 */

export interface ModelDefinition {
  id: string;
  name: string;
  provider: 'Google Gemini' | 'Hugging Face' | 'Pollinations AI';
  type: 'image' | 'text' | 'vision' | 'multimodal';
  description: string;
  isPrimary?: boolean;
  strengths?: string;
}

export interface ModelEngineConfig {
  id: string;
  label: string;
  provider: string;
  models: ModelDefinition[];
}

/**
 * All Image Generation Models accessed across the application
 */
export const IMAGE_MODELS = {
  // Hugging Face Models
  HUGGINGFACE_FLUX_SCHNELL: {
    id: "black-forest-labs/FLUX.1-schnell",
    name: "FLUX.1-schnell (Hugging Face SDK)",
    provider: "Hugging Face",
    type: "image",
    description: "Ultra-fast state-of-the-art open image generation model hosted on Hugging Face Inference API.",
    strengths: "Sub-second panel generation speed, clean comic outlines",
    isPrimary: true,
  } as ModelDefinition,

  HUGGINGFACE_FLUX_DEV: {
    id: "black-forest-labs/FLUX.1-dev",
    name: "FLUX.1-dev (Hugging Face SDK)",
    provider: "Hugging Face",
    type: "image",
    description: "Widely considered the highest-quality open-weight model available with superior text-in-image rendering.",
    strengths: "Exceptional visual detail, speech bubble text rendering, high consistency",
    isPrimary: false,
  } as ModelDefinition,

  HUGGINGFACE_SDXL_LIGHTNING: {
    id: "ByteDance/SDXL-Lightning",
    name: "SDXL-Lightning (ByteDance)",
    provider: "Hugging Face",
    type: "image",
    description: "Lightning-fast multi-step model capable of generating high-quality images in just a few steps.",
    strengths: "Rapid panel iterations without waiting, high production throughput",
    isPrimary: false,
  } as ModelDefinition,

  HUGGINGFACE_PIXEL_ART_XL: {
    id: "nerijs/pixel-art-xl",
    name: "Pixel Art XL (Nerijs)",
    provider: "Hugging Face",
    type: "image",
    description: "Specialized model for creating webcomics with a retro, video-game 16-bit pixel art visual style.",
    strengths: "Retro video game webcomics, pixel art aesthetic, nostalgic 80s/90s feel",
    isPrimary: false,
  } as ModelDefinition,

  HUGGINGFACE_SD_35_LARGE: {
    id: "stabilityai/stable-diffusion-3.5-large",
    name: "Stable Diffusion 3.5 Large",
    provider: "Hugging Face",
    type: "image",
    description: "Advanced Stability AI model for versatile graphic novel and concept art rendering.",
    strengths: "Complex prompt adhesion, rich color depth, versatile art styles",
    isPrimary: false,
  } as ModelDefinition,

  HUGGINGFACE_MAGE_FLOW_TURBO: {
    id: "microsoft/Mage-Flow-Turbo",
    name: "Mage-Flow-Turbo (Microsoft)",
    provider: "Hugging Face",
    type: "image",
    description: "Ultra-efficient 4B parameter model updated for rapid generation.",
    strengths: "Lightning fast execution, clean lines, high efficiency",
    isPrimary: false,
  } as ModelDefinition,

  HUGGINGFACE_KREA_2_TURBO: {
    id: "krea/Krea-2-Turbo",
    name: "Krea-2-Turbo (Krea)",
    provider: "Hugging Face",
    type: "image",
    description: "Massive 13B parameter model built for highly responsive and high-fidelity output generations.",
    strengths: "Rich detail, highly responsive, fine textures",
    isPrimary: false,
  } as ModelDefinition,

  HUGGINGFACE_FREPIK_F_LITE_TEXTURE: {
    id: "Freepik/F-Lite-Texture",
    name: "Freepik / F-Lite-Texture (10B)",
    provider: "Hugging Face",
    type: "image",
    description: "10B parameter copyright-safe open diffusion model by Freepik & Fal.ai trained on 80M+ legally compliant SFW images, optimized for rich graphic textures and surface details.",
    strengths: "100% copyright-safe commercial use, 10B parameters, hyper-detailed material & surface texture depth",
    isPrimary: false,
  } as ModelDefinition,

  HUGGINGFACE_OPENJOURNEY_V4: {
    id: "prompthero/openjourney-v4",
    name: "OpenJourney v4 (PromptHero)",
    provider: "Hugging Face",
    type: "image",
    description: "Fine-tuned Stable Diffusion alternative defaulting natively to a highly artistic, cinematic graphic novel aesthetic.",
    strengths: "Cinematic lighting, dramatic graphic novel art, rich shadows",
    isPrimary: false,
  } as ModelDefinition,

  // Google Imagen / Gemini Image Models
  IMAGEN_3: {
    id: "imagen-3.0-generate-002",
    name: "Imagen 3.0",
    provider: "Google Gemini",
    type: "image",
    description: "Google's flagship text-to-image generation model with high visual fidelity.",
    strengths: "Photorealistic lighting, deep semantic accuracy, vibrant comic shading",
    isPrimary: true,
  } as ModelDefinition,

  GEMINI_31_FLASH_IMAGE: {
    id: "gemini-3.1-flash-image",
    name: "Gemini 3.1 Flash Image",
    provider: "Google Gemini",
    type: "image",
    description: "Fast multimodal image generation model from Google.",
    strengths: "High-speed multimodal generation with character likeness preservation",
  } as ModelDefinition,

  GEMINI_31_FLASH_LITE_IMAGE: {
    id: "gemini-3.1-flash-lite-image",
    name: "Gemini 3.1 Flash Lite Image",
    provider: "Google Gemini",
    type: "image",
    description: "Lightweight fast image generation model.",
    strengths: "Low overhead image creation for rapid previews",
  } as ModelDefinition,

  GEMINI_3_PRO_IMAGE: {
    id: "gemini-3-pro-image",
    name: "Gemini 3 Pro Image",
    provider: "Google Gemini",
    type: "image",
    description: "Pro-tier high quality image generation model.",
    strengths: "Maximum detail resolution, cinematic panel layout composition",
  } as ModelDefinition,

  // Pollinations FLUX Model
  POLLINATIONS_FLUX: {
    id: "pollinations-flux",
    name: "Pollinations FLUX",
    provider: "Pollinations AI",
    type: "image",
    description: "FLUX illustration model provided via Pollinations AI endpoint.",
    strengths: "Unrestricted open generation, vibrant comic illustration styles",
  } as ModelDefinition,
};

/**
 * All Text Reasoning & Multimodal Vision Models accessed across the application
 */
export const TEXT_AND_VISION_MODELS = {
  GEMINI_36_FLASH: {
    id: "gemini-3.6-flash",
    name: "Gemini 3.6 Flash",
    provider: "Google Gemini",
    type: "multimodal",
    description: "Primary multimodal reasoning model for comic story decomposition, photo likeness vision analysis, and character blueprint extraction.",
    strengths: "Multimodal photo vision analysis, JSON story decomposition, character consistency extraction",
    isPrimary: true,
  } as ModelDefinition,

  GEMINI_35_FLASH: {
    id: "gemini-3.5-flash",
    name: "Gemini 3.5 Flash",
    provider: "Google Gemini",
    type: "text",
    description: "High speed translation model for translating Hebrew scene descriptions to English image prompts.",
    strengths: "Sub-second Hebrew/French to English translation",
  } as ModelDefinition,

  GEMINI_FLASH_LATEST: {
    id: "gemini-flash-latest",
    name: "Gemini Flash Latest",
    provider: "Google Gemini",
    type: "multimodal",
    description: "Backup latest flash reasoning model for story layout & decomposition.",
    strengths: "High throughput fallback story intelligence",
  } as ModelDefinition,

  GEMINI_31_FLASH_LITE: {
    id: "gemini-3.1-flash-lite",
    name: "Gemini 3.1 Flash Lite",
    provider: "Google Gemini",
    type: "multimodal",
    description: "Lightweight fallback reasoning model for background decomposition tasks.",
    strengths: "Low token footprint reasoning",
  } as ModelDefinition,
};

/**
 * Complete Catalogue of All Accessed Models in the Application
 */
export const ALL_ACCESSED_MODELS: ModelDefinition[] = [
  IMAGE_MODELS.HUGGINGFACE_FLUX_SCHNELL,
  IMAGE_MODELS.HUGGINGFACE_FLUX_DEV,
  IMAGE_MODELS.HUGGINGFACE_SDXL_LIGHTNING,
  IMAGE_MODELS.HUGGINGFACE_PIXEL_ART_XL,
  IMAGE_MODELS.HUGGINGFACE_SD_35_LARGE,
  IMAGE_MODELS.HUGGINGFACE_MAGE_FLOW_TURBO,
  IMAGE_MODELS.HUGGINGFACE_KREA_2_TURBO,
  IMAGE_MODELS.HUGGINGFACE_FREPIK_F_LITE_TEXTURE,
  IMAGE_MODELS.HUGGINGFACE_OPENJOURNEY_V4,
  IMAGE_MODELS.IMAGEN_3,
  IMAGE_MODELS.GEMINI_31_FLASH_IMAGE,
  IMAGE_MODELS.GEMINI_31_FLASH_LITE_IMAGE,
  IMAGE_MODELS.GEMINI_3_PRO_IMAGE,
  IMAGE_MODELS.POLLINATIONS_FLUX,
  TEXT_AND_VISION_MODELS.GEMINI_36_FLASH,
  TEXT_AND_VISION_MODELS.GEMINI_35_FLASH,
  TEXT_AND_VISION_MODELS.GEMINI_FLASH_LATEST,
  TEXT_AND_VISION_MODELS.GEMINI_31_FLASH_LITE,
];

export const ALL_MODELS = ALL_ACCESSED_MODELS;

/**
 * Engines grouped by category for user selection & logging
 */
export const IMAGE_ENGINES_CONFIG: ModelEngineConfig[] = [
  {
    id: "huggingface",
    label: "Hugging Face Models",
    provider: "Hugging Face",
    models: [
      IMAGE_MODELS.HUGGINGFACE_FLUX_SCHNELL,
      IMAGE_MODELS.HUGGINGFACE_FLUX_DEV,
      IMAGE_MODELS.HUGGINGFACE_SDXL_LIGHTNING,
      IMAGE_MODELS.HUGGINGFACE_PIXEL_ART_XL,
      IMAGE_MODELS.HUGGINGFACE_SD_35_LARGE,
      IMAGE_MODELS.HUGGINGFACE_MAGE_FLOW_TURBO,
      IMAGE_MODELS.HUGGINGFACE_KREA_2_TURBO,
      IMAGE_MODELS.HUGGINGFACE_FREPIK_F_LITE_TEXTURE,
      IMAGE_MODELS.HUGGINGFACE_OPENJOURNEY_V4,
    ],
  },
  {
    id: "gemini",
    label: "Google Imagen 3 / Gemini",
    provider: "Google Gemini",
    models: [
      IMAGE_MODELS.IMAGEN_3,
      IMAGE_MODELS.GEMINI_31_FLASH_IMAGE,
      IMAGE_MODELS.GEMINI_31_FLASH_LITE_IMAGE,
      IMAGE_MODELS.GEMINI_3_PRO_IMAGE,
    ],
  },
  {
    id: "pollinations",
    label: "Pollinations FLUX",
    provider: "Pollinations AI",
    models: [IMAGE_MODELS.POLLINATIONS_FLUX],
  },
];
