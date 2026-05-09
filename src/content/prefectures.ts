import type { Prefecture, PrefectureId, RegionGroup } from "@/types/content";

// Curated subset of 16 prefectures. Selection rule: each one anchors a
// craft already implemented (kiriko / washi / hanabi), or one queued via
// the experience issues, or a famous national-tier tradition that gives
// us geographic balance across the eight regions of Japan.
//
// Order: north → south by ISO code. The archive UI iterates this array
// directly, so visual order in the chip bar matches geography.
export const prefectures: Prefecture[] = [
  {
    id: "JP-02",
    nameJp: "青森県",
    nameEn: "Aomori",
    region: "Hokkaido-Tohoku",
    highlights: ["津軽塗", "ねぶた祭", "津軽三味線"],
  },
  {
    id: "JP-03",
    nameJp: "岩手県",
    nameEn: "Iwate",
    region: "Hokkaido-Tohoku",
    highlights: ["南部鉄器", "浄法寺塗"],
  },
  {
    id: "JP-05",
    nameJp: "秋田県",
    nameEn: "Akita",
    region: "Hokkaido-Tohoku",
    highlights: ["大館曲げわっぱ", "竿燈祭"],
  },
  {
    id: "JP-09",
    nameJp: "栃木県",
    nameEn: "Tochigi",
    region: "Kanto",
    highlights: ["益子焼"],
  },
  {
    id: "JP-13",
    nameJp: "東京都",
    nameEn: "Tokyo",
    region: "Kanto",
    highlights: ["江戸切子", "隅田川花火", "江戸風鈴"],
  },
  {
    id: "JP-15",
    nameJp: "新潟県",
    nameEn: "Niigata",
    region: "Chubu",
    highlights: ["燕三条金物", "越後上布"],
  },
  {
    id: "JP-17",
    nameJp: "石川県",
    nameEn: "Ishikawa",
    region: "Chubu",
    highlights: ["輪島塗", "加賀友禅", "九谷焼"],
  },
  {
    id: "JP-18",
    nameJp: "福井県",
    nameEn: "Fukui",
    region: "Chubu",
    highlights: ["越前漆器", "越前和紙", "越前打刃物"],
  },
  {
    id: "JP-21",
    nameJp: "岐阜県",
    nameEn: "Gifu",
    region: "Chubu",
    highlights: ["美濃和紙", "美濃和傘・提灯", "美濃焼"],
  },
  {
    id: "JP-26",
    nameJp: "京都府",
    nameEn: "Kyoto",
    region: "Kansai",
    highlights: ["京扇子", "西陣織", "京焼・清水焼"],
  },
  {
    id: "JP-33",
    nameJp: "岡山県",
    nameEn: "Okayama",
    region: "Chugoku",
    highlights: ["備前焼"],
  },
  {
    id: "JP-34",
    nameJp: "広島県",
    nameEn: "Hiroshima",
    region: "Chugoku",
    highlights: ["熊野筆", "安芸の宮島"],
  },
  {
    id: "JP-36",
    nameJp: "徳島県",
    nameEn: "Tokushima",
    region: "Shikoku",
    highlights: ["阿波踊り", "阿波藍染", "阿波和紙"],
  },
  {
    id: "JP-40",
    nameJp: "福岡県",
    nameEn: "Fukuoka",
    region: "Kyushu-Okinawa",
    highlights: ["博多人形", "博多祇園山笠", "久留米絣"],
  },
  {
    id: "JP-41",
    nameJp: "佐賀県",
    nameEn: "Saga",
    region: "Kyushu-Okinawa",
    highlights: ["有田焼・伊万里焼", "唐津焼"],
  },
  {
    id: "JP-47",
    nameJp: "沖縄県",
    nameEn: "Okinawa",
    region: "Kyushu-Okinawa",
    highlights: ["紅型", "三線", "琉球漆器", "エイサー"],
  },
];

const byId = new Map<PrefectureId, Prefecture>(
  prefectures.map((p) => [p.id, p]),
);

export function getPrefecture(id: PrefectureId): Prefecture | undefined {
  return byId.get(id);
}

export const regionGroupLabels: Record<RegionGroup, string> = {
  "Hokkaido-Tohoku": "北海道・東北",
  Kanto: "関東",
  Chubu: "中部",
  Kansai: "近畿",
  Chugoku: "中国",
  Shikoku: "四国",
  "Kyushu-Okinawa": "九州・沖縄",
};
