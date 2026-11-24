# 🗺️ ShopnoJatra Autonomous Production Map Engine & Mobility Platform (Bangladesh)

A zero-to-near-zero-cost, Google Maps and Uber-tier self-hosted spatial platform engineered specifically for Bangladesh. Capable of serving 15–20 Lakh (1.5M–2.0M) Monthly Active Users and 50,000+ concurrent fleet streams on an **Oracle Cloud Always Free (2 OCPUs, 12 GB RAM, ARM64)** instance.

---

## 🏛️ Architecture Overview

```
spatial-engine/
├── docker-compose.yml              # Multi-arch ARM64 compose with 8,350 MB hard memory caps
├── nginx/
│   └── nginx.conf                  # Edge reverse proxy, TLS 1.3, rate limiting, and split-path routing
├── spatial-bff/                    # High-performance Go microservice (Google Maps drop-in facade)
│   ├── main.go                     # In-process Uber H3, Tile38 guard, Collective Search merge
│   ├── go.mod
│   └── Dockerfile                  # Multi-stage ARM64 Docker build
├── centrifugo/
│   └── config.json                 # Centrifugo v6.9.6 nested schema (JWT auth, Redis pub/sub)
├── vroom/
│   └── config.yml                  # VROOM 1.15.0 multi-vehicle dispatch config wired to Valhalla
├── scripts/
│   ├── 00_provision_and_tune_host.sh # Linux kernel tuning (vm.max_map_count, conntrack, BBR)
│   ├── 01_build_bangladesh_data.sh   # OSM PBF + Overture Places + Planetiler PMTiles + Photon 1.0
│   └── 02_test_endpoints.sh          # Acceptance test suite verifying all Google-compatible endpoints
└── client/
    ├── LiveDeliveryMap.tsx         # React Native component for @maplibre/maplibre-react-native v11+
    └── bengali-text-plugin.ts      # Web MapLibre GL JS Indic text plugin (HarfBuzz PGF)
```

---

## 🚀 Quick Deployment Guide on Oracle Cloud Always Free

### Step 1: Provision Oracle VPS
1. Region: **Singapore** (`ap-singapore-1` or `ap-singapore-2`) for ~47.8 ms latency to Dhaka.
2. Shape: **VM.Standard.A1.Flex** (2 OCPUs, 12 GB RAM, 100+ GB NVMe, Ubuntu 24.04 LTS ARM64).
3. **Upgrade to Pay-As-You-Go (PAYG)**: Eliminates 7-day idle reclamation. Set a **$1.00 Budget Alert**.
4. Firewall / Security List: Open only TCP ports **80** and **443**.

### Step 2: Clone or Copy `spatial-engine/` to VPS
```bash
# On your local machine or via git:
scp -r spatial-engine ubuntu@<YOUR_ORACLE_IP>:~/spatial-engine
ssh ubuntu@<YOUR_ORACLE_IP>
```

### Step 3: Run Host Tuning Script
```bash
cd ~/spatial-engine
chmod +x scripts/*.sh
./scripts/00_provision_and_tune_host.sh
```

### Step 4: Run Bangladesh Master Data Pipeline
```bash
./scripts/01_build_bangladesh_data.sh
```
*Note: This downloads the Geofabrik Bangladesh PBF (~339 MB), compiles `bangladesh.pmtiles` via Planetiler in 90 seconds, extracts high-confidence Overture Places via DuckDB, indexes Photon 1.0.0 OpenSearch, and stages Valhalla routing graphs.*

### Step 5: Launch the 10-Container Production Stack
```bash
docker compose up -d --build
```

### Step 6: Verify Endpoints
```bash
./scripts/02_test_endpoints.sh
```

---

## 📡 Google Maps Drop-In API Endpoints

All endpoints are served via `https://api.yourdomain.com`:

| API Service | Endpoint | Query / Payload | Engine |
|---|---|---|---|
| **Places Autocomplete** | `GET /v1/places/autocomplete` | `?input=Dhanmondi&lat=23.74&lng=90.37` | Parallel Photon + Typesense |
| **Reverse Geocoding** | `GET /v1/geocode/reverse` | `?lat=23.7925&lng=90.4078` | Redis L1 Cache → Photon |
| **Directions & ETA** | `GET /v1/directions` | `?origin=...&destination=...&mode=motorbike` | Valhalla Routing |
| **Distance Matrix** | `POST /v1/distancematrix` | `{"pickup_lat": 23.79, "pickup_lng": 90.40}` | Tile38 KNN → Valhalla |
| **Snap to Roads** | `POST /v1/roads/snap` | `[{"lat": ..., "lon": ...}]` | Valhalla Meili HMM |
| **Fleet GPS Ping** | `POST /v1/fleet/ping` | `{"rider_id": "...", "lat": ..., "lng": ...}` | Tile38 + Centrifugo + H3 |
| **Surge Multiplier** | `GET /v1/surge` | `?lat=23.7925&lng=90.4078` | Uber H3 Resolution 8 |
| **Multi-Order Dispatch**| `POST /v1/optimize/dispatch` | VROOM CVRP-TW JSON payload | VROOM 1.15.0 |

---

## ⚖️ Legal & Licensing Compliance

- **OpenStreetMap Data**: Licensed under **ODbL 1.0**. Attribution (`© OpenStreetMap contributors`) is enabled on all map clients.
- **Overture Places**: Licensed under **CDLA-Permissive 2.0**. Stored exclusively in **Typesense 30.2**, physically isolated from OSM to maintain **Collective Database safe harbor**.
- **Vector Tiles**: Served serverless via **Cloudflare R2** with HTTP Range Requests (`RFC 7233`), avoiding CDN ToS violations.
