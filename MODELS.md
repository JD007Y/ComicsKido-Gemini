# Deployed Models & AI Engines Summary

Overview of verified live AI/ML models used for story decomposition, character vision, translation, portraits, and comic panel illustration.

**Policy:** Use only the engine the user selected. Do not silently fall back to Pollinations (or stock images) when Gemini or Hugging Face fails — see `AGENTS.md` / `RULES.md`.

**Code catalog:** `src/config/models.ts` stays aligned with this document.

---

## 1. Multimodal Text & Vision Intelligence Models (Google Gemini & Hugging Face)

| Model Name | Model ID | Provider | Primary Use Case & Role |
| :--- | :--- | :--- | :--- |
| **Gemini 3.8 Flash** | `gemini-3.8-flash` | Google Gemini | Latest high-speed multimodal model for story decomposition and character vision analysis. |
| **Gemini 3.7 Flash** | `gemini-3.7-flash` | Google Gemini | Multimodal reasoning model for structured JSON storyboards and multilingual dialogue. |
| **Gemini 3.6 Flash** *(Default)* | `gemini-3.6-flash` | Google Gemini | Primary multimodal model for story decomposition, photo likeness analysis, and translation. |
| **Gemini 3.5 Flash** | `gemini-3.5-flash` | Google Gemini | Fast multilingual translation and backup story decomposition. |
| **Gemini 3.1 Pro** | `gemini-3.1-pro-preview` | Google Gemini | Deep reasoning model for complex narratives. |
| **Qwen 2.5 (72B / 7B)** | `Qwen/Qwen2.5-72B-Instruct` | Hugging Face | Open-weight LLM for story decomposition when Hugging Face Story Engine is selected. |
| **Llama 3.3 (70B)** | `meta-llama/Llama-3.3-70B-Instruct` | Hugging Face | Open-weight LLM for structured JSON comic scripting. |
| **Gemma 3 (27B / 4B)** | `google/gemma-3-27b-it` | Hugging Face | Google open-weight instruction model on Hugging Face. |

---

## 2. Image Generation Models & Diffusion Engines

### A. Google Gemini Image Engines (`v1beta` Live Models)

| Model Name | Model ID | Provider | Primary Use Case & Role |
| :--- | :--- | :--- | :--- |
| **Gemini 3.1 Flash Image (Nano Banana 2)** *(Default)* | `gemini-3.1-flash-image` | Google Gemini | Fast multimodal comic panel & character portrait generation. |
| **Gemini Nano Banana 2.1** | `gemini-nano-banana-2.1` | Google Gemini | Latest Nano Banana 2.1 model for vivid comic illustrations. |
| **Gemini 3 Pro Image (Nano Banana Pro)** | `gemini-3-pro-image` | Google Gemini | Pro-tier high-resolution comic panel composition. |
| **Gemini 3.1 Flash Lite Image (Nano Banana 2 Lite)** | `gemini-3.1-flash-lite-image` | Google Gemini | Low-latency lightweight image generation. |
| **Gemini 2.5 Flash Image (Nano Banana)** | `gemini-2.5-flash-image` | Google Gemini | Stable Gemini 2.5 Flash image generation model. |

### B. Hugging Face Image Models (Inference Router & ZeroGPU Spaces)

| Model Name | Model ID | Provider | Primary Use Case & Role |
| :--- | :--- | :--- | :--- |
| **FLUX.1-schnell** *(Default)* | `black-forest-labs/FLUX.1-schnell` | Hugging Face / Black Forest Labs | High-speed comic panel & avatar generation (supported on both HF Router & official ZeroGPU Space). |
| **FLUX.1-dev** | `black-forest-labs/FLUX.1-dev` | Hugging Face / Black Forest Labs | 12B parameter open-weight model for high-detail panels. |
| **Stable Diffusion 3.5 Large** | `stabilityai/stable-diffusion-3.5-large` | Hugging Face / Stability AI | Versatile graphic novel and concept art rendering. |
| **Stable Diffusion 3.5 Large Turbo** | `stabilityai/stable-diffusion-3.5-large-turbo` | Hugging Face / Stability AI | Fast 4-step distilled SD 3.5 Large model. |
| **SDXL-Lightning** | `ByteDance/SDXL-Lightning` | Hugging Face / ByteDance | Few-step lightning generation for rapid comic panels. |
| **Stable Diffusion XL 1.0** | `stabilityai/stable-diffusion-xl-base-1.0` | Hugging Face / Stability AI | Classic SDXL 1.0 base model. |

### C. Pollinations AI Engines

| Model Name | Model ID | Provider | Primary Use Case & Role |
| :--- | :--- | :--- | :--- |
| **Pollinations FLUX** *(Default)* | `flux` | Pollinations AI | Free open FLUX illustration endpoint with automatic rate-limit cooldown queueing. |
| **Pollinations Sana** | `sana` | Pollinations AI | High-speed linear diffusion model. |
| **Pollinations Turbo** | `turbo` | Pollinations AI | Rapid draft illustration model. |
