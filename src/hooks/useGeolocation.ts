import { useState, useEffect } from 'react';
import type { LatLng } from '../types';

// Default to Jacksonville, FL if GPS unavailable
const SE_US_DEFAULT: LatLng = { lat: 30.3322, lng: -81.6557 };

interface GeoState {
  location: LatLng;
  loading: boolean;
  error: string | null;
  usingDefault: boolean;
}

export function useGeolocation(): GeoState {
  const [state, setState] = useState<GeoState>({
    location: SE_US_DEFAULT,
    loading: true,
    error: null,
    usingDefault: false,
  });

  useEffect(() => {
    if (!navigator.geolocation) {
      setState({ location: SE_US_DEFAULT, loading: false, error: 'Geolocation not supported', usingDefault: true });
      return;
    }
    const id = navigator.geolocation.getCurrentPosition(
      (pos) => {
        setState({
          location: { lat: pos.coords.latitude, lng: pos.coords.longitude },
          loading: false,
          error: null,
          usingDefault: false,
        });
      },
      (err) => {
        setState({
          location: SE_US_DEFAULT,
          loading: false,
          error: err.message,
          usingDefault: true,
        });
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
    );
    return () => {
      // getCurrentPosition doesn't return an ID to clear, but signature expects cleanup
      void id;
    };
  }, []);

  return state;
}
