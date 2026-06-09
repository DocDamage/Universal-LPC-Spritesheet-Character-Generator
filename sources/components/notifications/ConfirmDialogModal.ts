import m from "mithril";
import {
  getConfirmDialog,
  resolveConfirmation,
} from "../../state/notifications.ts";

export const ConfirmDialogModal: m.Component = {
  view() {
    const dialog = getConfirmDialog();
    if (!dialog) return null;

    const close = (confirmed: boolean) => {
      resolveConfirmation(confirmed);
    };

    return m("div.confirm-dialog-overlay", { onclick: () => close(false) }, [
      m(
        "div.confirm-dialog",
        {
          role: "dialog",
          "aria-modal": "true",
          "aria-labelledby": `${dialog.id}-title`,
          tabindex: -1,
          onclick: (e: MouseEvent) => e.stopPropagation(),
          oncreate: (dialogVnode: m.VnodeDOM) => {
            (dialogVnode.dom as HTMLElement).focus();
          },
          onkeydown: (e: KeyboardEvent) => {
            if (e.key === "Escape") {
              e.preventDefault();
              close(false);
            }
          },
        },
        [
          m("div.confirm-dialog-header", [
            m("h3", { id: `${dialog.id}-title` }, dialog.title),
            m(
              "button.confirm-dialog-close",
              {
                type: "button",
                title: "Cancel",
                onclick: () => close(false),
              },
              "x",
            ),
          ]),
          m("p.confirm-dialog-message", dialog.message),
          m("div.confirm-dialog-actions", [
            m(
              "button.confirm-dialog-button",
              { type: "button", onclick: () => close(false) },
              dialog.cancelLabel,
            ),
            m(
              "button.confirm-dialog-button.confirm-dialog-confirm",
              {
                type: "button",
                class: dialog.danger ? "danger" : "",
                onclick: () => close(true),
              },
              dialog.confirmLabel,
            ),
          ]),
        ],
      ),
    ]);
  },
};
