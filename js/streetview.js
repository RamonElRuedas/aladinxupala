// Google Street View panorama for round display, plus small Leaflet maps
// for guessing and showing round results. Google Maps JS API is loaded
// dynamically once the player supplies their own client-side API key.
(function (global) {
  "use strict";

  let mapsApiLoadPromise = null;

  function loadGoogleMapsApi(apiKey) {
    if (mapsApiLoadPromise) return mapsApiLoadPromise;
    mapsApiLoadPromise = new Promise((resolve, reject) => {
      if (global.google && global.google.maps) {
        resolve(global.google.maps);
        return;
      }
      const callbackName = "__geoduel_maps_cb_" + Date.now();
      global[callbackName] = () => {
        delete global[callbackName];
        resolve(global.google.maps);
      };
      const script = document.createElement("script");
      script.src =
        "https://maps.googleapis.com/maps/api/js?key=" +
        encodeURIComponent(apiKey) +
        "&callback=" +
        callbackName;
      script.async = true;
      script.onerror = () => reject(new Error("Failed to load Google Maps API. Check your API key."));
      document.head.appendChild(script);
    });
    return mapsApiLoadPromise;
  }

  /**
   * Shows a Street View panorama near the given location. Uses
   * StreetViewService to snap to the closest available panorama within
   * a search radius, since arbitrary lat/lng points rarely have exact
   * coverage.
   */
  async function showStreetView(containerId, apiKey, location, radiusMeters) {
    const maps = await loadGoogleMapsApi(apiKey);
    const svService = new maps.StreetViewService();

    return new Promise((resolve, reject) => {
      svService.getPanorama(
        { location, radius: radiusMeters || 50000, source: maps.StreetViewSource.OUTDOOR },
        (data, status) => {
          if (status !== "OK") {
            reject(new Error("No Street View coverage found near this location."));
            return;
          }
          const panoLatLng = data.location.latLng;
          const panorama = new maps.StreetViewPanorama(
            document.getElementById(containerId),
            {
              position: panoLatLng,
              pov: { heading: Math.random() * 360, pitch: 0 },
              addressControl: false,
              linksControl: true,
              panControl: true,
              zoomControl: true,
              fullscreenControl: false,
              motionTracking: false,
              motionTrackingControl: false,
              showRoadLabels: false,
            }
          );
          resolve(panorama);
        }
      );
    });
  }

  /**
   * Small interactive Leaflet map used to place a guess marker.
   */
  class GuessMap {
    constructor(containerId, onGuess) {
      this.onGuess = onGuess || function () {};
      this.marker = null;
      this.map = L.map(containerId).setView([20, 0], 2);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(this.map);

      this.map.on("click", (e) => {
        this.setGuess(e.latlng.lat, e.latlng.lng);
        this.onGuess({ lat: e.latlng.lat, lng: e.latlng.lng });
      });
    }

    setGuess(lat, lng) {
      const latlng = [lat, lng];
      if (this.marker) {
        this.marker.setLatLng(latlng);
      } else {
        this.marker = L.marker(latlng).addTo(this.map);
      }
      this.guess = { lat, lng };
    }

    reset() {
      if (this.marker) {
        this.map.removeLayer(this.marker);
        this.marker = null;
      }
      this.guess = null;
    }

    invalidateSize() {
      this.map.invalidateSize();
    }

    destroy() {
      this.map.remove();
    }
  }

  /**
   * Read-only map used on the round-result screen: shows the actual
   * location plus every player's guess with a line connecting them.
   */
  class ResultMap {
    constructor(containerId) {
      this.map = L.map(containerId).setView([20, 0], 2);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(this.map);
      this.layer = L.layerGroup().addTo(this.map);
    }

    render(actual, guesses) {
      this.layer.clearLayers();
      const bounds = [];

      const actualMarker = L.marker([actual.lat, actual.lng], {
        icon: L.divIcon({ className: "actual-marker", html: "📍" }),
      }).addTo(this.layer);
      actualMarker.bindTooltip("Actual location", { permanent: true, direction: "top" });
      bounds.push([actual.lat, actual.lng]);

      for (const g of guesses) {
        if (!g.location) continue;
        L.marker([g.location.lat, g.location.lng])
          .addTo(this.layer)
          .bindTooltip(g.name + " (" + g.score + " pts)", { permanent: true });
        L.polyline(
          [
            [actual.lat, actual.lng],
            [g.location.lat, g.location.lng],
          ],
          { color: "#2ecc71", dashArray: "4 6" }
        ).addTo(this.layer);
        bounds.push([g.location.lat, g.location.lng]);
      }

      if (bounds.length > 1) {
        this.map.fitBounds(bounds, { padding: [30, 30] });
      } else {
        this.map.setView(bounds[0], 10);
      }
    }

    invalidateSize() {
      this.map.invalidateSize();
    }

    destroy() {
      this.map.remove();
    }
  }

  global.StreetViewModule = {
    loadGoogleMapsApi,
    showStreetView,
  };
  global.GuessMap = GuessMap;
  global.ResultMap = ResultMap;
})(typeof window !== "undefined" ? window : globalThis);
