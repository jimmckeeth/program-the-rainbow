# The Color Pipeline: Every Point of Inaccuracy from Designer to Eyeball

The core problem is that a color value like `#3A8FBD` is not a description of a color — it's an instruction to hardware, filtered through a stack of assumptions. Each layer in the stack may have different assumptions, and when they don't align, the color drifts.

----------

## Stage 0 — The Ceiling: Gamut

Before the designer clicks a single pixel, the color space they're working in sets an absolute ceiling on what's possible.

In the CIE 1931 xy chromaticity diagram, sRGB covers only [33.5% of all chromaticities](https://tftcentral.co.uk/articles/pointers_gamut). For reference, Adobe RGB covers 45.2% of all chromaticities, and Pointer's Gamut — the range of real-world surface colors visible to the human eye — [covers 47.9%](https://tftcentral.co.uk/articles/pointers_gamut). This means that even before a designer opens their tool, a large fraction of colors they can actually see are simply inexpressible in the system they'll use to specify them.

**Drift potential**: The most saturated teals, cyans, and greens in nature cannot exist in sRGB — full stop.

## Stage 1 — The Design Tool's Working Color Space

Design tools can work in different color spaces. Figma historically defaulted to sRGB; recent versions support Display P3. Photoshop can be set to sRGB, AdobeRGB, or ProPhoto RGB. The color the designer sees on their calibrated display depends on which space the tool operates in.

If a designer on a P3-capable Mac picks a vivid green in Figma in P3 mode and a developer reads the exported hex value and assumes sRGB, the resulting color on a standard monitor will be desaturated — those two encodings aren't the same color.

**Drift potential**: Moderate to severe depending on saturation. For muted, near-neutral colors, negligible. For vivid greens and cyanos, the same hex value viewed as sRGB vs. P3 can be visibly different.

## Stage 2 — 8-Bit Quantization

Each channel (`R`, `G`, `B`) is stored as an integer from 0–255 — 8 bits. The real-number color the designer intended gets rounded to the nearest representable value.

This gives 256³ = 16,777,216 possible colors. That sounds large, but it's not uniformly distributed across perception — the steps between values are not perceptually equal, which is precisely why the next stage was invented.

**Drift potential:** Typically sub-perceptual for single values, but can become visible in gradients as banding — visible stepping between shades where the bit depth is too coarse to represent a smooth transition.

## Stage 3 — Gamma Encoding (The sRGB Transfer Function)

This is the one that surprises most developers.

The number stored in `#808080` is not 50% brightness. Gamma encoding is used to optimize the usage of bits when encoding an image by taking advantage of the non-linear manner in which humans perceive light — humans have greater sensitivity to relative differences between darker tones than between lighter ones. Wikipedia

The sRGB transfer function maps stored values non-linearly: a stored value of 128 (≈ 0.502) corresponds to roughly 21.6% of actual light output, not 50%. The gamma-corrected dark-red color `(0.5, 0.0, 0.0)` becomes `(0.73, 0.0, 0.0)` after applying `^(1/2.2)`, which then gets rendered back through the monitor's gamma of 2.2 to produce the original `(0.5, 0.0, 0.0)` as [linear light](https://learnopengl.com/Advanced-Lighting/Gamma-Correction).

This is intentional and correct — but only if everyone in the pipeline knows about it and handles it consistently.

**Drift potential**: If any step in the pipeline applies gamma twice, or skips it, the resulting image will be dramatically too bright or too dark, with incorrect contrast.

## Stage 4 — Math Done in the Wrong Space

This is where gamma encoding becomes actively dangerous for programmers.

When colors are blended in sRGB space rather than linear light, they shift in ways that don't match either human perception or physical light behavior — notably, sRGB darkens colors significantly when mixing [saturated opposing colors](https://bottosson.github.io/posts/colorwrong/).

Concretely, if you average #FF0000 (red) and #00FF00 (green) in sRGB by computing (255+0)/2, (0+255)/2, 0 = #7F7F00, you get a muddy dark yellow. The physically correct midpoint (done in linear light then converted back) is a noticeably brighter, cleaner yellow. This affects:

* CSS gradients (historically sRGB-interpolated, producing dark muddy midpoints)
* rgba() transparency blending
* Image resizing/downsampling
* Antialiasing
* Texture filtering in 3D rendering

Drawing with soft brushes in gamma-incorrect software can result in weird dark transition bands with certain vivid color combinations — this is the result of naively working directly on sRGB pixel data, and many tools are now stuck with this as [legacy default behavior](https://blog.johnnovak.net/2016/09/21/what-every-coder-should-know-about-gamma/).

**Drift potential**: Visually obvious for saturated color pairs. CSS Color Level 4 (color-mix(), oklab interpolation) finally addresses this, but it requires opt-in.

## Stage 5 — Missing, Stripped, or Wrong Color Profiles

Every image should carry an embedded ICC color profile declaring what color space it's in. In practice:

* JPEG export often strips profiles to save file size
* Screenshots taken without profile embedding are assumed sRGB
* Images authored in AdobeRGB and exported without a profile will look desaturated on software that assumes sRGB, or over-saturated on software that reads the raw values and applies no correction

The sRGB standard notes that if the color space of an image is unknown and it's encoded with 8 bits per channel, sRGB encoding should be assumed — and due to programmers misunderstanding gamma, some image files that claim a gamma of 1.0 should also be assumed to be sRGB.

**Drift potential**: An AdobeRGB image without a profile, displayed as if it were sRGB, will appear visibly desaturated in cyans and greens. Not subtle.

## Stage 6 — Browser Color Management

Browsers have their own color management layers, and they have not historically been consistent:

* Browsers without ICC profile support just use the raw values and assume sRGB
* Browsers with profile support perform the gamut mapping from the document's color space to the display's color space
* CSS historically only supported sRGB; `oklch`, `display-p3`, etc. in CSS Color Level 4 are recent additions
* CSS gradient interpolation space is now configurable (`in oklab`, `in srgb-linear`), but defaults still vary

**Drift potential**: Moderate. Wide-gamut images may appear over-saturated on a wide-gamut display in a browser that doesn't map correctly, or desaturated on a standard display that clips out-of-gamut values.

## Stage 8 — GPU LUT and Bit Depth

The GPU driver typically applies a hardware 1D Look-Up Table (LUT) as the final step before signals go to the display — this is how software color calibration tools (like X-Rite's software) apply monitor corrections without any per-application overhead.

Most consumer displays operate on 8-bit-per-channel signals, meaning gradients are quantized to 256 steps before they leave the GPU. 10-bit output is available on professional cards and some consumer cards but requires both the GPU driver and the application to explicitly request it. Without 10-bit output, fine gradients can exhibit banding at the hardware level regardless of how they were created.

**Drift potential**: Subtle but visible in smooth gradients, especially in dark values and skies. With dithering enabled this is minimized; without it, banding is a known artifact.

## Stage 9 — Display Connection and Chroma Subsampling

This one is almost entirely unknown outside display enthusiast circles and it is a significant color thief on many desks right now.

HDMI video connections (particularly HDMI 2.0 at high resolutions like 4K@60Hz) often cannot carry full 4:4:4 chroma (full color resolution per pixel). Instead they silently fall back to 4:2:2 or 4:2:0 chroma subsampling — the same compression used in video streaming — where color information is averaged across blocks of 2 or 4 pixels. On video content this is nearly invisible, because the human eye has lower spatial resolution for color than luminance. On a static UI with sharp text and thin colored lines, it can cause color fringing and illegible text at sub-pixel rendering scales.

DisplayPort connections, by contrast, carry 4:4:4 at full resolution by default.

**Drift potential**: On HDMI 2.0 connections at 4K@60Hz, chroma subsampling is extremely common and causes visible color fringing on text and sharp edges. This is often mistaken for a monitor defect.

## Stage 10 — Monitor Factory Calibration

Consumer monitors ship with varying color accuracy. The standard measurement is ΔE (Delta E) — the perceptual distance between a target color and what the monitor actually produces. A ΔE below 2 means the difference is imperceptible to the human eye ([professional level requires ΔE below 1](https://www.gomanyscreen.com/our-technology/high-color-gamut-display-technology.html)).

Consumer monitors typically ship with ΔE values of 3–6 out of the box — meaning many colors they display are visibly wrong when compared to a reference. Budget monitors can be worse. Professional reference monitors are factory-calibrated to ΔE < 2, or even ΔE < 1 for medical/broadcast use.

Additionally, the monitor's color gamut may not match sRGB: a wide-gamut panel (common in modern laptops and high-end monitors) will over-saturate sRGB content if the OS isn't applying proper gamut mapping.

**Drift potential**: Medium to large. A $150 monitor and a $800 monitor showing the same hex value to the same eye can produce measurably different colors.

## Stage 11 — Panel Type and Viewing Angle

The physical panel technology affects both gamut and spatial color uniformity:

* TN panels shift color dramatically at off-axis viewing angles — the top and bottom of a large TN panel can display visibly different colors for the same pixel value
* IPS panels have much better angular stability, with a characteristic "IPS glow" in dark tones at angles
* OLED panels achieve the widest gamuts and perfect blacks but have their own color uniformity variation across the panel

**Drift potential**: On TN panels, color shift off-axis can be extreme — this is largely why they've been phased out of professional use.

## Stage 12 — The Physical Environment

The room doesn't care about your ICC profiles. Ambient light reflected off a monitor adds its color to the perceived image (warm tungsten light in a dark room makes the monitor look cool/blue by contrast). Screen glare adds washed-out patches.

sRGB is standardized against a viewing environment of ~64 lux ambient illumination at D65 (6500K daylight). Most office environments and home setups don't match this.

**Drift potential**: Hard to quantify, but meaningful. Colorists and designers who care about accuracy work in controlled-lighting environments with neutral gray walls for exactly this reason.

## Stage 13 — The Observer

Finally, no two eyes are the same. Individual variation in cone distribution, lens yellowing with age, and chromatic adaptation (the brain's color constancy mechanism) all shift what a person perceives. The spectral sensitivities of cone receptors vary because of common polymorphisms in the genes encoding the cone opsins, leading to small but reliable differences in wavelength of peak sensitivity across individuals. PubMed Central

**Drift potential**: Largely outside software's control, but worth knowing when a client insists a color "looks wrong."

| Stage                           | Cause                              | Potential Drift                          |
| ------------------------------- | ---------------------------------- | ---------------------------------------- |
| 0. Gamut ceiling                | sRGB only covers ~33% of CIE 1931  | Some colors simply can't be expressed    |
| 1. Design tool color space      | sRGB vs. P3 vs. AdobeRGB mismatch  | Visible for saturated colors             |
| 2. 8-bit quantization           | Only 256 levels per channel        | Banding in gradients                     |
| 3. sRGB gamma encoding          | #80 ≠ 50% light                    | Dramatic brightness/contrast errors      |
| 4. Math in wrong space          | Blending in sRGB instead of linear | Muddy/dark gradient midpoints            |
| 5. Missing ICC profiles         | Assumed sRGB when wrong            | Visibly desaturated or over-saturated    |
| 6. Browser color management     | Inconsistent profile support       | Moderate, particularly for wide-gamut    |
| 7. OS color management          | macOS vs. Windows behavior differs | Moderate, system-dependent               |
| 8. GPU LUT and bit depth        | 8-bit output quantization          | Subtle banding                           |
| 9. Chroma subsampling           | HDMI 4:2:2/4:2:0                   | Color fringing on text and edges         |
| 10. Monitor factory calibration | ΔE 3–6 on consumer displays        | Visible, especially in brand colors      |
| 11. Viewing angle               | TN shift, IPS glow                 | Dramatic on TN panels                    |
| 12. Physical environment        | Ambient light, glare               | Meaningful, largely invisible            |
| 13. The observer                | Individual cone variation          | Inherent, universal                      |

When you write `#3A8FBD`, you are not specifying a color. You are starting a game of telephone with thirteen players, and the last one to hear the message is a meat-based photoreceptor array in a poorly lit room. Every stage in that chain is a place your code can either be rigorous or careless — and most codebases are careless at several of them simultaneously.
