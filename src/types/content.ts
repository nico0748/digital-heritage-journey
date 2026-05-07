export type ExperienceType =
  | "kiriko-cut"
  | "washi-scoop"
  | "hanabi-launch"
  | "taiko-strike";

export interface CultureMedia {
  hero?: string;
  thumbnail?: string;
  process?: string[];
  sounds?: string[];
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
