import type { Flight } from '../types';
import { buildBoard } from '../utils';
import FlightRow from './FlightRow';

interface FlightPanelProps {
  type: 'arrival' | 'departure';
  flights: Flight[];
  status: 'connecting' | 'live' | 'error';
}

const SLOT_CLASSES = ['past', 'past', 'current', 'upcoming', 'upcoming'] as const;

export default function FlightPanel({ type, flights, status }: FlightPanelProps) {
  const isArrival = type === 'arrival';
  const board = buildBoard(flights);
  const allEmpty = board.every(s => s === null);

  const accentColor = isArrival ? 'cyan' : 'amber';
  const panelGlow = isArrival ? 'panel-glow-cyan' : 'panel-glow-amber';

  return (
    <section className={`flex flex-col bg-surface border border-border rounded-panel overflow-hidden relative ${panelGlow}`}>
      {/* Panel header */}
      <div className="flex items-center justify-between px-[18px] pt-3.5 pb-3 border-b border-border shrink-0">
        <div className={`flex items-center gap-2 text-[13px] font-semibold tracking-widest uppercase text-${accentColor}`}>
          {isArrival ? (
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 19V5M5 12l7 7 7-7" />
            </svg>
          ) : (
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M5 12l7-7 7 7" />
            </svg>
          )}
          {isArrival ? 'Arrivals' : 'Departures'}
        </div>
        <div className="font-mono text-[11px] text-text-muted bg-surface-2 border border-border rounded-full px-2 py-0.5">
          {flights.length}
        </div>
      </div>

      {/* Table header */}
      <div className="flight-grid px-[18px] py-[7px] text-[10px] font-semibold tracking-widest uppercase text-text-muted border-b border-border shrink-0">
        <span>Flight</span>
        <span>{isArrival ? 'From' : 'To'}</span>
        <span></span>
        <span>Details</span>
        <span>Status</span>
      </div>

      {/* Flight list */}
      <div className="overflow-y-auto flex-1 flight-scroll">
        {status === 'connecting' ? (
          <div className="flex flex-col items-center justify-center gap-2.5 p-10 text-text-muted text-[13px] h-full min-h-[120px]">
            <div className="w-6 h-6 border-2 border-border border-t-cyan rounded-full animate-spin" />
            <span>Loading {isArrival ? 'arrivals' : 'departures'}&hellip;</span>
          </div>
        ) : status === 'error' && allEmpty ? (
          <div className="flex flex-col items-center justify-center gap-2.5 p-10 text-red text-[13px] h-full min-h-[120px]">
            <span>Could not reach server</span>
          </div>
        ) : allEmpty ? (
          <div className="flex flex-col items-center justify-center gap-2.5 p-10 text-text-muted text-[13px] h-full min-h-[120px]">
            <span>No aircraft tracked nearby</span>
          </div>
        ) : (
          board.map((flight, i) => (
            <FlightRow
              key={flight?.hex ?? `empty-${i}`}
              flight={flight}
              type={type}
              slot={SLOT_CLASSES[i]}
            />
          ))
        )}
      </div>
    </section>
  );
}
