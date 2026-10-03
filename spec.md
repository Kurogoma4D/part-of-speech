# part-of-speech — Specification

> Status: Draft · Last updated: 2026-10-02

## 1. Overview
入力された日本語テキストを LLM（Cloudflare Workers AI）で分かち書きし、各語を `[挨拶]` `[人名]` `[動詞]` のような文脈に沿ったラベルに置き換えて表示する Web サイト。記号・伸ばし棒・空白・改行などは変換せず元の文字のまま残す。ラベルの選び方・出力形式・検証ルールは `docs/rewrite-guide.md` に従う。

フロントエンドと BFF（`POST /api/convert`）を 1 つの Cloudflare Worker（Static Assets）で配信する。

例を以下に示す。

```
入力: こんにちは、田中さん！
出力: [挨拶]、[人名][敬称]！
```

## 2. Goals & Success Criteria
- テキストを入力して「変換」を押すと、ラベル列に変換される
- 記号・伸ばし棒・空白・改行が入力どおりの位置に残る
- 200 文字を超える入力と、他オリジンからのリクエストは拒否される
- `master` への push で Cloudflare Workers に自動デプロイされる

## 3. Scope
- Cloudflare Worker（BFF）による Workers AI を使った分かち書きとラベル付け
- Vite + TypeScript による単一ページのフロントエンド
- 変換ボタンによる 1 回ごとの変換
- 変換結果のコピーボタン
- 変換結果の X への共有ボタン
- Turnstile によるボット検証
- デザイントークン・ロゴ・favicon・OGP 画像・ブランドガイド
- GitHub Actions による Cloudflare Workers へのデプロイ

## 4. Out of Scope
- 日本語以外の言語の解析
- ユーザー辞書の追加・編集
- 変換結果のキャッシュ、変換履歴の保存
- トークンのホバー表示・ラベルごとの色分け

## 5. Functional Requirements
### FR-1: 変換 API
- `POST /api/convert` は `{ "text": string, "turnstileToken": string }` を受け取り、`{ "result": string }` を返す
- 処理順序は次のとおり
  1. `Origin` が Worker 自身のオリジンと一致しなければ 403
  2. 送信元 IP（`cf-connecting-ip`）ごとに 60 秒あたり 5 回を超えれば 429（Workers Rate Limiting binding `RATE_LIMITER`）。カウンターはロケーションごとのため、おおよその値
  3. `text` が空、200 文字を超える、または推論対象の異なる行（文字・数字を含む行）が 20 行を超えれば 400
  4. Turnstile トークンを siteverify で検証し、失敗なら 403
  5. Workers AI にガイドのプロンプトで行ごとに推論させる（同時実行は 4 行まで、同じ行は 1 回だけ）
  6. 出力がガイドの形式に合わなければ 1 回だけ再推論し、それでも合わなければ 502。推論の失敗は 503
  7. 推論は AI Gateway `part-of-speech` 経由で実行する。ゲートウェイのレート制限（全体で 600 秒あたり 300 回、sliding window）を超えた場合は再推論せず 429。ゲートウェイはリクエストのログ記録（Collect logs）とキャッシュを無効にして運用する（入力テキストを残さないため）
- エラーレスポンスは `{ "error": string }`。入力テキストはログに出さない
- モデル ID は `web/wrangler.jsonc` の `vars.MODEL` で差し替える

### FR-2: 変換しない文字の保持
- ガイドの保持対象（記号、空白、改行、絵文字、`笑` `w`、伸ばし棒、小書き文字、一部の助詞）は元の文字のまま出力する
- 受け入れ基準
  - `走れ！\n止まるな…` → `[命令形]！\n[動詞][終助詞]…`
  - 改行を含む複数行の入力で、改行位置が入力と一致する

### FR-3: 入力と結果表示
- 「変換」ボタン（Ctrl/Cmd+Enter でも可）で BFF を 1 回呼ぶ。リアルタイム変換はしない
- 入力欄に 200 文字の上限を設け、残り文字数を表示する
- Turnstile ウィジェットを表示し、そのトークンをリクエストに含める。変換のたびにウィジェットをリセットする
- 変換中はボタンを無効にし、処理中であることを表示する
- 失敗したらエラーメッセージと再試行ボタンを表示する

### FR-4: 結果のコピー
- ボタン押下で変換結果をクリップボードへコピーし、完了を表示する
- 結果が空のときはボタンを無効化する

### FR-5: X への共有
- ボタン押下で変換結果とサイト URL を本文に入れた X の投稿画面（`https://x.com/intent/post`）を新しいタブで開く
- 結果が空のときはボタンを無効化する

### FR-6: Cloudflare Workers デプロイ
- `master` への push でフロントエンドをビルドし、`wrangler deploy` で Worker `part-of-speech` にデプロイする
- 公開 URL は `https://part-of-speech.kurogoma4d.workers.dev/`。Vite の `base` は `/`

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
- 入力テキストは変換のために Cloudflare Workers AI へ送信される。入力テキストをログに残さない
- Turnstile トークンの検証と Origin 検査で、他サイトや自動化された利用を制限する
- キーボード操作で入力・変換・コピー・共有ができ、ボタンにアクセシブルな名前を付ける
- モバイル幅でもレイアウトが崩れない

## 8. Supply-Chain Security
- Dependencies: `pnpm-lock.yaml` をコミットする

## 9. Constraints
### Project metadata
- Repository: `Kurogoma4D/part-of-speech`
- Structure: 以下のとおり。

```
web/src/          # Vite + TypeScript フロントエンド
web/worker/       # Cloudflare Worker（BFF）
web/wrangler.jsonc  # Worker の設定（Static Assets、AI バインディング、MODEL）
docs/brand.md     # ブランドガイド
docs/rewrite-guide.md  # LLM 書き換えガイド（出力形式・ラベル選択・プロンプト案）
.github/workflows # CI と Cloudflare Workers デプロイ
```

### Tech stack
- Language: TypeScript 5（strict）
- Frameworks / key dependencies: Vite、Vitest、Wrangler、Cloudflare Workers AI、Cloudflare Turnstile
- Package manager: pnpm（`package.json` の `packageManager` フィールドで固定）
- Version manager: mise（`mise.toml` で Node.js LTS と pnpm を固定）
- Lint / format / type check: Biome、`tsc --noEmit`。npm scripts から実行する
- Tooling (QA commands): 以下のとおり。

```bash
pnpm --dir web install --frozen-lockfile
pnpm --dir web run lint
pnpm --dir web run typecheck
pnpm --dir web run test
pnpm --dir web run build
```

### Other constraints
- ホスティングは Cloudflare Workers（Static Assets + Worker）。Turnstile のシークレットキーは Worker の secret `TURNSTILE_SECRET_KEY` で管理する

## 10. Open Questions & Risks
- LLM は原文の欠落や記号の書き換えなどでガイドの検証に落ちることがあり、再推論でも失敗すると 502 になる
- Workers AI の無料枠（1 日 10,000 Neurons）を超えると推論が 503 になる
- X の共有本文の文字数上限を超える長い結果は末尾を切り詰める
