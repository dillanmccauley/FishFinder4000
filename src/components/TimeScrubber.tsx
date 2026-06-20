import { format, addHours } from 'date-fns';

interface Props {
  offsetHours: number; // -12 to +60
  onChange: (hours: number) => void;
  nowDate: Date;
}

const MIN_HOURS = -12;
const MAX_HOURS = 60;
const TOTAL_STEPS = MAX_HOURS - MIN_HOURS; // 72

export function TimeScrubber({ offsetHours, onChange, nowDate }: Props) {
  const sliderValue = offsetHours - MIN_HOURS; // 0–72
  const targetDate = addHours(nowDate, offsetHours);
  const isPast = offsetHours < 0;
  const isFuture = offsetHours > 0;
  const isNow = offsetHours === 0;

  const hoursFromNow = Math.abs(offsetHours);
  const label = isNow
    ? 'NOW'
    : isPast
    ? `${hoursFromNow}h ago`
    : `+${hoursFromNow}h`;

  const nowPct = 12 / 72 * 100; // "now" marker at 16.7%

  // Color the track: past=slate, now=sky, future=purple-ish
  const trackBackground = `linear-gradient(
    to right,
    #334155 0%,
    #334155 ${nowPct}%,
    ${offsetHours >= 0 ? '#0ea5e9' : '#334155'} ${nowPct}%,
    #0ea5e9 ${Math.min(nowPct + (sliderValue / TOTAL_STEPS) * 100, 100)}%,
    #334155 ${Math.min(nowPct + (sliderValue / TOTAL_STEPS) * 100, 100)}%,
    #334155 100%
  )`;

  return (
    <div
      className="flex flex-col gap-2 px-4 py-3"
      style={{
        background: '#0f172a',
        borderTop: '1px solid #1e293b',
        userSelect: 'none',
      }}
    >
      {/* Labels row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span
            className="px-2.5 py-1 rounded font-mono font-bold text-sm"
            style={{
              background: isNow ? '#0ea5e920' : isFuture ? '#7c3aed20' : '#33415520',
              border: `1px solid ${isNow ? '#0ea5e9' : isFuture ? '#7c3aed' : '#475569'}`,
              color: isNow ? '#38bdf8' : isFuture ? '#a78bfa' : '#94a3b8',
              minWidth: 72,
              textAlign: 'center',
            }}
          >
            {label}
          </span>
          <span style={{ color: '#475569', fontSize: '12px' }}>
            {format(targetDate, 'EEE MMM d, h:mm a')}
          </span>
        </div>
        <div className="flex items-center gap-3" style={{ fontSize: '11px', color: '#475569' }}>
          <span>
            <span style={{ color: '#94a3b8' }}>◀</span> 12h history
          </span>
          <span>
            60h forecast <span style={{ color: '#94a3b8' }}>▶</span>
          </span>
        </div>
      </div>

      {/* Slider */}
      <div className="relative flex items-center" style={{ height: 24 }}>
        {/* Now marker line */}
        <div
          style={{
            position: 'absolute',
            left: `calc(${nowPct}% - 1px)`,
            top: 0,
            bottom: 0,
            width: 2,
            background: '#38bdf8',
            borderRadius: 1,
            zIndex: 2,
            pointerEvents: 'none',
          }}
        />
        {/* 24h forecast marker */}
        <div
          style={{
            position: 'absolute',
            left: `calc(${((12 + 24) / 72) * 100}% - 1px)`,
            top: 0,
            bottom: 0,
            width: 1,
            background: '#fbbf24',
            zIndex: 2,
            pointerEvents: 'none',
            opacity: 0.5,
          }}
          title="24h forecast threshold"
        />
        <input
          type="range"
          min={0}
          max={TOTAL_STEPS}
          step={1}
          value={sliderValue}
          onChange={(e) => onChange(parseInt(e.target.value) + MIN_HOURS)}
          className="w-full relative z-10"
          style={{
            background: trackBackground,
            appearance: 'none',
            WebkitAppearance: 'none',
          }}
        />
      </div>

      {/* Tick labels */}
      <div className="flex justify-between" style={{ fontSize: '10px', color: '#475569' }}>
        <span>-12h</span>
        <span style={{ color: '#38bdf8' }}>NOW</span>
        <span style={{ color: '#fbbf24', opacity: 0.7 }}>+24h</span>
        <span>+48h</span>
        <span>+60h</span>
      </div>

      {/* Confidence hint for future times */}
      {isFuture && (
        <div
          className="flex items-center gap-2 text-xs px-2 py-1.5 rounded"
          style={{
            background: '#1e293b',
            border: '1px solid #334155',
            color: '#94a3b8',
          }}
        >
          <span style={{ color: '#fbbf24' }}>⚠</span>
          {offsetHours <= 24
            ? 'Near-term forecast: weather & tides only. Bite data from recent reports.'
            : offsetHours <= 48
            ? 'Extended forecast: confidence reduced. Grade reflects weather/tide models only.'
            : 'Long-range forecast: low confidence. Use as directional guidance only.'}
        </div>
      )}
    </div>
  );
}
