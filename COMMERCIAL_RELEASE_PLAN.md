# Commercial Release Plan: Baked Tiers + Mandatory itch.io Verification

## Goal

Ship the app as downloadable desktop builds with separate Free, Pro, and Studio artifacts. All assets remain free. Paid value comes only from feature workflows. Paid builds must verify an itch.io download key before unlocking paid features.

This plan intentionally avoids putting any itch.io API secret in the Electron app. The desktop app talks to a small verification service, and that service talks to itch.io.

Reference: itch.io documents download-key lookup through the server-side API at `https://api.itch.io/games/GAME_ID/download_keys`, authenticated with your itch.io API key.

## Product Model

### Free

Price: `$0`

Includes:

- Full free asset access
- Basic character creator
- Basic selection/randomization workflows
- Single PNG export
- Credits/license display

Locked out:

- Advanced part editor
- Custom asset imports
- Animated GIF/WebP exports
- ZIP/batch exports
- Engine presets
- Studio project tools

### Pro

Recommended price: `$9.99`

Includes Free plus:

- Advanced part editor
- Custom imports
- Animation preview exports
- ZIP exports
- Batch export workflows
- Engine preset exports
- Professional animation QA exports

### Studio

Recommended price: `$19.99`

Includes Pro plus:

- Studio project library
- Bulk workflow tools
- Studio handoff ZIP/report
- Project version notes
- Studio-grade batch/project organization features

## Build Artifacts

Use separate build-time artifacts:

```text
Free Desktop
Pro Desktop
Studio Desktop
```

Optional later:

```text
Free Web
Pro Web
Studio Web
```

Do not sell separate “updates” SKUs for the first release. Use itch.io’s existing file/update flow first. Add an updater after the desktop release is stable.

## Build-Time Environment

Add these build variables:

```env
VITE_BUILD_TIER=free|pro|studio
VITE_BUILD_CHANNEL=itch|dev
VITE_BUILD_REQUIRES_LICENSE=false|true
VITE_BUILD_PRICE=0|9.99|19.99
VITE_APP_VERSION=0.1.0
VITE_ITCH_GAME_ID=your_game_id
VITE_LICENSE_VERIFY_URL=https://your-domain.example.com/api/verify-license
```

Rules:

- `free`: `VITE_BUILD_REQUIRES_LICENSE=false`
- `pro`: `VITE_BUILD_REQUIRES_LICENSE=true`
- `studio`: `VITE_BUILD_REQUIRES_LICENSE=true`
- Paid desktop builds must not allow changing to another tier through the UI.

## App Behavior

### Startup Flow

1. App reads baked tier from `import.meta.env.VITE_BUILD_TIER`.
2. App locks `state.appPlan` to that tier.
3. If tier is `free`, app starts immediately.
4. If tier is `pro` or `studio`, app checks for a cached local license grant.
5. If no valid cached grant exists, show first-run license prompt.
6. User enters itch.io download key.
7. App sends key to the verification service.
8. If verified, app stores signed local license grant and unlocks the baked tier.
9. If verification fails, app stays in locked paid-build state with only license prompt, credits, and support links available.

### Paid Build Locked State

Paid builds should not silently fall back to Free after failed verification. That makes paid builds easy to redistribute as a “free plus hidden paid binary.”

Locked state should show:

- Product name
- Baked edition name: Pro or Studio
- License key input
- Verify button
- Offline grace message if applicable
- Link to itch.io purchase/download page
- Troubleshooting text

### Plan Selector

Free build:

- Show plan selector as read-only or hide paid modes.
- Prefer read-only display: “Free Edition”.

Paid builds:

- Remove plan selector entirely, or show read-only “Pro Edition” / “Studio Edition”.
- Never allow selecting a higher/lower plan at runtime.

Development build:

- Keep plan selector for testing if `VITE_BUILD_CHANNEL=dev`.

## Mandatory itch.io Verification

### Important Security Rule

Never call itch.io’s server-side API directly from the Electron renderer or packaged app with your itch.io API key.

Bad:

```text
Electron app -> itch.io API
```

Good:

```text
Electron app -> your verification service -> itch.io API
```

### Verification Request

Desktop app sends:

```json
{
  "downloadKey": "user-entered-key",
  "edition": "pro",
  "appVersion": "0.1.0",
  "platform": "win32",
  "machineIdHash": "optional-hash"
}
```

Do not send raw machine-identifying details unless necessary. If machine binding is used, hash a stable local identifier with a server-side salt or app-specific strategy.

### Verification Service

Environment variables:

```env
ITCH_API_KEY=secret
ITCH_GAME_ID=123456
LICENSE_SIGNING_SECRET=long_random_secret
ALLOWED_EDITIONS=pro,studio
```

Endpoint:

```text
POST /api/verify-license
```

Server steps:

1. Validate request shape.
2. Rate-limit by IP and download key.
3. Call itch.io server-side download-key endpoint for `ITCH_GAME_ID`.
4. Confirm response contains a valid `download_key`.
5. Map the key/purchase to an edition.
6. Return a signed license grant.

Example success response:

```json
{
  "ok": true,
  "license": {
    "edition": "pro",
    "downloadKeyHash": "sha256...",
    "issuedAt": "2026-06-09T00:00:00.000Z",
    "expiresAt": "2026-07-09T00:00:00.000Z",
    "signature": "base64url..."
  }
}
```

Example failure response:

```json
{
  "ok": false,
  "error": "invalid_download_key"
}
```

### Edition Mapping

Pick one of these approaches:

#### Recommended for First Release: Separate itch.io Uploads/Rewards

Create distinct files or rewards for:

- Pro
- Studio

In the verification service, maintain a small allowlist/mapping if itch.io metadata is not enough to infer edition.

Example server-side mapping:

```json
{
  "pro": ["pro-upload-id-or-reward-id"],
  "studio": ["studio-upload-id-or-reward-id"]
}
```

If itch.io download-key response does not provide enough edition detail, use separate game pages:

```text
LPC Character Generator Pro
LPC Character Generator Studio
```

This is less elegant, but it makes verification simpler.

#### Later: Account-Based Verification

Use itch.io OAuth/app manifest/user identity if you want stronger ownership binding. This is more work and should not block the first release.

## Local License Cache

Store a signed local grant:

```json
{
  "edition": "pro",
  "downloadKeyHash": "sha256...",
  "issuedAt": "2026-06-09T00:00:00.000Z",
  "expiresAt": "2026-07-09T00:00:00.000Z",
  "signature": "..."
}
```

Storage options:

- Electron main process app data directory
- OS credential store later
- Plain JSON is acceptable for first release if signature validation prevents casual editing

The app should verify:

- Signature is valid
- Edition matches baked tier
- Grant is not expired

Suggested cache lifetime:

- 30 days online refresh
- 7 day offline grace after expiry

If mandatory online verification is preferred:

- Set cache lifetime shorter
- No offline grace

Recommendation: allow a grace period. Users get annoyed when paid desktop apps break on travel or bad internet.

## Signing Local Grants

The verification service signs the grant. The app verifies the signature.

Options:

- HMAC: simplest, but verifier secret in app can be extracted
- Public/private signature: better; server signs with private key, app verifies with public key

Recommended:

- Server signs with Ed25519 private key
- App embeds public key only

This does not stop code patching, but it prevents casual local JSON editing.

## Feature Enforcement

Current feature gates should continue to work, but the source of truth changes:

```ts
effectivePlan = bakedTier;
```

For paid builds:

```ts
if (!licenseVerified) {
  effectivePlan = "locked";
}
```

Add a new state:

```ts
type LicenseState =
  | { kind: "not-required" }
  | { kind: "checking" }
  | { kind: "required" }
  | { kind: "valid"; edition: "pro" | "studio"; expiresAt: string }
  | { kind: "invalid"; reason: string }
  | { kind: "offline-grace"; edition: "pro" | "studio"; expiresAt: string };
```

Gate behavior:

- Free build: no license state needed
- Pro build: unlock only if verified Pro or Studio entitlement is accepted
- Studio build: unlock only if verified Studio entitlement is accepted

Studio keys should unlock Pro functionality because Studio includes Pro.

Pro keys should not unlock Studio builds.

## UI Work

### License Prompt Modal

Create:

```text
sources/components/desktop/LicenseGateModal.ts
```

Fields:

- Download key input
- Verify button
- Purchase/download link
- Error text
- Offline grace state
- “Paste key from itch.io download URL” helper

Download URL helper:

```text
https://creator.itch.io/app/download/YOUR_DOWNLOAD_KEY
```

If user pastes a whole URL, extract the final path segment as the key.

### About Modal

Show:

- Edition
- License status
- App version
- Last verification date

### Settings / Support

Add:

- Re-verify license
- Clear license
- Copy diagnostic info

## Server Implementation Options

### Option A: Netlify Function

Good for:

- Cheap/free start
- Easy deploy
- Simple endpoint

Files:

```text
netlify/functions/verify-license.ts
```

Pros:

- Low operational work
- Works well with current repo if Netlify is already used

Cons:

- Need environment variables configured
- Rate limiting may need extra care

### Option B: Cloudflare Worker

Good for:

- Low cost
- Built-in edge deployment
- KV/Durable Objects for rate limiting later

Pros:

- Strong fit for tiny verification endpoint

Cons:

- Separate deployment/tooling

### Option C: Small VPS/API

Good for:

- Maximum control

Cons:

- More maintenance

Recommendation: start with Netlify Function or Cloudflare Worker.

## Build Scripts

Add scripts like:

```json
{
  "build:free": "cross-env VITE_BUILD_TIER=free VITE_BUILD_REQUIRES_LICENSE=false vite build",
  "build:pro": "cross-env VITE_BUILD_TIER=pro VITE_BUILD_REQUIRES_LICENSE=true vite build",
  "build:studio": "cross-env VITE_BUILD_TIER=studio VITE_BUILD_REQUIRES_LICENSE=true vite build"
}
```

For Electron packaging:

```json
{
  "dist:free:win": "cross-env VITE_BUILD_TIER=free VITE_BUILD_REQUIRES_LICENSE=false npm run electron:dist",
  "dist:pro:win": "cross-env VITE_BUILD_TIER=pro VITE_BUILD_REQUIRES_LICENSE=true npm run electron:dist",
  "dist:studio:win": "cross-env VITE_BUILD_TIER=studio VITE_BUILD_REQUIRES_LICENSE=true npm run electron:dist"
}
```

Use distinct artifact names:

```text
LPC-Character-Generator-Free-0.1.0-win.exe
LPC-Character-Generator-Pro-0.1.0-win.exe
LPC-Character-Generator-Studio-0.1.0-win.exe
```

## Electron Packaging Notes

Minimum packaging requirements:

- App name includes edition or about screen clearly shows edition
- Windows icon
- App version from `VITE_APP_VERSION` or package version
- User data path does not collide between editions unless intentional
- License cache path is edition-aware

Recommended user data names:

```text
LPC Character Generator Free
LPC Character Generator Pro
LPC Character Generator Studio
```

This prevents Free and Studio local settings from confusing each other during testing.

## Update Strategy

First release:

- Manual itch.io updates
- App shows version in About
- Optional “Check latest version” link to itch.io page

Later:

- Add update JSON:

```json
{
  "version": "0.1.1",
  "url": "https://your-itch-page",
  "notes": "Bug fixes and export improvements."
}
```

Do not charge separately for updates until there is a real maintenance plan.

## Security Reality

This system prevents casual piracy:

- Paid builds are locked without a verified key
- API secrets are not in the app
- Local license cache is signed
- Pro/Studio features are not available in Free builds

This system does not stop determined attackers:

- Electron apps can be unpacked
- GPL/source availability means code can be modified
- Feature gates can be patched out by technical users

The business goal is reasonable friction, not perfect DRM.

## Implementation Phases

### Phase 1: Build-Time Tier Lock

Tasks:

- Add build config reader module.
- Add `BuildTier` type.
- Lock `state.appPlan` from env.
- Hide/remove plan selector for non-dev builds.
- Ensure Free build cannot switch to Pro/Studio at runtime.
- Add tests for build-tier behavior.

Acceptance:

- Free build always reports Free.
- Pro build always reports Pro after license unlock.
- Studio build always reports Studio after license unlock.
- Dev build can still test all plans.

### Phase 2: License State

Tasks:

- Add `license-state.ts`.
- Add local grant storage.
- Add grant signature verification.
- Add license state transitions.
- Add app startup license check.

Acceptance:

- Paid build without grant shows license prompt.
- Paid build with valid grant unlocks.
- Expired grant shows reverify/offline grace behavior.
- Wrong-edition grant does not unlock.

### Phase 3: Verification Service

Tasks:

- Implement `/api/verify-license`.
- Store itch.io API key only on server.
- Call itch.io download-key endpoint.
- Validate game ID and key.
- Map key to Pro/Studio.
- Sign license grant.
- Add rate limiting.
- Add structured errors.

Acceptance:

- Valid Pro key returns Pro grant.
- Valid Studio key returns Studio grant.
- Invalid key returns safe error.
- API key never appears in built app.

### Phase 4: License UI

Tasks:

- Build `LicenseGateModal`.
- Add download-key parsing from full URL.
- Add verify/retry states.
- Add About modal license details.
- Add clear/reverify license action.

Acceptance:

- User can paste itch.io URL or raw key.
- Success unlocks immediately.
- Failure is understandable.
- Reverify path works.

### Phase 5: Desktop Packaging

Tasks:

- Choose Electron packaging tool.
- Add Windows app icon.
- Add per-edition artifact names.
- Add edition-aware user data path.
- Build Free/Pro/Studio installers.
- Smoke test each installer.

Acceptance:

- Each EXE launches.
- Free opens without license.
- Pro/Studio require key.
- Pro key does not unlock Studio.
- Studio key unlocks Studio.

### Phase 6: Release QA

Tasks:

- Run type-check, lint, tests, build.
- Browser smoke.
- Packaged EXE smoke.
- Export smoke: PNG, GIF, WebP, ZIP.
- Custom import smoke.
- Studio project smoke.
- License verification smoke.
- Offline grace smoke.

Acceptance:

- No console errors in normal startup.
- No broken export paths.
- No paid feature unlock without valid key in paid builds.
- README/release notes match shipped features.

## Test Checklist

### Unit / Node

```text
npm run type-check
npm run lint
npm run test:node
npm run build
```

Add tests for:

- Build tier parsing
- Feature gate behavior under locked license state
- License grant signature verification
- Expired license handling
- Edition mismatch
- Download key URL parsing

### Browser Smoke

Free:

- Opens without license prompt
- Paid controls are gated
- PNG export works

Pro:

- Shows license prompt first run
- Valid Pro key unlocks
- GIF/WebP/ZIP exports work
- Studio-only tools remain gated

Studio:

- Shows license prompt first run
- Valid Studio key unlocks
- Studio tools work
- Pro features work

### Packaged EXE Smoke

For each edition:

- Install/launch
- Confirm edition text
- Confirm user data separation
- Confirm license behavior
- Confirm exports write files
- Confirm app restarts with expected state

## Open Decisions

Before implementation, decide:

1. Will Pro and Studio be separate itch.io game pages or separate uploads/rewards under one page?
2. What is the exact itch.io game ID?
3. What domain/service will host license verification?
4. Is offline grace allowed? Recommended: yes, 7 days.
5. Should Studio keys unlock the Pro binary too? Recommended: yes.
6. Should Pro keys unlock older Pro versions forever? Recommended: yes for first release.

## Recommended First Milestone

Build and ship:

```text
Free Desktop
Pro Desktop with mandatory itch.io verification
Studio Desktop with mandatory itch.io verification
```

Skip:

- Auto updater
- Subscription/maintenance pricing
- Cloud accounts
- Strong machine locking

Reason:

- Gets you selling quickly.
- Keeps support burden manageable.
- Protects paid features from casual sharing.
- Keeps all art/assets free as required.
