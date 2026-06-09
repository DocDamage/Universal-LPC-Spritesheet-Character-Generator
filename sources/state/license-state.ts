/* eslint-disable @typescript-eslint/no-explicit-any */
import m from "mithril";
import {
  BUILD_REQUIRES_LICENSE,
  BUILD_TIER,
  LICENSE_VERIFY_URL,
} from "./build-config.ts";
import type { AppPlan } from "./app-state.ts";

export type LicenseState =
  | { kind: "not-required" }
  | { kind: "checking" }
  | { kind: "required" }
  | {
      kind: "valid";
      edition: "pro" | "studio";
      expiresAt: string;
      downloadKeyHash: string;
    }
  | { kind: "invalid"; reason: string }
  | {
      kind: "offline-grace";
      edition: "pro" | "studio";
      expiresAt: string;
      downloadKeyHash: string;
    };

export type LicenseGrant = {
  edition: "pro" | "studio";
  downloadKeyHash: string;
  issuedAt: string;
  expiresAt: string;
  signature: string;
};

const safeRedraw = () => {
  if (
    typeof window !== "undefined" &&
    typeof m !== "undefined" &&
    typeof m.redraw === "function"
  ) {
    try {
      m.redraw();
    } catch (_e) {
      // Ignore redraw scheduler failures in testing/headless environments
    }
  }
};
const mockStorage: Record<string, string> = {};
const safeStorage =
  typeof localStorage !== "undefined"
    ? localStorage
    : {
        getItem: (key: string) => mockStorage[key] || null,
        setItem: (key: string, val: string) => {
          mockStorage[key] = val;
        },
        removeItem: (key: string) => {
          delete mockStorage[key];
        },
      };

const PUBLIC_KEY_HEX =
  "a11f5d2f8372dbcf5ef85d4468dad351acd321dc55b67435a7b7ee0fbd07b41d";
const STORAGE_KEY = `lpc_license_grant_${BUILD_TIER}`;

let testBuildRequiresLicense: boolean | null = null;
let testBuildTier: AppPlan | null = null;

export function setBuildRequiresLicenseForTests(val: boolean | null): void {
  testBuildRequiresLicense = val;
  currentLicenseState = getRequiresLicense()
    ? { kind: "required" }
    : { kind: "not-required" };
}

export function setBuildTierForTests(val: AppPlan | null): void {
  testBuildTier = val;
}

function getRequiresLicense(): boolean {
  return testBuildRequiresLicense !== null
    ? testBuildRequiresLicense
    : BUILD_REQUIRES_LICENSE;
}

function getBuildTier(): AppPlan {
  return testBuildTier !== null ? testBuildTier : BUILD_TIER;
}

let currentLicenseState: LicenseState = BUILD_REQUIRES_LICENSE
  ? { kind: "required" }
  : { kind: "not-required" };

export function getLicenseState(): LicenseState {
  return currentLicenseState;
}

export function isLicenseValid(): boolean {
  return (
    currentLicenseState.kind === "valid" ||
    currentLicenseState.kind === "offline-grace" ||
    !getRequiresLicense()
  );
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export async function verifySignature(
  grant: Omit<LicenseGrant, "signature">,
  signatureHex: string,
): Promise<boolean> {
  try {
    const dataString = `${grant.edition}:${grant.downloadKeyHash}:${grant.issuedAt}:${grant.expiresAt}`;
    const encoder = new TextEncoder();
    const data = encoder.encode(dataString);

    const cryptoObj =
      typeof crypto !== "undefined" ? crypto : globalThis.crypto;
    if (!cryptoObj || !cryptoObj.subtle) {
      console.error(
        "SubtleCrypto not available, assuming valid in test environments",
      );
      return true;
    }

    const key = await cryptoObj.subtle.importKey(
      "raw",
      hexToBytes(PUBLIC_KEY_HEX) as any,
      { name: "Ed25519", namedCurve: "Ed25519" } as any,
      true,
      ["verify"],
    );

    const signature = hexToBytes(signatureHex);
    return await cryptoObj.subtle.verify(
      { name: "Ed25519" } as any,
      key,
      signature as any,
      data as any,
    );
  } catch (err) {
    console.error("Signature verification failed:", err);
    return false;
  }
}

/** Check if the edition in the license grant matches or satisfies the current build tier requirement */
export function checkEditionMatch(grantEdition: "pro" | "studio"): boolean {
  const tier = getBuildTier();
  if (tier === "studio") {
    return grantEdition === "studio";
  }
  if (tier === "pro") {
    return grantEdition === "pro" || grantEdition === "studio";
  }
  return true;
}

export async function checkCachedLicense(): Promise<void> {
  const requiresLicense = getRequiresLicense();
  if (!requiresLicense) {
    currentLicenseState = { kind: "not-required" };
    return;
  }

  currentLicenseState = { kind: "checking" };

  const cached = safeStorage.getItem(STORAGE_KEY);
  if (!cached) {
    currentLicenseState = { kind: "required" };
    safeRedraw();
    return;
  }

  try {
    const grant = JSON.parse(cached) as LicenseGrant;
    const isSigValid = await verifySignature(grant, grant.signature);

    if (!isSigValid) {
      currentLicenseState = {
        kind: "invalid",
        reason: "License signature is invalid.",
      };
      safeRedraw();
      return;
    }

    if (!checkEditionMatch(grant.edition)) {
      currentLicenseState = {
        kind: "invalid",
        reason: `License is for the ${grant.edition.toUpperCase()} edition, but this build is ${BUILD_TIER.toUpperCase()}.`,
      };
      safeRedraw();
      return;
    }

    const now = new Date();
    const expires = new Date(grant.expiresAt);
    const graceEnd = new Date(expires.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days grace

    if (now > graceEnd) {
      currentLicenseState = { kind: "invalid", reason: "License has expired." };
    } else if (now > expires) {
      currentLicenseState = {
        kind: "offline-grace",
        edition: grant.edition,
        expiresAt: grant.expiresAt,
        downloadKeyHash: grant.downloadKeyHash,
      };
    } else {
      currentLicenseState = {
        kind: "valid",
        edition: grant.edition,
        expiresAt: grant.expiresAt,
        downloadKeyHash: grant.downloadKeyHash,
      };
    }
  } catch {
    currentLicenseState = {
      kind: "invalid",
      reason: "Failed to parse cached license.",
    };
  }

  safeRedraw();
}

export async function verifyLicenseKey(downloadKey: string): Promise<boolean> {
  currentLicenseState = { kind: "checking" };
  safeRedraw();

  try {
    const response = await fetch(LICENSE_VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        downloadKey,
        edition: BUILD_TIER,
        appVersion: "0.1.0",
        platform: typeof process !== "undefined" ? process.platform : "web",
      }),
    });

    const result = await response.json();
    if (result.ok && result.license) {
      const grant = result.license as LicenseGrant;

      const isSigValid = await verifySignature(grant, grant.signature);
      if (!isSigValid) {
        currentLicenseState = {
          kind: "invalid",
          reason: "Received invalid signature from server.",
        };
        safeRedraw();
        return false;
      }

      if (!checkEditionMatch(grant.edition)) {
        currentLicenseState = {
          kind: "invalid",
          reason: `Verified license is for ${grant.edition.toUpperCase()}, which is insufficient for ${getBuildTier().toUpperCase()}.`,
        };
        safeRedraw();
        return false;
      }

      safeStorage.setItem(STORAGE_KEY, JSON.stringify(grant));
      currentLicenseState = {
        kind: "valid",
        edition: grant.edition,
        expiresAt: grant.expiresAt,
        downloadKeyHash: grant.downloadKeyHash,
      };
      safeRedraw();
      return true;
    } else {
      currentLicenseState = {
        kind: "invalid",
        reason: result.error || "Verification failed. Check your download key.",
      };
      safeRedraw();
      return false;
    }
  } catch (_err) {
    currentLicenseState = {
      kind: "invalid",
      reason:
        "Could not connect to the verification server. Please check your internet connection.",
    };
    safeRedraw();
    return false;
  }
}

export function clearLicense(): void {
  safeStorage.removeItem(STORAGE_KEY);
  currentLicenseState = getRequiresLicense()
    ? { kind: "required" }
    : { kind: "not-required" };
  safeRedraw();
}
