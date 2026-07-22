import { useState, useEffect } from 'react';
import type { SpotCandidate } from '../types';
import { OIB_BBOX } from '../data/oibConfig';
import { computeSpots, type DemGrid } from '../utils/spotDiscovery';

/**
 * Fetches high-resolution bathymetry for the Ocean Isle Beach box from NCEI's
 * DEM mosaic ImageServers (CUDEM tiles ≈ 3 m native) and derives fishing-spot
 * candidates. ~15 m sampling — fine enough to resolve ICW holes and channel edges.
 *
 * Fallback chain: DEM_tiles_mosaic (1/9 arc-sec CUDEM) → DEM_all → CRM_mosaic (~90 m).
 */
const DEM_SERVICES = [
  'https://gis.ngdc.noaa.gov/arcgis/rest/services/DEM_mosaics/DEM_tiles_mosaic/ImageServer',
  'https://gis.ngdc.noaa.gov/arcgis/rest/services/DEM_mosaics/DEM_all/ImageServer',
  'https://gis.ngdc.noaa.gov/arcgis/rest/services/DEM_mosaics/CRM_mosaic/ImageServer',
];

const NCOLS = 1400;
const NROWS = 768;

interface OIBDemState {
  dem: DemGrid | null;
  spots: SpotCandidate[];
  loading: boolean;
  error: string | null;
}

// Module-level cache — DEM is static seafloor data; fetch once per session
let cached: { dem: DemGrid; spots: SpotCandidate[] } | null = null;
let inflight: Promise<{ dem: DemGrid; spots: SpotCandidate[] }> | null = null;

async function fetchDem(): Promise<{ dem: DemGrid; spots: SpotCandidate[] }> {
  const { sw, ne } = OIB_BBOX;
  const bbox = `${sw.lng},${sw.lat},${ne.lng},${ne.lat}`;
  const params =
    `bbox=${encodeURIComponent(bbox)}&bboxSR=4326&imageSR=4326` +
    `&size=${NCOLS},${NROWS}&format=tiff&pixelType=F32` +
    `&interpolation=RSP_BilinearInterpolation&f=image`;

  let lastErr: Error | null = null;
  for (const service of DEM_SERVICES) {
    try {
      const res = await fetch(`${service}/exportImage?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = await res.arrayBuffer();
      if (buf.byteLength < 1000) throw new Error('empty response');

      // geotiff is heavy — load it lazily so the main bundle stays lean
      const { fromArrayBuffer } = await import('geotiff');
      const tiff = await fromArrayBuffer(buf);
      const img = await tiff.getImage();
      // Trust the actual raster dimensions, not the requested ones
      const width = img.getWidth();
      const height = img.getHeight();
      const rasters = await img.readRasters({ interleave: false });
      const band = (Array.isArray(rasters) ? rasters[0] : rasters) as Float32Array;
      if (!band || width < 100 || height < 100 || band.length < width * height) {
        throw new Error('bad raster size');
      }

      // Normalize nodata (huge sentinel values) to NaN
      const elev = new Float32Array(band.length);
      for (let i = 0; i < band.length; i++) {
        const v = band[i];
        elev[i] = Number.isFinite(v) && Math.abs(v) < 12000 ? v : NaN;
      }

      // exportImage snaps the raster to the source pixel grid, so the actual
      // extent can differ from the requested bbox by a fraction of a cell —
      // enough to visibly misregister the overlay at high zoom. Read the true
      // extent from the GeoTIFF's own georeferencing tags when available.
      let west = sw.lng, east = ne.lng, south = sw.lat, north = ne.lat;
      try {
        const bb = img.getBoundingBox(); // [minX, minY, maxX, maxY] in image CRS
        const plausible =
          Array.isArray(bb) && bb.length === 4 && bb.every(v => Number.isFinite(v)) &&
          Math.abs(bb[0] - sw.lng) < 0.05 && Math.abs(bb[1] - sw.lat) < 0.05 &&
          Math.abs(bb[2] - ne.lng) < 0.05 && Math.abs(bb[3] - ne.lat) < 0.05;
        if (plausible) { west = bb[0]; south = bb[1]; east = bb[2]; north = bb[3]; }
      } catch { /* keep the requested bbox */ }

      const dem: DemGrid = {
        elev,
        ncols: width,
        nrows: height,
        west,
        east,
        south,
        north,
        cellLngDeg: (east - west) / width,
        cellLatDeg: (north - south) / height,
      };

      // Sanity check: the box is mostly ocean — demand a real share of water cells
      let waterCells = 0;
      for (let i = 0; i < elev.length; i += 37) {
        if (Number.isFinite(elev[i]) && elev[i] < -0.3) waterCells++;
      }
      if (waterCells < elev.length / 37 * 0.1) throw new Error('raster contains no water');

      const spots = computeSpots(dem);
      return { dem, spots };
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
    }
  }
  throw lastErr ?? new Error('all DEM services failed');
}

export function useOIBDem(enabled: boolean): OIBDemState {
  const [state, setState] = useState<OIBDemState>(() => ({
    dem: cached?.dem ?? null,
    spots: cached?.spots ?? [],
    loading: false,
    error: null,
  }));

  useEffect(() => {
    if (!enabled || cached) return;
    let cancelled = false;

    setState(s => ({ ...s, loading: true, error: null }));
    if (!inflight) inflight = fetchDem();

    inflight
      .then(result => {
        cached = result;
        if (!cancelled) setState({ dem: result.dem, spots: result.spots, loading: false, error: null });
      })
      .catch(err => {
        inflight = null;
        if (!cancelled) setState({ dem: null, spots: [], loading: false, error: err.message ?? 'DEM fetch failed' });
      });

    return () => { cancelled = true; };
  }, [enabled]);

  return state;
}
