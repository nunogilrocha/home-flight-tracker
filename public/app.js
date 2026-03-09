const REFRESH_MS = 30_000;

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

function formatCallsign(callsign) {
  if (!callsign) return "—";
  return callsign.trim().replace(/^([A-Z]{2,4})(\d.*)$/, "$1 $2");
}

function formatAltitude(ft) {
  if (ft === null || ft === undefined) return null;
  if (ft < 1000) return `${ft} ft`;
  return `${(ft / 1000).toFixed(1)}k ft`;
}

function formatSpeed(kts) {
  if (!kts) return null;
  return `${kts} kts`;
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

function buildBoard(flights) {
  const live = flights.filter(f => f.isLive);
  const past = flights.filter(f => !f.isLive);

  // Sort live by altitude ascending: lowest = most imminent (final approach / just took off)
  live.sort((a, b) => (a.altitude ?? 99999) - (b.altitude ?? 99999));

  // Sort past by seenAt descending: most recently seen first
  past.sort((a, b) => b.seenAt - a.seenAt);

  const current  = live[0]        ?? null;
  const upcoming = live.slice(1, 3);                  // next 2 by altitude
  const recent   = past.slice(0, 2).reverse();        // 2 most recent, oldest first

  return [
    recent[0]   ?? null,   // slot 1 — older past
    recent[1]   ?? null,   // slot 2 — more recent past
    current,               // slot 3 — NOW (highlighted)
    upcoming[0] ?? null,   // slot 4 — next in queue
    upcoming[1] ?? null,   // slot 5 — after that
  ];
}

// ── Render ────────────────────────────────────────────────────────

function createEmptyRow(slotClass) {
  const row = document.createElement("div");
  row.className = `flight-row ${slotClass} slot-empty`;
  row.innerHTML = `<div></div><div></div><div></div><div></div><div></div>`;
  return row;
}

function createFlightRow(flight, type, slotClass) {
  const isArrival   = type === "arrival";
  const airlineName = getAirlineName(flight.callsign);
  const acType      = flight.aircraftType
    ? (AIRCRAFT_TYPES[flight.aircraftType.toUpperCase()] ?? flight.aircraftType)
    : null;

  // Status badge
  const statusLower = (flight.status ?? "").toLowerCase();
  let statusClass = "status-airborne";
  if (statusLower.includes("final") || statusLower.includes("taking")) statusClass = "status-approaching";
  else if (isArrival) statusClass = "status-landed";
  else                statusClass = "status-departed";
  if (flight.isLive)  statusClass = "status-approaching";

  // Detail tags
  const detailParts = [];
  if (flight.altitude !== null) detailParts.push(formatAltitude(flight.altitude));
  if (flight.speed    !== null) detailParts.push(formatSpeed(flight.speed));
  if (acType)                   detailParts.push(acType);

  // ICAO column + City column
  const routeIcao   = isArrival ? flight.origin : flight.destination;
  const airportInfo = routeIcao ? (AIRPORTS[routeIcao] ?? null) : null;

  let icaoHtml, cityHtml;
  if (routeIcao) {
    icaoHtml = `<div class="route-icao">${routeIcao}</div>`;
    const city    = airportInfo?.city    ?? routeIcao;
    const flag    = airportInfo?.flag    ?? "";
    const country = airportInfo?.country ?? "";
    cityHtml = `
      <div class="city-name">
        ${flag ? `<span class="city-flag">${flag}</span>` : ""}
        <span class="city-text">${city}</span>
      </div>
      <div class="city-country">${country}</div>`;
  } else {
    // Heading fallback while route resolves
    const card = flight.headingCardinal ?? "—";
    const deg  = flight.heading;
    icaoHtml = `<div class="route-icao route-icao--dim">${headingArrow(deg)}</div>`;
    cityHtml = `<div class="city-name city-name--dim"><span class="city-text">${card}${deg != null ? ` · ${deg}°` : ""}</span></div>
                <div class="city-country">${airlineName ?? "—"}</div>`;
  }

  const row = document.createElement("div");
  row.className = `flight-row ${slotClass}`;

  row.innerHTML = `
    <div>
      <div class="flight-callsign">${flight.callsign ? formatCallsign(flight.callsign) : "—"}</div>
      <div class="flight-airline">${airlineName ?? (flight.registration ?? "—")}</div>
    </div>
    <div class="col-icao">${icaoHtml}</div>
    <div class="col-city">${cityHtml}</div>
    <div>
      <div class="flight-detail-row">
        ${detailParts.map(p => `<span class="flight-detail-tag">${p}</span>`).join("")}
      </div>
    </div>
    <div>
      <div class="flight-status ${statusClass}">
        <span class="status-dot-sm"></span>
        ${flight.status ?? "—"}
      </div>
      <div class="flight-time-ago">${timeAgo(flight.seenAt)}</div>
    </div>
  `;

  return row;
}

function renderList(listEl, countEl, flights, type) {
  listEl.innerHTML = "";

  const slotClasses = ["slot-past", "slot-past", "slot-current", "slot-upcoming", "slot-upcoming"];
  const board = buildBoard(flights);

  if (board.every(s => s === null)) {
    listEl.innerHTML = `<div class="empty-state"><span>No aircraft tracked nearby</span></div>`;
    countEl.textContent = "0";
    return;
  }

  const frag = document.createDocumentFragment();
  board.forEach((flight, i) => {
    const cls = slotClasses[i];
    frag.appendChild(flight ? createFlightRow(flight, type, cls) : createEmptyRow(cls));
  });
  listEl.appendChild(frag);
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

// ── Init ──────────────────────────────────────────────────────────

updateClock();
setInterval(updateClock, 1000);
fetchAndRender();
setInterval(fetchAndRender, REFRESH_MS);
