# ComicsKido — Project Rules & Architecture

Canonical product and engineering rules. Agents should also follow `AGENTS.md`.

## 1. Image generation & model policy

- **Honor the user’s engine.** Supported engines: Google Gemini / Imagen, Hugging Face, Pollinations.
- **No silent Pollinations fallbacks.** If Gemini or Hugging Face fails (error, rate limit, credit depletion), return a clear error. Never substitute Pollinations unless the user selected it.
- **No silent stock / SVG placeholders.** Do not replace failed panels with Unsplash, SVG, or `data:image/svg+xml` stubs. Prefer error + retry.
- **No automatic engine switching** unless the user explicitly enabled auto-fallback. Default is selected-engine-only.
- **Header indicator.** Keep the active image engine visible in the header/status bar.
- **Exact logging.** Log and return the exact engine and model ID used (`gemini-…`, HF model path, or Pollinations model).
- Model catalog source of truth: `src/config/models.ts` and `MODELS.md`.

## 2. API errors & client resilience

- All Express `/api/*` endpoints return clean JSON errors (never raw HTML 500 pages).
- Client uses `safeJsonFetch` for non-JSON / restart cases.
- Surface rate-limit and quota messages clearly so parents can retry or switch engines intentionally.

## 3. Architecture

| Piece | Role |
| --- | --- |
| `server.ts` | Express BFF: Gemini, HF, Pollinations, Perchance, logs, usage |
| `src/App.tsx` | Main wizard UI and generation orchestration |
| `src/services/gemini.ts` | Client wrappers + engine prefs (localStorage) |
| `src/lib/db.ts` | IndexedDB bookshelf |
| `src/lib/export.ts`, `pdf.ts`, `voice.ts` | Export and TTS |
| `src/translations.ts` | EN / HE / FR / ES / DE |

- UI talks only to same-origin `/api/*`. API keys stay on the server.
- Dev: Vite middleware inside Express. Prod: Express serves `dist/` + APIs.
- Wizard steps: `landing → story → casting → layout → generating → reader`.

## 4. Character consistency & child safety

- Photo likeness / `characterVisuals` must stay consistent across panel prompts.
- Child characters: soft, age-appropriate features; do not adultify kids or infantilize adults incorrectly.
- Prefer clear casting roles: protagonist, helper, antagonist.

## 5. Persistence

- **Library:** IndexedDB (`ComicsSkidoDB` / `library`) via `src/lib/db.ts`.
- **Draft session:** `comicskido_last_story` in localStorage.
- Legacy `comicskido_library_v1` localStorage may be migrated; do not reintroduce library storage only in localStorage (5MB limit).
- Schema details: `SAVED_STORY_SPEC.md`.

## 6. i18n & kids UX

- Support EN, HE (RTL), FR, ES, DE when adding user-facing strings.
- Keep the primary flow simple; advanced tools (logs, Perchance, model reports) must not block the kids/parents create path.
- Camera permission is intentional for casting (`metadata.json`).

## 7. Secrets

- Never commit real API keys. `.env.example` uses placeholders only.
- Do not expose `GEMINI_API_KEY` / HF tokens to the browser bundle.

## 8. Tickets & scope

- Items in `ticket.md` are unscheduled unless assigned.
- Prefer small, focused changes matching existing style over large unsolicited refactors.
