# 仓库侧栏层级实现计划

> **执行方式：** 当前分支内联执行。用户已明确要求执行；不创建额外 worktree，以避免打断同一工作区中已有的用户改动。

**目标：** 让 Tree Sidebar 中的“最近项目”和“所有仓库”成为清晰、同级的一级区域；让分组成为无缩进的二级区域；为所选项目提供稳定、显眼的行级选中态；并为“最近项目”添加持久化折叠、可配置初始数量及滚动触发的渐进加载。

**架构：** 设置存储负责近期项目的初始显示数量及其迁移；`storage.ts` 负责 Tree Sidebar 的局部折叠状态；可复用的渐进可见性 hook 只接受初始额度而不拥有设置状态；加载控件保留可聚焦按钮并在其滚动容器内接近底部时加载一个批次；`TreeSidebar` 只组合这些能力。视觉层全部集中在 `globals.css` 的控制台树样式中，以 data attributes 表示一级、二级和选中语义。

**技术栈：** React 19、TypeScript、Zustand persist、Tailwind CSS 4、Vitest、Testing Library 风格的 jsdom DOM 测试。

---

## 任务 1：建立“最近项目显示数量”的设置契约

**文件：**

- 修改：`src/renderer/stores/settings/types.ts`
- 修改：`src/renderer/stores/settings/index.ts`
- 修改：`src/renderer/stores/settings/migration.ts`
- 修改：`src/renderer/components/settings/GeneralSettings.tsx`
- 修改：`src/renderer/stores/settings/__tests__/defaults.test.ts`
- 修改：`src/renderer/stores/settings/__tests__/migration.test.ts`
- 修改：`src/renderer/stores/settings/__tests__/setters.test.ts`

**步骤：**

1. 先在设置测试中增加失败用例：默认值为 `8`；setter 可切换到 `4`、`12`、`16`；持久化值为非法数字或不在选项集内时回退到当前默认值。
2. 运行：`pnpm vitest run src/renderer/stores/settings/__tests__/defaults.test.ts src/renderer/stores/settings/__tests__/migration.test.ts src/renderer/stores/settings/__tests__/setters.test.ts`，确认因字段/迁移尚未存在而失败。
3. 在 `types.ts` 定义唯一的选项集和窄类型：

   ```ts
   export const RECENT_PROJECT_DISPLAY_LIMIT_OPTIONS = [4, 8, 12, 16] as const;
   export type RecentProjectDisplayLimit =
     (typeof RECENT_PROJECT_DISPLAY_LIMIT_OPTIONS)[number];
   ```

   将 `recentProjectDisplayLimit` 与 `setRecentProjectDisplayLimit` 加到 `SettingsState` 的其他侧栏偏好附近。
4. 在 `index.ts` 的初始状态置为 `8`，setter 只更新该字段；在 `migration.ts` 增加基于选项集的 sanitizer，并在 `migrateSettings` 返回对象中覆盖未验证的 persisted 值。
5. 在 `GeneralSettings.tsx` 已有的 Groups 设置附近增加一个 `Select`。label 为英文源文案 `Recent projects`，选项为 `4 / 8 / 12 / 16`，description 明确它控制 Tree Sidebar 中最近项目的初始显示数量。直接绑定 store setter，不建立本地草稿状态。
6. 重跑任务 1 的测试，确认绿色。

## 任务 2：为最近区域保存折叠状态，并使其初始显示数由设置驱动

**文件：**

- 修改：`src/shared/utils/legacyLocalStorage.ts`
- 修改：`src/renderer/App/storage.ts`
- 修改：`src/renderer/App/__tests__/storage.test.ts`
- 修改：`src/renderer/components/layout/useProgressiveRepositoryVisibility.ts`
- 修改：`src/renderer/components/layout/__tests__/useProgressiveRepositoryVisibility.test.ts`

**步骤：**

1. 先写两个失败用例：
   - `getStoredTreeSidebarRecentCollapsed` 缺省为 `false`，并且保存后可再次读取；
   - `useProgressiveRepositoryVisibility` 的 `initialInactiveLimit: 4` 只显示四个普通项目（被选择或活跃的项目仍按既有规则强制保留），一次“更多”仍增加固定八个项目。
2. 运行：`pnpm vitest run src/renderer/App/__tests__/storage.test.ts src/renderer/components/layout/__tests__/useProgressiveRepositoryVisibility.test.ts`，确认测试失败原因与新增能力一致。
3. 将 `TREE_SIDEBAR_RECENT_COLLAPSED` 加入 `MANAGED_LOCAL_STORAGE_KEYS` 及旧 session 导入 key 集；在 `storage.ts` 提供安全的 boolean getter/setter，并通过现有的 managed local-storage sync 同步。
4. 为 `ProgressiveRepositoryVisibilityInput` 增加 `initialInactiveLimit?: number`；将库存 key 纳入该值，`createInitialState` 使用该值。保持 grouped pagination 和其他列表仍从 8 开始，确保设置只影响 Recent。
5. 重跑任务 2 的测试，确认状态持久化、设置切换重置和现有强制可见规则均通过。

## 任务 3：测试先行地实现“加载更多”与向下滚动自动加载

**文件：**

- 修改：`src/renderer/components/layout/RepositoryLoadMoreButton.tsx`
- 修改：`src/renderer/components/layout/__tests__/RepositoryLoadMoreButton.test.ts`
- 修改：`src/renderer/i18n.ts`
- 修改：`src/renderer/components/layout/TreeSidebar.tsx`
- 修改：`src/renderer/components/layout/RepositorySidebar.tsx`

**步骤：**

1. 在 `RepositoryLoadMoreButton` 测试中先把可访问名和可见标签改为 `Load more`，再增加一个真实 scroll container 的用例：只有在用户向下滚动且底部距离阈值内时触发一次 `onShowMore`；点击按钮仍触发一次；无隐藏项目时不渲染。
2. 运行：`pnpm vitest run src/renderer/components/layout/__tests__/RepositoryLoadMoreButton.test.ts`，确认因新 prop/行为尚未实现而失败。
3. 让加载控件接收 `scrollContainer: HTMLElement | null`。控件监听该容器的 scroll：仅当 `scrollTop` 前进并接近底部时调用 `onShowMore`；记录最近触发位置，因此内容增长后必须继续向下滚动才能再加载，避免连续自动扩到全部。卸载时移除监听。
4. 将静态按钮文本改为英文源文案 `Load more`，保留“剩余数量”作为辅助文本；在 i18n 中补齐该 key 的既有本地化形式。
5. 在 Tree 和 Columns 两个 sidebar 的 `.control-sidebar-scroll-region` 上建立 ref，并把 ref.current 传给所有可见的 `RepositoryLoadMoreButton`。搜索状态下仍不自动或手动显示加载控件。
6. 重跑加载控件测试和 `useProgressiveRepositoryVisibility` 测试，确认键盘后备和逐批加载都有效。

## 任务 4：重构 Tree Sidebar 区域语义及交互，不改变所选项目的展开/折叠状态

**文件：**

- 修改：`src/renderer/components/layout/TreeSidebar.tsx`
- 修改：`src/renderer/components/layout/__tests__/treeSidebarRenderSmoke.test.ts`
- 修改：`src/renderer/components/layout/__tests__/treeSidebarSelectionPolicy.test.ts`
- 修改：`src/renderer/components/layout/__tests__/sidebarDesignPolicy.test.ts`

**步骤：**

1. 先写失败的 rendered-behavior/policy 用例，覆盖：
   - Recent header 是可操作按钮，有 `aria-expanded` 和 `aria-controls`，且不会因为选择项目而自动展开；
   - Recent 和 All repositories 都带 `data-tree-section-level="primary"`；group header 带 `data-tree-section-level="secondary"`；
   - group header 容器不含缩进 utility；
   - 选中仓库仍只通过该项目行的 `data-active="repo"` 表达，不添加当前上下文摘要。
2. 运行该组三项 sidebar 测试，确认它们因结构尚未更新而失败。
3. 在 `TreeSidebar` 读取 `recentProjectDisplayLimit`，并把它传给 Recent 的 visibility hook。读取/保存新的 `recentCollapsed` local state。
4. 将 Recent header 改为与 All repositories 同层级的按钮，使用 Clock 图标、Chevron、数量与 `aria` 联结；折叠时仅隐藏其 body，不修改 `selectedRepo`、`expandedRepoList`、active group 或 worktree。
5. 为两块一级区域和每一组二级区域添加语义 data attributes；删除分组的层级缩进，只保留内容列表的最小安全内边距。保持现有键盘导航、搜索与 agent worktree 过滤。
6. 重跑任务 4 的三项测试，确认折叠和选中语义符合用户约束。

## 任务 5：集中视觉层级与最终验证

**文件：**

- 修改：`src/renderer/styles/globals.css`
- 修改：`src/renderer/components/layout/__tests__/sidebarDesignPolicy.test.ts`

**步骤：**

1. 先在 `sidebarDesignPolicy.test.ts` 增加失败断言，确认共享 CSS 存在 primary/secondary section 规则、无 group left indent、选中仓库的实心高对比背景和内描边，并且不使用侧边彩条。
2. 运行：`pnpm vitest run src/renderer/components/layout/__tests__/sidebarDesignPolicy.test.ts`，确认失败。
3. 在 `globals.css` 的 console tree 规则处实现：
   - primary sections 本身保持透明；仅各自的全宽标题条使用相同的低对比背景/边框与清晰间隔；
   - secondary group header 使用次级文本，不产生任何 `margin-left` 或 `padding-left` 层级，也不增加额外背景；
   - `data-active="repo"` 使用比普通/hover 更清楚的全行 accent tint 与 1px inset outline；保留 focus-visible 的 ring，删除“已展开的所选仓库把自身背景设透明”的覆盖规则。
4. 为背景与 border-color 使用短促的 `opacity/color` transition，并在现有 `prefers-reduced-motion` 分支保持静态可读状态。
5. 依次运行所有针对性测试：

   ```bash
   pnpm vitest run \
     src/renderer/stores/settings/__tests__/defaults.test.ts \
     src/renderer/stores/settings/__tests__/migration.test.ts \
     src/renderer/stores/settings/__tests__/setters.test.ts \
     src/renderer/App/__tests__/storage.test.ts \
     src/renderer/components/layout/__tests__/useProgressiveRepositoryVisibility.test.ts \
     src/renderer/components/layout/__tests__/RepositoryLoadMoreButton.test.ts \
     src/renderer/components/layout/__tests__/treeSidebarRenderSmoke.test.ts \
     src/renderer/components/layout/__tests__/treeSidebarSelectionPolicy.test.ts \
     src/renderer/components/layout/__tests__/sidebarDesignPolicy.test.ts
   ```

6. 运行 `pnpm typecheck` 与 `pnpm lint`。若已有 Electron dev runtime，使用 CDP 截图核对：窄侧栏中 Recent/All 同层、group 不缩进、被选择项目行在展开和收起的最近区中均保留清晰行级状态（收起时不注入摘要）。
7. 使用 `git diff --check`，复核仅修改本计划范围内文件；绝不 stage 或覆盖预先存在的 main/agent/remote 目录用户改动。

---

## 变更后验收标准

- Recent 可独立折叠并持久化；折叠不会强迫展开选中项目，也不会在列表顶部生成当前上下文摘要。
- 设置里的 4/8/12/16 立即决定 Recent 的初始普通项目数量，迁移中的无效值安全回退为 8。
- 所有加载入口显示“Load more”，按钮保持键盘可用；用户向下滚动接近隐藏项时每次自动加载一个批次，不连续加载全部。
- Recent 与 All repositories 是相同的一级视觉语义；groups 是全宽、无缩进的二级语义。
- 选中项目行拥有稳定的高对比 tint 和内描边，在其工作树展开时也不被父级背景覆盖。
