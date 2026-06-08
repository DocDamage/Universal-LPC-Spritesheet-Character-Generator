import m from "mithril";
import { dismissToast, getToasts } from "../../state/notifications.ts";

const KIND_LABELS: Record<string, string> = {
  info: "Info",
  success: "Success",
  warning: "Warning",
  error: "Error",
};

export const NotificationCenter: m.Component = {
  view() {
    const toasts = getToasts();
    if (toasts.length === 0) return null;

    return m(
      "div.notification-center",
      { "aria-live": "polite", "aria-label": "Notifications" },
      toasts.map((toast) =>
        m(
          "div.notification-toast",
          {
            key: toast.id,
            class: `notification-toast-${toast.kind}`,
          },
          [
            m("div.notification-toast-content", [
              m("span.notification-toast-kind", KIND_LABELS[toast.kind]),
              m("span.notification-toast-message", toast.message),
            ]),
            m(
              "button.notification-toast-close",
              {
                type: "button",
                title: "Dismiss notification",
                onclick: () => dismissToast(toast.id),
              },
              "x",
            ),
          ],
        ),
      ),
    );
  },
};
