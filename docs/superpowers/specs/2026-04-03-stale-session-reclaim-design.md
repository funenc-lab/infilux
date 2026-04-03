# Stale Session Reclaim 设计

> 日期：2026-04-03  
> 项目：Infilux / EnsoAI  
> 范围：将 Resource Manager 中的 bulk reclaim 从“回收空闲会话”改为“仅清理底层已失效的 stale 会话”

---

## 1. 目标

为当前 Resource Manager 的 bulk reclaim 建立一条更安全、更准确的回收语义：

1. 只要底层会话仍然存活，就绝不因 bulk reclaim 被关闭
2. 仅当主进程仍保留 session 记录，但底层进程或 host session 已不存在时，才允许 bulk reclaim 清理
3. 该保护同时适用于 `agent` 与普通 `terminal`
4. Renderer 不再自行猜测“是否可回收”，而是消费主进程明确计算好的结果

用户期望的最终效果：

- 活着但暂时空闲的会话不会被 bulk reclaim 误杀
- 失效记录仍然可以被用户一键清理
- Resource Manager 的文案与实际行为保持一致

---

## 2. 非目标

本次设计不包含以下内容：

- 修改单个 `Kill Session` 的行为
- 修改窗口关闭、组件卸载、App 退出时的 session 清理链路
- 为 remote session 补全 host-level 存活探针
- 为普通 Terminal 增加跨 App 重启恢复能力
- 新增独立的 session 生命周期 UI 面板

---

## 3. 当前现状与问题

### 3.1 现有 bulk reclaim 的判定逻辑

当前主进程在 `AppResourceManager` 中使用如下规则判定“可回收”：

- `session.backend === 'local'`
- `processInfo?.isActive === false`

这意味着 bulk reclaim 的实际语义是：

- 回收“本地且当前不活跃”的会话

而不是：

- 回收“底层已经不存在的 stale 会话”

### 3.2 当前实现的结构性问题

1. **把“空闲”和“已失效”混在了一起**  
   `isActive === false` 只能表示近期无活动，不能表示底层进程已经消失。

2. **`AppResourceManager` 直接依赖 `localPtyManager`**  
   当前实现直接使用 `sessionManager.localPtyManager.getProcessInfo(...)`，导致 app service 层知道过多 terminal 细节。

3. **renderer 自行推导 bulk action 数量**  
   当前 Resource Manager model 通过 `backend === 'local' && isActive === false` 统计“可回收数量”，这让 UI 和主进程业务规则耦合。

4. **现有文案误导用户**  
   `Reclaim Idle Sessions` 暗示“空闲但仍活着的会话”会被安全回收，但这与用户对持久会话的预期冲突。

### 3.3 风险

在当前实现下，只要某个本地会话暂时没有活动输出，就可能进入 bulk reclaim 的候选范围。  
对于仍然存活、只是暂时空闲的会话，这是错误语义。

---

## 4. 方案比较

### 方案 A：将 bulk reclaim 改为 stale-only reclaim（推荐）

核心思路：

- 主进程统一计算每个 session 的 `isAlive` 与 `reclaimable`
- bulk reclaim 仅对 `isAlive === false` 的会话执行
- UI 只消费主进程结果，不再自行推导
- bulk action 与文案整体从 `idle` 改为 `stale`

优点：

- 语义正确
- 能保护所有仍然存活的本地会话
- 主进程与 renderer 的职责边界更清晰
- 后续扩展到 remote session 时结构可复用

缺点：

- 需要修改共享类型、主进程判定逻辑与 UI 文案

### 方案 B：保留 idle UI，仅在执行 action 时二次跳过活会话

优点：

- 改动较小

缺点：

- UI 仍然误导
- 用户会看到“可回收”，执行后却没有清理
- 规则分散在展示和执行两个阶段，维护成本高

### 方案 C：移除 bulk reclaim session 能力

优点：

- 风险最低

缺点：

- 功能退化
- 不能满足“保留一键清理 stale 会话”的需求

**结论：采用方案 A。**

---

## 5. 核心设计

### 5.1 语义调整

本次设计把 bulk reclaim 的领域语义从：

- `idle local session reclaim`

改为：

- `stale session reclaim`

新定义如下：

- **alive session**：底层进程或 host session 仍然存在
- **stale session**：主进程 session 记录仍在，但底层进程或 host session 已不存在
- **reclaimable session**：明确判定为 stale 的 session

规则固定为：

- `isAlive === true` -> 不可回收
- `isAlive === false` -> 可回收
- `isAlive === null` -> 默认不可回收

其中 `null` 表示当前后端或探针能力无法可靠判断，为了避免误杀，按保护态处理。

---

### 5.2 主进程边界调整

### 5.2.1 `SessionManager` 成为统一会话探针入口

建议在主进程新增统一能力：

- `getSessionRuntimeInfo(sessionId)`

返回统一结构：

- `pid: number | null`
- `isActive: boolean | null`
- `isAlive: boolean | null`

这样 `SessionManager` 继续拥有 session 生命周期与后端分发职责，而 app service 只消费稳定结果。

### 5.2.2 `AppResourceManager` 不再直接访问 `localPtyManager`

当前 app service 直接依赖 terminal 实现细节，这会造成层级耦合。  
改造后：

- `AppResourceManager` 只依赖 `SessionManager` 暴露的统一 runtime info
- 不再知道 PTY / supervisor 的探针细节

这符合现有目录边界：

- session 服务拥有会话生命周期与后端协调
- app service 只负责聚合资源快照与执行 app 级动作

---

### 5.3 各后端的 `isAlive` 口径

### 5.3.1 本地 PTY

在现有 `PtyManager.getProcessInfo(...)` 基础上扩展：

- `pid`：继续使用现有 PTY pid
- `isActive`：继续使用现有活动检测结果
- `isAlive`：新增“该 pid 是否仍存在”的 best-effort 探针

这里的 `isAlive` 与 `isActive` 必须严格区分：

- `isActive` 表示近期是否有进程活动
- `isAlive` 表示底层进程是否仍然存在

### 5.3.2 Windows supervisor

复用现有 `LocalSupervisorRuntime` 能力：

- `hasSession(sessionId)` -> `isAlive`
- `getSessionActivity(sessionId)` -> `isActive`

这意味着 Windows persistent agent session 可以纳入同一套 reclaim 判定，而不需要在 app service 中分支特判。

### 5.3.3 Remote session

本轮不将 remote session 纳入 bulk reclaim。

统一策略：

- `isAlive = null`
- `reclaimable = false`

原因：

- 目前 remote helper 仅提供活动检测，不提供统一 host-level 存活探针
- 在没有可靠探针前，不应允许 bulk reclaim 自动清理 remote session

---

### 5.4 共享类型调整

建议扩展 `AppSessionResource`：

- 保留 `isActive: boolean | null`
- 新增 `isAlive: boolean | null`
- 新增 `reclaimable: boolean`

这样 renderer 可以同时显示“活动状态”和“是否可回收”，但真正的业务判定只依赖 `reclaimable`。

同时建议更新 action 语义：

- `reclaim-idle-sessions` -> `reclaim-stale-sessions`

对应的 resource id 也同步改名，以避免旧命名继续误导后续维护者。

---

### 5.5 Resource Manager UI 行为

renderer 不再根据 `backend` 与 `isActive` 推导可回收数量，而是改为直接统计：

- `resource.kind === 'session'`
- `resource.reclaimable === true`

文案同步调整：

- `Reclaim Idle Sessions` -> `Reclaim Stale Sessions`
- `No idle local sessions are ready to reclaim.` -> `No stale sessions are ready to reclaim.`
- `1 idle local session can be reclaimed.` -> `1 stale session can be reclaimed.`
- `This will terminate idle local sessions attached to the current app window.`  
  -> `This will remove stale session records whose underlying runtime is no longer alive.`

注意：这里的动作文案应该明确说明“清理 stale 记录”，而不是继续使用“terminate idle session”一类会让人误解为杀活进程的表述。

---

## 6. 模块划分

### `src/main/services/session/SessionManager.ts`

职责：

- 作为统一 session runtime info 的查询入口
- 按 session backend / local runtime 分派到 PTY、supervisor 或 remote 路径

不负责：

- 生成 UI 文案
- 直接构建 Resource Manager 视图模型

### `src/main/services/terminal/PtyManager.ts`

职责：

- 保留现有活动检测
- 新增本地 PTY 的进程存活探针

不负责：

- 定义 bulk reclaim 业务语义

### `src/main/services/app/AppResourceManager.ts`

职责：

- 聚合 session runtime info
- 计算 `reclaimable`
- 执行 stale-only bulk reclaim

不负责：

- 直接读取 terminal 内部状态
- 自己实现底层 host 存活检测

### `src/shared/types/app.ts`

职责：

- 定义 renderer / preload / main 共享的 resource snapshot 契约

### `src/renderer/components/layout/appResourceManagerModel.ts`

职责：

- 基于共享契约构建 UI 展示模型
- 只消费 `reclaimable`

不负责：

- 自行推导 session 是否可回收

---

## 7. 错误处理与保护策略

为了避免误杀活会话，本次设计遵循“未知即保护”原则：

1. 探针异常 -> `isAlive = null` -> 不可回收
2. remote session 当前无可靠 host probe -> 不可回收
3. session 记录缺失或已被其它路径清理 -> bulk reclaim 忽略并继续
4. bulk reclaim 执行中单条 kill 失败 -> 记录 warning，继续处理其它候选

这保证 bulk reclaim 从“有风险的主动清理”变成“保守的 stale 清理”。

---

## 8. 测试策略

### 8.1 主进程行为测试

在 `AppResourceManager` 层覆盖：

- `isActive = false` 且 `isAlive = true` 时不可回收
- `isAlive = false` 时可回收
- `isAlive = null` 时不可回收
- remote session 不可回收
- bulk action 返回的 `reclaimedCount` 只统计 stale session

### 8.2 会话探针测试

在 `SessionManager` / `PtyManager` 层覆盖：

- 本地 PTY pid 存在时 `isAlive = true`
- 本地 PTY pid 不存在时 `isAlive = false`
- supervisor `hasSession()` 为真时 `isAlive = true`
- supervisor `hasSession()` 为假时 `isAlive = false`
- 探针异常时返回保护态而不是误判为 false

### 8.3 Renderer model 测试

在 Resource Manager model 层覆盖：

- bulk action 描述基于 `reclaimable` 统计
- 没有 stale session 时按钮禁用
- 确认文案与 stale 语义一致

---

## 9. 风险与兼容性

### 9.1 兼容性影响

此次修改会改变 Resource Manager 的用户认知：

- 过去“看起来空闲”的本地会话可能被列为可回收
- 现在只有 stale session 才会出现在可回收计数中

这是预期变化，不应视为回归。

### 9.2 实现风险

1. **本地 pid 存活探针的跨平台差异**
   - 需要保证实现方式在 macOS / Linux / Windows 上都是 best-effort 且无副作用

2. **旧测试仍然以 idle 语义断言**
   - 需要整体同步 action kind、描述文案与快照字段

3. **命名迁移不完整**
   - 若 action kind 仍保留 `idle` 命名，会让后续实现继续混淆“空闲”和“失效”

---

## 10. 扩展点

1. 后续为 remote helper 增加 `session:has` 或等价 host probe，将 remote session 纳入统一 reclaim 模型
2. 后续在 Resource Manager 中同时展示：
   - 是否活跃
   - 是否存活
   - 是否可回收
3. 后续可以增加 `reclaimReason` 字段，用于区分：
   - `missing-process`
   - `missing-host-session`
   - `dead-runtime`

---

## 11. 关键假设

1. bulk reclaim 的目标是“清理 stale 记录”，不是“主动结束空闲会话”
2. 对用户而言，保护活会话比清理残留记录更重要
3. 在没有可靠存活探针的后端上，默认不允许 bulk reclaim 处理该会话
4. 现阶段只改 bulk reclaim，一次只解决一个行为面，避免把窗口关闭、App 退出、显式 kill 等路径一起卷入

---

## 12. 结论

本次设计将 Resource Manager 的 bulk reclaim 从“按空闲状态回收”改为“按底层是否仍然存在回收”。  
核心收益是：

- 活着的会话不再被 bulk reclaim 误伤
- 主进程对可回收性拥有唯一可信判定
- renderer 不再重复推导业务规则
- 未来扩展到 remote session 时可以沿用同一套结构

这是一次语义纠偏，而不是功能扩张。  
它会让 reclaim 行为更保守，但也更符合持久会话与多宿主架构的真实预期。
