//! IPADIC のソースを取得し、品詞大分類だけを残して辞書をビルドする。
//!
//! 変換が使うのは `get_detail(0)`（品詞）だけなので、品詞細分類・活用・原形・読みは `*` に置き換える。
//! 形態素解析の結果は左右文脈 ID・コスト・表層形で決まるため、これらは変更しない。

use std::error::Error;
use std::fs;
use std::io::Read;
use std::path::Path;

use lindera_dictionary::builder::DictionaryBuilder;
use lindera_dictionary::dictionary::metadata::Metadata;

const URL: &str = "https://Lindera.dev/mecab-ipadic-2.7.0-20250920.tar.gz";
const SRC_DIR: &str = "mecab-ipadic-2.7.0-20250920";
const MD5: &str = "a95c409f12f1023fce8ef91f991ef042";
/// 先頭から残す列数: 表層形・左 ID・右 ID・コスト・品詞大分類。
const KEEP_COLUMNS: usize = 5;
const TOTAL_COLUMNS: usize = 13;

fn trim_csv(text: &str) -> String {
    let mut out = String::with_capacity(text.len() / 2);
    for line in text.lines() {
        let cols: Vec<&str> = line.split(',').collect();
        if cols.len() < TOTAL_COLUMNS {
            out.push_str(line);
        } else {
            out.push_str(&cols[..KEEP_COLUMNS].join(","));
            for _ in KEEP_COLUMNS..TOTAL_COLUMNS {
                out.push_str(",*");
            }
        }
        out.push('\n');
    }
    out
}

fn download() -> Result<Vec<u8>, Box<dyn Error>> {
    let agent: ureq::Agent = ureq::Agent::config_builder()
        .http_status_as_error(true)
        .build()
        .into();
    let mut body = Vec::new();
    agent
        .get(URL)
        .call()?
        .into_body()
        .into_reader()
        .take(256 * 1024 * 1024)
        .read_to_end(&mut body)?;
    let actual = format!("{:x}", md5::compute(&body));
    if actual != MD5 {
        return Err(format!("md5 mismatch for {URL}: {actual}").into());
    }
    Ok(body)
}

fn main() -> Result<(), Box<dyn Error>> {
    println!("cargo:rerun-if-changed=build.rs");
    println!("cargo:rerun-if-changed=dict/metadata.json");

    let out = Path::new(&std::env::var("OUT_DIR")?).to_path_buf();
    let work = out.join("src");
    let dict_out = out.join("ipadic-pos");
    let _ = fs::remove_dir_all(&work);
    let _ = fs::remove_dir_all(&dict_out);
    fs::create_dir_all(&work)?;

    let archive = download()?;
    tar::Archive::new(flate2::read::GzDecoder::new(&archive[..])).unpack(&work)?;

    let src = work.join(SRC_DIR);
    for entry in fs::read_dir(&src)? {
        let path = entry?.path();
        if path.extension().is_some_and(|e| e == "csv") {
            fs::write(&path, trim_csv(&fs::read_to_string(&path)?))?;
        }
    }

    let metadata: Metadata = serde_json::from_str(&fs::read_to_string("dict/metadata.json")?)?;
    DictionaryBuilder::new(metadata).build_dictionary(&src, &dict_out)?;

    // lindera_dictionary::embedded_dictionary! が include_bytes! で参照する。
    println!("cargo:rustc-env=LINDERA_WORKDIR={}", out.display());
    Ok(())
}
