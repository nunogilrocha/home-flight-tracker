# ✈ Home Flight Tracker

A real-time arrivals & departures dashboard for **Lisbon Humberto Delgado Airport (LPPT / LIS)**, designed to run locally on a tablet or browser when you can see the airport from your window.

![Dark FIDS-style dashboard showing arrivals and departures](https://raw.githubusercontent.com/nunogilrocha/home-flight-tracker/main/public/screenshot.png)

---

## Features

- **Live flight positions** — polls [adsb.lol](https://adsb.lol) every 30 seconds (free, no rate limits)
- **Route lookup** — origin/destination resolved via OpenSky Network and adsbdb
- **Smart route validation** — cross-references sources and discards routes that don't match Lisbon
- **5-slot departure board** — past · past · **NOW** · upcoming · upcoming
- **Airport & airline database** — flags, city names, and airline names for 150+ airports
- **No dependencies** — pure Node.js, no npm packages required

---

## Getting Started

### Requirements

- Node.js v18+

### Setup

```bash
git clone git@github.com:nunogilrocha/home-flight-tracker.git
cd home-flight-tracker
cp .env.example .env
```

Edit `.env` and add your [OpenSky Network](https://opensky-network.org) OAuth2 credentials (free account, no credit card):

```
OPENSKY_CLIENT_ID=your-client-id
OPENSKY_CLIENT_SECRET=your-client-secret
```

> Route lookup works without credentials but is disabled — the dashboard will still show live positions with heading/direction as fallback.

### Run

```bash
node server.js
```

Open **http://localhost:3000** in your browser.

To access from other devices on the same WiFi, use your local IP:

```
http://<your-local-ip>:3000
```

---

## Data Sources

| Data | Source | Auth |
|------|--------|------|
| Live positions | [adsb.lol](https://adsb.lol) | None |
| Route history | [OpenSky Network](https://opensky-network.org) | OAuth2 (free) |
| Scheduled routes | [adsbdb.com](https://www.adsbdb.com) | None |

---

## Configuration

All config is at the top of `server.js`:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP server port |
| `RADIUS_NM` | `60` | Tracking radius in nautical miles |
| `POLL_MS` | `30000` | ADS-B poll interval |
| `SEEN_TTL_S` | `1200` | How long to keep aircraft after last seen (20 min) |

---

## License

MIT
