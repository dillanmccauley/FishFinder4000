import { useState, useRef } from 'react';
import type { LatLng } from '../types';

// Quick lookup of SE US coastal areas for the search bar
const SE_LOCATIONS: { name: string; location: LatLng }[] = [
  { name: 'Jacksonville, FL', location: { lat: 30.3322, lng: -81.6557 } },
  { name: 'St. Augustine, FL', location: { lat: 29.8947, lng: -81.3145 } },
  { name: 'Daytona Beach, FL', location: { lat: 29.2108, lng: -81.0228 } },
  { name: 'Sebastian Inlet, FL', location: { lat: 27.8651, lng: -80.4490 } },
  { name: 'Vero Beach, FL', location: { lat: 27.6386, lng: -80.3973 } },
  { name: 'Indian River Lagoon, FL', location: { lat: 27.5500, lng: -80.4200 } },
  { name: 'Fort Pierce, FL', location: { lat: 27.4467, lng: -80.3256 } },
  { name: 'Stuart, FL', location: { lat: 27.1975, lng: -80.2528 } },
  { name: 'Naples, FL', location: { lat: 26.1420, lng: -81.7948 } },
  { name: 'Charlotte Harbor, FL', location: { lat: 26.8900, lng: -82.1000 } },
  { name: 'Boca Grande, FL', location: { lat: 26.7370, lng: -82.2570 } },
  { name: 'Savannah, GA', location: { lat: 32.0835, lng: -81.0998 } },
  { name: 'Tybee Island, GA', location: { lat: 31.9983, lng: -80.8452 } },
  { name: 'Brunswick, GA', location: { lat: 31.1499, lng: -81.4915 } },
  { name: 'Hilton Head Island, SC', location: { lat: 32.1163, lng: -80.7526 } },
  { name: 'Beaufort, SC', location: { lat: 32.4316, lng: -80.6698 } },
  { name: 'Charleston, SC', location: { lat: 32.7765, lng: -79.9311 } },
  { name: 'Myrtle Beach, SC', location: { lat: 33.6891, lng: -78.8867 } },
  { name: 'Wilmington, NC', location: { lat: 34.2257, lng: -77.9447 } },
  { name: 'Cape Fear, NC', location: { lat: 33.8600, lng: -77.9700 } },
  { name: 'Beaufort, NC', location: { lat: 34.7182, lng: -76.6616 } },
];

interface Props {
  onSelect: (location: LatLng, label: string) => void;
}

export function SearchBar({ onSelect }: Props) {
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = query.length >= 2
    ? SE_LOCATIONS.filter(l => l.name.toLowerCase().includes(query.toLowerCase())).slice(0, 6)
    : [];

  function handleSelect(item: typeof SE_LOCATIONS[0]) {
    onSelect(item.location, item.name);
    setQuery(item.name);
    setFocused(false);
    inputRef.current?.blur();
  }

  return (
    <div className="absolute top-3 left-1/2 z-50" style={{ transform: 'translateX(-50%)', width: 320 }}>
      <div
        className="flex items-center gap-2 px-3 py-2 rounded-xl"
        style={{
          background: '#1e293bef',
          border: '1px solid #334155',
          backdropFilter: 'blur(8px)',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2.5">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          placeholder="Search SE US coastal location..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          style={{
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: '#f1f5f9',
            fontSize: 13,
            width: '100%',
          }}
        />
        {query && (
          <button
            onClick={() => { setQuery(''); setFocused(false); }}
            style={{ color: '#64748b', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 16 }}
          >
            ×
          </button>
        )}
      </div>
      {focused && results.length > 0 && (
        <div
          className="rounded-xl mt-1 overflow-hidden"
          style={{
            background: '#1e293bef',
            border: '1px solid #334155',
            backdropFilter: 'blur(8px)',
          }}
        >
          {results.map(item => (
            <button
              key={item.name}
              onMouseDown={() => handleSelect(item)}
              className="w-full text-left px-3 py-2 flex items-center gap-2"
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: '#e2e8f0',
                fontSize: 13,
                borderBottom: '1px solid #1e293b',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#334155')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <span style={{ color: '#38bdf8', fontSize: 12 }}>📍</span>
              {item.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
