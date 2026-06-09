import m from "mithril";
import { state } from "../../state/state.ts";
import {
  initPreviewCanvas,
  setPreviewCanvasZoom,
} from "../../canvas/preview-canvas.ts";
import {
  repaintStaticPreviewFrameForTests,
  setPreviewAnimation,
  setPreviewApplyTransparencyMask,
  setPreviewShowTransparencyGrid,
  setPreviewTweenSettings,
  startPreviewAnimation,
  stopPreviewAnimation,
} from "../../canvas/preview-animation.ts";
import type { TweenEasing, TweenMode } from "../../canvas/tween.ts";
import PinchToZoom from "./PinchToZoom.ts";

export type PreviewCanvasAttrs = {
  selectedAnimation: string;
  zoomLevel: number;
  tweenMode: TweenMode;
  tweenInbetweens: number;
  tweenFps: number;
  tweenMotionStrength: number;
  tweenAlphaThreshold: number;
  tweenEasing: TweenEasing;
  onFrameCycleUpdate: (frameCycle: string) => void;
};

type PreviewCanvasState = {
  zoomLevel: number;
  lastAnimation: string;
  lastTweenMode: TweenMode;
  lastTweenInbetweens: number;
  lastTweenFps: number;
  lastTweenMotionStrength: number;
  lastTweenAlphaThreshold: number;
  lastTweenEasing: TweenEasing;
  _pinchUnmounted: boolean;
  pinch: PinchToZoom | null;
};

export const PreviewCanvas: m.Component<
  PreviewCanvasAttrs,
  PreviewCanvasState
> = {
  oncreate(vnode) {
    const canvas = vnode.dom as HTMLCanvasElement;
    const {
      selectedAnimation,
      tweenMode,
      tweenInbetweens,
      tweenFps,
      tweenMotionStrength,
      tweenAlphaThreshold,
      tweenEasing,
      onFrameCycleUpdate,
    } = vnode.attrs;
    const zoomLevel = vnode.attrs.zoomLevel || 1;

    if (!window.canvasRenderer) {
      console.error("Canvas renderer not available yet");
      return;
    }

    initPreviewCanvas(canvas);
    const frames = setPreviewAnimation(selectedAnimation);
    setPreviewTweenSettings({
      mode: tweenMode,
      inbetweens: tweenInbetweens,
      fps: tweenFps,
      motionStrength: tweenMotionStrength,
      alphaThreshold: tweenAlphaThreshold,
      easing: tweenEasing,
    });
    setPreviewShowTransparencyGrid(state.showTransparencyGrid);
    setPreviewApplyTransparencyMask(state.applyTransparencyMask);
    startPreviewAnimation();

    if (frames) {
      onFrameCycleUpdate(frames.join("-"));
    }

    vnode.state.zoomLevel = zoomLevel;
    vnode.state.lastAnimation = selectedAnimation;
    vnode.state.lastTweenMode = tweenMode;
    vnode.state.lastTweenInbetweens = tweenInbetweens;
    vnode.state.lastTweenFps = tweenFps;
    vnode.state.lastTweenMotionStrength = tweenMotionStrength;
    vnode.state.lastTweenAlphaThreshold = tweenAlphaThreshold;
    vnode.state.lastTweenEasing = tweenEasing || "linear";
    vnode.state._pinchUnmounted = false;
    vnode.state.pinch = null;
    PinchToZoom.create(
      canvas,
      (scale) => {
        vnode.state.zoomLevel = scale;

        if (window.canvasRenderer) {
          m.redraw();
          setPreviewCanvasZoom(vnode.state.zoomLevel);
        }

        state.previewCanvasZoomLevel = vnode.state.zoomLevel;
      },
      vnode.state.zoomLevel,
    ).then((pinch) => {
      if (vnode.state._pinchUnmounted) {
        pinch.destroy();
        return;
      }
      vnode.state.pinch = pinch;
    });
  },
  onupdate(vnode) {
    const {
      selectedAnimation,
      tweenMode,
      tweenInbetweens,
      tweenFps,
      tweenEasing,
    } = vnode.attrs;
    const { tweenMotionStrength, tweenAlphaThreshold } = vnode.attrs;
    const didTweenSettingsChange =
      vnode.state.lastTweenMode !== tweenMode ||
      vnode.state.lastTweenInbetweens !== tweenInbetweens ||
      vnode.state.lastTweenFps !== tweenFps ||
      vnode.state.lastTweenMotionStrength !== tweenMotionStrength ||
      vnode.state.lastTweenAlphaThreshold !== tweenAlphaThreshold ||
      vnode.state.lastTweenEasing !== tweenEasing;

    if (
      vnode.state.lastAnimation !== selectedAnimation ||
      didTweenSettingsChange
    ) {
      if (window.canvasRenderer) {
        stopPreviewAnimation();
        setPreviewAnimation(selectedAnimation);
        setPreviewTweenSettings({
          mode: tweenMode,
          inbetweens: tweenInbetweens,
          fps: tweenFps,
          motionStrength: tweenMotionStrength,
          alphaThreshold: tweenAlphaThreshold,
          easing: tweenEasing,
        });
        setPreviewShowTransparencyGrid(state.showTransparencyGrid);
        setPreviewApplyTransparencyMask(state.applyTransparencyMask);
        initPreviewCanvas(vnode.dom as HTMLCanvasElement);
        startPreviewAnimation();
      }
      vnode.state.lastAnimation = selectedAnimation;
      vnode.state.lastTweenMode = tweenMode;
      vnode.state.lastTweenInbetweens = tweenInbetweens;
      vnode.state.lastTweenFps = tweenFps;
      vnode.state.lastTweenMotionStrength = tweenMotionStrength;
      vnode.state.lastTweenAlphaThreshold = tweenAlphaThreshold;
      vnode.state.lastTweenEasing = tweenEasing || "linear";
    }

    vnode.state.zoomLevel = state.previewCanvasZoomLevel || 1;
    repaintStaticPreviewFrameForTests();
  },
  onremove(vnode) {
    vnode.state._pinchUnmounted = true;
    vnode.state.pinch?.destroy();
    vnode.state.pinch = null;
    if (window.canvasRenderer) {
      stopPreviewAnimation();
    }
  },
  view() {
    return m("canvas#previewAnimations");
  },
};
