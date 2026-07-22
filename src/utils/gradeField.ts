import type { Species, SpotCandidate } from '../types';
import type { OIBSpeciesProfile } from '../data/oibConfig';
import { OIB_INLETS } from '../data/oibConfig';
import type { DemGrid } from './spotDiscovery';

/**
 * Static per-cell "where" component of the per-pixel fishing grade for one
 * species: depth fit + structure proximity + zone mask. The time-varying
 * condition score is blended in at render time by the layer, so this field
 * only recomputes when the species (or spots) change — not every scrub tick.
 *
 * field[i] = 0.45 * depthFit(0–100) * zoneFactor + structureBonus(0–18)
 * NaN = land / dry / outside data.
 */
const STRUCTURE_RADIUS_M = 250;
const MAX_STRUCTURE_BONUS = 18;
const M_TO_FT = 3.28084;

/**
 * Rough ICW/ocean divider: the barrier island axis through Tubbs and Shallotte
 * inlets. South of the line = open ocean side, north = ICW/estuary side.
 */
function oceanSideLat(lng: number): number {
  const a = OIB_INLETS[1].loc; // Tubbs (west)
  const b = OIB_INLETS[0].loc; // Shallotte (east)
  const t = (lng - a.lng) / (b.lng - a.lng);
  return a.lat + (b.lat - a.lat) * t;
}

/**
 * Same formula as computeGradeField, evaluated at a single point — used by the
 * click-anywhere "what's best right here" popup. Returns null on land/no-data.
 * Keep the tiers/weights in sync with the bulk version above.
 */
export function spatialScoreAt(
  dem: DemGrid,
  spots: SpotCandidate[],
  species: Species,
  profile: OIBSpeciesProfile,
  lat: number,
  lng: number,
): number | null {
  const c = Math.floor((lng - dem.west) / dem.cellLngDeg);
  const r = Math.floor((dem.north - lat) / dem.cellLatDeg);
  if (c < 0 || c >= dem.ncols || r < 0 || r >= dem.nrows) return null;
  const v = dem.elev[r * dem.ncols + c];
  if (!Number.isFinite(v) || v >= -0.3) return null;

  const depthFt = -v * M_TO_FT;
  const [lo, hi] = species.depthRangeFt;
  const range = Math.max(hi - lo, 1);
  let fit: number;
  if (depthFt >= lo && depthFt <= hi) fit = 95;
  else {
    const dist = Math.min(Math.abs(depthFt - lo), Math.abs(depthFt - hi));
    fit = dist <= range * 0.5 ? 75 : dist <= range * 1.5 ? 50 : dist <= range * 3 ? 25 : 10;
  }

  let zoneFactor = 1;
  if (profile.zone !== 'both') {
    const isOcean = lat < oceanSideLat(lng);
    if (profile.zone === 'icw' && isOcean) zoneFactor = 0.55;
    if (profile.zone === 'nearshore' && !isOcean) zoneFactor = 0.55;
  }

  const midLat = (dem.north + dem.south) / 2;
  const mPerDegLng = 111320 * Math.cos((midLat * Math.PI) / 180);
  let bonus = 0;
  for (const spot of spots) {
    const affinity = profile.structureAffinity[spot.kind] ?? 0.3;
    const maxBonus = MAX_STRUCTURE_BONUS * affinity * (spot.structureScore / 100);
    if (maxBonus <= 1) continue;
    const distM = Math.sqrt(((spot.lat - lat) * 110574) ** 2 + ((spot.lng - lng) * mPerDegLng) ** 2);
    if (distM > STRUCTURE_RADIUS_M) continue;
    bonus = Math.max(bonus, maxBonus * (1 - distM / STRUCTURE_RADIUS_M));
  }

  return Math.min(0.45 * fit * zoneFactor + bonus, 0.45 * 95 + MAX_STRUCTURE_BONUS);
}

export function computeGradeField(
  dem: DemGrid,
  spots: SpotCandidate[],
  species: Species,
  profile: OIBSpeciesProfile,
): Float32Array {
  const { elev, ncols, nrows } = dem;
  const midLat = (dem.north + dem.south) / 2;
  const cellXM = dem.cellLngDeg * 111320 * Math.cos((midLat * Math.PI) / 180);
  const cellYM = dem.cellLatDeg * 110574;

  const [lo, hi] = species.depthRangeFt;
  const range = Math.max(hi - lo, 1);

  const field = new Float32Array(ncols * nrows).fill(NaN);

  // Depth fit + zone mask (same tiers as calcDepthScore for a single species)
  for (let r = 0; r < nrows; r++) {
    const lat = dem.north - (r + 0.5) * dem.cellLatDeg;
    for (let c = 0; c < ncols; c++) {
      const v = elev[r * ncols + c];
      if (!Number.isFinite(v) || v >= -0.3) continue;

      const depthFt = -v * M_TO_FT;
      let fit: number;
      if (depthFt >= lo && depthFt <= hi) fit = 95;
      else {
        const dist = Math.min(Math.abs(depthFt - lo), Math.abs(depthFt - hi));
        fit = dist <= range * 0.5 ? 75 : dist <= range * 1.5 ? 50 : dist <= range * 3 ? 25 : 10;
      }

      let zoneFactor = 1;
      if (profile.zone !== 'both') {
        const lng = dem.west + (c + 0.5) * dem.cellLngDeg;
        const isOcean = lat < oceanSideLat(lng);
        if (profile.zone === 'icw' && isOcean) zoneFactor = 0.55;
        if (profile.zone === 'nearshore' && !isOcean) zoneFactor = 0.55;
      }

      field[r * ncols + c] = 0.45 * fit * zoneFactor;
    }
  }

  // Stamp structure-proximity bonus around each spot, weighted by the species'
  // affinity for that structure kind; linear decay to the radius. Overlapping
  // stamps max-combine (matching spatialScoreAt) so clustered weak spots never
  // outbid one strong spot.
  const rx = Math.max(1, Math.round(STRUCTURE_RADIUS_M / cellXM));
  const ry = Math.max(1, Math.round(STRUCTURE_RADIUS_M / cellYM));
  const bonusField = new Float32Array(ncols * nrows);

  for (const spot of spots) {
    const affinity = profile.structureAffinity[spot.kind] ?? 0.3;
    const maxBonus = MAX_STRUCTURE_BONUS * affinity * (spot.structureScore / 100);
    if (maxBonus <= 1) continue;

    const sc = Math.floor((spot.lng - dem.west) / dem.cellLngDeg);
    const sr = Math.floor((dem.north - spot.lat) / dem.cellLatDeg);

    for (let dr = -ry; dr <= ry; dr++) {
      const r = sr + dr;
      if (r < 0 || r >= nrows) continue;
      for (let dc = -rx; dc <= rx; dc++) {
        const c = sc + dc;
        if (c < 0 || c >= ncols) continue;
        const i = r * ncols + c;

        const distM = Math.sqrt((dr * cellYM) ** 2 + (dc * cellXM) ** 2);
        if (distM > STRUCTURE_RADIUS_M) continue;
        const bonus = maxBonus * (1 - distM / STRUCTURE_RADIUS_M);
        if (bonus > bonusField[i]) bonusField[i] = bonus;
      }
    }
  }

  const cap = 0.45 * 95 + MAX_STRUCTURE_BONUS;
  for (let i = 0; i < field.length; i++) {
    if (Number.isFinite(field[i])) field[i] = Math.min(field[i] + bonusField[i], cap);
  }

  return field;
}
