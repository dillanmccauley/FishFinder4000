import type { ZoneScore, Hotspot } from '../types';
import { GRADE_COLORS, GRADE_BG_COLORS, GRADE_LABELS, formatTempF, formatWind } from '../utils/scoring';
import { ConfidenceBadge } from './ConfidenceBadge';

const TYPE_ICONS: Record<string, string> = {
  pier: '🎣',
  inlet: '⚓',
  flat: '🌊',
  reef: '🪸',
  pass: '🚢',
};

const TIDE_ICONS: Record<string, string> = {
  incoming: '↗ Incoming',
  outgoing: '↙ Outgoing',
  high: '⬆ High',
  low: '⬇ Low',
};

interface Props {
  score: ZoneScore;
  hotspot: Hotspot;
  onRemove?: () => void;
}

export function ZonePopup({ score, hotspot, onRemove }: Props) {
  const gradeColor = GRADE_COLORS[score.grade];
  const gradeBg = GRADE_BG_COLORS[score.grade];

  const windyUrl = `https://www.windy.com/${hotspot.location.lat.toFixed(3)}/${hotspot.location.lng.toFixed(3)}/10?wind,waves`;
  const weatherGovUrl = `https://forecast.weather.gov/MapClick.php?lat=${hotspot.location.lat}&lon=${hotspot.location.lng}&unit=0&lg=english&FcstType=graphical`;
  const noaaTidesUrl = `https://tidesandcurrents.noaa.gov/noaatidepredictions.html?id=${hotspot.tideStationId}&units=standard&timezone=LST%2FLDT&clock=12hour&datum=MLLW&interval=hilo&action=dailychart`;

  return (
    <div className="popup-scroll" style={{ maxHeight: '520px', overflowY: 'auto', fontSize: '13px' }}>
      {/* Header */}
      <div className="px-4 pt-4 pb-3 flex items-start gap-3" style={{ borderBottom: '1px solid #334155' }}>
        <div
          className="grade-ring flex-shrink-0"
          style={{ width: 54, height: 54, background: gradeBg, border: `3px solid ${gradeColor}`, color: gradeColor }}
        >
          {score.grade}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>
              {TYPE_ICONS[hotspot.type]} {hotspot.type.toUpperCase()}
            </span>
            {onRemove && (
              <span style={{ fontSize: '10px', color: '#0ea5e9', background: '#0ea5e915', border: '1px solid #0ea5e940', borderRadius: 4, padding: '1px 5px' }}>
                ★ Custom
              </span>
            )}
            {score.isForecast && (
              <ConfidenceBadge confidence={score.confidence} hoursAhead={score.forecastHoursAhead} />
            )}
          </div>
          <div style={{ fontWeight: 700, fontSize: '15px', color: '#f1f5f9', lineHeight: 1.3, marginTop: 2 }}>
            {hotspot.name}
          </div>
          <div style={{ color: gradeColor, fontSize: '12px', fontWeight: 600, marginTop: 2 }}>
            {GRADE_LABELS[score.grade]} — {score.total.toFixed(0)}/100
          </div>
        </div>
      </div>

      {/* Score breakdown */}
      <div className="px-4 py-3" style={{ borderBottom: '1px solid #334155' }}>
        <div style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 700, letterSpacing: '0.05em', marginBottom: 8 }}>
          SCORE BREAKDOWN
        </div>
        <ScoreBar label="Marine Conditions" value={score.marineScore} weight="40%" color="#38bdf8" />
        <ScoreBar label="Season & Temp" value={score.seasonScore} weight="35%" color="#4ade80" />
        <ScoreBar label="Tide Phase" value={score.tideScore} weight="15%" color="#a78bfa" />
        <ScoreBar label="Moon Phase" value={score.moonScore} weight="10%" color="#fbbf24" />
      </div>

      {/* Active species */}
      <div className="px-4 py-3" style={{ borderBottom: '1px solid #334155' }}>
        <div style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 700, letterSpacing: '0.05em', marginBottom: 8 }}>
          ACTIVE SPECIES
        </div>
        <div className="flex flex-wrap gap-1">
          {score.activeSpecies.map(s => (
            <span
              key={s.id}
              className="px-2 py-0.5 rounded text-xs font-medium"
              style={{ background: '#0f172a', border: '1px solid #334155', color: '#e2e8f0' }}
            >
              {s.commonName}
            </span>
          ))}
        </div>
      </div>

      {/* Top lure & rig */}
      <div className="px-4 py-3" style={{ borderBottom: '1px solid #334155' }}>
        <div style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 700, letterSpacing: '0.05em', marginBottom: 8 }}>
          TOP RECOMMENDATIONS
        </div>
        {score.activeSpecies.slice(0, 2).map(s => (
          <div key={s.id} className="mb-2">
            <div style={{ color: '#cbd5e1', fontSize: '12px', fontWeight: 600, marginBottom: 3 }}>
              {s.commonName}
            </div>
            <div className="flex gap-4">
              <div>
                <span style={{ color: '#64748b', fontSize: '10px' }}>LURE</span>
                <div style={{ color: '#e2e8f0', fontSize: '12px' }}>{s.topLures[0]}</div>
              </div>
              <div>
                <span style={{ color: '#64748b', fontSize: '10px' }}>RIG</span>
                <div style={{ color: '#e2e8f0', fontSize: '12px' }}>{s.topRigs[0]}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Conditions */}
      <div className="px-4 py-3" style={{ borderBottom: '1px solid #334155' }}>
        <div style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 700, letterSpacing: '0.05em', marginBottom: 8 }}>
          CONDITIONS
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          <CondRow icon="🌡" label="Water Temp" value={score.conditions ? formatTempF(score.conditions.waterTempF) : '—'} />
          <CondRow icon="🌊" label="Waves" value={score.conditions ? `${score.conditions.waveHeightFt.toFixed(1)} ft` : '—'} />
          <CondRow icon="💨" label="Wind" value={score.conditions ? formatWind(score.conditions.windSpeedMph, score.conditions.windDirectionDeg) : '—'} />
          <CondRow icon="🌊" label="Tide" value={score.tide ? TIDE_ICONS[score.tide.phase] ?? score.tide.phase : '—'} />
          {score.tide && <CondRow icon="📏" label="Tide Height" value={`${score.tide.heightFt.toFixed(1)} ft`} />}
          {score.tide && <CondRow icon="⏰" label="Next Event" value={score.tide.nextEventLabel} />}
          <CondRow icon={score.moonPhaseEmoji} label="Moon" value={score.moonPhaseName} />
        </div>
      </div>

      {/* Resources & links */}
      <div className="px-4 py-3" style={{ borderBottom: onRemove ? '1px solid #334155' : undefined }}>
        <div style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 700, letterSpacing: '0.05em', marginBottom: 8 }}>
          RESOURCES & LINKS
        </div>
        <div className="flex flex-wrap gap-2">
          <ResourceLink href={windyUrl} icon="💨" label="Windy" desc="Wind & waves" />
          <ResourceLink href={weatherGovUrl} icon="🌤" label="Weather.gov" desc="NOAA forecast" />
          <ResourceLink href={noaaTidesUrl} icon="🌊" label="NOAA Tides" desc="Tide chart" />
          <ResourceLink href="https://fishbrain.com/" icon="🎣" label="Fishbrain" desc="Bite reports" />
          <ResourceLink href="https://anglr.com/" icon="📊" label="Anglr" desc="Activity data" />
        </div>
      </div>

      {/* Remove custom zone */}
      {onRemove && (
        <div className="px-4 py-3">
          <button
            onClick={onRemove}
            style={{
              width: '100%', padding: '8px 0', borderRadius: 8,
              background: 'transparent', border: '1px solid #ef444455',
              color: '#ef4444', cursor: 'pointer', fontSize: 12, fontWeight: 600,
            }}
          >
            Remove Custom Zone
          </button>
        </div>
      )}
    </div>
  );
}

function ScoreBar({ label, value, weight, color }: { label: string; value: number; weight: string; color: string }) {
  return (
    <div className="mb-2">
      <div className="flex justify-between items-center mb-1">
        <span style={{ color: '#cbd5e1', fontSize: '12px' }}>{label}</span>
        <span style={{ color: '#64748b', fontSize: '11px' }}>{weight} · {value.toFixed(0)}</span>
      </div>
      <div style={{ height: 4, background: '#1e293b', borderRadius: 2, overflow: 'hidden' }}>
        <div
          style={{
            width: `${Math.min(100, value)}%`,
            height: '100%',
            background: color,
            borderRadius: 2,
            transition: 'width 0.3s ease',
          }}
        />
      </div>
    </div>
  );
}

function CondRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div>
      <div style={{ color: '#64748b', fontSize: '10px' }}>{icon} {label}</div>
      <div style={{ color: '#e2e8f0', fontSize: '12px', fontWeight: 500 }}>{value}</div>
    </div>
  );
}

function ResourceLink({ href, icon, label, desc }: { href: string; icon: string; label: string; desc: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '5px 8px',
        borderRadius: 8,
        background: '#0f172a',
        border: '1px solid #334155',
        textDecoration: 'none',
        transition: 'border-color 0.12s',
      }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = '#475569')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = '#334155')}
    >
      <span style={{ fontSize: 14 }}>{icon}</span>
      <div>
        <div style={{ color: '#e2e8f0', fontSize: 11, fontWeight: 600, lineHeight: 1.2 }}>{label}</div>
        <div style={{ color: '#475569', fontSize: 10 }}>{desc}</div>
      </div>
    </a>
  );
}
