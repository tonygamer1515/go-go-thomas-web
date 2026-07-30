# Porting notes

## Source selected

The archive contains two APK filenames with the same size and digest:

- `GoGoThomas_base.apk`
- `Thomas-Friends-Go-Go-Thomas-v1-1.apk`

Both are **86,769,595 bytes** and are byte-identical:

- SHA-1: `2e0a37edc68c69ce37448ed6d6476653bbc8ca42`
- MD5: `c73c964a815e58a60028ec9db49f7314`

The port used `GoGoThomas_base.apk`, the first of the tied largest files.

## APK inspection

The Android package is a **Unity 4.6.3f1** game. Its managed gameplay code is in `Assembly-CSharp.dll`. The embedded `config1.dll` is actually a ZIP wrapper containing the original expansion OBB. That OBB contains Unity scenes, shared assets, and 861 individually serialized resource files.

The inspected build contains:

- 33 Unity scenes (`level0`–`level32`).
- Five full race scenes plus menu, character selection, store, settings, pause, payoff, trophy, credits, FAQ, and age-gate scenes.
- Five core engines and courses in `PackDefinition`:
  - `Thomas` + `Track1`
  - `Percy` + `Track2`
  - `James` + `Track3`
  - `Toby` + `Track4`
  - `Emily` + `Track5`
- Unity meshes and 1024×1024 textures for Thomas, Percy, James, Emily, and Toby.
- Packed UI atlases, character/course cards, trophy art, particles, music, sound effects, and voice clips.

## Original startup, language, and fonts

The opening flow is translated from the actual managed classes:

1. `SplashView` plays `BudgeSplashScreen.mp4` and its matching MP3.
2. `TitleView` displays the white-background `IntroTitle` scene for its recovered three-second timer.
3. `IntroView` plays `Intro.mp4`, the British-English `Intro_GB_EN.mp3`, and the original skip-button image before entering the main menu.

A one-time “Tap to start” gate is added only because browsers prohibit audible autoplay before user interaction.

The APK contains many AudioClips with identical `m_Name` values in six language folders. Choosing clips by name alone caused occasional Spanish narration. Audio is now resolved through `ResourceManager.m_Container` using explicit `audio/vo/en/...` paths. Character selection, race start, GO, payoff, and boost narration therefore remain English.

The browser also loads the embedded font data directly: `GROBOLD-1`, `SODORB__`, both `Groboldov7.1Pro` faces, `BebasNeue`, and `ufonts.com_cyclone-background-opentype`.

## Gameplay mapping

The browser physics follows the managed `Player` / `HumanPlayer` behavior rather than using arbitrary arcade movement:

1. A tap calls the speed-burst path and adds the configured acceleration.
2. Each update adds acceleration to velocity.
3. Distance advances by `velocity × deltaTime`.
4. Acceleration resets to zero.
5. Velocity loses `velocity × deltaTime` each update (twice that while braking).
6. Velocity is clamped at zero.

Values recovered from the APK's `Configurations` asset:

| Setting | Value |
|---|---:|
| `PlayerTapAcceleration` | 9 |
| `PowerUpValue` | 18 |
| `PowerUpCooldown` | 3 seconds |
| `ComputerMinSpeed` | 0.25 |
| `AIInputSample` | 5 |
| `OpponentMinSpeed` | 0.65 |
| `OpponentSpeedPercentLoss` | 8 |

The original `HumanPlayer` code averages the five most recent input intervals. `ComputerPlayer` samples that input rate and changes its burst interval, so the web rival likewise adjusts its cadence based on the gap to the player.

## Asset treatment

Unity's packed Android UI textures required reconstruction from serialized sprite meshes and atlas UVs. The selected interface pieces were rasterized back into individual transparent PNGs. Serialized Unity texture orientation was corrected when writing the web assets.

The five race engines are not redrawn substitutes. Each is loaded in Three.js from reconstructed OBJ data containing the original Unity body, left-eye, right-eye, eyelid, and face geometry, then mapped with its original 1024×1024 texture. Pre-rendered versions of the same exact meshes remain in the menus and results for quick loading.

### Eye-model correction

The eyeballs are separate Unity meshes, not part of the locomotive body mesh. Their raw vertex coordinates sit around the origin, so simply merging the four mesh assets makes the engines appear eyeless. The corrected export resolves each original engine prefab and bakes the child GameObject transforms into the output:

- Thomas: `Eye_Left`, `Eye_Right`, and `EyeLids` under `ThomasV2`
- Percy: `Eye_Left`, `Eye_Righht`, and `EyeLids` under `PercyV3`
- James: `Eye_Left`, `Eye_Right`, and `EyeLids` under `JamesV3`
- Emily: `Eye_left`, `Eye_Right`, and `EyeLids` under `EmilyV3`
- Toby: `Eye_Left`, `Eye_Right`, and `EyeLids` under `TobyV3`

The browser models now use those exact prefab positions, rotations, and scales. The separate eyeballs are recentered as local Three.js pivots, allowing their original textured pupils to glance around while racing. Emily also uses the `EmilyV4` texture actually referenced by her prefab material rather than the unused alternate texture. The recovered `AlphaTest-Diffuse` material is represented with Lambert lighting, including the original 0.852941 Thomas tint and 0.794118 James tint.

The final project intentionally excludes the 86 MB APK and intermediate extraction data. It retains only the assets used by the browser game.

## Managed-code translation coverage

The browser does not execute the Android C# DLL directly; its gameplay classes are translated to JavaScript behavior-for-behavior:

- `Player.Update`, `SpeedBurst`, `Reset`, total distance, velocity decay, braking factor, and winner state
- `HumanPlayer` five-sample input timing
- `ComputerPlayer` adaptive burst timing and automatic boosts
- `PowerUp.TryPowerUp`, ready state, boost value, and cooldown timer
- `Train.MoveBy` mapped to arc-length movement on the recovered course curve
- `RaceContext`, one/two-player setup, progress, finish detection, pause, restart, and winner payoff
- `PlayerControl` pointer, touch, and keyboard acceleration/boost input
- Trophy/cog progression, settings, sound/music control, persistence, and result flow

Android-only services are intentionally not reproduced: Chartboost advertising, Facebook, Flurry analytics, Google/Amazon in-app purchases, More Apps web promotions, the parental age gate, and the native Android movie player. They do not affect offline race simulation and would not be valid browser equivalents.

## Original race-scene conversion

The five race scenes are now loaded directly in Three.js:

| Engine/course | Unity scene |
|---|---|
| Emily — Canyon | `level14` / `sharedassets15.assets` |
| James — Docks | `level15` / `sharedassets16.assets` |
| Percy — Big Bridge | `level16` / `sharedassets17.assets` |
| Thomas — Countryside | `level17` / `sharedassets18.assets` |
| Toby — Castle | `level18` / `sharedassets19.assets` |

Unity's mobile static batching places nearly every visible course object into one or two large meshes. Individual renderers select their piece through `m_SubsetIndices`. The converter restores those subset-to-material assignments as OBJ `usemtl` groups, exports the referenced textures losslessly, and records the recovered material/shader metadata in a per-course manifest.

The converted scenes total roughly 194,000 triangles and retain the APK's original world scale. Trains therefore use their prefab scale directly and sit on the recovered rail elevation rather than being visually resized to a substitute track.

### Movement and direction correction

The temporary renderer normalised every race to 720 units. The final converter generates MonoBehaviour type trees from `Assembly-CSharp.dll`, reads every `RailPath.m_GizmosLines` array, transforms those dense spline samples into world space, and orders the linked segments from the original player start to `EndLine`. The browser’s `PolylineRoute` performs arc-length interpolation over those exact samples. Both engines therefore remain on their authored rails without Catmull-Rom overshoot, and `Player.Update` advances in the same physical path units consumed by `Train.MoveBy`.

Unity/OBJ/Three.js handedness is resolved once in the model transform. The locomotive's converted `+Z` nose axis is aligned to the increasing route tangent. Each manifest also stores the original map-specific `SideViewCamera` offset, look target, and 60° field of view; these are rotated with the current rail tangent without interpolation lag.

The computer player now samples the human player's five latest input intervals, matching `HumanPlayer.GetInputRate`, and respects the recovered 0.25-second `ComputerMinSpeed` interval.

## Offline distribution

The complete runtime has no remote URLs. Track and engine OBJ data is gzip-compressed locally and decoded with native `DecompressionStream` or bundled fflate. Generated local JavaScript bundles contain the compressed geometry and manifests, while `start-windows.bat` launches a dependency-free PowerShell loopback server with correct MIME and byte-range support. This avoids Chrome/Edge restrictions on raw `file://` WebGL textures and MP4 seeking without making any internet connection. The verified source APK is included alongside the port.

## Browser implementation

- Plain HTML, CSS, and JavaScript with a locally vendored Three.js r128 runtime and OBJ loader; no framework or CDN.
- Live WebGL two-lane race scenes with the original Unity static-batched course geometry. Each scene's combined meshes and renderer subset indices were recovered so the correct rails, terrain, buildings, trees, bridges, water, props, and finish-line materials are restored per submesh.
- Original material textures and tint values are preserved. Unity `Diffuse`, `Alpha-Diffuse`, and `AlphaTest-Diffuse` shaders map to equivalent Three.js Lambert materials; terrain `FirstPass` control/splat textures are blended in a custom shader.
- Race curves use the serialized `RailPath.m_GizmosLines` samples and authored link order. The Three.js camera uses each map’s recovered side-view camera profile.
- Original textured train models, animated separate eye and eyelid meshes, perspective camera tracking, lighting, fog, moving soft shadows, 3D cogwheels, smoke sprites, and boost lights.
- The payoff/result view uses the same original Three.js engine prototype, lighting, eye motion, and blink animation rather than a flat winner image when WebGL is available.
- OBJ scenes and models are locally gzip-compressed and expanded with the browser's `DecompressionStream` or the bundled fflate fallback. No network library or asset is requested.
- A small generated Three.js scene and a Canvas 2D renderer remain as automatic fallbacks when an original track asset or WebGL is unavailable.
- Pointer, touch, and keyboard input.
- Original MP3 music, voice, boost, acceleration, start, and result clips.
- Browser-local persistence for settings, cogs, trophies, and best times.
- Landscape layout with a portrait-orientation prompt.
