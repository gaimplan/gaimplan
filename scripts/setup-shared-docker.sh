#!/bin/bash
# Setup script for Gaimplan shared Docker infrastructure

set -e

echo "Setting up shared Docker infrastructure for Gaimplan..."

# Create directory for shared docker config
mkdir -p ~/.gaimplan/docker

# Copy docker-compose.yml to shared location
cp docker-compose.yml ~/.gaimplan/docker/

# Create start/stop scripts
cat > ~/.gaimplan/docker/start.sh << 'EOF'
#!/bin/bash
cd "$(dirname "$0")"
docker compose up -d
echo "Waiting for services to be healthy..."
sleep 5
docker compose ps
EOF

cat > ~/.gaimplan/docker/stop.sh << 'EOF'
#!/bin/bash
cd "$(dirname "$0")"
docker compose down
EOF

# Make scripts executable
chmod +x ~/.gaimplan/docker/start.sh
chmod +x ~/.gaimplan/docker/stop.sh

# Create connection info file
cat > ~/.gaimplan/docker/connection-info.json << EOF
{
  "neo4j": {
    "uri": "bolt://localhost:7687",
    "username": "neo4j",
    "password": "GaimplanKnowledgeGraph2025",
    "httpUrl": "http://localhost:7474"
  },
  "qdrant": {
    "restUrl": "http://localhost:6333",
    "grpcUrl": "http://localhost:6334"
  }
}
EOF

echo ""
echo "✅ Shared Docker infrastructure setup complete!"
echo ""
echo "To start the services:"
echo "  cd ~/.gaimplan/docker && ./start.sh"
echo ""
echo "To stop the services:"
echo "  cd ~/.gaimplan/docker && ./stop.sh"
echo ""
echo "Neo4j credentials:"
echo "  Username: neo4j"
echo "  Password: GaimplanKnowledgeGraph2025"
echo "  Browser: http://localhost:7474"
echo ""
echo "Qdrant Dashboard: http://localhost:6333/dashboard"