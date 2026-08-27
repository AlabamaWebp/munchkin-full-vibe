import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const repositoryRoot = path.resolve(process.cwd());

export function artifactPath(...parts: readonly string[]): string {
  return path.join(repositoryRoot, 'artifacts/ui', ...parts);
}

export async function writeJsonArtifact(parts: readonly string[], value: unknown): Promise<string> {
  const destination = artifactPath(...parts);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return destination;
}
