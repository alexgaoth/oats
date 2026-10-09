import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "./ui/button";
import { FolderOpen, Copy, Check } from "lucide-react";
import { useToast } from "./ui/useToast";
import { Toggle } from "./ui/toggle";
import logger from "../utils/logger";

export default function DeveloperSection() {
  const { t } = useTranslation();
  const [debugEnabled, setDebugEnabled] = useState(false);
  const [logPath, setLogPath] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isToggling, setIsToggling] = useState(false);
  const [copiedPath, setCopiedPath] = useState(false);
  const { toast } = useToast();

  const loadDebugState = useCallback(async () => {
    try {
      setIsLoading(true);
      const state = await window.electronAPI.getDebugState();
      setDebugEnabled(state.enabled);
      setLogPath(state.logPath);
    } catch (error) {
      logger.error("Failed to load debug state", { error }, "developer");
      toast({
        title: t("developerSection.toasts.loadFailed.title"),
        description: t("developerSection.toasts.loadFailed.description"),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [t, toast]);

  useEffect(() => {
    loadDebugState();
  }, [loadDebugState]);

  const handleToggleDebug = async () => {
    if (isToggling) return;

    try {
      setIsToggling(true);
      const newState = !debugEnabled;
      const result = await window.electronAPI.setDebugLogging(newState);

      if (!result.success) {
        throw new Error(result.error || "Failed to update debug logging");
      }

      setDebugEnabled(newState);
      await loadDebugState();

      toast({
        title: newState
          ? t("developerSection.toasts.debugEnabled.title")
          : t("developerSection.toasts.debugDisabled.title"),
        description: newState
          ? t("developerSection.toasts.debugEnabled.description")
          : t("developerSection.toasts.debugDisabled.description"),
        variant: "success",
      });
    } catch (error) {
      toast({
        title: t("developerSection.toasts.updateFailed.title"),
        description: t("developerSection.toasts.updateFailed.description"),
        variant: "destructive",
      });
    } finally {
      setIsToggling(false);
    }
  };

  const handleOpenLogsFolder = async () => {
    try {
      const result = await window.electronAPI.openLogsFolder();
      if (!result.success) {
        throw new Error(result.error || "Failed to open folder");
      }
    } catch (error) {
      toast({
        title: t("developerSection.toasts.openLogsFailed.title"),
        description: t("developerSection.toasts.openLogsFailed.description"),
        variant: "destructive",
      });
    }
  };

  const handleCopyPath = async () => {
    if (!logPath) return;

    try {
      await navigator.clipboard.writeText(logPath);
      setCopiedPath(true);
      toast({
        title: t("developerSection.toasts.copied.title"),
        description: t("developerSection.toasts.copied.description"),
        variant: "success",
        duration: 2000,
      });
      setTimeout(() => setCopiedPath(false), 2000);
    } catch (error) {
      toast({
        title: t("developerSection.toasts.copyFailed.title"),
        description: t("developerSection.toasts.copyFailed.description"),
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-3">
      <div className="px-1">
        <h3 className="text-sm font-semibold text-foreground">{t("developerSection.title")}</h3>
        <p className="mt-0.5 text-[13px] leading-5 text-muted-foreground">
          {t("developerSection.description")}
        </p>
      </div>

      {/* Debug Toggle */}
      <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-xs">
        <div className="px-5 py-4">
          <div className="flex items-center justify-between gap-6">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-foreground">
                  {t("developerSection.debugMode.label")}
                </p>
                <div
                  className={`h-1.5 w-1.5 rounded-full transition-colors ${
                    debugEnabled ? "bg-success" : "bg-muted-foreground/30"
                  }`}
                />
              </div>
              <p className="mt-0.5 text-[13px] leading-5 text-muted-foreground">
                {debugEnabled
                  ? t("developerSection.debugMode.enabledDescription")
                  : t("developerSection.debugMode.disabledDescription")}
              </p>
            </div>
            <div className="shrink-0">
              <Toggle
                checked={debugEnabled}
                onChange={handleToggleDebug}
                disabled={isLoading || isToggling}
              />
            </div>
          </div>
        </div>

        {/* Log Path — only when active */}
        {debugEnabled && logPath && (
          <div className="px-5 py-4">
            <p className="mb-2 text-[13px] font-medium text-muted-foreground">
              {t("developerSection.currentLogFile")}
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs text-muted-foreground font-mono break-all leading-relaxed rounded-md border border-border bg-muted/40 px-3 py-2">
                {logPath}
              </code>
              <Button
                onClick={handleCopyPath}
                variant="ghost"
                size="sm"
                className="shrink-0 h-8 w-8 p-0"
              >
                {copiedPath ? (
                  <Check className="h-3.5 w-3.5 text-success" />
                ) : (
                  <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="px-5 py-4">
          <Button onClick={handleOpenLogsFolder} variant="outline" size="sm">
            <FolderOpen aria-hidden="true" />
            {t("developerSection.openLogsFolder")}
          </Button>
        </div>
      </div>

      {/* Performance note — conditional */}
      {debugEnabled && (
        <div className="rounded-lg border border-warning/25 bg-warning/5">
          <div className="px-4 py-3">
            <p className="text-[13px] leading-5 text-muted-foreground">
              <span className="font-medium text-warning">
                {t("developerSection.performanceNote.label")}
              </span>{" "}
              {t("developerSection.performanceNote.description")}
            </p>
          </div>
        </div>
      )}

      {/* Sharing instructions — conditional */}
      {debugEnabled && (
        <div>
          <div className="mb-3 px-1">
            <h3 className="text-sm font-semibold text-foreground">
              {t("developerSection.sharing.title")}
            </h3>
          </div>
          <div className="rounded-xl border border-border bg-card shadow-xs">
            <div className="px-5 py-4">
              <div className="space-y-2">
                {[
                  t("developerSection.sharing.steps.0"),
                  t("developerSection.sharing.steps.1"),
                  t("developerSection.sharing.steps.2"),
                ].map((step, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <span className="mt-px w-4 shrink-0 text-right text-[13px] tabular-nums text-muted-foreground">
                      {i + 1}
                    </span>
                    <p className="text-[13px] leading-5 text-muted-foreground">{step}</p>
                  </div>
                ))}
              </div>
              <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
                {t("developerSection.sharing.footer")}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
