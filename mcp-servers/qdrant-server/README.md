# Qdrant MCP Server

A Model Context Protocol (MCP) server that provides semantic memory and pattern embeddings using Qdrant vector database.

## Embedding Model

This server now uses **Nomic AI's nomic-embed-text-v1.5** model by default, which provides:
- 768-dimensional embeddings (vs 384 previously)
- 13% better semantic quality in testing
- Full ONNX support for Transformers.js
- ~5.4ms inference time per embedding

### Model Configuration

You can configure the embedding model using the `EMBEDDING_MODEL` environment variable:

```bash
# Use the new Nomic AI model (default)
EMBEDDING_MODEL=nomic-ai/nomic-embed-text-v1.5

# Use the previous lightweight model
EMBEDDING_MODEL=Xenova/all-MiniLM-L6-v2
```

### Breaking Change Notice

⚠️ **Important**: The change from 384 to 768 dimensions means existing embeddings are incompatible. Users must re-sync their vaults after updating.

## Installation

```bash
npm install
npm run build
```

## Usage

The server is typically run via MCP integration in Gaimplan. It requires:
- Qdrant running (default: http://localhost:6333)
- Environment variables for vault configuration

## Environment Variables

- `QDRANT_URL`: Qdrant server URL (default: http://localhost:6333)
- `VAULT_NAME`: Name of the current vault
- `VAULT_ID`: ID of the current vault (fallback if VAULT_NAME not set)
- `EMBEDDING_MODEL`: Embedding model to use (default: nomic-ai/nomic-embed-text-v1.5)
- `TRANSFORMERS_CACHE`: Local cache directory for models (default: ./models)

## Development

```bash
# Run tests
npm test

# Run with watch mode
npm run dev
```

## Testing

The server includes comprehensive tests for model compatibility:

```bash
# Run all tests
npm test

# Run integration tests (requires network for model download)
EMBEDDING_MODEL=nomic-ai/nomic-embed-text-v1.5 npm test -- --testPathPattern=integration
```