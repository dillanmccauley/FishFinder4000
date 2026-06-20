import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import type { Map as LeafletMap } from 'leaflet';
import { createRoot } from 'react-dom/client';
import type { LatLng, ZoneScore } from '../types';
import { HOTSPOTS } from '../data/hotspots';
import { GRADE_COLORS } from '../utils/scoring';
import { ZonePopup } from './ZonePopup';
import { SearchBar } from './SearchBar';
import { Legend } from './Legend';

const RADIUS_MILES = 25;
const METERS_PER_MILE = 1609.34;

const HOTSPOT_TYPE_SIZE: Record<string, number> = {
  pier: 34,
  inlet: 38,
  flat: 36,
  reef: 34,
  pass: 38,
};

function makeZoneIcon(grade: string, color: string, type: string): L.DivIcon {
  const size = HOTSPOT_TYPE_SIZE[type] ?? 34;
  return L.divIcon({
    className: '',
    html: `<div class="zone-marker-icon" style="width:${size}px;height:${size}px;background:${color};box-shadow:0 0 0 3px ${color}40,0 2px 8px rgba(0,0,0,0.5)">${grade}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2 - 4],
  });
}

interface Props {
  userLocation: LatLng;
  zoneScores: Map<string, ZoneScore>;
  onMapReady?: (map: LeafletMap) => void;
  onLocationChange: (location: LatLng, label: string) => void;
}

export function FishMap({ userLocation, zoneScores, onMapReady, onLocationChange }: Props) {
  const mapRef = useRef<LeafletMap | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const circleRef = useRef<L.Circle | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const popupRootsRef = useRef<Map<string, ReturnType<typeof createRoot>>>(new Map());
  const [legendVisible, setLegendVisible] = useState(false);

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

    // Add zoom control in bottom-left
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

  // Update user location marker and radius circle
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (userMarkerRef.current) userMarkerRef.current.remove();
    if (circleRef.current) circleRef.current.remove();

    // User location dot
    const userIcon = L.divIcon({
      className: '',
      html: `<div style="width:16px;height:16px;border-radius:50%;background:#38bdf8;border:3px solid white;box-shadow:0 0 12px rgba(56,189,248,0.6)"></div>`,
      iconSize: [16, 16],
      iconAnchor: [8, 8],
    });
    userMarkerRef.current = L.marker([userLocation.lat, userLocation.lng], { icon: userIcon })
      .bindTooltip('You are here', { direction: 'top', className: '' })
      .addTo(map);

    // 25-mile radius circle
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

  // Update zone markers when scores change
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    HOTSPOTS.forEach(hotspot => {
      const score = zoneScores.get(hotspot.id);
      if (!score) return;

      const color = GRADE_COLORS[score.grade];
      const icon = makeZoneIcon(score.grade, color, hotspot.type);

      let marker = markersRef.current.get(hotspot.id);
      if (!marker) {
        marker = L.marker([hotspot.location.lat, hotspot.location.lng], { icon })
          .addTo(map);

        // Create popup with React root
        const popupEl = document.createElement('div');
        const root = createRoot(popupEl);
        popupRootsRef.current.set(hotspot.id, root);

        const popup = L.popup({
          maxWidth: 340,
          minWidth: 300,
          closeButton: true,
          className: '',
          offset: [0, 0],
        }).setContent(popupEl);

        marker.bindPopup(popup);
        markersRef.current.set(hotspot.id, marker);
      } else {
        marker.setIcon(icon);
      }
    });
  }, [zoneScores]);

  // Update popup content when scores change
  useEffect(() => {
    HOTSPOTS.forEach(hotspot => {
      const score = zoneScores.get(hotspot.id);
      const root = popupRootsRef.current.get(hotspot.id);
      if (!score || !root) return;
      root.render(<ZonePopup score={score} />);
    });
  }, [zoneScores]);

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" />
      <SearchBar
        onSelect={(loc, label) => {
          onLocationChange(loc, label);
        }}
      />
      <Legend visible={legendVisible} onToggle={() => setLegendVisible(v => !v)} />

      {/* Data attribution */}
      <div
        className="absolute bottom-24 left-3 z-50 text-xs rounded-lg px-2 py-1"
        style={{
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
