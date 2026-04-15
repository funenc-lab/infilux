import { delimiter } from 'node:path';
import type { Page } from 'playwright';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { normalizeWorkspacePath } from '../src/shared/utils/workspace';
import {
  type CapabilityPolicyScenario,
  createCapabilityPolicyScenario,
  readLoggedCodexInvocations,
} from './helpers/capabilityPolicyScenario';
import {
  ensureElectronBuildExists,
  launchInfiluxForScenario,
  quitElectronApplication,
  seedRendererLocalStorageAndReload,
  waitForRepositoryAndWorktree,
} from './helpers/electronApp';

const cleanupTasks: Array<() => Promise<void>> = [];
const WORKSPACE_PLATFORM =
  process.platform === 'darwin' ? 'darwin' : process.platform === 'win32' ? 'win32' : 'linux';

async function runCleanupTasks(): Promise<void> {
  while (cleanupTasks.length > 0) {
    const cleanup = cleanupTasks.pop();
    if (!cleanup) {
      continue;
    }
    await cleanup();
  }
}

function normalizeScenarioPath(value: string): string {
  return normalizeWorkspacePath(value, WORKSPACE_PLATFORM);
}

function normalizePathAliases(value: string): string {
  return value.replace(/\/private\/(var|tmp|etc)(?=\/|$)/g, '/$1');
}

describe.sequential('electron capability policy launch integration', () => {
  beforeAll(() => {
    ensureElectronBuildExists();
  });

  afterEach(async () => {
    await runCleanupTasks();
  });

  it('projects project-level skill and MCP policies into Codex launch arguments', async () => {
    const scenario = await createCapabilityPolicyScenario();
    cleanupTasks.push(scenario.cleanup);

    const launch = await launchCapabilityScenario(scenario);

    try {
      await seedRendererLocalStorageAndReload(launch.page, scenario.browserLocalStorage);
      await waitForRepositoryAndWorktree(launch.page, scenario);
      await activateWorktree(launch.page, scenario);

      await openProjectConfigurationDialog(launch.page, scenario);
      await assertDuplicateSkillSourcesVisible(launch.page, scenario);
      await assertProjectMcpEntriesVisible(launch.page, scenario);
      await blockSkillAndSave(launch.page, scenario.duplicateSkillId);
      await assertStoredProjectPolicy(launch.page, scenario);

      await openCodexLaunchDialogFromEmptyState(launch.page);
      await launchCodexFromDialog(launch.page);

      const invocation = await waitForCodexLaunchInvocation(scenario.codexLogPath, (argv) => {
        return argv.some((arg) => arg.includes('skills.config='));
      });
      const skillsConfigArg = expectSkillsConfigArg(invocation.argv);
      const normalizedSkillsConfigArg = normalizePathAliases(skillsConfigArg);

      expect(normalizeScenarioPath(invocation.cwd)).toBe(
        normalizeScenarioPath(scenario.worktreePath)
      );
      expect(skillsConfigArg).toContain(
        `enabled = false, path = "${normalizeScenarioPath(scenario.userDuplicateSkillPath)}"`
      );
      expect(skillsConfigArg).toContain(
        `enabled = false, path = "${normalizeScenarioPath(scenario.projectDuplicateSkillPath)}"`
      );
      expect(normalizedSkillsConfigArg).toContain(
        `enabled = true, path = "${normalizeScenarioPath(scenario.projectOnlySkillPath)}"`
      );

      const joinedArgs = invocation.argv.join(' ');
      expect(joinedArgs).toContain(`mcp_servers.${scenario.projectSharedMcpId}.command=`);
      expect(joinedArgs).toContain(`mcp_servers.${scenario.userPersonalMcpId}.command=`);
      expect(joinedArgs).toContain(`mcp_servers.${scenario.projectPersonalMcpId}.command=`);
    } catch (error) {
      throw await buildScenarioError(error, launch.page, launch.consoleMessages, scenario);
    } finally {
      await quitElectronApplication(launch.app);
    }
  });

  it('projects worktree-level skill and MCP policies into Codex launch arguments', async () => {
    const scenario = await createCapabilityPolicyScenario();
    cleanupTasks.push(scenario.cleanup);

    const launch = await launchCapabilityScenario(scenario);

    try {
      await seedRendererLocalStorageAndReload(launch.page, scenario.browserLocalStorage);
      await waitForRepositoryAndWorktree(launch.page, scenario);
      await activateWorktree(launch.page, scenario);

      await openWorktreeConfigurationDialog(launch.page, scenario);
      await assertWorktreeMcpEntriesVisible(launch.page, scenario);
      await blockSkillAndSave(launch.page, scenario.worktreeOnlySkillId);
      await assertStoredWorktreePolicy(launch.page, scenario);

      await openCodexLaunchDialogFromEmptyState(launch.page);
      await launchCodexFromDialog(launch.page);

      const invocation = await waitForCodexLaunchInvocation(scenario.codexLogPath, (argv) => {
        return argv.some((arg) => arg.includes('skills.config='));
      });
      const skillsConfigArg = expectSkillsConfigArg(invocation.argv);
      const normalizedSkillsConfigArg = normalizePathAliases(skillsConfigArg);

      expect(normalizeScenarioPath(invocation.cwd)).toBe(
        normalizeScenarioPath(scenario.worktreePath)
      );
      expect(normalizedSkillsConfigArg).toContain(
        `enabled = false, path = "${normalizeScenarioPath(scenario.worktreeOnlySkillPath)}"`
      );
      expect(normalizedSkillsConfigArg).toContain(
        `enabled = true, path = "${normalizeScenarioPath(scenario.userDuplicateSkillPath)}"`
      );
      expect(normalizedSkillsConfigArg).toContain(
        `enabled = true, path = "${normalizeScenarioPath(scenario.projectDuplicateSkillPath)}"`
      );

      const joinedArgs = invocation.argv.join(' ');
      expect(joinedArgs).toContain(`mcp_servers.${scenario.projectSharedMcpId}.command=`);
      expect(joinedArgs).toContain(`mcp_servers.${scenario.worktreeSharedMcpId}.command=`);
      expect(joinedArgs).toContain(`mcp_servers.${scenario.worktreePersonalMcpId}.command=`);
    } catch (error) {
      throw await buildScenarioError(error, launch.page, launch.consoleMessages, scenario);
    } finally {
      await quitElectronApplication(launch.app);
    }
  });
});

async function launchCapabilityScenario(scenario: CapabilityPolicyScenario) {
  const originalPath = process.env.PATH;
  const originalCodexLogPath = process.env.CAPABILITY_TEST_CODEX_LOG;

  process.env.PATH = `${scenario.fakeBinDir}${delimiter}${originalPath ?? ''}`;
  process.env.CAPABILITY_TEST_CODEX_LOG = scenario.codexLogPath;

  try {
    return await launchInfiluxForScenario(scenario);
  } finally {
    if (originalPath === undefined) {
      delete process.env.PATH;
    } else {
      process.env.PATH = originalPath;
    }

    if (originalCodexLogPath === undefined) {
      delete process.env.CAPABILITY_TEST_CODEX_LOG;
    } else {
      process.env.CAPABILITY_TEST_CODEX_LOG = originalCodexLogPath;
    }
  }
}

async function activateWorktree(page: Page, scenario: CapabilityPolicyScenario): Promise<void> {
  const worktreeButton = resolveWorktreeButton(page, scenario);
  await worktreeButton.click();
  await page.getByRole('button', { name: /Choose Profile/i }).waitFor({ timeout: 30000 });
}

async function openProjectConfigurationDialog(
  page: Page,
  scenario: CapabilityPolicyScenario
): Promise<void> {
  const selectedRepoRow = page
    .locator('[data-active="repo"]')
    .filter({ hasText: scenario.repoName })
    .first();
  await selectedRepoRow.waitFor({ state: 'visible', timeout: 30000 });
  await selectedRepoRow
    .locator('button[aria-label="仓库操作"], button[aria-label="Repository actions"]')
    .click();
  await page.getByRole('menuitem', { name: /Project Configuration|项目配置/ }).click();
  await page.locator('[data-policy-action="save"]').waitFor({ state: 'visible', timeout: 30000 });
}

async function openWorktreeConfigurationDialog(
  page: Page,
  scenario: CapabilityPolicyScenario
): Promise<void> {
  await resolveWorktreeButton(page, scenario).click({ button: 'right' });
  await page.getByRole('menuitem', { name: /Worktree Configuration|Worktree 配置/ }).click();
  await page.locator('[data-policy-action="save"]').waitFor({ state: 'visible', timeout: 30000 });
}

async function assertDuplicateSkillSourcesVisible(
  page: Page,
  scenario: CapabilityPolicyScenario
): Promise<void> {
  const searchInput = page.locator('[data-policy-search="input"]').first();
  await searchInput.fill('duplicate-skill');

  const skillRow = page.locator(`[data-policy-item-id="${scenario.duplicateSkillId}"]`).first();
  await skillRow.waitFor({ state: 'visible', timeout: 30000 });
  await skillRow
    .locator(`[data-policy-source-paths-trigger="${scenario.duplicateSkillId}"]`)
    .click();

  await expect
    .poll(async () => await skillRow.textContent(), { timeout: 10000 })
    .toContain(scenario.userDuplicateSkillPath);
  await expect
    .poll(async () => await skillRow.textContent(), { timeout: 10000 })
    .toContain(scenario.projectDuplicateSkillPath);
}

async function assertProjectMcpEntriesVisible(
  page: Page,
  scenario: CapabilityPolicyScenario
): Promise<void> {
  await page.locator('[data-policy-tab="mcp"]').click();
  const searchInput = page.locator('[data-policy-search="input"]').first();
  await searchInput.fill('e2e');

  await page.locator(`[data-policy-item-id="${scenario.projectSharedMcpId}"]`).waitFor({
    state: 'visible',
    timeout: 30000,
  });
  await page.locator(`[data-policy-item-id="${scenario.userPersonalMcpId}"]`).waitFor({
    state: 'visible',
    timeout: 30000,
  });
  await page.locator(`[data-policy-item-id="${scenario.projectPersonalMcpId}"]`).waitFor({
    state: 'visible',
    timeout: 30000,
  });
}

async function assertWorktreeMcpEntriesVisible(
  page: Page,
  scenario: CapabilityPolicyScenario
): Promise<void> {
  await page.locator('[data-policy-tab="mcp"]').click();
  const searchInput = page.locator('[data-policy-search="input"]').first();
  await searchInput.fill('e2e');

  await page.locator(`[data-policy-item-id="${scenario.projectSharedMcpId}"]`).waitFor({
    state: 'visible',
    timeout: 30000,
  });
  await page.locator(`[data-policy-item-id="${scenario.worktreeSharedMcpId}"]`).waitFor({
    state: 'visible',
    timeout: 30000,
  });
  await page.locator(`[data-policy-item-id="${scenario.worktreePersonalMcpId}"]`).waitFor({
    state: 'visible',
    timeout: 30000,
  });
}

async function blockSkillAndSave(page: Page, skillId: string): Promise<void> {
  await page.locator('[data-policy-tab="skills"]').click();
  const searchInput = page.locator('[data-policy-search="input"]').first();
  await searchInput.fill(skillId.replace('legacy-skill:', ''));

  const skillRow = page.locator(`[data-policy-item-id="${skillId}"]`).first();
  await skillRow.waitFor({ state: 'visible', timeout: 30000 });
  await skillRow.locator('[data-policy-decision="block"]').click();

  const saveButton = page.locator('[data-policy-action="save"]').first();
  await expect.poll(async () => await saveButton.isEnabled(), { timeout: 10000 }).toBe(true);
  await saveButton.click();
  await saveButton.waitFor({ state: 'hidden', timeout: 30000 });
}

async function assertStoredProjectPolicy(
  page: Page,
  scenario: CapabilityPolicyScenario
): Promise<void> {
  const blockedIds = await page.evaluate((repoPath) => {
    const raw = localStorage.getItem('enso-claude-project-policies');
    if (!raw) {
      return [];
    }

    const policies = JSON.parse(raw) as Record<
      string,
      { blockedCapabilityIds?: string[] } | undefined
    >;
    const normalized = repoPath.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
    const key = Object.keys(policies).find(
      (candidate) => candidate.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase() === normalized
    );

    return key ? (policies[key]?.blockedCapabilityIds ?? []) : [];
  }, scenario.repoPath);

  expect(blockedIds).toContain(scenario.duplicateSkillId);
}

async function assertStoredWorktreePolicy(
  page: Page,
  scenario: CapabilityPolicyScenario
): Promise<void> {
  const blockedIds = await page.evaluate((worktreePath) => {
    const raw = localStorage.getItem('enso-claude-worktree-policies');
    if (!raw) {
      return [];
    }

    const policies = JSON.parse(raw) as Record<
      string,
      { blockedCapabilityIds?: string[] } | undefined
    >;
    const normalized = worktreePath.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
    const key = Object.keys(policies).find(
      (candidate) => candidate.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase() === normalized
    );

    return key ? (policies[key]?.blockedCapabilityIds ?? []) : [];
  }, scenario.worktreePath);

  expect(blockedIds).toContain(scenario.worktreeOnlySkillId);
}

async function openCodexLaunchDialogFromEmptyState(page: Page): Promise<void> {
  const chooseProfileButton = page.getByRole('button', { name: /Choose Profile/i }).first();
  await chooseProfileButton.click();

  const profileMenu = page.locator('[role="menu"]').filter({ hasText: /Codex/ }).first();
  await profileMenu.waitFor({ state: 'visible', timeout: 30000 });

  const codexProfileButton = profileMenu
    .locator('button')
    .filter({ hasText: /^Codex$/ })
    .first();
  await codexProfileButton.waitFor({ state: 'visible', timeout: 30000 });

  const codexRow = codexProfileButton.locator('xpath=..');
  await codexRow
    .locator('button[aria-label="Skill 与 MCP"], button[aria-label="Skill & MCP"]')
    .click();

  await page.getByRole('button', { name: /Launch Agent|启动 Agent/ }).waitFor({
    state: 'visible',
    timeout: 30000,
  });
}

async function launchCodexFromDialog(page: Page): Promise<void> {
  await page.getByRole('button', { name: /Launch Agent|启动 Agent/ }).click();

  await expect
    .poll(async () => await page.locator('.xterm-rows').count(), { timeout: 30000 })
    .toBeGreaterThan(0);
  await expect
    .poll(async () => await page.locator('.xterm-rows').first().innerText(), { timeout: 30000 })
    .toContain('Fake Codex ready');
}

function resolveWorktreeButton(page: Page, scenario: CapabilityPolicyScenario) {
  return page
    .locator('[data-node-kind="worktree"]')
    .filter({ hasText: scenario.worktreeBranch })
    .locator('button[data-surface="row"]')
    .first();
}

async function waitForCodexLaunchInvocation(
  logPath: string,
  predicate: (argv: string[]) => boolean
): Promise<{
  argv: string[];
  cwd: string;
  pid: number;
  timestamp: string;
}> {
  const deadline = Date.now() + 30000;

  while (Date.now() < deadline) {
    const invocations = await readLoggedCodexInvocations(logPath);
    const match = invocations.find((entry) => predicate(entry.argv));
    if (match) {
      return match;
    }

    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  throw new Error(`Timed out waiting for fake Codex launch invocation in ${logPath}`);
}

function expectSkillsConfigArg(argv: string[]): string {
  const match = argv.find((arg) => arg.includes('skills.config='));
  expect(match).toBeTruthy();
  return match ?? '';
}

async function buildScenarioError(
  error: unknown,
  page: Page,
  consoleMessages: string[],
  scenario: CapabilityPolicyScenario
): Promise<Error> {
  const codexInvocations = await readLoggedCodexInvocations(scenario.codexLogPath).catch(
    (readError) => {
      return [
        {
          error: readError instanceof Error ? readError.message : String(readError),
        },
      ];
    }
  );
  const bodyText = await page
    .evaluate(() => document.body.innerText.slice(0, 4000))
    .catch((bodyError) => {
      return `Failed to read body text: ${
        bodyError instanceof Error ? bodyError.message : String(bodyError)
      }`;
    });
  const terminalText = await page
    .locator('.xterm-rows')
    .first()
    .innerText()
    .catch((terminalError) => {
      return `Failed to read terminal text: ${
        terminalError instanceof Error ? terminalError.message : String(terminalError)
      }`;
    });

  return new Error(
    [
      error instanceof Error ? error.message : String(error),
      'Codex invocations:',
      JSON.stringify(codexInvocations, null, 2),
      'Visible terminal text:',
      terminalText,
      'Body text:',
      bodyText,
      'Renderer diagnostics:',
      consoleMessages.length > 0 ? consoleMessages.join('\n') : 'No renderer diagnostics captured.',
    ].join('\n\n')
  );
}
