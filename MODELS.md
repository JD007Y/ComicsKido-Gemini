# Deployed Models & AI Engines Summary

Overview of AI/ML models used for story decomposition, character vision, translation, portraits, and comic panel illustration.

**Policy:** Use only the engine the user selected. Do not silently fall back to Pollinations (or stock images) when Gemini or Hugging Face fails — see `AGENTS.md` / `RULES.md`.

**Code catalog:** `src/config/models.ts` should stay aligned with this document when models are added or removed.

---

## 1. Multimodal Text & Vision Intelligence Models (Google Gemini)

| Model Name | Model ID | Provider | Primary Use Case & Role | Key Strengths |
| :--- | :--- | :--- | :--- | :--- |
| **Gemini 3.6 Flash** | `gemini-3.6-flash` | Google Gemini | **Story Decomposition & Character Extraction** | Primary multimodal model used to analyze user prompts and character reference photos, generating structured JSON story breakdowns with consistent character visual blueprints. |
| **Gemini 3.5 Flash** | `gemini-3.5-flash` | Google Gemini | **Multilingual Real-time Translation** | Fast translation engine used to convert Hebrew and French scene descriptions into structured English diffusion prompts. |
| **Gemini Flash Latest** | `gemini-flash-latest` | Google Gemini | **Backup Story Intelligence** | High-throughput fallback model for story analysis and panel scripting. |
| **Gemini 3.1 Flash Lite** | `gemini-3.1-flash-lite` | Google Gemini | **Background Task Reasoning** | Lightweight low-latency model for background layout calculations. |

---

## 2. Image Generation Models & Diffusion Engines

### A. Hugging Face Models (Inference API SDK)

| Model Name | Model ID / Path | Provider | Primary Use Case & Role | Key Strengths |
| :--- | :--- | :--- | :--- | :--- |
| **FLUX.1-schnell** *(Default)* | `black-forest-labs/FLUX.1-schnell` | Hugging Face / Black Forest Labs | High-speed comic panel & character avatar generation. | Sub-second generation speed, crisp comic outlines, high prompt fidelity. |
| **FLUX.1-dev** | `black-forest-labs/FLUX.1-dev` | Hugging Face / Black Forest Labs | High-detail graphic novel panels & speech text. | State-of-the-art open weight model with superior text-in-image rendering and facial consistency. |
| **SDXL-Lightning** | `ByteDance/SDXL-Lightning` | Hugging Face / ByteDance | High-throughput rapid panel prototyping. | Few-step lightning generation for immediate multi-panel previews. |
| **Pixel Art XL** | `nerijs/pixel-art-xl` | Hugging Face / Nerijs | Retro 16-bit video game webcomics. | Authentic 80s/90s pixel art aesthetic with vibrant arcade styling. |
| **Stable Diffusion 3.5 Large** | `stabilityai/stable-diffusion-3.5-large` | Hugging Face / Stability AI | Complex scene composition & concept art. | Excellent prompt adherence, rich color depth, multi-subject arrangement. |
| **Mage-Flow-Turbo** | `microsoft/Mage-Flow-Turbo` | Hugging Face / Microsoft | Ultra-efficient rapid generation. | 4B parameter model tuned for high efficiency and responsive output. |
| **Krea-2-Turbo** | `krea/Krea-2-Turbo` | Hugging Face / Krea | High-fidelity responsive generation. | 13B parameter model built for rich detail and fine textures. |
| **OpenJourney v4** | `prompthero/openjourney-v4` | Hugging Face / PromptHero | Cinematic graphic novel illustrations. | Fine-tuned aesthetic defaulting natively to dark cinematic graphic novel styling. |

### B. Google Gemini / Imagen Image Engines

| Model Name | Model ID | Provider | Primary Use Case & Role | Key Strengths |
| :--- | :--- | :--- | :--- | :--- |
| **Imagen 3.0** | `imagen-3.0-generate-002` | Google Gemini | High-fidelity comic panel illustration. | Photorealistic lighting, deep semantic accuracy, vibrant comic shading. |
| **Gemini 3.1 Flash Image** | `gemini-3.1-flash-image` | Google Gemini | Fast character likeness portraits. | Multimodal image creation preserving character face structure. |
| **Gemini 3.1 Flash Lite Image** | `gemini-3.1-flash-lite-image` | Google Gemini | Low-overhead panel thumbnails. | Lightweight fast generation for rapid draft layouts. |
| **Gemini 3 Pro Image** | `gemini-3-pro-image` | Google Gemini | Cinematic comic cover art. | Maximum detail resolution, dramatic panel composition. |

### C. Pollinations AI Engines

| Model Name | Model ID | Provider | Primary Use Case & Role | Key Strengths |
| :--- | :--- | :--- | :--- | :--- |
| **Pollinations FLUX** | `pollinations-flux` | Pollinations AI | Open illustration fallback & style variation. | Direct HTTP generation endpoint supporting vivid pop-art comic illustrations. |

---

## 3. Selection & Switcher Architecture

Users can dynamically switch between these image generation engines and sub-models directly from:
1. **The Header Bar AI Engine Badge**: Switch between Google Gemini, Hugging Face, and Pollinations AI with one click, or select specific Hugging Face sub-models (`FLUX.1-schnell`, `FLUX.1-dev`, `SDXL-Lightning`, `Pixel Art XL`, `SD 3.5 Large`, `Mage-Flow-Turbo`, `Krea-2-Turbo`, `OpenJourney v4`).
2. **Model Usage & Telemetry Report Modal**: View real-time logs, active engine status, and comprehensive model metrics.
