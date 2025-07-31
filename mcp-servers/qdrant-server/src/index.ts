#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";

// QdrantClient and embedding imports
import { QdrantClient } from "@qdrant/js-client-rest";
import { pipeline, env } from "@xenova/transformers";
import { createHash } from "crypto";
import dotenv from "dotenv";
import { getEmbeddingConfig } from "./config.js";

dotenv.config();

// Configure Transformers.js to use local models
(env as any).localURL = process.env.TRANSFORMERS_CACHE || './models';
(env as any).allowRemoteModels = true; // Allow downloading models if not cached

class QdrantMCPServer {
  private server: Server;
  private qdrantClient: QdrantClient | null = null;
  private embeddingPipeline: any = null;
  private embeddingDimension: number;
  private embeddingModel: string;
  private embeddingConfig = getEmbeddingConfig();
  private vaultId: string;
  private collections: Record<string, { vectorSize: number; distance: "Cosine"; description: string }>;

  constructor() {
    // Initialize embedding configuration
    this.embeddingModel = this.embeddingConfig.modelName;
    this.embeddingDimension = this.embeddingConfig.dimensions;
    
    // Debug environment variables
    console.error(`🔍 Environment variables:`, {
      VAULT_NAME: process.env.VAULT_NAME,
      VAULT_ID: process.env.VAULT_ID,
      QDRANT_URL: process.env.QDRANT_URL,
      EMBEDDING_MODEL: process.env.EMBEDDING_MODEL || 'default'
    });
    
    console.error(`🧠 Embedding Model Configuration:`, {
      model: this.embeddingModel,
      dimensions: this.embeddingDimension,
      description: this.embeddingConfig.description
    });
    
    // Use vault name instead of ID for more readable collection names
    this.vaultId = process.env.VAULT_NAME || process.env.VAULT_ID || 'default';
    console.error(`🔑 Using vault identifier: ${this.vaultId}`);
    
    // Initialize collections with current embedding dimensions
    this.collections = {
      session_memory: {
        vectorSize: this.embeddingDimension,
        distance: "Cosine" as const,
        description: "Session memory with vector embeddings for similarity search"
      },
      pattern_embeddings: {
        vectorSize: this.embeddingDimension,
        distance: "Cosine" as const,
        description: "Pattern embeddings with links to Neo4j nodes"
      },
      cross_domain_knowledge: {
        vectorSize: this.embeddingDimension,
        distance: "Cosine" as const,
        description: "Cross-domain knowledge transfer and synthesis opportunities"
      },
      meta_cognitive_insights: {
        vectorSize: this.embeddingDimension,
        distance: "Cosine" as const,
        description: "Meta-cognitive insights for recursive improvement"
      }
    };
    
    this.server = new Server(
      {
        name: "qdrant-server",
        version: "0.1.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupTools();
    this.initialize();
  }

  private async initialize() {
    await this.loadEmbeddingModel();
    await this.connectToQdrant();
  }

  private async loadEmbeddingModel() {
    try {
      console.error(`📚 Loading embedding model: ${this.embeddingModel}...`);
      this.embeddingPipeline = await pipeline('feature-extraction', this.embeddingModel);
      console.error("✅ Embedding model loaded successfully");
    } catch (error) {
      console.error("❌ Failed to load embedding model:", error);
      console.error("⚠️ Will use hash-based fallback for embeddings");
    }
  }

  private async connectToQdrant() {
    try {
      const qdrantUrl = process.env.QDRANT_URL || "http://localhost:6333";
      console.error(`🔗 Connecting to Qdrant at ${qdrantUrl}...`);
      
      this.qdrantClient = new QdrantClient({
        url: qdrantUrl,
      });

      // Test connection and initialize collections
      await this.initializeCollections();
      console.error("✅ Qdrant connected successfully");
    } catch (error) {
      console.error("❌ Failed to connect to Qdrant:", error);
    }
  }

  private async initializeCollections() {
    if (!this.qdrantClient) return;

    try {
      const existingCollections = await this.qdrantClient.getCollections();
      const existingNames = existingCollections.collections.map(c => c.name);

      for (const [collectionName, config] of Object.entries(this.collections)) {
        // Create vault-specific collection name
        const vaultCollectionName = `${this.vaultId}_${collectionName}`;
        
        if (!existingNames.includes(vaultCollectionName)) {
          await this.qdrantClient.createCollection(vaultCollectionName, {
            vectors: {
              size: config.vectorSize,
              distance: config.distance,
            },
          });
          console.error(`📚 Created collection: ${vaultCollectionName}`);
        } else {
          console.error(`✅ Collection exists: ${vaultCollectionName}`);
        }
      }
    } catch (error) {
      console.error("❌ Collection initialization failed:", error);
    }
  }

  private _generateHashEmbedding(text: string): number[] {
    console.error("⚠️ Using hash-based fallback for embedding");
    const hash = createHash("sha256").update(text).digest("hex");
    const vector: number[] = [];

    // Adjusted for 768 dimensions
    for (let i = 0; i < Math.min(hash.length, this.embeddingDimension * 8); i += 8) {
      const val = parseInt(hash.substring(i, i + 8), 16) / Math.pow(16, 8);
      vector.push((val - 0.5) * 2);
    }

    // Pad or trim to correct dimension
    while (vector.length < this.embeddingDimension) {
      vector.push(0.0);
    }
    vector.length = this.embeddingDimension;

    // Normalize vector
    const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    return norm > 0 ? vector.map((val) => val / norm) : vector;
  }

  private async generateEmbedding(text: string): Promise<number[]> {
    try {
      if (this.embeddingPipeline) {
        // Use local sentence transformer model
        // Note: Nomic AI model uses layer normalization
        const output = await this.embeddingPipeline(text, {
          pooling: 'mean',
          normalize: true,
        });
        
        // Convert to regular array and ensure it's the right size
        const embedding = Array.from(output.data) as number[];
        
        // Validate embedding dimension
        if (embedding.length !== this.embeddingDimension) {
          console.error(`Warning: Embedding dimension mismatch. Expected ${this.embeddingDimension}, got ${embedding.length}`);
          // Pad or truncate as needed
          while (embedding.length < this.embeddingDimension) {
            embedding.push(0);
          }
          if (embedding.length > this.embeddingDimension) {
            embedding.length = this.embeddingDimension;
          }
        }
        
        return embedding;
      } else {
        // Fallback: Hash-based embedding
        return this._generateHashEmbedding(text);
      }
    } catch (error) {
      console.error("❌ Embedding generation failed:", error);
      // Fallback to deterministic hash-based embedding on error
      return this._generateHashEmbedding(text);
    }
  }

  private generatePointId(_prefix: string): string {
    // Generate a UUID v4 format string
    const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
    return uuid;
  }

  private setupTools() {
    // Store session memory tool
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: "store_session_memory",
          description: "Store session with vector embedding for similarity search",
          inputSchema: {
            type: "object",
            properties: {
              session_id: { type: "string", description: "Session identifier" },
              query: { type: "string", description: "User query" },
              template_type: { type: "string", description: "Template type used" },
              response_summary: { type: "string", description: "Summary of response" },
              aigs_classification: { type: "object", description: "AIGS classification data" },
              pagcp_results: { type: "object", description: "PAGCP results" },
              performance_metrics: { type: "object", description: "Performance metrics" },
              success_score: { type: "number", description: "Success score (0-1)" },
            },
            required: ["session_id", "query"],
          },
        },
        {
          name: "search_similar_sessions",
          description: "Find semantically similar past sessions using vector search",
          inputSchema: {
            type: "object",
            properties: {
              query: { type: "string", description: "Search query for finding similar sessions" },
              limit: { type: "number", description: "Maximum number of similar sessions to return", default: 5 },
            },
            required: ["query"],
          },
        },
        {
          name: "store_pattern_embedding",
          description: "Store pattern with vector representation and Neo4j link",
          inputSchema: {
            type: "object",
            properties: {
              pattern_name: { type: "string", description: "Pattern name" },
              pattern_type: { type: "string", description: "Pattern type" },
              neo4j_node_id: { type: "string", description: "Neo4j node ID" },
              description: { type: "string", description: "Pattern description" },
              domain: { type: "string", description: "Domain" },
              effectiveness_score: { type: "number", description: "Effectiveness score (0-1)" },
              usage_count: { type: "number", description: "Usage count" },
              file_path: { type: "string", description: "File path for the note" },
            },
            required: ["pattern_name", "description"],
          },
        },
        {
          name: "search_semantic_patterns",
          description: "Find semantically similar patterns across domains",
          inputSchema: {
            type: "object",
            properties: {
              description: { type: "string", description: "Pattern description to search for" },
              domain: { type: "string", description: "Domain filter (or 'any' for all domains)", default: "any" },
              limit: { type: "number", description: "Maximum number of patterns to return", default: 10 },
            },
            required: ["description"],
          },
        },
        {
          name: "discover_synthesis_opportunities",
          description: "Find potential cross-domain synthesis opportunities through vector similarity",
          inputSchema: {
            type: "object",
            properties: {
              context: { type: "string", description: "Context description for finding synthesis opportunities" },
              limit: { type: "number", description: "Maximum number of opportunities to return", default: 15 },
            },
            required: ["context"],
          },
        },
        {
          name: "get_qdrant_status",
          description: "Get QDRANT semantic memory system status",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
        {
          name: "check_pattern_exists",
          description: "Check if a pattern already exists by neo4j_node_id",
          inputSchema: {
            type: "object",
            properties: {
              neo4j_node_id: { type: "string", description: "Neo4j node ID to check" },
            },
            required: ["neo4j_node_id"],
          },
        },
      ],
    }));

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      if (!this.qdrantClient) {
        throw new McpError(
          ErrorCode.InternalError,
          "Qdrant client not initialized"
        );
      }

      const { name, arguments: args } = request.params;

      switch (name) {
        case "store_session_memory":
          return await this.storeSessionMemory(args);
        case "search_similar_sessions":
          return await this.searchSimilarSessions(args);
        case "store_pattern_embedding":
          return await this.storePatternEmbedding(args);
        case "search_semantic_patterns":
          return await this.searchSemanticPatterns(args);
        case "discover_synthesis_opportunities":
          return await this.discoverSynthesisOpportunities(args);
        case "get_qdrant_status":
          return await this.getQdrantStatus();
        case "check_pattern_exists":
          return await this.checkPatternExists(args);
        default:
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Unknown tool: ${name}`
          );
      }
    });
  }

  private async storeSessionMemory(args: any) {
    try {
      const sessionText = `${args.query || ""} ${args.response_summary || ""}`;
      const embedding = await this.generateEmbedding(sessionText);
      const pointId = this.generatePointId("session");

      await this.qdrantClient!.upsert(`${this.vaultId}_session_memory`, {
        points: [
          {
            id: pointId,
            vector: embedding,
            payload: {
              session_id: args.session_id || "unknown",
              query: args.query || "",
              template_type: args.template_type || "unknown",
              response_summary: args.response_summary || "",
              aigs_classification: args.aigs_classification || {},
              pagcp_results: args.pagcp_results || {},
              performance_metrics: args.performance_metrics || {},
              timestamp: new Date().toISOString(),
              success_score: args.success_score || 0.5,
            },
          },
        ],
      });

      return {
        content: [
          {
            type: "text",
            text: `📚 Session Memory Stored Successfully

🔗 Storage Details:
• Point ID: ${pointId}
• Collection: ${this.vaultId}_session_memory
• Embedding Dimension: ${embedding.length}
• Session ID: ${args.session_id || "unknown"}

🧠 Semantic Memory:
• Vector embedding generated from session content
• Searchable by semantic similarity
• Links to structured session data
• Ready for context retrieval

✅ Session added to semantic memory bank`,
          },
        ],
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to store session memory: ${error}`
      );
    }
  }

  private async searchSimilarSessions(args: any) {
    try {
      const queryEmbedding = await this.generateEmbedding(args.query);
      const limit = args.limit || 5;

      const searchResult = await this.qdrantClient!.search(`${this.vaultId}_session_memory`, {
        vector: queryEmbedding,
        limit: limit,
        with_payload: true,
      });

      if (!searchResult || searchResult.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `🔍 No Similar Sessions Found

Query: ${args.query}
• No semantically similar sessions in memory
• This appears to be a novel query type
• Consider storing session after processing for future similarity matching`,
            },
          ],
        };
      }

      let response = `🔍 Similar Sessions Found

Query: ${args.query}
Sessions Found: ${searchResult.length}

📚 Semantic Matches:`;

      searchResult.forEach((result, idx) => {
        const payload = result.payload as any;
        response += `

${idx + 1}. Similarity: ${result.score?.toFixed(3) || "N/A"}
   • Session: ${payload.session_id || "unknown"}
   • Template: ${payload.template_type || "unknown"}
   • Query: ${(payload.query || "no query").substring(0, 100)}...
   • Success Score: ${(payload.success_score || 0.0).toFixed(2)}
   • Date: ${(payload.timestamp || "unknown").substring(0, 10)}`;
      });

      response += `

🧠 Context Memory:
• Semantic similarity enables context-aware responses
• Previous successful approaches available for adaptation
• Learning from past experience patterns
• Enhanced decision-making through memory retrieval

✅ Semantic context loaded from memory bank`;

      return {
        content: [{ type: "text", text: response }],
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to search sessions: ${error}`
      );
    }
  }

  private async storePatternEmbedding(args: any) {
    try {
      const patternText = `${args.pattern_name || ""} ${args.description || ""}`;
      const embedding = await this.generateEmbedding(patternText);
      const pointId = this.generatePointId("pattern");

      await this.qdrantClient!.upsert(`${this.vaultId}_pattern_embeddings`, {
        points: [
          {
            id: pointId,
            vector: embedding,
            payload: {
              pattern_name: args.pattern_name || "",
              pattern_type: args.pattern_type || "",
              neo4j_node_id: args.neo4j_node_id || "",
              description: args.description || "",
              domain: args.domain || "",
              effectiveness_score: args.effectiveness_score || 0.5,
              usage_count: args.usage_count || 0,
              last_used: new Date().toISOString(),
              discovery_date: new Date().toISOString(),
              file_path: args.file_path || "",
            },
          },
        ],
      });

      return {
        content: [
          {
            type: "text",
            text: `🧠 Pattern Embedding Stored Successfully

🔗 Storage Details:
• Point ID: ${pointId}
• Collection: ${this.vaultId}_pattern_embeddings
• Neo4j Link: ${args.neo4j_node_id || "N/A"}
• Pattern: ${args.pattern_name || "Unknown"}

🎯 Pattern Memory:
• Semantic representation enables cross-domain discovery
• Linked to Neo4j structured knowledge
• Searchable by description similarity
• Available for pattern transfer and synthesis

✅ Pattern added to semantic knowledge base`,
          },
        ],
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to store pattern: ${error}`
      );
    }
  }

  private async searchSemanticPatterns(args: any) {
    try {
      const queryEmbedding = await this.generateEmbedding(args.description);
      const limit = args.limit || 10;

      // Build filter if domain is specified
      const filter = args.domain && args.domain !== "any"
        ? {
            must: [
              {
                key: "domain",
                match: { value: args.domain },
              },
            ],
          }
        : undefined;

      const searchResult = await this.qdrantClient!.search(`${this.vaultId}_pattern_embeddings`, {
        vector: queryEmbedding,
        filter: filter,
        limit: limit,
        with_payload: true,
      });

      if (!searchResult || searchResult.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `🔍 No Similar Patterns Found

Description: ${args.description}
Domain Filter: ${args.domain || "any"}
• No semantically similar patterns in memory
• This appears to be a novel pattern type
• Consider storing successful patterns for future discovery`,
            },
          ],
        };
      }

      let response = `🔍 Semantic Patterns Found

Description: ${args.description}
Domain Filter: ${args.domain || "any"}
Patterns Found: ${searchResult.length}

🧠 Pattern Matches:`;

      searchResult.slice(0, 7).forEach((result, idx) => {
        const payload = result.payload as any;
        response += `

${idx + 1}. Similarity: ${result.score?.toFixed(3) || "N/A"}
   • Pattern: ${payload.pattern_name || "unknown"}
   • Type: ${payload.pattern_type || "unknown"}
   • Domain: ${payload.domain || "unknown"}
   • Effectiveness: ${(payload.effectiveness_score || 0.0).toFixed(2)}
   • Usage Count: ${payload.usage_count || 0}
   • Neo4j ID: ${payload.neo4j_node_id || "none"}
   • File Path: ${payload.file_path || "none"}`;
      });

      response += `

🔄 Pattern Transfer:
• Semantic similarity enables cross-domain pattern discovery
• Successful patterns can be adapted to new contexts
• Links to structured knowledge in Neo4j
• Enhanced innovation through pattern synthesis

✅ Semantic patterns retrieved from knowledge base`;

      return {
        content: [{ type: "text", text: response }],
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to search patterns: ${error}`
      );
    }
  }

  private async discoverSynthesisOpportunities(args: any) {
    try {
      const contextEmbedding = await this.generateEmbedding(args.context);
      const limit = args.limit || 15;

      const searchResult = await this.qdrantClient!.search(`${this.vaultId}_cross_domain_knowledge`, {
        vector: contextEmbedding,
        limit: limit,
        with_payload: true,
      });

      if (!searchResult || searchResult.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `🔄 No Synthesis Opportunities Found

Context: ${args.context}
• No cross-domain synthesis opportunities identified
• This context may be highly specialized
• Consider expanding context or exploring adjacent domains`,
            },
          ],
        };
      }

      let response = `🔄 Cross-Domain Synthesis Opportunities

Context: ${args.context}
Opportunities Found: ${searchResult.length}

💡 Synthesis Possibilities:`;

      searchResult.slice(0, 10).forEach((result, idx) => {
        const payload = result.payload as any;
        response += `

${idx + 1}. Relevance: ${result.score?.toFixed(3) || "N/A"}
   • Knowledge: ${(payload.knowledge_description || "").substring(0, 100)}...
   • Source Domain: ${payload.source_domain || "unknown"}
   • Target Domains: ${(payload.target_domains || []).slice(0, 3).join(", ")}
   • Success Rate: ${(payload.transfer_success_rate || 0.0).toFixed(2)}
   • Abstraction Level: ${payload.abstraction_level || "unknown"}`;
      });

      response += `

🌐 Synthesis Power:
• Cross-domain knowledge transfer opportunities identified
• Pattern synthesis across multiple domains possible
• Novel solution pathways through domain bridging
• Enhanced creativity through unexpected connections

✅ Synthesis opportunities discovered through semantic analysis`;

      return {
        content: [{ type: "text", text: response }],
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to discover opportunities: ${error}`
      );
    }
  }

  private async getQdrantStatus() {
    try {
      if (!this.qdrantClient) {
        return {
          content: [
            {
              type: "text",
              text: `❌ QDRANT Semantic Memory System - DISCONNECTED

🚨 Connection Status: FAILED
• QDRANT server not accessible
• Semantic memory capabilities unavailable
• Falling back to structured memory only

💡 To enable semantic memory:
1. Install QDRANT server (docker run -p 6333:6333 qdrant/qdrant)
2. Set QDRANT_URL environment variable
3. Restart the MCP server`,
            },
          ],
        };
      }

      const collections = await this.qdrantClient.getCollections();
      const collectionStats: Record<string, any> = {};

      for (const collection of collections.collections) {
        try {
          // Only count collections for this vault
          if (collection.name?.startsWith(`${this.vaultId}_`)) {
            const info = await this.qdrantClient.getCollection(collection.name!);
            collectionStats[collection.name!] = {
              points_count: info.points_count || 0,
              status: info.status || "unknown",
            };
          }
        } catch {
          if (collection.name?.startsWith(`${this.vaultId}_`)) {
            collectionStats[collection.name!] = { points_count: 0, status: "unknown" };
          }
        }
      }

      const response = `🧠 QDRANT Semantic Memory System - OPERATIONAL

🔗 Connection Status: ✅ CONNECTED
• URL: ${process.env.QDRANT_URL || "http://localhost:6333"}
• Collections: ${collections.collections.length}
• Embedding Model: ${this.embeddingPipeline ? `Local ${this.embeddingModel}` : "Hash-based (fallback)"}
• Embedding Dimension: ${this.embeddingDimension}
• Model Performance: ${this.embeddingConfig.performance}

📚 Memory Collections (Vault: ${this.vaultId}):
• Session Memory: ${collectionStats[`${this.vaultId}_session_memory`]?.points_count || 0} stored sessions
• Pattern Embeddings: ${collectionStats[`${this.vaultId}_pattern_embeddings`]?.points_count || 0} patterns
• Cross-Domain Knowledge: ${collectionStats[`${this.vaultId}_cross_domain_knowledge`]?.points_count || 0} synthesis opportunities
• Meta-Cognitive Insights: ${collectionStats[`${this.vaultId}_meta_cognitive_insights`]?.points_count || 0} cognitive insights

🚀 Semantic Capabilities:
• Session similarity search: ACTIVE
• Pattern semantic discovery: ACTIVE
• Cross-domain synthesis: ACTIVE
• Memory-enhanced responses: ENABLED
• Local embeddings: ${this.embeddingPipeline ? "READY" : "FALLBACK MODE"}

✅ Semantic memory system fully operational`;

      return {
        content: [{ type: "text", text: response }],
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to get status: ${error}`
      );
    }
  }

  private async checkPatternExists(args: any) {
    try {
      if (!args.neo4j_node_id) {
        return {
          content: [{
            type: "text",
            text: `❌ Error: neo4j_node_id is required`
          }],
        };
      }

      // Search for patterns with matching neo4j_node_id
      const filter = {
        must: [
          {
            key: "neo4j_node_id",
            match: { value: args.neo4j_node_id },
          },
        ],
      };

      const searchResult = await this.qdrantClient!.search(`${this.vaultId}_pattern_embeddings`, {
        vector: new Array(this.embeddingDimension).fill(0), // Dummy vector since we're just filtering
        filter: filter,
        limit: 1,
        with_payload: true,
      });

      const exists = searchResult && searchResult.length > 0;
      const existingPattern = exists ? searchResult[0].payload as any : null;

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            exists: exists,
            pattern: existingPattern ? {
              id: searchResult[0].id,
              pattern_name: existingPattern.pattern_name,
              description: existingPattern.description,
              last_updated: existingPattern.last_used || existingPattern.discovery_date,
            } : null
          }, null, 2)
        }],
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to check pattern existence: ${error}`
      );
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("🧠 Qdrant MCP Server running on stdio");
  }
}

const server = new QdrantMCPServer();
server.run().catch(console.error);