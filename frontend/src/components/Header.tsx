import { useState, useEffect } from 'react';
import type { FlightsMeta } from '../types';
import ThemeToggle from './ThemeToggle';

interface HeaderProps {
  status: 'connecting' | 'live' | 'error';
  meta: FlightsMeta | null;
}

function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export default function Header({ status, meta }: HeaderProps) {
  const now = useClock();

  const time = now.toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
  const date = now.toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  }).toUpperCase();

  const lastUpdated = meta
    ? `${meta.aircraft ?? '?'} tracked \u{b7} ${now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
    : '\u2014';

  return (
    <header className="header-glow grid grid-cols-[1fr_auto_1fr] items-center bg-surface border border-border rounded-panel px-5 relative overflow-hidden">
      {/* Left — airport info */}
      <div className="flex items-center gap-3.5">
        <div className="font-mono text-[28px] font-medium tracking-wide leading-none max-[1024px]:text-[22px]">
          LIS
        </div>
        <div>
          <div className="text-[13px] font-medium text-text-dim">Lisbon Humberto Delgado</div>
          <div className="text-[11px] text-text-muted tracking-wide mt-0.5">LPPT &nbsp;&middot;&nbsp; Portugal</div>
        </div>
      </div>

      {/* Center — clock */}
      <div className="text-center">
        <div className="font-mono text-[26px] font-normal tracking-wide leading-none max-[1024px]:text-[20px]">
          {time}
        </div>
        <div className="text-[11px] text-text-muted tracking-widest uppercase mt-1">
          {date}
        </div>
      </div>

      {/* Right — status + theme */}
      <div className="flex flex-col items-end gap-1">
        <div className="flex items-center gap-2.5">
          <StatusIndicator status={status} />
          <ThemeToggle />
        </div>
        <div className="text-[10px] text-text-muted">{lastUpdated}</div>
      </div>
    </header>
  );
}

function StatusIndicator({ status }: { status: 'connecting' | 'live' | 'error' }) {
  const dotClass =
    status === 'live' ? 'bg-green shadow-[0_0_6px_var(--color-green)] animate-pulse-dot' :
    status === 'error' ? 'bg-red' :
    'bg-text-muted';

  const label =
    status === 'live' ? 'Live' :
    status === 'error' ? 'Error' :
    'Connecting\u2026';

  return (
    <div className="flex items-center gap-1.5">
      <span className={`w-[7px] h-[7px] rounded-full transition-colors duration-300 ${dotClass}`} />
      <span className="text-[11px] text-text-muted tracking-wide">{label}</span>
    </div>
  );
}
