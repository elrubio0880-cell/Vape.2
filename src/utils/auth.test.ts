import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INITIAL_USERS,
  loginOrRegisterBuyer,
  loginAdmin,
  loginDriver,
  createDriverByAdmin,
} from './auth';

test('Initial users contain production admin accounts only (no demo users)', () => {
  assert.ok(INITIAL_USERS.some((u) => u.role === 'admin' && u.email === 'elrubio0880.0@gmail.com'));
  assert.ok(INITIAL_USERS.some((u) => u.role === 'admin' && u.email === 'noadiasclaribel.y2k@icloud.com'));
  assert.equal(INITIAL_USERS.some((u) => u.role === 'delivery'), false);
  assert.equal(INITIAL_USERS.some((u) => u.role === 'comprador'), false);
});

test('loginOrRegisterBuyer requires only name and phone', async () => {
  const buyer = await loginOrRegisterBuyer('Juan Perez', '809-555-9988');
  assert.equal(buyer.name, 'Juan Perez');
  assert.equal(buyer.phone, '809-555-9988');
  assert.equal(buyer.role, 'comprador');
});

test('loginAdmin validates email and password', async () => {
  const badLogin = await loginAdmin('wrong@email.com', 'admin');
  assert.equal(badLogin.success, false);

  const goodLogin = await loginAdmin('elrubio0880.0@gmail.com', 'BlackVape2026*');
  assert.equal(goodLogin.success, true);
  assert.equal(goodLogin.user?.role, 'admin');
});

test('createDriverByAdmin and loginDriver works with assigned credentials', async () => {
  const newDriverRes = await createDriverByAdmin({
    name: 'Carlos Moto Reparto',
    phone: '829-555-1234',
    username: 'carlos_delivery',
    password: 'securePass123',
  });
  assert.equal(newDriverRes.success, true);

  const loginRes = await loginDriver('carlos_delivery', 'securePass123');
  assert.equal(loginRes.success, true);
  assert.equal(loginRes.user?.name, 'Carlos Moto Reparto');
  assert.equal(loginRes.user?.role, 'delivery');
});
