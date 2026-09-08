// Pure geometry helpers used to restrict round locations to a user-drawn area.
// No dependency on Leaflet/Google Maps so this file can be unit tested standalone.
(function (global) {
  "use strict";

  const EARTH_RADIUS_KM = 6371;

  function toRad(deg) {
    return (deg * Math.PI) / 180;
  }

  /**
   * Great-circle distance between two {lat,lng} points, in kilometers.
   */
  function haversineDistanceKm(a, b) {
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);

    const sinDLat = Math.sin(dLat / 2);
    const sinDLng = Math.sin(dLng / 2);
    const h =
      sinDLat * sinDLat +
      Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
    const c = 2 * Math.asin(Math.min(1, Math.sqrt(h)));
    return EARTH_RADIUS_KM * c;
  }

  /**
   * Ray-casting point-in-polygon test.
   * point: {lat, lng}
   * polygon: array of {lat, lng}, at least 3 points. Not required to be closed.
   */
  function pointInPolygon(point, polygon) {
    let inside = false;
    const x = point.lng;
    const y = point.lat;

    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].lng;
      const yi = polygon[i].lat;
      const xj = polygon[j].lng;
      const yj = polygon[j].lat;

      const intersect =
        yi > y !== yj > y &&
        x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function boundingBox(polygon) {
    let minLat = Infinity;
    let maxLat = -Infinity;
    let minLng = Infinity;
    let maxLng = -Infinity;
    for (const p of polygon) {
      if (p.lat < minLat) minLat = p.lat;
      if (p.lat > maxLat) maxLat = p.lat;
      if (p.lng < minLng) minLng = p.lng;
      if (p.lng > maxLng) maxLng = p.lng;
    }
    return { minLat, maxLat, minLng, maxLng };
  }

  /**
   * Picks a uniformly random point inside the polygon via rejection sampling
   * against its bounding box. Falls back to the polygon centroid if no
   * sample is accepted within maxAttempts (e.g. degenerate/very thin shapes).
   */
  function randomPointInPolygon(polygon, maxAttempts = 500) {
    if (!polygon || polygon.length < 3) {
      throw new Error("A polygon needs at least 3 points");
    }
    const bbox = boundingBox(polygon);

    for (let i = 0; i < maxAttempts; i++) {
      const candidate = {
        lat: bbox.minLat + Math.random() * (bbox.maxLat - bbox.minLat),
        lng: bbox.minLng + Math.random() * (bbox.maxLng - bbox.minLng),
      };
      if (pointInPolygon(candidate, polygon)) {
        return candidate;
      }
    }

    // Fallback: centroid (may not be perfectly inside for concave polygons,
    // but keeps the game usable instead of failing).
    let latSum = 0;
    let lngSum = 0;
    for (const p of polygon) {
      latSum += p.lat;
      lngSum += p.lng;
    }
    return { lat: latSum / polygon.length, lng: lngSum / polygon.length };
  }

  /**
   * Diagonal distance (km) of the polygon's bounding box, used to scale
   * scoring so it adapts to the size of the drawn area.
   */
  function polygonDiagonalKm(polygon) {
    const bbox = boundingBox(polygon);
    const corner1 = { lat: bbox.minLat, lng: bbox.minLng };
    const corner2 = { lat: bbox.maxLat, lng: bbox.maxLng };
    return haversineDistanceKm(corner1, corner2);
  }

  /**
   * GeoGuessr-style exponential score decay, scaled to the play area size.
   * Returns an integer between 0 and 5000.
   */
  function scoreForDistance(distanceKm, areaDiagonalKm) {
    const scale = Math.max(areaDiagonalKm / 6, 0.05);
    const score = 5000 * Math.exp(-distanceKm / scale);
    return Math.round(Math.max(0, Math.min(5000, score)));
  }

  function generateRoomCode(length = 5) {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // avoid ambiguous chars
    let code = "";
    for (let i = 0; i < length; i++) {
      code += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return code;
  }

  const Geometry = {
    haversineDistanceKm,
    pointInPolygon,
    boundingBox,
    randomPointInPolygon,
    polygonDiagonalKm,
    scoreForDistance,
    generateRoomCode,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = Geometry;
  } else {
    global.Geometry = Geometry;
  }
})(typeof window !== "undefined" ? window : globalThis);
