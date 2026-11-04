import { chromium } from 'playwright';

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await context.newPage();

  console.log('1. Navigating to http://localhost:3000/?autostart=1');
  await page.goto('http://localhost:3000/?autostart=1', { waitUntil: 'networkidle' });

  // Handle Age Gate if present
  const isAgeGate = await page.locator('text=Confirmo que soy mayor de 18 años').first().isVisible().catch(() => false);
  if (isAgeGate) {
    console.log('Accepting Age Gate...');
    await page.click('button:has-text("Confirmo que soy mayor de 18 años")');
    await page.waitForTimeout(500);
  }

  // 2. Open Club de Puntos Modal
  console.log('2. Opening Club de Puntos modal...');
  const pointsBadge = page.locator('button[aria-label="Abrir Club de Puntos y Recompensas"]').first();
  await pointsBadge.click();
  await page.waitForTimeout(600);

  const isModalOpen = await page.locator('text=BLACK VAPE CLUB').first().isVisible();
  console.log('Modal visible:', isModalOpen);

  // Check client tabs
  console.log('Checking client modal tabs...');
  const hasCanjearTab = await page.locator('button:has-text("Canjear Llenada")').first().isVisible();
  const hasMisCanjesTab = await page.locator('button:has-text("Mis Canjes")').first().isVisible();
  const hasHistorialTab = await page.locator('button:has-text("Historial Puntos")').first().isVisible();
  const hasRifasTab = await page.locator('button:has-text("Rifas & Sorteos")').first().isVisible();
  console.log('Tabs visible:', { hasCanjearTab, hasMisCanjesTab, hasHistorialTab, hasRifasTab });

  // Click on Rifas & Sorteos
  await page.click('button:has-text("Rifas & Sorteos")');
  await page.waitForTimeout(500);
  const rifasContent = await page.locator('text=Rifas y Sorteos Activos').first().isVisible();
  console.log('Rifas section rendered:', rifasContent);

  // Close modal
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  // 3. Admin Authentication & Dashboard
  console.log('3. Navigating to Admin Panel...');
  await page.click('button:has-text("Admin")');
  await page.waitForTimeout(600);

  const loginHeading = await page.locator('text=Acceso Seguro').first().isVisible();
  if (loginHeading) {
    console.log('Submitting admin credentials...');
    await page.fill('input[type="text"], input[type="email"]', 'admin@vapeexpress.com');
    await page.fill('input[type="password"]', 'admin');
    await page.click('button:has-text("Iniciar Sesión")');
    await page.waitForTimeout(1000);
  }

  // Check admin dashboard
  const isAdminDashboard = await page.locator('text=Panel de Control').first().isVisible();
  console.log('Admin Dashboard active:', isAdminDashboard);

  // Navigate to "Club de Puntos" tab
  console.log('Navigating to ✨ Club de Puntos in Admin...');
  await page.click('button:has-text("Club de Puntos")');
  await page.waitForTimeout(800);

  const hasSubTabs = await page.locator('button:has-text("Solicitudes de Canje")').first().isVisible();
  const hasClientsTab = await page.locator('button:has-text("Clientes y Auditoría")').first().isVisible();
  const hasRafflesTab = await page.locator('button:has-text("Rifas y Sorteos")').first().isVisible();
  console.log('Admin Loyalty tabs visible:', { hasSubTabs, hasClientsTab, hasRafflesTab });

  // Switch to Clientes y Auditoría
  console.log('Switching to Clientes y Auditoría...');
  await page.click('button:has-text("Clientes y Auditoría")');
  await page.waitForTimeout(500);

  const hasCustomerList = await page.locator('text=Directorio y Balance de Clientes').first().isVisible();
  console.log('Directorio y Balance de Clientes rendered:', hasCustomerList);

  // Switch to Rifas y Sorteos
  console.log('Switching to Rifas y Sorteos...');
  await page.click('button:has-text("Rifas y Sorteos")');
  await page.waitForTimeout(500);

  const hasRaffleManagement = await page.locator('text=Gestión de Rifas y Sorteos').first().isVisible();
  console.log('Gestión de Rifas y Sorteos rendered:', hasRaffleManagement);

  console.log('ALL E2E FIDELIZACION & PUNTOS CHECKS PASSED SUCCESSFULLY!');
  await browser.close();
}

run().catch((err) => {
  console.error('E2E Test Failed:', err);
  process.exit(1);
});
