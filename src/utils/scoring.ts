import type { Grade, MarineConditions, TideInfo, Species } from '../types';

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

/**
 * Marine conditions score (0–100) from real Open-Meteo data.
 * Penalizes high wind and waves; bonuses when water temp suits active species.
 */
export function calcMarineScore(conditions: MarineConditions | null, species: Species[]): number {
  if (!conditions) return 50;

  const windPenalty = conditions.windSpeedMph <= 10
    ? 0
    : conditions.windSpeedMph <= 20
    ? (conditions.windSpeedMph - 10) * 3
    : 30 + (conditions.windSpeedMph - 20) * 5;

  const wavePenalty = conditions.waveHeightFt <= 1
    ? 0
    : conditions.waveHeightFt <= 3
    ? (conditions.waveHeightFt - 1) * 8
    : 16 + (conditions.waveHeightFt - 3) * 12;

  const tempBonus = species.some(s =>
    conditions.waterTempF >= s.preferredWaterTempF[0] &&
    conditions.waterTempF <= s.preferredWaterTempF[1]
  ) ? 15 : 0;

  return Math.max(0, Math.min(100, 80 - windPenalty - wavePenalty + tempBonus));
}

/**
 * Season & migration score (0–100).
 * Uses monthly availability arrays derived from known migration patterns,
 * then adjusts using real water temperature from Open-Meteo Marine API.
 * Species outside their preferred temp window are down-scored; those in
 * their ideal range receive a bonus.
 */
export function calcSeasonScore(
  species: Species[],
  targetDate: Date,
  waterTempF?: number | null,
): number {
  const month = targetDate.getMonth();
  const scores = species.map(s => {
    let base = s.monthlyAvailability[month];
    if (waterTempF != null) {
      const [lo, hi] = s.preferredWaterTempF;
      if (waterTempF < lo - 8 || waterTempF > hi + 8) {
        base *= 0.50; // well outside range — species absent or lethargic
      } else if (waterTempF < lo - 3 || waterTempF > hi + 3) {
        base *= 0.78; // outside range
      } else if (waterTempF >= lo && waterTempF <= hi) {
        base = Math.min(100, base * 1.15); // ideal temp band bonus
      }
    }
    return base;
  });
  if (!scores.length) return 50;
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

/**
 * Tide score (0–100) from real NOAA Tides & Currents predictions.
 * Phase match with species preferences earns up to 70 pts.
 * Active tidal movement (incoming/outgoing) adds a 30-pt movement bonus.
 */
export function calcTideScore(tide: TideInfo | null, species: Species[]): number {
  if (!tide) return 50;
  const phases = species.map(s => s.peakTidePhase);
  const matches = phases.filter(p => p === tide.phase || p === 'any').length;
  const ratio = matches / Math.max(phases.length, 1);
  const phaseScore = ratio * 70;
  const movementBonus = (tide.phase === 'incoming' || tide.phase === 'outgoing') ? 30 : 15;
  return Math.min(100, phaseScore + movementBonus);
}

/**
 * Moon/solunar score (0–100) — calculated from the lunar cycle, no API needed.
 * New moon and full moon = gravitational peak = maximum tidal range = best
 * feeding activity. Quarter moons score lowest (~50).
 *
 * Reference new moon: 2000-01-06 18:14 UTC (J2000 epoch alignment).
 * Synodic period: 29.53058867 days.
 */
export function calcMoonScore(date: Date): {
  score: number;
  phase: number;
  phaseName: string;
  phaseEmoji: string;
} {
  const KNOWN_NEW_MOON = new Date('2000-01-06T18:14:00Z').getTime();
  const SYNODIC_PERIOD = 29.53058867;
  const msPerDay = 86400000;

  const daysSince = (date.getTime() - KNOWN_NEW_MOON) / msPerDay;
  const raw = ((daysSince % SYNODIC_PERIOD) + SYNODIC_PERIOD) % SYNODIC_PERIOD;
  const phase = raw / SYNODIC_PERIOD; // 0 = new, 0.5 = full

  // |cos(2π·phase)| peaks at 0 (new) and 0.5 (full), dips at quarters
  const score = 50 + Math.abs(Math.cos(Math.PI * 2 * phase)) * 50;

  let phaseName: string;
  let phaseEmoji: string;
  if (phase < 0.03 || phase >= 0.97)      { phaseName = 'New Moon';        phaseEmoji = '🌑'; }
  else if (phase < 0.22)                  { phaseName = 'Waxing Crescent'; phaseEmoji = '🌒'; }
  else if (phase < 0.28)                  { phaseName = 'First Quarter';   phaseEmoji = '🌓'; }
  else if (phase < 0.47)                  { phaseName = 'Waxing Gibbous';  phaseEmoji = '🌔'; }
  else if (phase < 0.53)                  { phaseName = 'Full Moon';       phaseEmoji = '🌕'; }
  else if (phase < 0.72)                  { phaseName = 'Waning Gibbous';  phaseEmoji = '🌖'; }
  else if (phase < 0.78)                  { phaseName = 'Last Quarter';    phaseEmoji = '🌗'; }
  else                                    { phaseName = 'Waning Crescent'; phaseEmoji = '🌘'; }

  return { score, phase, phaseName, phaseEmoji };
}

/** Weighted composite from four fully-real data sources */
export function calcZoneScore(params: {
  marineScore: number;
  seasonScore: number;
  tideScore: number;
  moonScore: number;
}): number {
  const raw =
    params.marineScore * 0.40 +
    params.seasonScore * 0.35 +
    params.tideScore  * 0.15 +
    params.moonScore  * 0.10;
  return Math.max(0, Math.min(100, raw));
}

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
