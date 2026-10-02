# 例の歌詞のやつ

日本語のテキストを分かち書きし、各単語を `[名詞]` `[動詞]` のような品詞タグに置き換えて表示する Web サイトです。記号・伸ばし棒・波ダッシュ・空白・改行は元の文字のまま残ります。

```
入力: 今日はいい天気だねー。
出力: [名詞][助詞][形容詞][名詞][助動詞][助詞]ー。
```

形態素解析はブラウザ内の WebAssembly で行うため、入力したテキストが外部に送信されることはありません。

## 機能

- 入力に合わせたリアルタイム変換
- 変換結果のコピー
- 変換結果の X への共有
- ライト/ダークモード対応

## 技術スタック

- 解析エンジン: Rust + [Lindera](https://github.com/lindera/lindera)（IPADIC 同梱）を wasm-bindgen / wasm-pack で WebAssembly 化
- フロントエンド: Vite + TypeScript
- テスト: `cargo test`、Vitest
- Lint / Format: rustfmt、clippy、Biome
- ホスティング: GitHub Pages（`master` への push で GitHub Actions がデプロイ）

## ディレクトリ構成

```
crates/engine/    # 品詞タグ変換エンジン（Rust → wasm）
web/              # フロントエンド（Vite + TypeScript）
docs/brand.md     # ブランドガイド
docs/rewrite-guide.md  # LLM 書き換えガイド
spec.md           # 仕様書
```

## 開発

[mise](https://mise.jdx.dev/) で Node.js と pnpm を、`rust-toolchain.toml` で Rust のバージョンを揃えます。[wasm-pack](https://rustwasm.github.io/wasm-pack/) も必要です。

```bash
mise install
rustup target add wasm32-unknown-unknown

# 依存関係のインストール
pnpm --dir web install --frozen-lockfile

# wasm のビルド（crates/engine/pkg を生成。フロントエンドの起動・ビルドの前に必要）
pnpm --dir web run build:wasm

# フロントエンドの起動
pnpm --dir web run dev
```

wasm のビルド時に IPADIC のソースアーカイブ（`mecab-ipadic-2.7.0-20250920.tar.gz`）を取得し、品詞大分類だけに絞った辞書を埋め込みます。オフライン環境では環境変数 `IPADIC_ARCHIVE` にローカルのアーカイブへのパスを指定すると、ダウンロードの代わりにそのファイルを使います（MD5 は同様に検証されます）。

```bash
IPADIC_ARCHIVE=/path/to/mecab-ipadic-2.7.0-20250920.tar.gz pnpm --dir web run build:wasm
```

## チェック

```bash
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test
pnpm --dir web run build:wasm
pnpm --dir web run lint
pnpm --dir web run typecheck
pnpm --dir web run test
pnpm --dir web run build
```
