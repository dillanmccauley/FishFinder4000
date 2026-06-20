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
}

export interface Species {
  id: string;
  name: string;
  commonName: string;
  /** Monthly availability 0–100 for SE US */
  monthlyAvailability: number[];
  preferredWaterTempF: [number, number];
  topLures: string[];
  topRigs: string[];
  peakTidePhase: 'incoming' | 'outgoing' | 'high' | 'low' | 'any';
}

export interface BiteReport {
  hotspotId: string;
  speciesId: string;
  intensity: number; // 0–100
  timestamp: Date;
  source: string;
  verified: boolean;
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
  total: number; // 0–100
  grade: Grade;
  biteScore: number;
  marineScore: number;
  seasonScore: number;
  activeSpecies: Species[];
  conditions: MarineConditions | null;
  tide: TideInfo | null;
  topBiteReport: BiteReport | null;
  confidence: number; // 0–1
  isForecast: boolean;
  forecastHoursAhead: number;
}

export interface TimeOffset {
  /** Hours relative to now: negative = past, positive = future */
  hours: number;
}
