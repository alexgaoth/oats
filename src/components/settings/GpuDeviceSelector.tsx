import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { SettingRow, SettingsSection } from "./SettingsKit";
import { NativeSelect } from "../ui/native-select";
import type { GpuDevice } from "../../types/electron";

/**
 * Which GPU a local model runs on, on a computer with two or more. Nothing
 * with one GPU or none, which is every Mac. A missing list counts as none:
 * a main process without the call answers nothing, and that is no reason to
 * throw (Settings once crashed on `undefined.length` here).
 */
export function GpuDeviceSelector({ purpose }: { purpose: "transcription" | "intelligence" }) {
  const { t } = useTranslation();
  const [gpus, setGpus] = useState<GpuDevice[]>([]);
  const [selectedUuid, setSelectedUuid] = useState("");

  useEffect(() => {
    let live = true;
    Promise.all([
      Promise.resolve(window.electronAPI?.listGpus?.()).catch(() => null),
      Promise.resolve(window.electronAPI?.getGpuDeviceIndex?.(purpose)).catch(() => null),
    ]).then(([list, saved]) => {
      if (!live) return;
      const found = Array.isArray(list) ? list : [];
      setGpus(found);
      setSelectedUuid((typeof saved === "string" && saved) || found[0]?.uuid || "");
    });
    return () => {
      live = false;
    };
  }, [purpose]);

  if (gpus.length < 2) return null;

  return (
    <SettingsSection
      title={t(`settingsPage.${purpose}.gpuDevice.title`)}
      description={t(`settingsPage.${purpose}.gpuDevice.description`)}
    >
      <SettingRow label={t(`settingsPage.${purpose}.gpuDevice.title`)}>
        <NativeSelect
          aria-label={t(`settingsPage.${purpose}.gpuDevice.title`)}
          value={selectedUuid}
          onChange={(event) => {
            const uuid = event.target.value;
            setSelectedUuid(uuid);
            void window.electronAPI?.setGpuDeviceIndex?.(purpose, uuid);
          }}
          className="w-64"
        >
          {gpus.map((gpu) => (
            <option key={gpu.uuid} value={gpu.uuid}>
              GPU {gpu.index}: {gpu.name} ({Math.round(gpu.vramMb / 1024)}GB)
            </option>
          ))}
        </NativeSelect>
      </SettingRow>
    </SettingsSection>
  );
}
