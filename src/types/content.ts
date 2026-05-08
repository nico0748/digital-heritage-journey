export type ExperienceType = "kiriko-cut" | "washi-scoop" | "hanabi-launch";

// ISO 3166-2:JP codes for the curated subset of prefectures we surface in
// the archive. We don't enumerate all 47 — only the ones that anchor an
// existing or planned cultural experience. Adding a new prefecture is a
// type-level + content-level change so the typo surface is small.
export type PrefectureId =
  | "JP-02" // 青森県
  | "JP-03" // 岩手県
  | "JP-05" // 秋田県
  | "JP-09" // 栃木県
  | "JP-13" // 東京都
  | "JP-15" // 新潟県
  | "JP-17" // 石川県
  | "JP-18" // 福井県
  | "JP-21" // 岐阜県
  | "JP-26" // 京都府
  | "JP-33" // 岡山県
  | "JP-34" // 広島県
  | "JP-36" // 徳島県
  | "JP-40" // 福岡県
  | "JP-41" // 佐賀県
  | "JP-47"; // 沖縄県

export type RegionGroup =
  | "Hokkaido-Tohoku"
  | "Kanto"
  | "Chubu"
  | "Kansai"
  | "Chugoku"
  | "Shikoku"
  | "Kyushu-Okinawa";

export interface Prefecture {
  id: PrefectureId;
  nameJp: string; // "東京都"
  nameEn: string; // "Tokyo"
  region: RegionGroup;
  // Famous crafts / festivals that anchor the prefecture, used for the
  // archive's prefecture-detail copy and for empty-state hints when no
  // culture entry exists yet.
  highlights: string[];
}

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
  // Structured prefecture taxonomy. Empty array = nationwide / non-localised
  // (e.g. festivals or practices common to all regions).
  prefectures: PrefectureId[];
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
