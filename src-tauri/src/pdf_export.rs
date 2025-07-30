use std::path::{Path, PathBuf};
use std::fs;
use std::collections::HashSet;
use base64::{Engine as _, engine::general_purpose};
use headless_chrome::{Browser, LaunchOptions};
use pulldown_cmark::{Parser, Options, html};
use serde::{Serialize, Deserialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct ExportOptions {
    pub theme: String,
    pub include_styles: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub paper_size: Option<String>,
}

impl Default for ExportOptions {
    fn default() -> Self {
        Self {
            theme: "light".to_string(),
            include_styles: true,
            paper_size: Some("A4".to_string()),
        }
    }
}

pub struct PdfExporter {
    vault_path: PathBuf,
}

impl PdfExporter {
    pub fn new(vault_path: PathBuf) -> Self {
        Self { vault_path }
    }

    /// Convert markdown content to PDF
    pub async fn export_to_pdf(
        &self,
        markdown_content: &str,
        output_path: &Path,
        options: ExportOptions,
    ) -> Result<(), String> {
        println!("📄 Starting PDF export to: {:?}", output_path);

        // Convert markdown to HTML
        let html_content = self.markdown_to_html(markdown_content)?;
        
        // Create styled HTML document
        let full_html = self.create_styled_html(&html_content, &options)?;
        
        // Generate PDF using headless Chrome
        self.html_to_pdf(&full_html, output_path).await?;
        
        println!("✅ PDF export completed successfully");
        Ok(())
    }

    /// Convert markdown to HTML with embedded images
    fn markdown_to_html(&self, markdown_content: &str) -> Result<String, String> {
        println!("🔄 Converting markdown to HTML...");
        
        // Process markdown to handle local images
        let processed_markdown = self.process_markdown_images(markdown_content)?;
        
        // Process highlight syntax (==text==) before markdown parsing
        let processed_markdown = self.process_highlight_syntax(&processed_markdown)?;
        
        // Pre-process markdown to handle single line breaks
        // Convert single newlines to double spaces + newline for proper line breaks
        let markdown_with_breaks = processed_markdown
            .lines()
            .map(|line| {
                if line.trim().is_empty() {
                    line.to_string()
                } else {
                    format!("{}  ", line)
                }
            })
            .collect::<Vec<_>>()
            .join("\n");
        
        // Set up markdown parser with extensions
        let mut options = Options::empty();
        options.insert(Options::ENABLE_TABLES);
        options.insert(Options::ENABLE_FOOTNOTES);
        options.insert(Options::ENABLE_STRIKETHROUGH);
        options.insert(Options::ENABLE_TASKLISTS);
        
        let parser = Parser::new_ext(&markdown_with_breaks, options);
        
        // Convert to HTML
        let mut html_output = String::new();
        html::push_html(&mut html_output, parser);
        
        // Sanitize HTML to prevent XSS while keeping our image data URIs
        let mut allowed_schemes = HashSet::new();
        allowed_schemes.insert("http");
        allowed_schemes.insert("https");
        allowed_schemes.insert("data");
        
        let clean_html = ammonia::Builder::default()
            .add_tags(&["img", "mark"])
            .add_tag_attributes("img", &["src", "alt", "width", "height"])
            .url_schemes(allowed_schemes)
            .clean(&html_output)
            .to_string();
        
        Ok(clean_html)
    }

    /// Process highlight syntax (==text==) to HTML <mark> tags
    fn process_highlight_syntax(&self, markdown: &str) -> Result<String, String> {
        // Process line by line to handle highlights properly
        let lines: Vec<String> = markdown.lines().map(|line| {
            // Simple state machine to track if we're inside a potential highlight
            let mut result = String::new();
            let mut chars = line.chars().peekable();
            let mut temp_buffer = String::new();
            let mut in_highlight = false;
            
            while let Some(ch) = chars.next() {
                if ch == '=' {
                    if !in_highlight {
                        // Check if this might be the start of a highlight
                        if chars.peek() == Some(&'=') {
                            chars.next(); // consume second =
                            // Always treat == as potential highlight start
                            in_highlight = true;
                            temp_buffer.clear();
                        } else {
                            result.push(ch);
                        }
                    } else {
                        // We're in a highlight, check if this is the end
                        if chars.peek() == Some(&'=') {
                            chars.next(); // consume second =
                            // Always treat == as highlight end when in highlight mode
                            result.push_str("<mark>");
                            result.push_str(&temp_buffer);
                            result.push_str("</mark>");
                            in_highlight = false;
                        } else {
                            // Single = inside highlight, add to buffer
                            temp_buffer.push(ch);
                        }
                    }
                } else {
                    if in_highlight {
                        temp_buffer.push(ch);
                    } else {
                        result.push(ch);
                    }
                }
            }
            
            // If we ended while still in highlight, it wasn't valid
            if in_highlight {
                result.push_str("==");
                result.push_str(&temp_buffer);
            }
            
            result
        }).collect();
        
        Ok(lines.join("\n"))
    }
    
    /// Process markdown to replace local image references with base64 data URIs
    fn process_markdown_images(&self, markdown: &str) -> Result<String, String> {
        let mut processed = markdown.to_string();
        
        // Regular expression to find image embeds: ![[filename.png]]
        let syntax_pattern = regex::Regex::new(r"!\[\[([^\]]+\.(png|jpg|jpeg|gif))\]\]")
            .map_err(|e| format!("Failed to create regex: {}", e))?;
        
        // Regular expression to find standard markdown images: ![alt](path)
        let standard_pattern = regex::Regex::new(r"!\[([^\]]*)\]\(([^)]+\.(png|jpg|jpeg|gif))\)")
            .map_err(|e| format!("Failed to create regex: {}", e))?;
        
        // Process syntax-style images
        for cap in syntax_pattern.captures_iter(markdown) {
            let filename = &cap[1];
            let image_path = self.vault_path.join("files").join(filename);
            
            if let Ok(base64_data) = self.image_to_base64(&image_path) {
                let replacement = format!("![{}]({})", filename, base64_data);
                processed = processed.replace(&cap[0], &replacement);
                println!("📸 Embedded image: {}", filename);
            }
        }
        
        // Process standard markdown images with local paths
        for cap in standard_pattern.captures_iter(&processed.clone()) {
            let alt_text = &cap[1];
            let image_path = &cap[2];
            
            // Check if it's a local path (not http/https)
            if !image_path.starts_with("http://") && !image_path.starts_with("https://") {
                let full_path = if image_path.starts_with("files/") {
                    self.vault_path.join(image_path)
                } else {
                    PathBuf::from(image_path)
                };
                
                if let Ok(base64_data) = self.image_to_base64(&full_path) {
                    let replacement = format!("![{}]({})", alt_text, base64_data);
                    processed = processed.replace(&cap[0], &replacement);
                    println!("📸 Embedded image: {}", image_path);
                }
            }
        }
        
        Ok(processed)
    }

    /// Convert image file to base64 data URI
    fn image_to_base64(&self, image_path: &Path) -> Result<String, String> {
        // Read image file
        let image_bytes = fs::read(image_path)
            .map_err(|e| format!("Failed to read image file: {}", e))?;
        
        // Determine content type from extension
        let extension = image_path.extension()
            .and_then(|ext| ext.to_str())
            .unwrap_or("png")
            .to_lowercase();
        
        let content_type = match extension.as_str() {
            "jpg" | "jpeg" => "image/jpeg",
            "png" => "image/png",
            "gif" => "image/gif",
            _ => "image/png"
        };
        
        // Encode to base64
        let base64_string = general_purpose::STANDARD.encode(&image_bytes);
        
        Ok(format!("data:{};base64,{}", content_type, base64_string))
    }

    /// Create a styled HTML document
    fn create_styled_html(&self, content: &str, options: &ExportOptions) -> Result<String, String> {
        let styles = if options.include_styles {
            r#"
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
                
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }
                
                body {
                    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
                    font-size: 16px;
                    line-height: 1.6;
                    color: #1a1a1a;
                    background-color: #ffffff;
                    padding: 40px;
                    max-width: 800px;
                    margin: 0 auto;
                }
                
                h1, h2, h3, h4, h5, h6 {
                    font-weight: 600;
                    margin-top: 24px;
                    margin-bottom: 16px;
                    line-height: 1.25;
                }
                
                h1 { font-size: 2.25em; border-bottom: 1px solid #e5e5e5; padding-bottom: 0.3em; }
                h2 { font-size: 1.75em; }
                h3 { font-size: 1.5em; }
                h4 { font-size: 1.25em; }
                h5 { font-size: 1.125em; }
                h6 { font-size: 1em; color: #666; }
                
                p {
                    margin-bottom: 16px;
                    line-height: 1.6;
                }
                
                br {
                    display: block;
                    margin-top: 0.5em;
                }
                
                a {
                    color: #2563eb;
                    text-decoration: none;
                }
                
                a:hover {
                    text-decoration: underline;
                }
                
                code {
                    font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
                    font-size: 0.9em;
                    padding: 2px 4px;
                    background-color: #f3f4f6;
                    border-radius: 3px;
                }
                
                pre {
                    background-color: #f8f9fa;
                    border: 1px solid #e5e7eb;
                    border-radius: 6px;
                    padding: 16px;
                    overflow-x: auto;
                    margin-bottom: 16px;
                }
                
                pre code {
                    background-color: transparent;
                    padding: 0;
                }
                
                blockquote {
                    margin: 16px 0;
                    padding-left: 16px;
                    border-left: 4px solid #e5e7eb;
                    color: #666;
                }
                
                ul, ol {
                    margin-bottom: 16px;
                    padding-left: 32px;
                }
                
                li {
                    margin-bottom: 8px;
                }
                
                img {
                    max-width: 100%;
                    height: auto;
                    border-radius: 8px;
                    margin: 16px 0;
                }
                
                table {
                    border-collapse: collapse;
                    width: 100%;
                    margin-bottom: 16px;
                }
                
                th, td {
                    border: 1px solid #e5e7eb;
                    padding: 8px 12px;
                    text-align: left;
                }
                
                th {
                    background-color: #f9fafb;
                    font-weight: 600;
                }
                
                hr {
                    border: none;
                    border-top: 1px solid #e5e7eb;
                    margin: 24px 0;
                }
                
                /* Highlights */
                mark {
                    background-color: #fef08a !important;
                    color: #000000 !important;
                    padding: 2px 4px;
                    border-radius: 2px;
                    display: inline;
                    font-weight: normal;
                }
                
                /* Task lists */
                input[type="checkbox"] {
                    margin-right: 8px;
                }
                
                /* Print-specific styles */
                @media print {
                    body {
                        padding: 0;
                        max-width: none;
                    }
                    
                    pre {
                        white-space: pre-wrap;
                        word-wrap: break-word;
                    }
                    
                    mark {
                        background-color: #fef08a !important;
                        color: #000000 !important;
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                        color-adjust: exact !important;
                    }
                }
            </style>
            "#
        } else {
            ""
        };

        let html = format!(
            r#"<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Exported Document</title>
    {}
</head>
<body>
    {}
</body>
</html>"#,
            styles,
            content
        );

        Ok(html)
    }

    /// Convert HTML to PDF using headless Chrome
    async fn html_to_pdf(&self, html: &str, output_path: &Path) -> Result<(), String> {
        println!("🌐 Launching headless Chrome...");
        
        // Launch headless Chrome
        let browser = Browser::new(LaunchOptions {
            headless: true,
            sandbox: true,
            ..Default::default()
        }).map_err(|e| format!("Failed to launch browser: {}", e))?;
        
        // Create a new tab
        let tab = browser.new_tab()
            .map_err(|e| format!("Failed to create tab: {}", e))?;
        
        // Create a temporary HTML file instead of using data URL
        use std::io::Write;
        let temp_dir = std::env::temp_dir();
        let temp_file_path = temp_dir.join(format!("gaimplan_export_{}.html", 
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis()));
        
        let mut temp_file = std::fs::File::create(&temp_file_path)
            .map_err(|e| format!("Failed to create temp file: {}", e))?;
        
        temp_file.write_all(html.as_bytes())
            .map_err(|e| format!("Failed to write temp file: {}", e))?;
        
        // Debug: Print first 500 chars of HTML to see if mark tags are present
        println!("🔍 HTML Preview (first 500 chars): {}", &html.chars().take(500).collect::<String>());
        
        temp_file.flush()
            .map_err(|e| format!("Failed to flush temp file: {}", e))?;
        
        // Navigate to the temp file
        let file_url = format!("file://{}", temp_file_path.display());
        tab.navigate_to(&file_url)
            .map_err(|e| format!("Failed to navigate: {}", e))?;
        
        // Wait for the page to load
        tab.wait_until_navigated()
            .map_err(|e| format!("Failed to wait for navigation: {}", e))?;
        
        // Give it a moment to render
        std::thread::sleep(std::time::Duration::from_millis(200));
        
        // Generate PDF
        let pdf_data = tab.print_to_pdf(None)
            .map_err(|e| format!("Failed to generate PDF: {}", e))?;
        
        // Save PDF to file
        fs::write(output_path, pdf_data)
            .map_err(|e| format!("Failed to save PDF: {}", e))?;
        
        // Clean up temp file
        let _ = fs::remove_file(&temp_file_path);
        
        println!("💾 PDF saved to: {:?}", output_path);
        
        Ok(())
    }
}

/// Export markdown content to HTML file
pub async fn export_to_html(
    markdown_content: &str,
    output_path: &Path,
    vault_path: &Path,
    options: ExportOptions,
) -> Result<(), String> {
    println!("📄 Starting HTML export to: {:?}", output_path);
    
    let exporter = PdfExporter::new(vault_path.to_path_buf());
    
    // Convert markdown to HTML
    let html_content = exporter.markdown_to_html(markdown_content)?;
    
    // Create styled HTML document
    let full_html = exporter.create_styled_html(&html_content, &options)?;
    
    // Save HTML to file
    fs::write(output_path, full_html)
        .map_err(|e| format!("Failed to save HTML: {}", e))?;
    
    println!("✅ HTML export completed successfully");
    Ok(())
}

/// Export markdown content to Word document (.doc) file
pub async fn export_to_word(
    markdown_content: &str,
    output_path: &Path,
    vault_path: &Path,
    options: ExportOptions,
) -> Result<(), String> {
    println!("📄 Starting Word export to: {:?}", output_path);
    
    let exporter = PdfExporter::new(vault_path.to_path_buf());
    
    // Convert markdown to HTML
    let html_content = exporter.markdown_to_html(markdown_content)?;
    
    // Convert <mark> tags to Word-compatible spans with background color
    let word_compatible_html = html_content
        .replace("<mark>", r#"<span style="background-color: #FFFF00;">"#)
        .replace("</mark>", "</span>");
    
    // Create Word-compatible HTML document with Office XML namespaces
    let word_html = format!(
        r#"<html xmlns:o="urn:schemas-microsoft-com:office:office"
               xmlns:w="urn:schemas-microsoft-com:office:word"
               xmlns="http://www.w3.org/TR/REC-html40">
<head>
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
    <meta name="ProgId" content="Word.Document">
    <meta name="Generator" content="gaimplan Markdown Editor">
    <meta name="Originator" content="gaimplan Markdown Editor">
    <title>Exported Document</title>
    <!--[if gte mso 9]>
    <xml>
        <w:WordDocument>
            <w:View>Print</w:View>
            <w:Zoom>100</w:Zoom>
            <w:DoNotOptimizeForBrowser/>
        </w:WordDocument>
    </xml>
    <![endif]-->
    {}
</head>
<body>
    <div class="WordSection1">
        {}
    </div>
</body>
</html>"#,
        if options.include_styles {
            r#"
    <style>
        @page WordSection1 {
            size: 8.5in 11.0in;
            margin: 1.0in 1.0in 1.0in 1.0in;
        }
        div.WordSection1 {
            page: WordSection1;
        }
        body {
            font-family: 'Inter', 'Calibri', sans-serif;
            font-size: 11pt;
            line-height: 1.6;
            color: #1a1a1a;
        }
        h1 {
            font-size: 24pt;
            font-weight: bold;
            margin-top: 24pt;
            margin-bottom: 12pt;
        }
        h2 {
            font-size: 18pt;
            font-weight: bold;
            margin-top: 18pt;
            margin-bottom: 12pt;
        }
        h3 {
            font-size: 14pt;
            font-weight: bold;
            margin-top: 14pt;
            margin-bottom: 12pt;
        }
        p {
            margin-bottom: 12pt;
        }
        a {
            color: #0563C1;
            text-decoration: underline;
        }
        code {
            font-family: 'Courier New', monospace;
            font-size: 10pt;
            background-color: #f0f0f0;
            padding: 2pt 4pt;
        }
        pre {
            font-family: 'Courier New', monospace;
            font-size: 10pt;
            background-color: #f0f0f0;
            padding: 12pt;
            border: 1pt solid #cccccc;
            margin-bottom: 12pt;
        }
        blockquote {
            margin-left: 24pt;
            margin-right: 24pt;
            font-style: italic;
            color: #666666;
        }
        table {
            border-collapse: collapse;
            margin-bottom: 12pt;
        }
        th, td {
            border: 1pt solid #cccccc;
            padding: 6pt 12pt;
        }
        th {
            background-color: #f0f0f0;
            font-weight: bold;
        }
        ul, ol {
            margin-bottom: 12pt;
        }
        li {
            margin-bottom: 6pt;
        }
        img {
            max-width: 100%;
            height: auto;
        }
    </style>
            "#
        } else {
            ""
        },
        word_compatible_html
    );
    
    // Save as .doc file
    fs::write(output_path, word_html)
        .map_err(|e| format!("Failed to save Word document: {}", e))?;
    
    println!("✅ Word export completed successfully");
    Ok(())
}