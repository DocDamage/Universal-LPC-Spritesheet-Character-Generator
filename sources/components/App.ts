// Main app component
import m from "mithril";
import type { CatalogReader } from "../state/catalog.ts";
import { Download } from "./download/Download.ts";
import { FiltersPanel } from "./FiltersPanel.ts";
import { Credits } from "./download/Credits.ts";
import { AdvancedTools } from "./advanced/AdvancedTools.ts";
import { ConfirmDialogModal } from "./notifications/ConfirmDialogModal.ts";
import { NotificationCenter } from "./notifications/NotificationCenter.ts";
import { buildRenderKey, triggerRender } from "./render-effect.ts";

/**
 * App is the composition root for catalog DI. main.ts mounts it with the
 * `defaultCatalog` instance; App threads narrow slices down to children that
 * have migrated to receive `catalog` via attrs (so far: FiltersPanel and its
 * subtree). Children that still import from `state/catalog.ts` directly are
 * unaffected — they read the same `defaultCatalog` state under the hood.
 */
type AppAttrs = { catalog: CatalogReader };

type AppState = {
  prevKey: string;
};

export const App: m.Component<AppAttrs, AppState> = {
  oninit(vnode) {
    vnode.state.prevKey = buildRenderKey();
  },
  onupdate(vnode) {
    const currentKey = buildRenderKey();
    if (currentKey !== vnode.state.prevKey) {
      vnode.state.prevKey = currentKey;
      triggerRender();
    }
  },
  view(vnode) {
    return m("div", [
      m(Download, { catalog: vnode.attrs.catalog }),
      m(FiltersPanel, { catalog: vnode.attrs.catalog }),
      m(Credits),
      m(AdvancedTools),
      m(ConfirmDialogModal),
      m(NotificationCenter),
    ]);
  },
};
