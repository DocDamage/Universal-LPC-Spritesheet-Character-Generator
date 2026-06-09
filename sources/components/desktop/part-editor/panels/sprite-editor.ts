import m from "mithril";
import type { PartEditorState } from "../types.ts";
import { renderBrushSection } from "./brush-section.ts";
import { renderColorSection } from "./color-section.ts";
import { renderTransformSection } from "./transform-section.ts";
import { renderLayersSection } from "./layers-section.ts";
import { renderSymmetrySection } from "./symmetry-section.ts";
import { renderViewSection } from "./view-section.ts";
import { renderReferenceUnderlaySection } from "./reference-underlay-section.ts";

export function renderSpriteEditorPanel(stateObj: PartEditorState): m.Children {
  return [
    renderBrushSection(stateObj),
    renderColorSection(stateObj),
    renderTransformSection(stateObj),
    renderLayersSection(stateObj),
    renderSymmetrySection(stateObj),
    renderViewSection(stateObj),
    renderReferenceUnderlaySection(stateObj),
  ];
}
