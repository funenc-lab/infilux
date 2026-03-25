export function formatErrorBoundaryMessage(error: unknown): string {
  if (error instanceof Error) {
    const label = error.name?.trim() || 'Error';
    const message = error.message?.trim();
    return message ? `${label}: ${message}` : label;
  }

  if (typeof error === 'string' && error.trim().length > 0) {
    return error.trim();
  }

  return 'Unknown renderer error';
}
