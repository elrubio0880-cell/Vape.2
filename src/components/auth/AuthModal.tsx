import React, { useState } from 'react';
import { UserAccount, UserRole } from '../../types';
import {
  loginOrRegisterBuyer,
  loginAdmin,
  registerAdmin,
  loginDriver,
} from '../../utils/auth';
import { playNotificationSound } from '../../utils/storage';
import {
  User,
  Phone,
  Mail,
  Lock,
  Bike,
  Shield,
  ShoppingBag,
  X,
  AlertCircle,
  CheckCircle2,
  KeyRound,
} from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthSuccess: (user: UserAccount) => void;
  initialRole?: UserRole;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onAuthSuccess,
  initialRole = 'comprador',
}) => {
  const [selectedRole, setSelectedRole] = useState<UserRole>(initialRole);
  const [adminMode, setAdminMode] = useState<'login' | 'register'>('login');
  const [errorMessage, setErrorMessage] = useState('');

  // Form fields
  const [buyerName, setBuyerName] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');

  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');

  const [driverUsername, setDriverUsername] = useState('');
  const [driverPassword, setDriverPassword] = useState('');

  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen) return null;

  // 1. Buyer submission (Only Name + Phone)
  const handleBuyerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!buyerName.trim() || buyerName.trim().length < 2) {
      setErrorMessage('Por favor ingresa tu nombre completo.');
      return;
    }
    const cleanDigits = buyerPhone.replace(/\D/g, '');
    const normalizedPhone =
      cleanDigits.length === 11 && cleanDigits.startsWith('1') ? cleanDigits.slice(1) : cleanDigits;
    const isValidDoPhone =
      normalizedPhone.length === 10 &&
      (normalizedPhone.startsWith('809') ||
        normalizedPhone.startsWith('829') ||
        normalizedPhone.startsWith('849'));
    if (!isValidDoPhone) {
      setErrorMessage('Ingresa un teléfono válido de RD de 10 dígitos (809, 829 o 849).');
      return;
    }

    setErrorMessage('');
    setIsLoading(true);
    try {
      const user = await loginOrRegisterBuyer(buyerName, normalizedPhone);
      playNotificationSound('success');
      onAuthSuccess(user);
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Error al autenticar comprador.');
    } finally {
      setIsLoading(false);
    }
  };

  // 2. Admin submission (Email + Password, Login or Register)
  const handleAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setIsLoading(true);

    try {
      if (adminMode === 'login') {
        const res = await loginAdmin(adminEmail, adminPassword);
        if (!res.success || !res.user) {
          setErrorMessage(res.error || 'Credenciales de administrador inválidas.');
          return;
        }
        playNotificationSound('success');
        onAuthSuccess(res.user);
        onClose();
      } else {
        if (!adminName.trim()) {
          setErrorMessage('Ingresa tu nombre para el registro de administrador.');
          return;
        }
        const res = await registerAdmin(adminName, adminEmail, adminPassword);
        if (!res.success || !res.user) {
          setErrorMessage(res.error || 'Error al registrar administrador.');
          return;
        }
        playNotificationSound('success');
        onAuthSuccess(res.user);
        onClose();
      }
    } finally {
      setIsLoading(false);
    }
  };

  // 3. Driver submission (Username + Password assigned by Admin)
  const handleDriverSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setIsLoading(true);

    try {
      const res = await loginDriver(driverUsername, driverPassword);
      if (!res.success || !res.user) {
        setErrorMessage(res.error || 'Credenciales de repartidor inválidas.');
        return;
      }
      playNotificationSound('success');
      onAuthSuccess(res.user);
      onClose();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/90 backdrop-blur-xl overflow-y-auto font-urban">
      <div className="relative w-full max-w-md bg-[#0d0918]/95 border-2 border-purple-500/50 rounded-3xl p-5 sm:p-7 shadow-2xl shadow-purple-950 text-neutral-100 my-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-3.5 border-b border-purple-900/40">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full p-0.5 bg-gradient-to-tr from-purple-600 via-cyan-400 to-purple-500 shadow-md shadow-purple-600/40 shrink-0">
              <div className="w-full h-full rounded-full overflow-hidden bg-black flex items-center justify-center">
                <img
                  src="/logo-black-vape.jpeg"
                  alt="BLACK VAPE"
                  className="w-full h-full object-cover scale-105"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
              </div>
            </div>
            <div>
              <span className="text-[10px] font-tag uppercase tracking-wider text-purple-400 block">
                BLACK VAPE • ACCESO
              </span>
              <h2 className="text-lg font-black text-white font-urban">Identifícate por Rol</h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-purple-950/40 hover:bg-purple-900/60 text-neutral-400 hover:text-white transition-all cursor-pointer border border-purple-800/40"
            aria-label="Cerrar modal de autenticación"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Role Segmented Buttons */}
        <div className="mt-4 grid grid-cols-3 gap-1.5 p-1 bg-black/60 rounded-2xl border border-purple-900/50">
          <button
            type="button"
            onClick={() => {
              setSelectedRole('comprador');
              setErrorMessage('');
            }}
            className={`py-2 px-1 text-center rounded-xl text-xs font-black transition-all cursor-pointer flex flex-col items-center gap-1 font-urban ${
              selectedRole === 'comprador'
                ? 'bg-gradient-to-r from-emerald-500 to-teal-400 text-neutral-950 shadow-md shadow-emerald-500/20'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <ShoppingBag className="w-4 h-4" />
            <span>Comprador</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setSelectedRole('delivery');
              setErrorMessage('');
            }}
            className={`py-2 px-1 text-center rounded-xl text-xs font-black transition-all cursor-pointer flex flex-col items-center gap-1 font-urban ${
              selectedRole === 'delivery'
                ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-neutral-950 shadow-md shadow-cyan-500/20'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <Bike className="w-4 h-4" />
            <span>Delivery</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setSelectedRole('admin');
              setErrorMessage('');
            }}
            className={`py-2 px-1 text-center rounded-xl text-xs font-bold transition-all cursor-pointer flex flex-col items-center gap-1 ${
              selectedRole === 'admin'
                ? 'bg-violet-600 text-white shadow'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <Shield className="w-4 h-4" />
            <span>Administrador</span>
          </button>
        </div>

        {errorMessage && (
          <div className="mt-4 p-3 bg-red-950/60 border border-red-800 rounded-xl text-red-200 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* 1. COMPRADOR FORM: Solo Nombre y Teléfono */}
        {selectedRole === 'comprador' && (
          <form onSubmit={handleBuyerSubmit} className="mt-5 space-y-4">
            <div className="p-3 bg-emerald-950/20 border border-emerald-500/20 rounded-2xl text-[11px] text-emerald-300">
              👋 <strong>Acceso rápido sin contraseñas:</strong> Ingresa tu nombre y tu teléfono para
              realizar pedidos y recibir llamadas del repartidor.
            </div>

            <div>
              <label className="block text-xs font-bold text-neutral-300 mb-1">
                Tu Nombre Completo *
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  placeholder="Ej: David Villalona"
                  value={buyerName}
                  onChange={(e) => setBuyerName(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl py-2.5 pl-9 pr-3 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-neutral-300 mb-1">
                Número de Teléfono *
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="tel"
                  required
                  placeholder="Ej: 809-210-4901"
                  value={buyerPhone}
                  onChange={(e) => setBuyerPhone(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl py-2.5 pl-9 pr-3 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-500"
                />
              </div>
              <p className="text-[10px] text-neutral-500 mt-1">
                El repartidor usará este número para llamarte al llegar si no encuentra a nadie.
              </p>
            </div>

            <button
              type="submit"
              className="w-full py-3 px-4 bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-neutral-950 font-black text-sm rounded-xl shadow-lg shadow-emerald-500/20 active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-2 mt-2"
            >
              <span>Entrar a la Tienda</span>
              <CheckCircle2 className="w-4 h-4" />
            </button>
          </form>
        )}

        {/* 2. REPARTIDOR / DELIVERY FORM: Usuario y Contraseña creados por admin */}
        {selectedRole === 'delivery' && (
          <form onSubmit={handleDriverSubmit} className="mt-5 space-y-4">
            <div className="p-3 bg-cyan-950/20 border border-cyan-500/20 rounded-2xl text-[11px] text-cyan-300">
              🛵 <strong>Acceso del Repartidor:</strong> Usa el usuario y contraseña asignados por el
              administrador de la tienda.
            </div>

            <div>
              <label className="block text-xs font-bold text-neutral-300 mb-1">
                Usuario de Repartidor *
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  placeholder="Ej: motorista1"
                  value={driverUsername}
                  onChange={(e) => setDriverUsername(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl py-2.5 pl-9 pr-3 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-neutral-300 mb-1">Contraseña *</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={driverPassword}
                  onChange={(e) => setDriverPassword(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl py-2.5 pl-9 pr-3 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 px-4 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-neutral-950 font-black text-sm rounded-xl shadow-lg shadow-cyan-500/20 active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-2 mt-2 disabled:opacity-50"
            >
              <span>{isLoading ? 'Verificando credenciales...' : 'Ingresar al Panel de Delivery'}</span>
              <Bike className="w-4 h-4" />
            </button>
          </form>
        )}

        {/* 3. ADMINISTRADOR FORM: Correo y Contraseña (Solo Login Autorizado) */}
        {selectedRole === 'admin' && (
          <form onSubmit={handleAdminSubmit} className="mt-5 space-y-4">

            <div>
              <label className="block text-xs font-bold text-neutral-300 mb-1">
                Correo Electrónico *
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  placeholder="noadiasclaribel.y2k@icloud.com"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl py-2.5 pl-9 pr-3 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-violet-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-neutral-300 mb-1">Contraseña *</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl py-2.5 pl-9 pr-3 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-violet-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 px-4 bg-violet-600 hover:bg-violet-500 text-white font-black text-sm rounded-xl shadow-lg shadow-violet-600/30 active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-2 mt-2 disabled:opacity-50"
            >
              <span>
                {isLoading
                  ? 'Autenticando...'
                  : adminMode === 'login'
                  ? 'Acceder al Panel de Control'
                  : 'Registrar Administrador'}
              </span>
              <Shield className="w-4 h-4" />
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
