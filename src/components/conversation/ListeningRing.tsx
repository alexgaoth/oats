import { useEffect, useRef } from "react";
import { ListeningRing as LevelRing } from "../../helpers/listeningRing.mjs";
import { useMeetingRecordingStore } from "../../stores/meetingRecordingStore";

/**
 * The ring behind the record dot: it grows with the microphone level, read
 * against this room (`helpers/listeningRing.mjs`), and rests while nobody
 * speaks. It replaced a fixed `animate-ping`, which pulsed the same way through
 * speech, silence and a dead microphone.
 *
 * The level changes ten times a second (`MeetingRecordingMount`). A selector or
 * a state update per sample would re-render the whole status card that often,
 * so the scale is written to this element directly from a store subscription,
 * and only when it changes: at rest, nothing is written at all. The transition
 * is about one sample long, so the ring moves between samples instead of
 * jumping. Under reduced motion there is no ring, only the still dot.
 */
export default function ListeningRing() {
  const ref = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const ring = new LevelRing();
    let shown = "scale(1.00)";
    return useMeetingRecordingStore.subscribe((state, previous) => {
      if (state.currentMicLevel === previous.currentMicLevel) return;
      const transform = `scale(${ring.push(state.currentMicLevel).toFixed(2)})`;
      if (transform === shown || !ref.current) return;
      shown = transform;
      ref.current.style.transform = transform;
    });
  }, []);

  return (
    <span
      ref={ref}
      aria-hidden="true"
      className="absolute inset-0 rounded-full bg-recording/30 transition-transform [transition-duration:var(--motion-instant)] motion-reduce:hidden dark:bg-recording/45"
    />
  );
}
