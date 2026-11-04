import { PortionType, RaffleParticipant, RaffleDrawType } from '../types';

/**
 * 1. Calculate Points to Earn from an Order
 * Rule: 1 DOP of liquid = 1 point (rounded down to integer).
 * Delivery fee is excluded.
 * Guest orders (no registered account) earn 0 points.
 * Redemption ('canje') orders earn 0 points.
 */
export function calculatePointsEarned(
  liquidSubtotal: number,
  orderType: 'regular' | 'standard' | 'canje' = 'regular',
  hasRegisteredAccount: boolean = true
): number {
  if (!hasRegisteredAccount) return 0;
  if (orderType === 'canje') return 0;
  if (!liquidSubtotal || isNaN(liquidSubtotal) || liquidSubtotal <= 0) return 0;
  return Math.floor(liquidSubtotal);
}

/**
 * 2. Validate if user can request a liquid redemption
 * Cost is default 1000 points or storeConfig.points_per_redemption.
 */
export function canUserRedeem(
  userPoints: number,
  pointsCost: number = 1000,
  redemptionsEnabled: boolean = true
): { canRedeem: boolean; reason?: string } {
  if (!redemptionsEnabled) {
    return { canRedeem: false, reason: 'El programa de canjes está temporalmente desactivado.' };
  }
  if (pointsCost <= 0) {
    return { canRedeem: false, reason: 'El costo en puntos configurado es inválido.' };
  }
  if (userPoints < pointsCost) {
    const missing = pointsCost - userPoints;
    return {
      canRedeem: false,
      reason: `Te faltan ${missing} puntos para solicitar una recarga gratis (Tienes ${userPoints} de ${pointsCost} pts).`,
    };
  }
  return { canRedeem: true };
}

/**
 * 3. Validate admin manual point adjustment
 * Rationale: Reason is strictly mandatory; balance cannot fall below zero.
 */
export function validatePointAdjustment(
  currentBalance: number,
  deltaPoints: number,
  reason: string
): { valid: boolean; error?: string } {
  if (!reason || reason.trim().length < 3) {
    return { valid: false, error: 'El motivo del ajuste es obligatorio (mínimo 3 caracteres).' };
  }
  if (!deltaPoints || isNaN(deltaPoints) || deltaPoints === 0) {
    return { valid: false, error: 'La cantidad de puntos a ajustar no puede ser cero.' };
  }
  const newBalance = currentBalance + deltaPoints;
  if (newBalance < 0) {
    return {
      valid: false,
      error: `El saldo resultante no puede ser negativo (Saldo actual: ${currentBalance}, Ajuste: ${deltaPoints}).`,
    };
  }
  return { valid: true };
}

/**
 * 4. Generate Raffle Tickets based on draw type
 * - 'igualitaria': 1 ticket per user with pointsBalance > 0.
 * - 'ponderada': 1 point = 1 ticket. Users with 0 points get 0 tickets.
 * Generates continuous consecutive intervals: [ticketStart, ticketEnd].
 */
export function calculateRaffleTickets(
  users: Array<{ id: string; name: string; phone?: string; pointsBalance: number }>,
  drawType: RaffleDrawType
): { participants: RaffleParticipant[]; totalTickets: number } {
  const participants: RaffleParticipant[] = [];
  let currentTicketCounter = 1;

  for (const user of users) {
    const balance = Math.max(0, Math.floor(user.pointsBalance || 0));
    let ticketCount = 0;

    if (drawType === 'igualitaria') {
      ticketCount = balance > 0 ? 1 : 0;
    } else {
      ticketCount = balance;
    }

    if (ticketCount > 0) {
      const ticketStart = currentTicketCounter;
      const ticketEnd = currentTicketCounter + ticketCount - 1;
      participants.push({
        id: `part-${user.id}`,
        raffleId: '',
        userId: user.id,
        userName: user.name,
        userPhone: user.phone,
        ticketCount,
        ticketStart,
        ticketEnd,
        userPointsBalance: balance,
      });
      currentTicketCounter = ticketEnd + 1;
    }
  }

  const totalTickets = currentTicketCounter - 1;
  return { participants, totalTickets };
}

/**
 * 5. Locate winning participant by ticket number
 */
export function findWinnerByTicketNumber(
  participants: RaffleParticipant[],
  winningTicket: number
): RaffleParticipant | null {
  if (!participants || participants.length === 0 || winningTicket <= 0) return null;
  return (
    participants.find(
      (p) => winningTicket >= p.ticketStart && winningTicket <= p.ticketEnd
    ) || null
  );
}

/**
 * 6. Format Date and Time in America/Santo_Domingo
 */
export function formatSantoDomingoDate(
  isoDateString: string,
  options?: Intl.DateTimeFormatOptions
): string {
  try {
    const date = new Date(isoDateString);
    if (isNaN(date.getTime())) return isoDateString;

    const defaultOptions: Intl.DateTimeFormatOptions = {
      timeZone: 'America/Santo_Domingo',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      ...options,
    };

    return new Intl.DateTimeFormat('es-DO', defaultOptions).format(date);
  } catch {
    return isoDateString;
  }
}
