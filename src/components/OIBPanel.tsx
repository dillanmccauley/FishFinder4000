import { useState } from 'react';
import { format } from 'date-fns';
import type { SpeciesOutlook } from '../hooks/useOIBForecast';
import { GRADE_COLORS } from '../utils/scoring';

interface Props {
  outlooks: SpeciesOutlook[];
  loading: boolean;
  waterTempNowF: number | null;
  buoyBiasF: number;
  targetDate: Date;
  nowDate: Date;
  demStatus: 'loading' | 'ready' | 'error';
  spotCount: number;
  onClose: () => void;
}

const SPARK_W = 240;
const SPARK_H = 34;

function Sparkline({ outlook, targetDate, nowDate }: { outlook: SpeciesOutlook; targetDate: Date; nowDate: Date }) {
  const future = outlook.hourlyScores.filter(s => s.time.getTime() >= nowDate.getTime() - 30 * 60000);
  if (!future.length) return null;
  const barW = SPARK_W / future.length;
  const targetMs = targetDate.getTime();
  let targetIdx = 0;
  let bestDiff = Infinity;
  future.forEach((s, i) => {
    const d = Math.abs(s.time.getTime() - targetMs);
    if (d < bestDiff) { bestDiff = d; targetIdx = i; }
  });

  return (
    <svg width={SPARK_W} height={SPARK_H} style={{ display: 'block' }}>
      {future.map((s, i) => {
        const barH = Math.max(2, (s.total / 100) * (SPARK_H - 4));
        return (
          <rect
            key={i}
            x={i * barW}
            y={SPARK_H - barH}
            width={Math.max(1, barW - 0.6)}
            height={barH}
            fill={GRADE_COLORS[s.grade]}
            opacity={i === targetIdx ? 1 : 0.55}
          />
        );
      })}
      <line
        x1={targetIdx * barW + barW / 2}
        x2={targetIdx * barW + barW / 2}
        y1={0}
        y2={SPARK_H}
        stroke="#f8fafc"
        strokeWidth={1}
        strokeDasharray="2,2"
        opacity={0.8}
      />
    </svg>
  );
}

function DriversLine({ outlook }: { outlook: SpeciesOutlook }) {
  const ranked = outlook.factorsNow
    .map(f => ({ ...f, dev: (f.score - 65) * f.weight }))
    .sort((a, b) => b.dev - a.dev);
  const helping = ranked.filter(f => f.dev > 0.5).slice(0, 2);
  const hurting = ranked.filter(f => f.dev < -0.5).slice(-1);
  if (!helping.length && !hurting.length) return null;
  return (
    <div style={{ fontSize: 10, color: '#94a3b8', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {helping.map(f => (
        <span key={f.label} style={{ color: '#4ade80' }}>▲ {f.label} {Math.round(f.score)}</span>
      ))}
      {hurting.map(f => (
        <span key={f.label} style={{ color: '#f87171' }}>▼ {f.label} {Math.round(f.score)}</span>
      ))}
    </div>
  );
}

export function OIBPanel({ outlooks, loading, waterTempNowF, buoyBiasF, targetDate, nowDate, demStatus, spotCount, onClose }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div style={{
      position: 'absolute', top: 56, right: 12, bottom: 110, width: 288, zIndex: 9998,
      background: '#0f172af2', border: '1px solid #1e293b', borderRadius: 12,
      backdropFilter: 'blur(10px)', display: 'flex', flexDirection: 'column',
      boxShadow: '0 4px 24px rgba(0,0,0,0.6)', overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ padding: '10px 12px 8px', borderBottom: '1px solid #1e293b', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 800, fontSize: 13, color: '#f1f5f9' }}>🎯 Ocean Isle Beach</span>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 14, padding: 2 }}
            title="Exit OIB mode"
          >
            ✕
          </button>
        </div>
        <div style={{ fontSize: 10, color: '#64748b', marginTop: 3, lineHeight: 1.5 }}>
          {waterTempNowF != null && (
            <span style={{ color: '#38bdf8' }}>
              Water {waterTempNowF.toFixed(1)}°F{buoyBiasF !== 0 ? ' · buoy 41024' : ' · model'}
            </span>
          )}
          {waterTempNowF != null && ' · '}
          Tide: Shallotte Inlet
          <br />
          {demStatus === 'loading' && 'Scanning bathymetry for structure…'}
          {demStatus === 'ready' && `${spotCount} structure spots found — tap map markers`}
          {demStatus === 'error' && '⚠ High-res depth data unavailable'}
        </div>
      </div>

      {/* Species cards */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px' }}>
        {loading && !outlooks.length && (
          <div style={{ color: '#64748b', fontSize: 11, textAlign: 'center', padding: 20 }}>Loading forecast…</div>
        )}
        {outlooks.map(o => {
          const isOpen = expanded === o.species.id;
          return (
            <div
              key={o.species.id}
              onClick={() => setExpanded(isOpen ? null : o.species.id)}
              style={{
                marginBottom: 8, padding: '8px 9px', borderRadius: 9, cursor: 'pointer',
                background: '#1e293b66', border: `1px solid ${isOpen ? GRADE_COLORS[o.gradeNow] + '88' : '#1e293b'}`,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  width: 26, height: 26, borderRadius: 7, background: GRADE_COLORS[o.gradeNow],
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 800, fontSize: 13, color: '#fff', flexShrink: 0,
                }}>
                  {o.gradeNow}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {o.species.commonName}
                  </div>
                  {o.bestWindow && (
                    <div style={{ fontSize: 10, color: '#fbbf24' }}>
                      Best: {format(o.bestWindow.startTime, 'EEE h a')}–{format(o.bestWindow.endTime, 'h a')} · {o.bestWindow.grade} ({o.bestWindow.avgScore})
                    </div>
                  )}
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: GRADE_COLORS[o.gradeNow] }}>{o.scoreNow}</span>
              </div>

              <div style={{ marginTop: 6 }}>
                <Sparkline outlook={o} targetDate={targetDate} nowDate={nowDate} />
              </div>

              {isOpen && (
                <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <DriversLine outlook={o} />
                  <div style={{ fontSize: 10.5, color: '#cbd5e1', fontStyle: 'italic', lineHeight: 1.45 }}>
                    💡 {o.profile.tactic}
                  </div>
                  <div style={{ fontSize: 9.5, color: '#64748b' }}>
                    Zone: {o.profile.zone === 'icw' ? 'ICW / inside' : o.profile.zone === 'nearshore' ? 'Nearshore ocean' : 'ICW + nearshore'}
                    {' · '}Lures: {o.species.topLures.slice(0, 2).join(', ')}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ padding: '6px 12px', borderTop: '1px solid #1e293b', fontSize: 9, color: '#475569', flexShrink: 0, lineHeight: 1.7 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginRight: 8 }}>
          <span style={{ width: 7, height: 7, background: '#22d3ee', transform: 'rotate(45deg)', display: 'inline-block' }} /> hole
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginRight: 8 }}>
          <span style={{ width: 7, height: 7, background: '#a78bfa', transform: 'rotate(45deg)', display: 'inline-block' }} /> drop-off
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 7, height: 7, background: '#f59e0b', transform: 'rotate(45deg)', display: 'inline-block' }} /> reef
        </span>
        <br />
        Next 72h · white line = scrubber time · tap a card for tactics
      </div>
    </div>
  );
}
