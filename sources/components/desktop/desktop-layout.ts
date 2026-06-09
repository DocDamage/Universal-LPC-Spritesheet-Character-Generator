export type DesktopPanelId = "slots" | "preview" | "tools";

export type DesktopPanelLayout = {
  order: DesktopPanelId[];
  widths: Record<DesktopPanelId, number>;
};

export type DesktopPanelSize = {
  min: number;
  max: number;
  defaultWidth: number;
};

const STORAGE_KEY = "lpc.desktopPanelLayout.v1";
const PANEL_IDS: DesktopPanelId[] = ["slots", "preview", "tools"];

export const PANEL_SIZES: Record<DesktopPanelId, DesktopPanelSize> = {
  slots: { min: 220, max: 560, defaultWidth: 280 },
  preview: { min: 320, max: 960, defaultWidth: 620 },
  tools: { min: 300, max: 680, defaultWidth: 340 },
};

export function getDefaultDesktopLayout(): DesktopPanelLayout {
  return {
    order: [...PANEL_IDS],
    widths: {
      slots: PANEL_SIZES.slots.defaultWidth,
      preview: PANEL_SIZES.preview.defaultWidth,
      tools: PANEL_SIZES.tools.defaultWidth,
    },
  };
}

export function getDesktopPanelLabel(panelId: DesktopPanelId): string {
  switch (panelId) {
    case "slots":
      return "Parts";
    case "preview":
      return "Preview";
    case "tools":
      return "Tools";
  }
}

export function clampDesktopPanelWidth(
  panelId: DesktopPanelId,
  width: number,
): number {
  const size = PANEL_SIZES[panelId];
  return Math.round(Math.min(size.max, Math.max(size.min, width)));
}

export function normalizeDesktopLayout(
  candidate: Partial<DesktopPanelLayout> | null | undefined,
): DesktopPanelLayout {
  const defaults = getDefaultDesktopLayout();
  const candidateOrder = Array.isArray(candidate?.order) ? candidate.order : [];
  const order = [
    ...candidateOrder.filter((id): id is DesktopPanelId =>
      PANEL_IDS.includes(id as DesktopPanelId),
    ),
    ...PANEL_IDS.filter((id) => !candidateOrder.includes(id)),
  ];

  return {
    order,
    widths: {
      slots: clampDesktopPanelWidth(
        "slots",
        Number(candidate?.widths?.slots ?? defaults.widths.slots),
      ),
      preview: clampDesktopPanelWidth(
        "preview",
        Number(candidate?.widths?.preview ?? defaults.widths.preview),
      ),
      tools: clampDesktopPanelWidth(
        "tools",
        Number(candidate?.widths?.tools ?? defaults.widths.tools),
      ),
    },
  };
}

export function loadDesktopLayout(): DesktopPanelLayout {
  if (typeof window === "undefined") {
    return getDefaultDesktopLayout();
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return normalizeDesktopLayout(raw ? JSON.parse(raw) : null);
  } catch {
    return getDefaultDesktopLayout();
  }
}

export function saveDesktopLayout(layout: DesktopPanelLayout): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(normalizeDesktopLayout(layout)),
  );
}

export function moveDesktopPanel(
  layout: DesktopPanelLayout,
  panelId: DesktopPanelId,
  direction: -1 | 1,
): DesktopPanelLayout {
  const order = [...layout.order];
  const index = order.indexOf(panelId);
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= order.length) {
    return layout;
  }

  const current = order[index];
  const next = order[nextIndex];
  if (!current || !next) {
    return layout;
  }
  order[index] = next;
  order[nextIndex] = current;
  return normalizeDesktopLayout({ ...layout, order });
}
