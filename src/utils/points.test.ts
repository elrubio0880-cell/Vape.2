import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculatePointsEarned,
  canUserRedeem,
  validatePointAdjustment,
  calculateRaffleTickets,
  findWinnerByTicketNumber,
  formatSantoDomingoDate,
} from './points';

test('1. calculatePointsEarned - strictly follows business rules', () => {
  // Rule 1: Dominican Pesos 1:1 for liquid, floored
  assert.equal(calculatePointsEarned(100, 'regular', true), 100);
  assert.equal(calculatePointsEarned(50, 'regular', true), 50);
  assert.equal(calculatePointsEarned(150, 'regular', true), 150);
  assert.equal(calculatePointsEarned(199.99, 'regular', true), 199);

  // Rule 2: Guests earn 0 points
  assert.equal(calculatePointsEarned(100, 'regular', false), 0);
  assert.equal(calculatePointsEarned(500, 'regular', false), 0);

  // Rule 3: Redemption orders ('canje') earn 0 points
  assert.equal(calculatePointsEarned(100, 'canje', true), 0);
  assert.equal(calculatePointsEarned(0, 'canje', true), 0);

  // Negative or invalid subtotals earn 0 points
  assert.equal(calculatePointsEarned(0, 'regular', true), 0);
  assert.equal(calculatePointsEarned(-50, 'regular', true), 0);
  assert.equal(calculatePointsEarned(NaN, 'regular', true), 0);
});

test('2. canUserRedeem - checks balance, cost, and active switch', () => {
  // Default cost is 1000
  assert.deepEqual(canUserRedeem(1000, 1000, true), { canRedeem: true });
  assert.deepEqual(canUserRedeem(1250, 1000, true), { canRedeem: true });

  // Insufficient balance
  const resultInsufficient = canUserRedeem(850, 1000, true);
  assert.equal(resultInsufficient.canRedeem, false);
  assert.match(resultInsufficient.reason || '', /faltan 150 puntos/);

  // Program disabled
  const resultDisabled = canUserRedeem(2000, 1000, false);
  assert.equal(resultDisabled.canRedeem, false);
  assert.match(resultDisabled.reason || '', /desactivado/);

  // Invalid cost configuration
  const resultInvalidCost = canUserRedeem(500, 0, true);
  assert.equal(resultInvalidCost.canRedeem, false);
});

test('3. validatePointAdjustment - prevents negative balances and requires reasons', () => {
  // Empty reason rejected
  const emptyReason = validatePointAdjustment(500, 100, '');
  assert.equal(emptyReason.valid, false);
  assert.match(emptyReason.error || '', /motivo/);

  // Whitespace only reason rejected
  const whitespaceReason = validatePointAdjustment(500, 100, '   ');
  assert.equal(whitespaceReason.valid, false);

  // Delta zero rejected
  const zeroDelta = validatePointAdjustment(500, 0, 'Corrección');
  assert.equal(zeroDelta.valid, false);

  // Negative balance prevented
  const overDeduct = validatePointAdjustment(200, -250, 'Ajuste excesivo');
  assert.equal(overDeduct.valid, false);
  assert.match(overDeduct.error || '', /saldo resultante no puede ser negativo/);

  // Valid deduction to exactly zero allowed
  const exactZero = validatePointAdjustment(200, -200, 'Ajuste a cero');
  assert.equal(exactZero.valid, true);

  // Valid positive adjustment
  const validPositive = validatePointAdjustment(100, 50, 'Bonificación especial');
  assert.equal(validPositive.valid, true);
});

test('4. calculateRaffleTickets - equal vs weighted draws and ticket ranges', () => {
  const users = [
    { id: 'u1', name: 'Ana', pointsBalance: 100 },
    { id: 'u2', name: 'Carlos', pointsBalance: 250 },
    { id: 'u3', name: 'David (Sin puntos)', pointsBalance: 0 },
  ];

  // 1. Equal probability: 1 ticket per user with points > 0
  const equal = calculateRaffleTickets(users, 'igualitaria');
  assert.equal(equal.participants.length, 2);
  assert.equal(equal.totalTickets, 2);
  assert.equal(equal.participants[0].ticketStart, 1);
  assert.equal(equal.participants[0].ticketEnd, 1);
  assert.equal(equal.participants[1].ticketStart, 2);
  assert.equal(equal.participants[1].ticketEnd, 2);

  // 2. Weighted probability: 1 point = 1 ticket
  const weighted = calculateRaffleTickets(users, 'ponderada');
  assert.equal(weighted.participants.length, 2);
  assert.equal(weighted.totalTickets, 350); // 100 + 250
  assert.equal(weighted.participants[0].ticketCount, 100);
  assert.equal(weighted.participants[0].ticketStart, 1);
  assert.equal(weighted.participants[0].ticketEnd, 100);
  assert.equal(weighted.participants[1].ticketCount, 250);
  assert.equal(weighted.participants[1].ticketStart, 101);
  assert.equal(weighted.participants[1].ticketEnd, 350);
});

test('5. findWinnerByTicketNumber - accurately resolves ticket to participant', () => {
  const participants = [
    {
      id: 'p1',
      raffleId: 'r1',
      userId: 'u1',
      userName: 'Ana',
      ticketCount: 100,
      ticketStart: 1,
      ticketEnd: 100,
      userPointsBalance: 100,
    },
    {
      id: 'p2',
      raffleId: 'r1',
      userId: 'u2',
      userName: 'Carlos',
      ticketCount: 50,
      ticketStart: 101,
      ticketEnd: 150,
      userPointsBalance: 50,
    },
  ];

  // Ticket 1 -> Ana
  assert.equal(findWinnerByTicketNumber(participants, 1)?.userName, 'Ana');
  // Ticket 100 -> Ana
  assert.equal(findWinnerByTicketNumber(participants, 100)?.userName, 'Ana');
  // Ticket 101 -> Carlos
  assert.equal(findWinnerByTicketNumber(participants, 101)?.userName, 'Carlos');
  // Ticket 150 -> Carlos
  assert.equal(findWinnerByTicketNumber(participants, 150)?.userName, 'Carlos');
  // Ticket out of bounds -> null
  assert.equal(findWinnerByTicketNumber(participants, 151), null);
  assert.equal(findWinnerByTicketNumber(participants, 0), null);
});

test('6. formatSantoDomingoDate - formats with America/Santo_Domingo timezone', () => {
  // UTC 2026-11-01T16:00:00Z is 12:00 PM AST in Santo Domingo (UTC-4)
  const formatted = formatSantoDomingoDate('2026-11-01T16:00:00.000Z');
  assert.ok(formatted.includes('12:00') || formatted.includes('12'));
  assert.ok(formatted.length > 5);
});
