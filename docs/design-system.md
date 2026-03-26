# Infilux Design System

## Tech Stack

- **Framework**: Electron + React 19 + TypeScript
- **Styling**: Tailwind CSS 4
- **UI Components**: [coss ui](https://coss.com/ui) (基于 Base UI，copy-paste 模式)
- **Icons**: Lucide React
- **Editor**: Monaco Editor (local workers, no CDN)

## 组件使用原则

**优先使用 @coss/ui 组件**，避免手动实现：

1. 新增 UI 需求时，先查看 [coss.com/ui](https://coss.com/ui) 是否有现成组件
2. 使用 CLI 添加组件：`npx shadcn@latest add @coss/<component>`
3. 组件存放于 `src/renderer/components/ui/`
4. 仅在 @coss/ui 无法满足时才手动实现

长期组件治理规则以 `agents/component-governance.md` 为准。

补充约束：

- 先复用，再扩展，再抽象，最后才新增 primitive
- feature-specific 逻辑不要下沉到 `ui/` primitive
- 共享抽象必须基于稳定的重复模式，而不是表面相似
- variant 只能表达稳定语义，不能掩盖多个不同组件

## 设计定位

### 产品角色

Infilux 的界面定位不是“轻量 IDE 外壳”，而是 **AI 协作控制台**。

用户打开应用后，应该优先感知到：

- 当前操作上下文：当前 Repository、Worktree、Agent、Session
- 当前系统态势：运行中、等待输入、已完成、未读输出
- 当前可执行动作：切换、接管、查看、审查、继续执行

### 核心气质

- 冷静：不靠夸张装饰制造“AI 感”
- 精确：状态、层级、焦点必须明确
- 操作型：让用户像在调度执行单元，而不是浏览文件卡片

### 明确禁止

- Finder 风格的轻办公感
- 通用 SaaS 白卡片堆叠
- 渐变标题、霓虹高亮、玻璃拟态
- 大面积居中欢迎页占据主舞台
- 用颜色做装饰而不是表达状态

## 统一设计规则

### 1. 信息层级规则

界面必须固定为三层信息权重：

1. **当前上下文**
   Repository、Worktree、Agent、Live State，必须在 2 秒内读到。
2. **调度对象**
   仓库项、Worktree 项、会话项，必须像“执行单元”而不是普通列表项。
3. **辅助信息**
   路径、计数、Diff、附加说明，默认退后，不得抢占主视觉。

禁止出现“所有信息同样重要”的平均排布。

### 2. 状态语义规则

状态色不是装饰，而是结构语言。

| 状态 | 含义 | 视觉语义 |
|------|------|----------|
| `idle` | 已就绪 / 无活动 | 中性 `control-chip` |
| `running` | 正在执行 | `control-chip-live` |
| `waiting_input` | 等待用户接管 | `control-chip-wait` |
| `completed` | 结果可查看 | `control-chip-done` |
| `destructive` | 删除 / 不可逆 | `destructive` 或红色文本 |

约束：

- 同一种颜色只能表达一种状态语义
- `primary` 用于焦点与当前对象，不用于所有可点击元素
- `success/warning/info/destructive` 只用于有明确业务含义的状态

### 3. 面板规则

面板必须区分为两类：

- **主控制面板**
  使用 `control-panel`
- **次级控制面板**
  使用 `control-panel-muted`

使用原则：

- 顶部上下文条、主空状态、核心导航容器使用主控制面板
- 侧栏项、状态摘要、工具按钮容器使用次级控制面板
- 不允许再回到“纯白底 + 细灰边 + 默认圆角”的模板式做法

### 4. 侧栏规则

侧栏中的仓库与 Worktree 必须满足：

- 有明确选中态
- 能直接读出名称与路径
- 能读出是否 live
- 能读出执行相关计数
- 工具操作附着在对象上，但不压过对象名称

仓库项必须优先显示：

1. 仓库名
2. 路径
3. `trees/live` 状态胶囊

Worktree 项必须优先显示：

1. 分支名
2. 路径
3. 状态胶囊
4. agent / terminal / diff 摘要

### 5. 顶部导航规则

顶部区域必须承担两个职责：

- **导航**：Tab、设置、Review、Open In
- **态势**：Repo / Worktree / Agent / Live State

禁止只保留“标签切换”而丢失当前系统态势。

### 6. 空状态规则

空状态必须像工作台，不像海报。

必须包含：

- 当前问题是什么
- 下一步动作是什么
- 至少一个可执行入口

禁止：

- 只有一句欢迎语
- 只有装饰图标，没有动作
- 大面积居中占位但没有操作价值

### 7. 字体与排版规则

- UI 主字体走 `--font-sans`，避免只依赖 `Inter`
- 主标题使用更强字重与更紧字距
- 说明文字必须明显退后
- 状态文字优先短词和大写标签，不写长句
- 路径永远是辅助信息，不得比对象名更显眼

### 9. 文案规则

- 文案优先表达状态、动作、后果，不做装饰性表达
- Label 要短、明确、可扫描
- Empty state 必须说明“缺什么、为什么重要、下一步做什么”
- Destructive 文案必须直接说明后果，必要时明确不可撤销
- Toast 和反馈文案要短，优先回答“发生了什么”
- 同一概念在全产品中尽量使用同一术语

长期文案规则以 `agents/content-copy-guidelines.md` 为准。

### 8. 交互反馈规则

- 全局必须保留 `focus-visible`
- hover、selected、focused 必须是三种不同反馈
- 可交互图标按钮必须有面板化触感，不能只靠颜色变化
- 拖拽、激活、可接收 drop 的状态必须有显式视觉标识

## 控制台样式方案

### 样式基建

全局控制台视觉语言统一落在 `src/renderer/styles/globals.css`：

- `control-sidebar`
- `control-panel`
- `control-panel-muted`
- `control-input`
- `control-chip`
- `control-chip-strong`
- `control-chip-live`
- `control-chip-wait`
- `control-chip-done`
- `control-divider`

约束：

- 新的控制台类优先复用，不要在组件里重复拼接近似样式
- 同类对象必须共享视觉规则，避免 tree / columns 两套布局继续漂移

### 已落地区域

当前已经按控制台方案收口的区域：

- 主内容头部与主空状态
- `tree` 布局侧栏
- `columns` 布局仓库侧栏
- `columns` 布局 Worktree 面板

### 后续统一方案

按以下优先级继续推进：

1. **抽共享模式**
   将 Repository / Worktree 的控制台项样式抽成共享 helper 或组件，减少两套布局分叉。
2. **统一 Agent 会话栏**
   SessionBar、AgentPanel 需要接入相同的状态胶囊与上下文语义。
3. **统一 Source Control 与 Terminal 空状态**
   让所有主面板空状态都遵守“问题 + 下一步动作”的规则。
4. **统一设置面板**
   Settings 目前仍偏传统工具设置页，可继续改造成更清晰的控制台配置面板。
5. **建立审查清单**
   每次 UI 改动都检查：上下文是否清晰、状态是否唯一、层级是否拉开、空状态是否可行动。

## 实施准则

未来新增或修改界面时，按下面顺序决策：

1. 这个区域的主上下文是什么？
2. 用户当前要调度的对象是什么？
3. 这个对象处于什么状态？
4. 哪个动作最重要？
5. 是否已经复用了现有 `control-*` 规则？

只要这 5 个问题里有 2 个回答不清楚，就不要进入样式细节。

长期视觉审查清单以 `agents/visual-review-checklist.md` 为准。

最低审查要求：

- 当前上下文是否一眼可读
- 主动作是否足够明确
- 状态语义是否唯一
- 高密度下层级是否仍然清晰
- 视觉强化是否服务操作，而不是服务装饰

## Color System

长期 token 治理规则以 `agents/design-token-governance.md` 为准。

### Theme Variables

使用 CSS 变量定义颜色，支持 light/dark 模式切换：

| Variable | Usage |
|----------|-------|
| `background` | 页面背景 |
| `foreground` | 主要文字 |
| `muted` | 次要背景 |
| `muted-foreground` | 次要文字 |
| `accent` | 交互元素背景 |
| `accent-foreground` | 交互元素文字 |
| `primary` | 强调色/品牌色 |
| `primary-foreground` | 强调色上的文字 |
| `destructive` | 危险操作 |

补充治理约束：

- foundation token、semantic token、derived product token、contextual override token 必须分层清晰
- semantic token 不能因为 preset、sync-terminal 或背景图而失去语义
- 局部视觉处理优先使用窄范围 override 变量，不要随意重写整套 token
- token 名称必须表达职责，而不是临时视觉效果

### 使用规范

```tsx
// 强调色按钮/图标
className="text-primary"
className="hover:bg-primary/20"

// 次要元素
className="text-muted-foreground"
className="bg-muted/30"

// 选中状态
className="bg-accent text-accent-foreground"

// 危险操作
variant="destructive"
```

### Background Image Overlay Rules

背景图是 **surface treatment**，不是新的主题来源。

允许影响：

- `background`
- `card`
- `popover`
- `muted`
- 必要时的 `border` / `input` 透明层次

不允许影响：

- `primary`
- `accent`
- `ring`
- `destructive`
- `success`
- `warning`
- `info`
- `control-chip-live / wait / done`

实现规则：

- 背景图模式优先通过 `--panel-bg-opacity` 这类局部变量控制透明度
- 优先在 CSS overlay 层处理，不要在 JS 中直接重写整套主题 token
- 背景图只能改变面板透明感，**不能抹掉当前主题的强调色身份**
- 当背景图与可读性冲突时，优先保证文本、状态和焦点可见性

### Accessibility Summary

实现界面时，至少满足以下规则：

- 保持全局 `focus-visible`
- `hover`、`selected`、`focused` 必须可区分
- 重要状态不能只靠颜色表达
- 高密度界面允许存在，但必须保持主次层级清晰
- 键盘可以完成核心流程
- 动效用于解释变化，不用于制造噱头
- 背景图、主题同步、自定义配色都不能破坏可读性

长期规则以 `agents/accessibility-rules.md` 为准。

## Spacing & Sizing

### 高度规范

| Component | Height | Tailwind |
|-----------|--------|----------|
| Tab 栏 | 36px | `h-9` |
| 树节点行 | 28px | `h-7` |
| 小按钮 | 24px | `h-6` |
| 输入框 | 36px | `h-9` |

### 间距规范

| Usage | Size | Tailwind |
|-------|------|----------|
| 紧凑间距 | 4px | `gap-1` |
| 标准间距 | 8px | `gap-2` |
| 宽松间距 | 12px | `gap-3` |
| 缩进 | 12px/层级 | `depth * 12 + 8px` |

## Typography

### 字体

```tsx
// 代码/编辑器
fontFamily: 'JetBrains Mono, Menlo, Monaco, Consolas, monospace'

// UI 文字
className="text-sm"  // 14px, 树节点、Tab
className="text-xs"  // 12px, 辅助信息
```

## Components

### File Tree Node

```tsx
<div
  className={cn(
    'flex h-7 cursor-pointer select-none items-center gap-1 rounded-sm px-2 text-sm hover:bg-accent/50',
    isSelected && 'bg-accent text-accent-foreground'
  )}
  style={{ paddingLeft: `${depth * 12 + 8}px` }}
>
  {/* 目录展开图标 */}
  {node.isDirectory ? (
    <ChevronRight className={cn('h-4 w-4 shrink-0 text-muted-foreground', isExpanded && 'rotate-90')} />
  ) : (
    <span className="w-4" />  {/* 占位保持对齐 */}
  )}

  {/* 文件图标 */}
  <Icon className={cn('h-4 w-4 shrink-0', iconColor)} />

  {/* 文件名 - min-w-0 确保 truncate 生效 */}
  <span className="min-w-0 flex-1 truncate">{node.name}</span>
</div>
```

### Editor Tabs

```tsx
<div className="flex h-9 shrink-0 border-b bg-muted/30">
  {tabs.map((tab) => (
    <div
      className={cn(
        'group relative flex h-9 min-w-[120px] max-w-[180px] items-center gap-2 border-r px-3 text-sm',
        isActive
          ? 'bg-background text-foreground'
          : 'bg-muted/50 text-muted-foreground hover:bg-muted'
      )}
    >
      {/* 激活指示器 */}
      {isActive && <div className="absolute inset-x-0 top-0 h-[2px] bg-primary" />}

      {/* 图标 */}
      <Icon className={cn('h-4 w-4 shrink-0', iconColor)} />

      {/* 标题 */}
      <span className="flex-1 truncate">{tab.title}</span>

      {/* 关闭按钮 - 使用强调色 */}
      <button className="text-primary opacity-0 group-hover:opacity-100 hover:bg-primary/20">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  ))}
</div>
```

### Context Menu

```tsx
<Menu open={menuOpen} onOpenChange={setMenuOpen}>
  <MenuPopup style={{ position: 'fixed', left: x, top: y }}>
    <MenuItem onClick={handler}>
      <Icon className="h-4 w-4" />
      Label
    </MenuItem>
    <MenuSeparator />
    <MenuItem variant="destructive" onClick={deleteHandler}>
      <Trash2 className="h-4 w-4" />
      Delete
    </MenuItem>
  </MenuPopup>
</Menu>
```

### Icon Buttons (工具栏图标按钮)

用于工具栏、搜索框等场景的小型图标按钮。

**基础样式（无状态）**：
```tsx
// 普通图标按钮 - 用于关闭、刷新等操作
<button
  className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent/50 hover:text-foreground"
>
  <X className="h-3.5 w-3.5" />
</button>
```

**切换按钮（有选中状态）**：
```tsx
// 切换按钮 - 用于大小写敏感、正则等开关
<button
  className={cn(
    'flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent/50 hover:text-foreground',
    isActive && 'bg-primary/20 text-primary'
  )}
>
  <CaseSensitive className="h-4 w-4" />
</button>
```

**带文字的切换按钮**：
```tsx
// 模式切换 - 用于 Tab 切换等
<button
  className={cn(
    'flex items-center gap-1 rounded px-2 py-1 text-xs',
    isActive
      ? 'bg-primary/20 text-primary'
      : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
  )}
>
  <FileCode className="h-3.5 w-3.5" />
  Content
</button>
```

**规则总结**：
| 状态 | 样式 |
|------|------|
| 默认 | `text-muted-foreground` |
| 悬停 | `hover:bg-accent/50 hover:text-foreground` |
| 选中 | `bg-primary/20 text-primary` |
| 尺寸 | `h-6 w-6`（图标按钮）或 `px-2 py-1`（带文字）|
| 图标 | `h-3.5 w-3.5` 或 `h-4 w-4` |

**注意**：
- 悬停背景使用 `bg-accent/50`（半透明），不要用 `bg-accent`（太强烈）
- 选中状态使用 `bg-primary/20 text-primary`（微妙强调），不要用 `bg-accent`

### Dialog

```tsx
<Dialog open={isOpen} onOpenChange={(open) => !open && onCancel()}>
  <DialogPopup>
    <DialogHeader>
      <DialogTitle>Title</DialogTitle>
      <DialogDescription>Description text.</DialogDescription>
    </DialogHeader>
    <DialogPanel>
      {/* Content */}
    </DialogPanel>
    <DialogFooter variant="bare">
      <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
      <Button onClick={onConfirm}>Confirm</Button>
    </DialogFooter>
  </DialogPopup>
</Dialog>
```

## Icons

### 文件图标映射

使用 Lucide icons，根据文件扩展名和目录状态选择：

```tsx
// 目录
FolderOpen  // 展开状态
Folder      // 收起状态

// 常见文件类型
FileCode    // .ts, .tsx, .js, .jsx
FileJson    // .json
FileText    // .md, .txt
FileImage   // .png, .jpg, .svg
Settings    // 配置文件
```

### 图标颜色

| Type | Color |
|------|-------|
| 目录 | `text-yellow-500` |
| TypeScript | `text-blue-500` |
| JavaScript | `text-yellow-400` |
| JSON | `text-yellow-600` |
| Markdown | `text-gray-400` |
| 图片 | `text-purple-500` |
| 默认 | `text-muted-foreground` |

## Monaco Editor

### Worker 配置

避免 CSP 问题，使用本地 worker：

```tsx
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';
// ... 其他 workers

self.MonacoEnvironment = {
  getWorker(_, label) {
    if (label === 'typescript' || label === 'javascript') return new tsWorker();
    // ...
    return new editorWorker();
  },
};
```

### 主题同步

Monaco 主题从终端主题 (Ghostty) 生成：

```tsx
monaco.editor.defineTheme('enso-theme', {
  base: isDark ? 'vs-dark' : 'vs',
  inherit: true,
  rules: [
    { token: 'comment', foreground: xtermTheme.brightBlack },
    { token: 'keyword', foreground: xtermTheme.magenta },
    { token: 'string', foreground: xtermTheme.green },
    // ...
  ],
  colors: {
    'editor.background': xtermTheme.background,
    'editor.foreground': xtermTheme.foreground,
    // ...
  },
});
```

### 语言检测

使用 `path` prop 自动检测语言：

```tsx
<Editor
  path={activeTab.path}  // Monaco 根据路径自动检测语言
  value={activeTab.content}
  // ...
/>
```

## Interaction Patterns

长期交互模式规则以 `agents/interaction-patterns.md` 为准。

### 文件树

- **单击文件**: 在编辑器中打开
- **单击目录**: 展开/收起
- **右键**: 打开上下文菜单

### Tab 栏

- **单击 Tab**: 切换到该文件
- **拖拽 Tab**: 重新排序
- **点击关闭按钮**: 关闭文件
- **Cmd/Ctrl+S**: 保存当前文件

### 交互摘要

- 交互优先回答“当前上下文是什么、下一步能做什么”
- `hover`、`focus`、`selected`、`active` 必须可区分
- 空状态必须提供明确下一步动作
- Context Menu 只承载次级操作，不隐藏高频主操作
- Destructive action 必须更明确、更克制、更有确认感
- 多面板切换必须保持方向感，不能制造不必要的状态丢失

## Flexbox 技巧

### 文本截断对齐

```tsx
// 父容器
className="flex items-center gap-1"

// 固定宽度元素
className="h-4 w-4 shrink-0"

// 可截断文本
className="min-w-0 flex-1 truncate"
```

`min-w-0` 是关键 - 允许 flex 子元素收缩到内容尺寸以下。

## Animation System

本项目使用 **Framer Motion** 作为动画库，配置集中在 `src/renderer/lib/motion.ts`。

长期 motion 原则以 `agents/motion-principles.md` 为准。

### 设计原则

- **快速响应**：动画时长控制在 150-200ms，保持操作效率
- **Spring 物理**：使用 Spring 弹性动画，带来自然的物理感
- **GPU 加速**：优先使用 `transform`、`opacity` 属性，启用硬件加速
- **服务理解**：动效必须帮助用户理解变化、层级和连续性
- **克制优先**：高密度区域优先使用更安静、更短、更少的动效
- **可降级**：非必要动画必须可被 reduced-motion 路径削弱或移除

### Spring 配置

| 名称 | 参数 | 适用场景 |
|------|------|----------|
| `springFast` | stiffness: 500, damping: 30 | Dialog、Menu 等弹出层 |
| `springStandard` | stiffness: 400, damping: 30 | 面板伸缩、布局动画 |
| `springGentle` | stiffness: 300, damping: 25 | Tooltip、微交互 |

### 通用 Variants

```tsx
import {
  fadeVariants,
  scaleInVariants,
  slideUpVariants,
  heightVariants,
  springFast
} from '@/lib/motion';

// 弹出层（Dialog、Menu）
<motion.div
  variants={scaleInVariants}
  initial="initial"
  animate="animate"
  exit="exit"
  transition={springFast}
>

// 高度展开（Accordion、列表）
<motion.div
  variants={heightVariants}
  initial="initial"
  animate="animate"
  exit="exit"
  transition={springStandard}
>

// Toast 通知
<motion.div
  variants={slideUpVariants}
  initial="initial"
  animate="animate"
  exit="exit"
>
```

### 微交互

```tsx
import { tapScale, hoverScale } from '@/lib/motion';
import { motion } from 'framer-motion';

// 按钮点击反馈
<motion.button whileTap={tapScale}>
  Click me
</motion.button>

// 悬浮放大
<motion.div whileHover={hoverScale}>
  Hover me
</motion.div>
```

### AnimatePresence 使用

所有条件渲染的动画元素必须用 `AnimatePresence` 包裹：

```tsx
import { AnimatePresence, motion } from 'framer-motion';

<AnimatePresence mode="wait">
  {isOpen && (
    <motion.div
      key="content"
      variants={fadeVariants}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      Content
    </motion.div>
  )}
</AnimatePresence>
```

### Layout 动画

使用 `layout` 属性实现元素位置/尺寸的平滑过渡：

```tsx
// Tab 指示器滑动
<motion.div
  layoutId="tab-indicator"
  className="absolute bottom-0 h-0.5 bg-primary"
/>

// 列表项排序
<motion.div layout>
  {item.name}
</motion.div>
```

### 列表 Stagger 动画

```tsx
import { listContainerVariants, listItemVariants } from '@/lib/motion';

<motion.ul variants={listContainerVariants} initial="initial" animate="animate">
  {items.map((item) => (
    <motion.li key={item.id} variants={listItemVariants}>
      {item.name}
    </motion.li>
  ))}
</motion.ul>
```

### 性能注意事项

1. **避免频繁的 `height: 'auto'`**：对大列表使用虚拟化
2. **使用 `will-change` 谨慎**：仅在必要时添加
3. **避免同时动画多个属性**：优先使用 `transform` 系属性
