#!/usr/bin/env python3
"""
Clear all Qdrant collections from the server.
This script will list all collections and delete them after confirmation.

Usage:
    python clear_qdrant_collections.py [--url QDRANT_URL] [--force]
    
Options:
    --url    Qdrant server URL (default: http://localhost:6333)
    --force  Skip confirmation prompt
"""

import sys
import argparse
import requests
from typing import List, Dict, Any


class QdrantCleaner:
    def __init__(self, url: str = "http://localhost:6333"):
        self.url = url.rstrip('/')
        self.headers = {"Content-Type": "application/json"}
    
    def get_collections(self) -> List[str]:
        """Get list of all collections in Qdrant."""
        try:
            response = requests.get(
                f"{self.url}/collections",
                headers=self.headers
            )
            response.raise_for_status()
            
            data = response.json()
            collections = data.get("result", {}).get("collections", [])
            
            # Extract collection names
            return [col["name"] for col in collections]
            
        except requests.exceptions.RequestException as e:
            print(f"❌ Failed to get collections: {e}")
            sys.exit(1)
    
    def delete_collection(self, collection_name: str) -> bool:
        """Delete a single collection."""
        try:
            response = requests.delete(
                f"{self.url}/collections/{collection_name}",
                headers=self.headers
            )
            response.raise_for_status()
            return True
            
        except requests.exceptions.RequestException as e:
            print(f"❌ Failed to delete collection '{collection_name}': {e}")
            return False
    
    def get_collection_info(self, collection_name: str) -> Dict[str, Any]:
        """Get information about a collection."""
        try:
            response = requests.get(
                f"{self.url}/collections/{collection_name}",
                headers=self.headers
            )
            response.raise_for_status()
            return response.json().get("result", {})
            
        except:
            return {}
    
    def clear_all_collections(self, force: bool = False) -> None:
        """Delete all collections with optional confirmation."""
        print(f"🔍 Connecting to Qdrant at: {self.url}")
        
        # Get all collections
        collections = self.get_collections()
        
        if not collections:
            print("✅ No collections found. Qdrant is already empty.")
            return
        
        print(f"\n📊 Found {len(collections)} collection(s):")
        
        # Display collection details
        total_points = 0
        for col_name in collections:
            info = self.get_collection_info(col_name)
            point_count = info.get("points_count", 0)
            total_points += point_count
            
            print(f"  • {col_name}")
            print(f"    - Points: {point_count:,}")
            print(f"    - Vector size: {info.get('config', {}).get('params', {}).get('vectors', {}).get('size', 'unknown')}")
        
        print(f"\n📈 Total points across all collections: {total_points:,}")
        
        # Confirmation
        if not force:
            print("\n⚠️  WARNING: This will permanently delete all collections and their data!")
            confirmation = input("Type 'DELETE ALL' to confirm: ")
            
            if confirmation != "DELETE ALL":
                print("❌ Deletion cancelled.")
                return
        
        # Delete collections
        print("\n🗑️  Deleting collections...")
        success_count = 0
        
        for col_name in collections:
            print(f"  Deleting '{col_name}'...", end=" ")
            if self.delete_collection(col_name):
                print("✅")
                success_count += 1
            else:
                print("❌")
        
        # Summary
        print(f"\n📊 Summary:")
        print(f"  • Collections deleted: {success_count}/{len(collections)}")
        
        if success_count == len(collections):
            print("✅ All collections successfully deleted!")
        else:
            print("⚠️  Some collections failed to delete.")
    
    def verify_server(self) -> bool:
        """Verify connection to Qdrant server."""
        try:
            response = requests.get(f"{self.url}/")
            response.raise_for_status()
            
            # Check if it's actually Qdrant
            data = response.json()
            if "title" in data and "qdrant" in data["title"].lower():
                return True
            
            print(f"⚠️  Server at {self.url} doesn't appear to be Qdrant")
            return False
            
        except requests.exceptions.RequestException as e:
            print(f"❌ Cannot connect to Qdrant at {self.url}: {e}")
            return False


def main():
    parser = argparse.ArgumentParser(
        description="Clear all collections from a Qdrant server"
    )
    parser.add_argument(
        "--url",
        default="http://localhost:6333",
        help="Qdrant server URL (default: http://localhost:6333)"
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Skip confirmation prompt"
    )
    
    args = parser.parse_args()
    
    # Create cleaner instance
    cleaner = QdrantCleaner(args.url)
    
    # Verify server connection
    print("🔧 Verifying Qdrant server connection...")
    if not cleaner.verify_server():
        sys.exit(1)
    
    print("✅ Connected to Qdrant server")
    
    # Clear collections
    cleaner.clear_all_collections(force=args.force)


if __name__ == "__main__":
    main()