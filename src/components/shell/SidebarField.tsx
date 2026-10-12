import Field from "../conversation/Field";
import { useMeetingRecordingStore } from "../../stores/meetingRecordingStore";
import { useSettingsStore } from "../../stores/settingsStore";

/**
 * The wheat field at the foot of the sidebar.
 *
 * DESIGN.md §2, "Alive, not busy": the oat world in the frame, never under
 * words. It is a still frame at rest and sways only while a conversation is
 * recording, within the field's own limits: at most 30 frames a second, and
 * nothing at all while the window is unseen (#50) or the sidebar has stepped
 * aside for the recording (focus on record). It is not drawn while the
 * full field backdrop is on, so the field never shows twice, and it gives its
 * height back on short windows, where the recent list needs the room
 * (`.oats-sidebar-field` in index.css).
 */
export function SidebarField({ away = false }: { away?: boolean }) {
  const fieldMode = useSettingsStore((state) => state.uiMode) === "field";
  const recording = useMeetingRecordingStore((state) => state.isRecording);
  if (fieldMode) return null;
  return (
    <div
      aria-hidden="true"
      className="oats-sidebar-field pointer-events-none relative h-24 shrink-0 overflow-hidden"
    >
      <Field live intensity={0.75} animate={recording && !away} className="absolute inset-0" />
      {/* The sky fades into the sidebar, so the field rises out of it. */}
      <div
        className="absolute inset-0"
        style={{ background: "linear-gradient(180deg, var(--color-sidebar) 0%, transparent 50%)" }}
      />
    </div>
  );
}
