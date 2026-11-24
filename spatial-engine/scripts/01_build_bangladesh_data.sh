#!/bin/bash
# ==============================================================================
# scripts/01_build_bangladesh_data.sh
# Automated Data Pipeline: OSM Bangladesh + Overture Places + Planetiler PMTiles + Photon 1.0
# ==============================================================================
set -euo pipefail

BASE="$HOME/spatial-engine"
DATA="$BASE/data"
STAMP="$(date +%Y%m)"
mkdir -p "$DATA" "$BASE/tiles" "$BASE/photon_data" "$BASE/valhalla_data" "$BASE/typesense_data"
cd "$DATA"

echo "==> 1. Downloading Geofabrik Bangladesh OSM PBF (~339 MB) + MD5 Verification..."
wget -c https://download.geofabrik.de/asia/bangladesh-latest.osm.pbf -O bangladesh.osm.pbf
wget -qO bangladesh.osm.pbf.md5 https://download.geofabrik.de/asia/bangladesh-latest.osm.pbf.md5
awk '{print $1 "  bangladesh.osm.pbf"}' bangladesh.osm.pbf.md5 | md5sum -c -

echo "==> 2. Compiling Bangladesh PMTiles via Planetiler (Zero DB Required)..."
docker run --rm \
  -e JAVA_TOOL_OPTIONS="-Xmx2g" \
  -v "$DATA:/data" \
  -v "$BASE/tiles:/output" \
  ghcr.io/onthegomap/planetiler:latest \
  --download \
  --osm-path=/data/bangladesh.osm.pbf \
  --output="/output/bangladesh-v${STAMP}.pmtiles" \
  --building-merge-z13 \
  --force

ln -sf "$BASE/tiles/bangladesh-v${STAMP}.pmtiles" "$BASE/tiles/bangladesh.pmtiles"

echo "==> 3. Extracting Overture Maps Bangladesh Places (CDLA-Permissive Safe Harbor)..."
python3 -m venv "$BASE/.venv"
"$BASE/.venv/bin/pip" install -q --upgrade overturemaps duckdb
"$BASE/.venv/bin/overturemaps" download \
  --bbox=88.0,20.5,92.7,26.7 \
  -f geoparquet \
  --type=place \
  -o "$DATA/overture_bd_places.parquet"

"$BASE/.venv/bin/python3" - << 'PYEOF'
import duckdb, json, os
base = os.path.expanduser("~/spatial-engine/data")
con = duckdb.connect()
con.execute("INSTALL spatial; LOAD spatial;")
rows = con.execute(f"""
  SELECT
    id,
    names.primary AS name_primary,
    COALESCE(names.common['bn'], '') AS name_bn,
    categories.primary AS category,
    confidence,
    ST_Y(geometry) AS lat,
    ST_X(geometry) AS lng,
    COALESCE(addresses[1].freeform, '') AS address,
    COALESCE(addresses[1].locality, '') AS locality
  FROM read_parquet('{base}/overture_bd_places.parquet')
  WHERE confidence >= 0.60
    AND (operating_status IS NULL OR operating_status != 'permanently_closed')
    AND names.primary IS NOT NULL
""").fetchall()

with open(f"{base}/overture_bd_places.jsonl", "w", encoding="utf-8") as f:
  for r in rows:
    doc = {
      "id": r[0], "name": r[1], "name_bn": r[2], "category": r[3] or "poi",
      "confidence": float(r[4]), "location": [float(r[5]), float(r[6])],
      "address": r[7], "locality": r[8], "source": "overture"
    }
    f.write(json.dumps(doc, ensure_ascii=False) + "\n")
print(f"Exported {len(rows)} high-confidence Overture BD places to JSONL.")
PYEOF

echo "==> 4. Indexing Photon 1.0.0 (OpenSearch 3.x) from Weekly Asia JSONL Dump..."
wget -c https://github.com/komoot/photon/releases/download/1.0.0/photon-1.0.0.jar -O "$BASE/photon_data/photon.jar"
wget -c https://download1.graphhopper.com/public/asia/photon-dump-asia-1.0-latest.jsonl.zst \
  -O "$DATA/photon-asia.jsonl.zst" || \
  wget -c https://download1.graphhopper.com/public/experimental/photon-dump-asia-latest.jsonl.zst \
  -O "$DATA/photon-asia.jsonl.zst"

mkdir -p "$BASE/photon_data/stage"
zstd --stdout -d "$DATA/photon-asia.jsonl.zst" | \
  java -Xmx3g -jar "$BASE/photon_data/photon.jar" import \
    -import-file - \
    -data-dir "$BASE/photon_data/stage" \
    -country-codes bd \
    -languages en,bn,default

# Atomic swap
rm -rf "$BASE/photon_data/photon_data.old"
[ -d "$BASE/photon_data/photon_data" ] && mv "$BASE/photon_data/photon_data" "$BASE/photon_data/photon_data.old"
mv "$BASE/photon_data/stage/photon_data" "$BASE/photon_data/photon_data"
rm -f "$DATA/photon-asia.jsonl.zst"

echo "==> 5. Staging Bangladesh PBF for Valhalla Routing Graph..."
cp "$DATA/bangladesh.osm.pbf" "$BASE/valhalla_data/bangladesh.osm.pbf"

echo "=========================================================="
echo "Data compilation finished! Next step:"
echo "1. Upload PMTiles to Cloudflare R2:"
echo "   wrangler r2 object put bangladesh-tiles/bangladesh-v${STAMP}.pmtiles --file=$BASE/tiles/bangladesh.pmtiles"
echo "2. Launch containers: cd ~/spatial-engine && docker compose up -d"
echo "=========================================================="
