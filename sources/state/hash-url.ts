// `window.location.hash` is immutable in tests, this is so we can use a stub to manage it.
let _hash = "";
let _setHashCalledTimes = 0;

/**
 * `window.isTesting` is set by browser test setup to route hash reads/writes
 * through the in-memory `_hash` rather than `window.location.hash` (the real
 * value is immutable in tests).
 */
type WindowWithTesting = Window & { isTesting?: boolean };

export function getHash(): string {
  const w = window as WindowWithTesting;
  if (w.isTesting) return "#" + _hash;
  return window.location.hash;
}

export function setHash(hash: string): void {
  const w = window as WindowWithTesting;
  if (w.isTesting) {
    _hash = hash[0] === "#" ? hash.substring(1) : hash;
    _setHashCalledTimes++;
    return;
  }
  window.location.hash = hash;
}

export function resetHashCalledTimes(): void {
  _setHashCalledTimes = 0;
}

export function getSetHashCalledTimes(): number {
  return _setHashCalledTimes;
}

// URL hash parameter management
export function getHashParams(): Record<string, string> {
  let hash = getHash().substring(1); // Remove '#'

  // Handle case where hash starts with '?' (some old URLs might have this)
  if (hash.startsWith("?")) {
    hash = hash.substring(1);
  }

  if (!hash) return {};

  return getHashParamsFromString(hash);
}

export function getHashParamsFromString(
  hashString: string,
): Record<string, string> {
  const params: Record<string, string> = {};
  hashString.split("&").forEach((pair) => {
    const [key, value] = pair.split("=");
    if (key && value) {
      // Remove leading '?' from key if present
      const cleanKey = key.startsWith("?") ? key.substring(1) : key;
      params[decodeURIComponent(cleanKey)] = decodeURIComponent(value);
    }
  });
  return params;
}

export function createHashStringFromParams(
  params: Record<string, string>,
): string {
  return Object.entries(params)
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(value)}`,
    )
    .join("&");
}

export function setHashParams(params: Record<string, string>): void {
  const hash = createHashStringFromParams(params);
  setHash(hash);
}
