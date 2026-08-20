import type { SystemFontCatalog } from '@shared/types';
import * as React from 'react';

const EMPTY_SYSTEM_FONT_CATALOG: SystemFontCatalog = {
  families: [],
  monospaceFamilies: [],
};

function normalizeFontFamilies(fontFamilies: unknown): string[] {
  if (!Array.isArray(fontFamilies)) {
    return [];
  }

  return fontFamilies.filter((fontFamily): fontFamily is string => typeof fontFamily === 'string');
}

function normalizeSystemFontCatalog(fontCatalog: SystemFontCatalog): SystemFontCatalog {
  return {
    families: normalizeFontFamilies(fontCatalog.families),
    monospaceFamilies: normalizeFontFamilies(fontCatalog.monospaceFamilies),
  };
}

export function useSystemFontCatalog(): SystemFontCatalog {
  const [fontCatalog, setFontCatalog] =
    React.useState<SystemFontCatalog>(EMPTY_SYSTEM_FONT_CATALOG);

  React.useEffect(() => {
    const listSystemFontFamilies = window.electronAPI?.app?.listSystemFontFamilies;
    if (!listSystemFontFamilies) {
      return;
    }

    let disposed = false;

    void listSystemFontFamilies()
      .then((nextFontCatalog) => {
        if (!disposed) {
          setFontCatalog(normalizeSystemFontCatalog(nextFontCatalog));
        }
      })
      .catch(() => {
        if (!disposed) {
          setFontCatalog(EMPTY_SYSTEM_FONT_CATALOG);
        }
      });

    return () => {
      disposed = true;
    };
  }, []);

  return fontCatalog;
}
