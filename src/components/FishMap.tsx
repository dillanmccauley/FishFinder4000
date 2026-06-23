import { useEffect, useRef, useState, useMemo } from 'react';
import L from 'leaflet';
import type { Map as LeafletMap } from 'leaflet';
import { createRoot } from 'react-dom/client';
import type { LatLng, ZoneScore, Hotspot, MarineConditions, TideInfo } from '../types';
import { HOTSPOTS } from '../data/hotspots';
import { GRADE_COLORS, GRADE_LABELS } from '../utils/scoring';
import { FishingHeatLayer } from '../utils/fishingHeatLayer';
import { ZonePopup } from './ZonePopup';
import { SearchBar } from './SearchBar';
import { Legend } from './Legend';
import { NearMePanel } from './NearMePanel';
import { SpotForecastPanel } from './SpotForecastPanel';
import { useLocationForecast } from '../hooks/useLocationForecast';

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
  const heatLayerRef = useRef<FishingHeatLayer | null>(null);
  const pinMarkerRef = useRef<L.Marker | null>(null);
  const [legendVisible, setLegendVisible] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [depthLayerVisible, setDepthLayerVisible] = useState(false);
  const [heatVisible, setHeatVisible] = useState(false);
  const [pinLocation, setPinLocation] = useState<LatLng | null>(null);

  const { hourlyScores } = useLocationForecast({
    pin: pinLocation,
    getConditionsAt,
    getTideAt,
    nowDate,
  });

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

  // Map click handler: zone creation mode OR pin drop
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const handler = (e: L.LeafletMouseEvent) => {
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
  }, [isCreating, onRequestCreateZone]);

  // Cursor style in creation mode
  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.style.cursor = isCreating ? 'crosshair' : '';
  }, [isCreating]);

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

  // Fishing heatmap layer
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (heatVisible) {
      if (!heatLayerRef.current) {
        heatLayerRef.current = new FishingHeatLayer();
        heatLayerRef.current.addTo(map);
      }
      const pts = [...allHotspotsMap.values()].map(h => {
        const s = zoneScores.get(h.id);
        return s ? { lat: h.location.lat, lng: h.location.lng, score: s.total } : null;
      }).filter((p): p is { lat: number; lng: number; score: number } => p !== null);
      heatLayerRef.current.updatePoints(pts);
    } else {
      heatLayerRef.current?.remove();
      heatLayerRef.current = null;
    }
  }, [heatVisible, zoneScores, allHotspotsMap]);

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

    // Remove markers for zones that no longer exist
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

  // Update popup content when scores or custom zones change
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
        {/* Add Zone FAB */}
        <button
          onClick={() => setIsCreating(v => !v)}
          title={isCreating ? 'Cancel — click map to place zone' : 'Add custom zone'}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '7px 14px',
            borderRadius: 10,
            background: isCreating ? '#0ea5e9' : '#1e293bef',
            border: `1px solid ${isCreating ? '#7dd3fc' : '#38bdf8'}`,
            color: isCreating ? '#0f172a' : '#38bdf8',
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 700,
            boxShadow: '0 2px 12px rgba(0,0,0,0.6)',
            backdropFilter: 'blur(8px)',
            whiteSpace: 'nowrap',
          }}
        >
          {isCreating ? '✕ Cancel' : '✎ Add Zone'}
        </button>
        {isCreating && (
          <div
            style={{
              padding: '6px 10px',
              borderRadius: 8,
              background: '#0ea5e920',
              border: '1px solid #0ea5e960',
              color: '#38bdf8',
              fontSize: 11,
              textAlign: 'center',
              whiteSpace: 'nowrap',
              boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
            }}
          >
            Click map to place zone
          </div>
        )}

        {/* Heat map toggle */}
        <button
          onClick={() => setHeatVisible(v => !v)}
          title={heatVisible ? 'Hide fishing heatmap' : 'Show fishing grade heatmap'}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '7px 14px',
            borderRadius: 10,
            background: heatVisible ? '#16a34a' : '#1e293bef',
            border: `1px solid ${heatVisible ? '#4ade80' : '#16a34a'}`,
            color: heatVisible ? '#fff' : '#4ade80',
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 700,
            boxShadow: '0 2px 12px rgba(0,0,0,0.6)',
            backdropFilter: 'blur(8px)',
            whiteSpace: 'nowrap',
          }}
        >
          🎣 {heatVisible ? 'Hide Heat' : 'Heat Map'}
        </button>

        {/* Depth chart toggle */}
        <button
          onClick={() => setDepthLayerVisible(v => !v)}
          title={depthLayerVisible ? 'Hide depth chart' : 'Show ocean depth chart'}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '7px 14px',
            borderRadius: 10,
            background: depthLayerVisible ? '#6366f1' : '#1e293bef',
            border: `1px solid ${depthLayerVisible ? '#a5b4fc' : '#6366f1'}`,
            color: depthLayerVisible ? '#fff' : '#a5b4fc',
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 700,
            boxShadow: '0 2px 12px rgba(0,0,0,0.6)',
            backdropFilter: 'blur(8px)',
            whiteSpace: 'nowrap',
          }}
        >
          🌊 {depthLayerVisible ? 'Hide Depth' : 'Depth Chart'}
        </button>
      </div>

      {/* Heatmap legend */}
      {heatVisible && (
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
