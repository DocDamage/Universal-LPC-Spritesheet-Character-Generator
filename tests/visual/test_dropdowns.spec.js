// @ts-nocheck
/* eslint-disable no-console */
import { test, expect } from "@playwright/test";

test("Verify all UI dropdowns select successfully without console errors", async ({
  page,
}) => {
  test.setTimeout(120000);

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
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            resolve(undefined);
          });
        });
      }),
  );

  // Define tab navigation and select loop
  const tabs = [
    { name: "Body", textToClick: /^Body \(\d+\)$/ },
    { name: "Gear", textToClick: /^Gear \(\d+\)$/ },
  ];

  for (const tab of tabs) {
    console.log(`Navigating to tab "${tab.name}"...`);
    // Click the tab button
    await page.getByRole("button", { name: tab.textToClick }).click();

    // Find all select dropdown container components currently visible
    const slotCount = await page.locator(".desktop-slot").count();
    console.log(
      `Found ${slotCount} dropdown slots in active tab "${tab.name}".`,
    );

    for (let slotIndex = 0; slotIndex < slotCount; slotIndex += 1) {
      const slot = page.locator(".desktop-slot").nth(slotIndex);
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
    // Firefox reports Vite metadata probe failures as console errors even
    // though the app resolves the generated module in a subsequent request.
    if (
      err.text.includes("Loading module from") &&
      err.text.includes("metadata")
    )
      continue;
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
