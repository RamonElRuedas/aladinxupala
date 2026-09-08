# GeoDuel

A browser-only, no-backend GeoGuessr-style game. There is no server or
database of any kind — it is a static site (HTML/CSS/JS) that runs entirely
in the browser. Multiplayer works over peer-to-peer WebRTC connections
(via [PeerJS](https://peerjs.com/), which only uses a free public broker to
help peers find each other; no game logic or data goes through it), so
players join each other directly using a short room code.

## Features

- **Draw your own play area.** The host draws a polygon on a map
  (Leaflet + Leaflet.draw); every round's location is randomly sampled from
  inside that polygon only.
- **Room codes, no accounts.** The host starts a room and gets a short code
  to share; friends join by typing that code in — no sign-up, no server.
- **Street View rounds.** Each round drops players into Google Street View
  near a random point inside the drawn area, then they guess on a map.
  Scoring is distance-based and scaled to the size of the chosen area.
- **Live multiplayer.** All players see the same rounds, submit guesses,
  and see round-by-round and final leaderboards.

## Running it

This is a static site with no build step. Any static file server works, e.g.:

```bash
python3 -m http.server 8080
# open http://localhost:8080/index.html
```

You'll need a Google Maps JavaScript API key (used only in your browser to
render Street View — get one for free in the
[Google Cloud Console](https://console.cloud.google.com/google/maps-apis)).
It is stored only in your browser's `localStorage`, never sent anywhere but
directly to Google's Street View service.

## How multiplayer works

The host's browser tab acts as the hub of a star topology: every guest
connects directly to the host via a WebRTC data channel, and the host
relays round starts, guesses, and results. Because this is a pure
client-side game, the host process has full authority over round data —
there is intentionally no dedicated backend to trust instead.

## Tests

Pure game logic (distance math, point-in-polygon sampling, scoring, room
code generation) lives in `js/geometry.js` and is covered by unit tests:

```bash
npm test
```

