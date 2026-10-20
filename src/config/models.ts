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
  // Google Gemini Image Models (Verified Live in v1beta)
  GEMINI_31_FLASH_IMAGE: {
    id: "gemini-3.1-flash-image",
    name: "Gemini 3.1 Flash Image (Nano Banana 2)",
    provider: "Google Gemini",
    type: "image",
    description: "Primary fast multimodal image generation model from Google.",
    strengths: "High-speed multimodal generation with strong character likeness preservation",
    isPrimary: true,
  } as ModelDefinition,

  GEMINI_NANO_BANANA_21: {
    id: "gemini-nano-banana-2.1",
    name: "Gemini Nano Banana 2.1",
    provider: "Google Gemini",
    type: "image",
    description: "Latest generation Nano Banana 2.1 image model for vivid comic art.",
    strengths: "Enhanced color vibrancy, crisp comic linework, expressive character faces",
  } as ModelDefinition,

  GEMINI_3_PRO_IMAGE: {
    id: "gemini-3-pro-image",
    name: "Gemini 3 Pro Image (Nano Banana Pro)",
    provider: "Google Gemini",
    type: "image",
    description: "Pro-tier high-resolution image generation model.",
    strengths: "Maximum detail resolution, cinematic panel layout composition",
  } as ModelDefinition,

  GEMINI_31_FLASH_LITE_IMAGE: {
    id: "gemini-3.1-flash-lite-image",
    name: "Gemini 3.1 Flash Lite Image (Nano Banana 2 Lite)",
    provider: "Google Gemini",
    type: "image",
    description: "Lightweight low-latency image generation model.",
    strengths: "Low overhead image creation for rapid previews",
  } as ModelDefinition,

  GEMINI_25_FLASH_IMAGE: {
    id: "gemini-2.5-flash-image",
    name: "Gemini 2.5 Flash Image (Nano Banana)",
    provider: "Google Gemini",
    type: "image",
    description: "Stable Gemini 2.5 Flash multimodal image model.",
    strengths: "Reliable comic panel illustration and consistent framing",
  } as ModelDefinition,

  // Hugging Face Models (Verified Live on HF Inference & Spaces)
  HUGGINGFACE_FLUX_SCHNELL: {
    id: "black-forest-labs/FLUX.1-schnell",
    name: "FLUX.1-schnell (Black Forest Labs)",
    provider: "Hugging Face",
    type: "image",
    description: "Ultra-fast state-of-the-art open image generation model on Hugging Face Inference & ZeroGPU.",
    strengths: "Fast panel generation speed, clean comic outlines",
    isPrimary: true,
  } as ModelDefinition,

  HUGGINGFACE_FLUX_DEV: {
    id: "black-forest-labs/FLUX.1-dev",
    name: "FLUX.1-dev (Black Forest Labs)",
    provider: "Hugging Face",
    type: "image",
    description: "High-detail 12B open-weight model with strong prompt adherence.",
    strengths: "Exceptional visual detail, speech bubble text rendering, high consistency",
  } as ModelDefinition,

  HUGGINGFACE_SD_35_LARGE: {
    id: "stabilityai/stable-diffusion-3.5-large",
    name: "Stable Diffusion 3.5 Large",
    provider: "Hugging Face",
    type: "image",
    description: "Advanced Stability AI model for versatile graphic novel and concept art rendering.",
    strengths: "Complex prompt adhesion, rich color depth, versatile art styles",
  } as ModelDefinition,

  HUGGINGFACE_SD_35_TURBO: {
    id: "stabilityai/stable-diffusion-3.5-large-turbo",
    name: "Stable Diffusion 3.5 Large Turbo",
    provider: "Hugging Face",
    type: "image",
    description: "Distilled high-speed version of Stable Diffusion 3.5 Large.",
    strengths: "4-step fast generation with rich graphic novel shading",
  } as ModelDefinition,

  HUGGINGFACE_SDXL_LIGHTNING: {
    id: "ByteDance/SDXL-Lightning",
    name: "SDXL-Lightning (ByteDance)",
    provider: "Hugging Face",
    type: "image",
    description: "Lightning-fast multi-step SDXL model.",
    strengths: "Rapid panel iterations, high production throughput",
  } as ModelDefinition,

  HUGGINGFACE_SDXL_BASE: {
    id: "stabilityai/stable-diffusion-xl-base-1.0",
    name: "Stable Diffusion XL 1.0",
    provider: "Hugging Face",
    type: "image",
    description: "Foundational SDXL 1.0 model for classic comic illustration.",
    strengths: "Broad artistic style support and balanced composition",
  } as ModelDefinition,

  // Pollinations Models
  POLLINATIONS_FLUX: {
    id: "flux",
    name: "Pollinations FLUX",
    provider: "Pollinations AI",
    type: "image",
    description: "Default FLUX illustration model provided via Pollinations AI endpoint.",
    strengths: "Open generation, vibrant comic illustration styles",
    isPrimary: true,
  } as ModelDefinition,

  POLLINATIONS_SANA: {
    id: "sana",
    name: "Pollinations Sana",
    provider: "Pollinations AI",
    type: "image",
    description: "Fast linear-diffusion model hosted on Pollinations AI.",
    strengths: "Rapid high-resolution synthesis",
  } as ModelDefinition,

  POLLINATIONS_TURBO: {
    id: "turbo",
    name: "Pollinations Turbo",
    provider: "Pollinations AI",
    type: "image",
    description: "High-speed turbo diffusion model on Pollinations AI.",
    strengths: "Quick draft comic panels",
  } as ModelDefinition,
};

/**
 * All Text Reasoning & Multimodal Vision Models accessed across the application
 */
export const TEXT_AND_VISION_MODELS = {
  GEMINI_38_FLASH: {
    id: "gemini-3.8-flash",
    name: "Gemini 3.8 Flash",
    provider: "Google Gemini",
    type: "multimodal",
    description: "Newest Gemini 3.8 Flash multimodal model for story decomposition and vision analysis.",
    strengths: "Fastest next-gen multimodal reasoning and JSON storyboard accuracy",
  } as ModelDefinition,

  GEMINI_37_FLASH: {
    id: "gemini-3.7-flash",
    name: "Gemini 3.7 Flash",
    provider: "Google Gemini",
    type: "multimodal",
    description: "High-accuracy multimodal Flash model for character likeness and storyboards.",
    strengths: "Strong multilingual story writing and structured output",
  } as ModelDefinition,

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
    type: "multimodal",
    description: "High-speed translation and storyboard model.",
    strengths: "Sub-second Hebrew/French/Spanish/German to English translation",
  } as ModelDefinition,

  GEMINI_31_PRO: {
    id: "gemini-3.1-pro-preview",
    name: "Gemini 3.1 Pro",
    provider: "Google Gemini",
    type: "multimodal",
    description: "Deep reasoning Pro model for complex narratives.",
    strengths: "Rich literary storytelling and nuanced character arcs",
  } as ModelDefinition,
};

/**
 * Complete Catalogue of All Accessed Models in the Application
 */
export const ALL_ACCESSED_MODELS: ModelDefinition[] = [
  IMAGE_MODELS.GEMINI_31_FLASH_IMAGE,
  IMAGE_MODELS.GEMINI_NANO_BANANA_21,
  IMAGE_MODELS.GEMINI_3_PRO_IMAGE,
  IMAGE_MODELS.GEMINI_31_FLASH_LITE_IMAGE,
  IMAGE_MODELS.GEMINI_25_FLASH_IMAGE,
  IMAGE_MODELS.HUGGINGFACE_FLUX_SCHNELL,
  IMAGE_MODELS.HUGGINGFACE_FLUX_DEV,
  IMAGE_MODELS.HUGGINGFACE_SD_35_LARGE,
  IMAGE_MODELS.HUGGINGFACE_SD_35_TURBO,
  IMAGE_MODELS.HUGGINGFACE_SDXL_LIGHTNING,
  IMAGE_MODELS.HUGGINGFACE_SDXL_BASE,
  IMAGE_MODELS.POLLINATIONS_FLUX,
  IMAGE_MODELS.POLLINATIONS_SANA,
  IMAGE_MODELS.POLLINATIONS_TURBO,
  TEXT_AND_VISION_MODELS.GEMINI_38_FLASH,
  TEXT_AND_VISION_MODELS.GEMINI_37_FLASH,
  TEXT_AND_VISION_MODELS.GEMINI_36_FLASH,
  TEXT_AND_VISION_MODELS.GEMINI_35_FLASH,
  TEXT_AND_VISION_MODELS.GEMINI_31_PRO,
];

export const ALL_MODELS = ALL_ACCESSED_MODELS;

/**
 * Engines grouped by category for user selection & logging
 */
export const IMAGE_ENGINES_CONFIG: ModelEngineConfig[] = [
  {
    id: "gemini",
    label: "Google Gemini Image (Nano Banana)",
    provider: "Google Gemini",
    models: [
      IMAGE_MODELS.GEMINI_31_FLASH_IMAGE,
      IMAGE_MODELS.GEMINI_NANO_BANANA_21,
      IMAGE_MODELS.GEMINI_3_PRO_IMAGE,
      IMAGE_MODELS.GEMINI_31_FLASH_LITE_IMAGE,
      IMAGE_MODELS.GEMINI_25_FLASH_IMAGE,
    ],
  },
  {
    id: "huggingface",
    label: "Hugging Face Models",
    provider: "Hugging Face",
    models: [
      IMAGE_MODELS.HUGGINGFACE_FLUX_SCHNELL,
      IMAGE_MODELS.HUGGINGFACE_FLUX_DEV,
      IMAGE_MODELS.HUGGINGFACE_SD_35_LARGE,
      IMAGE_MODELS.HUGGINGFACE_SD_35_TURBO,
      IMAGE_MODELS.HUGGINGFACE_SDXL_LIGHTNING,
      IMAGE_MODELS.HUGGINGFACE_SDXL_BASE,
    ],
  },
  {
    id: "pollinations",
    label: "Pollinations AI",
    provider: "Pollinations AI",
    models: [
      IMAGE_MODELS.POLLINATIONS_FLUX,
      IMAGE_MODELS.POLLINATIONS_SANA,
      IMAGE_MODELS.POLLINATIONS_TURBO,
    ],
  },
];
