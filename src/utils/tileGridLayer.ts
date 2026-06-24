import L from 'leaflet';
import type { BBox } from '../types';

export const TILE_DEG = 0.5;

export class TileGridLayer extends L.Layer {
  private _canvas: HTMLCanvasElement | null = null;
  private _mapInstance: L.Map | null = null;
  private _selectedTile: BBox | null = null;
  private _rafId: number | null = null;

  setSelectedTile(tile: BBox | null): void {
    this._selectedTile = tile;
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
    this._canvas.style.zIndex = '190'; // below RasterHeatLayer's 200
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
    if (!map || !this._canvas) return;

    const size = map.getSize();
    const w = size.x;
    const h = size.y;
    this._canvas.width = w;
    this._canvas.height = h;

    const topLeft = map.containerPointToLayerPoint([0, 0]);
    L.DomUtil.setPosition(this._canvas, topLeft);

    const ctx = this._canvas.getContext('2d')!;
    ctx.clearRect(0, 0, w, h);

    // Only draw grid at zoom >= 8; at lower zooms the lines are too dense
    if (map.getZoom() < 8) return;

    const bounds = map.getBounds();
    const south = bounds.getSouth();
    const north = bounds.getNorth();
    const west = bounds.getWest();
    const east = bounds.getEast();

    // Draw selected tile fill first (behind grid lines)
    if (this._selectedTile) {
      const { sw, ne } = this._selectedTile;
      const swPx = map.latLngToContainerPoint(L.latLng(sw.lat, sw.lng));
      const nePx = map.latLngToContainerPoint(L.latLng(ne.lat, ne.lng));
      const x = Math.min(swPx.x, nePx.x);
      const y = Math.min(swPx.y, nePx.y);
      const tileW = Math.abs(nePx.x - swPx.x);
      const tileH = Math.abs(nePx.y - swPx.y);

      ctx.fillStyle = 'rgba(34, 211, 238, 0.15)';
      ctx.fillRect(x, y, tileW, tileH);

      ctx.strokeStyle = 'rgba(34, 211, 238, 0.85)';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, tileW, tileH);
    }

    // Draw grid lines
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.lineWidth = 1;

    // Horizontal lines (constant lat)
    const startLat = Math.floor(south / TILE_DEG) * TILE_DEG;
    for (let lat = startLat; lat <= north + TILE_DEG; lat = parseFloat((lat + TILE_DEG).toFixed(10))) {
      const py = map.latLngToContainerPoint(L.latLng(lat, west)).y;
      ctx.moveTo(0, py);
      ctx.lineTo(w, py);
    }

    // Vertical lines (constant lng)
    const startLng = Math.floor(west / TILE_DEG) * TILE_DEG;
    for (let lng = startLng; lng <= east + TILE_DEG; lng = parseFloat((lng + TILE_DEG).toFixed(10))) {
      const px = map.latLngToContainerPoint(L.latLng(south, lng)).x;
      ctx.moveTo(px, 0);
      ctx.lineTo(px, h);
    }

    ctx.stroke();
  }
}
