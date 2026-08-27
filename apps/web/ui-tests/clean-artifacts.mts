import { rm } from 'node:fs/promises';
import path from 'node:path';

const artifactRoot = path.resolve(process.cwd(), 'artifacts/ui');
const scopes = {
  audit: ['audit', 'report.json', 'report.md', 'test-results', 'playwright-report'],
  map: ['map', 'test-results', 'playwright-report'],
  test: ['audit', 'map', 'report.json', 'report.md', 'test-results', 'playwright-report'],
  visual: ['test-results', 'playwright-report'],
} as const;

const scope = process.argv[2] as keyof typeof scopes | undefined;
if (scope === undefined || !(scope in scopes)) {
  throw new Error(`Expected artifact cleanup scope: ${Object.keys(scopes).join(', ')}.`);
}

for (const relativeTarget of scopes[scope]) {
  const target = path.resolve(artifactRoot, relativeTarget);
  const relative = path.relative(artifactRoot, target);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Refusing to clean outside the UI artifact root: ${target}`);
  }
  await rm(target, { recursive: true, force: true });
}

console.log(`Cleaned generated UI ${scope} artifacts (visual baselines preserved).`);
