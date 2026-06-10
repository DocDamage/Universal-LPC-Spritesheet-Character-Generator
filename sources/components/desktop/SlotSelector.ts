import m from "mithril";
import { state } from "../../state/state.ts";
import type { CatalogReader } from "../../state/catalog.ts";
import type { SlotDef } from "./slot-config.ts";
import { randomizeSlot, getSlotOptions } from "./slot-config.ts";
import type { SlotOption } from "./slot-config.ts";
import { requireFeature, paidFeatureTitle } from "../../state/feature-gates.ts";
import type { SlotSelectorState } from "./slot-selector/types.ts";
import { initializeSlotSelectorState } from "./slot-selector/state.ts";
import { createSlotChangeHandler } from "./slot-selector/selection-handler.ts";
import { createImportHandlers } from "./slot-selector/import-handlers.ts";
import {
  drawPreviewCanvases,
  renderImportPanel,
  renderColorPicker,
} from "./slot-selector/view-helpers.ts";
import { buildSlotViewData } from "./slot-selector/view-data.ts";

type SlotSelectorAttrs = {
  slot: SlotDef;
  catalog: CatalogReader;
};

/**
 * Slot selector component — dropdown, randomize, edit, color, and weapon
 * import controls for a single character equipment slot.
 *
 * Computed view data is assembled by buildSlotViewData() so the template
 * stays focused on presentation.
 */
export const SlotSelector: m.Component<SlotSelectorAttrs, SlotSelectorState> = {
  oninit(vnode) {
    initializeSlotSelectorState(vnode.state);
  },

  view(vnode) {
    const { slot, catalog } = vnode.attrs;
    const data = buildSlotViewData(slot, catalog, vnode.state);

    // Import handlers (created once per render — they reference state)
    const importHandlers = createImportHandlers({
      stateObj: vnode.state,
      slot,
      catalog,
      importReferenceOptions: data.importReferenceOptions as SlotOption[],
      slotTypeNames: data.slotTypeNames,
    });

    // Canvas preview drawing (side-effect, runs every render)
    drawPreviewCanvases(slot, vnode.state);

    // Slot selection change handlers
    const onBuiltInChange = createSlotChangeHandler(
      slot,
      catalog,
      data.builtInOptions,
      data.isBodyType,
      vnode.state,
    );

    const onCustomChange = createSlotChangeHandler(
      slot,
      catalog,
      data.customOptions,
      data.isBodyType,
      vnode.state,
    );

    return m(
      "div.desktop-slot",
      { class: data.canImportWeapon ? "has-importer" : "" },
      [
        m("label.desktop-slot-label", slot.label),
        m("div.desktop-slot-control", [
          // Render search/filter input if there are more than 8 total options or if slotItemFilter is active
          getSlotOptions(slot, catalog).length > 8 || vnode.state.slotItemFilter
            ? m("input.input.is-small.desktop-slot-item-filter", {
                type: "text",
                placeholder: `Filter ${slot.label}...`,
                value: vnode.state.slotItemFilter,
                oninput: (e: Event) => {
                  vnode.state.slotItemFilter = (
                    e.target as HTMLInputElement
                  ).value;
                },
                style: { marginBottom: "4px", width: "100%" },
              })
            : null,
          m("div.desktop-slot-selects-container", {
            style: {
              display: "flex",
              gap: "4px",
              flex: "1 1 0%",
              minWidth: "0",
            }
          }, [
            m(
              "select.desktop-slot-select",
              {
                value: data.selectedBuiltInValue,
                onchange: onBuiltInChange,
                style: { flex: "1 1 0%", minWidth: "0" },
              },
              [
                m("option", { value: "" }, "None"),
                ...data.builtInOptions.map((opt) =>
                  m("option", { value: opt.value }, opt.label),
                ),
              ],
            ),
            data.customOptions.length > 0
              ? m(
                  "select.desktop-slot-select.desktop-slot-select-custom",
                  {
                    value: data.selectedCustomValue,
                    onchange: onCustomChange,
                    style: { flex: "1 1 0%", minWidth: "0" },
                  },
                  [
                    m("option", { value: "" }, "Custom..."),
                    ...data.customOptions.map((opt) =>
                      m("option", { value: opt.value }, opt.label),
                    ),
                  ],
                )
              : null,
          ]),

          slot.canRandomize
            ? m(
                "button.desktop-slot-dice",
                {
                  title: `Randomize ${slot.label}`,
                  onclick: () => {
                    vnode.state.showColorPicker = false;
                    randomizeSlot(slot, catalog);
                  },
                },
                "🎲",
              )
            : null,

          data.hasSelection && !data.isBodyType && data.selectedItemId
            ? m(
                "button.desktop-slot-edit",
                {
                  class: data.canEditParts ? "" : "is-locked",
                  title: data.canEditParts
                    ? `Edit ${slot.label}`
                    : paidFeatureTitle("advanced-editor"),
                  onclick: () => {
                    if (!requireFeature("advanced-editor")) return;
                    state.editingPart = {
                      slotLabel: slot.label,
                      itemId: data.selectedItemId!,
                    };
                  },
                },
                "✏️",
              )
            : null,

          data.canImportWeapon
            ? m(
                "button.desktop-slot-import",
                {
                  type: "button",
                  title: vnode.state.showImporter
                    ? "Close weapon import"
                    : data.canImportCustomAssets
                      ? "Import a weapon or tool and align it to a built-in reference"
                      : paidFeatureTitle("custom-imports"),
                  onclick: () => {
                    if (!requireFeature("custom-imports")) return;
                    vnode.state.showColorPicker = false;
                    vnode.state.showImporter = !vnode.state.showImporter;
                    if (!vnode.state.showImporter) {
                      importHandlers.clearPreview();
                    }
                  },
                },
                "↥",
              )
            : null,

          slot.hasColor && data.hasSelection && data.selectedItemId
            ? m("div.desktop-slot-color", {
                style: {
                  backgroundColor:
                    data.recolorChoices.find(
                      (c) => c.value === data.currentRecolor,
                    )?.gradient[0] ?? "#8B7355",
                },
                title: data.currentRecolor
                  ? `Color: ${data.currentRecolor}`
                  : "Click to change color",
                onclick: (e: MouseEvent) => {
                  e.stopPropagation();
                  vnode.state.showColorPicker = !vnode.state.showColorPicker;
                },
              })
            : null,
        ]),

        data.canImportWeapon && vnode.state.showImporter
          ? renderImportPanel(
              slot,
              vnode.state,
              data.importReferenceOptions,
              importHandlers,
              data.customAssetParts,
              data.selectedValue,
            )
          : null,

        renderColorPicker(
          data.recolorChoices,
          data.currentRecolor,
          data.selectedItemId,
          vnode.state,
        ),
      ],
    );
  },
};
