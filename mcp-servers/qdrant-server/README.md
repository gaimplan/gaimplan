# Qdrant MCP Server

Semantic memory system for Gaimplan using Qdrant vector database. This MCP server provides vector embeddings and semantic search capabilities to complement Neo4j's structured knowledge graph.

## Features

- **Session Memory**: Store and search conversation sessions with semantic similarity
- **Pattern Embeddings**: Vector representations of patterns with Neo4j node links
- **Cross-Domain Knowledge**: Discover synthesis opportunities across different domains
- **Meta-Cognitive Insights**: Store recursive improvement insights
- **Semantic Search**: Find similar content using vector embeddings
- **Local Embeddings**: Uses sentence-transformers/all-MiniLM-L6-v2 model locally (no API required)

## Installation

```bash
cd mcp-servers/qdrant-server
npm install
npm run build
```

## Configuration

1. Copy `.env.example` to `.env`
2. Configure your settings:
   - `QDRANT_URL`: Qdrant server URL (default: http://localhost:6333)
   - `TRANSFORMERS_CACHE`: Directory for cached embedding models (default: ./models)

## Running Qdrant

```bash
# Using Docker
docker run -p 6333:6333 -p 6334:6334 \
    -v $(pwd)/qdrant_storage:/qdrant/storage:z \
    qdrant/qdrant
```

## Available Tools

### store_session_memory
Store conversation sessions with vector embeddings for similarity search.

### search_similar_sessions
Find semantically similar past sessions using vector search.

### store_pattern_embedding
Store patterns with vector representation and Neo4j node links.

### search_semantic_patterns
Find semantically similar patterns across domains.

### discover_synthesis_opportunities
Find potential cross-domain synthesis opportunities.

### get_qdrant_status
Get the current status of the Qdrant semantic memory system.

## Development

```bash
# Watch mode for development
npm run dev

# Build TypeScript
npm run build

# Start production server
npm start
```

## Integration with Gaimplan

Add to your MCP settings:

```json
{
  "qdrant": {
    "command": "node",
    "args": ["./mcp-servers/qdrant-server/dist/index.js"],
    "env": {
      "QDRANT_URL": "http://localhost:6333"
    }
  }
}
```