/* ==================================================================
   App — wires the dataset to the globe and the UI chrome.
   ================================================================== */

(function () {
  const $ = (s, r = document) => r.querySelector(s);

  // flatten colonies into a single marker list, each linked to its species
  const markers = [];
  PENGUINS.forEach((sp) => {
    sp.colonies.forEach((c) => {
      markers.push({ ...c, id: sp.id, species: sp.name, severity: sp.severity });
    });
  });

  const byId = Object.fromEntries(PENGUINS.map((p) => [p.id, p]));
  const isMobile = () => window.matchMedia("(max-width: 640px)").matches;
  const potd = PENGUINS[Math.floor(Date.now() / 86400000) % PENGUINS.length];   // penguin of the day
  let hlTimer = null;

  /* ---- theme ----------------------------------------------------- */
  const root = document.documentElement;
  const themeBtn = $("#themeBtn");
  const themeLabel = $("#themeLabel");
  function applyTheme(t) {
    root.setAttribute("data-theme", t);
    localStorage.setItem("globe-theme", t);
    themeLabel.textContent = t === "light" ? "Light" : "Dark";
    if (globe) requestAnimationFrame(() => globe.setTheme());
  }
  themeBtn.addEventListener("click", () => {
    applyTheme(root.getAttribute("data-theme") === "light" ? "dark" : "light");
  });

  /* ---- the globe ------------------------------------------------- */
  const tip = $("#tip");
  const globe = GlobeEngine($("#globe"), {
    colonies: markers,
    onPick: (m) => openCard(m.id, m),
    onHover: (m) => {
      if (!m) { tip.classList.remove("show"); return; }
      tip.style.left = m.sx + "px";
      tip.style.top = m.sy + "px";
      tip.innerHTML = `<span class="t-sp">${m.species}</span> <span class="t-loc">· ${m.name}</span>`;
      tip.classList.add("show");
    },
    onView: (active) => $("#resetBtn").classList.toggle("show", active),
  });

  // return to the wide overview from a zoomed / located view
  $("#resetBtn").addEventListener("click", () => globe.clearFocus());

  // theme is applied after globe exists so setTheme() can run
  applyTheme(localStorage.getItem("globe-theme") || "dark");

  /* ---- species quick-nav (a slide-up menu on mobile) ------------ */
  const nav = $("#speciesNav");
  const speciesToggle = $("#speciesToggle");
  function openMenu() {
    nav.classList.add("open");
    speciesToggle.setAttribute("aria-expanded", "true");
    speciesToggle.querySelector("span").textContent = "Close";
  }
  function closeMenu() {
    nav.classList.remove("open");
    speciesToggle.setAttribute("aria-expanded", "false");
    speciesToggle.querySelector("span").textContent = "Species";
  }
  speciesToggle.addEventListener("click", () => {
    nav.classList.contains("open") ? closeMenu() : openMenu();
  });
  PENGUINS.forEach((sp) => {
    const b = document.createElement("button");
    b.textContent = sp.name;
    b.setAttribute("aria-label", `Show ${sp.name} penguin and locate it on the globe`);
    b.dataset.id = sp.id;
    if (sp.id === potd.id) b.classList.add("today");
    b.addEventListener("click", () => { openCard(sp.id); if (isMobile()) closeMenu(); });
    // hover / focus a pill → draw a leader line from it to that species' colonies
    const hi = () => {
      const r = b.getBoundingClientRect();
      globe.setHighlight(sp.id, { x: r.left + r.width / 2, y: r.top + r.height / 2 });
    };
    const unhi = () => globe.setHighlight(null);
    b.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") hi(); });
    b.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") unhi(); });
    b.addEventListener("focus", hi);
    b.addEventListener("blur", unhi);
    nav.appendChild(b);
  });

  /* ---- card ------------------------------------------------------ */
  const card = $("#card");
  let activeId = null;

  function pips(n, total, label) {
    let s = '<span class="pips">';
    for (let i = 0; i < total; i++) s += `<i class="${i < n ? "on" : ""}"></i>`;
    return s + `</span>`;
  }

  function openCard(id, colony) {
    const sp = byId[id];
    if (!sp) return;
    activeId = id;
    history.replaceState(null, "", "#" + id);   // shareable deep-link

    const idx = (PENGUINS.findIndex((p) => p.id === id) + 1).toString().padStart(2, "0");
    const sevDots = Array.from({ length: 5 }, (_, i) =>
      `<i class="${i <= sp.severity ? "on" : ""}"></i>`).join("");

    card.innerHTML = `
      <div class="card-grab" aria-hidden="true"></div>
      <button class="card-close" aria-label="Close">&times;</button>
      <div class="card-figure">
        <span class="sev">${sp.statusCode} <span class="sev-bar">${sevDots}</span></span>
        <img src="${sp.photo}" alt="${sp.name} penguin (${sp.binomial})" loading="lazy"
             onerror="this.style.opacity=0.15;this.alt='photo unavailable';">
        <span class="figcredit">photo · Wikimedia Commons</span>
      </div>
      <div class="card-body">
        <div class="index-no">SPECIES ${idx} / ${PENGUINS.length.toString().padStart(2, "0")}</div>
        <h2>${sp.name}${sp.id === potd.id ? ' <span class="potd-badge">★ today</span>' : ""}</h2>
        <div class="binom">${sp.binomial}</div>

        <dl class="stats">
          <div class="stat"><dt>Status</dt><dd><b>${sp.status}</b> · trend ${sp.trend}</dd></div>
          <div class="stat"><dt>Lifespan</dt><dd>${sp.lifespan}</dd></div>
          <div class="stat"><dt>Size</dt><dd>${sp.size} · ${sp.weight}</dd></div>
          <div class="stat"><dt>Diet</dt><dd>${sp.diet}</dd></div>
          <div class="stat"><dt>Range</dt><dd>${sp.range}</dd></div>
          <div class="stat"><dt>Arch-nemesis</dt><dd>${sp.nemesis}</dd></div>
          <div class="stat"><dt>Accepts pets</dt>
            <dd class="pet">${pips(sp.petIndex, 5)} <small>${petLabel(sp.petIndex)}</small></dd></div>
        </dl>

        <div class="note">${sp.fieldNote}</div>

        <button class="locate">◎ Locate on globe</button>
        <div class="colonies"><b>Colonies plotted:</b> ${sp.colonies.map((c) => c.name).join(" · ")}</div>
      </div>`;

    card.classList.add("open");
    document.documentElement.classList.add("card-open");
    if (isMobile()) closeMenu();
    card.scrollTop = 0;

    // highlight nav
    nav.querySelectorAll("button").forEach((b) =>
      b.classList.toggle("active", b.dataset.id === id));

    $(".card-close", card).addEventListener("click", closeCard);
    $(".locate", card).addEventListener("click", () => {
      const c = colony && colony.id === id ? colony : sp.colonies[0];
      globe.focusOn(c.lat, c.lon, sp.name);      // fly + zoom in + drop a reticle
      if (isMobile()) hideCardPanel();           // hide the sheet so you can actually see it
    });

    // fly + zoom + reticle onto the colony that was clicked (or the first one)
    const c = colony || sp.colonies[0];
    globe.focusOn(c.lat, c.lon, sp.name);
  }

  function hideCardPanel() {
    card.classList.remove("open");
    document.documentElement.classList.remove("card-open");
  }
  function closeCard() {
    hideCardPanel();                             // keep the located/zoomed view + reticle so you can SEE where it was
    activeId = null;
    history.replaceState(null, "", location.pathname + location.search);
    nav.querySelectorAll("button").forEach((b) => b.classList.remove("active"));
  }

  function petLabel(n) {
    return ["legally a no", "absolutely not", "still no", "tempting but no", "the closest you'll get", "—"][n] || "—";
  }

  // close on Escape
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeCard(); });

  /* ---- swipe the mobile sheet down to dismiss (pull from the top) - */
  let sheetStartY = null, sheetDragging = false;
  function resetSheet() {
    if (sheetStartY === null) return;
    sheetStartY = null; sheetDragging = false;
    card.style.transition = ""; card.style.transform = ""; card.style.overflowY = "";
  }
  card.addEventListener("pointerdown", (e) => {
    if (!isMobile() || !card.classList.contains("open")) return;
    if (card.scrollTop > 0) return;              // only when scrolled to the very top
    sheetStartY = e.clientY; sheetDragging = false;
    card.style.transition = "none";
  });
  card.addEventListener("pointermove", (e) => {
    if (sheetStartY === null) return;
    const dy = e.clientY - sheetStartY;
    if (dy > 0) {
      sheetDragging = true;
      card.style.overflowY = "hidden";           // stop inner scroll while pulling the sheet
      card.style.transform = `translateY(${dy}px)`;
      e.preventDefault();
    } else if (dy < -4) {
      resetSheet();                              // pulling up — abandon dismiss, restore scroll
    }
  });
  card.addEventListener("pointerup", () => {
    if (sheetStartY === null) return;
    const dy = sheetDragging ? parseFloat(card.style.transform.replace(/[^0-9.\-]/g, "")) || 0 : 0;
    const dismiss = sheetDragging && dy > 110;
    resetSheet();
    if (dismiss) closeCard();
  });
  card.addEventListener("pointercancel", resetSheet);

  /* ---- controls: surprise · threatened filter · stat line -------- */
  const total = PENGUINS.length;
  const threatened = PENGUINS.filter((p) => p.severity >= 2).length;   // VU / EN / CR
  const statDefault = `${total} species · ${markers.length} colonies`;
  const statLine = $("#statLine");
  if (statLine) statLine.textContent = statDefault;

  $("#surpriseBtn").addEventListener("click", () => {
    let pick;
    do { pick = PENGUINS[Math.floor(Math.random() * total)]; }
    while (pick.id === activeId && total > 1);
    openCard(pick.id);
  });

  let threatOn = false;
  $("#threatBtn").addEventListener("click", () => {
    threatOn = !threatOn;
    globe.setFilter(threatOn);
    const btn = $("#threatBtn");
    btn.classList.toggle("active", threatOn);
    btn.setAttribute("aria-pressed", String(threatOn));
    if (statLine) {
      statLine.textContent = threatOn
        ? `${threatened} of ${total} species threatened with extinction`
        : statDefault;
      statLine.classList.toggle("alarm", threatOn);
    }
  });

  /* ---- penguin of the day (deterministic by date) --------------- */
  const potdEl = $("#potd");
  if (potdEl) {
    potdEl.innerHTML = `<span class="star">★</span> Penguin of the day — <b>${potd.name}</b>`;
    potdEl.addEventListener("click", () => openCard(potd.id));
  }

  /* ---- globe rotation: pause / resume --------------------------- */
  let spinning = true;
  const spinBtn = $("#spinBtn");
  spinBtn.addEventListener("click", () => {
    spinning = !spinning;
    globe.setSpin(spinning ? 1 : 0);
    spinBtn.innerHTML = spinning ? "<i>❚❚</i>" : "<i>▶</i>";
    spinBtn.setAttribute("aria-label", spinning ? "Pause globe rotation" : "Resume globe rotation");
    spinBtn.classList.toggle("active", !spinning);
  });

  /* ---- open from a shared #species link, and on back/forward ----- */
  window.addEventListener("hashchange", () => {
    const id = location.hash.slice(1);
    if (byId[id]) openCard(id); else closeCard();
  });
  const initial = location.hash.slice(1);
  if (byId[initial]) openCard(initial);

  /* ---- boot line fades after the globe settles ------------------- */
  const boot = $("#boot");
  setTimeout(() => { boot.textContent = `${globe.dotCount().toLocaleString()} land points · ${markers.length} colonies · 1 planet`; }, 60);
  setTimeout(() => { boot.style.opacity = "0"; }, 4200);
  $("#globe").addEventListener("pointerdown", () => { boot.style.opacity = "0"; }, { once: true });
})();
