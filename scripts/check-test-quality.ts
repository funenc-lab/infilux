import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const TEST_FILE_PATTERN = /\.(?:test|spec)\.(?:ts|tsx|js|jsx)$/u;
const TEST_DIRECTORIES = ['src', 'scripts', 'e2e'];
const SOURCE_INTROSPECTION_PATTERN =
  /\breadFileSync\b|\breadFile\b|\btoContain\(|\bnot\.toContain\(|\btoMatch\(/u;
const DOM_RUNTIME_PATTERN =
  /from ['"]react-dom\/client['"]|from ['"]@testing-library\/|createRoot\(|document\.createElement|document\.body\.appendChild|new MouseEvent|new KeyboardEvent/u;

export type TestQualityViolationRule = 'missing-assertion' | 'missing-jsdom-environment';

export interface TestQualityViolation {
  path: string;
  rule: TestQualityViolationRule;
  message: string;
}

export interface TestQualityAdvisory {
  rule: 'default-test-excludes-e2e' | 'source-introspection-tests';
  message: string;
}

export interface TestQualityMetrics {
  totalTestFiles: number;
  e2eTestFiles: number;
  jsdomTestFiles: number;
  domRuntimeTestFiles: number;
  sourceIntrospectionTestFiles: number;
}

export interface TestQualityReport {
  metrics: TestQualityMetrics;
  strictViolations: TestQualityViolation[];
  advisories: TestQualityAdvisory[];
}

interface PackageJson {
  scripts?: Record<string, string>;
}

interface OutputWriters {
  stdout: (value: string) => void;
  stderr: (value: string) => void;
}

interface TestFileEntry {
  path: string;
  content: string;
}

function isTestFile(filePath: string): boolean {
  return TEST_FILE_PATTERN.test(filePath);
}

function directoryExists(projectRoot: string, directory: string): boolean {
  try {
    return readdirSync(path.join(projectRoot, directory), { withFileTypes: true }) !== undefined;
  } catch {
    return false;
  }
}

function collectTestFilePaths(projectRoot: string): string[] {
  const testFilePaths: string[] = [];

  for (const directory of TEST_DIRECTORIES) {
    if (!directoryExists(projectRoot, directory)) {
      continue;
    }

    walkDirectory(projectRoot, path.join(projectRoot, directory), testFilePaths);
  }

  return testFilePaths.sort((left, right) => left.localeCompare(right));
}

function normalizeReportPath(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

function walkDirectory(
  projectRoot: string,
  currentDirectory: string,
  testFilePaths: string[]
): void {
  const directoryEntries = readdirSync(currentDirectory, { withFileTypes: true });

  for (const entry of directoryEntries) {
    const entryPath = path.join(currentDirectory, entry.name);

    if (entry.isDirectory()) {
      walkDirectory(projectRoot, entryPath, testFilePaths);
      continue;
    }

    if (!entry.isFile() || !isTestFile(entry.name)) {
      continue;
    }

    testFilePaths.push(normalizeReportPath(path.relative(projectRoot, entryPath)));
  }
}

function readPackageJson(projectRoot: string): PackageJson {
  try {
    return JSON.parse(readFileSync(path.join(projectRoot, 'package.json'), 'utf8')) as PackageJson;
  } catch {
    return {};
  }
}

function loadTestEntries(projectRoot: string): TestFileEntry[] {
  return collectTestFilePaths(projectRoot).map((relativePath) => ({
    path: relativePath,
    content: readFileSync(path.join(projectRoot, relativePath), 'utf8'),
  }));
}

function hasAssertion(content: string): boolean {
  return /\bexpect\s*\(/u.test(content);
}

function hasJsdomEnvironment(content: string): boolean {
  return /@vitest-environment\s+jsdom/u.test(content);
}

function isDomRuntimeTest(content: string): boolean {
  return DOM_RUNTIME_PATTERN.test(content);
}

function isSourceIntrospectionTest(content: string): boolean {
  return SOURCE_INTROSPECTION_PATTERN.test(content);
}

function defaultTestRunsE2e(packageJson: PackageJson): boolean {
  const testScript = packageJson.scripts?.test ?? '';
  return /\btest:e2e\b|vitest\.e2e\.config/u.test(testScript);
}

function buildMetrics(entries: TestFileEntry[]): TestQualityMetrics {
  return {
    totalTestFiles: entries.length,
    e2eTestFiles: entries.filter((entry) => entry.path.split('/')[0] === 'e2e').length,
    jsdomTestFiles: entries.filter((entry) => hasJsdomEnvironment(entry.content)).length,
    domRuntimeTestFiles: entries.filter((entry) => isDomRuntimeTest(entry.content)).length,
    sourceIntrospectionTestFiles: entries.filter((entry) =>
      isSourceIntrospectionTest(entry.content)
    ).length,
  };
}

function collectStrictViolations(entries: TestFileEntry[]): TestQualityViolation[] {
  const violations: TestQualityViolation[] = [];

  for (const entry of entries) {
    if (!hasAssertion(entry.content)) {
      violations.push({
        path: entry.path,
        rule: 'missing-assertion',
        message: 'Test file does not contain an expect assertion.',
      });
    }

    if (isDomRuntimeTest(entry.content) && !hasJsdomEnvironment(entry.content)) {
      violations.push({
        path: entry.path,
        rule: 'missing-jsdom-environment',
        message: 'DOM runtime test should declare /* @vitest-environment jsdom */.',
      });
    }
  }

  return violations.sort((left, right) => {
    const pathOrder = left.path.localeCompare(right.path);
    return pathOrder === 0 ? left.rule.localeCompare(right.rule) : pathOrder;
  });
}

function collectAdvisories(
  packageJson: PackageJson,
  metrics: TestQualityMetrics
): TestQualityAdvisory[] {
  const advisories: TestQualityAdvisory[] = [];

  if (metrics.e2eTestFiles > 0 && !defaultTestRunsE2e(packageJson)) {
    advisories.push({
      rule: 'default-test-excludes-e2e',
      message: 'Default test script does not run the Electron e2e suite.',
    });
  }

  if (metrics.sourceIntrospectionTestFiles > 0) {
    advisories.push({
      rule: 'source-introspection-tests',
      message:
        'Some tests inspect source text directly; prefer behavior tests for user-facing regressions.',
    });
  }

  return advisories;
}

export function auditTestQuality(projectRoot: string): TestQualityReport {
  const entries = loadTestEntries(projectRoot);
  const metrics = buildMetrics(entries);
  const packageJson = readPackageJson(projectRoot);

  return {
    metrics,
    strictViolations: collectStrictViolations(entries),
    advisories: collectAdvisories(packageJson, metrics),
  };
}

export function formatTestQualityAudit(report: TestQualityReport): string {
  const lines = [
    'Test quality audit',
    `- test files: ${String(report.metrics.totalTestFiles)}`,
    `- e2e files: ${String(report.metrics.e2eTestFiles)}`,
    `- jsdom files: ${String(report.metrics.jsdomTestFiles)}`,
    `- DOM runtime files: ${String(report.metrics.domRuntimeTestFiles)}`,
    `- source-introspection files: ${String(report.metrics.sourceIntrospectionTestFiles)}`,
  ];

  if (report.strictViolations.length === 0) {
    lines.push('Strict checks passed.');
  } else {
    lines.push('Strict violations:');
    for (const violation of report.strictViolations) {
      lines.push(`- ${violation.path}: ${violation.rule} - ${violation.message}`);
    }
  }

  if (report.advisories.length > 0) {
    lines.push('Advisories:');
    for (const advisory of report.advisories) {
      lines.push(`- ${advisory.rule}: ${advisory.message}`);
    }
  }

  return `${lines.join('\n')}\n`;
}

export function runTestQualityAudit(
  projectRoot: string,
  output: OutputWriters = {
    stdout: (value) => process.stdout.write(value),
    stderr: (value) => process.stderr.write(value),
  }
): number {
  const report = auditTestQuality(projectRoot);
  const formatted = formatTestQualityAudit(report);

  if (report.strictViolations.length > 0) {
    output.stderr(formatted);
    return 1;
  }

  output.stdout(formatted);
  return 0;
}

function isDirectExecution(): boolean {
  const entryFile = process.argv[1];

  if (!entryFile) {
    return false;
  }

  return import.meta.url === pathToFileURL(entryFile).href;
}

if (isDirectExecution()) {
  process.exit(runTestQualityAudit(process.cwd()));
}
