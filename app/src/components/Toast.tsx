import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from 'react';
import { AlertTriangle, CheckCircle, Info, X } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Toast {
  id: string;
  message: string;
  type: 'error' | 'warning' | 'info' | 'success';
  duration?: number;
  action?: ReactNode;
}

interface ToastContextValue {
  addToast: (toast: Omit<Toast, 'id'>) => string;
  removeToast: (id: string) => void;
}

// ---------------------------------------------------------------------------
// Default durations per type (ms)
// ---------------------------------------------------------------------------

const DEFAULT_DURATIONS: Record<Toast['type'], number> = {
  error: 5000,
  warning: 4000,
  info: 3000,
  success: 3000,
};

// ---------------------------------------------------------------------------
// Accent styles per type
// ---------------------------------------------------------------------------

const ACCENT_STYLES: Record<Toast['type'], { border: string; text: string }> = {
  error:   { border: 'border-[#e0abab]/30',  text: 'text-[#e0abab]'  },
  warning: { border: 'border-[#dfc797]/30',  text: 'text-[#dfc797]'  },
  info:    { border: 'border-[#afc4ff]/30',  text: 'text-[#afc4ff]'  },
  success: { border: 'border-[#b5dec2]/30',  text: 'text-[#b5dec2]'  },
};

// ---------------------------------------------------------------------------
// Icons per type
// ---------------------------------------------------------------------------

function ToastIcon({ type }: { type: Toast['type'] }) {
  const cls = `h-5 w-5 shrink-0 ${ACCENT_STYLES[type].text}`;
  switch (type) {
    case 'error':
      return <AlertTriangle className={cls} />;
    case 'warning':
      return <AlertTriangle className={cls} />;
    case 'success':
      return <CheckCircle className={cls} />;
    case 'info':
      return <Info className={cls} />;
  }
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

// ---------------------------------------------------------------------------
// Max visible toasts
// ---------------------------------------------------------------------------

const MAX_VISIBLE = 3;

// ---------------------------------------------------------------------------
// Single toast item
// ---------------------------------------------------------------------------

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: (id: string) => void;
}) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const slideOutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const accent = ACCENT_STYLES[toast.type];
  const duration = toast.duration ?? DEFAULT_DURATIONS[toast.type];

  // Cleanup all timers on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (slideOutRef.current) clearTimeout(slideOutRef.current);
    };
  }, []);

  // Slide-in on mount
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setVisible(true);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  // Auto-dismiss timer
  useEffect(() => {
    timerRef.current = setTimeout(() => {
      setVisible(false);
      slideOutRef.current = setTimeout(() => onDismiss(toast.id), 300);
    }, duration);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [duration, onDismiss, toast.id]);

  const handleDismiss = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setVisible(false);
    slideOutRef.current = setTimeout(() => onDismiss(toast.id), 300);
  }, [onDismiss, toast.id]);

  return (
    <div
      className={[
        // Layout
        'pointer-events-auto flex w-80 items-start gap-3 rounded-xl border px-4 py-3 shadow-lg',
        // Glass morphism
        'bg-[#0d1117]/95 backdrop-blur-xl',
        'border-white/[0.1]',
        // Left color accent
        accent.border,
        // Slide-in / slide-out transition
        'transition-all duration-300 ease-out',
        visible
          ? 'translate-x-0 opacity-100'
          : 'translate-x-full opacity-0',
      ].join(' ')}
      role={toast.type === 'error' ? 'alert' : 'status'}
    >
      <ToastIcon type={toast.type} />

      <div className="flex-1 min-w-0">
        <p className={`text-sm leading-snug ${accent.text}`}>{toast.message}</p>
        {toast.action && <div className="mt-2">{toast.action}</div>}
      </div>

      <button
        type="button"
        onClick={handleDismiss}
        className="shrink-0 rounded p-0.5 text-white/40 transition-colors hover:text-white/70"
        aria-label="Dismiss notification"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const generateId = useCallback((): string => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }, []);

  const addToast = useCallback(
    (toast: Omit<Toast, 'id'>): string => {
      const id = generateId();
      setToasts((prev) => {
        const next = [...prev, { ...toast, id }];
        // Keep only the newest MAX_VISIBLE toasts
        if (next.length > MAX_VISIBLE) {
          return next.slice(next.length - MAX_VISIBLE);
        }
        return next;
      });
      return id;
    },
    [generateId],
  );

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ addToast, removeToast }}>
      {children}

      {/* Toast container */}
      <div
        role="status"
        aria-live="polite"
        className={[
          'fixed bottom-4 z-50 flex flex-col gap-2 pointer-events-none',
          // Centered on mobile, right-aligned on sm+
          'right-1/2 translate-x-1/2 sm:right-4 sm:translate-x-0',
        ].join(' ')}
      >
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={removeToast} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}
