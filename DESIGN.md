# Digital Heritage Journey 設計書

> 〜小さくなる日本を、体験として残すデジタル遺産プラットフォーム〜

本書は、基本設計書を踏まえ、**全体設計・技術スタック・画面／機能詳細設計・データ設計・実装ロードマップ**までを一冊にまとめた総合設計書である。

---

## 目次

1. [全体設計](#1-全体設計)
2. [技術スタック選定](#2-技術スタック選定)
3. [ディレクトリ構成](#3-ディレクトリ構成)
4. [画面詳細設計](#4-画面詳細設計)
5. [機能詳細設計](#5-機能詳細設計)
6. [データ設計](#6-データ設計)
7. [コンポーネント設計](#7-コンポーネント設計)
8. [ルーティング設計](#8-ルーティング設計)
9. [パフォーマンス / UX 戦略](#9-パフォーマンス--ux-戦略)
10. [レスポンシブ対応](#10-レスポンシブ対応)
11. [アクセシビリティ / 非言語UI方針](#11-アクセシビリティ--非言語ui方針)
12. [実装ロードマップ](#12-実装ロードマップ)

---

## 1. 全体設計

### 1.1 アーキテクチャ方針

本アプリケーションは、サーバサイド処理をほぼ持たない **静的 SPA + SSG** 構成とする。ユーザ投稿などの永続データは持たず、文化コンテンツは事前定義の静的データとして扱う。これにより、ホスティングコストを抑えつつ、メディアの先読み・CDN配信に最適化できる。

```
┌────────────────────────────────────────────────────┐
│                   User (Browser)                    │
└────────────┬───────────────────────────┬────────────┘
             │ HTML/JS/CSS               │ Media (img/mp4/mp3)
             ▼                           ▼
┌──────────────────────────┐   ┌──────────────────────┐
│   Next.js (App Router)   │   │   Static Assets      │
│   - SSG pages            │   │   /public/images/..  │
│   - Client Components    │   │   /public/videos/..  │
│   - Route Handlers (opt) │   │   /public/sounds/..  │
└──────────────────────────┘   └──────────────────────┘
             │
             ▼
┌──────────────────────────┐
│  In-memory Data Layer    │
│  content/*.ts            │
│  (TypeScript constants)  │
└──────────────────────────┘
```

### 1.2 体験フロー

```
[Top (Intro)]
     │  Start →
     ▼
[Story (Horizontal Scroll)]
     │  シーン1 → シーン2 → … → シーンN
     ▼
[Archive (Choose Culture)]
     │  Kiriko / Washi / Matsuri …
     ▼
[Experience (Interactive)]
     │  Drag / Click / Slide で制作体験
     ▼
[Ending]
     │  継承メッセージ / Share / Again
     ▼
[Archive に戻る]
```

### 1.3 非機能要件

| 区分 | 要件 |
|---|---|
| パフォーマンス | LCP < 2.5s / Interactive < 3s（Wi-Fi環境） |
| 対応端末 | PC / タブレット / スマートフォン |
| 対応ブラウザ | Chrome・Edge・Safari の最新2バージョン |
| 言語 | 非言語UI中心、補助的に英語 |
| 音声 | 初期ミュート、ユーザー操作後に再生 |
| アクセシビリティ | キーボード操作でも全シーンを閲覧可能 |

---

## 2. 技術スタック選定

### 2.1 選定結果

| レイヤ | 採用技術 | 採用理由 |
|---|---|---|
| フレームワーク | **Next.js 15 (App Router)** | SSG・画像最適化（`next/image`）・ルーティング・React 19対応が揃っている |
| 言語 | **TypeScript** | 型安全によりメディア・体験定義の取り違いを防ぐ |
| スタイリング | **Tailwind CSS v4** | デザインスピードを最大化。アニメ駆動のサイトに相性が良い |
| スクロール演出 | **GSAP + ScrollTrigger** | 横スクロール・タイムライン演出のデファクト。軽量で表現力が高い |
| 慣性スクロール | **Lenis** | スムーススクロール + GSAP連携が容易 |
| コンポーネント演出 | **Framer Motion** | 宣言的にReactコンポーネントへ演出を与えられる |
| 音声再生 | **Howler.js** | クロスブラウザ対応、音源プール管理が容易 |
| インタラクション描画 | **HTML5 Canvas (素)** | 切子・和紙の「手を動かす」体験に最適 |
| 状態管理 | **Zustand** | 音量・進行状況・完成品など軽量グローバル状態に最適 |
| アイコン | **lucide-react** | シンプル・統一感のある非言語アイコン |
| フォント | **next/font**（Google Fontsロード） | セルフホスティングで高速。欧文 *Cormorant Garamond* + 和文 *Shippori Mincho* |

### 2.2 採用しなかった技術と理由

- **Three.js / react-three-fiber**: 3Dは表現強度は高いが、ハッカソン期間内での制作コストが大きい。Canvas 2D + GSAP で十分に絵本的表現が可能。
- **Redux**: 本アプリの状態は軽量であり、Zustandで十分。
- **CMS（microCMS等）**: データ量が限定的かつ編集頻度が低いため、TypeScript定数で管理する方が型・ビルドの恩恵を受けられる。

### 2.3 バージョン（想定）

```
next: ^15.x
react: ^19.x
typescript: ^5.x
tailwindcss: ^4.x
gsap: ^3.12.x
@studio-freight/lenis: ^1.0.x  （もしくは後継 "lenis"）
framer-motion: ^11.x
howler: ^2.2.x
zustand: ^5.x
lucide-react: ^0.4xx.x
```

---

## 3. ディレクトリ構成

```
digital-heritage-journey/
├── DESIGN.md                      # 本書
├── README.md
├── package.json
├── tsconfig.json
├── next.config.ts
├── public/
│   ├── images/                    # 画像（後追加可）
│   ├── videos/
│   └── sounds/
└── src/
    ├── app/
    │   ├── layout.tsx             # ルートレイアウト（フォント / <html lang="en">）
    │   ├── page.tsx               # トップ画面 (/)
    │   ├── story/page.tsx         # ストーリー画面 (/story)
    │   ├── archive/page.tsx       # アーカイブ画面 (/archive)
    │   ├── experience/
    │   │   └── [id]/page.tsx      # 体験画面 (/experience/:id)
    │   ├── ending/
    │   │   └── [id]/page.tsx      # エンディング画面 (/ending/:id)
    │   └── globals.css
    ├── components/
    │   ├── layout/
    │   │   ├── SmoothScroll.tsx   # Lenis provider
    │   │   └── AudioToggle.tsx    # ミュート/アンミュート
    │   ├── ui/
    │   │   ├── ScrollHint.tsx
    │   │   ├── StartButton.tsx
    │   │   ├── ProgressBar.tsx
    │   │   └── NonVerbalLabel.tsx # アイコン+単語ラベル
    │   ├── story/
    │   │   ├── HorizontalStage.tsx
    │   │   ├── SceneLandscape.tsx
    │   │   ├── SceneCraft.tsx
    │   │   ├── SceneArtisan.tsx
    │   │   ├── SceneProblem.tsx
    │   │   └── SceneFuture.tsx
    │   ├── experience/
    │   │   ├── KirikoCanvas.tsx
    │   │   ├── WashiCanvas.tsx
    │   │   ├── MatsuriStage.tsx
    │   │   └── ExperienceShell.tsx
    │   └── archive/
    │       └── CultureCard.tsx
    ├── content/
    │   ├── cultures.ts            # 文化コンテンツ定義
    │   └── story.ts               # ストーリーシーン定義
    ├── hooks/
    │   ├── useAudio.ts
    │   ├── useGsap.ts
    │   └── useReducedMotion.ts
    ├── lib/
    │   ├── audio.ts               # Howler wrapper
    │   └── gsap.ts                # GSAP初期化
    ├── stores/
    │   └── useAppStore.ts         # Zustand
    └── types/
        └── content.ts             # Culture / Scene 型
```

---

## 4. 画面詳細設計

### 4.1 共通レイアウト

- 画面中央下に **ScrollHint**（カーソルアイコン＋横矢印）。
- 画面右上に **AudioToggle**（ミュート/解除）。
- 画面下部に **ProgressBar**（ストーリー / 体験の進捗）。
- 背景色は和紙をイメージした温かみある生成り色（`#F5EFE6`）を基調とする。

### 4.2 トップ画面 `/`

| 要素 | 内容 |
|---|---|
| 背景 | ループする墨のにじみアニメーション（SVG stroke-dashoffset） |
| タイトル | `Digital Heritage Journey` |
| サブ | `小さくなる日本を、触れられる記憶へ。` |
| コピー | `Japan is becoming smaller. But its memories can still move us.` |
| CTA | 円形の `Start` ボタン。ホバーで波紋、クリックで `/story` へ |
| 環境音 | 遠くの風・雪の音（オプション、ミュート解除後のみ） |

遷移：**`Start` クリック → `/story`**

### 4.3 ストーリー画面 `/story`

横スクロール5シーン構成。ScrollTrigger の `pin + translateX` で実装。

| シーン | 視覚 | 体験 |
|---|---|---|
| 1. Landscape | 俯瞰の日本地図にインクが広がる | スクロールで視点が下りてゆく |
| 2. Craft | 工芸品（切子・和紙・漆器）のパララックス | 各工芸がフェードで重なる |
| 3. Artisan | 職人の手元のアニメーション | ドラッグで手を動かせるガイド |
| 4. Problem | 画面が徐々にモノクロに、背景に「0」「-1」「-2」が舞う | 人口減少を暗に表現 |
| 5. Future | 色が戻り、光が差す。`Your turn →` のガイド | `/archive` へのリンク |

### 4.4 アーカイブ画面 `/archive`

- 3カラム（モバイルは1カラム）グリッド。
- カードは **画像 + 文化名 + 地域**。ホバーで拡大・サウンドプレビュー。
- クリックで `/experience/[id]` へ遷移。

### 4.5 体験画面 `/experience/[id]`

文化ごとに異なる体験を、共通シェル `ExperienceShell` 上で出し分け。

| 文化 | 体験 |
|---|---|
| Edo Kiriko | Canvasにドラッグで模様を刻む。光の反射アニメ |
| Washi | マウス移動ですく動作。水面 → 乾燥 → 完成のステップ遷移 |
| Matsuri | クリックで太鼓を鳴らし、花火を打ち上げる |

完成後 **`Complete` ボタン** → `/ending/[id]` へ。

### 4.6 エンディング画面 `/ending/[id]`

- 中央に完成品（ユーザのCanvasデータURLを表示）。
- 継承メッセージ：`This culture needs successors.`
- Share（クリップボードコピー）/ See more（Archive へ）。

---

## 5. 機能詳細設計

### 5.1 横スクロール

- ルート要素 `overflow-x: hidden`、中身コンテナに `display: flex; width: n * 100vw`。
- GSAP ScrollTrigger の `scrub: true` で `x: -(container.scrollWidth - window.innerWidth)` を駆動。
- Lenis で縦ホイール → 縦スクロール量の慣性化、ScrollTrigger が横軸へ変換。
- スマートフォンは `(pointer: coarse)` 判定で **縦スクロールのスクロールジャック版**へフォールバック。

### 5.2 絵本風ページ遷移

- Framer Motion の `<AnimatePresence mode="wait">` + `initial/exit` でフェード + スライド。
- シーン内部要素には `motion.div` に `whileInView` で淡いパララックスを付与。

### 5.3 Canvas 制作体験（切子）

```
User Drag
  └─ Canvas.onPointerMove
       └─ draw stroke (line with glass texture)
            └─ accumulate path
                 └─ onComplete: toDataURL() → store
```

- `pointerdown` で始点、`pointermove` で線を描画。
- ブラシは `ctx.lineCap = "round"`、グラデーションで光の筋を表現。
- `Undo` / `Clear` ボタンを用意。

### 5.4 Canvas 制作体験（和紙）

- ステップ：**Soak → Scoop → Dry → Done** の4段階。
- 各ステップでカーソル移動量を閾値まで貯めると次ステップへ。
- 完成画像はテクスチャ合成で1枚に。

### 5.5 Matsuri 体験

- クリックごとに太鼓サンプルを Howler から再生。
- 背景 Canvas に花火パーティクルを追加。
- 連打で高揚感が増す（パーティクル数に比例して BGM のゲインを持ち上げる）。

### 5.6 音・エフェクト

- `AudioProvider` がミュート状態をコンテキストで配布。
- サウンドはプリロード（`<link rel="preload" as="audio">` + Howler `preload: true`）。
- 初回音再生は **ユーザの最初のインタラクション**後に限定（autoplay規制対策）。

### 5.7 非言語UI

- ラベルは **アイコン + 1語英語**（例：▶ Start / ✎ Draw / ⟲ Undo / ♪ Sound）。
- チュートリアルは画面上に **点線の手のアイコン**がジェスチャを実演するのみ。
- テキストに頼らず、**色・動き・残像**で状態変化を伝える。

---

## 6. データ設計

### 6.1 型定義 `src/types/content.ts`

```ts
export type ExperienceType = "kiriko-cut" | "washi-scoop" | "matsuri-drum";

export interface Culture {
  id: string;
  name: string;         // "Edo Kiriko"
  jp: string;           // "江戸切子"
  region: string;       // "Tokyo"
  category: "craft" | "festival";
  era: string;          // "Edo period"
  description: string;  // 英語の短い説明
  problem: string;      // 継承課題
  palette: [string, string, string]; // 画面配色
  media: {
    hero: string;         // /images/kiriko/hero.jpg
    thumbnail: string;
    process?: string[];   // /videos/kiriko/process.mp4 等
    sounds?: string[];
  };
  experience: ExperienceType;
}

export interface StoryScene {
  id: string;
  title: string;
  caption?: string;
  background: string;       // 色 or 画像
  elements: StoryElement[];
}

export interface StoryElement {
  kind: "image" | "text" | "shape";
  src?: string;
  text?: string;
  x?: number; y?: number;   // 0-100 %
  parallax?: number;        // 0-1
}
```

### 6.2 初期コンテンツ（抜粋）

```ts
export const cultures: Culture[] = [
  {
    id: "kiriko",
    name: "Edo Kiriko",
    jp: "江戸切子",
    region: "Tokyo",
    category: "craft",
    era: "Edo period",
    description: "A cut glass craft refracting light into patterns.",
    problem: "Successors are decreasing.",
    palette: ["#0B2240", "#5FA8D3", "#F5EFE6"],
    media: { hero: "/images/kiriko/hero.jpg", thumbnail: "/images/kiriko/thumb.jpg" },
    experience: "kiriko-cut",
  },
  // washi, matsuri ...
];
```

画像・動画・音声アセットは、**存在しない場合でも開発が止まらないよう**にデフォルトのグラデーション背景で代替する（`<Image>` の `onError` で fallback）。

---

## 7. コンポーネント設計

### 7.1 設計原則

- **Container / Presentational** の緩やかな分離。
- GSAP を扱う要素は `"use client"` を宣言するクライアントコンポーネント。
- 演出ロジックは `hooks/useGsap.ts` に集約し、コンポーネントを宣言的に保つ。

### 7.2 主要コンポーネントAPI

```tsx
// HorizontalStage: 横スクロールを司るシェル
<HorizontalStage scenes={storyScenes} />

// ExperienceShell: 体験画面の枠
<ExperienceShell culture={culture}>
  <KirikoCanvas onComplete={(dataUrl) => ...} />
</ExperienceShell>

// CultureCard: アーカイブのカード
<CultureCard culture={culture} />
```

### 7.3 状態管理 `useAppStore`

```ts
interface AppState {
  muted: boolean;
  toggleMute: () => void;
  completedWorks: Record<string, string>; // cultureId -> dataURL
  saveWork: (id: string, dataUrl: string) => void;
}
```

`persist` ミドルウェアで `localStorage` に永続化する（完成品をエンディング画面で表示するため）。

---

## 8. ルーティング設計

| パス | 目的 | レンダリング |
|---|---|---|
| `/` | トップ | SSG |
| `/story` | 横スクロールストーリー | SSG + CSR演出 |
| `/archive` | 文化一覧 | SSG |
| `/experience/[id]` | 文化ごとの体験 | SSG + 動的id |
| `/ending/[id]` | 完成後の余韻 | CSR中心 |

`generateStaticParams` で `cultures` の全 `id` を静的生成する。

---

## 9. パフォーマンス / UX 戦略

- 画像は `next/image` で `sizes`・`priority` を正しく設定。
- アセットは **シーン単位で遅延読み込み**。次シーンの画像は `<link rel="prefetch">` で先読み。
- GSAP / Lenis などの重いスクリプトは `dynamic(() => import(...), { ssr: false })`。
- `prefers-reduced-motion: reduce` を尊重し、演出を簡略化（`useReducedMotion`）。
- 音声は初回インタラクション後にロード開始。

---

## 10. レスポンシブ対応

| ブレイクポイント | 振る舞い |
|---|---|
| `lg` (≥1024px) | 設計通りの横スクロール体験 |
| `md` (≥768px)  | 横スクロールを維持、余白を詰める |
| `sm` (<768px)  | 縦スクロールスナップに自動切替、Canvas は指タッチで動作 |

`matchMedia("(max-width: 767px)")` で JS 側でも分岐する。

---

## 11. アクセシビリティ / 非言語UI方針

- すべてのアイコンボタンに `aria-label` を付与。
- ストーリーは左右矢印キーでシーン移動できる。
- コントラスト比 4.5:1 を基準に色を選定。
- 音が主要な情報にならないよう、視覚と並列に提示。
- `prefers-reduced-motion` 対応（省略されたシーン遷移を提供）。

---

## 12. 実装ロードマップ

| Phase | 目的 | 主な成果物 |
|---|---|---|
| **P0** プロジェクト基盤 | スキャフォールド完了 | Next.js + TS + Tailwind、Lenis/GSAP導入、ルートレイアウト |
| **P1** データ/共通 | 静的データと共通UI | `cultures.ts`、`AudioToggle`、`ScrollHint`、`useAppStore` |
| **P2** トップ | 世界観を一瞬で伝える | `/` の完成 |
| **P3** ストーリー | 横スクロール5シーン | `/story` の完成 |
| **P4** アーカイブ | 文化一覧 | `/archive` の完成 |
| **P5** 体験 | 切子 → 和紙 → 祭りの順に追加 | `/experience/[id]` |
| **P6** エンディング | 完成品表示・シェア | `/ending/[id]` |
| **P7** 仕上げ | perf / responsive / a11y | `next build` 緑、実機確認 |

本ドキュメント確定後、P0 から順次実装に着手する。
