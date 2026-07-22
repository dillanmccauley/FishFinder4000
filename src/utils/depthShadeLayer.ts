import L from 'leaflet';
import type { DemGrid } from './spotDiscovery';

const M_TO_FT = 3.28084;
const RESOLUTION = 2;
// Translucent so the street/land basemap stays readable underneath
const ALPHA = Math.round(0.55 * 255);

/** Depth palette: light shallows → deep navy (feet) */
const DEPTH_STOPS: { d: number; r: number; g: number; b: number }[] = [
  { d: 0,  r: 168, g: 216, b: 232 },
  { d: 3,  r: 120, g: 190, b: 222 },
  { d: 6,  r: 74,  g: 156, b: 205 },
  { d: 12, r: 42,  g: 118, b: 182 },
  { d: 20, r: 24,  g: 88,  b: 152 },
  { d: 35, r: 14,  g: 60,  b: 118 },
  { d: 60, r: 8,   g: 38,  b: 88  },
];

function depthToRGB(depthFt: number): [number, number, number] {
  const d = Math.max(0, depthFt);
  let lo = DEPTH_STOPS[0];
  let hi = DEPTH_STOPS[DEPTH_STOPS.length - 1];
  for (let i = 0; i < DEPTH_STOPS.length - 1; i++) {
    if (d >= DEPTH_STOPS[i].d && d <= DEPTH_STOPS[i + 1].d) {
      lo = DEPTH_STOPS[i];
      hi = DEPTH_STOPS[i + 1];
      break;
    }
  }
  const t = hi.d === lo.d ? 0 : Math.min(1, (d - lo.d) / (hi.d - lo.d));
  return [
    Math.round(lo.r + (hi.r - lo.r) * t),
    Math.round(lo.g + (hi.g - lo.g) * t),
    Math.round(lo.b + (hi.b - lo.b) * t),
  ];
}

/**
 * Canvas layer rendering the high-res OIB bathymetry: depth-tinted water with a
 * simple NW-lit hillshade so channels, holes, and ledges pop. Land stays
 * transparent. Same overlayPane/rAF pattern as RasterHeatLayer, below it in z.
 */
export class DepthShadeLayer extends L.Layer {
  private _canvas: HTMLCanvasElement | null = null;
  private _mapInstance: L.Map | null = null;
  private _dem: DemGrid | null = null;
  private _rafId: number | null = null;

  setDem(dem: DemGrid | null): void {
    this._dem = dem;
    this._scheduleRender();
  }

  onAdd(map: L.Map): this {
    this._mapInstance = map;
    const pane = map.getPane('overlayPane')!;
    this._canvas = document.createElement('canvas');
    this._canvas.style.position = 'absolute';
    this._canvas.style.top = '0';
    this._canvas.style.left = '0';
    this._canvas.style.pointerEvents = 'none';
    this._canvas.style.zIndex = '195';
    pane.appendChild(this._canvas);
    map.on('moveend zoomend resize', this._scheduleRender, this);
    this._scheduleRender();
    return this;
  }

  onRemove(map: L.Map): this {
    map.off('moveend zoomend resize', this._scheduleRender, this);
    if (this._rafId !== null) { cancelAnimationFrame(this._rafId); this._rafId = null; }
    this._canvas?.remove();
    this._canvas = null;
    this._mapInstance = null;
    return this;
  }

  private _scheduleRender = (): void => {
    if (this._rafId !== null) cancelAnimationFrame(this._rafId);
    this._rafId = requestAnimationFrame(() => { this._rafId = null; this._render(); });
  };

  private _render(): void {
    const map = this._mapInstance;
    const dem = this._dem;
    if (!map || !this._canvas) return;

    const size = map.getSize();
    const w = size.x;
    const h = size.y;
    this._canvas.width = w;
    this._canvas.height = h;

    const topLeft = map.containerPointToLayerPoint([0, 0]);
    L.DomUtil.setPosition(this._canvas, topLeft);

    const ctx = this._canvas.getContext('2d')!;
    if (!dem) { ctx.clearRect(0, 0, w, h); return; }

    const imgData = ctx.createImageData(w, h);
    const data = imgData.data;

    const { elev, ncols, nrows } = dem;
    const midLat = (dem.north + dem.south) / 2;
    const cellXM = dem.cellLngDeg * 111320 * Math.cos((midLat * Math.PI) / 180);
    const cellYM = dem.cellLatDeg * 110574;

    for (let py = 0; py < h; py += RESOLUTION) {
      for (let px = 0; px < w; px += RESOLUTION) {
        const ll = map.containerPointToLatLng(L.point(px, py));
        const c = Math.floor((ll.lng - dem.west) / dem.cellLngDeg);
        const r = Math.floor((dem.north - ll.lat) / dem.cellLatDeg);
        if (c < 1 || c >= ncols - 1 || r < 1 || r >= nrows - 1) continue;

        const v = elev[r * ncols + c];
        if (!Number.isFinite(v) || v >= -0.1) continue; // land / dry / nodata → transparent

        let [red, green, blue] = depthToRGB(-v * M_TO_FT);

        // NW-lit hillshade from the local gradient
        const eL = elev[r * ncols + c - 1];
        const eR = elev[r * ncols + c + 1];
        const eU = elev[(r - 1) * ncols + c];
        const eD = elev[(r + 1) * ncols + c];
        if (Number.isFinite(eL) && Number.isFinite(eR) && Number.isFinite(eU) && Number.isFinite(eD)) {
          const dzdx = (eR - eL) / (2 * cellXM);
          const dzdy = (eU - eD) / (2 * cellYM);
          // light from NW: brighten slopes facing up-left, darken down-right
          const shade = 1 + Math.max(-0.45, Math.min(0.45, (dzdx + dzdy) * 6));
          red = Math.min(255, Math.round(red * shade));
          green = Math.min(255, Math.round(green * shade));
          blue = Math.min(255, Math.round(blue * shade));
        }

        for (let by = 0; by < RESOLUTION && py + by < h; by++) {
          for (let bx = 0; bx < RESOLUTION && px + bx < w; bx++) {
            const idx = ((py + by) * w + (px + bx)) * 4;
            data[idx] = red;
            data[idx + 1] = green;
            data[idx + 2] = blue;
            data[idx + 3] = ALPHA;
          }
        }
      }
    }

    ctx.putImageData(imgData, 0, 0);
  }
}
