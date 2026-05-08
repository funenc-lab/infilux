import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  auditTestQuality,
  formatTestQualityAudit,
  runTestQualityAudit,
} from '../check-test-quality';

const temporaryRoots: string[] = [];

function writeProjectFile(projectRoot: string, relativePath: string, content: string): void {
  const filePath = path.join(projectRoot, relativePath);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, content);
}

afterEach(() => {
  while (temporaryRoots.length > 0) {
    const temporaryRoot = temporaryRoots.pop();
    if (temporaryRoot) {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  }
});

describe('test quality audit', () => {
  it('reports strict reliability violations and advisory metrics for a project test suite', () => {
    const projectRoot = mkdtempSync(path.join(os.tmpdir(), 'test-quality-audit-'));
    temporaryRoots.push(projectRoot);

    writeProjectFile(
      projectRoot,
      'package.json',
      JSON.stringify(
        {
          scripts: {
            test: 'vitest run',
            'test:e2e': 'vitest run --config vitest.e2e.config.ts',
          },
        },
        null,
        2
      )
    );
    writeProjectFile(
      projectRoot,
      'src/math/__tests__/math.test.ts',
      "import { expect, it } from 'vitest';\nit('adds values', () => expect(1 + 1).toBe(2));\n"
    );
    writeProjectFile(
      projectRoot,
      'src/ui/__tests__/Panel.test.tsx',
      [
        '/* @vitest-environment jsdom */',
        "import { createRoot } from 'react-dom/client';",
        "import { expect, it } from 'vitest';",
        "it('mounts', () => expect(createRoot).toBeTypeOf('function'));",
        '',
      ].join('\n')
    );
    writeProjectFile(
      projectRoot,
      'src/ui/__tests__/BrokenDom.test.tsx',
      "import { createRoot } from 'react-dom/client';\nimport { expect, it } from 'vitest';\nit('mounts', () => expect(createRoot(document.createElement('div'))).toBeTruthy());\n"
    );
    writeProjectFile(
      projectRoot,
      'src/policy/__tests__/policy.test.ts',
      "import { readFileSync } from 'node:fs';\nimport { expect, it } from 'vitest';\nit('keeps a policy token', () => expect(readFileSync('policy.ts', 'utf8')).toContain('token'));\n"
    );
    writeProjectFile(
      projectRoot,
      'src/empty/__tests__/empty.test.ts',
      "import { it } from 'vitest';\nit('runs setup only', () => undefined);\n"
    );
    writeProjectFile(
      projectRoot,
      'e2e/launch.test.ts',
      "import { expect, it } from 'vitest';\nit('launches', () => expect(true).toBe(true));\n"
    );

    const report = auditTestQuality(projectRoot);

    expect(report.metrics.totalTestFiles).toBe(6);
    expect(report.metrics.e2eTestFiles).toBe(1);
    expect(report.metrics.jsdomTestFiles).toBe(1);
    expect(report.metrics.domRuntimeTestFiles).toBe(2);
    expect(report.metrics.sourceIntrospectionTestFiles).toBe(1);
    expect(report.strictViolations).toEqual([
      {
        path: 'src/empty/__tests__/empty.test.ts',
        rule: 'missing-assertion',
        message: 'Test file does not contain an expect assertion.',
      },
      {
        path: 'src/ui/__tests__/BrokenDom.test.tsx',
        rule: 'missing-jsdom-environment',
        message: 'DOM runtime test should declare /* @vitest-environment jsdom */.',
      },
    ]);
    expect(report.advisories).toContainEqual({
      rule: 'default-test-excludes-e2e',
      message: 'Default test script does not run the Electron e2e suite.',
    });
  });

  it('formats a stable summary and returns a failing exit code only for strict violations', () => {
    const projectRoot = mkdtempSync(path.join(os.tmpdir(), 'test-quality-audit-clean-'));
    temporaryRoots.push(projectRoot);

    writeProjectFile(
      projectRoot,
      'package.json',
      JSON.stringify(
        {
          scripts: {
            test: 'vitest run && pnpm test:e2e',
            'test:e2e': 'vitest run --config vitest.e2e.config.ts',
          },
        },
        null,
        2
      )
    );
    writeProjectFile(
      projectRoot,
      'src/ui/__tests__/Panel.test.tsx',
      [
        '/* @vitest-environment jsdom */',
        "import { createRoot } from 'react-dom/client';",
        "import { expect, it } from 'vitest';",
        "it('mounts', () => expect(createRoot).toBeTypeOf('function'));",
        '',
      ].join('\n')
    );
    writeProjectFile(
      projectRoot,
      'e2e/launch.test.ts',
      "import { expect, it } from 'vitest';\nit('launches', () => expect(true).toBe(true));\n"
    );

    const report = auditTestQuality(projectRoot);
    const output = formatTestQualityAudit(report);
    const stdout: string[] = [];
    const stderr: string[] = [];

    expect(output).toContain('Test quality audit');
    expect(output).toContain('Strict checks passed.');
    expect(
      runTestQualityAudit(projectRoot, {
        stdout: (value) => stdout.push(value),
        stderr: (value) => stderr.push(value),
      })
    ).toBe(0);
    expect(stdout.join('')).toContain('Strict checks passed.');
    expect(stderr).toEqual([]);
  });

  it('keeps the package script surface wired for manual and lint-time audits', () => {
    const packageJson = JSON.parse(
      readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')
    ) as { scripts?: Record<string, string> };

    expect(packageJson.scripts?.['test:quality']).toBe('npx tsx scripts/check-test-quality.ts');
    expect(packageJson.scripts?.lint).toContain('pnpm test:quality');
  });
});
