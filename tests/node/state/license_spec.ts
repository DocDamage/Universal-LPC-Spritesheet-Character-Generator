/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, describe } from "vitest";
import assert from "node:assert/strict";
import {
  checkEditionMatch,
  verifySignature,
  clearLicense,
  setBuildRequiresLicenseForTests,
  setBuildTierForTests,
} from "../../../sources/state/license-state.ts";
import { hasPlanAccess } from "../../../sources/state/feature-gates.ts";
import { state } from "../../../sources/state/app-state.ts";

describe("Licensing and Build Tier Enforcement", () => {
  test("checkEditionMatch handles Pro vs Studio access rules correctly", () => {
    setBuildTierForTests("pro");
    assert.equal(checkEditionMatch("pro"), true);
    assert.equal(checkEditionMatch("studio"), true);

    setBuildTierForTests("studio");
    assert.equal(checkEditionMatch("pro"), false);
    assert.equal(checkEditionMatch("studio"), true);

    setBuildTierForTests(null);
  });

  test("Signature verification fails for tampered or invalid signature", async () => {
    const grant = {
      edition: "pro" as const,
      downloadKeyHash: "sha256-hash",
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30000).toISOString(),
    };

    const isSigValid = await verifySignature(grant, "aabbccddee");
    assert.equal(isSigValid, false);
  });

  test("hasPlanAccess blocks paid features when no valid license is held", () => {
    setBuildRequiresLicenseForTests(true);
    setBuildTierForTests("studio");
    state.appPlan = "studio";

    clearLicense();
    assert.equal(hasPlanAccess("free"), true);
    assert.equal(hasPlanAccess("pro"), false);
    assert.equal(hasPlanAccess("studio"), false);

    setBuildRequiresLicenseForTests(null);
    setBuildTierForTests(null);
  });
});

import { handler } from "../../../netlify/functions/verify-license.ts";

describe("Verify License Netlify Function", () => {
  let origEnv: string | undefined;

  // Set NODE_ENV to development before running these handler tests so it resolves mock keys
  test("returns 400 for missing fields", async () => {
    origEnv = process.env["NODE_ENV"];
    process.env["NODE_ENV"] = "development";
    try {
      const res = await handler({ httpMethod: "POST", body: "{}" } as any);
      assert.equal(res?.statusCode, 400);
    } finally {
      process.env["NODE_ENV"] = origEnv;
    }
  });

  test("rejects invalid key format in mock mode", async () => {
    origEnv = process.env["NODE_ENV"];
    process.env["NODE_ENV"] = "development";
    try {
      const res = await handler({
        httpMethod: "POST",
        body: JSON.stringify({ downloadKey: "bad-key", edition: "pro" }),
      } as any);
      assert.equal(res?.statusCode, 400);
    } finally {
      process.env["NODE_ENV"] = origEnv;
    }
  });

  test("returns signed license grant for valid mock key", async () => {
    origEnv = process.env["NODE_ENV"];
    process.env["NODE_ENV"] = "development";
    // Also need a mock signing secret
    const origSecret = process.env["LICENSE_SIGNING_SECRET"];
    // This is a 64-character (32-byte) hex-encoded dummy Ed25519 private key (actually we just need any valid PKCS8 key or a mock secret)
    // Actually, verify-license.ts expects a hex private key which it imports with WebCrypto pkcs8
    // Let's provide a real 32-byte Ed25519 PKCS8 DER signature key in hex if it imports it, or let's see.
    // To make sure it doesn't fail importing private key:
    // Let's use a valid hex PKCS8 Ed25519 key:
    const mockPKCS8Hex =
      "302e020100300506032b657004220420" +
      "0000000000000000000000000000000000000000000000000000000000000000";
    process.env["LICENSE_SIGNING_SECRET"] = mockPKCS8Hex;
    try {
      const res = await handler({
        httpMethod: "POST",
        body: JSON.stringify({ downloadKey: "test-key-12345", edition: "pro" }),
      } as any);
      assert.equal(res?.statusCode, 200);
      const body = JSON.parse(res?.body || "{}");
      assert.equal(body.ok, true);
      assert.equal(body.license.edition, "pro");
      assert.ok(body.license.signature);
    } finally {
      process.env["NODE_ENV"] = origEnv;
      process.env["LICENSE_SIGNING_SECRET"] = origSecret;
    }
  });
});
