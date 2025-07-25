#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import neo4j from 'neo4j-driver';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { pipeline, env } from '@xenova/transformers';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '.env') });

// Neo4j connection configuration
const NEO4J_URI = process.env.NEO4J_URI || 'bolt://localhost:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD;
if (!NEO4J_PASSWORD) {
  console.error('ERROR: NEO4J_PASSWORD environment variable is required');
  process.exit(1);
}
const VAULT_ID = process.env.VAULT_ID || 'default';

// Configure Transformers.js to use local models
(env).localURL = process.env.TRANSFORMERS_CACHE || './models';
(env).allowRemoteModels = true; // Allow downloading models if not cached

// Embedding configuration
let embeddingPipeline = null;
const embeddingDimension = 384; // all-MiniLM-L6-v2 embedding dimension
const embeddingModel = 'Xenova/all-MiniLM-L6-v2';

// Initialize Neo4j driver with error handling
let driver;
try {
  driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD), {
    maxConnectionPoolSize: 10,
    connectionTimeout: 30000, // 30 seconds
  });
  
  // Test the connection
  const session = driver.session();
  await session.run('RETURN 1');
  await session.close();
  console.error("✅ Successfully connected to Neo4j");
} catch (error) {
  console.error("❌ Failed to connect to Neo4j:", error.message);
  console.error("Make sure Neo4j is running at", NEO4J_URI);
  // Continue anyway - we'll handle connection errors in the tool handlers
  driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
}

// Load embedding model
async function loadEmbeddingModel() {
  try {
    console.error(`📚 Loading embedding model: ${embeddingModel}...`);
    embeddingPipeline = await pipeline('feature-extraction', embeddingModel);
    console.error("✅ Embedding model loaded successfully");
  } catch (error) {
    console.error("❌ Failed to load embedding model:", error);
    console.error("⚠️ Will use hash-based fallback for embeddings");
  }
}

// Generate embeddings
async function generateEmbedding(text) {
  try {
    if (embeddingPipeline) {
      // Use local sentence transformer model
      const output = await embeddingPipeline(text, {
        pooling: 'mean',
        normalize: true,
      });
      
      // Convert to regular array and ensure it's the right size
      const embedding = Array.from(output.data);
      
      // Validate embedding dimension
      if (embedding.length !== embeddingDimension) {
        console.error(`Warning: Embedding dimension mismatch. Expected ${embeddingDimension}, got ${embedding.length}`);
        // Pad or truncate as needed
        while (embedding.length < embeddingDimension) {
          embedding.push(0);
        }
        if (embedding.length > embeddingDimension) {
          embedding.length = embeddingDimension;
        }
      }
      
      return embedding;
    } else {
      // Fallback: Hash-based embedding
      const { createHash } = await import('crypto');
      const hash = createHash("sha256").update(text).digest("hex");
      const vector = [];
      
      for (let i = 0; i < Math.min(hash.length, embeddingDimension * 8); i += 8) {
        const val = parseInt(hash.substring(i, i + 8), 16) / Math.pow(16, 8);
        vector.push((val - 0.5) * 2);
      }
      
      // Pad or trim to correct dimension
      while (vector.length < embeddingDimension) {
        vector.push(0.0);
      }
      vector.length = embeddingDimension;
      
      // Normalize vector
      const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
      return norm > 0 ? vector.map(val => val / norm) : vector;
    }
  } catch (error) {
    console.error("❌ Embedding generation failed:", error);
    // Return random normalized vector as fallback
    const randomVector = Array.from({ length: embeddingDimension }, () => Math.random() - 0.5);
    const norm = Math.sqrt(randomVector.reduce((sum, val) => sum + val * val, 0));
    return randomVector.map(val => val / norm);
  }
}

// Initialize embedding model
await loadEmbeddingModel();

// Create server instance
const server = new Server(
  {
    name: "neo4j-knowledge-graph",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Error handling
server.onerror = (error) => {
  console.error('[Neo4j Server] Error:', error);
};

// Helper function to run queries
async function runQuery(query, params = {}) {
  const session = driver.session();
  try {
    const result = await session.run(query, params);
    return result.records.map(record => record.toObject());
  } catch (error) {
    console.error("Query error:", error.message);
    throw new Error(`Neo4j query failed: ${error.message}. Make sure Neo4j is running and accessible.`);
  } finally {
    await session.close();
  }
}

// Tool: Search notes by content
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "search_notes",
      description: "Search notes by title or content using full-text search",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query"
          },
          limit: {
            type: "number",
            description: "Maximum number of results (default: 10)",
            default: 10
          }
        },
        required: ["query"]
      }
    },
    {
      name: "find_related_notes",
      description: "Find notes related to a specific note",
      inputSchema: {
        type: "object",
        properties: {
          note_id: {
            type: "string",
            description: "ID of the source note"
          },
          depth: {
            type: "number",
            description: "How many relationship hops to traverse (default: 2)",
            default: 2
          },
          relationship_type: {
            type: "string",
            description: "Optional: filter by relationship type (e.g., LINKS_TO, REFERENCES)"
          }
        },
        required: ["note_id"]
      }
    },
    {
      name: "get_note_graph",
      description: "Get the relationship graph around a specific note",
      inputSchema: {
        type: "object",
        properties: {
          note_id: {
            type: "string",
            description: "ID of the central note"
          },
          depth: {
            type: "number",
            description: "Graph depth (default: 1)",
            default: 1
          }
        },
        required: ["note_id"]
      }
    },
    {
      name: "find_patterns",
      description: "Find recurring patterns or themes in the knowledge graph",
      inputSchema: {
        type: "object",
        properties: {
          pattern_type: {
            type: "string",
            description: "Type of pattern to search for",
            enum: ["common_themes", "hub_notes", "clusters", "bridges"]
          },
          min_occurrence: {
            type: "number",
            description: "Minimum occurrence count (default: 3)",
            default: 3
          }
        },
        required: ["pattern_type"]
      }
    },
    {
      name: "query_graph",
      description: "Execute a custom Cypher query on the knowledge graph",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Cypher query to execute (read-only queries only)"
          },
          params: {
            type: "object",
            description: "Query parameters",
            default: {}
          }
        },
        required: ["query"]
      }
    },
    {
      name: "get_tags",
      description: "Get all tags or tags for specific notes",
      inputSchema: {
        type: "object",
        properties: {
          note_ids: {
            type: "array",
            items: { type: "string" },
            description: "Optional: filter tags by note IDs"
          }
        }
      }
    },
    {
      name: "find_by_tag",
      description: "Find all notes with specific tags",
      inputSchema: {
        type: "object",
        properties: {
          tags: {
            type: "array",
            items: { type: "string" },
            description: "Tags to search for"
          },
          match_all: {
            type: "boolean",
            description: "Whether to match all tags (AND) or any tag (OR)",
            default: false
          }
        },
        required: ["tags"]
      }
    },
    {
      name: "generate_note_embedding",
      description: "Generate embedding vector for a note's content",
      inputSchema: {
        type: "object",
        properties: {
          text: {
            type: "string",
            description: "Text to generate embedding for (usually title + content)"
          }
        },
        required: ["text"]
      }
    }
  ]
}));

// Tool handlers
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  try {
    switch (name) {
      case "search_notes": {
        const { query, limit = 10 } = args;
        
        try {
          // Try full-text search first
          const cypher = `
            CALL db.index.fulltext.queryNodes('note_content', $query) 
            YIELD node, score
            WHERE node.vault_id = $vault_id
            RETURN node.id AS id, node.title AS title, node.path AS path, 
                   node.content AS content, score
            ORDER BY score DESC
            LIMIT $limit
          `;
          const results = await runQuery(cypher, { 
            query, 
            limit: neo4j.int(limit),
            vault_id: VAULT_ID 
          });
          
          return {
            content: [{
              type: "text",
              text: JSON.stringify(results, null, 2)
            }]
          };
        } catch (error) {
          // If full-text index doesn't exist, fall back to pattern matching
          console.error("Full-text search failed, falling back to pattern matching:", error.message);
          const fallbackCypher = `
            MATCH (n:Note)
            WHERE n.vault_id = $vault_id 
              AND (n.title CONTAINS $query OR n.content CONTAINS $query)
            RETURN n.id AS id, n.title AS title, n.path AS path, 
                   substring(n.content, 0, 200) AS content, 1.0 AS score
            ORDER BY n.modified DESC
            LIMIT $limit
          `;
          const results = await runQuery(fallbackCypher, { 
            query, 
            limit: neo4j.int(limit),
            vault_id: VAULT_ID 
          });
          
          return {
            content: [{
              type: "text",
              text: JSON.stringify(results, null, 2)
            }]
          };
        }
      }
      
      case "find_related_notes": {
        const { note_id, depth = 2, relationship_type } = args;
        const relPattern = relationship_type ? `:${relationship_type}` : '';
        const cypher = `
          MATCH (start:Note {id: $note_id, vault_id: $vault_id})
          MATCH path = (start)-[${relPattern}*1..${depth}]-(related:Note)
          WHERE related.vault_id = $vault_id AND related.id <> $note_id
          RETURN DISTINCT related.id AS id, related.title AS title, 
                 related.path AS path, length(path) AS distance
          ORDER BY distance, related.title
        `;
        const results = await runQuery(cypher, { 
          note_id, 
          vault_id: VAULT_ID 
        });
        
        return {
          content: [{
            type: "text",
            text: JSON.stringify(results, null, 2)
          }]
        };
      }
      
      case "get_note_graph": {
        const { note_id, depth = 1 } = args;
        
        try {
          // Try APOC first (if available)
          const cypher = `
            MATCH (center:Note {id: $note_id, vault_id: $vault_id})
            CALL apoc.path.subgraphAll(center, {
              maxLevel: ${depth},
              relationshipFilter: null,
              labelFilter: '+Note',
              bfs: true
            })
            YIELD nodes, relationships
            WITH [node in nodes WHERE node.vault_id = $vault_id | {
              id: node.id,
              title: node.title,
              type: labels(node)[0]
            }] AS nodes,
            [rel in relationships | {
              from: startNode(rel).id,
              to: endNode(rel).id,
              type: type(rel),
              properties: properties(rel)
            }] AS edges
            RETURN nodes, edges
          `;
          const results = await runQuery(cypher, { 
            note_id,
            vault_id: VAULT_ID 
          });
          
          return {
            content: [{
              type: "text",
              text: JSON.stringify(results[0] || { nodes: [], edges: [] }, null, 2)
            }]
          };
        } catch (error) {
          // Fallback if APOC is not available
          console.error("APOC not available, using manual traversal:", error.message);
          const fallbackCypher = `
            MATCH path = (center:Note {id: $note_id, vault_id: $vault_id})-[*0..${depth}]-(connected:Note)
            WHERE connected.vault_id = $vault_id
            WITH collect(DISTINCT center) + collect(DISTINCT connected) AS allNodes,
                 collect(DISTINCT relationships(path)) AS allRels
            UNWIND allRels AS rels
            UNWIND rels AS rel
            WITH allNodes, collect(DISTINCT rel) AS allRelationships
            RETURN 
              [node in allNodes | {
                id: node.id,
                title: node.title,
                type: labels(node)[0]
              }] AS nodes,
              [rel in allRelationships | {
                from: startNode(rel).id,
                to: endNode(rel).id,
                type: type(rel),
                properties: properties(rel)
              }] AS edges
          `;
          const results = await runQuery(fallbackCypher, { 
            note_id,
            vault_id: VAULT_ID 
          });
          
          return {
            content: [{
              type: "text",
              text: JSON.stringify(results[0] || { nodes: [], edges: [] }, null, 2)
            }]
          };
        }
      }
      
      case "find_patterns": {
        const { pattern_type, min_occurrence = 3 } = args;
        let cypher = '';
        
        switch (pattern_type) {
          case "common_themes":
            cypher = `
              MATCH (n:Note)-[:HAS_TAG]->(t:Tag)
              WHERE n.vault_id = $vault_id AND t.vault_id = $vault_id
              WITH t.name AS theme, count(DISTINCT n) AS occurrence
              WHERE occurrence >= $min_occurrence
              RETURN theme, occurrence
              ORDER BY occurrence DESC
            `;
            break;
            
          case "hub_notes":
            cypher = `
              MATCH (n:Note)
              WHERE n.vault_id = $vault_id
              WITH n, size((n)-[]-()) AS connections
              WHERE connections >= $min_occurrence
              RETURN n.id AS id, n.title AS title, connections
              ORDER BY connections DESC
              LIMIT 20
            `;
            break;
            
          case "clusters":
            cypher = `
              MATCH (n1:Note)-[]->(n2:Note)-[]->(n3:Note)-[]->(n1)
              WHERE n1.vault_id = $vault_id 
                AND n2.vault_id = $vault_id 
                AND n3.vault_id = $vault_id
                AND id(n1) < id(n2) < id(n3)
              RETURN n1.title AS node1, n2.title AS node2, n3.title AS node3,
                     count(*) AS strength
              ORDER BY strength DESC
              LIMIT 20
            `;
            break;
            
          case "bridges":
            cypher = `
              MATCH (n:Note)
              WHERE n.vault_id = $vault_id
              WITH n, size((n)-[]-()) AS degree
              WHERE degree >= 2
              MATCH (n)-[r1]-(neighbor1:Note), (n)-[r2]-(neighbor2:Note)
              WHERE neighbor1.vault_id = $vault_id 
                AND neighbor2.vault_id = $vault_id
                AND id(neighbor1) < id(neighbor2)
                AND NOT (neighbor1)-[]-(neighbor2)
              RETURN n.id AS bridge_id, n.title AS bridge_title,
                     count(DISTINCT neighbor1) + count(DISTINCT neighbor2) AS connections
              ORDER BY connections DESC
              LIMIT 20
            `;
            break;
        }
        
        const results = await runQuery(cypher, { 
          vault_id: VAULT_ID,
          min_occurrence: neo4j.int(min_occurrence)
        });
        
        return {
          content: [{
            type: "text",
            text: JSON.stringify(results, null, 2)
          }]
        };
      }
      
      case "query_graph": {
        const { query, params = {} } = args;
        
        // Basic safety check - only allow read queries
        const lowerQuery = query.toLowerCase();
        if (lowerQuery.includes('create') || 
            lowerQuery.includes('delete') || 
            lowerQuery.includes('set') || 
            lowerQuery.includes('merge') || 
            lowerQuery.includes('remove')) {
          throw new Error("Only read queries are allowed");
        }
        
        // Add vault_id to params if not present
        const enrichedParams = { ...params, vault_id: VAULT_ID };
        const results = await runQuery(query, enrichedParams);
        
        return {
          content: [{
            type: "text",
            text: JSON.stringify(results, null, 2)
          }]
        };
      }
      
      case "get_tags": {
        const { note_ids } = args;
        let cypher;
        
        if (note_ids && note_ids.length > 0) {
          cypher = `
            MATCH (n:Note)-[:HAS_TAG]->(t:Tag)
            WHERE n.vault_id = $vault_id 
              AND t.vault_id = $vault_id
              AND n.id IN $note_ids
            RETURN DISTINCT t.name AS tag, count(n) AS count
            ORDER BY count DESC, tag
          `;
        } else {
          cypher = `
            MATCH (t:Tag)
            WHERE t.vault_id = $vault_id
            OPTIONAL MATCH (t)<-[:HAS_TAG]-(n:Note)
            WHERE n.vault_id = $vault_id
            RETURN t.name AS tag, count(n) AS count
            ORDER BY count DESC, tag
          `;
        }
        
        const results = await runQuery(cypher, { 
          vault_id: VAULT_ID,
          note_ids: note_ids || []
        });
        
        return {
          content: [{
            type: "text",
            text: JSON.stringify(results, null, 2)
          }]
        };
      }
      
      case "find_by_tag": {
        const { tags, match_all = false } = args;
        let cypher;
        
        if (match_all) {
          cypher = `
            MATCH (n:Note)
            WHERE n.vault_id = $vault_id
              AND ALL(tag IN $tags WHERE 
                EXISTS((n)-[:HAS_TAG]->(:Tag {name: tag, vault_id: $vault_id}))
              )
            RETURN n.id AS id, n.title AS title, n.path AS path
            ORDER BY n.modified DESC
          `;
        } else {
          cypher = `
            MATCH (n:Note)-[:HAS_TAG]->(t:Tag)
            WHERE n.vault_id = $vault_id 
              AND t.vault_id = $vault_id
              AND t.name IN $tags
            RETURN DISTINCT n.id AS id, n.title AS title, n.path AS path
            ORDER BY n.modified DESC
          `;
        }
        
        const results = await runQuery(cypher, { 
          vault_id: VAULT_ID,
          tags
        });
        
        return {
          content: [{
            type: "text",
            text: JSON.stringify(results, null, 2)
          }]
        };
      }
      
      case "generate_note_embedding": {
        const { text } = args;
        
        try {
          const embedding = await generateEmbedding(text);
          
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                embedding,
                dimension: embeddingDimension,
                model: embeddingModel
              }, null, 2)
            }]
          };
        } catch (error) {
          return {
            content: [{
              type: "text",
              text: `Error generating embedding: ${error.message}`
            }],
            isError: true
          };
        }
      }
      
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [{
        type: "text",
        text: `Error: ${error.message}`
      }],
      isError: true
    };
  }
});

// Handle shutdown gracefully
process.on('SIGINT', async () => {
  await driver.close();
  process.exit(0);
});

// Keep process alive
process.stdin.resume();

// Start the server
const transport = new StdioServerTransport();
await server.connect(transport);

console.error("Neo4j MCP server started");
console.error(`Connected to: ${NEO4J_URI}`);
console.error(`Vault ID: ${VAULT_ID}`);