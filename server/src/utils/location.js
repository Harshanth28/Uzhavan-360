/**
 * Location Utilities — Geospatial helpers for Uzhavan 360
 * Level 1 Architecture Reference: Section 11 — Google Maps Architecture
 */

const EARTH_RADIUS_KM = 6371;

/**
 * Compute Haversine distance between two lat/lng points.
 * @param {{lat: number, lng: number}} point1
 * @param {{lat: number, lng: number}} point2
 * @returns {number} distance in kilometres
 */
export function haversineDistance(point1, point2) {
  const toRad = (v) => (v * Math.PI) / 180;
  const dLat = toRad(point2.lat - point1.lat);
  const dLng = toRad(point2.lng - point1.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(point1.lat)) * Math.cos(toRad(point2.lat)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Apply spatial privacy jitter to protect farmer exact coordinates.
 * Level 1 Architecture Decision Record: ADR 05
 *
 * @param {{lat: number, lng: number}} exactCoords
 * @param {number} maxJitterMeters - Default 1000m (1 km)
 * @returns {{lat: number, lng: number}} Fuzzed approximate coords
 */
export function applyPrivacyJitter(exactCoords, maxJitterMeters = 1000) {
  const jitterDegLat = (maxJitterMeters / 111320) * (Math.random() * 2 - 1);
  const jitterDegLng =
    (maxJitterMeters / (111320 * Math.cos((exactCoords.lat * Math.PI) / 180))) *
    (Math.random() * 2 - 1);
  return {
    lat: parseFloat((exactCoords.lat + jitterDegLat).toFixed(6)),
    lng: parseFloat((exactCoords.lng + jitterDegLng).toFixed(6))
  };
}

/**
 * Build a MongoDB GeoJSON Point for storage.
 * MongoDB 2dsphere index format: [longitude, latitude]
 */
export function toGeoJsonPoint(lat, lng) {
  return {
    type: 'Point',
    coordinates: [parseFloat(lng), parseFloat(lat)]
  };
}

/**
 * Convert metres to MongoDB $nearSphere maxDistance (metres).
 * @param {number} km
 */
export function kmToMetres(km) {
  return km * 1000;
}

/**
 * Default discovery radius in km
 */
export const DEFAULT_DISCOVERY_RADIUS_KM = 25;
export const MAX_DISCOVERY_RADIUS_KM = 100;
