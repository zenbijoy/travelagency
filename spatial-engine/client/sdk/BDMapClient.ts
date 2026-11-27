/**
 * BDMapClient.ts
 *
 * Universal TypeScript / JavaScript Client SDK for ShopnoJatra Autonomous Map Platform.
 * Drop-in Google Maps and Uber Movement replacement for Bangladesh.
 * Compatible with Node.js, React Native, React, Next.js, and Vue.
 */

export interface AutocompletePrediction {
  place_id: string;
  description: string;
  name: string;
  name_bn?: string;
  category: string;
  source: string;
  lat: number;
  lng: number;
  distance_meters?: number;
}

export interface RouteManeuver {
  instruction: string;
  distance_km: number;
  time_seconds: number;
}

export interface GeoJSONLineString {
  type: string;
  coordinates: number[][];
}

export interface DirectionsResult {
  status: string;
  summary: {
    distance_km: number;
    duration_seconds: number;
  };
  geometry_geojson?: GeoJSONLineString;
  legs?: Array<{
    maneuvers: RouteManeuver[];
  }>;
}

export interface DistanceMatrixResult {
  status: string;
  nearby_riders: Array<{
    rider_id: string;
    lat: number;
    lng: number;
    distance_meters: number;
    eta_seconds: number;
  }>;
}

export interface SurgeResult {
  h3_index: string;
  resolution: number;
  surge_multiplier: number;
  active_riders: number;
}

export interface RiderPing {
  riderId: string;
  orderId?: string;
  lat: number;
  lng: number;
  heading: number;
  speed: number; // km/h
}

export interface BDMapClientOptions {
  baseURL?: string;
  apiKey: string;
  timeoutMs?: number;
}

export class BDMapClient {
  private baseURL: string;
  private apiKey: string;
  private timeoutMs: number;

  constructor(options: BDMapClientOptions) {
    this.baseURL = (options.baseURL || 'https://api.yourdomain.com').replace(/\/+$/, '');
    this.apiKey = options.apiKey;
    this.timeoutMs = options.timeoutMs || 8000;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseURL}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      'X-API-Key': this.apiKey,
      ...(options.headers || {}),
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`BDMapClient Error [${response.status}]: ${errorText}`);
      }

      return (await response.json()) as T;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * 1. Google Places Autocomplete Replacement
   * Search addresses, markets, restaurants, and holding numbers in Bengali and English
   */
  async autocomplete(query: string, userLocation?: { lat: number; lng: number }): Promise<AutocompletePrediction[]> {
    let endpoint = `/v1/places/autocomplete?input=${encodeURIComponent(query)}`;
    if (userLocation) {
      endpoint += `&lat=${userLocation.lat}&lng=${userLocation.lng}`;
    }

    const res = await this.request<{ predictions: AutocompletePrediction[] }>(endpoint);
    return res.predictions || [];
  }

  /**
   * 2. Reverse Geocoding
   * Convert latitude/longitude into complete Bengali structured street address
   */
  async reverseGeocode(lat: number, lng: number): Promise<any> {
    return this.request<any>(`/v1/geocode/reverse?lat=${lat}&lng=${lng}&lang=bn`);
  }

  /**
   * 3. Google Directions API Replacement
   * Turn-by-turn routing with dynamic costing for motorbike, cng, car, and rickshaw
   */
  async getDirections(
    origin: { lat: number; lng: number },
    destination: { lat: number; lng: number },
    mode: 'motorbike' | 'cng' | 'car' | 'bicycle' = 'motorbike'
  ): Promise<DirectionsResult> {
    const originStr = `${origin.lat},${origin.lng}`;
    const destStr = `${destination.lat},${destination.lng}`;
    const endpoint = `/v1/directions?origin=${originStr}&destination=${destStr}&mode=${mode}`;

    return this.request<DirectionsResult>(endpoint);
  }

  /**
   * 4. Google Distance Matrix Replacement
   * Queries nearby riders around a pickup point and calculates exact ETAs in < 2ms
   */
  async getDistanceMatrix(pickup: { lat: number; lng: number }, radiusMeters = 3000, limit = 15): Promise<DistanceMatrixResult> {
    return this.request<DistanceMatrixResult>('/v1/distancematrix', {
      method: 'POST',
      body: JSON.stringify({
        pickup_lat: pickup.lat,
        pickup_lng: pickup.lng,
        radius_meters: radiusMeters,
        limit,
      }),
    });
  }

  /**
   * 5. Google Roads API (Snap to Roads / Map Matching)
   * Snaps noisy GPS traces onto true road centerlines
   */
  async snapToRoads(coordinates: Array<{ lat: number; lon: number; time?: number }>): Promise<any> {
    return this.request<any>('/v1/roads/snap', {
      method: 'POST',
      body: JSON.stringify({
        shape: coordinates,
        costing: 'motorcycle',
      }),
    });
  }

  /**
   * 6. Live Fleet Ping
   * Transmits rider GPS to Centrifugo WebSocket and Tile38 spatial DB
   */
  async pingRiderLocation(ping: RiderPing): Promise<{ status: string; h3_cell: string }> {
    return this.request<{ status: string; h3_cell: string }>('/v1/fleet/ping', {
      method: 'POST',
      body: JSON.stringify({
        rider_id: ping.riderId,
        order_id: ping.orderId,
        lat: ping.lat,
        lng: ping.lng,
        heading: ping.heading,
        speed: ping.speed,
        timestamp: Date.now(),
      }),
    });
  }

  /**
   * 7. Uber H3 Surge Multiplier
   * Fetches real-time supply/demand multiplier for current location
   */
  async getSurgeMultiplier(lat: number, lng: number): Promise<SurgeResult> {
    return this.request<SurgeResult>(`/v1/surge?lat=${lat}&lng=${lng}`);
  }

  /**
   * 8. Offline Map Manifest
   * Checks for offline bundle availability and update hashes
   */
  async getOfflineManifest(): Promise<any> {
    return this.request<any>('/v1/offline/manifest');
  }
}
