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
    realWorld: {
      url: "https://washinosato.net/",
      label: "Mino Washi no Sato Hall",
      labelJp: "美濃和紙の里会館へ",
      kind: "museum",
      location: "Mino, Gifu",
    },
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
    id: "lantern",
    name: "Chōchin",
    jp: "提灯",
    region: "Gifu / Mino",
    category: "craft",
    era: "Muromachi period",
    description:
      "Paper lanterns lit with a single flame, carried through summer streets.",
    problem:
      "Hand-shaped washi lanterns are losing makers as plastic replicas spread.",
    palette: ["#1A0E0A", "#C03D2B", "#F9D976"],
    accentKanji: "灯",
    media: {},
    experience: "lantern-light",
  },
  {
    id: "taiko",
    name: "Wadaiko",
    jp: "和太鼓",
    region: "Nationwide",
    category: "festival",
    era: "Heian period",
    description:
      "Japanese drum at the heart of festivals, signalling gods and seasons.",
    problem: "Local taiko troupes are losing players as villages depopulate.",
    palette: ["#1A0E0A", "#7A3520", "#E8B860"],
    accentKanji: "鼓",
    media: {},
    experience: "taiko-strike",
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
  {
    id: "tsugaru-nuri",
    name: "Tsugaru-nuri",
    jp: "津軽塗",
    region: "Aomori / Tsugaru",
    category: "craft",
    era: "Edo period (1660s-)",
    description:
      "48-step lacquer with multi-color layers polished to reveal speckled 唐塗 patterns.",
    problem:
      "2-month per-piece process; ~30 active masters remain in Hirosaki.",
    palette: ["#1A0E0A", "#3a2614", "#C03D2B"],
    accentKanji: "塗",
    media: {},
    experience: "tsugaru-polish",
  },
  {
    id: "nanbu-tekki",
    name: "Nanbu Tekki",
    jp: "南部鉄器",
    region: "Iwate / Morioka",
    category: "craft",
    era: "Early Edo period (1600s-)",
    description:
      "Cast iron kettles with regular 霰文 raised pattern; iron leaching mellows tea.",
    problem:
      "Foundries closing as gas/electric replaces traditional charcoal kettles.",
    palette: ["#0A0604", "#5B3A20", "#C9A227"],
    accentKanji: "鉄",
    media: {},
    experience: "tekki-cast",
  },
  {
    id: "magewappa",
    name: "Magewappa",
    jp: "曲げわっぱ",
    region: "Akita / Ōdate",
    category: "craft",
    era: "Edo period (1600s-)",
    description:
      "Bent Akita cedar boxes stitched with cherry bark thread; antibacterial and feather-light.",
    problem:
      "Akita cedar supply is dwindling; only about eleven master craftsmen remain.",
    palette: ["#1d130a", "#C9A227", "#FBF7F0"],
    accentKanji: "曲",
    media: {},
    experience: "magewappa-bend",
  },
];

export function getCulture(id: string): Culture | undefined {
  return cultures.find((c) => c.id === id);
}
