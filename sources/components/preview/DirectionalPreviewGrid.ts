import m from "mithril";
import { renderDirectionalPreviewCanvases } from "../../canvas/preview-animation.ts";

type DirectionalPreviewImage = {
  direction: string;
  src: string;
};

type DirectionalPreviewGridAttrs = {
  refreshKey: string;
};

type DirectionalPreviewGridState = {
  frames: DirectionalPreviewImage[];
  lastRefreshKey: string;
};

function refreshDirectionalFrames(
  vnode: m.Vnode<DirectionalPreviewGridAttrs, DirectionalPreviewGridState>,
): void {
  if (vnode.state.lastRefreshKey === vnode.attrs.refreshKey) {
    return;
  }

  try {
    vnode.state.frames = renderDirectionalPreviewCanvases(0).map((frame) => ({
      direction: frame.direction,
      src: frame.canvas.toDataURL("image/png"),
    }));
  } catch {
    vnode.state.frames = [];
  }
  vnode.state.lastRefreshKey = vnode.attrs.refreshKey;
}

export const DirectionalPreviewGrid: m.Component<
  DirectionalPreviewGridAttrs,
  DirectionalPreviewGridState
> = {
  oninit(vnode) {
    vnode.state.frames = [];
    vnode.state.lastRefreshKey = "";
  },
  oncreate(vnode) {
    refreshDirectionalFrames(vnode);
  },
  onupdate(vnode) {
    refreshDirectionalFrames(vnode);
  },
  view(vnode) {
    if (vnode.state.frames.length === 0) {
      return m("p.animation-qa-empty", "Directional frames will appear here.");
    }

    return m(
      "div.directional-preview-grid",
      vnode.state.frames.map((frame) =>
        m("div.directional-preview-card", [
          m("img", {
            src: frame.src,
            alt: `${frame.direction} direction preview`,
          }),
          m("span", frame.direction),
        ]),
      ),
    );
  },
};
