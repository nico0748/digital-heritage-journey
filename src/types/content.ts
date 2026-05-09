export type ExperienceType =
  | "kiriko-cut"
  | "washi-scoop"
  | "hanabi-launch"
  | "fude-craft";

export interface CultureMedia {
  hero?: string;
  thumbnail?: string;
  process?: string[];
  sounds?: string[];
}

export interface CultureRealWorld {
  kind: "association" | "museum" | "shop" | "festival";
  label: string;
  url: string;
}

export interface Culture {
  id: string;
  name: string;
  jp: string;
  region: string;
  category: "craft" | "festival";
  era: string;
  description: string;
  problem: string;
  palette: [string, string, string];
  media: CultureMedia;
  experience: ExperienceType;
  accentKanji: string;
  prefectures?: string[];
  realWorld?: CultureRealWorld;
}

export interface StoryScene {
  id: string;
  title: string;
  caption?: string;
  subCaption?: string;
  background: string;
  accentKanji?: string;
  tone: "light" | "dark" | "color" | "mono";
}
