/* eslint-disable @typescript-eslint/no-explicit-any */
import type { AppPlan } from "./app-state.ts";

export const BUILD_TIER: AppPlan =
  ((import.meta as any).env.VITE_BUILD_TIER as AppPlan) || "free";

export const BUILD_CHANNEL: "itch" | "dev" =
  ((import.meta as any).env.VITE_BUILD_CHANNEL as "itch" | "dev") || "dev";

export const BUILD_REQUIRES_LICENSE: boolean =
  (import.meta as any).env.VITE_BUILD_REQUIRES_LICENSE === "true";

export const BUILD_PRICE: string =
  (import.meta as any).env.VITE_BUILD_PRICE || "0";

export const APP_VERSION: string =
  (import.meta as any).env.VITE_APP_VERSION || "0.1.0";

export const ITCH_GAME_ID: string =
  (import.meta as any).env.VITE_ITCH_GAME_ID || "";

export const LICENSE_VERIFY_URL: string =
  (import.meta as any).env.VITE_LICENSE_VERIFY_URL || "/api/verify-license";
