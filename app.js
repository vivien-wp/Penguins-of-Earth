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
  });

  // theme is applied after globe exists so setTheme() can run
  applyTheme(localStorage.getItem("globe-theme") || "dark");

  /* ---- species quick-nav ---------------------------------------- */
  const nav = $("#speciesNav");
  PENGUINS.forEach((sp) => {
    const b = document.createElement("button");
    b.textContent = sp.name;
    b.setAttribute("aria-label", `Show ${sp.name} penguin and locate it on the globe`);
    b.dataset.id = sp.id;
    b.addEventListener("click", () => openCard(sp.id));
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
      <button class="card-close" aria-label="Close">&times;</button>
      <div class="card-figure">
        <span class="sev">${sp.statusCode} <span class="sev-bar">${sevDots}</span></span>
        <img src="${sp.photo}" alt="${sp.name} penguin (${sp.binomial})" loading="lazy"
             onerror="this.style.opacity=0.15;this.alt='photo unavailable';">
        <span class="figcredit">photo · Wikimedia Commons</span>
      </div>
      <div class="card-body">
        <div class="index-no">SPECIES ${idx} / ${PENGUINS.length.toString().padStart(2, "0")}</div>
        <h2>${sp.name}</h2>
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
    card.scrollTop = 0;

    // highlight nav
    nav.querySelectorAll("button").forEach((b) =>
      b.classList.toggle("active", b.dataset.id === id));

    $(".card-close", card).addEventListener("click", closeCard);
    $(".locate", card).addEventListener("click", () => {
      const c = colony && colony.id === id ? colony : sp.colonies[0];
      globe.flyTo(c.lat, c.lon);
    });

    // auto-fly to the colony that was clicked (or the first one)
    const c = colony || sp.colonies[0];
    globe.flyTo(c.lat, c.lon);
  }

  function closeCard() {
    card.classList.remove("open");
    activeId = null;
    history.replaceState(null, "", location.pathname + location.search);
    nav.querySelectorAll("button").forEach((b) => b.classList.remove("active"));
  }

  function petLabel(n) {
    return ["legally a no", "absolutely not", "still no", "tempting but no", "the closest you'll get", "—"][n] || "—";
  }

  // close on Escape
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeCard(); });

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
