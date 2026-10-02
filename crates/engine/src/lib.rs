//! 日本語テキストを品詞大分類のタグ列 (`[名詞][助詞]...`) に変換するエンジン。

mod wasm;

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

// 読み込み失敗もプロセス終了まで保持される。辞書は埋め込みのため再試行しても結果は変わらない。
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
///
/// 記号・空白・改行・波ダッシュ・語末の伸ばし棒は置き換えず原文のまま出力する。
pub fn convert(input: &str) -> Result<String, Error> {
    if input.is_empty() {
        return Ok(String::new());
    }
    let text = drop_inner_long_vowels(input);
    let mut tokens = segmenter()?.segment(Cow::Borrowed(&*text))?;
    let mut out = String::new();
    let mut pos_end = 0;
    for token in tokens.iter_mut() {
        // Lindera は空白や改行をトークンとして返さないことがあるため、隙間は原文を出す。
        out.push_str(&text[pos_end..token.byte_start]);
        pos_end = token.byte_end;
        let pos = token.get_detail(0).map(str::to_owned);
        if pos.as_deref() == Some("記号") {
            out.push_str(&text[token.byte_start..token.byte_end]);
        } else {
            push_converted(
                &mut out,
                &text[token.byte_start..token.byte_end],
                pos.as_deref(),
            );
        }
    }
    out.push_str(&text[pos_end..]);
    Ok(out)
}

fn is_hiragana(c: char) -> bool {
    matches!(c, '\u{3041}'..='\u{309F}')
}

// 「すごーい」のように平仮名の直後で語中にある伸ばし棒は、IPADIC が語を分断するため
// 解析前に取り除く。語の一部なので出力には影響しない。語末の伸ばし棒や、
// 平仮名以外が続く伸ばし棒は残す。取り除く対象が無ければ入力を借用のまま返す。
fn drop_inner_long_vowels(input: &str) -> Cow<'_, str> {
    let mut out: Option<String> = None;
    let mut kept_from = 0;
    let mut after_hiragana = false;
    let mut iter = input.char_indices().peekable();
    while let Some((i, c)) = iter.next() {
        if c == 'ー' && after_hiragana {
            // 連続する伸ばし棒は一度の走査でまとめて判定する。
            let mut end = i + c.len_utf8();
            while let Some(&(j, n)) = iter.peek() {
                if n != 'ー' {
                    break;
                }
                end = j + n.len_utf8();
                iter.next();
            }
            if input[end..].chars().next().is_some_and(is_hiragana) {
                out.get_or_insert_with(|| String::with_capacity(input.len()))
                    .push_str(&input[kept_from..i]);
                kept_from = end;
            }
            continue;
        }
        after_hiragana = is_hiragana(c);
    }
    match out {
        Some(mut s) => {
            s.push_str(&input[kept_from..]);
            Cow::Owned(s)
        }
        None => Cow::Borrowed(input),
    }
}

// 空白・波ダッシュ・伸ばし棒・記号類は IPADIC が記号以外に分類したり語と結合したりするため、
// 品詞ではなく文字種で判定し、トークン前後の該当部分だけを原文のまま残す。
fn is_passthrough(c: char) -> bool {
    c == 'ー' || c == 'ｰ' || c == '－' || !c.is_alphanumeric()
}

fn is_katakana(c: char) -> bool {
    matches!(c, '\u{30A1}'..='\u{30FA}' | '\u{30FD}'..='\u{30FF}')
}

// 語末の連なり (伸ばし棒・波ダッシュ・空白・記号) の開始位置を返す。
// カタカナ語の末尾の「ー」は語の構成要素なので延長とみなさない。
fn trailing_start(surface: &str) -> usize {
    let trimmed = surface.trim_end_matches(is_passthrough);
    let mut start = trimmed.len();
    if trimmed.chars().next_back().is_some_and(is_katakana) && surface[start..].starts_with('ー') {
        start += 'ー'.len_utf8();
    }
    start
}

fn push_converted(out: &mut String, surface: &str, pos: Option<&str>) {
    let lead = surface.len() - surface.trim_start_matches(is_passthrough).len();
    let (head, rest) = surface.split_at(lead);
    out.push_str(head);
    if rest.is_empty() {
        return;
    }
    let tail = trailing_start(rest);
    push_tag(out, pos);
    out.push_str(&rest[tail..]);
}

// IPADIC の詳細の先頭が品詞大分類。詳細が欠ける場合は「未知語」とする。
fn push_tag(out: &mut String, pos: Option<&str>) {
    out.push('[');
    out.push_str(pos.unwrap_or("未知語"));
    out.push(']');
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn converts_sentence_to_pos_tags() {
        assert_eq!(
            convert("猫が走る").expect("convert failed"),
            "[名詞][助詞][動詞]"
        );
    }

    #[test]
    fn empty_input_yields_empty_output() {
        assert_eq!(convert("").expect("convert failed"), "");
    }

    #[test]
    fn converts_japanese_mixed_with_ascii() {
        assert_eq!(
            convert("Rustは速い").expect("convert failed"),
            "[名詞][助詞][形容詞]"
        );
    }

    #[test]
    fn repeated_calls_return_identical_results() {
        let first = convert("猫が走る").expect("convert failed");
        let second = convert("猫が走る").expect("convert failed");
        assert_eq!(first, second);
    }

    #[test]
    fn missing_detail_falls_back_to_unknown_tag() {
        let mut out = String::new();
        push_tag(&mut out, None);
        push_tag(&mut out, Some("名詞"));
        assert_eq!(out, "[未知語][名詞]");
    }

    fn c(s: &str) -> String {
        convert(s).expect("convert failed")
    }

    #[test]
    fn trailing_long_vowel_and_punctuation_are_kept() {
        assert_eq!(
            c("今日はいい天気だねー。"),
            "[名詞][助詞][形容詞][名詞][助動詞][助詞]ー。"
        );
    }

    #[test]
    fn wave_dash_and_symbols_are_kept() {
        assert_eq!(c("えっ〜！？"), "[感動詞]〜！？");
        assert_eq!(c("えっ～！？"), "[感動詞]～！？");
    }

    #[test]
    fn long_vowel_inside_word_is_converted() {
        assert_eq!(c("コーヒー"), "[名詞]");
        assert_eq!(c("すごーい"), "[形容詞]");
    }

    #[test]
    fn word_extension_is_kept() {
        assert_eq!(c("だよー"), "[助動詞][助詞]ー");
        assert_eq!(c("ねーー"), "[助詞]ーー");
        assert_eq!(c("だよｰ"), "[助動詞][助詞]ｰ");
        assert_eq!(c("コーヒーー"), "[名詞]ー");
        assert_eq!(c("ー"), "ー");
    }

    #[test]
    fn whitespace_and_newlines_keep_positions() {
        let out = c("猫が \u{3000}走る\t犬\n猫\r\n犬");
        assert_eq!(out, "[名詞][助詞] \u{3000}[動詞]\t[名詞]\n[名詞]\r\n[名詞]");
    }

    #[test]
    fn symbol_only_and_blank_inputs_are_kept() {
        assert_eq!(c("！？"), "！？");
        assert_eq!(c("－"), "－");
        assert_eq!(c("---"), "---");
        assert_eq!(c("!?#"), "!?#");
        assert_eq!(c("😀"), "😀");
        assert_eq!(c("  \u{3000}\n"), "  \u{3000}\n");
    }

    #[test]
    fn symbols_between_words_are_kept() {
        assert_eq!(c("猫－犬"), "[名詞]－[名詞]");
        assert_eq!(c("猫!犬"), "[名詞]![名詞]");
        assert_eq!(c("猫😀犬"), "[名詞]😀[名詞]");
    }

    #[test]
    fn long_vowel_before_non_hiragana_is_kept() {
        assert_eq!(c("あーA"), "[フィラー]ー[名詞]");
        assert_eq!(c("ええーー1"), "[フィラー][フィラー]ーー[名詞]");
        assert_eq!(c("すごーーい"), "[形容詞]");
    }

    #[test]
    fn drop_inner_long_vowels_only_drops_before_hiragana() {
        assert_eq!(drop_inner_long_vowels("すごーい"), "すごい");
        assert_eq!(drop_inner_long_vowels("すごーーーい"), "すごい");
        assert_eq!(drop_inner_long_vowels("あーA"), "あーA");
        assert_eq!(drop_inner_long_vowels("ええーー1"), "ええーー1");
        assert_eq!(drop_inner_long_vowels("だよー"), "だよー");
        assert_eq!(drop_inner_long_vowels("コーヒーい"), "コーヒーい");
        assert_eq!(drop_inner_long_vowels("あーいーう"), "あいう");
    }

    #[test]
    fn drop_inner_long_vowels_borrows_when_unchanged() {
        assert!(matches!(
            drop_inner_long_vowels("猫が走る"),
            Cow::Borrowed(_)
        ));
        assert!(matches!(drop_inner_long_vowels("だよー"), Cow::Borrowed(_)));
        assert!(matches!(drop_inner_long_vowels("すごーい"), Cow::Owned(_)));
    }
}
