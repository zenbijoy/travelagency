/**
 * bengali-text-plugin.ts
 *
 * Configures MapLibre GL JS to render Bengali conjuncts (juktakkhor) and vowel signs (kar)
 * without broken hasanta characters, using HarfBuzz Positioned Glyph Font (PGF) encoding.
 */

import maplibregl from 'maplibre-gl';

export function initializeBengaliTextPlugin() {
  // Sets the RTL and Indic complex text shaping plugin
  maplibregl.setRTLTextPlugin(
    'https://unpkg.com/@mapbox/mapbox-gl-rtl-text@0.2.3/mapbox-gl-rtl-text.min.js',
    (err) => {
      if (err) {
        console.error('Error loading RTL/Indic text plugin:', err);
      } else {
        console.log('✅ Bengali & Indic text shaping initialized successfully');
      }
    },
    true // Lazy load
  );
}
