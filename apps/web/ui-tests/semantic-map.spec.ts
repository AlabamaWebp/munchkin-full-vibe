import { test } from '@playwright/test';
import { writeJsonArtifact } from './artifact';
import { createSemanticUiMap } from './semantic-map';
import { openUiState, UI_STATES } from './ui-state';

for (const state of UI_STATES) {
  test(`@map ${state}`, async ({ page }, testInfo) => {
    await openUiState(page, state);
    const uiMap = await createSemanticUiMap(page);
    const artifact = await writeJsonArtifact(['map', testInfo.project.name, `${state}.json`], {
      state,
      project: testInfo.project.name,
      viewport: page.viewportSize(),
      ...uiMap,
    });
    await testInfo.attach('semantic-ui-map', {
      path: artifact,
      contentType: 'application/json',
    });
  });
}
