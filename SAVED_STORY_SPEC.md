# ComicsKido — Saved Story Specification

Data structures and persistence for comic stories: library bookshelf, session drafts, and playback-related fields.

## Storage backends

| Location | Format | Description |
| --- | --- | --- |
| **IndexedDB** `ComicsSkidoDB` / store `library` | `ComicStory` objects (keyPath `id`) | Primary bookshelf. Supports large base64 panel images beyond the ~5MB localStorage limit. Implemented in `src/lib/db.ts`. |
| **localStorage** `comicskido_last_story` | JSON session/draft state | Restores where the user left off (story, cast, layout, etc.). |
| **localStorage** `comicskido_library_v1` | Legacy `ComicStory[]` | Older library format; migrate into IndexedDB when present — do not use as the primary library store for new work. |
| **localStorage** `comicskido_*` engine keys | Strings / prefs | Image engine and sub-model preferences (`src/services/gemini.ts`). |

API helpers: `getStoredLibrary`, `saveStoryToDB`, `deleteStoryFromDB`, `clearEntireLibraryFromDB`, `calculateStorageUsage`.

## ComicStory schema (`src/types.ts`)

```typescript
export type Language = 'en' | 'he' | 'fr' | 'es' | 'de';

export type PanelLayout = number;

export type ArtStyle =
  | 'vibrant'
  | 'colorful'
  | 'sketched'
  | 'watercolor'
  | 'noir'
  | 'classic-golden-age'
  | 'manga'
  | 'tintin'
  | 'asterix'
  | 'marvel'
  | 'dc';

export type VoicePersona =
  | 'storyteller'
  | 'child'
  | 'grandparent'
  | 'hero'
  | 'villain';

export interface Panel {
  id: string;
  imagePrompt: string;
  imageUrl?: string;
  caption: string;
  dialogue?: string;
  mood: 'heroic' | 'scary' | 'sad' | 'happy' | 'mysterious';
}

export interface TokenUsage {
  promptTokens: number;
  candidatesTokens: number;
  totalTokens: number;
}

export interface CharacterCasting {
  role: 'protagonist' | 'helper' | 'antagonist';
  name: string;
  photoUrls?: string[];
  drawnPortraitUrl?: string;
  description: string;
  visualPrompt?: string;
}

export interface ComicStory {
  id?: string;
  title: string;
  panels: Panel[];
  language: Language;
  layout: PanelLayout;
  artStyle: ArtStyle;
  voicePersona: VoicePersona;
  usage?: TokenUsage;
  characterVisuals?: { name: string; visualPrompt: string }[];
  characters?: CharacterCasting[];
}
```

Notes:

- IndexedDB requires an `id` on put; `saveStoryToDB` assigns one if missing (`comic_<timestamp>_<random>`).
- Panel `imageUrl` values are often data URLs or remote image URLs from the selected engine.
- `mood` drives optional SFX and TTS persona feel in the reader.

## Example payload

```json
{
  "id": "comic_1710000000000_abc1234",
  "title": "The Quantum Cupcake Mystery",
  "language": "en",
  "layout": 4,
  "artStyle": "vibrant",
  "voicePersona": "storyteller",
  "panels": [
    {
      "id": "panel_1",
      "imagePrompt": "A cute robot kitten looking at a glowing blue cupcake on a kitchen counter, vibrant style",
      "imageUrl": "data:image/png;base64,...",
      "caption": "Pixel the robotic kitten found a glowing cupcake on the kitchen table!",
      "dialogue": "What is that?",
      "mood": "mysterious"
    }
  ],
  "characters": [
    {
      "role": "protagonist",
      "name": "Pixel",
      "description": "An adventurous silver robotic kitten with glowing emerald green eyes.",
      "photoUrls": []
    }
  ],
  "characterVisuals": [
    {
      "name": "Pixel",
      "visualPrompt": "A silver robot kitten, sleek metallic body, glowing green round lenses"
    }
  ],
  "usage": {
    "promptTokens": 1420,
    "candidatesTokens": 380,
    "totalTokens": 1800
  }
}
```

## Reader / playback flags (runtime UI state)

Not all of these are persisted on `ComicStory`; they are session UI state when opening a comic:

1. **Auto-play** — advance panels after narration finishes.
2. **TTS** — browser voices; language should match `story.language` (HE / FR / EN primarily mapped today).
3. **Voice persona** — from `voicePersona` (pitch/rate style).
4. **Mood SFX** — optional sounds keyed off panel `mood`.
5. **Mute** — bypass narration/SFX.

## Privacy

Stories and photos remain on-device unless the user exports (PDF / PNG ZIP) or sends casting photos/prompts to the selected AI provider via the server. Do not add cloud sync without an explicit product decision.
