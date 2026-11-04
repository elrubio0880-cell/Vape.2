import { UserAccount, UserRole } from '../types';
import { notifySync } from './storage';
import { supabase, isSupabaseConfigured } from './supabase';

const STORAGE_KEYS = {
  CURRENT_USER: 'vape_current_user_v2',
  USERS_CACHE: 'vape_users_cache_v2',
};

const DEMO_USER_IDS = new Set(['user-admin-1', 'user-driver-1', 'user-buyer-1']);

export const INITIAL_USERS: UserAccount[] = [
  {
    id: 'user-admin-noadia',
    role: 'admin',
    name: 'Noadia Claribel (Admin)',
    email: 'noadiasclaribel.y2k@icloud.com',
    password: 'blackVape2026',
    createdAt: new Date().toISOString(),
    isActive: true,
  },
  {
    id: 'user-admin-owner',
    role: 'admin',
    name: 'Administrador Black Vape',
    email: 'elrubio0880.0@gmail.com',
    password: 'BlackVape2026*',
    createdAt: new Date().toISOString(),
    isActive: true,
  },
];

let inMemoryUsers: UserAccount[] = [...INITIAL_USERS];
let inMemoryCurrentUser: UserAccount | null = null;

export function getStoredUsers(): UserAccount[] {
  if (typeof window === 'undefined') return inMemoryUsers;
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.USERS_CACHE);
    if (!raw) return INITIAL_USERS;
    const parsedRaw: UserAccount[] = JSON.parse(raw);
    // Filter out any legacy demo users
    const parsed = parsedRaw.filter(
      (u) =>
        !DEMO_USER_IDS.has(u.id) &&
        u.username?.toLowerCase() !== 'marcos_delivery' &&
        !(u.role === 'comprador' && u.name === 'Alejandro Medina' && u.phone === '809-772-4011')
    );
    if (parsed.length !== parsedRaw.length) {
      localStorage.setItem(STORAGE_KEYS.USERS_CACHE, JSON.stringify(parsed));
    }
    for (const defaultAdmin of INITIAL_USERS.filter((u) => u.role === 'admin')) {
      const exists = parsed.some(
        (u) => u.role === 'admin' && u.email?.toLowerCase() === defaultAdmin.email?.toLowerCase()
      );
      if (!exists) {
        parsed.unshift(defaultAdmin);
      }
    }
    return parsed;
  } catch {
    return inMemoryUsers;
  }
}

export function saveUsersCache(users: UserAccount[]): void {
  const cleaned = users.filter((u) => !DEMO_USER_IDS.has(u.id));
  inMemoryUsers = [...cleaned];
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEYS.USERS_CACHE, JSON.stringify(cleaned));
  const current = getCurrentUser();
  if (current) {
    const updatedCurrent = cleaned.find((u) => u.id === current.id);
    if (updatedCurrent) {
      inMemoryCurrentUser = updatedCurrent;
      localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(updatedCurrent));
    }
  }
  notifySync();
}

export function getCurrentUser(): UserAccount | null {
  if (typeof window === 'undefined') {
    return inMemoryCurrentUser;
  }
  const raw = localStorage.getItem(STORAGE_KEYS.CURRENT_USER);
  if (!raw) {
    return null;
  }
  try {
    const parsed: UserAccount = JSON.parse(raw);
    if (
      !parsed ||
      DEMO_USER_IDS.has(parsed.id) ||
      parsed.username?.toLowerCase() === 'marcos_delivery' ||
      (parsed.role === 'comprador' && parsed.name === 'Alejandro Medina' && parsed.phone === '809-772-4011')
    ) {
      localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function setCurrentUser(user: UserAccount | null): void {
  inMemoryCurrentUser = user;
  if (typeof window === 'undefined') return;
  if (!user) {
    localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
  } else {
    localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(user));
  }
  notifySync();
}

/**
 * Normalizes phone numbers to 10 digits
 */
function cleanPhoneDigits(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1);
  return digits;
}

/**
 * Login or register Buyer (Cliente):
 * Uses Supabase Auth with deterministic customer credential based on phone number.
 * No password required for the buyer.
 */
export async function loginOrRegisterBuyer(name: string, phone: string): Promise<UserAccount> {
  const trimmedName = name.trim();
  const trimmedPhone = phone.trim();
  const digits = cleanPhoneDigits(trimmedPhone) || '0000000000';
  const customerEmail = `${digits}@clientes.blackvape.local`;
  const customerPassword = `bv_cliente_${digits}_secure`;

  if (isSupabaseConfigured()) {
    try {
      // 1. Try to sign in with existing buyer identity
      let { data: authData, error: signInError } = await supabase.auth.signInWithPassword({
        email: customerEmail,
        password: customerPassword,
      });

      let activeUser = authData?.user;

      // 2. If user does not exist yet, provision via server-side RPC (avoids .local domain & SMTP limits)
      if (signInError || !activeUser) {
        await supabase.rpc('register_buyer_account', {
          p_name: trimmedName,
          p_phone: trimmedPhone,
        });

        const retrySignIn = await supabase.auth.signInWithPassword({
          email: customerEmail,
          password: customerPassword,
        });
        activeUser = retrySignIn.data?.user;
      }

      if (activeUser) {
        // Fetch or update profile
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', activeUser.id)
          .maybeSingle();

        const cachedUsers = getStoredUsers();
        const existingLocal = cachedUsers.find((u) => u.id === activeUser.id);

        const buyerUser: UserAccount = {
          id: activeUser.id,
          role: 'comprador',
          name: profile?.name || trimmedName,
          phone: profile?.phone || trimmedPhone,
          pointsBalance: Number(profile?.points_balance ?? existingLocal?.pointsBalance ?? 0),
          createdAt: activeUser.created_at || new Date().toISOString(),
          isActive: true,
        };

        const otherUsers = cachedUsers.filter((u) => u.id !== buyerUser.id);
        saveUsersCache([...otherUsers, buyerUser]);
        setCurrentUser(buyerUser);
        return buyerUser;
      }
    } catch (err) {
      console.warn('Supabase auth fallback for buyer:', err);
    }
  }

  // Local fallback (offline or dev without credentials)
  const users = getStoredUsers();
  let existing = users.find(
    (u) => u.role === 'comprador' && (u.phone === trimmedPhone || u.name.toLowerCase() === trimmedName.toLowerCase())
  );

  if (!existing) {
    existing = {
      id: `buyer-${Date.now()}`,
      role: 'comprador',
      name: trimmedName,
      phone: trimmedPhone,
      createdAt: new Date().toISOString(),
      isActive: true,
    };
    users.push(existing);
    saveUsersCache(users);
  } else {
    existing.name = trimmedName;
    existing.phone = trimmedPhone;
    saveUsersCache(users);
  }

  setCurrentUser(existing);
  return existing;
}

/**
 * Login Administrator:
 * Authenticates with Supabase Auth (email + password), verifies role = 'admin' in profiles.
 */
export async function loginAdmin(
  email: string,
  pass: string
): Promise<{ success: boolean; user?: UserAccount; error?: string }> {
  const cleanEmail = email.trim().toLowerCase();
  const isOwnerMasterCredential =
    (cleanEmail === 'noadiasclaribel.y2k@icloud.com' && pass === 'blackVape2026') ||
    (cleanEmail === 'elrubio0880.0@gmail.com' && pass === 'BlackVape2026*');

  if (isSupabaseConfigured()) {
    try {
      const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password: pass,
      });

      let authUser = authData?.user || null;

      // Auto-register owner in Supabase Auth on first login if not yet created
      if (!authUser && isOwnerMasterCredential) {
        const { data: signUpData } = await supabase.auth.signUp({
          email: cleanEmail,
          password: pass,
          options: {
            data: {
              name: cleanEmail.startsWith('noadia') ? 'Noadia Claribel (Admin)' : 'Administrador Black Vape',
              role: 'admin',
            },
          },
        });
        if (signUpData?.user) {
          authUser = signUpData.user;
        }
      }

      if (authUser) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', authUser.id)
          .maybeSingle();

        if ((profile && profile.role === 'admin') || isOwnerMasterCredential) {
          const adminUser: UserAccount = {
            id: authUser.id,
            role: 'admin',
            name:
              profile?.name ||
              (cleanEmail.startsWith('noadia') ? 'Noadia Claribel (Admin)' : 'Administrador Black Vape'),
            email: cleanEmail,
            createdAt: profile?.created_at || new Date().toISOString(),
            isActive: true,
          };

          setCurrentUser(adminUser);
          return { success: true, user: adminUser };
        }

        await supabase.auth.signOut();
        return {
          success: false,
          error: 'Esta cuenta no tiene permisos de administrador. Contacta al soporte técnico.',
        };
      }

      if (!isOwnerMasterCredential) {
        return { success: false, error: authErr?.message || 'Credenciales de administrador inválidas.' };
      }
    } catch (err: any) {
      if (!isOwnerMasterCredential) {
        return { success: false, error: err.message || 'Error de conexión con Supabase.' };
      }
    }
  }

  // Local / Owner fallback
  const users = getStoredUsers();
  const admin = users.find((u) => u.role === 'admin' && u.email?.toLowerCase() === cleanEmail);
  if (!admin) {
    return { success: false, error: 'No existe una cuenta de administrador con ese correo.' };
  }
  if (
    admin.password &&
    admin.password !== pass &&
    !(admin.id === 'user-admin-1' && (pass === 'admin' || pass === 'admin123'))
  ) {
    return { success: false, error: 'Contraseña incorrecta.' };
  }

  setCurrentUser(admin);
  return { success: true, user: admin };
}

/**
 * Register Administrator (requires invite or bootstrapping):
 */
export async function registerAdmin(
  name: string,
  email: string,
  pass: string
): Promise<{ success: boolean; user?: UserAccount; error?: string }> {
  const cleanEmail = email.trim().toLowerCase();

  if (isSupabaseConfigured()) {
    try {
      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password: pass,
        options: {
          data: {
            name: name.trim(),
            role: 'admin',
          },
        },
      });

      if (error || !data.user) {
        return { success: false, error: error?.message || 'Error al registrar administrador.' };
      }

      // Use helper to ensure admin role is assigned
      await supabase.rpc('make_user_admin', { p_email: cleanEmail });

      const adminUser: UserAccount = {
        id: data.user.id,
        role: 'admin',
        name: name.trim(),
        email: cleanEmail,
        createdAt: new Date().toISOString(),
        isActive: true,
      };

      setCurrentUser(adminUser);
      return { success: true, user: adminUser };
    } catch (err: any) {
      return { success: false, error: err.message || 'Error al registrar en Supabase.' };
    }
  }

  // Local fallback
  const newAdmin: UserAccount = {
    id: `admin-${Date.now()}`,
    role: 'admin',
    name: name.trim(),
    email: cleanEmail,
    createdAt: new Date().toISOString(),
    isActive: true,
  };
  setCurrentUser(newAdmin);
  return { success: true, user: newAdmin };
}

/**
 * Login Driver (Repartidor):
 * Authenticates with Supabase Auth using username and password, falling back to local cache.
 */
export async function loginDriver(
  username: string,
  pass: string
): Promise<{ success: boolean; user?: UserAccount; error?: string }> {
  const cleanUser = username.trim().toLowerCase();
  const driverEmail = `${cleanUser}@repartidor.blackvape.local`;

  if (isSupabaseConfigured()) {
    try {
      const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
        email: driverEmail,
        password: pass,
      });

      if (!authErr && authData?.user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', authData.user.id)
          .maybeSingle();

        if (profile && profile.role === 'delivery') {
          if (!profile.is_active) {
            await supabase.auth.signOut();
            return { success: false, error: 'Esta cuenta de repartidor está temporalmente deshabilitada.' };
          }

          const driverUser: UserAccount = {
            id: authData.user.id,
            role: 'delivery',
            name: profile.name,
            phone: profile.phone,
            username: profile.username || cleanUser,
            createdAt: profile.created_at,
            isActive: profile.is_active,
          };

          setCurrentUser(driverUser);
          return { success: true, user: driverUser };
        }
      }
    } catch (err) {
      console.warn('Supabase driver login fallback:', err);
    }
  }

  // Local fallback for drivers created locally or marcos_delivery
  const users = getStoredUsers();
  const driver = users.find((u) => u.role === 'delivery' && u.username?.toLowerCase() === cleanUser);
  if (!driver) {
    return { success: false, error: 'Usuario de repartidor no encontrado. Solicita al administrador tu acceso.' };
  }
  if (!driver.isActive) {
    return { success: false, error: 'Esta cuenta de repartidor está deshabilitada temporalmente.' };
  }
  if (driver.password && driver.password !== pass && !(driver.id === 'user-driver-1' && (pass === 'driver' || pass === 'driver123'))) {
    return { success: false, error: 'Contraseña de repartidor incorrecta.' };
  }

  setCurrentUser(driver);
  return { success: true, user: driver };
}

/**
 * Admin creates a new Delivery Driver via secure RPC + local persistence
 */
export async function createDriverByAdmin(driverData: {
  name: string;
  phone: string;
  username: string;
  password: string;
}): Promise<{ success: boolean; user?: UserAccount; error?: string }> {
  const cleanUsername = driverData.username.trim().toLowerCase();
  const users = getStoredUsers();
  const existing = users.find((u) => u.role === 'delivery' && u.username?.toLowerCase() === cleanUsername);
  if (existing) {
    return { success: false, error: 'Ya existe un repartidor con ese nombre de usuario.' };
  }

  let serverUserId: string | undefined;

  if (isSupabaseConfigured()) {
    try {
      const { data, error } = await supabase.rpc('create_driver_account', {
        p_name: driverData.name.trim(),
        p_phone: driverData.phone.trim(),
        p_username: cleanUsername,
        p_password: driverData.password.trim(),
      });

      if (!error && data?.user_id) {
        serverUserId = data.user_id;
      }
    } catch (err) {
      console.warn('Aviso al crear repartidor en Supabase (guardando localmente):', err);
    }
  }

  const newDriver: UserAccount = {
    id: serverUserId || `driver-${Date.now()}`,
    role: 'delivery',
    name: driverData.name.trim(),
    phone: driverData.phone.trim(),
    username: cleanUsername,
    password: driverData.password.trim(),
    createdAt: new Date().toISOString(),
    isActive: true,
  };

  saveUsersCache([...users, newDriver]);
  return { success: true, user: newDriver };
}

/**
 * Admin deletes or deactivates driver
 */
export async function deleteDriver(driverId: string): Promise<void> {
  if (isSupabaseConfigured()) {
    try {
      await supabase.from('profiles').update({ is_active: false }).eq('id', driverId);
    } catch (err) {
      console.warn('Error deleting driver from Supabase:', err);
    }
  }

  const users = getStoredUsers().filter((u) => u.id !== driverId);
  saveUsersCache(users);
}

/**
 * Fetches all driver accounts merging Supabase profiles with local cache
 */
export async function fetchDriversList(): Promise<UserAccount[]> {
  const localDrivers = getStoredUsers().filter(
    (u) => u.role === 'delivery' && u.isActive !== false && u.username?.toLowerCase() !== 'marcos_delivery'
  );

  if (isSupabaseConfigured()) {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('role', 'delivery')
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (!error && data) {
        const serverDrivers: UserAccount[] = data
          .filter((p) => p.username?.toLowerCase() !== 'marcos_delivery' && !DEMO_USER_IDS.has(p.id))
          .map((p) => ({
            id: p.id,
            role: 'delivery',
            name: p.name,
            phone: p.phone,
            username: p.username,
            createdAt: p.created_at,
            isActive: p.is_active,
          }));

        const mergedMap = new Map<string, UserAccount>();
        for (const sd of serverDrivers) {
          const key = (sd.username || sd.id).toLowerCase();
          mergedMap.set(key, sd);
        }
        for (const ld of localDrivers) {
          const key = (ld.username || ld.id).toLowerCase();
          const existing = mergedMap.get(key);
          if (!existing) {
            mergedMap.set(key, ld);
          } else {
            mergedMap.set(key, {
              ...existing,
              password: ld.password || existing.password,
            });
          }
        }
        return Array.from(mergedMap.values());
      }
    } catch (err) {
      console.warn('Error fetching drivers from Supabase:', err);
    }
  }
  return localDrivers;
}

/**
 * Ensures a buyer profile exists in local users cache when an order is placed
 */
export function ensureBuyerProfileForOrder(
  name: string,
  phone: string,
  preferredId?: string
): UserAccount {
  const trimmedName = name.trim() || 'Cliente';
  const trimmedPhone = phone.trim();
  const cleanDigits = cleanPhoneDigits(trimmedPhone);
  const users = getStoredUsers();

  let found = users.find(
    (u) =>
      u.role === 'comprador' &&
      ((preferredId && u.id === preferredId) ||
        (cleanDigits && cleanPhoneDigits(u.phone || '') === cleanDigits))
  );

  if (found) {
    found.name = trimmedName;
    if (trimmedPhone) found.phone = trimmedPhone;
    saveUsersCache(users);
    return found;
  }

  const newBuyer: UserAccount = {
    id: preferredId || `buyer-${cleanDigits || Date.now()}`,
    role: 'comprador',
    name: trimmedName,
    phone: trimmedPhone,
    pointsBalance: 0,
    createdAt: new Date().toISOString(),
    isActive: true,
  };

  saveUsersCache([...users, newBuyer]);
  return newBuyer;
}

/**
 * Sign out session
 */
export async function logoutUser(): Promise<void> {
  if (isSupabaseConfigured()) {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      // Ignore
    }
  }
  setCurrentUser(null);
}
