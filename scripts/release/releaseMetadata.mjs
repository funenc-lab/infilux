const REQUIRED_RELEASE_DOWNLOAD_ASSETS = Object.freeze([
  {
    key: 'macos-arm64',
    label: 'macOS (Apple Silicon)',
    matches: (fileName) => fileName.endsWith('-arm64.dmg'),
  },
  {
    key: 'macos-x64',
    label: 'macOS (Intel)',
    matches: (fileName) => fileName.endsWith('.dmg') && !fileName.endsWith('-arm64.dmg'),
  },
  {
    key: 'windows-installer',
    label: 'Windows (Installer)',
    matches: (fileName) => {
      const normalized = fileName.toLowerCase();
      return (
        normalized.endsWith('.exe') &&
        !normalized.endsWith('.exe.blockmap') &&
        !normalized.includes('portable')
      );
    },
  },
  {
    key: 'windows-portable',
    label: 'Windows (Portable)',
    matches: (fileName) => {
      const normalized = fileName.toLowerCase();
      return normalized.endsWith('.exe') && normalized.includes('portable');
    },
  },
  {
    key: 'linux-appimage',
    label: 'Linux (AppImage)',
    matches: (fileName) => fileName.endsWith('.AppImage'),
  },
  {
    key: 'linux-deb',
    label: 'Linux (deb)',
    matches: (fileName) => fileName.endsWith('.deb'),
  },
]);

function sanitizeCommitSubject(subject, type) {
  return subject.replace(new RegExp(`^${type}(?:\\([^)]*\\))?!?:\\s*`, 'i'), '').trim();
}

function collectCommitSections(commitSubjects) {
  const sections = {
    features: [],
    fixes: [],
    build: [],
  };

  for (const rawSubject of commitSubjects) {
    const subject = rawSubject.trim();
    if (!subject) {
      continue;
    }

    if (/^feat(?:\(|:|!)/i.test(subject)) {
      sections.features.push(sanitizeCommitSubject(subject, 'feat'));
      continue;
    }

    if (/^fix(?:\(|:|!)/i.test(subject)) {
      sections.fixes.push(sanitizeCommitSubject(subject, 'fix'));
      continue;
    }

    if (/^(?:build|ci)(?:\(|:|!)/i.test(subject)) {
      const type = subject.toLowerCase().startsWith('build') ? 'build' : 'ci';
      sections.build.push(sanitizeCommitSubject(subject, type));
    }
  }

  return sections;
}

function encodeAssetName(fileName) {
  return encodeURIComponent(fileName).replace(/%2F/g, '/');
}

export function getRequiredReleaseDownloadAssets() {
  return REQUIRED_RELEASE_DOWNLOAD_ASSETS.map(({ key, label }) => ({ key, label }));
}

export function resolveReleaseDownloadAssets(assetNames) {
  const resolvedAssets = [];
  const missingKeys = [];

  for (const descriptor of REQUIRED_RELEASE_DOWNLOAD_ASSETS) {
    const fileName = assetNames.find((candidate) => descriptor.matches(candidate));
    if (!fileName) {
      missingKeys.push(descriptor.key);
      continue;
    }
    resolvedAssets.push({
      key: descriptor.key,
      label: descriptor.label,
      fileName,
    });
  }

  if (missingKeys.length > 0) {
    throw new Error(`Missing required release assets: ${missingKeys.join(', ')}`);
  }

  return resolvedAssets;
}

export function buildReleaseNotesMarkdown({
  tag,
  previousTag,
  repositorySlug,
  commitSubjects,
  assets,
}) {
  const sections = collectCommitSections(commitSubjects);
  const lines = ['## Updates', ''];

  if (sections.features.length > 0) {
    lines.push('### ✨ Features');
    for (const entry of sections.features) {
      lines.push(`- **${entry}**`);
    }
    lines.push('');
  }

  if (sections.fixes.length > 0) {
    lines.push('### 🐛 Fixes');
    for (const entry of sections.fixes) {
      lines.push(`- **${entry}**`);
    }
    lines.push('');
  }

  if (sections.build.length > 0) {
    lines.push('### 🔨 Build & CI');
    for (const entry of sections.build) {
      lines.push(`- ${entry}`);
    }
    lines.push('');
  }

  lines.push('---', '', '## Downloads', '', '| Platform | File |', '|------|------|');

  for (const asset of assets) {
    const encodedFileName = encodeAssetName(asset.fileName);
    lines.push(
      `| ${asset.label} | [${asset.fileName}](https://github.com/${repositorySlug}/releases/download/${tag}/${encodedFileName}) |`
    );
  }

  lines.push(
    '',
    '---',
    '',
    `**Full Changelog**: https://github.com/${repositorySlug}/compare/${previousTag}...${tag}`
  );

  return lines.join('\n');
}
