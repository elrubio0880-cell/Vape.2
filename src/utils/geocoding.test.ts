import test from 'node:test';
import assert from 'node:assert/strict';
import { findNearestSector, SANTO_DOMINGO_SECTORS } from './geocoding';

test('findNearestSector returns closest sector accurately in Santo Domingo', () => {
  // Coordinates right next to Piantini centroid
  const nearPiantini = { lat: 18.4735, lng: -69.9405 };
  const resPiantini = findNearestSector(nearPiantini, 'sector');
  assert.equal(resPiantini.sector.name, 'Piantini');
  assert.ok(resPiantini.distanceKm < 0.05);

  // Coordinates right next to Bella Vista
  const nearBellaVista = { lat: 18.4550, lng: -69.9480 };
  const resBellaVista = findNearestSector(nearBellaVista, 'sector');
  assert.equal(resBellaVista.sector.name, 'Bella Vista');
  assert.ok(resBellaVista.distanceKm < 0.05);

  // Coordinates near Gazcue
  const nearGazcue = { lat: 18.4710, lng: -69.8990 };
  const resGazcue = findNearestSector(nearGazcue, 'sector');
  assert.equal(resGazcue.sector.name, 'Gazcue');
  assert.ok(resGazcue.distanceKm < 0.05);
});

test('SANTO_DOMINGO_SECTORS contains main metropolitan areas', () => {
  assert.ok(SANTO_DOMINGO_SECTORS.length >= 20);
  const names = SANTO_DOMINGO_SECTORS.map((s) => s.name);
  assert.ok(names.includes('Piantini'));
  assert.ok(names.includes('Naco'));
  assert.ok(names.includes('Bella Vista'));
  assert.ok(names.includes('Gazcue'));
  assert.ok(names.includes('Mirador Sur'));
  assert.ok(names.includes('Zona Colonial'));
  assert.ok(names.some((n) => n.includes('Colmado Noadia')));
  assert.ok(names.some((n) => n.includes('Parque Central Loma')));
});

test('findNearestSector detects Colmado Noadia and Loma de Cabrera sectors', () => {
  const nearColmado = { lat: 19.4169, lng: -71.6128 };
  const res = findNearestSector(nearColmado, 'sector');
  assert.ok(res.sector.name.includes('Colmado Noadia'));
  assert.ok(res.distanceKm < 0.05);

  const nearParqueLoma = { lat: 19.4245, lng: -71.6152 };
  const resParque = findNearestSector(nearParqueLoma, 'sector');
  assert.ok(resParque.sector.name.includes('Parque Central Loma'));
});

test('reverseGeocode accurately resolves Loma de Cabrera location and does not label it as Santo Domingo', async () => {
  const { reverseGeocode } = await import('./geocoding');
  const lomaCoords = { lat: 19.41688, lng: -71.61287 };
  const resolved = await reverseGeocode(lomaCoords);
  assert.ok(resolved.length > 5);
  // Must mention Loma de Cabrera or Dajabón, and NOT Santo Domingo
  assert.ok(
    resolved.toLowerCase().includes('loma') ||
    resolved.toLowerCase().includes('cabrera') ||
    resolved.toLowerCase().includes('dajabón') ||
    resolved.toLowerCase().includes('dajabon') ||
    resolved.toLowerCase().includes('duarte') ||
    resolved.toLowerCase().includes('noadia')
  );
  assert.ok(!resolved.toLowerCase().includes('santo domingo'));
});
