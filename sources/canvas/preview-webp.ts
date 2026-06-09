import { downloadBlob } from "./download.ts";
import { encodeCanvasesAsGif } from "./preview-gif.ts";
import { renderPreviewAnimationFrameCanvases } from "./preview-animation.ts";
import { getTweenSettingsForAnimation } from "../state/tween-settings.ts";

export interface WebPFrameInput {
  bytes: Uint8Array;
  duration: number;
  x?: number;
  y?: number;
  noBlend?: boolean;
  disposeToBackground?: boolean;
}

export interface WebPEncoderOptions {
  width?: number;
  height?: number;
  loopCount?: number;
  backgroundColor?: [number, number, number, number];
}

export type AnimatedWebPEncoderAdapter = {
  encodeGifImageData(
    bytes: Uint8Array,
    length: number,
    quality: number,
  ): Uint8Array;
};

interface ParsedFrameInfo {
  width: number;
  height: number;
  hasAlpha: boolean;
  alphaChunk: Uint8Array | null;
  bitstreamChunk: {
    fourcc: "VP8 " | "VP8L";
    bytes: Uint8Array;
  };
}

export class AnimatedWebPEncoder {
  public static encode(
    frames: WebPFrameInput[],
    options: WebPEncoderOptions = {},
  ): Uint8Array {
    if (frames.length === 0) {
      throw new Error(
        "At least one frame is required to encode an animated WebP.",
      );
    }

    const parsedFrames: ParsedFrameInfo[] = frames.map((f, index) => {
      try {
        return this.parseSingleFrameWebP(f.bytes);
      } catch (err) {
        throw new Error(
          `Failed to parse frame at index ${index}: ${(err as Error).message}`,
        );
      }
    });

    const canvasWidth =
      options.width ?? Math.max(...parsedFrames.map((f) => f.width));
    const canvasHeight =
      options.height ?? Math.max(...parsedFrames.map((f) => f.height));
    const hasAlphaGlobal = parsedFrames.some((f) => f.hasAlpha);

    const vp8xChunk = this.createVP8XChunk(
      canvasWidth,
      canvasHeight,
      hasAlphaGlobal,
    );
    const animChunk = this.createANIMChunk(
      options.loopCount ?? 0,
      options.backgroundColor ?? [0, 0, 0, 0],
    );

    const anmfChunks: Uint8Array[] = [];
    for (let i = 0; i < frames.length; i++) {
      const f = frames[i]!;
      const parsed = parsedFrames[i]!;
      const anmf = this.createANMFChunk(
        f.x ?? 0,
        f.y ?? 0,
        parsed.width || canvasWidth,
        parsed.height || canvasHeight,
        f.duration,
        !!f.noBlend,
        !!f.disposeToBackground,
        parsed.alphaChunk,
        parsed.bitstreamChunk.bytes,
      );
      anmfChunks.push(anmf);
    }

    const totalChunksSize =
      vp8xChunk.length +
      animChunk.length +
      anmfChunks.reduce((sum, chunk) => sum + chunk.length, 0);

    const fileHeaderSize = 12;
    const outBuffer = new Uint8Array(fileHeaderSize + totalChunksSize);

    this.writeString(outBuffer, 0, "RIFF");
    this.writeUint32LE(outBuffer, 4, totalChunksSize + 4);
    this.writeString(outBuffer, 8, "WEBP");

    let offset = fileHeaderSize;
    outBuffer.set(vp8xChunk, offset);
    offset += vp8xChunk.length;

    outBuffer.set(animChunk, offset);
    offset += animChunk.length;

    for (const anmf of anmfChunks) {
      outBuffer.set(anmf, offset);
      offset += anmf.length;
    }

    return outBuffer;
  }

  private static parseSingleFrameWebP(fileBytes: Uint8Array): ParsedFrameInfo {
    if (fileBytes.byteLength < 12) {
      throw new Error("Truncated WebP container.");
    }

    if (
      this.readString(fileBytes, 0, 4) !== "RIFF" ||
      this.readString(fileBytes, 8, 4) !== "WEBP"
    ) {
      throw new Error("Invalid WebP container header.");
    }

    let width = 0;
    let height = 0;
    let hasAlpha = false;
    let alphaChunk: Uint8Array | null = null;
    let bitstreamChunk: ParsedFrameInfo["bitstreamChunk"] | null = null;

    let offset = 12;
    while (offset + 8 <= fileBytes.byteLength) {
      const fourcc = this.readString(fileBytes, offset, 4);
      const size = this.readUint32LE(fileBytes, offset + 4);
      const paddedSize = (size + 1) & ~1;

      if (offset + 8 + size > fileBytes.byteLength) {
        throw new Error(
          `Chunk ${fourcc} specifies size ${size} out of file bounds.`,
        );
      }

      const payload = fileBytes.subarray(offset + 8, offset + 8 + size);
      const fullChunkBytes = fileBytes.subarray(
        offset,
        offset + 8 + paddedSize,
      );

      if (fourcc === "VP8X") {
        if (size >= 10) {
          const flags = payload[0]!;
          hasAlpha = !!(flags & 0x10);
          width = (payload[4]! | (payload[5]! << 8) | (payload[6]! << 16)) + 1;
          height = (payload[7]! | (payload[8]! << 8) | (payload[9]! << 16)) + 1;
        }
      } else if (fourcc === "ALPH") {
        hasAlpha = true;
        alphaChunk = fullChunkBytes;
      } else if (fourcc === "VP8 ") {
        if (!bitstreamChunk) {
          bitstreamChunk = { fourcc: "VP8 ", bytes: fullChunkBytes };
        }
        if (width === 0 || height === 0) {
          const dims = this.parseVP8Dimensions(payload);
          if (dims) {
            width = dims.width;
            height = dims.height;
          }
        }
      } else if (fourcc === "VP8L") {
        if (!bitstreamChunk) {
          bitstreamChunk = { fourcc: "VP8L", bytes: fullChunkBytes };
        }
        const losslessInfo = this.parseVP8LDimensions(payload);
        if (losslessInfo) {
          if (width === 0 || height === 0) {
            width = losslessInfo.width;
            height = losslessInfo.height;
          }
          if (losslessInfo.hasAlpha) {
            hasAlpha = true;
          }
        }
      }

      offset += 8 + paddedSize;
    }

    if (!bitstreamChunk) {
      throw new Error("No image data chunks (VP8/VP8L) found.");
    }

    return {
      width,
      height,
      hasAlpha,
      alphaChunk,
      bitstreamChunk,
    };
  }

  private static parseVP8Dimensions(
    payload: Uint8Array,
  ): { width: number; height: number } | null {
    if (payload.length < 10) return null;
    const bits = payload[0]! | (payload[1]! << 8) | (payload[2]! << 16);
    const isKeyFrame = !(bits & 1);
    if (!isKeyFrame) return null;

    if (payload[3] !== 0x9d || payload[4] !== 0x01 || payload[5] !== 0x2a) {
      return null;
    }
    const width = ((payload[7]! << 8) | payload[6]!) & 0x3fff;
    const height = ((payload[9]! << 8) | payload[8]!) & 0x3fff;
    return { width, height };
  }

  private static parseVP8LDimensions(
    payload: Uint8Array,
  ): { width: number; height: number; hasAlpha: boolean } | null {
    if (payload.length < 5) return null;
    if (payload[0] !== 0x2f) return null;

    const value =
      payload[1]! |
      (payload[2]! << 8) |
      (payload[3]! << 16) |
      (payload[4]! << 24);
    const width = (value & 0x3fff) + 1;
    const height = ((value >> 14) & 0x3fff) + 1;
    const hasAlpha = !!(value & (1 << 28));
    return { width, height, hasAlpha };
  }

  private static createVP8XChunk(
    width: number,
    height: number,
    hasAlpha: boolean,
  ): Uint8Array {
    const chunk = new Uint8Array(18);
    this.writeString(chunk, 0, "VP8X");
    this.writeUint32LE(chunk, 4, 10);

    const flags = (hasAlpha ? 0x10 : 0x00) | 0x02;
    chunk[8] = flags;

    this.writeUint24LE(chunk, 12, width - 1);
    this.writeUint24LE(chunk, 15, height - 1);
    return chunk;
  }

  private static createANIMChunk(
    loopCount: number,
    bgColor: [number, number, number, number],
  ): Uint8Array {
    const chunk = new Uint8Array(14);
    this.writeString(chunk, 0, "ANIM");
    this.writeUint32LE(chunk, 4, 6);

    chunk[8] = bgColor[2];
    chunk[9] = bgColor[1];
    chunk[10] = bgColor[0];
    chunk[11] = bgColor[3];

    this.writeUint16LE(chunk, 12, loopCount);
    return chunk;
  }

  private static createANMFChunk(
    x: number,
    y: number,
    width: number,
    height: number,
    duration: number,
    noBlend: boolean,
    disposeBackground: boolean,
    alphaChunk: Uint8Array | null,
    bitstreamChunk: Uint8Array,
  ): Uint8Array {
    const alphaLen = alphaChunk ? alphaChunk.length : 0;
    const bitstreamLen = bitstreamChunk.length;
    const frameDataSize = alphaLen + bitstreamLen;
    const payloadSize = 16 + frameDataSize;

    const chunk = new Uint8Array(8 + payloadSize);
    this.writeString(chunk, 0, "ANMF");
    this.writeUint32LE(chunk, 4, payloadSize);

    this.writeUint24LE(chunk, 8, x >> 1);
    this.writeUint24LE(chunk, 11, y >> 1);

    this.writeUint24LE(chunk, 14, width - 1);
    this.writeUint24LE(chunk, 17, height - 1);

    this.writeUint24LE(chunk, 20, duration);

    const flags = (noBlend ? 2 : 0) | (disposeBackground ? 1 : 0);
    chunk[23] = flags;

    let offset = 24;
    if (alphaChunk) {
      chunk.set(alphaChunk, offset);
      offset += alphaChunk.length;
    }
    chunk.set(bitstreamChunk, offset);

    return chunk;
  }

  private static writeUint32LE(
    arr: Uint8Array,
    offset: number,
    val: number,
  ): void {
    arr[offset] = val & 0xff;
    arr[offset + 1] = (val >> 8) & 0xff;
    arr[offset + 2] = (val >> 16) & 0xff;
    arr[offset + 3] = (val >> 24) & 0xff;
  }

  private static writeUint24LE(
    arr: Uint8Array,
    offset: number,
    val: number,
  ): void {
    arr[offset] = val & 0xff;
    arr[offset + 1] = (val >> 8) & 0xff;
    arr[offset + 2] = (val >> 16) & 0xff;
  }

  private static writeUint16LE(
    arr: Uint8Array,
    offset: number,
    val: number,
  ): void {
    arr[offset] = val & 0xff;
    arr[offset + 1] = (val >> 8) & 0xff;
  }

  private static writeString(
    arr: Uint8Array,
    offset: number,
    str: string,
  ): void {
    for (let i = 0; i < str.length; i++) {
      arr[offset + i] = str.charCodeAt(i);
    }
  }

  private static readUint32LE(arr: Uint8Array, offset: number): number {
    return (
      arr[offset]! |
      (arr[offset + 1]! << 8) |
      (arr[offset + 2]! << 16) |
      (arr[offset + 3]! << 24)
    );
  }

  private static readString(
    arr: Uint8Array,
    offset: number,
    length: number,
  ): string {
    let s = "";
    for (let i = 0; i < length; i++) {
      s += String.fromCharCode(arr[offset + i]!);
    }
    return s;
  }
}

export async function encodeCanvasesAsAnimatedWebp(
  frames: readonly HTMLCanvasElement[],
  fps: number,
  encoder?: AnimatedWebPEncoderAdapter,
): Promise<Blob> {
  if (encoder && typeof encoder.encodeGifImageData === "function") {
    const gifBlob = encodeCanvasesAsGif(frames, fps);
    const gifBytes = new Uint8Array(await gifBlob.arrayBuffer());
    const webpBytes = encoder.encodeGifImageData(gifBytes, gifBytes.length, 1);
    const copy = new Uint8Array(webpBytes.length);
    copy.set(webpBytes);
    return new Blob([copy.buffer], { type: "image/webp" });
  }

  const firstFrame = frames[0] as HTMLCanvasElement;
  const width = firstFrame?.width ?? 0;
  const height = firstFrame?.height ?? 0;

  const blobs = await Promise.all(
    frames.map(
      (frame) =>
        new Promise<Blob>((resolve, reject) => {
          frame.toBlob((blob) => {
            if (blob) resolve(blob);
            else reject(new Error("toBlob failed"));
          }, "image/webp");
        }),
    ),
  );

  const frameInputs = await Promise.all(
    blobs.map(async (blob) => {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      return {
        bytes,
        duration: Math.max(1, Math.round(1000 / fps)),
      };
    }),
  );

  const webpBytes = AnimatedWebPEncoder.encode(frameInputs, {
    width,
    height,
    loopCount: 0,
  });

  const blobBytes = new Uint8Array(webpBytes.length);
  blobBytes.set(webpBytes);
  return new Blob([blobBytes.buffer], { type: "image/webp" });
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
