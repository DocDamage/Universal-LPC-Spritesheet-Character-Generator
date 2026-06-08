import { test, expect } from "@playwright/test";

const BASE_URL =
  process.env.PLAYWRIGHT_TEST_BASE_URL ?? "http://localhost:5173";

/**
 * Navigate to the app and wait for it to be fully ready.
 */
async function gotoAppReady(page) {
  await page.goto(BASE_URL, { waitUntil: "load" });
  try {
    await page.waitForLoadState("networkidle", { timeout: 45_000 });
  } catch {
    // Some environments never reach idle; continue.
  }
  await page.waitForFunction(
    () => {
      if (typeof globalThis.__LPC_waitCatalogAllReady === "function") {
        return true;
      }
      const el = document.getElementById("mithril-filters");
      if (!el || el.classList.contains("loading")) {
        return false;
      }
      if (
        typeof globalThis.__LPC_arePaletteModalMetadataChunksReady ===
        "function"
      ) {
        return globalThis.__LPC_arePaletteModalMetadataChunksReady();
      }
      return true;
    },
    undefined,
    { timeout: 120_000 },
  );
  if (
    await page.evaluate(
      () => typeof globalThis.__LPC_waitCatalogAllReady === "function",
    )
  ) {
    await page.evaluate(() => globalThis.__LPC_waitCatalogAllReady());
  }
  await page.waitForSelector(
    "#desktop-preview-canvas, #mithril-preview canvas",
    {
      state: "visible",
      timeout: 120_000,
    },
  );
  await page.waitForFunction(
    () => {
      const preview =
        document.getElementById("mithril-preview") ||
        document.querySelector(".desktop-preview");
      const sheet = document.getElementById("mithril-spritesheet-preview");
      if (!preview) {
        return false;
      }
      return (
        !preview.querySelector(".loading, .desktop-preview-loading") &&
        (!sheet || !sheet.querySelector(".loading"))
      );
    },
    undefined,
    { timeout: 120_000 },
  );
  await page.waitForTimeout(500);
}

/**
 * Find a slot by its label text and return its locator.
 */
function getSlotByLabel(page, label) {
  return page
    .locator(".desktop-slot")
    .filter({
      has: page.locator(".desktop-slot-label", {
        hasText: new RegExp(`^${label}$`),
      }),
    })
    .first();
}

/**
 * Select the first non-empty option from a slot dropdown.
 */
async function selectFirstOption(slot) {
  const selectElement = slot.locator("select.desktop-slot-select");
  const optionValues = await selectElement.evaluate((select) => {
    return Array.from(select.options).map((opt) => opt.value);
  });
  const nonEmptyValues = optionValues.filter((val) => val !== "");
  if (nonEmptyValues.length === 0) {
    throw new Error("Slot has no non-empty options");
  }
  await selectElement.selectOption(nonEmptyValues[0]);
  await selectElement.evaluate((el) =>
    el.dispatchEvent(new Event("change", { bubbles: true })),
  );
  return nonEmptyValues[0];
}

/**
 * Open the part editor for a given slot label.
 */
async function openEditorForSlot(page, label) {
  const slot = getSlotByLabel(page, label);
  await slot.waitFor({ state: "visible", timeout: 30_000 });
  await selectFirstOption(slot);
  await page.waitForTimeout(200);

  const editButton = slot.locator(".desktop-slot-edit");
  await editButton.waitFor({ state: "visible", timeout: 30_000 });
  await editButton.click();
  await page.waitForTimeout(300);

  const partEditor = page.locator(".part-editor");
  await expect(partEditor).toBeVisible();
  await expect(
    page.locator(".part-editor-body input[type=text]").first(),
  ).toBeVisible();
  return { slot, partEditor };
}

async function drawOnEditorCanvas(page, offset = 8) {
  await page.evaluate((moveOffset) => {
    const canvas = document.querySelector(".editor-pixel-canvas");
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    canvas.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        cancelable: true,
        clientX: cx,
        clientY: cy,
        buttons: 1,
      }),
    );
    canvas.dispatchEvent(
      new MouseEvent("mousemove", {
        bubbles: true,
        cancelable: true,
        clientX: cx + moveOffset,
        clientY: cy + moveOffset,
        buttons: 1,
      }),
    );
    canvas.dispatchEvent(
      new MouseEvent("mouseup", {
        bubbles: true,
        cancelable: true,
        clientX: cx + moveOffset,
        clientY: cy + moveOffset,
        buttons: 1,
      }),
    );
  }, offset);
}

/**
 * Read the current zoom value from the editor UI.
 */
async function getZoomValue(page) {
  const zoomText = await page.locator(".part-editor-zoom-value").textContent();
  return parseInt(zoomText.replace("x", "").trim(), 10);
}

test.describe.configure({ mode: "serial" });

test.describe("Part Editor E2E", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.__DISABLE_PREVIEW_ANIMATION__ = true;
    });
  });

  test("Opening the editor", async ({ page }) => {
    await gotoAppReady(page);

    // Editor should be empty initially
    const emptyEditor = page.locator(".part-editor-empty");
    await expect(emptyEditor).toBeVisible();

    // Open editor for Hair slot
    await openEditorForSlot(page, "Hair");

    // Assert header and canvas are visible
    await expect(page.locator(".part-editor-header")).toBeVisible();
    await expect(page.locator(".editor-pixel-canvas")).toBeVisible();
  });

  test("Fullscreen mode", async ({ page }) => {
    await gotoAppReady(page);
    await openEditorForSlot(page, "Hair");

    const editor = page.locator(".part-editor");

    // Enter fullscreen via F key
    await page.keyboard.press("f");
    await page.waitForTimeout(200);
    await expect(editor).toHaveClass(/part-editor-fullscreen/);

    // Exit fullscreen via Esc
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
    await expect(editor).not.toHaveClass(/part-editor-fullscreen/);

    // Enter fullscreen via button click
    const fullscreenButton = page.locator(".part-editor-header-button");
    await fullscreenButton.click();
    await page.waitForTimeout(200);
    await expect(editor).toHaveClass(/part-editor-fullscreen/);

    // Exit fullscreen via button click
    await fullscreenButton.click();
    await page.waitForTimeout(200);
    await expect(editor).not.toHaveClass(/part-editor-fullscreen/);
  });

  test("Wheel zoom", async ({ page }) => {
    await gotoAppReady(page);
    await openEditorForSlot(page, "Hair");

    const stage = page.locator(".part-editor-canvas-stage");
    await stage.waitFor({ state: "visible" });

    const initialZoom = await getZoomValue(page);

    // Zoom in (negative deltaY zooms in per the editor logic)
    await stage.hover();
    await page.mouse.wheel(0, -3);
    await page.waitForTimeout(200);
    const zoomIn = await getZoomValue(page);
    expect(zoomIn).toBeGreaterThan(initialZoom);

    // Zoom out (positive deltaY zooms out)
    await stage.hover();
    await page.mouse.wheel(0, 3);
    await page.waitForTimeout(200);
    const zoomOut = await getZoomValue(page);
    expect(zoomOut).toBeLessThan(zoomIn);
  });

  test("Drawing on canvas", async ({ page }) => {
    await gotoAppReady(page);
    await openEditorForSlot(page, "Hair");

    const canvas = page.locator(".editor-pixel-canvas");
    await canvas.waitFor({ state: "visible" });

    // Ensure pen tool is active via keyboard shortcut
    await page.keyboard.press("b");
    await page.waitForTimeout(100);

    // Get full canvas pixel data before drawing
    const beforeData = await page.evaluate(() => {
      const c = document.querySelector(".editor-pixel-canvas");
      if (!c) return null;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      return ctx.getImageData(0, 0, c.width, c.height).data;
    });
    expect(beforeData).not.toBeNull();

    // Use page.evaluate to dispatch synthetic mouse events directly on the canvas.
    // This ensures the events hit the exact element with correct coordinates.
    await page.evaluate(() => {
      const canvas = document.querySelector(".editor-pixel-canvas");
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;

      const down = new MouseEvent("mousedown", {
        bubbles: true,
        cancelable: true,
        clientX: cx,
        clientY: cy,
        buttons: 1,
      });
      canvas.dispatchEvent(down);

      const move = new MouseEvent("mousemove", {
        bubbles: true,
        cancelable: true,
        clientX: cx + 8,
        clientY: cy + 8,
        buttons: 1,
      });
      canvas.dispatchEvent(move);

      const up = new MouseEvent("mouseup", {
        bubbles: true,
        cancelable: true,
        clientX: cx + 8,
        clientY: cy + 8,
        buttons: 1,
      });
      canvas.dispatchEvent(up);
    });
    await page.waitForTimeout(400);

    // Get full canvas pixel data after drawing
    const afterData = await page.evaluate(() => {
      const c = document.querySelector(".editor-pixel-canvas");
      if (!c) return null;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      return ctx.getImageData(0, 0, c.width, c.height).data;
    });
    expect(afterData).not.toBeNull();

    // Compare pixel arrays
    let changed = false;
    for (let i = 0; i < beforeData.length; i++) {
      if (beforeData[i] !== afterData[i]) {
        changed = true;
        break;
      }
    }
    expect(changed).toBe(true);
  });

  test("Saving a custom part", async ({ page }) => {
    await gotoAppReady(page);
    const { slot } = await openEditorForSlot(page, "Hair");

    // Draw something first
    await drawOnEditorCanvas(page, 4);
    await page.waitForTimeout(200);

    // Fill in a custom name
    const nameInput = page
      .locator(".part-editor-body input[type=text]")
      .first();
    await nameInput.fill("E2E Custom Hair");

    // Click Save
    const saveButton = page.locator("button", {
      hasText: /Save as New Custom Part/,
    });
    await saveButton.click();

    // Wait for the editor to close and the custom part to appear in the dropdown
    await expect(page.locator(".part-editor-empty")).toBeVisible({
      timeout: 10_000,
    });

    const selectElement = slot.locator("select.desktop-slot-select");
    await page.waitForFunction(
      () => {
        const slots = document.querySelectorAll(".desktop-slot");
        for (const s of slots) {
          const label = s.querySelector(".desktop-slot-label");
          if (label && label.textContent.trim() === "Hair") {
            const select = s.querySelector("select.desktop-slot-select");
            if (select) {
              return Array.from(select.options).some((opt) =>
                opt.value.startsWith("custom_part_"),
              );
            }
          }
        }
        return false;
      },
      undefined,
      { timeout: 10_000 },
    );

    // Assert custom part is selected
    const currentValue = await selectElement.inputValue();
    expect(currentValue).toContain("custom_part_");

    // Verify the custom part name appears in the dropdown options (label includes " (Custom)")
    const optionTexts = await selectElement.evaluate((select) =>
      Array.from(select.options).map((opt) => opt.textContent.trim()),
    );
    expect(optionTexts.some((text) => text.includes("E2E Custom Hair"))).toBe(
      true,
    );

    // Give IndexedDB persistence time to finish before the next test reloads
    await page.waitForTimeout(3000);
  });

  test("Reloading and verifying import persists", async ({ page }) => {
    await gotoAppReady(page);

    // Save a custom part first (same steps as the "Saving" test)
    await openEditorForSlot(page, "Hair");

    // Draw something
    await drawOnEditorCanvas(page);
    await page.waitForTimeout(300);

    // Name and save
    const nameInput = page
      .locator(".part-editor-body input[type=text]")
      .first();
    await nameInput.fill("E2E Reload Hair");
    const saveButton = page.locator("button", {
      hasText: /Save as New Custom Part/,
    });
    await saveButton.click();
    await expect(page.locator(".part-editor-empty")).toBeVisible({
      timeout: 10_000,
    });

    // Wait for the custom part to appear in the dropdown
    await page.waitForFunction(
      () => {
        const slots = document.querySelectorAll(".desktop-slot");
        for (const s of slots) {
          const label = s.querySelector(".desktop-slot-label");
          if (label && label.textContent.trim() === "Hair") {
            const select = s.querySelector("select.desktop-slot-select");
            if (select) {
              return Array.from(select.options).some((opt) =>
                opt.value.startsWith("custom_part_"),
              );
            }
          }
        }
        return false;
      },
      undefined,
      { timeout: 10_000 },
    );

    // Give IndexedDB persistence time to finish
    await page.waitForTimeout(3000);

    // Reload the page
    await page.reload({ waitUntil: "load" });
    await gotoAppReady(page);

    // After reload, check the slot still has the custom part
    const slotAfterReload = getSlotByLabel(page, "Hair");
    await slotAfterReload.waitFor({ state: "visible" });
    const selectAfterReload = slotAfterReload.locator(
      "select.desktop-slot-select",
    );

    // Poll again after reload for IndexedDB hydration
    await page.waitForFunction(
      () => {
        const slots = document.querySelectorAll(".desktop-slot");
        for (const s of slots) {
          const label = s.querySelector(".desktop-slot-label");
          if (label && label.textContent.trim() === "Hair") {
            const select = s.querySelector("select.desktop-slot-select");
            if (select) {
              return Array.from(select.options).some(
                (opt) =>
                  opt.value.startsWith("custom_part_") &&
                  opt.textContent.includes("E2E Reload Hair"),
              );
            }
          }
        }
        return false;
      },
      undefined,
      { timeout: 15_000 },
    );

    const optionValuesAfterReload = await selectAfterReload.evaluate((select) =>
      Array.from(select.options).map((opt) => ({
        value: opt.value,
        text: opt.textContent.trim(),
      })),
    );

    const customOptionAfterReload = optionValuesAfterReload.find(
      (opt) =>
        opt.value.startsWith("custom_part_") &&
        opt.text.includes("E2E Reload Hair"),
    );
    expect(customOptionAfterReload).toBeDefined();

    // Select it and verify preview renders
    await selectAfterReload.selectOption(customOptionAfterReload.value);
    await page.waitForTimeout(1000);

    const previewCanvas = page.locator("#desktop-preview-canvas");
    await expect(previewCanvas).toBeVisible();

    // Verify the custom part is actually selected in the dropdown
    const currentValueAfterReload = await selectAfterReload.inputValue();
    expect(currentValueAfterReload).toBe(customOptionAfterReload.value);
  });
});
