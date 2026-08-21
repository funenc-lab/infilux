import { createContext, type ReactNode, useContext } from 'react';

const PortalScopeContext = createContext<string | undefined>(undefined);

interface PortalScopeProviderProps {
  children?: ReactNode;
  scope: string;
}

export function PortalScopeProvider({ children, scope }: PortalScopeProviderProps) {
  return <PortalScopeContext.Provider value={scope}>{children}</PortalScopeContext.Provider>;
}

export function useResolvedPortalScope(explicitScope?: string): string | undefined {
  const inheritedScope = useContext(PortalScopeContext);
  return explicitScope ?? inheritedScope;
}
