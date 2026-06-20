import { useState, useEffect, useRef } from 'react';
import type { TideInfo } from '../types';
import { addHours, startOfHour, format, subDays, addDays } from 'date-fns';

interface TideCache {
  [stationKey: string]: { time: Date; heightFt: number; type: 'H' | 'L' }[];
}

const CACHE: TideCache = {};

function interpolateTide(
  events: { time: Date; heightFt: number; type: 'H' | 'L' }[],
  targetDate: Date,
): TideInfo | null {
  if (!events.length) return null;
  const targetMs = targetDate.getTime();
  // Find surrounding events
  let prev = events[0];
  let next = events[events.length - 1];
  for (let i = 0; i < events.length - 1; i++) {
    if (events[i].time.getTime() <= targetMs && events[i + 1].time.getTime() > targetMs) {
      prev = events[i];
      next = events[i + 1];
      break;
    }
  }
  const totalMs = next.time.getTime() - prev.time.getTime();
  const elapsedMs = targetMs - prev.time.getTime();
  const ratio = totalMs > 0 ? elapsedMs / totalMs : 0;
  // Cosine interpolation for smooth tide curve
  const cosRatio = (1 - Math.cos(ratio * Math.PI)) / 2;
  const height = prev.heightFt + (next.heightFt - prev.heightFt) * cosRatio;

  const phase: TideInfo['phase'] =
    next.type === 'H' ? 'incoming' :
    next.type === 'L' ? 'outgoing' :
    prev.type === 'H' ? 'outgoing' : 'incoming';

  const minutesToNext = Math.round((next.time.getTime() - targetMs) / 60000);
  const nextLabel = next.type === 'H' ? 'High' : 'Low';

  return {
    phase,
    heightFt: height,
    nextEventLabel: `${nextLabel} tide in ${minutesToNext < 60
      ? `${minutesToNext}m`
      : `${Math.floor(minutesToNext / 60)}h ${minutesToNext % 60}m`}`,
    nextEventTime: next.time,
  };
}

export function useTideData(stationIds: string[]) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetched = useRef(new Set<string>());

  const uniqueIds = [...new Set(stationIds)];

  useEffect(() => {
    const toFetch = uniqueIds.filter(id => !fetched.current.has(id));
    if (!toFetch.length) return;

    setLoading(true);
    const begin = format(subDays(new Date(), 1), 'yyyyMMdd');
    const end = format(addDays(new Date(), 3), 'yyyyMMdd');

    Promise.all(
      toFetch.map(async (stationId) => {
        const url = `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?begin_date=${begin}&end_date=${end}&station=${stationId}&product=predictions&datum=MLLW&time_zone=lst_ldt&interval=hilo&units=english&application=fishfinder4000&format=json`;
        const res = await fetch(url);
        const data = await res.json();
        if (data.predictions) {
          CACHE[stationId] = data.predictions.map((p: { t: string; v: string; type: 'H' | 'L' }) => ({
            time: new Date(p.t),
            heightFt: parseFloat(p.v),
            type: p.type,
          }));
        } else {
          seedFallbackTides(stationId);
        }
        fetched.current.add(stationId);
      })
    )
      .catch((err) => {
        setError(err.message);
        toFetch.forEach(id => { seedFallbackTides(id); fetched.current.add(id); });
      })
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uniqueIds.join(',')]);

  function getTideAt(stationId: string, targetDate: Date): TideInfo | null {
    const events = CACHE[stationId];
    if (!events) return null;
    return interpolateTide(events, targetDate);
  }

  return { getTideAt, loading, error };
}

function seedFallbackTides(stationId: string) {
  if (CACHE[stationId]) return;
  const now = new Date();
  const events: { time: Date; heightFt: number; type: 'H' | 'L' }[] = [];
  // Generate semi-diurnal tides over 4 days
  let t = startOfHour(addHours(now, -24));
  let isHigh = true;
  for (let i = 0; i < 16; i++) {
    events.push({
      time: t,
      heightFt: isHigh ? 4.5 + Math.random() : 0.8 + Math.random() * 0.5,
      type: isHigh ? 'H' : 'L',
    });
    t = new Date(t.getTime() + (isHigh ? 6.2 : 6.4) * 3600000);
    isHigh = !isHigh;
  }
  CACHE[stationId] = events;
}
