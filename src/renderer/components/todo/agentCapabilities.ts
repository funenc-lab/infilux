import { type AgentCapabilityProfile, resolveAgentCapabilityProfile } from '@shared/types';
import type { TodoTask } from './types';
import type { ResolvedAgent } from './useEnabledAgents';

export const AUTO_EXECUTE_AGENT_AUTO_VALUE = '__auto__';

export type AgentCapabilities = AgentCapabilityProfile;
export type AutoExecuteAgentChoiceReason =
  | 'Code implementation fit'
  | 'Code review fit'
  | 'Default agent'
  | 'Large context fit'
  | 'Manual selection'
  | 'No enabled agents'
  | 'Research and context fit'
  | 'Task agent selection';

interface TaskRequirements {
  codeImplementation: boolean;
  codeReview: boolean;
  research: boolean;
  largeContext: boolean;
  deepReasoning: boolean;
}

export interface AutoExecuteAgentChoice {
  agent: ResolvedAgent | undefined;
  mode: 'manual' | 'recommended' | 'task' | 'none';
  reason: AutoExecuteAgentChoiceReason;
}

export interface ResolveAutoExecuteAgentChoiceOptions {
  agents: ResolvedAgent[];
  tasks: TodoTask[];
  respectTaskAgentSelection?: boolean;
  selectedAgentId?: string;
}

const CODE_IMPLEMENTATION_KEYWORDS = [
  'bug',
  'code',
  'fix',
  'implement',
  'lint',
  'refactor',
  'test',
  'typecheck',
  'typescript',
  'vitest',
  '\u4fee\u590d',
  '\u5b9e\u73b0',
  '\u8c03\u6574',
  '\u6d4b\u8bd5',
  '\u9a8c\u8bc1',
  '\u91cd\u6784',
  '\u7c7b\u578b\u68c0\u67e5',
] as const;

const CODE_REVIEW_KEYWORDS = [
  'audit',
  'review',
  'security',
  'vulnerability',
  '\u5ba1\u67e5',
  '\u5ba1\u6838',
  '\u5b89\u5168',
  '\u6f0f\u6d1e',
] as const;

const RESEARCH_KEYWORDS = [
  'compare',
  'docs',
  'latest',
  'research',
  'search',
  '\u5bf9\u6bd4',
  '\u6587\u6863',
  '\u6700\u65b0',
  '\u8c03\u7814',
  '\u641c\u7d22',
] as const;

const LARGE_CONTEXT_KEYWORDS = [
  'architecture',
  'cross-module',
  'migration',
  'multi-file',
  'refactor',
  '\u67b6\u6784',
  '\u8de8\u6a21\u5757',
  '\u8fc1\u79fb',
  '\u591a\u6587\u4ef6',
  '\u91cd\u6784',
] as const;

const DEEP_REASONING_KEYWORDS = ['complex', 'design', '\u590d\u6742', '\u8bbe\u8ba1'] as const;

export function resolveAgentCapabilities(agent: ResolvedAgent): AgentCapabilities {
  return resolveAgentCapabilityProfile(agent.agentId, agent.command);
}

function includesAny(value: string, keywords: readonly string[]): boolean {
  return keywords.some((keyword) => value.includes(keyword));
}

function inferTaskRequirements(tasks: TodoTask[]): TaskRequirements {
  const text = tasks
    .map((task) => `${task.title}\n${task.description}`)
    .join('\n')
    .toLowerCase();

  const codeImplementation = includesAny(text, CODE_IMPLEMENTATION_KEYWORDS);
  const codeReview = includesAny(text, CODE_REVIEW_KEYWORDS);
  const research = includesAny(text, RESEARCH_KEYWORDS);
  const largeContext = includesAny(text, LARGE_CONTEXT_KEYWORDS);

  return {
    codeImplementation,
    codeReview,
    research,
    largeContext,
    deepReasoning: codeReview || largeContext || includesAny(text, DEEP_REASONING_KEYWORDS),
  };
}

function scoreAgent(agent: ResolvedAgent, requirements: TaskRequirements): number {
  const capabilities = resolveAgentCapabilities(agent);
  let score = agent.isDefault ? 10 : 0;

  if (requirements.codeImplementation && capabilities.canEditCode) score += 20;
  if (requirements.codeImplementation && capabilities.hasStrongTestAffinity) score += 15;
  if (requirements.codeReview && capabilities.canReviewCode) score += 18;
  if (requirements.research && capabilities.canResearch) score += 18;
  if (requirements.largeContext && capabilities.canHandleLargeContext) score += 12;
  if (requirements.deepReasoning && capabilities.canDeepReason) score += 10;
  if (capabilities.completionSignal === 'hook-or-marker') score += 3;

  return score;
}

function resolveRecommendationReason(requirements: TaskRequirements): AutoExecuteAgentChoiceReason {
  if (requirements.codeImplementation) return 'Code implementation fit';
  if (requirements.codeReview) return 'Code review fit';
  if (requirements.research) return 'Research and context fit';
  if (requirements.largeContext) return 'Large context fit';
  return 'Default agent';
}

function findTaskSelectedAgent(
  agents: ResolvedAgent[],
  tasks: TodoTask[]
): ResolvedAgent | undefined {
  for (const task of tasks) {
    if (!task.agentId) {
      continue;
    }

    const agent = agents.find((item) => item.agentId === task.agentId);
    if (agent) {
      return agent;
    }
  }

  return undefined;
}

export function resolveAutoExecuteAgentChoice({
  agents,
  respectTaskAgentSelection = true,
  selectedAgentId,
  tasks,
}: ResolveAutoExecuteAgentChoiceOptions): AutoExecuteAgentChoice {
  if (agents.length === 0) {
    return { agent: undefined, mode: 'none', reason: 'No enabled agents' };
  }

  if (respectTaskAgentSelection) {
    const taskSelectedAgent = findTaskSelectedAgent(agents, tasks);
    if (taskSelectedAgent) {
      return { agent: taskSelectedAgent, mode: 'task', reason: 'Task agent selection' };
    }
  }

  if (selectedAgentId && selectedAgentId !== AUTO_EXECUTE_AGENT_AUTO_VALUE) {
    const selectedAgent = agents.find((agent) => agent.agentId === selectedAgentId);
    if (selectedAgent) {
      return { agent: selectedAgent, mode: 'manual', reason: 'Manual selection' };
    }
  }

  const requirements = inferTaskRequirements(tasks);
  const [recommendedAgent] = [...agents].sort(
    (left, right) => scoreAgent(right, requirements) - scoreAgent(left, requirements)
  );

  return {
    agent: recommendedAgent,
    mode: 'recommended',
    reason: resolveRecommendationReason(requirements),
  };
}
