export function hideXtermReplaySurface(surface: HTMLElement): () => void {
  const previousVisibility = surface.style.visibility;
  surface.style.visibility = 'hidden';
  let restored = false;

  return () => {
    if (restored || surface.style.visibility !== 'hidden') {
      return;
    }

    restored = true;
    surface.style.visibility = previousVisibility;
  };
}
