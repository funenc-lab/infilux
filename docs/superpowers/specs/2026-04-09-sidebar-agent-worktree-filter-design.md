# Sidebar Agent Worktree Filter 设计

> 日期：2026-04-09  
> 项目：Infilux / EnsoAI  
> 范围：在 Tree Sidebar 增加一个按钮筛选，只显示存在 Agent 会话的 worktree，并覆盖 Temp Sessions

---

## 1. 目标

为当前 `TreeSidebar` 增加一个显式按钮筛选，让用户可以快速聚焦到“有 Agent 的 worktree”。

用户确认后的目标行为：

1. 点击按钮后，侧边栏仍保持 `repository -> worktree` 层级
2. 只显示 `agentCount > 0` 的 worktree
3. 没有匹配 worktree 的 repository 直接隐藏
4. `Temp Sessions` 也参与同一套过滤，仅显示存在 Agent 的项
5. 该筛选可与当前文本搜索叠加使用

---

## 2. 非目标

本次不做以下内容：

- 不修改 `RepositorySidebar`
- 不新增全局设置或持久化该筛选状态
- 不把 terminal activity 视为匹配条件
- 不新增 main / preload / IPC
- 不改变 worktree activity 的 store ownership

---

## 3. 当前现状

当前 `TreeSidebar` 已有两类相关能力：

1. 文本搜索与 `:active` 过滤  
   当前可以按 repo / worktree 文本检索，也可以通过 `:active` 过滤所有存在 runtime activity 的项。

2. worktree 级 activity 数据  
   `useWorktreeActivityStore` 已按 worktree path 维护：
   - `agentCount`
   - `terminalCount`
   - `activityStates`

当前问题在于：

- `:active` 的语义过宽，会把 terminal activity 也算进去
- 过滤入口是搜索语法，不是可见按钮
- 需求希望聚焦“有 Agent 的 worktree”，而不是“任意活跃项”

---

## 4. 方案比较

### 方案 A：复用搜索语法，新增 `:agent`

优点：

- 代码改动最小

缺点：

- 不符合“点击按钮”的需求
- 可发现性差

### 方案 B：在 TreeSidebar 增加本地按钮筛选（推荐）

优点：

- 交互直接
- 改动集中在 renderer layout 层
- 不需要改变 store 归属

缺点：

- 增加一个局部 UI 状态

### 方案 C：做成全局设置

优点：

- 可跨会话保留

缺点：

- 超出当前需求
- 会引入额外设置和迁移成本

**结论：采用方案 B。**

---

## 5. 核心设计

### 5.1 新增本地筛选状态

在 `TreeSidebar.tsx` 中新增一个 renderer-local 布尔状态，例如：

- `showAgentWorktreesOnly`

该状态只负责控制当前 Tree Sidebar 的显示，不持久化、不写入 settings store。

---

### 5.2 匹配语义

worktree 是否匹配的标准为：

- `activities[path].agentCount > 0`

说明：

- `terminalCount > 0` 不算匹配
- `activityStates.running / waiting_input / completed` 也不单独作为匹配来源
- 统一以当前已有的 `agentCount` 作为“该 worktree 有 Agent 会话”的判定

这样可以避免把“终端活跃但没有 Agent”的 worktree 带进结果。

---

### 5.3 过滤层级

按钮开启后，过滤顺序如下：

1. 先判断 repo 下是否至少存在一个 `agentCount > 0` 的 worktree
2. 若没有，隐藏整个 repo
3. 若有，仅在该 repo 展示匹配的 worktree
4. `Temp Sessions` 用相同规则，仅显示有 Agent 的项
5. 若再叠加文本搜索，则在 Agent 过滤结果基础上继续按文本过滤

---

### 5.4 worktree 预取

当前 `TreeSidebar` 在 `:active` 过滤时会预取各 repo 的 worktree 数据，以便在 repo 未展开时也能判断是否命中。

按钮筛选同样需要这一能力，否则无法判断未展开 repo 是否含有 Agent worktree。

因此本次会复用现有 `sidebarWorktreePrefetchPolicy.ts`，让“按钮筛选开启”也触发相同的 worktree 预取路径。

---

## 6. 影响文件

- `src/renderer/components/layout/TreeSidebar.tsx`
  - 增加按钮
  - 组合按钮筛选与现有文本过滤
  - 扩展 temp / repo / worktree 过滤条件
  - 让按钮筛选也触发 worktree 预取

- `src/renderer/components/layout/__tests__/treeSidebarAgentFilter.test.tsx`
  - 覆盖按钮交互与筛选结果

如有必要：

- `src/renderer/components/layout/__tests__/sidebarWorktreePrefetchPolicy.test.ts`
  - 补充 worktree 预取断言

---

## 7. 测试策略

遵循 TDD：

1. 先写失败测试
2. 验证按钮默认关闭时不过滤
3. 验证按钮开启后：
   - 仅保留有 Agent 的 repo
   - repo 下仅保留有 Agent 的 worktree
   - Temp Sessions 仅保留有 Agent 的项
4. 验证开启按钮后会触发 worktree 预取输入

---

## 8. 假设

本次实现按以下假设落地：

1. “有 Agent 的 worktree” 等价于 `agentCount > 0`
2. 不需要把该筛选同步到 `RepositorySidebar`
3. 不需要持久化按钮状态

