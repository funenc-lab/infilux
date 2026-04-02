/**
 * Toggle the CDP remote-debugging-port switch in an Electron main-process entry file.
 *
 * Usage:
 *   node enable-cdp.cjs enable [--port 9222] [--entry src/main/index.ts]
 *   node enable-cdp.cjs disable [--entry src/main/index.ts]
 *
 * Default entry detection order:
 *   1. src/main/index.ts
 *   2. apps/electron/src/index.ts
 */
const fs = require('node:fs');
const path = require('node:path');

const MARKER = '// [CDP] Enable remote debugging for Playwright';
const DEFAULT_ENTRY_CANDIDATES = ['src/main/index.ts', 'apps/electron/src/index.ts'];
const INSERTION_ANCHORS = [
  'const isDev = !app.isPackaged;',
  'const __dirname = dirname(fileURLToPath(import.meta.url))',
];

function parseArgs() {
  const args = process.argv.slice(2);
  const action = args[0];
  const options = {
    action,
    port: '9222',
    entry: null,
  };

  for (let index = 1; index < args.length; index += 1) {
    const token = args[index];
    if (token === '--port' && args[index + 1]) {
      options.port = args[index + 1];
      index += 1;
      continue;
    }
    if (token === '--entry' && args[index + 1]) {
      options.entry = args[index + 1];
      index += 1;
    }
  }

  return options;
}

function findProjectRoot(startDir) {
  let currentDir = path.resolve(startDir);
  while (true) {
    if (fs.existsSync(path.join(currentDir, 'package.json'))) {
      return currentDir;
    }
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      throw new Error('Could not find project root containing package.json.');
    }
    currentDir = parentDir;
  }
}

function resolveEntryFile(projectRoot, entryOverride) {
  const candidatePaths = entryOverride ? [entryOverride] : DEFAULT_ENTRY_CANDIDATES;
  for (const relativePath of candidatePaths) {
    const fullPath = path.join(projectRoot, relativePath);
    if (fs.existsSync(fullPath)) {
      return {
        relativePath,
        fullPath,
      };
    }
  }

  throw new Error(`Could not find an Electron entry file. Checked: ${candidatePaths.join(', ')}`);
}

function detectNewline(content) {
  return content.includes('\r\n') ? '\r\n' : '\n';
}

function insertCdpSwitch(content, port) {
  if (content.includes(MARKER)) {
    return {
      changed: false,
      nextContent: content,
    };
  }

  const newline = detectNewline(content);
  const cdpBlock = `${MARKER}${newline}app.commandLine.appendSwitch('remote-debugging-port', '${port}');`;

  for (const anchor of INSERTION_ANCHORS) {
    if (!content.includes(anchor)) {
      continue;
    }

    return {
      changed: true,
      nextContent: content.replace(anchor, `${anchor}${newline}${cdpBlock}`),
    };
  }

  throw new Error(`Could not find an insertion anchor. Checked: ${INSERTION_ANCHORS.join(' | ')}`);
}

function removeCdpSwitch(content) {
  const pattern =
    /(\r?\n)\/\/ \[CDP\] Enable remote debugging for Playwright\r?\napp\.commandLine\.appendSwitch\('remote-debugging-port', '[^']+'\);?/;
  const nextContent = content.replace(pattern, '');
  return {
    changed: nextContent !== content,
    nextContent,
  };
}

function main() {
  const options = parseArgs();
  if (!options.action || !['enable', 'disable'].includes(options.action)) {
    console.error('Usage: node enable-cdp.cjs <enable|disable> [--port 9222] [--entry path]');
    process.exit(1);
  }

  const projectRoot = findProjectRoot(__dirname);
  const entry = resolveEntryFile(projectRoot, options.entry);
  const content = fs.readFileSync(entry.fullPath, 'utf-8');

  if (options.action === 'enable') {
    const result = insertCdpSwitch(content, options.port);
    if (!result.changed) {
      console.log(`CDP switch already present in ${entry.relativePath}. Skipping.`);
      return;
    }
    fs.writeFileSync(entry.fullPath, result.nextContent, 'utf-8');
    console.log(`Enabled CDP on port ${options.port} in ${entry.relativePath}`);
    return;
  }

  const result = removeCdpSwitch(content);
  if (!result.changed) {
    console.log(`CDP switch not present in ${entry.relativePath}. Skipping.`);
    return;
  }
  fs.writeFileSync(entry.fullPath, result.nextContent, 'utf-8');
  console.log(`Disabled CDP in ${entry.relativePath}`);
}

main();
