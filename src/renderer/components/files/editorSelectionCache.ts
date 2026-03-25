let latestSelectionText = '';

export function getEditorSelectionText(): string {
  return latestSelectionText;
}

export function setEditorSelectionText(value: string): void {
  latestSelectionText = value;
}
