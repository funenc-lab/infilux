import { AppCategory } from '@shared/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const appDetectorTestDoubles = vi.hoisted(() => {
  const execAsync = vi.fn();
  const promisify = vi.fn(() => execAsync);
  const existsSync = vi.fn<(path: string) => boolean>(() => false);
  const readdir = vi.fn<(path: string) => Promise<string[]>>(async () => []);
  const readFile = vi.fn<(path: string) => Promise<Buffer>>(async () => Buffer.from('icon'));
  const homedir = vi.fn(() => '/Users/tester');
  const tmpdir = vi.fn(() => '/tmp');

  function reset() {
    execAsync.mockReset();
    promisify.mockReset();
    existsSync.mockReset();
    readdir.mockReset();
    readFile.mockReset();
    homedir.mockReset();
    tmpdir.mockReset();

    promisify.mockReturnValue(execAsync);
    existsSync.mockReturnValue(false);
    readdir.mockResolvedValue([]);
    readFile.mockResolvedValue(Buffer.from('icon'));
    homedir.mockReturnValue('/Users/tester');
    tmpdir.mockReturnValue('/tmp');
  }

  return {
    execAsync,
    promisify,
    existsSync,
    readdir,
    readFile,
    homedir,
    tmpdir,
    reset,
  };
});

vi.mock('node:child_process', () => ({
  exec: vi.fn(),
}));

vi.mock('node:fs', () => ({
  existsSync: appDetectorTestDoubles.existsSync,
}));

vi.mock('node:fs/promises', () => ({
  readdir: appDetectorTestDoubles.readdir,
  readFile: appDetectorTestDoubles.readFile,
}));

vi.mock('node:os', () => ({
  homedir: appDetectorTestDoubles.homedir,
  tmpdir: appDetectorTestDoubles.tmpdir,
}));

vi.mock('node:util', () => ({
  promisify: appDetectorTestDoubles.promisify,
}));

const originalPlatformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform');
const originalProgramFiles = process.env.ProgramFiles;
const originalLocalAppData = process.env.LOCALAPPDATA;

function setPlatform(platform: NodeJS.Platform) {
  Object.defineProperty(process, 'platform', {
    value: platform,
    configurable: true,
  });
}

async function loadModule(platform: NodeJS.Platform) {
  vi.resetModules();
  setPlatform(platform);
  return import('../AppDetector');
}

describe('AppDetector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    appDetectorTestDoubles.reset();
    process.env.ProgramFiles = 'C:\\Program Files';
    process.env.LOCALAPPDATA = 'C:\\Users\\tester\\AppData\\Local';
  });

  afterEach(() => {
    if (originalPlatformDescriptor) {
      Object.defineProperty(process, 'platform', originalPlatformDescriptor);
    }
    if (originalProgramFiles === undefined) {
      delete process.env.ProgramFiles;
    } else {
      process.env.ProgramFiles = originalProgramFiles;
    }
    if (originalLocalAppData === undefined) {
      delete process.env.LOCALAPPDATA;
    } else {
      process.env.LOCALAPPDATA = originalLocalAppData;
    }
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('detects Linux apps, caches them, and opens terminal/editor/finder paths', async () => {
    appDetectorTestDoubles.execAsync.mockImplementation(async (command: string) => {
      if (command === 'which gnome-terminal') {
        return { stdout: '/usr/bin/gnome-terminal\n' };
      }
      if (command === 'which code') {
        return { stdout: '/usr/bin/code\n' };
      }
      if (command.startsWith('which ')) {
        throw new Error('missing');
      }
      return { stdout: '' };
    });

    const { AppDetector } = await loadModule('linux');
    const detector = new AppDetector();

    const apps = await detector.detectApps();
    expect(apps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          bundleId: 'org.gnome.Terminal',
          path: '/usr/bin/gnome-terminal',
        }),
        expect.objectContaining({
          bundleId: 'com.microsoft.VSCode',
          path: '/usr/bin/code',
        }),
      ])
    );

    const detectCallCount = appDetectorTestDoubles.execAsync.mock.calls.length;
    await expect(detector.detectApps()).resolves.toBe(apps);
    expect(appDetectorTestDoubles.execAsync).toHaveBeenCalledTimes(detectCallCount);

    (detector as unknown as { detectedApps: unknown[] }).detectedApps = [
      {
        name: 'GNOME Terminal',
        bundleId: 'org.gnome.Terminal',
        category: AppCategory.Terminal,
        path: '/usr/bin/gnome-terminal',
      },
      {
        name: 'VS Code',
        bundleId: 'com.microsoft.VSCode',
        category: AppCategory.Editor,
        path: '/usr/bin/code',
      },
      {
        name: 'Finder',
        bundleId: 'linux.finder',
        category: AppCategory.Finder,
        path: '/usr/bin/nautilus',
      },
    ];

    await detector.openPath('/workspace', 'org.gnome.Terminal');
    await detector.openPath('/workspace/file.ts', 'com.microsoft.VSCode');
    await detector.openPath('/workspace', 'linux.finder');

    expect(appDetectorTestDoubles.execAsync).toHaveBeenCalledWith(
      '"/usr/bin/gnome-terminal" --working-directory="/workspace"'
    );
    expect(appDetectorTestDoubles.execAsync).toHaveBeenCalledWith(
      '"/usr/bin/code" "/workspace/file.ts"'
    );
    expect(appDetectorTestDoubles.execAsync).toHaveBeenCalledWith(
      '"/usr/bin/nautilus" "/workspace"'
    );
  });

  it('detects Windows apps from registry and opens explorer/editor targets', async () => {
    const registryOutput = [
      'HKEY_LOCAL_MACHINE\\Software\\App',
      '    DisplayName    REG_SZ    Visual Studio Code',
      '    DisplayIcon    REG_SZ    C:\\Program Files\\Microsoft VS Code\\Code.exe,0',
      '',
      'HKEY_LOCAL_MACHINE\\Software\\App2',
      '    DisplayName    REG_SZ    GitHub Desktop',
      '    InstallLocation    REG_SZ    C:\\Users\\tester\\AppData\\Local\\GitHubDesktop',
    ].join('\n');

    appDetectorTestDoubles.existsSync.mockImplementation((target: string) => {
      return (
        target === 'C:\\Program Files\\Microsoft VS Code\\Code.exe' ||
        target === 'C:\\Users\\tester\\AppData\\Local\\GitHubDesktop\\GitHubDesktop.exe'
      );
    });

    appDetectorTestDoubles.execAsync.mockImplementation(async (command: string) => {
      if (command.startsWith('reg query ')) {
        return { stdout: registryOutput };
      }
      if (command === 'where wt.exe') {
        return { stdout: 'C:\\Users\\tester\\AppData\\Local\\Microsoft\\WindowsApps\\wt.exe\n' };
      }
      return { stdout: '' };
    });

    const { AppDetector } = await loadModule('win32');
    const detector = new AppDetector();

    const apps = await detector.detectApps();
    expect(apps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          bundleId: 'com.microsoft.VSCode',
          path: 'C:\\Program Files\\Microsoft VS Code\\Code.exe',
        }),
        expect.objectContaining({
          bundleId: 'windows.terminal',
          path: 'C:\\Users\\tester\\AppData\\Local\\Microsoft\\WindowsApps\\wt.exe',
        }),
      ])
    );

    (detector as unknown as { detectedApps: unknown[] }).detectedApps = [
      {
        name: 'Windows Terminal',
        bundleId: 'windows.terminal',
        category: AppCategory.Terminal,
        path: 'C:\\Users\\tester\\AppData\\Local\\Microsoft\\WindowsApps\\wt.exe',
      },
      {
        name: 'Explorer',
        bundleId: 'windows.explorer',
        category: AppCategory.Finder,
        path: 'C:\\Windows\\explorer.exe',
      },
      {
        name: 'VS Code',
        bundleId: 'com.microsoft.VSCode',
        category: AppCategory.Editor,
        path: 'C:\\Program Files\\Microsoft VS Code\\Code.exe',
      },
    ];

    await detector.openPath('C:/repo', 'windows.terminal');
    await detector.openPath('C:/repo/path', 'windows.explorer');
    await detector.openPath('C:/repo/file.ts', 'com.microsoft.VSCode', { line: 9 });

    expect(appDetectorTestDoubles.execAsync).toHaveBeenCalledWith(
      `powershell -Command "Start-Process -FilePath 'C:\\Users\\tester\\AppData\\Local\\Microsoft\\WindowsApps\\wt.exe' -ArgumentList '-d','C:/repo'"`
    );
    expect(appDetectorTestDoubles.execAsync).toHaveBeenCalledWith('start "" "C:\\repo\\path"');
    expect(appDetectorTestDoubles.execAsync).toHaveBeenCalledWith(
      `powershell -Command "Start-Process -FilePath 'C:\\Program Files\\Microsoft VS Code\\Code.exe' -ArgumentList 'C:/repo/file.ts:9'"`
    );
  });

  it('detects macOS apps, opens workspaces with editor CLI, and extracts icons', async () => {
    vi.useFakeTimers();

    appDetectorTestDoubles.existsSync.mockImplementation((target: string) => {
      return [
        '/Applications',
        '/Applications/Visual Studio Code.app/Contents/Info.plist',
        '/usr/local/bin/code',
        '/Applications/Visual Studio Code.app/Contents/Resources/AppIcon.icns',
      ].includes(target);
    });
    appDetectorTestDoubles.readdir.mockResolvedValueOnce(['Visual Studio Code.app', 'Notes.txt']);
    appDetectorTestDoubles.execAsync.mockImplementation(async (command: string) => {
      if (command.includes('CFBundleIdentifier')) {
        return { stdout: 'com.microsoft.VSCode\n' };
      }
      if (command.includes('open -b')) {
        return { stdout: '' };
      }
      if (command.includes('CFBundleIconFile')) {
        return { stdout: 'AppIcon\n' };
      }
      if (command.includes('sips -s format png')) {
        return { stdout: '' };
      }
      return { stdout: '' };
    });
    appDetectorTestDoubles.readFile.mockResolvedValueOnce(Buffer.from('png-bits'));

    const { AppDetector } = await loadModule('darwin');
    const detector = new AppDetector();

    const apps = await detector.detectApps();
    expect(apps).toEqual([
      {
        name: 'VS Code',
        bundleId: 'com.microsoft.VSCode',
        category: AppCategory.Editor,
        path: '/Applications/Visual Studio Code.app',
      },
    ]);

    const openPromise = detector.openPath('/workspace', 'com.microsoft.VSCode', {
      workspacePath: '/workspace',
      openFiles: ['/workspace/src/index.ts'],
      activeFile: '/workspace/src/index.ts',
      line: 12,
    });
    await vi.advanceTimersByTimeAsync(500);
    await openPromise;

    expect(appDetectorTestDoubles.execAsync).toHaveBeenCalledWith(
      '"/usr/local/bin/code" "/workspace" "/workspace/src/index.ts"'
    );
    expect(appDetectorTestDoubles.execAsync).toHaveBeenCalledWith(
      '"/usr/local/bin/code" -g "/workspace/src/index.ts:12"'
    );

    await expect(detector.getAppIcon('com.microsoft.VSCode')).resolves.toBe(
      `data:image/png;base64,${Buffer.from('png-bits').toString('base64')}`
    );
    await expect(detector.getAppIcon('missing.bundle')).resolves.toBeUndefined();
  });

  it('handles unknown platforms and missing apps gracefully', async () => {
    const { AppDetector } = await loadModule('freebsd');
    const detector = new AppDetector();

    await expect(detector.detectApps()).resolves.toEqual([]);
    await expect(detector.openPath('/workspace', 'missing.bundle')).rejects.toThrow(
      'App with bundle ID missing.bundle not found'
    );
  });

  it('uses Windows working-directory terminals and returns no icon on Windows', async () => {
    const { AppDetector } = await loadModule('win32');
    const detector = new AppDetector();

    (detector as unknown as { detectedApps: unknown[] }).detectedApps = [
      {
        name: 'Tabby',
        bundleId: 'org.tabby',
        category: AppCategory.Terminal,
        path: 'C:\\Tools\\Tabby.exe',
      },
    ];

    await detector.openPath('C:/repo', 'org.tabby');

    expect(appDetectorTestDoubles.execAsync).toHaveBeenCalledWith(
      `powershell -Command "Start-Process -FilePath 'C:\\Tools\\Tabby.exe' -WorkingDirectory 'C:/repo'"`
    );
    await expect(detector.getAppIcon('org.tabby')).resolves.toBeUndefined();
  });

  it('falls back on macOS when editor CLI is unavailable and supports JetBrains line args', async () => {
    appDetectorTestDoubles.existsSync.mockReturnValue(false);

    const { AppDetector } = await loadModule('darwin');
    const detector = new AppDetector();

    (detector as unknown as { detectedApps: unknown[] }).detectedApps = [
      {
        name: 'VS Code',
        bundleId: 'com.microsoft.VSCode',
        category: AppCategory.Editor,
        path: '/Applications/Visual Studio Code.app',
      },
      {
        name: 'WebStorm',
        bundleId: 'com.jetbrains.WebStorm',
        category: AppCategory.Editor,
        path: '/Applications/WebStorm.app',
      },
    ];

    await detector.openPath('/workspace', 'com.microsoft.VSCode', {
      workspacePath: '/workspace',
      openFiles: ['/workspace/src/index.ts'],
      activeFile: '/workspace/src/index.ts',
      line: 12,
    });
    await detector.openPath('/workspace/file.ts', 'com.jetbrains.WebStorm', { line: 7 });

    expect(appDetectorTestDoubles.execAsync).toHaveBeenCalledWith(
      'open -b "com.microsoft.VSCode" "/workspace"'
    );
    expect(appDetectorTestDoubles.execAsync).toHaveBeenCalledWith(
      'open -b "com.jetbrains.WebStorm" --args --line 7 "/workspace/file.ts"'
    );
  });
});
