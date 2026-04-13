import type { FlightsResponse } from './types';

export async function fetchFlights(): Promise<FlightsResponse> {
  const res = await fetch('/api/flights');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
