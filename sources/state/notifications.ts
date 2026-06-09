import m from "mithril";

export type ToastKind = "info" | "success" | "warning" | "error";

export type Toast = {
  id: string;
  kind: ToastKind;
  message: string;
};

type ToastOptions = {
  kind?: ToastKind;
  timeoutMs?: number;
};

export type ConfirmDialogView = {
  id: string;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  danger: boolean;
};

type ActiveConfirmDialog = ConfirmDialogView & {
  resolve: (confirmed: boolean) => void;
};

type ConfirmationOptions = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

const DEFAULT_TOAST_TIMEOUT_MS = 4500;

let nextToastId = 1;
let nextConfirmId = 1;
let activeConfirmDialog: ActiveConfirmDialog | null = null;
const toasts: Toast[] = [];

export function getToasts(): readonly Toast[] {
  return toasts;
}

export function showToast(
  message: string,
  { kind = "info", timeoutMs = DEFAULT_TOAST_TIMEOUT_MS }: ToastOptions = {},
): string {
  const id = `toast-${nextToastId++}`;
  toasts.push({ id, kind, message });
  m.redraw();

  if (timeoutMs > 0) {
    window.setTimeout(() => dismissToast(id), timeoutMs);
  }

  return id;
}

export function dismissToast(id: string): void {
  const index = toasts.findIndex((toast) => toast.id === id);
  if (index === -1) return;
  toasts.splice(index, 1);
  m.redraw();
}

export function getConfirmDialog(): ConfirmDialogView | null {
  if (!activeConfirmDialog) return null;
  return {
    id: activeConfirmDialog.id,
    title: activeConfirmDialog.title,
    message: activeConfirmDialog.message,
    confirmLabel: activeConfirmDialog.confirmLabel,
    cancelLabel: activeConfirmDialog.cancelLabel,
    danger: activeConfirmDialog.danger,
  };
}

export function requestConfirmation(
  options: ConfirmationOptions,
): Promise<boolean> {
  if (activeConfirmDialog) {
    activeConfirmDialog.resolve(false);
  }

  return new Promise((resolve) => {
    activeConfirmDialog = {
      id: `confirm-${nextConfirmId++}`,
      title: options.title,
      message: options.message,
      confirmLabel: options.confirmLabel ?? "Confirm",
      cancelLabel: options.cancelLabel ?? "Cancel",
      danger: options.danger ?? false,
      resolve,
    };
    m.redraw();
  });
}

export function resolveConfirmation(confirmed: boolean): void {
  const dialog = activeConfirmDialog;
  if (!dialog) return;

  activeConfirmDialog = null;
  dialog.resolve(confirmed);
  m.redraw();
}

export function resetNotificationsForTests(): void {
  if (activeConfirmDialog) {
    activeConfirmDialog.resolve(false);
  }
  activeConfirmDialog = null;
  toasts.splice(0, toasts.length);
  nextToastId = 1;
  nextConfirmId = 1;
}
