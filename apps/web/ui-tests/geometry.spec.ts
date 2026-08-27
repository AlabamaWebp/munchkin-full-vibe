import { expect, test } from '@playwright/test';
import { writeJsonArtifact } from './artifact';
import { auditGeometry } from './geometry-audit';
import { openUiState, UI_STATES } from './ui-state';

for (const state of UI_STATES) {
  test(`@audit ${state}`, async ({ page }, testInfo) => {
    await openUiState(page, state);
    const viewport = page.viewportSize()!;
    const issues = (await auditGeometry(page)).map((issue) => ({
      ...issue,
      data: {
        ...issue.data,
        reproduction: { state, project: testInfo.project.name, viewport },
      },
    }));
    const result = {
      state,
      project: testInfo.project.name,
      viewport,
      url: page.url(),
      issues,
    };
    const artifact = await writeJsonArtifact(
      ['audit', testInfo.project.name, `${state}.json`],
      result,
    );
    await testInfo.attach('geometry-audit', {
      path: artifact,
      contentType: 'application/json',
    });
    expect(issues.filter((issue) => issue.severity === 'error')).toEqual([]);
  });
}
