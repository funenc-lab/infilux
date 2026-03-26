# Infilux 当前应用架构审查与重构蓝图

> **状态**: Draft  
> **日期**: 2026-03-24  
> **范围**: 当前 `main` 分支静态代码审查  
> **目标**: 从应用架构设计、逻辑功能组织、代码质量三个维度评估当前系统，并提出可执行的重构蓝图

---

## 1. 背景

Infilux 已经不是单一功能桌面应用，而是一个复合型开发工作台：

- Git 仓库与 worktree 管理
- Monaco 编辑器
- xterm.js 终端
- AI Agent 会话
- Remote workspace
- Source Control / Todo / Settings 等辅助能力

当前代码库已经具备明显的产品级工程基础，但也进入了典型的“第二阶段复杂度上升期”：

- 功能继续扩展没有问题
- 但架构边界已经开始变得脆弱
- 若不主动收敛，后续迭代成本会越来越高

本审查聚焦于一个核心问题：

**当前系统是否还能继续健康扩展，还是已经到达必须做结构性整理的临界点。**

结论很明确：

**已到达需要主动重构的阶段，但不需要推倒重来。**

---

## 2. 审查方法与假设

### 2.1 审查方法

- 以静态代码审查为主
- 结合目录结构、关键入口、状态流、IPC 边界和大文件热点进行分析
- 重点检查：
  - 组件/服务职责边界
  - 状态来源与流转路径
  - 主进程与渲染进程耦合方式
  - 可维护性与可测试性

### 2.2 关键入口

- Renderer 入口：`src/renderer/App.tsx`
- File tab 调度：`src/renderer/components/layout/MainContent.tsx`
- 编辑器核心：`src/renderer/components/files/EditorArea.tsx`
- 文件面板：`src/renderer/components/files/FilePanel.tsx`
- 编辑器状态：`src/renderer/stores/editor.ts`
- 一次性导航状态：`src/renderer/stores/navigation.ts`
- 文件系统能力：`src/main/ipc/files.ts`
- IPC 注册：`src/main/ipc/index.ts`
- 主进程入口：`src/main/index.ts`
- Session 管理：`src/main/services/session/SessionManager.ts`
- Remote 管理：`src/main/services/remote/RemoteConnectionManager.ts`

### 2.3 假设

- 结论基于当前代码快照的静态分析，不包含运行时 profile 数据
- 不假设未来会迁出 Electron
- 不假设会裁剪现有核心能力
- 后续重构目标应是渐进式演进，而不是一次性重写

---

## 3. 总体结论

### 3.1 结论摘要

Infilux 当前架构的整体判断是：

1. **大方向正确**
   - 分层明确：`main / preload / renderer / shared`
   - 跨进程类型共享意识较强
   - 状态管理、服务划分、UI 领域划分都具备基础结构

2. **系统已经进入高复杂度阶段**
   - 关键功能不再是点状能力，而是跨层联动系统
   - 某些核心文件已经承担过多职责
   - 状态入口和逻辑入口开始分叉

3. **当前主要问题不是功能不够，而是结构开始拖累后续迭代**
   - 功能完成度高
   - 代码质量中等偏上
   - 可维护性正在下滑

### 3.2 当前架构成熟度判断

可以把当前系统理解为：

- **功能层面**: 已具备产品级完整度
- **工程层面**: 已具备中大型桌面应用雏形
- **架构层面**: 仍处于“从快速扩展走向收敛治理”的转折点

---

## 4. 当前架构设计分析

## 4.1 分层设计

当前分层基本合理：

- `src/main`
  - 负责 Electron 生命周期、IPC、原生资源、文件系统、Git、PTY、Remote 等
- `src/preload`
  - 通过 `contextBridge` 暴露能力
- `src/renderer`
  - 负责 UI、状态、交互编排
- `src/shared`
  - 负责共享类型和通用工具

这是当前项目最稳固的一部分，说明架构没有在基础层面失控。

### 评价

- **优点**
  - Electron 关注点分离清晰
  - preload 作为边界层存在，而不是 renderer 直接访问 Node
  - shared 类型层减少了主渲染进程协议漂移

- **问题**
  - `preload` 暴露面偏大，renderer 对 `window.electronAPI` 直接依赖较重
  - 共享类型集中是优点，但 IPC 面越来越大，也意味着协议治理成本在上升

---

## 4.2 Renderer 架构

Renderer 并不是简单的“页面渲染层”，而是承担了大量状态编排职责。

当前核心装配关系大致如下：

```text
App
  -> Repository / Worktree / Settings / Panel orchestration
  -> MainContent
    -> AgentPanel
    -> FilePanel or CurrentFilePanel
      -> EditorArea
    -> TerminalPanel
    -> SourceControlPanel
    -> TodoPanel
```

### 评价

- **优点**
  - UI 按功能域组织，目录结构可读性尚可
  - `App/hooks` 已开始承担状态与生命周期拆分
  - `MainContent` 保持主要 tab 挂载，用户体验上是合理的

- **问题**
  - `App.tsx` 仍然过大，是当前 renderer 的主维护热点
  - `MainContent` 是调度器，但上层 `App` 依旧掌握太多业务状态
  - File tab 存在两种 panel 模式，导致共享行为没有被真正抽象

### 判断

当前 renderer 不是“没有分层”，而是：

**已经开始分层，但尚未完成从“页面编排”向“应用壳层 + 领域子系统”的转变。**

---

## 4.3 编辑器子系统

编辑器是当前最需要重构的区域。

当前结构上有三层事实：

1. File tab 只是 `MainContent` 里的一个主视图
2. File tab 又分为 `CurrentFilePanel` 与 `FilePanel`
3. 最终逻辑仍大规模集中在 `EditorArea`

### 当前优点

- 编辑器状态已按 worktree 分片保存
- Monaco 集成完整，支持本地 worker、Shiki、定制语言能力
- 预览、blame、line comment、definition 等能力都已落地

### 当前问题

1. `EditorArea` 责任过重
   - tabs
   - preview
   - breadcrumb
   - external change
   - blame
   - line comment
   - session 联动
   - Monaco 生命周期

2. `FilePanel` 与 `CurrentFilePanel` 大量重复
   - 快捷键监听
   - search 打开
   - 未保存确认
   - tab 关闭流程
   - 聚焦刷新
   - `EditorArea` 传参逻辑

3. 文件导航语义不统一
   - `editor store` 内已有打开/激活/光标定位语义
   - `navigation store` 又额外承担了一次性跳转职责

### 判断

编辑器当前最大问题不是功能不足，而是：

**子系统已经成型，但边界还停留在组件层，而不是稳定的模块层。**

---

## 4.4 主进程架构

主进程分为：

- `ipc/*`
- `services/*`
- `utils/*`

从组织方式看，主进程架构方向是健康的：

- IPC 注册集中
- 清理逻辑集中
- 服务按领域拆分

### 当前优点

- `ipc/index.ts` 是明确的集中注册入口
- 清理链路清楚，尤其是 PTY / watcher / updater / remote cleanup
- service 目录说明项目没有把所有逻辑直接写进 IPC handler

### 当前问题

1. 某些服务体量已过大
   - `RemoteConnectionManager.ts`
   - `RemoteHelperSource.ts`
   - `SessionManager.ts`
   - `files.ts`

2. 某些 handler 已不只是“薄适配层”
   - `src/main/ipc/files.ts` 已经承担较多策略和资源管理责任

3. Remote 相关逻辑复杂度已接近单独子系统级别
   - 连接
   - 认证
   - runtime 安装
   - RPC
   - 状态同步
   - 重连

### 判断

主进程当前不是杂乱无章，而是：

**已有良好的模块化外观，但核心复杂度开始聚集到少数服务内部。**

---

## 5. 逻辑功能组织分析

## 5.1 功能组织优点

### Worktree 作为一等公民

这是当前产品最有辨识度、也是架构最合理的设计之一。

- worktree 不只是 Git 概念
- 它同时关联：
  - 编辑器上下文
  - 终端上下文
  - Agent 会话上下文
  - 当前主 tab

这个模型是清晰且有产品价值的。

### 保持挂载的主视图策略正确

- terminal 不会因为切 tab 被销毁
- file editor 不会因为切 tab 丢状态
- source control 保留局部交互上下文

这对一个开发工作台是正确决策。

### shared types 使用合理

`src/shared/types` 已经成为实际协议层，而不是随手写的类型集合。这为后续重构提供了一个良好基础。

---

## 5.2 功能组织问题

### 状态边界虽然存在，但入口逐渐增多

当前状态至少分布在：

- Zustand
- React Query
- localStorage
- main process settings / shared state
- SQLite

这本身不是问题，问题在于：

- 不同状态源的职责边界不总是显式
- 某些行为存在双入口或跨入口
- 生命周期逻辑常常分散在多个 hooks 中串起来

### 一些逻辑仍依赖隐式共享

例如通过 `window._pendingSearchQuery` 在多个组件之间传递 search 初始值。这类方式短期高效，但会削弱可测试性和可推理性。

### Remote 能力已经渗透多个层次

Remote 当前不是单独挂在边上的附加功能，而是已经深入：

- repository
- file
- session
- worktree
- runtime context

这意味着任何未来的大改动，如果忽略 remote，会很容易把系统做坏。

---

## 6. 代码质量审查

## 6.1 正向评价

### 类型约束整体较好

- shared types 相对完整
- settings types 体系较成熟
- store 类型表达基本清晰

### 风格一致性较好

- 组件命名统一
- hooks / stores / components 分层基本一致
- 没有明显的类型逃逸泛滥迹象

### 已经存在主动整理痕迹

- `App/hooks` 是一次明确的拆分尝试
- `stores/settings` 已从单文件开始拆分为 `index/defaults/types/migration/storage`

这说明代码库不是完全被动失控，而是已经有人在尝试治理复杂度。

---

## 6.2 主要质量问题

### 1. 大文件过多

当前明显热点：

- `src/renderer/App.tsx` 1556 行
- `src/renderer/components/files/EditorArea.tsx` 1429 行
- `src/renderer/components/files/FilePanel.tsx` 851 行
- `src/main/ipc/files.ts` 1082 行
- `src/main/services/session/SessionManager.ts` 915 行
- `src/main/services/remote/RemoteConnectionManager.ts` 3285 行
- `src/main/services/remote/RemoteHelperSource.ts` 3161 行

问题不在“文件大”本身，而在于：

- 大文件通常伴随职责漂移
- 局部修改难以建立完整心智模型
- 回归影响范围难预测

### 2. 重复逻辑已开始侵蚀一致性

典型例子：

- `FilePanel` / `CurrentFilePanel`
- 多处打开文件与切换视图逻辑
- 多处 dirty / save / close 协调

### 3. 测试覆盖与复杂度严重不匹配

当前仅发现极少量测试文件：

- `src/main/services/git/__tests__/gitLogFormat.test.ts`
- `src/renderer/components/files/__tests__/javaFolding.test.ts`

对于当前体量和复杂度，这是明显不足的。

### 4. 一些跨层依赖仍偏直接

Renderer 中大量直接调用 `window.electronAPI.*`，说明应用服务层仍不够完整。UI 层知道太多主进程协议细节，会放大未来改造成本。

---

## 7. 风险排序

### P0 风险

- 编辑器重构前继续叠加新功能
- Remote 复杂度继续集中在单一 manager
- 没有测试保护下继续做大范围行为调整

### P1 风险

- 状态入口继续增加
- preload API 继续扩张
- File tree / repository tree 在大规模仓库下的性能和维护压力继续上升

### P2 风险

- settings 能力继续增长导致 store 再次膨胀
- `App.tsx` 继续承担更多跨域调度逻辑

---

## 8. 重构蓝图

## 8.1 总体原则

1. 不推倒重来
2. 优先拆边界，而不是先改视觉
3. 优先消除双入口和重复实现
4. 先建立领域壳层，再拆内部细节
5. 重构必须保住现有能力：
   - worktree 隔离
   - dirty file 保护
   - remote workspace
   - session / terminal 持续性

---

## 8.2 第一阶段：收敛编辑器边界

### 目标

把“编辑器行为”从 panel 布局中抽出来，形成稳定子系统。

### 建议动作

1. 抽出共享 `EditorShell`
   - 统一 tabs / save / close / search / pending cursor / dirty confirmation
   - `FilePanel` 只负责 tree + shell 布局
   - `CurrentFilePanel` 只负责 shell 直出

2. 收敛文件导航命令
   - 统一“打开文件 / 激活 file tab / 定位光标 / 预览模式”语义
   - 降低 `editor store` 与 `navigation store` 双入口问题

3. 拆分 `EditorArea`
   - `EditorChrome`
   - `EditorSurface`
   - `PreviewRegistry`
   - `EditorSessionIntegration`

### 价值

- 立刻降低后续编辑器功能迭代成本
- 让重设计编辑器 UI 变成可控问题
- 为后续增加 preview / outline / split editor 留出结构空间

---

## 8.3 第二阶段：收敛 renderer 编排层

### 目标

让 `App.tsx` 从“大型应用控制器”降级为“装配根节点”。

### 建议动作

1. 建立 `workspace application layer`
   - repository selection
   - worktree activation
   - active tab
   - runtime context

2. 将 `App/hooks` 从“辅助拆分”升级为“领域入口”
   - repository domain
   - worktree domain
   - settings domain
   - workspace navigation domain

3. 逐步减少组件内直接调用 `window.electronAPI`
   - 通过 renderer service / app service 包装

### 价值

- 缩短跨模块依赖链
- 降低 `App.tsx` 的主调度负担
- 为未来增加新主视图提供更稳定入口

---

## 8.4 第三阶段：拆分 main process 核心服务

### 目标

把超大服务拆成稳定协作模块。

### 建议动作

1. Remote 子系统拆分
   - profile storage
   - auth / host verification
   - runtime installer
   - transport / RPC
   - reconnection state machine

2. Session 子系统拆分
   - local pty backend
   - remote session backend
   - attachment coordinator
   - replay buffer / lifecycle event broadcaster

3. Files IPC 减肥
   - handler 只保留协议适配
   - watcher / remote watcher / encoding / batch file ops 分别下沉

### 价值

- 主进程职责更可推理
- 降低 remote 迭代风险
- 为测试 main services 提供可分割单元

---

## 8.5 第四阶段：建立最小质量防线

### 目标

给高风险链路补最基本的自动化保护。

### 建议动作

优先补以下测试：

1. editor worktree switch
2. dirty file close / app close
3. file navigation command
4. remote reconnect / attach
5. session lifecycle

### 价值

- 让重构能持续推进，而不是只能小心手改
- 明确哪些行为属于稳定契约

---

## 9. 需要保留的扩展点

后续重构时，应明确保留以下扩展点：

1. **Worktree-aware editor state**
   - 这是产品核心能力，不应退化为全局 editor context

2. **Preview registry**
   - markdown / image / pdf 未来可能继续扩展

3. **Session backend abstraction**
   - local / remote session 应保留统一模型

4. **Remote virtual path abstraction**
   - 不要把文件模型重新做成“仅本地路径”

5. **Shared IPC contract**
   - shared types 仍应作为跨层协议事实源

---

## 10. 最终判断

Infilux 当前系统的核心判断如下：

- **不是需要推翻重做的架构**
- **也不是可以继续无约束叠功能的架构**
- **它处于一个必须主动治理复杂度的阶段**

如果只看功能完成度，当前项目是成功的。

如果看长期可维护性，当前最紧迫的问题已经不是“还缺什么功能”，而是：

**如何把已经存在的能力收敛成稳定、可扩展、可测试的子系统。**

在所有方向里，最值得优先投入的是：

1. 编辑器子系统收敛
2. renderer 编排层降压
3. remote / session 服务拆分
4. 最小测试防线建立

---

## 11. 推荐下一步

建议按以下顺序继续：

1. 先单独产出“编辑器重构设计”
2. 再产出“renderer application layer 重构计划”
3. 最后再进入 remote / session 主进程拆分

原因很简单：

- 编辑器是当前最明显的复杂度热点
- 它同时影响用户体验、功能扩展和代码维护
- 先解决它，整个系统的后续重构成本会明显下降
