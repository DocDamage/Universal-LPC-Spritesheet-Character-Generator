import m from "mithril";
import { state, selectItem, getSelectionGroup } from "../../state/state.ts";
import type { CatalogReader } from "../../state/catalog.ts";
import type { SlotDef } from "./slot-config.ts";
import {
  getSlotOptions,
  getSlotSelectedValue,
  clearSlotSelections,
  randomizeSlot,
  getDefaultRecolor,
  getSlotTypeNames,
} from "./slot-config.ts";
import { getPaletteOptions } from "../../state/palettes.ts";
import { ucwords } from "../../utils/helpers.ts";
import {
  setPreviewAnimation,
  stopPreviewAnimation,
  startPreviewAnimation,
} from "../../canvas/preview-animation.ts";
import { renderCharacter } from "../../canvas/renderer.ts";
import { customAnimations } from "../../custom-animations.ts";
import {
  customParts,
  deleteCustomPart,
  getItemMerged,
  registerCustomPart,
  renameCustomPart,
} from "../../state/catalog.ts";
import {
  buildImportedWeaponPart,
  canUseWeaponImportReference,
  getCustomWeaponImportName,
} from "./custom-weapon-import.ts";
import { requestConfirmation, showToast } from "../../state/notifications.ts";

type SlotSelectorAttrs = {
  slot: SlotDef;
  catalog: CatalogReader;
};

type SlotSelectorState = {
  showColorPicker: boolean;
  showImporter: boolean;
  importName: string;
  importReferenceValue: string;
  importStatus: string;
  importing: boolean;
  importOffsetX: number;
  importOffsetY: number;
  importScalePercent: number;
  renamingCustomPartId: string | null;
  renameCustomPartName: string;
};

const IMPORT_OFFSET_MIN = -256;
const IMPORT_OFFSET_MAX = 256;
const IMPORT_SCALE_MIN = 10;
const IMPORT_SCALE_MAX = 800;

/** Build a simple list of recolor choices for an item. */
function getRecolorChoices(
  itemId: string,
  catalog: CatalogReader,
): { label: string; value: string; gradient: string[] }[] {
  const metaResult = catalog.getItemLite(itemId);
  if (metaResult.isErr()) return [];
  const meta = metaResult.value;

  const [paletteOptions] = getPaletteOptions(itemId, meta);
  if (!paletteOptions || paletteOptions.length === 0) return [];

  const choices: ReturnType<typeof getRecolorChoices> = [];

  for (const opt of paletteOptions) {
    const paletteMetaResult = catalog.getPaletteMetadata();
    if (paletteMetaResult.isErr()) continue;
    const paletteMeta = paletteMetaResult.value;

    for (const cat of opt.versions) {
      const [material, version] = cat.split(".");
      const materialMeta = paletteMeta.materials[material];
      const recolors = materialMeta?.palettes?.[version] ?? {};

      for (const [paletteName, colors] of Object.entries(recolors)) {
        const key =
          (material !== opt.material ? material + "." : "") +
          (version !== opt.default ? version + "." : "") +
          paletteName;
        choices.push({
          label: ucwords(paletteName.replaceAll("_", " ")),
          value: key,
          gradient: colors.slice().reverse(),
        });
      }
    }
  }

  return choices;
}

/** Get the currently selected recolor for an item. */
function getSelectedRecolor(itemId: string): string | null {
  const selectionGroup = getSelectionGroup(itemId);
  const sel = state.selections[selectionGroup];
  if (sel?.itemId === itemId) {
    return sel.recolor || null;
  }
  return null;
}

export const SlotSelector: m.Component<SlotSelectorAttrs, SlotSelectorState> = {
  oninit(vnode) {
    vnode.state.showColorPicker = false;
    vnode.state.showImporter = false;
    vnode.state.importName = "";
    vnode.state.importReferenceValue = "";
    vnode.state.importStatus = "";
    vnode.state.importing = false;
    vnode.state.importOffsetX = 0;
    vnode.state.importOffsetY = 0;
    vnode.state.importScalePercent = 100;
    vnode.state.renamingCustomPartId = null;
    vnode.state.renameCustomPartName = "";
  },

  view(vnode) {
    const { slot, catalog } = vnode.attrs;
    const options = getSlotOptions(slot, catalog);
    const selectedValue = getSlotSelectedValue(slot, catalog);
    const hasSelection = selectedValue !== "";
    const canImportWeapon = slot.label === "Mainhand";
    const slotTypeNames = getSlotTypeNames(slot);
    const importReferenceOptions = canImportWeapon
      ? options.filter(
          (opt) =>
            !opt.itemId.startsWith("custom_") &&
            canUseWeaponImportReference(catalog, opt.itemId),
        )
      : [];
    const customAssetParts = canImportWeapon
      ? Object.values(customParts)
          .filter((part) => slotTypeNames.includes(part.type_name))
          .sort((a, b) => a.name.localeCompare(b.name))
      : [];
    if (
      canImportWeapon &&
      importReferenceOptions.length > 0 &&
      !importReferenceOptions.some(
        (opt) => opt.value === vnode.state.importReferenceValue,
      )
    ) {
      vnode.state.importReferenceValue =
        selectedValue &&
        importReferenceOptions.some((opt) => opt.value === selectedValue)
          ? selectedValue
          : importReferenceOptions[0].value;
    }

    const isBodyType = slot.kind === "bodyType";

    // Find the selected option to get its itemId for color picker
    let selectedItemId: string | null = null;
    if (hasSelection && !isBodyType) {
      const opt = options.find((o) => o.value === selectedValue);
      if (opt) {
        selectedItemId = opt.itemId;
      }
    }

    // Get recolor choices for the color picker
    const recolorChoices = selectedItemId
      ? getRecolorChoices(selectedItemId, catalog)
      : [];
    const currentRecolor = selectedItemId
      ? getSelectedRecolor(selectedItemId)
      : null;

    const handleWeaponImport = async (e: Event): Promise<void> => {
      const input = e.target as HTMLInputElement;
      const file = input.files?.[0];
      if (!file) return;

      const reference =
        importReferenceOptions.find(
          (opt) => opt.value === vnode.state.importReferenceValue,
        ) ?? importReferenceOptions[0];
      if (!reference) return;

      vnode.state.importing = true;
      vnode.state.importStatus = "Aligning...";
      m.redraw();

      try {
        const name =
          vnode.state.importName.trim() || getCustomWeaponImportName(file);
        const customPart = await buildImportedWeaponPart({
          file,
          name: name || "Imported weapon",
          referenceItemId: reference.itemId,
          referenceVariant: reference.variant ?? null,
          bodyType: state.bodyType,
          selections: state.selections,
          catalog,
          offsetX: vnode.state.importOffsetX,
          offsetY: vnode.state.importOffsetY,
          scalePercent: vnode.state.importScalePercent,
        });
        registerCustomPart(customPart);
        clearSlotSelections(slot, catalog);
        state.selections[customPart.type_name] = {
          itemId: customPart.itemId,
          variant: null,
          recolor: null,
          name: customPart.name,
        };
        await (window.canvasRenderer?.renderCharacter ?? renderCharacter)(
          state.selections,
          state.bodyType,
        );
        const importedCustomAnimation = Object.keys(customPart.sheets).find(
          (animation) => customAnimations[animation],
        );
        if (importedCustomAnimation) {
          stopPreviewAnimation();
          setPreviewAnimation(importedCustomAnimation);
          startPreviewAnimation();
          state.selectedAnimation = importedCustomAnimation;
        }
        vnode.state.importStatus = `Imported ${customPart.name}`;
        vnode.state.showImporter = false;
        vnode.state.importName = "";
        input.value = "";
      } catch (err) {
        vnode.state.importStatus =
          err instanceof Error ? err.message : "Import failed";
      } finally {
        vnode.state.importing = false;
        m.redraw();
      }
    };

    const setImportNumber = (
      key: "importOffsetX" | "importOffsetY" | "importScalePercent",
      rawValue: string,
      min: number,
      max: number,
    ): void => {
      const nextValue = Number(rawValue);
      vnode.state[key] = Number.isFinite(nextValue)
        ? Math.max(min, Math.min(max, nextValue))
        : key === "importScalePercent"
          ? 100
          : 0;
    };

    const resetImportTuning = (): void => {
      vnode.state.importOffsetX = 0;
      vnode.state.importOffsetY = 0;
      vnode.state.importScalePercent = 100;
    };

    const renderCurrentCharacter = async (): Promise<void> => {
      await (window.canvasRenderer?.renderCharacter ?? renderCharacter)(
        state.selections,
        state.bodyType,
      );
      m.redraw();
    };

    const selectCustomAsset = async (
      part: (typeof customAssetParts)[number],
    ): Promise<void> => {
      clearSlotSelections(slot, catalog);
      state.selections[part.type_name] = {
        itemId: part.itemId,
        variant: null,
        recolor: null,
        name: part.name,
      };
      await renderCurrentCharacter();
    };

    const startRenameCustomAsset = (
      part: (typeof customAssetParts)[number],
    ): void => {
      vnode.state.renamingCustomPartId = part.itemId;
      vnode.state.renameCustomPartName = part.name;
    };

    const cancelRenameCustomAsset = (): void => {
      vnode.state.renamingCustomPartId = null;
      vnode.state.renameCustomPartName = "";
    };

    const saveRenameCustomAsset = (
      part: (typeof customAssetParts)[number],
    ): void => {
      const nextName = vnode.state.renameCustomPartName.trim();
      if (!nextName) return;

      if (renameCustomPart(part.itemId, nextName)) {
        for (const selection of Object.values(state.selections)) {
          if (selection.itemId === part.itemId) {
            selection.name = nextName;
          }
        }
      }
      cancelRenameCustomAsset();
    };

    const deleteCustomAsset = async (
      part: (typeof customAssetParts)[number],
    ): Promise<void> => {
      const confirmed = await requestConfirmation({
        title: "Delete imported asset",
        message: `Delete "${part.name}" from saved imports?`,
        confirmLabel: "Delete",
        danger: true,
      });
      if (!confirmed) return;

      const wasSelected = Object.values(state.selections).some(
        (selection) => selection.itemId === part.itemId,
      );
      for (const [key, selection] of Object.entries(state.selections)) {
        if (selection.itemId === part.itemId) {
          delete state.selections[key];
        }
      }
      deleteCustomPart(part.itemId);
      if (vnode.state.renamingCustomPartId === part.itemId) {
        cancelRenameCustomAsset();
      }
      showToast(`Deleted "${part.name}".`, { kind: "success" });
      if (wasSelected) {
        await renderCurrentCharacter();
      } else {
        m.redraw();
      }
    };

    return m(
      "div.desktop-slot",
      { class: canImportWeapon ? "has-importer" : "" },
      [
        m("label.desktop-slot-label", slot.label),
        m("div.desktop-slot-control", [
          m(
            "select.desktop-slot-select",
            {
              value: selectedValue,
              onchange: (e: Event) => {
                const target = e.target as HTMLSelectElement;
                const value = target.value;
                vnode.state.showColorPicker = false;

                if (isBodyType) {
                  state.bodyType = value;
                  m.redraw();
                  return;
                }

                if (!value) {
                  clearSlotSelections(slot, catalog);
                  return;
                }

                const opt = options.find((o) => o.value === value);
                if (!opt) return;

                clearSlotSelections(slot, catalog);

                if (opt.variant) {
                  selectItem(opt.itemId, opt.variant);
                } else {
                  const defaultRecolor = getDefaultRecolor(opt.itemId, catalog);
                  selectItem(opt.itemId, defaultRecolor || "");
                }

                // Auto-switch preview animation for custom-animation-only items
                const meta = getItemMerged(opt.itemId).unwrapOr(null);
                if (meta && meta.animations && meta.animations.length > 0) {
                  const firstAnim = meta.animations[0];
                  if (
                    firstAnim &&
                    customAnimations &&
                    customAnimations[firstAnim]
                  ) {
                    // This item only has custom animations — switch preview to show it
                    stopPreviewAnimation();
                    setPreviewAnimation(firstAnim);
                    startPreviewAnimation();
                    state.selectedAnimation = firstAnim;
                  }
                }
              },
            },
            [
              m("option", { value: "" }, "None"),
              ...options.map((opt) =>
                m("option", { value: opt.value }, opt.label),
              ),
            ],
          ),
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
          hasSelection && !isBodyType && selectedItemId
            ? m(
                "button.desktop-slot-edit",
                {
                  title: `Edit ${slot.label}`,
                  onclick: () => {
                    state.editingPart = {
                      slotLabel: slot.label,
                      itemId: selectedItemId!,
                    };
                  },
                },
                "✏️",
              )
            : null,
          canImportWeapon
            ? m(
                "button.desktop-slot-import",
                {
                  type: "button",
                  title: vnode.state.showImporter
                    ? "Close weapon import"
                    : "Import a weapon or tool and align it to a built-in reference",
                  onclick: () => {
                    vnode.state.showColorPicker = false;
                    vnode.state.showImporter = !vnode.state.showImporter;
                  },
                },
                "↥",
              )
            : null,
          slot.hasColor && hasSelection && selectedItemId
            ? m("div.desktop-slot-color", {
                style: {
                  backgroundColor:
                    recolorChoices.find((c) => c.value === currentRecolor)
                      ?.gradient[0] ?? "#8B7355",
                },
                title: currentRecolor
                  ? `Color: ${currentRecolor}`
                  : "Click to change color",
                onclick: (e: MouseEvent) => {
                  e.stopPropagation();
                  vnode.state.showColorPicker = !vnode.state.showColorPicker;
                },
              })
            : null,
        ]),
        canImportWeapon && vnode.state.showImporter
          ? m("div.desktop-slot-import-panel", [
              m("input.desktop-slot-import-name", {
                type: "text",
                placeholder: "Imported asset name",
                value: vnode.state.importName,
                title: "Name for the imported weapon or tool",
                oninput: (e: Event) => {
                  vnode.state.importName = (e.target as HTMLInputElement).value;
                },
              }),
              m(
                "select.desktop-slot-import-reference",
                {
                  value: vnode.state.importReferenceValue,
                  title: "Built-in asset used as the alignment reference",
                  onchange: (e: Event) => {
                    vnode.state.importReferenceValue = (
                      e.target as HTMLSelectElement
                    ).value;
                  },
                },
                importReferenceOptions.map((opt) =>
                  m("option", { value: opt.value }, opt.label),
                ),
              ),
              m("input.desktop-slot-import-input", {
                type: "file",
                accept: "image/*",
                title:
                  "Choose a transparent weapon/tool image or full LPC sheet",
                disabled:
                  vnode.state.importing || importReferenceOptions.length === 0,
                onchange: (e: Event) => {
                  void handleWeaponImport(e);
                },
              }),
              m("div.desktop-slot-import-tuning", [
                m("label.desktop-slot-import-tune", [
                  m("span", "X"),
                  m("input", {
                    type: "number",
                    min: String(IMPORT_OFFSET_MIN),
                    max: String(IMPORT_OFFSET_MAX),
                    step: "1",
                    value: String(vnode.state.importOffsetX),
                    title:
                      "Horizontal alignment nudge in pixels; mirrored side rows use the opposite X offset",
                    disabled: vnode.state.importing,
                    oninput: (e: Event) => {
                      setImportNumber(
                        "importOffsetX",
                        (e.target as HTMLInputElement).value,
                        IMPORT_OFFSET_MIN,
                        IMPORT_OFFSET_MAX,
                      );
                    },
                  }),
                ]),
                m("label.desktop-slot-import-tune", [
                  m("span", "Y"),
                  m("input", {
                    type: "number",
                    min: String(IMPORT_OFFSET_MIN),
                    max: String(IMPORT_OFFSET_MAX),
                    step: "1",
                    value: String(vnode.state.importOffsetY),
                    title: "Vertical alignment nudge in pixels",
                    disabled: vnode.state.importing,
                    oninput: (e: Event) => {
                      setImportNumber(
                        "importOffsetY",
                        (e.target as HTMLInputElement).value,
                        IMPORT_OFFSET_MIN,
                        IMPORT_OFFSET_MAX,
                      );
                    },
                  }),
                ]),
                m("label.desktop-slot-import-tune", [
                  m("span", "%"),
                  m("input", {
                    type: "number",
                    min: String(IMPORT_SCALE_MIN),
                    max: String(IMPORT_SCALE_MAX),
                    step: "5",
                    value: String(vnode.state.importScalePercent),
                    title:
                      "Scale applied after auto-alignment; 100 keeps the matched reference size",
                    disabled: vnode.state.importing,
                    oninput: (e: Event) => {
                      setImportNumber(
                        "importScalePercent",
                        (e.target as HTMLInputElement).value,
                        IMPORT_SCALE_MIN,
                        IMPORT_SCALE_MAX,
                      );
                    },
                  }),
                ]),
                m(
                  "button.desktop-slot-import-reset",
                  {
                    type: "button",
                    title: "Reset import alignment tuning",
                    disabled: vnode.state.importing,
                    onclick: resetImportTuning,
                  },
                  "↺",
                ),
              ]),
              vnode.state.importStatus
                ? m("span.desktop-slot-import-status", vnode.state.importStatus)
                : null,
              customAssetParts.length > 0
                ? m("div.desktop-slot-custom-library", [
                    m("div.desktop-slot-custom-library-title", "Saved imports"),
                    customAssetParts.map((part) =>
                      m(
                        "div.desktop-slot-custom-asset",
                        {
                          key: part.itemId,
                          class:
                            selectedValue === part.itemId ? "is-selected" : "",
                        },
                        vnode.state.renamingCustomPartId === part.itemId
                          ? [
                              m("input.desktop-slot-custom-asset-name", {
                                type: "text",
                                value: vnode.state.renameCustomPartName,
                                title: "Rename saved import",
                                oninput: (e: Event) => {
                                  vnode.state.renameCustomPartName = (
                                    e.target as HTMLInputElement
                                  ).value;
                                },
                                onkeydown: (e: KeyboardEvent) => {
                                  if (e.key === "Enter") {
                                    saveRenameCustomAsset(part);
                                  }
                                  if (e.key === "Escape") {
                                    cancelRenameCustomAsset();
                                  }
                                },
                              }),
                              m(
                                "button.desktop-slot-custom-action",
                                {
                                  type: "button",
                                  title: "Save import name",
                                  disabled:
                                    vnode.state.renameCustomPartName.trim() ===
                                    "",
                                  onclick: () => saveRenameCustomAsset(part),
                                },
                                "Save",
                              ),
                              m(
                                "button.desktop-slot-custom-action",
                                {
                                  type: "button",
                                  title: "Cancel rename",
                                  onclick: cancelRenameCustomAsset,
                                },
                                "Cancel",
                              ),
                            ]
                          : [
                              m(
                                "button.desktop-slot-custom-name",
                                {
                                  type: "button",
                                  title: `Use ${part.name}`,
                                  onclick: () => {
                                    void selectCustomAsset(part);
                                  },
                                },
                                part.name,
                              ),
                              m(
                                "button.desktop-slot-custom-action",
                                {
                                  type: "button",
                                  title: `Rename ${part.name}`,
                                  onclick: () => {
                                    startRenameCustomAsset(part);
                                  },
                                },
                                "Rename",
                              ),
                              m(
                                "button.desktop-slot-custom-action is-danger",
                                {
                                  type: "button",
                                  title: `Delete ${part.name}`,
                                  onclick: () => {
                                    void deleteCustomAsset(part);
                                  },
                                },
                                "Delete",
                              ),
                            ],
                      ),
                    ),
                  ])
                : null,
            ])
          : null,
        // Inline color picker panel
        vnode.state.showColorPicker && recolorChoices.length > 0
          ? m("div.desktop-color-picker", [
              m(
                "div.desktop-color-picker-grid",
                recolorChoices.map((choice) =>
                  m(
                    "div.desktop-color-swatch",
                    {
                      key: choice.value,
                      class:
                        choice.value === currentRecolor
                          ? "desktop-color-swatch-selected"
                          : "",
                      title: choice.label,
                      style: {
                        background: `linear-gradient(to bottom, ${choice.gradient.join(", ")})`,
                      },
                      onclick: () => {
                        if (selectedItemId) {
                          selectItem(selectedItemId, choice.value);
                        }
                        vnode.state.showColorPicker = false;
                      },
                    },
                    m("span.desktop-color-swatch-label", choice.label),
                  ),
                ),
              ),
            ])
          : null,
      ],
    );
  },
};
