export const TWEEN_MODES = [
  "off",
  "hold",
  "crossfade",
  "pixel-motion",
] as const;

export type TweenMode = (typeof TWEEN_MODES)[number];

export type TweenEasing =
  | "linear"
  | "ease-in"
  | "ease-out"
  | "ease-in-out"
  | "bounce"
  | "elastic";

export const TWEEN_EASINGS: TweenEasing[] = [
  "linear",
  "ease-in",
  "ease-out",
  "ease-in-out",
  "bounce",
  "elastic",
];

export type TweenSettings = {
  mode: TweenMode;
  inbetweens: number;
  fps: number;
  motionStrength: number;
  alphaThreshold: number;
  easing: TweenEasing;
};

export type TweenPreset = "original" | "smooth" | "pixel-art" | "presentation";

export type TweenStep<T> = {
  from: T;
  to: T;
  sourceIndex: number;
  t: number;
  isTween: boolean;
};

export const DEFAULT_TWEEN_SETTINGS: TweenSettings = {
  mode: "off",
  inbetweens: 1,
  fps: 8,
  motionStrength: 1,
  alphaThreshold: 1,
  easing: "linear",
};

export const TWEEN_PRESETS: Record<TweenPreset, TweenSettings> = {
  original: { ...DEFAULT_TWEEN_SETTINGS },
  smooth: {
    mode: "crossfade",
    inbetweens: 2,
    fps: 12,
    motionStrength: 1,
    alphaThreshold: 1,
    easing: "linear",
  },
  "pixel-art": {
    mode: "pixel-motion",
    inbetweens: 2,
    fps: 12,
    motionStrength: 1,
    alphaThreshold: 16,
    easing: "linear",
  },
  presentation: {
    mode: "crossfade",
    inbetweens: 4,
    fps: 18,
    motionStrength: 1,
    alphaThreshold: 1,
    easing: "linear",
  },
};

export function normalizeTweenInbetweens(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_TWEEN_SETTINGS.inbetweens;
  }
  return Math.min(4, Math.max(0, Math.round(value)));
}

export function normalizeTweenFps(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_TWEEN_SETTINGS.fps;
  }
  return Math.min(24, Math.max(1, Math.round(value)));
}

export function normalizeTweenMotionStrength(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_TWEEN_SETTINGS.motionStrength;
  }
  return Math.min(2, Math.max(0, Math.round(value * 10) / 10));
}

export function normalizeTweenAlphaThreshold(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_TWEEN_SETTINGS.alphaThreshold;
  }
  return Math.min(255, Math.max(1, Math.round(value)));
}

export function normalizeTweenSettings(
  settings: Partial<TweenSettings>,
): TweenSettings {
  return {
    mode: settings.mode && isTweenMode(settings.mode) ? settings.mode : "off",
    inbetweens: normalizeTweenInbetweens(
      settings.inbetweens ?? DEFAULT_TWEEN_SETTINGS.inbetweens,
    ),
    fps: normalizeTweenFps(settings.fps ?? DEFAULT_TWEEN_SETTINGS.fps),
    motionStrength: normalizeTweenMotionStrength(
      settings.motionStrength ?? DEFAULT_TWEEN_SETTINGS.motionStrength,
    ),
    alphaThreshold: normalizeTweenAlphaThreshold(
      settings.alphaThreshold ?? DEFAULT_TWEEN_SETTINGS.alphaThreshold,
    ),
    easing: settings.easing || "linear",
  };
}

export function isTweenMode(value: string): value is TweenMode {
  return TWEEN_MODES.includes(value as TweenMode);
}

function applyEasing(t: number, easing: TweenEasing): number {
  if (easing === "linear") return t;
  if (easing === "ease-in") return t * t;
  if (easing === "ease-out") return t * (2 - t);
  if (easing === "ease-in-out") {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
  }
  if (easing === "bounce") {
    let tempT = t;
    if (tempT < 1 / 2.75) {
      return 7.5625 * tempT * tempT;
    } else if (tempT < 2 / 2.75) {
      return 7.5625 * (tempT -= 1.5 / 2.75) * tempT + 0.75;
    } else if (tempT < 2.5 / 2.75) {
      return 7.5625 * (tempT -= 2.25 / 2.75) * tempT + 0.9375;
    } else {
      return 7.5625 * (tempT -= 2.625 / 2.75) * tempT + 0.984375;
    }
  }
  if (easing === "elastic") {
    if (t === 0 || t === 1) return t;
    const p = 0.3;
    return (
      Math.pow(2, -10 * t) * Math.sin(((t - p / 4) * (2 * Math.PI)) / p) + 1
    );
  }
  return t;
}

export function buildTweenSteps<T>(
  frames: readonly T[],
  settings: Pick<TweenSettings, "mode" | "inbetweens" | "easing">,
): TweenStep<T>[] {
  if (frames.length === 0) {
    return [];
  }

  const inbetweens =
    settings.mode === "off" ? 0 : normalizeTweenInbetweens(settings.inbetweens);
  const steps: TweenStep<T>[] = [];

  frames.forEach((frame, index) => {
    const nextFrame = frames[(index + 1) % frames.length] as T;
    steps.push({
      from: frame,
      to: nextFrame,
      sourceIndex: index,
      t: 0,
      isTween: false,
    });

    for (let tweenIndex = 1; tweenIndex <= inbetweens; tweenIndex += 1) {
      const rawT = tweenIndex / (inbetweens + 1);
      const easedT = applyEasing(rawT, settings.easing || "linear");
      steps.push({
        from: frame,
        to: nextFrame,
        sourceIndex: index,
        t: Math.max(0, Math.min(1, easedT)),
        isTween: true,
      });
    }
  });

  return steps;
}

export function tweenImageData(
  from: ImageData,
  to: ImageData,
  mode: TweenMode,
  t: number,
  settings: Partial<
    Pick<TweenSettings, "motionStrength" | "alphaThreshold">
  > = {},
): ImageData {
  if (from.width !== to.width || from.height !== to.height) {
    throw new Error("Cannot tween ImageData with different dimensions");
  }

  if (mode === "crossfade") {
    return crossfadeImageData(from, to, clampUnit(t));
  }

  if (mode === "pixel-motion") {
    return pixelMotionImageData(from, to, clampUnit(t), settings);
  }

  return copyImageData(t < 1 ? from : to);
}

export function drawTweenedCanvas(
  targetCtx: CanvasRenderingContext2D,
  fromCanvas: HTMLCanvasElement,
  toCanvas: HTMLCanvasElement,
  mode: TweenMode,
  t: number,
  settings: Partial<
    Pick<TweenSettings, "motionStrength" | "alphaThreshold">
  > = {},
): void {
  if (
    fromCanvas.width !== toCanvas.width ||
    fromCanvas.height !== toCanvas.height
  ) {
    throw new Error("Cannot tween canvases with different dimensions");
  }

  const fromCtx = getReadableContext(fromCanvas);
  const toCtx = getReadableContext(toCanvas);
  const tweened = tweenImageData(
    fromCtx.getImageData(0, 0, fromCanvas.width, fromCanvas.height),
    toCtx.getImageData(0, 0, toCanvas.width, toCanvas.height),
    mode,
    t,
    settings,
  );

  const tweenCanvas = document.createElement("canvas");
  tweenCanvas.width = fromCanvas.width;
  tweenCanvas.height = fromCanvas.height;
  const tweenCtx = getReadableContext(tweenCanvas);
  tweenCtx.putImageData(tweened, 0, 0);
  targetCtx.drawImage(tweenCanvas, 0, 0);
}

function crossfadeImageData(
  from: ImageData,
  to: ImageData,
  t: number,
): ImageData {
  const output = new ImageData(from.width, from.height);
  const fromData = from.data;
  const toData = to.data;
  const outputData = output.data;

  for (let index = 0; index < outputData.length; index += 1) {
    outputData[index] = Math.round(
      (fromData[index] as number) * (1 - t) + (toData[index] as number) * t,
    );
  }

  return output;
}

function pixelMotionImageData(
  from: ImageData,
  to: ImageData,
  t: number,
  settings: Partial<Pick<TweenSettings, "motionStrength" | "alphaThreshold">>,
): ImageData {
  const output = new ImageData(from.width, from.height);
  const motionStrength = normalizeTweenMotionStrength(
    settings.motionStrength ?? DEFAULT_TWEEN_SETTINGS.motionStrength,
  );
  const alphaThreshold = normalizeTweenAlphaThreshold(
    settings.alphaThreshold ?? DEFAULT_TWEEN_SETTINGS.alphaThreshold,
  );
  const fromCentroid = getOpaqueCentroid(from, alphaThreshold);
  const toCentroid = getOpaqueCentroid(to, alphaThreshold);

  if (!fromCentroid || !toCentroid) {
    return copyImageData(t < 0.5 ? from : to);
  }

  if (t < 0.5) {
    const dx = Math.round((toCentroid.x - fromCentroid.x) * t * motionStrength);
    const dy = Math.round((toCentroid.y - fromCentroid.y) * t * motionStrength);
    blitShiftedOpaquePixels(from, output, dx, dy, alphaThreshold);
  } else {
    const dx = Math.round(
      (fromCentroid.x - toCentroid.x) * (1 - t) * motionStrength,
    );
    const dy = Math.round(
      (fromCentroid.y - toCentroid.y) * (1 - t) * motionStrength,
    );
    blitShiftedOpaquePixels(to, output, dx, dy, alphaThreshold);
  }

  return output;
}

function getOpaqueCentroid(
  imageData: ImageData,
  alphaThreshold: number,
): { x: number; y: number } | null {
  let totalX = 0;
  let totalY = 0;
  let count = 0;

  for (let y = 0; y < imageData.height; y += 1) {
    for (let x = 0; x < imageData.width; x += 1) {
      const alpha = imageData.data[(y * imageData.width + x) * 4 + 3];
      if (alpha && alpha >= alphaThreshold) {
        totalX += x;
        totalY += y;
        count += 1;
      }
    }
  }

  if (count === 0) {
    return null;
  }

  return {
    x: totalX / count,
    y: totalY / count,
  };
}

function blitShiftedOpaquePixels(
  source: ImageData,
  target: ImageData,
  dx: number,
  dy: number,
  alphaThreshold: number,
): void {
  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const sourceIndex = (y * source.width + x) * 4;
      const alpha = source.data[sourceIndex + 3];
      if (!alpha || alpha < alphaThreshold) {
        continue;
      }

      const targetX = x + dx;
      const targetY = y + dy;
      if (
        targetX < 0 ||
        targetX >= target.width ||
        targetY < 0 ||
        targetY >= target.height
      ) {
        continue;
      }

      const targetIndex = (targetY * target.width + targetX) * 4;
      target.data[targetIndex] = source.data[sourceIndex] as number;
      target.data[targetIndex + 1] = source.data[sourceIndex + 1] as number;
      target.data[targetIndex + 2] = source.data[sourceIndex + 2] as number;
      target.data[targetIndex + 3] = source.data[sourceIndex + 3] as number;
    }
  }
}

function copyImageData(source: ImageData): ImageData {
  return new ImageData(
    new Uint8ClampedArray(source.data),
    source.width,
    source.height,
  );
}

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

function getReadableContext(
  canvas: HTMLCanvasElement,
): CanvasRenderingContext2D {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new Error("Failed to get 2D context");
  }
  context.imageSmoothingEnabled = false;
  return context;
}
