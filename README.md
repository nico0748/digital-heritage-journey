# Digital Heritage Journey

> 〜小さくなる日本を、体験として残すデジタル遺産プラットフォーム〜

日本各地で消えつつある伝統工芸・祭りを、ブラウザ上の **インタラクティブな craft 体験** として残すことを目指したハッカソン作品。19 文化を 16 都道府県に紐づけ、ユーザーは江戸切子を刻み、和紙を漉き、花火を打ち上げ、扇子を畳むなど、各文化の制作工程をなぞって作品を生み出します。

詳細な設計思想は [`DESIGN.md`](./DESIGN.md) を参照してください。

---

## 体験できる文化（19 種）

### Part 1 — 完成
| Slug | JP | カテゴリ | 工程 |
|---|---|---|---|
| `kiriko` | 江戸切子 | craft | グラスを刻む（R3F + 4 伝統文様テンプレ） |
| `washi` | 美濃和紙 | craft | 6 工程で紙を漉く |
| `hanabi` | 隅田川花火 | festival | 絵柄→星掛け→玉貼り→打ち上げ＋大型フィナーレ |
| `lantern` | 提灯 | craft | 火を灯す→デザインを描く→多灯祭りシーン |
| `taiko` | 和太鼓 | festival | リズム同期タップ |
| `sensu` | 京扇子 | craft | 竹割り→紙折り→絵付け→仕上げ |

### Part 2 — 13 都道府県の代表工芸
| Slug | JP | 都道府県 |
|---|---|---|
| `tsugaru-nuri` | 津軽塗 | 青森 |
| `nanbu-tekki` | 南部鉄器 | 岩手 |
| `magewappa` | 曲げわっぱ | 秋田 |
| `mashiko-yaki` | 益子焼 | 栃木 ★準備中 |
| `tsubame-sanjo` | 鎚起銅器 | 新潟 |
| `wajima-nuri` | 輪島塗 | 石川 |
| `echizen-uchihamono` | 越前打刃物 | 福井 |
| `bizen-yaki` | 備前焼 | 岡山 |
| `kumano-fude` | 熊野筆 | 広島 ★準備中 |
| `awa-odori` | 阿波おどり | 徳島 ★準備中 |
| `hakata-ningyo` | 博多人形 | 福岡 |
| `arita-yaki` | 有田焼 | 佐賀 ★準備中 |
| `bingata` | 紅型 | 沖縄 |

★準備中 = `comingSoon: true`、archive で「準備中」overlay 表示

---

## Tech Stack

- **Framework**: Next.js 15 (App Router) + React 19 + TypeScript
- **3D**: React Three Fiber + drei + Three.js（江戸切子のガラスシリンダー）
- **Animation**: framer-motion（drag/spring）+ GSAP ScrollTrigger（横スクロール story）
- **Audio**: Web Audio API synth — `src/lib/craftAudio.ts` で 13 種の craft 音 primitive を提供
- **State**: Zustand + persist（mute/audio toggle、view mode 設定）
- **Styling**: Tailwind 3.4（和モダン palette: `washi-50/100/200`, `sumi`, `shu`, `ai`, `kin`, `font-jp`）

---

## Quick Start

```bash
npm install
npm run dev          # default: http://localhost:3000
PORT=3005 npm run dev # 別ポートで起動したいとき
```

主要ルート:

| Path | 内容 |
|---|---|
| `/` | ランディング |
| `/story` | 横スクロール / 紙芝居切替の物語シーケンス |
| `/archive` | 19 文化のカード一覧（都道府県フィルタ付き） |
| `/archive?prefecture=JP-13` | 都道府県絞り込み（東京なら kiriko + hanabi） |
| `/experience/{slug}` | 各 craft の体験画面 |
| `/ending/{slug}` | 完成画像 + realWorld リンク（協同組合・museum・shop） |

ビルド:

```bash
npm run build
npm run lint
npx tsc --noEmit
```

---

## Project Structure

```
src/
├── app/                    # Next.js App Router
│   ├── archive/            # 文化カード一覧 + prefecture フィルタ
│   ├── experience/[id]/    # /experience/{slug} dynamic route
│   ├── ending/[id]/        # /ending/{slug} dynamic route
│   └── story/              # 物語シーケンス
├── components/
│   ├── archive/            # CultureCard
│   ├── ending/             # EndingView（realWorld pill 表示）
│   ├── experience/         # 19 種の Stage コンポーネント
│   │   ├── ExperienceShell.tsx   # culture.experience で switch、comingSoon early-return
│   │   ├── KirikoCanvas.tsx      # R3F + 4 伝統文様（菊繋ぎ/矢来/七宝/麻の葉）
│   │   ├── WashiCanvas.tsx       # 6-step 紙漉き
│   │   ├── HanabiStage.tsx       # 4-step craft + 10 パターン + 大型フィナーレ
│   │   ├── SensuStage.tsx        # 4-step craft（竹割→紙折→絵付→仕上）
│   │   ├── LanternStage.tsx      # 火灯し + 多灯祭り
│   │   ├── TaikoStage.tsx        # 86 BPM リズムゲーム
│   │   └── ... 13 Part-2 Stage
│   ├── layout/             # AudioToggle 等
│   └── story/              # HorizontalStage / PaginatedStage / StorySettingsMenu
├── content/                # 静的データ
│   ├── cultures.ts         # 19 culture entries
│   ├── prefectures.ts      # 16 prefecture entries
│   └── stories.ts
├── lib/
│   └── craftAudio.ts       # Web Audio synth: playBoom/Whistle/Crackle/MetalRing 等
├── stores/
│   ├── useAppStore.ts      # mute, completedWorks
│   └── useStorySettingsStore.ts # view mode persistence
└── types/
    └── content.ts          # Culture / Prefecture / RealWorldLink / ExperienceType
```

---

## Adding a New Culture

1. **Stage コンポーネント** を `src/components/experience/{Name}Stage.tsx` に作成
   - `HanabiStage.tsx` / `SensuStage.tsx` を gold-standard reference として参照
   - サブコンポーネント分割、`useMutedRef` で音、`finalizingRef` ガード、ハイドレーション安全な SVG 座標
2. **`ExperienceType` union** に新値を追加（`src/types/content.ts`）
3. **culture entry** を `src/content/cultures.ts` に append
4. **`ExperienceShell`** に switch case を追加
5. **prefecture** は `src/content/prefectures.ts` の既存 16 件から選択（または新規追加）

未完成版を catalogue に残しておきたい場合は `comingSoon: true` をつけると「準備中」overlay で表示されます。

---

## Audio System

`src/lib/craftAudio.ts` が共通 audio lib。Web Audio API 直接合成で外部音源不要。

利用可能 primitive:
- `playThud / playClick / playBoom` — drum/tap/explosion
- `playWoodCrack / playMetalRing` — bamboo split / anvil
- `playWhistle / playCrackle` — firework launch / sparks
- `playBrush / playFold / playWater / playFire / playPour / playChime` — craft 体験向け

使い方:

```tsx
import { useMutedRef, playBoom } from "@/lib/craftAudio";

function Step() {
  const muted = useMutedRef();
  return <button onClick={() => playBoom({ mutedRef: muted })}>Boom</button>;
}
```

`useMutedRef()` は `useAppStore.muted` と同期、mute toggle で in-flight の音も即時 fade out します。

---

## Branch / Workflow

- `main` / `develop` への直接 push は禁止。**作業ブランチ → develop への PR** で取り込む
- 各 craft = 独立 PR（PR description の Summary + Test plan が develop 履歴に保存される）
- 共有ファイル (`cultures.ts` / `content.ts` / `ExperienceShell.tsx`) は append-only パターンなので並列 PR でも衝突最小

---

## License

ハッカソン作品（Hack-1 / 2026）。文化のリサーチ素材は各協同組合・伝統工芸産地公式サイトを参照しています。
