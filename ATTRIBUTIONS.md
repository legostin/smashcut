# Attributions

Smashcut's music instruments (`runtime/music-ext/instruments.js`) use a small set of freely licensed samples.
The samples are **not** part of this repository: `server/samples.ts` downloads them on first use into
`~/.smashcut/samples/` (sha256-verified, see the manifest there). Their licenses:

## CC BY 3.0 (attribution required)

- **Salamander Grand Piano V3** by Alexander Holm — https://archive.org/details/SalamanderGrandPianoV3
  License: Creative Commons Attribution 3.0 (https://creativecommons.org/licenses/by/3.0/).
  Used as the mp3 mirror from https://github.com/felixroos/dough-samples (`piano/`). Instrument: `m.inst.piano()`.
- **Wurlitzer EP200** samples by Greg Sullivan (http://www.sullivang.net/), SFZ mapping by kinwie / sfzinstruments —
  https://github.com/sfzinstruments/GregSullivan.E-Pianos
  License: Creative Commons Attribution 3.0 Unported. Instrument: `m.inst.keys('epiano')` / `'wurli'`.

## CC0 1.0 (public domain dedication — credited as a courtesy)

- **VSCO 2 Community Edition** — Versilian Studios — https://github.com/sgossner/VSCO-2-CE
  (string sections sustain/pizzicato/spiccato, contrabass pizzicato, horn & trombone, marimba, glockenspiel, timpani)
- **Versilian Community Sample Library (VCSL)** — Versilian Studios — https://github.com/sgossner/VCSL
  (acoustic kit: kick, snares, hi-hats, toms, claps, cymbals, tambourine, shaker, cowbell, claves; concert bass drum,
  clash/suspended cymbals, gong)
- **Roland TR08 one-shots** — Karman_Lyne, freesound pack 29226 — https://freesound.org/people/Karman_Lyne/packs/29226/
- **TR-909 Drum Hits** — GRD-music-, freesound pack 23395 — https://freesound.org/people/GRD-music-/packs/23395/
- Freesound CC0 FX: 620818 "UPLIFTER WHITE NOISE REVERB" (SkyernAklea), 177242 "Cinematic Impact",
  408141 "Cinematic Low Pitch Impact" (Jofae), 683101 "quick woosh" (florianreichelt), 27281 "Epic whoosh" (EcoDTR),
  110218 "reverse crash" (genocidalguitar), 428073 "Sub Drop Smooth" (newagesoup), 371583 "Vinyl Record Crackle Loop" (OwlStorm)
  — https://freesound.org/s/<id>/
