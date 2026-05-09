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
    realWorld: {
      url: "https://www.edokiriko.or.jp/",
      label: "Visit the Edo Kiriko Cooperative",
      labelJp: "江戸切子協同組合へ",
      kind: "association",
      location: "Tokyo, Sumida",
    },
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
    realWorld: [
      {
        url: "https://minowashi.myshopify.com/",
        label: "Mino Washi online shop",
        labelJp: "美濃和紙オンラインショップ",
        kind: "shop",
        location: "Mino, Gifu",
      },
      {
        url: "https://www.city.mino.gifu.jp/minogami/",
        label: "Mino Washi-no-Sato Hall",
        labelJp: "美濃和紙の里会館へ",
        kind: "museum",
        location: "Mino, Gifu",
      },
    ],
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
    realWorld: {
      url: "https://www.sumidagawa-hanabi.com/",
      label: "Sumida-gawa Fireworks Festival",
      labelJp: "隅田川花火大会へ",
      kind: "festival",
      location: "Tokyo, Sumida",
    },
  },
  {
    id: "sensu",
    name: "Sensu",
    jp: "扇子",
    region: "Kyoto",
    category: "craft",
    era: "Heian period",
    description:
      "Folding fan whose pleated washi cools the air and frames a private gesture.",
    problem: "Master fan-makers are aging without successors.",
    palette: ["#2A1F18", "#A47C50", "#F5EFE6"],
    accentKanji: "扇",
    media: {},
    experience: "sensu-paint",
  },
];

export function getCulture(id: string): Culture | undefined {
  return cultures.find((c) => c.id === id);
}
