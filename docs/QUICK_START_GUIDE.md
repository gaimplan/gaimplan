# Quick Start Guide

Get Gaimplan running in under 5 minutes.

## Prerequisites

1. **Rust** - Install via: `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y`
2. **Node.js 22+** - [Download](https://nodejs.org/)
3. **npm 10+** - Comes with Node.js
4. **(OPTIONAL) Docker Desktop** - [Download](https://www.docker.com/products/docker-desktop/)
    - This is only required for Neo4j and Qdrant integration which delivers advanced AI Search Capabilities. 

## Build & Launch

```bash
# 1. Clone repository
git clone https://github.com/gaimplan/gaimplan.git
cd gaimplan

# 2. Set up environment variables
cp .env.example .env
# Edit .env and set NEO4J_PASSWORD (required)

# 3. Start Docker containers (Neo4j & Qdrant)
docker compose up -d

# 4. Verify containers are running
docker ps  # Should show gaimplan-neo4j-shared and gaimplan-qdrant-shared

# 5. Install dependencies
npm install

# 6. Install MCP server dependencies
cd mcp-servers
cd filesystem-server && npm install && cd ..
cd search-server && npm install && cd ..
cd git-server && npm install && cd ..
cd neo4j && npm install && cd ..
cd qdrant-server && npm install && npm run build && cd ..
cd ..  # Return to project root

# 7. Launch development server
npm run tauri:dev
```

## First Launch

1. **Create or Select Vault** - Choose a folder for your notes
2. **Configure AI** (Optional) - Add API keys in Chat panel settings
3. **Start Writing** - Create a new note with Cmd+N

## Common Issues

- **Cargo not found**: Run `source "$HOME/.cargo/env"` after Rust installation
- **Docker containers not starting**: Ensure Docker Desktop is running
- **Port conflicts**: Neo4j uses 7474/7687, Qdrant uses 6333/6334

## Next Steps

- **AI Setup**: See [AI_SETUP.md](./AI_SETUP.md) for provider configuration
- **MCP Servers**: See [MCP_SETTINGS_EXAMPLE.md](./MCP_SETTINGS_EXAMPLE.md) for advanced tools
- **Data Storage**: See [DATA_STORAGE.md](./DATA_STORAGE.md) for file locations
- **Full Documentation**: See [README.md](../README.md) for all features

## Production Build

```bash
npm run tauri build
```

The installer will be in `src-tauri/target/release/bundle/`.