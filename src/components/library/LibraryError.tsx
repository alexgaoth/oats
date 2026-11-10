import { useTranslation } from "react-i18next";
import { Button } from "../ui/button";

export function LibraryError({ retry }: { retry?: () => void }) {
  const { t } = useTranslation();
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-2 rounded-md border border-border px-3 py-2 text-[13px] text-destructive"
    >
      <p className="flex-1">{t("oats.library.failed")}</p>
      {retry && (
        <Button variant="outline" size="sm" onClick={retry}>
          {t("oats.library.retry")}
        </Button>
      )}
    </div>
  );
}
