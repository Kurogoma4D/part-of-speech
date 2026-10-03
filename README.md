# 例の歌詞のやつ

日本語のテキストを分かち書きし、各単語を文脈に沿った `[挨拶]` `[人名]` `[動詞]` のようなラベルに置き換えて表示する Web サイトです。記号・伸ばし棒・空白・改行などは元の文字のまま残ります。ラベルの付け方は [書き換えガイド](docs/rewrite-guide.md) に従います。

```
入力: こんにちは、田中さん！
出力: [挨拶]、[人名][敬称]！
```

入力したテキストは変換のために Cloudflare Workers AI（LLM）へ送信されます。Cloudflare Turnstile によるボット検証も行います。送信元 IP ごとに 60 秒あたり 5 回までの変換に制限しています（`web/wrangler.jsonc` の `ratelimits`）。この値はロケーションごとのおおよその値です。全体では AI Gateway `part-of-speech` のレート制限により、10 分あたり 300 回の推論までに制限しています。入力テキストはログに残しません。

## 機能

- 「変換」ボタン（Ctrl/Cmd+Enter でも可）で変換。入力は 200 文字、異なる行は 20 行まで
- 失敗時のエラー表示と再試行
- 変換結果のコピー
- 変換結果の X への共有
- ライト/ダークモード対応

## 技術スタック

- ホスティング / BFF: Cloudflare Workers（Static Assets でフロントエンドを配信し、`POST /api/convert` を Worker が処理）
- 推論: Cloudflare Workers AI（モデル ID は `web/wrangler.jsonc` の `vars.MODEL`）
- フロントエンド: Vite + TypeScript
- テスト: Vitest
- Lint / Format: Biome、`tsc --noEmit`
- デプロイ: `master` への push で GitHub Actions が `wrangler deploy` を実行

## ディレクトリ構成

```
web/src/          # フロントエンド（Vite + TypeScript）
web/worker/       # BFF（Cloudflare Worker）
web/wrangler.jsonc  # Worker の設定
docs/brand.md     # ブランドガイド
docs/rewrite-guide.md  # LLM 書き換えガイド
spec.md           # 仕様書
```

## 開発

[mise](https://mise.jdx.dev/) で Node.js と pnpm を揃えます。

```bash
mise install
pnpm --dir web install --frozen-lockfile

# ローカル開発用の設定（どちらも gitignore 済み。Cloudflare 公開のテスト用キーを使う）
echo 'TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA' > web/.dev.vars
echo 'VITE_TURNSTILE_SITEKEY=1x00000000000000000000AA' > web/.env.local

# ビルドして Worker ごと起動（Workers AI は Cloudflare アカウントへのリモート接続を使うため wrangler のログインが必要）
pnpm --dir web run build
pnpm --dir web exec wrangler dev
```

本番の Turnstile シークレットキーは Worker の secret `TURNSTILE_SECRET_KEY` に登録します（`wrangler secret put TURNSTILE_SECRET_KEY`）。デプロイ用の `CLOUDFLARE_API_TOKEN` と `CLOUDFLARE_ACCOUNT_ID` は GitHub Actions の Secrets に登録します。

## チェック

```bash
pnpm --dir web install --frozen-lockfile
pnpm --dir web run lint
pnpm --dir web run typecheck
pnpm --dir web run test
pnpm --dir web run build
```
