import m from "mithril";
import type { CustomPart } from "../../../state/catalog.ts";
import type { SlotSelectorState } from "./types.ts";

type CustomLibraryAttrs = {
  stateObj: SlotSelectorState;
  selectedValue: string;
  customAssetParts: CustomPart[];
  exportAllCustomAssets: () => void | Promise<void>;
  importBackupCustomAssets: (e: Event) => void | Promise<void>;
  selectCustomAsset: (part: CustomPart) => void | Promise<void>;
  startRenameCustomAsset: (part: CustomPart) => void;
  cancelRenameCustomAsset: () => void;
  saveRenameCustomAsset: (part: CustomPart) => void;
  duplicateCustomAsset: (part: CustomPart) => void;
  deleteCustomAsset: (part: CustomPart) => void | Promise<void>;
  startEditTags: (part: CustomPart) => void;
  cancelEditTags: () => void;
  saveTags: (part: CustomPart) => void;
};

export function renderCustomAssetLibrary({
  stateObj,
  selectedValue,
  customAssetParts,
  exportAllCustomAssets,
  importBackupCustomAssets,
  selectCustomAsset,
  startRenameCustomAsset,
  cancelRenameCustomAsset,
  saveRenameCustomAsset,
  duplicateCustomAsset,
  deleteCustomAsset,
  startEditTags,
  cancelEditTags,
  saveTags,
}: CustomLibraryAttrs): m.Children {
  return [
    m("div.desktop-slot-custom-library-header", [
      m("span.desktop-slot-custom-library-title", "Saved imports"),
      m("input.desktop-slot-custom-filter", {
        type: "text",
        placeholder: "Filter by name or tag...",
        value: stateObj.customAssetFilter,
        oninput: (e: Event) => {
          stateObj.customAssetFilter = (e.target as HTMLInputElement).value;
        },
      }),
      m(
        "button.desktop-slot-custom-action",
        {
          type: "button",
          title: "Export all custom assets as ZIP backup",
          onclick: () => {
            void exportAllCustomAssets();
          },
        },
        "Export All",
      ),
      m("label.desktop-slot-custom-action is-file", [
        m("input", {
          type: "file",
          accept: ".zip",
          style: { display: "none" },
          onchange: (e: Event) => {
            void importBackupCustomAssets(e);
          },
        }),
        "Import Backup",
      ]),
    ]),
    customAssetParts.length > 0
      ? m("div.desktop-slot-custom-library", [
          customAssetParts.map((part) =>
            m(
              "div.desktop-slot-custom-asset",
              {
                key: part.itemId,
                class: selectedValue === part.itemId ? "is-selected" : "",
              },
              stateObj.renamingCustomPartId === part.itemId
                ? [
                    m("input.desktop-slot-custom-asset-name", {
                      type: "text",
                      value: stateObj.renameCustomPartName,
                      title: "Rename saved import",
                      oninput: (e: Event) => {
                        stateObj.renameCustomPartName = (
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
                        disabled: stateObj.renameCustomPartName.trim() === "",
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
                    part.tags && part.tags.length > 0
                      ? m("span.desktop-slot-custom-tags", part.tags.join(", "))
                      : null,
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
                      "button.desktop-slot-custom-action",
                      {
                        type: "button",
                        title: `Duplicate ${part.name}`,
                        onclick: () => {
                          duplicateCustomAsset(part);
                        },
                      },
                      "Duplicate",
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
                    m(
                      "button.desktop-slot-custom-action",
                      {
                        type: "button",
                        title: `Edit tags for ${part.name}`,
                        onclick: () => {
                          startEditTags(part);
                        },
                      },
                      "Tags",
                    ),
                  ],
            ),
          ),
          customAssetParts.some((p) => p.itemId === stateObj.editingTagsPartId)
            ? m("div.desktop-slot-custom-tag-editor", [
                m("input.desktop-slot-custom-tag-input", {
                  type: "text",
                  placeholder: "Tags (comma separated)",
                  value: stateObj.customAssetTagInput,
                  oninput: (e: Event) => {
                    stateObj.customAssetTagInput = (
                      e.target as HTMLInputElement
                    ).value;
                  },
                  onkeydown: (e: KeyboardEvent) => {
                    if (e.key === "Enter") {
                      const part = customAssetParts.find(
                        (p) => p.itemId === stateObj.editingTagsPartId,
                      );
                      if (part) saveTags(part);
                    }
                    if (e.key === "Escape") {
                      cancelEditTags();
                    }
                  },
                }),
                m(
                  "button.desktop-slot-custom-action",
                  {
                    type: "button",
                    onclick: () => {
                      const part = customAssetParts.find(
                        (p) => p.itemId === stateObj.editingTagsPartId,
                      );
                      if (part) saveTags(part);
                    },
                  },
                  "Save",
                ),
                m(
                  "button.desktop-slot-custom-action",
                  {
                    type: "button",
                    onclick: cancelEditTags,
                  },
                  "Cancel",
                ),
              ])
            : null,
        ])
      : m("span.desktop-slot-custom-empty", "No saved imports yet."),
  ];
}
