import { useEffect, useRef, useState, useMemo } from 'react';
import L from 'leaflet';
import type { Map as LeafletMap } from 'leaflet';
import { createRoot } from 'react-dom/client';
import type { BBox, LatLng, ZoneScore, Hotspot, MarineConditions, TideInfo } from '../types';
import { HOTSPOTS } from '../data/hotspots';
import { GRADE_COLORS, GRADE_LABELS } from '../utils/scoring';
import { RasterHeatLayer } from '../utils/rasterHeatLayer';
import { ZonePopup } from './ZonePopup';
import { SearchBar } from './SearchBar';
import { Legend } from './Legend';
import { NearMePanel } from './NearMePanel';
import { SpotForecastPanel } from './SpotForecastPanel';
import { useLocationForecast } from '../hooks/useLocationForecast';
import { useRasterForecast } from '../hooks/useRasterForecast';

const RADIUS_MILES = 25;
const METERS_PER_MILE = 1609.34;

const HOTSPOT_TYPE_SIZE: Record<string, number> = {
  pier: 34,
  inlet: 38,
  flat: 36,
  reef: 34,
  pass: 38,
};

function makeZoneIcon(grade: string, color: string, type: string, isCustom = false): L.DivIcon {
  const size = HOTSPOT_TYPE_SIZE[type] ?? 34;
  const shadow = isCustom
    ? `0 0 0 3px ${color}40, 0 0 0 5px rgba(255,255,255,0.6), 0 2px 8px rgba(0,0,0,0.5)`
    : `0 0 0 3px ${color}40, 0 2px 8px rgba(0,0,0,0.5)`;
  return L.divIcon({
    className: '',
    html: `<div class="zone-marker-icon" style="width:${size}px;height:${size}px;background:${color};box-shadow:${shadow}">${grade}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2 - 4],
  });
}

interface Props {
  userLocation: LatLng;
  zoneScores: Map<string, ZoneScore>;
  customZones: Hotspot[];
  targetDate: Date;
  nowDate: Date;
  getConditionsAt: (location: LatLng, date: Date) => MarineConditions | null;
  getTideAt: (stationId: string, date: Date) => TideInfo | null;
  onLocationChange: (location: LatLng, label: string) => void;
  onRequestCreateZone: (loc: LatLng) => void;
  onRemoveCustomZone: (id: string) => void;
  onMapReady?: (map: LeafletMap) => void;
}

export function FishMap({
  userLocation,
  zoneScores,
  customZones,
  targetDate,
  nowDate,
  getConditionsAt,
  getTideAt,
  onLocationChange,
  onRequestCreateZone,
  onRemoveCustomZone,
  onMapReady,
}: Props) {
  const mapRef = useRef<LeafletMap | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const circleRef = useRef<L.Circle | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const popupRootsRef = useRef<Map<string, ReturnType<typeof createRoot>>>(new Map());
  const depthLayerRef = useRef<L.TileLayer | null>(null);
  const rasterLayerRef = useRef<RasterHeatLayer | null>(null);
  const pinMarkerRef = useRef<L.Marker | null>(null);
  const selectionStartRef = useRef<L.LatLng | null>(null);
  const selectionRectRef = useRef<L.Rectangle | null>(null);

  const [legendVisible, setLegendVisible] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [depthLayerVisible, setDepthLayerVisible] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [rasterBBox, setRasterBBox] = useState<BBox | null>(null);
  const [pinLocation, setPinLocation] = useState<LatLng | null>(null);

  const { hourlyScores } = useLocationForecast({
    pin: pinLocation,
    getConditionsAt,
    getTideAt,
    nowDate,
  });

  const { gridPoints, loading: rasterLoading, pointsLoaded, pointsTotal } = useRasterForecast(
    rasterBBox,
    targetDate,
    getConditionsAt,
    getTideAt,
    nowDate,
  );

  // Combined hotspot map (regular + custom)
  const allHotspotsMap = useMemo(() => {
    const m = new Map<string, Hotspot>(HOTSPOTS.map(h => [h.id, h]));
    customZones.forEach(z => m.set(z.id, z));
    return m;
  }, [customZones]);

  // Initialize map once
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;

    const map = L.map(containerRef.current, {
      center: [userLocation.lat, userLocation.lng],
      zoom: 9,
      zoomControl: false,
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '© OpenStreetMap contributors © CARTO',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map);

    L.control.zoom({ position: 'bottomleft' }).addTo(map);

    mapRef.current = map;
    if (onMapReady) onMapReady(map);

    return () => {
      map.remove();
      mapRef.current = null;
      markersRef.current.clear();
      popupRootsRef.current.forEach(root => {
        try { root.unmount(); } catch (_) {}
      });
      popupRootsRef.current.clear();
      depthLayerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Map click handler: zone creation mode OR pin drop (not in selection mode)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const handler = (e: L.LeafletMouseEvent) => {
      if (selectionMode) return; // selection handled via mousedown/up
      const loc = { lat: e.latlng.lat, lng: e.latlng.lng };
      if (isCreating) {
        onRequestCreateZone(loc);
        setIsCreating(false);
      } else {
        setPinLocation(loc);
      }
    };

    map.on('click', handler);
    return () => { map.off('click', handler); };
  }, [isCreating, selectionMode, onRequestCreateZone]);

  // Cursor style
  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.style.cursor = (isCreating || selectionMode) ? 'crosshair' : '';
  }, [isCreating, selectionMode]);

  // Rectangle selection drawing
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!selectionMode) return;

    const onMouseDown = (e: L.LeafletMouseEvent) => {
      L.DomEvent.stopPropagation(e);
      selectionStartRef.current = e.latlng;
      map.dragging.disable();

      // Create preview rectangle
      selectionRectRef.current?.remove();
      selectionRectRef.current = L.rectangle(
        L.latLngBounds(e.latlng, e.latlng),
        { color: '#22d3ee', weight: 2, fillOpacity: 0.08, dashArray: '6 4' }
      ).addTo(map);
    };

    const onMouseMove = (e: L.LeafletMouseEvent) => {
      if (!selectionStartRef.current || !selectionRectRef.current) return;
      selectionRectRef.current.setBounds(L.latLngBounds(selectionStartRef.current, e.latlng));
    };

    const onMouseUp = (e: L.LeafletMouseEvent) => {
      if (!selectionStartRef.current) return;
      map.dragging.enable();

      const sw = selectionStartRef.current;
      const ne = e.latlng;
      selectionStartRef.current = null;
      selectionRectRef.current?.remove();
      selectionRectRef.current = null;

      const minLat = Math.min(sw.lat, ne.lat);
      const maxLat = Math.max(sw.lat, ne.lat);
      const minLng = Math.min(sw.lng, ne.lng);
      const maxLng = Math.max(sw.lng, ne.lng);

      // Need at least a 0.1° box
      if (maxLat - minLat < 0.05 || maxLng - minLng < 0.05) {
        setSelectionMode(false);
        return;
      }

      setRasterBBox({
        sw: { lat: minLat, lng: minLng },
        ne: { lat: maxLat, lng: maxLng },
      });
      setSelectionMode(false);
    };

    map.on('mousedown', onMouseDown);
    map.on('mousemove', onMouseMove);
    map.on('mouseup', onMouseUp);

    return () => {
      map.off('mousedown', onMouseDown);
      map.off('mousemove', onMouseMove);
      map.off('mouseup', onMouseUp);
      map.dragging.enable();
      selectionRectRef.current?.remove();
      selectionRectRef.current = null;
      selectionStartRef.current = null;
    };
  }, [selectionMode]);

  // Raster heat layer — update when gridPoints or bbox changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (rasterBBox && gridPoints.length > 0) {
      if (!rasterLayerRef.current) {
        rasterLayerRef.current = new RasterHeatLayer();
        rasterLayerRef.current.addTo(map);
      }
      rasterLayerRef.current.updateGrid(gridPoints);
    } else if (!rasterBBox) {
      rasterLayerRef.current?.remove();
      rasterLayerRef.current = null;
    }
  }, [gridPoints, rasterBBox]);

  // ESRI Ocean Reference depth tile overlay
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (depthLayerVisible) {
      if (!depthLayerRef.current) {
        depthLayerRef.current = L.tileLayer(
          'https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Reference/MapServer/tile/{z}/{y}/{x}',
          {
            attribution: 'Depth data © Esri, GEBCO, NOAA',
            maxNativeZoom: 13,
            maxZoom: 19,
            opacity: 0.8,
          }
        );
      }
      depthLayerRef.current.addTo(map);
    } else {
      depthLayerRef.current?.remove();
    }
  }, [depthLayerVisible]);

  // Pin marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    pinMarkerRef.current?.remove();
    pinMarkerRef.current = null;

    if (!pinLocation) return;

    const pinIcon = L.divIcon({
      className: '',
      html: `<div style="width:14px;height:14px;border-radius:50%;background:#f59e0b;border:3px solid #fef3c7;box-shadow:0 0 12px rgba(245,158,11,0.7)"></div>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    });
    pinMarkerRef.current = L.marker([pinLocation.lat, pinLocation.lng], { icon: pinIcon }).addTo(map);
  }, [pinLocation]);

  // Update user location marker and radius circle
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (userMarkerRef.current) userMarkerRef.current.remove();
    if (circleRef.current) circleRef.current.remove();

    const userIcon = L.divIcon({
      className: '',
      html: `<div style="width:16px;height:16px;border-radius:50%;background:#38bdf8;border:3px solid white;box-shadow:0 0 12px rgba(56,189,248,0.6)"></div>`,
      iconSize: [16, 16],
      iconAnchor: [8, 8],
    });
    userMarkerRef.current = L.marker([userLocation.lat, userLocation.lng], { icon: userIcon })
      .bindTooltip('You are here', { direction: 'top', className: '' })
      .addTo(map);

    circleRef.current = L.circle([userLocation.lat, userLocation.lng], {
      radius: RADIUS_MILES * METERS_PER_MILE,
      color: '#38bdf8',
      weight: 1,
      opacity: 0.3,
      fillColor: '#38bdf8',
      fillOpacity: 0.04,
    }).addTo(map);

    map.flyTo([userLocation.lat, userLocation.lng], 9, { duration: 1.2 });
  }, [userLocation]);

  // Create/update zone markers when scores or custom zones change
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach((marker, id) => {
      if (!allHotspotsMap.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
        popupRootsRef.current.get(id)?.unmount();
        popupRootsRef.current.delete(id);
      }
    });

    allHotspotsMap.forEach((hotspot, id) => {
      const score = zoneScores.get(id);
      if (!score) return;

      const color = GRADE_COLORS[score.grade];
      const isCustom = id.startsWith('custom-');
      const icon = makeZoneIcon(score.grade, color, hotspot.type, isCustom);

      let marker = markersRef.current.get(id);
      if (!marker) {
        marker = L.marker([hotspot.location.lat, hotspot.location.lng], { icon }).addTo(map);

        const popupEl = document.createElement('div');
        const root = createRoot(popupEl);
        popupRootsRef.current.set(id, root);

        const popup = L.popup({
          maxWidth: 340,
          minWidth: 300,
          closeButton: true,
          className: '',
          offset: [0, 0],
        }).setContent(popupEl);

        marker.bindPopup(popup);
        markersRef.current.set(id, marker);
      } else {
        marker.setIcon(icon);
      }
    });
  }, [zoneScores, allHotspotsMap]);

  // Update popup content when scores change
  useEffect(() => {
    allHotspotsMap.forEach((hotspot, id) => {
      const score = zoneScores.get(id);
      const root = popupRootsRef.current.get(id);
      if (!score || !root) return;
      const isCustom = id.startsWith('custom-');
      root.render(
        <ZonePopup
          score={score}
          hotspot={hotspot}
          onRemove={isCustom ? () => { onRemoveCustomZone(id); } : undefined}
        />
      );
    });
  }, [zoneScores, allHotspotsMap, onRemoveCustomZone]);

  const clearRaster = () => {
    rasterLayerRef.current?.remove();
    rasterLayerRef.current = null;
    setRasterBBox(null);
  };

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" />
      <SearchBar onSelect={(loc, label) => onLocationChange(loc, label)} />
      <Legend visible={legendVisible} onToggle={() => setLegendVisible(v => !v)} />
      <NearMePanel userLocation={userLocation} zoneScores={zoneScores} targetDate={targetDate} />

      {/* Spot forecast panel */}
      {pinLocation && (
        <SpotForecastPanel
          pin={pinLocation}
          hourlyScores={hourlyScores}
          targetDate={targetDate}
          onClose={() => setPinLocation(null)}
        />
      )}

      {/* Map control buttons */}
      <div style={{ position: 'absolute', top: 56, right: 12, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 6 }}>

        {/* Add Zone */}
        <button
          onClick={() => { setSelectionMode(false); setIsCreating(v => !v); }}
          title={isCreating ? 'Cancel' : 'Add custom zone'}
          style={btnStyle(isCreating, '#0ea5e9', '#38bdf8')}
        >
          {isCreating ? '✕ Cancel' : '✎ Add Zone'}
        </button>
        {isCreating && <HintPill>Click map to place zone</HintPill>}

        {/* Select Area for raster heatmap */}
        <button
          onClick={() => { setIsCreating(false); setSelectionMode(v => !v); }}
          title={selectionMode ? 'Cancel selection' : 'Draw area for fishing heatmap'}
          style={btnStyle(selectionMode, '#22d3ee', '#22d3ee')}
        >
          {selectionMode ? '✕ Cancel' : '🗺 Select Area'}
        </button>
        {selectionMode && <HintPill>Click & drag to draw selection</HintPill>}

        {/* Clear raster */}
        {rasterBBox && !rasterLoading && (
          <button
            onClick={clearRaster}
            style={btnStyle(false, '#ef4444', '#f87171')}
          >
            ✕ Clear Raster
          </button>
        )}

        {/* Depth chart toggle */}
        <button
          onClick={() => setDepthLayerVisible(v => !v)}
          title={depthLayerVisible ? 'Hide depth chart' : 'Show ocean depth chart'}
          style={btnStyle(depthLayerVisible, '#6366f1', '#a5b4fc')}
        >
          🌊 {depthLayerVisible ? 'Hide Depth' : 'Depth Chart'}
        </button>
      </div>

      {/* Raster loading progress */}
      {rasterLoading && (
        <div style={{
          position: 'absolute', top: 56, left: '50%', transform: 'translateX(-50%)',
          zIndex: 9999, background: '#0f172aee', border: '1px solid #22d3ee44',
          borderRadius: 8, padding: '6px 14px',
          fontSize: 12, color: '#22d3ee', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap',
        }}>
          <span style={{
            width: 10, height: 10, borderRadius: '50%', border: '2px solid #22d3ee',
            borderTopColor: 'transparent', display: 'inline-block',
            animation: 'spin 0.8s linear infinite',
          }} />
          Raster: {pointsLoaded} / {pointsTotal} points
        </div>
      )}

      {/* Raster legend */}
      {(rasterBBox && gridPoints.length > 0) && (
        <div style={{
          position: 'absolute', bottom: 104, right: 12, zIndex: 9999,
          background: '#0f172aee', border: '1px solid #1e293b',
          borderRadius: 8, padding: '8px 10px', backdropFilter: 'blur(8px)',
        }}>
          <div style={{ fontSize: 9, color: '#475569', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Fishing Quality
          </div>
          {(['A', 'B', 'C', 'D', 'E', 'F'] as const).map(g => (
            <div key={g} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
              <div style={{ width: 12, height: 12, borderRadius: 2, background: GRADE_COLORS[g], flexShrink: 0 }} />
              <span style={{ fontSize: 10, color: '#94a3b8' }}>{g} — {GRADE_LABELS[g]}</span>
            </div>
          ))}
          <div style={{ fontSize: 9, color: '#475569', marginTop: 5, borderTop: '1px solid #1e293b', paddingTop: 4 }}>
            {gridPoints.length} grid pts · 0.1° spacing
          </div>
        </div>
      )}

      {/* Data attribution */}
      <div
        style={{
          position: 'absolute', bottom: 96, left: 12, zIndex: 9999,
          fontSize: '0.75rem', borderRadius: 8, padding: '4px 8px',
          background: '#0f172aaa',
          color: '#64748b',
          backdropFilter: 'blur(4px)',
          border: '1px solid #1e293b',
          maxWidth: 280,
          lineHeight: 1.4,
        }}
      >
        Data: Open-Meteo Marine · NOAA Tides & Currents · NOAA FishWatch
      </div>
    </div>
  );
}

function btnStyle(active: boolean, activeColor: string, borderColor: string): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '7px 14px',
    borderRadius: 10,
    background: active ? activeColor : '#1e293bef',
    border: `1px solid ${active ? activeColor : borderColor}`,
    color: active ? (activeColor === '#0ea5e9' ? '#0f172a' : '#fff') : borderColor,
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 700,
    boxShadow: '0 2px 12px rgba(0,0,0,0.6)',
    backdropFilter: 'blur(8px)',
    whiteSpace: 'nowrap',
  };
}

function HintPill({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      padding: '6px 10px',
      borderRadius: 8,
      background: '#0ea5e920',
      border: '1px solid #0ea5e960',
      color: '#38bdf8',
      fontSize: 11,
      textAlign: 'center',
      whiteSpace: 'nowrap',
      boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
    }}>
      {children}
    </div>
  );
}
