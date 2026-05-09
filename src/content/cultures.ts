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
    id: "hakata-ningyo",
    name: "Hakata-ningyō",
    jp: "博多人形",
    region: "Fukuoka / Hakata",
    category: "craft",
    era: "Early Edo period (1600s-)",
    description:
      "Hand-painted bisque clay dolls; 目入れ (eye-painting) gives them their soul.",
    problem: "Modern decor demand falling; ~50 master craftsmen remain.",
    palette: ["#1d130a", "#C03D2B", "#C9A227"],
    accentKanji: "人",
    prefectures: ["JP-40"],
    realWorld: {
      kind: "association",
      label: "博多人形商工業協同組合",
      url: "https://hakata-ningyo.or.jp/",
    },
    media: {},
    experience: "ningyo-paint",
  },
];

export function getCulture(id: string): Culture | undefined {
  return cultures.find((c) => c.id === id);
}
