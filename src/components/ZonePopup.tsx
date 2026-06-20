import type { ZoneScore } from '../types';
import { HOTSPOT_MAP } from '../data/hotspots';
import { GRADE_COLORS, GRADE_BG_COLORS, GRADE_LABELS, formatTempF, formatWind } from '../utils/scoring';
import { ConfidenceBadge } from './ConfidenceBadge';
import { format } from 'date-fns';

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
}

export function ZonePopup({ score }: Props) {
  const hotspot = HOTSPOT_MAP.get(score.hotspotId);
  if (!hotspot) return null;

  const gradeColor = GRADE_COLORS[score.grade];
  const gradeBg = GRADE_BG_COLORS[score.grade];

  return (
    <div className="popup-scroll" style={{ maxHeight: '420px', overflowY: 'auto', fontSize: '13px' }}>
      {/* Header */}
      <div
        className="px-4 pt-4 pb-3 flex items-start gap-3"
        style={{ borderBottom: '1px solid #334155' }}
      >
        <div
          className="grade-ring flex-shrink-0"
          style={{
            width: 54,
            height: 54,
            background: gradeBg,
            border: `3px solid ${gradeColor}`,
            color: gradeColor,
          }}
        >
          {score.grade}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>
              {TYPE_ICONS[hotspot.type]} {hotspot.type.toUpperCase()}
            </span>
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
        <ScoreBar label="Bite Reports" value={score.biteScore} weight="40%" color="#38bdf8" />
        <ScoreBar label="Marine Conditions" value={score.marineScore} weight="35%" color="#a78bfa" />
        <ScoreBar label="Fish Season" value={score.seasonScore} weight="25%" color="#4ade80" />
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
          <CondRow
            icon="🌡"
            label="Water Temp"
            value={score.conditions ? formatTempF(score.conditions.waterTempF) : '—'}
          />
          <CondRow
            icon="🌊"
            label="Waves"
            value={score.conditions ? `${score.conditions.waveHeightFt.toFixed(1)} ft` : '—'}
          />
          <CondRow
            icon="💨"
            label="Wind"
            value={score.conditions ? formatWind(score.conditions.windSpeedMph, score.conditions.windDirectionDeg) : '—'}
          />
          <CondRow
            icon="🌊"
            label="Tide"
            value={score.tide ? TIDE_ICONS[score.tide.phase] ?? score.tide.phase : '—'}
          />
          {score.tide && (
            <CondRow
              icon="⏱"
              label="Tide Height"
              value={`${score.tide.heightFt.toFixed(1)} ft`}
            />
          )}
          {score.tide && (
            <CondRow
              icon="⏰"
              label="Next Event"
              value={score.tide.nextEventLabel}
            />
          )}
        </div>
      </div>

      {/* Last report */}
      {score.topBiteReport && (
        <div className="px-4 py-3">
          <div style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 700, letterSpacing: '0.05em', marginBottom: 6 }}>
            LATEST REPORT
          </div>
          <div className="flex items-center justify-between">
            <div>
              <span
                className="px-2 py-0.5 rounded text-xs font-semibold"
                style={{ background: '#1e40af20', border: '1px solid #3b82f6', color: '#93c5fd' }}
              >
                {score.topBiteReport.source}
              </span>
              {score.topBiteReport.verified && (
                <span className="ml-1 text-xs" style={{ color: '#4ade80' }}>✓ Verified</span>
              )}
            </div>
            <span style={{ color: '#64748b', fontSize: '11px' }}>
              {format(score.topBiteReport.timestamp, 'MMM d, h:mm a')}
            </span>
          </div>
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
        <span style={{ color: '#64748b', fontSize: '11px' }}>{weight} weight · {value.toFixed(0)}</span>
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
