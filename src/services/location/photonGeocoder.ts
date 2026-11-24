/**
 * Photon Geocoder Service (Powered by Komoot / OpenStreetMap)
 * Free, open-source, typo-tolerant place autocomplete and reverse geocoding
 * with Bangladesh coordinate biasing.
 * Replaces expensive Google Places API calls.
 */

export interface PhotonFeature {
  type: string;
  geometry: {
    coordinates: [number, number]; // [lon, lat]
    type: string;
  };
  properties: {
    osm_id: number;
    osm_type: string;
    osm_key: string;
    osm_value: string;
    name: string;
    country?: string;
    city?: string;
    state?: string;
    district?: string;
    postcode?: string;
    street?: string;
    housenumber?: string;
  };
}

export interface GeocodingResult {
  id: string;
  displayName: string;
  city: string;
  district: string;
  latitude: number;
  longitude: number;
  osmType: string;
}

// Center of Bangladesh (near Dhaka) for location biasing
const BANGLADESH_LAT = 23.685;
const BANGLADESH_LON = 90.3563;
const PHOTON_BASE_URL = "https://photon.komoot.io/api";

export const photonGeocoder = {
  /**
   * Search for places/destinations with Bangladesh location bias and typo tolerance
   */
  async searchPlaces(query: string, limit: number = 8): Promise<GeocodingResult[]> {
    if (!query || query.trim().length < 2) {
      return [];
    }

    try {
      const trimmed = encodeURIComponent(query.trim());
      const url = `${PHOTON_BASE_URL}/?q=${trimmed}&lat=${BANGLADESH_LAT}&lon=${BANGLADESH_LON}&limit=${limit}&lang=en`;

      const res = await fetch(url, {
        headers: { Accept: "application/json" },
      });

      if (!res.ok) {
        console.warn(`Photon API error: HTTP ${res.status}`);
        return [];
      }

      const data = await res.json();
      const features: PhotonFeature[] = data.features || [];

      return features.map((f, idx) => {
        const [lon, lat] = f.geometry.coordinates;
        const p = f.properties;
        const parts = [p.name, p.district, p.city || p.state, p.country].filter(Boolean);

        return {
          id: `${p.osm_type || "osm"}_${p.osm_id || idx}_${lat}_${lon}`,
          displayName: parts.join(", "),
          city: p.city || p.district || p.name,
          district: p.district || p.state || "Bangladesh",
          latitude: lat,
          longitude: lon,
          osmType: p.osm_value || p.osm_key || "place",
        };
      });
    } catch (error) {
      console.warn("Photon searchPlaces failed, falling back to local dataset:", error);
      return [];
    }
  },

  /**
   * Reverse geocoding: Find place name from coordinates
   */
  async reverseGeocode(lat: number, lon: number): Promise<GeocodingResult | null> {
    try {
      const url = `https://photon.komoot.io/reverse?lat=${lat}&lon=${lon}`;
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
      });

      if (!res.ok) return null;

      const data = await res.json();
      const first: PhotonFeature | undefined = data.features?.[0];
      if (!first) return null;

      const [cLon, cLat] = first.geometry.coordinates;
      const p = first.properties;
      const parts = [p.name, p.street, p.city || p.district, p.country].filter(Boolean);

      return {
        id: `${p.osm_type}_${p.osm_id}`,
        displayName: parts.join(", "),
        city: p.city || p.district || p.name,
        district: p.district || "Bangladesh",
        latitude: cLat,
        longitude: cLon,
        osmType: p.osm_value || "place",
      };
    } catch (err) {
      console.warn("Photon reverseGeocode error:", err);
      return null;
    }
  },
};
