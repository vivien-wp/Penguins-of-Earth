# PROJECT: GLOBE — Penguins of Earth

A slow-spinning dotted globe that charts where every species of penguin lives.
A sandbox, built for no reason except that it should exist. 🐧

## The constraints (self-imposed)
- **One font** — JetBrains Mono, weights only.
- **Three colours** — `--ink` `--mist` `--phosphor` (alpha variants allowed, no fourth hue).
- **No gradient spam** — exactly one faint sphere vignette, drawn on the canvas.
- **Dark + light mode** — the three colours swap roles; the canvas re-reads them live.
- **Mobile-ready** — the species card becomes a bottom sheet under 640px.
- **No libraries** — the globe is hand-built on a 2D `<canvas>`. No WebGL, no deps.

## How the globe works
- `mask.js` holds an embedded equirectangular land mask (360×180, 1 bit/cell, ~11 KB)
  packed from a Wikimedia Commons world silhouette. The globe is fully self-contained —
  it needs no live fetch to render the continents.
- `globe.js` walks a lat/long grid, keeps the land cells, projects them onto a rotating
  sphere (orthographic), and plots colony markers on top with hit-testing.
- Endangered species pulse faster and get a double ring — severity encoded without a 4th colour.

## Data & images
- Facts: IUCN Red List + species literature. Playful fields (pet index, arch-nemesis,
  field note) are clearly flavour.
- Photos load live from Wikimedia Commons. Every image URL was verified to resolve to
  `image/jpeg` before shipping — no fabricated links.
- 8 species in round one: Emperor, King, Gentoo, Adélie, Chinstrap, Little Blue, Galápagos, African.

## Run it
Any static server, e.g.:
```
python -m http.server 8200
```
Then open <http://localhost:8200>.

## Ideas for round two
- The other ~10 extant species (Macaroni, Rockhopper, Yellow-eyed, Snares, Erect-crested, Fiordland, Royal, Magellanic, Humboldt, Snares…).
- A day/night terminator sweeping the globe.
- Hallucinated Martian penguins on a toggle. 👽
