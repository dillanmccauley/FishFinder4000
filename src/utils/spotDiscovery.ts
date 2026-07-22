import type { LatLng, SpotCandidate } from '../types';
import { distanceMi } from './geo';

const M_TO_FT = 3.28084;

export const SPOT_KIND_COLOR: Record<SpotCandidate['kind'], string> = {
  hole: '#22d3ee',
  ledge: '#a78bfa',
  reef: '#f59e0b',
};

export const SPOT_KIND_LABEL: Record<SpotCandidate['kind'], string> = {
  hole: 'Hole',
  ledge: 'Drop-off',
  reef: 'Artificial Reef',
};

/** High-resolution elevation grid (row 0 = north). Negative elev = below sea level. */
export interface DemGrid {
  elev: Float32Array;
  ncols: number;
  nrows: number;
  west: number;
  east: number;
  south: number;
  north: number;
  cellLngDeg: number;
  cellLatDeg: number;
}

export function demElevAt(dem: DemGrid, lat: number, lng: number): number | null {
  const c = Math.floor((lng - dem.west) / dem.cellLngDeg);
  const r = Math.floor((dem.north - lat) / dem.cellLatDeg);
  if (c < 0 || c >= dem.ncols || r < 0 || r >= dem.nrows) return null;
  const v = dem.elev[r * dem.ncols + c];
  return Number.isFinite(v) ? v : null;
}

function cellLatLng(dem: DemGrid, r: number, c: number): { lat: number; lng: number } {
  return {
    lat: dem.north - (r + 0.5) * dem.cellLatDeg,
    lng: dem.west + (c + 0.5) * dem.cellLngDeg,
  };
}

interface RawCandidate {
  r: number;
  c: number;
  kind: 'hole' | 'ledge';
  depthM: number;
  reliefM: number;
  flatDepthM: number;
  strength: number;
}

/**
 * Discover discrete fishing-spot candidates from high-res bathymetry:
 *  - holes: cells markedly deeper than the surrounding bottom (250 m neighborhood mean)
 *  - ledges: steep depth gradients (channel edges, drop-offs)
 * Non-max suppression keeps the strongest candidates >= minSepM apart.
 */
export function computeSpots(
  dem: DemGrid,
  inlets: { name: string; loc: LatLng }[],
  maxSpots = 30,
): SpotCandidate[] {
  const { elev, ncols, nrows } = dem;
  const midLat = (dem.north + dem.south) / 2;
  const cellXM = dem.cellLngDeg * 111320 * Math.cos((midLat * Math.PI) / 180);
  const cellYM = dem.cellLatDeg * 110574;

  const WATER_MAX_ELEV = -0.3; // ignore intertidal / dry cells
  const NEIGHBORHOOD_M = 250;
  const MIN_SEP_M = 250;

  // Integral images of (water elev, water count) for O(1) neighborhood means
  const sumI = new Float64Array((ncols + 1) * (nrows + 1));
  const cntI = new Float64Array((ncols + 1) * (nrows + 1));
  for (let r = 0; r < nrows; r++) {
    for (let c = 0; c < ncols; c++) {
      const v = elev[r * ncols + c];
      const isWater = Number.isFinite(v) && v < WATER_MAX_ELEV;
      const i = (r + 1) * (ncols + 1) + (c + 1);
      sumI[i] = (isWater ? v : 0) + sumI[i - 1] + sumI[i - (ncols + 1)] - sumI[i - (ncols + 1) - 1];
      cntI[i] = (isWater ? 1 : 0) + cntI[i - 1] + cntI[i - (ncols + 1)] - cntI[i - (ncols + 1) - 1];
    }
  }

  const rx = Math.max(2, Math.round(NEIGHBORHOOD_M / cellXM));
  const ry = Math.max(2, Math.round(NEIGHBORHOOD_M / cellYM));

  function boxMean(r0: number, r1: number, c0: number, c1: number): { mean: number; count: number } {
    const rr0 = Math.max(0, r0);
    const rr1 = Math.min(nrows - 1, r1);
    const cc0 = Math.max(0, c0);
    const cc1 = Math.min(ncols - 1, c1);
    if (rr1 < rr0 || cc1 < cc0) return { mean: 0, count: 0 };
    const a = (rr1 + 1) * (ncols + 1) + (cc1 + 1);
    const b = rr0 * (ncols + 1) + (cc1 + 1);
    const d = (rr1 + 1) * (ncols + 1) + cc0;
    const e = rr0 * (ncols + 1) + cc0;
    const s = sumI[a] - sumI[b] - sumI[d] + sumI[e];
    const n = cntI[a] - cntI[b] - cntI[d] + cntI[e];
    return { mean: n > 0 ? s / n : 0, count: n };
  }

  const raw: RawCandidate[] = [];
  for (let r = 1; r < nrows - 1; r++) {
    for (let c = 1; c < ncols - 1; c++) {
      const v = elev[r * ncols + c];
      if (!Number.isFinite(v) || v >= WATER_MAX_ELEV) continue;

      const { mean, count } = boxMean(r - ry, r + ry, c - rx, c + rx);
      if (count < 20) continue; // too little water context (grid edge / tiny pond)

      const depthM = -v;
      const reliefM = mean - v; // positive → deeper than the wider surroundings

      const eL = elev[r * ncols + c - 1];
      const eR = elev[r * ncols + c + 1];
      const eU = elev[(r - 1) * ncols + c];
      const eD = elev[(r + 1) * ncols + c];
      let drop30 = 0;
      if (Number.isFinite(eL) && Number.isFinite(eR) && Number.isFinite(eU) && Number.isFinite(eD)) {
        const dzdx = (eR - eL) / (2 * cellXM);
        const dzdy = (eD - eU) / (2 * cellYM);
        drop30 = Math.sqrt(dzdx * dzdx + dzdy * dzdy) * 30; // meters of change over 30 m
      }

      if (reliefM < 0.8 && drop30 < 1.0) continue;
      if (depthM < 1.2) continue;

      // A true hole rises in ALL four directions; a channel/basin edge stays deep
      // on one side. Compare thin directional strips (skip 1 cell, out to the
      // neighborhood radius) against the cell's own elevation.
      const n4 = [
        boxMean(r - ry, r - 2, c, c),
        boxMean(r + 2, r + ry, c, c),
        boxMean(r, r, c - rx, c - 2),
        boxMean(r, r, c + 2, c + rx),
      ];
      let minDirRelief = Infinity;
      let dirCount = 0;
      for (const d of n4) {
        if (d.count < 3) continue;
        dirCount++;
        minDirRelief = Math.min(minDirRelief, d.mean - v);
      }

      if (dirCount === 4 && minDirRelief >= 0.8) {
        raw.push({ r, c, kind: 'hole', depthM, reliefM: minDirRelief, flatDepthM: -mean, strength: minDirRelief });
      } else if (drop30 >= 1.0) {
        raw.push({ r, c, kind: 'ledge', depthM, reliefM: drop30, flatDepthM: -mean, strength: drop30 * 0.85 });
      }
    }
  }

  // Per-kind non-max suppression so a long channel edge can't monopolize the
  // budget — holes are the rarer, more valuable find. Ledges get a wider
  // separation since they run in continuous lines.
  function nms(cands: RawCandidate[], sepM: number, cap: number): RawCandidate[] {
    const sorted = [...cands].sort((a, b) => b.strength - a.strength).slice(0, 5000);
    const kept: RawCandidate[] = [];
    const sepX = sepM / cellXM;
    const sepY = sepM / cellYM;
    for (const cand of sorted) {
      let tooClose = false;
      for (const k of kept) {
        const dx = (cand.c - k.c) / sepX;
        const dy = (cand.r - k.r) / sepY;
        if (dx * dx + dy * dy < 1) { tooClose = true; break; }
      }
      if (tooClose) continue;
      kept.push(cand);
      if (kept.length >= cap) break;
    }
    return kept;
  }

  const holeCap = Math.ceil(maxSpots * 0.6);
  const keptHoles = nms(raw.filter(x => x.kind === 'hole'), MIN_SEP_M, holeCap);
  const keptLedges = nms(raw.filter(x => x.kind === 'ledge'), MIN_SEP_M * 2, maxSpots - keptHoles.length);
  const kept = [...keptHoles, ...keptLedges];

  // Normalize structure quality within each kind (strengths aren't comparable across kinds)
  const maxByKind: Record<string, number> = {};
  kept.forEach(k => { maxByKind[k.kind] = Math.max(maxByKind[k.kind] ?? 0, k.strength); });

  return kept.map((k, i) => {
    const { lat, lng } = cellLatLng(dem, k.r, k.c);
    const depthFt = Math.round(k.depthM * M_TO_FT);
    const reliefFt = Math.round(k.reliefM * M_TO_FT);
    const flatFt = Math.max(1, Math.round(k.flatDepthM * M_TO_FT));

    let nearestInlet = inlets[0];
    let nearestMi = Infinity;
    for (const inlet of inlets) {
      const d = distanceMi({ lat, lng }, inlet.loc);
      if (d < nearestMi) { nearestMi = d; nearestInlet = inlet; }
    }
    const inletNote = nearestInlet ? `${nearestMi.toFixed(1)} mi to ${nearestInlet.name}` : '';

    const inletSuffix = inletNote ? ` · ${inletNote}` : '';
    const description = k.kind === 'hole'
      ? `${depthFt} ft hole in ${flatFt} ft flats — ${reliefFt} ft of relief${inletSuffix}`
      : `Drop-off: ~${Math.max(1, depthFt - reliefFt)}→${depthFt + reliefFt} ft over ~100 ft${inletSuffix}`;

    return {
      id: `dem-spot-${i}`,
      lat,
      lng,
      kind: k.kind,
      depthFt,
      reliefFt,
      structureScore: Math.round(40 + 60 * (k.strength / (maxByKind[k.kind] || 1))),
      description,
    };
  });
}
