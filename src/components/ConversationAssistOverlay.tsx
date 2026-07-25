import { useCallback, useEffect, useState } from "react";
import { Search, X } from "lucide-react";

interface AssistData {
  eventId: number;
  question: string;
  query: string;
}

export default function ConversationAssistOverlay() {
  const [data, setData] = useState<AssistData | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let received = false;
    const show = (value: AssistData | null) => {
      if (!value || received) return;
      received = true;
      setData(value);
      requestAnimationFrame(() => setVisible(true));
    };
    const cleanup = window.electronAPI?.onConversationAssistData?.(show);
    window.electronAPI?.getConversationAssistData?.().then(show);
    window.electronAPI?.conversationAssistReady?.();
    return () => cleanup?.();
  }, []);

  useEffect(() => {
    if (!data) return;
    const timer = window.setTimeout(() => {
      setVisible(false);
      window.electronAPI?.conversationAssistAction?.("expire");
    }, 30000);
    return () => window.clearTimeout(timer);
  }, [data]);

  const act = useCallback(async (action: "open" | "dismiss") => {
    setVisible(false);
    await new Promise((resolve) => window.setTimeout(resolve, 160));
    await window.electronAPI?.conversationAssistAction?.(action);
  }, []);

  return (
    <div
      className="w-full h-full bg-transparent p-3"
      onMouseEnter={() => window.electronAPI?.setConversationAssistInteractivity?.(true)}
      onMouseLeave={() => window.electronAPI?.setConversationAssistInteractivity?.(false)}
    >
      <div
        className={`h-full rounded-xl border border-border bg-surface-raised p-3 shadow-lg transition-all [transition-duration:var(--motion-base)] ${
          visible ? "translate-x-0 opacity-100" : "translate-x-[110%] opacity-0"
        }`}
      >
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-lg bg-primary/10 p-2 text-primary">
            <Search size={15} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">A question is still open</p>
            <p className="mt-0.5 line-clamp-2 font-mono text-sm text-foreground">
              {data?.question}
            </p>
            <button
              type="button"
              onClick={() => act("open")}
              className="mt-2 rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Search
            </button>
          </div>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => act("dismiss")}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
