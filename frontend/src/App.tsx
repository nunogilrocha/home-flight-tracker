import { useState, useEffect, useCallback } from 'react';
import { fetchFlights } from './api';
import type { Flight, FlightsMeta } from './types';
import Header from './components/Header';
import FlightPanel from './components/FlightPanel';

const REFRESH_MS = 30_000;

export default function App() {
  const [arrivals, setArrivals] = useState<Flight[]>([]);
  const [departures, setDepartures] = useState<Flight[]>([]);
  const [meta, setMeta] = useState<FlightsMeta | null>(null);
  const [status, setStatus] = useState<'connecting' | 'live' | 'error'>('connecting');
  const [lastFetchOk, setLastFetchOk] = useState(false);

  const poll = useCallback(async () => {
    try {
      const data = await fetchFlights();
      setArrivals(data.arrivals);
      setDepartures(data.departures);
      setMeta(data.meta);
      setStatus('live');
      setLastFetchOk(true);
    } catch {
      setStatus('error');
      if (!lastFetchOk) {
        setArrivals([]);
        setDepartures([]);
      }
    }
  }, [lastFetchOk]);

  useEffect(() => {
    poll();
    const id = setInterval(poll, REFRESH_MS);
    return () => clearInterval(id);
  }, [poll]);

  return (
    <div className="grid grid-rows-[72px_1fr] h-screen p-3 gap-3 max-[860px]:grid-rows-[60px_1fr] max-[860px]:p-2 max-[860px]:gap-2">
      <Header status={status} meta={meta} />
      <main className="grid grid-cols-2 gap-3 min-h-0 max-[680px]:grid-cols-1 max-[680px]:grid-rows-[1fr_1fr] max-[860px]:gap-2">
        <FlightPanel
          type="arrival"
          flights={arrivals}
          status={status}
        />
        <FlightPanel
          type="departure"
          flights={departures}
          status={status}
        />
      </main>
    </div>
  );
}
