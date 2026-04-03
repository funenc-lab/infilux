/**
 * MCP (Model Context Protocol) 服务器类型定义
 * 支持 stdio、http、sse 三种传输类型
 */

export type McpTransportType = 'stdio' | 'http' | 'sse';

/**
 * stdio 类型 MCP 配置
 */
export interface McpStdioConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

/**
 * HTTP/SSE 类型 MCP 配置
 */
export interface McpHttpConfig {
  type: 'http' | 'sse';
  url: string;
  headers?: Record<string, string>;
}

/**
 * MCP 服务器配置（从 ~/.claude.json 读取）
 */
export type McpServerConfig = McpStdioConfig | McpHttpConfig;

/**
 * 判断是否为 HTTP/SSE 类型配置
 */
export function isHttpMcpConfig(config: McpServerConfig): config is McpHttpConfig {
  return 'type' in config && (config.type === 'http' || config.type === 'sse');
}

/**
 * 判断是否为 stdio 类型配置
 */
export function isStdioMcpConfig(config: McpServerConfig): config is McpStdioConfig {
  return 'command' in config && !('type' in config);
}

/**
 * stdio 类型 MCP 服务器（UI 可编辑）
 */
export interface McpStdioServer {
  id: string;
  name: string;
  description?: string;
  transportType: 'stdio';
  command: string;
  args?: string[];
  env?: Record<string, string>;
  enabled: boolean;
}

/**
 * HTTP/SSE 类型 MCP 服务器（UI 只读）
 */
export interface McpHttpServer {
  id: string;
  name: string;
  description?: string;
  transportType: 'http' | 'sse';
  url: string;
  headers?: Record<string, string>;
  enabled: boolean;
}

/**
 * MCP 服务器（统一类型）
 */
export type McpServer = McpStdioServer | McpHttpServer;

export type ClaudeIdeBridgeLaunchReason =
  | 'ready'
  | 'bridge-disabled'
  | 'no-workspace'
  | 'workspace-mismatch'
  | 'ambiguous-locks'
  | 'no-live-lock';

export interface ClaudeIdeBridgeStatus {
  enabled: boolean;
  port: number | null;
  workspaceFolders: string[];
  hasMatchingWorkspace: boolean;
  matchingWorkspaceLockCount: number;
  canUseIde: boolean;
  reason: ClaudeIdeBridgeLaunchReason;
}

/**
 * 判断是否为 HTTP/SSE 类型服务器
 */
export function isHttpMcpServer(server: McpServer): server is McpHttpServer {
  return server.transportType === 'http' || server.transportType === 'sse';
}

/**
 * 判断是否为 stdio 类型服务器
 */
export function isStdioMcpServer(server: McpServer): server is McpStdioServer {
  return server.transportType === 'stdio';
}
