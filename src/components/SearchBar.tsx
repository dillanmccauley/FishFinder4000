import { useState, useRef } from 'react';
import type { LatLng } from '../types';

const COASTAL_LOCATIONS: { name: string; location: LatLng }[] = [
  // Maine
  { name: 'Portland, ME', location: { lat: 43.6591, lng: -70.2568 } },
  { name: 'Kennebec River, ME', location: { lat: 43.8520, lng: -69.7690 } },
  { name: 'Bar Harbor, ME', location: { lat: 44.3876, lng: -68.2039 } },
  // New Hampshire
  { name: 'Hampton Beach, NH', location: { lat: 42.9148, lng: -70.8100 } },
  // Massachusetts
  { name: 'Cape Cod Canal, MA', location: { lat: 41.7374, lng: -70.6120 } },
  { name: 'Buzzards Bay, MA', location: { lat: 41.6502, lng: -70.8624 } },
  { name: 'Plymouth, MA', location: { lat: 41.9584, lng: -70.6673 } },
  { name: 'Boston, MA', location: { lat: 42.3601, lng: -71.0589 } },
  { name: 'Gloucester, MA', location: { lat: 42.6159, lng: -70.6620 } },
  // Rhode Island
  { name: 'Newport, RI', location: { lat: 41.4901, lng: -71.3128 } },
  { name: 'Narragansett, RI', location: { lat: 41.4321, lng: -71.4518 } },
  { name: 'Block Island, RI', location: { lat: 41.1673, lng: -71.5614 } },
  // Connecticut
  { name: 'Niantic Bay, CT', location: { lat: 41.3218, lng: -72.1730 } },
  { name: 'New Haven, CT', location: { lat: 41.3083, lng: -72.9279 } },
  // New York
  { name: 'Montauk, NY', location: { lat: 41.0718, lng: -71.8573 } },
  { name: 'Fire Island, NY', location: { lat: 40.6218, lng: -73.3195 } },
  { name: 'Sandy Hook, NY/NJ', location: { lat: 40.4618, lng: -74.0120 } },
  // New Jersey
  { name: 'Barnegat Inlet, NJ', location: { lat: 39.7517, lng: -74.1038 } },
  { name: 'Cape May, NJ', location: { lat: 38.9351, lng: -74.9060 } },
  // Delaware
  { name: 'Indian River Inlet, DE', location: { lat: 38.6089, lng: -75.0699 } },
  { name: 'Lewes, DE', location: { lat: 38.7743, lng: -75.1391 } },
  // Maryland
  { name: 'Ocean City, MD', location: { lat: 38.3254, lng: -75.0849 } },
  { name: 'Tilghman Island, MD', location: { lat: 38.7127, lng: -76.3368 } },
  { name: 'Annapolis, MD', location: { lat: 38.9784, lng: -76.4922 } },
  // Virginia
  { name: 'Virginia Beach, VA', location: { lat: 36.8529, lng: -75.9780 } },
  { name: 'Chesapeake Bay Bridge-Tunnel, VA', location: { lat: 36.9726, lng: -76.1132 } },
  { name: 'Norfolk, VA', location: { lat: 36.8468, lng: -76.2951 } },
  // North Carolina
  { name: 'Beaufort, NC', location: { lat: 34.7182, lng: -76.6616 } },
  { name: 'Cape Fear, NC', location: { lat: 33.8600, lng: -77.9700 } },
  { name: 'Wilmington, NC', location: { lat: 34.2257, lng: -77.9447 } },
  // South Carolina
  { name: 'Myrtle Beach, SC', location: { lat: 33.6891, lng: -78.8867 } },
  { name: 'Charleston, SC', location: { lat: 32.7765, lng: -79.9311 } },
  { name: 'Beaufort, SC', location: { lat: 32.4316, lng: -80.6698 } },
  { name: 'Hilton Head Island, SC', location: { lat: 32.1163, lng: -80.7526 } },
  // Georgia
  { name: 'Savannah, GA', location: { lat: 32.0835, lng: -81.0998 } },
  { name: 'Tybee Island, GA', location: { lat: 31.9983, lng: -80.8452 } },
  { name: 'Brunswick, GA', location: { lat: 31.1499, lng: -81.4915 } },
  // Florida East Coast
  { name: 'Jacksonville, FL', location: { lat: 30.3322, lng: -81.6557 } },
  { name: 'St. Augustine, FL', location: { lat: 29.8947, lng: -81.3145 } },
  { name: 'Daytona Beach, FL', location: { lat: 29.2108, lng: -81.0228 } },
  { name: 'Sebastian Inlet, FL', location: { lat: 27.8651, lng: -80.4490 } },
  { name: 'Vero Beach, FL', location: { lat: 27.6386, lng: -80.3973 } },
  { name: 'Indian River Lagoon, FL', location: { lat: 27.5500, lng: -80.4200 } },
  { name: 'Fort Pierce, FL', location: { lat: 27.4467, lng: -80.3256 } },
  { name: 'Stuart, FL', location: { lat: 27.1975, lng: -80.2528 } },
  { name: 'Lake Worth / Palm Beach, FL', location: { lat: 26.7784, lng: -80.0370 } },
  { name: 'Haulover Inlet, FL', location: { lat: 25.9003, lng: -80.1215 } },
  // Florida West Coast
  { name: 'Naples, FL', location: { lat: 26.1420, lng: -81.7948 } },
  { name: 'Charlotte Harbor, FL', location: { lat: 26.8900, lng: -82.1000 } },
  { name: 'Boca Grande, FL', location: { lat: 26.7370, lng: -82.2570 } },
];

interface Props {
  onSelect: (location: LatLng, label: string) => void;
}

export function SearchBar({ onSelect }: Props) {
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = query.length >= 2
    ? COASTAL_LOCATIONS.filter(l => l.name.toLowerCase().includes(query.toLowerCase())).slice(0, 6)
    : [];

  function handleSelect(item: typeof COASTAL_LOCATIONS[0]) {
    onSelect(item.location, item.name);
    setQuery(item.name);
    setFocused(false);
    inputRef.current?.blur();
  }

  return (
    <div style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', width: 320, zIndex: 9999 }}>
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
          placeholder="Search US East Coast location..."
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
