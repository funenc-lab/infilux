# 会话输出传输批处理设计

## 目标

降低 supervisor 和远程 Agent 会话在高频输出时造成的远程事件、主进程 IPC 与渲染器调度压力，同时保持现有会话重放、退出、解绑和重连语义。

## 范围

- 本地 PTY、local supervisor 与 remote session 的实时输出统一经过主进程按窗口、按会话的批处理器。
- 远端 helper 对 remote session 的实时输出增加按会话批处理，减少 SSH 隧道上的事件数量。
- 退出事件前必须刷新同一会话的所有待发送数据。
- 会话解绑、窗口不可用、远端 client 全部断开和会话移除时必须取消无消费者的待发送数据。

不改变的边界：会话重放仍通过现有 attach/create 返回值传递；IPC channel、payload 类型、远程 RPC 协议和 xterm 渲染器回压策略保持不变。

## 数据流

```text
Local PTY / Local supervisor
  -> SessionManager replay buffer
  -> per-window SessionOutputBatcher
  -> Electron session:data
  -> renderer xterm buffer

Remote PTY / Remote host session
  -> remote helper per-session batcher
  -> remote:session:data transport event
  -> SessionManager replay buffer
  -> per-window SessionOutputBatcher
  -> Electron session:data
  -> renderer xterm buffer
```

## 设计决策

### 远端 helper

`RemoteHelperSource.ts` 内嵌一个只管理实时输出的 batcher。它以 `sessionId` 为键，使用 16ms 延迟和 64KiB 字符上限，保留 UTF-16 代理对边界。每次原始输出都立即写入 replay buffer；仅对发往已订阅 client 的事件延迟合并。

在 `finalizeSessionExit`、attach 激活时发现待退出、以及 `removeSession` 中，batcher 必须先刷新或取消对应会话。没有订阅 client 时不保留待发送输出，因为 replay 已保存数据且实时流处于暂停状态。

### 主进程

`SessionManager` 将现有 `localOutputBatcher` 变为后端无关的会话输出 batcher。local PTY、supervisor 和 remote listener 的实时数据都调用统一方法；每个窗口仍拥有独立队列，避免一个窗口的解绑或不可用状态影响其他窗口。

`emitExit` 在发送退出事件前刷新对应会话的每个窗口队列。会话重连期间从 replay 计算出的增量也走同一方法，以避免 reconnect 后突发输出重新绕过保护。

## 错误与清理语义

- 空输出忽略。
- 窗口解绑或不可用时丢弃该窗口对应会话的待发送数据。
- 退出时刷新已附着窗口的待发送数据，再发送退出。
- 被移除的远程会话取消 timer，防止晚到回调向已删除会话发送输出。
- 重连、attach 与 replay 保持现有状态转换；不增加新的持久化状态。

## 验收标准

- supervisor 和 remote 连续输出在主进程侧合并为一个 `session:data` 事件。
- remote helper 连续输出在远程事件层合并，单个 payload 不超过 64KiB 且不拆分代理对。
- 退出前产生的输出总是在 exit 事件之前送达。
- detach、窗口不可用和远程 session 删除后不会出现延迟输出。
- 现有本地 PTY、远程重连和重放测试继续通过。
