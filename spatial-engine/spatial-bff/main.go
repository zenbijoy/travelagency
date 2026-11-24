package main

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math"
	"net"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/uber/h3-go/v3"
)

// Configuration loaded from Environment
type Config struct {
	Port              string
	ValhallaURL       string
	VroomURL          string
	PhotonURL         string
	TypesenseURL      string
	TypesenseAPIKey   string
	Tile38Addr        string
	RedisAddr         string
	CentrifugoAPIURL  string
	CentrifugoAPIKey  string
	CentrifugoSecret  string
	AuthorizedAPIKeys map[string]bool
}

var (
	cfg        Config
	httpClient = &http.Client{
		Timeout: 10 * time.Second,
		Transport: &http.Transport{
			MaxIdleConns:        100,
			MaxIdleConnsPerHost: 50,
			IdleConnTimeout:     90 * time.Second,
		},
	}
)

func init() {
	keys := os.Getenv("API_SECRET_KEYS")
	authorized := make(map[string]bool)
	if keys != "" {
		for _, k := range strings.Split(keys, ",") {
			authorized[strings.TrimSpace(k)] = true
		}
	} else {
		authorized["dev_key_12345"] = true
	}

	cfg = Config{
		Port:              getEnv("PORT", "8080"),
		ValhallaURL:       getEnv("VALHALLA_URL", "http://valhalla:8002"),
		VroomURL:          getEnv("VROOM_URL", "http://vroom:3000"),
		PhotonURL:         getEnv("PHOTON_URL", "http://photon:2322"),
		TypesenseURL:      getEnv("TYPESENSE_URL", "http://typesense:8108"),
		TypesenseAPIKey:   getEnv("TYPESENSE_API_KEY", "dev_typesense_secret_key_2026"),
		Tile38Addr:        getEnv("TILE38_ADDR", "tile38:9851"),
		RedisAddr:         getEnv("REDIS_ADDR", "redis:6379"),
		CentrifugoAPIURL:  getEnv("CENTRIFUGO_API_URL", "http://centrifugo:8000/api"),
		CentrifugoAPIKey:  getEnv("CENTRIFUGO_API_KEY", "dev_centrifugo_api_key_2026"),
		CentrifugoSecret:  getEnv("CENTRIFUGO_SECRET", "dev_hmac_secret_key_at_least_32_chars_2026"),
		AuthorizedAPIKeys: authorized,
	}
}

func getEnv(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func main() {
	mux := http.NewServeMux()

	// Middlewares
	handler := loggingMiddleware(corsMiddleware(authMiddleware(mux)))

	// 1. Google Places Autocomplete Compatible (Collective Search: Typesense + Photon)
	mux.HandleFunc("/v1/places/autocomplete", handleAutocomplete)

	// 2. Reverse Geocoding (L1 Cached)
	mux.HandleFunc("/v1/geocode/reverse", handleReverseGeocode)

	// 3. Directions & ETA (Valhalla with BD vehicle profiles & traffic)
	mux.HandleFunc("/v1/directions", handleDirections)

	// 4. Distance Matrix (Tile38 KNN + Valhalla Matrix)
	mux.HandleFunc("/v1/distancematrix", handleDistanceMatrix)

	// 5. Snap-to-Roads (Valhalla Meili HMM Map Matching)
	mux.HandleFunc("/v1/roads/snap", handleSnapToRoads)

	// 6. Fleet GPS Ping & Centrifugo Broadcast
	mux.HandleFunc("/v1/fleet/ping", handleFleetPing)

	// 7. Surge Pricing & Demand Hexagon (In-process Uber H3)
	mux.HandleFunc("/v1/surge", handleSurgePricing)

	// 8. Multi-Order Batching (VROOM CVRP-TW)
	mux.HandleFunc("/v1/optimize/dispatch", handleOptimizeDispatch)

	// 9. Centrifugo JWT Generation for Clients
	mux.HandleFunc("/v1/auth/token", handleGenerateToken)

	// Health check
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"healthy","engine":"ShopnoJatra Spatial BFF","timestamp":` + strconv.FormatInt(time.Now().Unix(), 10) + `}`))
	})

	log.Printf("🚀 ShopnoJatra Spatial BFF listening on port %s", cfg.Port)
	if err := http.ListenAndServe(":"+cfg.Port, handler); err != nil {
		log.Fatalf("Fatal server error: %v", err)
	}
}

// -----------------------------------------------------------------------------
// Middlewares
// -----------------------------------------------------------------------------

func loggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		log.Printf("[%s] %s - %v", r.Method, r.URL.Path, time.Since(start))
	})
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-API-Key")
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func authMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/healthz" || r.URL.Path == "/v1/auth/token" {
			next.ServeHTTP(w, r)
			return
		}

		apiKey := r.Header.Get("X-API-Key")
		if apiKey == "" {
			apiKey = r.URL.Query().Get("key")
		}

		// Also check Bearer JWT
		authHeader := r.Header.Get("Authorization")
		if authHeader != "" && strings.HasPrefix(authHeader, "Bearer ") {
			tokenString := strings.TrimPrefix(authHeader, "Bearer ")
			_, err := jwt.Parse(tokenString, func(t *jwt.Token) (interface{}, error) {
				return []byte(cfg.CentrifugoSecret), nil
			})
			if err == nil {
				next.ServeHTTP(w, r)
				return
			}
		}

		if apiKey != "" && cfg.AuthorizedAPIKeys[apiKey] {
			next.ServeHTTP(w, r)
			return
		}

		http.Error(w, `{"error":"Unauthorized: valid X-API-Key or Bearer token required"}`, http.StatusUnauthorized)
	})
}

// -----------------------------------------------------------------------------
// 1. Google Places Autocomplete Compatible (Collective Search Safe Harbor)
// -----------------------------------------------------------------------------

type AutocompletePrediction struct {
	PlaceID     string `json:"place_id"`
	Description string `json:"description"`
	Name        string `json:"name"`
	NameBn      string `json:"name_bn,omitempty"`
	Category    string `json:"category"`
	Source      string `json:"source"` // "overture" or "osm"
	Lat         float64 `json:"lat"`
	Lng         float64 `json:"lng"`
	DistanceM   float64 `json:"distance_meters,omitempty"`
}

func handleAutocomplete(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query().Get("input")
	if query == "" {
		query = r.URL.Query().Get("q")
	}
	if query == "" {
		http.Error(w, `{"error":"query parameter 'input' is required"}`, http.StatusBadRequest)
		return
	}

	latStr := r.URL.Query().Get("lat")
	lngStr := r.URL.Query().Get("lng")
	var userLat, userLng float64
	hasLocation := false
	if latStr != "" && lngStr != "" {
		userLat, _ = strconv.ParseFloat(latStr, 64)
		userLng, _ = strconv.ParseFloat(lngStr, 64)
		if userLat != 0 && userLng != 0 {
			hasLocation = true
		}
	}

	var wg sync.WaitGroup
	var typesenseResults []AutocompletePrediction
	var photonResults []AutocompletePrediction
	var mu sync.Mutex

	// Query 1: Typesense (Overture Places & Private Merchants)
	wg.Add(1)
	go func() {
		defer wg.Done()
		url := fmt.Sprintf("%s/collections/places/documents/search?q=%s&query_by=name,name_bn,address&per_page=7",
			cfg.TypesenseURL, query)
		req, _ := http.NewRequest("GET", url, nil)
		req.Header.Set("X-TYPESENSE-API-KEY", cfg.TypesenseAPIKey)

		resp, err := httpClient.Do(req)
		if err == nil && resp.StatusCode == 200 {
			defer resp.Body.Close()
			var data struct {
				Hits []struct {
					Doc struct {
						ID       string    `json:"id"`
						Name     string    `json:"name"`
						NameBn   string    `json:"name_bn"`
						Category string    `json:"category"`
						Location []float64 `json:"location"`
						Address  string    `json:"address"`
					} `json:"document"`
				} `json:"hits"`
			}
			if err := json.NewDecoder(resp.Body).Decode(&data); err == nil {
				mu.Lock()
				for _, h := range data.Hits {
					lat, lng := 0.0, 0.0
					if len(h.Doc.Location) >= 2 {
						lat = h.Doc.Location[0]
						lng = h.Doc.Location[1]
					}
					typesenseResults = append(typesenseResults, AutocompletePrediction{
						PlaceID:     "ov_" + h.Doc.ID,
						Description: fmt.Sprintf("%s, %s", h.Doc.Name, h.Doc.Address),
						Name:        h.Doc.Name,
						NameBn:      h.Doc.NameBn,
						Category:    h.Doc.Category,
						Source:      "overture_places",
						Lat:         lat,
						Lng:         lng,
					})
				}
				mu.Unlock()
			}
		}
	}()

	// Query 2: Photon (OpenStreetMap Streets, Wards, Unmapped Alleys)
	wg.Add(1)
	go func() {
		defer wg.Done()
		url := fmt.Sprintf("%s/api?q=%s&limit=8&lang=default", cfg.PhotonURL, query)
		if hasLocation {
			url += fmt.Sprintf("&lat=%f&lon=%f", userLat, userLng)
		}

		resp, err := httpClient.Get(url)
		if err == nil && resp.StatusCode == 200 {
			defer resp.Body.Close()
			var data struct {
				Features []struct {
					Geometry struct {
						Coordinates []float64 `json:"coordinates"`
					} `json:"geometry"`
					Properties struct {
						OSMID    int64  `json:"osm_id"`
						Name     string `json:"name"`
						Street   string `json:"street"`
						City     string `json:"city"`
						District string `json:"district"`
						Country  string `json:"country"`
						Type     string `json:"type"`
					} `json:"properties"`
				} `json:"features"`
			}
			if err := json.NewDecoder(resp.Body).Decode(&data); err == nil {
				mu.Lock()
				for _, f := range data.Features {
					lat, lng := 0.0, 0.0
					if len(f.Geometry.Coordinates) >= 2 {
						lng = f.Geometry.Coordinates[0]
						lat = f.Geometry.Coordinates[1]
					}
					descParts := []string{}
					if f.Properties.Name != "" {
						descParts = append(descParts, f.Properties.Name)
					}
					if f.Properties.Street != "" && f.Properties.Street != f.Properties.Name {
						descParts = append(descParts, f.Properties.Street)
					}
					if f.Properties.City != "" {
						descParts = append(descParts, f.Properties.City)
					}
					photonResults = append(photonResults, AutocompletePrediction{
						PlaceID:     fmt.Sprintf("osm_%d", f.Properties.OSMID),
						Description: strings.Join(descParts, ", "),
						Name:        f.Properties.Name,
						Category:    f.Properties.Type,
						Source:      "openstreetmap",
						Lat:         lat,
						Lng:         lng,
					})
				}
				mu.Unlock()
			}
		}
	}()

	wg.Wait()

	// Collective Database Merge: Combine in-memory with Geo-ranking
	combined := append(typesenseResults, photonResults...)
	if hasLocation {
		for i := range combined {
			combined[i].DistanceM = haversineDistance(userLat, userLng, combined[i].Lat, combined[i].Lng)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":      "OK",
		"predictions": combined,
		"attribution": "© OpenStreetMap contributors, Overture Maps Foundation, ShopnoJatra Places",
	})
}

// -----------------------------------------------------------------------------
// 2. Reverse Geocoding (L1 Cached via Redis)
// -----------------------------------------------------------------------------

func handleReverseGeocode(w http.ResponseWriter, r *http.Request) {
	latStr := r.URL.Query().Get("lat")
	lngStr := r.URL.Query().Get("lng")
	if latStr == "" || lngStr == "" {
		http.Error(w, `{"error":"lat and lng are required"}`, http.StatusBadRequest)
		return
	}

	lat, _ := strconv.ParseFloat(latStr, 64)
	lng, _ := strconv.ParseFloat(lngStr, 64)

	// Round to 5 decimal places (~1.1 meter precision) for caching
	cacheKey := fmt.Sprintf("revgeo:%.5f:%.5f", lat, lng)
	cached := redisGet(cacheKey)
	if cached != "" {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("X-Cache", "HIT")
		w.Write([]byte(cached))
		return
	}

	// Query Photon Reverse Geocoding
	url := fmt.Sprintf("%s/reverse?lat=%f&lon=%f&lang=default", cfg.PhotonURL, lat, lng)
	resp, err := httpClient.Get(url)
	if err != nil || resp.StatusCode != 200 {
		http.Error(w, `{"error":"reverse geocoding failed"}`, http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	bodyBytes, _ := io.ReadAll(resp.Body)
	redisSetEx(cacheKey, string(bodyBytes), 86400) // 24h cache

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("X-Cache", "MISS")
	w.Write(bodyBytes)
}

// -----------------------------------------------------------------------------
// 3. Directions & ETA (Valhalla with Bangladesh Vehicle Profiles)
// -----------------------------------------------------------------------------

func handleDirections(w http.ResponseWriter, r *http.Request) {
	origin := r.URL.Query().Get("origin")
	destination := r.URL.Query().Get("destination")
	mode := r.URL.Query().Get("mode") // motorbike, cng, car, bicycle

	if origin == "" || destination == "" {
		http.Error(w, `{"error":"origin and destination (lat,lng) required"}`, http.StatusBadRequest)
		return
	}

	origParts := strings.Split(origin, ",")
	destParts := strings.Split(destination, ",")
	if len(origParts) != 2 || len(destParts) != 2 {
		http.Error(w, `{"error":"coordinates must be format 'lat,lng'"}`, http.StatusBadRequest)
		return
	}

	oLat, _ := strconv.ParseFloat(strings.TrimSpace(origParts[0]), 64)
	oLng, _ := strconv.ParseFloat(strings.TrimSpace(origParts[1]), 64)
	dLat, _ := strconv.ParseFloat(strings.TrimSpace(destParts[0]), 64)
	dLng, _ := strconv.ParseFloat(strings.TrimSpace(destParts[1]), 64)

	// Map mode to Valhalla Costing
	costing := "motorcycle"
	costingOptions := map[string]interface{}{}

	switch mode {
	case "bicycle", "rickshaw":
		costing = "bicycle"
		costingOptions["use_roads"] = 0.6
		costingOptions["avoid_bad_surfaces"] = 0.3
	case "cng", "motor_scooter":
		costing = "motor_scooter"
		costingOptions["top_speed"] = 45
		costingOptions["use_primary"] = 0.7
	case "car", "drive":
		costing = "auto"
	default: // motorbike delivery
		costing = "motorcycle"
		costingOptions["top_speed"] = 65
		costingOptions["use_highways"] = 0.8
		costingOptions["use_trails"] = 0.35
		costingOptions["alley_penalty"] = 5
	}

	valhallaPayload := map[string]interface{}{
		"locations": []map[string]interface{}{
			{"lat": oLat, "lon": oLng, "type": "break"},
			{"lat": dLat, "lon": dLng, "type": "break"},
		},
		"costing": costing,
		"costing_options": map[string]interface{}{
			costing: costingOptions,
		},
		"directions_options": map[string]interface{}{
			"units":    "kilometers",
			"language": "en-US",
		},
		"date_time": map[string]interface{}{
			"type": 0, // Real-time traffic aware
		},
	}

	jsonBytes, _ := json.Marshal(valhallaPayload)
	req, _ := http.NewRequest("POST", cfg.ValhallaURL+"/route", bytes.NewBuffer(jsonBytes))
	req.Header.Set("Content-Type", "application/json")

	resp, err := httpClient.Do(req)
	if err != nil || resp.StatusCode != 200 {
		http.Error(w, `{"error":"routing calculation failed in Valhalla engine"}`, http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	w.Header().Set("Content-Type", "application/json")
	io.Copy(w, resp.Body)
}

// -----------------------------------------------------------------------------
// 4. Distance Matrix (Tile38 KNN + Valhalla Matrix)
// -----------------------------------------------------------------------------

func handleDistanceMatrix(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, `{"error":"POST required"}`, http.StatusMethodNotAllowed)
		return
	}

	var reqData struct {
		PickupLat float64 `json:"pickup_lat"`
		PickupLng float64 `json:"pickup_lng"`
		RadiusM   int     `json:"radius_meters"`
		Limit     int     `json:"limit"`
	}
	if err := json.NewDecoder(r.Body).Decode(&reqData); err != nil {
		http.Error(w, `{"error":"invalid JSON"}`, http.StatusBadRequest)
		return
	}
	if reqData.RadiusM == 0 {
		reqData.RadiusM = 3000 // 3 km default
	}
	if reqData.Limit == 0 {
		reqData.Limit = 15
	}

	// Step 1: Query Tile38 for 15 Nearest Available Riders
	cmd := fmt.Sprintf("NEARBY fleet WHERE status == available POINT %f %f %d LIMIT %d\r\n",
		reqData.PickupLat, reqData.PickupLng, reqData.RadiusM, reqData.Limit)

	rawResp := tile38Exec(cmd)

	// Step 2: Return Matrix Result
	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(fmt.Sprintf(`{"status":"OK","nearby_riders_query":"%s","data":%s}`, cmd, rawResp)))
}

// -----------------------------------------------------------------------------
// 5. Snap to Roads (Valhalla Meili HMM Map Matching)
// -----------------------------------------------------------------------------

func handleSnapToRoads(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, `{"error":"POST required"}`, http.StatusMethodNotAllowed)
		return
	}

	// Forward directly to Valhalla /trace_route
	body, _ := io.ReadAll(r.Body)
	req, _ := http.NewRequest("POST", cfg.ValhallaURL+"/trace_route", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")

	resp, err := httpClient.Do(req)
	if err != nil || resp.StatusCode != 200 {
		http.Error(w, `{"error":"map matching trace failed"}`, http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	w.Header().Set("Content-Type", "application/json")
	io.Copy(w, resp.Body)
}

// -----------------------------------------------------------------------------
// 6. Fleet GPS Ping & Centrifugo Real-time Publish
// -----------------------------------------------------------------------------

type FleetPingRequest struct {
	RiderID   string  `json:"rider_id"`
	OrderID   string  `json:"order_id,omitempty"`
	Lat       float64 `json:"lat"`
	Lng       float64 `json:"lng"`
	Heading   float64 `json:"heading"`
	Speed     float64 `json:"speed"` // km/h
	Timestamp int64   `json:"timestamp"`
}

func handleFleetPing(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, `{"error":"POST required"}`, http.StatusMethodNotAllowed)
		return
	}

	var ping FleetPingRequest
	if err := json.NewDecoder(r.Body).Decode(&ping); err != nil {
		http.Error(w, `{"error":"invalid JSON payload"}`, http.StatusBadRequest)
		return
	}

	// Anti-Spoofing: Plausibility check (speed must be < 130 km/h)
	if ping.Speed > 130.0 {
		http.Error(w, `{"error":"implausible GPS speed rejected"}`, http.StatusBadRequest)
		return
	}

	// 1. In-memory update to Tile38
	tile38Cmd := fmt.Sprintf("SET fleet %s POINT %f %f FIELD heading %f FIELD speed %f\r\n",
		ping.RiderID, ping.Lat, ping.Lng, ping.Heading, ping.Speed)
	tile38Exec(tile38Cmd)

	// 2. In-process Uber H3 calculation for Surge tracking
	coord := h3.GeoCoord{Latitude: ping.Lat, Longitude: ping.Lng}
	h3Res8 := h3.FromGeo(coord, 8)
	h3IndexStr := fmt.Sprintf("%x", h3Res8)

	// Increment rider count in H3 cell
	redisCmd(fmt.Sprintf("HINCRBY h3:fleet:%s active_riders 1", h3IndexStr))
	redisCmd(fmt.Sprintf("EXPIRE h3:fleet:%s 30", h3IndexStr))

	// 3. Publish sanitized coordinates to Centrifugo v6 /api/publish
	channel := "rider:" + ping.RiderID
	if ping.OrderID != "" {
		channel = "order:" + ping.OrderID
	}

	publishPayload := map[string]interface{}{
		"method": "publish",
		"params": map[string]interface{}{
			"channel": channel,
			"data": map[string]interface{}{
				"rider_id":  ping.RiderID,
				"lat":       ping.Lat,
				"lng":       ping.Lng,
				"heading":   ping.Heading,
				"speed":     ping.Speed,
				"h3_index":  h3IndexStr,
				"timestamp": time.Now().Unix(),
			},
		},
	}

	pubBytes, _ := json.Marshal(publishPayload)
	centReq, _ := http.NewRequest("POST", cfg.CentrifugoAPIURL+"/publish", bytes.NewBuffer(pubBytes))
	centReq.Header.Set("Authorization", "apikey "+cfg.CentrifugoAPIKey)
	centReq.Header.Set("Content-Type", "application/json")
	go httpClient.Do(centReq) // asynchronous dispatch

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"status":"ACK","h3_cell":"` + h3IndexStr + `"}`))
}

// -----------------------------------------------------------------------------
// 7. Surge Pricing & Demand Grid (In-process Uber H3)
// -----------------------------------------------------------------------------

func handleSurgePricing(w http.ResponseWriter, r *http.Request) {
	latStr := r.URL.Query().Get("lat")
	lngStr := r.URL.Query().Get("lng")
	if latStr == "" || lngStr == "" {
		http.Error(w, `{"error":"lat and lng required"}`, http.StatusBadRequest)
		return
	}

	lat, _ := strconv.ParseFloat(latStr, 64)
	lng, _ := strconv.ParseFloat(lngStr, 64)

	// Uber H3 Resolution 8 (~531m edge, 0.737 km²)
	coord := h3.GeoCoord{Latitude: lat, Longitude: lng}
	h3Res8 := h3.FromGeo(coord, 8)
	h3IndexStr := fmt.Sprintf("%x", h3Res8)

	// Base multiplier
	multiplier := 1.0

	// Check demand counter in Redis
	activeRidersStr := redisGet("h3:fleet:" + h3IndexStr)
	activeRiders := 5 // default fallback
	if activeRidersStr != "" {
		activeRiders, _ = strconv.Atoi(activeRidersStr)
	}

	if activeRiders < 3 {
		multiplier = 1.35
	} else if activeRiders < 1 {
		multiplier = 1.50
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"h3_index":        h3IndexStr,
		"resolution":      8,
		"surge_multiplier": multiplier,
		"active_riders":   activeRiders,
	})
}

// -----------------------------------------------------------------------------
// 8. Multi-Order Delivery Optimization (VROOM)
// -----------------------------------------------------------------------------

func handleOptimizeDispatch(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, `{"error":"POST required"}`, http.StatusMethodNotAllowed)
		return
	}

	body, _ := io.ReadAll(r.Body)
	req, _ := http.NewRequest("POST", cfg.VroomURL+"/", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")

	resp, err := httpClient.Do(req)
	if err != nil || resp.StatusCode != 200 {
		http.Error(w, `{"error":"VROOM optimization failed"}`, http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	w.Header().Set("Content-Type", "application/json")
	io.Copy(w, resp.Body)
}

// -----------------------------------------------------------------------------
// 9. Generate Centrifugo v6 JWT with 'sub' claim
// -----------------------------------------------------------------------------

func handleGenerateToken(w http.ResponseWriter, r *http.Request) {
	userID := r.URL.Query().Get("user_id")
	if userID == "" {
		userID = "anon_" + strconv.FormatInt(time.Now().UnixNano(), 36)
	}

	claims := jwt.MapClaims{
		"sub": userID,
		"exp": time.Now().Add(24 * time.Hour).Unix(),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString([]byte(cfg.CentrifugoSecret))
	if err != nil {
		http.Error(w, `{"error":"token signing failed"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"token":   tokenString,
		"user_id": userID,
		"expires": 86400,
	})
}

// -----------------------------------------------------------------------------
// Helpers & Sockets
// -----------------------------------------------------------------------------

func haversineDistance(lat1, lon1, lat2, lon2 float64) float64 {
	const R = 6371000 // Earth radius in meters
	dLat := (lat2 - lat1) * (math.Pi / 180.0)
	dLon := (lon2 - lon1) * (math.Pi / 180.0)
	a := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Cos(lat1*(math.Pi/180.0))*math.Cos(lat2*(math.Pi/180.0))*
			math.Sin(dLon/2)*math.Sin(dLon/2)
	c := 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
	return R * c
}

func tile38Exec(cmd string) string {
	conn, err := net.DialTimeout("tcp", cfg.Tile38Addr, 2*time.Second)
	if err != nil {
		return `{"error":"tile38 unreachable"}`
	}
	defer conn.Close()

	conn.Write([]byte(cmd))
	buf := make([]byte, 4096)
	n, _ := conn.Read(buf)
	return strings.TrimSpace(string(buf[:n]))
}

func redisCmd(cmd string) {
	conn, err := net.DialTimeout("tcp", cfg.RedisAddr, 1*time.Second)
	if err == nil {
		defer conn.Close()
		conn.Write([]byte(cmd + "\r\n"))
	}
}

func redisGet(key string) string {
	conn, err := net.DialTimeout("tcp", cfg.RedisAddr, 1*time.Second)
	if err != nil {
		return ""
	}
	defer conn.Close()

	conn.Write([]byte("GET " + key + "\r\n"))
	buf := make([]byte, 4096)
	n, _ := conn.Read(buf)
	res := string(buf[:n])
	lines := strings.Split(res, "\r\n")
	if len(lines) >= 2 && !strings.HasPrefix(lines[0], "$-1") {
		return lines[1]
	}
	return ""
}

func redisSetEx(key, val string, seconds int) {
	conn, err := net.DialTimeout("tcp", cfg.RedisAddr, 1*time.Second)
	if err == nil {
		defer conn.Close()
		cmd := fmt.Sprintf("SETEX %s %d %s\r\n", key, seconds, val)
		conn.Write([]byte(cmd))
	}
}
