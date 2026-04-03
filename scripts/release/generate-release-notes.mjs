import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

import { buildReleaseNotesMarkdown, resolveReleaseDownloadAssets } from './releaseMetadata.mjs';

function parseArgs(argv) {
  const args = new Map();

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      continue;
    }

    const key = token.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for argument --${key}`);
    }
    args.set(key, value);
    index += 1;
  }

  return args;
}

function requireArg(args, key) {
  const value = args.get(key);
  if (!value) {
    throw new Error(`Missing required argument --${key}`);
  }
  return value;
}

function readAssetNames(assetFilePath) {
  return readFileSync(assetFilePath, 'utf8')
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
}

function readCommitSubjects(previousTag, tag) {
  const output = execFileSync(
    'git',
    ['log', `${previousTag}..${tag}`, '--pretty=format:%s', '--no-merges'],
    {
      encoding: 'utf8',
    }
  );

  return output
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const tag = requireArg(args, 'tag');
  const previousTag = requireArg(args, 'previous-tag');
  const repositorySlug = requireArg(args, 'repository');
  const assetFile = requireArg(args, 'asset-file');
  const outputFile = args.get('output');

  const assets = resolveReleaseDownloadAssets(readAssetNames(assetFile));
  const markdown = buildReleaseNotesMarkdown({
    tag,
    previousTag,
    repositorySlug,
    commitSubjects: readCommitSubjects(previousTag, tag),
    assets,
  });

  if (outputFile) {
    writeFileSync(outputFile, `${markdown}\n`, 'utf8');
    return;
  }

  process.stdout.write(`${markdown}\n`);
}

main();
