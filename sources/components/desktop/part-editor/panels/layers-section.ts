import m from "mithril";
import type { EditorLayer, PartEditorState } from "../types.ts";
import {
  addEditLayer,
  duplicateActiveLayer,
  moveActiveLayer,
  deleteActiveLayer,
  mergeActiveLayerDown,
  flattenVisibleLayers,
  getActiveLayer,
  getActiveLayerIndex,
} from "../layers.ts";
import { recomposeCanvases } from "../canvas.ts";
import { saveHistory } from "../history.ts";
import { clearSelectionState } from "../selection.ts";
import { renderLayerRowItem } from "./layer-row.ts";

function renderGroupedLayerList(stateObj: PartEditorState): m.Children {
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
      const isCollapsed = stateObj.collapsedLayerGroups[groupName] === true;
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
}

export function renderLayersSection(stateObj: PartEditorState): m.Children {
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

  return m("div.part-editor-pro-section.part-editor-layers-section", [
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
    m("div.part-editor-layer-list", renderGroupedLayerList(stateObj)),
  ]);
}
