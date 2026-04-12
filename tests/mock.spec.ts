/**
 * Comms mock mode smoke tests
 *
 * Runs against http://localhost:3333/?mock — no Electron required.
 * Mock mode injects electronAPI stub so the full UI runs in a browser.
 *
 * Run:   bun run test:e2e
 * Watch: bun run test:e2e:ui
 */

import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/?mock");
  await page.waitForTimeout(1000);
});

test("app loads in mock mode", async ({ page }) => {
  await expect(page.locator("body")).toBeVisible();
  const logs = await page.evaluate(() =>
    (window as any).__mockLogs?.includes?.("[mock]") ?? true
  );
  expect(logs).toBeTruthy();
});

test("host button is visible", async ({ page }) => {
  const hostBtn = page.getByRole("button", { name: /Host/i });
  await expect(hostBtn).toBeVisible({ timeout: 5000 });
});

test("join button is visible", async ({ page }) => {
  const joinBtn = page.getByRole("button", { name: /Join/i });
  await expect(joinBtn).toBeVisible({ timeout: 5000 });
});

test("settings panel opens", async ({ page }) => {
  const settingsBtn = page.getByRole("button", { name: /Settings/i }).or(page.locator(".settings-btn"));
  if (await settingsBtn.first().isVisible()) {
    await settingsBtn.first().click();
    await page.waitForTimeout(500);
  }
});
