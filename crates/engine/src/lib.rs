//! 日本語テキストを品詞大分類のタグ列 (`[名詞][助詞]...`) に変換するエンジン。

use std::borrow::Cow;
use std::sync::OnceLock;

use lindera::dictionary::load_dictionary;
use lindera::error::LinderaError;
use lindera::mode::Mode;
use lindera::segmenter::Segmenter;

/// 変換エラー。
#[derive(Debug)]
pub enum Error {
    /// 辞書の読み込みまたは形態素解析に失敗した。
    Lindera(String),
}

impl std::fmt::Display for Error {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Error::Lindera(msg) => write!(f, "morphological analysis failed: {msg}"),
        }
    }
}

impl std::error::Error for Error {}

impl From<LinderaError> for Error {
    fn from(e: LinderaError) -> Self {
        Error::Lindera(e.to_string())
    }
}

// 辞書の展開は重いため、一度だけ構築して再利用する。
static SEGMENTER: OnceLock<Result<Segmenter, String>> = OnceLock::new();

fn segmenter() -> Result<&'static Segmenter, Error> {
    SEGMENTER
        .get_or_init(|| {
            load_dictionary("embedded://ipadic")
                .map(|dict| Segmenter::new(Mode::Normal, dict, None))
                .map_err(|e| e.to_string())
        })
        .as_ref()
        .map_err(|msg| Error::Lindera(msg.clone()))
}

/// 入力を形態素解析し、各トークンを品詞大分類の `[品詞]` に置き換えた文字列を返す。
pub fn convert(input: &str) -> Result<String, Error> {
    if input.is_empty() {
        return Ok(String::new());
    }
    let mut tokens = segmenter()?.segment(Cow::Borrowed(input))?;
    let mut out = String::new();
    for token in tokens.iter_mut() {
        // IPADIC の詳細の先頭が品詞大分類。未知語などで欠ける場合は「未知語」とする。
        let pos = token.get_detail(0).unwrap_or("未知語");
        out.push('[');
        out.push_str(pos);
        out.push(']');
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn converts_sentence_to_pos_tags() {
        assert_eq!(
            convert("猫が走る").unwrap_or_default(),
            "[名詞][助詞][動詞]"
        );
    }

    #[test]
    fn empty_input_yields_empty_output() {
        assert_eq!(convert("").unwrap_or_else(|e| e.to_string()), "");
    }
}
