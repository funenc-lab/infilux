export interface TmuxCheckResult {
  installed: boolean;
  version?: string;
  error?: string;
}

export interface TmuxKillSessionRequest {
  name: string;
  serverName?: string;
}

export type TmuxScrollDirection = 'up' | 'down';

export interface TmuxScrollClientRequest {
  sessionName: string;
  direction: TmuxScrollDirection;
  amount: number;
  serverName?: string;
}

export interface TmuxScrollClientResult {
  applied: boolean;
  sessionName?: string;
  paneId?: string;
}
