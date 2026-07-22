import L from 'leaflet';
import type { GridPoint } from '../types';

const COLOR_STOPS = [
  { s: 0,   r: 127, g: 29,  b: 19  },
  { s: 26,  r: 220, g: 38,  b: 38  },
  { s: 42,  r: 234, g: 88,  b: 12  },
  { s: 58,  r: 202, g: 138, b: 4   },
  { s: 74,  r: 101, g: 163, b: 13  },
  { s: 88,  r: 22,  g: 163, b: 74  },
  { s: 100, r: 16,  g: 185, b: 129 },
];

export function scoreToRGB(score: number): [number, number, number] {
  const clamped = Math.max(0, Math.min(100, score));
  let lo = COLOR_STOPS[0];
  let hi = COLOR_STOPS[COLOR_STOPS.length - 1];
  for (let i = 0; i < COLOR_STOPS.length - 1; i++) {
    if (clamped >= COLOR_STOPS[i].s && clamped <= COLOR_STOPS[i + 1].s) {
      lo = COLOR_STOPS[i];
      hi = COLOR_STOPS[i + 1];
      break;
    }
  }
  const t = hi.s === lo.s ? 0 : (clamped - lo.s) / (hi.s - lo.s);
  return [
    Math.round(lo.r + (hi.r - lo.r) * t),
    Math.round(lo.g + (hi.g - lo.g) * t),
    Math.round(lo.b + (hi.b - lo.b) * t),
  ];
}

const RESOLUTION = 2;
const MAX_ALPHA = 0.75;

export class RasterHeatLayer extends L.Layer {
  private _canvas: HTMLCanvasElement | null = null;
  private _mapInstance: L.Map | null = null;
  private _grid: GridPoint[] = [];
  private _lats: number[] = [];
  private _lngs: number[] = [];
  private _scoreMap = new Map<string, number>();
  private _rafId: number | null = null;

  updateGrid(pts: GridPoint[]): void {
    this._grid = pts;

    // Build sorted unique lat/lng arrays and a fast score lookup
    const latSet = new Set(pts.map(p => p.lat));
    const lngSet = new Set(pts.map(p => p.lng));
    this._lats = [...latSet].sort((a, b) => a - b);
    this._lngs = [...lngSet].sort((a, b) => a - b);
    this._scoreMap.clear();
    pts.forEach(p => this._scoreMap.set(`${p.lat.toFixed(4)},${p.lng.toFixed(4)}`, p.score));

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
    this._canvas.style.zIndex = '200';
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

  private _bilinear(lat: number, lng: number): number | null {
    const lats = this._lats;
    const lngs = this._lngs;

    // Find surrounding grid cell
    let latLo = -1, lngLo = -1;
    for (let i = 0; i < lats.length - 1; i++) {
      if (lat >= lats[i] && lat <= lats[i + 1]) { latLo = i; break; }
    }
    for (let j = 0; j < lngs.length - 1; j++) {
      if (lng >= lngs[j] && lng <= lngs[j + 1]) { lngLo = j; break; }
    }
    if (latLo < 0 || lngLo < 0) return null;

    const la = lats[latLo], lb = lats[latLo + 1];
    const ga = lngs[lngLo], gb = lngs[lngLo + 1];

    const q11 = this._scoreMap.get(`${la.toFixed(4)},${ga.toFixed(4)}`);
    const q12 = this._scoreMap.get(`${la.toFixed(4)},${gb.toFixed(4)}`);
    const q21 = this._scoreMap.get(`${lb.toFixed(4)},${ga.toFixed(4)}`);
    const q22 = this._scoreMap.get(`${lb.toFixed(4)},${gb.toFixed(4)}`);

    if (q11 == null || q12 == null || q21 == null || q22 == null) return null;

    const tx = lb === la ? 0 : (lat - la) / (lb - la);
    const ty = gb === ga ? 0 : (lng - ga) / (gb - ga);

    return (
      q11 * (1 - tx) * (1 - ty) +
      q12 * (1 - tx) * ty +
      q21 * tx * (1 - ty) +
      q22 * tx * ty
    );
  }

  private _render(): void {
    const map = this._mapInstance;
    if (!map || !this._canvas || this._grid.length === 0 || this._lats.length < 2 || this._lngs.length < 2) return;

    const size = map.getSize();
    const w = size.x;
    const h = size.y;
    this._canvas.width = w;
    this._canvas.height = h;

    const topLeft = map.containerPointToLayerPoint([0, 0]);
    L.DomUtil.setPosition(this._canvas, topLeft);

    const ctx = this._canvas.getContext('2d')!;
    const imgData = ctx.createImageData(w, h);
    const data = imgData.data;

    const alpha = Math.round(MAX_ALPHA * 255);

    for (let py = 0; py < h; py += RESOLUTION) {
      for (let px = 0; px < w; px += RESOLUTION) {
        const ll = map.containerPointToLatLng(L.point(px, py));
        const score = this._bilinear(ll.lat, ll.lng);
        if (score === null) continue;

        const [r, g, b] = scoreToRGB(score);

        for (let by = 0; by < RESOLUTION && py + by < h; by++) {
          for (let bx = 0; bx < RESOLUTION && px + bx < w; bx++) {
            const idx = ((py + by) * w + (px + bx)) * 4;
            data[idx]     = r;
            data[idx + 1] = g;
            data[idx + 2] = b;
            data[idx + 3] = alpha;
          }
        }
      }
    }

    ctx.putImageData(imgData, 0, 0);
  }
}
