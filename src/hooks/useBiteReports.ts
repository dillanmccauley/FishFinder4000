import { useMemo } from 'react';
import type { BiteReport } from '../types';
import { HOTSPOTS } from '../data/hotspots';
import { subHours, addHours } from 'date-fns';

const SOURCES = ['Fishbrain', 'Anglr', 'Local Guide', 'Captain Log', 'Tournament Report', 'Forum Post'];

/**
 * Generates realistic synthetic bite reports for SE US hotspots.
 * In production, replace this with live Fishbrain/Anglr API calls.
 * Reports are seeded deterministically per hotspot so they don't change on re-render.
 */
export function useBiteReports(): BiteReport[] {
  return useMemo(() => {
    const now = new Date();
    const reports: BiteReport[] = [];

    HOTSPOTS.forEach((hotspot, hi) => {
      // 2–6 reports per hotspot spanning last 48 hours
      const count = 2 + (hi % 5);
      for (let i = 0; i < count; i++) {
        // Deterministic pseudo-random using hotspot index
        const seed = (hi * 31 + i * 17) % 100;
        const hoursAgo = ((seed * 0.48) % 48); // 0–48h ago
        const speciesId = hotspot.activeSpeciesIds[i % hotspot.activeSpeciesIds.length];
        reports.push({
          hotspotId: hotspot.id,
          speciesId,
          intensity: 30 + ((seed * 1.3 + hi * 7) % 70), // 30–100
          timestamp: subHours(now, hoursAgo),
          source: SOURCES[(hi + i) % SOURCES.length],
          verified: seed > 50,
        });
      }
      // Add a forecast signal for next 12h (lower intensity, unverified)
      const forecastSeed = (hi * 13) % 100;
      reports.push({
        hotspotId: hotspot.id,
        speciesId: hotspot.activeSpeciesIds[0],
        intensity: 20 + (forecastSeed % 40),
        timestamp: addHours(now, 6 + (forecastSeed % 18)),
        source: 'Forecast Model',
        verified: false,
      });
    });

    return reports;
  }, []);
}
