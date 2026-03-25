# Remote Architecture

## 概览

Infilux 的 remote 不是“把整个窗口搬到远端”的 VS Code Remote 模型，而是：

> **把远程仓库挂进当前本地窗口，让现有 Infilux 工作流继续作用于该远程仓库。**

这意味着 remote 子系统的目标不是成为通用远程 IDE 平台，而是闭环 Infilux 自己的远程仓库工作流：

- 连接远程主机
- 安装/校验远程 runtime
- 启动远程 helper / server
- 将远程仓库表示为本地窗口中的 remote repository
- 让文件、Git、worktree、终端、Agent、Claude 能力继续工作

---

## 产品边界

### 明确要做的事

- 在当前窗口中挂载远程仓库
- 让远程仓库复用当前应用已有的文件、Git、worktree、session、Claude 工作流
- 在本地与远程模式之间保持一致的 UI 心智模型

### 明确不做的事

- 不做整窗远程工作台
- 不做通用远程 extension host
- 不做通用端口转发平台
- 不做本地 <-> 远程文件传输平台
- 不做跨远程连接之间的文件传输平台

这是一个**远程仓库工作流增强**模型，而不是远程 IDE 平台模型。

---

## 架构位置

Remote 是跨越 main / preload / renderer / shared 的纵向子系统。

```text
Renderer Remote UI
  -> window.electronAPI.remote.*
    -> src/main/ipc/remote.ts
      -> RemoteConnectionManager / RemoteRepositoryBackend / RemoteEnvironmentService
        -> SSH / remote runtime / remote server / remote filesystem / remote sessions
```

其中：

- **shared**
  - 定义 remote types
  - 定义 remote virtual path 语义
- **main**
  - 管理连接、runtime、认证、远程 RPC、资源清理
- **preload**
  - 暴露 remote 能力与事件
- **renderer**
  - 提供连接 UI、认证弹窗、remote-aware 视图消费方式

---

## 核心模块

### 1. `RemoteConnectionManager`

位置：

- `src/main/services/remote/RemoteConnectionManager.ts`

它是 remote 子系统的总协调器，负责：

- profile 持久化
- 连接建立与断开
- 平台/架构/libc 校验
- runtime 准备、上传、解压、验证
- 启动远程 server
- handshake
- 状态广播
- reconnect
- 远程 RPC 调用
- cleanup

可以把它理解为 remote 子系统的控制平面。

### 2. `RemoteHelperSource`

位置：

- `src/main/services/remote/RemoteHelperSource.ts`

职责：

- 内嵌生成远程 helper / server 源码
- 提供远程服务端的能力实现

远程 helper 内部承载：

- session 管理
- watcher 管理
- 文件系统 RPC
- Git / shell / agent / Claude 相关远端能力

这意味着 remote 不是简单的 SSH 命令转发，而是 **本地 main <-> 远程 helper** 的协议式协作。

### 3. `RemoteRuntimeAssets`

位置：

- `src/main/services/remote/RemoteRuntimeAssets.ts`

职责：

- 解析并准备受管的远程 runtime 归档
- 管理 Node runtime 与远程 server bundle 的本地缓存
- 处理下载、校验、checksum、构建与发布资源路径

remote 运行依赖的不是“远程主机现成环境一定正确”，而是当前版本应用所管理的一组 runtime 资产。

### 4. `RemoteRepositoryBackend`

位置：

- `src/main/services/remote/RemoteRepositoryBackend.ts`

职责：

- 把 remote repository 适配成与本地仓库相近的文件/Git/worktree 后端
- 把 remote virtual path 翻译成 `connectionId + remotePath`
- 转发：
  - 文件读写
  - copy / move / batch operations
  - conflict detection
  - Git / worktree / merge / search 等操作

它是 remote 仓库“看起来像普通仓库”的关键适配层。

### 5. `RemoteEnvironmentService`

位置：

- `src/main/services/remote/RemoteEnvironmentService.ts`

职责：

- 在 remote repository 上定位与读写远端环境文件
- 处理远程 Claude 配置、prompt、MCP、plugins、marketplace 等环境数据

换句话说，它解决的是：

> 当仓库是 remote repository 时，Claude 生态相关配置应该读写到哪里？

### 6. `RemoteAuthBroker`

位置：

- `src/main/services/remote/RemoteAuthBroker.ts`

职责：

- 处理 SSH askpass / password / passphrase / keyboard-interactive / host verification
- 把远程认证需求桥接到 renderer 的交互 UI

它让远程认证流程变成一个受控的 broker，而不是把 SSH 交互直接泄露到 renderer 或 shell 层。

### 7. `RemoteHostVerification`

位置：

- `src/main/services/remote/RemoteHostVerification.ts`

职责：

- 解析 host authenticity prompt
- 提取 fingerprint 与 host/port 信息

它是 host verification 交互的解析器，而不是 UI 层。

---

## Shared 契约

### Remote types

位置：

- `src/shared/types/remote.ts`

这里定义 remote 子系统的共享契约，例如：

- `ConnectionProfile`
- `RemoteConnectionStatus`
- `RemoteConnectionPhase`
- `RemoteRuntimeStatus`
- `ConnectionTestResult`
- `RemoteAuthPrompt`
- `RemoteAuthResponse`

这层是 remote 词汇表，不应漂移到 renderer 或 main 的私有结构里。

### Repository runtime context

位置：

- `src/shared/types/repositoryContext.ts`
- `src/main/services/repository/RepositoryContextResolver.ts`

核心模型：

```text
repoPath -> local | remote
          -> if remote, connectionId
```

这层负责回答：

> 当前仓库上下文是本地的，还是远程的？

这个判断后续会影响：

- Claude 环境读写
- 文件/Git/worktree 的执行位置
- renderer 中的 remote-aware UI 逻辑

---

## Remote Virtual Path 模型

### 为什么需要 virtual path

在 renderer 与上层业务看来，很多逻辑依旧需要“像文件路径一样”传递仓库根路径、文件路径、目录路径。

但远程仓库不能直接使用本地路径，因此系统引入了 remote virtual path。

### 语义

位置：

- `src/shared/utils/remotePath.ts`

前缀：

```text
/__enso_remote__
```

编码模型：

```text
/__enso_remote__/<encoded-connectionId>/<remote-path>
```

因此一个 remote virtual path 本质上是：

```text
connection identity + remote filesystem path
```

### 关键函数

- `isRemoteVirtualPath()`
- `toRemoteVirtualPath()`
- `parseRemoteVirtualPath()`
- `normalizeRemotePath()`

### 设计意义

它让上层系统可以：

- 在不切换整个 UI 模型的情况下传递“路径”
- 通过解析拿到所属连接与真实远端路径
- 统一本地与远程仓库入口

但也带来约束：

- 任何只按本地路径假设写的逻辑都可能在 remote 下失效

---

## 连接生命周期

### 连接阶段

根据 shared types，连接存在明确 phase：

- `idle`
- `probing-host`
- `resolving-platform`
- `preparing-runtime`
- `uploading-runtime`
- `extracting-runtime`
- `syncing-server`
- `starting-server`
- `handshake`
- `reconnecting`
- `connected`
- `failed`

这不是单一“connect() 成功/失败”的二元模型，而是一条多阶段状态机。

### 建立连接的典型链路

```text
profile selected
  -> probe host
  -> resolve platform / arch / libc
  -> verify or install runtime
  -> sync server assets
  -> start remote helper / server
  -> handshake
  -> publish connected status
```

### reconnect 模型

`RemoteConnectionManager` 内置 reconnect delay 机制。

这意味着 remote 不是一次性命令，而是长生命周期连接对象。后续设计和调试都必须按“连接状态机会抖动”来处理。

---

## Runtime 模型

### 为什么要有 runtime

remote 子系统并不完全依赖远端主机已有环境，而是需要一套受控 runtime 来保证：

- 版本一致
- helper/server 可运行
- Node 版本受控
- PTY、Git、配置同步等能力有明确预期

### Runtime 组成

典型包括：

- managed Node runtime
- remote server bundle
- manifest / checksum / version 信息

### 平台边界

当前 remote 平台模型明确约束为：

- `linux`
- `x64` / `arm64`
- `glibc`

这不是文案偏好，而是运行时与 helper 产物形态决定的产品边界。

---

## RPC 与远端服务模型

本地 main 并不是每次都简单执行一次 SSH 命令后解析文本，而是通过远程 helper / server 形成更稳定的 RPC 模型。

远端 helper 内部维护：

- clients
- sessions
- watchers

并通过 request/response/event 的模式与本地通信。

### 这带来的好处

- 文件系统操作更结构化
- session / watcher 能够持久化
- 远程事件可以回推到本地
- 比零散 SSH 命令执行更适合复杂交互

### 这带来的风险

- server 版本与 runtime 版本兼容问题
- helper 升级路径复杂
- reconnect / cleanup / stale state 更难处理

---

## 远程仓库适配模型

`RemoteRepositoryBackend` 的核心作用不是“提供某几个 remote 方法”，而是把 remote repository 适配进现有仓库模型。

### 适配内容

- 文件：
  - list
  - read
  - write
  - create
  - delete
  - rename
  - move
  - copy
  - batch operations
  - conflict detection
- Git：
  - status
  - branches
  - log
  - diff
  - stage / unstage / discard
  - commit / push / fetch
- Worktree：
  - list / create / remove
  - merge / conflicts / resolve / abort / continue
- Search：
  - file search
  - content search

### 关键限制

RemoteRepositoryBackend 明确拒绝：

- 本地 <-> 远程混合路径操作
- 跨 remote connection 的文件操作

这是刻意设计，不是功能缺失导致的偶然行为。

---

## Renderer 消费模型

### 1. Remote UI

位置：

- `src/renderer/components/remote/RemoteAuthPromptHost.tsx`

目前 renderer 的 remote 侧重点之一是：

- 呈现认证与 host verification 交互
- 接收 main 发来的 remote auth prompt
- 返回用户输入的 secret / confirm decision

### 2. Repository runtime context

位置：

- `src/renderer/hooks/useRepositoryRuntimeContext.ts`

作用：

- 从 renderer 侧查询当前仓库是 local 还是 remote
- 为 remote-aware UI 或后续逻辑提供上下文

这一步让 renderer 不必自己解析 remote path 细节，也避免把远程判定逻辑散落到组件内部。

---

## 共享状态同步

`RemoteConnectionManager` 会同步共享状态，例如：

- `settings.json`
- `session-state.json`

这说明 remote 连接建立不仅是“能执行命令”，还包含：

- 将本地共享状态同步到远端环境
- 让远程 helper/server 使用一致的共享上下文

这是远程仓库体验保持一致的重要一环。

---

## Watcher 与事件模型

remote watcher 不是本地 `@parcel/watcher` 的直接平移，而是：

- 本地维护 watcher registration
- 远端 helper 持有 watcher
- 连接状态变化时重建或清理订阅
- 事件回推到本地窗口

设计要求：

- watcher 生命周期必须绑定 window / sender / connection
- 断连后 listener 不能悬挂
- reconnect 时 watcher 需要恢复

这个区域是生命周期 bug 高发区。

---

## Auth 与 Host Verification 模型

remote auth 子系统的目标是：

- 兼容 SSH password / passphrase / keyboard-interactive
- 支持 host verification
- 不把终端式交互直接塞给用户

链路大致如下：

```text
SSH prompt detected
  -> RemoteAuthBroker classifies prompt
    -> main emits RemoteAuthPrompt
      -> renderer dialog collects user response
        -> RemoteAuthResponse sent back
          -> broker resumes SSH flow
```

这让认证成为一条可控的产品链路，而不是一堆不可预测的 shell prompt。

---

## 清理与资源回收

remote 子系统的 cleanup 比本地能力更复杂，因为它涉及：

- SSH / bridge / helper / server
- watcher registrations
- pending RPC
- reconnect timer
- auth broker state
- runtime 临时文件

因此 remote cleanup 必须同时考虑：

- app 正常退出
- signal-based 退出
- 单连接断开
- window destroy
- reconnect 中断

如果 cleanup 做不好，常见后果包括：

- 本地状态还以为连接活着
- 远端 helper 残留
- watcher 悬挂
- reconnect 风暴

---

## 当前热点与高风险区

以下文件属于 remote 子系统高风险区：

- `src/main/services/remote/RemoteConnectionManager.ts`
- `src/main/services/remote/RemoteHelperSource.ts`
- `src/main/services/remote/RemoteRepositoryBackend.ts`
- `src/main/services/remote/RemoteRuntimeAssets.ts`
- `src/main/services/remote/RemoteAuthBroker.ts`
- `src/main/ipc/remote.ts`
- `src/main/ipc/files.ts`

这些文件的改动通常会影响：

- 生命周期
- 协议兼容
- local/remote 双模式
- renderer 对仓库能力的统一假设

---

## 常见设计误区

### 误区 1：把 remote 当作“特殊文件系统”

不够准确。它同时涉及：

- 连接状态机
- runtime
- helper/server 协议
- session
- watcher
- Claude 远端环境

### 误区 2：把 remote 当作“整窗远程 IDE”

也不准确。Infilux 的模型更窄，是把 remote repository 挂进当前本地窗口。

### 误区 3：把 remote path 当作普通本地 path

remote virtual path 只是路径外观，背后始终需要 `connectionId + remotePath` 的组合语义。

### 误区 4：只测 happy path

remote 真实风险更多在边界：

- 平台不支持
- helper 已安装但版本不一致
- 断连重连
- watcher 恢复
- merge 中断
- auth prompt 中断

---

## 推荐阅读顺序

如果要理解 remote 子系统，建议按下面顺序阅读：

1. `src/shared/types/remote.ts`
2. `src/shared/utils/remotePath.ts`
3. `src/main/ipc/remote.ts`
4. `src/main/services/repository/RepositoryContextResolver.ts`
5. `src/main/services/remote/RemoteConnectionManager.ts`
6. `src/main/services/remote/RemoteRuntimeAssets.ts`
7. `src/main/services/remote/RemoteHelperSource.ts`
8. `src/main/services/remote/RemoteRepositoryBackend.ts`
9. `src/main/services/remote/RemoteEnvironmentService.ts`
10. `src/main/services/remote/RemoteAuthBroker.ts`
11. `src/renderer/components/remote/RemoteAuthPromptHost.tsx`
12. `docs/remote-acceptance-checklist.md`

---

## 总结

Infilux 的 remote 架构本质上是：

- 一个 **受控连接状态机**
- 一套 **受管 runtime + helper/server**
- 一个 **remote virtual path 适配层**
- 一个 **把远程仓库接入现有本地窗口工作流的后端体系**

它的成功标准不是“像 VS Code Remote 一样包打天下”，而是：

> 在不破坏现有本地工作流的前提下，让远程仓库在当前窗口中尽可能自然、稳定、可维护地工作。
