# Whatagradient

A WebGL animated gradient, forked from [Whatamesh](https://whatamesh.vercel.app/) by [@jordienr](https://github.com/jordienr/whatamesh).

Enhancements over the original:

- Up to 8 gradient colors (CSS variables `--gradient-color-1` through `--gradient-color-8`)
- Runtime API: `setColor`, `setSpeed`, `setAmplitude`, `setFrequency`, `addColor`, `removeColor`
- Palette cycling: named palettes with smooth cross-fades (`setPalettes`, `startPaletteCycle`, `jumpToPalette`)
- In-page controls panel (gear icon, bottom-right) + palette strip (bottom-center)
- Local dev server with no external dependencies

---

## Running locally

The page uses an ES module import from `./whatagradient.js`, so it must be served over HTTP (not opened as a file). A zero-dependency Node.js server is included:

```bash
node serve.js
# Open http://localhost:3000/whatagradient.html
```

Optional — custom port:

```bash
node serve.js 8080
# or
PORT=8080 node serve.js
```

---

## Color configuration (CSS)

Colors are defined as CSS custom properties on the `#gradient-canvas` element. You can set 1–8 colors:

```css
#gradient-canvas {
    --gradient-color-1: #c3e4ff;   /* base color (slot 0) */
    --gradient-color-2: #6ec3f4;   /* wave layer 1 */
    --gradient-color-3: #eae2ff;   /* wave layer 2 */
    --gradient-color-4: #b9beff;   /* wave layer 3 */
    /* slots 5–8 are optional */
    /* --gradient-color-5: #ffb3c1; */
}
```

Shorthand hex (`#rgb`) is also supported.

---

## Key properties

These can be set before or after `initGradient()`:

| Property | Default | Description |
|---|---|---|
| `amp` | `320` | Wave height in pixels. `0` = flat plane, `~600` = very dramatic. |
| `seed` | `5` | Noise seed — changes the overall pattern shape. Any integer works. |
| `freqX` | `0.00014` | Horizontal noise frequency. Higher = more wave cycles across X. |
| `freqY` | `0.00029` | Vertical noise frequency. Higher = more wave cycles across Y. |
| `freqDelta` | `0.00001` | Step size used by `updateFrequency()`. |
| `activeColors` | `[1,1,1,1,0,0,0,0]` | Per-slot visibility flags (1 = visible, 0 = hidden). |
| `conf.density` | `[0.06, 0.16]` | Mesh resolution `[x, y]`. Higher = smoother but slower. |
| `conf.playing` | `true` | Whether the animation loop is running. |

---

## UI visibility

Two constants near the top of the `<script>` block in `whatagradient.html` control which UI elements are shown on load:

```js
const SHOW_PALETTE_STRIP = true;   // bottom-center palette swatch bar
const SHOW_CONTROLS_GEAR = true;   // bottom-right gear button (and its panel)
```

Set either to `false` before saving to hide that element permanently (useful for embedding the gradient as a clean background with no overlaid UI).

Toggle them at runtime from the browser console without editing the file:

```js
ui.showPalette()     // show the palette strip
ui.hidePalette()     // hide the palette strip
ui.togglePalette()   // toggle the palette strip

ui.showGear()        // show the gear button
ui.hideGear()        // hide the gear button (also closes the panel)
ui.toggleGear()      // toggle the gear button (also closes the panel when hiding)

ui.shuffleOn()       // enable shuffle mode (also checks the checkbox)
ui.shuffleOff()      // disable shuffle mode (also unchecks the checkbox)
```

---

## Controls panel

Click the **gear icon** (bottom-right) to open the controls panel:

- **Speed** slider — animation speed multiplier (0.1x–4x)
- **Amplitude** slider — wave height (0–600)
- **Frequency** slider — noise frequency multiplier (0.5x–5x)
- **Palette Cycle** section:
  - **Duration** slider — cross-fade length (1–30s)
  - **Stop/Start Cycle** button
  - **Shuffle** checkbox — randomize palette order instead of cycling sequentially
- **Color rows** — color picker + active toggle + remove button for each color
- **Add Color** button — adds a new random pastel color (up to 8 total)
- **Pause / Play** button

---

## Console commands

The `gradient` instance is exposed as `window.gradient`. Open the browser DevTools console and paste any of the following:

### Playback

```js
gradient.pause()
gradient.play()
```

### Speed

```js
// Double the animation speed
gradient.setSpeed(2)

// Slow motion
gradient.setSpeed(0.25)

// Back to default
gradient.setSpeed(1)
```

### Amplitude (wave height)

```js
// Flat — no undulation
gradient.setAmplitude(0)

// Subtle waves
gradient.setAmplitude(80)

// Default
gradient.setAmplitude(320)

// Very dramatic
gradient.setAmplitude(600)
```

### Frequency (noise detail)

```js
// Sparse, gentle (default)
gradient.setFrequency(0.00014, 0.00029)

// More chaotic
gradient.setFrequency(0.0004, 0.0008)

// Nudge both axes by a small delta (uses freqDelta internally)
gradient.updateFrequency(0.00005)
gradient.updateFrequency(-0.00005)
```

### Palette cycling

```js
// Define palettes (2–8 hex colors each)
gradient.setPalettes([
    { name: "Sky",    colors: ["#c3e4ff", "#6ec3f4", "#eae2ff", "#b9beff"] },
    { name: "Sunset", colors: ["#ffb7b2", "#ff9a9e", "#ffdac1", "#fad0c4"] },
    { name: "Forest", colors: ["#b7f8db", "#50a7c2", "#a8edea", "#8ec5fc"] },
])

// Start cycling with 8-second cross-fades
gradient.startPaletteCycle(8000)

// Stop at the current blend
gradient.stopPaletteCycle()

// Snap immediately to a palette by index
gradient.jumpToPalette(2)

// Enable / disable shuffle mode
gradient.setPaletteShuffle(true)
gradient.setPaletteShuffle(false)

// React to transitions in your own code
gradient.onPaletteChange   = (idx) => console.log('now at palette', idx)
gradient.onPaletteProgress = (t, fromIdx) => console.log(t.toFixed(2))
```

### Colors

```js
// Change the base color (slot 0)
gradient.setColor(0, '#ff6b6b')

// Change wave layer 1 (slot 1)
gradient.setColor(1, '#a8edea')

// Toggle a color layer on/off
gradient.toggleColor(0)   // base color
gradient.toggleColor(2)   // wave layer 2

// Add a new color (returns false if already at 8 colors)
gradient.addColor('#ffd6a5')
gradient.addColor('#caffbf')

// Remove a color by slot index
gradient.removeColor(3)   // remove wave layer 3
```

### Reading current colors

```js
// See all current normalized colors
gradient.sectionColors

// Convert a normalized color back to hex
// (normalizedToHex is available if imported in your own script)
gradient.sectionColors.map(c =>
  '#' + c.map(v => Math.round(v*255).toString(16).padStart(2,'0')).join('')
)

// See which slots are active
gradient.activeColors
```

### Misc

```js
// See current amplitude
gradient.amp

// See current speed multiplier
gradient._speedMultiplier

// See mesh density
gradient.conf.density

// Change density (requires page reload to fully take effect)
gradient.conf.density = [0.1, 0.25]   // higher quality
gradient.conf.density = [0.03, 0.08]  // better performance
```

---

## Architecture notes

- **`MiniGl`** — minimal WebGL wrapper providing `Material`, `Uniform`, `PlaneGeometry`, `Mesh`, and `Attribute` classes. Handles shader compilation, buffer management, and the render loop.
- **`Gradient`** — main class. Reads CSS variables, builds GLSL uniforms, and drives the animation via `requestAnimationFrame`.
- **Shader pipeline** — vertex shader uses Ashima Arts 3D simplex noise to displace a plane geometry. Colors are blended per-vertex with `blendNormal()`. The fragment shader optionally darkens the top edge.
- **Uniform system** — uniforms are declared dynamically from JS objects. Struct and array types generate corresponding GLSL declarations automatically. `u_active_colors` is a `float[8]` array uniform that controls per-slot visibility.
- **More colors** — slots 5–8 are inactive by default. Define the corresponding CSS variables or call `addColor()` to activate them.
