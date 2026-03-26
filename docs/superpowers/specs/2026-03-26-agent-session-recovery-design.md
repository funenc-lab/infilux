# Agent 会话恢复设计

> 日期：2026-03-26  
> 项目：Infilux / EnsoAI  
> 范围：所有 Agent 会话在 APP 退出后可自动恢复，无需重新开启会话

---

## 1. 目标

为当前 APP 设计并落地一套 **Persistent Agent Session Recovery** 能力，使所有 Agent 会话在以下场景下具备一致恢复体验：

- APP 正常退出后再次启动
- APP 异常退出后再次启动
- Renderer 刷新/窗口重建后重新附加会话
- 工作区切换后恢复到原 worktree 的 Agent 会话

用户期望的最终效果：

1. APP 退出后，Agent 会话不因为窗口关闭而被销毁
2. APP 启动后，自动恢复原 worktree 下的 Agent 会话
3. 不要求用户重新创建会话或重新输入初始 prompt
4. 恢复失败时，系统能明确区分“可重连”“已死亡”“需要清理”三类状态

---

## 2. 非目标

本次设计不包含以下内容：

- 普通 Terminal 会话恢复
- 非 Agent 面板的 UI 状态恢复重构
- 多窗口协同恢复策略重写
- 云端同步或跨设备同步
- 对每个 Agent CLI 私有协议做深度适配

---

## 3. 当前现状与问题

### 3.1 已有基础

代码库已经具备部分恢复基础：

- Renderer 中 `agentSessions` store 会持久化会话元数据
- `Session` 模型已包含：
  - `sessionId`
  - `backendSessionId`
  - `initialized`
  - `activated`
- `useXterm` 已支持通过 `backendSessionId` attach 已存在的后端 session
- Main process 的 `SessionManager` 已实现：
  - create / attach / detach / kill
  - replay buffer
  - remote session reconnect / resume
- 代码库已存在 `tmux` 检测与清理能力
- Claude 已有局部 tmux 包装逻辑

### 3.2 关键缺口

当前“恢复”主要还是 UI 级恢复，而不是进程级恢复：

1. **本地 session 在最后一个窗口 detach 后会被销毁**  
   `SessionManager.detach()` 对 local session 会在 `attachedWindowIds.size === 0` 时直接 destroy

2. **tmux 只对 Claude 做了局部接入**  
   所有 Agent 没有统一的 persistent host 抽象

3. **恢复逻辑分散在 Renderer 与 AgentTerminal 内部**  
   缺少主进程层统一恢复编排

4. **会话持久化策略是 Agent-specific，而不是 capability-driven**  
   目前 store 中 `isResumableAgent()` 偏向 Claude

5. **APP 启动后没有统一的 Agent 会话 rehydrate/reconcile 流程**

因此，当前系统能做到“部分 UI 元数据保留”，但不能可靠做到“APP 退出后会话持续存在并自动恢复”。

---

## 4. 方案选择

### 方案 A：统一持久化宿主层（推荐）

引入统一的 **Session Host** 抽象：

- macOS / Linux：用 `tmux` 托管 Agent 进程
- Windows：用应用内 `supervisor` 托管 Agent 进程
- Renderer 只面向统一 session API，不感知具体宿主
- Main process 负责会话恢复编排与状态协调

### 方案 B：按 Agent 分别适配恢复

缺点是分支会快速失控，不利于维护。

### 方案 C：只恢复 UI，再自动重建进程

无法满足“无需重新开启会话”的核心目标，不采用。

**结论：采用方案 A。**

---

## 5. 核心设计

## 5.1 新增统一概念：Persistent Agent Session

新增一种明确的会话语义：

- 会话属于 Agent domain
- 会话进程由 host 层托管，不依赖 Electron window 生命周期
- Renderer 关闭、窗口关闭、APP 重启后，可重新 attach

该能力应与当前 `SessionDescriptor` / `SessionCreateOptions` 兼容扩展，而不是引入第二套平行模型。

---

## 5.2 模块划分

### Renderer

职责：

- 保存 UI 会话列表与 worktree 关联关系
- 在 APP 启动 / worktree 激活时触发恢复
- 将恢复后的 `backendSessionId` 重新绑定到对应 session tab
- 展示恢复状态、失败状态、冲突状态

不负责：

- 直接操作 tmux / supervisor
- 自己判断底层 session 是否仍存活

### Preload / IPC

职责：

- 暴露恢复相关 API
- 保持 payload 显式、可序列化、类型安全

### Main process

职责：

- 统一维护 persistent session registry
- 根据平台选择 host implementation
- 在启动期执行恢复编排
- 在 attach/detach/kill 时维护 registry 与 host 状态
- 负责 orphan session、stale metadata、host mismatch 的清理

### Host layer

统一抽象底层会话宿主：

- `TmuxSessionHost`
- `SupervisorSessionHost`

---

## 5.3 新增主进程服务

建议新增：

### `src/main/services/session/PersistentAgentSessionService.ts`

职责：

- 创建 persistent Agent session
- 加载与保存 registry
- 启动恢复流程
- 探测 host 中仍存在的 session
- 生成 renderer 可消费的恢复结果
- 清理无效记录

### `src/main/services/session/SessionHost.ts`

定义统一接口：

- `createPersistentSession()`
- `attachPersistentSession()`
- `detachPersistentSession()`
- `resumePersistentSession()`
- `killPersistentSession()`
- `probePersistentSession()`
- `listPersistentSessions()`

### `src/main/services/session/hosts/TmuxSessionHost.ts`

职责：

- 将 Agent 命令包装到 tmux session 中
- 按 session key attach / reattach
- 探测 tmux session 是否仍存活
- 统一 replay / runtime state 语义

### `src/main/services/session/hosts/SupervisorSessionHost.ts`

职责：

- 在 Windows 中维持后台 Agent 子进程生命周期
- 管理 stdio / PTY / replay buffer / attach count
- 实现与 tmux host 对齐的语义

---

## 5.4 持久化数据模型

建议在共享 session-state 中增加一块新的 Agent 恢复文档，而不是继续只依赖 renderer localStorage。

### 新增概念：`PersistentAgentSessionRecord`

建议字段：

- `uiSessionId`: Renderer SessionBar 中的 session id
- `backendSessionId`: unified session API 使用的后端 session id
- `providerSessionId`: 例如 Claude/Cursor CLI 的 provider-level session id
- `agentId`
- `agentCommand`
- `environment`
- `repoPath`
- `cwd`
- `displayName`
- `activated`
- `initialized`
- `hostKind`: `tmux | supervisor`
- `hostSessionKey`: 宿主层唯一标识
- `recoveryPolicy`: `auto | manual | metadata-only`
- `createdAt`
- `updatedAt`
- `lastKnownState`: `live | reconnecting | dead`
- `metadata`

### 存储位置

优先放入现有共享会话状态文件：

- local: `~/.infilux/session-state.json`
- remote helper: 远端对应共享状态路径

原因：

- 已有共享状态机制与原子写入能力
- 便于未来与 remote shared state 对齐
- 避免仅依赖 renderer localStorage 导致状态漂移

---

## 5.5 Agent Capability Policy

当前不应再用“是不是 Claude”来判断是否持久化，而应新增 capability policy。

建议新增 shared 类型：

- `supportsPersistentHost`
- `supportsProviderResume`
- `supportsDetachedRecovery`
- `defaultRecoveryPolicy`

用途：

1. 决定会话是否默认创建为 persistent
2. 决定恢复时是否可传 provider-level `--resume`
3. 决定 UI 是否显示“真正恢复”还是“仅重连宿主”

对用户来说，所有 Agent 都表现为“可恢复”；差异由底层 capability policy 吸收。

---

## 6. 生命周期设计

## 6.1 创建流程

当用户新建 Agent 会话时：

1. Renderer 创建 `Session` UI 记录
2. Renderer 调用统一 session create API，并声明 kind=`agent` 且 recovery=`persistent`
3. Main `PersistentAgentSessionService` 选择 host：
   - Unix -> tmux
   - Windows -> supervisor
4. Host 创建底层 persistent session
5. `SessionManager` 注册 unified `backendSessionId`
6. 持久化 `PersistentAgentSessionRecord`
7. 返回 descriptor + replay 给 renderer

---

## 6.2 Detach / APP 退出流程

APP 关闭时：

1. Renderer 正常退出，不主动 kill persistent Agent sessions
2. `SessionManager.detachWindowSessions(windowId)` 仅 detach，不 destroy persistent agent session
3. Host 持续托管底层进程
4. registry 记录仍保留，状态为可恢复

关键变化：

- **local persistent agent session 不再因最后一个 window detach 而自动 destroy**
- destroy 只能发生在：
  - 用户明确关闭 session
  - host 探测为已退出且不可恢复
  - 清理策略命中 stale session

---

## 6.3 APP 启动恢复流程

APP 启动后：

1. Main 读取共享 session state 中的 persistent agent records
2. 对每条记录执行 host probe
3. 形成三类结果：
   - `recoverable-live`
   - `recoverable-dead`
   - `missing-host-session`
4. 将恢复快照暴露给 renderer
5. Renderer 在 worktree 激活或 AgentPanel mount 时自动 reconcile：
   - 找到匹配的 UI session
   - 回填 `backendSessionId`
   - attach 并回放 replay
   - 若无 UI session，则自动创建一个恢复态 session tab
6. 成功后将状态更新为 `live`
7. 对失效记录展示“已结束”或自动清理

---

## 6.4 会话重新附加流程

当 `AgentTerminal` 拿到已恢复的 `backendSessionId`：

1. `useXterm` 优先 attach 现有后端 session
2. attach 成功则写入 replay
3. 若 attach 失败：
   - 若 registry 标记为 recoverable，则尝试主进程 resume/reconcile
   - 若确认 host session 已不存在，则标记 dead，避免无穷重建

---

## 7. IPC 设计

建议新增一组独立于基础 session IPC 的恢复接口，而不是把恢复编排塞进现有 create/attach。

### shared types / channels

建议新增：

- `AGENT_SESSION_RESTORE_WORKTREE`
- `AGENT_SESSION_LIST_RECOVERABLE`
- `AGENT_SESSION_RECONCILE`
- `AGENT_SESSION_ABANDON`
- `AGENT_SESSION_MARK_PERSISTENT`

### preload 暴露

建议挂到：

- `window.electronAPI.agentSession.restoreWorktreeSessions(...)`
- `window.electronAPI.agentSession.listRecoverableSessions(...)`
- `window.electronAPI.agentSession.reconcile(...)`
- `window.electronAPI.agentSession.abandon(...)`

这样可以保持 `session.*` 继续关注底层统一会话传输，而 `agentSession.*` 负责恢复编排。

---

## 8. Renderer 改造点

## 8.1 `agentSessions` store

现有问题：

- `isResumableAgent()` 直接以 command 前缀判断
- persistence 主要依赖 localStorage

改造方向：

1. 由 capability policy 决定哪些 Agent session 需要持久化
2. 在 store 中持久化更完整的恢复字段：
   - `backendSessionId`
   - `hostRecoveryState`
   - `restoreAttemptedAt`
   - `restoreSource`
3. 启动时增加 rehydrate/reconcile action
4. 不再将“是否可恢复”硬编码到 Claude 规则

## 8.2 `AgentPanel`

新增职责：

- mount 时对当前 worktree 执行 auto-restore
- 如果共享状态里有会话但 UI 中没有，自动补建 session tab
- 如果 UI 中有 session 但 host 中不存在，标记为 dead 并允许清理

## 8.3 `AgentTerminal`

移除或弱化当前仅面向 Claude 的 tmux 逻辑，使其变成 host-agnostic：

- terminal 不再自己决定是否包 tmux
- terminal 只消费恢复后的 backend session
- provider-level `--resume` 仍可作为创建时参数策略保留，但不再承担“宿主恢复”职责

---

## 9. Main / SessionManager 改造点

## 9.1 `SessionManager.detach()`

需要区分：

- 普通 local session
- persistent local agent session
- remote session

对于 persistent local agent session：

- 最后一个 window detach 后不 destroy
- session 继续保留在 registry 中
- 后续 attach 时可继续返回 replay 与 live state

## 9.2 `SessionManager.createLocal()`

需要支持创建为 persistent agent session，并把底层创建委托给 host 层。

## 9.3 replay buffer

恢复后的 attach 应保留现有 replay 语义，避免 UI 首屏空白。

---

## 10. 失败与异常处理

### 10.1 host session 丢失

场景：session-state 有记录，但 tmux/supervisor 中已经没有对应 session。

处理：

- 标记 `dead`
- UI 提示“会话已结束”
- 提供清理入口
- 不自动新建替代会话，避免假恢复

### 10.2 provider-level resume 失败

场景：Agent 进程仍活着，但 CLI 自己的 `--resume` 无法继续。

处理：

- 只要宿主层会话仍活着，仍视为恢复成功
- provider resume 仅用于新建/补建时优化上下文，不影响 attach 语义

### 10.3 tmux 不可用

处理：

- Unix 平台在创建 persistent agent session 前显式校验 tmux
- 给出清晰错误
- 不 silently fallback 到非持久模式，避免用户误判

### 10.4 Windows supervisor 异常

处理：

- 启动失败则本次会话创建失败
- 已记录但无法探测的 session 标记 reconnecting 或 dead
- 通过日志与 UI 提示明确暴露

---

## 11. 测试策略

### 单元测试

- `PersistentAgentSessionService`
- `SessionHost` capability selection
- registry read/write/migration
- restore reconcile logic
- attach/detach behavior split

### 集成测试

- APP 启动 -> 恢复 worktree sessions
- persistent agent detach 后不 destroy
- stale host session -> dead state
- renderer 根据恢复快照自动补建 session tab

### 回归测试重点

- 现有 terminal/session 流程不回归
- remote session reconnect 不受影响
- worktree 切换与 app close dirty flow 不受影响
- notification / status line / enhanced input 不因恢复而错绑 session

---

## 12. 扩展点

1. 后续扩展到普通 Terminal session
2. 后续支持 remote persistent agent session 与 local 统一模型
3. 后续增加“恢复策略”用户配置
4. 后续增加“恢复最近活跃会话”“恢复全部会话”的启动策略

---

## 13. 关键假设

1. macOS / Linux 环境允许依赖 `tmux`
2. Windows 允许实现应用内 `supervisor`
3. 所有 Agent 至少支持宿主层 attach/re-attach 的终端恢复语义
4. 本次恢复的真相来源是 **host probe + persisted registry**，不是 renderer localStorage
5. 不做假恢复：如果底层进程已死，则明确标记 dead，而不是自动伪造新会话

---

## 14. 最终结论

本次功能应以“统一持久化宿主层 + 主进程恢复编排 + renderer 自动 reconcile”为主线实现。

最重要的架构决策有三点：

1. **把 Agent 会话恢复从 Claude 特判升级为全 Agent 统一能力**
2. **把恢复从 UI 元数据恢复升级为进程级恢复**
3. **把恢复逻辑上收至 main process 编排，而不是散落在 terminal 组件中**

这是满足“APP 退出后会话可恢复且无需重新开启”的最小完整架构。
