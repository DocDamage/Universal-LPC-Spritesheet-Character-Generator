import { webcrypto } from "node:crypto";

const crypto = webcrypto;

// ---------------------------------------------------------------------------
// Simple in-memory rate limiter (per IP, max 10 requests per 60-second window)
// This resets on cold-start but is sufficient as a first-line guard.
// ---------------------------------------------------------------------------
const rateLimitMap = new Map<string, { count: number; windowStart: number }>();
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(ip, { count: 1, windowStart: now });
    return false;
  }

  entry.count += 1;
  if (entry.count > RATE_LIMIT_MAX) {
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return bytesToHex(new Uint8Array(hashBuffer));
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const handler = async (event: any): Promise<any> => {
  // Only allow POST
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  // Rate limiting
  const clientIp: string =
    event.headers?.["x-forwarded-for"]?.split(",")[0]?.trim() ||
    event.headers?.["client-ip"] ||
    "unknown";

  if (isRateLimited(clientIp)) {
    return {
      statusCode: 429,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: false,
        error:
          "Too many verification attempts. Please wait a minute and try again.",
      }),
    };
  }

  // Read required environment variables
  const itchApiKey = process.env["ITCH_API_KEY"];
  const gameId = process.env["ITCH_GAME_ID"];
  const privateKeyHex = process.env["LICENSE_SIGNING_SECRET"];
  const isDev =
    process.env["NODE_ENV"] === "development" ||
    process.env["NETLIFY_DEV"] === "true";

  // Guard: in production, all secrets must be present
  if (!isDev && (!itchApiKey || !privateKeyHex || !gameId)) {
    console.error(
      "verify-license: Missing required environment variables. Set ITCH_API_KEY, ITCH_GAME_ID, and LICENSE_SIGNING_SECRET in Netlify env vars.",
    );
    return {
      statusCode: 503,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: false,
        error:
          "License verification service is not configured. Please contact support.",
      }),
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

    // Validate edition field
    const validEditions = ["pro", "studio"];
    if (!validEditions.includes(edition)) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          ok: false,
          error: "Invalid edition. Must be 'pro' or 'studio'.",
        }),
      };
    }

    // Verify the download key against itch.io (or accept test keys in dev mode)
    if (!isDev && itchApiKey && gameId) {
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
    } else if (isDev) {
      // In development, accept test keys (prefix: "test-key-")
      if (!downloadKey.startsWith("test-key-")) {
        return {
          statusCode: 400,
          body: JSON.stringify({ ok: false, error: "invalid_download_key" }),
        };
      }
    }

    // Generate signed license grant
    const issuedAt = new Date().toISOString();
    // 30-day grant; client enforces a 7-day offline grace period after expiry
    const expiresAt = new Date(
      Date.now() + 30 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const downloadKeyHash = await sha256(downloadKey);

    const dataString = `${edition}:${downloadKeyHash}:${issuedAt}:${expiresAt}`;
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(dataString);

    // Use the env-var private key in production, or fail gracefully in dev if not set
    const signingKeyHex = privateKeyHex ?? "";
    if (!signingKeyHex) {
      return {
        statusCode: 503,
        body: JSON.stringify({
          ok: false,
          error: "Signing key not configured on server.",
        }),
      };
    }

    const privateKeyBuffer = hexToBytes(signingKeyHex);

    const privateKey = await crypto.subtle.importKey(
      "pkcs8",
      privateKeyBuffer as unknown as ArrayBuffer,
      {
        name: "Ed25519",
        namedCurve: "Ed25519",
      } as unknown as AlgorithmIdentifier,
      true,
      ["sign"],
    );

    const signatureBuffer = await crypto.subtle.sign(
      { name: "Ed25519" } as unknown as AlgorithmIdentifier,
      privateKey,
      dataBuffer as unknown as ArrayBuffer,
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
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Internal server error";
    return {
      statusCode: 500,
      body: JSON.stringify({
        ok: false,
        error: message,
      }),
    };
  }
};
