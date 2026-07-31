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

    let rafId = 0;
    let smoothed = 0;
    let buf = new Float32Array(256);
    let lastSoundAt = performance.now();

    const tick = () => {
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
        const now = performance.now();
        if (clamped > SILENCE_FLOOR) {
          lastSoundAt = now;
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
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      useMeetingRecordingStore.setState({ currentMicLevel: 0, micSilentSince: null });
    };
  }, [isRecording]);

  return null;
}
