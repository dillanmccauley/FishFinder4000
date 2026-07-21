import { useState, useEffect } from 'react';
import { OIB_TEMP_BUOY, OIB_WAVE_BUOY } from '../data/oibConfig';

/**
 * Measured conditions from the CORMP buoys off Sunset Beach via CoastWatch ERDDAP
 * (the NDBC site itself has no CORS headers; ERDDAP mirrors all NDBC met data).
 *   41024 "Sunset Nearshore" — water temp at 1 m
 *   41119 — companion wave buoy
 * Measured inshore water temp beats modeled SST by a wide margin — it is the
 * single most predictive variable for inshore bites here.
 */
export interface OIBBuoyData {
  waterTempF: number | null;
  waveHeightFt: number | null;
  asOf: Date | null;
  loading: boolean;
}

const ERDDAP_URL =
  'https://coastwatch.pfeg.noaa.gov/erddap/tabledap/cwwcNDBCMet.json' +
  `?station%2Ctime%2Cwtmp%2Cwvht&station=~%22${OIB_TEMP_BUOY}%7C${OIB_WAVE_BUOY}%22&time%3E=now-2days`;

let cachedBuoy: { waterTempF: number | null; waveHeightFt: number | null; asOf: Date | null } | null = null;

export function useOIBBuoy(enabled: boolean): OIBBuoyData {
  const [data, setData] = useState<OIBBuoyData>(() => ({
    waterTempF: cachedBuoy?.waterTempF ?? null,
    waveHeightFt: cachedBuoy?.waveHeightFt ?? null,
    asOf: cachedBuoy?.asOf ?? null,
    loading: false,
  }));

  useEffect(() => {
    if (!enabled || cachedBuoy) return;
    let cancelled = false;
    setData(d => ({ ...d, loading: true }));

    fetch(ERDDAP_URL)
      .then(r => r.json())
      .then(json => {
        if (cancelled) return;
        const cols: string[] = json.table?.columnNames ?? [];
        const iStation = cols.indexOf('station');
        const iTime = cols.indexOf('time');
        const iWtmp = cols.indexOf('wtmp');
        const iWvht = cols.indexOf('wvht');
        const rows: (string | number | null)[][] = json.table?.rows ?? [];

        let waterTempC: number | null = null;
        let waveM: number | null = null;
        let latest: Date | null = null;

        // Rows are time-ordered; walk forward so the last valid reading wins
        rows.forEach(row => {
          const station = String(row[iStation] ?? '');
          const t = row[iTime] ? new Date(String(row[iTime])) : null;
          const wtmp = typeof row[iWtmp] === 'number' ? (row[iWtmp] as number) : null;
          const wvht = typeof row[iWvht] === 'number' ? (row[iWvht] as number) : null;
          if (station === OIB_TEMP_BUOY && wtmp != null && wtmp > -5 && wtmp < 40) {
            waterTempC = wtmp;
            if (t) latest = t;
          }
          if (station === OIB_WAVE_BUOY && wvht != null && wvht >= 0 && wvht < 20) {
            waveM = wvht;
          }
        });

        const result = {
          waterTempF: waterTempC != null ? (waterTempC as number) * 9 / 5 + 32 : null,
          waveHeightFt: waveM != null ? (waveM as number) * 3.28084 : null,
          asOf: latest,
        };
        cachedBuoy = result;
        setData({ ...result, loading: false });
      })
      .catch(() => {
        if (!cancelled) setData({ waterTempF: null, waveHeightFt: null, asOf: null, loading: false });
      });

    return () => { cancelled = true; };
  }, [enabled]);

  return data;
}
