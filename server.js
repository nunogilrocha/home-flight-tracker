import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "public");

// ── Load .env ────────────────────────────────────────────────────
try {
  const env = fs.readFileSync(path.join(__dirname, ".env"), "utf8");
  for (const line of env.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!(key in process.env)) process.env[key] = val;
  }
} catch { /* no .env */ }

// ── Config ───────────────────────────────────────────────────────

const PORT       = 3000;
const LPPT       = { lat: 38.7756, lon: -9.1354 };
const RADIUS_NM  = 60;
const POLL_MS    = 30_000;
const SEEN_TTL_S = 20 * 60;

const OPENSKY_CLIENT_ID     = process.env.OPENSKY_CLIENT_ID     ?? null;
const OPENSKY_CLIENT_SECRET = process.env.OPENSKY_CLIENT_SECRET ?? null;
const OPENSKY_TOKEN_URL     = "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token";

// ── OAuth2 token management ───────────────────────────────────────

let oauthToken     = null;
let tokenExpiresAt = 0;
let tokenFetching  = null; // in-flight promise, prevents concurrent token requests

async function getToken() {
  if (!OPENSKY_CLIENT_ID || !OPENSKY_CLIENT_SECRET) return null;
  if (oauthToken && Date.now() < tokenExpiresAt - 60_000) return oauthToken;
  if (tokenFetching) return tokenFetching;

  tokenFetching = (async () => {
  try {
    const body = new URLSearchParams({
      grant_type:    "client_credentials",
      client_id:     OPENSKY_CLIENT_ID,
      client_secret: OPENSKY_CLIENT_SECRET,
    });
    const res = await fetch(OPENSKY_TOKEN_URL, {
      method:  "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "home-flight-tracker/1.0" },
      body:    body.toString(),
      signal:  AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Token HTTP ${res.status}`);
    const data = await res.json();
    oauthToken     = data.access_token;
    tokenExpiresAt = Date.now() + data.expires_in * 1000;
    console.log(`[auth] Token refreshed — expires in ${data.expires_in}s`);
    return oauthToken;
  } catch (err) {
    console.error("[auth] Token fetch failed:", err.message);
    return null;
  } finally {
    tokenFetching = null;
  }
  })();
  return tokenFetching;
}

// ── Route cache: hex → { origin, destination } | null ────────────

const routeCache   = new Map(); // hex → { origin, destination, _cachedAt } | null
const ROUTE_TTL_MS = 24 * 60 * 60 * 1000;

// ── Callsign route cache (adsbdb.com) ─────────────────────────────

const callsignCache    = new Map(); // callsign → { origin, destination, _cachedAt } | null
const CALLSIGN_TTL_MS  = 7 * 24 * 60 * 60 * 1000; // 7 days — scheduled routes are stable

async function lookupRouteByCallsign(callsign) {
  if (!callsign) return null;
  const key = callsign.trim().toUpperCase();

  const cached = callsignCache.get(key);
  if (cached !== undefined) {
    if (cached === null || Date.now() - cached._cachedAt < CALLSIGN_TTL_MS) return cached;
  }

  const url = `https://api.adsbdb.com/v0/callsign/${encodeURIComponent(key)}`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "home-flight-tracker/1.0" },
      signal:  AbortSignal.timeout(6_000),
    });

    if (res.status === 404) { callsignCache.set(key, null); return null; }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    const fr   = data?.response?.flightroute;
    if (!fr) { callsignCache.set(key, null); return null; }

    const dep   = fr.origin?.icao_code      ?? null;
    const arr   = fr.destination?.icao_code ?? null;
    const route = (dep || arr)
      ? { origin: dep, destination: arr, _cachedAt: Date.now() }
      : null;

    callsignCache.set(key, route);
    if (route) console.log(`[callsign] ${key}: ${dep ?? "?"} → ${arr ?? "?"}`);
    return route;
  } catch (err) {
    console.warn(`[callsign] lookup failed for ${key}:`, err.message);
    return null;
  }
}

async function lookupRoute(hex) {
  if (!hex) return null;
  const key = hex.toLowerCase();

  const cached = routeCache.get(key);
  if (cached !== undefined) {
    if (cached === null || Date.now() - cached._cachedAt < ROUTE_TTL_MS) return cached;
  }

  const token = await getToken();
  if (!token) return null;

  const now   = Math.floor(Date.now() / 1000);
  const begin = now - 14 * 3600; // look back 14h to catch overnight flights
  const url   = `https://opensky-network.org/api/flights/aircraft?icao24=${key}&begin=${begin}&end=${now}`;

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, "User-Agent": "home-flight-tracker/1.0" },
      signal:  AbortSignal.timeout(8_000),
    });

    if (res.status === 404 || res.status === 204) { routeCache.set(key, null); return null; }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const flights = await res.json();
    // Empty = flight not yet in OpenSky's DB — don't cache, retry next poll
    if (!Array.isArray(flights) || flights.length === 0) { return null; }

    // Most recent entry
    const f     = flights[flights.length - 1];
    const dep   = f.estDepartureAirport ?? null;
    const arr   = f.estArrivalAirport   ?? null;
    const route = (dep || arr)
      ? { origin: dep, destination: arr, _cachedAt: Date.now() }
      : null;

    routeCache.set(key, route);
    if (route) {
      const cs = seenAircraft.get(key)?._callsign ?? hex;
      console.log(`[route] ${cs}: ${dep ?? "?"} → ${arr ?? "?"}`);
    }
    return route;
  } catch (err) {
    // Network/timeout errors: don't cache — allow retry on next poll
    console.warn(`[route] lookup failed for ${hex}:`, err.message);
    return null;
  }
}

// ── Aircraft classification ───────────────────────────────────────

function classifyAircraft(ac) {
  const alt  = typeof ac.alt_baro === "number" ? ac.alt_baro : null;
  const rate = ac.baro_rate ?? 0;
  const gs   = ac.gs ?? 0;

  if (ac.alt_baro === "ground" || (alt !== null && alt < 100 && gs < 40)) return "ground";
  if (alt === null) return null;

  const lowAlt = alt < 10_000;
  if (lowAlt && rate < -150) return "arrival";
  if (lowAlt && rate >  150) return "departure";
  if (alt < 3_000)           return "arrival";
  return null;
}

function getStatus(type, ac) {
  const alt  = typeof ac.alt_baro === "number" ? ac.alt_baro : 0;
  const rate = ac.baro_rate ?? 0;

  if (type === "arrival") {
    if (alt < 1_500) return "Final Approach";
    if (alt < 4_000) return "Approaching";
    return "Descending";
  }
  if (type === "departure") {
    if (alt < 2_000) return "Taking Off";
    if (rate > 500)  return "Climbing";
    return "Airborne";
  }
  return "—";
}

function headingToCardinal(deg) {
  if (deg == null) return null;
  const dirs = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
  return dirs[Math.round(deg / 22.5) % 16];
}

// ── State ────────────────────────────────────────────────────────

let liveAircraft = [];
let lastPollAt   = null;
const seenAircraft = new Map(); // hex → enriched object

// ── Poll adsb.lol ─────────────────────────────────────────────────

async function pollAircraft() {
  const url = `https://api.adsb.lol/v2/lat/${LPPT.lat}/lon/${LPPT.lon}/dist/${RADIUS_NM}`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "home-flight-tracker/1.0" },
      signal:  AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    liveAircraft = data.ac ?? [];
    lastPollAt   = Date.now();

    const nowS = Math.floor(Date.now() / 1000);
    for (const ac of liveAircraft) {
      if (!ac.hex) continue;
      const type = classifyAircraft(ac);
      if (!type || type === "ground") continue;

      seenAircraft.set(ac.hex, {
        ...ac,
        _type:     type,
        _status:   getStatus(type, ac),
        _callsign: ac.flight?.trim() ?? null,
        _seenAt:   nowS,
      });

      // Kick off route lookups (non-blocking)
      if (!routeCache.has(ac.hex.toLowerCase())) {
        lookupRoute(ac.hex).catch(() => {});
      }
      const cs = ac.flight?.trim().toUpperCase();
      if (cs && !callsignCache.has(cs)) {
        lookupRouteByCallsign(cs).catch(() => {});
      }
    }

    // Expire old entries
    for (const [hex, entry] of seenAircraft) {
      if (nowS - entry._seenAt > SEEN_TTL_S) seenAircraft.delete(hex);
    }

    const arr = [...seenAircraft.values()];
    const routesResolved = [...routeCache.values()].filter(r => r !== null).length;
    console.log(
      `[${new Date().toISOString()}] ` +
      `${liveAircraft.length} nearby — ` +
      `${arr.filter(a => a._type === "arrival").length} arriving, ` +
      `${arr.filter(a => a._type === "departure").length} departing  ` +
      `(routes: ${routesResolved}/${routeCache.size})`
    );
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Poll failed:`, err.message);
  }
}

// ── Build API response ────────────────────────────────────────────

function buildResponse() {
  const all  = [...seenAircraft.values()];
  const nowS = Math.floor(Date.now() / 1000);

  const toEntry = (ac) => {
    const hexRoute  = routeCache.get(ac.hex.toLowerCase()) ?? null;
    const csRoute   = callsignCache.get(ac._callsign?.trim().toUpperCase()) ?? null;
    const isArrival = ac._type === "arrival";

    // Validate each source: arrivals must have destination LPPT, departures must have origin LPPT.
    // null counts as unknown (keep); a wrong airport code means discard that source.
    function validate(route) {
      if (!route) return false;
      if (isArrival)  return route.destination === null || route.destination === "LPPT";
      else            return route.origin      === null || route.origin      === "LPPT";
    }

    const hexOk = validate(hexRoute);
    const csOk  = validate(csRoute);

    // Pick the best source: prefer validated, fall back to OpenSky, then callsign
    const best = (hexOk ? hexRoute : null) ?? (csOk ? csRoute : null) ?? hexRoute ?? csRoute ?? null;

    const origin = best?.origin ?? null;
    const dest   = best?.destination ?? null;

    const heading = ac.track ? Math.round(ac.track) : null;
    return {
      hex:             ac.hex,
      callsign:        ac._callsign,
      registration:    ac.r  ?? null,
      aircraftType:    ac.t  ?? null,
      origin:          isArrival  ? origin : null,
      destination:     !isArrival ? dest   : null,
      altitude:        typeof ac.alt_baro === "number" ? Math.round(ac.alt_baro) : null,
      speed:           ac.gs        ? Math.round(ac.gs)        : null,
      heading,
      headingCardinal: headingToCardinal(heading),
      verticalRate:    ac.baro_rate  ? Math.round(ac.baro_rate) : null,
      status:          ac._status,
      seenAt:          ac._seenAt,
      isLive:          (nowS - ac._seenAt) < 90,
      hasRoute:        !!(hexRoute || csRoute),
    };
  };

  return {
    arrivals:   all.filter(a => a._type === "arrival")
                   .sort((a, b) => b._seenAt - a._seenAt)
                   .map(toEntry),
    departures: all.filter(a => a._type === "departure")
                   .sort((a, b) => b._seenAt - a._seenAt)
                   .map(toEntry),
    meta: {
      lastPollAt,
      aircraft:      liveAircraft.length,
      radiusNm:      RADIUS_NM,
      routesEnabled: OPENSKY_CLIENT_ID !== null,
      routesCached:  routeCache.size,
    },
  };
}

// ── Static file serving ───────────────────────────────────────────

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".js":   "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".ico":  "image/x-icon",
};

function serveStatic(res, urlPath) {
  const safe = urlPath === "/" ? "/index.html" : urlPath.replace(/\.\./g, "");
  const file = path.join(PUBLIC_DIR, safe);
  const ext  = path.extname(file);
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end("Not Found"); return; }
    res.writeHead(200, { "Content-Type": MIME[ext] ?? "application/octet-stream" });
    res.end(data);
  });
}

function jsonResponse(res, data) {
  const body = JSON.stringify(data);
  res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
  res.end(body);
}

// ── HTTP server ───────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, `http://localhost:${PORT}`);
  if (pathname === "/api/flights") return jsonResponse(res, buildResponse());
  serveStatic(res, pathname);
});

server.listen(PORT, async () => {
  console.log(`✈  Plane Tracker  →  http://localhost:${PORT}`);
  console.log(`   Airport : Lisbon Humberto Delgado (LPPT / LIS)`);
  console.log(`   Radius  : ${RADIUS_NM} nm  |  Poll : every ${POLL_MS / 1000}s  |  Board TTL : ${SEEN_TTL_S / 60} min`);
  if (OPENSKY_CLIENT_ID) {
    console.log(`   Routes  : OpenSky OAuth2 (${OPENSKY_CLIENT_ID})`);
    await getToken(); // warm up token on start
  } else {
    console.log(`   Routes  : disabled — add OPENSKY_CLIENT_ID/OPENSKY_CLIENT_SECRET to .env`);
  }
});

pollAircraft();
setInterval(pollAircraft, POLL_MS);
