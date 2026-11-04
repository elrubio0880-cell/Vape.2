import React, { useEffect } from 'react';
import { Bell, CheckCircle, Info, X } from 'lucide-react';

export interface ToastMessage {
  id: string;
  title: string;
  description: string;
  type?: 'info' | 'success' | 'alert';
}

interface NotificationToastProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const NotificationToast: React.FC<NotificationToastProps> = ({
  toasts,
  onDismiss,
}) => {
  useEffect(() => {
    if (toasts.length === 0) return;
    const oldest = toasts[0];
    const timer = setTimeout(() => {
      onDismiss(oldest.id);
    }, 4500);
    return () => clearTimeout(timer);
  }, [toasts, onDismiss]);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-20 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto bg-neutral-900/95 border border-neutral-700/80 rounded-2xl p-4 shadow-2xl backdrop-blur-md flex items-start justify-between gap-3 animate-in slide-in-from-top-3 fade-in duration-200"
        >
          <div className="flex items-start gap-3">
            <div
              className={`p-2 rounded-xl shrink-0 ${
                t.type === 'success'
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : t.type === 'alert'
                  ? 'bg-amber-500/20 text-amber-400'
                  : 'bg-cyan-500/20 text-cyan-400'
              }`}
            >
              <Bell className="w-4 h-4" />
            </div>
            <div>
              <h5 className="font-bold text-xs text-white">{t.title}</h5>
              <p className="text-[11px] text-neutral-300 mt-0.5 leading-snug">{t.description}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onDismiss(t.id)}
            className="text-neutral-500 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
            aria-label="Cerrar notificación"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
};
