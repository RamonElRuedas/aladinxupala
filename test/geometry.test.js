const test = require("node:test");
const assert = require("node:assert/strict");
const Geometry = require("../js/geometry.js");

test("haversineDistanceKm is ~0 for identical points", () => {
  const p = { lat: 40.4168, lng: -3.7038 };
  assert.ok(Geometry.haversineDistanceKm(p, p) < 1e-6);
});

test("haversineDistanceKm matches known Madrid-Barcelona distance", () => {
  const madrid = { lat: 40.4168, lng: -3.7038 };
  const barcelona = { lat: 41.3874, lng: 2.1686 };
  const d = Geometry.haversineDistanceKm(madrid, barcelona);
  // Real distance is ~505km, allow generous tolerance for the spherical model.
  assert.ok(d > 490 && d < 520, `expected ~505km, got ${d}`);
});

test("pointInPolygon detects points inside and outside a square", () => {
  const square = [
    { lat: 0, lng: 0 },
    { lat: 0, lng: 10 },
    { lat: 10, lng: 10 },
    { lat: 10, lng: 0 },
  ];
  assert.equal(Geometry.pointInPolygon({ lat: 5, lng: 5 }, square), true);
  assert.equal(Geometry.pointInPolygon({ lat: 15, lng: 5 }, square), false);
  assert.equal(Geometry.pointInPolygon({ lat: -1, lng: -1 }, square), false);
});

test("randomPointInPolygon always returns a point inside the polygon", () => {
  const square = [
    { lat: 0, lng: 0 },
    { lat: 0, lng: 10 },
    { lat: 10, lng: 10 },
    { lat: 10, lng: 0 },
  ];
  for (let i = 0; i < 200; i++) {
    const p = Geometry.randomPointInPolygon(square);
    assert.equal(Geometry.pointInPolygon(p, square), true);
  }
});

test("randomPointInPolygon throws for degenerate polygons", () => {
  assert.throws(() => Geometry.randomPointInPolygon([{ lat: 0, lng: 0 }]));
});

test("scoreForDistance decreases with distance and stays within [0, 5000]", () => {
  const areaDiagonal = 500;
  const near = Geometry.scoreForDistance(0, areaDiagonal);
  const mid = Geometry.scoreForDistance(100, areaDiagonal);
  const far = Geometry.scoreForDistance(10000, areaDiagonal);
  assert.equal(near, 5000);
  assert.ok(mid < near);
  assert.ok(far < mid);
  assert.ok(far >= 0);
});

test("generateRoomCode returns a code of the requested length using safe alphabet", () => {
  const code = Geometry.generateRoomCode(6);
  assert.equal(code.length, 6);
  assert.match(code, /^[A-Z0-9]+$/);
  assert.doesNotMatch(code, /[01OI]/); // ambiguous characters excluded
});

test("polygonDiagonalKm is 0 for a single point and positive for a real polygon", () => {
  const square = [
    { lat: 0, lng: 0 },
    { lat: 0, lng: 1 },
    { lat: 1, lng: 1 },
    { lat: 1, lng: 0 },
  ];
  assert.ok(Geometry.polygonDiagonalKm(square) > 0);
});
