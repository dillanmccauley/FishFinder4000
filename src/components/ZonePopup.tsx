import type { ZoneScore, Hotspot } from '../types';
import { GRADE_COLORS, GRADE_BG_COLORS, GRADE_LABELS, formatTempF, formatWind, clarityAdvice } from '../utils/scoring';
import { classifyDepth, DEPTH_ZONES, speciesMatchDepth } from '../utils/depth';
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
        <ScoreBar label="Marine Conditions" value={score.marineScore} weight="28%" color="#38bdf8" />
        <ScoreBar label="Pressure" value={score.pressureScore} weight="12%" color="#c084fc" />
        <ScoreBar label="Season & Temp" value={score.seasonScore} weight="25%" color="#4ade80" />
        <ScoreBar label="Tide Phase" value={score.tideScore} weight="15%" color="#a78bfa" />
        <ScoreBar label="Moon Phase" value={score.moonScore} weight="8%" color="#fbbf24" />
        <ScoreBar label="UV Index" value={score.uvScore} weight="7%" color="#facc15" />
        <ScoreBar label="Water Clarity" value={score.clarityScore} weight="5%" color="#67e8f9" />
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
        {score.activeSpecies.slice(0, 2).map(s => {
          const clarityOk = score.clarityScore >= s.clarityPreference * 0.6;
          return (
            <div key={s.id} className="mb-2">
              <div className="flex items-center gap-2" style={{ marginBottom: 3 }}>
                <span style={{ color: '#cbd5e1', fontSize: '12px', fontWeight: 600 }}>{s.commonName}</span>
                {!clarityOk && (
                  <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: '#f9741620', border: '1px solid #f9741660', color: '#f97316' }}>
                    ⚠ low clarity
                  </span>
                )}
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
          );
        })}

        {/* Clarity-based lure colour guide */}
        {(() => {
          const ci = clarityAdvice(score.clarityScore);
          return (
            <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: 8, background: `${ci.color}12`, border: `1px solid ${ci.color}40` }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: ci.color, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                💧 {ci.label} water lure guide
              </div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 3 }}>
                <span style={{ color: '#64748b' }}>Colors: </span>{ci.colors}
              </div>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>
                <span style={{ color: '#64748b' }}>Tips: </span>{ci.tips}
              </div>
            </div>
          );
        })()}
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
          <CondRow
            icon="🌡"
            label="Pressure"
            value={score.conditions ? `${score.conditions.pressureHpa.toFixed(0)} hPa ${score.pressureDelta > 1 ? '▲ Rising' : score.pressureDelta < -1 ? '▼ Falling' : '— Stable'}` : '—'}
            valueColor={score.pressureDelta > 1 ? '#4ade80' : score.pressureDelta < -3 ? '#f87171' : '#e2e8f0'}
          />
          <CondRow icon="🌊" label="Tide" value={score.tide ? TIDE_ICONS[score.tide.phase] ?? score.tide.phase : '—'} />
          {score.tide && <CondRow icon="📏" label="Tide Height" value={`${score.tide.heightFt.toFixed(1)} ft`} />}
          {score.tide && <CondRow icon="⏰" label="Next Event" value={score.tide.nextEventLabel} />}
          <CondRow icon={score.moonPhaseEmoji} label="Moon" value={score.moonPhaseName} />
          <CondRow
            icon="☀️"
            label="UV Index"
            value={score.conditions ? `${score.conditions.uvIndex.toFixed(1)} — ${score.conditions.uvIndex <= 2 ? 'Low' : score.conditions.uvIndex <= 5 ? 'Moderate' : score.conditions.uvIndex <= 8 ? 'High' : 'Very High'}` : '—'}
            valueColor={score.conditions && score.conditions.uvIndex >= 8 ? '#f97316' : score.conditions && score.conditions.uvIndex >= 5 ? '#fbbf24' : '#4ade80'}
          />
          <CondRow
            icon="💧"
            label="Water Clarity"
            value={`${clarityAdvice(score.clarityScore).label} (~${clarityAdvice(score.clarityScore).visibilityEst})`}
            valueColor={clarityAdvice(score.clarityScore).color}
          />
          <CondRow
            icon="🐟"
            label="Bait Activity"
            value={score.baitScore >= 85 ? 'High' : score.baitScore >= 60 ? 'Moderate' : 'Low'}
            valueColor={score.baitScore >= 85 ? '#4ade80' : score.baitScore >= 60 ? '#fbbf24' : '#94a3b8'}
          />
        </div>
        {score.conditions && score.conditions.precipitationMm > 0 && (
          <div style={{ fontSize: 10, color: '#f97316', marginTop: 6 }}>
            ☔ {score.conditions.precipitationMm.toFixed(1)} mm/hr rainfall — expect reduced clarity inshore
          </div>
        )}
        {score.algaePenalty >= 15 && (
          <div style={{ fontSize: 10, color: '#a3e635', marginTop: 6, padding: '4px 8px', borderRadius: 6, background: '#84cc1612', border: '1px solid #84cc1640' }}>
            🌿 High algae bloom risk — warm shallow water + summer season likely reducing visibility by {score.algaePenalty}+ pts
          </div>
        )}
        {score.algaePenalty >= 5 && score.algaePenalty < 15 && (
          <div style={{ fontSize: 10, color: '#84cc16', marginTop: 6 }}>
            🌿 Moderate algae bloom risk — warm water may slightly reduce clarity
          </div>
        )}
      </div>

      {/* Water depth */}
      {hotspot.depthRangeFt && (() => {
        const [dMin, dMax] = hotspot.depthRangeFt;
        const zone = classifyDepth(dMin, dMax);
        const zoneInfo = DEPTH_ZONES[zone];
        return (
          <div className="px-4 py-3" style={{ borderBottom: '1px solid #334155' }}>
            <div style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 700, letterSpacing: '0.05em', marginBottom: 8 }}>
              WATER DEPTH
            </div>

            <div className="flex items-center gap-2 mb-2">
              <span style={{
                fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
                background: `${zoneInfo.color}22`, border: `1px solid ${zoneInfo.color}88`, color: zoneInfo.color,
              }}>
                {zoneInfo.icon} {zoneInfo.label}
              </span>
              <span style={{ color: '#94a3b8', fontSize: 11 }}>{dMin}–{dMax} ft</span>
            </div>

            <div style={{ color: '#64748b', fontSize: 11, marginBottom: 8 }}>{zoneInfo.description}</div>

            <DepthBar min={dMin} max={dMax} color={zoneInfo.color} />

            <div style={{ fontSize: 10, color: '#64748b', marginTop: 8, marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Species matched to this depth
            </div>
            <div className="flex flex-wrap gap-1 mb-2">
              {score.activeSpecies.map(sp => {
                const match = speciesMatchDepth(sp, dMin, dMax);
                return (
                  <span key={sp.id} style={{
                    fontSize: 10, padding: '2px 6px', borderRadius: 4,
                    background: match ? '#22c55e18' : '#64748b18',
                    border: `1px solid ${match ? '#22c55e55' : '#64748b40'}`,
                    color: match ? '#4ade80' : '#64748b',
                  }}>
                    {match ? '✓' : '~'} {sp.commonName}
                  </span>
                );
              })}
            </div>

            <div style={{ fontSize: 10, color: '#475569', fontStyle: 'italic' }}>
              Also common here: {zoneInfo.typicalFish}
            </div>
          </div>
        );
      })()}

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

function DepthBar({ min, max, color }: { min: number; max: number; color: string }) {
  // Scale 0–300 ft covers intertidal through inner shelf
  const SCALE = 300;
  const leftPct = Math.min(98, (min / SCALE) * 100);
  const widthPct = Math.min(98 - leftPct, Math.max(4, ((max - min) / SCALE) * 100));
  return (
    <div>
      <div style={{ height: 8, background: '#1e293b', borderRadius: 4, position: 'relative', overflow: 'hidden' }}>
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(to right, #86efac 0%, #34d399 10%, #22d3ee 30%, #60a5fa 60%, #818cf8 85%, #a78bfa 100%)',
          opacity: 0.25,
        }} />
        <div style={{
          position: 'absolute',
          left: `${leftPct}%`,
          width: `${widthPct}%`,
          height: '100%',
          background: color,
          borderRadius: 3,
          opacity: 0.85,
        }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#334155', marginTop: 2 }}>
        <span>0</span><span>50 ft</span><span>100 ft</span><span>200 ft</span><span>300+ ft</span>
      </div>
    </div>
  );
}

function CondRow({ icon, label, value, valueColor }: { icon: string; label: string; value: string; valueColor?: string }) {
  return (
    <div>
      <div style={{ color: '#64748b', fontSize: '10px' }}>{icon} {label}</div>
      <div style={{ color: valueColor ?? '#e2e8f0', fontSize: '12px', fontWeight: 500 }}>{value}</div>
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
