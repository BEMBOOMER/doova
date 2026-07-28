//! Reads the title and favicon of a pasted link.
//!
//! The one place in Doova that touches the network, and it does so from Rust so
//! the webview's content policy can stay shut. A link block never waits for
//! this: it appears immediately showing its hostname, and fills in when, or if,
//! the answer arrives. Offline that simply never happens and the block keeps
//! working as a link.

use std::time::Duration;

use serde::Serialize;
use tauri::AppHandle;

use crate::appdirs;

const DIR: &str = "favicons";

/// Enough for any real <head>. Pages are read up to this and no further, so a
/// link to a huge file does not pull the whole thing down for a title.
const MAX_HTML: usize = 512 * 1024;
const MAX_ICON: usize = 1024 * 1024;
const TIMEOUT: Duration = Duration::from_secs(8);

/// Some sites serve a stripped page, or none at all, to a client that does not
/// look like a browser.
const USER_AGENT: &str =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Doova/1.0";

const ICON_EXTS: &[&str] = &["png", "jpg", "jpeg", "gif", "webp", "svg", "ico"];

/// Field names match the frontend's LinkMeta exactly. Calling this one `title`
/// would collide with a block's own title on the other side, where it would be
/// spread straight over it.
#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct LinkMeta {
    link_title: Option<String>,
    favicon: Option<String>,
}

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .timeout(TIMEOUT)
        .build()
        .map_err(|err| format!("Kon geen verbinding opzetten: {err}"))
}

/// Only http(s). Anything else is either not fetchable or not something a note
/// app should be opening on the user's behalf.
fn parse_web_url(url: &str) -> Result<reqwest::Url, String> {
    let parsed = reqwest::Url::parse(url).map_err(|_| "Dit is geen geldige link.".to_string())?;
    match parsed.scheme() {
        "http" | "https" => Ok(parsed),
        other => Err(format!("Links van het type {other} worden niet opgehaald.")),
    }
}

async fn body_text(response: reqwest::Response, limit: usize) -> String {
    let bytes = body_bytes(response, limit).await;
    String::from_utf8_lossy(&bytes).into_owned()
}

/// Reads chunk by chunk so the limit is a real ceiling rather than a check after
/// the fact, which would not help against a page that never ends.
async fn body_bytes(mut response: reqwest::Response, limit: usize) -> Vec<u8> {
    let mut out = Vec::new();
    while let Ok(Some(chunk)) = response.chunk().await {
        out.extend_from_slice(&chunk);
        if out.len() >= limit {
            out.truncate(limit);
            break;
        }
    }
    out
}

fn decode_entities(text: &str) -> String {
    text.replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&apos;", "'")
        .replace("&nbsp;", " ")
}

fn tidy_title(raw: &str) -> Option<String> {
    let text = decode_entities(raw).split_whitespace().collect::<Vec<_>>().join(" ");
    if text.is_empty() {
        return None;
    }
    // Long enough for a real headline, short enough to sit in a block header
    Some(if text.chars().count() > 120 {
        format!("{}…", text.chars().take(119).collect::<String>())
    } else {
        text
    })
}

/// og:title first: it is what the site itself considers the name of the page,
/// where <title> often carries the site name and a tagline as well.
fn extract_title(html: &str) -> Option<String> {
    let lower = html.to_ascii_lowercase();
    if let Some(value) = meta_content(html, &lower, "og:title") {
        if let Some(title) = tidy_title(&value) {
            return Some(title);
        }
    }
    let start = lower.find("<title")?;
    let open = lower[start..].find('>')? + start + 1;
    let end = lower[open..].find("</title>")? + open;
    tidy_title(&html[open..end])
}

/// Deliberately forgiving about attribute order and quoting, because real pages
/// are, and a strict parser would silently return nothing on half the web.
fn meta_content(html: &str, lower: &str, property: &str) -> Option<String> {
    let needle = format!("\"{property}\"");
    let single = format!("'{property}'");
    let at = lower.find(&needle).or_else(|| lower.find(&single))?;
    let tag_start = lower[..at].rfind("<meta")?;
    let tag_end = lower[tag_start..].find('>')? + tag_start;
    attribute(&html[tag_start..tag_end], &lower[tag_start..tag_end], "content")
}

fn attribute(tag: &str, lower_tag: &str, name: &str) -> Option<String> {
    let key = format!("{name}=");
    let mut from = 0;
    while let Some(found) = lower_tag[from..].find(&key) {
        let at = from + found;
        // Guard against matching inside another attribute's value, e.g. data-content=
        let preceded_by_space = at == 0 || lower_tag.as_bytes()[at - 1].is_ascii_whitespace();
        let value_at = at + key.len();
        if preceded_by_space && value_at < tag.len() {
            let rest = &tag[value_at..];
            let quote = rest.chars().next()?;
            let value = if quote == '"' || quote == '\'' {
                rest[1..].split(quote).next()?
            } else {
                rest.split_whitespace().next()?
            };
            if !value.is_empty() {
                return Some(decode_entities(value));
            }
        }
        from = at + key.len();
    }
    None
}

fn icon_href(html: &str, lower: &str) -> Option<String> {
    let mut from = 0;
    let mut best: Option<String> = None;
    while let Some(found) = lower[from..].find("<link") {
        let start = from + found;
        let Some(end_rel) = lower[start..].find('>') else { break };
        let end = start + end_rel;
        let tag = &html[start..end];
        let lower_tag = &lower[start..end];
        if let Some(rel) = attribute(tag, lower_tag, "rel") {
            let rel = rel.to_ascii_lowercase();
            if rel.split_whitespace().any(|r| r == "icon" || r == "shortcut") {
                if let Some(href) = attribute(tag, lower_tag, "href") {
                    // Later declarations tend to be the higher-resolution ones
                    best = Some(href);
                }
            }
        }
        from = end;
    }
    best
}

fn extension_for(url: &reqwest::Url, content_type: Option<&str>) -> String {
    let from_type = content_type.and_then(|ct| match ct.split(';').next()?.trim() {
        "image/png" => Some("png"),
        "image/jpeg" => Some("jpg"),
        "image/gif" => Some("gif"),
        "image/webp" => Some("webp"),
        "image/svg+xml" => Some("svg"),
        "image/x-icon" | "image/vnd.microsoft.icon" => Some("ico"),
        _ => None,
    });
    if let Some(ext) = from_type {
        return ext.to_string();
    }
    url.path()
        .rsplit_once('.')
        .map(|(_, e)| e.to_ascii_lowercase())
        .filter(|e| ICON_EXTS.contains(&e.as_str()))
        .unwrap_or_else(|| "ico".to_string())
}

async fn store_favicon(
    app: &AppHandle,
    client: &reqwest::Client,
    url: reqwest::Url,
) -> Option<String> {
    let response = client.get(url.clone()).send().await.ok()?;
    if !response.status().is_success() {
        return None;
    }
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(|v| v.to_string());
    let ext = extension_for(&url, content_type.as_deref());
    let bytes = body_bytes(response, MAX_ICON).await;
    if bytes.is_empty() {
        return None;
    }
    let file = appdirs::unique_name(&ext);
    let dir = appdirs::subdir(app, DIR).ok()?;
    std::fs::write(dir.join(&file), &bytes).ok()?;
    Some(file)
}

#[tauri::command]
pub async fn fetch_link_metadata(app: AppHandle, url: String) -> Result<LinkMeta, String> {
    let target = parse_web_url(&url)?;
    let client = client()?;

    let response = client
        .get(target.clone())
        .send()
        .await
        .map_err(|err| format!("Kon de pagina niet ophalen: {err}"))?;
    if !response.status().is_success() {
        return Err(format!("De pagina antwoordde met {}.", response.status()));
    }
    // Redirects mean the page that answered may not be the one we asked for, and
    // a relative icon path has to resolve against the one that did.
    let final_url = response.url().clone();
    let html = body_text(response, MAX_HTML).await;
    let lower = html.to_ascii_lowercase();

    let icon = icon_href(&html, &lower)
        .and_then(|href| final_url.join(&href).ok())
        .or_else(|| final_url.join("/favicon.ico").ok());

    let favicon = match icon {
        Some(icon_url) => store_favicon(&app, &client, icon_url).await,
        None => None,
    };

    Ok(LinkMeta {
        link_title: extract_title(&html),
        favicon,
    })
}

#[tauri::command]
pub fn sweep_unused_favicons(app: AppHandle, keep: Vec<String>) -> Result<usize, String> {
    appdirs::sweep(&app, DIR, &keep, ICON_EXTS)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn title_of(html: &str) -> Option<String> {
        extract_title(html)
    }

    fn icon_of(html: &str) -> Option<String> {
        icon_href(html, &html.to_ascii_lowercase())
    }

    #[test]
    fn reads_a_plain_title() {
        assert_eq!(
            title_of("<html><head><title>Hallo wereld</title></head>"),
            Some("Hallo wereld".into())
        );
    }

    #[test]
    fn prefers_og_title_over_the_document_title() {
        let html = r#"<meta property="og:title" content="De echte naam">
                      <title>De echte naam · Site · Slogan</title>"#;
        assert_eq!(title_of(html), Some("De echte naam".into()));
    }

    #[test]
    fn decodes_entities_and_collapses_whitespace() {
        let html = "<title>  Kunst &amp;\n   Cultuur  </title>";
        assert_eq!(title_of(html), Some("Kunst & Cultuur".into()));
    }

    #[test]
    fn survives_uppercase_tags_and_single_quotes() {
        let html = "<HEAD><META PROPERTY='og:title' CONTENT='Geschreeuwd'></HEAD>";
        assert_eq!(title_of(html), Some("Geschreeuwd".into()));
    }

    #[test]
    fn ignores_an_attribute_that_merely_ends_in_content() {
        // data-content= must not be mistaken for content=
        let html = r#"<meta data-content="fout" property="og:title" content="goed">"#;
        assert_eq!(title_of(html), Some("goed".into()));
    }

    #[test]
    fn shortens_an_overlong_title() {
        let html = format!("<title>{}</title>", "a".repeat(400));
        let title = title_of(&html).unwrap();
        assert_eq!(title.chars().count(), 120);
        assert!(title.ends_with('…'));
    }

    #[test]
    fn no_title_at_all_is_none() {
        assert_eq!(title_of("<html><body>niets</body></html>"), None);
        assert_eq!(title_of("<title>   </title>"), None);
    }

    #[test]
    fn finds_an_icon_and_prefers_the_last_declared() {
        let html = r#"<link rel="icon" href="/small.png">
                      <link rel="stylesheet" href="/style.css">
                      <link rel="icon" href="/big.png">"#;
        assert_eq!(icon_of(html), Some("/big.png".into()));
    }

    #[test]
    fn recognises_a_shortcut_icon() {
        let html = r#"<link rel="shortcut icon" href="/fav.ico">"#;
        assert_eq!(icon_of(html), Some("/fav.ico".into()));
    }

    #[test]
    fn ignores_links_that_are_not_icons() {
        let html = r#"<link rel="canonical" href="/page"><link rel="preload" href="/f.woff">"#;
        assert_eq!(icon_of(html), None);
    }

    #[test]
    fn extension_comes_from_the_content_type_first() {
        let url = reqwest::Url::parse("https://example.com/icon").unwrap();
        assert_eq!(extension_for(&url, Some("image/png; charset=utf-8")), "png");
    }

    #[test]
    fn extension_falls_back_to_the_path_then_to_ico() {
        let png = reqwest::Url::parse("https://example.com/a/icon.PNG").unwrap();
        assert_eq!(extension_for(&png, None), "png");
        let odd = reqwest::Url::parse("https://example.com/icon.exe").unwrap();
        assert_eq!(extension_for(&odd, None), "ico");
    }

    #[test]
    fn only_web_urls_are_fetched() {
        assert!(parse_web_url("https://example.com").is_ok());
        assert!(parse_web_url("http://example.com").is_ok());
        assert!(parse_web_url("file:///etc/passwd").is_err());
        assert!(parse_web_url("javascript:alert(1)").is_err());
        assert!(parse_web_url("niet eens een url").is_err());
    }
}
