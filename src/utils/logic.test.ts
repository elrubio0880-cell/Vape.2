import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateFinancialStats, generateInventoryReport } from './finance';
import { calculateDistanceKm, suggestDeliveryFee, optimizeMultiStopRoute } from './routing';
import { Order, Product } from '../types';

test('calculateDistanceKm calculates known distance properly', () => {
  // Santiago / Santo Domingo approximation or short distance
  const p1 = { lat: 18.4861, lng: -69.9312 }; // Santo Domingo downtown
  const p2 = { lat: 18.4890, lng: -69.9350 };
  const dist = calculateDistanceKm(p1, p2);
  assert.ok(dist > 0 && dist < 1.0, `Expected distance < 1km, got ${dist}`);
});

test('suggestDeliveryFee categorizes distance tiers by 1.5 km = 25 DOP', () => {
  assert.equal(suggestDeliveryFee(0), 25);
  assert.equal(suggestDeliveryFee(0.5), 25);
  assert.equal(suggestDeliveryFee(1.5), 25);
  assert.equal(suggestDeliveryFee(1.51), 50);
  assert.equal(suggestDeliveryFee(3.0), 50);
  assert.equal(suggestDeliveryFee(3.1), 75);
  assert.equal(suggestDeliveryFee(4.5), 75);
  assert.equal(suggestDeliveryFee(4.6), 100);
  assert.equal(suggestDeliveryFee(6.0), 100);
  assert.equal(suggestDeliveryFee(7.5), 125);
  assert.equal(suggestDeliveryFee(9.0), 150);
  assert.equal(suggestDeliveryFee(10.5), 175);
});

test('calculateDeliveryFee returns rich zone details and metadata', async () => {
  const { calculateDeliveryFee } = await import('./routing');
  const res1 = calculateDeliveryFee(1.2);
  assert.equal(res1.fee, 25);
  assert.equal(res1.tier, 1);
  assert.equal(res1.tierMaxKm, 1.5);
  assert.equal(res1.rateRule, 'Cada 1.5 km = $25 DOP');
  assert.ok(res1.label.includes('$25 DOP'));

  const res2 = calculateDeliveryFee(3.8);
  assert.equal(res2.fee, 75);
  assert.equal(res2.tier, 3);
  assert.equal(res2.tierMaxKm, 4.5);
  assert.ok(res2.label.includes('$75 DOP'));
});

test('calculateFinancialStats breaks down liquid vs delivery revenue and profit', () => {
  const mockOrders: Order[] = [
    {
      id: 'ord-1',
      createdAt: new Date().toISOString(),
      customerName: 'Carlos',
      customerPhone: '8095550101',
      location: { lat: 18.486, lng: -69.931 },
      items: [
        {
          productId: 'prod-1',
          productName: 'Menta Polar',
          portion: 'tanque_lleno',
          unitPrice: 100,
          costPrice: 20,
          quantity: 2,
        },
      ],
      subtotalLiquid: 200,
      liquidCostTotal: 40,
      deliveryFee: 50,
      totalAmount: 250,
      status: 'entregado',
      statusHistory: [],
    },
    {
      id: 'ord-2',
      createdAt: new Date().toISOString(),
      customerName: 'Maria',
      customerPhone: '8095550202',
      location: { lat: 18.490, lng: -69.935 },
      items: [
        {
          productId: 'prod-2',
          productName: 'Mango Ice',
          portion: 'mitad',
          unitPrice: 50,
          costPrice: 15,
          quantity: 1,
        },
      ],
      subtotalLiquid: 50,
      liquidCostTotal: 15,
      deliveryFee: 25,
      totalAmount: 75,
      status: 'entregado',
      statusHistory: [],
    },
    {
      id: 'ord-pending',
      createdAt: new Date().toISOString(),
      customerName: 'Juan',
      customerPhone: '8095550303',
      location: { lat: 18.492, lng: -69.938 },
      items: [],
      subtotalLiquid: 100,
      liquidCostTotal: 20,
      deliveryFee: 25,
      totalAmount: 125,
      status: 'en_camino', // Not completed yet
      statusHistory: [],
    },
  ];

  const stats = calculateFinancialStats(mockOrders);

  // Completed: ord-1 (250) + ord-2 (75) = 325 total sales
  assert.equal(stats.salesToday, 325);
  assert.equal(stats.salesAllTime, 325);
  // Liquid net profit: (200 - 40) + (50 - 15) = 160 + 35 = 195
  assert.equal(stats.profitLiquids, 195);
  // Delivery profit: 50 + 25 = 75
  assert.equal(stats.profitDelivery, 75);
  // Total net profit: 195 + 75 = 270
  assert.equal(stats.totalNetProfit, 270);
  assert.equal(stats.ordersCompletedCount, 2);
});

test('generateInventoryReport correctly tags stock status and sales', () => {
  const products: Product[] = [
    {
      id: 'prod-1',
      name: 'Menta Polar',
      flavorCategory: 'Mentolados',
      nicotineMg: 20,
      imageUrl: '',
      stockUnits: 2, // Should be CRITICO (<=3)
      costPrice: 20,
      priceFullTank: 100,
      priceHalfTank: 50,
      isActive: true,
    },
    {
      id: 'prod-2',
      name: 'Sandía Ice',
      flavorCategory: 'Frutales',
      nicotineMg: 35,
      imageUrl: '',
      stockUnits: 7, // Should be BAJO (<=8)
      costPrice: 20,
      priceFullTank: 100,
      priceHalfTank: 50,
      isActive: true,
    },
    {
      id: 'prod-3',
      name: 'Vainilla Custard',
      flavorCategory: 'Postres',
      nicotineMg: 6,
      imageUrl: '',
      stockUnits: 25, // OPTIMO
      costPrice: 25,
      priceFullTank: 100,
      priceHalfTank: 50,
      isActive: true,
    },
  ];

  const report = generateInventoryReport(products, []);
  assert.equal(report.find((r) => r.productId === 'prod-1')?.status, 'CRITICO');
  assert.equal(report.find((r) => r.productId === 'prod-2')?.status, 'BAJO');
  assert.equal(report.find((r) => r.productId === 'prod-3')?.status, 'OPTIMO');
});

test('optimizeMultiStopRoute sorts waypoints from store and traces path', () => {
  const store = { lat: 18.486, lng: -69.931 };
  const oFar: Order = {
    id: 'far',
    createdAt: new Date().toISOString(),
    customerName: 'Lejano',
    customerPhone: '111',
    location: { lat: 18.520, lng: -69.960 },
    items: [{ productId: '1', productName: 'Vape A', portion: 'tanque_lleno', unitPrice: 100, costPrice: 20, quantity: 1 }],
    subtotalLiquid: 100,
    liquidCostTotal: 20,
    deliveryFee: 100,
    totalAmount: 200,
    status: 'en_camino',
    statusHistory: [],
  };
  const oNear: Order = {
    id: 'near',
    createdAt: new Date().toISOString(),
    customerName: 'Cercano',
    customerPhone: '222',
    location: { lat: 18.487, lng: -69.932 },
    items: [{ productId: '2', productName: 'Vape B', portion: 'mitad', unitPrice: 50, costPrice: 15, quantity: 1 }],
    subtotalLiquid: 50,
    liquidCostTotal: 15,
    deliveryFee: 25,
    totalAmount: 75,
    status: 'en_camino',
    statusHistory: [],
  };

  // Give orders in reverse order [far, near]
  const route = optimizeMultiStopRoute(store, 'Tienda Central', [oFar, oNear]);

  // First stop should be the near one
  assert.equal(route.orderedOrders[0].id, 'near');
  assert.equal(route.orderedOrders[1].id, 'far');
  assert.equal(route.waypoints.length, 3); // store + 2 stops
  assert.ok(route.totalDistanceKm > 0);
});

test('generateReportCSV generates valid formatted CSV document', () => {
  const stats = calculateFinancialStats([]);
  const csv = generateInventoryReport([], []);
  const doc = import('./finance').then((m) => {
    const output = m.generateReportCSV(stats, csv, []);
    assert.ok(output.includes('REPORTE FINANCIERO Y DE VENTAS - VAPEEXPRESS'));
    assert.ok(output.includes('Ganancia Neta por Líquido'));
    assert.ok(output.includes('HISTORIAL DETALLADO DE PEDIDOS'));
  });
});

test('fetchStreetRoute returns valid street route coordinates and distance', async () => {
  const { fetchStreetRoute } = await import('./routing');
  const p1 = { lat: 18.4735, lng: -69.9405 };
  const p2 = { lat: 18.4552, lng: -69.9481 };

  const result = await fetchStreetRoute([p1, p2]);
  assert.ok(result.coordinates.length >= 2, 'Route must have at least 2 points');
  assert.ok(result.distanceKm > 0, 'Distance must be positive');
  assert.ok(result.durationMinutes > 0, 'Duration must be positive');
});

test('formatWhatsAppPhone formats Dominican 10-digit numbers with prefix 1', async () => {
  const { formatWhatsAppPhone, generateWhatsAppLink } = await import('./whatsapp');
  assert.equal(formatWhatsAppPhone('809-555-0199'), '18095550199');
  assert.equal(formatWhatsAppPhone('(829) 444-2211'), '18294442211');
  assert.equal(formatWhatsAppPhone('8491234567'), '18491234567');
  assert.equal(formatWhatsAppPhone('18095550199'), '18095550199');

  const link = generateWhatsAppLink('8095550199', 'Hola BLACK VAPE');
  assert.ok(link.startsWith('https://wa.me/18095550199?text=Hola%20BLACK%20VAPE'));
});
