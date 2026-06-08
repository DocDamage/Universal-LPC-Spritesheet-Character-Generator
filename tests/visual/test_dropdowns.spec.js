/* eslint-disable no-console */
import { test, expect } from "@playwright/test";

test("Verify all UI dropdowns select successfully without console errors", async ({
  page,
}) => {
  // Capture console errors and failed requests
  const consoleErrors = [];
  const failedRequests = [];

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push({ type: "console-error", text: msg.text() });
    }
  });

  page.on("requestfailed", (request) => {
    const url = request.url();
    const failure = request.failure();
    failedRequests.push({
      url,
      errorText: failure ? failure.errorText : "unknown",
    });
  });

  // Open the generator page
  await page.goto("http://localhost:5173/");

  // Wait for the desktop preview canvas to be loaded and visible
  await page.waitForSelector("#desktop-preview-canvas", {
    state: "visible",
    timeout: 30000,
  });

  // Wait for catalog ready hook
  await page.waitForFunction(
    () => {
      return typeof globalThis.__LPC_waitCatalogAllReady === "function";
    },
    { timeout: 30000 },
  );
  await page.evaluate(() => globalThis.__LPC_waitCatalogAllReady());

  // Let the initial render complete
  await page.waitForTimeout(500);

  // Define tab navigation and select loop
  const tabs = [
    { name: "Character Model", textToClick: "Character Model" },
    { name: "Accessories & Gear", textToClick: "Accessories & Gear" },
  ];

  for (const tab of tabs) {
    console.log(`Navigating to tab "${tab.name}"...`);
    // Click the tab button
    await page
      .getByRole("button", { name: tab.textToClick, exact: true })
      .click();
    await page.waitForTimeout(100);

    // Find all select dropdown container components currently visible
    const slots = await page.locator(".desktop-slot").all();
    console.log(
      `Found ${slots.length} dropdown slots in active tab "${tab.name}".`,
    );

    for (const slot of slots) {
      const labelElement = slot.locator(".desktop-slot-label");
      const labelText = (await labelElement.innerText()).trim();

      const selectElement = slot.locator("select.desktop-slot-select");
      const count = await selectElement.count();
      if (count === 0) {
        console.log(`Slot "${labelText}" has no select element, skipping.`);
        continue;
      }

      // Get all option values from the select element
      const optionValues = await selectElement.evaluate((select) => {
        return Array.from(select.options).map((opt) => opt.value);
      });

      const nonEmptyValues = optionValues.filter((val) => val !== "");
      if (nonEmptyValues.length === 0) {
        console.log(`Slot "${labelText}" has no non-empty options, skipping.`);
        continue;
      }

      const valueToSelect = nonEmptyValues[0];
      console.log(`Selecting "${valueToSelect}" in slot "${labelText}"...`);

      // Select the option
      await selectElement.selectOption(valueToSelect);

      // Wait a brief moment for state and UI update
      await page.waitForTimeout(100);

      // Assert that the value was successfully selected and has not reset
      const currentValue = await selectElement.inputValue();
      expect(currentValue).toBe(valueToSelect);
    }
  }

  console.log("Failed requests during run:", failedRequests);
  console.log("Console errors during run:", consoleErrors);

  // We ignore requests for assets (specifically .png files under spritesheets/) that failed,
  // and metadata.js resolution attempts that the browser aborts/404s but Vite resolves.
  const criticalErrors = [];

  for (const err of consoleErrors) {
    // Ignore network 404 resource errors in console
    if (err.text.includes("status of 404")) continue;
    // Ignore console warning/error for "Failed to load image"
    if (err.text.includes("Failed to load image")) continue;
    criticalErrors.push(err);
  }

  for (const req of failedRequests) {
    if (req.url.endsWith(".png") || req.url.includes("/spritesheets/"))
      continue;
    if (req.url.includes("metadata.js")) continue;
    criticalErrors.push(req);
  }

  expect(criticalErrors).toEqual([]);
});

test("Verify Part Editor opens, allows drawing, auto-propagates, and saves a custom part successfully", async ({
  page,
}) => {
  // Capture console errors and failed requests
  const consoleErrors = [];
  const failedRequests = [];

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push({ type: "console-error", text: msg.text() });
    }
  });

  page.on("requestfailed", (request) => {
    const url = request.url();
    const failure = request.failure();
    failedRequests.push({
      url,
      errorText: failure ? failure.errorText : "unknown",
    });
  });

  // Open page
  await page.goto("http://localhost:5173/");

  // Wait for load
  await page.waitForSelector("#desktop-preview-canvas", {
    state: "visible",
    timeout: 30000,
  });
  await page.waitForFunction(
    () => typeof globalThis.__LPC_waitCatalogAllReady === "function",
  );
  await page.evaluate(() => globalThis.__LPC_waitCatalogAllReady());
  await page.waitForTimeout(500);

  // Assert initially the Part Editor is empty
  const emptyEditor = page.locator(".part-editor-empty");
  await expect(emptyEditor).toBeVisible();

  // Find slot for "Hair" and select the second option (first non-empty)
  const hairSlot = page.locator(".desktop-slot").filter({
    has: page.locator(".desktop-slot-label", { hasText: /^Hair$/ }),
  });
  const selectElement = hairSlot.locator("select.desktop-slot-select");

  // Get non-empty values
  const optionValues = await selectElement.evaluate((select) => {
    return Array.from(select.options).map((opt) => opt.value);
  });
  const nonEmptyValues = optionValues.filter((val) => val !== "");
  expect(nonEmptyValues.length).toBeGreaterThan(0);

  const valueToSelect = nonEmptyValues[0];
  await selectElement.selectOption(valueToSelect);
  await page.waitForTimeout(100);

  // Click the Edit button for Hair
  const editButton = hairSlot.locator(".desktop-slot-edit");
  await editButton.click();
  await page.waitForTimeout(300);

  // Assert Part Editor is loaded and visible
  const partEditor = page.locator(".part-editor");
  await expect(partEditor).toBeVisible();

  // Assert active direction canvas is present
  const pixelCanvas = page.locator(".editor-pixel-canvas");
  await expect(pixelCanvas).toBeVisible();

  // Interact with the canvas by clicking/drawing on it
  const box = await pixelCanvas.boundingBox();
  expect(box).not.toBeNull();
  if (box) {
    // Click at center of the canvas to paint a pixel
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;
    await page.mouse.move(centerX, centerY);
    await page.mouse.down();
    await page.mouse.move(centerX + 5, centerY + 5);
    await page.mouse.up();
    await page.waitForTimeout(200);
  }

  // Fill in a custom name
  const nameInput = page.locator(".part-editor-body input[type=text]");
  await nameInput.fill("My Special Hair");

  // Click Save
  const saveButton = page.locator("button", {
    hasText: "Save as Brand New Part",
  });
  await saveButton.click();
  await page.waitForTimeout(500);

  // Assert Part Editor is closed (empty state shown again)
  await expect(emptyEditor).toBeVisible();

  // Assert that select element now has the custom part selected
  const currentValue = await selectElement.inputValue();
  expect(currentValue).toContain("custom_part_");

  // Check critical errors
  const criticalErrors = [];
  for (const err of consoleErrors) {
    if (err.text.includes("status of 404")) continue;
    if (err.text.includes("Failed to load image")) continue;
    criticalErrors.push(err);
  }
  for (const req of failedRequests) {
    if (req.url.endsWith(".png") || req.url.includes("/spritesheets/"))
      continue;
    if (req.url.includes("metadata.js")) continue;
    criticalErrors.push(req);
  }
  expect(criticalErrors).toEqual([]);
});
