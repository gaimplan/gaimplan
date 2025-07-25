use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use crate::ai_settings_multi::get_ai_settings;
use futures_util::StreamExt;
use reqwest::header::{HeaderMap, HeaderValue, CONTENT_TYPE, AUTHORIZATION};
use serde_json::json;

#[tauri::command]
pub async fn test_messages(messages: Vec<ChatMessage>) -> Result<String, String> {
    println!("\n=== TEST_MESSAGES CALLED ===");
    println!("Received {} messages", messages.len());
    for (i, msg) in messages.iter().enumerate() {
        println!("Message {}: role='{}', content='{}'", i, msg.role, msg.content);
    }
    Ok(format!("Received {} messages", messages.len()))
}

#[tauri::command]
pub async fn debug_send_ai_chat(
    _app: AppHandle,
    messages: Vec<ChatMessage>,
) -> Result<String, String> {
    println!("\n=== DEBUG_SEND_AI_CHAT CALLED ===");
    println!("Received {} messages", messages.len());
    
    if messages.is_empty() {
        return Err("Messages array is empty".to_string());
    }
    
    // Just echo back what we received
    let debug_info = format!(
        "Received {} messages. First message: role='{}', content='{}'",
        messages.len(),
        messages[0].role,
        messages[0].content
    );
    
    Ok(debug_info)
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub function_call: Option<FunctionCall>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<ToolCall>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ToolCall {
    pub id: String,
    #[serde(rename = "type")]
    pub call_type: String,
    pub function: FunctionCall,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct FunctionCall {
    pub name: String,
    pub arguments: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Function {
    pub name: String,
    pub description: String,
    pub parameters: serde_json::Value,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ChatOptions {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub functions: Option<Vec<Function>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub function_call: Option<String>, // "auto" or specific function name
}

#[derive(Clone, Debug, Serialize)]
pub struct StreamChunk {
    #[serde(rename = "type")]
    pub chunk_type: String, // "content", "error", "done"
    pub content: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Deserialize)]
struct OpenAIStreamChunk {
    choices: Vec<Choice>,
}

#[derive(Debug, Deserialize)]
struct Choice {
    delta: Delta,
}

#[derive(Debug, Deserialize)]
struct Delta {
    content: Option<String>,
}

#[tauri::command]
pub async fn send_ai_chat(
    app: AppHandle,
    messages: Vec<ChatMessage>,
) -> Result<String, String> {
    println!("\n=== SEND_AI_CHAT CALLED ===");
    println!("Starting AI chat...");
    
    // Debug the raw input
    println!("Messages type info: Vec<ChatMessage>");
    println!("Received {} messages", messages.len());
    
    if messages.is_empty() {
        println!("ERROR: Messages array is empty!");
        println!("This likely means the JavaScript array was not properly serialized");
        return Err("No messages provided".to_string());
    }
    
    for (i, msg) in messages.iter().enumerate() {
        println!("Message {}: role='{}', content_length={}", i, msg.role, msg.content.len());
        println!("  Content preview: {}", &msg.content[..msg.content.len().min(50)]);
    }
    
    // Get settings
    let settings = match get_ai_settings(app).await? {
        Some(s) => {
            println!("Got settings: endpoint={}, model={}", s.endpoint, s.model);
            s
        },
        None => {
            return Err("No AI settings configured".to_string());
        }
    };
    
    // Build request - Use longer timeout for Ollama to handle large responses
    let is_ollama = settings.endpoint.contains("ollama") || settings.endpoint.contains("11434");
    let timeout_duration = if is_ollama {
        // 5 minutes for Ollama to process large responses
        std::time::Duration::from_secs(300)
    } else {
        // 30 seconds for other providers
        std::time::Duration::from_secs(30)
    };
    
    let client = reqwest::Client::builder()
        .timeout(timeout_duration)
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;
    
    let url = format!("{}/chat/completions", settings.endpoint.trim_end_matches('/'));
    
    // Clone messages to ensure they're not moved
    let messages_clone = messages.clone();
    println!("Messages before JSON: {} items", messages_clone.len());
    
    let mut request_body = serde_json::json!({
        "model": settings.model,
        "messages": messages_clone,
        "temperature": settings.temperature,
        "max_tokens": settings.max_tokens,
        "stream": false
    });
    
    println!("Request body: {}", serde_json::to_string_pretty(&request_body).unwrap());
    
    // Handle Ollama's native API format (only if not using OpenAI compatibility endpoint)
    if (settings.endpoint.contains("ollama") || settings.endpoint.contains("11434")) 
        && !settings.endpoint.contains("/v1") 
        && !settings.endpoint.contains("chat/completions") {
        println!("Detected Ollama native endpoint, reformatting request...");
        // Ollama uses a different format for its native API
        let prompt = messages.last()
            .map(|m| m.content.clone())
            .unwrap_or_default();
        
        request_body = serde_json::json!({
            "model": settings.model,
            "prompt": prompt,
            "stream": false
        });
    } else {
        println!("Using OpenAI-compatible format");
    }
    
    let mut request = client.post(&url);
    
    // Add auth header if API key is present
    if let Some(api_key) = &settings.api_key {
        if !api_key.is_empty() {
            request = request.header("Authorization", format!("Bearer {}", api_key));
        }
    }
    
    request = request
        .header("Content-Type", "application/json")
        .json(&request_body);
    
    println!("Final request body being sent: {}", serde_json::to_string(&request_body).unwrap());
    
    // Send request and get response
    let response = match request.send().await {
        Ok(resp) => resp,
        Err(e) => {
            return Err(format!("Failed to connect: {}", e));
        }
    };
    
    if !response.status().is_success() {
        let status = response.status();
        let error_text = response.text().await.unwrap_or_default();
        println!("API Error - Status: {}, Error: {}", status, error_text);
        println!("Request URL was: {}", url);
        println!("Request had {} messages", messages.len());
        return Err(format!("API error ({}): {}", status, error_text));
    }
    
    // Parse JSON response
    let response_text = response.text().await
        .map_err(|e| format!("Failed to read response: {}", e))?;
    
    let json: serde_json::Value = serde_json::from_str(&response_text)
        .map_err(|e| format!("Failed to parse JSON: {}", e))?;
    
    // Extract content from response
    if let Some(choices) = json.get("choices").and_then(|c| c.as_array()) {
        if let Some(first_choice) = choices.first() {
            if let Some(content) = first_choice
                .get("message")
                .and_then(|m| m.get("content"))
                .and_then(|c| c.as_str())
            {
                return Ok(content.to_string());
            }
        }
    }
    
    // Handle Ollama format
    if let Some(response_content) = json.get("response").and_then(|r| r.as_str()) {
        return Ok(response_content.to_string());
    }
    
    Err("No content found in response".to_string())
}

#[tauri::command]
pub async fn check_ollama_status(endpoint: String) -> Result<bool, String> {
    // Check if Ollama is responsive by hitting the tags endpoint
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(2))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;
    
    let base_url = endpoint.trim_end_matches("/v1").trim_end_matches("/v1/chat/completions");
    let status_url = format!("{}/api/tags", base_url);
    
    match client.get(&status_url).send().await {
        Ok(resp) => Ok(resp.status().is_success()),
        Err(_) => Ok(false)
    }
}

#[tauri::command]
pub async fn send_ai_chat_with_functions(
    app: AppHandle,
    messages: Vec<ChatMessage>,
    options: Option<ChatOptions>,
) -> Result<serde_json::Value, String> {
    println!("\n=== SEND_AI_CHAT_WITH_FUNCTIONS CALLED ===");
    println!("Starting AI chat with function calling support...");
    
    // Debug the raw input
    println!("Received {} messages", messages.len());
    if let Some(ref opts) = options {
        if let Some(ref funcs) = opts.functions {
            println!("Received {} functions", funcs.len());
            for func in funcs {
                println!("  Function: {} - {}", func.name, func.description);
            }
        }
    }
    
    if messages.is_empty() {
        return Err("No messages provided".to_string());
    }
    
    // Get settings
    let settings = match get_ai_settings(app).await? {
        Some(s) => {
            println!("Got settings: endpoint={}, model={}", s.endpoint, s.model);
            s
        },
        None => {
            return Err("No AI settings configured".to_string());
        }
    };
    
    // Build request - Use longer timeout for Ollama to handle large responses
    let is_ollama = settings.endpoint.contains("ollama") || settings.endpoint.contains("11434");
    let timeout_duration = if is_ollama {
        // 5 minutes for Ollama to process large responses
        std::time::Duration::from_secs(300)
    } else {
        // 30 seconds for other providers
        std::time::Duration::from_secs(30)
    };
    
    let client = reqwest::Client::builder()
        .timeout(timeout_duration)
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;
    
    let url = format!("{}/chat/completions", settings.endpoint.trim_end_matches('/'));
    
    // Clone messages to ensure they're not moved
    let messages_clone = messages.clone();
    
    let mut request_body = serde_json::json!({
        "model": settings.model,
        "messages": messages_clone,
        "temperature": settings.temperature,
        "max_tokens": settings.max_tokens,
        "stream": false
    });
    
    // Add functions if provided
    if let Some(opts) = options {
        if let Some(functions) = opts.functions {
            // Check endpoint type
            let is_gemini = settings.endpoint.contains("generativelanguage.googleapis.com");
            
            if settings.endpoint.contains("ollama") || settings.endpoint.contains("11434") || is_gemini {
                // Ollama and Gemini use 'tools' format instead of 'functions'
                let tools: Vec<serde_json::Value> = functions.into_iter().map(|f| {
                    serde_json::json!({
                        "type": "function",
                        "function": {
                            "name": f.name,
                            "description": f.description,
                            "parameters": f.parameters
                        }
                    })
                }).collect();
                request_body["tools"] = serde_json::json!(tools);
                
                // Tool choice format
                if let Some(function_call) = opts.function_call {
                    request_body["tool_choice"] = serde_json::json!(function_call);
                }
                
                if is_gemini {
                    println!("Using tools format for Gemini endpoint");
                }
            } else {
                // Standard OpenAI format
                request_body["functions"] = serde_json::json!(functions);
                if let Some(function_call) = opts.function_call {
                    request_body["function_call"] = serde_json::json!(function_call);
                } else {
                    request_body["function_call"] = serde_json::json!("auto");
                }
            }
        }
    }
    
    println!("Request body: {}", serde_json::to_string_pretty(&request_body).unwrap());
    
    // Note: We now support Ollama's native format for function calling
    
    let mut request = client.post(&url);
    
    // Add auth header if API key is present
    if let Some(api_key) = &settings.api_key {
        if !api_key.is_empty() {
            request = request.header("Authorization", format!("Bearer {}", api_key));
        }
    }
    
    request = request
        .header("Content-Type", "application/json")
        .json(&request_body);
    
    println!("Sending request to {} with timeout: {:?}", url, timeout_duration);
    if is_ollama {
        println!("Note: Using extended timeout for Ollama. Large responses may take up to 5 minutes to process.");
    }
    
    // Send request and get response
    let response = match request.send().await {
        Ok(resp) => resp,
        Err(e) => {
            if is_ollama && e.is_timeout() {
                return Err(format!("Ollama request timed out after 5 minutes. The model may still be processing. Try a smaller request or faster model."));
            }
            return Err(format!("Failed to connect: {}", e));
        }
    };
    
    if !response.status().is_success() {
        let status = response.status();
        let error_text = response.text().await.unwrap_or_default();
        println!("API Error - Status: {}, Error: {}", status, error_text);
        return Err(format!("API error ({}): {}", status, error_text));
    }
    
    // Parse JSON response
    let response_text = response.text().await
        .map_err(|e| format!("Failed to read response: {}", e))?;
    
    let json: serde_json::Value = serde_json::from_str(&response_text)
        .map_err(|e| format!("Failed to parse JSON: {}", e))?;
    
    // Return the full response for the frontend to handle
    Ok(json)
}

#[tauri::command]
pub async fn search_notes_by_name(
    search_term: String,
    state: tauri::State<'_, crate::AppState>,
) -> Result<Vec<crate::NoteSearchResult>, String> {
    let vault_lock = state.vault.lock().await;
    
    match &*vault_lock {
        Some(vault) => {
            let files = vault.list_markdown_files()
                .map_err(|e| format!("Failed to list files: {}", e))?;
            
            let mut results = Vec::new();
            
            for file in files {
                let file_name = file.file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or("");
                
                // Fuzzy match
                if file_name.to_lowercase().contains(&search_term.to_lowercase()) {
                    results.push(crate::NoteSearchResult {
                        name: file_name.to_string(),
                        path: file.strip_prefix(vault.path())
                            .unwrap_or(&file)
                            .to_string_lossy()
                            .to_string(),
                    });
                }
            }
            
            // Sort by relevance (exact matches first)
            results.sort_by(|a, b| {
                let a_exact = a.name.to_lowercase() == search_term.to_lowercase();
                let b_exact = b.name.to_lowercase() == search_term.to_lowercase();
                b_exact.cmp(&a_exact).then(a.name.cmp(&b.name))
            });
            
            Ok(results)
        }
        None => Err("No vault opened".to_string()),
    }
}

// Streaming implementation
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type")]
pub enum StreamEvent {
    Token { content: String },
    FunctionCall { name: String, arguments: String },
    ToolCall { id: String, name: String, arguments: String },
    Error { message: String },
    Done,
}

#[tauri::command]
pub async fn send_ai_chat_stream(
    app: AppHandle,
    messages: Vec<ChatMessage>,
) -> Result<(), String> {
    println!("\n=== SEND_AI_CHAT_STREAM CALLED ===");
    println!("Starting AI chat with streaming...");
    
    // Get settings
    let settings = match get_ai_settings(app.clone()).await? {
        Some(s) => {
            println!("Got settings: endpoint={}, model={}", s.endpoint, s.model);
            s
        },
        None => {
            return Err("No AI settings configured".to_string());
        }
    };
    
    // Clone app handle for event emission
    let app_handle = app.clone();
    
    // Spawn async task for streaming
    tokio::spawn(async move {
        if let Err(e) = stream_chat_response(app_handle, messages, settings).await {
            println!("Streaming error: {}", e);
        }
    });
    
    Ok(())
}

async fn stream_chat_response(
    app: AppHandle,
    messages: Vec<ChatMessage>,
    settings: crate::ai_settings_multi::AISettings,
) -> Result<(), String> {
    // Build request with streaming enabled
    let is_ollama = settings.endpoint.contains("ollama") || settings.endpoint.contains("11434");
    let timeout_duration = if is_ollama {
        std::time::Duration::from_secs(300)
    } else {
        std::time::Duration::from_secs(30)
    };
    
    let client = reqwest::Client::builder()
        .timeout(timeout_duration)
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;
    
    let url = format!("{}/chat/completions", settings.endpoint.trim_end_matches('/'));
    
    let mut request_body = json!({
        "model": settings.model,
        "messages": messages,
        "temperature": settings.temperature,
        "max_tokens": settings.max_tokens,
        "stream": true  // Enable streaming
    });
    
    // Handle Ollama's native API format if needed
    if (settings.endpoint.contains("ollama") || settings.endpoint.contains("11434")) 
        && !settings.endpoint.contains("/v1") 
        && !settings.endpoint.contains("chat/completions") {
        println!("Detected Ollama native endpoint - streaming not supported in native format");
        app.emit("ai-stream-event", StreamEvent::Error { 
            message: "Streaming not supported for Ollama native API. Use OpenAI-compatible endpoint.".to_string() 
        }).map_err(|e| format!("Failed to emit error: {}", e))?;
        return Ok(());
    }
    
    // Build headers
    let mut headers = HeaderMap::new();
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
    
    if let Some(api_key) = &settings.api_key {
        if !api_key.is_empty() {
            headers.insert(
                AUTHORIZATION,
                HeaderValue::from_str(&format!("Bearer {}", api_key))
                    .map_err(|_| "Invalid API key format".to_string())?
            );
        }
    }
    
    // Send request
    let response = client
        .post(&url)
        .headers(headers)
        .json(&request_body)
        .send()
        .await
        .map_err(|e| format!("Failed to connect: {}", e))?;
    
    if !response.status().is_success() {
        let status = response.status();
        let error_text = response.text().await.unwrap_or_default();
        app.emit("ai-stream-event", StreamEvent::Error { 
            message: format!("API error ({}): {}", status, error_text) 
        }).map_err(|e| format!("Failed to emit error: {}", e))?;
        return Ok(());
    }
    
    // Process the SSE stream
    let mut stream = response.bytes_stream();
    let mut buffer = String::new();
    
    while let Some(chunk_result) = stream.next().await {
        match chunk_result {
            Ok(chunk) => {
                // Convert bytes to string and add to buffer
                let chunk_str = String::from_utf8_lossy(&chunk);
                buffer.push_str(&chunk_str);
                
                // Process complete SSE events from buffer
                while let Some(event_end) = buffer.find("\n\n") {
                    let event = buffer[..event_end].to_string();
                    buffer = buffer[event_end + 2..].to_string();
                    
                    // Parse SSE event
                    if let Some(data_line) = event.lines().find(|line| line.starts_with("data: ")) {
                        let data = &data_line[6..]; // Skip "data: "
                        
                        if data == "[DONE]" {
                            app.emit("ai-stream-event", StreamEvent::Done)
                                .map_err(|e| format!("Failed to emit done: {}", e))?;
                            return Ok(());
                        }
                        
                        // Parse JSON chunk
                        if let Ok(json) = serde_json::from_str::<serde_json::Value>(data) {
                            // Extract content from OpenAI format
                            if let Some(choices) = json.get("choices").and_then(|c| c.as_array()) {
                                if let Some(first_choice) = choices.first() {
                                    // Handle content tokens
                                    if let Some(content) = first_choice
                                        .get("delta")
                                        .and_then(|d| d.get("content"))
                                        .and_then(|c| c.as_str())
                                    {
                                        if !content.is_empty() {
                                            app.emit("ai-stream-event", StreamEvent::Token { 
                                                content: content.to_string() 
                                            }).map_err(|e| format!("Failed to emit token: {}", e))?;
                                        }
                                    }
                                    
                                    // Handle function calls
                                    if let Some(function_call) = first_choice
                                        .get("delta")
                                        .and_then(|d| d.get("function_call"))
                                    {
                                        if let (Some(name), Some(args)) = (
                                            function_call.get("name").and_then(|n| n.as_str()),
                                            function_call.get("arguments").and_then(|a| a.as_str())
                                        ) {
                                            app.emit("ai-stream-event", StreamEvent::FunctionCall { 
                                                name: name.to_string(),
                                                arguments: args.to_string()
                                            }).map_err(|e| format!("Failed to emit function call: {}", e))?;
                                        }
                                    }
                                    
                                    // Handle tool calls (OpenAI format)
                                    if let Some(tool_calls) = first_choice
                                        .get("delta")
                                        .and_then(|d| d.get("tool_calls"))
                                        .and_then(|t| t.as_array())
                                    {
                                        for tool_call in tool_calls {
                                            if let (Some(id), Some(function)) = (
                                                tool_call.get("id").and_then(|i| i.as_str()),
                                                tool_call.get("function")
                                            ) {
                                                if let (Some(name), Some(args)) = (
                                                    function.get("name").and_then(|n| n.as_str()),
                                                    function.get("arguments").and_then(|a| a.as_str())
                                                ) {
                                                    app.emit("ai-stream-event", StreamEvent::ToolCall { 
                                                        id: id.to_string(),
                                                        name: name.to_string(),
                                                        arguments: args.to_string()
                                                    }).map_err(|e| format!("Failed to emit tool call: {}", e))?;
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            Err(e) => {
                app.emit("ai-stream-event", StreamEvent::Error { 
                    message: format!("Stream error: {}", e) 
                }).map_err(|e| format!("Failed to emit error: {}", e))?;
                return Ok(());
            }
        }
    }
    
    // Emit done event if we didn't receive explicit [DONE]
    app.emit("ai-stream-event", StreamEvent::Done)
        .map_err(|e| format!("Failed to emit done: {}", e))?;
    
    Ok(())
}

#[tauri::command]
pub async fn send_ai_chat_with_functions_stream(
    app: AppHandle,
    messages: Vec<ChatMessage>,
    options: Option<ChatOptions>,
) -> Result<(), String> {
    println!("\n=== SEND_AI_CHAT_WITH_FUNCTIONS_STREAM CALLED ===");
    println!("Starting AI chat with function calling and streaming...");
    
    // Get settings
    let settings = match get_ai_settings(app.clone()).await? {
        Some(s) => s,
        None => return Err("No AI settings configured".to_string()),
    };
    
    // Clone app handle for event emission
    let app_handle = app.clone();
    
    // Spawn async task for streaming
    tokio::spawn(async move {
        if let Err(e) = stream_chat_with_functions_response(app_handle, messages, options, settings).await {
            println!("Streaming error: {}", e);
        }
    });
    
    Ok(())
}

async fn stream_chat_with_functions_response(
    app: AppHandle,
    messages: Vec<ChatMessage>,
    options: Option<ChatOptions>,
    settings: crate::ai_settings_multi::AISettings,
) -> Result<(), String> {
    // Similar to stream_chat_response but includes function/tool definitions
    let is_ollama = settings.endpoint.contains("ollama") || settings.endpoint.contains("11434");
    let timeout_duration = if is_ollama {
        std::time::Duration::from_secs(300)
    } else {
        std::time::Duration::from_secs(30)
    };
    
    let client = reqwest::Client::builder()
        .timeout(timeout_duration)
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;
    
    let url = format!("{}/chat/completions", settings.endpoint.trim_end_matches('/'));
    
    let mut request_body = json!({
        "model": settings.model,
        "messages": messages,
        "temperature": settings.temperature,
        "max_tokens": settings.max_tokens,
        "stream": true
    });
    
    // Add functions/tools if provided
    if let Some(opts) = options {
        if let Some(functions) = opts.functions {
            let is_gemini = settings.endpoint.contains("generativelanguage.googleapis.com");
            
            if is_ollama || is_gemini {
                // Ollama and Gemini use 'tools' format
                let tools: Vec<serde_json::Value> = functions.into_iter().map(|f| {
                    json!({
                        "type": "function",
                        "function": {
                            "name": f.name,
                            "description": f.description,
                            "parameters": f.parameters
                        }
                    })
                }).collect();
                request_body["tools"] = json!(tools);
                
                if let Some(function_call) = opts.function_call {
                    request_body["tool_choice"] = json!(function_call);
                }
                
                if is_gemini {
                    println!("Using tools format for Gemini endpoint (streaming)");
                }
            } else {
                // Standard OpenAI format
                request_body["functions"] = json!(functions);
                if let Some(function_call) = opts.function_call {
                    request_body["function_call"] = json!(function_call);
                } else {
                    request_body["function_call"] = json!("auto");
                }
            }
        }
    }
    
    // Build headers
    let mut headers = HeaderMap::new();
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
    
    if let Some(api_key) = &settings.api_key {
        if !api_key.is_empty() {
            headers.insert(
                AUTHORIZATION,
                HeaderValue::from_str(&format!("Bearer {}", api_key))
                    .map_err(|_| "Invalid API key format".to_string())?
            );
        }
    }
    
    // Send request
    let response = client
        .post(&url)
        .headers(headers)
        .json(&request_body)
        .send()
        .await
        .map_err(|e| format!("Failed to connect: {}", e))?;
    
    if !response.status().is_success() {
        let status = response.status();
        let error_text = response.text().await.unwrap_or_default();
        app.emit("ai-stream-event", StreamEvent::Error { 
            message: format!("API error ({}): {}", status, error_text) 
        }).map_err(|e| format!("Failed to emit error: {}", e))?;
        return Ok(());
    }
    
    // Process the stream (reuse the same logic from stream_chat_response)
    let mut stream = response.bytes_stream();
    let mut buffer = String::new();
    
    while let Some(chunk_result) = stream.next().await {
        match chunk_result {
            Ok(chunk) => {
                let chunk_str = String::from_utf8_lossy(&chunk);
                buffer.push_str(&chunk_str);
                
                while let Some(event_end) = buffer.find("\n\n") {
                    let event = buffer[..event_end].to_string();
                    buffer = buffer[event_end + 2..].to_string();
                    
                    if let Some(data_line) = event.lines().find(|line| line.starts_with("data: ")) {
                        let data = &data_line[6..];
                        
                        if data == "[DONE]" {
                            app.emit("ai-stream-event", StreamEvent::Done)
                                .map_err(|e| format!("Failed to emit done: {}", e))?;
                            return Ok(());
                        }
                        
                        if let Ok(json) = serde_json::from_str::<serde_json::Value>(data) {
                            process_stream_chunk(&app, &json)?;
                        }
                    }
                }
            }
            Err(e) => {
                app.emit("ai-stream-event", StreamEvent::Error { 
                    message: format!("Stream error: {}", e) 
                }).map_err(|e| format!("Failed to emit error: {}", e))?;
                return Ok(());
            }
        }
    }
    
    app.emit("ai-stream-event", StreamEvent::Done)
        .map_err(|e| format!("Failed to emit done: {}", e))?;
    
    Ok(())
}

fn process_stream_chunk(app: &AppHandle, json: &serde_json::Value) -> Result<(), String> {
    if let Some(choices) = json.get("choices").and_then(|c| c.as_array()) {
        if let Some(first_choice) = choices.first() {
            // Handle content tokens
            if let Some(content) = first_choice
                .get("delta")
                .and_then(|d| d.get("content"))
                .and_then(|c| c.as_str())
            {
                if !content.is_empty() {
                    app.emit("ai-stream-event", StreamEvent::Token { 
                        content: content.to_string() 
                    }).map_err(|e| format!("Failed to emit token: {}", e))?;
                }
            }
            
            // Handle function calls
            if let Some(function_call) = first_choice
                .get("delta")
                .and_then(|d| d.get("function_call"))
            {
                if let (Some(name), Some(args)) = (
                    function_call.get("name").and_then(|n| n.as_str()),
                    function_call.get("arguments").and_then(|a| a.as_str())
                ) {
                    app.emit("ai-stream-event", StreamEvent::FunctionCall { 
                        name: name.to_string(),
                        arguments: args.to_string()
                    }).map_err(|e| format!("Failed to emit function call: {}", e))?;
                }
            }
            
            // Handle tool calls
            if let Some(tool_calls) = first_choice
                .get("delta")
                .and_then(|d| d.get("tool_calls"))
                .and_then(|t| t.as_array())
            {
                for tool_call in tool_calls {
                    if let (Some(id), Some(function)) = (
                        tool_call.get("id").and_then(|i| i.as_str()),
                        tool_call.get("function")
                    ) {
                        if let (Some(name), Some(args)) = (
                            function.get("name").and_then(|n| n.as_str()),
                            function.get("arguments").and_then(|a| a.as_str())
                        ) {
                            app.emit("ai-stream-event", StreamEvent::ToolCall { 
                                id: id.to_string(),
                                name: name.to_string(),
                                arguments: args.to_string()
                            }).map_err(|e| format!("Failed to emit tool call: {}", e))?;
                        }
                    }
                }
            }
        }
    }
    
    Ok(())
}