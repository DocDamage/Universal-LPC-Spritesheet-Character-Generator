import m from "mithril";
import { state as appState } from "../state/app-state.ts";
import { renderState } from "../state/render-state.ts";

type Profiler = {
  mark: (name: string) => void;
  measure: (name: string, start: string, end: string) => void;
};

export function beginRenderCharacter(profiler?: Profiler): void {
  renderState.drawCalls.length = 0;
  renderState.addedCustomAnimations.clear();
  appState.isRenderingCharacter = true;
  m.redraw();
  profiler?.mark("renderCharacter:start");
}

export function finishRenderCharacter(profiler?: Profiler): void {
  appState.isRenderingCharacter = false;
  m.redraw();
  profiler?.mark("renderCharacter:end");
  profiler?.measure(
    "renderCharacter",
    "renderCharacter:start",
    "renderCharacter:end",
  );
}
