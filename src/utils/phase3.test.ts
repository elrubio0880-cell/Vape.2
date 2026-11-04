import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateDeliveryFee, calculateDistanceKm } from './routing';
import { validateOrderInput, CreateOrderParams } from './supabaseOrders';

test('Fase 3 - Regla de negocio de tarifa: 0.5 km → $25 DOP', () => {
  const result = calculateDeliveryFee(0.5);
  assert.equal(result.fee, 25);
  assert.equal(result.tier, 1);
});

test('Fase 3 - Regla de negocio de tarifa: 1.4 km → $25 DOP', () => {
  const result = calculateDeliveryFee(1.4);
  assert.equal(result.fee, 25);
  assert.equal(result.tier, 1);
});

test('Fase 3 - Regla de negocio de tarifa: 1.5 km (inclusive) → $25 DOP', () => {
  const result = calculateDeliveryFee(1.5);
  assert.equal(result.fee, 25);
  assert.equal(result.tier, 1);
});

test('Fase 3 - Regla de negocio de tarifa: 1.51 km (supera 1.5 km) → $50 DOP', () => {
  const result = calculateDeliveryFee(1.51);
  assert.equal(result.fee, 50);
  assert.equal(result.tier, 2);
});

test('Fase 3 - Regla de negocio de tarifa: 3 km → $50 DOP', () => {
  const result = calculateDeliveryFee(3.0);
  assert.equal(result.fee, 50);
  assert.equal(result.tier, 2);
});

test('Fase 3 - Regla de negocio de tarifa: 6 km → $100 DOP', () => {
  const result = calculateDeliveryFee(6.0);
  assert.equal(result.fee, 100);
  assert.equal(result.tier, 4);
});

test('Fase 3 - Caso límite: distancia 0 km → $25 DOP (mínimo de viaje)', () => {
  const result = calculateDeliveryFee(0);
  assert.equal(result.fee, 25);
  assert.equal(result.tier, 1);
});

test('Fase 3 - Caso límite: distancia negativa → tratada como 0 y tarifa mínima $25 DOP', () => {
  const result = calculateDeliveryFee(-5.2);
  assert.equal(result.fee, 25);
  assert.equal(result.tier, 1);
});

test('Fase 3 - Validación de servidor: cantidad 0 o negativa es rechazada', () => {
  const baseOrder: CreateOrderParams = {
    customerName: 'Juan Perez',
    customerPhone: '809-555-1234',
    destination: { lat: 19.41688, lng: -71.61287 },
    paymentMethod: 'efectivo',
    items: [{ productId: 'prod-horny-ice-mint', portion: 'tanque_lleno', quantity: 0 }],
  };

  const resZero = validateOrderInput(baseOrder);
  assert.equal(resZero.valid, false);
  assert.match(resZero.error || '', /mayor a 0/);

  const resNeg = validateOrderInput({
    ...baseOrder,
    items: [{ productId: 'prod-horny-ice-mint', portion: 'tanque_lleno', quantity: -2 }],
  });
  assert.equal(resNeg.valid, false);
  assert.match(resNeg.error || '', /mayor a 0/);
});

test('Fase 3 - Validación de servidor: valores no numéricos en cantidad son rechazados', () => {
  const resNaN = validateOrderInput({
    customerName: 'Juan Perez',
    customerPhone: '809-555-1234',
    destination: { lat: 19.41688, lng: -71.61287 },
    paymentMethod: 'efectivo',
    items: [{ productId: 'prod-horny-ice-mint', portion: 'tanque_lleno', quantity: NaN as any }],
  });
  assert.equal(resNaN.valid, false);
});

test('Fase 3 - Validación de servidor: ubicación inválida (lat/lng 0 o NaN o fuera de límites) es rechazada', () => {
  const resZeroCoord = validateOrderInput({
    customerName: 'Juan Perez',
    customerPhone: '809-555-1234',
    destination: { lat: 0, lng: 0 },
    paymentMethod: 'efectivo',
    items: [{ productId: 'prod-horny-ice-mint', portion: 'tanque_lleno', quantity: 1 }],
  });
  assert.equal(resZeroCoord.valid, false);
  assert.match(resZeroCoord.error || '', /coordenadas GPS.*inválida/);

  const resNaNCoord = validateOrderInput({
    customerName: 'Juan Perez',
    customerPhone: '809-555-1234',
    destination: { lat: NaN, lng: -71.61287 },
    paymentMethod: 'efectivo',
    items: [{ productId: 'prod-horny-ice-mint', portion: 'tanque_lleno', quantity: 1 }],
  });
  assert.equal(resNaNCoord.valid, false);

  const resOutOfBounds = validateOrderInput({
    customerName: 'Juan Perez',
    customerPhone: '809-555-1234',
    destination: { lat: 190.5, lng: -71.61287 },
    paymentMethod: 'efectivo',
    items: [{ productId: 'prod-horny-ice-mint', portion: 'tanque_lleno', quantity: 1 }],
  });
  assert.equal(resOutOfBounds.valid, false);
});

test('Fase 3 - Validación de servidor: teléfono no dominicano o inválido es rechazado', () => {
  const resBadPhone = validateOrderInput({
    customerName: 'Juan Perez',
    customerPhone: '123-456-7890', // No empieza con 809, 829 ni 849
    destination: { lat: 19.41688, lng: -71.61287 },
    paymentMethod: 'efectivo',
    items: [{ productId: 'prod-horny-ice-mint', portion: 'tanque_lleno', quantity: 1 }],
  });
  assert.equal(resBadPhone.valid, false);
  assert.match(resBadPhone.error || '', /dominicano válido/);

  const resShortPhone = validateOrderInput({
    customerName: 'Juan Perez',
    customerPhone: '809-123', // Incompleto
    destination: { lat: 19.41688, lng: -71.61287 },
    paymentMethod: 'efectivo',
    items: [{ productId: 'prod-horny-ice-mint', portion: 'tanque_lleno', quantity: 1 }],
  });
  assert.equal(resShortPhone.valid, false);
});

test('Fase 3 - Validación de servidor: método de pago inválido es rechazado', () => {
  const resBadPayment = validateOrderInput({
    customerName: 'Juan Perez',
    customerPhone: '809-555-1234',
    destination: { lat: 19.41688, lng: -71.61287 },
    paymentMethod: 'bitcoin' as any,
    items: [{ productId: 'prod-horny-ice-mint', portion: 'tanque_lleno', quantity: 1 }],
  });
  assert.equal(resBadPayment.valid, false);
  assert.match(resBadPayment.error || '', /Método de pago/);
});
