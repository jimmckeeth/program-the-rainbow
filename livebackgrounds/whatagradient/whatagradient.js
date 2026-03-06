/*
  Whatagradient — a WebGL animated gradient
  Forked from: https://github.com/jordienr/whatamesh
  Original: https://whatamesh.vercel.app/

  Enhancements over the original:
  - Supports up to 8 gradient colors (via CSS vars --gradient-color-1 through --gradient-color-8)
  - Runtime API: setColor(), setSpeed(), setAmplitude(), setFrequency(), addColor(), removeColor()
  - export { Gradient, normalizeColor }
*/

// ---------------------------------------------------------------------------
// Color utilities
// ---------------------------------------------------------------------------

// Converts a packed 24-bit integer (e.g. 0xff6b6b) to a normalized [r, g, b]
// array with each component in the 0.0–1.0 range for use in WebGL shaders.
function normalizeColor(hexCode) {
  return [
    ((hexCode >> 16) & 255) / 255,
    ((hexCode >> 8) & 255) / 255,
    (255 & hexCode) / 255,
  ];
}

// Converts a normalized [r, g, b] array back to a CSS hex string (#rrggbb).
// Useful for reading the current gradient colors back into UI controls.
function normalizedToHex(normalized) {
  return (
    "#" +
    normalized
      .map((v) => Math.round(v * 255).toString(16).padStart(2, "0"))
      .join("")
  );
}

["SCREEN", "LINEAR_LIGHT"].reduce(
  (hexCode, t, n) =>
    Object.assign(hexCode, {
      [t]: n,
    }),
  {}
);

// ---------------------------------------------------------------------------
// MiniGl — minimal WebGL helper (Material, Uniform, PlaneGeometry, Mesh)
// ---------------------------------------------------------------------------

//Essential functionality of WebGl
//t = width
//n = height
class MiniGl {
  constructor(canvas, width, height, debug = false) {
    const _miniGl = this,
      debug_output =
        -1 !== document.location.search.toLowerCase().indexOf("debug=webgl");
    (_miniGl.canvas = canvas),
      (_miniGl.gl = _miniGl.canvas.getContext("webgl", {
        antialias: true,
      })),
      (_miniGl.meshes = []);
    const context = _miniGl.gl;
    width && height && this.setSize(width, height),
      _miniGl.lastDebugMsg,
      (_miniGl.debug =
        debug && debug_output
          ? function (e) {
              const t = new Date();
              t - _miniGl.lastDebugMsg > 1e3 && console.log("---"),
                console.log(
                  t.toLocaleTimeString() +
                    Array(Math.max(0, 32 - e.length)).join(" ") +
                    e +
                    ": ",
                  ...Array.from(arguments).slice(1)
                ),
                (_miniGl.lastDebugMsg = t);
            }
          : () => {}),
      Object.defineProperties(_miniGl, {
        Material: {
          enumerable: false,
          value: class {
            constructor(vertexShaders, fragments, uniforms = {}) {
              const material = this;
              function getShaderByType(type, source) {
                const shader = context.createShader(type);
                return (
                  context.shaderSource(shader, source),
                  context.compileShader(shader),
                  context.getShaderParameter(shader, context.COMPILE_STATUS) ||
                    console.error(context.getShaderInfoLog(shader)),
                  _miniGl.debug("Material.compileShaderSource", {
                    source: source,
                  }),
                  shader
                );
              }
              function getUniformVariableDeclarations(uniforms, type) {
                return Object.entries(uniforms)
                  .map(([uniform, value]) =>
                    value.getDeclaration(uniform, type)
                  )
                  .join("\n");
              }
              (material.uniforms = uniforms), (material.uniformInstances = []);

              const prefix =
                "\n              precision highp float;\n            ";
              (material.vertexSource = `\n              ${prefix}\n              attribute vec4 position;\n              attribute vec2 uv;\n              attribute vec2 uvNorm;\n              ${getUniformVariableDeclarations(
                _miniGl.commonUniforms,
                "vertex"
              )}\n              ${getUniformVariableDeclarations(
                uniforms,
                "vertex"
              )}\n              ${vertexShaders}\n            `),
                (material.Source = `\n              ${prefix}\n              ${getUniformVariableDeclarations(
                  _miniGl.commonUniforms,
                  "fragment"
                )}\n              ${getUniformVariableDeclarations(
                  uniforms,
                  "fragment"
                )}\n              ${fragments}\n            `),
                (material.vertexShader = getShaderByType(
                  context.VERTEX_SHADER,
                  material.vertexSource
                )),
                (material.fragmentShader = getShaderByType(
                  context.FRAGMENT_SHADER,
                  material.Source
                )),
                (material.program = context.createProgram()),
                context.attachShader(material.program, material.vertexShader),
                context.attachShader(material.program, material.fragmentShader),
                context.linkProgram(material.program),
                context.getProgramParameter(
                  material.program,
                  context.LINK_STATUS
                ) || console.error(context.getProgramInfoLog(material.program)),
                context.useProgram(material.program),
                material.attachUniforms(void 0, _miniGl.commonUniforms),
                material.attachUniforms(void 0, material.uniforms);
            }
            //t = uniform
            attachUniforms(name, uniforms) {
              //n  = material
              const material = this;
              void 0 === name
                ? Object.entries(uniforms).forEach(([name, uniform]) => {
                    material.attachUniforms(name, uniform);
                  })
                : "array" == uniforms.type
                ? uniforms.value.forEach((uniform, i) =>
                    material.attachUniforms(`${name}[${i}]`, uniform)
                  )
                : "struct" == uniforms.type
                ? Object.entries(uniforms.value).forEach(([uniform, i]) =>
                    material.attachUniforms(`${name}.${uniform}`, i)
                  )
                : (_miniGl.debug("Material.attachUniforms", {
                    name: name,
                    uniform: uniforms,
                  }),
                  material.uniformInstances.push({
                    uniform: uniforms,
                    location: context.getUniformLocation(
                      material.program,
                      name
                    ),
                  }));
            }
          },
        },
        Uniform: {
          enumerable: !1,
          value: class {
            constructor(e) {
              (this.type = "float"), Object.assign(this, e);
              (this.typeFn =
                {
                  float: "1f",
                  int: "1i",
                  vec2: "2fv",
                  vec3: "3fv",
                  vec4: "4fv",
                  mat4: "Matrix4fv",
                }[this.type] || "1f"),
                this.update();
            }
            update(value) {
              void 0 !== this.value &&
                context[`uniform${this.typeFn}`](
                  value,
                  0 === this.typeFn.indexOf("Matrix")
                    ? this.transpose
                    : this.value,
                  0 === this.typeFn.indexOf("Matrix") ? this.value : null
                );
            }
            //e - name
            //t - type
            //n - length
            getDeclaration(name, type, length) {
              const uniform = this;
              if (uniform.excludeFrom !== type) {
                if ("array" === uniform.type)
                  return (
                    uniform.value[0].getDeclaration(
                      name,
                      type,
                      uniform.value.length
                    ) + `\nconst int ${name}_length = ${uniform.value.length};`
                  );
                if ("struct" === uniform.type) {
                  let name_no_prefix = name.replace("u_", "");
                  return (
                    (name_no_prefix =
                      name_no_prefix.charAt(0).toUpperCase() +
                      name_no_prefix.slice(1)),
                    `uniform struct ${name_no_prefix} \n                                    {\n` +
                      Object.entries(uniform.value)
                        .map(([name, uniform]) =>
                          uniform
                            .getDeclaration(name, type)
                            .replace(/^uniform/, "")
                        )
                        .join("") +
                      `\n} ${name}${length > 0 ? `[${length}]` : ""};`
                  );
                }
                return `uniform ${uniform.type} ${name}${
                  length > 0 ? `[${length}]` : ""
                };`;
              }
            }
          },
        },
        PlaneGeometry: {
          enumerable: !1,
          value: class {
            constructor(width, height, n, i, orientation) {
              context.createBuffer(),
                (this.attributes = {
                  position: new _miniGl.Attribute({
                    target: context.ARRAY_BUFFER,
                    size: 3,
                  }),
                  uv: new _miniGl.Attribute({
                    target: context.ARRAY_BUFFER,
                    size: 2,
                  }),
                  uvNorm: new _miniGl.Attribute({
                    target: context.ARRAY_BUFFER,
                    size: 2,
                  }),
                  index: new _miniGl.Attribute({
                    target: context.ELEMENT_ARRAY_BUFFER,
                    size: 3,
                    type: context.UNSIGNED_SHORT,
                  }),
                }),
                this.setTopology(n, i),
                this.setSize(width, height, orientation);
            }
            setTopology(e = 1, t = 1) {
              const n = this;
              (n.xSegCount = e),
                (n.ySegCount = t),
                (n.vertexCount = (n.xSegCount + 1) * (n.ySegCount + 1)),
                (n.quadCount = n.xSegCount * n.ySegCount * 2),
                (n.attributes.uv.values = new Float32Array(2 * n.vertexCount)),
                (n.attributes.uvNorm.values = new Float32Array(
                  2 * n.vertexCount
                )),
                (n.attributes.index.values = new Uint16Array(3 * n.quadCount));
              for (let e = 0; e <= n.ySegCount; e++)
                for (let t = 0; t <= n.xSegCount; t++) {
                  const i = e * (n.xSegCount + 1) + t;
                  if (
                    ((n.attributes.uv.values[2 * i] = t / n.xSegCount),
                    (n.attributes.uv.values[2 * i + 1] = 1 - e / n.ySegCount),
                    (n.attributes.uvNorm.values[2 * i] =
                      (t / n.xSegCount) * 2 - 1),
                    (n.attributes.uvNorm.values[2 * i + 1] =
                      1 - (e / n.ySegCount) * 2),
                    t < n.xSegCount && e < n.ySegCount)
                  ) {
                    const s = e * n.xSegCount + t;
                    (n.attributes.index.values[6 * s] = i),
                      (n.attributes.index.values[6 * s + 1] =
                        i + 1 + n.xSegCount),
                      (n.attributes.index.values[6 * s + 2] = i + 1),
                      (n.attributes.index.values[6 * s + 3] = i + 1),
                      (n.attributes.index.values[6 * s + 4] =
                        i + 1 + n.xSegCount),
                      (n.attributes.index.values[6 * s + 5] =
                        i + 2 + n.xSegCount);
                  }
                }
              n.attributes.uv.update(),
                n.attributes.uvNorm.update(),
                n.attributes.index.update(),
                _miniGl.debug("Geometry.setTopology", {
                  uv: n.attributes.uv,
                  uvNorm: n.attributes.uvNorm,
                  index: n.attributes.index,
                });
            }
            setSize(width = 1, height = 1, orientation = "xz") {
              const geometry = this;
              (geometry.width = width),
                (geometry.height = height),
                (geometry.orientation = orientation),
                (geometry.attributes.position.values &&
                  geometry.attributes.position.values.length ===
                    3 * geometry.vertexCount) ||
                  (geometry.attributes.position.values = new Float32Array(
                    3 * geometry.vertexCount
                  ));
              const o = width / -2,
                r = height / -2,
                segment_width = width / geometry.xSegCount,
                segment_height = height / geometry.ySegCount;
              for (let yIndex = 0; yIndex <= geometry.ySegCount; yIndex++) {
                const t = r + yIndex * segment_height;
                for (let xIndex = 0; xIndex <= geometry.xSegCount; xIndex++) {
                  const r = o + xIndex * segment_width,
                    l = yIndex * (geometry.xSegCount + 1) + xIndex;
                  (geometry.attributes.position.values[
                    3 * l + "xyz".indexOf(orientation[0])
                  ] = r),
                    (geometry.attributes.position.values[
                      3 * l + "xyz".indexOf(orientation[1])
                    ] = -t);
                }
              }
              geometry.attributes.position.update(),
                _miniGl.debug("Geometry.setSize", {
                  position: geometry.attributes.position,
                });
            }
          },
        },
        Mesh: {
          enumerable: !1,
          value: class {
            constructor(geometry, material) {
              const mesh = this;
              (mesh.geometry = geometry),
                (mesh.material = material),
                (mesh.wireframe = !1),
                (mesh.attributeInstances = []),
                Object.entries(mesh.geometry.attributes).forEach(
                  ([e, attribute]) => {
                    mesh.attributeInstances.push({
                      attribute: attribute,
                      location: attribute.attach(e, mesh.material.program),
                    });
                  }
                ),
                _miniGl.meshes.push(mesh),
                _miniGl.debug("Mesh.constructor", {
                  mesh: mesh,
                });
            }
            draw() {
              context.useProgram(this.material.program),
                this.material.uniformInstances.forEach(
                  ({ uniform: e, location: t }) => e.update(t)
                ),
                this.attributeInstances.forEach(
                  ({ attribute: e, location: t }) => e.use(t)
                ),
                context.drawElements(
                  this.wireframe ? context.LINES : context.TRIANGLES,
                  this.geometry.attributes.index.values.length,
                  context.UNSIGNED_SHORT,
                  0
                );
            }
            remove() {
              _miniGl.meshes = _miniGl.meshes.filter((e) => e != this);
            }
          },
        },
        Attribute: {
          enumerable: !1,
          value: class {
            constructor(e) {
              (this.type = context.FLOAT),
                (this.normalized = !1),
                (this.buffer = context.createBuffer()),
                Object.assign(this, e),
                this.update();
            }
            update() {
              void 0 !== this.values &&
                (context.bindBuffer(this.target, this.buffer),
                context.bufferData(
                  this.target,
                  this.values,
                  context.STATIC_DRAW
                ));
            }
            attach(e, t) {
              const n = context.getAttribLocation(t, e);
              return (
                this.target === context.ARRAY_BUFFER &&
                  (context.enableVertexAttribArray(n),
                  context.vertexAttribPointer(
                    n,
                    this.size,
                    this.type,
                    this.normalized,
                    0,
                    0
                  )),
                n
              );
            }
            use(e) {
              context.bindBuffer(this.target, this.buffer),
                this.target === context.ARRAY_BUFFER &&
                  (context.enableVertexAttribArray(e),
                  context.vertexAttribPointer(
                    e,
                    this.size,
                    this.type,
                    this.normalized,
                    0,
                    0
                  ));
            }
          },
        },
      });
    const a = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    _miniGl.commonUniforms = {
      projectionMatrix: new _miniGl.Uniform({
        type: "mat4",
        value: a,
      }),
      modelViewMatrix: new _miniGl.Uniform({
        type: "mat4",
        value: a,
      }),
      resolution: new _miniGl.Uniform({
        type: "vec2",
        value: [1, 1],
      }),
      aspectRatio: new _miniGl.Uniform({
        type: "float",
        value: 1,
      }),
    };
  }
  setSize(e = 640, t = 480) {
    (this.width = e),
      (this.height = t),
      (this.canvas.width = e),
      (this.canvas.height = t),
      this.gl.viewport(0, 0, e, t),
      (this.commonUniforms.resolution.value = [e, t]),
      (this.commonUniforms.aspectRatio.value = e / t),
      this.debug("MiniGL.setSize", {
        width: e,
        height: t,
      });
  }
  //left, right, top, bottom, near, far
  setOrthographicCamera(e = 0, t = 0, n = 0, i = -2e3, s = 2e3) {
    (this.commonUniforms.projectionMatrix.value = [
      2 / this.width,
      0,
      0,
      0,
      0,
      2 / this.height,
      0,
      0,
      0,
      0,
      2 / (i - s),
      0,
      e,
      t,
      n,
      1,
    ]),
      this.debug(
        "setOrthographicCamera",
        this.commonUniforms.projectionMatrix.value
      );
  }
  render() {
    this.gl.clearColor(0, 0, 0, 0),
      this.gl.clearDepth(1),
      this.meshes.forEach((e) => e.draw());
  }
}

// ---------------------------------------------------------------------------
// Property initializer helper (used in Gradient constructor)
// ---------------------------------------------------------------------------

//Sets initial properties
function e(object, propertyName, val) {
  return (
    propertyName in object
      ? Object.defineProperty(object, propertyName, {
          value: val,
          enumerable: !0,
          configurable: !0,
          writable: !0,
        })
      : (object[propertyName] = val),
    object
  );
}

// ---------------------------------------------------------------------------
// Gradient — main class
// ---------------------------------------------------------------------------

/*
 * Key tunable properties (set before or after init):
 *
 *   amp       — wave amplitude in pixels. Higher = more dramatic hills.
 *               Default: 320. Range: 0 (flat) to ~600 (very dramatic).
 *
 *   seed      — noise seed. Changes the overall shape of the pattern.
 *               Default: 5. Any integer gives a different look.
 *
 *   freqX     — horizontal noise frequency. Higher = more waves across X.
 *               Default: 0.00014.
 *
 *   freqY     — vertical noise frequency. Higher = more waves across Y.
 *               Default: 0.00029.
 *
 *   freqDelta — step size used by updateFrequency(). Default: 0.00001.
 *
 *   activeColors — 8-element array of 0/1 flags, one per color slot.
 *               Default: [1,1,1,1,0,0,0,0] (first 4 slots active).
 *               Use toggleColor(index) or setColor() to change at runtime.
 *
 * conf.density — [xDensity, yDensity] controls mesh resolution.
 *               Higher = smoother gradient but more GPU work.
 *               Default: [0.06, 0.16].
 *
 * conf.playing — boolean, whether the animation loop is running.
 */
class Gradient {
  constructor(...t) {
    e(this, "el", void 0),
      e(this, "cssVarRetries", 0),
      e(this, "maxCssVarRetries", 200),
      e(this, "angle", 0),
      e(this, "isLoadedClass", !1),
      e(this, "isScrolling", !1),
      e(this, "scrollingTimeout", void 0),
      e(this, "scrollingRefreshDelay", 200),
      e(this, "isIntersecting", !1),
      e(this, "shaderFiles", void 0),
      e(this, "vertexShader", void 0),
      e(this, "sectionColors", void 0),
      e(this, "computedCanvasStyle", void 0),
      e(this, "conf", void 0),
      e(this, "uniforms", void 0),
      e(this, "t", 1253106),
      e(this, "last", 0),
      e(this, "width", void 0),
      e(this, "minWidth", 1111),
      e(this, "height", 600),
      e(this, "xSegCount", void 0),
      e(this, "ySegCount", void 0),
      e(this, "mesh", void 0),
      e(this, "material", void 0),
      e(this, "geometry", void 0),
      e(this, "minigl", void 0),
      e(this, "scrollObserver", void 0),

      // Wave amplitude in pixels — how tall the waves are.
      // 0 = flat plane, 320 = default, ~600 = very dramatic.
      e(this, "amp", 320),

      // Noise seed — changes the overall shape of the pattern.
      // Any integer produces a different but consistent look.
      e(this, "seed", 5),

      // Horizontal noise frequency — how many wave cycles appear across X.
      // 0.00014 = default (sparse). Higher values = more chaotic.
      e(this, "freqX", 14e-5),

      // Vertical noise frequency — same concept for the Y axis.
      e(this, "freqY", 29e-5),

      // Step size applied by updateFrequency(delta). Nudges freqX and freqY.
      e(this, "freqDelta", 1e-5),

      // 8-element array of active flags for each color slot (0 = hidden, 1 = visible).
      // Slot 0 = base color, slots 1-7 = wave layer colors.
      // Expand by setting CSS vars --gradient-color-5 through --gradient-color-8.
      e(this, "activeColors", [1, 1, 1, 1, 0, 0, 0, 0]),

      // Base noise speed used internally. Scale with setSpeed().
      e(this, "_baseNoiseSpeed", 5e-6),

      // Current speed multiplier. 1.0 = default, 2.0 = twice as fast.
      e(this, "_speedMultiplier", 1),

      // Palette cycling — set via setPalettes() and driven by startPaletteCycle().
      // Each palette: { name: string, colors: string[] } (hex strings, 2–8 colors).
      e(this, "palettes", []),
      e(this, "_normPalettes", []),
      e(this, "_paletteIndex", 0),
      e(this, "_paletteCycling", false),
      e(this, "_paletteTransitionMs", 6000),
      e(this, "_paletteStartTime", null),
      e(this, "_paletteAnimId", null),
      // When true, picks a random next palette instead of advancing sequentially.
      e(this, "_paletteShuffle", false),
      // Pre-computed next palette index (set at transition start, respects shuffle).
      e(this, "_nextPaletteIndex", undefined),
      // Assign these to react to palette transitions:
      //   onPaletteChange(newIndex)       — fires when the active palette advances
      //   onPaletteProgress(t, fromIndex) — fires each frame during cross-fade (t: 0→1)
      e(this, "onPaletteChange", null),
      e(this, "onPaletteProgress", null),

      e(this, "isMetaKey", !1),
      e(this, "isGradientLegendVisible", !1),
      e(this, "isMouseDown", !1),
      e(this, "handleScroll", () => {
        clearTimeout(this.scrollingTimeout),
          (this.scrollingTimeout = setTimeout(
            this.handleScrollEnd,
            this.scrollingRefreshDelay
          )),
          this.isGradientLegendVisible && this.hideGradientLegend(),
          this.conf.playing && ((this.isScrolling = !0), this.pause());
      }),
      e(this, "handleScrollEnd", () => {
        (this.isScrolling = !1), this.isIntersecting && this.play();
      }),
      e(this, "resize", () => {
        (this.width = window.innerWidth),
          this.minigl.setSize(this.width, this.height),
          this.minigl.setOrthographicCamera(),
          (this.xSegCount = Math.ceil(this.width * this.conf.density[0])),
          (this.ySegCount = Math.ceil(this.height * this.conf.density[1])),
          this.mesh.geometry.setTopology(this.xSegCount, this.ySegCount),
          this.mesh.geometry.setSize(this.width, this.height),
          (this.mesh.material.uniforms.u_shadow_power.value =
            this.width < 600 ? 5 : 6);
      }),
      e(this, "handleMouseDown", (e) => {
        this.isGradientLegendVisible &&
          ((this.isMetaKey = e.metaKey),
          (this.isMouseDown = !0),
          !1 === this.conf.playing && requestAnimationFrame(this.animate));
      }),
      e(this, "handleMouseUp", () => {
        this.isMouseDown = !1;
      }),
      e(this, "animate", (e) => {
        if (!this.shouldSkipFrame(e) || this.isMouseDown) {
          if (
            ((this.t += Math.min(e - this.last, 1e3 / 15)),
            (this.last = e),
            this.isMouseDown)
          ) {
            let e = 160;
            this.isMetaKey && (e = -160), (this.t += e);
          }
          (this.mesh.material.uniforms.u_time.value = this.t),
            this.minigl.render();
        }
        if (0 !== this.last && this.isStatic)
          return this.minigl.render(), void this.disconnect();
        (this.conf.playing || this.isMouseDown) &&
          requestAnimationFrame(this.animate);
      }),
      e(this, "addIsLoadedClass", () => {
        !this.isLoadedClass &&
          ((this.isLoadedClass = !0),
          this.el.classList.add("isLoaded"),
          setTimeout(() => {
            this.el.parentElement.classList.add("isLoaded");
          }, 3e3));
      }),
      e(this, "pause", () => {
        this.conf.playing = false;
      }),
      e(this, "play", () => {
        requestAnimationFrame(this.animate), (this.conf.playing = true);
      }),
      e(this, "initGradient", (selector) => {
        this.el = document.querySelector(selector);
        this.connect();
        return this;
      });
  }
  async connect() {
    (this.shaderFiles = {
      vertex:
        "varying vec3 v_color;\n\nvoid main() {\n  float time = u_time * u_global.noiseSpeed;\n\n  vec2 noiseCoord = resolution * uvNorm * u_global.noiseFreq;\n\n  vec2 st = 1. - uvNorm.xy;\n\n  //\n  // Tilting the plane\n  //\n\n  // Front-to-back tilt\n  float tilt = resolution.y / 2.0 * uvNorm.y;\n\n  // Left-to-right angle\n  float incline = resolution.x * uvNorm.x / 2.0 * u_vertDeform.incline;\n\n  // Up-down shift to offset incline\n  float offset = resolution.x / 2.0 * u_vertDeform.incline * mix(u_vertDeform.offsetBottom, u_vertDeform.offsetTop, uv.y);\n\n  //\n  // Vertex noise\n  //\n\n  float noise = snoise(vec3(\n    noiseCoord.x * u_vertDeform.noiseFreq.x + time * u_vertDeform.noiseFlow,\n    noiseCoord.y * u_vertDeform.noiseFreq.y,\n    time * u_vertDeform.noiseSpeed + u_vertDeform.noiseSeed\n  )) * u_vertDeform.noiseAmp;\n\n  // Fade noise to zero at edges\n  noise *= 1.0 - pow(abs(uvNorm.y), 2.0);\n\n  // Clamp to 0\n  noise = max(0.0, noise);\n\n  vec3 pos = vec3(\n    position.x,\n    position.y + tilt + incline + noise - offset,\n    position.z\n  );\n\n  //\n  // Vertex color, to be passed to fragment shader\n  //\n\n  if (u_active_colors[0] == 1.) {\n    v_color = u_baseColor;\n  }\n\n  for (int i = 0; i < u_waveLayers_length; i++) {\n    if (u_active_colors[i + 1] == 1.) {\n      WaveLayers layer = u_waveLayers[i];\n\n      float noise = smoothstep(\n        layer.noiseFloor,\n        layer.noiseCeil,\n        snoise(vec3(\n          noiseCoord.x * layer.noiseFreq.x + time * layer.noiseFlow,\n          noiseCoord.y * layer.noiseFreq.y,\n          time * layer.noiseSpeed + layer.noiseSeed\n        )) / 2.0 + 0.5\n      );\n\n      v_color = blendNormal(v_color, layer.color, pow(noise, 4.));\n    }\n  }\n\n  //\n  // Finish\n  //\n\n  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);\n}",
      noise:
        "//\n// Description : Array and textureless GLSL 2D/3D/4D simplex\n//               noise functions.\n//      Author : Ian McEwan, Ashima Arts.\n//  Maintainer : stegu\n//     Lastmod : 20110822 (ijm)\n//     License : Copyright (C) 2011 Ashima Arts. All rights reserved.\n//               Distributed under the MIT License. See LICENSE file.\n//               https://github.com/ashima/webgl-noise\n//               https://github.com/stegu/webgl-noise\n//\n\nvec3 mod289(vec3 x) {\n  return x - floor(x * (1.0 / 289.0)) * 289.0;\n}\n\nvec4 mod289(vec4 x) {\n  return x - floor(x * (1.0 / 289.0)) * 289.0;\n}\n\nvec4 permute(vec4 x) {\n    return mod289(((x*34.0)+1.0)*x);\n}\n\nvec4 taylorInvSqrt(vec4 r)\n{\n  return 1.79284291400159 - 0.85373472095314 * r;\n}\n\nfloat snoise(vec3 v)\n{\n  const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;\n  const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);\n\n// First corner\n  vec3 i  = floor(v + dot(v, C.yyy) );\n  vec3 x0 =   v - i + dot(i, C.xxx) ;\n\n// Other corners\n  vec3 g = step(x0.yzx, x0.xyz);\n  vec3 l = 1.0 - g;\n  vec3 i1 = min( g.xyz, l.zxy );\n  vec3 i2 = max( g.xyz, l.zxy );\n\n  //   x0 = x0 - 0.0 + 0.0 * C.xxx;\n  //   x1 = x0 - i1  + 1.0 * C.xxx;\n  //   x2 = x0 - i2  + 2.0 * C.xxx;\n  //   x3 = x0 - 1.0 + 3.0 * C.xxx;\n  vec3 x1 = x0 - i1 + C.xxx;\n  vec3 x2 = x0 - i2 + C.yyy; // 2.0*C.x = 1/3 = C.y\n  vec3 x3 = x0 - D.yyy;      // -1.0+3.0*C.x = -0.5 = -D.y\n\n// Permutations\n  i = mod289(i);\n  vec4 p = permute( permute( permute(\n            i.z + vec4(0.0, i1.z, i2.z, 1.0 ))\n          + i.y + vec4(0.0, i1.y, i2.y, 1.0 ))\n          + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));\n\n// Gradients: 7x7 points over a square, mapped onto an octahedron.\n// The ring size 17*17 = 289 is close to a multiple of 49 (49*6 = 294)\n  float n_ = 0.142857142857; // 1.0/7.0\n  vec3  ns = n_ * D.wyz - D.xzx;\n\n  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);  //  mod(p,7*7)\n\n  vec4 x_ = floor(j * ns.z);\n  vec4 y_ = floor(j - 7.0 * x_ );    // mod(j,N)\n\n  vec4 x = x_ *ns.x + ns.yyyy;\n  vec4 y = y_ *ns.x + ns.yyyy;\n  vec4 h = 1.0 - abs(x) - abs(y);\n\n  vec4 b0 = vec4( x.xy, y.xy );\n  vec4 b1 = vec4( x.zw, y.zw );\n\n  //vec4 s0 = vec4(lessThan(b0,0.0))*2.0 - 1.0;\n  //vec4 s1 = vec4(lessThan(b1,0.0))*2.0 - 1.0;\n  vec4 s0 = floor(b0)*2.0 + 1.0;\n  vec4 s1 = floor(b1)*2.0 + 1.0;\n  vec4 sh = -step(h, vec4(0.0));\n\n  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;\n  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;\n\n  vec3 p0 = vec3(a0.xy,h.x);\n  vec3 p1 = vec3(a0.zw,h.y);\n  vec3 p2 = vec3(a1.xy,h.z);\n  vec3 p3 = vec3(a1.zw,h.w);\n\n//Normalise gradients\n  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));\n  p0 *= norm.x;\n  p1 *= norm.y;\n  p2 *= norm.z;\n  p3 *= norm.w;\n\n// Mix final noise value\n  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);\n  m = m * m;\n  return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1),\n                                dot(p2,x2), dot(p3,x3) ) );\n}",
      blend:
        "//\n// https://github.com/jamieowen/glsl-blend\n//\n\n// Normal\n\nvec3 blendNormal(vec3 base, vec3 blend) {\n\treturn blend;\n}\n\nvec3 blendNormal(vec3 base, vec3 blend, float opacity) {\n\treturn (blendNormal(base, blend) * opacity + base * (1.0 - opacity));\n}\n\n// Screen\n\nfloat blendScreen(float base, float blend) {\n\treturn 1.0-((1.0-base)*(1.0-blend));\n}\n\nvec3 blendScreen(vec3 base, vec3 blend) {\n\treturn vec3(blendScreen(base.r,blend.r),blendScreen(base.g,blend.g),blendScreen(base.b,blend.b));\n}\n\nvec3 blendScreen(vec3 base, vec3 blend, float opacity) {\n\treturn (blendScreen(base, blend) * opacity + base * (1.0 - opacity));\n}\n\n// Multiply\n\nvec3 blendMultiply(vec3 base, vec3 blend) {\n\treturn base*blend;\n}\n\nvec3 blendMultiply(vec3 base, vec3 blend, float opacity) {\n\treturn (blendMultiply(base, blend) * opacity + base * (1.0 - opacity));\n}\n\n// Overlay\n\nfloat blendOverlay(float base, float blend) {\n\treturn base<0.5?(2.0*base*blend):(1.0-2.0*(1.0-base)*(1.0-blend));\n}\n\nvec3 blendOverlay(vec3 base, vec3 blend) {\n\treturn vec3(blendOverlay(base.r,blend.r),blendOverlay(base.g,blend.g),blendOverlay(base.b,blend.b));\n}\n\nvec3 blendOverlay(vec3 base, vec3 blend, float opacity) {\n\treturn (blendOverlay(base, blend) * opacity + base * (1.0 - opacity));\n}\n\n// Hard light\n\nvec3 blendHardLight(vec3 base, vec3 blend) {\n\treturn blendOverlay(blend,base);\n}\n\nvec3 blendHardLight(vec3 base, vec3 blend, float opacity) {\n\treturn (blendHardLight(base, blend) * opacity + base * (1.0 - opacity));\n}\n\n// Soft light\n\nfloat blendSoftLight(float base, float blend) {\n\treturn (blend<0.5)?(2.0*base*blend+base*base*(1.0-2.0*blend)):(sqrt(base)*(2.0*blend-1.0)+2.0*base*(1.0-blend));\n}\n\nvec3 blendSoftLight(vec3 base, vec3 blend) {\n\treturn vec3(blendSoftLight(base.r,blend.r),blendSoftLight(base.g,blend.g),blendSoftLight(base.b,blend.b));\n}\n\nvec3 blendSoftLight(vec3 base, vec3 blend, float opacity) {\n\treturn (blendSoftLight(base, blend) * opacity + base * (1.0 - opacity));\n}\n\n// Color dodge\n\nfloat blendColorDodge(float base, float blend) {\n\treturn (blend==1.0)?blend:min(base/(1.0-blend),1.0);\n}\n\nvec3 blendColorDodge(vec3 base, vec3 blend) {\n\treturn vec3(blendColorDodge(base.r,blend.r),blendColorDodge(base.g,blend.g),blendColorDodge(base.b,blend.b));\n}\n\nvec3 blendColorDodge(vec3 base, vec3 blend, float opacity) {\n\treturn (blendColorDodge(base, blend) * opacity + base * (1.0 - opacity));\n}\n\n// Color burn\n\nfloat blendColorBurn(float base, float blend) {\n\treturn (blend==0.0)?blend:max((1.0-((1.0-base)/blend)),0.0);\n}\n\nvec3 blendColorBurn(vec3 base, vec3 blend) {\n\treturn vec3(blendColorBurn(base.r,blend.r),blendColorBurn(base.g,blend.g),blendColorBurn(base.b,blend.b));\n}\n\nvec3 blendColorBurn(vec3 base, vec3 blend, float opacity) {\n\treturn (blendColorBurn(base, blend) * opacity + base * (1.0 - opacity));\n}\n\n// Vivid Light\n\nfloat blendVividLight(float base, float blend) {\n\treturn (blend<0.5)?blendColorBurn(base,(2.0*blend)):blendColorDodge(base,(2.0*(blend-0.5)));\n}\n\nvec3 blendVividLight(vec3 base, vec3 blend) {\n\treturn vec3(blendVividLight(base.r,blend.r),blendVividLight(base.g,blend.g),blendVividLight(base.b,blend.b));\n}\n\nvec3 blendVividLight(vec3 base, vec3 blend, float opacity) {\n\treturn (blendVividLight(base, blend) * opacity + base * (1.0 - opacity));\n}\n\n// Lighten\n\nfloat blendLighten(float base, float blend) {\n\treturn max(blend,base);\n}\n\nvec3 blendLighten(vec3 base, vec3 blend) {\n\treturn vec3(blendLighten(base.r,blend.r),blendLighten(base.g,blend.g),blendLighten(base.b,blend.b));\n}\n\nvec3 blendLighten(vec3 base, vec3 blend, float opacity) {\n\treturn (blendLighten(base, blend) * opacity + base * (1.0 - opacity));\n}\n\n// Linear burn\n\nfloat blendLinearBurn(float base, float blend) {\n\t// Note : Same implementation as BlendSubtractf\n\treturn max(base+blend-1.0,0.0);\n}\n\nvec3 blendLinearBurn(vec3 base, vec3 blend) {\n\t// Note : Same implementation as BlendSubtract\n\treturn max(base+blend-vec3(1.0),vec3(0.0));\n}\n\nvec3 blendLinearBurn(vec3 base, vec3 blend, float opacity) {\n\treturn (blendLinearBurn(base, blend) * opacity + base * (1.0 - opacity));\n}\n\n// Linear dodge\n\nfloat blendLinearDodge(float base, float blend) {\n\t// Note : Same implementation as BlendAddf\n\treturn min(base+blend,1.0);\n}\n\nvec3 blendLinearDodge(vec3 base, vec3 blend) {\n\t// Note : Same implementation as BlendAdd\n\treturn min(base+blend,vec3(1.0));\n}\n\nvec3 blendLinearDodge(vec3 base, vec3 blend, float opacity) {\n\treturn (blendLinearDodge(base, blend) * opacity + base * (1.0 - opacity));\n}\n\n// Linear light\n\nfloat blendLinearLight(float base, float blend) {\n\treturn blend<0.5?blendLinearBurn(base,(2.0*blend)):blendLinearDodge(base,(2.0*(blend-0.5)));\n}\n\nvec3 blendLinearLight(vec3 base, vec3 blend) {\n\treturn vec3(blendLinearLight(base.r,blend.r),blendLinearLight(base.g,blend.g),blendLinearLight(base.b,blend.b));\n}\n\nvec3 blendLinearLight(vec3 base, vec3 blend, float opacity) {\n\treturn (blendLinearLight(base, blend) * opacity + base * (1.0 - opacity));\n}",
      fragment:
        "varying vec3 v_color;\n\nvoid main() {\n  vec3 color = v_color;\n  if (u_darken_top == 1.0) {\n    vec2 st = gl_FragCoord.xy/resolution.xy;\n    color.g -= pow(st.y + sin(-12.0) * st.x, u_shadow_power) * 0.4;\n  }\n  gl_FragColor = vec4(color, 1.0);\n}",
    }),
      (this.conf = {
        presetName: "",
        wireframe: false,
        // [xDensity, yDensity] — mesh segment density.
        // Lower = faster rendering. Higher = smoother curves.
        // e.g. [0.03, 0.08] for performance, [0.1, 0.25] for quality.
        density: [0.06, 0.16],
        zoom: 1,
        rotation: 0,
        playing: true,
      }),
      document.querySelectorAll("canvas").length < 1
        ? console.log("DID NOT LOAD HERO STRIPE CANVAS")
        : ((this.minigl = new MiniGl(this.el, null, null, !0)),
          requestAnimationFrame(() => {
            this.el &&
              ((this.computedCanvasStyle = getComputedStyle(this.el)),
              this.waitForCssVars());
          }));
  }
  disconnect() {
    this.scrollObserver &&
      (window.removeEventListener("scroll", this.handleScroll),
      window.removeEventListener("mousedown", this.handleMouseDown),
      window.removeEventListener("mouseup", this.handleMouseUp),
      window.removeEventListener("keydown", this.handleKeyDown),
      this.scrollObserver.disconnect()),
      window.removeEventListener("resize", this.resize);
  }
  initMaterial() {
    this.uniforms = {
      u_time: new this.minigl.Uniform({
        value: 0,
      }),
      u_shadow_power: new this.minigl.Uniform({
        value: 5,
      }),
      u_darken_top: new this.minigl.Uniform({
        value: "" === this.el.dataset.jsDarkenTop ? 1 : 0,
      }),
      // u_active_colors is a float array of 8 slots (one per color).
      // 1.0 = visible, 0.0 = hidden. Slot 0 = base color, 1-7 = wave layers.
      // Uses float array instead of vec4 to support up to 8 colors.
      u_active_colors: new this.minigl.Uniform({
        value: this.activeColors.map((v) => new this.minigl.Uniform({ value: v })),
        type: "array",
      }),
      u_global: new this.minigl.Uniform({
        value: {
          noiseFreq: new this.minigl.Uniform({
            value: [this.freqX, this.freqY],
            type: "vec2",
          }),
          // Controls animation speed in the shader. Scale with setSpeed().
          noiseSpeed: new this.minigl.Uniform({
            value: this._baseNoiseSpeed * this._speedMultiplier,
          }),
        },
        type: "struct",
      }),
      u_vertDeform: new this.minigl.Uniform({
        value: {
          incline: new this.minigl.Uniform({
            value: Math.sin(this.angle) / Math.cos(this.angle),
          }),
          offsetTop: new this.minigl.Uniform({
            value: -0.5,
          }),
          offsetBottom: new this.minigl.Uniform({
            value: -0.5,
          }),
          noiseFreq: new this.minigl.Uniform({
            value: [3, 4],
            type: "vec2",
          }),
          // Wave amplitude — how tall the undulations are.
          noiseAmp: new this.minigl.Uniform({
            value: this.amp,
          }),
          noiseSpeed: new this.minigl.Uniform({
            value: 10,
          }),
          noiseFlow: new this.minigl.Uniform({
            value: 3,
          }),
          noiseSeed: new this.minigl.Uniform({
            value: this.seed,
          }),
        },
        type: "struct",
        excludeFrom: "fragment",
      }),
      u_baseColor: new this.minigl.Uniform({
        value: this.sectionColors[0],
        type: "vec3",
        excludeFrom: "fragment",
      }),
      u_waveLayers: new this.minigl.Uniform({
        value: [],
        excludeFrom: "fragment",
        type: "array",
      }),
    };
    for (let e = 1; e < this.sectionColors.length; e += 1)
      this.uniforms.u_waveLayers.value.push(
        new this.minigl.Uniform({
          value: {
            color: new this.minigl.Uniform({
              value: this.sectionColors[e],
              type: "vec3",
            }),
            noiseFreq: new this.minigl.Uniform({
              value: [
                2 + e / this.sectionColors.length,
                3 + e / this.sectionColors.length,
              ],
              type: "vec2",
            }),
            noiseSpeed: new this.minigl.Uniform({
              value: 11 + 0.3 * e,
            }),
            noiseFlow: new this.minigl.Uniform({
              value: 6.5 + 0.3 * e,
            }),
            noiseSeed: new this.minigl.Uniform({
              value: this.seed + 10 * e,
            }),
            noiseFloor: new this.minigl.Uniform({
              value: 0.1,
            }),
            noiseCeil: new this.minigl.Uniform({
              value: 0.63 + 0.07 * e,
            }),
          },
          type: "struct",
        })
      );
    return (
      (this.vertexShader = [
        this.shaderFiles.noise,
        this.shaderFiles.blend,
        this.shaderFiles.vertex,
      ].join("\n\n")),
      new this.minigl.Material(
        this.vertexShader,
        this.shaderFiles.fragment,
        this.uniforms
      )
    );
  }
  initMesh() {
    (this.material = this.initMaterial()),
      (this.geometry = new this.minigl.PlaneGeometry()),
      (this.mesh = new this.minigl.Mesh(this.geometry, this.material));
  }
  shouldSkipFrame(e) {
    return (
      !!window.document.hidden ||
      !this.conf.playing ||
      parseInt(e, 10) % 2 == 0 ||
      void 0
    );
  }
  updateFrequency(e) {
    (this.freqX += e), (this.freqY += e);
  }
  toggleColor(index) {
    this.activeColors[index] = 0 === this.activeColors[index] ? 1 : 0;
    // Also update the live uniform so the change takes effect immediately.
    if (this.uniforms && this.uniforms.u_active_colors) {
      this.uniforms.u_active_colors.value[index].value = this.activeColors[index];
    }
  }
  showGradientLegend() {
    this.width > this.minWidth &&
      ((this.isGradientLegendVisible = !0),
      document.body.classList.add("isGradientLegendVisible"));
  }
  hideGradientLegend() {
    (this.isGradientLegendVisible = !1),
      document.body.classList.remove("isGradientLegendVisible");
  }
  init() {
    this.initGradientColors(),
      this.initMesh(),
      this.resize(),
      requestAnimationFrame(this.animate),
      window.addEventListener("resize", this.resize);
  }
  /*
   * Waiting for the css variables to become available, usually on page load before we can continue.
   * Using default colors assigned below if no variables have been found after maxCssVarRetries
   */
  waitForCssVars() {
    if (
      this.computedCanvasStyle &&
      -1 !==
        this.computedCanvasStyle
          .getPropertyValue("--gradient-color-1")
          .indexOf("#")
    )
      this.init(), this.addIsLoadedClass();
    else {
      if (
        ((this.cssVarRetries += 1), this.cssVarRetries > this.maxCssVarRetries)
      ) {
        return (
          (this.sectionColors = [16711680, 16711680, 16711935, 65280, 255].map(
            normalizeColor
          )),
          void this.init()
        );
      }
      requestAnimationFrame(() => this.waitForCssVars());
    }
  }
  /*
   * Initializes gradient colors from CSS variables.
   * Reads --gradient-color-1 through --gradient-color-8.
   * Colors not defined in CSS are skipped (the array may be shorter than 8).
   */
  initGradientColors() {
    this.sectionColors = [
      "--gradient-color-1",
      "--gradient-color-2",
      "--gradient-color-3",
      "--gradient-color-4",
      "--gradient-color-5",
      "--gradient-color-6",
      "--gradient-color-7",
      "--gradient-color-8",
    ]
      .map((cssPropertyName) => {
        let hex = this.computedCanvasStyle
          .getPropertyValue(cssPropertyName)
          .trim();
        if (!hex) return null;
        //Check if shorthand hex value was used and double the length so the conversion in normalizeColor will work.
        if (4 === hex.length) {
          const hexTemp = hex
            .substr(1)
            .split("")
            .map((hexTemp) => hexTemp + hexTemp)
            .join("");
          hex = `#${hexTemp}`;
        }
        return hex && `0x${hex.substr(1)}`;
      })
      .filter(Boolean)
      .map(normalizeColor);

    // Sync activeColors slots to match the number of loaded colors.
    this._syncActiveColors();
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /*
   * Keeps activeColors in sync with sectionColors.
   * Slots 0..sectionColors.length-1 are set to 1 (active).
   * Remaining slots up to 8 are set to 0 (inactive).
   */
  _syncActiveColors() {
    for (let i = 0; i < 8; i++) {
      this.activeColors[i] = i < this.sectionColors.length ? 1 : 0;
    }
  }

  /*
   * Removes the current mesh from the scene and rebuilds it from sectionColors.
   * Call this after adding or removing colors.
   */
  _rebuildMesh() {
    if (this.mesh) this.mesh.remove();
    this._syncActiveColors();
    this.initMesh();
    this.resize();
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /*
   * Set a color by index using a CSS hex string (e.g. "#ff6b6b").
   * Index 0 = base color, 1-7 = wave layers.
   * For existing colors only — use addColor() to add a new slot.
   */
  setColor(index, hexString) {
    const hex = hexString.replace("#", "");
    const normalized = normalizeColor(parseInt(`0x${hex}`, 16));
    this.sectionColors[index] = normalized;
    if (!this.uniforms) return;
    if (index === 0) {
      this.uniforms.u_baseColor.value = normalized;
    } else {
      const layer = this.uniforms.u_waveLayers.value[index - 1];
      if (layer) layer.value.color.value = normalized;
    }
  }

  /*
   * Set animation speed as a multiplier of the default.
   *   1.0 = default speed
   *   2.0 = twice as fast
   *   0.5 = half speed
   *   0.0 = frozen (same as pause but time still advances)
   */
  setSpeed(multiplier) {
    this._speedMultiplier = multiplier;
    if (this.uniforms) {
      this.uniforms.u_global.value.noiseSpeed.value =
        this._baseNoiseSpeed * multiplier;
    }
  }

  /*
   * Set the wave amplitude (how tall the undulations are).
   *   0   = completely flat
   *   320 = default
   *   600 = very dramatic
   */
  setAmplitude(value) {
    this.amp = value;
    if (this.uniforms) {
      this.uniforms.u_vertDeform.value.noiseAmp.value = value;
    }
  }

  /*
   * Set noise frequency on both axes.
   * Higher values = more wave cycles = more chaotic appearance.
   *   x default: 0.00014
   *   y default: 0.00029
   */
  setFrequency(x, y) {
    this.freqX = x;
    this.freqY = y;
    if (this.uniforms) {
      this.uniforms.u_global.value.noiseFreq.value = [x, y];
    }
  }

  /*
   * Add a new color layer (up to 8 total).
   * Accepts a CSS hex string: "#rrggbb" or "#rgb".
   * Returns false if already at the 8-color limit.
   */
  addColor(hexString) {
    if (this.sectionColors.length >= 8) {
      console.warn("Whatagradient: maximum of 8 colors reached.");
      return false;
    }
    const hex = hexString.replace("#", "");
    const normalized = normalizeColor(parseInt(`0x${hex}`, 16));
    this.sectionColors.push(normalized);
    this._rebuildMesh();
    return true;
  }

  /*
   * Remove a color by index (0 = base color, 1-7 = wave layers).
   * At least 1 color must remain.
   * Returns false if removal is not possible.
   */
  removeColor(index) {
    if (this.sectionColors.length <= 1) {
      console.warn("Whatagradient: at least 1 color is required.");
      return false;
    }
    if (index < 0 || index >= this.sectionColors.length) {
      console.warn(`Whatagradient: color index ${index} out of range.`);
      return false;
    }
    this.sectionColors.splice(index, 1);
    this._rebuildMesh();
    return true;
  }

  // ---------------------------------------------------------------------------
  // Palette cycling
  // ---------------------------------------------------------------------------

  /*
   * Internal: linearly interpolate two normalized [r,g,b] arrays.
   */
  _lerpColor(a, b, t) {
    return [
      a[0] + (b[0] - a[0]) * t,
      a[1] + (b[1] - a[1]) * t,
      a[2] + (b[2] - a[2]) * t,
    ];
  }

  /*
   * Internal: push an array of normalized colors directly to the live uniforms
   * without touching sectionColors. Used for smooth palette cross-fades.
   */
  _applyColors(normalizedColors) {
    if (!this.uniforms) return;
    normalizedColors.forEach((color, i) => {
      if (i === 0) {
        this.uniforms.u_baseColor.value = color;
      } else {
        const layer = this.uniforms.u_waveLayers.value[i - 1];
        if (layer) layer.value.color.value = color;
      }
    });
  }

  /*
   * Internal: rAF loop that drives the palette cross-fade.
   * Handles palettes of different lengths by padding the shorter one with its
   * last color, preventing "Cannot read properties of undefined" errors.
   */
  _paletteTick(ts) {
    if (!this._paletteCycling) return;
    if (this._paletteStartTime === null) this._paletteStartTime = ts;
    const elapsed = ts - this._paletteStartTime;
    const t = Math.min(elapsed / this._paletteTransitionMs, 1);

    const from = this._normPalettes[this._paletteIndex];
    const toIndex = this._nextPaletteIndex !== undefined
      ? this._nextPaletteIndex
      : (this._paletteIndex + 1) % this._normPalettes.length;
    const to = this._normPalettes[toIndex];

    // Lerp across the longer palette; pad the shorter one with its last color.
    const count = Math.max(from.length, to.length);
    const blended = Array.from({ length: count }, (_, i) => {
      const fc = from[i] ?? from[from.length - 1];
      const tc = to[i]   ?? to[to.length - 1];
      return this._lerpColor(fc, tc, t);
    });
    this._applyColors(blended);

    if (this.onPaletteProgress) this.onPaletteProgress(t, this._paletteIndex);

    if (t >= 1) {
      this._paletteIndex = toIndex;
      this._nextPaletteIndex = this._pickNext(this._paletteIndex);
      this._paletteStartTime = null;
      if (this.onPaletteChange) this.onPaletteChange(this._paletteIndex);
    }

    this._paletteAnimId = requestAnimationFrame((ts) => this._paletteTick(ts));
  }

  /*
   * Internal: choose the next palette index based on shuffle mode.
   */
  _pickNext(currentIndex) {
    if (!this._paletteShuffle || this.palettes.length <= 2) {
      return (currentIndex + 1) % this.palettes.length;
    }
    let next;
    do { next = Math.floor(Math.random() * this.palettes.length); }
    while (next === currentIndex);
    return next;
  }

  /*
   * Set the list of palettes for cycling.
   * Each entry: { name: string, colors: string[] } — hex strings, 2–8 colors each.
   * Must be called before startPaletteCycle().
   */
  setPalettes(palettes) {
    this.palettes = palettes;
    this._normPalettes = palettes.map((p) =>
      p.colors.map((hex) => {
        const h = hex.replace("#", "");
        return normalizeColor(parseInt(`0x${h}`, 16));
      })
    );
  }

  /*
   * Start auto-cycling through palettes with a smooth cross-fade.
   *   transitionMs — duration of each cross-fade in ms (default: 6000)
   * Requires at least 2 palettes set via setPalettes().
   */
  startPaletteCycle(transitionMs = 6000) {
    if (this.palettes.length < 2) {
      console.warn("Whatagradient: need at least 2 palettes to cycle.");
      return;
    }
    this._paletteTransitionMs = transitionMs;
    this._paletteCycling = true;
    this._paletteStartTime = null;
    this._nextPaletteIndex = this._pickNext(this._paletteIndex);
    this._paletteAnimId = requestAnimationFrame((ts) => this._paletteTick(ts));
  }

  /*
   * Stop palette auto-cycling. Colors remain at their current blended state.
   */
  stopPaletteCycle() {
    this._paletteCycling = false;
    if (this._paletteAnimId) {
      cancelAnimationFrame(this._paletteAnimId);
      this._paletteAnimId = null;
    }
  }

  /*
   * Jump immediately to a palette by index (snaps colors, no cross-fade).
   * Also resets the cycle timer so the next transition starts fresh from here.
   */
  jumpToPalette(index) {
    if (index < 0 || index >= this.palettes.length) return;
    this._paletteIndex = index;
    this._nextPaletteIndex = this._pickNext(index);
    this._paletteStartTime = null;
    if (this._normPalettes[index]) this._applyColors(this._normPalettes[index]);
    if (this.onPaletteChange) this.onPaletteChange(index);
  }

  /*
   * Enable or disable shuffle mode for palette cycling.
   *   true  — each transition picks a random (non-repeating) next palette
   *   false — palettes advance in order (default)
   */
  setPaletteShuffle(enabled) {
    this._paletteShuffle = enabled;
    // Re-pick next so the change takes effect before the current transition ends.
    this._nextPaletteIndex = this._pickNext(this._paletteIndex);
  }
}

/*
 * Usage:
 *   const gradient = new Gradient();
 *   gradient.initGradient('#gradient-canvas');
 *
 * Console commands (see readme.md for the full list):
 *   gradient.setSpeed(2)          // double speed
 *   gradient.setAmplitude(100)    // subtle waves
 *   gradient.setColor(0, '#ff0000') // change base color
 *   gradient.addColor('#00ff00')  // add a 5th color
 *   gradient.pause() / gradient.play()
 */

export { Gradient, normalizeColor, normalizedToHex };
