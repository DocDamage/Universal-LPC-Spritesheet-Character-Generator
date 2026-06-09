// Empty, pro-required, and loading state renderers for the part editor
import m from "mithril";

export function renderEmptyEditor(): m.Children {
  return m("div.part-editor-empty", [
    m("span.part-editor-empty-icon", "✏️"),
    m("p", "No part selected"),
  ]);
}

export function renderProRequiredEditor(): m.Children {
  return m("div.part-editor-empty", [
    m("span.part-editor-empty-icon", "Pro"),
    m("p", "Advanced part editing is available in Pro."),
  ]);
}

export function renderLoadingEditor(): m.Children {
  return m("div.part-editor-loading", [
    m("div.spinner"),
    m("p.mt-2", "Loading spritesheet..."),
  ]);
}
