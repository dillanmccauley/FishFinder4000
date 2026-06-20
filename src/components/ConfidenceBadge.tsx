interface Props {
  confidence: number; // 0–1
  hoursAhead: number;
}

export function ConfidenceBadge({ confidence, hoursAhead }: Props) {
  if (hoursAhead <= 0) return null;

  const pct = Math.round(confidence * 100);
  const isDecayed = confidence < 0.85;

  const color =
    pct >= 85 ? '#22d3ee' :
    pct >= 70 ? '#a3e635' :
    pct >= 55 ? '#fbbf24' : '#f87171';

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${isDecayed ? 'confidence-decay' : ''}`}
      style={{
        color,
        borderColor: color,
        background: `${color}18`,
      }}
      title={`Forecast confidence: ${pct}% (${hoursAhead.toFixed(0)}h ahead)`}
    >
      <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
        <circle cx="4" cy="4" r="3" stroke={color} strokeWidth="1.5" />
        {pct >= 85
          ? <circle cx="4" cy="4" r="1.5" fill={color} />
          : null}
      </svg>
      {pct}% conf
    </span>
  );
}
