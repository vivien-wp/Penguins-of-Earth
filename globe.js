/* ==================================================================
   Globe — a dependency-free dotted sphere on a 2D canvas.
   · Land dots generated from the embedded LANDMASK (equirectangular).
   · Orthographic projection, slow auto-rotation, drag to spin.
   · Colony markers projected on top, with hit-testing.
   No libraries. No WebGL.
   ================================================================== */

const DEG = Math.PI / 180;

function GlobeEngine(canvas, opts) {
  const ctx = canvas.getContext("2d");
  const colonies = opts.colonies;           // [{lat,lon,id,name,species}]
  const onPick = opts.onPick || (() => {});
  const onHover = opts.onHover || (() => {});

  let W = 0, H = 0, dpr = 1, cx = 0, cy = 0, R = 0;
  let yaw = -60 * DEG, pitch = 12 * DEG;     // start over the Southern Ocean
  let yawVel = 0, autoSpin = 0.0012;         // radians / frame (base; scaled by spinMult)
  let dragging = false, lastX = 0, lastY = 0, lastMoveT = 0;
  let dots = [];
  let colours = readColours();
  let target = null, targetT = 0;            // for "locate" fly-to
  let markerScreens = [];                    // populated each frame for hit-test
  let hoverIndex = -1;
  let threatenedOnly = false;                // dim Least-Concern markers
  let stars = [];                            // void backdrop (dark mode only)
  let sunAngle = 1.2;                        // day/night terminator phase
  const reduceMotion = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  let spinMult = 1;                          // rotation speed: 0 paused · 1 normal
  let highlightId = null, highlightAnchor = null;   // species leader-line / emphasis

  /* ---- land dots from mask --------------------------------------- */
  function decodeMask() {
    const bin = atob(LANDMASK.bits);
    const test = (mx, my) => {
      const i = (my * LANDMASK.w + mx);
      return (bin.charCodeAt(i >> 3) >> (7 - (i & 7))) & 1;
    };
    return test;
  }
  function buildDots() {
    const test = decodeMask();
    const pts = [];
    const latStep = 1.9;                      // ~95 rings
    const baseLon = 150;                      // equator longitude samples
    for (let lat = -89; lat <= 89; lat += latStep) {
      const c = Math.cos(lat * DEG);
      const n = Math.max(4, Math.round(baseLon * c));
      for (let k = 0; k < n; k++) {
        const lon = -180 + (360 * k) / n;
        const mx = Math.min(LANDMASK.w - 1, ((lon + 180) / 360 * LANDMASK.w) | 0);
        const my = Math.min(LANDMASK.h - 1, ((90 - lat) / 180 * LANDMASK.h) | 0);
        if (!test(mx, my)) continue;
        const la = lat * DEG, lo = lon * DEG;
        pts.push({
          x: Math.cos(la) * Math.cos(lo),
          y: Math.sin(la),
          z: Math.cos(la) * Math.sin(lo),
        });
      }
    }
    return pts;
  }

  /* ---- colours read from CSS so themes just work ----------------- */
  function readColours() {
    const s = getComputedStyle(document.documentElement);
    return {
      bg: s.getPropertyValue("--bg").trim(),
      accent: s.getPropertyValue("--accent").trim(),
      fg: s.getPropertyValue("--fg").trim(),
    };
  }
  function rgb(hex, a) {
    const h = hex.replace("#", "");
    const n = h.length === 3
      ? h.split("").map((c) => parseInt(c + c, 16))
      : [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
    return `rgba(${n[0]},${n[1]},${n[2]},${a})`;
  }
  function isDark() { return document.documentElement.getAttribute("data-theme") !== "light"; }

  // sprinkle stars across the void (not over the globe disk)
  function genStars() {
    stars = [];
    const n = Math.round((W * H) / 5500);
    for (let i = 0; i < n; i++) {
      stars.push({
        x: Math.random() * W, y: Math.random() * H,
        r: Math.random() * 1.2 + 0.35, a: Math.random() * 0.5 + 0.2,
      });
    }
  }

  /* ---- sizing ---------------------------------------------------- */
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cx = W / 2; cy = H / 2;
    R = Math.min(W, H) * (W < 640 ? 0.42 : 0.36);
    genStars();
  }

  /* ---- rotate a unit vector by yaw (Y) then pitch (X) ------------ */
  function project(v) {
    const cy_ = Math.cos(yaw), sy = Math.sin(yaw);
    let x = v.x * cy_ + v.z * sy;
    let z = -v.x * sy + v.z * cy_;
    let y = v.y;
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const y2 = y * cp - z * sp;
    const z2 = y * sp + z * cp;
    return { sx: cx + R * x, sy: cy - R * y2, depth: z2 };  // depth>0 = front
  }

  /* ---- main draw ------------------------------------------------- */
  function frame() {
    ctx.clearRect(0, 0, W, H);

    const dark = isDark();

    // starfield — only at night (the void), never over the globe disk
    if (dark) {
      const rin = (R * 1.04) * (R * 1.04);
      for (let i = 0; i < stars.length; i++) {
        const s = stars[i], dx = s.x - cx, dy = s.y - cy;
        if (dx * dx + dy * dy < rin) continue;
        ctx.fillStyle = rgb(colours.fg, s.a);
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 7); ctx.fill();
      }
    }

    // sun direction for the day/night terminator (dark mode only)
    const stilt = Math.sin(-8 * DEG), ctilt = Math.cos(-8 * DEG);
    const sunX = ctilt * Math.cos(sunAngle), sunY = stilt, sunZ = ctilt * Math.sin(sunAngle);

    // the one permitted gradient: a faint sphere vignette for roundness
    const g = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, R * 1.02);
    g.addColorStop(0, rgb(colours.accent, 0.05));
    g.addColorStop(0.72, rgb(colours.accent, 0.015));
    g.addColorStop(1, rgb(colours.fg, 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, R * 1.02, 0, 7); ctx.fill();

    // limb (sphere outline)
    ctx.strokeStyle = rgb(colours.accent, 0.22);
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();

    // land dots
    for (let i = 0; i < dots.length; i++) {
      const p = project(dots[i]);
      if (p.depth <= 0.02) continue;             // back hemisphere hidden
      const d = p.depth;                          // 0..1 front-facing
      let illum = 1;
      if (dark) {                                 // shade by the sun → terminator sweep
        const w = dots[i];
        const dp = w.x * sunX + w.y * sunY + w.z * sunZ;
        illum = 0.2 + 0.8 * Math.max(0, Math.min(1, (dp + 0.12) / 0.45));
      }
      const a = (0.16 + d * 0.74) * illum;
      const size = (0.7 + d * 1.5) * (R / 260);
      ctx.fillStyle = rgb(colours.accent, a);
      ctx.fillRect(p.sx - size / 2, p.sy - size / 2, size, size);
    }

    // colony markers
    markerScreens = [];
    const hiScreens = [];                              // front-facing markers of the highlighted species
    for (let i = 0; i < colonies.length; i++) {
      const m = colonies[i];
      const v = {
        x: Math.cos(m.lat * DEG) * Math.cos(m.lon * DEG),
        y: Math.sin(m.lat * DEG),
        z: Math.cos(m.lat * DEG) * Math.sin(m.lon * DEG),
      };
      const p = project(v);
      const front = p.depth > 0;
      const muted = threatenedOnly && m.severity < 2;   // hide Least-Concern / Near-Threatened
      markerScreens.push({ x: p.sx, y: p.sy, front, idx: i, muted });
      if (!front) continue;

      if (muted) {                                       // faint, inert dot
        ctx.fillStyle = rgb(colours.accent, 0.10);
        ctx.beginPath(); ctx.arc(p.sx, p.sy, 1.6 * (R / 260), 0, 7); ctx.fill();
        continue;
      }

      const isHi = highlightId != null && m.id === highlightId;
      if (isHi) hiScreens.push({ x: p.sx, y: p.sy, name: m.species });

      const t = (performance.now ? performance.now() : Date.now()) / 1000;
      const pulse = 0.5 + 0.5 * Math.sin(t * (m.severity >= 3 ? 3.4 : 2) + i);
      const hovered = i === hoverIndex || isHi;
      const base = 3.1 * (R / 260) * (isHi ? 1.4 : 1);

      // outer pulse ring
      ctx.strokeStyle = rgb(colours.accent, 0.12 + pulse * 0.32);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(p.sx, p.sy, base + 4 + pulse * 5 + (hovered ? 4 : 0), 0, Math.PI * 2);
      ctx.stroke();

      // endangered species get a second, tighter ring
      if (m.severity >= 3) {
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, base + 2.4, 0, Math.PI * 2);
        ctx.strokeStyle = rgb(colours.accent, 0.55);
        ctx.stroke();
      }

      // core
      ctx.fillStyle = colours.accent;
      ctx.shadowColor = colours.accent;
      ctx.shadowBlur = hovered ? 16 : 9;
      ctx.beginPath();
      ctx.arc(p.sx, p.sy, base * (hovered ? 1.25 : 1), 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // leader line(s) from the hovered pill to its colonies, + a name label
    if (highlightId != null && hiScreens.length) {
      if (highlightAnchor) {
        ctx.strokeStyle = rgb(colours.accent, 0.5);
        ctx.lineWidth = 1; ctx.setLineDash([3, 4]);
        for (const h of hiScreens) {
          ctx.beginPath();
          ctx.moveTo(highlightAnchor.x, highlightAnchor.y);
          ctx.lineTo(h.x, h.y);
          ctx.stroke();
        }
        ctx.setLineDash([]);
      }
      const h0 = hiScreens[0];
      ctx.font = "500 12px 'JetBrains Mono', ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.shadowColor = colours.bg; ctx.shadowBlur = 6;
      ctx.fillStyle = colours.accent;
      ctx.fillText(h0.name, h0.x, h0.y - 15);
      ctx.shadowBlur = 0;
      ctx.textAlign = "start";
    }

    if (!reduceMotion) sunAngle += 0.0011;          // slow terminator sweep

    // motion update
    if (!dragging) {
      if (target) {
        // ease yaw/pitch toward a target colony
        targetT = Math.min(1, targetT + 0.022);
        const e = 1 - Math.pow(1 - targetT, 3);
        yaw = target.fromYaw + shortestAngle(target.fromYaw, target.toYaw) * e;
        pitch = target.fromPitch + (target.toPitch - target.fromPitch) * e;
        if (targetT >= 1) target = null;
      } else {
        yaw += autoSpin * spinMult + yawVel;
        yawVel *= 0.94;                           // inertia decay
      }
    }

    requestAnimationFrame(frame);
  }

  function shortestAngle(a, b) {
    let d = (b - a) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  /* ---- pointer handling ----------------------------------------- */
  function hitTest(px, py) {
    let best = -1, bestD = 18 * 18;
    for (const m of markerScreens) {
      if (!m.front || m.muted) continue;
      const dx = m.x - px, dy = m.y - py, d2 = dx * dx + dy * dy;
      if (d2 < bestD) { bestD = d2; best = m.idx; }
    }
    return best;
  }

  function onDown(e) {
    dragging = true; target = null;
    canvas.classList.add("dragging");
    lastX = e.clientX; lastY = e.clientY; lastMoveT = Date.now();
    yawVel = 0;
    canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
  }
  function onMove(e) {
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left, py = e.clientY - rect.top;
    if (dragging) {
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      yaw += dx * 0.006;
      pitch = Math.max(-1.2, Math.min(1.2, pitch + dy * 0.006));
      const now = Date.now(), dt = Math.max(1, now - lastMoveT);
      yawVel = (dx * 0.006) * (16 / dt);
      lastX = e.clientX; lastY = e.clientY; lastMoveT = now;
    } else {
      const hit = hitTest(px, py);
      if (hit !== hoverIndex) {
        hoverIndex = hit;
        canvas.style.cursor = hit >= 0 ? "pointer" : "grab";
        onHover(hit >= 0 ? { ...colonies[hit], sx: markerScreens.find(m => m.idx === hit).x, sy: markerScreens.find(m => m.idx === hit).y } : null);
      } else if (hit >= 0) {
        const ms = markerScreens.find(m => m.idx === hit);
        onHover({ ...colonies[hit], sx: ms.x, sy: ms.y });
      }
    }
  }
  function onUp(e) {
    if (dragging) {
      dragging = false;
      canvas.classList.remove("dragging");
      const rect = canvas.getBoundingClientRect();
      const moved = Math.abs(e.clientX - (rect.left + lastX)) ;
    }
  }
  function onClick(e) {
    const rect = canvas.getBoundingClientRect();
    const hit = hitTest(e.clientX - rect.left, e.clientY - rect.top);
    if (hit >= 0) onPick(colonies[hit]);
  }

  /* ---- public: fly the globe to a lat/lon ----------------------- */
  function flyTo(lat, lon) {
    const toYaw = -lon * DEG - Math.PI / 2 + Math.PI;   // bring lon to front
    target = {
      fromYaw: yaw, toYaw: -lon * DEG - Math.PI / 2,
      fromPitch: pitch, toPitch: Math.max(-1.0, Math.min(1.0, -lat * DEG * 0.6)),
    };
    targetT = 0;
  }

  function setTheme() { colours = readColours(); }
  function setFilter(on) { threatenedOnly = !!on; }
  function setSpin(mult) { spinMult = mult; }
  function setHighlight(id, anchor) { highlightId = id || null; highlightAnchor = anchor || null; }

  /* ---- wire up --------------------------------------------------- */
  canvas.addEventListener("pointerdown", onDown);
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  canvas.addEventListener("click", onClick);
  window.addEventListener("resize", () => { resize(); });

  resize();
  dots = buildDots();
  requestAnimationFrame(frame);

  return { flyTo, setTheme, setFilter, setSpin, setHighlight, dotCount: () => dots.length };
}
