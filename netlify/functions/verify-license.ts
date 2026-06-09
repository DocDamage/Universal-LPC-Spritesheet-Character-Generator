/* eslint-disable @typescript-eslint/no-explicit-any */
import { webcrypto } from "node:crypto";

const crypto = webcrypto;

// Helper to convert hex to Uint8Array
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

// Helper to convert Uint8Array to hex
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// SHA-256 hash helper
async function sha256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return bytesToHex(new Uint8Array(hashBuffer));
}

export const handler = async (event: any): Promise<any> => {
  // Only allow POST
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    const { downloadKey, edition } = JSON.parse(event.body || "{}");

    if (!downloadKey || !edition) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          ok: false,
          error: "Missing downloadKey or edition",
        }),
      };
    }

    const itchApiKey = process.env["ITCH_API_KEY"] || "mock_api_key";
    const gameId = process.env["ITCH_GAME_ID"] || "123456";
    // In production, the signing key should be set in LICENSE_SIGNING_SECRET. Fallback to developer testing key.
    const privateKeyHex =
      process.env["LICENSE_SIGNING_SECRET"] ||
      "302e020100300506032b657004220420267a582e85d2869c648cdba631946a1b08e68a435a815cef868ff236c8bf687f";

    // 1. In real mode (not mock api key), call itch.io
    if (itchApiKey !== "mock_api_key") {
      const itchUrl = `https://api.itch.io/games/${gameId}/download_keys?download_key=${downloadKey}`;
      const res = await fetch(itchUrl, {
        headers: {
          Authorization: `Bearer ${itchApiKey}`,
        },
      });

      if (!res.ok) {
        return {
          statusCode: 400,
          body: JSON.stringify({ ok: false, error: "invalid_download_key" }),
        };
      }

      const itchData = await res.json();
      if (!itchData.download_key) {
        return {
          statusCode: 400,
          body: JSON.stringify({ ok: false, error: "invalid_download_key" }),
        };
      }
    } else {
      // In development / testing without ITCH_API_KEY, we accept any key starting with "test-key-"
      if (!downloadKey.startsWith("test-key-")) {
        return {
          statusCode: 400,
          body: JSON.stringify({ ok: false, error: "invalid_download_key" }),
        };
      }
    }

    // 2. Generate signed license grant
    const issuedAt = new Date().toISOString();
    // Expiration: 30 days from now
    const expiresAt = new Date(
      Date.now() + 30 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const downloadKeyHash = await sha256(downloadKey);

    const dataString = `${edition}:${downloadKeyHash}:${issuedAt}:${expiresAt}`;
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(dataString);

    const privateKeyBuffer = hexToBytes(privateKeyHex);
    const privateKey = await crypto.subtle.importKey(
      "pkcs8",
      privateKeyBuffer as any,
      { name: "Ed25519", namedCurve: "Ed25519" } as any,
      true,
      ["sign"],
    );

    const signatureBuffer = await crypto.subtle.sign(
      { name: "Ed25519" } as any,
      privateKey,
      dataBuffer as any,
    );
    const signatureHex = bytesToHex(new Uint8Array(signatureBuffer));

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: true,
        license: {
          edition,
          downloadKeyHash,
          issuedAt,
          expiresAt,
          signature: signatureHex,
        },
      }),
    };
  } catch (err: any) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        ok: false,
        error: err.message || "Internal server error",
      }),
    };
  }
};
