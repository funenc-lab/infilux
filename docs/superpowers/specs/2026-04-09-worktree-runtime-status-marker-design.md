# Worktree 运行状态圆点位置调整设计

## 背景

当前 `worktree` 行里的运行状态小圆点显示在标题右侧。这个位置会与标题文本争抢视觉重心，也不利于在侧边栏进行纵向扫描。

用户确认采用新的布局方向：

- 仅调整小圆点位置
- 小圆点语义仍然表示 `worktree` 的运行状态
- 不改颜色、大小、状态映射
- 不改选中态、图标、diff/sync、文案与交互

## 目标

将运行状态小圆点从标题右侧移动到 `worktree` 行左侧，并在侧边栏内形成稳定的纵向对齐。

## 非目标

- 不引入新的线条、胶囊、动画或文字标签
- 不调整当前选中 `worktree` 的高亮方式
- 不扩散到 repository 行
- 不修改临时工作区或其他列表项，除非当前实现复用同一个 `worktree` 行组件

## 设计

### 结构

在 `WorktreeTreeItem` 与 `WorktreeItem` 的行结构中，为运行状态点提供一个固定的左侧状态位。状态位位于 `worktree` 行的内容区左边、branch glyph 左边，但仍处于行内布局中，不外溢到组件外侧。

标题行中的 `WorktreeActivityMarker` 移除，避免状态信号继续与标题文本混排。

### 样式

保留现有 `WorktreeActivityMarker` 的颜色语义：

- `running`
- `waiting_input`
- `completed`

圆点尺寸不变，仅通过共享样式控制其左侧状态位宽度、垂直居中和对齐。

为避免不同 `worktree` 行出现左右抖动：

- 所有 `worktree` 行都保留相同宽度的状态位
- `idle` 状态不显示彩色圆点，但保留占位

### 影响范围

代码变更应限制在以下范围：

- `src/renderer/components/layout/WorktreeActivityMarker.tsx`
- `src/renderer/components/layout/tree-sidebar/WorktreeTreeItem.tsx`
- `src/renderer/components/layout/worktree-panel/WorktreeItem.tsx`
- `src/renderer/styles/globals.css`
- 相关布局与策略测试

## 扩展点

如果未来希望把运行状态点升级为更强的结构化状态标记，例如短竖条、双点或弱动画，应继续通过 `WorktreeActivityMarker` 和共享样式层扩展，而不是在两个 `worktree` 组件中分别定制。

## 假设

- 用户所说的“状态小圆点”仅指 `worktree` 运行状态点
- 本次只需要最小视觉调整，不需要改动状态来源或状态判断逻辑
- 当前侧边栏与面板中的 `worktree` 行应保持一致的状态点布局

## 验证

至少补充或更新以下验证：

- 布局策略测试，约束状态点不再出现在标题右侧
- 组件结构测试，约束状态点出现在左侧状态位
- 现有 `worktree` 状态点测试继续通过
