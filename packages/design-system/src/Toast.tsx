import React, { createContext, useContext, useState, useCallback } from 'react';
import { cn } from './utils';

export interface ToastItem {
  id: string;
  title: string;
  description?: string;
  type?: 'success' | 'error' | 'warning' | 'info';
  durationMs?: number;
}

interface ToastContextValue {
  toasts: ToastItem[];
  addToast: (toast: Omit<ToastItem, 'id'>) => string;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let globalToastHandler: ((toast: Omit<ToastItem, 'id'>) => string) | null = null;

export const toast = {
  success: (title: string, description?: string) =>
    globalToastHandler?.({ title, description, type: 'success' }),
  error: (title: string, description?: string) =>
    globalToastHandler?.({ title, description, type: 'error' }),
  warning: (title: string, description?: string) =>
    globalToastHandler?.({ title, description, type: 'warning' }),
  info: (title: string, description?: string) =>
    globalToastHandler?.({ title, description, type: 'info' }),
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (item: Omit<ToastItem, 'id'>) => {
      const id = Math.random().toString(36).slice(2, 9);
      const newToast: ToastItem = { ...item, id };
      setToasts((prev) => [...prev, newToast]);

      const duration = item.durationMs || 4000;
      setTimeout(() => {
        removeToast(id);
      }, duration);

      return id;
    },
    [removeToast]
  );

  globalToastHandler = addToast;

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              'pointer-events-auto rounded-xl border p-4 shadow-xl transition-all duration-200 animate-in slide-in-from-bottom-5',
              t.type === 'success' && 'bg-white border-emerald-300 text-emerald-950 dark:bg-slate-900 dark:border-emerald-700 dark:text-emerald-100',
              t.type === 'error' && 'bg-white border-red-300 text-red-950 dark:bg-slate-900 dark:border-red-700 dark:text-red-100',
              t.type === 'warning' && 'bg-white border-amber-300 text-amber-950 dark:bg-slate-900 dark:border-amber-700 dark:text-amber-100',
              (!t.type || t.type === 'info') && 'bg-white border-slate-200 text-slate-900 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-100'
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="text-xs font-semibold leading-tight">{t.title}</p>
                {t.description && (
                  <p className="text-xs text-slate-500 dark:text-slate-400">{t.description}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => removeToast(t.id)}
                className="rounded p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    return {
      toasts: [],
      addToast: () => '',
      removeToast: () => {},
      toast,
    };
  }
  return { ...context, toast };
}
