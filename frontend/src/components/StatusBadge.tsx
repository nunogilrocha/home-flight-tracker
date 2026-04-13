interface StatusBadgeProps {
  status: string | null;
  isLive: boolean;
  isArrival: boolean;
  isCurrent: boolean;
}

export default function StatusBadge({ status, isLive, isArrival, isCurrent }: StatusBadgeProps) {
  const label = status ?? '\u2014';
  const lower = (status ?? '').toLowerCase();

  let bgClass: string;
  let textClass: string;
  let dotClass: string;
  let dotAnim = '';

  if (isLive) {
    // Active — use departure amber override for current departure slot
    if (!isArrival && isCurrent) {
      bgClass = 'bg-amber-dim';
      textClass = 'text-amber';
      dotClass = 'bg-amber';
    } else {
      bgClass = 'bg-cyan-dim';
      textClass = 'text-cyan';
      dotClass = 'bg-cyan';
    }
    dotAnim = 'animate-pulse-dot';
  } else if (lower.includes('final') || lower.includes('taking')) {
    bgClass = 'bg-cyan-dim';
    textClass = 'text-cyan';
    dotClass = 'bg-cyan';
    dotAnim = 'animate-pulse-dot';
  } else if (isArrival) {
    bgClass = 'bg-green-dim';
    textClass = 'text-green';
    dotClass = 'bg-green';
  } else {
    bgClass = 'bg-amber-dim';
    textClass = 'text-amber';
    dotClass = 'bg-amber';
  }

  return (
    <div className={`inline-flex items-center gap-[5px] text-[10px] font-medium tracking-wide px-2 py-[3px] rounded-full whitespace-nowrap w-fit ${bgClass} ${textClass}`}>
      <span className={`w-[5px] h-[5px] rounded-full shrink-0 ${dotClass} ${dotAnim}`} />
      {label}
    </div>
  );
}
