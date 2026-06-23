import { useMemo, useState } from 'react';
import type { LatLng, ZoneScore } from '../types';
import { HOTSPOTS, HOTSPOT_MAP } from '../data/hotspots';
import { SPECIES } from '../data/species';
import { GRADE_COLORS, scoreToGrade, calcSeasonScore } from '../utils/scoring';
import { distanceMi } from '../utils/geo';

const RADIUS_MI = 25;

interface Props {
  userLocation: LatLng;
  zoneScores: Map<string, ZoneScore>;
  targetDate: Date;
}

export function NearMePanel({ userLocation, zoneScores, targetDate }: Props) {
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedSpeciesIds, setSelectedSpeciesIds] = useState<string[]>([]);

  const toggleSpecies = (id: string) => {
    setSelectedSpeciesIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const result = useMemo(() => {
    const nearby = HOTSPOTS.filter(h => distanceMi(userLocation, h.location) <= RADIUS_MI);
    if (!nearby.length) return null;

    const scores = nearby
      .map(h => zoneScores.get(h.id))
      .filter((s): s is ZoneScore => s != null);

    if (!scores.length) return null;

    const areaScore = scores.reduce((s, z) => s + z.total, 0) / scores.length;
    const areaGrade = scoreToGrade(areaScore);

    // Per-species season heat averaged across nearby zones
    const acc = new Map<string, { commonName: string; totalHeat: number; count: number }>();
    scores.forEach(z => {
      z.activeSpecies.forEach(sp => {
        const heat = calcSeasonScore([sp], targetDate, z.conditions?.waterTempF);
        const prev = acc.get(sp.id) ?? { commonName: sp.commonName, totalHeat: 0, count: 0 };
        prev.totalHeat += heat;
        prev.count += 1;
        acc.set(sp.id, prev);
      });
    });

    const topSpecies = [...acc.entries()]
      .map(([id, v]) => ({ id, commonName: v.commonName, heat: v.totalHeat / v.count }))
      .sort((a, b) => b.heat - a.heat)
      .slice(0, 4);

    // Sort scores: matching filter first, non-matching dimmed at bottom
    const sortedScores = selectedSpeciesIds.length === 0 ? scores : [
      ...scores.filter(z => z.activeSpecies.some(sp => selectedSpeciesIds.includes(sp.id))),
      ...scores.filter(z => !z.activeSpecies.some(sp => selectedSpeciesIds.includes(sp.id))),
    ];

    return { nearbyCount: nearby.length, areaGrade, topSpecies, sortedScores };
  }, [userLocation, zoneScores, targetDate, selectedSpeciesIds]);

  if (!result) return null;

  const { nearbyCount, areaGrade, topSpecies, sortedScores } = result;
  const bestZone = sortedScores[0];
  const color = GRADE_COLORS[areaGrade];

  return (
    <div style={{ position: 'absolute', bottom: 148, left: 8, width: 224, zIndex: 9999 }}>
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
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setFilterOpen(o => !o)}
              style={{
                background: filterOpen ? '#0ea5e920' : 'transparent',
                border: `1px solid ${filterOpen ? '#0ea5e9' : '#334155'}`,
                borderRadius: 4,
                color: filterOpen ? '#0ea5e9' : '#64748b',
                fontSize: 10,
                padding: '2px 6px',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              🎯 Filter
            </button>
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
        </div>

        {/* Species filter */}
        {filterOpen && (
          <div className="px-3 py-2" style={{ borderBottom: '1px solid #1e293b' }}>
            <div style={{ fontSize: 9, color: '#475569', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Filter by species
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {SPECIES.map(sp => {
                const active = selectedSpeciesIds.includes(sp.id);
                return (
                  <button
                    key={sp.id}
                    onClick={() => toggleSpecies(sp.id)}
                    style={{
                      fontSize: 10,
                      padding: '2px 6px',
                      borderRadius: 99,
                      border: `1px solid ${active ? '#0ea5e9' : '#334155'}`,
                      background: active ? '#0ea5e918' : 'transparent',
                      color: active ? '#0ea5e9' : '#64748b',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {sp.commonName.split(' ')[0]}
                  </button>
                );
              })}
            </div>
            {selectedSpeciesIds.length > 0 && (
              <button
                onClick={() => setSelectedSpeciesIds([])}
                style={{ fontSize: 9, color: '#475569', marginTop: 4, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                Clear filter
              </button>
            )}
          </div>
        )}

        {/* Species season heat */}
        <div className="px-3 py-2">
          <div
            style={{
              fontSize: 9, color: '#475569', marginBottom: 6,
              textTransform: 'uppercase', letterSpacing: '0.06em',
            }}
          >
            What&apos;s in season
          </div>
          <div className="flex flex-col gap-1.5">
            {topSpecies.map(({ id, commonName, heat }) => {
              const pct = Math.min(100, Math.max(4, heat));
              const barColor = heat >= 65 ? '#22c55e' : heat >= 40 ? '#fbbf24' : '#475569';
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
