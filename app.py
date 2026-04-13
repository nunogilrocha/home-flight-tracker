"""Home Flight Tracker — Lisbon Airport (LPPT / LIS)

Real-time arrivals & departures dashboard powered by ADS-B data.
"""

from __future__ import annotations

import asyncio
import math
import os
import time
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

load_dotenv()

# ── Config ────────────────────────────────────────────────────────

LPPT = {"lat": 38.7756, "lon": -9.1354}
RADIUS_NM = 60
POLL_S = 30
SEEN_TTL_S = 20 * 60  # 20 min

OPENSKY_CLIENT_ID = os.getenv("OPENSKY_CLIENT_ID")
OPENSKY_CLIENT_SECRET = os.getenv("OPENSKY_CLIENT_SECRET")
OPENSKY_TOKEN_URL = (
    "https://auth.opensky-network.org/auth/realms/opensky-network"
    "/protocol/openid-connect/token"
)

FRONTEND_DIST = Path(__file__).parent / "frontend" / "dist"

# ── OAuth2 token management ───────────────────────────────────────

_oauth_token: str | None = None
_token_expires_at: float = 0
_token_lock = asyncio.Lock()


async def get_token(client: httpx.AsyncClient) -> str | None:
    global _oauth_token, _token_expires_at

    if not OPENSKY_CLIENT_ID or not OPENSKY_CLIENT_SECRET:
        return None
    if _oauth_token and time.time() < _token_expires_at - 60:
        return _oauth_token

    async with _token_lock:
        # Re-check after acquiring lock
        if _oauth_token and time.time() < _token_expires_at - 60:
            return _oauth_token
        try:
            res = await client.post(
                OPENSKY_TOKEN_URL,
                data={
                    "grant_type": "client_credentials",
                    "client_id": OPENSKY_CLIENT_ID,
                    "client_secret": OPENSKY_CLIENT_SECRET,
                },
                headers={"User-Agent": "home-flight-tracker/1.0"},
                timeout=10,
            )
            res.raise_for_status()
            data = res.json()
            _oauth_token = data["access_token"]
            _token_expires_at = time.time() + data["expires_in"]
            print(f"[auth] Token refreshed — expires in {data['expires_in']}s")
            return _oauth_token
        except Exception as e:
            print(f"[auth] Token fetch failed: {e}")
            return None


# ── Route caches ──────────────────────────────────────────────────

route_cache: dict[str, dict | None] = {}  # hex → {origin, destination, _cached_at}
ROUTE_TTL_S = 24 * 3600

callsign_cache: dict[str, dict | None] = {}  # callsign → {origin, destination, _cached_at}
CALLSIGN_TTL_S = 7 * 24 * 3600  # 7 days


async def lookup_route_by_callsign(
    client: httpx.AsyncClient, callsign: str
) -> dict | None:
    if not callsign:
        return None
    key = callsign.strip().upper()

    cached = callsign_cache.get(key)
    if cached is not None:
        if time.time() - cached["_cached_at"] < CALLSIGN_TTL_S:
            return cached
    elif key in callsign_cache:
        return None  # explicitly cached as None

    url = f"https://api.adsbdb.com/v0/callsign/{key}"
    try:
        res = await client.get(
            url, headers={"User-Agent": "home-flight-tracker/1.0"}, timeout=6
        )
        if res.status_code == 404:
            callsign_cache[key] = None
            return None
        res.raise_for_status()
        data = res.json()
        fr = data.get("response", {}).get("flightroute")
        if not fr:
            callsign_cache[key] = None
            return None

        dep = (fr.get("origin") or {}).get("icao_code")
        arr = (fr.get("destination") or {}).get("icao_code")
        if dep or arr:
            route = {"origin": dep, "destination": arr, "_cached_at": time.time()}
            callsign_cache[key] = route
            print(f"[callsign] {key}: {dep or '?'} -> {arr or '?'}")
            return route
        callsign_cache[key] = None
        return None
    except Exception as e:
        print(f"[callsign] lookup failed for {key}: {e}")
        return None


async def lookup_route(client: httpx.AsyncClient, hex_id: str) -> dict | None:
    if not hex_id:
        return None
    key = hex_id.lower()

    cached = route_cache.get(key)
    if cached is not None:
        if time.time() - cached["_cached_at"] < ROUTE_TTL_S:
            return cached
    elif key in route_cache:
        return None

    token = await get_token(client)
    if not token:
        return None

    now = int(time.time())
    begin = now - 14 * 3600
    url = (
        f"https://opensky-network.org/api/flights/aircraft"
        f"?icao24={key}&begin={begin}&end={now}"
    )
    try:
        res = await client.get(
            url,
            headers={
                "Authorization": f"Bearer {token}",
                "User-Agent": "home-flight-tracker/1.0",
            },
            timeout=8,
        )
        if res.status_code in (404, 204):
            route_cache[key] = None
            return None
        res.raise_for_status()
        flights = res.json()
        if not isinstance(flights, list) or len(flights) == 0:
            return None

        f = flights[-1]
        dep = f.get("estDepartureAirport")
        arr = f.get("estArrivalAirport")
        if dep or arr:
            route = {"origin": dep, "destination": arr, "_cached_at": time.time()}
            route_cache[key] = route
            cs = seen_aircraft.get(key, {}).get("_callsign", hex_id)
            print(f"[route] {cs}: {dep or '?'} -> {arr or '?'}")
            return route
        route_cache[key] = None
        return None
    except Exception as e:
        print(f"[route] lookup failed for {hex_id}: {e}")
        return None


# ── Aircraft classification ───────────────────────────────────────


def classify_aircraft(ac: dict) -> str | None:
    alt_baro = ac.get("alt_baro")
    alt = alt_baro if isinstance(alt_baro, (int, float)) else None
    rate = ac.get("baro_rate", 0) or 0
    gs = ac.get("gs", 0) or 0

    if alt_baro == "ground" or (alt is not None and alt < 100 and gs < 40):
        return "ground"
    if alt is None:
        return None

    low_alt = alt < 10_000
    if low_alt and rate < -150:
        return "arrival"
    if low_alt and rate > 150:
        return "departure"
    if alt < 3_000:
        return "arrival"
    return None


def get_status(type_: str, ac: dict) -> str:
    alt_baro = ac.get("alt_baro")
    alt = alt_baro if isinstance(alt_baro, (int, float)) else 0
    rate = ac.get("baro_rate", 0) or 0

    if type_ == "arrival":
        if alt < 1_500:
            return "Final Approach"
        if alt < 4_000:
            return "Approaching"
        return "Descending"
    if type_ == "departure":
        if alt < 2_000:
            return "Taking Off"
        if rate > 500:
            return "Climbing"
        return "Airborne"
    return "\u2014"


def heading_to_cardinal(deg: float | None) -> str | None:
    if deg is None:
        return None
    dirs = [
        "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
        "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
    ]
    return dirs[round(deg / 22.5) % 16]


# ── State ─────────────────────────────────────────────────────────

live_aircraft: list[dict] = []
last_poll_at: float | None = None
seen_aircraft: dict[str, dict] = {}  # hex → enriched object


# ── Poll adsb.lol ─────────────────────────────────────────────────


async def poll_aircraft(client: httpx.AsyncClient) -> None:
    global live_aircraft, last_poll_at

    url = (
        f"https://api.adsb.lol/v2/lat/{LPPT['lat']}"
        f"/lon/{LPPT['lon']}/dist/{RADIUS_NM}"
    )
    try:
        res = await client.get(
            url, headers={"User-Agent": "home-flight-tracker/1.0"}, timeout=10
        )
        res.raise_for_status()
        data = res.json()
        live_aircraft = data.get("ac", [])
        last_poll_at = time.time()

        now_s = int(time.time())
        for ac in live_aircraft:
            hex_id = ac.get("hex")
            if not hex_id:
                continue
            type_ = classify_aircraft(ac)
            if not type_ or type_ == "ground":
                continue

            seen_aircraft[hex_id] = {
                **ac,
                "_type": type_,
                "_status": get_status(type_, ac),
                "_callsign": (ac.get("flight") or "").strip() or None,
                "_seen_at": now_s,
            }

            # Non-blocking route lookups
            hex_lower = hex_id.lower()
            if hex_lower not in route_cache:
                asyncio.create_task(lookup_route(client, hex_id))
            cs = (ac.get("flight") or "").strip().upper()
            if cs and cs not in callsign_cache:
                asyncio.create_task(lookup_route_by_callsign(client, cs))

        # Expire old entries
        expired = [h for h, e in seen_aircraft.items() if now_s - e["_seen_at"] > SEEN_TTL_S]
        for h in expired:
            del seen_aircraft[h]

        arr_count = sum(1 for a in seen_aircraft.values() if a["_type"] == "arrival")
        dep_count = sum(1 for a in seen_aircraft.values() if a["_type"] == "departure")
        routes_resolved = sum(1 for r in route_cache.values() if r is not None)
        print(
            f"[poll] {len(live_aircraft)} nearby — "
            f"{arr_count} arriving, {dep_count} departing  "
            f"(routes: {routes_resolved}/{len(route_cache)})"
        )
    except Exception as e:
        print(f"[poll] failed: {e}")


async def poll_loop(client: httpx.AsyncClient) -> None:
    while True:
        await poll_aircraft(client)
        await asyncio.sleep(POLL_S)


# ── Build API response ────────────────────────────────────────────


def build_response() -> dict:
    all_ac = list(seen_aircraft.values())
    now_s = int(time.time())

    def to_entry(ac: dict) -> dict:
        hex_lower = ac["hex"].lower()
        hex_route = route_cache.get(hex_lower)
        cs_key = (ac.get("_callsign") or "").strip().upper()
        cs_route = callsign_cache.get(cs_key) if cs_key else None
        is_arrival = ac["_type"] == "arrival"

        def validate(route: dict | None) -> bool:
            if not route:
                return False
            if is_arrival:
                return route.get("destination") is None or route.get("destination") == "LPPT"
            return route.get("origin") is None or route.get("origin") == "LPPT"

        hex_ok = validate(hex_route)
        cs_ok = validate(cs_route)
        best = (hex_route if hex_ok else None) or (cs_route if cs_ok else None)

        origin = best.get("origin") if best else None
        dest = best.get("destination") if best else None

        track = ac.get("track")
        heading = round(track) if track is not None else None

        return {
            "hex": ac["hex"],
            "callsign": ac.get("_callsign"),
            "registration": ac.get("r"),
            "aircraftType": ac.get("t"),
            "origin": origin if is_arrival else None,
            "destination": dest if not is_arrival else None,
            "altitude": round(ac["alt_baro"]) if isinstance(ac.get("alt_baro"), (int, float)) else None,
            "speed": round(ac["gs"]) if ac.get("gs") else None,
            "heading": heading,
            "headingCardinal": heading_to_cardinal(heading),
            "verticalRate": round(ac["baro_rate"]) if ac.get("baro_rate") else None,
            "status": ac.get("_status"),
            "seenAt": ac.get("_seen_at"),
            "isLive": (now_s - ac.get("_seen_at", 0)) < 90,
            "hasRoute": bool(hex_route or cs_route),
        }

    arrivals = sorted(
        [a for a in all_ac if a["_type"] == "arrival"],
        key=lambda a: a["_seen_at"],
        reverse=True,
    )
    departures = sorted(
        [a for a in all_ac if a["_type"] == "departure"],
        key=lambda a: a["_seen_at"],
        reverse=True,
    )

    return {
        "arrivals": [to_entry(a) for a in arrivals],
        "departures": [to_entry(a) for a in departures],
        "meta": {
            "lastPollAt": last_poll_at,
            "aircraft": len(live_aircraft),
            "radiusNm": RADIUS_NM,
            "routesEnabled": OPENSKY_CLIENT_ID is not None,
            "routesCached": len(route_cache),
        },
    }


# ── FastAPI app ───────────────────────────────────────────────────


@asynccontextmanager
async def lifespan(app: FastAPI):
    client = httpx.AsyncClient()
    if OPENSKY_CLIENT_ID:
        await get_token(client)
        print(f"   Routes  : OpenSky OAuth2 ({OPENSKY_CLIENT_ID})")
    else:
        print("   Routes  : disabled — add OPENSKY_CLIENT_ID/OPENSKY_CLIENT_SECRET to .env")

    task = asyncio.create_task(poll_loop(client))
    print(f"   Airport : Lisbon Humberto Delgado (LPPT / LIS)")
    print(f"   Radius  : {RADIUS_NM} nm  |  Poll : every {POLL_S}s  |  Board TTL : {SEEN_TTL_S // 60} min")

    yield

    task.cancel()
    await client.aclose()


app = FastAPI(title="Home Flight Tracker", lifespan=lifespan)


@app.get("/api/flights")
async def get_flights():
    return JSONResponse(build_response())


# Serve SPA from frontend/dist/ in production.
# html=True makes StaticFiles serve index.html for directory paths (SPA fallback).
if FRONTEND_DIST.is_dir():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIST), html=True), name="static")
