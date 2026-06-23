export type Grade = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

export interface LatLng {
  lat: number;
  lng: number;
}

export type HotspotType = 'pier' | 'inlet' | 'flat' | 'reef' | 'pass';

export interface Hotspot {
  id: string;
  name: string;
  type: HotspotType;
  location: LatLng;
  /** NOAA tide station ID nearest this spot */
  tideStationId: string;
  activeSpeciesIds: string[];
  notes: string;
  /** Typical fishing depth range at this spot [min, max] feet */
  depthRangeFt?: [number, number];
}

export interface Species {
  id: string;
  name: string;
  commonName: string;
  /** Monthly availability 0–100, Jan–Dec */
  monthlyAvailability: number[];
  preferredWaterTempF: [number, number];
  /** Typical depth range this species is found in [min, max] feet */
  depthRangeFt: [number, number];
  topLures: string[];
  topRigs: string[];
  peakTidePhase: 'incoming' | 'outgoing' | 'high' | 'low' | 'any';
}

export interface MarineConditions {
  waterTempF: number;
  waveHeightFt: number;
  windSpeedMph: number;
  windDirectionDeg: number;
  visibilityMi: number;
  timestamp: Date;
}

export interface TideInfo {
  phase: 'incoming' | 'outgoing' | 'high' | 'low';
  heightFt: number;
  nextEventLabel: string;
  nextEventTime: Date;
}

export interface ZoneScore {
  hotspotId: string;
  total: number;       // 0–100 composite
  grade: Grade;
  marineScore: number; // 40% — wind, waves, sea temp (Open-Meteo)
  seasonScore: number; // 35% — monthly migration + water-temp adjustment
  tideScore: number;   // 15% — phase match + tidal movement (NOAA)
  moonScore: number;   // 10% — lunar phase (new/full = peak)
  moonPhase: number;   // 0–1 raw (0 = new, 0.5 = full)
  moonPhaseName: string;
  moonPhaseEmoji: string;
  activeSpecies: Species[];
  conditions: MarineConditions | null;
  tide: TideInfo | null;
  confidence: number;  // 0–1 forecast confidence decay
  isForecast: boolean;
  forecastHoursAhead: number;
}

export interface TimeOffset {
  /** Hours relative to now: negative = past, positive = future */
  hours: number;
}
