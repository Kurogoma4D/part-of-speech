# part-of-speech — Specification

> Status: Draft · Last updated: 2026-10-02

## 1. Overview
入力された日本語テキストを形態素解析で分かち書きし、各トークンを `[名詞]` `[動詞]` のような品詞タグに置き換えて表示する Web サイト。記号・伸ばし棒・波ダッシュ・空白・改行は変換せず元の文字のまま残す。

形態素解析エンジンは Rust（Lindera）を WebAssembly にビルドしてブラウザ内で動かし、サーバーを持たずに GitHub Pages で公開する。

例を以下に示す。

```
入力: 今日はいい天気だねー。
出力: [名詞][助詞][形容詞][名詞][助動詞][助詞]ー。
```

## 2. Goals & Success Criteria
- テキストを入力すると、ブラウザ内だけで品詞タグ列に変換される（外部 API への通信なし）
- 記号・伸ばし棒・波ダッシュ・空白・改行が入力どおりの位置に残る
- `master` への push で GitHub Pages に自動デプロイされる

## 3. Scope
- Rust + Lindera による品詞タグ変換エンジン（wasm）
- Vite + TypeScript による単一ページのフロントエンド
- 入力中のリアルタイム変換
- 変換結果のコピーボタン
- 変換結果の X への共有ボタン
- デザイントークン・ロゴ・favicon・OGP 画像・ブランドガイド
- GitHub Actions による GitHub Pages デプロイ

## 4. Out of Scope
- 品詞の細分類（`[名詞-固有名詞]` など）の表示
- 日本語以外の言語の解析
- ユーザー辞書の追加・編集
- サーバーサイド処理、変換履歴の保存
- トークンのホバー表示・品詞ごとの色分け

## 5. Functional Requirements
### FR-1: 品詞タグ変換エンジン
- 入力文字列を Lindera（IPADIC 同梱）で形態素解析し、各トークンを品詞大分類の `[品詞]` に置き換えた文字列を返す
- トークン間に区切り文字は入れない（例: `[名詞][助詞][動詞]`）
- wasm-bindgen で `convert(input: string): string` を JS に公開する
- 受け入れ基準
  - `猫が走る` → `[名詞][助詞][動詞]`
  - 空文字列 → 空文字列

### FR-2: 変換しない文字の保持
- 次のものは品詞タグに置き換えず、元の文字のまま出力する
  - 品詞大分類が `記号` のトークン（句読点、括弧、`！` `？` など）
  - 単独で現れる伸ばし棒（`ー` `－` など）、および語末で語を延長している伸ばし棒（`だよー` `ねーー` の延長部分）
  - 波ダッシュ（`〜` `～`）
  - 空白（半角・全角スペース、タブ）と改行
- 語の構成要素になっている伸ばし棒は語の一部として変換する（`コーヒー` → `[名詞]`、`すごーい` → `[形容詞]`）
- 受け入れ基準
  - `今日はいい天気だねー。` → `[名詞][助詞][形容詞][名詞][助動詞][助詞]ー。`
  - `えっ〜！？` の `〜！？` がそのまま残る
  - 改行を含む複数行の入力で、改行位置が入力と一致する

### FR-3: 入力と結果表示
- テキストエリアへの入力に合わせ、debounce して自動で変換し結果欄を更新する
- wasm の読み込み中はローディング状態を表示し、読み込み完了後に入力済みテキストを変換する
- wasm の読み込みに失敗した場合はエラーメッセージを表示する

### FR-4: 結果のコピー
- ボタン押下で変換結果をクリップボードへコピーし、完了を表示する
- 結果が空のときはボタンを無効化する

### FR-5: X への共有
- ボタン押下で変換結果とサイト URL を本文に入れた X の投稿画面（`https://x.com/intent/post`）を新しいタブで開く
- 結果が空のときはボタンを無効化する

### FR-6: GitHub Pages デプロイ
- `master` への push で wasm とフロントエンドをビルドし、GitHub Pages へデプロイする
- Vite の `base` をリポジトリ名のサブパス（`/part-of-speech/`）に設定する

## 6. Design & Branding
> `frontend-design` スキルを使い、このセクションから作成した Issue で実装する。

### Direction
- Aesthetic & tone: ミニマル。白基調で余白を多く取り、入力欄と結果欄だけに視線が集まる静かな画面
- Typography: タグ表示と結果欄はモノスペースフォント、見出し・本文は可読性の高い日本語ゴシック
- Color & theme: 白・墨色を基調にアクセントカラーを 1 色だけ使う。`prefers-color-scheme` によるダークモード対応

### Branding assets to deliver
- DA-1: デザイントークン — 色（ライト/ダーク）、タイポグラフィスケール、余白、角丸を CSS カスタムプロパティで定義
- DA-2: ロゴ・favicon — `[ ]` のブラケットをモチーフにしたロゴ（SVG）と favicon
- DA-3: OGP 画像 — X 共有時に表示されるカード画像（1200×630）と OGP / Twitter Card メタタグ
- DA-4: ブランドガイド — トーン、ロゴの使い方、色の使い分けのルールを `docs/brand.md` にまとめる

## 7. Non-Functional Requirements
- 解析はすべてブラウザ内で完結し、入力テキストを外部へ送信しない
- 初回表示後、一般的な長さ（数百文字）の入力の変換は体感で遅延なく反映される
- wasm（辞書込み）はブラウザキャッシュを効かせ、2 回目以降の読み込みを速くする
- キーボード操作で入力・コピー・共有ができ、ボタンにアクセシブルな名前を付ける
- モバイル幅でもレイアウトが崩れない

## 8. Supply-Chain Security
- Dependencies: `pnpm-lock.yaml` と `Cargo.lock` をコミットする

## 9. Constraints
### Project metadata
- Repository: `Kurogoma4D/part-of-speech`
- Structure: 以下のとおり。

```
crates/engine/    # Rust: Lindera による品詞タグ変換 + wasm-bindgen バインディング
web/              # Vite + TypeScript フロントエンド（wasm-pack の出力を取り込む）
docs/brand.md     # ブランドガイド
.github/workflows # GitHub Pages デプロイ
```

### Tech stack
- Language: Rust（stable、`rust-toolchain.toml` で固定、ターゲット `wasm32-unknown-unknown`）、TypeScript 5（strict）
- Frameworks / key dependencies: Lindera（`embedded-ipadic`）、wasm-bindgen、wasm-pack、Vite、Vitest
- Package manager: pnpm（`package.json` の `packageManager` フィールドで固定）、Cargo
- Version manager: mise（`mise.toml` で Node.js LTS と pnpm を固定）
- Lint / format / type check: Biome（TS）、`tsc --noEmit`、rustfmt、clippy。npm scripts から実行する
- Tooling (QA commands): 以下のとおり。

```bash
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test
wasm-pack build crates/engine --target web
pnpm --dir web install --frozen-lockfile
pnpm --dir web run lint
pnpm --dir web run typecheck
pnpm --dir web run test
pnpm --dir web run build
```

### Other constraints
- ホスティングは GitHub Pages のみ（静的ファイル、サーバー処理なし）

## 10. Open Questions & Risks
- IPADIC を同梱した wasm はサイズが大きく（数十 MB 規模になる可能性）、初回読み込みが遅くなる。gzip/brotli 配信や辞書の別ファイル化を実装時に検討する
- IPADIC が伸ばし棒・波ダッシュを `記号` 以外の品詞（名詞など）に分類する場合や、`だよー` のように語と結合して解析する場合があるため、FR-2 の判定は品詞だけでなく文字種による後処理が必要になる
- X の共有本文の文字数上限を超える長い結果の扱い（切り詰めるか）
