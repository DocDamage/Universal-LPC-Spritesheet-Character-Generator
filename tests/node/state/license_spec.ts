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
  test("returns 400 for missing fields", async () => {
    const res = await handler({ httpMethod: "POST", body: "{}" } as any);
    assert.equal(res?.statusCode, 400);
  });

  test("rejects invalid key format in mock mode", async () => {
    const res = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ downloadKey: "bad-key", edition: "pro" }),
    } as any);
    assert.equal(res?.statusCode, 400);
  });

  test("returns signed license grant for valid mock key", async () => {
    const res = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ downloadKey: "test-key-12345", edition: "pro" }),
    } as any);
    assert.equal(res?.statusCode, 200);
    const body = JSON.parse(res?.body || "{}");
    assert.equal(body.ok, true);
    assert.equal(body.license.edition, "pro");
    assert.ok(body.license.signature);
  });
});
