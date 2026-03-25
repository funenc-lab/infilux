# 性能与稳定性治理计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

## 目标

- 降低多终端、多面板场景下的无效监听、无效渲染和内存占用
- 为 renderer 崩溃、白屏、批量文件刷新等高频故障提供止血机制
- 在不重构核心架构的前提下，优先修复最容易造成卡顿、崩溃和白屏的问题

## 问题摘要

1. renderer 缺少全局兜底，异常容易直接表现为空白页。
2. main 进程没有对 renderer crash、load fail、unresponsive 做统一恢复。
3. bulk 文件刷新会触发打开标签的全量重读，容易引发卡顿和主线程阻塞。
4. `useXterm` 每个实例都会注册一套全局 session IPC 监听，终端多开后事件分发和回调成本线性放大。
5. `MainContent` 把多个非关键面板长期 keep-mounted，隐藏状态下仍持续占用内存和渲染资源。
6. `monacoSetup` 在模块顶层执行重初始化，容易把首屏渲染和文件页进入过程拖成卡顿甚至白屏。
7. `FilePanel` / `CurrentFilePanel` 同步引用 `EditorArea`，会让 Monaco 编辑器代码提前进入主渲染路径。
8. `SourceControlPanel` 同步引用 `DiffViewer` / `CommitDiffViewer`，会让 diff 运行时在未查看 diff 时也提前进入渲染路径。
9. `MainContent` 仍静态导入 `SourceControlPanel`、`SettingsContent`、`TodoPanel`、`DiffReviewModal`，会继续把非激活重量级面板提前拉进主路径。
10. `MainContent` 仍静态导入 `AgentPanel`，会把整条 chat 会话装配链提前放进首屏模块图。
11. `MainContent` 仍静态导入 `TerminalPanel`，会把 xterm 相关终端装配提前带入首屏加载路径。
12. 当前缺少运行期内存采样证据，无法用数据判断“内存是否持续上涨、崩溃前是否逼近高位”。
13. `MainContent` 仍静态导入 `FilePanel` / `CurrentFilePanel`，会让文件页外壳、文件树与搜索对话装配提前进入首屏模块图。
14. 真实运行日志显示，面包屑文件树在“当前文件不属于当前 rootPath”时会把绝对路径错误拼接成 `rootPath + absolutePath`，持续制造 `file:list ENOENT` 噪音。

## 执行批次

### 第一批：止血

- [x] 新增 renderer Error Boundary 和诊断快照
- [x] 记录 `window error` 与 `unhandledrejection`
- [x] main 进程监听 `render-process-gone`、`did-fail-load`、`unresponsive`
- [x] renderer 崩溃场景下执行有限次数自动恢复
- [x] bulk 文件刷新时只立即刷新 active tab，其余 tab 标记为 stale

### 第二批：削峰

- [x] 新增 preload session 事件路由器，按 `sessionId` 分发 `data/exit/state`
- [x] `useXterm` 改为按会话订阅，避免每个终端实例重复监听全局广播
- [x] 收紧 `MainContent` keep-mounted 范围，仅保留 `chat/file/terminal`
- [x] `source-control`、`todo`、`settings` 改为激活时挂载

### 第三批：延迟重初始化

- [x] 去掉 `monacoSetup` 顶层 `await loader.init()`
- [x] 将 Monaco 语言预热与 Shiki 高亮改为一次性懒初始化
- [x] 仅在真正需要渲染 Monaco 的编辑器 / diff / 预览入口触发初始化

### 第四批：编辑器拆包

- [x] 抽离编辑器选中文本缓存，切断 `FileSidebar -> EditorArea` 的静态依赖
- [x] 新增 `DeferredEditorArea`，在 `FilePanel` / `CurrentFilePanel` 中按需加载编辑器实现
- [x] 文件面板非激活且无 tab 时不再主动拉起完整编辑器模块

### 第五批：Diff 拆包

- [x] 新增 `DeferredDiffViewer` 和 `DeferredCommitDiffViewer`
- [x] `SourceControlPanel` 仅在确实需要展示 diff 时才加载 diff 组件
- [x] `CommitDiffViewer` 不再把 `DiffViewer` 固定留在版本控制面板的静态导入链上

### 第六批：MainContent 延迟面板

- [x] 新增 `DeferredSourceControlPanel`、`DeferredSettingsContent`、`DeferredTodoPanel`、`DeferredDiffReviewModal`
- [x] `MainContent` 仅在对应 tab 激活或 modal 打开时加载这些重量级面板
- [x] 避免 `MainContent` 继续通过静态 import 把非激活面板拉进主渲染路径

### 第七批：Chat 路径拆包

- [x] 新增 `DeferredAgentPanel`
- [x] `MainContent` 改为通过延迟加载壳按需拉起 `AgentPanel`
- [x] 保持 chat tab keep-mounted 语义，只延后首次模块装载时机

### 第八批：Terminal 路径拆包

- [x] 新增 `DeferredTerminalPanel`
- [x] `MainContent` 改为仅在首次进入 terminal tab 时加载 `TerminalPanel`
- [x] 保持 terminal tab 已加载后的挂载语义，不改变已有会话保活行为

### 第九批：运行期内存证据链

- [x] 新增主进程运行期内存快照 IPC，统一采集 app 进程与当前 renderer 内存数据
- [x] `RendererDiagnosticsProbe` 周期采样运行期内存，并写入现有诊断快照
- [x] 为崩溃、白屏、异常日志补充最近一次内存样本与峰值字段

### 第十批：文件页壳延迟加载

- [x] 新增 `DeferredFilePanel` 与 `DeferredCurrentFilePanel`
- [x] `MainContent` 改为仅在首次进入 file tab 时加载文件页壳
- [x] 保持 file tab 已加载后的挂载语义，不改变编辑器状态保活行为

### 第十一批：面包屑外部路径修复

- [x] 修正面包屑路径生成逻辑，外部文件不再被错误拼接到当前 rootPath 下
- [x] `BreadcrumbTreeMenu` 仅对当前 rootPath 内的目录复用 `gitRoot`
- [x] 补充外部路径回归测试，覆盖绝对路径与 root 外目录场景

## 本次改动范围

- `src/main/index.ts`
- `src/main/utils/rendererRecovery.ts`
- `src/preload/index.ts`
- `src/preload/sessionEventRouter.ts`
- `src/renderer/index.tsx`
- `src/renderer/hooks/useXterm.ts`
- `src/renderer/components/layout/MainContent.tsx`
- `src/renderer/components/layout/mainContentMountPolicy.ts`
- `src/renderer/components/files/EditorArea.tsx`
- `src/renderer/components/files/monacoSetup.ts`
- `src/renderer/components/files/DeferredEditorArea.tsx`
- `src/renderer/components/files/editorSelectionCache.ts`
- `src/renderer/components/search/SearchPreviewPanel.tsx`
- `src/renderer/components/source-control/DeferredDiffViewer.tsx`
- `src/renderer/components/source-control/DeferredCommitDiffViewer.tsx`
- `src/renderer/components/source-control/CommitDiffViewer.tsx`
- `src/renderer/components/source-control/DiffViewer.tsx`
- `src/renderer/components/source-control/DiffReviewModal.tsx`
- `src/renderer/components/layout/DeferredSourceControlPanel.tsx`
- `src/renderer/components/layout/DeferredSettingsContent.tsx`
- `src/renderer/components/layout/DeferredTodoPanel.tsx`
- `src/renderer/components/layout/DeferredDiffReviewModal.tsx`
- `src/renderer/components/layout/DeferredAgentPanel.tsx`
- `src/renderer/components/layout/DeferredTerminalPanel.tsx`
- `src/renderer/components/layout/DeferredFilePanel.tsx`
- `src/renderer/components/layout/DeferredCurrentFilePanel.tsx`
- `src/renderer/stores/editor.ts`
- `src/renderer/components/chat/AgentPanel.tsx`
- `src/renderer/components/terminal/TerminalPanel.tsx`
- `src/main/ipc/app.ts`
- `src/main/utils/runtimeMemory.ts`
- `src/shared/types/app.ts`
- `src/shared/types/ipc.ts`
- `src/renderer/lib/runtimeDiagnostics.ts`
- `src/renderer/components/RendererDiagnosticsProbe.tsx`
- `src/renderer/components/files/FilePanel.tsx`
- `src/renderer/components/files/CurrentFilePanel.tsx`
- `src/renderer/components/files/EditorArea.tsx`
- `src/renderer/components/files/BreadcrumbTreeMenu.tsx`
- `src/renderer/components/files/breadcrumbPathUtils.ts`

## 验证要求

- 运行第二批新增测试与第一批回归测试
- 运行 `corepack pnpm typecheck`
- 运行受影响文件范围内的 `biome check`

## 后续建议

1. 为 `chat` / `terminal` / `file` 引入更细粒度的 LRU keep-alive 策略，继续降低后台驻留成本。
2. 为 `EditorArea` 拆出共享 shell，减少 `FilePanel` / `CurrentFilePanel` 的重复逻辑。
3. 为高频 renderer 指标增加周期上报，补齐真实使用场景下的性能基线。
