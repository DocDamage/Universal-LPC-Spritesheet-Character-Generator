import { GIFEncoder, applyPalette, quantize } from "gifenc";
import { downloadBlob } from "./download.ts";
import { renderPreviewAnimationFrameCanvases } from "./preview-animation.ts";
import { getTweenSettingsForAnimation } from "../state/tween-settings.ts";

export function encodeCanvasesAsGif(
  frames: readonly HTMLCanvasElement[],
  fps: number,
): Blob {
  if (frames.length === 0) {
    throw new Error("Cannot encode an empty GIF");
  }

  const firstFrame = frames[0] as HTMLCanvasElement;
  const width = firstFrame.width;
  const height = firstFrame.height;
  const delay = Math.max(1, Math.round(1000 / fps));
  const gif = GIFEncoder();

  for (const frame of frames) {
    if (frame.width !== width || frame.height !== height) {
      throw new Error("All GIF frames must have the same dimensions");
    }

    const ctx = frame.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      throw new Error("Failed to get GIF frame context");
    }
    const imageData = ctx.getImageData(0, 0, width, height);
    const palette = quantize(imageData.data, 256, {
      format: "rgba4444",
      oneBitAlpha: true,
    });
    const index = applyPalette(imageData.data, palette, "rgba4444");
    gif.writeFrame(index, width, height, { palette, delay });
  }

  gif.finish();
  const bytes = gif.bytes();
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  return new Blob([copy.buffer], { type: "image/gif" });
}

export async function downloadPreviewAnimationGif(
  selectedAnimation: string,
  bodyType: string,
): Promise<void> {
  const settings = getTweenSettingsForAnimation(selectedAnimation);
  const frames = renderPreviewAnimationFrameCanvases(settings);
  const blob = encodeCanvasesAsGif(frames, settings.fps);
  downloadBlob(
    blob,
    `lpc_${bodyType}_${selectedAnimation}_${settings.mode}_${settings.fps}fps.gif`,
  );
}
