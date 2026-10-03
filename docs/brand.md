# ブランドガイド

例の歌詞のやつ の見た目と言葉づかいのルール。`web/src/styles/tokens.css` は、色（ライト/ダーク）、タイポグラフィ（フォント・サイズ・太さ・行間）、余白、角丸をカスタムプロパティとして定義しており、他の CSS はこれらを参照する。罫線やフォーカス輪郭の太さ・オフセット（`1px`、`2px`）はトークン化しておらず、`web/src/styles/base.css` に固定値で書かれている。

## 1. トーン & マナー

- ミニマル。白（ダークでは墨色）を基調に余白を多く取り、入力欄と結果欄だけに視線が集まる静かな画面にする。
- 装飾を足さない。影、グラデーション、アニメーションによる強調は使わず、区切りは `--color-border` の細い線と余白で表す。
- 動きは変換中の表示だけに使う。結果欄に `--color-text-muted` のブラケット `[ ]` を 1 つずつ 3 つまで並べて繰り返し、`prefers-reduced-motion: reduce` では止めて 3 つ並べた状態で表示する。
- 文言は短く、平易な日本語で、感嘆符や絵文字は使わない。
- `[名詞]` のようなブラケット表記がサービスの核なので、ロゴ・UI・文章を通じてブラケットを一貫したモチーフとして扱う。

## 2. ロゴの使い方

### ファイル

| 用途 | ファイル |
| --- | --- |
| ロゴ | `web/public/logo.svg` |
| favicon | `web/public/favicon.svg` |
| iOS ホーム画面アイコン | `web/public/apple-touch-icon.png` |

ロゴは角丸の正方形（64×64 の viewBox）の中に、`[ ]` のブラケットと中央のドットを置いた形。`logo.svg` と `favicon.svg` は同一の図形である。

### 配色と背景

- ライト: 背景 `#2f4bd6`（`--color-accent` のライト値）、図形は白 `#ffffff`。
- ダーク: 背景 `#8ea2ff`（`--color-accent` のダーク値）、図形は `#121214`（`--color-bg` のダーク値）。
- SVG 内の `prefers-color-scheme` メディアクエリで自動的に切り替わる。ライト/ダークごとに別ファイルを用意せず、色を手で差し替えない。
- ページ背景は `--color-bg` / `--color-surface` の上に置く。アクセント色に近い色や写真の上には置かない。

### サイズと余白

- 最小サイズは 16px 四方（favicon 相当）。それ未満には縮小しない。
- サイトヘッダーでは `--space-8`（2rem）四方で表示する（`.site-header__logo`）。
- ロゴの周囲には、ロゴ幅の 1/4 以上の余白を空ける。ヘッダーではロゴとサイト名の間に `--space-3` を取る。
- 縦横比は 1:1 を保ち、`width` と `height` は同じ値にする。

### 禁止例

- 色の変更、グラデーション、影、輪郭線の追加。
- 回転、傾き、縦横比を変える拡大縮小。
- ブラケットやドットの変形・削除・並べ替え。
- ライト用の配色をダーク背景で固定する、またはその逆。
- 十分な余白を取らずに他の要素や文字と重ねる。

## 3. 色の使い分け

基調は白・墨色の無彩色系で、アクセントは 1 色（`--color-accent`）だけ。新しい色を足す場合は、先に `tokens.css` にトークンを追加する。ダークモードは `prefers-color-scheme: dark` で同名トークンの値を上書きして対応する。

| トークン | ライト | ダーク | 用途 |
| --- | --- | --- | --- |
| `--color-bg` | `#ffffff` | `#121214` | ページ背景 |
| `--color-surface` | `#f6f6f8` | `#1c1c20` | 入力欄・結果欄などの面 |
| `--color-border` | `#dcdce2` | `#34343c` | 区切り線、枠線 |
| `--color-text` | `#1a1a1f` | `#ececf0` | 本文、見出し |
| `--color-text-muted` | `#5c5c66` | `#a0a0ac` | 補足、注釈 |
| `--color-accent` | `#2f4bd6` | `#8ea2ff` | 主要ボタン、リンク、強調（1 画面で控えめに） |
| `--color-on-accent` | `#ffffff` | `#121214` | アクセント色の上に置く文字・図形 |
| `--color-focus-ring` | `--color-accent` を参照 | 同左 | キーボードフォーカスの輪郭 |

ルール:

- 色は必ずこれらのトークン経由で指定し、CSS にカラーコードを直書きしない（`logo.svg` / `favicon.svg` は単体で配信される SVG のため例外）。
- アクセントは「操作できるもの」と「現在の注目点」に限定し、装飾には使わない。
- 文字色は `--color-text` を基本にし、重要度の低い情報だけ `--color-text-muted` にする。
- フォーカスは `:focus-visible` で `--color-focus-ring` の輪郭を出し、消さない。

## 4. タイポグラフィ

| 用途 | トークン | 内容 |
| --- | --- | --- |
| 見出し・本文 | `--font-sans` | 可読性の高い日本語ゴシック（Hiragino Sans、Noto Sans JP、Yu Gothic など） |
| 品詞タグ（`[名詞]`）、結果欄、サイト名 | `--font-mono` | 等幅フォント（ui-monospace、SF Mono、Cascadia Mono など） |

- 本文は `--font-size-md`、行間は `--line-height-body`。見出しなど短い行は `--line-height-tight` を使う。
- サイズは `--font-size-xs`、`--font-size-sm`、`--font-size-md`、`--font-size-lg`、`--font-size-xl`、`--font-size-2xl` から選ぶ。
- 太さは `--font-weight-regular` と `--font-weight-bold` の 2 種類のみ。
- 余白は `--space-1` から `--space-16`、角丸は `--radius-sm`、`--radius-md`、`--radius-lg`、`--radius-full` のスケールから選ぶ。
- 例: サイトヘッダーのサイト名は `--font-mono`、`--font-size-lg`、`--font-weight-bold`、`--line-height-tight`（`web/src/styles/base.css` の `.site-header__name`）。

## 5. 参照ファイル

- `web/src/styles/tokens.css`: デザイントークンの定義
- `web/src/styles/base.css`: ベーススタイルとサイトヘッダー
- `web/public/logo.svg` / `web/public/favicon.svg` / `web/public/apple-touch-icon.png`: ロゴ類
