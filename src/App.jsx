import React, { useState, useEffect, useLayoutEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import "./index.css";
import { X } from "lucide-react";
import { useToast } from "./components/ui/useToast";
import { LoadingDots } from "./components/ui/LoadingDots";
import { useHotkey } from "./hooks/useHotkey";
import { formatHotkeyListLabel } from "./utils/hotkeys";
import { useWindowDrag } from "./hooks/useWindowDrag";
import { useAudioRecording } from "./hooks/useAudioRecording";
import { useSettingsStore } from "./stores/settingsStore";

// Tooltip Component
const Tooltip = ({ children, content, emoji, align = "center" }) => {
  const [isVisible, setIsVisible] = useState(false);
  // How far the tip has to move to stay inside the window. The oat's window is
  // 96px and every tooltip is anchored to a control inside it, so a tip
  // anchored near one edge — Hide sits 24px from the left — ran off the other
  // however it wrapped. Measured once per showing; the arrow moves back by the
  // same amount so it still points at its control.
  //
  // Upward it can only give back the gap above its control: a four-line tip
  // (French) otherwise lost its first line off the top of the window, and
  // sliding further would cover the control it describes.
  const tipRef = useRef(null);
  const [shift, setShift] = useState({ x: 0, y: 0 });
  useLayoutEffect(() => {
    if (!isVisible || !tipRef.current) {
      setShift((current) => (current.x || current.y ? { x: 0, y: 0 } : current));
      return;
    }
    const MARGIN = 4;
    const GAP_TO_GIVE = 6;
    const box = tipRef.current.getBoundingClientRect();
    const left = box.left - shift.x;
    const right = box.right - shift.x;
    const top = box.top - shift.y;
    let x = 0;
    if (right > window.innerWidth - MARGIN) x = window.innerWidth - MARGIN - right;
    if (left + x < MARGIN) x = MARGIN - left;
    const y = top < 0 ? Math.min(-top, GAP_TO_GIVE) : 0;
    if (x !== shift.x || y !== shift.y) setShift({ x, y });
  }, [isVisible, content, shift]);

  const alignClass =
    align === "right" ? "right-0" : align === "left" ? "left-0" : "left-1/2 -translate-x-1/2";

  const arrowClass =
    align === "right" ? "right-3" : align === "left" ? "left-3" : "left-1/2 -translate-x-1/2";

  return (
    <div className="relative inline-block">
      <div onMouseEnter={() => setIsVisible(true)} onMouseLeave={() => setIsVisible(false)}>
        {children}
      </div>
      {isVisible && (
        <div
          ref={tipRef}
          style={
            shift.x || shift.y ? { transform: `translate(${shift.x}px, ${shift.y}px)` } : undefined
          }
          // Wraps inside the window rather than running out of it. The window is
          // 96px and does not grow on hover, and `whitespace-nowrap` drew the
          // conversation tooltip 209px wide at `left: -117` — measured, more
          // than half of it outside the window and never painted (TODO.md).
          className={`absolute bottom-full ${alignClass} mb-2 w-max max-w-[88px] text-balance px-1.5 py-1 text-[10px] leading-tight text-popover-foreground bg-popover border border-border rounded-md z-10 shadow-lg transition-opacity duration-150`}
        >
          {emoji && <span className="mr-1">{emoji}</span>}
          {content}
          <div
            style={shift.x ? { transform: `translateX(${-shift.x}px)` } : undefined}
            className={`absolute top-full ${arrowClass} w-0 h-0 border-l-2 border-r-2 border-t-2 border-transparent border-t-popover`}
          ></div>
        </div>
      )}
    </div>
  );
};

export default function App() {
  const [isHovered, setIsHovered] = useState(false);
  const [isCommandMenuOpen, setIsCommandMenuOpen] = useState(false);
  const commandMenuRef = useRef(null);
  const buttonRef = useRef(null);
  const { toast, dismiss, toastCount } = useToast();
  const { t } = useTranslation();
  const { hotkey } = useHotkey();
  const { isDragging, handlePointerDown, handlePointerUp } = useWindowDrag();

  const [dragStartPos, setDragStartPos] = useState(null);
  const [hasDragged, setHasDragged] = useState(false);
  // A conversation can be started from any application with nothing on screen.
  // The oat is then the only thing that can say it is running — on GNOME often
  // the only thing at all, since there is no tray without an extension.
  const [conversation, setConversation] = useState({ recording: false, startedAt: null });
  const [conversationElapsed, setConversationElapsed] = useState("");
  // A beat of feedback after the clock is pressed to mark the moment.
  const [markFlash, setMarkFlash] = useState(false);
  useEffect(() => {
    if (!markFlash) return undefined;
    const timer = setTimeout(() => setMarkFlash(false), 1200);
    return () => clearTimeout(timer);
  }, [markFlash]);

  // Floating icon auto-hide setting (read from store, synced via IPC)
  const floatingIconAutoHide = useSettingsStore((s) => s.floatingIconAutoHide);
  const panelStartPosition = useSettingsStore((s) => s.panelStartPosition);
  const prevAutoHideRef = useRef(floatingIconAutoHide);

  const setWindowInteractivity = React.useCallback((shouldCapture) => {
    window.electronAPI?.setMainWindowInteractivity?.(shouldCapture);
  }, []);

  useEffect(() => {
    setWindowInteractivity(false);
    return () => setWindowInteractivity(false);
  }, [setWindowInteractivity]);

  useEffect(() => {
    const unsubscribeFallback = window.electronAPI?.onHotkeyFallbackUsed?.((data) => {
      toast({
        title: t("app.toasts.hotkeyChanged.title"),
        description: t("app.toasts.hotkeyChanged.description", {
          original: data.original,
          fallback: data.fallback,
        }),
        duration: 8000,
      });
    });

    const unsubscribeFailed = window.electronAPI?.onHotkeyRegistrationFailed?.((_data) => {
      toast({
        title: t("app.toasts.hotkeyUnavailable.title"),
        description: t("app.toasts.hotkeyUnavailable.description"),
        duration: 10000,
      });
    });

    const showGpuFallbackToast = () => {
      toast({
        title: t("app.toasts.gpuFallback.title"),
        description: t("app.toasts.gpuFallback.description"),
        duration: 10000,
      });
    };
    const unsubscribeCudaFallback =
      window.electronAPI?.onCudaFallbackNotification?.(showGpuFallbackToast);
    const unsubscribeGpuFallback =
      window.electronAPI?.onGpuFallbackNotification?.(showGpuFallbackToast);

    const unsubscribeCorrections = window.electronAPI?.onCorrectionsLearned?.((words) => {
      if (words && words.length > 0) {
        const wordList = words.map((w) => `\u201c${w}\u201d`).join(", ");
        let toastId;
        toastId = toast({
          title: t("app.toasts.addedToDict", { words: wordList }),
          variant: "success",
          duration: 6000,
          action: (
            <button
              onClick={async () => {
                try {
                  const result = await window.electronAPI?.undoLearnedCorrections?.(words);
                  if (result?.success) {
                    dismiss(toastId);
                  }
                } catch {
                  // silently fail — word stays in dictionary
                }
              }}
              className="text-[10px] font-medium px-2.5 py-1 rounded-sm whitespace-nowrap
                text-emerald-100/90 hover:text-white
                bg-emerald-500/15 hover:bg-emerald-500/25
                border border-emerald-400/20 hover:border-emerald-400/35
                transition-all duration-150"
            >
              {t("app.toasts.undo")}
            </button>
          ),
        });
      }
    });

    return () => {
      unsubscribeFallback?.();
      unsubscribeFailed?.();
      unsubscribeCudaFallback?.();
      unsubscribeGpuFallback?.();
      unsubscribeCorrections?.();
    };
  }, [toast, dismiss, t]);

  useEffect(() => {
    if (isCommandMenuOpen || toastCount > 0) {
      setWindowInteractivity(true);
    } else if (!isHovered) {
      setWindowInteractivity(false);
    }
  }, [isCommandMenuOpen, isHovered, toastCount, setWindowInteractivity]);

  useEffect(() => {
    const resizeWindow = () => {
      if (isCommandMenuOpen && toastCount > 0) {
        window.electronAPI?.resizeMainWindow?.("EXPANDED");
      } else if (isCommandMenuOpen) {
        window.electronAPI?.resizeMainWindow?.("WITH_MENU");
      } else if (toastCount > 0) {
        window.electronAPI?.resizeMainWindow?.("WITH_TOAST");
      } else {
        window.electronAPI?.resizeMainWindow?.("BASE");
      }
    };
    resizeWindow();
  }, [isCommandMenuOpen, toastCount]);

  const handleDictationToggle = React.useCallback(() => {
    setIsCommandMenuOpen(false);
    setWindowInteractivity(false);
  }, [setWindowInteractivity]);

  const { isRecording, isProcessing, toggleListening, cancelRecording, cancelProcessing } =
    useAudioRecording(toast, {
      onToggle: handleDictationToggle,
    });

  // The dragged position round-trips through the renderer: main reports where the
  // oat landed, we persist it, and we replay it on startup so the oat reopens
  // where the user left it rather than snapping back to a corner preset.
  useEffect(() => {
    try {
      const stored = localStorage.getItem("floatingOatPosition");
      if (stored) window.electronAPI?.notifyFloatingOatPositionRestored?.(JSON.parse(stored));
    } catch {
      // A corrupt value just means the corner preset wins this launch.
    }
    const unsubscribe = window.electronAPI?.onFloatingOatPositionChanged?.((position) => {
      try {
        localStorage.setItem("floatingOatPosition", JSON.stringify(position));
      } catch {
        // Storage full or unavailable — the oat still moved, it just will not
        // remember across restarts. Never worth breaking the drag over.
      }
    });
    return () => unsubscribe?.();
  }, []);

  useEffect(() => {
    const unsubscribe = window.electronAPI?.onConversationState?.((state) => {
      setConversation({
        recording: Boolean(state?.recording),
        startedAt: state?.startedAt ?? null,
      });
    });
    return () => unsubscribe?.();
  }, []);

  // Elapsed time, ticking once a second and only while there is something to
  // count. Minutes and seconds, in mono — machine state speaks in mono
  // (DESIGN.md §C3). Past the hour it is hours and minutes, written `1h05`:
  // unbounded minutes put `100:47` 50px wide into a 48px slot, where it lost
  // its first digit and read `00:47`, and `1:05` alone would read as a minute.
  useEffect(() => {
    if (!conversation.recording || !conversation.startedAt) {
      setConversationElapsed("");
      return undefined;
    }
    const tick = () => {
      const seconds = Math.max(0, Math.floor((Date.now() - conversation.startedAt) / 1000));
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor(seconds / 60) % 60;
      setConversationElapsed(
        hours
          ? `${hours}h${String(minutes).padStart(2, "0")}`
          : `${minutes}:${String(seconds % 60).padStart(2, "0")}`
      );
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [conversation.recording, conversation.startedAt]);

  // Sync auto-hide from main process — setState directly to avoid IPC echo
  useEffect(() => {
    const unsubscribe = window.electronAPI?.onFloatingIconAutoHideChanged?.((enabled) => {
      localStorage.setItem("floatingIconAutoHide", String(enabled));
      useSettingsStore.setState({ floatingIconAutoHide: enabled });
    });
    return () => unsubscribe?.();
  }, []);

  const isRecordingRef = useRef(isRecording);

  useLayoutEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  const isProcessingRef = useRef(isProcessing);

  useEffect(() => {
    isProcessingRef.current = isProcessing;
  }, [isProcessing]);

  // The cancel hotkey is the only way out of a dictation that does not require a
  // pointer: this window is created `focusable: false` (windowConfig.js), so it
  // never receives keyboard focus and fires no focus events at all — measured,
  // `document.hasFocus()` is false and a `focusin` listener sees zero events
  // even as `activeElement` moves. The on-screen cancel button is therefore
  // hover-only by construction. This handler used to fire only while recording,
  // so a transcription that hung — a failure this app watches for elsewhere —
  // had no escape except a mouse, even though `cancelProcessing` existed and the
  // hover UI already offered it.
  useEffect(() => {
    const unsubscribe = window.electronAPI?.onCancelHotkeyPressed?.(() => {
      if (isRecordingRef.current) cancelRecording();
      else if (isProcessingRef.current) cancelProcessing();
    });
    return () => unsubscribe?.();
  }, [cancelRecording, cancelProcessing]);

  // Auto-hide the floating icon when idle (setting enabled or dictation cycle completed)
  useEffect(() => {
    let hideTimeout;

    // Never while a conversation is running: hiding the only indicator that a
    // microphone is open is the one thing auto-hide must not do.
    if (
      floatingIconAutoHide &&
      !conversation.recording &&
      !isRecording &&
      !isProcessing &&
      toastCount === 0
    ) {
      // Delay briefly so processing can start after recording stops without a flash
      hideTimeout = setTimeout(() => {
        window.electronAPI?.hideWindow?.();
      }, 500);
    } else if (!floatingIconAutoHide && prevAutoHideRef.current) {
      window.electronAPI?.showDictationPanel?.();
    }

    prevAutoHideRef.current = floatingIconAutoHide;
    return () => clearTimeout(hideTimeout);
  }, [isRecording, isProcessing, floatingIconAutoHide, toastCount, conversation.recording]);

  const handleClose = () => {
    window.electronAPI.hideWindow();
  };

  useEffect(() => {
    if (!isCommandMenuOpen) {
      return;
    }

    const handleClickOutside = (event) => {
      if (
        commandMenuRef.current &&
        !commandMenuRef.current.contains(event.target) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target)
      ) {
        setIsCommandMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isCommandMenuOpen]);

  useEffect(() => {
    const handleKeyPress = (e) => {
      if (e.key === "Escape") {
        if (isCommandMenuOpen) {
          setIsCommandMenuOpen(false);
        } else {
          handleClose();
        }
      }
    };

    document.addEventListener("keydown", handleKeyPress);
    return () => document.removeEventListener("keydown", handleKeyPress);
  }, [isCommandMenuOpen]);

  // Determine current mic state
  const getMicState = () => {
    // A conversation outranks dictation here because it is the longer-lived and
    // less recoverable of the two: a dictation you forget costs a paste, a
    // conversation you forget costs a room's worth of privacy.
    if (conversation.recording) return "conversation";
    if (isRecording) return "recording";
    if (isProcessing) return "processing";
    if (isHovered && !isRecording && !isProcessing) return "hover";
    return "idle";
  };

  const micState = getMicState();

  const getMicButtonProps = () => {
    // DESIGN.md §9.1: "Idle = static gold seed". This window is always on top
    // and almost always idle, and an unconditional breath both claimed to be
    // listening when nothing was, and — Linux runs with GPU compositing
    // disabled, so every frame is read back on the CPU — cost about seven
    // points of a core forever, for a window 96px wide
    // (docs/performance-baseline.md). ListeningPulse hides the pseudo-element
    // the same way.
    //
    // `processing` breathes even though nothing is being heard. Motion is the
    // only positive sign this window has that work is happening: idle and
    // processing are otherwise one opacity step apart, and a local transcribe
    // can take seconds or fail outright. It is bounded by the transcription,
    // so it is not an idle cost — which is the whole of the argument above.
    const breathing =
      micState === "conversation" || micState === "recording" || micState === "processing";
    const baseClasses = `oats-listening-pulse${breathing ? "" : " before:hidden"} rounded-full w-10 h-10 flex items-center justify-center relative overflow-visible border border-border cursor-pointer bg-surface-raised`;

    switch (micState) {
      case "idle":
      case "hover":
        return {
          className: baseClasses,
          tooltip: formatHotkeyListLabel(hotkey),
          ariaLabel: t("app.mic.hotkeyToSpeak", { hotkey: formatHotkeyListLabel(hotkey) }),
        };
      case "conversation":
        return {
          // A full-strength gold rim, which nothing else on this window uses:
          // the difference between "listening" and "not listening" has to be
          // legible at 40px from across a desk.
          className: `${baseClasses} border-2 border-primary`,
          // What the press does, in the words the Conversation surface's own
          // stop control uses. The rim and the clock already say a conversation
          // is running; the sentence that said so too was 209px in a 96px
          // window and could not be read in any of the ten languages.
          tooltip: t("oats.conversation.finish"),
        };
      case "recording":
        return {
          className: `${baseClasses} border-primary`,
          tooltip: t("app.mic.recording"),
          // The visible tooltip is a status; the accessible name has to be what
          // pressing does. "Recording…, button" reads as *start* recording to
          // somebody who cannot see the gold rim, and pressing it ends a
          // dictation. `app.mic.conversation` already names its action.
          ariaLabel: t("app.mic.recordingStop"),
        };
      case "processing":
        return {
          className: `${baseClasses} opacity-60 cursor-not-allowed`,
          tooltip: t("app.mic.processing"),
          // `toggleListening` is a no-op while transcribing, and the cursor
          // says so to a mouse. Nothing said so to a screen reader.
          disabled: true,
        };
      default:
        return {
          className: baseClasses,
          style: { transform: "scale(0.8)" },
          tooltip: t("app.mic.clickToSpeak"),
        };
    }
  };

  const micProps = getMicButtonProps();

  return (
    <div className="dictation-window">
      {/* Voice button - position determined by panelStartPosition setting */}
      <div
        className={`fixed bottom-1 z-50 ${
          panelStartPosition === "bottom-left"
            ? "left-1"
            : panelStartPosition === "center"
              ? "left-1/2 -translate-x-1/2"
              : "right-1"
        }`}
      >
        <div
          className="relative flex items-center gap-2"
          onMouseEnter={() => {
            setIsHovered(true);
            setWindowInteractivity(true);
          }}
          onMouseLeave={() => {
            setIsHovered(false);
            if (!isCommandMenuOpen) {
              setWindowInteractivity(false);
            }
          }}
          // Focus is handled for the whole cluster rather than per button, so
          // that moving focus *to* Cancel cannot destroy it: it is mounted only
          // while `isHovered`, and the mic used to clear that on its own blur.
          // This is currently inert — the window is `focusable: false`, so no
          // focus event fires here at all (measured) — but the per-button
          // version was a trap for whoever makes it focusable, and this costs
          // the same two handlers. The escape that works today is the cancel
          // hotkey, above.
          onFocus={() => {
            setIsHovered(true);
            setWindowInteractivity(true);
          }}
          onBlur={(event) => {
            if (event.currentTarget.contains(event.relatedTarget)) return;
            setIsHovered(false);
            if (!isCommandMenuOpen) {
              setWindowInteractivity(false);
            }
          }}
        >
          {/* The running clock. It is the difference between "Oats is open" and
              "Oats is listening right now", and it is the reason this window
              refuses to auto-hide while a conversation is running. */}
          {/* Pressing it marks the moment — a mark is a time, and this is the
              time. It is the only way to mark while the panel is hidden, which
              the global shortcut makes the normal way to record. The caret it
              shows for a beat is the one the mark leaves on the contour. */}
          {conversation.recording && conversationElapsed && (
            <Tooltip content={t("oats.conversation.markLabel")} align="left">
              <button
                type="button"
                aria-label={t("oats.conversation.markLabel")}
                onClick={(e) => {
                  e.stopPropagation();
                  void window.electronAPI?.requestMarkMoment?.();
                  setMarkFlash(true);
                }}
                className="relative inline-flex items-center rounded-full border border-primary/40 bg-surface-2/90 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-foreground shadow-sm backdrop-blur-sm transition-colors duration-150 hover:border-primary"
              >
                {/* For a beat the caret takes the time's place. The time stays
                    in the layout, invisible, so the pill does not grow: it has
                    48px of a 96px window and a caret beside the time measured
                    6px past the window's edge. */}
                <span className={markFlash ? "invisible" : undefined}>{conversationElapsed}</span>
                {markFlash && (
                  <svg
                    aria-hidden="true"
                    width="7"
                    height="6"
                    viewBox="0 0 8 7"
                    className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
                  >
                    <path d="M4 0 L8 7 L0 7 Z" fill="currentColor" />
                  </svg>
                )}
              </button>
            </Tooltip>
          )}
          {/* Hide is only offered when idle: during a recording the same corner
              belongs to cancel, and two X buttons side by side is a trap. Also
              withheld while a conversation runs — hiding the only sign that the
              microphone is open is not a thing to offer in one click. */}
          {!conversation.recording && !isRecording && !isProcessing && isHovered && (
            <Tooltip content={t("app.buttons.hideOatHint")} align="left">
              <button
                aria-label={t("app.buttons.hideOat")}
                onClick={(e) => {
                  e.stopPropagation();
                  setIsHovered(false);
                  setIsCommandMenuOpen(false);
                  window.electronAPI?.hideFloatingOat?.();
                }}
                className="group/hide flex size-5 items-center justify-center rounded-full border border-border bg-popover shadow-sm transition-colors duration-150 hover:bg-accent"
              >
                <X size={10} strokeWidth={2.5} className="text-muted-foreground" />
              </button>
            </Tooltip>
          )}
          {(isRecording || isProcessing) && isHovered && (
            <button
              aria-label={
                isRecording ? t("app.buttons.cancelRecording") : t("app.buttons.cancelProcessing")
              }
              onClick={(e) => {
                e.stopPropagation();
                isRecording ? cancelRecording() : cancelProcessing();
              }}
              className="group/cancel flex size-5 items-center justify-center rounded-full border border-border bg-popover shadow-sm transition-colors duration-150 hover:border-destructive hover:bg-destructive"
            >
              <X
                size={10}
                strokeWidth={2.5}
                className="text-foreground group-hover/cancel:text-destructive-foreground transition-colors duration-150"
              />
            </button>
          )}
          <Tooltip
            content={micProps.tooltip}
            align={
              panelStartPosition === "bottom-left"
                ? "left"
                : panelStartPosition === "center"
                  ? "center"
                  : "right"
            }
          >
            <button
              ref={buttonRef}
              // The two small buttons beside this one are labelled; this one —
              // the control the window exists for — was not, so assistive
              // technology read the whole oat as an unnamed button. At rest the
              // visible tooltip is a bare key name ("Right Alt"), which says
              // nothing on its own, so the name says what the key does. Each
              // state's name contains that state's visible tooltip text, which
              // WCAG 2.5.3 requires — check both halves in every locale when
              // editing either, since three of the ten failed it once already.
              aria-label={micProps.ariaLabel ?? micProps.tooltip}
              aria-disabled={micProps.disabled ? true : undefined}
              onPointerDown={(e) => {
                setIsCommandMenuOpen(false);
                // Screen coordinates, not client ones. The window is being moved
                // to follow the cursor, so the pointer's position *inside* the
                // window barely changes during a drag — measured that way, a
                // drag across the whole desktop registered as a click and
                // started a dictation on let-go.
                setDragStartPos({ x: e.screenX, y: e.screenY });
                setHasDragged(false);
                handlePointerDown(e);
              }}
              onPointerMove={(e) => {
                if (dragStartPos && !hasDragged) {
                  const distance = Math.hypot(
                    e.screenX - dragStartPos.x,
                    e.screenY - dragStartPos.y
                  );
                  if (distance > 5) {
                    // 5px threshold for drag
                    setHasDragged(true);
                  }
                }
              }}
              onPointerUp={() => {
                handlePointerUp();
                setDragStartPos(null);
              }}
              // Capture is released implicitly on cancel; the drag must end with
              // it or the window keeps following a pointer nobody is holding.
              onPointerCancel={() => {
                handlePointerUp();
                setDragStartPos(null);
              }}
              onClick={(e) => {
                if (!hasDragged) {
                  setIsCommandMenuOpen(false);
                  // While a conversation is running the seed is that
                  // conversation, so pressing it finishes it. Not a hidden mode:
                  // the gold rim and the running clock say which of the two
                  // things this press does before it is pressed, and it goes
                  // through the same toggle as the global shortcut.
                  if (conversation.recording) {
                    void window.electronAPI?.requestToggleConversation?.();
                  } else {
                    toggleListening();
                  }
                }
                e.preventDefault();
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                if (!hasDragged) {
                  setWindowInteractivity(true);
                  setIsCommandMenuOpen((prev) => !prev);
                }
              }}
              className={micProps.className}
              style={{
                ...micProps.style,
                cursor:
                  micState === "processing"
                    ? "not-allowed !important"
                    : isDragging
                      ? "grabbing !important"
                      : "pointer !important",
                transition:
                  "transform 0.25s cubic-bezier(0.4, 0, 0.2, 1), background-color 0.25s ease-out",
              }}
            >
              <span className="oats-seed" aria-hidden="true" />
            </button>
          </Tooltip>
          {isCommandMenuOpen && (
            <div
              ref={commandMenuRef}
              role="menu"
              className="absolute bottom-full right-0 mb-3 w-52 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md"
              onMouseEnter={() => {
                setWindowInteractivity(true);
              }}
              onMouseLeave={() => {
                if (!isHovered) {
                  setWindowInteractivity(false);
                }
              }}
            >
              <button
                // `toggleListening` is a no-op while a transcription is running,
                // so during processing this offered "Start listening" — the
                // opposite of what the button beside it was doing — and did
                // nothing when pressed. The mic itself says so now; this has to
                // agree with it.
                //
                // `aria-disabled`, not `disabled`: a disabled button is dropped
                // from the accessibility tree by some screen readers, which
                // would silence the very state this was added to announce. The
                // mic beside it makes the same choice.
                aria-disabled={isProcessing && !isRecording ? true : undefined}
                role="menuitem"
                className={`w-full rounded-md px-2 py-1.5 text-left text-sm font-medium outline-none ${
                  isProcessing && !isRecording
                    ? "cursor-not-allowed opacity-50"
                    : "hover:bg-accent focus-visible:bg-accent"
                }`}
                onClick={() => {
                  if (isProcessing && !isRecording) return;
                  toggleListening();
                }}
              >
                {isProcessing && !isRecording
                  ? t("app.commandMenu.processing")
                  : isRecording
                    ? t("app.commandMenu.stopListening")
                    : t("app.commandMenu.startListening")}
              </button>
              <div role="separator" className="-mx-1 my-1 h-px bg-border" />
              <button
                role="menuitem"
                className="w-full rounded-md px-2 py-1.5 text-left text-sm outline-none hover:bg-accent focus-visible:bg-accent"
                onClick={() => {
                  setIsCommandMenuOpen(false);
                  setWindowInteractivity(false);
                  handleClose();
                }}
              >
                {t("app.commandMenu.hideForNow")}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
