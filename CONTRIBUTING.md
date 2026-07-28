# Contributing to ComicsKido

Repo: https://github.com/JD007Y/ComicsKido-AIStudio

## Before you change code

1. Read `README.md` (what the app is and how to run it).
2. Read `AGENTS.md` and `RULES.md` (image-engine policy, secrets, architecture).
3. Check `ticket.md` — do not start unscheduled tickets unless asked.

## Local setup

```bash
npm install
# Create .env with GEMINI_API_KEY (and HUGGING_FACE_TOKEN if using HF)
npm run dev
```

App: http://localhost:3000

```bash
npm run lint    # tsc --noEmit
npm run build   # client + server bundle
```

## Guidelines

- **Engine policy:** Never add silent Pollinations or stock-image fallbacks when Gemini/HF fail. Errors must surface to the user. Pollinations only when explicitly selected.
- **Secrets:** Server-only. Placeholders in `.env.example` only. No keys in the Vite client bundle.
- **i18n:** Update all languages in `src/translations.ts` when adding UI strings (EN, HE, FR, ES, DE).
- **Types:** Prefer `src/types.ts` and `src/config/models.ts` over duplicating model/style lists.
- **Scope:** Prefer focused diffs. Avoid drive-by refactors of `App.tsx` / `server.ts` unless the task requires it.
- **Kids / privacy:** Treat photos and comics as sensitive local data; minimize logging of base64 payloads.

## Docs to update when behavior changes

| Change | Update |
| --- | --- |
| New/changed models | `MODELS.md`, `src/config/models.ts` |
| Persistence / schema | `SAVED_STORY_SPEC.md`, `src/types.ts` |
| Product policy | `RULES.md`, `AGENTS.md` |
| User-facing run steps | `README.md` |
| Planned features | `ticket.md` |

## Pull requests

- Describe *why* and how to test (generate a short comic, switch engines, save to library, export).
- Confirm no secrets committed.
- Note any intentional deviation from `RULES.md` (should be rare and explicit).
