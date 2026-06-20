import { useState, useEffect, useRef } from 'react';
import type { MarineConditions, LatLng } from '../types';
import { addHours, startOfHour } from 'date-fns';

interface HourlyMarineCache {
  [key: string]: MarineConditions;
}

const CACHE: HourlyMarineCache = {};

function cacheKey(lat: number, lng: number, iso: string) {
  return `${lat.toFixed(2)},${lng.toFixed(2)}@${iso}`;
}

/** Clamp celsius to fahrenheit */
function cToF(c: number) {
  return c * 9 / 5 + 32;
}

function metersToFt(m: number) {
  return m * 3.28084;
}

function msToMph(ms: number) {
  return ms * 2.23694;
}

export interface MarineDataResult {
  getConditionsAt: (location: LatLng, targetDate: Date) => MarineConditions | null;
  loading: boolean;
  error: string | null;
}

/**
 * Fetches 72h of marine + weather data from Open-Meteo (no API key required).
 * Data is indexed by hour so the time scrubber can query any offset instantly.
 */
export function useMarineData(location: LatLng): MarineDataResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const locationKey = `${location.lat.toFixed(2)},${location.lng.toFixed(2)}`;
  const lastFetched = useRef<string>('');

  useEffect(() => {
    if (lastFetched.current === locationKey) return;
    lastFetched.current = locationKey;
    setLoading(true);

    const marineUrl = `https://marine-api.open-meteo.com/v1/marine?latitude=${location.lat}&longitude=${location.lng}&hourly=wave_height,sea_surface_temperature&timezone=America%2FNew_York&forecast_days=4&past_days=1`;
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${location.lat}&longitude=${location.lng}&hourly=wind_speed_10m,wind_direction_10m,visibility&timezone=America%2FNew_York&forecast_days=4&past_days=1&wind_speed_unit=mph`;

    Promise.all([fetch(marineUrl), fetch(weatherUrl)])
      .then(async ([mr, wr]) => {
        const [marine, weather] = await Promise.all([mr.json(), wr.json()]);
        const times: string[] = marine.hourly?.time ?? [];
        times.forEach((isoTime, i) => {
          const key = cacheKey(location.lat, location.lng, isoTime);
          CACHE[key] = {
            waterTempF: cToF(marine.hourly.sea_surface_temperature?.[i] ?? 24),
            waveHeightFt: metersToFt(marine.hourly.wave_height?.[i] ?? 0.3),
            windSpeedMph: msToMph(weather.hourly?.wind_speed_10m?.[i] ?? 8),
            windDirectionDeg: weather.hourly?.wind_direction_10m?.[i] ?? 180,
            visibilityMi: (weather.hourly?.visibility?.[i] ?? 10000) / 1609.34,
            timestamp: new Date(isoTime),
          };
        });
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
        // Seed fallback data so the map still works
        seedFallbackData(location);
      });
  }, [locationKey]);

  function getConditionsAt(loc: LatLng, targetDate: Date): MarineConditions | null {
    const rounded = startOfHour(targetDate);
    const iso = rounded.toISOString().slice(0, 16);
    const key = cacheKey(loc.lat, loc.lng, iso);

    if (CACHE[key]) return CACHE[key];

    const locPrefix = `${loc.lat.toFixed(2)},${loc.lng.toFixed(2)}@`;
    const targetMs = rounded.getTime();
    let best: MarineConditions | null = null;
    let bestDiff = Infinity;
    for (const [k, v] of Object.entries(CACHE)) {
      if (!k.startsWith(locPrefix)) continue;
      const diff = Math.abs(v.timestamp.getTime() - targetMs);
      if (diff < bestDiff) { bestDiff = diff; best = v; }
    }
    if (best) return best;

    // Final fallback: nearest time from ANY cached location
    for (const [, v] of Object.entries(CACHE)) {
      const diff = Math.abs(v.timestamp.getTime() - targetMs);
      if (diff < bestDiff) { bestDiff = diff; best = v; }
    }
    return best;
  }

  return { getConditionsAt, loading, error };
}

function seedFallbackData(location: LatLng) {
  const now = new Date();
  for (let h = -12; h <= 60; h++) {
    const t = startOfHour(addHours(now, h));
    const iso = t.toISOString().slice(0, 13) + ':00';
    const key = cacheKey(location.lat, location.lng, iso);
    if (!CACHE[key]) {
      // Realistic SE US coastal fallback
      const seasonalBase = 75 + 10 * Math.sin((t.getMonth() / 12) * 2 * Math.PI);
      CACHE[key] = {
        waterTempF: seasonalBase + (Math.random() * 4 - 2),
        waveHeightFt: 1.5 + Math.random() * 2,
        windSpeedMph: 8 + Math.random() * 12,
        windDirectionDeg: 180 + (Math.random() * 90 - 45),
        visibilityMi: 8 + Math.random() * 4,
        timestamp: t,
      };
    }
  }
}
