use anyhow::Result;
use tokio::process::Command;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use std::process::Stdio;

pub async fn test_direct_stdio() -> Result<()> {
    println!("🧪 Testing direct stdio communication...");
    
    let mut cmd = Command::new("node");
    cmd.arg("./mcp-servers/test-server/index.js");
    cmd.stdin(Stdio::piped());
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());
    
    // Set working directory
    if let Ok(current_dir) = std::env::current_dir() {
        if current_dir.file_name().and_then(|s| s.to_str()) == Some("src-tauri") {
            if let Some(parent) = current_dir.parent() {
                println!("📁 Setting working directory to: {:?}", parent);
                cmd.current_dir(parent);
            }
        }
    }
    
    println!("🚀 Spawning MCP server...");
    let mut child = cmd.spawn()?;
    
    let stdin = child.stdin.take().unwrap();
    let stdout = child.stdout.take().unwrap();
    let stderr = child.stderr.take().unwrap();
    
    let mut stdout_reader = BufReader::new(stdout);
    let mut stderr_reader = BufReader::new(stderr);
    
    // Start stderr reader
    tokio::spawn(async move {
        let mut line = String::new();
        loop {
            line.clear();
            match stderr_reader.read_line(&mut line).await {
                Ok(0) => break,
                Ok(_) => println!("📕 STDERR: {}", line.trim()),
                Err(e) => {
                    eprintln!("Error reading stderr: {}", e);
                    break;
                }
            }
        }
    });
    
    // Give server time to start
    tokio::time::sleep(std::time::Duration::from_millis(500)).await;
    
    // Send initialize request
    let request = r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-01-10","capabilities":{"experimental":{}},"clientInfo":{"name":"test","version":"0.1.0"}}}"#;
    
    println!("📤 Sending: {}", request);
    let mut stdin = stdin;
    stdin.write_all(request.as_bytes()).await?;
    stdin.write_all(b"\n").await?;
    stdin.flush().await?;
    println!("✅ Request sent");
    
    // Try to read response
    println!("📥 Waiting for response...");
    let mut line = String::new();
    
    match tokio::time::timeout(
        std::time::Duration::from_secs(5),
        stdout_reader.read_line(&mut line)
    ).await {
        Ok(Ok(0)) => println!("❌ EOF on stdout"),
        Ok(Ok(n)) => println!("✅ Read {} bytes: {}", n, line.trim()),
        Ok(Err(e)) => println!("❌ Read error: {}", e),
        Err(_) => println!("❌ Timeout waiting for response"),
    }
    
    // Clean up
    let _ = child.kill().await;
    
    Ok(())
}