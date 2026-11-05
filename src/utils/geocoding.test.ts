import test from 'node:test';
import assert from 'node:assert/strict';
import { findNearestSector, SANTO_DOMINGO_SECTORS } from './geocoding';

test('findNearestSector returns closest sector accurately in Loma de Cabrera', () => {
  const nearCorozo = { lat: 19.4125, lng: -71.6180 };
  const resCorozo = findNearestSector(nearCorozo, 'sector');
  assert.equal(resCorozo.sector.name, 'Sector El Corozo');
  assert.ok(resCorozo.distanceKm < 0.05);

  const nearCeiba = { lat: 19.4260, lng: -71.6185 };
  const resCeiba = findNearestSector(nearCeiba, 'sector');
  assert.equal(resCeiba.sector.name, 'Barrio La Ceiba');
  assert.ok(resCeiba.distanceKm < 0.05);

  const nearLibertad = { lat: 19.4220, lng: -71.6100 };
  const resLibertad = findNearestSector(nearLibertad, 'sector');
  assert.equal(resLibertad.sector.name, 'Barrio Libertad');
  assert.ok(resLibertad.distanceKm < 0.05);
});

test('SANTO_DOMINGO_SECTORS alias contains Loma de Cabrera sectors and landmarks', () => {
  assert.ok(SANTO_DOMINGO_SECTORS.length >= 15);
  const names = SANTO_DOMINGO_SECTORS.map((s) => s.name);
  assert.ok(names.includes('Sector El Corozo'));
  assert.ok(names.includes('Barrio La Ceiba'));
  assert.ok(names.includes('Barrio Libertad'));
  assert.ok(names.some((n) => n.includes('Colmado Noadia')));
  assert.ok(names.some((n) => n.includes('Parque Central Juan Pablo Duarte')));
});

test('findNearestSector detects Colmado Noadia and Loma de Cabrera sectors', () => {
  const nearColmado = { lat: 19.4169, lng: -71.6128 };
  const res = findNearestSector(nearColmado, 'sector');
  assert.ok(res.sector.name.includes('Colmado Noadia'));
  assert.ok(res.distanceKm < 0.05);

  const nearParqueLoma = { lat: 19.4245, lng: -71.6152 };
  const resParque = findNearestSector(nearParqueLoma, 'sector');
  assert.ok(resParque.sector.name.includes('Parque Central Juan Pablo Duarte'));
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
