import { Coordinates } from '../types';
import { calculateDistanceKm } from './routing';
import { saveStoredUserLocation } from './storage';

export interface SectorItem {
  id: string;
  name: string;
  lat: number;
  lng: number;
  category: 'sector' | 'plaza' | 'avenida';
  badge?: string;
  keywords?: string[];
}

/**
 * Loma de Cabrera & Dajabón Regional Sectors & Landmarks (BLACK VAPE Delivery Zone)
 * Sede central: Colmado Noadia, RD-45 Carretera Duarte (19.41688, -71.61287)
 */
export const LOMA_CABRERA_SECTORS: SectorItem[] = [
  // Sede Principal
  {
    id: 'colmado_noadia',
    name: 'Colmado Noadia (Sede BLACK VAPE • RD-45 Duarte)',
    lat: 19.41688,
    lng: -71.61287,
    category: 'sector',
    badge: 'Tienda Central',
    keywords: ['tienda', 'colmado', 'noadia', 'sede', 'local', 'rd-45', 'duarte'],
  },
  // Centro Urbano & Barrios de Loma de Cabrera
  {
    id: 'parque_central_loma',
    name: 'Parque Central Juan Pablo Duarte',
    lat: 19.4245,
    lng: -71.6152,
    category: 'sector',
    badge: 'Centro',
    keywords: ['parque', 'central', 'duarte', 'centro', 'ayuntamiento'],
  },
  {
    id: 'el_corozo_loma',
    name: 'Sector El Corozo',
    lat: 19.4125,
    lng: -71.6180,
    category: 'sector',
    badge: 'Residencial',
    keywords: ['corozo', 'el corozo', 'barrio'],
  },
  {
    id: 'barrio_norte_loma',
    name: 'Barrio Norte / Quisqueya',
    lat: 19.4280,
    lng: -71.6140,
    category: 'sector',
    badge: 'Barrio Norte',
    keywords: ['norte', 'quisqueya', 'barrio norte'],
  },
  {
    id: 'barrio_la_ceiba',
    name: 'Barrio La Ceiba',
    lat: 19.4260,
    lng: -71.6185,
    category: 'sector',
    badge: 'La Ceiba',
    keywords: ['ceiba', 'la ceiba'],
  },
  {
    id: 'barrio_libertad_loma',
    name: 'Barrio Libertad',
    lat: 19.4220,
    lng: -71.6100,
    category: 'sector',
    badge: 'Libertad',
    keywords: ['libertad', 'barrio libertad'],
  },
  {
    id: 'barrio_san_antonio',
    name: 'Barrio San Antonio',
    lat: 19.4215,
    lng: -71.6135,
    category: 'sector',
    badge: 'San Antonio',
    keywords: ['san antonio', 'antonio'],
  },
  {
    id: 'hospital_loma',
    name: 'Hospital Ramón Adriano Villalona',
    lat: 19.4210,
    lng: -71.6170,
    category: 'plaza',
    badge: 'Hospital',
    keywords: ['hospital', 'medico', 'salud', 'clinica', 'adriano villalona'],
  },
  {
    id: 'balneario_el_salto',
    name: 'Balneario El Salto (Río Dajabón)',
    lat: 19.4080,
    lng: -71.6090,
    category: 'plaza',
    badge: 'El Salto',
    keywords: ['salto', 'rio', 'balneario', 'dajabon'],
  },
  {
    id: 'el_tanque_loma',
    name: 'El Tanque / Alto de la Paloma',
    lat: 19.4230,
    lng: -71.6210,
    category: 'sector',
    badge: 'El Tanque',
    keywords: ['tanque', 'paloma', 'alto'],
  },
  {
    id: 'cruce_de_la_fe',
    name: 'Cruce de la Fe',
    lat: 19.4190,
    lng: -71.6150,
    category: 'avenida',
    badge: 'Cruce',
    keywords: ['cruce', 'fe'],
  },
  {
    id: 'salida_dajabon',
    name: 'Carretera a Dajabón (RD-45 Norte)',
    lat: 19.4350,
    lng: -71.6160,
    category: 'avenida',
    badge: 'Hacia Dajabón',
    keywords: ['salida', 'carretera', 'dajabon', 'norte'],
  },
  {
    id: 'salida_restauracion',
    name: 'Carretera a Restauración (RD-45 Sur)',
    lat: 19.4050,
    lng: -71.6110,
    category: 'avenida',
    badge: 'Hacia Restauración',
    keywords: ['restauracion', 'sur', 'carretera internacional'],
  },
  {
    id: 'monte_grande_loma',
    name: 'Comunidad Monte Grande',
    lat: 19.4420,
    lng: -71.6190,
    category: 'sector',
    badge: 'Monte Grande',
    keywords: ['monte grande', 'monte'],
  },
  {
    id: 'ceiba_de_bonet',
    name: 'Sector Ceiba de Bonet',
    lat: 19.4180,
    lng: -71.6320,
    category: 'sector',
    badge: 'Ceiba de Bonet',
    keywords: ['bonet', 'ceiba de bonet'],
  },
  {
    id: 'capotillo_historico',
    name: 'Capotillo (Monumento de la Restauración)',
    lat: 19.4490,
    lng: -71.6980,
    category: 'plaza',
    badge: 'Capotillo',
    keywords: ['capotillo', 'monumento', 'restauracion'],
  },
  {
    id: 'manuel_bueno',
    name: 'Comunidad Manuel Bueno',
    lat: 19.4020,
    lng: -71.5850,
    category: 'sector',
    badge: 'Manuel Bueno',
    keywords: ['manuel bueno', 'comunidad'],
  },
  {
    id: 'dajabon_centro',
    name: 'Dajabón Centro (Parque Duarte)',
    lat: 19.5490,
    lng: -71.7080,
    category: 'sector',
    badge: 'Dajabón',
    keywords: ['dajabon', 'frontera', 'municipio'],
  },
  {
    id: 'partido_centro',
    name: 'Partido (Municipio vecino)',
    lat: 19.4890,
    lng: -71.5510,
    category: 'sector',
    badge: 'Partido',
    keywords: ['partido', 'municipio'],
  },
  {
    id: 'restauracion_centro',
    name: 'Restauración Centro',
    lat: 19.3130,
    lng: -71.6920,
    category: 'sector',
    badge: 'Restauración',
    keywords: ['restauracion', 'pueblo'],
  },
];

// Fallback/Legacy reference list
export const SANTO_DOMINGO_SECTORS: SectorItem[] = LOMA_CABRERA_SECTORS;

export interface LocationIssueDetection {
  isSuspicious: boolean;
  reason?: 'out_of_zone' | 'coarse_ip' | 'at_store';
  distanceKm: number;
  detectedRegionName: string;
  explanation: string;
}

const LOMA_STORE_COORDS = { lat: 19.41688, lng: -71.61287 };

/**
 * Detects whether GPS or browser location is failing/inaccurate
 * (e.g. Dominican cellular ISP routing traffic through Santo Domingo or Santiago, or coarse IP antenna)
 */
export function detectLocationIssue(
  coords: Coordinates,
  accuracyMeters?: number | null
): LocationIssueDetection {
  const dist = calculateDistanceKm(LOMA_STORE_COORDS, coords);
  const roundedDist = Math.round(dist * 10) / 10;

  // Determine approximate geographic region of reported coordinate
  let regionName = 'Loma de Cabrera';
  if (dist < 8) {
    regionName = 'Loma de Cabrera (Zona Urbana)';
  } else if (dist < 22) {
    regionName = 'Periferia de Loma / Dajabón';
  } else if (calculateDistanceKm({ lat: 18.47, lng: -69.93 }, coords) < 35) {
    regionName = 'Santo Domingo (Antena ISP Central)';
  } else if (calculateDistanceKm({ lat: 19.45, lng: -70.70 }, coords) < 30) {
    regionName = 'Santiago de los Caballeros (Antena ISP)';
  } else {
    regionName = `Fuera de zona (${roundedDist} km de la tienda)`;
  }

  // 1. Check if pinned right over the store (< 35 meters)
  if (dist < 0.035) {
    return {
      isSuspicious: true,
      reason: 'at_store',
      distanceKm: roundedDist,
      detectedRegionName: regionName,
      explanation: 'El marcador está encima del local físico (Colmado Noadia). Muévelo a tu casa.',
    };
  }

  // 2. Check if browser gave an IP location far away (> 15 km)
  if (dist > 15) {
    return {
      isSuspicious: true,
      reason: 'out_of_zone',
      distanceKm: roundedDist,
      detectedRegionName: regionName,
      explanation: `Tu navegador o proveedor de internet reportó tu ubicación por antena en ${regionName} (${roundedDist} km de Loma de Cabrera).`,
    };
  }

  // 3. Check coarse IP/Cell tower accuracy
  if (accuracyMeters && accuracyMeters > 500) {
    return {
      isSuspicious: true,
      reason: 'coarse_ip',
      distanceKm: roundedDist,
      detectedRegionName: regionName,
      explanation: `Señal aproximada por antena (±${Math.round(accuracyMeters)}m). Puedes tocar en el mapa para afinar tu casa.`,
    };
  }

  return {
    isSuspicious: false,
    distanceKm: roundedDist,
    detectedRegionName: regionName,
    explanation: 'Ubicación precisa en Loma de Cabrera.',
  };
}

/**
 * Searches local sectors and landmarks first, then geocodes via Photon Komoot biased to Dominican Republic
 */
export async function searchAddressOrPlace(
  query: string,
  biasCoords: Coordinates = LOMA_STORE_COORDS
): Promise<Array<{ id: string; name: string; lat: number; lng: number; badge?: string; distanceKm: number }>> {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const results: Array<{ id: string; name: string; lat: number; lng: number; badge?: string; distanceKm: number }> = [];
  const seenCoords = new Set<string>();

  // 1. Search in local sectors first
  LOMA_CABRERA_SECTORS.forEach((sec) => {
    const matchName = sec.name.toLowerCase().includes(q);
    const matchBadge = sec.badge?.toLowerCase().includes(q);
    const matchKeywords = sec.keywords?.some((k) => k.includes(q));

    if (matchName || matchBadge || matchKeywords) {
      const dist = calculateDistanceKm(biasCoords, { lat: sec.lat, lng: sec.lng });
      const coordKey = `${sec.lat.toFixed(4)},${sec.lng.toFixed(4)}`;
      if (!seenCoords.has(coordKey)) {
        seenCoords.add(coordKey);
        results.push({
          id: sec.id,
          name: sec.name,
          lat: sec.lat,
          lng: sec.lng,
          badge: sec.badge,
          distanceKm: Math.round(dist * 10) / 10,
        });
      }
    }
  });

  // 2. Query Photon Komoot forward geocoding API with Dominican Republic / Loma bias
  if (q.length >= 3) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(
        `${q} Loma de Cabrera Republica Dominicana`
      )}&lat=${biasCoords.lat}&lon=${biasCoords.lng}&limit=6`;

      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      if (res.ok) {
        const data = await res.json();
        if (data && data.features) {
          data.features.forEach((feat: any, idx: number) => {
            const [lng, lat] = feat.geometry.coordinates;
            const props = feat.properties;
            const name = props.name || props.street || '';
            const city = props.city || props.town || props.state || 'Dajabón';
            const fullName = name ? `${name}, ${city}` : city;

            const dist = calculateDistanceKm(biasCoords, { lat, lng });
            const coordKey = `${lat.toFixed(4)},${lng.toFixed(4)}`;

            if (!seenCoords.has(coordKey)) {
              seenCoords.add(coordKey);
              results.push({
                id: `photon_${idx}_${lat.toFixed(4)}`,
                name: fullName,
                lat,
                lng,
                badge: dist < 10 ? 'Loma de Cabrera' : 'Mapa',
                distanceKm: Math.round(dist * 10) / 10,
              });
            }
          });
        }
      }
    } catch {
      // Network lookup failed, fallback to local matches
    }
  }

  // Sort by distance to Loma de Cabrera store
  results.sort((a, b) => a.distanceKm - b.distanceKm);
  return results;
}

/**
 * Finds the nearest sector in Loma de Cabrera for a given coordinate
 */
export function findNearestSector(
  coords: Coordinates,
  categoryFilter?: 'sector' | 'plaza'
): { sector: SectorItem; distanceKm: number } {
  const pool = categoryFilter
    ? LOMA_CABRERA_SECTORS.filter((s) => s.category === categoryFilter)
    : LOMA_CABRERA_SECTORS;

  let nearest = pool[0];
  let minDistance = calculateDistanceKm(coords, { lat: nearest.lat, lng: nearest.lng });

  for (let i = 1; i < pool.length; i++) {
    const s = pool[i];
    const dist = calculateDistanceKm(coords, { lat: s.lat, lng: s.lng });
    if (dist < minDistance) {
      minDistance = dist;
      nearest = s;
    }
  }

  return { sector: nearest, distanceKm: minDistance };
}


// In-memory cache for reverse geocode calls
const reverseGeocodeCache = new Map<string, string>();

/**
 * Reverse geocodes coordinates to a readable street or sector address.
 * Uses Photon (Komoot OSM) as primary fast engine, with Nominatim as secondary fallback,
 * and smart geographic municipality detection for offline/fallback.
 */
export async function reverseGeocode(coords: Coordinates): Promise<string> {
  const cacheKey = `${coords.lat.toFixed(5)},${coords.lng.toFixed(5)}`;
  const cached = reverseGeocodeCache.get(cacheKey);
  if (cached) return cached;

  const nearest = findNearestSector(coords);
  const distToLoma = calculateDistanceKm(coords, { lat: 19.41688, lng: -71.61287 });
  const isLomaCabreraArea = distToLoma < 35;
  const isSantiagoArea = calculateDistanceKm(coords, { lat: 19.4517, lng: -70.6970 }) < 30;

  const municipalZone = isLomaCabreraArea
    ? 'Loma de Cabrera, Dajabón'
    : isSantiagoArea
    ? 'Santiago de los Caballeros'
    : 'Santo Domingo';

  const fallbackString =
    nearest.distanceKm < 1.5
      ? `${nearest.sector.name}, ${municipalZone}`
      : `Sector a ${nearest.distanceKm} km de ${nearest.sector.name}, ${municipalZone}`;

  // 1. Primary Engine: Photon Komoot (fast, CORS-open, high precision in Dominican Republic)
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3200);

    const photonUrl = `https://photon.komoot.io/reverse?lat=${coords.lat}&lon=${coords.lng}`;
    const res = await fetch(photonUrl, { signal: controller.signal });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      if (data && data.features && data.features.length > 0) {
        const props = data.features[0].properties;
        const name = props.name || props.street || '';
        const street = props.street && props.street !== name ? props.street : '';
        const houseNumber = props.housenumber ? ` #${props.housenumber}` : '';
        const district = props.district || props.suburb || props.locality || '';
        const city = props.city || props.town || props.county || municipalZone;
        const state = props.state ? `, ${props.state}` : '';

        const addressParts: string[] = [];
        if (street) {
          addressParts.push(`${street}${houseNumber}`);
        } else if (name) {
          addressParts.push(`${name}${houseNumber}`);
        }

        if (district && !addressParts.includes(district)) {
          addressParts.push(district);
        }

        if (city && !addressParts.includes(city)) {
          addressParts.push(city);
        }

        if (addressParts.length > 0) {
          const resolved = `${addressParts.join(', ')}${state}`;
          reverseGeocodeCache.set(cacheKey, resolved);
          return resolved;
        }
      }
    }
  } catch {
    // Photon timed out or network glitch -> proceed to fallback
  }

  // 2. Secondary Engine: OpenStreetMap Nominatim
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);

    const nominatimUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${coords.lat}&lon=${coords.lng}&zoom=18&addressdetails=1`;
    const res = await fetch(nominatimUrl, {
      signal: controller.signal,
      headers: {
        'Accept-Language': 'es',
      },
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      if (data && data.address) {
        const addr = data.address;
        const road = addr.road || addr.pedestrian || addr.footway || addr.suburb;
        const houseNumber = addr.house_number ? ` #${addr.house_number}` : '';
        const suburb = addr.neighbourhood || addr.suburb || addr.quarter || addr.hamlet || nearest.sector.name;
        const city = addr.town || addr.city || addr.county || municipalZone;

        let resolved = '';
        if (road) {
          resolved = `${road}${houseNumber}, ${suburb}, ${city}`;
        } else if (suburb) {
          resolved = `${suburb}, ${city}`;
        } else {
          resolved = `${city}`;
        }

        reverseGeocodeCache.set(cacheKey, resolved);
        return resolved;
      }
    }
  } catch {
    // Both network geocoders failed -> use regional fallback
  }

  reverseGeocodeCache.set(cacheKey, fallbackString);
  return fallbackString;
}

export interface GPSLocationResult {
  coords: Coordinates;
  accuracyMeters: number;
  isHighAccuracy: boolean;
  distanceFromStoreKm: number;
  isSuspiciousIpOrRemote: boolean;
  issueDetection: LocationIssueDetection;
}

/**
 * Gets high-accuracy GPS coordinates using browser API.
 * Uses watchPosition over a calibration window (up to 5 seconds) to allow the device's
 * GPS chip to acquire satellite lock and refine accuracy from coarse (~1000m) to fine (<15m).
 * If a reading with <= 20m accuracy is received, it resolves immediately.
 */
export function getHighAccuracyGPS(
  onProgress?: (accuracyMeters: number) => void
): Promise<GPSLocationResult> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      reject(new Error('Tu navegador o dispositivo no soporta geolocalización GPS.'));
      return;
    }

    let bestPosition: GeolocationPosition | null = null;
    let watchId: number | null = null;
    let timeoutId: any = null;
    let hasResolved = false;

    const cleanup = () => {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
      }
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    };

    const finishWithPosition = (position: GeolocationPosition) => {
      if (hasResolved) return;
      hasResolved = true;
      cleanup();

      const coords = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      };

      const accuracy = Math.round(position.coords.accuracy || 15);
      const issue = detectLocationIssue(coords, accuracy);

      // Only save to localStorage if within reasonable delivery reach (< 35 km)
      if (issue.distanceKm <= 35) {
        saveStoredUserLocation(coords);
      }

      resolve({
        coords,
        accuracyMeters: accuracy,
        isHighAccuracy: accuracy <= 50 && !issue.isSuspicious,
        distanceFromStoreKm: issue.distanceKm,
        isSuspiciousIpOrRemote: issue.isSuspicious,
        issueDetection: issue,
      });
    };

    // Timeout: if no optimal fix within 6.5s, resolve with the best reading received
    timeoutId = setTimeout(() => {
      if (hasResolved) return;
      if (bestPosition) {
        finishWithPosition(bestPosition);
      } else {
        cleanup();
        hasResolved = true;
        reject(
          new Error(
            'El sensor GPS tardó en responder. Asegúrate de encender la ubicación o toca en el mapa para marcar tu casa.'
          )
        );
      }
    }, 6500);

    // Initial direct check with zero cache
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const acc = Math.round(pos.coords.accuracy || 100);
        if (onProgress) onProgress(acc);
        if (!bestPosition || acc < (bestPosition.coords.accuracy || 99999)) {
          bestPosition = pos;
        }
        if (acc <= 20) {
          finishWithPosition(pos);
        }
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          cleanup();
          if (!hasResolved) {
            hasResolved = true;
            reject(
              new Error(
                'Permiso de ubicación denegado por el navegador. Activa los permisos de ubicación para detectar tu posición exacta.'
              )
            );
          }
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 0,
      }
    );

    try {
      watchId = navigator.geolocation.watchPosition(
        (position) => {
          const currentAcc = Math.round(position.coords.accuracy || 100);
          if (onProgress) {
            onProgress(currentAcc);
          }

          if (!bestPosition || currentAcc < (bestPosition.coords.accuracy || 99999)) {
            bestPosition = position;
          }

          // Excellent satellite lock achieved (<= 20 meters precision)
          if (currentAcc <= 20) {
            finishWithPosition(position);
          }
        },
        (error) => {
          if (error.code === error.PERMISSION_DENIED) {
            cleanup();
            if (!hasResolved) {
              hasResolved = true;
              reject(
                new Error(
                  'Permiso de ubicación denegado por el navegador. Activa el GPS o toca el mapa.'
                )
              );
            }
          }
        },
        {
          enableHighAccuracy: true,
          timeout: 6000,
          maximumAge: 0,
        }
      );
    } catch (err: any) {
      cleanup();
      reject(new Error(err?.message || 'Error al inicializar sensor GPS.'));
    }
  });
}

export interface LiveDeviceLocationUpdate {
  coords: Coordinates;
  accuracyMeters: number;
  heading?: number;
  speedKmh?: number;
  timestamp: number;
}

/**
 * Continuous real-time live device GPS tracking.
 * Triggers callback immediately and every time user moves or GPS sensor refines accuracy.
 * Uses maximumAge: 0 to guarantee fresh hardware satellite readings.
 */
export function startLiveDeviceTracking(
  onUpdate: (update: LiveDeviceLocationUpdate) => void,
  onError?: (errMessage: string) => void
): () => void {
  if (typeof window === 'undefined' || !navigator.geolocation) {
    onError?.('Geolocalización no soportada en este navegador.');
    return () => {};
  }

  const watchId = navigator.geolocation.watchPosition(
    (position) => {
      const { latitude, longitude, accuracy, heading, speed } = position.coords;
      const coords = { lat: latitude, lng: longitude };
      const dist = calculateDistanceKm(LOMA_STORE_COORDS, coords);
      if (dist <= 35) {
        saveStoredUserLocation(coords);
      }
      onUpdate({
        coords,
        accuracyMeters: Math.round(accuracy || 10),
        heading: heading !== null && !isNaN(heading) ? heading : undefined,
        speedKmh: speed !== null && speed >= 0 ? Math.round(speed * 3.6) : undefined,
        timestamp: position.timestamp || Date.now(),
      });
    },
    (err) => {
      let msg = 'Error en el sensor GPS.';
      if (err.code === err.PERMISSION_DENIED) {
        msg = 'Permiso de ubicación denegado en tu navegador.';
      } else if (err.code === err.POSITION_UNAVAILABLE) {
        msg = 'Señal de satélite GPS no disponible en este momento.';
      } else if (err.code === err.TIMEOUT) {
        msg = 'Buscando satélites GPS...';
      }
      onError?.(msg);
    },
    {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 15000,
    }
  );

  return () => {
    navigator.geolocation.clearWatch(watchId);
  };
}
