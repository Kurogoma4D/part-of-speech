//! wasm-bindgen バインディング。変換ロジックは `crate::convert` に置き、ここは境界の変換だけを行う。

use wasm_bindgen::prelude::*;

/// 辞書の展開を呼び出し側が選んだ時点（ローディング表示中）に済ませるためのウォームアップ。
#[wasm_bindgen(js_name = init)]
pub fn init_js() -> Result<(), JsError> {
    crate::warm_up().map_err(|e| JsError::new(&e.to_string()))
}

/// 日本語テキストを品詞タグ列に変換する。失敗時は JS の例外として投げる。
#[wasm_bindgen(js_name = convert)]
pub fn convert_js(input: &str) -> Result<String, JsError> {
    crate::convert(input).map_err(|e| JsError::new(&e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use wasm_bindgen_test::wasm_bindgen_test;

    #[wasm_bindgen_test]
    fn converts_via_wasm_binding() {
        assert_eq!(
            convert_js("猫が走る")
                .map_err(|_| ())
                .expect("convert failed"),
            "[名詞][助詞][動詞]"
        );
    }
}
