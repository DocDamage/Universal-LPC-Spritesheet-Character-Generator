/**
 * Custom Asset Validation — validates imported sprite images before saving.
 *
 * Checks:
 *  - image dimensions
 *  - alpha channel presence
 *  - empty images
 *  - content touching edges (likely cropped)
 *  - expected LPC frame-size multiples
 *  - sheet vs single-image detection
 */

import { FRAME_SIZE } from "./constants.ts";

// ── Types ─────────────────────────────────────────────────────────────────

export type ValidationSeverity = "error" | "warning" | "info";

export type ValidationIssue = {
  severity: ValidationSeverity;
  message: string;
};

export type ValidationResult = {
  passed: boolean;
  issues: ValidationIssue[];
};

// ── Constants ──────────────────────────────────────────────────────────────

/** LPC standard frame width */
const STANDARD_WIDTH = FRAME_SIZE;
/** LPC standard frame height (single row) */
const STANDARD_HEIGHT = FRAME_SIZE;

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Check whether an image has any non-zero alpha pixels.
 */
function hasAlphaChannel(imageData: ImageData): boolean {
  const pixels = imageData.data;
  for (let i = 3; i < pixels.length; i += 4) {
    if (pixels[i]! < 255) return true;
  }
  return false;
}

/**
 * Check whether an image is completely empty (all alpha = 0).
 */
function isEmpty(imageData: ImageData): boolean {
  const pixels = imageData.data;
  for (let i = 3; i < pixels.length; i += 4) {
    if (pixels[i]! > 0) return false;
  }
  return true;
}

/**
 * Check whether non-transparent content touches any edge of the image.
 */
function contentTouchesEdge(imageData: ImageData): boolean {
  const { width, height, data } = imageData;

  // Top edge
  for (let x = 0; x < width; x++) {
    const idx = (0 * width + x) * 4 + 3;
    if (data[idx]! > 0) return true;
  }
  // Bottom edge
  for (let x = 0; x < width; x++) {
    const idx = ((height - 1) * width + x) * 4 + 3;
    if (data[idx]! > 0) return true;
  }
  // Left edge
  for (let y = 0; y < height; y++) {
    const idx = (y * width + 0) * 4 + 3;
    if (data[idx]! > 0) return true;
  }
  // Right edge
  for (let y = 0; y < height; y++) {
    const idx = (y * width + (width - 1)) * 4 + 3;
    if (data[idx]! > 0) return true;
  }

  return false;
}

/**
 * Determine whether dimensions match a known LPC sheet layout.
 * LPC sheets are typically WxH where both are multiples of FRAME_SIZE.
 */
function isKnownSheetLayout(width: number, height: number): boolean {
  return width % STANDARD_WIDTH === 0 && height % STANDARD_HEIGHT === 0;
}

/**
 * Determine if the image looks like a single frame (not a full sheet).
 * A single frame is at or near FRAME_SIZE x FRAME_SIZE.
 */
function isSingleFrame(width: number, height: number): boolean {
  return width <= STANDARD_WIDTH + 4 && height <= STANDARD_HEIGHT + 4;
}

// ── Main validation function ───────────────────────────────────────────────

/**
 * Validate a custom asset image before import.
 *
 * @param imageData - Canvas ImageData for the imported image
 * @param importMode - "weapon" or "spritesheet" or "animation"
 * @returns ValidationResult with issues and whether the check passed
 */
export function validateCustomAsset(
  imageData: ImageData,
  importMode: "weapon" | "spritesheet" | "animation" = "weapon",
): ValidationResult {
  const issues: ValidationIssue[] = [];
  const { width, height } = imageData;

  // 1. Empty image check (error)
  if (isEmpty(imageData)) {
    issues.push({
      severity: "error",
      message: "Image is completely empty. Nothing to import.",
    });
    return { passed: false, issues };
  }

  // 2. Alpha channel check (warning)
  if (!hasAlphaChannel(imageData)) {
    issues.push({
      severity: "warning",
      message:
        "Image has no transparency (alpha channel). LPC assets typically use transparent backgrounds.",
    });
  }

  // 3. Dimensions check
  if (importMode === "weapon") {
    // Weapons are typically single frames
    if (!isSingleFrame(width, height)) {
      issues.push({
        severity: "warning",
        message: `Dimensions (${width}x${height}) are larger than expected for a single weapon frame (${STANDARD_WIDTH}x${STANDARD_HEIGHT}). This may be a spritesheet — consider using spritesheet import.`,
      });
    }

    if (width < 16 || height < 16) {
      issues.push({
        severity: "error",
        message: `Dimensions (${width}x${height}) are too small for a weapon. Minimum 16x16 pixels.`,
      });
    }
  } else if (importMode === "spritesheet") {
    if (!isKnownSheetLayout(width, height)) {
      issues.push({
        severity: "warning",
        message: `Sheet dimensions (${width}x${height}) are not standard LPC multiples (${STANDARD_WIDTH}x${STANDARD_HEIGHT}). May not render correctly.`,
      });
    }

    if (width < STANDARD_WIDTH || height < STANDARD_HEIGHT) {
      issues.push({
        severity: "error",
        message: `Sheet dimensions (${width}x${height}) are smaller than a single LPC frame (${STANDARD_WIDTH}x${STANDARD_HEIGHT}).`,
      });
    }
  } else if (importMode === "animation") {
    // Animation frames: width should be a multiple of FRAME_SIZE
    if (width % STANDARD_WIDTH !== 0) {
      issues.push({
        severity: "warning",
        message: `Animation sheet width (${width}) is not a multiple of frame width (${STANDARD_WIDTH}). Frame slicing may be incorrect.`,
      });
    }
  }

  // 4. Content touching edges (warning)
  if (contentTouchesEdge(imageData)) {
    issues.push({
      severity: "warning",
      message:
        "Content touches one or more image edges. The image may be cropped. Consider adding padding.",
    });
  }

  // 5. Excessively large image (warning)
  if (width > STANDARD_WIDTH * 12 || height > STANDARD_HEIGHT * 12) {
    issues.push({
      severity: "info",
      message: `Image is very large (${width}x${height}). Performance may be affected during rendering.`,
    });
  }

  // Determine pass/fail
  const hasErrors = issues.some((i) => i.severity === "error");

  return {
    passed: !hasErrors,
    issues,
  };
}
