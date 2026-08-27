import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { UiIssue } from './geometry-audit.ts';
import { UI_PROJECTS, UI_STATES } from './ui-matrix.mts';

const artifactPath = (...parts: readonly string[]): string =>
  path.resolve(process.cwd(), 'artifacts/ui', ...parts);

interface AuditArtifact {
  readonly state: string;
  readonly project: string;
  readonly viewport: { readonly width: number; readonly height: number };
  readonly issues: readonly UiIssue[];
}

async function jsonFiles(directory: string): Promise<readonly string[]> {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    return (
      await Promise.all(
        entries.map((entry) => {
          const target = path.join(directory, entry.name);
          return entry.isDirectory()
            ? jsonFiles(target)
            : Promise.resolve(entry.name.endsWith('.json') ? [target] : []);
        }),
      )
    ).flat();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

const auditDirectory = artifactPath('audit');
const files = await jsonFiles(auditDirectory);
if (files.length === 0) {
  throw new Error('No geometry artifacts found. Run `npm run ui:audit` first.');
}

const audits: AuditArtifact[] = [];
const artifactKeys = new Set<string>();
for (const file of files) {
  const audit = JSON.parse(await readFile(file, 'utf8')) as AuditArtifact;
  const key = `${audit.project}/${audit.state}`;
  if (artifactKeys.has(key)) throw new Error(`Duplicate geometry artifact for ${key}.`);
  artifactKeys.add(key);
  audits.push(audit);
}

const expectedKeys = new Set(
  UI_PROJECTS.flatMap(({ name }) => UI_STATES.map((state) => `${name}/${state}`)),
);
const missing = [...expectedKeys].filter((key) => !artifactKeys.has(key));
const unexpected = [...artifactKeys].filter((key) => !expectedKeys.has(key));
if (missing.length > 0 || unexpected.length > 0) {
  throw new Error(
    [
      `Incomplete geometry matrix: expected ${expectedKeys.size}, found ${artifactKeys.size}.`,
      ...(missing.length > 0 ? [`Missing: ${missing.join(', ')}`] : []),
      ...(unexpected.length > 0 ? [`Unexpected: ${unexpected.join(', ')}`] : []),
    ].join('\n'),
  );
}
audits.sort((a, b) => `${a.project}/${a.state}`.localeCompare(`${b.project}/${b.state}`));

const findings = audits.flatMap((audit) =>
  audit.issues.map((issue) => ({
    project: audit.project,
    state: audit.state,
    viewport: audit.viewport,
    ...issue,
  })),
);
const errors = findings.filter((finding) => finding.severity === 'error');
const warnings = findings.filter((finding) => finding.severity === 'warning');
const byType = Object.fromEntries(
  [...new Set(findings.map((finding) => finding.type))]
    .sort()
    .map((type) => [type, findings.filter((finding) => finding.type === type).length]),
);
const report = {
  generatedAt: new Date().toISOString(),
  auditedStates: audits.length,
  summary: { errors: errors.length, warnings: warnings.length, byType },
  findings,
};

const reportJson = artifactPath('report.json');
const reportMarkdown = artifactPath('report.md');
await mkdir(path.dirname(reportJson), { recursive: true });
await writeFile(reportJson, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

const rows = findings.length
  ? findings
      .map(
        (finding) =>
          `| ${finding.severity} | ${finding.type} | ${finding.project} | ${finding.state} | \`${finding.selector.replaceAll('|', '\\|')}\` | ${finding.message.replaceAll('|', '\\|')} |`,
      )
      .join('\n')
  : '| — | — | — | — | — | No findings |';
await writeFile(
  reportMarkdown,
  `# UI geometry report\n\nAudited states: ${audits.length}. Errors: ${errors.length}. Warnings: ${warnings.length}.\n\n| Severity | Type | Viewport | State | Selector | Message |\n| --- | --- | --- | --- | --- | --- |\n${rows}\n`,
  'utf8',
);

console.log(
  `UI report: ${audits.length} states, ${errors.length} errors, ${warnings.length} warnings.`,
);
console.log(reportMarkdown);
