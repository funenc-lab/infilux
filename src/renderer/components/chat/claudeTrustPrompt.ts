const CLAUDE_WORKSPACE_TRUST_PROMPT_MARKERS = [
  'Accessing workspace:',
  'Quick safety check:',
  'Security guide',
  'Yes, I trust this folder',
  'Enter to confirm',
];

export function isClaudeWorkspaceTrustPrompt(output: string): boolean {
  if (!output) {
    return false;
  }

  return CLAUDE_WORKSPACE_TRUST_PROMPT_MARKERS.every((marker) => output.includes(marker));
}
