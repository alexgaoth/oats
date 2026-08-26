import Field from "../conversation/Field";
import { useMeetingRecordingStore } from "../../stores/meetingRecordingStore";
import { useSettingsStore } from "../../stores/settingsStore";

// Field mode's backdrop: the world, behind the whole app.
//
// This is the original field (`conversation/field/`), recovered from before its
// retirement — WebGL where the GPU is genuinely available, a 2D canvas where it
// is not, both drawing the same model. It was deleted because Oats cannot wear
// two brands at once; it is back as the *second interface* rather than as the
// product's face, so work mode still renders none of it.
//
// The three props are the field's own design and are kept as they were:
//
//   live      — the wheat grows out of the ground while a conversation is being
//               recorded and withdraws when it stops. Keeping it up permanently
//               was tried and is not available: the renderer only comes to rest
//               once the wheat has withdrawn, so a permanently grown field
//               animates forever and measured **128.6 points of a core** at
//               idle — the same failure that retired it. The world (sky, sun,
//               horizon, farmhouse) is drawn always; the wheat is the gesture.
//   intensity — Conversation is the hero surface and gets the full sky.
//               Intelligence and Settings are for *reading*, and §9.8 is
//               explicit that the world must never compete with a word on
//               screen: at full strength the horizon draws through a paragraph.
//   animate   — the reading surfaces get a still frame. Wind behind a page of
//               text is a laptop battery spent on something nobody is watching.

/** Reading surfaces keep the world, quietly and still. */
const INTENSITY: Record<string, number> = {
  conversation: 1,
  intelligence: 0.42,
  settings: 0.42,
};

export default function FieldBackdrop({ surface }: { surface: string }) {
  const fieldMode = useSettingsStore((s) => s.uiMode) === "field";
  const recording = useMeetingRecordingStore((s) => s.isRecording);

  if (!fieldMode) return null;

  return (
    <Field
      live={recording}
      intensity={INTENSITY[surface] ?? 0.42}
      animate={surface === "conversation"}
      className="fixed inset-0 -z-10"
    />
  );
}
