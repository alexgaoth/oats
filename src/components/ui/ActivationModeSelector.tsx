import { useTranslation } from "react-i18next";
import { SegmentedControl } from "./segmented";

type ActivationMode = "tap" | "push";

interface ActivationModeSelectorProps {
  value: ActivationMode;
  onChange: (mode: ActivationMode) => void;
  disabled?: boolean;
}

/** Tap to start and stop, or hold while speaking: one of two, as a segmented control. */
export function ActivationModeSelector({
  value,
  onChange,
  disabled = false,
}: ActivationModeSelectorProps) {
  const { t } = useTranslation();
  return (
    <SegmentedControl<ActivationMode>
      aria-label={t("settingsPage.general.hotkey.activationMode")}
      value={value}
      onValueChange={onChange}
      options={[
        { value: "tap", label: t("common.tap") },
        { value: "push", label: t("common.hold") },
      ]}
      className={disabled ? "pointer-events-none opacity-50" : undefined}
    />
  );
}
