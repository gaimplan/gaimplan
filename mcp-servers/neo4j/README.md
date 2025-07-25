# Neo4j MCP Server for Gaimplan

This MCP server provides AI Chat access to your knowledge graph stored in Neo4j.

## Features

### Tools Available

1. **search_notes** - Full-text search across note titles and content
2. **find_related_notes** - Discover notes connected to a specific note
3. **get_note_graph** - Visualize the relationship network around a note
4. **find_patterns** - Detect patterns like:
   - Common themes (frequently used tags)
   - Hub notes (highly connected notes)
   - Clusters (groups of interconnected notes)
   - Bridge notes (notes connecting different clusters)
5. **query_graph** - Execute custom Cypher queries (read-only)
6. **get_tags** - List all tags or tags for specific notes
7. **find_by_tag** - Find notes with specific tags

## Installation

```bash
cd mcp-servers/neo4j
npm install
```

## Configuration

The server connects to the shared Neo4j instance. Configuration can be set via:

1. Environment variables
2. `.env` file (copy `.env.example` to `.env`)

## Usage in AI Chat

Once configured in Gaimplan's MCP settings, you can use natural language to:

- "Find all notes related to machine learning"
- "Show me the connection graph around my project notes"
- "What are the most connected topics in my knowledge base?"
- "Find patterns in how I organize information"
- "Which notes bridge different areas of my research?"

## Advanced Queries

The `query_graph` tool allows custom Cypher queries:

```cypher
// Find notes created in the last week
MATCH (n:Note)
WHERE n.vault_id = $vault_id 
  AND n.created > timestamp() - 7 * 24 * 60 * 60 * 1000
RETURN n.title, n.created
ORDER BY n.created DESC
```

## Security

- Only read queries are allowed
- Queries are automatically filtered by vault_id
- No data modification operations permitted