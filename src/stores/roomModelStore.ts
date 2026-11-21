import { create } from "zustand";
import { PARAKEET_ROOM_MODEL } from "../helpers/localSetup.mjs";
import { PARAKEET_MODEL_INFO } from "../models/ModelRegistry";
import aneFiles from "../models/parakeetAneFiles.json";

const DECLINED = "roomParakeetDeclined";
export const ROOM_MODEL_NAME = PARAKEET_MODEL_INFO[PARAKEET_ROOM_MODEL].name;
export const ROOM_MODEL_BYTES = aneFiles.bundles.reduce(
  (total, bundle) => total + bundle.files.reduce((bytes, file) => bytes + file.size, 0),
  0
);

interface RoomModelState {
  available: boolean | null;
  installed: boolean;
  declined: boolean;
  progress: number | null;
  failed: boolean;
}

export const useRoomModelStore = create<RoomModelState>()(() => ({
  available: null,
  installed: false,
  declined: typeof localStorage !== "undefined" && localStorage.getItem(DECLINED) === "true",
  progress: null,
  failed: false,
}));

let revision = 0;
let transfer: { cancelled: boolean; manual: boolean } | null = null;

export async function refreshRoomModel() {
  const request = ++revision;
  const result = await window.electronAPI?.listParakeetModels?.().catch(() => null);
  if (request !== revision) return;
  const model = result?.success && result.models.find(({ model }) => model === PARAKEET_ROOM_MODEL);
  useRoomModelStore.setState({
    available: Boolean(model),
    installed: Boolean(model && model.downloaded),
  });
}

export function clearRoomModelDecline() {
  localStorage.removeItem(DECLINED);
  useRoomModelStore.setState({ declined: false, failed: false });
}

export function declineRoomModel() {
  localStorage.setItem(DECLINED, "true");
  useRoomModelStore.setState({ declined: true });
}

/** Use the same Parakeet installer as the explicit model picker. */
export async function startRoomModelDownload(canStart: () => boolean, force = false) {
  const { available, installed, declined, failed } = useRoomModelStore.getState();
  if (transfer || !available || installed || (!force && (declined || failed)) || !canStart())
    return;
  const active = { cancelled: false, manual: force };
  transfer = active;
  if (force) clearRoomModelDecline();
  ++revision;
  const api = window.electronAPI;
  const unsubscribe = api?.onParakeetDownloadProgress?.((_event, update) => {
    if (update.model !== PARAKEET_ROOM_MODEL) return;
    if (active.cancelled && update.type === "progress") {
      // Cancel can arrive while the installer is still checking disk space.
      void api.cancelParakeetDownload?.().catch(() => {});
    } else if (!active.cancelled && update.percentage != null) {
      useRoomModelStore.setState({ progress: Math.min(100, Math.max(0, update.percentage)) });
    }
  });
  useRoomModelStore.setState({ progress: 0 });
  try {
    const result = await api?.downloadParakeetModel?.(PARAKEET_ROOM_MODEL);
    if (result?.code === "RECORDING_ACTIVE") return;
    if (!result?.success || !result.downloaded)
      throw new Error("Parakeet download did not complete");
    useRoomModelStore.setState({ installed: true });
  } catch {
    if (!active.cancelled) useRoomModelStore.setState({ failed: true });
  } finally {
    unsubscribe?.();
    transfer = null;
    useRoomModelStore.setState({ progress: null });
  }
}

export function cancelRoomModelDownload(decline = true, automaticOnly = false) {
  if (!transfer || transfer.cancelled || (automaticOnly && transfer.manual)) return;
  transfer.cancelled = true;
  if (decline) declineRoomModel();
  void window.electronAPI?.cancelParakeetDownload?.().catch(() => {});
}
