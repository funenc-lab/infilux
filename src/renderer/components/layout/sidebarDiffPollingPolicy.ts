interface ShouldPollSidebarDiffStatsOptions {
  collapsed?: boolean;
  diffStatPathKey: string;
  shouldPoll: boolean;
}

export function shouldPollSidebarDiffStats({
  collapsed = false,
  diffStatPathKey,
  shouldPoll,
}: ShouldPollSidebarDiffStatsOptions): boolean {
  if (collapsed) {
    return false;
  }

  if (!shouldPoll) {
    return false;
  }

  return diffStatPathKey.length > 0;
}
