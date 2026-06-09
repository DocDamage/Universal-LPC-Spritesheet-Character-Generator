const ONBOARDING_STORAGE_KEY = "lpc-onboarding-dismissed";

function getStorage(): Storage | null {
  if (typeof window === "undefined") return null;

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function shouldShowOnboarding(): boolean {
  return getStorage()?.getItem(ONBOARDING_STORAGE_KEY) !== "true";
}

export function dismissOnboarding(): void {
  getStorage()?.setItem(ONBOARDING_STORAGE_KEY, "true");
}

export function resetOnboardingForTests(): void {
  getStorage()?.removeItem(ONBOARDING_STORAGE_KEY);
}
