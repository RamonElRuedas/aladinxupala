// Wraps a Leaflet map + Leaflet.draw so the host can draw a polygon that
// restricts where round locations may be picked from.
(function (global) {
  "use strict";

  class AreaMap {
    constructor(containerId, onChange) {
      this.onChange = onChange || function () {};
      this.polygon = null;

      this.map = L.map(containerId).setView([20, 0], 2);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(this.map);

      this.drawnItems = new L.FeatureGroup();
      this.map.addLayer(this.drawnItems);

      this.drawControl = new L.Control.Draw({
        draw: {
          polygon: {
            allowIntersection: false,
            showArea: true,
          },
          polyline: false,
          rectangle: true,
          circle: false,
          circlemarker: false,
          marker: false,
        },
        edit: {
          featureGroup: this.drawnItems,
        },
      });
      this.map.addControl(this.drawControl);

      this.map.on(L.Draw.Event.CREATED, (e) => {
        this.drawnItems.clearLayers();
        this.drawnItems.addLayer(e.layer);
        this._updatePolygon(e.layer);
      });
      this.map.on(L.Draw.Event.EDITED, (e) => {
        e.layers.eachLayer((layer) => this._updatePolygon(layer));
      });
      this.map.on(L.Draw.Event.DELETED, () => {
        this.polygon = null;
        this.onChange(null);
      });
    }

    _updatePolygon(layer) {
      const latlngs = layer.getLatLngs()[0];
      this.polygon = latlngs.map((ll) => ({ lat: ll.lat, lng: ll.lng }));
      this.onChange(this.polygon);
    }

    getPolygon() {
      return this.polygon;
    }

    destroy() {
      this.map.remove();
    }
  }

  global.AreaMap = AreaMap;
})(typeof window !== "undefined" ? window : globalThis);
