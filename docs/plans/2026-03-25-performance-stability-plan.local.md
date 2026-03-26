# 2026-03-25 性能与稳定性修复计划

## 背景

基于当前代码结构的静态审查，现阶段 app 的主要风险集中在以下几类问题：

1. 主内容区多个面板长期 keep-mounted，隐藏但未卸载。
2. Agent / Terminal 会话全量常驻渲染，导致内存、监听器与 observer 持续累积。
3. Session 事件采用全局广播式分发，终端实例越多，事件风暴越明显。
4. 文件树 watcher、bulk 文件变更、编辑器内容缓存共同放大 renderer 压力。
5. 缺少 renderer 异常兜底与 main 侧 crash 恢复链路，白屏后恢复能力不足。

## 目标

### 核心目标

- 降低白屏、崩溃、假死概率
- 降低 renderer 常驻负载与内存占用
- 收敛终端/Agent/编辑器的生命周期复杂度
- 为后续架构重构建立明确边界

### 非目标

- 本阶段不追求一次性重写整个编辑器或终端架构
- 本阶段不优先处理低收益 UI 微优化
- 本阶段不先做大范围功能重构

## 设计原则

1. 先止血，再优化，再重构。
2. 优先修复白屏不可恢复、崩溃不可诊断的问题。
3. 优先削减常驻实例数量，而不是继续叠加补丁。
4. 会话保活不等于视图实例保活。
5. 非 dirty 数据尽量按需加载，不长期常驻内存。

## 主要改动入口

- `src/renderer/index.tsx`
- `src/main/index.ts`
- `src/renderer/components/layout/MainContent.tsx`
- `src/renderer/hooks/useXterm.ts`
- `src/preload/index.ts`
- `src/renderer/hooks/useFileTree.ts`
- `src/renderer/components/files/EditorArea.tsx`
- `src/renderer/stores/editor.ts`

---

## Phase 0：可观测性与崩溃兜底

### P0-1 Renderer Error Boundary

- [ ] 在 renderer 根节点增加全局 Error Boundary
- [ ] 提供崩溃 fallback UI
- [ ] fallback UI 支持刷新页面
- [ ] fallback UI 支持复制错误摘要
- [ ] fallback UI 支持进入安全恢复路径

### P0-2 Main 侧 crash / load fail 处理

- [ ] 监听 `render-process-gone`
- [ ] 监听 `did-fail-load`
- [ ] 监听 `unresponsive`
- [ ] 记录崩溃原因与恢复动作日志
- [ ] 增加自动 reload 或用户确认恢复机制

### P0-3 基础诊断埋点

- [ ] 记录当前活跃 terminal 数量
- [ ] 记录当前活跃 agent session 数量
- [ ] 记录当前打开 editor tab 数量
- [ ] 记录 bulk 文件变更触发次数
- [ ] 记录 renderer 崩溃前的关键状态摘要

### P0 验收标准

- [ ] renderer 运行时异常不会直接无提示白屏
- [ ] renderer crash 后有明确恢复路径
- [ ] 主进程日志可定位 crash 类型与发生时上下文

---

## Phase 1：性能止血

### P1-1 限制全量 keep-mounted

- [ ] 梳理 `MainContent` 中哪些面板必须保活
- [ ] 将非关键面板从永久挂载调整为可卸载或分级缓存
- [ ] 引入按 tab / worktree 的 LRU 保活策略
- [ ] 避免所有主面板同时常驻运行

### P1-2 限制 Agent / Terminal 常驻实例

- [ ] `TerminalPanel` 不再全量渲染所有 terminal 实例
- [ ] `AgentPanel` 不再全量渲染所有 session 实例
- [ ] 只保留当前 worktree / 当前 group / 最近活跃少量实例
- [ ] 未显示实例保留 session 状态，但卸载 xterm 视图

### P1-3 Session 事件路由改造

- [ ] 将 `SESSION_DATA / SESSION_EXIT / SESSION_STATE` 从全局广播改为按 `sessionId` 精确分发
- [ ] 减少每个 `useXterm` 的重复全局订阅
- [ ] 降低高输出场景下的 fan-out 开销

### P1-4 文件树 watcher 降噪

- [ ] inactive 文件面板仅记录“待刷新”状态
- [ ] 避免 inactive 时即时 `refetchQueries`
- [ ] 合并短时间内的目录刷新请求
- [ ] 复查 root 级与 expanded 子目录级刷新边界

### P1-5 bulk 文件变更止损

- [ ] `/.enso-bulk` 到来时不再对所有 open tabs 逐个重读
- [ ] 优先只刷新当前活动 tab
- [ ] 其他 tab 标记为“内容可能过期”
- [ ] 用户切回时按需懒加载最新内容

### P1 验收标准

- [ ] 空闲状态 CPU 占用明显下降
- [ ] 多 terminal / 多 agent 时切 tab 更流畅
- [ ] 批量改文件时 UI 卡顿明显下降
- [ ] 终端实例数与监听器数不再线性爆炸

---

## Phase 2：稳定性专项修复

### P2-1 WebGL 风险控制

- [ ] 保持 terminal renderer 默认值为 `dom`
- [ ] WebGL context loss 后自动降级回 DOM renderer
- [ ] 记录 WebGL 失败日志并提示用户
- [ ] 长时间运行场景下验证 GPU 恢复逻辑

### P2-2 编辑器内存治理

- [ ] 限制每个 worktree 最大缓存 tab 数
- [ ] 限制全局最大缓存 worktree 数
- [ ] 大文件不长期缓存完整 content
- [ ] 非 dirty tab 尽量只保留 view state / 元数据
- [ ] 切换 worktree 时做缓存回收

### P2-3 Monaco 生命周期治理

- [ ] 评估是否必须用 `key={activeTab.path}` 强制 remount
- [ ] 收敛 editor instance / model / disposable 生命周期
- [ ] 大文件场景关闭高成本 editor 特性
- [ ] 复查所有 selection / scroll / widget listener 的释放逻辑

### P2-4 退出与清理链路验证

- [ ] 验证多 session 下应用退出
- [ ] 验证 remote session 清理
- [ ] 验证 node-pty 清理时序
- [ ] 避免双重 cleanup 导致 native 资源崩溃

### P2 验收标准

- [ ] 开启 WebGL 后长时间运行仍可恢复
- [ ] 多 worktree / 多 tab / 多 session 场景内存增长得到控制
- [ ] 应用退出不再出现高概率卡死或 native 崩溃

---

## Phase 3：架构重构

### P3-1 MainContent 生命周期模型重构

- [ ] 提炼统一 panel lifecycle manager
- [ ] 定义 `visible / cached / suspended / unmounted` 生命周期
- [ ] 彻底替代“CSS hidden 充当生命周期管理”的模式

### P3-2 Editor 状态边界重构

- [ ] 将 editor content、metadata、view state 分层管理
- [ ] dirty buffer 与只读缓存解耦
- [ ] worktree 切换时仅保留必要状态
- [ ] 建立 editor 缓存淘汰策略

### P3-3 Terminal / Agent 会话架构重构

- [ ] 让 backend session 与 renderer terminal instance 解耦
- [ ] 支持 session suspend / resume
- [ ] 建立统一 session host 容器模型
- [ ] 统一 terminal 与 agent 的会话生命周期策略

### P3 验收标准

- [ ] 会话保活不再依赖 xterm 实例常驻
- [ ] 编辑器与终端生命周期清晰可控
- [ ] 主要性能风险从“结构性问题”下降为“局部优化问题”

---

## 验证清单

### 稳定性验证

- [ ] 连续切换主 tab 200 次不白屏
- [ ] 多 worktree 切换不白屏
- [ ] 10+ agent session 并发不白屏
- [ ] agent 批量改文件时无明显假死
- [ ] renderer crash 后可恢复

### 性能验证

- [ ] 空闲 CPU 占用下降
- [ ] 多 session 时交互流畅度提升
- [ ] 内存峰值下降
- [ ] worktree 切换时 GC 抖动下降
- [ ] bulk 文件变更时主线程压力下降

### 回归验证

- [ ] terminal 状态保留正常
- [ ] agent session 恢复正常
- [ ] dirty tab 保存链路正常
- [ ] 外部文件变更提示正常
- [ ] 文件树 auto reveal 正常

---

## 建议执行顺序

### 第一阶段（先止血）

1. Error Boundary
2. `render-process-gone` / `did-fail-load` / `unresponsive`
3. 诊断日志埋点
4. bulk 文件刷新止损

### 第二阶段（降载）

1. session 事件路由改造
2. watcher 降噪
3. 限制全量 keep-mounted
4. 限制 terminal / agent 常驻实例

### 第三阶段（重构）

1. 编辑器缓存治理
2. terminal / agent 视图卸载策略
3. 生命周期模型重构
4. session 与 xterm 解耦

---

## 风险说明

### 高风险改动

- `useXterm` 事件模型改造
- `MainContent` 生命周期调整
- editor store 缓存结构调整
- terminal / agent 会话保活逻辑改造

### 中风险改动

- 文件树 watcher 降噪
- bulk 文件变更策略调整
- WebGL 自动降级

### 低风险改动

- Error Boundary
- crash/load fail 监听
- 日志埋点

---

## 结论

当前问题的根因不是单一慢函数，而是“长期常驻 + 全局广播 + 内容常驻内存”三类结构性问题叠加。

修复策略必须按以下顺序推进：

1. 先补崩溃兜底与恢复能力
2. 再削减常驻实例与全局事件风暴
3. 最后重构生命周期与缓存边界

只有这样，才能同时解决性能问题以及容易崩溃、白屏的稳定性问题。
