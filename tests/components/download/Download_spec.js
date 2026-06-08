// @ts-nocheck
import m from "mithril";
import { expect } from "chai";
import { describe, it, beforeEach, afterEach } from "mocha-globals";
import { Download } from "../../../sources/components/download/Download.ts";
import { state } from "../../../sources/state/state.ts";

const readyCatalog = {
  isLayersReady: () => true,
};

describe("Download", () => {
  let container;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    state.previewTweenMode = "off";
    state.previewTweenInbetweens = 1;
    state.previewTweenFps = 8;
    state.previewTweenMotionStrength = 1;
    state.previewTweenAlphaThreshold = 1;
    state.previewTweenOverrides = {};
  });

  afterEach(() => {
    m.render(container, null);
    container.remove();
    state.previewTweenMode = "off";
    state.previewTweenInbetweens = 1;
    state.previewTweenFps = 8;
    state.previewTweenMotionStrength = 1;
    state.previewTweenAlphaThreshold = 1;
    state.previewTweenOverrides = {};
  });

  it("hides the tween export hint by default", () => {
    m.render(container, m(Download, { catalog: readyCatalog }));

    expect(container.textContent).to.not.include("Tween frames enabled");
  });

  it("includes an animated GIF preview export button", () => {
    m.render(container, m(Download, { catalog: readyCatalog }));

    expect(container.textContent).to.include("Animation Preview (GIF)");
  });

  it("includes an animated WebP preview export button", () => {
    m.render(container, m(Download, { catalog: readyCatalog }));

    expect(container.textContent).to.include("Animation Preview (WebP)");
  });

  it("shows the tween export hint when preview tweening is enabled", () => {
    state.previewTweenMode = "crossfade";
    state.previewTweenInbetweens = 2;
    state.previewTweenFps = 12;

    m.render(container, m(Download, { catalog: readyCatalog }));

    const hint = container.querySelector(".tag.is-info.is-light");
    expect(hint).to.not.equal(null);
    expect(hint.textContent).to.equal("Tween frames enabled");
    expect(hint.title).to.equal(
      "Tween exports include 2 in-betweens per source frame at 12 FPS. Split-by-animation ZIPs add tweened spritesheets under tweened/. Individual-frame ZIPs add tween PNGs beside source frames.",
    );
  });
});
