# Go Go Thomas! — Browser Preservation Port

A playable, static web remake of **Thomas & Friends: Go Go Thomas! (2014), Android APK 1.1**, built from the archive supplied for this task.

## Run it completely offline

### Windows

Double-click **`start-windows.bat`**. It starts the included PowerShell loopback server and opens <http://127.0.0.1:8080/>. Keep its console window open while playing. Python, Node.js, internet access, and installation are not required.

The assets are entirely local; the loopback address never leaves your PC. A generated local asset registry is also included, but the launcher is recommended because Chrome and Edge deliberately restrict advanced WebGL textures and MP4 seeking on raw `file://` pages.

### macOS/Linux or systems with Python

```bash
python3 -m http.server 8080
```

Then visit <http://localhost:8080>.

No build or package-install step is required. Three.js, OBJLoader, fflate, fonts, movies, audio, models, textures, and all five maps are local—there is no runtime CDN or internet dependency.

The original verified Android package is included as **`GoGoThomas-Android-1.1.apk`** (SHA-1 `2e0a37edc68c69ce37448ed6d6476653bbc8ca42`).

## Controls

- **Touch/mouse:** press the large **TAP!** button repeatedly; press **⚡** when the boost is ready.
- **Player 1:** `Space` or `A` to accelerate; `S` or `W` to boost.
- **Player 2:** `Enter`, `L`, or `Right Arrow` to accelerate; `K` or `Down Arrow` to boost.
- `Esc` pauses a race.

The game supports one-player racing against an adaptive rival and local two-player play on one screen. Trophies, best times, and cogwheels persist in browser storage.

## What was ported

- Five engines: Thomas, Percy, James, Emily, and Toby.
- Their five matching courses: countryside, bridge, docks, canyon, and castle.
- One-player and shared-screen two-player modes.
- Tap-to-accelerate physics, 3-second boost cooldowns, cog collection, progress markers, pause/restart, results, trophies, settings, keyboard, pointer, and touch input.
- Original APK artwork and audio, including the exact `1PlayerButton` and `2PlayerButton` meshes reconstructed from `MainMenuAtlas`, UI sprites, course cards, music, effects, and the explicitly mapped `audio/vo/en/` voice set. No Spanish/French/Russian duplicate-name clips are selected.
- Original startup sequence: `BudgeSplashScreen.mp4` with its audio, the three-second Unity title layout, `Intro.mp4` with British-English audio, the original skip control, Budge logo, and APK splash/loading art.
- All six embedded UI fonts: Grobold, Grobold Classic, Sodor, Bebas Neue, Cyclone, and the alternate Grobold OpenType face.
- Live Three.js/WebGL races using the five original Unity course scenes. Each static-batched scene is converted into 9–13 compact binary `GGTB1` chunks. Chunks download concurrently over HTTP/2 and attach progressively without text OBJ parsing. Terrain, rails, sleepers, houses, bridges, trees, cliffs, dock structures, castle pieces, finish lines, UVs, and materials remain original.
- Trains use the dense `RailPath.m_GizmosLines` samples serialized by the original game—not an inferred spline—so both players and the AI remain centred on their own rails. Route length comes directly from those samples, and each engine’s nose is aligned to the increasing route tangent.
- Camera position, field of view, and look target use the recovered `SideViewCamera` relationship for each individual map.
- Thomas, Percy, James, Emily, and Toby loaded from the APK's original Unity meshes and 1024×1024 texture maps—not substitute primitive models. Their separately stored left-eye, right-eye, and eyelid meshes use the exact prefab transforms, glance, and blink in Three.js.
- Win/payoff screens now render the winning engine as a live shaded 3D model with moving eyes and eyelids; the PNG remains only as a WebGL fallback.
- Unity `AlphaTest-Diffuse` is reproduced with Lambert shading and recovered material tints; terrain uses the original control/splat maps in a custom shader. iPad uses local 512px WebP texture derivatives, one device pixel per CSS pixel, no costly realtime shadow map, and fewer draw calls; desktop retains the original PNG textures and higher-quality shadows.

See [`PORTING_NOTES.md`](PORTING_NOTES.md) for the APK analysis and behavior mapping.

## Notes

This is an unofficial preservation remake, not a redistribution of the Android runtime. It is implemented as a compact HTML/CSS/JavaScript and Three.js game and works offline when served from the downloaded folder. All Thomas & Friends names and supplied game assets remain the property of their respective rights holders.
