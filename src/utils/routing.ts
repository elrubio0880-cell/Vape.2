import { Coordinates, Order } from '../types';

/**
 * Calculates Haversine distance in kilometers between two coordinates
 */
export function calculateDistanceKm(c1: Coordinates, c2: Coordinates): number {
  const R = 6371; // Earth radius in km
  const dLat = ((c2.lat - c1.lat) * Math.PI) / 180;
  const dLng = ((c2.lng - c1.lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((c1.lat * Math.PI) / 180) *
      Math.cos((c2.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 100) / 100;
}

export interface DeliveryZoneConfig {
  tier: number;
  radiusMeters: number;
  minKm: number;
  maxKm: number;
  fee: number;
  color: string;
  fillColor: string;
  label: string;
  shortLabel: string;
}

export const DELIVERY_RATE_KM_STEP = 1.5;
export const DELIVERY_RATE_PRICE_STEP = 25;

export const DELIVERY_ZONES: DeliveryZoneConfig[] = [
  {
    tier: 1,
    radiusMeters: 1500,
    minKm: 0,
    maxKm: 1.5,
    fee: 25,
    color: '#06b6d4', // Cyan
    fillColor: '#06b6d4',
    label: '$25 DOP (hasta 1.5 km)',
    shortLabel: 'Zona 1 • $25 DOP',
  },
  {
    tier: 2,
    radiusMeters: 3000,
    minKm: 1.5,
    maxKm: 3.0,
    fee: 50,
    color: '#10b981', // Emerald
    fillColor: '#10b981',
    label: '$50 DOP (1.5 - 3.0 km)',
    shortLabel: 'Zona 2 • $50 DOP',
  },
  {
    tier: 3,
    radiusMeters: 4500,
    minKm: 3.0,
    maxKm: 4.5,
    fee: 75,
    color: '#f59e0b', // Amber
    fillColor: '#f59e0b',
    label: '$75 DOP (3.0 - 4.5 km)',
    shortLabel: 'Zona 3 • $75 DOP',
  },
  {
    tier: 4,
    radiusMeters: 6000,
    minKm: 4.5,
    maxKm: 6.0,
    fee: 100,
    color: '#a855f7', // Purple
    fillColor: '#a855f7',
    label: '$100 DOP (4.5 - 6.0 km)',
    shortLabel: 'Zona 4 • $100 DOP',
  },
  {
    tier: 5,
    radiusMeters: 7500,
    minKm: 6.0,
    maxKm: 7.5,
    fee: 125,
    color: '#ec4899', // Pink
    fillColor: '#ec4899',
    label: '$125 DOP (6.0 - 7.5 km)',
    shortLabel: 'Zona 5 • $125 DOP',
  },
  {
    tier: 6,
    radiusMeters: 9000,
    minKm: 7.5,
    maxKm: 9.0,
    fee: 150,
    color: '#ef4444', // Red
    fillColor: '#ef4444',
    label: '$150 DOP (7.5 - 9.0 km)',
    shortLabel: 'Zona 6 • $150 DOP',
  },
  {
    tier: 7,
    radiusMeters: 10500,
    minKm: 9.0,
    maxKm: 10.5,
    fee: 175,
    color: '#6366f1', // Indigo
    fillColor: '#6366f1',
    label: '$175 DOP (9.0 - 10.5 km)',
    shortLabel: 'Zona 7 • $175 DOP',
  },
  {
    tier: 8,
    radiusMeters: 12000,
    minKm: 10.5,
    maxKm: 12.0,
    fee: 200,
    color: '#3b82f6', // Blue
    fillColor: '#3b82f6',
    label: '$200 DOP (10.5 - 12.0 km)',
    shortLabel: 'Zona 8 • $200 DOP',
  },
];

export interface DeliveryCalculationResult {
  distanceKm: number;
  tier: number;
  fee: number;
  tierMinKm: number;
  tierMaxKm: number;
  zone: DeliveryZoneConfig;
  label: string;
  rateRule: string;
}

/**
 * Calculates delivery fee based on distance:
 * Strict rule: Every 1.5 km costs $25 Dominican Pesos ($25 DOP).
 * - 0.0 - 1.5 km: $25 DOP
 * - 1.5 - 3.0 km: $50 DOP
 * - 3.0 - 4.5 km: $75 DOP
 * - 4.5 - 6.0 km: $100 DOP
 * - 6.0 - 7.5 km: $125 DOP
 * - 7.5 - 9.0 km: $150 DOP
 * - etc.
 */
export function calculateDeliveryFee(distanceKm: number): DeliveryCalculationResult {
  const safeDist = Math.max(0, distanceKm);
  // Tier calculation: minimum 1
  const tier = Math.max(1, Math.ceil(safeDist / DELIVERY_RATE_KM_STEP));
  const fee = tier * DELIVERY_RATE_PRICE_STEP;
  const tierMaxKm = Math.round(tier * DELIVERY_RATE_KM_STEP * 10) / 10;
  const tierMinKm = Math.round((tier - 1) * DELIVERY_RATE_KM_STEP * 10) / 10;

  const foundZone = DELIVERY_ZONES.find((z) => z.tier === tier);
  const zone: DeliveryZoneConfig = foundZone || {
    tier,
    radiusMeters: tier * 1500,
    minKm: tierMinKm,
    maxKm: tierMaxKm,
    fee,
    color: '#f43f5e',
    fillColor: '#f43f5e',
    label: `$${fee} DOP (${tierMinKm.toFixed(1)} - ${tierMaxKm.toFixed(1)} km)`,
    shortLabel: `Zona ${tier} • $${fee} DOP`,
  };

  return {
    distanceKm: safeDist,
    tier,
    fee,
    tierMinKm,
    tierMaxKm,
    zone,
    label: zone.label,
    rateRule: 'Cada 1.5 km = $25 DOP',
  };
}

/**
 * Convenience wrapper returning only the fee amount in DOP
 */
export function suggestDeliveryFee(distanceKm: number): number {
  return calculateDeliveryFee(distanceKm).fee;
}

export interface RouteLeg {
  fromName: string;
  toName: string;
  orderId?: string;
  distanceKm: number;
}

export interface OptimizedRouteResult {
  orderedOrders: Order[];
  waypoints: Coordinates[];
  totalDistanceKm: number;
  estimatedMinutes: number;
  legs: RouteLeg[];
}

/**
 * Nearest-Neighbor route optimization for multiple simultaneous orders
 * Starts at the physical store location, visits each active order in optimal sequence,
 * and traces a route.
 */
export function optimizeMultiStopRoute(
  startLocation: Coordinates,
  storeName: string,
  orders: Order[]
): OptimizedRouteResult {
  if (orders.length === 0) {
    return {
      orderedOrders: [],
      waypoints: [startLocation],
      totalDistanceKm: 0,
      estimatedMinutes: 0,
      legs: [],
    };
  }

  const unvisited = [...orders];
  const orderedOrders: Order[] = [];
  const waypoints: Coordinates[] = [startLocation];
  const legs: RouteLeg[] = [];
  let currentPos = startLocation;
  let currentName = storeName;
  let totalDistanceKm = 0;

  while (unvisited.length > 0) {
    let nearestIndex = 0;
    let shortestDist = Infinity;

    for (let i = 0; i < unvisited.length; i++) {
      const dist = calculateDistanceKm(currentPos, unvisited[i].location);
      if (dist < shortestDist) {
        shortestDist = dist;
        nearestIndex = i;
      }
    }

    const nextOrder = unvisited[nearestIndex];
    unvisited.splice(nearestIndex, 1);

    orderedOrders.push(nextOrder);
    waypoints.push(nextOrder.location);
    totalDistanceKm += shortestDist;

    legs.push({
      fromName: currentName,
      toName: `${nextOrder.customerName} (${nextOrder.items.map((it) => it.productName).join(', ')})`,
      orderId: nextOrder.id,
      distanceKm: shortestDist,
    });

    currentPos = nextOrder.location;
    currentName = nextOrder.customerName;
  }

  // Estimate: ~3.5 minutes per km in urban conditions + 4 minutes per stop handover
  const estimatedMinutes = Math.round(totalDistanceKm * 3.5 + orders.length * 4);

  return {
    orderedOrders,
    waypoints,
    totalDistanceKm: Math.round(totalDistanceKm * 10) / 10,
    estimatedMinutes: Math.max(5, estimatedMinutes),
    legs,
  };
}

export interface StreetRouteResult {
  coordinates: Coordinates[];
  distanceKm: number;
  durationMinutes: number;
  isRealStreet: boolean;
}

// In-memory cache for OSRM street route responses to prevent duplicate calls
const streetRouteCache = new Map<string, StreetRouteResult>();

/**
 * Fetches real driving route following city streets from OSRM (Open Source Routing Machine).
 * The route traces actual avenue curves, corners, one-way streets, and intersections.
 */
export async function fetchStreetRoute(waypoints: Coordinates[]): Promise<StreetRouteResult> {
  if (!waypoints || waypoints.length < 2) {
    return {
      coordinates: waypoints || [],
      distanceKm: 0,
      durationMinutes: 0,
      isRealStreet: false,
    };
  }

  const cacheKey = waypoints
    .map((w) => `${w.lat.toFixed(5)},${w.lng.toFixed(5)}`)
    .join(';');

  const cached = streetRouteCache.get(cacheKey);
  if (cached) return cached;

  // Format OSRM input coordinates string: lng,lat;lng,lat... (OSRM expects longitude first)
  const coordParam = waypoints.map((w) => `${w.lng},${w.lat}`).join(';');
  const url = `https://router.project-osrm.org/route/v1/driving/${coordParam}?overview=full&geometries=geojson`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4500);

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
        const route = data.routes[0];
        // Geometry coordinates are [longitude, latitude]
        const rawCoords: [number, number][] = route.geometry.coordinates;
        const streetCoords: Coordinates[] = rawCoords.map(([lng, lat]) => ({
          lat,
          lng,
        }));

        const result: StreetRouteResult = {
          coordinates: streetCoords,
          distanceKm: Math.round((route.distance / 1000) * 10) / 10,
          durationMinutes: Math.max(1, Math.round(route.duration / 60)),
          isRealStreet: true,
        };

        streetRouteCache.set(cacheKey, result);
        return result;
      }
    }
  } catch {
    // Network error or timeout, will use fallback below
  }

  // Fallback: If offline or API unavailable, generate an interpolated street-aligned path
  const fallbackCoords: Coordinates[] = [];
  for (let i = 0; i < waypoints.length - 1; i++) {
    const start = waypoints[i];
    const end = waypoints[i + 1];
    fallbackCoords.push(start);
    // Add orthogonal corner midpoint
    fallbackCoords.push({ lat: start.lat, lng: end.lng });
    fallbackCoords.push(end);
  }

  let totalDist = 0;
  for (let i = 0; i < fallbackCoords.length - 1; i++) {
    totalDist += calculateDistanceKm(fallbackCoords[i], fallbackCoords[i + 1]);
  }

  const fallbackResult: StreetRouteResult = {
    coordinates: fallbackCoords,
    distanceKm: Math.round(totalDist * 10) / 10,
    durationMinutes: Math.max(3, Math.round(totalDist * 3.5)),
    isRealStreet: false,
  };

  streetRouteCache.set(cacheKey, fallbackResult);
  return fallbackResult;
}
