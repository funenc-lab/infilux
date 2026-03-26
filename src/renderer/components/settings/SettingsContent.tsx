import * as React from 'react';
import type { SettingsCategory } from './constants';
import { SettingsShell } from './SettingsShell';

export interface SettingsContentProps {
  activeCategory?: SettingsCategory;
  onCategoryChange?: (category: SettingsCategory) => void;
  scrollToProvider?: boolean;
  repoPath?: string;
}

export function SettingsContent({
  activeCategory: controlledCategory,
  onCategoryChange,
  scrollToProvider,
  repoPath,
}: SettingsContentProps) {
  const [internalCategory, setInternalCategory] = React.useState<SettingsCategory>('general');
  const activeCategory = controlledCategory ?? internalCategory;

  const handleCategoryChange = (category: SettingsCategory) => {
    if (onCategoryChange) {
      onCategoryChange(category);
    } else {
      setInternalCategory(category);
    }
  };

  return (
    <SettingsShell
      activeCategory={activeCategory}
      onCategoryChange={handleCategoryChange}
      scrollToProvider={scrollToProvider}
      repoPath={repoPath}
      className="h-full"
    />
  );
}
