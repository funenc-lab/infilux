import type { ReactNode } from 'react';
import { ControlStateCard } from '@/components/layout/ControlStateCard';

interface DiffViewerStateCardProps {
  icon: ReactNode;
  eyebrow: string;
  title: string;
  description: string;
  metaLabel?: string;
  metaValue?: string;
}

export function DiffViewerStateCard({
  icon,
  eyebrow,
  title,
  description,
  metaLabel,
  metaValue,
}: DiffViewerStateCardProps) {
  return (
    <ControlStateCard
      icon={icon}
      eyebrow={eyebrow}
      title={title}
      description={description}
      metaLabel={metaLabel}
      metaValue={metaValue}
    />
  );
}
