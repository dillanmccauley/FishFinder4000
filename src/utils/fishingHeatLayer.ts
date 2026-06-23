import L from 'leaflet';

interface HeatPoint { lat: number; lng: number; score: number; }

const COLOR_STOPS = [
  { s: 0,   r: 127, g: 29,  b: 19  },
  { s: 26,  r: 220, g: 38,  b: 38  },
  { s: 42,  r: 234, g: 88,  b: 12  },
  { s: 58,  r: 202, g: 138, b: 4   },
  { s: 74,  r: 101, g: 163, b: 13  },
  { s: 88,  r: 22,  g: 163, b: 74  },
  { s: 100, r: 16,  g: 185, b: 129 },
];

function scoreToRGB(score: number): [number, number, number] {
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

const RESOLUTION = 3;
const FADE_START = 150;
const FADE_END = 230;
const MAX_ALPHA = 0.60;

export class FishingHeatLayer extends L.Layer {
  private _canvas: HTMLCanvasElement | null = null;
  private _points: HeatPoint[] = [];
  private _rafId: number | null = null;

  updatePoints(pts: HeatPoint[]): void {
    this._points = pts;
    this._scheduleRender();
  }

  onAdd(map: L.Map): this {
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
    if (this._canvas) { this._canvas.remove(); this._canvas = null; }
    return this;
  }

  private _scheduleRender = (): void => {
    if (this._rafId !== null) cancelAnimationFrame(this._rafId);
    this._rafId = requestAnimationFrame(() => {
      this._rafId = null;
      this._render();
    });
  };

  private _render(): void {
    const map = this._map as L.Map | undefined;
    if (!map || !this._canvas || this._points.length === 0) return;

    const size = map.getSize();
    const w = size.x;
    const h = size.y;
    this._canvas.width = w;
    this._canvas.height = h;

    // Position canvas at the map's top-left pixel
    const topLeft = map.containerPointToLayerPoint([0, 0]);
    L.DomUtil.setPosition(this._canvas, topLeft);

    const ctx = this._canvas.getContext('2d')!;
    const imgData = ctx.createImageData(w, h);
    const data = imgData.data;

    // Pre-project all hotspot points to pixel coordinates
    const pixelPts = this._points.map(p => {
      const pt = map.latLngToContainerPoint(L.latLng(p.lat, p.lng));
      return { x: pt.x, y: pt.y, score: p.score };
    });

    for (let py = 0; py < h; py += RESOLUTION) {
      for (let px = 0; px < w; px += RESOLUTION) {
        let wSum = 0;
        let scoreSum = 0;
        let minDist = Infinity;

        for (const pp of pixelPts) {
          const dx = px - pp.x;
          const dy = py - pp.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < minDist) minDist = dist;
          const w2 = dist < 0.5 ? 1e10 : 1 / (dist * dist);
          wSum += w2;
          scoreSum += pp.score * w2;
        }

        if (minDist > FADE_END) continue;
        const score = wSum > 0 ? scoreSum / wSum : 50;
        const [r, g, b] = scoreToRGB(score);
        const distAlpha = minDist <= FADE_START ? 1
          : 1 - (minDist - FADE_START) / (FADE_END - FADE_START);
        const alpha = Math.round(MAX_ALPHA * distAlpha * 255);

        // Fill RESOLUTION×RESOLUTION block
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
