import { triggerRender } from "../components/render-effect.ts";
import { state } from "./state.ts";

export async function withExportLayerVisibility<T>(
  exportWork: () => PromiseLike<T>,
): Promise<T> {
  if (state.excludeHiddenLayersFromExports || state.hiddenLayerIds.size === 0) {
    return exportWork();
  }

  const hiddenLayerIds = state.hiddenLayerIds;
  state.hiddenLayerIds = new Set<string>();

  try {
    await triggerRender();
    return await exportWork();
  } finally {
    state.hiddenLayerIds = hiddenLayerIds;
    await triggerRender();
  }
}
