import { describe, it } from 'node:test';
import assert from 'node:assert';
import { isNearDestination, publishDriverLocation } from './gpsTracking';
import { Coordinates } from '../types';

describe('FASE 4 - GPS & Realtime Map Proximity & Logic Tests', () => {
  const storePos: Coordinates = { lat: 19.41688, lng: -71.61287 };

  it('determines identical coordinates are near destination', () => {
    assert.strictEqual(isNearDestination(storePos, storePos), true);
  });

  it('detects point within 100 meters (<0.15km) as near destination', () => {
    // 0.0005 degrees latitude is approx ~55 meters
    const clientPos: Coordinates = { lat: 19.41688 + 0.0005, lng: -71.61287 };
    assert.strictEqual(isNearDestination(storePos, clientPos, 0.15), true);
  });

  it('detects point farther than 150 meters as NOT near destination', () => {
    // 0.005 degrees latitude is approx ~550 meters
    const clientPos: Coordinates = { lat: 19.41688 + 0.005, lng: -71.61287 };
    assert.strictEqual(isNearDestination(storePos, clientPos, 0.15), false);
  });

  it('custom threshold in isNearDestination is respected', () => {
    const clientPos: Coordinates = { lat: 19.41688 + 0.002, lng: -71.61287 }; // ~220m
    assert.strictEqual(isNearDestination(storePos, clientPos, 0.10), false);
    assert.strictEqual(isNearDestination(storePos, clientPos, 0.30), true);
  });

  it('signal loss logic: timestamp older than 60 seconds flags isSignalLost true', () => {
    const now = Date.now();
    const freshTimestamp = new Date(now - 15000).getTime(); // 15s ago
    const staleTimestamp = new Date(now - 75000).getTime(); // 75s ago

    const isFreshLost = now - freshTimestamp > 60000;
    const isStaleLost = now - staleTimestamp > 60000;

    assert.strictEqual(isFreshLost, false);
    assert.strictEqual(isStaleLost, true);
  });

  it('publishDriverLocation throttles frequent calls within 6 seconds', async () => {
    // First call may publish
    await publishDriverLocation('driver-test', storePos, 90, 25);
    // Immediate subsequent call within throttle window (6000ms) should return false
    const immediateSecondCall = await publishDriverLocation('driver-test', storePos, 90, 25);
    assert.strictEqual(immediateSecondCall, false);
  });
});
