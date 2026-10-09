import * as React from "react";
import { AlertCircle, Check, CheckCircle2, Copy, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../lib/utils";
import { ToastContext, type ToastProps } from "./useToast";
import { isDictationPanelWindow } from "../../utils/windowContext";

interface ToastState extends ToastProps {
  id: string;
  isExiting?: boolean;
  createdAt: number;
}

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = React.useState<ToastState[]>([]);
  const timersRef = React.useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const clearTimer = React.useCallback((id: string) => {
    const timer = timersRef.current[id];
    if (timer) {
      clearTimeout(timer);
      delete timersRef.current[id];
    }
  }, []);

  const startExitAnimation = React.useCallback((id: string) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, isExiting: true } : t)));
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 200);
  }, []);

  const toast = React.useCallback(
    (props: Omit<ToastProps, "id">): string => {
      const id = Math.random().toString(36).substring(2, 11);
      const newToast: ToastState = { ...props, id, createdAt: Date.now() };

      // Bounded. The dictation panel is a 96px overlay whose window is resized
      // to hold the stack, so an uncapped stack is both an unreadable pile and
      // a growing interactive rectangle over the user's desktop. Three is what
      // WINDOW_SIZES.WITH_TOAST is measured to fit (324x302); the oldest goes.
      setToasts((prev) => [...prev, newToast].slice(-MAX_VISIBLE_TOASTS));

      const duration = props.duration ?? (props.variant === "destructive" ? 6000 : 3500);
      if (duration > 0) {
        const timer = setTimeout(() => {
          startExitAnimation(id);
        }, duration);
        timersRef.current[id] = timer;
      }

      return id;
    },
    [startExitAnimation]
  );

  const dismiss = React.useCallback(
    (id?: string) => {
      if (id) {
        clearTimer(id);
        startExitAnimation(id);
      } else {
        const lastToast = toasts[toasts.length - 1];
        if (lastToast) {
          clearTimer(lastToast.id);
          startExitAnimation(lastToast.id);
        }
      }
    },
    [toasts, clearTimer, startExitAnimation]
  );

  const pauseTimer = React.useCallback(
    (id: string) => {
      clearTimer(id);
    },
    [clearTimer]
  );

  const resumeTimer = React.useCallback(
    (id: string, remainingTime: number) => {
      if (remainingTime > 0) {
        const timer = setTimeout(() => {
          startExitAnimation(id);
        }, remainingTime);
        timersRef.current[id] = timer;
      }
    },
    [startExitAnimation]
  );

  React.useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const id in timers) {
        clearTimeout(timers[id]);
      }
    };
  }, []);

  return (
    <ToastContext.Provider value={{ toast, dismiss, toastCount: toasts.length }}>
      {children}
      <ToastViewport
        toasts={toasts}
        onDismiss={dismiss}
        onPauseTimer={pauseTimer}
        onResumeTimer={resumeTimer}
      />
    </ToastContext.Provider>
  );
};

/** Kept in step with `WINDOW_SIZES.WITH_TOAST` in `windowConfig.js`. */
const MAX_VISIBLE_TOASTS = 3;

const ToastViewport: React.FC<{
  toasts: ToastState[];
  onDismiss: (id: string) => void;
  onPauseTimer: (id: string) => void;
  onResumeTimer: (id: string, remainingTime: number) => void;
}> = ({ toasts, onDismiss, onPauseTimer, onResumeTimer }) => {
  const isDictationPanel = React.useMemo(isDictationPanelWindow, []);

  if (toasts.length === 0) return null;

  return (
    <div
      className={cn(
        "fixed z-[100] flex flex-col gap-1.5 pointer-events-none",
        isDictationPanel ? "bottom-20 right-6" : "bottom-5 right-5"
      )}
    >
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          {...toast}
          onClose={() => onDismiss(toast.id)}
          onPauseTimer={() => onPauseTimer(toast.id)}
          onResumeTimer={(remaining) => onResumeTimer(toast.id, remaining)}
        />
      ))}
    </div>
  );
};

// Status is an icon, as in every standard toast; the default toast has none.
const variantIcon = {
  default: null,
  destructive: (
    <AlertCircle aria-hidden="true" className="mt-px size-4 shrink-0 text-destructive" />
  ),
  success: <CheckCircle2 aria-hidden="true" className="mt-px size-4 shrink-0 text-success" />,
};

const Toast: React.FC<
  ToastState & {
    onClose?: () => void;
    onPauseTimer: () => void;
    onResumeTimer: (remaining: number) => void;
  }
> = ({
  title,
  description,
  action,
  variant = "default",
  duration = 3500,
  isExiting,
  createdAt,
  onClose,
  onPauseTimer,
  onResumeTimer,
}) => {
  const { t } = useTranslation();
  const icon = variantIcon[variant];
  const pausedAtRef = React.useRef<number | null>(null);
  const [copied, setCopied] = React.useState(false);
  const isDestructive = variant === "destructive";

  const handleMouseEnter = () => {
    pausedAtRef.current = Date.now();
    onPauseTimer();
  };

  const handleMouseLeave = () => {
    if (pausedAtRef.current && duration > 0) {
      const elapsed = pausedAtRef.current - createdAt;
      const remaining = Math.max(duration - elapsed, 500);
      onResumeTimer(remaining);
    }
    pausedAtRef.current = null;
  };

  const handleCopyError = async () => {
    if (!description) return;
    try {
      await navigator.clipboard.writeText(description);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const message = title || description;
  const detail = title && description ? description : undefined;

  return (
    <div
      role={isDestructive ? "alert" : "status"}
      className={cn(
        "group pointer-events-auto relative flex w-[340px] items-start gap-3 rounded-xl border border-border bg-popover p-3.5 text-popover-foreground shadow-lg",
        "transition-[opacity,transform] duration-200 ease-out",
        isExiting
          ? "translate-y-1 scale-[0.98] opacity-0"
          : "animate-in fade-in-0 slide-in-from-bottom-2 opacity-100 duration-200 motion-reduce:animate-none"
      )}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {icon}
      <div className="min-w-0 flex-1">
        {message && <p className="text-sm font-medium leading-5 text-foreground">{message}</p>}
        {detail &&
          (isDestructive ? (
            // The error itself, as the machine said it: copyable, in mono.
            <div className="mt-1.5 flex items-start gap-1.5 rounded-md border border-border bg-muted/50 px-2 py-1.5">
              <span className="min-w-0 flex-1 select-all break-words font-mono text-xs leading-5 text-destructive">
                {detail}
              </span>
              <button
                type="button"
                onClick={handleCopyError}
                aria-label={t("common.copy")}
                className="mt-px shrink-0 rounded-sm p-0.5 text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                {copied ? (
                  <Check aria-hidden="true" className="size-3.5" />
                ) : (
                  <Copy aria-hidden="true" className="size-3.5" />
                )}
              </button>
            </div>
          ) : (
            <p className="mt-0.5 text-[13px] leading-5 text-muted-foreground">{detail}</p>
          ))}
        {action && <div className="mt-2.5">{action}</div>}
      </div>

      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label={t("common.close")}
          className={cn(
            "absolute -left-2 -top-2 flex size-6 items-center justify-center rounded-full border border-border bg-popover text-muted-foreground shadow-sm outline-none",
            "opacity-0 transition-opacity duration-150 hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-[3px] focus-visible:ring-ring/50"
          )}
        >
          <X aria-hidden="true" className="size-3" />
        </button>
      )}
    </div>
  );
};
