import type { Grade, MarineConditions, TideInfo, BiteReport, Species } from '../types';

export function scoreToGrade(score: number): Grade {
  if (score >= 88) return 'A';
  if (score >= 74) return 'B';
  if (score >= 58) return 'C';
  if (score >= 42) return 'D';
  if (score >= 26) return 'E';
  return 'F';
}

export const GRADE_COLORS: Record<Grade, string> = {
  A: '#16a34a',
  B: '#65a30d',
  C: '#ca8a04',
  D: '#ea580c',
  E: '#dc2626',
  F: '#7f1d1d',
};

export const GRADE_BG_COLORS: Record<Grade, string> = {
  A: 'rgba(22, 163, 74, 0.15)',
  B: 'rgba(101, 163, 13, 0.15)',
  C: 'rgba(202, 138, 4, 0.15)',
  D: 'rgba(234, 88, 12, 0.15)',
  E: 'rgba(220, 38, 38, 0.15)',
  F: 'rgba(127, 29, 19, 0.15)',
};

export const GRADE_LABELS: Record<Grade, string> = {
  A: 'Excellent',
  B: 'Good',
  C: 'Fair',
  D: 'Poor',
  E: 'Very Poor',
  F: 'Dead',
};

/** Score bite reports for a zone (0–100) */
export function calcBiteScore(reports: BiteReport[], targetDate: Date): number {
  if (!reports.length) return 35; // baseline with no data
  const windowMs = 72 * 60 * 60 * 1000;
  const relevant = reports.filter(r => {
    const diff = Math.abs(r.timestamp.getTime() - targetDate.getTime());
    return diff < windowMs;
  });
  if (!relevant.length) return 30;
  const recencyWeighted = relevant.reduce((sum, r) => {
    const hoursOld = Math.abs(targetDate.getTime() - r.timestamp.getTime()) / 3600000;
    const recencyFactor = Math.max(0, 1 - hoursOld / 72);
    return sum + r.intensity * recencyFactor * (r.verified ? 1.2 : 1.0);
  }, 0);
  return Math.min(100, recencyWeighted / Math.max(relevant.length, 1));
}

/** Score marine conditions (0–100) — lower is better for anglers */
export function calcMarineScore(conditions: MarineConditions | null, species: Species[]): number {
  if (!conditions) return 50;

  // Wind penalty: calm = great, gusty = bad
  const windPenalty = conditions.windSpeedMph <= 10
    ? 0
    : conditions.windSpeedMph <= 20
    ? (conditions.windSpeedMph - 10) * 3
    : 30 + (conditions.windSpeedMph - 20) * 5;

  // Wave height penalty
  const wavePenalty = conditions.waveHeightFt <= 1
    ? 0
    : conditions.waveHeightFt <= 3
    ? (conditions.waveHeightFt - 1) * 8
    : 16 + (conditions.waveHeightFt - 3) * 12;

  // Water temp bonus: check if any target species prefers this temp
  const tempBonus = species.some(s =>
    conditions.waterTempF >= s.preferredWaterTempF[0] &&
    conditions.waterTempF <= s.preferredWaterTempF[1]
  ) ? 15 : 0;

  return Math.max(0, Math.min(100, 80 - windPenalty - wavePenalty + tempBonus));
}

/** Score fish season (0–100) based on monthly availability */
export function calcSeasonScore(species: Species[], targetDate: Date): number {
  const month = targetDate.getMonth(); // 0-indexed
  const scores = species.map(s => s.monthlyAvailability[month]);
  if (!scores.length) return 50;
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

/** Tide phase bonus: +1 for perfect tide, 0 for neutral, -0.5 for bad */
export function tideMultiplier(tide: TideInfo | null, species: Species[]): number {
  if (!tide) return 1.0;
  const phases = species.map(s => s.peakTidePhase);
  const matches = phases.filter(p => p === tide.phase || p === 'any').length;
  const ratio = matches / Math.max(phases.length, 1);
  return 0.85 + ratio * 0.3; // 0.85–1.15 range
}

/** Weighted composite score */
export function calcZoneScore(params: {
  biteScore: number;
  marineScore: number;
  seasonScore: number;
  tideMultiplier: number;
}): number {
  const raw =
    params.biteScore * 0.40 +
    params.marineScore * 0.35 +
    params.seasonScore * 0.25;
  return Math.max(0, Math.min(100, raw * params.tideMultiplier));
}

/** Confidence 0–1 based on how far into the future we're forecasting */
export function calcConfidence(forecastHoursAhead: number): number {
  if (forecastHoursAhead <= 0) return 1.0;
  if (forecastHoursAhead <= 24) return 1.0 - (forecastHoursAhead / 24) * 0.15;
  if (forecastHoursAhead <= 48) return 0.85 - ((forecastHoursAhead - 24) / 24) * 0.25;
  return 0.60 - ((forecastHoursAhead - 48) / 12) * 0.05;
}

export function windDirection(deg: number): string {
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return dirs[Math.round(deg / 22.5) % 16];
}

export function formatTempF(f: number): string {
  return `${f.toFixed(1)}°F`;
}

export function formatWind(mph: number, deg: number): string {
  return `${mph.toFixed(0)} mph ${windDirection(deg)}`;
}
