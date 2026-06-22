import { useState, useCallback } from 'react';
import { addHours } from 'date-fns';
import type { LatLng } from './types';
import { useGeolocation } from './hooks/useGeolocation';
import { useMarineData } from './hooks/useMarineData';
import { useTideData } from './hooks/useTideData';
import { useBiteReports } from './hooks/useBiteReports';
import { useZoneScores } from './hooks/useZoneScores';
import { useCustomZones } from './hooks/useCustomZones';
import { FishMap } from './components/FishMap';
import { TimeScrubber } from './components/TimeScrubber';
import { CreateZoneModal } from './components/CreateZoneModal';
import { HOTSPOTS } from './data/hotspots';

const NOW = new Date();

export default function App() {
  const [offsetHours, setOffsetHours] = useState(0);
  const [mapCenter, setMapCenter] = useState<LatLng | null>(null);
  const [locationLabel, setLocationLabel] = useState('');
  const [pendingZoneLoc, setPendingZoneLoc] = useState<LatLng | null>(null);

  const { location: gpsLocation, loading: gpsLoading, usingDefault } = useGeolocation();
  const activeCenter = mapCenter ?? gpsLocation;

  const { getConditionsAt, loading: marineLoading } = useMarineData(activeCenter);

  const stationIds = HOTSPOTS.map(h => h.tideStationId);
  const { getTideAt, loading: tideLoading } = useTideData(stationIds);

  const biteReports = useBiteReports();
  const { customZones, addZone, removeZone } = useCustomZones();
  const targetDate = addHours(NOW, offsetHours);

  const zoneScores = useZoneScores({
    targetDate,
    getConditionsAt,
    getTideAt,
    biteReports,
    nowDate: NOW,
    customHotspots: customZones,
  });

  const handleLocationChange = useCallback((loc: LatLng, label: string) => {
    setMapCenter(loc);
    setLocationLabel(label);
  }, []);

  const handleRequestCreateZone = useCallback((loc: LatLng) => {
    setPendingZoneLoc(loc);
  }, []);

  const handleRemoveCustomZone = useCallback((id: string) => {
    removeZone(id);
  }, [removeZone]);

  const isLoading = gpsLoading || marineLoading || tideLoading;
  const totalZones = HOTSPOTS.length + customZones.length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100vw', height: '100vh', background: '#0f172a' }}>
      {/* Header */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 16px',
          background: '#0f172a',
          borderBottom: '1px solid #1e293b',
          zIndex: 100,
          flexShrink: 0,
          height: 52,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 22 }}>🎣</span>
          <div>
            <span style={{ fontWeight: 800, fontSize: 17, color: '#38bdf8', letterSpacing: '-0.3px' }}>
              FishFinder
            </span>
            <span style={{ fontWeight: 800, fontSize: 17, color: '#f1f5f9', letterSpacing: '-0.3px' }}>
              {' '}4000
            </span>
          </div>
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              padding: '2px 6px',
              borderRadius: 4,
              background: '#0ea5e920',
              border: '1px solid #0ea5e9',
              color: '#38bdf8',
              letterSpacing: '0.05em',
            }}
          >
            US EAST COAST
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {locationLabel && (
            <span style={{ color: '#64748b', fontSize: 12 }}>
              📍 {locationLabel}
            </span>
          )}
          {usingDefault && (
            <span
              style={{
                fontSize: 11,
                padding: '2px 8px',
                borderRadius: 4,
                background: '#fbbf2420',
                border: '1px solid #fbbf24',
                color: '#fbbf24',
              }}
            >
              GPS unavailable · Defaulting to Jacksonville, FL
            </span>
          )}
          {isLoading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#64748b' }}>
              <Spinner />
              Loading data…
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#475569' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
            {totalZones} zones{customZones.length > 0 && ` (${customZones.length} custom)`}
          </div>
        </div>
      </header>

      {/* Map */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <FishMap
          userLocation={activeCenter}
          zoneScores={zoneScores}
          customZones={customZones}
          onLocationChange={handleLocationChange}
          onRequestCreateZone={handleRequestCreateZone}
          onRemoveCustomZone={handleRemoveCustomZone}
        />
      </div>

      {/* Time scrubber */}
      <TimeScrubber
        offsetHours={offsetHours}
        onChange={setOffsetHours}
        nowDate={NOW}
      />

      {/* Custom zone creation modal */}
      {pendingZoneLoc && (
        <CreateZoneModal
          location={pendingZoneLoc}
          onConfirm={(params) => {
            addZone(params);
            setPendingZoneLoc(null);
          }}
          onCancel={() => setPendingZoneLoc(null)}
        />
      )}
    </div>
  );
}

function Spinner() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      style={{ animation: 'spin 1s linear infinite' }}
    >
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  );
}
