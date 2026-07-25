import { useTranslation } from "react-i18next";
import { Check, Settings } from "lucide-react";
import { Button } from "../ui/button";

interface FinishStepProps {
  isCloudUser: boolean;
  onFinish: (openSettings: boolean) => void;
  isFinishing: boolean;
}

export default function FinishStep({ isCloudUser, onFinish, isFinishing }: FinishStepProps) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <div className="text-center space-y-0.5">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <Check className="h-6 w-6 text-primary" />
        </div>
        <h2 className="text-lg font-semibold text-foreground tracking-tight">
          {t("onboarding.finish.title")}
        </h2>
        <p className="text-xs text-muted-foreground">
          {isCloudUser
            ? t("onboarding.finish.cloudDescription")
            : t("onboarding.finish.localDescription")}
        </p>
      </div>

      <p className="text-xs text-muted-foreground text-center">
        {t("onboarding.finish.cleanupNote")}
      </p>

      <div className="flex items-center justify-center gap-2">
        <Button
          variant="outline"
          onClick={() => onFinish(true)}
          disabled={isFinishing}
          className="h-8 px-5 rounded-full text-xs"
        >
          <Settings className="w-3.5 h-3.5" />
          {t("onboarding.finish.openSettings")}
        </Button>
        <Button
          variant="success"
          onClick={() => onFinish(false)}
          disabled={isFinishing}
          className="h-8 px-6 rounded-full text-xs"
        >
          <Check className="w-3.5 h-3.5" />
          {t("onboarding.finish.skipForNow")}
        </Button>
      </div>
    </div>
  );
}
