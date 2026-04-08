# Agent Worktree 平铺会话画布设计

> 日期：2026-04-08  
> 项目：Infilux / EnsoAI  
> 范围：为 Agent 面板增加可配置的 worktree 级平铺会话画布，在同一 worktree 中同时展示多个 Agent 会话

---

## 1. 目标

为当前 Agent 面板设计并落地一套新的会话展示模式，使用户可以通过全局配置在以下两种模式之间切换：

- `tabs`：保持现有 `SessionBar` 切换式单会话展示
- `worktree-tiled`：在当前 worktree 画布中自动网格平铺全部 Agent 会话

用户期望的最终效果：

1. 同一 worktree 下的多个 Agent 会话可以在画布中同时可见
2. 每个 tile 都保留与当前 Agent 面板等价的独立交互能力
3. 该能力可通过设置统一切换，不要求用户逐 worktree 配置
4. 回切旧模式后，现有分组、会话恢复和持久化行为保持兼容

---

## 2. 非目标

本次设计不包含以下内容：

- 跨 worktree 的全局平铺画布
- 跨 repository 的会话混排
- 新增 main process、preload 或 IPC 能力
- 重写 `agentSessions` store 的持久化模型
- 平铺 tile 的拖拽排序、手动缩放或自由布局
- 在平铺模式中继续暴露 `split / merge` 作为主交互

---

## 3. 当前现状与问题

### 3.1 当前已有能力

当前代码库已经具备构建该功能所需的大部分基础：

- `AgentPanel` 已支持 worktree 级 session 收集与渲染
- `agentSessions` store 已持久化：
  - `sessions`
  - `groupStates`
  - `runtimeStates`
  - `enhancedInputStates`
- `AgentPanel` 已具备：
  - group 分栏
  - session 激活状态
  - session 保活挂载
  - `split / merge / resize`
- `AgentTerminal` 已封装单个 Agent 会话的 runtime 视图与交互
- `EnhancedInputContainer` 与 `StatusLine` 已能围绕单个 session 工作

### 3.2 当前结构的限制

当前 Agent 画布的主要假设是：

1. **一个 group 在任意时刻只显示一个 active session**  
   非 active session 保持挂载但不可见，用户通过 `SessionBar` 切换。

2. **输入区和状态区是 group 级共享底栏**  
   `EnhancedInputContainer` 与 `StatusLine` 绑定的是当前 active session，而不是所有 session。

3. **group 既承担布局语义，也承担交互语义**  
   这导致“列布局单位”和“会话展示单位”耦合较重。

### 3.3 新需求带来的结构变化

用户希望的不是“当前激活 session 放大展示”，而是：

- 同一 worktree 中的多个 Agent 会话同时出现在画布上
- 每个会话仍像当前 Agent 一样独立可操作

这意味着：

- 画布展示单位将从“group 的 active session”切换为“worktree 下的全部 session”
- 共享底栏模型不再适用于平铺模式
- 现有 `group` 结构需要降级为兼容层，而不是继续作为新画布的主心智

---

## 4. 方案比较

### 方案 A：轻量渲染分支切换

做法：

- 保留现有 `AgentPanel` 结构
- 直接在现有 render 分支中加入 `worktree-tiled` 判断
- 在现有 JSX 中把“显示 active session”扩展为“显示全部 session”

优点：

- 改动表面看起来最小

缺点：

- `AgentPanel.tsx` 进一步膨胀
- group 级共享底栏与 tile 级独立交互的逻辑容易交错
- 后续继续扩展平铺能力时维护成本高

### 方案 B：worktree 画布分层重构（推荐）

做法：

- 保持现有 session store 和生命周期逻辑
- 将 `AgentPanel` 明确拆分为：
  - session / worktree 编排层
  - 画布布局渲染层
- 提供两种布局实现：
  - `tabs`
  - `worktree-tiled`

优点：

- 状态编排与展示布局分离
- 平铺模式可复用现有单 session 组件
- 后续增加 tile focus、density policy、pin 等能力时扩展点明确

缺点：

- 需要对当前 `AgentPanel` 做结构整理

### 方案 C：继续围绕 group 扩展

做法：

- 把 group 从“单 active session 可见”改为“同组多个 session 全部可见”
- 用 group 继续承载平铺画布

优点：

- 与现有 `split / merge` 结构表面接近

缺点：

- group 的领域语义会进一步混乱
- `split / merge / activeSessionId / shared footer` 假设都要被扭曲
- 后续维护风险最高

**结论：采用方案 B。**

---

## 5. 核心设计

### 5.1 新增全局展示模式

在 renderer settings schema 中新增全局配置：

- `agentSessionDisplayMode: 'tabs' | 'worktree-tiled'`

规则如下：

- `tabs`
  - 保留当前 `SessionBar` 切换体验
  - group 继续作为主要布局单位
- `worktree-tiled`
  - 当前 worktree 下的全部 session 直接参与网格布局
  - group 不再作为主展示单位

该设置是：

- 全局配置
- 持久化配置
- 不提供 worktree 级覆盖
- 不提供 group 级覆盖

---

### 5.2 状态 ownership 保持不变

本次不引入新的 session source of truth。

仍由 `useAgentSessionsStore` 负责：

- `sessions`
- `activeIds`
- `groupStates`
- `runtimeStates`
- `enhancedInputStates`
- `attachmentTrayStates`

这意味着：

- 平铺模式只是新的渲染与编排方式
- 不会引入第二套 tile store
- 不会破坏现有 session 恢复与持久化路径

建议新增的只是轻量 selector / helper，而不是新的持久化域模型。

---

### 5.3 `AgentPanel` 的新职责边界

改造后的 `AgentPanel` 应只承担 worktree 级 orchestration：

职责：

- 收集当前 `repoPath + cwd` 下的 sessions
- 读取 settings 与 store 状态
- 决定当前展示模式
- 将当前 worktree 的 session 数据分发给对应 canvas
- 维持 session 保活挂载、恢复、auto rollover 等已有逻辑

不再承担：

- 两种布局的所有细节渲染
- 所有 tile / footer 的直接 JSX 拼装

建议在 chat 目录新增显式布局层：

- `agentSessionDisplayMode.ts`
- `agentTileGridPolicy.ts`
- `WorktreeTiledSessionCanvas.tsx`
- `AgentSessionTile.tsx`

---

### 5.4 两种展示模式的行为定义

### 5.4.1 `tabs`

保持现有行为：

- 通过 `SessionBar` 切换当前 session
- terminal 区仅显示当前 group 的 active session
- `EnhancedInputContainer` 和 `StatusLine` 继续作为 group 级共享底栏
- `split / merge / resize` 保持可用

### 5.4.2 `worktree-tiled`

新行为：

- 当前 worktree 下的全部 sessions 同时参与布局
- 不再依赖 `SessionBar` 作为主要切换入口
- 每个 tile 都拥有自己的：
  - 标题区
  - `AgentTerminal`
  - `EnhancedInputContainer`
  - `StatusLine`
- 用户可在同一画布中并行观察和操作多个 Agent 会话

该模式下的激活语义：

- 不再以“只有一个可见 active session”为前提
- 仍允许保留“最近交互 session”概念，用于键盘焦点和 store 对齐
- 但激活不再决定会话是否被渲染

---

### 5.5 平铺模式中的 `group` 兼容策略

本次不删除 `groupStates`，而是将其降级为兼容层。

在 `worktree-tiled` 模式中：

- 当前画布以“worktree 全部 sessions”为数据源
- 不以 `activeGroupId` 或 `group.activeSessionId` 决定可见性
- `split / merge` UI 入口隐藏或禁用
- 不对 `groupStates` 做破坏性迁移

回切到 `tabs` 模式时：

- 仍继续使用现有 `groupStates`
- 之前的分栏、分组顺序与 active session 关系继续有效

这样可以保证：

- 新模式不破坏旧数据
- 旧模式无需重建用户历史布局

---

### 5.6 平铺 tile 的模块边界

建议新增 `AgentSessionTile.tsx`，作为平铺模式下的单会话容器。

职责：

- 展示单个 session 的标题与状态
- 渲染 `AgentTerminal`
- 为该 session 单独挂接 `EnhancedInputContainer`
- 为该 session 单独挂接 `StatusLine`
- 承担 tile 级可聚焦、可交互容器语义

不负责：

- session 列表收集
- 全局模式判断
- worktree 级布局计算

该组件应尽量复用已有能力，而不是复制当前 `AgentPanel` 中的 runtime 逻辑。

---

### 5.7 自动网格布局策略

平铺模式第一版采用自动网格，而不是自由布局。

建议默认规则：

- 1 个 session：单列全宽
- 2 个 session：2 列
- 3 到 4 个 session：2 列自动换行
- 5 个及以上：3 列自动网格

该规则应抽为独立 policy，例如：

- `agentTileGridPolicy.ts`

原因：

- 布局规则未来很可能继续调整
- 不应把列数、间距、断点逻辑硬编码在 JSX 中

---

### 5.8 输入区与状态区策略

平铺模式下，每个 tile 都必须保留独立输入能力。

这意味着：

- `EnhancedInputContainer` 从“group 级共享底栏”切换为“tile 级底栏”
- `StatusLine` 也随 tile 单独渲染
- `enhancedInputStates` 继续按 `sessionId` 存储，不需要新的状态模型

这一点是平铺模式能否满足需求的关键：

- 用户不只是查看多个 session
- 用户需要像当前 Agent 一样直接分别操作多个 session

---

### 5.9 session 顺序策略

平铺模式第一版不引入新的 tile 排序状态。

排序规则建议优先沿用现有 `displayOrder`：

- 当前 worktree 下的 sessions 按 `displayOrder` 升序排列
- 当 `displayOrder` 缺失时，按当前现有回退逻辑处理

原因：

- 降低状态模型复杂度
- 让 `tabs` 与 `worktree-tiled` 的 session 顺序尽量一致
- 为未来引入 tile reorder 留出兼容空间

---

## 6. 设置与持久化设计

### 6.1 设置 schema 变更

需要同步更新：

- `src/renderer/stores/settings/types.ts`
- `src/renderer/stores/settings/defaults.ts`
- `src/renderer/stores/settings/index.ts`
- `src/renderer/stores/settings/migration.ts`

新增内容：

- `AgentSessionDisplayMode`
- `agentSessionDisplayMode`
- `setAgentSessionDisplayMode(...)`

迁移策略：

- 旧版本配置没有该字段时，默认回退到 `tabs`
- 不需要对历史 group state 做数据迁移

### 6.2 设置 UI 入口

该设置建议放在 `Agent` 分类，而不是 `Input` 分类。

原因：

- 这是 Agent 会话画布的展示策略
- 不是 fallback composer、粘贴、输入桥接等输入能力配置

建议在 `src/renderer/components/settings/AgentSettings.tsx` 增加独立区块，例如：

- `Session Canvas`

提供两个选项：

- `Tabs`
- `Worktree Tiled`

文案目标：

- 明确说明 `Tabs` 保留当前切换式会话体验
- 明确说明 `Worktree Tiled` 会在当前 worktree 中同时显示全部 Agent 会话

---

## 7. 文件结构建议

建议本次实现以最小但清晰的模块边界落地。

### 修改

- `src/renderer/stores/settings/types.ts`
- `src/renderer/stores/settings/defaults.ts`
- `src/renderer/stores/settings/index.ts`
- `src/renderer/stores/settings/migration.ts`
- `src/renderer/components/settings/AgentSettings.tsx`
- `src/renderer/components/chat/AgentPanel.tsx`

### 新增

- `src/renderer/components/chat/agentSessionDisplayMode.ts`
- `src/renderer/components/chat/agentTileGridPolicy.ts`
- `src/renderer/components/chat/WorktreeTiledSessionCanvas.tsx`
- `src/renderer/components/chat/AgentSessionTile.tsx`

必要时可补充：

- `src/renderer/components/chat/agentSessionTileModel.ts`

前提是 tile 标题、交互态、展示态衍生逻辑开始膨胀，才值得单独抽取。

---

## 8. 测试策略

### 8.1 settings store

需要补充以下测试覆盖：

- 默认值测试
- migration 测试
- setter 测试

重点验证：

- 新字段缺省时回退为 `tabs`
- 设置可被正确持久化与恢复
- 不影响现有其他 settings 字段

### 8.2 settings UI

需要为 `AgentSettings` 增加交互测试，验证：

- 模式选项可见
- 当前选中项与 store 一致
- 点击后可正确写入 store

### 8.3 chat 渲染层

需要增加 `AgentPanel` / tiled canvas 的 renderer 测试，验证：

1. `tabs` 模式仍只渲染当前 active session
2. `worktree-tiled` 模式会渲染当前 worktree 下全部 sessions
3. 每个 tile 都拥有自己的输入区与状态区
4. tiled 模式下不渲染 `split / merge` 控件
5. 切回 `tabs` 后，旧的 group 结构仍能正常工作

### 8.4 回归重点

高风险回归点包括：

- session 持久化恢复
- session 保活挂载
- auto session rollover
- enhanced input open state
- 当前 worktree 切换时的可见性与上下文绑定

---

## 9. 扩展点

本次设计明确保留以下扩展点，但不在本轮实现：

- tile 拖拽排序
- tile 尺寸密度切换
- 某个 tile 聚焦放大
- 平铺模式下的筛选与搜索
- 仅展示“活跃会话”的轻量模式

这些能力都应在现有架构上扩展，而不是反向侵入 `agentSessions` store 基础模型。

---

## 10. 假设与约束

本次设计基于以下假设：

1. 平铺范围仅限当前 worktree
2. 这是全局设置，不提供局部覆盖
3. 第一版不做 tile 自由布局
4. 第一版不引入新的 IPC 或主进程逻辑
5. 第一版优先保证兼容与稳定，而不是一次性做完整工作台能力

同时应遵守当前 renderer 边界：

- 不新增并行 session 状态源
- 不把 Electron / Node 能力直接带入 renderer 组件
- 不破坏现有 keep-mounted 语义

---

## 11. 实施建议

建议按以下顺序实施：

1. 先补 settings schema、defaults、migration 与 `AgentSettings` UI
2. 将 `AgentPanel` 的模式分发逻辑抽离出来
3. 新增 `WorktreeTiledSessionCanvas` 与 `AgentSessionTile`
4. 将平铺模式接入现有 session runtime 逻辑
5. 补齐 renderer 与 settings 测试
6. 最后做 `tabs` 模式回归与兼容验证

这样可以把风险拆成：

- 设置变更
- 画布分层
- 平铺渲染
- 回归验证

而不是一次性在 `AgentPanel` 中混合修改。

---

## 12. 结论

这次需求的本质不是“把当前隐藏的 session 显示出来”，而是：

- 为 Agent worktree 画布增加第二种正式布局模式

推荐最终落地方案为：

- 新增全局设置 `agentSessionDisplayMode`
- 设置入口放在 `AgentSettings`
- `AgentPanel` 保持为 orchestration 层
- `tabs` 模式完全保留现有体验
- `worktree-tiled` 模式下，当前 worktree 的全部 sessions 自动网格平铺
- 每个 tile 保留独立 terminal、input、status
- `groupStates` 作为兼容层保留，供旧模式继续使用

该方案可以在不改动主进程与 session 基础模型的前提下，为 Agent 面板提供可维护、可扩展的多会话画布能力。
