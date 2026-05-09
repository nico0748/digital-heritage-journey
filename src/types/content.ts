export type ExperienceType =
  | "kiriko-cut"
  | "washi-scoop"
  | "hanabi-launch"
  | "lantern-light";
  | "sensu-paint";

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

// A pointer from the digital experience back to the real world: the
// official site of the artisan cooperative, museum, festival, or
// workshop where the user can actually meet the craft. Surfaced on
// /ending so users finishing a digital piece see a clear next step.
export type RealWorldKind =
  | "association" // 協同組合 / 公式団体
  | "museum"      // 博物館 / 文化センター
  | "experience"  // 体験施設 / 工房
  | "festival"    // 祭・イベント
  | "shop";       // 公式オンラインショップ / 直営店

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
  // Structured prefecture taxonomy. Empty array = nationwide / non-localised
  // (e.g. festivals or practices common to all regions). Optional so that
  // in-flight PRs (#9 sensu, #10 lantern, #12 taiko) authored before this
  // taxonomy landed don't break the type when they merge — they can
  // backfill the field in a follow-up.
  prefectures?: PrefectureId[];
  category: "craft" | "festival";
  era: string;
  description: string;
  problem: string;
  palette: [string, string, string];
  media: CultureMedia;
  experience: ExperienceType;
  accentKanji: string;
  // Optional pointer to where the user can experience the real thing.
  // Accepts a single RealWorldLink for backward-compat, or an array
  // when a culture has multiple authoritative venues (e.g. Mino washi
  // has both the official shop and the Washi-no-Sato museum).
  realWorld?: RealWorldLink | RealWorldLink[];
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
