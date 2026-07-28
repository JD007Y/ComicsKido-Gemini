export type Language = 'en' | 'he' | 'fr' | 'es' | 'de';

export type PanelLayout = number;

export type ArtStyle = 'vibrant' | 'colorful' | 'sketched' | 'watercolor' | 'noir' | 'classic-golden-age' | 'manga' | 'tintin' | 'asterix' | 'marvel' | 'dc';

export type VoicePersona = 'storyteller' | 'child' | 'grandparent' | 'hero' | 'villain';

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

export interface CharacterCasting {
  role: 'protagonist' | 'helper' | 'antagonist';
  name: string;
  photoUrls?: string[];
  drawnPortraitUrl?: string;
  description: string;
  visualPrompt?: string;
}
