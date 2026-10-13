import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react";
import Field from "../conversation/Field";
import { HORIZON } from "../conversation/field/fieldModel";
import { SIDEBAR_FIELD, sidebarFieldHeight } from "../../helpers/sidebarField.mjs";
import { useMeetingRecordingStore } from "../../stores/meetingRecordingStore";
import { useSettingsStore } from "../../stores/settingsStore";

/**
 * The foot of the sidebar: what stands there (`children`, Settings and the
 * on-device footer), with the wheat field under it.
 *
 * DESIGN.md §2, "Alive, not busy": the oat world in the frame, never under
 * words. The field takes the room the sidebar has left, between a minimum and
 * a maximum (`helpers/sidebarField.mjs`), so it is tall on a tall window and
 * never takes room from the recent conversations; with less room than its
 * minimum it is not drawn. The ground keeps one scale at every height, so a
 * taller field is more sky over the same wheat. It is a still frame at rest and
 * sways only while a conversation is recording, within the field's own limits:
 * at most 30 frames a second, and nothing at all while the window is unseen
 * (#50) or the sidebar has stepped aside for the recording (focus on record).
 * It is not drawn while the full field backdrop is on, so the field never
 * shows twice.
 */
/** The ground under the horizon, which the sky's fade must stay above (index.css). */
const FIELD_STYLE = {
  maxHeight: SIDEBAR_FIELD.maxHeight,
  "--oats-field-ground": `${(1 - HORIZON) * SIDEBAR_FIELD.sceneHeight}px`,
} as CSSProperties;

export function SidebarField({ away = false, children }: { away?: boolean; children: ReactNode }) {
  const fieldMode = useSettingsStore((state) => state.uiMode) === "field";
  const recording = useMeetingRecordingStore((state) => state.isRecording);
  const footRef = useRef<HTMLDivElement | null>(null);
  const standRef = useRef<HTMLDivElement | null>(null);
  const fieldRef = useRef<HTMLDivElement | null>(null);

  // The room is the foot's height less what stands on it. The foot takes all
  // the height the sidebar has left whether the field is drawn or not, so the
  // answer cannot flip the moment it is applied. Written to the element from
  // the observer, not through React state, so a resize that crosses the
  // minimum shows or hides the field in the same frame.
  useLayoutEffect(() => {
    const foot = footRef.current;
    const stand = standRef.current;
    const field = fieldRef.current;
    if (!foot || !stand || !field) return undefined;
    const fit = () => {
      const room = foot.getBoundingClientRect().height - stand.getBoundingClientRect().height;
      field.hidden = sidebarFieldHeight(room) === 0;
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(foot);
    observer.observe(stand);
    return () => observer.disconnect();
  }, [fieldMode]);

  return (
    <div ref={footRef} className="flex flex-1 flex-col justify-end">
      <div ref={standRef}>{children}</div>
      {!fieldMode && (
        <div
          ref={fieldRef}
          aria-hidden="true"
          className="oats-sidebar-field pointer-events-none relative min-h-0 flex-1 basis-0 overflow-hidden"
          style={FIELD_STYLE}
        >
          <Field
            live
            intensity={0.75}
            animate={recording && !away}
            sceneHeight={SIDEBAR_FIELD.sceneHeight}
            className="absolute inset-0"
          />
          {/* The sky fades into the sidebar, so the field rises out of it. */}
          <div className="oats-sidebar-sky absolute inset-0" />
        </div>
      )}
    </div>
  );
}
