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
    id: "kumano-fude",
    name: "Kumano-fude",
    jp: "熊野筆",
    region: "Hiroshima / Kumano",
    category: "craft",
    era: "Late Edo period (1830s-)",
    description:
      "Premium calligraphy & makeup brushes; 80% domestic share, world brand-supplier.",
    problem:
      "Lower-skill makeup brush demand falling; calligraphy market shrinking.",
    palette: ["#1d130a", "#3a2614", "#FBF7F0"],
    accentKanji: "筆",
    prefectures: ["JP-34"],
    realWorld: {
      kind: "association",
      label: "熊野筆事業協同組合",
      url: "https://kumanofude.or.jp/",
    },
    media: {},
    experience: "fude-craft",
  },
];

export function getCulture(id: string): Culture | undefined {
  return cultures.find((c) => c.id === id);
}
