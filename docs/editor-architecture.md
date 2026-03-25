# Editor Architecture

## 概览

Infilux 的 editor 子系统不是单一 Monaco 封装，而是一组围绕 **文件导航、worktree 隔离、dirty-state、外部修改检测、preview 分流** 组织起来的协作模块。

如果只看 `EditorArea.tsx`，会误以为“编辑器逻辑都在这里”；实际上 editor 能力跨越了：

- `components/files/`
- `stores/editor.ts`
- `stores/navigation.ts`
- `hooks/useEditor.ts`
- `hooks/useFileTree.ts`
- `App/hooks/useWorktreeSelection.ts`
- `App/hooks/useAppLifecycle.ts`
- `App/hooks/useTerminalNavigation.ts`

因此，editor 重构必须按“系统级链路”处理，而不是只替换某个组件。

---

## 目标与非目标

### 目标

- 让每个 worktree 拥有独立编辑上下文
- 支持从多个入口统一打开文件并聚焦到对应位置
- 在不丢失运行态的前提下切换主面板
- 处理本地文件与 remote virtual path
- 处理未保存内容、外部文件修改、预览模式与标签状态

### 非目标

- 不追求把所有逻辑收敛到一个组件
- 不要求文件树与编辑器必须绑定为单一视图
- 不假设每次切换面板都会卸载重建 editor

---

## 核心模块

### 1. Editor shell

核心文件：

- `src/renderer/components/files/EditorArea.tsx`

职责：

- 渲染 Monaco 编辑器
- 管理标签栏 UI
- 在 markdown / image / pdf 等模式下切换 preview
- 处理 breadcrumbs、blame、line comment、外部修改 banner
- 响应 `pendingCursor`
- 与当前 Agent session 协作，把文件或选中内容发送到会话

现实情况：

- 当前 `EditorArea.tsx` 责任偏重，是高复杂度热点
- 它已经不是单纯“Monaco wrapper”，而是 editor shell

### 2. Editor state store

核心文件：

- `src/renderer/stores/editor.ts`

职责：

- 当前 worktree 的 tabs
- `activeTabPath`
- `pendingCursor`
- `currentCursorLine`
- `worktreeStates`
- 外部修改冲突标记：
  - `markExternalChange`
  - `applyExternalChange`
  - `dismissExternalChange`

这是 editor 的主状态源，不能再平行发明第二套 durable editor state。

### 3. Navigation state

核心文件：

- `src/renderer/stores/navigation.ts`
- `src/renderer/App/hooks/useTerminalNavigation.ts`

职责：

- 承载一次性“打开文件并切到 file tab”的请求
- 把来自 terminal / diff / 其他跨模块入口的导航意图翻译为统一 editor 导航

边界：

- `navigation.ts` 是 transient bus
- 它不是 editor durable state

### 4. File tree model

核心文件：

- `src/renderer/hooks/useFileTree.ts`
- `src/renderer/components/files/FileTree.tsx`

职责：

- 根目录与子目录查询
- expanded paths 持久化
- 懒加载 children
- auto reveal
- 单子目录链自动展开
- create / rename / delete / refresh / drop / conflict continuation

边界：

- 文件树负责目录视图与展开状态
- 文件树不拥有 editor tabs

### 5. Panel containers

核心文件：

- `src/renderer/components/files/FilePanel.tsx`
- `src/renderer/components/files/CurrentFilePanel.tsx`

两者共同点：

- 都消费 `useEditor()`
- 都承载关闭标签、保存、全局搜索、窗口聚焦刷新等流程
- 都把核心编辑区委托给 `EditorArea`

差异：

- `FilePanel`
  - 包含 file tree
  - 管理 file tree 折叠、宽度、拖放、文件树相关操作
- `CurrentFilePanel`
  - editor-only 模式
  - 不承载 tree 相关复杂度

现实问题：

- 两个 panel 之间存在重复逻辑
- 未来重构宜先抽 shared editor shell / shared tab-close-save workflow，再决定是否合并容器层

---

## 视图装配关系

主链路如下：

```text
MainContent
  -> File tab
    -> CurrentFilePanel | FilePanel
      -> EditorArea
        -> EditorTabs
        -> Monaco / Preview / Breadcrumbs / Blame / External change UI
```

`MainContent.tsx` 中 File panel 默认 keep-mounted，这意味着：

- 切到 Terminal 再切回 File，不会销毁 editor 状态
- 隐藏的 editor 仍然保留已打开 tab、preview mode、Monaco view state

这也是为什么不能把“切 tab”理解为“重新初始化 editor”。

---

## 状态边界

### Editor store 负责什么

`stores/editor.ts` 负责：

- 打开/关闭 tab
- active file
- tab reorder
- view state
- pending cursor
- worktree 切换时的 tab state 保存与恢复
- 外部修改冲突状态

### Navigation store 负责什么

`stores/navigation.ts` 只负责：

- 某个模块发起一次“打开文件到某位置”的请求
- 请求被消费后清空

### File tree 负责什么

`useFileTree.ts` 负责：

- 展开路径
- 当前目录树 children 的缓存与恢复
- auto reveal

### 不应该做什么

禁止：

- 在 file tree 中保存 tab durable state
- 在 editor store 中复制 expanded tree state
- 为 terminal / search / diff / definition 新增各自独立的文件导航状态

---

## Worktree 隔离模型

editor 子系统最关键的设计之一是：**tab state 按 worktree 隔离**。

`stores/editor.ts` 中的核心模型：

```text
current worktree
  -> tabs
  -> activeTabPath

worktreeStates[worktreePath]
  -> tabs
  -> activeTabPath
```

`switchWorktree()` 的行为：

1. 保存当前 worktree 的 tabs 与 active tab
2. 切换 `currentWorktreePath`
3. 加载目标 worktree 已保存状态
4. 清空 `pendingCursor`
5. 清空当前 cursor line

这意味着：

- editor session 是 worktree-scoped
- 切换 worktree 不是“全局同一组 tab”

---

## 关键链路

### 1. 打开文件链路

典型链路：

```text
User action / terminal link / diff / search
  -> navigateToFile request
    -> useEditor() loads file
      -> editor store opens or activates tab
        -> EditorArea renders content
```

如果来自跨模块入口：

```text
External module
  -> navigation store pendingNavigation
    -> useTerminalNavigation consumes request
      -> setActiveTab('file')
      -> useEditor().navigateToFile(...)
```

设计价值：

- 让“打开文件”具备统一语义
- 避免 terminal、diff、search 分别直接操作不同 store

### 2. Worktree 切换链路

关键入口：

- `App/hooks/useWorktreeSelection.ts`

职责：

- 处理切换前未保存内容
- 保存当前 worktree 对应 tab
- 切换 active worktree
- 恢复目标 worktree 对应 tab
- 刷新 Git 数据
- 同步 editor 的 current worktree

这是 editor 与上层应用状态衔接的关键桥梁。

### 3. App close / dirty-state 链路

关键入口：

- `App/hooks/useAppLifecycle.ts`

职责：

- 收集当前与其他 worktree 中的 dirty tabs
- 响应 main process 发来的 close request
- 按需保存特定 dirty file
- 返回 close response

设计含义：

- dirty-state 不是只属于当前激活 tab
- 关闭应用时必须考虑所有 worktree editor states

### 4. 外部文件修改链路

核心状态位于 `stores/editor.ts`：

- `hasExternalChange`
- `externalContent`

基本流程：

```text
External file change detected
  -> editor store marks external change
    -> EditorArea shows banner
      -> user applies or dismisses external content
```

这里必须同时兼顾：

- 已打开 tab
- 是否 dirty
- 当前内容是否应被覆盖

### 5. Window focus refresh 链路

`FilePanel` 与 `CurrentFilePanel` 都会在窗口重新聚焦时刷新 active tab 内容。

目的：

- 类似轻量 IDE 的“回到窗口后重新检查文件”
- 在外部工具或其他进程修改文件时，尽早同步变化

---

## Preview 模型

当前 preview 分支主要集中在 `EditorArea.tsx`。

已知类型：

- Markdown
- Image
- PDF

行为特征：

- markdown 支持 `off / split / fullscreen`
- preview mode 可以被 `pendingCursor.previewMode` 驱动

当前问题：

- preview 扩展方式偏分支化
- 新 preview 类型继续堆叠会让 `EditorArea.tsx` 更重

建议方向：

- 未来改成 registry-based preview architecture
- 让“文件类型判断 -> preview renderer -> preview capability”成为可注册结构

---

## Dirty-state 模型

dirty-state 不只是“文本有变更”。

它影响：

- 关闭单个 tab
- 批量关闭 tab
- worktree 切换
- 应用关闭
- 外部修改冲突处理

当前策略：

- `autoSave === 'off'` 时，需要显式提示
- 保存成功后调用 `markFileSaved`
- 放弃保存时可能回读文件内容以回退 dirty 状态

这个模型与 `requestUnsavedChoice()` 强耦合，是 editor UX 的基础约束之一。

---

## Remote-aware editor 约束

editor 相关设计不能只按本地文件系统假设。

需要同时考虑：

- local path
- remote virtual path

受影响点：

- `navigateToFile`
- `file.read` / `file.write`
- preview 资源加载
- file tree list
- 外部变化检测
- source control root 的推导

一个简单经验法则：

> 任何 editor 重构，都要问“这段逻辑在 remote virtual path 下是否仍成立？”

---

## 当前问题与热点

### 热点 1：`EditorArea.tsx` 责任偏重

它同时承担：

- Monaco
- tabs
- preview
- breadcrumbs
- blame
- line comment
- external change banner
- 与 Agent session 的协作

这会提高修改风险。

### 热点 2：`FilePanel` / `CurrentFilePanel` 重复逻辑

重复区域包括：

- 关闭标签
- 未保存提示
- 保存流程
- 全局搜索
- 窗口聚焦刷新

### 热点 3：导航入口容易扩散

如果继续让 terminal、diff、search、definition 各自引入新状态入口，耦合会迅速放大。

### 热点 4：dirty-state 与 lifecycle 紧耦合

editor 重构如果只关注组件层，很容易破坏：

- worktree 切换
- app close
- external modification handling

---

## 推荐重构方向

### 1. 先抽 shared editor shell

不要先合并整个 FilePanel / CurrentFilePanel。

更稳妥的做法是先抽出：

- shared save/close workflow
- shared tab operation layer
- shared editor shell props contract

### 2. 统一导航语义

继续收敛到：

- `navigation store` 负责一次性意图
- `useEditor().navigateToFile()` 负责实际打开与定位

### 3. 让 preview 走注册式结构

避免继续在 `EditorArea.tsx` 中堆 `if/else`。

### 4. 保住三条生命线

任何 editor 重构开始前，都必须先保护：

1. worktree switch
2. app close with dirty tabs
3. external file modification handling

---

## 读代码建议

如果要理解 editor 子系统，建议按下面顺序阅读：

1. `src/renderer/stores/editor.ts`
2. `src/renderer/stores/navigation.ts`
3. `src/renderer/hooks/useEditor.ts`
4. `src/renderer/hooks/useFileTree.ts`
5. `src/renderer/App/hooks/useWorktreeSelection.ts`
6. `src/renderer/App/hooks/useAppLifecycle.ts`
7. `src/renderer/App/hooks/useTerminalNavigation.ts`
8. `src/renderer/components/layout/MainContent.tsx`
9. `src/renderer/components/files/FilePanel.tsx`
10. `src/renderer/components/files/CurrentFilePanel.tsx`
11. `src/renderer/components/files/EditorArea.tsx`

---

## 总结

Infilux 的 editor 不是“一个 Monaco 组件”，而是一个跨越：

- worktree state
- panel lifecycle
- file tree model
- one-shot navigation bus
- dirty-state orchestration
- external change handling
- preview routing

的复合系统。

因此，后续所有 editor 设计与重构，都应该优先维护 **边界清晰、导航统一、worktree 隔离、dirty-state 完整** 这四个核心特性。
