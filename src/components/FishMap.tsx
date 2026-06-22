import { useEffect, useRef, useState, useMemo } from 'react';
import L from 'leaflet';
import type { Map as LeafletMap } from 'leaflet';
import { createRoot } from 'react-dom/client';
import type { LatLng, ZoneScore, Hotspot } from '../types';
import { HOTSPOTS } from '../data/hotspots';
import { GRADE_COLORS } from '../utils/scoring';
import { ZonePopup } from './ZonePopup';
import { SearchBar } from './SearchBar';
import { Legend } from './Legend';
import { NearMePanel } from './NearMePanel';

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
  onLocationChange: (location: LatLng, label: string) => void;
  onRequestCreateZone: (loc: LatLng) => void;
  onRemoveCustomZone: (id: string) => void;
  onMapReady?: (map: LeafletMap) => void;
}

export function FishMap({
  userLocation,
  zoneScores,
  customZones,
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
  const [legendVisible, setLegendVisible] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

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
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Map click handler for zone creation mode
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const handler = (e: L.LeafletMouseEvent) => {
      if (!isCreating) return;
      onRequestCreateZone({ lat: e.latlng.lat, lng: e.latlng.lng });
      setIsCreating(false);
    };

    map.on('click', handler);
    return () => { map.off('click', handler); };
  }, [isCreating, onRequestCreateZone]);

  // Cursor style in creation mode
  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.style.cursor = isCreating ? 'crosshair' : '';
  }, [isCreating]);

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
      <NearMePanel userLocation={userLocation} zoneScores={zoneScores} />

      {/* Add Zone FAB */}
      <div style={{ position: 'absolute', top: 56, right: 12, zIndex: 9999 }}>
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
              marginTop: 6,
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
      </div>

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
