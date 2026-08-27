import { expect, test } from '@playwright/test';
import { auditGeometry } from './geometry-audit';

test('@audit contracts exercise explicit geometry annotations', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'release-390x844', 'Contracts need one browser viewport.');
  await page.setContent(`
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; }
      #parent { position: relative; width: 200px; height: 100px; }
      #outside { position: absolute; left: 180px; width: 40px; height: 44px; }
      #miscentered-parent { position: absolute; left: 10px; top: 50px; width: 44px; height: 44px; }
      #miscentered-text { width: 160px; height: 44px; padding-left: 80px; }
      .overlap { position: absolute; left: 0; top: 160px; width: 80px; height: 44px; }
      #overlap-b { left: 40px; }
      #allowed-clip { width: 44px; height: 44px; overflow: hidden; }
      #allowed-clip > button { width: 80px; height: 44px; }
    </style>
    <div id="parent">
      <button id="outside" data-ui-inside-parent>Outside</button>
      <button id="miscentered-parent" data-ui-center="parent">Parent</button>
    </div>
    <button id="miscentered-text" data-ui-center="text" data-ui-center-tolerance="4">Text</button>
    <button id="overlap-a" class="overlap" data-ui-no-overlap>A</button>
    <button id="overlap-b" class="overlap" data-ui-no-overlap>B</button>
    <div id="allowed-clip" data-ui-allow-clip><button>Allowed</button></div>
    <button id="broken" aria-label="Broken" style="width:0;height:0;padding:0;border:0"></button>
    <span data-ui-dynamic>12:34</span>
  `);
  const issues = await auditGeometry(page);
  expect(issues.map((issue) => issue.type)).toEqual(
    expect.arrayContaining([
      'broken-geometry',
      'outside-parent',
      'miscentered',
      'forbidden-overlap',
    ]),
  );
  expect(
    issues.find((issue) => issue.type === 'miscentered' && issue.selector === '#miscentered-text')
      ?.data,
  ).toMatchObject({ mode: 'text' });
  const outsideParent = issues.find((issue) => issue.type === 'outside-parent');
  expect(outsideParent?.data).toMatchObject({
    invariant: 'outside-parent',
    geometry: {
      element: expect.objectContaining({ width: expect.any(Number), height: expect.any(Number) }),
      parent: expect.objectContaining({
        selector: '#parent',
        rect: expect.objectContaining({ width: 200, height: 100 }),
      }),
      viewport: { width: 390, height: 844 },
    },
    deviation: expect.objectContaining({ right: 20 }),
  });
  expect(issues.some((issue) => issue.selector.includes('allowed-clip'))).toBe(false);
});
