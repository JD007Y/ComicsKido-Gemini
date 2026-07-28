# ComicsKido

AI-powered personalized comic studio for children. Turn a story idea into a multi-panel comic where your child can star as the hero — then read it aloud, save it to a local bookshelf, and export as PDF or images.

- **GitHub:** https://github.com/JD007Y/ComicsKido-AIStudio
- **AI Studio:** https://ai.studio/apps/d0070a9c-2dae-4c46-977a-251f7e492fb6

## What it does

ComicsKido walks you through a create → cast → generate → read flow:

1. **Story** — Write a free-form adventure (or use inspiration prompts).
2. **Casting** — Assign protagonist, helper, and antagonist. Upload photos, use the camera, pick demo portraits, or generate AI drawings. Photos are analyzed for likeness so characters stay consistent across panels.
3. **Layout** — Choose panel count, art style (vibrant, manga, Tintin, Marvel, and more), and a narrator voice persona.
4. **Generate** — AI decomposes the story into panels, then draws each scene with your cast and style.
5. **Reader** — Flip through the comic with optional TTS narration and mood sound effects. Save to your library, retry a panel, print/export PDF, or download PNGs as a ZIP.

Comics are stored on-device in IndexedDB (with migration from older localStorage saves). Drafts restore when you return.

## Features

- Personalized comics starring a child from reference photos
- Multiple art styles and panel counts
- Multilingual UI: English, Hebrew (RTL), French, Spanish, German
- Browser text-to-speech with storyteller personas
- Local bookshelf (IndexedDB)
- PDF print/export and PNG/ZIP download
- Image engines you can switch in the header:
  - **Google Gemini / Imagen** (default for story + vision)
  - **Hugging Face** (FLUX, SDXL, and other models)
  - **Pollinations** (only when explicitly selected)
- Diagnostics: server logs, model usage report

## Tech stack

| Layer | Stack |
| --- | --- |
| Frontend | React 19, TypeScript, Vite 6, Tailwind CSS 4, Motion |
| Backend | Express (`server.ts`) — proxies Gemini / Hugging Face / Pollinations |
| AI | `@google/genai`, Hugging Face Inference API |
| Export | jsPDF, JSZip, canvas composition |
| Storage | IndexedDB (`src/lib/db.ts`) |

## Run locally

**Prerequisites:** Node.js 18+

1. Install dependencies:

```bash
npm install
```

2. Create a `.env` file in the project root (you can copy `.env.example` and replace placeholders):

```env
GEMINI_API_KEY=your_gemini_api_key
HUGGING_FACE_TOKEN=your_huggingface_token
APP_URL=http://localhost:3000
```

- `GEMINI_API_KEY` — required for story decomposition, photo likeness, translation, and Gemini image generation.
- `HUGGING_FACE_TOKEN` — required only if you use the Hugging Face image engine.
- `APP_URL` — optional local/base URL for the app.

Never commit real API keys. Keep secrets in `.env` / `.env.local` (gitignored).

3. Start the dev server (Express + Vite on port **3000**):

```bash
npm run dev
```

Open http://localhost:3000

### Other scripts

```bash
npm run build   # Production client + server bundle into dist/
npm start       # Run the built server (dist/server.cjs)
npm run lint    # Typecheck (tsc --noEmit)
```

## Project layout

```
├── server.ts              # Express API + AI routes
├── src/
│   ├── App.tsx            # Main UI and generation wizard
│   ├── components/        # Camera, logs, modals, etc.
│   ├── config/models.ts   # Model catalog
│   ├── lib/               # IndexedDB, PDF/ZIP export, TTS helpers
│   ├── services/          # Client API wrappers (Gemini, logging, Perchance)
│   ├── translations.ts    # EN / HE / FR / ES / DE strings
│   └── types.ts           # Shared TypeScript types
├── MODELS.md              # Deployed models reference
├── AGENTS.md              # Agent operating rules
├── RULES.md               # Architecture & product policy
├── SAVED_STORY_SPEC.md    # Comic persistence schema
├── CONTRIBUTING.md        # How to change the project safely
├── ticket.md              # Unscheduled backlog
└── .cursor/rules/         # Cursor agent rules
```

## Documentation

| File | Purpose |
| --- | --- |
| [README.md](README.md) | Product overview + run instructions |
| [AGENTS.md](AGENTS.md) | Instructions for AI agents / contributors |
| [RULES.md](RULES.md) | Architecture & image-engine policy |
| [MODELS.md](MODELS.md) | Engines and model IDs |
| [SAVED_STORY_SPEC.md](SAVED_STORY_SPEC.md) | IndexedDB / draft schema |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Setup, PR, and change guidelines |
| [ticket.md](ticket.md) | Backlog tickets (do not start until assigned) |

## Image engine policy

- Use the engine the user selected in the UI.
- Do **not** silently fall back to Pollinations when Gemini or Hugging Face fails, rate-limits, or runs out of credits — return a clear error instead.
- Pollinations is only used when the user explicitly chooses it.

See [AGENTS.md](AGENTS.md) and [RULES.md](RULES.md) for full project rules.

## Notes

- Camera access is used for character photo capture (`metadata.json` requests the camera permission).
- Child photos and comic images are sent to the selected AI providers for generation; library data stays in the browser unless you export it.
- For a detailed model list and roles, see [MODELS.md](MODELS.md).
