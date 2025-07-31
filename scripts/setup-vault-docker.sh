#!/bin/bash
# Setup script for gaimplan vault Docker infrastructure

set -e

# Check if vault path is provided
if [ -z "$1" ]; then
    echo "Usage: ./setup-vault-docker.sh /path/to/vault"
    exit 1
fi

VAULT_PATH="$1"
VAULT_ID=$(echo "$VAULT_PATH" | sha256sum | cut -c1-8)

echo "Setting up Docker infrastructure for vault: $VAULT_PATH"
echo "Vault ID: $VAULT_ID"

# Create directory structure
echo "Creating .gaimplan directory structure..."
mkdir -p "$VAULT_PATH/.gaimplan/docker"
mkdir -p "$VAULT_PATH/.gaimplan/neo4j/data"
mkdir -p "$VAULT_PATH/.gaimplan/neo4j/logs"
mkdir -p "$VAULT_PATH/.gaimplan/neo4j/import"
mkdir -p "$VAULT_PATH/.gaimplan/neo4j/plugins"
mkdir -p "$VAULT_PATH/.gaimplan/qdrant/storage"
mkdir -p "$VAULT_PATH/.gaimplan/qdrant/snapshots"

# Generate secure password for Neo4j
NEO4J_PASSWORD=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-25)

# Create .env file for this vault
cat > "$VAULT_PATH/.gaimplan/docker/.env" << EOF
# Auto-generated Docker environment for gaimplan vault
# Generated on: $(date)

# Vault Configuration
VAULT_ID=$VAULT_ID
VAULT_PATH=$VAULT_PATH

# Neo4j Configuration
NEO4J_PASSWORD=$NEO4J_PASSWORD
NEO4J_HTTP_PORT=7474
NEO4J_BOLT_PORT=7687

# Qdrant Configuration
QDRANT_REST_PORT=6333
QDRANT_GRPC_PORT=6334

# Resource Limits
NEO4J_MEMORY_HEAP_MAX=4G
NEO4J_MEMORY_HEAP_INITIAL=2G
NEO4J_MEMORY_PAGECACHE=2G
EOF

# Copy docker-compose.yml to vault
cp docker-compose.yml "$VAULT_PATH/.gaimplan/docker/"

# Create start/stop scripts
cat > "$VAULT_PATH/.gaimplan/docker/start.sh" << 'EOF'
#!/bin/bash
cd "$(dirname "$0")"
docker compose --env-file .env up -d
echo "Waiting for services to be healthy..."
sleep 5
docker compose --env-file .env ps
EOF

cat > "$VAULT_PATH/.gaimplan/docker/stop.sh" << 'EOF'
#!/bin/bash
cd "$(dirname "$0")"
docker compose --env-file .env down
EOF

# Make scripts executable
chmod +x "$VAULT_PATH/.gaimplan/docker/start.sh"
chmod +x "$VAULT_PATH/.gaimplan/docker/stop.sh"

# Create connection info file
cat > "$VAULT_PATH/.gaimplan/docker/connection-info.json" << EOF
{
  "vaultId": "$VAULT_ID",
  "neo4j": {
    "uri": "bolt://localhost:7687",
    "username": "neo4j",
    "password": "$NEO4J_PASSWORD",
    "httpUrl": "http://localhost:7474"
  },
  "qdrant": {
    "restUrl": "http://localhost:6333",
    "grpcUrl": "http://localhost:6334"
  }
}
EOF

echo ""
echo "✅ Docker infrastructure setup complete!"
echo ""
echo "To start the services:"
echo "  cd $VAULT_PATH/.gaimplan/docker && ./start.sh"
echo ""
echo "To stop the services:"
echo "  cd $VAULT_PATH/.gaimplan/docker && ./stop.sh"
echo ""
echo "Neo4j credentials:"
echo "  Username: neo4j"
echo "  Password: $NEO4J_PASSWORD"
echo "  Browser: http://localhost:7474"
echo ""
echo "Qdrant API: http://localhost:6333"