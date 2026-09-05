/* =========================================================================
   Immanuel Aletheia, Personal Site
   WebGL night sky: aurora curtains, a drifting star field, and comets.

   Renders every background layer into one fixed canvas. Curtains come from
   domain-warped fractal noise, which is what gives them folds and vertical
   filaments rather than the soft symmetric blobs a CSS gradient can make.
   Their seeds, speeds, frequencies and hues are randomised once per page
   load, so no two visits show the same sky, and colour runs the full hue
   circle rather than a fixed three-tone palette.

   Stars sit in four layers at different speeds, each star carrying its own
   size, tint and twinkle rate. Comets cross on their own cycles, re-rolling
   start point, direction, length and speed on every flight.

   Both themes render, but they composite oppositely. Night adds light: the
   shader writes zero alpha under premultiplied blending, which is pure
   addition, and is why it glows over a near-black ground. Day cannot do that,
   since adding light to white gives white, so daylight writes a real alpha
   and tints instead: golden hour, with the sun low on the horizon on a side
   rolled per load, god rays fanning up from it, cloud undersides catching the
   warmth, a sky running gold into blue overhead, fine motes and the odd
   contrail. The broad wash is held above a luminance floor rather than an
   opacity ceiling, because the constraint is contrast and gold costs far less
   of it than deep blue does. Stars and comets are night-only, being both invisible and wrong
   at noon, so motes and contrails stand in for them: daylight needs the same
   density of small moving detail to feel alive, and only the broad wash is
   limited by text contrast.

   It stays off under reduced motion, and never starts if WebGL is
   unavailable, in which case the CSS layers simply remain.

   No em dashes and no en dashes used anywhere.
   ========================================================================= */

(function () {
  'use strict';

  /* ---- Tuning -------------------------------------------------------------
     The only numbers worth touching. Raise AURORA to make the curtains more
     present, lower it if body copy crossing the horizon gets hard to read:
     that legibility is the constraint the whole design is held to.
     HEIGHT is the fraction of the viewport the curtains reach up. */
  var AURORA = 1.0;   /* curtain brightness, 0 to about 2.5 */
  var STARS  = 1.5;   /* star brightness,    0 to about 2.5 */
  var COMETS = 1.0;   /* comet brightness,   0 disables them */
  var CLOUDS = 1.35;  /* daylight cloud density, 0 clears the sky */
  var MOTES  = 1.0;   /* daylight drifting motes, the daytime star field */
  var TRAILS = 1.0;   /* daylight contrails, the daytime comets */
  var GOLDEN = 1.0;   /* golden hour: sun bloom and god rays, 0 for midday */
  var HEIGHT = 0.38;  /* curtain reach, fraction of viewport height */
  /* The real constraint on the daylight sky is luminance, not opacity. An
     alpha ceiling cannot tell a wash of gold from a wash of deep blue, even
     though the blue costs several times more contrast for the same opacity,
     so a flat cap throttles warm light for nothing.

     This is a floor on the resulting relative luminance instead. Body text
     uses --muted, whose luminance is 0.1245, and WCAG AA at 4.5:1 needs the
     background at or above 4.5 * 0.1745 - 0.05 = 0.7353. The broad wash is
     scaled back toward the page whenever it would cross that line, so the sun
     can bloom as hard as it likes and the shader holds the contrast itself.

     The margin over 0.7353 is not slack. The canvas composites to 8 bits, and
     that quantisation costs roughly 0.004 of luminance: at a floor of 0.738
     the gold horizon measured 0.7340 on screen and landed at 4.49:1, just
     under. 0.746 survives the rounding.

     Motes and contrails sit outside the floor deliberately: they are a couple
     of pixels across and cannot shift the average luminance under a line of
     text, which is what the ratio actually depends on. */
  var MIN_LUM = 0.746;
  /* ------------------------------------------------------------------------ */

  var VERT = [
    'attribute vec2 a_pos;',
    'void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }'
  ].join('\n');

  var FRAG = [
    '#ifdef GL_FRAGMENT_PRECISION_HIGH',
    'precision highp float;',
    '#else',
    'precision mediump float;',
    '#endif',

    'uniform vec2  u_res;',
    'uniform float u_time;',
    'uniform float u_fade;',
    'uniform float u_auroraI;',
    'uniform float u_starI;',
    'uniform float u_cometI;',
    'uniform float u_cloudI;',
    'uniform float u_moteI;',
    'uniform float u_trailI;',
    'uniform float u_goldenI;',
    'uniform float u_sunX;',
    'uniform vec2  u_rayK;',
    'uniform vec2  u_rayRot;',
    'uniform vec3  u_fadeP;',
    'uniform vec3  u_fadePh;',
    'uniform vec3  u_fadeD;',
    'uniform float u_minLum;',
    'uniform float u_auroraH;',
    'uniform float u_day;',
    /* Randomised once per page load, one component per curtain. */
    'uniform vec3  u_seed;',
    'uniform vec3  u_speed;',
    'uniform vec3  u_freq;',
    'uniform vec3  u_hue;',

    'float hash21(vec2 p) {',
    '  p = fract(p * vec2(123.34, 456.21));',
    '  p += dot(p, p + 45.32);',
    '  return fract(p.x * p.y);',
    '}',

    'float vnoise(vec2 p) {',
    '  vec2 i = floor(p);',
    '  vec2 f = fract(p);',
    '  f = f * f * (3.0 - 2.0 * f);',
    '  float a = hash21(i);',
    '  float b = hash21(i + vec2(1.0, 0.0));',
    '  float c = hash21(i + vec2(0.0, 1.0));',
    '  float d = hash21(i + vec2(1.0, 1.0));',
    '  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);',
    '}',

    'float fbm(vec2 p) {',
    '  float s = 0.0;',
    '  float a = 0.5;',
    '  for (int i = 0; i < 5; i++) {',
    '    s += a * vnoise(p);',
    '    p = p * 2.03 + vec2(17.1, 9.7);',
    '    a *= 0.5;',
    '  }',
    '  return s;',
    '}',

    /* Full saturation, full value: the hue circle, not a fixed palette. */
    'vec3 hue2rgb(float h) {',
    '  vec3 k = mod(vec3(5.0, 3.0, 1.0) + h * 6.0, 6.0);',
    '  return clamp(min(k, 4.0 - k), 0.0, 1.0);',
    '}',

    /* Four layers, each with its own scale and drift speed, so the field has
       depth instead of sliding as one sheet. Within a layer every star gets
       its own size, colour and twinkle rate from the cell hash. */
    'vec3 starField(vec2 uv, float t) {',
    '  vec3 col = vec3(0.0);',
    '  for (int i = 0; i < 4; i++) {',
    '    float fi = float(i);',
    '    float scale = 7.0 + fi * 6.5;',
    '    float speed = 0.010 + fi * 0.016;',
    '    vec2 gv = uv * scale;',
    '    gv.y -= t * speed;',
    '    vec2 id = floor(gv);',
    '    vec2 f = fract(gv) - 0.5;',
    '    float h = hash21(id + fi * 41.7);',
    '    float present = step(0.80, h);',
    '    float r = hash21(id + 21.4 + fi * 3.3);',
    '    vec2 off = (vec2(hash21(id + 7.3 + fi), hash21(id + 13.9 + fi)) - 0.5) * 0.7;',
    '    float d = length(f - off);',
    '    float size = mix(0.006, 0.018, r) / (1.0 + fi * 0.30);',
    '    float tw = 0.45 + 0.55 * sin(t * (0.5 + r * 2.6) + r * 40.0);',
    '    float s = smoothstep(size, 0.0, d) * present * tw;',
    /* A small hard core plus a wider halo, so bright stars read as points
       with light around them rather than as flat discs. */
    '    float halo = smoothstep(size * 3.4, 0.0, d) * present * tw * 0.20;',
    '    vec3 tint = mix(vec3(0.60, 0.74, 1.00), vec3(1.00, 0.90, 0.78), r);',
    '    col += (s + halo) * tint * (0.45 + 0.55 * r);',
    '  }',
    '  return col;',
    '}',

    /* One curtain. The horizontal coordinate is warped by a second noise
       field that varies with height and time, which is what folds and shears
       the sheet. Sampling at high frequency in x and low in y turns the
       result into vertical filaments. Hue rides across the sheet and creeps
       with time, so the colour is never static. */
    'vec4 curtain(vec2 uv, float t, float seed, float baseHue, float speed, float freq) {',
    '  float warp = fbm(vec2(uv.y * 1.8 + seed, t * speed * 0.35 + seed)) * 2.0 - 1.0;',
    '  float x = uv.x * freq + warp * 2.1 + t * speed * 0.10 + seed;',
    '  float f = fbm(vec2(x * 1.9, uv.y * 1.15 - t * speed * 0.45 + seed));',
    '  float band = pow(smoothstep(0.30, 0.86, f), 1.45);',
    '  float vfade = smoothstep(u_auroraH, 0.0, uv.y);',
    '  float hue = fract(baseHue + uv.x * 0.30 + warp * 0.07 + t * 0.015 * speed);',
    '  return vec4(hue2rgb(hue), band * vfade);',
    '}',

    /* Daylight clouds: the same fractal noise, stretched wide and flat so it
       reads as banks rather than blobs, held to the upper sky so it never
       crowds the horizon. Two layers at different speeds and scales give the
       edges definition, which is what makes them read as cloud rather than
       as haze. */
    'vec2 cloudBands(vec2 uv, float t) {',
    '  vec2 p = vec2(uv.x * 1.15 + t * 0.030, uv.y * 3.1);',
    '  float n = fbm(p + fbm(p * 0.7 + t * 0.035));',
    '  vec2 q = vec2(uv.x * 2.10 - t * 0.019, uv.y * 4.4 + 11.3);',
    '  float m = fbm(q + fbm(q * 0.8 - t * 0.024));',
    '  float v = smoothstep(0.24, 0.94, uv.y);',
    /* x is the cloud body, y is the lit top edge: where the field rises
       steeply the cloud catches light, and that edge is what gives the sky
       internal contrast without darkening it further. */
    '  float body = smoothstep(0.42, 0.78, max(n, m * 0.92)) * v;',
    '  float top  = smoothstep(0.60, 0.86, max(n, m * 0.92)) * v;',
    '  return vec2(body, top);',
    '}',

    /* The daytime answer to the star field: fine motes drifting down and
       swaying, in three parallax layers. Small and sparse on purpose, which
       is what lets them be higher contrast than the wash is allowed to be. */
    'float moteField(vec2 uv, float t) {',
    '  float acc = 0.0;',
    '  for (int i = 0; i < 3; i++) {',
    '    float fi = float(i);',
    '    float scale = 9.0 + fi * 7.0;',
    '    float speed = 0.016 + fi * 0.024;',
    '    vec2 gv = uv * scale;',
    '    gv.y += t * speed;',
    '    gv.x += sin(t * (0.15 + fi * 0.11) + fi * 2.3) * 0.30;',
    '    vec2 id = floor(gv);',
    '    vec2 f = fract(gv) - 0.5;',
    '    float present = step(0.86, hash21(id + fi * 27.3));',
    '    float r = hash21(id + 5.1 + fi * 2.7);',
    '    vec2 off = (vec2(hash21(id + 3.3 + fi), hash21(id + 9.1 + fi)) - 0.5) * 0.7;',
    '    float d = length(f - off);',
    '    float size = mix(0.007, 0.019, r) / (1.0 + fi * 0.30);',
    '    acc += smoothstep(size, 0.0, d) * present * (0.5 + 0.5 * r);',
    '  }',
    '  return clamp(acc, 0.0, 1.0);',
    '}',

    'float segDist(vec2 p, vec2 a, vec2 b) {',
    '  vec2 pa = p - a;',
    '  vec2 ba = b - a;',
    '  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-5), 0.0, 1.0);',
    '  return length(pa - ba * h);',
    '}',

    /* The real piecewise sRGB decode, not a pow(2.2) approximation. The
       shortcut over-estimated luminance for warm colours by about 0.008,
       which put the gold end of the horizon at 4.48:1 against --muted when
       it was aiming for 4.50. A few extra instructions buy exactness. */
    'float relLum(vec3 c) {',
    '  c = clamp(c, 0.0, 1.0);',
    '  vec3 lo = c / 12.92;',
    '  vec3 hi = pow((c + 0.055) / 1.055, vec3(2.4));',
    '  vec3 l = mix(lo, hi, step(vec3(0.04045), c));',
    '  return dot(l, vec3(0.2126, 0.7152, 0.0722));',
    '}',

    /* God rays fanning from the sun, rotating at a speed and direction rolled
       per load.

       The angle is embedded on a circle rather than fed to the noise raw. A
       bare atan jumps from pi to -pi on one side of the sun, and once the
       shafts rotate that discontinuity drags a hard seam across the sky. Wrapping
       it through cos and sin at an integer harmonic makes the field genuinely
       periodic in angle, so it turns without a join. The harmonic also sets how
       many shafts there are. */
    'float godRays(vec2 p, vec2 sun, float t, float k, float rot) {',
    '  vec2 d = p - sun;',
    '  float dist = length(d);',
    '  float a = atan(d.y, d.x) * k + t * rot;',
    '  vec2 circ = vec2(cos(a), sin(a)) * 1.6;',
    '  float n = fbm(circ + vec2(0.0, dist * 0.9 - t * 0.035));',
    '  float streak = smoothstep(0.40, 0.86, n);',
    '  float fall = smoothstep(1.00, 0.06, dist);',
    '  float up = smoothstep(-0.28, 0.35, d.y);',
    '  return streak * fall * up;',
    '}',

    /* Holds near full, then dips away over a couple of seconds and returns.
       A plain sine is never actually anywhere for long: this sits at full,
       fades, and comes back, which is what reads as a band coming and going
       rather than as a wobble. */
    'float pulseFade(float t, float period, float phase, float depth) {',
    '  float ph = fract(t / period + phase);',
    '  float dip = smoothstep(0.28, 0.50, ph) * smoothstep(0.72, 0.50, ph);',
    '  return 1.0 - depth * dip;',
    '}',

    /* The daytime answer to comets: high-altitude contrails, long and slow
       and much rarer, crossing on a shallow angle and fading from the tail. */
    'float contrails(vec2 uv, float t) {',
    '  float acc = 0.0;',
    '  for (int i = 0; i < 2; i++) {',
    '    float fi = float(i);',
    '    float period = 26.0 + fi * 11.0;',
    '    float tt = t / period + fi * 0.53;',
    '    float cyc = floor(tt);',
    '    float ph = fract(tt);',
    '    float r1 = hash21(vec2(cyc, fi + 2.7));',
    '    float r2 = hash21(vec2(cyc + 5.3, fi + 8.1));',
    '    float r3 = hash21(vec2(cyc + 12.9, fi + 4.4));',
    '    float span = 0.55;',
    '    float alive = step(ph, span);',
    '    float k = ph / span;',
    '    vec2 dir = normalize(vec2(-1.0, -0.10 - r2 * 0.18));',
    '    vec2 startP = vec2(1.35, 0.56 + r1 * 0.42);',
    '    vec2 head = startP + dir * k * 2.7;',
    '    float len = 0.34 + r3 * 0.36;',
    '    vec2 tail = head - dir * len;',
    '    float d = segDist(uv, tail, head);',
    '    float line = smoothstep(0.0024, 0.0, d);',
    '    float env = smoothstep(0.0, 0.10, k) * smoothstep(1.0, 0.72, k);',
    '    acc += line * alive * env;',
    '  }',
    '  return clamp(acc, 0.0, 1.0);',
    '}',

    /* Three comet slots on different periods. Every flight re-rolls its own
       start point, direction, length and speed from the cycle index, so no
       two follow the same path. Each is visible for a short slice of its
       cycle, which is what leaves long quiet gaps between them. */
    'vec3 comets(vec2 uv, float t) {',
    '  vec3 col = vec3(0.0);',
    '  for (int i = 0; i < 3; i++) {',
    '    float fi = float(i);',
    '    float period = 9.0 + fi * 4.3;',
    '    float tt = t / period + fi * 0.41;',
    '    float cyc = floor(tt);',
    '    float ph = fract(tt);',
    '    float r1 = hash21(vec2(cyc, fi + 3.1));',
    '    float r2 = hash21(vec2(cyc + 7.7, fi + 11.3));',
    '    float r3 = hash21(vec2(cyc + 19.1, fi + 5.9));',
    '    float span = 0.13 + r3 * 0.06;',
    '    float alive = step(ph, span);',
    '    float k = ph / span;',
    '    vec2 dir = normalize(vec2(-0.70 - r3 * 0.55, -0.40 - r2 * 0.45));',
    '    vec2 startP = vec2(1.15 + r1 * 0.30, 0.60 + r2 * 0.60);',
    '    vec2 head = startP + dir * k * 2.1;',
    '    float len = 0.09 + r3 * 0.15;',
    '    vec2 tail = head - dir * len;',
    '    float d = segDist(uv, tail, head);',
    '    float core = smoothstep(0.0032, 0.0, d);',
    '    float glow = smoothstep(0.028, 0.0, d) * 0.30;',
    '    float envelope = sin(k * 3.14159);',
    '    vec3 tint = mix(vec3(0.75, 0.86, 1.00), vec3(1.00, 0.92, 0.80), r1);',
    '    col += (core + glow) * alive * envelope * tint;',
    '  }',
    '  return col;',
    '}',

    'void main() {',
    '  vec2 uv = gl_FragCoord.xy / u_res;',
    '  float aspect = u_res.x / u_res.y;',
    '  vec2 auv = vec2(uv.x * aspect, uv.y);',

    '  vec4 c1 = curtain(uv, u_time, u_seed.x, u_hue.x, u_speed.x, u_freq.x);',
    '  vec4 c2 = curtain(uv, u_time, u_seed.y, u_hue.y, u_speed.y, u_freq.y);',
    '  vec4 c3 = curtain(uv, u_time, u_seed.z, u_hue.z, u_speed.z, u_freq.z);',

    '  if (u_day < 0.5) {',
    '    vec3 col = vec3(0.0);',
    '    col += starField(auv, u_time) * 0.85 * u_starI;',
    '    col += comets(auv, u_time) * u_cometI;',
    '    col += c1.rgb * c1.a * 0.30 * u_auroraI;',
    '    col += c2.rgb * c2.a * 0.27 * u_auroraI;',
    '    col += c3.rgb * c3.a * 0.20 * u_auroraI;',
    '    float base = smoothstep(0.28, 0.0, uv.y);',
    '    col += hue2rgb(fract(u_hue.x + uv.x * 0.25 + u_time * 0.01)) * base * 0.10 * u_auroraI;',
    /* Zero alpha under premultiplied blending is pure addition, so night adds
       light to the page rather than dimming it. */
    '    gl_FragColor = vec4(col * u_fade, 0.0);',
    '  } else {',
    /* Daylight tints rather than adds. The sky is deepened a little toward
       the top first, so that clouds have something to sit against and can
       then cut back toward white: that gives the sky internal contrast
       without darkening the page any further than the flat wash did. */
    '    vec2 cl = cloudBands(uv, u_time);',
    '    float body = cl.x * u_cloudI;',
    '    float top  = cl.y * u_cloudI;',

    /* The sun sits just above the bottom edge, its side of the sky rolled per
       load. It shimmers, the way a low sun does through thick atmosphere:
       without this the centrepiece is the one motionless thing on a page
       where everything else drifts. */
    '    vec2 sunP = vec2(u_sunX * aspect, 0.04);',
    '    float dSun = length((auv - sunP) * vec2(1.0, 1.28));',
    '    float shimmer = 1.0 + 0.07 * sin(u_time * 0.63) + 0.045 * sin(u_time * 1.27 + 1.7);',

    /* Three exponential falloffs rather than one smoothstep: a tight core, a
       mid halo, and wide atmospheric scatter. Real glow has no single radius,
       and summing scales is what makes it read as light rather than as a
       painted circle with an edge. */
    '    float b1 = exp(-dSun * 15.0);',
    '    float b2 = exp(-dSun * 5.2);',
    '    float b3 = exp(-dSun * 1.7);',
    '    float bloom = clamp((b1 * 0.55 + b2 * 0.34 + b3 * 0.24) * shimmer, 0.0, 1.4);',
    '    float core = b1 * shimmer;',

    /* A soft column standing above the sun, and the dense warm haze that
       collects along the horizon line itself. */
    '    float pillar = exp(-abs(auv.x - sunP.x) * 22.0) * smoothstep(0.85, 0.02, auv.y) * 0.5;',
    '    float haze = exp(-uv.y * 8.5);',
    '    float rays = (godRays(auv, sunP, u_time, u_rayK.x, u_rayRot.x) * 0.58',
    '                + godRays(auv, sunP, u_time, u_rayK.y, u_rayRot.y) * 0.42) * u_goldenI;',

    /* A sunset does not run gold straight into blue. The rose band between
       them is what makes it read as a sunset rather than as a yellow wash. */
    '    float low = smoothstep(0.70, 0.0, uv.y);',
    '    vec3 gold = vec3(1.00, 0.71, 0.32);',
    '    vec3 rose = vec3(0.97, 0.50, 0.55);',
    '    vec3 blue = vec3(0.38, 0.54, 0.84);',
    '    vec3 skyCol = mix(blue, rose, smoothstep(0.02, 0.58, low));',
    '    skyCol = mix(skyCol, gold, smoothstep(0.48, 1.0, low));',
    '    skyCol = mix(blue, skyCol, u_goldenI);',
    '    float aSky = 0.46 * smoothstep(-0.15, 1.0, uv.y) * (1.0 - body * 0.55);',

    /* Each band fades right out and returns on its own period, phase and
       depth, all rolled per load. Unlike periods mean they never queue up
       into a single pulse. */
    '    float br1 = pulseFade(u_time, u_fadeP.x, u_fadePh.x, u_fadeD.x);',
    '    float br2 = pulseFade(u_time, u_fadeP.y, u_fadePh.y, u_fadeD.y);',
    '    float br3 = pulseFade(u_time, u_fadeP.z, u_fadePh.z, u_fadeD.z);',

    '    float warm = clamp(bloom * 1.05 * u_goldenI, 0.0, 1.0);',
    '    float aCloud = body * 0.20 * br3;',
    '    vec3 cloudCol = mix(vec3(0.70, 0.74, 0.84), vec3(1.0, 0.99, 0.97), top);',
    '    cloudCol = mix(cloudCol, vec3(1.0, 0.84, 0.55), warm * 0.85);',
    /* Tops facing the sun catch a hot rim, which is the tell of golden hour
       on cloud rather than just an overall orange cast. */
    '    cloudCol = mix(cloudCol, vec3(1.0, 0.94, 0.76), top * warm * 0.9);',

    '    vec3 p1 = mix(c1.rgb, vec3(1.0), 0.52);',
    '    vec3 p2 = mix(c2.rgb, vec3(1.0), 0.60);',
    '    p1 = mix(p1, vec3(1.0, 0.84, 0.58), warm * 0.6);',
    '    float a1 = c1.a * 0.20 * u_auroraI * br1;',
    '    float a2 = c2.a * 0.15 * u_auroraI * br2;',

    '    vec3 goldCol = vec3(1.0, 0.78, 0.45);',
    '    vec3 hazeCol = vec3(1.0, 0.72, 0.42);',
    '    float aGlow = (bloom * 0.34 + core * 0.34 + rays * 0.26 + pillar * 0.18) * u_goldenI;',
    '    float aHaze = haze * 0.32 * u_goldenI;',

    '    vec3 preBroad = skyCol * aSky + cloudCol * aCloud + p1 * a1 + p2 * a2',
    '                  + goldCol * aGlow + hazeCol * aHaze;',
    '    float aBroad = aSky + aCloud + a1 + a2 + aGlow + aHaze;',

    /* Hold the contrast floor here rather than guessing at an opacity. The
       broad wash is scaled back toward the page only as far as it has to be,
       so warm light stays strong and cool light gives way sooner. */
    '    vec3 bgc = vec3(0.965, 0.973, 1.000);',
    '    vec3 outc = preBroad + bgc * (1.0 - aBroad);',
    '    float lo = relLum(outc);',
    '    float bgL = relLum(bgc);',
    '    float k = 1.0;',
    '    if (lo < u_minLum && bgL > lo) {',
    '      k = clamp((bgL - u_minLum) / max(bgL - lo, 0.0001), 0.0, 1.0);',
    '    }',

    /* Fine terms sit outside the floor: a mote is a couple of pixels wide
       and cannot move the average luminance under a line of text. */
    '    float aMote = moteField(auv, u_time) * 0.22 * u_moteI;',
    '    float aTrail = contrails(auv, u_time) * 0.26 * u_trailI;',
    '    vec3 preFine = vec3(0.26, 0.33, 0.50) * aMote + vec3(0.62, 0.68, 0.80) * aTrail;',

    '    vec3 pre = preBroad * k + preFine;',
    '    float a = min(aBroad * k + aMote + aTrail, 0.80);',
    '    gl_FragColor = vec4(pre * u_fade, a * u_fade);',
    '  }',
    '}'
  ].join('\n');

  var root = document.documentElement;
  var canvas = document.getElementById('sky');
  if (!canvas) return;

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var gl = null;
  try {
    var opts = { alpha: true, antialias: false, depth: false, stencil: false, powerPreference: 'low-power' };
    gl = canvas.getContext('webgl', opts) || canvas.getContext('experimental-webgl', opts);
  } catch (e) {
    gl = null;
  }
  if (!gl) return;

  function compile(type, src) {
    var sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      gl.deleteShader(sh);
      return null;
    }
    return sh;
  }

  var vs = compile(gl.VERTEX_SHADER, VERT);
  var fs = compile(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return;

  var prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
  gl.useProgram(prog);

  /* One triangle large enough to cover the clip volume: fewer vertices than
     a quad and no seam down the diagonal. */
  var buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  var aPos = gl.getAttribLocation(prog, 'a_pos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  var uRes = gl.getUniformLocation(prog, 'u_res');
  var uTime = gl.getUniformLocation(prog, 'u_time');
  var uFade = gl.getUniformLocation(prog, 'u_fade');

  function rnd(a, b) { return a + Math.random() * (b - a); }

  gl.uniform1f(gl.getUniformLocation(prog, 'u_auroraI'), AURORA);
  gl.uniform1f(gl.getUniformLocation(prog, 'u_starI'), STARS);
  gl.uniform1f(gl.getUniformLocation(prog, 'u_cometI'), COMETS);
  gl.uniform1f(gl.getUniformLocation(prog, 'u_cloudI'), CLOUDS);
  gl.uniform1f(gl.getUniformLocation(prog, 'u_moteI'), MOTES);
  gl.uniform1f(gl.getUniformLocation(prog, 'u_trailI'), TRAILS);
  gl.uniform1f(gl.getUniformLocation(prog, 'u_goldenI'), GOLDEN);
  gl.uniform1f(gl.getUniformLocation(prog, 'u_minLum'), MIN_LUM);
  gl.uniform1f(gl.getUniformLocation(prog, 'u_auroraH'), HEIGHT);
  /* Which side of the sky the sun sits on, rolled per load like the rest. */
  gl.uniform1f(gl.getUniformLocation(prog, 'u_sunX'), rnd(0.12, 0.88));

  /* Shaft count as an integer harmonic, so the rotation stays seamless, and
     a signed speed so the two layers may turn either way and often oppose. */
  function signed(lo, hi) {
    var v = rnd(lo, hi);
    return Math.random() < 0.5 ? -v : v;
  }
  gl.uniform2f(gl.getUniformLocation(prog, 'u_rayK'),
    Math.round(rnd(3, 8)), Math.round(rnd(4, 9)));
  gl.uniform2f(gl.getUniformLocation(prog, 'u_rayRot'),
    signed(0.05, 0.22), signed(0.05, 0.22));

  /* Fade cycles: period in seconds, phase, and how far down each band goes. */
  gl.uniform3f(gl.getUniformLocation(prog, 'u_fadeP'), rnd(9, 15), rnd(11, 18), rnd(8, 13));
  gl.uniform3f(gl.getUniformLocation(prog, 'u_fadePh'), Math.random(), Math.random(), Math.random());
  gl.uniform3f(gl.getUniformLocation(prog, 'u_fadeD'), rnd(0.55, 0.85), rnd(0.50, 0.80), rnd(0.35, 0.60));
  var uDay = gl.getUniformLocation(prog, 'u_day');

  /* Rolled once per load. The three curtains get unlike speeds on purpose,
     so they slide past each other rather than moving as one sheet. */
  gl.uniform3f(gl.getUniformLocation(prog, 'u_seed'), rnd(0, 60), rnd(0, 60), rnd(0, 60));
  gl.uniform3f(gl.getUniformLocation(prog, 'u_speed'), rnd(0.65, 1.35), rnd(0.45, 1.05), rnd(1.00, 1.90));
  gl.uniform3f(gl.getUniformLocation(prog, 'u_freq'), rnd(2.0, 3.4), rnd(2.6, 4.2), rnd(1.6, 2.8));
  /* Hues spread around the circle, so the three curtains stay tellable apart
     however the roll lands. */
  var h0 = Math.random();
  gl.uniform3f(
    gl.getUniformLocation(prog, 'u_hue'),
    h0,
    (h0 + rnd(0.22, 0.44)) % 1,
    (h0 + rnd(0.55, 0.78)) % 1
  );

  gl.clearColor(0, 0, 0, 0);

  var DPR_CAP = 1.5;
  var width = 0;
  var height = 0;

  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
    /* Measure the element, not the window. window.innerWidth includes the
       scrollbar gutter, so sizing the backing store from it renders a wider
       image than the box it is displayed in: a slight horizontal squash and
       an aspect ratio the shader then uses to place the sun. */
    var rect = canvas.getBoundingClientRect();
    var w = Math.max(1, Math.round(rect.width * dpr));
    var h = Math.max(1, Math.round(rect.height * dpr));
    if (w === width && h === height) return;
    width = w;
    height = h;
    canvas.width = w;
    canvas.height = h;
    gl.viewport(0, 0, w, h);
    gl.uniform2f(uRes, w, h);
  }

  var running = false;
  var rafId = 0;
  var start = 0;
  var fade = 0;
  var lit = false;
  var currentDay = null;   /* 0 night, 1 day, null before the first frame */
  var pendingDay = null;   /* a theme swap waiting for the sky to fade out */

  function frame(now) {
    if (!running) return;
    if (!start) start = now;
    var t = (now - start) / 1000;

    /* A theme swap dips the sky out, changes branch at the bottom of the dip,
       and brings it back. Switching the uniform outright cuts from golden
       hour to a starfield between one frame and the next, which reads as a
       glitch rather than as a change of theme. */
    if (pendingDay !== null) {
      fade = Math.max(0, fade - 0.07);
      if (fade <= 0.001) {
        gl.uniform1f(uDay, pendingDay);
        currentDay = pendingDay;
        pendingDay = null;
      }
    } else {
      fade = Math.min(1, fade + 0.02);
    }

    resize();
    gl.uniform1f(uTime, t);
    gl.uniform1f(uFade, fade);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    if (!lit) {
      lit = true;
      /* Only now, after a frame has actually drawn, do the CSS stand-ins
         step aside. A failure before this point leaves them in place. */
      root.classList.add('sky-on');
      canvas.classList.add('lit');
    }
    rafId = requestAnimationFrame(frame);
  }

  function play() {
    if (running) return;
    running = true;
    rafId = requestAnimationFrame(frame);
  }

  function pause() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
  }

  function isDark() {
    var attr = root.getAttribute('data-theme');
    if (attr) return attr === 'dark';
    return !window.matchMedia('(prefers-color-scheme: light)').matches;
  }

  /* Both themes render. Only the compositing model and the contents change. */
  function syncTheme() {
    var want = isDark() ? 0.0 : 1.0;
    gl.useProgram(prog);
    if (currentDay === null) {
      /* First run: no dip, the opening fade covers it. */
      currentDay = want;
      gl.uniform1f(uDay, want);
    } else if (want !== currentDay && pendingDay !== want) {
      pendingDay = want;
    }
    play();
  }

  new MutationObserver(syncTheme).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', syncTheme);

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      pause();
    } else {
      play();
    }
  });

  var resizeTimer = null;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 120);
  }, { passive: true });

  resize();
  syncTheme();
}());
