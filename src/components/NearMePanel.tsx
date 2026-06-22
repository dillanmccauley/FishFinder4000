import { useMemo } from 'react';
import type { LatLng, ZoneScore } from '../types';
import { HOTSPOTS, HOTSPOT_MAP } from '../data/hotspots';
import { GRADE_COLORS, scoreToGrade } from '../utils/scoring';

const RADIUS_MI = 25;
const EARTH_RADIUS_MI = 3958.8;

function distanceMi(a: LatLng, b: LatLng): number {
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * Math.PI / 180) *
    Math.cos(b.lat * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_MI * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

interface Props {
  userLocation: LatLng;
  zoneScores: Map<string, ZoneScore>;
}

export function NearMePanel({ userLocation, zoneScores }: Props) {
  const result = useMemo(() => {
    const nearby = HOTSPOTS.filter(h => distanceMi(userLocation, h.location) <= RADIUS_MI);
    if (!nearby.length) return null;

    const scores = nearby
      .map(h => zoneScores.get(h.id))
      .filter((s): s is ZoneScore => s != null);

    if (!scores.length) return null;

    const areaScore = scores.reduce((s, z) => s + z.total, 0) / scores.length;
    const areaGrade = scoreToGrade(areaScore);
    const bestZone = scores.reduce((b, z) => (z.total > b.total ? z : b), scores[0]);

    // Accumulate per-species bite heat across nearby zones
    const acc = new Map<string, { commonName: string; totalBite: number; count: number }>();
    scores.forEach(z => {
      z.activeSpecies.forEach(sp => {
        const prev = acc.get(sp.id) ?? { commonName: sp.commonName, totalBite: 0, count: 0 };
        prev.totalBite += z.biteScore;
        prev.count += 1;
        acc.set(sp.id, prev);
      });
    });

    const topSpecies = [...acc.entries()]
      .map(([id, v]) => ({ id, commonName: v.commonName, heat: v.totalBite / v.count }))
      .sort((a, b) => b.heat - a.heat)
      .slice(0, 4);

    return { nearbyCount: nearby.length, areaGrade, bestZone, topSpecies };
  }, [userLocation, zoneScores]);

  if (!result) return null;

  const { nearbyCount, areaGrade, bestZone, topSpecies } = result;
  const color = GRADE_COLORS[areaGrade];

  return (
    <div className="absolute z-50" style={{ bottom: 148, left: 8, width: 224 }}>
      <div
        className="rounded-xl overflow-hidden"
        style={{
          background: '#0f172aee',
          border: `1px solid ${color}66`,
          backdropFilter: 'blur(8px)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-3 py-2"
          style={{ borderBottom: '1px solid #1e293b' }}
        >
          <div className="flex items-center gap-1.5">
            <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 700 }}>📍 Near You</span>
            <span style={{ fontSize: 10, color: '#475569' }}>
              {nearbyCount} zone{nearbyCount !== 1 ? 's' : ''}
            </span>
          </div>
          <div
            className="flex items-center justify-center font-mono font-bold"
            style={{
              width: 26, height: 26, borderRadius: '50%',
              background: `${color}22`,
              border: `2px solid ${color}`,
              color,
              fontSize: 13,
            }}
          >
            {areaGrade}
          </div>
        </div>

        {/* Species bite heat */}
        <div className="px-3 py-2">
          <div
            style={{
              fontSize: 9, color: '#475569', marginBottom: 6,
              textTransform: 'uppercase', letterSpacing: '0.06em',
            }}
          >
            What&apos;s biting
          </div>
          <div className="flex flex-col gap-1.5">
            {topSpecies.map(({ id, commonName, heat }) => {
              const pct = Math.min(100, Math.max(4, heat));
              const barColor = heat >= 60 ? '#22c55e' : heat >= 40 ? '#fbbf24' : '#475569';
              return (
                <div key={id} className="flex items-center gap-2">
                  <span style={{ fontSize: 11, color: '#cbd5e1', width: 116, flexShrink: 0 }}>
                    {commonName}
                  </span>
                  <div
                    style={{
                      flex: 1, height: 5, borderRadius: 3,
                      background: '#1e293b', overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        width: `${pct}%`,
                        background: barColor,
                        borderRadius: 3,
                        transition: 'width 0.4s ease',
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Best nearby zone */}
        {bestZone && (
          <div className="px-3 pb-2 pt-1.5" style={{ borderTop: '1px solid #1e293b' }}>
            <div
              style={{
                fontSize: 9, color: '#475569', marginBottom: 4,
                textTransform: 'uppercase', letterSpacing: '0.06em',
              }}
            >
              Top spot
            </div>
            <div className="flex items-center justify-between gap-2">
              <span style={{ fontSize: 11, color: '#e2e8f0', flex: 1 }}>
                {HOTSPOT_MAP.get(bestZone.hotspotId)?.name}
              </span>
              <span
                style={{
                  fontSize: 12, fontWeight: 800, fontFamily: 'monospace',
                  color: GRADE_COLORS[bestZone.grade], flexShrink: 0,
                }}
              >
                {bestZone.grade}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
