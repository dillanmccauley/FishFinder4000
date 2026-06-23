import { useMemo } from 'react';
import { addHours, startOfHour } from 'date-fns';
import type { LatLng, HourlyScore, Species, TideInfo } from '../types';
import { HOTSPOTS } from '../data/hotspots';
import { SPECIES } from '../data/species';
import { nearestHotspot } from '../utils/geo';
import { useMarineData } from './useMarineData';
import {
  calcMoonScore,
  calcMarineScore,
  calcSeasonScore,
  calcTideScore,
  calcZoneScore,
  calcClarityScore,
  calcPressureScore,
  calcUVScore,
  calcBaitScore,
  scoreToGrade,
} from '../utils/scoring';

// NE: lat >= 37; SE: lat < 37
const NE_SPECIES_IDS = ['striped-bass', 'bluefish', 'summer-flounder', 'weakfish'];
const SE_SPECIES_IDS = ['red-drum', 'spotted-seatrout', 'flounder', 'snook', 'sheepshead'];

function speciesForPin(pin: LatLng): Species[] {
  const isNE = pin.lat >= 37;
  const ids = isNE ? NE_SPECIES_IDS : SE_SPECIES_IDS;
  return SPECIES.filter(s => ids.includes(s.id));
}

interface Params {
  pin: LatLng | null;
  getConditionsAt: (location: LatLng, date: Date) => ReturnType<ReturnType<typeof useMarineData>['getConditionsAt']>;
  getTideAt: (stationId: string, date: Date) => TideInfo | null;
  nowDate: Date;
}

export function useLocationForecast({ pin, getConditionsAt, getTideAt, nowDate }: Params): {
  hourlyScores: HourlyScore[];
  loading: boolean;
} {
  const fetchLoc = pin ?? { lat: 30.33, lng: -81.66 };
  const { loading } = useMarineData(fetchLoc);

  const hourlyScores = useMemo(() => {
    if (!pin) return [];

    const nearest = nearestHotspot(pin, HOTSPOTS);
    const tideStationId = nearest.tideStationId;
    const species = speciesForPin(pin);
    const isNortheast = pin.lat >= 37;
    const scores: HourlyScore[] = [];

    for (let h = -12; h < 60; h++) {
      const time = startOfHour(addHours(nowDate, h));
      const conditions = getConditionsAt(pin, time);
      const prevConditions = getConditionsAt(pin, addHours(time, -3));
      const tide = getTideAt(tideStationId, time);

      const { score: moonScore } = calcMoonScore(time);
      const marineScore = calcMarineScore(conditions, species);
      const pressureScore = calcPressureScore(conditions, prevConditions);
      const baseSeasonScore = calcSeasonScore(species, time, conditions?.waterTempF);
      const baitScore = calcBaitScore(time, isNortheast);
      const seasonScore = baseSeasonScore * 0.75 + baitScore * 0.25;
      const tideScore = calcTideScore(tide, species);
      const uvScore = calcUVScore(conditions, species);
      const clarityScore = calcClarityScore(conditions, nearest.depthRangeFt, time);
      const total = calcZoneScore({ marineScore, pressureScore, seasonScore, tideScore, moonScore, uvScore, clarityScore });

      scores.push({
        time,
        total,
        grade: scoreToGrade(total),
        marineScore,
        seasonScore,
        tideScore,
        moonScore,
        pressureScore,
        uvScore,
        clarityScore,
        conditions,
      });
    }

    return scores;
  }, [pin, getConditionsAt, getTideAt, nowDate, loading]);

  return { hourlyScores, loading };
}
