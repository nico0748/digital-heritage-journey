import type { Culture } from "@/types/content";

export const cultures: Culture[] = [
  {
    id: "kiriko",
    name: "Edo Kiriko",
    jp: "江戸切子",
    region: "Tokyo",
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
  {
    id: "wajima-nuri",
    name: "Wajima-nuri",
    jp: "輪島塗",
    region: "Ishikawa / Wajima",
    category: "craft",
    era: "Muromachi period (1400s-)",
    description:
      "124-step lacquerware with 沈金 / 蒔絵 gold decoration; Noto's earthquake-stricken treasure.",
    problem:
      "The 2024 Noto Peninsula earthquake devastated workshops; recovery uncertain.",
    palette: ["#0A0604", "#1C120A", "#C9A227"],
    accentKanji: "輪",
    media: {},
    experience: "wajima-decorate",
  },
];

export function getCulture(id: string): Culture | undefined {
  return cultures.find((c) => c.id === id);
}
