import type { TFunction } from "i18next";
import type { Feature } from "../../helpers/featureRoutes.mjs";

export function featureRouteName(t: TFunction, feature: Feature) {
  switch (feature) {
    case "conversations":
      return t("oats.featureRoutes.conversations");
    case "dictation":
      return t("oats.featureRoutes.dictation");
    case "writing":
      return t("oats.featureRoutes.writing");
  }
}

export function featureRouteDisclosure(t: TFunction, feature: Feature, provider: string) {
  switch (feature) {
    case "conversations":
      return t("oats.featureRoutes.conversationsSent", { provider });
    case "dictation":
      return t("oats.featureRoutes.dictationSent", { provider });
    case "writing":
      return t("oats.featureRoutes.writingSent", { provider });
  }
}
