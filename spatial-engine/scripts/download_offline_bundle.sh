#!/bin/bash
# ==============================================================================
# scripts/download_offline_bundle.sh
# Packages Bangladesh PMTiles into a zero-internet offline navigation archive
# ==============================================================================
set -euo pipefail

BASE="$HOME/spatial-engine"
OFFLINE_DIR="$BASE/offline_releases"
TILES_DIR="$BASE/tiles"
mkdir -p "$OFFLINE_DIR"

DATE_TAG="$(date +%Y%m%d)"
TARGET_FILE="$OFFLINE_DIR/bangladesh_offline_v${DATE_TAG}.tar.gz"

echo "==> 1. Verifying Bangladesh PMTiles archive..."
if [ ! -f "$TILES_DIR/bangladesh.pmtiles" ]; then
    echo "ERROR: $TILES_DIR/bangladesh.pmtiles not found! Please run 01_build_bangladesh_data.sh first."
    exit 1
fi

FILE_SIZE_MB=$(du -m "$TILES_DIR/bangladesh.pmtiles" | cut -f1)
echo "Found bangladesh.pmtiles (Size: ${FILE_SIZE_MB} MB)"

echo "==> 2. Generating Offline Manifest (JSON)..."
SHA256_HASH=$(sha256sum "$TILES_DIR/bangladesh.pmtiles" | awk '{print $1}')

cat << EOF > "$OFFLINE_DIR/manifest.json"
{
  "dataset": "Bangladesh Complete Offline Map Pack",
  "version": "v${DATE_TAG}",
  "license": "ODbL 1.0 (OpenStreetMap) & Overture Maps Foundation",
  "bounds": {
    "southwest": [88.01, 20.74],
    "northeast": [92.67, 26.63]
  },
  "zoom_range": [0, 16],
  "file_name": "bangladesh.pmtiles",
  "file_size_mb": ${FILE_SIZE_MB},
  "sha256": "${SHA256_HASH}",
  "features": [
    "3D Building Extrusions (National)",
    "Dense Urban Residential Alleys",
    "National Highways (N1-N8) & Rail Networks",
    "Ferry Ghat Terminals & Riverine Corridors",
    "Bengali (name:bn) and English Bilingual Typography"
  ]
}
EOF

echo "==> 3. Bundling into high-compression release archive..."
tar -czvf "$TARGET_FILE" \
    -C "$TILES_DIR" bangladesh.pmtiles \
    -C "$OFFLINE_DIR" manifest.json

echo "=========================================================="
echo "✅ Offline Map Bundle Ready!"
echo "File: $TARGET_FILE"
echo "Manifest: $OFFLINE_DIR/manifest.json"
echo "Sha256: $SHA256_HASH"
echo "=========================================================="
