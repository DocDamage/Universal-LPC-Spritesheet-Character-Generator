// Re-exports for backward compatibility; split into focused modules below.

export {
  setHashDeps,
  resetHashDeps,
  getHashDeps,
  getState,
  updateState,
  resetState,
} from "./hash-deps.ts";
export type { HashResolution, HashDeps } from "./hash-deps.ts";

export {
  getHash,
  setHash,
  resetHashCalledTimes,
  getSetHashCalledTimes,
  getHashParams,
  getHashParamsFromString,
  createHashStringFromParams,
  setHashParams,
} from "./hash-url.ts";

export {
  buildNewSelection,
  getHashParamsforSelections,
  syncSelectionsToHash,
  loadSelectionsFromHash,
} from "./hash-selection.ts";

export { initHashChangeListener } from "./hash-listener.ts";
