import { supabase, isSupabaseConfigured } from './supabase';
import { Coordinates } from '../types';
import { calculateDistanceKm } from './routing';

export interface DriverLiveLocationState {
  coords: Coordinates;
  heading?: number;
  speedKmh?: number;
  updatedAt: string;
  isSignalLost: boolean;
}

// Throttle timestamp tracker
let lastPublishedTimestamp = 0;
const PUBLISH_THROTTLE_MS = 6000; // Send at most once every 6 seconds

/**
 * 1. Publish Driver Location to Supabase driver_locations table
 */
export async function publishDriverLocation(
  driverId: string,
  coords: Coordinates,
  heading?: number,
  speedKmh?: number
): Promise<boolean> {
  const now = Date.now();
  if (now - lastPublishedTimestamp < PUBLISH_THROTTLE_MS) {
    return false; // Throttled
  }
  lastPublishedTimestamp = now;

  if (isSupabaseConfigured()) {
    try {
      const { error } = await supabase.from('driver_locations').upsert({
        driver_id: driverId,
        latitude: coords.lat,
        longitude: coords.lng,
        heading: heading ?? null,
        speed_kmh: speedKmh ?? null,
        updated_at: new Date().toISOString(),
      });
      if (error) {
        console.warn('Error al guardar ubicación de repartidor en Supabase:', error.message);
        return false;
      }
      return true;
    } catch (err) {
      console.warn('Error de conexión al enviar GPS a Supabase:', err);
      return false;
    }
  }

  // Local fallback: save in session storage and broadcast
  try {
    sessionStorage.setItem(`driver_loc_${driverId}`, JSON.stringify({
      coords,
      heading,
      speedKmh,
      updatedAt: new Date().toISOString(),
    }));
  } catch {
    // Ignore
  }
  return true;
}

/**
 * 2. Start Driver Live GPS tracking via navigator.geolocation.watchPosition
 * Cleans up all listeners and intervals when stopped.
 */
export function startDriverLiveGPS(
  driverId: string,
  onLocationUpdate: (coords: Coordinates, speedKmh?: number) => void,
  onError: (errorMessage: string) => void
): () => void {
  if (typeof window === 'undefined' || !navigator.geolocation) {
    onError('Tu navegador o dispositivo no soporta geolocalización GPS.');
    return () => {};
  }

  // Handle online / offline network status
  const handleOnline = () => {
    onError('Conexión reestablecida. GPS transmitiendo...');
  };
  const handleOffline = () => {
    onError('Sin conexión a internet. Los datos de GPS se sincronizarán al reconectar.');
  };
  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  const watchId = navigator.geolocation.watchPosition(
    (position) => {
      const { latitude, longitude, heading, speed } = position.coords;
      const coords: Coordinates = { lat: latitude, lng: longitude };
      const speedKmh = speed !== null && speed >= 0 ? Math.round(speed * 3.6) : undefined;

      onLocationUpdate(coords, speedKmh);
      publishDriverLocation(driverId, coords, heading !== null && !isNaN(heading) ? heading : undefined, speedKmh);
    },
    (err) => {
      switch (err.code) {
        case err.PERMISSION_DENIED:
          onError('Permiso de GPS denegado. Activa los permisos de ubicación en tu navegador para guiar el reparto.');
          break;
        case err.POSITION_UNAVAILABLE:
          onError('Señal de GPS no disponible. Asegúrate de encender la ubicación en los ajustes de tu celular.');
          break;
        case err.TIMEOUT:
          onError('Tiempo de espera de GPS agotado. Esperando señal de satélite...');
          break;
        default:
          onError(`Error de GPS (${err.message}). Reintentando conexión...`);
      }
    },
    {
      enableHighAccuracy: true,
      maximumAge: 4000,
      timeout: 15000,
    }
  );

  return () => {
    navigator.geolocation.clearWatch(watchId);
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  };
}

/**
 * 3. Screen Wake Lock API
 * Prevents mobile browser from sleeping during active motorbike navigation.
 */
export async function requestScreenWakeLock(
  onStatusChange?: (isActive: boolean) => void
): Promise<() => void> {
  let wakeLockSentinel: any = null;

  async function request() {
    try {
      if ('wakeLock' in navigator && (navigator as any).wakeLock) {
        wakeLockSentinel = await (navigator as any).wakeLock.request('screen');
        onStatusChange?.(true);
        wakeLockSentinel.addEventListener('release', () => {
          onStatusChange?.(false);
        });
      }
    } catch (err) {
      console.warn('Wake Lock no disponible o rechazado por el sistema:', err);
      onStatusChange?.(false);
    }
  }

  await request();

  const handleVisibilityChange = async () => {
    if (document.visibilityState === 'visible' && !wakeLockSentinel) {
      await request();
    }
  };
  document.addEventListener('visibilitychange', handleVisibilityChange);

  return () => {
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    if (wakeLockSentinel) {
      try {
        wakeLockSentinel.release();
      } catch {
        // Ignore
      }
      wakeLockSentinel = null;
    }
    onStatusChange?.(false);
  };
}

/**
 * 4. Subscribe to Real-time Driver Location (Used by Customer View)
 * Detects if driver loses GPS signal (> 60 seconds without updates).
 */
export function subscribeToDriverLocation(
  driverId: string,
  onUpdate: (state: DriverLiveLocationState) => void
): () => void {
  let lastReceivedAt = Date.now();
  let latestCoords: Coordinates | null = null;
  let latestHeading: number | undefined;
  let latestSpeed: number | undefined;

  // Initial fetch from Supabase
  if (isSupabaseConfigured()) {
    supabase
      .from('driver_locations')
      .select('*')
      .eq('driver_id', driverId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          latestCoords = { lat: Number(data.latitude), lng: Number(data.longitude) };
          latestHeading = data.heading ? Number(data.heading) : undefined;
          latestSpeed = data.speed_kmh ? Number(data.speed_kmh) : undefined;
          lastReceivedAt = new Date(data.updated_at).getTime();

          const isLost = Date.now() - lastReceivedAt > 60000;
          onUpdate({
            coords: latestCoords,
            heading: latestHeading,
            speedKmh: latestSpeed,
            updatedAt: data.updated_at,
            isSignalLost: isLost,
          });
        }
      });
  }

  // Interval check every 5 seconds to detect signal loss (> 60 seconds)
  const intervalId = setInterval(() => {
    if (latestCoords) {
      const isLost = Date.now() - lastReceivedAt > 60000;
      onUpdate({
        coords: latestCoords,
        heading: latestHeading,
        speedKmh: latestSpeed,
        updatedAt: new Date(lastReceivedAt).toISOString(),
        isSignalLost: isLost,
      });
    }
  }, 5000);

  // Realtime subscription
  let channel: any = null;
  if (isSupabaseConfigured()) {
    channel = supabase
      .channel(`driver_loc_${driverId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'driver_locations',
          filter: `driver_id=eq.${driverId}`,
        },
        (payload: any) => {
          const row = payload.new;
          if (row && row.latitude && row.longitude) {
            latestCoords = { lat: Number(row.latitude), lng: Number(row.longitude) };
            latestHeading = row.heading ? Number(row.heading) : undefined;
            latestSpeed = row.speed_kmh ? Number(row.speed_kmh) : undefined;
            lastReceivedAt = Date.now();

            onUpdate({
              coords: latestCoords,
              heading: latestHeading,
              speedKmh: latestSpeed,
              updatedAt: row.updated_at || new Date().toISOString(),
              isSignalLost: false,
            });
          }
        }
      )
      .subscribe();
  }

  return () => {
    clearInterval(intervalId);
    if (channel) {
      supabase.removeChannel(channel);
    }
  };
}

/**
 * 5. Proximity alert checker
 * Checks if driver is within 150m (0.15 km) from drop-off destination.
 */
export function isNearDestination(driverCoords: Coordinates, destinationCoords: Coordinates, thresholdKm = 0.15): boolean {
  const dist = calculateDistanceKm(driverCoords, destinationCoords);
  return dist <= thresholdKm;
}
