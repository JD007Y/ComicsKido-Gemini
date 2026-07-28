# ComicsKido — Agent Instructions

Guidance for AI agents and developers working in this repository.

**Repo:** https://github.com/JD007Y/ComicsKido-AIStudio

## Product

ComicsKido is an AI comic studio for children and parents. Flow:

`landing → story → casting → layout → generating → reader`

Users write a story, cast characters (photos/camera/AI portraits), pick style and panel count, generate panels, then read with TTS and export PDF/ZIP. Library data stays in the browser (IndexedDB).

## Stack

- **Frontend:** React 19 + TypeScript + Vite 6 + Tailwind 4 (`src/`)
- **Backend:** Express BFF in `server.ts` (holds API keys; proxies Gemini / Hugging Face / Pollinations)
- **Dev:** `npm run dev` → Express + Vite middleware on port **3000**
- **Prod:** `npm run build` then `NODE_ENV=production npm start`

There is **no client-only generation path**. All AI calls go through `/api/*` on the Express server.

## Non-negotiable image rules

1. **No silent Pollinations fallbacks.** If Gemini or Hugging Face fails (error, rate limit, credits), return a clear error to the client. Do **not** substitute Pollinations.
2. **Pollinations only when the user explicitly selects it** as the image engine.
3. **No silent Unsplash / stock-photo / SVG placeholders** as a substitute for a failed generation. Prefer surfacing the engine error and allowing retry.
4. **No automatic engine switching** unless the user enabled an explicit auto-fallback preference. Default: honor the selected engine only.
5. Log and return the **exact** engine/model used in responses and server logs.

See also `RULES.md` and `.cursor/rules/`.

## Secrets & security

- Keep `GEMINI_API_KEY` and `HUGGING_FACE_TOKEN` **server-side only** (`.env`, never commit real keys).
- Do **not** bundle API keys into the Vite client (`vite.config.ts` `define`).
- Do not put real tokens in `.env.example` — use placeholders only.
- Treat child photos as sensitive: minimize logging of base64 payloads; never add cloud sync without explicit product work.

## Code conventions

- Match existing patterns, naming, and UI language before inventing new abstractions.
- Prefer fixing behavior in place over large rewrites of `App.tsx` / `server.ts` unless asked.
- Types of record: `src/types.ts`. Model catalog: `src/config/models.ts` + `MODELS.md`.
- i18n strings: `src/translations.ts` (EN, HE RTL, FR, ES, DE) — update all languages when adding UI copy.
- Client API wrappers: `src/services/gemini.ts`. Persistence: `src/lib/db.ts`.
- Return clean JSON errors from Express (no raw HTML 500 pages). Client uses `safeJsonFetch`.

## Docs map

| File | Purpose |
| --- | --- |
| `README.md` | Product overview + run instructions |
| `AGENTS.md` | This file — agent/dev operating rules |
| `RULES.md` | Architecture & product rules |
| `MODELS.md` | AI engines and model IDs |
| `SAVED_STORY_SPEC.md` | Comic persistence schema |
| `CONTRIBUTING.md` | How to change the project safely |
| `ticket.md` | Backlog / unscheduled tickets |

## Do not

- Start work on items in `ticket.md` unless the user assigns them.
- Add Pollinations (or any other engine) as an invisible fallback.
- Commit `.env`, credentials, or real API keys.
- Change package/scripts/deploy shape casually — this app targets Google AI Studio + local Node.
