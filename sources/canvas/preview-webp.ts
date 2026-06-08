import WebPEncoder from "webp-encoder";
import { downloadBlob } from "./download.ts";
import { encodeCanvasesAsGif } from "./preview-gif.ts";
import { renderPreviewAnimationFrameCanvases } from "./preview-animation.ts";
import { getTweenSettingsForAnimation } from "../state/tween-settings.ts";

export type AnimatedWebPEncoder = Pick<
  typeof WebPEncoder,
  "encodeGifImageData"
>;

export async function encodeCanvasesAsAnimatedWebp(
  frames: readonly HTMLCanvasElement[],
  fps: number,
  encoder: AnimatedWebPEncoder = WebPEncoder,
): Promise<Blob> {
  const gifBlob = encodeCanvasesAsGif(frames, fps);
  const gifBytes = new Uint8Array(await gifBlob.arrayBuffer());
  const webpBytes = encoder.encodeGifImageData(gifBytes, gifBytes.length, 1);
  const copy = new Uint8Array(webpBytes.length);
  copy.set(webpBytes);
  return new Blob([copy.buffer], { type: "image/webp" });
}

export async function downloadPreviewAnimationWebp(
  selectedAnimation: string,
  bodyType: string,
): Promise<void> {
  const settings = getTweenSettingsForAnimation(selectedAnimation);
  const frames = renderPreviewAnimationFrameCanvases(settings);
  const blob = await encodeCanvasesAsAnimatedWebp(frames, settings.fps);
  downloadBlob(
    blob,
    `lpc_${bodyType}_${selectedAnimation}_${settings.mode}_${settings.fps}fps.webp`,
  );
}
