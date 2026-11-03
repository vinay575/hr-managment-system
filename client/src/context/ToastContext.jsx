import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import clsx from 'clsx';

const ToastContext = createContext(null);

const ICONS = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
};

const STYLES = {
  success: 'text-emerald-600 bg-emerald-50',
  error: 'text-rose-600 bg-rose-50',
  info: 'text-brand-600 bg-brand-50',
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (message, type = 'success', title) => {
      const id = ++idRef.current;
      setToasts((prev) => [...prev.slice(-3), { id, message, type, title }]);
      setTimeout(() => dismiss(id), 3800);
    },
    [dismiss]
  );

  const toast = useMemo(
    () => ({
      success: (msg, title) => push(msg, 'success', title),
      error: (msg, title) => push(msg, 'error', title),
      info: (msg, title) => push(msg, 'info', title),
    }),
    [push]
  );

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-[100] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2.5">
        {toasts.map((t) => {
          const Icon = ICONS[t.type] || Info;
          return (
            <div
              key={t.id}
              className="pointer-events-auto flex animate-fade-up items-start gap-3 rounded-2xl border border-slate-200/70 bg-white p-3.5 shadow-lg shadow-slate-900/5"
            >
              <div className={clsx('grid h-9 w-9 shrink-0 place-items-center rounded-xl', STYLES[t.type])}>
                <Icon size={18} />
              </div>
              <div className="min-w-0 flex-1 pt-0.5">
                {t.title && <p className="text-[13px] font-bold text-ink-900">{t.title}</p>}
                <p className="text-[13px] leading-snug text-slate-600">{t.message}</p>
              </div>
              <button onClick={() => dismiss(t.id)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-ink-700" aria-label="Dismiss">
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}
