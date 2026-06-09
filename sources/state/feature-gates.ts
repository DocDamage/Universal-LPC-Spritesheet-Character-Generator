import { state } from "./state.ts";
import type { AppPlan } from "./app-state.ts";
import { showToast } from "./notifications.ts";

export type PaidFeature =
  | "advanced-editor"
  | "custom-imports"
  | "animation-export"
  | "zip-export"
  | "engine-presets"
  | "batch-export"
  | "studio-tools";

type FeatureRule = {
  label: string;
  requiredPlan: AppPlan;
  message: string;
};

export const PLAN_LABELS: Record<AppPlan, string> = {
  free: "Free",
  pro: "Pro",
  studio: "Studio",
};

const planRank: Record<AppPlan, number> = {
  free: 0,
  pro: 1,
  studio: 2,
};

const featureRules: Record<PaidFeature, FeatureRule> = {
  "advanced-editor": {
    label: "Advanced editor",
    requiredPlan: "pro",
    message: "The part editor is a Pro workflow feature.",
  },
  "custom-imports": {
    label: "Custom imports",
    requiredPlan: "pro",
    message: "Custom asset imports are a Pro workflow feature.",
  },
  "animation-export": {
    label: "Animation exports",
    requiredPlan: "pro",
    message: "Animated GIF/WebP exports are Pro workflow features.",
  },
  "zip-export": {
    label: "ZIP exports",
    requiredPlan: "pro",
    message: "ZIP exports are a Pro workflow feature.",
  },
  "engine-presets": {
    label: "Engine presets",
    requiredPlan: "pro",
    message: "Engine preset exports are a Pro workflow feature.",
  },
  "batch-export": {
    label: "Batch exports",
    requiredPlan: "pro",
    message: "Batch export workflows are a Pro feature.",
  },
  "studio-tools": {
    label: "Studio tools",
    requiredPlan: "studio",
    message:
      "Project libraries and batch Studio workflows are Studio features.",
  },
};

export function getFeatureRule(feature: PaidFeature): FeatureRule {
  return featureRules[feature];
}

export function hasPlanAccess(requiredPlan: AppPlan): boolean {
  return planRank[state.appPlan] >= planRank[requiredPlan];
}

export function canUseFeature(feature: PaidFeature): boolean {
  return hasPlanAccess(featureRules[feature].requiredPlan);
}

export function paidFeatureTitle(feature: PaidFeature): string {
  const rule = getFeatureRule(feature);
  return canUseFeature(feature)
    ? rule.label
    : `${rule.label} - ${PLAN_LABELS[rule.requiredPlan]} feature`;
}

export function requireFeature(feature: PaidFeature): boolean {
  if (canUseFeature(feature)) return true;
  const rule = getFeatureRule(feature);
  showToast(
    `${rule.message} Switch to ${PLAN_LABELS[rule.requiredPlan]} to use it.`,
    {
      kind: "warning",
      timeoutMs: 6000,
    },
  );
  return false;
}
