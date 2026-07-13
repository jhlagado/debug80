import { readFileSync } from 'node:fs';

interface PackageMetadata {
  readonly version?: string;
  readonly gitHead?: string;
}

function packageMetadata(): PackageMetadata {
  try {
    return JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ) as PackageMetadata;
  } catch {
    return {};
  }
}

const metadata = packageMetadata();

export const packageVersion = metadata.version ?? 'unknown';
export const packageBuildCommit =
  process.env.AZM_BUILD_COMMIT ?? process.env.GITHUB_SHA ?? metadata.gitHead;
