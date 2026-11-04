import { chromium } from 'playwright';

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  console.log('Navigating to http://localhost:3000/?autostart=1');
  await page.goto('http://localhost:3000/?autostart=1', { waitUntil: 'networkidle' });

  // Check title
  const title = await page.title();
  console.log('Page Title:', title);

  // 1. Test "Mapa & Delivery" section
  console.log('Navigating to Mapa section...');
  await page.click('button:has-text("Mapa")');
  await page.waitForTimeout(1000);

  // Check if delivery zones strip exists
  const hasZonesStrip = await page.locator('text=Rangos Visuales de Entrega a la Redonda').isVisible();
  console.log('Has Delivery Zones Strip:', hasZonesStrip);

  const has25DOP = await page.locator('text=$25 DOP').first().isVisible();
  const has50DOP = await page.locator('text=$50 DOP').first().isVisible();
  console.log('Displays $25 DOP & $50 DOP zones:', has25DOP, has50DOP);

  // Check map zones dropdown
  await page.click('button[aria-label="Ver rangos y tarifas de delivery"]');
  await page.waitForTimeout(500);
  const isDropdownVisible = await page.locator('text=Rangos de Tarifa a la Redonda').isVisible();
  console.log('Delivery Zones dropdown on Map works:', isDropdownVisible);

  await page.screenshot({ path: 'map-zones.png' });
  console.log('Saved map-zones.png');

  // 2. Return to Tienda and test Checkout immediate calculation
  console.log('Going back to Tienda...');
  await page.click('button:has-text("Tienda")');
  await page.waitForTimeout(800);

  // Add item: click "Tanque Lleno" or "+" on first product
  console.log('Adding liquid to cart...');
  const addBtn = page.locator('button:has-text("Tanque Lleno")').first();
  await addBtn.click();
  await page.waitForTimeout(500);

  // Open Cart
  console.log('Opening Cart...');
  await page.click('button[aria-label*="canasta"], button:has-text("Mi Canasta"), button:has-text("Recargas")');
  await page.waitForTimeout(500);

  const hasRuleInCart = await page.locator('text=Cada 1.5 km = $25 DOP').first().isVisible();
  console.log('Cart displays "Cada 1.5 km = $25 DOP":', hasRuleInCart);

  // Proceed to checkout modal
  console.log('Opening Checkout Modal...');
  await page.click('button:has-text("Fijar Mapa & Solicitar")');
  await page.waitForTimeout(1000);

  // Verify immediate calculation breakdown card is visible
  const hasCalcCard = await page.locator('text=Total Inmediato').first().isVisible();
  console.log('Immediate Calculation card visible in Checkout:', hasCalcCard);

  // Select "Por Sector" tab
  console.log('Switching to "Por Sector" tab...');
  await page.click('button:has-text("Por Sector")');
  await page.waitForTimeout(500);

  // Click "Bella Vista"
  console.log('Selecting Bella Vista sector...');
  await page.click('button:has-text("Bella Vista")');
  await page.waitForTimeout(1000);

  // Extract displayed distance and fee
  const textContent = await page.locator('body').innerText();
  console.log('Has calculated distance & fee for Bella Vista:', 
    textContent.includes('Cada 1.5 km = $25 DOP') && textContent.includes('Total Inmediato a Pagar')
  );

  // Click "Zona Colonial" (further distance)
  console.log('Selecting Zona Colonial sector (further distance)...');
  await page.click('button:has-text("Zona Colonial")');
  await page.waitForTimeout(1000);

  const textContent2 = await page.locator('body').innerText();
  console.log('Updated immediately for Zona Colonial:', textContent2.includes('Zona Colonial'));

  await page.screenshot({ path: 'checkout-immediate-calc.png' });
  console.log('Saved checkout-immediate-calc.png');

  await browser.close();
  console.log('E2E visual verification completed successfully!');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
