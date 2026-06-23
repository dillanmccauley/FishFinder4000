import React, { useMemo } from 'react';
import { format } from 'date-fns';
import type { LatLng, HourlyScore } from '../types';
import { GRADE_COLORS, GRADE_LABELS, findBestWindow } from '../utils/scoring';

interface Props {
  pin: LatLng;
  hourlyScores: HourlyScore[];
  targetDate: Date;
  onClose: () => void;
}

const BAR_W = 3;
const BAR_GAP = 0.5;
const CHART_H = 48;
const NOW_IDX = 12;

export function SpotForecastPanel({ pin, hourlyScores, targetDate, onClose }: Props) {
  const bestWindow = useMemo(() => findBestWindow(hourlyScores), [hourlyScores]);

  const currentScore = useMemo(() => {
    if (!hourlyScores.length) return null;
    const t = targetDate.getTime();
    return hourlyScores.reduce((a, b) =>
      Math.abs(a.time.getTime() - t) < Math.abs(b.time.getTime() - t) ? a : b
    );
  }, [hourlyScores, targetDate]);

  const svgWidth = hourlyScores.length * (BAR_W + BAR_GAP);
  const nowX = NOW_IDX * (BAR_W + BAR_GAP) + BAR_W / 2;

  const panelStyle: React.CSSProperties = {
    position: 'absolute',
    top: 56,
    left: 8,
    width: 256,
    background: 'rgba(10,10,30,0.95)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 8,
    padding: '10px 12px',
    zIndex: 1000,
    color: '#e2e8f0',
    fontFamily: 'system-ui, sans-serif',
    fontSize: 12,
    backdropFilter: 'blur(8px)',
    boxSizing: 'border-box',
  };

  const grade = currentScore ? currentScore.grade : null;
  const gradeColor = grade ? GRADE_COLORS[grade] : '#94a3b8';

  return (
    <div style={panelStyle}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>📍 Pinned Spot</div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>
            {pin.lat.toFixed(4)}°, {pin.lng.toFixed(4)}°
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: '#94a3b8',
            cursor: 'pointer',
            fontSize: 16,
            lineHeight: 1,
            padding: '2px 4px',
          }}
        >
          ✕
        </button>
      </div>

      {/* Current grade badge */}
      {currentScore && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 10,
          padding: '6px 8px',
          background: `${gradeColor}22`,
          borderRadius: 6,
          border: `1px solid ${gradeColor}44`,
        }}>
          <div style={{
            fontSize: 22,
            fontWeight: 700,
            color: gradeColor,
            lineHeight: 1,
            minWidth: 24,
            textAlign: 'center',
          }}>{grade}</div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 12 }}>{GRADE_LABELS[grade!]}</div>
            <div style={{ color: '#64748b', fontSize: 10 }}>
              Score {Math.round(currentScore.total)} · {format(targetDate, 'EEE h:mma')}
            </div>
          </div>
        </div>
      )}

      {/* 72h sparkline */}
      <div style={{ marginBottom: 6 }}>
        <div style={{ fontSize: 10, color: '#64748b', marginBottom: 3 }}>72-hour forecast</div>
        <svg
          width={Math.min(svgWidth, 232)}
          height={CHART_H + 2}
          viewBox={`0 0 ${svgWidth} ${CHART_H + 2}`}
          preserveAspectRatio="none"
          style={{ width: '100%', height: CHART_H + 2, display: 'block' }}
        >
          {hourlyScores.map((s, i) => {
            const x = i * (BAR_W + BAR_GAP);
            const barH = Math.max(2, (s.total / 100) * CHART_H);
            const y = CHART_H - barH + 1;
            return (
              <rect
                key={i}
                x={x}
                y={y}
                width={BAR_W}
                height={barH}
                fill={GRADE_COLORS[s.grade]}
                opacity={i < NOW_IDX ? 0.45 : 0.9}
              />
            );
          })}
          {/* NOW line */}
          <line x1={nowX} y1={0} x2={nowX} y2={CHART_H + 2} stroke="#f8fafc" strokeWidth={1} strokeDasharray="2,2" />
        </svg>
        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#475569', fontSize: 9, marginTop: 2 }}>
          <span>-12h</span>
          <span>Now</span>
          <span>+48h</span>
        </div>
      </div>

      {/* Best window */}
      {bestWindow && (
        <div style={{
          padding: '5px 7px',
          background: `${GRADE_COLORS[bestWindow.grade]}18`,
          border: `1px solid ${GRADE_COLORS[bestWindow.grade]}44`,
          borderRadius: 5,
          marginBottom: 8,
        }}>
          <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 2 }}>Best 3-hour window</div>
          <div style={{ fontWeight: 600, fontSize: 11, color: GRADE_COLORS[bestWindow.grade] }}>
            {format(bestWindow.startTime, 'EEE h:mma')} – {format(bestWindow.endTime, 'h:mma')}
          </div>
          <div style={{ fontSize: 10, color: '#94a3b8' }}>
            Grade {bestWindow.grade} · {GRADE_LABELS[bestWindow.grade]} ({bestWindow.avgScore})
          </div>
        </div>
      )}

      {/* Score bar mini */}
      {currentScore && (
        <div style={{ fontSize: 10, color: '#64748b' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
            <span>Marine</span><span style={{ color: '#94a3b8' }}>{Math.round(currentScore.marineScore)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
            <span>Pressure</span><span style={{ color: '#94a3b8' }}>{Math.round(currentScore.pressureScore)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
            <span>Season</span><span style={{ color: '#94a3b8' }}>{Math.round(currentScore.seasonScore)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
            <span>UV</span><span style={{ color: '#94a3b8' }}>{Math.round(currentScore.uvScore)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Clarity</span><span style={{ color: '#94a3b8' }}>{Math.round(currentScore.clarityScore)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
