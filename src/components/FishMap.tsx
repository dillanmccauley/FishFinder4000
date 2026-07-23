import { useEffect, useRef, useState, useMemo } from 'react';
import L from 'leaflet';
import type { Map as LeafletMap } from 'leaflet';
import { createRoot } from 'react-dom/client';
import type { LatLng, ZoneScore, Hotspot, MarineConditions, TideInfo } from '../types';
import { HOTSPOTS } from '../data/hotspots';
import { GRADE_COLORS, GRADE_LABELS } from '../utils/scoring';
import { ZonePopup } from './ZonePopup';
import { SearchBar } from './SearchBar';
import { Legend } from './Legend';
import { NearMePanel } from './NearMePanel';
import { SpotForecastPanel } from './SpotForecastPanel';
import { RegionPanel } from './RegionPanel';
import { useLocationForecast } from '../hooks/useLocationForecast';
import { useRegionDem } from '../hooks/useRegionDem';
import { useRegionStructures } from '../hooks/useRegionStructures';
import { useRegionForecast, type SpeciesOutlook } from '../hooks/useRegionForecast';
import { DepthShadeLayer, type OverlayMode } from '../utils/depthShadeLayer';
import { computeGradeField, spatialScoreAt } from '../utils/gradeField';
import { demElevAt, SPOT_KIND_COLOR, SPOT_KIND_LABEL, type DemGrid } from '../utils/spotDiscovery';
import { scoreToGrade } from '../utils/scoring';
import { REGIONS, REGIONS_BY_ID, inEnvelope, makeDynamicRegion, type FishingRegion } from '../data/regions';
import { useTideStations, nearestTideStation } from '../hooks/useTideStations';
import type { SpotCandidate } from '../types';

const RECENTS_KEY = 'ff4k-recent-regions';

function loadRecentRegions(): FishingRegion[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list)
      ? list.filter((r): r is FishingRegion => !!r && !!r.id && !!r.bbox && !!r.tideStationId)
      : [];
  } catch {
    return [];
  }
}

function saveRecentRegion(region: FishingRegion): FishingRegion[] {
  const list = [region, ...loadRecentRegions().filter(r => r.id !== region.id)].slice(0, 3);
  try { localStorage.setItem(RECENTS_KEY, JSON.stringify(list)); } catch { /* storage full/blocked */ }
  return list;
}

/** Click-anywhere popup: which species are best at this exact location right now */
function locationPopupHtml(
  lat: number,
  lng: number,
  dem: DemGrid,
  spots: SpotCandidate[],
  outlooks: SpeciesOutlook[],
  region: FishingRegion,
): string {
  const elev = demElevAt(dem, lat, lng);
  if (elev == null || elev >= -0.3) {
    return `<div style="padding:12px 14px;color:#94a3b8;font-size:12px;">🏖 Land or too shallow to score</div>`;
  }
  const depthFt = Math.round(-elev * 3.28084);

  // Nearest discovered structure within 300 m, for context
  let structureNote = '';
  let bestDist = Infinity;
  for (const s of spots) {
    const dM = Math.sqrt(((s.lat - lat) * 110574) ** 2 + ((s.lng - lng) * 92400) ** 2);
    if (dM < bestDist) {
      bestDist = dM;
      if (dM <= 300) structureNote = ` · ${Math.round(dM)} m to ${SPOT_KIND_LABEL[s.kind].toLowerCase()}`;
    }
  }

  const ranked = outlooks
    .map(o => {
      const spatial = spatialScoreAt(dem, spots, o.species, o.profile, region.oceanDivider, lat, lng);
      if (spatial == null) return null;
      const score = Math.round(Math.max(0, Math.min(100, 0.55 * o.scoreNow + spatial)));
      return { o, score, grade: scoreToGrade(score) };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.score - a.score);

  const rows = ranked.slice(0, 4).map(({ o, score, grade }) => {
    const gc = GRADE_COLORS[grade];
    return `<div style="display:flex;align-items:center;gap:6px;margin-top:4px;">
      <span style="display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:4px;background:${gc};color:#fff;font-size:10px;font-weight:800;">${grade}</span>
      <span style="color:#e2e8f0;font-size:11px;">${o.species.commonName}</span>
      <span style="color:${gc};font-size:11px;font-weight:700;margin-left:auto;">${score}</span>
    </div>`;
  }).join('');

  return `<div style="padding:12px 14px;min-width:250px;">
    <div style="color:#f1f5f9;font-weight:800;font-size:12px;">📍 This spot right now</div>
    <div style="color:#94a3b8;font-size:11px;margin-top:3px;">${depthFt} ft deep${structureNote}</div>
    <div style="border-top:1px solid #334155;margin-top:8px;padding-top:2px;">${rows}</div>
    <div style="color:#64748b;font-size:9px;margin-top:6px;">Scored for this exact location at the scrubber time</div>
  </div>`;
}

/** Plain-HTML popup for a discovered spot: structure info + best species right now */
function spotPopupHtml(spot: SpotCandidate, outlooks: SpeciesOutlook[]): string {
  const color = SPOT_KIND_COLOR[spot.kind];
  const ranked = outlooks
    .map(o => ({ o, fit: o.scoreNow * (o.profile.structureAffinity[spot.kind] ?? 0.3) }))
    .sort((a, b) => b.fit - a.fit)
    .slice(0, 3);

  const speciesRows = ranked
    .map(({ o }) => {
      const gradeColor = GRADE_COLORS[o.gradeNow];
      return `<div style="display:flex;align-items:center;gap:6px;margin-top:4px;">
        <span style="display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:4px;background:${gradeColor};color:#fff;font-size:10px;font-weight:800;">${o.gradeNow}</span>
        <span style="color:#e2e8f0;font-size:11px;">${o.species.commonName}</span>
        <span style="color:${gradeColor};font-size:11px;font-weight:700;margin-left:auto;">${o.scoreNow}</span>
      </div>`;
    })
    .join('');

  return `<div style="padding:12px 14px;min-width:260px;">
    <div style="display:flex;align-items:center;gap:8px;">
      <span style="width:12px;height:12px;background:${color};transform:rotate(45deg);display:inline-block;flex-shrink:0;"></span>
      <span style="color:#f1f5f9;font-weight:800;font-size:13px;">${SPOT_KIND_LABEL[spot.kind]}</span>
      <span style="color:${color};font-size:11px;font-weight:700;margin-left:auto;">structure ${spot.structureScore}</span>
    </div>
    <div style="color:#94a3b8;font-size:11px;margin-top:6px;line-height:1.5;">${spot.description}</div>
    ${speciesRows ? `<div style="border-top:1px solid #334155;margin-top:8px;padding-top:6px;">
      <div style="color:#64748b;font-size:9px;text-transform:uppercase;letter-spacing:0.05em;">Best bets at this structure</div>
      ${speciesRows}
    </div>` : ''}
  </div>`;
}

const RADIUS_MILES = 25;
const METERS_PER_MILE = 1609.34;

const HOTSPOT_TYPE_SIZE: Record<string, number> = {
  pier: 34,
  inlet: 38,
  flat: 36,
  reef: 34,
  pass: 38,
};

function makeSpotIcon(spot: SpotCandidate, highlighted: boolean): L.DivIcon {
  const color = SPOT_KIND_COLOR[spot.kind];
  const size = highlighted ? 18 : spot.structureScore >= 80 ? 16 : 13;
  const ring = highlighted ? `box-shadow:0 0 0 3px #fbbf24, 0 0 14px #fbbf24cc;` : `box-shadow:0 0 8px ${color}aa;`;
  return L.divIcon({
    className: '',
    html: `<div style="width:${size}px;height:${size}px;background:${color};transform:rotate(45deg);border:2px solid #0f172a;${ring}"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

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
  const nauticalLayerRef = useRef<L.TileLayer | null>(null);
  const pinMarkerRef = useRef<L.Marker | null>(null);
  const depthLayerRef = useRef<DepthShadeLayer | null>(null);
  const osmLayerRef = useRef<L.TileLayer | null>(null);
  const spotMarkersRef = useRef<L.Marker[]>([]);
  const wasOibModeRef = useRef<string | null>(null);

  const [legendVisible, setLegendVisible] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [nauticalVisible, setNauticalVisible] = useState(false);
  const [pinLocation, setPinLocation] = useState<LatLng | null>(null);
  const [activeRegion, setActiveRegion] = useState<FishingRegion | null>(null);
  const [regionMenuOpen, setRegionMenuOpen] = useState(false);
  const [mapCenter, setMapCenter] = useState<LatLng>(userLocation);
  const [recentRegions, setRecentRegions] = useState<FishingRegion[]>(loadRecentRegions);
  const [overlayMode, setOverlayMode] = useState<OverlayMode | 'off'>('grade');
  const [selectedSpeciesId, setSelectedSpeciesId] = useState<string | null>(null);

  const { hourlyScores } = useLocationForecast({
    pin: pinLocation,
    getConditionsAt,
    getTideAt,
    nowDate,
  });

  // Tide-station index for dynamic regions — loads when the menu opens
  const { stations: tideStations, loading: stationsLoading } = useTideStations(regionMenuOpen);

  const activateRegion = (region: FishingRegion) => {
    setSelectedSpeciesId(null);
    setActiveRegion(region);
    setRegionMenuOpen(false);
  };

  const activateDynamicRegion = () => {
    const map = mapRef.current;
    if (!map || !tideStations.length) return;
    const c = map.getCenter();
    const center = { lat: c.lat, lng: c.lng };
    const station = nearestTideStation(tideStations, center);
    if (!station) return;
    const region = makeDynamicRegion(center, map.getZoom(), station);
    setRecentRegions(saveRecentRegion(region));
    activateRegion(region);
  };

  // Config-driven local mode (curated regions + dynamic "fish this area")
  const { dem, spots: demSpots, loading: demLoading, error: demError } = useRegionDem(activeRegion);
  const { reefSpots } = useRegionStructures(activeRegion);
  const regionForecast = useRegionForecast(activeRegion, targetDate, nowDate);
  const allSpots = useMemo(() => [...demSpots, ...reefSpots], [demSpots, reefSpots]);

  // Species the grade heatmap tracks — explicit selection or the top-ranked one
  const selectedOutlook = useMemo(
    () => regionForecast.outlooks.find(o => o.species.id === selectedSpeciesId) ?? regionForecast.outlooks[0] ?? null,
    [regionForecast.outlooks, selectedSpeciesId],
  );

  // Static per-cell spatial score for that species (depth fit + structure + zone);
  // recomputes only on species/spots change, not every scrub tick
  const gradeField = useMemo(() => {
    if (!activeRegion || !dem || !selectedOutlook) return null;
    return computeGradeField(dem, allSpots, selectedOutlook.species, selectedOutlook.profile, activeRegion.oceanDivider);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRegion, dem, allSpots, selectedOutlook?.species.id]);

  // Top structure spots for the selected species: structure affinity + depth fit
  const bestSpotsForSelected = useMemo(() => {
    if (!selectedOutlook || !allSpots.length) return [];
    const { profile, species } = selectedOutlook;
    const [lo, hi] = species.depthRangeFt;
    const range = Math.max(hi - lo, 1);
    return allSpots
      .map(spot => {
        const affinity = profile.structureAffinity[spot.kind] ?? 0.3;
        let fit = affinity * spot.structureScore;
        if (spot.depthFt > 0) {
          const dist = spot.depthFt >= lo && spot.depthFt <= hi
            ? 0
            : Math.min(Math.abs(spot.depthFt - lo), Math.abs(spot.depthFt - hi));
          const depthFit = dist === 0 ? 95 : dist <= range * 0.5 ? 75 : dist <= range * 1.5 ? 50 : dist <= range * 3 ? 25 : 10;
          fit += depthFit * 0.35;
        }
        return { spot, fit };
      })
      .sort((a, b) => b.fit - a.fit)
      .slice(0, 3)
      .map(x => x.spot);
  }, [selectedOutlook, allSpots]);

  // Pan to a spot and open its popup (used by the panel's "best spots" rows)
  const focusSpot = (spot: SpotCandidate) => {
    const map = mapRef.current;
    if (!map) return;
    map.flyTo([spot.lat, spot.lng], Math.max(map.getZoom(), 14), { duration: 0.8 });
    const idx = allSpots.findIndex(s => s.id === spot.id);
    const marker = spotMarkersRef.current[idx];
    if (marker) setTimeout(() => marker.openPopup(), 850);
  };

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

    // ESRI Ocean — nautical depth shading + bathymetric contours
    // maxNativeZoom caps real tile requests; Leaflet upscales deeper zooms so the map never goes blank
    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}',
      { attribution: 'Tiles &copy; Esri &mdash; Source: Esri, GEBCO, NOAA', maxNativeZoom: 16, maxZoom: 19 }
    ).addTo(map);
    // ESRI Ocean Reference — depth soundings, channel markers, chart labels
    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Reference/MapServer/tile/{z}/{y}/{x}',
      { attribution: '', maxNativeZoom: 13, maxZoom: 19 }
    ).addTo(map);

    L.control.zoom({ position: 'bottomleft' }).addTo(map);

    // Track center for the dynamic-region envelope check
    map.on('moveend', () => {
      const c = map.getCenter();
      setMapCenter({ lat: c.lat, lng: c.lng });
    });

    mapRef.current = map;
    if (onMapReady) onMapReady(map);

    return () => {
      map.remove();
      mapRef.current = null;
      markersRef.current.clear();
      const roots = [...popupRootsRef.current.values()];
      popupRootsRef.current.clear();
      setTimeout(() => roots.forEach(r => { try { r.unmount(); } catch (_) {} }), 0);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Map click handler: zone creation OR tile-select + pin drop
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const handler = (e: L.LeafletMouseEvent) => {
      const loc = { lat: e.latlng.lat, lng: e.latlng.lng };
      if (isCreating) {
        onRequestCreateZone(loc);
        setIsCreating(false);
        return;
      }
      // Local mode: click any water → ranked species for that exact location
      if (activeRegion) {
        if (dem) {
          L.popup({ maxWidth: 290 })
            .setLatLng(e.latlng)
            .setContent(locationPopupHtml(loc.lat, loc.lng, dem, allSpots, regionForecast.outlooks, activeRegion))
            .openOn(map);
        }
        return;
      }
      // Drop pin for spot forecast
      setPinLocation(loc);
    };

    map.on('click', handler);
    return () => { map.off('click', handler); };
  }, [isCreating, onRequestCreateZone, activeRegion, dem, allSpots, regionForecast.outlooks]);

  // Local mode: fly to the region on entry / region switch
  useEffect(() => {
    if (activeRegion && wasOibModeRef.current !== activeRegion.id) {
      mapRef.current?.flyTo([activeRegion.center.lat, activeRegion.center.lng], activeRegion.zoom, { duration: 1.5 });
    }
    wasOibModeRef.current = activeRegion?.id ?? null;
  }, [activeRegion]);

  // Local-mode street-detail basemap — the Esri Ocean base has almost no land
  // detail at high zoom, so overlay OSM (streets, canals, marinas) while active
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (activeRegion) {
      if (!osmLayerRef.current) {
        osmLayerRef.current = L.tileLayer(
          'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
          { attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors', maxZoom: 19 }
        );
      }
      osmLayerRef.current.addTo(map);
    } else {
      osmLayerRef.current?.remove();
    }
  }, [activeRegion]);

  // Local-mode overlay layer — per-pixel grade heatmap or depth shading
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (activeRegion && overlayMode !== 'off') {
      if (!depthLayerRef.current) {
        depthLayerRef.current = new DepthShadeLayer();
        depthLayerRef.current.addTo(map);
      }
      const layer = depthLayerRef.current;
      layer.setDem(dem);
      layer.setMode(overlayMode);
      layer.setGradeField(gradeField);
      layer.setConditionScore(selectedOutlook?.scoreNow ?? 60);
    } else {
      depthLayerRef.current?.remove();
      depthLayerRef.current = null;
    }
  }, [activeRegion, dem, overlayMode, gradeField, selectedOutlook]);

  // Local-mode spot markers — created when spots load (static seafloor data)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    spotMarkersRef.current.forEach(m => m.remove());
    spotMarkersRef.current = [];

    if (!activeRegion) return;

    allSpots.forEach(spot => {
      const marker = L.marker([spot.lat, spot.lng], { icon: makeSpotIcon(spot, false) })
        .bindPopup('', { maxWidth: 300 })
        .addTo(map);
      spotMarkersRef.current.push(marker);
    });
  }, [activeRegion, allSpots]);

  // Gold-ring highlight on the selected species' best spots
  useEffect(() => {
    if (!activeRegion) return;
    const topIds = new Set(bestSpotsForSelected.map(s => s.id));
    spotMarkersRef.current.forEach((marker, i) => {
      const spot = allSpots[i];
      if (!spot) return;
      marker.setIcon(makeSpotIcon(spot, topIds.has(spot.id)));
      marker.setZIndexOffset(topIds.has(spot.id) ? 500 : 0);
    });
  }, [activeRegion, allSpots, bestSpotsForSelected]);

  // Refresh spot popup content when the forecast changes — setContent keeps open popups open
  useEffect(() => {
    if (!activeRegion) return;
    spotMarkersRef.current.forEach((marker, i) => {
      const spot = allSpots[i];
      if (spot) marker.getPopup()?.setContent(spotPopupHtml(spot, regionForecast.outlooks));
    });
  }, [activeRegion, allSpots, regionForecast.outlooks]);

  // Cursor style
  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.style.cursor = isCreating ? 'crosshair' : '';
  }, [isCreating]);

  // OpenSeaMap nautical overlay — buoys, lights, depth marks, hazards
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (nauticalVisible) {
      if (!nauticalLayerRef.current) {
        nauticalLayerRef.current = L.tileLayer(
          'https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png',
          {
            attribution: 'Nautical data © <a href="https://www.openseamap.org">OpenSeaMap</a> contributors',
            minZoom: 8,
            maxNativeZoom: 18,
            maxZoom: 19,
            opacity: 1.0,
          }
        );
      }
      nauticalLayerRef.current.addTo(map);
    } else {
      nauticalLayerRef.current?.remove();
    }
  }, [nauticalVisible]);

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
        const root = popupRootsRef.current.get(id);
        popupRootsRef.current.delete(id);
        if (root) setTimeout(() => { try { root.unmount(); } catch (_) {} }, 0);
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

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" />
      <SearchBar onSelect={(loc, label) => onLocationChange(loc, label)} />
      <Legend visible={legendVisible} onToggle={() => setLegendVisible(v => !v)} />
      {!activeRegion && <NearMePanel userLocation={userLocation} zoneScores={zoneScores} targetDate={targetDate} />}

      {/* Spot forecast panel */}
      {pinLocation && !activeRegion && (
        <SpotForecastPanel
          pin={pinLocation}
          hourlyScores={hourlyScores}
          targetDate={targetDate}
          onClose={() => setPinLocation(null)}
        />
      )}

      {/* Ocean Isle Beach species panel */}
      {activeRegion && (
        <RegionPanel
          region={activeRegion}
          outlooks={regionForecast.outlooks}
          loading={regionForecast.loading}
          waterTempNowF={regionForecast.waterTempNowF}
          buoyBiasF={regionForecast.buoyBiasF}
          buoyStation={regionForecast.buoyStation}
          targetDate={targetDate}
          nowDate={nowDate}
          demStatus={demLoading ? 'loading' : demError ? 'error' : 'ready'}
          spotCount={allSpots.length}
          selectedSpeciesId={selectedSpeciesId}
          onSelectSpecies={setSelectedSpeciesId}
          bestSpots={bestSpotsForSelected}
          onFocusSpot={focusSpot}
          onClose={() => { setActiveRegion(null); setSelectedSpeciesId(null); }}
        />
      )}

      {/* Map control buttons — shift left of the region panel when it's open */}
      <div style={{ position: 'absolute', top: 56, right: activeRegion ? 312 : 12, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 6 }}>

        {/* Local mode: region picker */}
        <button
          onClick={() => {
            if (activeRegion) { setActiveRegion(null); setSelectedSpeciesId(null); setRegionMenuOpen(false); }
            else setRegionMenuOpen(v => !v);
          }}
          title={activeRegion ? `Exit ${activeRegion.name}` : 'High-res local mode: structure spots + per-species bite windows'}
          style={btnStyle(!!activeRegion || regionMenuOpen, '#f59e0b', '#fbbf24')}
        >
          🎯 {activeRegion ? `Exit ${activeRegion.name}` : 'Local Mode'}
        </button>
        {regionMenuOpen && !activeRegion && (
          <>
            {/* Dynamic region at the current map view — NC/SC envelope for now */}
            <button
              onClick={activateDynamicRegion}
              disabled={!inEnvelope(mapCenter) || stationsLoading || !tideStations.length}
              title={inEnvelope(mapCenter)
                ? 'Analyze the water around the current map view'
                : 'NC & SC coasts only (for now)'}
              style={{
                ...btnStyle(false, '#f59e0b', '#fbbf24'),
                opacity: inEnvelope(mapCenter) ? 1 : 0.45,
                cursor: inEnvelope(mapCenter) ? 'pointer' : 'not-allowed',
              }}
            >
              📍 {stationsLoading ? 'Finding tide stations…' : 'Fish this area'}
            </button>
            {!inEnvelope(mapCenter) && <HintPill>NC &amp; SC coasts only (for now)</HintPill>}

            {/* Curated regions */}
            {REGIONS.map(r => (
              <button key={r.id} onClick={() => activateRegion(r)} style={btnStyle(false, '#f59e0b', '#fbbf24')}>
                {r.name}
              </button>
            ))}

            {/* Recent dynamic areas */}
            {recentRegions.filter(r => !REGIONS_BY_ID.has(r.id)).map(r => (
              <button key={r.id} onClick={() => activateRegion(r)} style={btnStyle(false, '#0e7490', '#22d3ee')}>
                ↺ {r.name}
              </button>
            ))}
          </>
        )}

        {/* Overlay cycle: grade heatmap → depth shading → off (local mode only) */}
        {activeRegion && (
          <button
            onClick={() => setOverlayMode(m => (m === 'grade' ? 'depth' : m === 'depth' ? 'off' : 'grade'))}
            title="Cycle overlay: fishing-grade heatmap → depth shading → plain map"
            style={btnStyle(overlayMode !== 'off', overlayMode === 'grade' ? '#16a34a' : '#0e7490', overlayMode === 'grade' ? '#4ade80' : '#22d3ee')}
          >
            {overlayMode === 'grade' ? '🎨 Grade Map' : overlayMode === 'depth' ? '🌊 Depth Map' : '⬛ Overlay Off'}
          </button>
        )}

        {/* Add Zone */}
        <button
          onClick={() => { setIsCreating(v => !v); }}
          title={isCreating ? 'Cancel' : 'Add custom zone'}
          style={btnStyle(isCreating, '#0ea5e9', '#38bdf8')}
        >
          {isCreating ? '✕ Cancel' : '✎ Add Zone'}
        </button>
        {isCreating && <HintPill>Click map to place zone</HintPill>}

        {/* OpenSeaMap nautical overlay toggle */}
        <button
          onClick={() => setNauticalVisible(v => !v)}
          title={nauticalVisible ? 'Hide nautical marks' : 'Show nautical marks (buoys, lights, hazards)'}
          style={btnStyle(nauticalVisible, '#0369a1', '#38bdf8')}
        >
          ⚓ {nauticalVisible ? 'Hide Charts' : 'Charts'}
        </button>
      </div>

      {/* OIB grade-heatmap legend */}
      {activeRegion && overlayMode === 'grade' && selectedOutlook && (
        <div style={{
          position: 'absolute', bottom: 150, left: 12, zIndex: 9999,
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
          <div style={{ fontSize: 9, color: '#38bdf8', marginTop: 5, borderTop: '1px solid #1e293b', paddingTop: 4, maxWidth: 130 }}>
            {selectedOutlook.species.commonName}
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
        Data: Open-Meteo · NOAA Tides · CoastWatch SST · ETOPO1 · NOAA ENC · Esri Ocean{activeRegion && ' · NCEI CUDEM · NDBC buoys · NOAA reefs'}
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
