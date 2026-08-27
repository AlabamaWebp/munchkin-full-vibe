import { expect, test } from '@playwright/test';
import { openUiState, UI_STATES } from './ui-state';

for (const state of UI_STATES) {
  test(`@visual ${state}`, async ({ page }) => {
    await openUiState(page, state);
    await expect(page).toHaveScreenshot(`${state}.png`, {
      animations: 'disabled',
      caret: 'hide',
      mask: [page.locator('[data-ui-dynamic]')],
      maxDiffPixelRatio: 0.002,
      threshold: 0.2,
    });
  });
}
