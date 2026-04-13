import { AIRLINES, AIRCRAFT_TYPES } from './data';
import type { Flight } from './types';

export function getAirlineName(callsign: string | null): string | null {
  if (!callsign) return null;
  const cs = callsign.trim().toUpperCase();
  for (let len = 4; len >= 2; len--) {
    const prefix = cs.slice(0, len);
    if (AIRLINES[prefix]) return AIRLINES[prefix];
  }
  return null;
}

export function formatCallsign(callsign: string | null): string {
  if (!callsign) return "\u2014";
  return callsign.trim().replace(/^([A-Z]{2,4})(\d.*)$/, "$1 $2");
}

export function formatAltitude(ft: number | null): string | null {
  if (ft === null || ft === undefined) return null;
  if (ft < 1000) return `${ft} ft`;
  return `${(ft / 1000).toFixed(1)}k ft`;
}

export function formatSpeed(kts: number | null): string | null {
  if (!kts) return null;
  return `${kts} kts`;
}

export function getAircraftTypeName(code: string | null): string | null {
  if (!code) return null;
  return AIRCRAFT_TYPES[code.toUpperCase()] ?? code;
}

export function timeAgo(unixSeconds: number): string {
  const diff = Math.floor(Date.now() / 1000) - unixSeconds;
  if (diff < 10) return "just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  return m > 0 ? `${h}h ${m}m ago` : `${h}h ago`;
}

/** Returns exactly 5 slots: [past, past, CURRENT, upcoming, upcoming] */
export function buildBoard(flights: Flight[]): (Flight | null)[] {
  const live = flights.filter(f => f.isLive);
  const past = flights.filter(f => !f.isLive);

  live.sort((a, b) => (a.altitude ?? 99999) - (b.altitude ?? 99999));
  past.sort((a, b) => b.seenAt - a.seenAt);

  const current = live[0] ?? null;
  const upcoming = live.slice(1, 3);
  const recent = past.slice(0, 2).reverse();

  return [
    recent[0] ?? null,
    recent[1] ?? null,
    current,
    upcoming[0] ?? null,
    upcoming[1] ?? null,
  ];
}
