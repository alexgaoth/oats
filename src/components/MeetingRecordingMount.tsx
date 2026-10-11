import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "./ui/useToast";
import {
  getMicAnalyser,
  primeMeetingWorklet,
  useMeetingRecordingStore,
} from "../stores/meetingRecordingStore";

const EMA_PREV = 0.5;
const EMA_NEXT = 0.5;

// Below this the microphone is producing a flat floor, not a quiet room: normal
// room noise on a working mic sits comfortably above it.
/** 10Hz. The dead-microphone check has a 30-second grace period. */
const MIC_SAMPLE_INTERVAL_MS = 100;

const SILENCE_FLOOR = 0.004;
// How long that floor must persist before saying anything. Long enough that a
// genuine pause in conversation never trips it.
const SILENCE_GRACE_MS = 30_000;

export default function MeetingRecordingMount(): null {
  const { t } = useTranslation();
  const { toast } = useToast();
  const isRecording = useMeetingRecordingStore((s) => s.isRecording);
  const error = useMeetingRecordingStore((s) => s.error);

  useEffect(() => {
    primeMeetingWorklet();
  }, []);

  useEffect(() => {
    if (!error) return;
    toast({
      title: t("notes.meeting.title"),
      description: error,
      variant: "destructive",
    });
  }, [error, toast, t]);

  useEffect(() => {
    if (!isRecording) return;

    let timer = 0;
    let smoothed = 0;
    let buf = new Float32Array(256);
    let lastSoundAt = performance.now();
    let lastSoundPublishedAt = 0;

    // Sampled, not run flat out.
    //
    // This used to read the analyser and push `currentMicLevel` into the
    // store on **every frame** — 60 store writes a second for the whole of a
    // conversation, waking every subscriber's selector each time, on the one
    // surface whose premise is that nothing competes with the person in the
    // room. Its consumers are the dead-microphone warning, which is judged
    // against a 30-second grace period, and the live contour, which draws
    // once a second. 10Hz is plenty for both.
    //
    // On a timer, not a requestAnimationFrame loop that skips frames: that loop
    // still woke the page on every vsync, 120 times a second on a ProMotion
    // display, for the whole recording. The window runs with
    // backgroundThrottling off, so it went on doing so minimized or closed to
    // the tray, where nobody sees a frame.
    const sample = () => {
      const now = performance.now();

      const analyser = getMicAnalyser();
      if (analyser) {
        if (buf.length !== analyser.fftSize) {
          buf = new Float32Array(analyser.fftSize);
        }
        analyser.getFloatTimeDomainData(buf);
        let sumSquares = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = buf[i];
          sumSquares += v * v;
        }
        const rms = Math.sqrt(sumSquares / buf.length);
        smoothed = EMA_PREV * smoothed + EMA_NEXT * rms;
        const clamped = smoothed < 0 ? 0 : smoothed > 1 ? 1 : smoothed;
        useMeetingRecordingStore.setState({ currentMicLevel: clamped });

        // A microphone that is muted, unplugged, or grabbed by another app reads
        // as a flat floor rather than as an error, so nothing surfaces until the
        // end of the conversation — by which point the recording is already lost.
        // Track how long the floor has been flat and let the UI say so quietly.
        if (clamped > SILENCE_FLOOR) {
          lastSoundAt = now;
          // Published at most once a second — this runs on rAF, and a store
          // write per frame would re-render every subscriber sixty times a
          // second to record a timestamp nothing reads that often.
          if (now - lastSoundPublishedAt > 1000) {
            lastSoundPublishedAt = now;
            // `now` here is `performance.now()` — a monotonic clock measured
            // from page load. The health check compares against `Date.now()`,
            // so the wall clock is what goes in the store. Publishing the rAF
            // timestamp would have made "sound was heard recently" compare a
            // number near zero against a number near 1.7e12, and the check
            // would simply never have fired.
            useMeetingRecordingStore.setState({ lastSoundAt: Date.now() });
          }
          if (useMeetingRecordingStore.getState().micSilentSince !== null) {
            useMeetingRecordingStore.setState({ micSilentSince: null });
          }
        } else if (
          now - lastSoundAt > SILENCE_GRACE_MS &&
          useMeetingRecordingStore.getState().micSilentSince === null
        ) {
          useMeetingRecordingStore.setState({ micSilentSince: Date.now() });
        }
      }
    };

    timer = window.setInterval(sample, MIC_SAMPLE_INTERVAL_MS);

    return () => {
      window.clearInterval(timer);
      useMeetingRecordingStore.setState({ currentMicLevel: 0, micSilentSince: null });
    };
  }, [isRecording]);

  return null;
}
