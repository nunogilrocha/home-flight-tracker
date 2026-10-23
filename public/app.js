const REFRESH_MS = 10_000;

// ICAO aircraft type → friendly name
const AIRCRAFT_TYPES = {
  A19N: "A319neo", A20N: "A320neo", A21N: "A321neo",
  A318: "A318",    A319: "A319",    A320: "A320",    A321: "A321",
  A332: "A330-200",A333: "A330-300",A338: "A330-800",A339: "A330-900",
  A342: "A340-200",A343: "A340-300",A345: "A340-500",A346: "A340-600",
  A359: "A350-900",A35K: "A350-1000",
  A388: "A380",    A124: "An-124",
  B735: "737-500", B736: "737-600", B737: "737-700", B738: "737-800",
  B739: "737-900", B38M: "737 MAX 8", B39M: "737 MAX 9",
  B744: "747-400", B748: "747-8",
  B752: "757-200", B753: "757-300",
  B762: "767-200", B763: "767-300", B764: "767-400",
  B772: "777-200", B773: "777-300", B77L: "777-200LR", B77W: "777-300ER",
  B788: "787-8",   B789: "787-9",   B78X: "787-10",
  E170: "E170",    E175: "E175",    E190: "E190",    E195: "E195",
  E290: "E190-E2", E295: "E195-E2",
  AT72: "ATR 72",  AT75: "ATR 72-500", AT76: "ATR 72-600",
  DH8D: "Dash 8 Q400",
  CRJ2: "CRJ-200", CRJ7: "CRJ-700", CRJ9: "CRJ-900",
  C56X: "Citation Excel", C68A: "Citation Latitude",
  PC12: "Pilatus PC-12",  DH8A: "Dash 8 Q100",
};

// ── Helpers ───────────────────────────────────────────────────────

function getAirlineName(callsign) {
  if (!callsign) return null;
  const cs = callsign.trim().toUpperCase();
  for (let len = 4; len >= 2; len--) {
    const prefix = cs.slice(0, len);
    if (AIRLINES[prefix]) return AIRLINES[prefix];
  }
  return null;
}

// No known airline: an airline-style callsign (3 letters + digit) shows its code,
// anything else (usually the registration, e.g. "OKVPG") is a private flight
function fallbackOperator(callsign) {
  const cs = callsign?.trim().toUpperCase() ?? "";
  return /^[A-Z]{3}\d/.test(cs) ? cs.slice(0, 3) : "Private";
}

function formatCallsign(callsign) {
  if (!callsign) return "—";
  return callsign.trim().replace(/^([A-Z]{2,4})(\d.*)$/, "$1 $2");
}

function timeAgo(unixSeconds) {
  const diff = Math.floor(Date.now() / 1000) - unixSeconds;
  if (diff < 10)   return "just now";
  if (diff < 60)   return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  return m > 0 ? `${h}h ${m}m ago` : `${h}h ago`;
}

function headingArrow(deg) {
  if (deg == null) return "";
  return `<span class="heading-arrow" style="display:inline-block;transform:rotate(${deg}deg)">↑</span>`;
}

// ── Board logic ───────────────────────────────────────────────────
// Returns exactly 5 slots: [past, past, CURRENT, upcoming, upcoming]
// Nulls = empty slot

function buildBoard(flights, type) {
  const airborne = flights.filter(f => f.isLive && !f.onGround);
  const ground   = flights.filter(f => f.isLive && f.onGround);
  // Out of sight — but a plane last seen on the ground (e.g. transponder off at the gate) hasn't departed
  const gone     = flights.filter(f => !f.isLive && !f.onGround);

  // Lowest first: arrivals in landing order, departures in reverse takeoff order
  airborne.sort((a, b) => (a.altitude ?? 99999) - (b.altitude ?? 99999));
  gone.sort((a, b) => a.seenAt - b.seenAt);

  // Every flight in time order, oldest first; `now` is the index of the NOW slot
  let sequence, now;
  if (type === "arrival") {
    sequence = [...gone, ...airborne];
    now      = gone.length;
  } else {
    // Higher departures took off earlier; planes on the ground are next — at the runway, then taxiing, then at the gate
    ground.sort((a, b) => a.groundQueue - b.groundQueue);
    sequence = [...gone, ...airborne.reverse(), ...ground];
    now      = gone.length + Math.max(airborne.length - 1, 0);
  }

  return [-2, -1, 0, 1, 2].map(offset => sequence[now + offset] ?? null);
}

// ── Render ────────────────────────────────────────────────────────

function createEmptyRow(slotClass, note = null) {
  const row = document.createElement("div");
  row.className = `flight-row ${slotClass} slot-empty`;
  row.innerHTML = note
    ? `<div class="slot-empty-note">${note}</div>`
    : `<div class="slot-empty-dash">—</div><div></div><div></div><div></div>`;
  return row;
}

function createFlightRow(flight, type, slotClass) {
  const isArrival   = type === "arrival";
  // Curated short names first (e.g. "easyJet"), then whatever adsbdb knows
  const airlineName = getAirlineName(flight.callsign) ?? flight.airline;
  const acType      = flight.aircraftType
    ? (AIRCRAFT_TYPES[flight.aircraftType.toUpperCase()] ?? flight.aircraftType)
    : null;

  // Status badge — live flights show their in-flight status; once out of sight they've landed / departed
  let statusClass, statusText;
  if (flight.isLive) {
    statusClass = "status-approaching";
    statusText  = flight.status ?? "—";
  } else {
    statusClass = isArrival ? "status-landed" : "status-departed";
    statusText  = isArrival ? "Landed" : "Departed";
  }

  // City column (ICAO code goes in the subline next to the country)
  const routeIcao   = isArrival ? flight.origin : flight.destination;
  const airportInfo = routeIcao ? (AIRPORTS[routeIcao] ?? null) : null;

  let cityHtml;
  if (routeIcao) {
    const city    = airportInfo?.city ?? routeIcao;
    const flag    = airportInfo?.flag ?? "";
    const subline = airportInfo ? `${airportInfo.country} · ${routeIcao}` : "";
    cityHtml = `
      <div class="city-name">
        ${flag ? `<span class="city-flag">${flag}</span>` : ""}
        <span class="city-text">${city}</span>
      </div>
      <div class="city-country">${subline}</div>`;
  } else {
    // Heading fallback while route resolves
    const card = flight.headingCardinal ?? "—";
    const deg  = flight.heading;
    cityHtml = `<div class="city-name city-name--dim">${headingArrow(deg)}<span class="city-text">${card}${deg != null ? ` · ${deg}°` : ""}</span></div>
                <div class="city-country">Route unknown</div>`;
  }

  const row = document.createElement("div");
  row.className = `flight-row ${slotClass}`;

  row.innerHTML = `
    <div>
      <div class="flight-airline">${airlineName ?? fallbackOperator(flight.callsign)}</div>
      <div class="flight-callsign">${flight.callsign ? formatCallsign(flight.callsign) : "—"}</div>
    </div>
    <div class="col-city">${cityHtml}</div>
    <div>
      <div class="aircraft-model">${acType ?? "—"}</div>
      <div class="aircraft-reg">${flight.registration ?? ""}</div>
    </div>
    <div>
      <div class="flight-status ${statusClass}">
        <span class="status-dot-sm"></span>
        ${statusText}
      </div>
      ${flight.isLive ? "" : `<div class="flight-time-ago">${timeAgo(flight.seenAt)}</div>`}
    </div>
  `;

  return row;
}

function renderList(listEl, countEl, flights, type) {
  const slotClasses = ["slot-past", "slot-past", "slot-current", "slot-upcoming", "slot-upcoming"];
  const board   = buildBoard(flights, type);
  const isEmpty = board.every(s => s === null);

  // Always render all 5 slots so the board keeps its shape; when empty, the note goes in the NOW slot.
  // Rows are patched in place so refreshes don't flicker — only a different flight taking a slot fades in.
  board.forEach((flight, i) => {
    const cls  = slotClasses[i];
    const note = isEmpty && i === 2 ? "No aircraft tracked nearby" : null;
    const row  = flight ? createFlightRow(flight, type, cls) : createEmptyRow(cls, note);
    row.dataset.key = flight?.hex ?? "empty";

    const old = listEl.children[i];
    if (old?.dataset.key === row.dataset.key) {
      if (old.className !== row.className) old.className = row.className;
      if (old.innerHTML !== row.innerHTML) old.innerHTML = row.innerHTML;
      return;
    }
    if (flight) row.classList.add("is-new");
    if (old) old.replaceWith(row);
    else     listEl.appendChild(row);
  });

  // Drop anything beyond the 5 slots (e.g. the initial loading state)
  while (listEl.children.length > board.length) listEl.lastElementChild.remove();
  countEl.textContent = `${flights.length}`;
}

// ── Clock ─────────────────────────────────────────────────────────

function updateClock() {
  const now = new Date();
  document.getElementById("clock").textContent =
    now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  document.getElementById("date").textContent =
    now.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" }).toUpperCase();
}

// ── Fetch & Render ────────────────────────────────────────────────

let lastFetchOk = false;

async function fetchAndRender() {
  const arrivalsList    = document.getElementById("arrivals-list");
  const departuresList  = document.getElementById("departures-list");
  const arrivalsCount   = document.getElementById("arrivals-count");
  const departuresCount = document.getElementById("departures-count");
  const statusDot       = document.getElementById("status-dot");
  const statusText      = document.getElementById("status-text");
  const lastUpdatedEl   = document.getElementById("last-updated");

  try {
    const res = await fetch("/api/flights");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { arrivals, departures, meta } = await res.json();

    renderList(arrivalsList,   arrivalsCount,   arrivals,   "arrival");
    renderList(departuresList, departuresCount, departures, "departure");

    const now = new Date();
    lastUpdatedEl.textContent = `${meta?.aircraft ?? "?"} tracked · ${now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`;
    statusDot.className    = "status-dot live";
    statusText.textContent = "Live";
    lastFetchOk = true;
  } catch (err) {
    console.error("Fetch failed:", err);
    statusDot.className    = "status-dot error";
    statusText.textContent = "Error";
    lastUpdatedEl.textContent = "Failed to load";
    if (!lastFetchOk) {
      const msg = `<div class="error-state"><span>Could not reach server</span></div>`;
      arrivalsList.innerHTML   = msg;
      departuresList.innerHTML = msg;
    }
  }
}

// ── Theme toggle ──────────────────────────────────────────────────

const MOON_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
const SUN_SVG  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;

function applyTheme(light) {
  document.documentElement.dataset.theme = light ? "light" : "";
  document.getElementById("theme-toggle").innerHTML = light ? MOON_SVG : SUN_SVG;
}

const savedTheme = localStorage.getItem("theme");
applyTheme(savedTheme === "light");

document.getElementById("theme-toggle").addEventListener("click", () => {
  const isLight = document.documentElement.dataset.theme === "light";
  localStorage.setItem("theme", isLight ? "dark" : "light");
  applyTheme(!isLight);
});

// ── Init ──────────────────────────────────────────────────────────

updateClock();
setInterval(updateClock, 1000);
fetchAndRender();
setInterval(fetchAndRender, REFRESH_MS);
