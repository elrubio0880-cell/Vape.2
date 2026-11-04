import React, { useState, useEffect } from 'react';
import { UserAccount } from '../../types';
import { getStoredUsers, createDriverByAdmin, deleteDriver } from '../../utils/auth';
import { playNotificationSound } from '../../utils/storage';
import { Bike, Plus, User, Phone, Lock, Trash2, CheckCircle2, AlertCircle } from 'lucide-react';

export const DriverManagement: React.FC = () => {
  const [users, setUsers] = useState<UserAccount[]>(getStoredUsers);
  const [isAdding, setIsAdding] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Form fields
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let mounted = true;
    import('../../utils/auth').then(({ fetchDriversList }) => {
      fetchDriversList().then((list) => {
        if (mounted && Array.isArray(list)) {
          setUsers(list);
        }
      });
    });
    return () => {
      mounted = false;
    };
  }, []);

  const drivers = users.filter((u) => u.role === 'delivery');

  const handleCreateDriver = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim() || !username.trim() || !password.trim()) {
      setMessage({ text: 'Todos los campos son obligatorios.', type: 'error' });
      return;
    }

    if (password.trim().length < 6) {
      setMessage({ text: 'La contraseña debe tener al menos 6 caracteres.', type: 'error' });
      return;
    }

    setIsSubmitting(true);
    setMessage(null);

    const res = await createDriverByAdmin({
      name: name.trim(),
      phone: phone.trim(),
      username: username.trim(),
      password: password.trim(),
    });

    setIsSubmitting(false);

    if (!res.success) {
      setMessage({ text: res.error || 'Error al crear repartidor.', type: 'error' });
      return;
    }

    setMessage({ text: `¡Repartidor ${name} creado con éxito en Supabase! Ya puede iniciar sesión con su usuario y contraseña.`, type: 'success' });
    playNotificationSound('success');
    const { fetchDriversList } = await import('../../utils/auth');
    const updatedList = await fetchDriversList();
    setUsers(updatedList);
    setName('');
    setPhone('');
    setUsername('');
    setPassword('');
    setIsAdding(false);
  };

  const handleDeleteDriver = async (driverId: string, driverName: string) => {
    if (confirm(`¿Seguro que deseas eliminar o deshabilitar el usuario de delivery de ${driverName}?`)) {
      await deleteDriver(driverId);
      const { fetchDriversList } = await import('../../utils/auth');
      const updatedList = await fetchDriversList();
      setUsers(updatedList);
      setMessage({ text: `Repartidor ${driverName} deshabilitado en Supabase.`, type: 'success' });
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-5 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-neutral-800">
          <div>
            <div className="flex items-center gap-2 text-cyan-400 text-xs font-bold uppercase tracking-wider mb-1">
              <Bike className="w-4 h-4" />
              <span>Gestión de Flota & Repartidores</span>
            </div>
            <h3 className="text-lg font-black text-white">
              Crear y Administrar Usuarios de Delivery
            </h3>
            <p className="text-xs text-neutral-400 mt-1">
              Como administrador, puedes registrar a tus repartidores asignándoles un nombre de usuario y
              contraseña para que inicien sesión en el módulo de repartos.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setIsAdding(!isAdding)}
            className="py-2.5 px-4 bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-cyan-600/20 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>{isAdding ? 'Cerrar Formulario' : 'Crear Nuevo Repartidor'}</span>
          </button>
        </div>

        {message && (
          <div
            className={`mt-4 p-3 rounded-xl border text-xs flex items-center gap-2 ${
              message.type === 'success'
                ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
                : 'bg-red-950/60 border-red-500/40 text-red-300'
            }`}
          >
            {message.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            )}
            <span>{message.text}</span>
          </div>
        )}

        {/* Create Driver Form */}
        {isAdding && (
          <form onSubmit={handleCreateDriver} className="mt-5 p-5 bg-neutral-950 rounded-2xl border border-neutral-800 space-y-4">
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <Plus className="w-4 h-4 text-cyan-400" />
              <span>Registrar Nuevo Repartidor</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-neutral-300 mb-1">
                  Nombre Completo del Repartidor *
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    placeholder="Ej: Luis Moto Express"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-xl py-2 pl-9 pr-3 text-xs text-white focus:outline-none focus:border-cyan-500"
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
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-xl py-2 pl-9 pr-3 text-xs text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-300 mb-1">
                  Nombre de Usuario (Para Login) *
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    placeholder="Ej: luis_delivery"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-xl py-2 pl-9 pr-3 text-xs text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-300 mb-1">
                  Contraseña Asignada *
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-xl py-2 pl-9 pr-3 text-xs text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsAdding(false)}
                className="py-2 px-4 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-white text-xs font-bold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="py-2 px-5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold shadow-lg shadow-cyan-600/30 cursor-pointer"
              >
                Crear Repartidor
              </button>
            </div>
          </form>
        )}

        {/* Drivers List */}
        <div className="mt-5 space-y-3">
          <h4 className="text-xs font-bold text-neutral-400 uppercase tracking-wider">
            Repartidores Registrados ({drivers.length})
          </h4>

          {drivers.length === 0 ? (
            <div className="p-8 rounded-2xl bg-neutral-950 border border-neutral-800 text-center space-y-2">
              <Bike className="w-8 h-8 text-cyan-400/60 mx-auto" />
              <p className="text-xs font-bold text-neutral-200">No hay repartidores registrados todavía</p>
              <p className="text-[11px] text-neutral-400 max-w-md mx-auto">
                Pulsa en &quot;Crear Nuevo Repartidor&quot; arriba para asignarle usuario y contraseña a tu motorizado de Loma de Cabrera.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {drivers.map((driver) => (
                <div
                  key={driver.id}
                  className="p-4 rounded-2xl bg-neutral-950 border border-neutral-800 flex items-center justify-between gap-3 hover:border-neutral-700/80 transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center font-bold text-lg">
                      🛵
                    </div>
                    <div>
                      <h5 className="font-bold text-sm text-white">{driver.name}</h5>
                      <div className="text-xs text-neutral-400 flex items-center gap-2 mt-0.5">
                        <span>Usuario: <strong className="text-cyan-400">@{driver.username}</strong></span>
                        <span>•</span>
                        <span>Tel: {driver.phone}</span>
                      </div>
                      <span className="text-[10px] text-emerald-400 inline-flex items-center gap-1 mt-1 font-semibold">
                        ● Activo para entregas
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleDeleteDriver(driver.id, driver.name)}
                    className="p-2 rounded-xl bg-neutral-900 hover:bg-red-950 text-neutral-400 hover:text-red-300 text-xs transition-colors cursor-pointer"
                    title="Eliminar repartidor"
                    aria-label="Eliminar repartidor"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
