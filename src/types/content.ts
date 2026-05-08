export type ExperienceType = "kiriko-cut" | "washi-scoop" | "hanabi-launch";

export interface CultureMedia {
  hero?: string;
  thumbnail?: string;
  process?: string[];
  sounds?: string[];
}

// A pointer from the digital experience back to the real world: the
// official site of the artisan cooperative, museum, festival, or
// workshop where the user can actually meet the craft. Surfaced on
// /ending so users finishing a digital piece see a clear next step.
export type RealWorldKind =
  | "association" // 協同組合 / 公式団体
  | "museum"      // 博物館 / 文化センター
  | "experience"  // 体験施設 / 工房
  | "festival";   // 祭・イベント

export interface RealWorldLink {
  url: string;
  label: string;   // English label, e.g. "Visit Edo Kiriko Cooperative"
  labelJp: string; // 日本語ラベル, e.g. "江戸切子協同組合へ"
  kind: RealWorldKind;
  location?: string; // optional, e.g. "Tokyo, Sumida"
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
  // Optional pointer to where the user can experience the real thing.
  // Optional so cultures added before this taxonomy don't break and so
  // future cultures can opt in incrementally.
  realWorld?: RealWorldLink;
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
