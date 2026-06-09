// @ts-nocheck

/**
 * Shared Node-test mocking helpers.  Replaces manual monkey-patching with
 * reversible helpers that always restore the original value, even when
 * assertions throw.
 */

/**
 * Temporarily replaces `console.error` with the supplied handler.
 * Automatically restored after `fn` completes or throws.
 *
 * @param {(line: string) => void} handler
 * @param {() => void | Promise<void>} fn
 */
export async function withConsoleError(handler, fn) {
  const original = console.error;
  console.error = (...args) => handler(args.join(" "));
  try {
    await fn();
  } finally {
    console.error = original;
  }
}

/**
 * Temporarily replaces `fs.writeFileSync` with the supplied handler.
 * The original `writeFileSync` is passed as the third argument so the
 * handler can delegate if needed.  Automatically restored after `fn`
 * completes or throws.
 *
 * @param {typeof import("node:fs")} fs
 * @param {(filePath: string, contents: string, original: typeof fs.writeFileSync) => void} handler
 * @param {() => void | Promise<void>} fn
 */
export async function withWriteFileSync(fs, handler, fn) {
  const original = fs.writeFileSync;
  fs.writeFileSync = (filePath, contents) =>
    handler(filePath, contents, original);
  try {
    await fn();
  } finally {
    fs.writeFileSync = original;
  }
}

/**
 * Temporarily overrides `process.platform` with the given value.
 * Automatically restored after `fn` completes or throws.
 *
 * @param {string} platform
 * @param {() => void | Promise<void>} fn
 */
export async function withProcessPlatform(platform, fn) {
  const original = process.platform;
  Object.defineProperty(process, "platform", { value: platform });
  try {
    await fn();
  } finally {
    Object.defineProperty(process, "platform", { value: original });
  }
}
