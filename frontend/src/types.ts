export interface Flight {
  hex: string;
  callsign: string | null;
  registration: string | null;
  aircraftType: string | null;
  origin: string | null;
  destination: string | null;
  altitude: number | null;
  speed: number | null;
  heading: number | null;
  headingCardinal: string | null;
  verticalRate: number | null;
  status: string | null;
  seenAt: number;
  isLive: boolean;
  hasRoute: boolean;
}

export interface FlightsMeta {
  lastPollAt: number | null;
  aircraft: number;
  radiusNm: number;
  routesEnabled: boolean;
  routesCached: number;
}

export interface FlightsResponse {
  arrivals: Flight[];
  departures: Flight[];
  meta: FlightsMeta;
}

export interface Airport {
  city: string;
  country: string;
  flag: string;
}
