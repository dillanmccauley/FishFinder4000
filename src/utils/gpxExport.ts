import { format } from 'date-fns';
import type { Grade, SpotCandidate } from '../types';
import type { FishingRegion } from '../data/regions';
import type { SpeciesOutlook } from '../hooks/useRegionForecast';
import { spatialScoreAt } from './gradeField';
import { scoreToGrade } from './scoring';
import type { DemGrid } from './spotDiscovery';

/**
 * Exports discovered fishing spots as GPX waypoints for Garmin chartplotters
 * (ECHOMAP / GPSMAP). The structure is permanent; the species grades encoded in
 * each waypoint are a snapshot from export time.
 */

/** Conservative Garmin symbol names — unknown values fall back to a default dot */
const SPOT_SYMBOL: Record<SpotCandidate['kind'], string> = {
  hole: 'Fishing Area',
  ledge: 'Fishing Area',
  reef: 'Shipwreck',
};

const KIND_SHORT: Record<SpotCandidate['kind'], string> = {
  hole: 'Hole',
  ledge: 'Ledge',
  reef: 'Reef',
};

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Score one species at one spot — the same blend the map popup and heatmap use
 * (0.55 × time-varying condition score + spatial fit). Kept here so the export
 * and the UI cannot drift apart.
 */
export function scoreSpotForSpecies(
  spot: SpotCandidate,
  outlook: SpeciesOutlook,
  dem: DemGrid,
  spots: SpotCandidate[],
  region: FishingRegion,
): { score: number; grade: Grade } | null {
  const spatial = spatialScoreAt(
    dem, spots, outlook.species, outlook.profile, region.oceanDivider, spot.lat, spot.lng,
  );
  if (spatial == null) return null;
  const score = Math.round(Math.max(0, Math.min(100, 0.55 * outlook.scoreNow + spatial)));
  return { score, grade: scoreToGrade(score) };
}

/**
 * Rank spots by how well they suit one species: structure affinity × structure
 * quality, plus depth fit. Shared by the panel's "best spots" list and the
 * species-scoped export.
 */
export function rankSpotsForSpecies(spots: SpotCandidate[], outlook: SpeciesOutlook): SpotCandidate[] {
  const { profile, species } = outlook;
  const [lo, hi] = species.depthRangeFt;
  const range = Math.max(hi - lo, 1);
  return spots
    .map(spot => {
      const affinity = profile.structureAffinity[spot.kind] ?? 0.3;
      let fit = affinity * spot.structureScore;
      if (spot.depthFt > 0) {
        const dist = spot.depthFt >= lo && spot.depthFt <= hi
          ? 0
          : Math.min(Math.abs(spot.depthFt - lo), Math.abs(spot.depthFt - hi));
        const depthFit = dist === 0 ? 95 : dist <= range * 0.5 ? 75 : dist <= range * 1.5 ? 50 : dist <= range * 3 ? 25 : 10;
        fit += depthFit * 0.35;
      }
      return { spot, fit };
    })
    .sort((a, b) => b.fit - a.fit)
    .map(x => x.spot);
}

export interface GpxOptions {
  /** 'all' = every spot; 'species' = top N for the selected species */
  scope: 'all' | 'species';
  /** Required when scope is 'species' */
  outlook?: SpeciesOutlook | null;
  limit?: number;
}

/** Spots that a given export scope would include, in export order */
export function spotsForScope(
  spots: SpotCandidate[],
  opts: GpxOptions,
): SpotCandidate[] {
  if (opts.scope === 'species' && opts.outlook) {
    return rankSpotsForSpecies(spots, opts.outlook).slice(0, opts.limit ?? 10);
  }
  return spots;
}

export function buildSpotsGpx(
  spots: SpotCandidate[],
  outlooks: SpeciesOutlook[],
  region: FishingRegion,
  dem: DemGrid,
  targetDate: Date,
  opts: GpxOptions,
): string {
  const selected = spotsForScope(spots, opts);
  const nowIso = new Date().toISOString();

  const waypoints = selected.map(spot => {
    // Rank every species at this exact spot
    const ranked = outlooks
      .map(o => {
        const s = scoreSpotForSpecies(spot, o, dem, spots, region);
        return s ? { outlook: o, ...s } : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => b.score - a.score);

    const leader = ranked[0];
    const depthLabel = spot.depthFt > 0 ? String(spot.depthFt) : '';
    // Front-load the verdict — plotters display only ~10-16 chars
    const name = leader
      ? `${leader.grade}${leader.score} ${KIND_SHORT[spot.kind]}${depthLabel}`
      : `${KIND_SHORT[spot.kind]}${depthLabel}`;

    const parts: string[] = [];
    if (ranked.length) {
      parts.push(ranked.slice(0, 3).map(r => `${r.outlook.species.commonName} ${r.grade}${r.score}`).join(' · '));
    }
    if (leader?.outlook.bestWindow) {
      const w = leader.outlook.bestWindow;
      parts.push(`Best: ${format(w.startTime, 'EEE h a')}-${format(w.endTime, 'h a')}`);
    }
    parts.push(spot.description);
    if (leader) parts.push(leader.outlook.profile.tactic);
    const desc = parts.join(' | ');

    return [
      `  <wpt lat="${spot.lat.toFixed(6)}" lon="${spot.lng.toFixed(6)}">`,
      `    <time>${nowIso}</time>`,
      `    <name>${escapeXml(name)}</name>`,
      `    <cmt>${escapeXml(desc)}</cmt>`,
      `    <desc>${escapeXml(desc)}</desc>`,
      `    <sym>${escapeXml(SPOT_SYMBOL[spot.kind])}</sym>`,
      `  </wpt>`,
    ].join('\n');
  });

  const scopeLabel = opts.scope === 'species' && opts.outlook
    ? `best spots for ${opts.outlook.species.commonName}`
    : 'all structure spots';
  const metaDesc =
    `FishFinder4000 — ${scopeLabel} in ${region.name}. ` +
    `Structure is permanent; species grades are a snapshot for ${format(targetDate, 'PPp')}.`;

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<gpx version="1.1" creator="FishFinder4000" xmlns="http://www.topografix.com/GPX/1/1" ` +
      `xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ` +
      `xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">`,
    `  <metadata>`,
    `    <name>${escapeXml(`FishFinder4000 — ${region.name}`)}</name>`,
    `    <desc>${escapeXml(metaDesc)}</desc>`,
    `    <time>${nowIso}</time>`,
    `  </metadata>`,
    ...waypoints,
    `</gpx>`,
  ].join('\n');
}

export function gpxFilename(region: FishingRegion): string {
  const slug = region.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `fishfinder-${slug}-${format(new Date(), 'yyyy-MM-dd')}.gpx`;
}

/**
 * Hand the GPX to another app via the native share sheet (ActiveCaptain on
 * phones). Returns 'unsupported' when file sharing isn't available so the
 * caller can fall back to a download.
 */
export async function shareGpx(filename: string, xml: string): Promise<'shared' | 'unsupported'> {
  const nav = navigator as Navigator & {
    canShare?: (data: { files?: File[] }) => boolean;
    share?: (data: { files?: File[]; title?: string; text?: string }) => Promise<void>;
  };
  if (!nav.share || !nav.canShare) return 'unsupported';

  // Some share targets filter on MIME type — try the correct one, then a generic binary
  for (const type of ['application/gpx+xml', 'application/octet-stream']) {
    const file = new File([xml], filename, { type });
    if (!nav.canShare({ files: [file] })) continue;
    try {
      await nav.share({ files: [file], title: 'FishFinder spots' });
      return 'shared';
    } catch (err) {
      // User dismissed the sheet — treat as handled, don't also trigger a download
      if (err instanceof DOMException && err.name === 'AbortError') return 'shared';
      // Otherwise try the next MIME type
    }
  }
  return 'unsupported';
}

export function downloadGpx(filename: string, xml: string): void {
  const blob = new Blob([xml], { type: 'application/gpx+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** True when the browser can hand files to other apps (phones/tablets) */
export function canShareFiles(): boolean {
  const nav = navigator as Navigator & { canShare?: (d: { files?: File[] }) => boolean; share?: unknown };
  if (!nav.share || !nav.canShare) return false;
  try {
    return nav.canShare({ files: [new File([''], 't.gpx', { type: 'application/gpx+xml' })] })
      || nav.canShare({ files: [new File([''], 't.gpx', { type: 'application/octet-stream' })] });
  } catch {
    return false;
  }
}
