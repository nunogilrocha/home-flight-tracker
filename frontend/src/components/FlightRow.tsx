import type { Flight } from '../types';
import { AIRPORTS } from '../data';
import {
  getAirlineName,
  formatCallsign,
  formatAltitude,
  formatSpeed,
  getAircraftTypeName,
  timeAgo,
} from '../utils';
import StatusBadge from './StatusBadge';

interface FlightRowProps {
  flight: Flight | null;
  type: 'arrival' | 'departure';
  slot: 'past' | 'current' | 'upcoming';
}

export default function FlightRow({ flight, type, slot }: FlightRowProps) {
  if (!flight) {
    return (
      <div className="flight-grid px-[18px] py-[9px] border-b border-border opacity-[0.12] pointer-events-none min-h-[36px]">
        <div /><div /><div /><div /><div />
      </div>
    );
  }

  const isArrival = type === 'arrival';
  const airlineName = getAirlineName(flight.callsign);
  const acType = getAircraftTypeName(flight.aircraftType);
  const routeIcao = isArrival ? flight.origin : flight.destination;
  const airportInfo = routeIcao ? AIRPORTS[routeIcao] ?? null : null;

  const detailParts: string[] = [];
  if (flight.altitude !== null) {
    const alt = formatAltitude(flight.altitude);
    if (alt) detailParts.push(alt);
  }
  if (flight.speed !== null) {
    const spd = formatSpeed(flight.speed);
    if (spd) detailParts.push(spd);
  }
  if (acType) detailParts.push(acType);

  // Slot-specific styles
  const slotRow =
    slot === 'past' ? 'opacity-40' :
    slot === 'upcoming' ? 'opacity-70' :
    '';

  const currentHighlight = slot === 'current'
    ? `min-h-[58px] border-t border-t-border-strong border-b-border-strong relative z-[1] ${
        isArrival
          ? 'bg-cyan-bg border-l-[3px] border-l-cyan pl-[15px]'
          : 'bg-amber-bg border-l-[3px] border-l-amber pl-[15px]'
      }`
    : '';

  const citySize =
    slot === 'past' ? 'text-sm' :
    slot === 'current' ? 'text-[22px] font-semibold' :
    'text-base';

  const callsignSize = slot === 'current' ? 'text-sm' : 'text-xs';
  const flagSize = slot === 'current' ? 'text-lg' : 'text-[13px]';
  const countrySize = slot === 'current' ? 'text-[11px]' : 'text-[10px]';
  const detailTagSize = slot === 'current' ? 'text-[11px] px-[7px] py-[2px]' : 'text-[10px] px-[5px] py-[1px]';

  return (
    <div
      className={`flight-grid px-[18px] py-[9px] border-b border-border transition-all duration-150 animate-fade-in min-h-[44px] last:border-b-0 hover:bg-surface-2 ${slotRow} ${currentHighlight}`}
    >
      {/* Callsign + airline */}
      <div>
        <div className={`font-mono ${callsignSize} font-medium text-text tracking-wide`}>
          {formatCallsign(flight.callsign)}
        </div>
        <div className="text-[10px] text-text-muted mt-0.5 whitespace-nowrap overflow-hidden text-ellipsis">
          {airlineName ?? flight.registration ?? '\u2014'}
        </div>
      </div>

      {/* ICAO code */}
      <div className="flex flex-col justify-center">
        {routeIcao ? (
          <div className="font-mono text-[11px] font-medium text-text-muted tracking-wider">
            {routeIcao}
          </div>
        ) : (
          <div className="text-text-muted opacity-70 text-sm leading-none">
            {flight.heading != null && (
              <span
                className="inline-block"
                style={{ transform: `rotate(${flight.heading}deg)` }}
              >
                &uarr;
              </span>
            )}
          </div>
        )}
      </div>

      {/* City */}
      <div className="flex flex-col justify-center overflow-hidden">
        {routeIcao ? (
          <>
            <div className="flex items-center gap-[7px] overflow-hidden">
              {airportInfo?.flag && (
                <span className={`${flagSize} shrink-0 leading-none`}>{airportInfo.flag}</span>
              )}
              <span className={`${citySize} font-semibold text-text tracking-tight whitespace-nowrap overflow-hidden text-ellipsis transition-[font-size] duration-200`}>
                {airportInfo?.city ?? routeIcao}
              </span>
            </div>
            {airportInfo?.country && (
              <div className={`${countrySize} text-text-muted mt-0.5 whitespace-nowrap overflow-hidden text-ellipsis`}>
                {airportInfo.country}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="flex items-center gap-[7px] overflow-hidden">
              <span className="text-sm font-medium text-text-dim whitespace-nowrap overflow-hidden text-ellipsis">
                {flight.headingCardinal ?? '\u2014'}
                {flight.heading != null && ` \u{b7} ${flight.heading}\u{b0}`}
              </span>
            </div>
            <div className="text-[10px] text-text-muted mt-0.5 whitespace-nowrap overflow-hidden text-ellipsis">
              {airlineName ?? '\u2014'}
            </div>
          </>
        )}
      </div>

      {/* Details */}
      <div>
        <div className="flex flex-wrap gap-[3px]">
          {detailParts.map((part, i) => (
            <span
              key={i}
              className={`font-mono ${detailTagSize} text-text-muted bg-surface-2 border border-border rounded whitespace-nowrap`}
            >
              {part}
            </span>
          ))}
        </div>
      </div>

      {/* Status */}
      <div>
        <StatusBadge
          status={flight.status}
          isLive={flight.isLive}
          isArrival={isArrival}
          isCurrent={slot === 'current'}
        />
        <div className="text-[9px] text-text-muted mt-[3px] whitespace-nowrap">
          {timeAgo(flight.seenAt)}
        </div>
      </div>
    </div>
  );
}
