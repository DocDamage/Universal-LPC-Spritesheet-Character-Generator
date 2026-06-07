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
import { getItemMerged, registerCustomPart } from "../../state/catalog.ts";
import {
  buildImportedWeaponPart,
  canUseWeaponImportReference,
  getCustomWeaponImportName,
} from "./custom-weapon-import.ts";

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
};

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
  },

  view(vnode) {
    const { slot, catalog } = vnode.attrs;
    const options = getSlotOptions(slot, catalog);
    const selectedValue = getSlotSelectedValue(slot, catalog);
    const hasSelection = selectedValue !== "";
    const canImportWeapon = slot.label === "Mainhand";
    const importReferenceOptions = canImportWeapon
      ? options.filter(
          (opt) =>
            !opt.itemId.startsWith("custom_") &&
            canUseWeaponImportReference(catalog, opt.itemId),
        )
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
        });
        registerCustomPart(customPart);
        clearSlotSelections(slot, catalog);
        state.selections.weapon = {
          itemId: customPart.itemId,
          variant: null,
          recolor: null,
          name: customPart.name,
        };
        await (window.canvasRenderer?.renderCharacter ?? renderCharacter)(
          state.selections,
          state.bodyType,
        );
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
                placeholder: "Imported weapon name",
                value: vnode.state.importName,
                title: "Name for the imported weapon",
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
              vnode.state.importStatus
                ? m("span.desktop-slot-import-status", vnode.state.importStatus)
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
