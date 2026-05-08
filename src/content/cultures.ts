import type { Culture } from "@/types/content";

export const cultures: Culture[] = [
  {
    id: "kiriko",
    name: "Edo Kiriko",
    jp: "江戸切子",
    region: "Tokyo",
    prefectures: ["JP-13"],
    category: "craft",
    era: "Edo period (1834)",
    description:
      "Cut glass craft refracting light into delicate geometric patterns.",
    problem: "Only a handful of workshops remain.",
    palette: ["#0B2240", "#5FA8D3", "#F5EFE6"],
    accentKanji: "切",
    media: {},
    experience: "kiriko-cut",
  },
  {
    id: "washi",
    name: "Washi",
    jp: "和紙",
    region: "Gifu",
    prefectures: ["JP-21"],
    category: "craft",
    era: "Nara period (8th c.)",
    description:
      "Handmade paper scooped from fibers of the kōzo tree.",
    problem: "Fewer than twenty artisans remain in some villages.",
    palette: ["#EADFCB", "#A3926F", "#2A2118"],
    accentKanji: "紙",
    media: {},
    experience: "washi-scoop",
  },
  {
    id: "hanabi",
    name: "Hanabi",
    jp: "花火",
    region: "Sumida-gawa, Tokyo",
    prefectures: ["JP-13"],
    category: "festival",
    era: "Edo period (1733)",
    description:
      "Traditional Japanese fireworks blooming as chrysanthemums in the night sky.",
    problem:
      "Master pyrotechnicians (花火師) are aging, and shrinking communities can no longer fund summer festivals.",
    palette: ["#070B1D", "#7D8EFF", "#FFD76A"],
    accentKanji: "華",
    media: {},
    experience: "hanabi-launch",
  },
];

export function getCulture(id: string): Culture | undefined {
  return cultures.find((c) => c.id === id);
}
