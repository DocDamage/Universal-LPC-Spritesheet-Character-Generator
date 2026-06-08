import m from "mithril";
import {
  clampBrushSize,
  MAX_BRUSH_SIZE,
  MIN_BRUSH_SIZE,
} from "../pixel-editor-tools.ts";
import { loadDraft, clearDraft } from "../../../state/editor-autosave.ts";
import { debugWarn } from "../../../utils/debug.ts";
import type { PartEditorState, EditorLayer } from "./types.ts";
import {
  getActiveLayer,
  getActiveLayerIndex,
  toggleLayerPixelLock,
  toggleLayerAlphaLock,
  addEditLayer,
  duplicateActiveLayer,
  moveActiveLayer,
  deleteActiveLayer,
  mergeActiveLayerDown,
  flattenVisibleLayers,
} from "./layers.ts";
import { getVisiblePaletteColors, replaceColorOnActiveLayer } from "./color.ts";
import { transformActivePixels } from "./transform.ts";
import { clearSelectionState } from "./selection.ts";
import { recomposeCanvases, debouncedRecomposeCanvases } from "./canvas.ts";
import { saveHistory } from "./history.ts";
import {
  getAnimationFrameCount,
  getAnimationLabel,
  switchEditorContext,
  applyGlobalToFrame,
  startPlayback,
  stopPlayback,
  isFrameDirty,
} from "./animation.ts";
import { DEFAULT_EDITOR_ZOOM } from "./types.ts";
import { parsePaletteFile } from "./color.ts";
import { updateOnionCanvases } from "./animation.ts";
import { restoreEditorContext } from "./animation.ts";
import type { EditorContextSnapshot } from "./types.ts";

export function renderProPanel(stateObj: PartEditorState): m.Children {
  return m("aside.part-editor-pro-panel", [
    m("div.part-editor-pro-tabs", [
      m(
        "button.part-editor-pro-tab",
        {
          type: "button",
          class: stateObj.activeEditorTab === "edit" ? "active" : "",
          title: "Show sprite editing tools (1)",
          onclick: () => {
            stateObj.activeEditorTab = "edit";
          },
        },
        "Edit",
      ),
      m(
        "button.part-editor-pro-tab",
        {
          type: "button",
          class: stateObj.activeEditorTab === "animation" ? "active" : "",
          title: "Show animation frame editor (2)",
          onclick: () => {
            stateObj.activeEditorTab = "animation";
          },
        },
        "Animation",
      ),
    ]),
    m(
      "div.part-editor-pro-content",
      stateObj.activeEditorTab === "animation"
        ? renderAnimationEditorPanel(stateObj)
        : renderSpriteEditorPanel(stateObj),
    ),
  ]);
}

export function renderLayerRowItem(
  stateObj: PartEditorState,
  layer: EditorLayer,
  displayCleanName: string,
  indent: boolean,
): m.Children {
  const layerNamePrefix =
    indent && layer.name.includes(":")
      ? `${layer.name.split(":").slice(0, -1).join(":")}: `
      : "";

  return m(
    "div.part-editor-layer-row",
    {
      key: layer.id,
      class: layer.id === stateObj.activeLayerId ? "active" : "",
      style: indent
        ? {
            marginLeft: "12px",
            borderLeft: "2px dashed var(--border-subtle)",
            paddingLeft: "8px",
          }
        : {},
      onclick: () => {
        stateObj.activeLayerId = layer.id;
      },
    },
    [
      m("div.part-editor-layer-main", [
        m(
          "button.part-editor-layer-control",
          {
            type: "button",
            title: layer.visible ? "Hide layer" : "Show layer",
            onclick: (e: MouseEvent) => {
              e.stopPropagation();
              layer.visible = !layer.visible;
              recomposeCanvases(stateObj);
              saveHistory(stateObj);
            },
          },
          layer.visible ? "On" : "Off",
        ),
        m(
          "button.part-editor-layer-control",
          {
            type: "button",
            title: layer.locked
              ? "Unlock layer pixels (/)"
              : "Lock layer pixels (/)",
            class: layer.locked ? "active" : "",
            onclick: (e: MouseEvent) => {
              e.stopPropagation();
              toggleLayerPixelLock(stateObj, layer);
            },
          },
          layer.locked ? "Lock" : "Edit",
        ),
        m(
          "button.part-editor-layer-control",
          {
            type: "button",
            title: layer.alphaLocked
              ? "Unlock transparent pixels (Shift+/)"
              : "Lock transparent pixels for recoloring (Shift+/)",
            class: layer.alphaLocked ? "active" : "",
            disabled: layer.locked,
            onclick: (e: MouseEvent) => {
              e.stopPropagation();
              toggleLayerAlphaLock(stateObj, layer);
            },
          },
          "A",
        ),
        m("input.part-editor-layer-name", {
          type: "text",
          value: displayCleanName,
          title:
            "Layer name (Format: 'Group: LayerName' to auto-nest in folders)",
          onclick: (e: MouseEvent) => e.stopPropagation(),
          oninput: (e: Event) => {
            const nextName = (e.target as HTMLInputElement).value || "Layer";
            layer.name = `${layerNamePrefix}${nextName}`;
          },
          onchange: () => saveHistory(stateObj),
        }),
        m(
          "span.part-editor-layer-opacity-value",
          `${Math.round(layer.opacity * 100)}%`,
        ),
      ]),
      m(
        "div.part-editor-layer-sub",
        { style: { display: "flex", gap: "8px", alignItems: "center" } },
        [
          m(
            "select.part-editor-layer-blend",
            {
              style: {
                flex: "0 0 100px",
                background: "var(--bg-darkest)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "var(--radius-sm)",
                color: "var(--text-primary)",
                fontSize: "10px",
                padding: "2px 4px",
                height: "22px",
                cursor: "pointer",
              },
              value: layer.blendMode || "source-over",
              title: "Layer blend mode",
              onclick: (e: MouseEvent) => e.stopPropagation(),
              onchange: (e: Event) => {
                layer.blendMode = (e.target as HTMLSelectElement)
                  .value as GlobalCompositeOperation;
                recomposeCanvases(stateObj);
                saveHistory(stateObj);
              },
            },
            [
              m("option", { value: "source-over" }, "Normal"),
              m("option", { value: "multiply" }, "Multiply"),
              m("option", { value: "screen" }, "Screen"),
              m("option", { value: "overlay" }, "Overlay"),
              m("option", { value: "darken" }, "Darken"),
              m("option", { value: "lighten" }, "Lighten"),
              m("option", { value: "color-dodge" }, "Dodge"),
              m("option", { value: "color-burn" }, "Burn"),
              m("option", { value: "hard-light" }, "Hard Light"),
              m("option", { value: "soft-light" }, "Soft Light"),
              m("option", { value: "difference" }, "Difference"),
              m("option", { value: "exclusion" }, "Exclusion"),
            ],
          ),
          m("input.part-editor-layer-opacity", {
            style: { flex: "1", margin: "0" },
            type: "range",
            min: "0",
            max: "100",
            step: "1",
            value: String(Math.round(layer.opacity * 100)),
            title: "Layer opacity",
            onclick: (e: MouseEvent) => e.stopPropagation(),
            oninput: (e: Event) => {
              layer.opacity =
                Number((e.target as HTMLInputElement).value) / 100;
              debouncedRecomposeCanvases(stateObj);
            },
            onchange: () => saveHistory(stateObj),
          }),
        ],
      ),
    ],
  );
}

export function renderSpriteEditorPanel(stateObj: PartEditorState): m.Children {
  const activeLayerIndex = getActiveLayerIndex(stateObj);
  const activeLayer = getActiveLayer(stateObj);
  const activeLayerLocked = activeLayer?.locked ?? false;
  const canMoveLayerDown = activeLayerIndex > 0;
  const canMoveLayerUp =
    activeLayerIndex >= 0 && activeLayerIndex < stateObj.editLayers.length - 1;
  const targetMergeLayer = stateObj.editLayers[activeLayerIndex - 1];
  const canMergeLayerDown =
    activeLayerIndex > 0 && !activeLayerLocked && !targetMergeLayer?.locked;
  const canFlattenLayers = stateObj.editLayers.length > 1;
  const canDeleteActiveLayer =
    stateObj.editLayers.length > 1 &&
    activeLayerIndex >= 0 &&
    !activeLayerLocked;
  const paletteColors = getVisiblePaletteColors(stateObj);

  return [
    m("div.part-editor-pro-section", [
      m("h4", "Brush"),
      m("label.part-editor-pro-field", [
        m("span", "Size"),
        m("input", {
          type: "range",
          min: String(MIN_BRUSH_SIZE),
          max: String(MAX_BRUSH_SIZE),
          step: "1",
          value: String(stateObj.brushSize),
          title: "Brush size ([ or ])",
          oninput: (e: Event) => {
            stateObj.brushSize = clampBrushSize(
              Number((e.target as HTMLInputElement).value),
            );
          },
        }),
        m("b", `${stateObj.brushSize}px`),
      ]),
      m(
        "label.part-editor-pro-toggle",
        {
          title: "Fill rectangle and ellipse tools",
        },
        [
          m("input", {
            type: "checkbox",
            checked: stateObj.shapeFilled,
            onchange: (e: Event) => {
              stateObj.shapeFilled = (e.target as HTMLInputElement).checked;
            },
          }),
          "Fill shapes",
        ],
      ),
    ]),
    m("div.part-editor-pro-section.part-editor-color-section", [
      m(
        "div",
        {
          style: {
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "8px",
          },
        },
        [
          m("h4", { style: { margin: "0" } }, "Color"),
          m(
            "label",
            {
              style: {
                fontSize: "10px",
                color: "var(--accent-primary)",
                cursor: "pointer",
                background: "rgba(124, 109, 240, 0.15)",
                padding: "2px 6px",
                borderRadius: "var(--radius-sm)",
                border: "1px solid rgba(124, 109, 240, 0.3)",
              },
            },
            [
              "+ Palette",
              m("input", {
                type: "file",
                accept: ".gpl,.hex,.txt",
                style: { display: "none" },
                onchange: (e: Event) => {
                  const target = e.target as HTMLInputElement;
                  if (target.files && target.files[0]) {
                    const file = target.files[0];
                    const reader = new FileReader();
                    reader.onload = () => {
                      stateObj.uploadedPaletteColors = parsePaletteFile(
                        file.name,
                        reader.result as string,
                      );
                      m.redraw();
                    };
                    reader.readAsText(file);
                  }
                },
              }),
            ],
          ),
        ],
      ),
      m(
        "div",
        {
          style: {
            fontSize: "10px",
            color: "var(--text-muted)",
            marginBottom: "4px",
          },
        },
        "Extracted Swatches",
      ),
      m(
        "div.part-editor-extracted-palette",
        paletteColors.map((color) =>
          m("button.part-editor-palette-chip", {
            key: color,
            type: "button",
            style: { backgroundColor: color },
            class: stateObj.activeColor === color ? "active" : "",
            title: `Use ${color}`,
            onclick: () => {
              stateObj.activeColor = color;
            },
            ondblclick: () => {
              stateObj.replaceFromColor = color;
            },
          }),
        ),
      ),
      stateObj.uploadedPaletteColors
        ? [
            m(
              "div",
              {
                style: {
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginTop: "12px",
                  marginBottom: "4px",
                },
              },
              [
                m(
                  "span",
                  { style: { fontSize: "10px", color: "var(--text-muted)" } },
                  "Custom Swatches",
                ),
                m(
                  "button",
                  {
                    type: "button",
                    style: {
                      background: "transparent",
                      border: "none",
                      color: "#fb7185",
                      fontSize: "10px",
                      cursor: "pointer",
                      padding: "0",
                    },
                    onclick: () => {
                      stateObj.uploadedPaletteColors = null;
                    },
                  },
                  "Clear",
                ),
              ],
            ),
            m(
              "div.part-editor-extracted-palette",
              {
                style: {
                  maxHeight: "96px",
                  overflowY: "auto",
                  border: "1px solid var(--border-subtle)",
                  padding: "4px",
                  borderRadius: "var(--radius-sm)",
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "3px",
                },
              },
              stateObj.uploadedPaletteColors.map((color) =>
                m("button.part-editor-palette-chip", {
                  key: `uploaded-${color}`,
                  type: "button",
                  style: {
                    backgroundColor: color,
                    flex: "0 0 16px",
                    height: "16px",
                    padding: "0",
                  },
                  class: stateObj.activeColor === color ? "active" : "",
                  title: `Use ${color}`,
                  onclick: () => {
                    stateObj.activeColor = color;
                  },
                  ondblclick: () => {
                    stateObj.replaceFromColor = color;
                  },
                }),
              ),
            ),
          ]
        : null,
      m("div.part-editor-replace-grid", [
        m("label.part-editor-color-field", [
          m("span", "From"),
          m("input", {
            type: "color",
            value: stateObj.replaceFromColor,
            title: "Color to replace",
            oninput: (e: Event) => {
              stateObj.replaceFromColor = (e.target as HTMLInputElement).value;
            },
          }),
        ]),
        m("label.part-editor-color-field", [
          m("span", "To"),
          m("input", {
            type: "color",
            value: stateObj.replaceToColor,
            title: "Replacement color",
            oninput: (e: Event) => {
              stateObj.replaceToColor = (e.target as HTMLInputElement).value;
            },
          }),
        ]),
      ]),
      m("label.part-editor-pro-field", [
        m("span", "Tol"),
        m("input", {
          type: "range",
          min: "0",
          max: "96",
          step: "1",
          value: String(stateObj.replaceTolerance),
          title: "Color match tolerance",
          oninput: (e: Event) => {
            stateObj.replaceTolerance = Number(
              (e.target as HTMLInputElement).value,
            );
          },
        }),
        m("b", String(stateObj.replaceTolerance)),
      ]),
      m(
        "label.part-editor-pro-toggle",
        {
          title: "Replace matching colors in every direction",
        },
        [
          m("input", {
            type: "checkbox",
            checked: stateObj.replaceAllDirections,
            onchange: (e: Event) => {
              stateObj.replaceAllDirections = (
                e.target as HTMLInputElement
              ).checked;
            },
          }),
          "All dirs",
        ],
      ),
      m("div.part-editor-color-actions", [
        m(
          "button.part-editor-pro-button",
          {
            type: "button",
            title: "Use active brush color as replacement",
            onclick: () => {
              stateObj.replaceToColor = stateObj.activeColor;
            },
          },
          "Use",
        ),
        m(
          "button.part-editor-pro-button",
          {
            type: "button",
            title: "Swap source and replacement colors",
            onclick: () => {
              const from = stateObj.replaceFromColor;
              stateObj.replaceFromColor = stateObj.replaceToColor;
              stateObj.replaceToColor = from;
            },
          },
          "Swap",
        ),
        m(
          "button.part-editor-pro-button",
          {
            type: "button",
            title: "Replace color on active layer (Ctrl+Shift+R)",
            disabled: activeLayerLocked,
            onclick: () => replaceColorOnActiveLayer(stateObj),
          },
          "Apply",
        ),
      ]),
    ]),
    m("div.part-editor-pro-section.part-editor-transform-section", [
      m("h4", "Transform"),
      m(
        "label.part-editor-pro-toggle",
        {
          title: "Apply transforms to every direction",
        },
        [
          m("input", {
            type: "checkbox",
            checked: stateObj.transformAllDirections,
            onchange: (e: Event) => {
              stateObj.transformAllDirections = (
                e.target as HTMLInputElement
              ).checked;
            },
          }),
          "All dirs",
        ],
      ),
      m("div.part-editor-transform-actions", [
        m(
          "button.part-editor-pro-button",
          {
            type: "button",
            title: "Flip selection or active layer horizontally (H)",
            disabled: activeLayerLocked,
            onclick: () => transformActivePixels(stateObj, "flipHorizontal"),
          },
          "Flip H",
        ),
        m(
          "button.part-editor-pro-button",
          {
            type: "button",
            title: "Flip selection or active layer vertically (V)",
            disabled: activeLayerLocked,
            onclick: () => transformActivePixels(stateObj, "flipVertical"),
          },
          "Flip V",
        ),
        m(
          "button.part-editor-pro-button",
          {
            type: "button",
            title: "Rotate selection or active layer clockwise (T)",
            disabled: activeLayerLocked,
            onclick: () => transformActivePixels(stateObj, "rotateClockwise"),
          },
          "Rot CW",
        ),
        m(
          "button.part-editor-pro-button",
          {
            type: "button",
            title:
              "Rotate selection or active layer counterclockwise (Shift+T)",
            disabled: activeLayerLocked,
            onclick: () =>
              transformActivePixels(stateObj, "rotateCounterClockwise"),
          },
          "Rot CCW",
        ),
        m(
          "button.part-editor-pro-button.part-editor-transform-clear",
          {
            type: "button",
            title: "Clear selection or active layer",
            disabled: activeLayerLocked,
            onclick: () => transformActivePixels(stateObj, "clear"),
          },
          "Clear",
        ),
      ]),
    ]),
    m("div.part-editor-pro-section.part-editor-layers-section", [
      m("h4", "Layers"),
      m("div.part-editor-layer-actions", [
        m(
          "button.part-editor-pro-button",
          {
            type: "button",
            title: "Add a new edit layer (Ctrl+Shift+N)",
            onclick: () => addEditLayer(stateObj),
          },
          "+",
        ),
        m(
          "button.part-editor-pro-button",
          {
            type: "button",
            title: "Duplicate active layer (Ctrl+J)",
            disabled: activeLayerIndex < 0,
            onclick: () => duplicateActiveLayer(stateObj),
          },
          "Copy",
        ),
        m(
          "button.part-editor-pro-button",
          {
            type: "button",
            title: "Move active layer up",
            disabled: !canMoveLayerUp,
            onclick: () => moveActiveLayer(stateObj, 1),
          },
          "Up",
        ),
        m(
          "button.part-editor-pro-button",
          {
            type: "button",
            title: "Move active layer down",
            disabled: !canMoveLayerDown,
            onclick: () => moveActiveLayer(stateObj, -1),
          },
          "Down",
        ),
        m(
          "button.part-editor-pro-button",
          {
            type: "button",
            title: "Merge active layer down (Ctrl+E)",
            disabled: !canMergeLayerDown,
            onclick: () => mergeActiveLayerDown(stateObj),
          },
          "Merge",
        ),
        m(
          "button.part-editor-pro-button",
          {
            type: "button",
            title: "Flatten visible layers (Ctrl+Shift+E)",
            disabled: !canFlattenLayers,
            onclick: () => flattenVisibleLayers(stateObj),
          },
          "Flat",
        ),
        m(
          "button.part-editor-pro-button.part-editor-layer-delete",
          {
            type: "button",
            title: "Delete active layer",
            disabled: !canDeleteActiveLayer,
            onclick: () => deleteActiveLayer(stateObj),
          },
          "Del",
        ),
      ]),
      m(
        "div.part-editor-layer-list",
        (() => {
          const renderedLayerItems: m.Children = [];
          const reversedLayers = stateObj.editLayers.slice().reverse();

          type GroupItem = { groupName: string; layers: EditorLayer[] };
          const parsedGroups: GroupItem[] = [];

          let currentGroupName: string | null = null;
          let currentGroupLayers: EditorLayer[] = [];

          for (const layer of reversedLayers) {
            const parts = layer.name.split(":");
            const isGrouped = parts.length > 1 && parts[0]!.trim() !== "";
            const groupName = isGrouped ? parts[0]!.trim() : null;

            if (groupName !== currentGroupName) {
              if (currentGroupName !== null && currentGroupLayers.length > 0) {
                parsedGroups.push({
                  groupName: currentGroupName,
                  layers: currentGroupLayers,
                });
                currentGroupLayers = [];
              }
              currentGroupName = groupName;
            }

            if (groupName !== null) {
              currentGroupLayers.push(layer);
            } else {
              if (currentGroupName !== null && currentGroupLayers.length > 0) {
                parsedGroups.push({
                  groupName: currentGroupName,
                  layers: currentGroupLayers,
                });
                currentGroupLayers = [];
                currentGroupName = null;
              }
              parsedGroups.push({ groupName: "", layers: [layer] });
            }
          }
          if (currentGroupName !== null && currentGroupLayers.length > 0) {
            parsedGroups.push({
              groupName: currentGroupName,
              layers: currentGroupLayers,
            });
          }

          parsedGroups.forEach(({ groupName, layers }) => {
            if (groupName) {
              const isCollapsed =
                stateObj.collapsedLayerGroups[groupName] === true;
              renderedLayerItems.push(
                m(
                  "div.part-editor-layer-group-header",
                  {
                    key: `group-${groupName}`,
                    style: {
                      display: "flex",
                      alignItems: "center",
                      padding: "6px 8px",
                      background: "rgba(124, 109, 240, 0.08)",
                      border: "1px solid var(--border-subtle)",
                      borderRadius: "var(--radius-sm)",
                      marginBottom: "4px",
                      marginTop: "4px",
                      cursor: "pointer",
                      userSelect: "none",
                      gap: "6px",
                    },
                    onclick: () => {
                      stateObj.collapsedLayerGroups[groupName] = !isCollapsed;
                    },
                  },
                  [
                    m(
                      "span",
                      {
                        style: {
                          fontFamily: "monospace",
                          fontSize: "10px",
                          color: "var(--text-muted)",
                          width: "12px",
                          display: "inline-block",
                        },
                      },
                      isCollapsed ? "▶" : "▼",
                    ),
                    m(
                      "span",
                      {
                        style: {
                          flex: "1",
                          fontSize: "11px",
                          fontWeight: "bold",
                          color: "var(--text-primary)",
                        },
                      },
                      `📂 ${groupName}`,
                    ),
                    m(
                      "button.part-editor-layer-control",
                      {
                        type: "button",
                        style: {
                          width: "32px",
                          height: "18px",
                          fontSize: "8px",
                          padding: "0",
                        },
                        onclick: (e: MouseEvent) => {
                          e.stopPropagation();
                          const anyVisible = layers.some((l) => l.visible);
                          for (const l of layers) {
                            l.visible = !anyVisible;
                          }
                          recomposeCanvases(stateObj);
                          saveHistory(stateObj);
                        },
                      },
                      layers.some((l) => l.visible) ? "Hide" : "Show",
                    ),
                    m(
                      "button.part-editor-layer-control",
                      {
                        type: "button",
                        style: {
                          width: "32px",
                          height: "18px",
                          fontSize: "8px",
                          padding: "0",
                        },
                        onclick: (e: MouseEvent) => {
                          e.stopPropagation();
                          const anyLocked = layers.some((l) => l.locked);
                          for (const l of layers) {
                            l.locked = !anyLocked;
                            if (l.locked && l.id === stateObj.activeLayerId) {
                              clearSelectionState(stateObj, true);
                            }
                          }
                          saveHistory(stateObj);
                        },
                      },
                      layers.some((l) => l.locked) ? "Unlock" : "Lock",
                    ),
                  ],
                ),
              );

              if (!isCollapsed) {
                layers.forEach((layer) => {
                  const nameParts = layer.name.split(":");
                  const displayCleanName = nameParts.slice(1).join(":").trim();
                  renderedLayerItems.push(
                    renderLayerRowItem(stateObj, layer, displayCleanName, true),
                  );
                });
              }
            } else {
              layers.forEach((layer) => {
                renderedLayerItems.push(
                  renderLayerRowItem(stateObj, layer, layer.name, false),
                );
              });
            }
          });

          return renderedLayerItems;
        })(),
      ),
    ]),
    m("div.part-editor-pro-section", [
      m("h4", "Symmetry"),
      m(
        "label.part-editor-pro-toggle",
        {
          title: "Mirror strokes across the horizontal axis (X)",
        },
        [
          m("input", {
            type: "checkbox",
            checked: stateObj.mirrorX,
            onchange: (e: Event) => {
              stateObj.mirrorX = (e.target as HTMLInputElement).checked;
            },
          }),
          "Mirror X",
        ],
      ),
      m(
        "label.part-editor-pro-toggle",
        {
          title: "Mirror strokes across the vertical axis (Y)",
        },
        [
          m("input", {
            type: "checkbox",
            checked: stateObj.mirrorY,
            onchange: (e: Event) => {
              stateObj.mirrorY = (e.target as HTMLInputElement).checked;
            },
          }),
          "Mirror Y",
        ],
      ),
    ]),
    m("div.part-editor-pro-section", [
      m("h4", "View"),
      m(
        "label.part-editor-pro-toggle",
        {
          title: "Toggle pixel grid",
        },
        [
          m("input", {
            type: "checkbox",
            checked: stateObj.showGrid,
            onchange: (e: Event) => {
              stateObj.showGrid = (e.target as HTMLInputElement).checked;
            },
          }),
          "Pixel Grid",
        ],
      ),
      m(
        "button.part-editor-pro-button",
        {
          type: "button",
          title: "Reset editor zoom (Ctrl+0)",
          onclick: () => {
            stateObj.zoom = DEFAULT_EDITOR_ZOOM;
          },
        },
        "Reset Zoom",
      ),
    ]),
    m("div.part-editor-pro-section", [
      m("h4", "Reference Underlay"),
      m(
        "div",
        { style: { display: "flex", flexDirection: "column", gap: "8px" } },
        [
          m(
            "label",
            { style: { display: "flex", gap: "8px", alignItems: "center" } },
            [
              m(
                "span",
                { style: { fontSize: "11px", color: "var(--text-muted)" } },
                "Opacity",
              ),
              m("input", {
                style: { flex: "1" },
                type: "range",
                min: "0",
                max: "100",
                step: "5",
                value: String(Math.round(stateObj.referenceOpacity * 100)),
                oninput: (e: Event) => {
                  stateObj.referenceOpacity =
                    Number((e.target as HTMLInputElement).value) / 100;
                },
              }),
              m(
                "span",
                {
                  style: {
                    fontSize: "11px",
                    color: "var(--text-muted)",
                    width: "30px",
                    textAlign: "right",
                  },
                },
                `${Math.round(stateObj.referenceOpacity * 100)}%`,
              ),
            ],
          ),
          m("div", { style: { display: "flex", gap: "8px" } }, [
            m(
              "label.part-editor-pro-button",
              {
                style: {
                  flex: "1",
                  textAlign: "center",
                  lineHeight: "22px",
                  cursor: "pointer",
                  display: "block",
                  background: "var(--bg-darkest)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "var(--radius-sm)",
                  fontSize: "11px",
                  padding: "0 6px",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                },
              },
              [
                "Upload Image",
                m("input", {
                  type: "file",
                  accept: "image/*",
                  style: { display: "none" },
                  onchange: (e: Event) => {
                    const target = e.target as HTMLInputElement;
                    if (target.files && target.files[0]) {
                      const file = target.files[0];
                      const reader = new FileReader();
                      reader.onload = () => {
                        stateObj.referenceImageUrl = reader.result as string;
                        m.redraw();
                      };
                      reader.readAsDataURL(file);
                    }
                  },
                }),
              ],
            ),
            stateObj.referenceImageUrl
              ? m(
                  "button.part-editor-pro-button",
                  {
                    type: "button",
                    style: { padding: "0 10px" },
                    onclick: () => {
                      stateObj.referenceImageUrl = null;
                    },
                  },
                  "Clear",
                )
              : null,
          ]),
        ],
      ),
    ]),
  ];
}

export function renderAnimationEditorPanel(stateObj: PartEditorState): m.Children {
  const frameCount = getAnimationFrameCount(stateObj.frameAnimation);
  const canUseFrameTools = stateObj.availableFrameAnimations.length > 0;

  return [
    m("div.part-editor-pro-section.part-editor-timeline-section", [
      m("h4", "Timeline"),
      m("div.part-editor-mode-switch", [
        m(
          "button.part-editor-pro-button",
          {
            type: "button",
            class: !stateObj.frameMode ? "active" : "",
            title: "Edit global standing-frame changes",
            onclick: () => {
              void switchEditorContext(stateObj, false);
            },
          },
          "Global",
        ),
        m(
          "button.part-editor-pro-button",
          {
            type: "button",
            class: stateObj.frameMode ? "active" : "",
            disabled: !canUseFrameTools,
            title: "Edit one animation frame",
            onclick: () => {
              void switchEditorContext(stateObj, true);
            },
          },
          "Frame",
        ),
      ]),
      m("label.part-editor-pro-field.part-editor-pro-field-wide", [
        m("span", "Anim"),
        m(
          "select",
          {
            value: stateObj.frameAnimation,
            disabled: !canUseFrameTools,
            title: "Animation for frame editing",
            onchange: (e: Event) => {
              const animation = (e.target as HTMLSelectElement).value;
              void switchEditorContext(stateObj, true, animation, 0);
            },
          },
          stateObj.availableFrameAnimations.map((animation) =>
            m("option", { value: animation }, getAnimationLabel(animation)),
          ),
        ),
        m("b", stateObj.frameMode ? "On" : "Off"),
      ]),
      // Task 6: Play/pause
      m("div.part-editor-playback-controls", [
        m(
          "button.part-editor-pro-button",
          {
            type: "button",
            title: stateObj.isPlaying ? "Pause playback" : "Play animation",
            disabled: !stateObj.frameMode,
            onclick: () => {
              if (stateObj.isPlaying) {
                stopPlayback(stateObj);
              } else {
                startPlayback(stateObj);
              }
            },
          },
          stateObj.isPlaying ? "⏸ Pause" : "▶ Play",
        ),
      ]),
      m("div.part-editor-frame-controls", [
        m(
          "button.part-editor-pro-button",
          {
            type: "button",
            disabled: !stateObj.frameMode || stateObj.frameIndex <= 0,
            title: "Previous animation frame (,)",
            onclick: () => {
              void switchEditorContext(
                stateObj,
                true,
                stateObj.frameAnimation,
                stateObj.frameIndex - 1,
              );
            },
          },
          "<",
        ),
        m("input.part-editor-frame-slider", {
          type: "range",
          min: "0",
          max: String(Math.max(0, frameCount - 1)),
          step: "1",
          value: String(stateObj.frameIndex),
          disabled: !stateObj.frameMode,
          title: "Animation frame",
          oninput: (e: Event) => {
            void switchEditorContext(
              stateObj,
              true,
              stateObj.frameAnimation,
              Number((e.target as HTMLInputElement).value),
            );
          },
        }),
        m(
          "button.part-editor-pro-button",
          {
            type: "button",
            disabled:
              !stateObj.frameMode || stateObj.frameIndex >= frameCount - 1,
            title: "Next animation frame (.)",
            onclick: () => {
              void switchEditorContext(
                stateObj,
                true,
                stateObj.frameAnimation,
                stateObj.frameIndex + 1,
              );
            },
          },
          ">",
        ),
        m(
          "span.part-editor-frame-count",
          `${stateObj.frameIndex + 1}/${frameCount}`,
        ),
      ]),
      // Task 6: Scrubbable timeline thumbnails
      renderTimelineThumbnails(stateObj, frameCount),
      // Task 6: Apply Global to Frame
      m(
        "button.part-editor-pro-button",
        {
          type: "button",
          title: "Copy global edits into the current frame",
          disabled: !stateObj.frameMode || !stateObj.globalEditorContext,
          onclick: () => applyGlobalToFrame(stateObj),
        },
        "Apply Global to Frame",
      ),
      m(
        "label.part-editor-pro-toggle",
        {
          title: "Show neighboring animation frames",
        },
        [
          m("input", {
            type: "checkbox",
            checked: stateObj.onionSkin,
            onchange: (e: Event) => {
              stateObj.onionSkin = (e.target as HTMLInputElement).checked;
              if (stateObj.frameMode) {
                void updateOnionCanvases(stateObj);
              }
            },
          }),
          "Onion",
        ],
      ),
      m("label.part-editor-pro-field", [
        m("span", "Ghost"),
        m("input", {
          type: "range",
          min: "10",
          max: "70",
          step: "5",
          value: String(Math.round(stateObj.onionOpacity * 100)),
          title: "Onion skin opacity",
          oninput: (e: Event) => {
            stateObj.onionOpacity =
              Number((e.target as HTMLInputElement).value) / 100;
          },
        }),
        m("b", `${Math.round(stateObj.onionOpacity * 100)}%`),
      ]),
    ]),
  ];
}

export function renderStatusBar(stateObj: PartEditorState): m.Children {
  const cursor = stateObj.cursorPosition;
  const cursorText = cursor ? `${cursor.x},${cursor.y}` : "—";
  const activeLayer = getActiveLayer(stateObj);
  const layerName = activeLayer?.name ?? "—";
  const frameText = stateObj.frameMode
    ? `F${stateObj.frameIndex + 1}`
    : "Global";

  return m("div.part-editor-status-bar", [
    m("span.part-editor-status-item", `Pos: ${cursorText}`),
    m(
      "span.part-editor-status-item",
      `Dir: ${stateObj.activeDirection.toUpperCase()}`,
    ),
    m("span.part-editor-status-item", `Zoom: ${stateObj.zoom}x`),
    m("span.part-editor-status-item", `Layer: ${layerName}`),
    m("span.part-editor-status-item", `Brush: ${stateObj.brushSize}px`),
    m("span.part-editor-status-item", frameText),
  ]);
}

export function renderRecoveryPrompt(stateObj: PartEditorState): m.Children {
  return m("div.part-editor-recovery-overlay", [
    m("div.part-editor-recovery-dialog", [
      m("h4", "Recover Unsaved Draft?"),
      m("p", "You have unsaved edits from a previous session."),
      m("div.part-editor-recovery-actions", [
        m(
          "button.part-editor-pro-button",
          {
            type: "button",
            onclick: async () => {
              const draft = await loadDraft(stateObj.baseItemId!);
              if (draft) {
                try {
                  const context = JSON.parse(draft) as EditorContextSnapshot;
                  await restoreEditorContext(stateObj, context);
                  stateObj.globalEditorContext = context;
                  stateObj.unsavedChanges = true;
                } catch (err) {
                  debugWarn("Failed to restore draft:", err);
                }
              }
              stateObj.showRecoveryPrompt = false;
              m.redraw();
            },
          },
          "Restore Draft",
        ),
        m(
          "button.part-editor-pro-button.part-editor-transform-clear",
          {
            type: "button",
            onclick: () => {
              stateObj.showRecoveryPrompt = false;
              if (stateObj.baseItemId) {
                void clearDraft(stateObj.baseItemId);
              }
              m.redraw();
            },
          },
          "Discard",
        ),
      ]),
    ]),
  ]);
}

export function renderTimelineThumbnails(
  stateObj: PartEditorState,
  frameCount: number,
): m.Children {
  if (!stateObj.frameMode || frameCount <= 1) return null;

  return m("div.part-editor-timeline-strip", [
    Array.from({ length: frameCount }, (_, i) => {
      const isActive = i === stateObj.frameIndex;
      const dirty = isFrameDirty(stateObj, i);
      return m(
        "div.part-editor-timeline-thumb",
        {
          key: i,
          class: isActive ? "active" : "",
          title: `Frame ${i + 1}${dirty ? " (edited)" : ""}`,
          onclick: () => {
            void switchEditorContext(
              stateObj,
              true,
              stateObj.frameAnimation,
              i,
            );
          },
        },
        [
          m("span.part-editor-timeline-label", String(i + 1)),
          dirty ? m("span.part-editor-timeline-dot") : null,
        ],
      );
    }),
  ]);
}

