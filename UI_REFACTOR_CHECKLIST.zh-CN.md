# UI 重构清单

## 目标

把全仓 UI 收敛到根目录 `ui/` 作为唯一共享来源，完成下面几个结果：

- 全仓统一使用根目录 `ui` 提供的样式入口与 React 组件
- `dataview`、`whiteboard`、`apps/*` 不再维护平行主题体系
- 根目录 `styles.css` 不再参与运行时契约，只作为过渡期颜色参考
- 清理重复 CSS、历史命名和局部搬运样式
- 禁止继续使用以下主题作用域类名：
  - `.rostack-ui-theme`
  - `.group-notion-theme`
  - `.wb-theme-notion`

## 最终状态

### 运行时契约

全仓运行时只认下面两类共享入口：

- 样式入口：`@ui/css/core.css`
- 白板专用补充：`@ui/css/whiteboard.css`
- React 组件入口：`@ui`

### 主题作用域

主题不再依赖命名式作用域类，统一收敛到：

- `:root`
- `[data-theme='light']`
- `[data-theme='dark']`
- `.dark`

如果某些嵌入式场景确实需要局部主题容器，也必须使用通用、无业务语义的命名，例如：

- `[data-ui-theme]`

但默认情况下不新增任何主题 wrapper class。

### 分层原则

只保留这三层清晰分工：

1. `ui/css/theme.css`
   - 只放设计 token
   - 不放具体组件 class
   - 不放业务前缀

2. `ui/css/primitives.css`
   - 只放通用 primitive class
   - 例如按钮、输入框、卡片、popover、divider、selection、tag

3. `ui/css/patterns.css`
   - 只放比 primitive 更具体、但仍跨项目复用的 pattern
   - 例如 query chip、panel header、toolbar row

白板领域继续保留 `wb-*`，但只作为白板内部样式层，不再承载第二套主题契约。

## 当前问题

### 1. 主题源重复

当前存在两份完全相同的历史样式副本：

- `styles.css`
- `dataview/styles.css`

这类文件体积大、命名噪音高，而且不是现在运行时真正的共享入口。

### 2. `ui/css` 公开面过大

当前 `ui/css` 同时暴露了：

- 语义 token
- 视觉实现 token
- 组件 class
- 兼容 tailwind/shadcn alias
- 某些局部 pattern 的实现细节

结果就是命名层级混乱，调用侧不知道哪些是稳定契约，哪些只是视觉实现细节。

### 3. 组件命名不够“行业常规”

当前很多命名偏实现而不是偏对象语义，例如：

- `ui-surface-content`
- `ui-surface-floating`
- `ui-accent-overlay`
- `ui-accent-frame`
- `ui-accent-indicator`
- `ui-chip-control`
- `ui-panel-control`

这些名字描述的是“怎么画”，不是“它是什么”。

### 4. 应用侧残留重复样式

当前已知重复项：

- `apps/dataview/styles/query.css`
- `ui/css/patterns.css` 里的 `ui-query-chip`

这类重复会让后续重构越来越难收口。

## 重构原则

### 原则 1

根目录 `ui/` 是唯一共享来源，其他目录不得再复制一份 UI 基础层。

### 原则 2

公共层只暴露“稳定语义”，不暴露“实现技巧”。

### 原则 3

跨项目共享的才进 `ui/`；白板专属视觉继续留在 `wb-*`。

### 原则 4

优先删除重复和别名，避免为了兼容长期保留两套命名。

### 原则 5

类名优先用组件语义命名，token 优先用状态语义命名。

## 目标命名方案

### 主题 token

公共主题 token 收敛到少量稳定语义：

- `--ui-bg-canvas`
- `--ui-bg-surface`
- `--ui-bg-muted`
- `--ui-bg-elevated`
- `--ui-fg-primary`
- `--ui-fg-secondary`
- `--ui-fg-muted`
- `--ui-fg-inverse`
- `--ui-border-subtle`
- `--ui-border-strong`
- `--ui-hover-bg`
- `--ui-pressed-bg`
- `--ui-selected-bg`
- `--ui-selected-border`
- `--ui-selected-text`
- `--ui-focus-ring`
- `--ui-danger`
- `--ui-danger-bg`
- `--ui-shadow-card`
- `--ui-shadow-popover`

说明：

- `selected-*` 比 `accent-*` 更稳定，因为它描述的是状态而不是颜色实现
- `bg/fg` 比 `surface/text` 更符合通用 UI 命名直觉
- 兼容层 alias 可以短期保留，但不能继续作为主命名语言

### 兼容 alias

以下 token 允许在过渡期保留，但要明确标成兼容层：

- `--background`
- `--foreground`
- `--card`
- `--card-foreground`
- `--popover`
- `--popover-foreground`
- `--primary`
- `--primary-foreground`
- `--secondary`
- `--secondary-foreground`
- `--muted`
- `--muted-foreground`
- `--accent`
- `--accent-foreground`
- `--border`
- `--input`
- `--ring`

要求：

- 这些 token 只能映射到新的 `--ui-*` 语义 token
- 不允许业务代码继续围绕这些 alias 发明新命名

### 组件 class

公共 class 收敛为对象语义：

- `.ui-card`
- `.ui-card--muted`
- `.ui-card--selected`
- `.ui-popover`
- `.ui-input`
- `.ui-text-input`
- `.ui-button`
- `.ui-button--primary`
- `.ui-button--danger`
- `.ui-button--outline`
- `.ui-tab`
- `.ui-tab--active`
- `.ui-empty-state`
- `.ui-divider-top`
- `.ui-divider-bottom`
- `.ui-divider-end`
- `.ui-tag`
- `.ui-segmented`
- `.ui-segmented-item`
- `.ui-segmented-item--active`
- `.ui-selection`
- `.ui-selection-handle`
- `.ui-list-row`
- `.ui-list-row--active`
- `.ui-toolbar-chip`

说明：

- 不再新增 `surface-*`、`accent-*`、`control-*` 这种中间层命名
- 如果一个 class 明显就是某个组件，直接用组件名
- 状态优先放到 `--active`、`--selected`、`data-state`，不要再拆成视觉小零件

## 建议的旧名到新名映射

这部分不是逐字机械替换，而是重构时的方向约束。

### token 映射方向

- `--ui-canvas` -> `--ui-bg-canvas`
- `--ui-surface` -> `--ui-bg-surface`
- `--ui-surface-muted` -> `--ui-bg-muted`
- `--ui-surface-subtle` -> `--ui-bg-muted` 或删除
- `--ui-surface-strong` -> `--ui-bg-elevated` 或删除
- `--ui-surface-hover` -> `--ui-hover-bg`
- `--ui-text-primary` -> `--ui-fg-primary`
- `--ui-text-secondary` -> `--ui-fg-secondary`
- `--ui-text-tertiary` -> `--ui-fg-muted`
- `--ui-text-inverse` -> `--ui-fg-inverse`
- `--ui-control-hover` -> `--ui-hover-bg`
- `--ui-control-pressed` -> `--ui-pressed-bg`
- `--ui-accent-overlay` -> `--ui-selected-bg`
- `--ui-accent-outline` -> `--ui-selected-border`
- `--ui-accent-text` -> `--ui-selected-text`
- `--ui-popover-shadow` -> `--ui-shadow-popover`
- `--ui-shadow-sm` -> `--ui-shadow-card`

### class 映射方向

- `ui-surface-content` -> `ui-card`
- `ui-surface-floating` -> `ui-popover` 或 `ui-card ui-card--elevated`
- `ui-surface-empty` -> `ui-empty-state`
- `ui-view-tab` -> `ui-tab`
- `ui-view-tab--active` -> `ui-tab--active`
- `ui-accent-overlay` -> `ui-selection`
- `ui-accent-frame` -> `ui-selection`
- `ui-accent-handle` -> `ui-selection-handle`
- `ui-accent-indicator` -> `ui-selection-indicator`
- `ui-chip-control` -> `ui-toolbar-chip`
- `ui-panel-control` -> `ui-list-row` 或 `ui-card-action`
- `ui-hover-control` -> `ui-list-row`
- `ui-card-bg` + `ui-shadow-sm` -> 合并进 `ui-card`
- `ui-popover-panel` + `ui-surface-floating` -> 合并进 `ui-popover`

## 删除与清理清单

### 第一批必须删除

- 删除 `dataview/styles.css`
- 删除 `apps/dataview/styles/query.css`
- 删除所有 `.rostack-ui-theme`
- 删除所有 `.group-notion-theme`
- 删除所有 `.wb-theme-notion`

### 第二批必须收敛

- 根目录 `styles.css` 不再作为运行时样式入口
- `ui/css/primitives.css` 中仅剩稳定 primitive，删除过度细分命名
- `ui/css/patterns.css` 中只保留真正跨项目复用的 pattern
- 白板内部样式不再定义主题类名，只消费 `--ui-*`

### 第三批应尽量删除

- 一切与 `query chip` 重复的局部 CSS
- 一切 demo/app 内复制的基础按钮、输入框、popover 样式
- 一切旧命名兼容 class
- 一切没有真实调用点的 token 和 class

## 迁移顺序

### 阶段 1：冻结契约

- 确认 `ui/` 是唯一共享来源
- 确认 `styles.css` 只作为参考，不再被 app 运行时引入
- 确认不再新增任何主题 wrapper class
- 给 `ui/css` 建立命名边界说明

完成标准：

- 新增代码不再引用历史主题类名
- 新增代码不再从 `styles.css` 直接抄 class

### 阶段 2：瘦身 token

- 收敛 `theme.css` 中的公开 token
- 把 `accent-*` 这类偏视觉实现的公开 token 尽量内收
- 统一 hover、pressed、selected、focus 语义
- 保留少量兼容 alias，但标记为过渡层

完成标准：

- 调用侧只需要理解少量稳定 token
- `theme.css` 读起来能一眼分辨公共 token 和兼容 alias

### 阶段 3：瘦身 class

- 用组件语义替换实现语义
- 合并重复 surface/card/popover 类
- 合并重复 control/chip/panel/row 类
- 用 `data-state` 或少量 modifier 承接状态

完成标准：

- 常见 UI 需求只靠少量直观 class 就能完成
- 不再需要记忆大量视觉技巧型 class

### 阶段 4：应用迁移

- `dataview` 全量切到根目录 `ui`
- `whiteboard` 全量切到根目录 `ui`
- apps 中只保留 demo 层差异样式
- 删除各自维护的重复 CSS

完成标准：

- `dataview` 和 `whiteboard` 的基础控件都来自 `@ui`
- app 本地 CSS 只剩页面布局或 demo 特有视觉

### 阶段 5：历史清理

- 删除无调用的 token
- 删除无调用的旧 class
- 删除重复文件
- 删除兼容层中已经无引用的 alias

完成标准：

- 全仓搜不到历史主题类名
- 全仓搜不到重复 query chip 样式
- 全仓搜不到未使用的旧 class

## 文件级行动清单

### 根目录

- `styles.css`
  - 标记为颜色参考来源
  - 停止作为运行时契约
  - 在完成 token 提炼后评估是否删除或移入文档/参考目录

### `ui/css`

- `theme.css`
  - 改成“公共语义 token + 兼容 alias”结构
  - 删除业务主题类名

- `primitives.css`
  - 保留真正的 primitive
  - 删除实现细节命名
  - 合并 surface/card/popover 类

- `patterns.css`
  - 保留有限的共享 pattern
  - 去掉重复定义

- `whiteboard.css`
  - 继续只做白板领域样式
  - 不再承载主题命名入口

### `ui/src`

- 所有导出的组件默认只依赖根目录 `ui/css`
- 组件 API 统一围绕语义 variant，不围绕视觉技巧命名
- 能被基础组件吸收的 pattern，不再单独复制 class

### `dataview`

- 删除 `dataview/styles.css`
- 删除局部重复样式
- 全量依赖 `@ui`
- 业务组件不再引入平行基础样式

### `apps/dataview`

- 删除 `styles/query.css`
- 仅保留 demo 布局相关样式
- 不再维护共享 UI 样式副本

### `whiteboard`

- 保留 `wb-*` 领域样式
- 继续消费根目录 `ui` token
- 不再出现任何主题 wrapper class
- 减少直接写死 `hsl(var(--ui-...))` 字符串的散落调用，能沉到公共 token 的优先下沉

## 验收标准

完成重构后，应满足以下检查项：

### 搜索级验收

全仓搜索结果为 0：

- `.rostack-ui-theme`
- `.group-notion-theme`
- `.wb-theme-notion`

全仓不再存在重复基础样式文件：

- `dataview/styles.css`
- `apps/dataview/styles/query.css`

### 结构级验收

- 共享 UI 入口只有根目录 `ui`
- `dataview` 和 `whiteboard` 不再各自维护基础主题体系
- 白板只保留领域样式层，不保留平行主题层

### 命名级验收

- 公共 token 以语义命名为主
- 公共 class 以组件命名为主
- 视觉技巧型命名不再作为主要公开契约

### 维护性验收

- 新增一个基础 UI 组件时，不需要再去翻 Notion 大样式文件找 class
- 新增一个应用时，只需要接入 `@ui/css/core.css` 和 `@ui`
- 新成员可以从 `ui/css/theme.css` 直接看懂设计契约

## 执行建议

建议按下面顺序执行，避免同时改太多层导致难以回收：

1. 先改 `ui/css/theme.css` 的 token 公开面
2. 再改 `ui/css/primitives.css` 和 `ui/css/patterns.css` 的 class 公开面
3. 然后迁移 `dataview`
4. 再迁移 `whiteboard`
5. 最后删除历史文件和兼容层

## 额外约束

后续所有 UI 相关提交，都应遵守下面几条：

- 不允许复制根目录 `styles.css` 中的成片 class 到业务目录
- 不允许新增业务前缀主题类
- 不允许在应用目录重复定义共享 primitive
- 不允许为了局部页面方便，继续发明平行 token 体系
- 能复用 `@ui` 组件的，必须优先复用

