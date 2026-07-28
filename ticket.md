# ComicsKido — Feature Tickets

Open backlog. Do **not** implement these until assigned and scheduled.

Art styles already in the product (`src/types.ts`):  
`vibrant`, `colorful`, `sketched`, `watercolor`, `noir`, `classic-golden-age`, `manga`, `tintin`, `asterix`, `marvel`, `dc`.

---

## TICKET-101: Art style polish & server parity

* **Type:** Bugfix / Enhancement  
* **Priority:** Medium  
* **Status:** Draft / Unscheduled  

### Description

The layout step already offers art styles, but server prompt maps may be incomplete (e.g. `colorful` falling through to another style). Align UI, types, translations, and `server.ts` style prompts so every `ArtStyle` has a distinct directive.

### Acceptance criteria

1. Every `ArtStyle` in `src/types.ts` has a matching entry in server `stylePrompts` (or equivalent).
2. UI previews and `src/translations.ts` stay in sync for EN / HE / FR / ES / DE.
3. Generated panels reflect the chosen style without silently remapping to a different id.
4. Document any intentional aliases in `MODELS.md` or `RULES.md`.

---

## TICKET-102: "Create Your Own" story templates

* **Type:** Feature Request  
* **Priority:** High  
* **Status:** Draft / Unscheduled  

### Description

Guided fill-in-the-blank templates so kids/parents can build a story without writing a full free-form prompt.

### Acceptance criteria

1. At least 3 default templates (e.g. "The Lost Treasure", "A Space Rescue", "The Magic Birthday").
2. Placeholder fields for character names (`[protagonist]`, `[helper]`, `[antagonist]`), key item, climax event, and mood pattern.
3. Form on landing or story step: pick template → fill blanks → compile a structured prompt for decompose + illustrate.
4. Works with existing casting and art-style steps; respects image-engine policy in `AGENTS.md` / `RULES.md`.

---

## TICKET-103: Fail loudly on generation errors

* **Type:** Bug fix / Policy  
* **Priority:** High  
* **Status:** Draft / Unscheduled  

### Description

Failed panel/avatar generation must not be replaced with Unsplash or other stock images. Match product policy: clear error + retry.

### Acceptance criteria

1. Remove or gate stock-image fallbacks in generate / retry paths.
2. User sees the engine error (rate limit, credits, etc.).
3. Retry panel still works against the selected engine only (unless explicit auto-fallback is on).
