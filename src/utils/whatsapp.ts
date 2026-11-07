/**
 * WhatsApp Helper Utilities for Dominican Republic & International Numbers
 */
import { Coordinates, PortionType } from '../types';

/**
 * Normalizes phone numbers to WhatsApp international format.
 * Defaults Dominican 10-digit numbers (809, 829, 849) with 1 prefix.
 */
export function formatWhatsAppPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (!digits) return '';

  // If standard Dominican 10 digits (809xxxxxxx, 829xxxxxxx, 849xxxxxxx)
  if (digits.length === 10 && (digits.startsWith('809') || digits.startsWith('829') || digits.startsWith('849'))) {
    return `1${digits}`;
  }

  // If already 11 digits starting with 1
  if (digits.length === 11 && digits.startsWith('1')) {
    return digits;
  }

  return digits;
}

/**
 * Generates an instant WhatsApp click-to-chat URL with pre-filled message text.
 */
export function generateWhatsAppLink(phone: string, message: string): string {
  const cleanPhone = formatWhatsAppPhone(phone);
  const encodedMsg = encodeURIComponent(message.trim());
  if (!cleanPhone) {
    return `https://wa.me/?text=${encodedMsg}`;
  }
  return `https://wa.me/${cleanPhone}?text=${encodedMsg}`;
}

export interface SingleProductOrderParams {
  productName: string;
  productType?: 'liquido' | 'vape' | 'accesorio';
  variantColor?: string;
  flavorCategory?: string;
  nicotineMg?: number;
  imageUrl?: string;
  portion: PortionType;
  quantity: number;
  unitPrice: number;
  extraLiquidName?: string;
  extraLiquidPortion?: PortionType;
  extraLiquidPrice?: number;
  customerName?: string;
  customerPhone?: string;
  deliveryAddress?: string;
  customerCoords?: Coordinates;
  storeName: string;
  storeAddress: string;
  deliveryFee?: number;
}

/**
 * Builds an organized, beautiful WhatsApp message to place an order for a single liquid, vape, or accessory directly.
 */
export function buildSingleProductWhatsAppMessage(params: SingleProductOrderParams): string {
  const isVape = params.productType === 'vape';
  const isAccessory = params.productType === 'accesorio';
  const isUnit = isVape || isAccessory;
  const portionName = isAccessory
    ? `Accesorio Original${params.variantColor ? ` • ${params.variantColor}` : ''}`
    : isVape
    ? `Equipo Vape Nuevo${params.variantColor ? ` • Color: ${params.variantColor}` : ''}`
    : params.portion === 'tanque_lleno'
    ? 'Tanque Lleno (100%)'
    : 'Mitad de Tanque (50%)';
  const baseSubtotal = params.unitPrice * params.quantity;
  const extraLiquidSubtotal = params.extraLiquidName && params.extraLiquidPrice ? params.extraLiquidPrice : 0;
  const subtotal = baseSubtotal + extraLiquidSubtotal;
  const delivery = params.deliveryFee ?? 50;
  const grandTotal = subtotal + delivery;

  // Resolve absolute photo URL so WhatsApp loads the preview thumbnail (skip base64 data: URLs)
  let photoUrl = '';
  if (params.imageUrl && !params.imageUrl.startsWith('data:')) {
    if (params.imageUrl.startsWith('http')) {
      photoUrl = params.imageUrl;
    } else if (typeof window !== 'undefined') {
      photoUrl = `${window.location.origin}${params.imageUrl.startsWith('/') ? '' : '/'}${params.imageUrl}`;
    }
  }

  let mapsLink = '';
  if (params.customerCoords) {
    mapsLink = `https://maps.google.com/?q=${params.customerCoords.lat.toFixed(5)},${params.customerCoords.lng.toFixed(5)}`;
  }

  const lines = [
    isAccessory
      ? `💨 *¡HOLA BLACK VAPE! QUIERO PEDIR UN ACCESORIO* 💨`
      : isVape
      ? `💨 *¡HOLA BLACK VAPE! QUIERO PEDIR UN EQUIPO VAPE* 💨`
      : `💨 *¡HOLA BLACK VAPE! QUIERO PEDIR UNA RECARGA DE VAPE* 💨`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `🏪 *Punto de Salida:* ${params.storeName}`,
    `📍 ${params.storeAddress}`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    isAccessory
      ? `📦 *DETALLE DEL ACCESORIO:*`
      : isVape
      ? `📦 *DETALLE DEL EQUIPO VAPE:*`
      : `📦 *DETALLE DEL LÍQUIDO:*`,
    `• *${isAccessory ? 'Accesorio' : isVape ? 'Equipo Vape' : 'Líquido'}:* ${params.productName}`,
    isUnit && params.variantColor ? `• *Color/Variante:* ${params.variantColor}` : null,
    params.flavorCategory ? `• *Categoría:* ${params.flavorCategory}` : null,
    !isUnit && params.nicotineMg !== undefined ? `• *Nicotina:* ${params.nicotineMg} mg` : null,
    `• *Modalidad:* ${portionName}`,
    `• *Cantidad:* ${params.quantity} ${isUnit ? 'unidad(es)' : 'porción(es)'}`,
    `• *Precio Unidad:* $${params.unitPrice} DOP`,
    params.extraLiquidName
      ? `• *+ Recarga de Líquido Incluida:* ${params.extraLiquidName} (${
          params.extraLiquidPortion === 'tanque_lleno' ? 'Tanque Lleno' : 'Mitad de Tanque'
        } - +$${params.extraLiquidPrice || 0} DOP)`
      : null,
    `• *Subtotal Productos:* $${subtotal} DOP`,
    photoUrl ? `📸 *Foto del Producto:* ${photoUrl}` : null,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `📍 *DATOS DE ENTREGA & UBICACIÓN:*`,
    params.customerName ? `• *Cliente:* ${params.customerName}` : null,
    params.customerPhone ? `• *Teléfono:* ${params.customerPhone}` : null,
    params.deliveryAddress ? `• *Dirección/Referencia:* ${params.deliveryAddress}` : null,
    mapsLink ? `🗺️ *Ubicación GPS en Google Maps:*\n${mapsLink}` : null,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `🛵 *Delivery Estimado (1.5 km = $25 DOP):* $${delivery} DOP`,
    `💰 *TOTAL A PAGAR AL REPARTIDOR:* $${grandTotal} DOP`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    isVape
      ? `⚠️ *Nota:* Entrega de equipo Vape a domicilio${
          params.extraLiquidName ? ' con su primera recarga de líquido lista' : ''
        }. ¡Listo para recibirlo! 🚀`
      : `⚠️ *Nota:* Modalidad de recarga directa en el tanque al llegar la moto. ¡Listo para recibir la dosis! 🚀`,
  ].filter(Boolean);

  return lines.join('\n');
}

export interface FullCartOrderParams {
  orderId?: string;
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  location: Coordinates;
  items: Array<{
    productName: string;
    productType?: 'liquido' | 'vape' | 'accesorio';
    variantColor?: string;
    portion: PortionType;
    unitPrice: number;
    quantity: number;
    imageUrl?: string;
  }>;
  subtotalLiquid: number;
  deliveryFee: number;
  totalAmount: number;
  paymentMethod?: string;
  cashGiven?: number;
  changeDue?: number;
  specialNotes?: string;
  storeName: string;
  storeAddress: string;
}

/**
 * Builds an organized WhatsApp message for a complete cart checkout.
 */
export function buildFullCartWhatsAppMessage(params: FullCartOrderParams): string {
  const mapsLink = `https://maps.google.com/?q=${params.location.lat.toFixed(5)},${params.location.lng.toFixed(5)}`;

  const itemsList = params.items.map((it, idx) => {
    const isVape = it.productType === 'vape';
    const isAccessory = it.productType === 'accesorio';
    const portionName = isAccessory
      ? `Accesorio${it.variantColor ? ` • ${it.variantColor}` : ''}`
      : isVape
      ? `Equipo Vape${it.variantColor ? ` • Color: ${it.variantColor}` : ''}`
      : it.portion === 'tanque_lleno'
      ? 'Tanque Lleno'
      : 'Mitad';
    let photoLine = '';
    if (it.imageUrl && !it.imageUrl.startsWith('data:')) {
      const fullUrl = it.imageUrl.startsWith('http')
        ? it.imageUrl
        : typeof window !== 'undefined'
        ? `${window.location.origin}${it.imageUrl.startsWith('/') ? '' : '/'}${it.imageUrl}`
        : '';
      if (fullUrl) photoLine = `\n   📸 Foto: ${fullUrl}`;
    }
    return ` ${idx + 1}. *${it.quantity}x ${it.productName}* (${portionName})\n   $${it.unitPrice * it.quantity} DOP ($${it.unitPrice} c/u)${photoLine}`;
  }).join('\n');

  const paymentText =
    params.paymentMethod === 'transferencia'
      ? 'Transferencia Bancaria'
      : params.paymentMethod === 'tarjeta'
      ? 'Tarjeta / Pago Digital'
      : 'Efectivo';

  const cashDetail =
    params.cashGiven && params.cashGiven > params.totalAmount
      ? `\n• *Paga con:* $${params.cashGiven} DOP (Llevar cambio de $${params.changeDue ?? (params.cashGiven - params.totalAmount)} DOP)`
      : '';

  const lines = [
    `💨 *NUEVO PEDIDO - BLACK VAPE* 💨`,
    params.orderId ? `🔖 *Pedido:* #${params.orderId}` : null,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `🏪 *Punto de Salida:* ${params.storeName}`,
    `📍 ${params.storeAddress}`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `👤 *DATOS DEL CLIENTE:*`,
    `• *Nombre:* ${params.customerName}`,
    `• *Teléfono:* ${params.customerPhone}`,
    `• *Dirección:* ${params.deliveryAddress}`,
    `🗺️ *Ubicación GPS:* ${mapsLink}`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `📦 *PRODUCTOS SOLICITADOS:*`,
    itemsList,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `💵 *Subtotal Productos:* $${params.subtotalLiquid} DOP`,
    `🛵 *Tarifa Delivery:* $${params.deliveryFee} DOP`,
    `💰 *TOTAL A PAGAR:* $${params.totalAmount} DOP`,
    `💳 *Método de Pago:* ${paymentText}${cashDetail}`,
    params.specialNotes ? `📝 *Nota:* "${params.specialNotes}"` : null,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `⚠️ *Recordatorio:* El motorizado lleva tu pedido y dispensa las recargas directamente en tu tanque.`,
  ].filter(Boolean);

  return lines.join('\n');
}

/**
 * Generates an external Google Maps multi-stop route link for delivery drivers.
 */
export function generateGoogleMapsMultiStopUrl(origin: Coordinates, waypoints: Coordinates[]): string {
  if (waypoints.length === 0) {
    return `https://www.google.com/maps?q=${origin.lat},${origin.lng}`;
  }

  const originStr = `${origin.lat.toFixed(5)},${origin.lng.toFixed(5)}`;
  const destination = waypoints[waypoints.length - 1];
  const destStr = `${destination.lat.toFixed(5)},${destination.lng.toFixed(5)}`;

  if (waypoints.length === 1) {
    return `https://www.google.com/maps/dir/?api=1&origin=${originStr}&destination=${destStr}&travelmode=motorcycle`;
  }

  const intermediate = waypoints.slice(0, -1).map((w) => `${w.lat.toFixed(5)},${w.lng.toFixed(5)}`).join('|');
  return `https://www.google.com/maps/dir/?api=1&origin=${originStr}&destination=${destStr}&waypoints=${encodeURIComponent(intermediate)}&travelmode=motorcycle`;
}

/**
 * Pre-formatted templates for delivery messages
 */
export const WhatsAppTemplates = {
  driverToClient: (customerName: string, orderId: string, addressNote?: string) =>
    `Hola ${customerName}! 👋 Soy tu repartidor de BLACK VAPE. Voy en camino a tu ubicación con tu pedido #${orderId} de recarga de vape.${
      addressNote ? ` Confirmo la entrega en: ${addressNote}.` : ''
    } Por favor ten tu vape listo para la recarga al llegar! 🛵💨`,

  clientToDriver: (orderId: string) =>
    `Hola! Te escribo sobre mi pedido de recarga de vape #${orderId}. ¿Por dónde vienes aproximadamente?`,

  clientToStore: (orderId?: string) =>
    orderId
      ? `Hola BLACK VAPE, tengo una consulta sobre mi pedido #${orderId}.`
      : `Hola BLACK VAPE! Quisiera información sobre sus líquidos y servicio de recarga de tanque a domicilio.`,

  driverArrival: (customerName: string, orderId: string) =>
    `Hola ${customerName}! Ya estoy abajo/en la puerta con tu recarga de vape del pedido #${orderId}. Por favor sal a recibirme o avísame si bajo.`,

  orderRejected: (customerName: string, orderId: string, reason: string) =>
    `Hola ${customerName}, te escribimos de *BLACK VAPE (Loma de Cabrera)*. Lamentablemente tuvimos que rechazar/cancelar tu pedido *#${orderId}* por el siguiente motivo:\n\n⚠️ *${reason}*\n\nSi deseas corregirlo o elegir otro líquido, escríbenos por aquí o realiza un nuevo pedido en la app. ¡Disculpa los inconvenientes! 🙏💨`,
};

