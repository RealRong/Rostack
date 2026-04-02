# UI 统一方案

## 目标

把 `dataview` 和 `whiteboard` 的共享 UI 能力统一到仓库根目录 `ui/`，让两个库复用同一套：

- 主题 token
- 基础样式
- 通用控件样式
- React UI primitives

视觉基线以 `dataview/demo/styles.css` 为准，不再以 `whiteboard/demo/src/notion-theme.css` 为主题源。

## 现状结论

### `dataview` 已经有一套较完整的 primitives

`dataview/src/react/ui` 当前已有：

- `Button`
- `Input`
- `Select`
- `Label`
- `Popover`
- `Menu`
- `Switch`
- `PanelHeader`
- `QueryChip`
- `VerticalReorderList`
- `utils`
- `blockingSurface`

其中最适合先进入共享层的是：

- `Button`
- `Input`
- `Select`
- `Label`
- `Popover`
- `Menu`
- `Switch`
- `utils`
- `blockingSurface`

更偏 pattern 或带额外依赖的先放后面：

- `PanelHeader`
- `QueryChip`
- `VerticalReorderList`

### `dataview/demo/styles.css` 现在混了三层职责

这个文件现在同时承担了：

- 主题 token
- 全局 base/reset
- `ui-*` 组件样式

它已经是当前 repo 最完整的视觉源，但它还不是一个可以直接给两个库复用的共享 CSS 入口，因为它依赖：

- `@tailwind base/components/utilities`
- `@apply`

这在 `dataview` demo 里成立，但不能作为整个 repo 的共享 CSS 契约。

### `whiteboard` 现在是“重复定义 token + 自己维护组件样式”

`whiteboard` 相关样式主要在三处：

- `whiteboard/demo/src/notion-theme.css`
- `whiteboard/packages/whiteboard-react/src/styles/whiteboard-react.css`
- `whiteboard/demo/src/app.css`

其中：

- `notion-theme.css` 基本是在复制一份主题 token
- `whiteboard-react.css` 已经大量消费 `--ui-*`
- `app.css` 也直接消费 `--ui-*`

这说明 `whiteboard` 已经具备吃统一 token 的条件，但还没有接到同一套共享 primitives。

### 现有主题类名必须改

现在有两个作用域类名：

- `group-notion-theme`
- `wb-theme-notion`

这两个名字都带业务域前缀，不适合作为根目录共享层命名。

## 关键判断

### 1. 先统一 CSS contract，再统一组件

不能直接把 `dataview/src/react/ui` 原封不动搬到根目录然后全局替换。问题不在组件逻辑，而在样式契约：

- `dataview` primitives 依赖 Tailwind utility class
- `whiteboard-react` 当前是独立打包库，主要只直接引普通 CSS
- 根目录还没有统一的 workspace/package/build contract

所以最稳的顺序应该是：

1. 先抽主题 token
2. 再抽共享 CSS primitives
3. 最后再抽共享 React primitives

### 2. 主题 token 必须以 `dataview/demo/styles.css` 为唯一源头

原因：

- 这份定义最完整
- `whiteboard/demo/src/notion-theme.css` 是它的简化/偏移版本
- `whiteboard` 那份 light theme 里 `--ui-border-subtle` / `--ui-border-strong` 和 `dataview` 基线不一致

统一之后：

- `whiteboard` 不再维护第二份 notion token
- `whiteboard-react.css` 继续消费 `--ui-*`
- `whiteboard` 只保留自己的 `wb-*` 专用样式层

### 3. 不要一开始就抹平 `wb-*`

`whiteboard-react.css` 现在先把 `--ui-*` 映射到 `--wb-*`，再驱动画布、节点、toolbar、menu。这一层适配是有价值的。

建议保留明确分层：

- 通用主题与通用控件：`ui-*`
- 白板专用样式：`wb-*`
- demo/app 专用样式：`demo-*`

不要把白板领域专用层强行塞进 `ui-*`。

## 推荐目录结构

```text
ui/
  README.md
  css/
    theme.css
    base.css
    primitives.css
    patterns.css
    whiteboard.css
    compat.css
  react/
    index.ts
    utils.ts
    blockingSurface.tsx
    button.tsx
    input.tsx
    select.tsx
    label.tsx
    popover.tsx
    menu.tsx
    switch.tsx
    patterns/
      panelHeader.tsx
      queryChip.tsx
  tailwind/
    preset.cjs
```

### 各层职责

`ui/css/theme.css`

- 只放主题 token
- light/dark 主题都在这里
- 来源以 `dataview/demo/styles.css` 的 token 层为准
- 不放 `@tailwind`
- 不放 `@apply`

`ui/css/base.css`

- 全局 reset
- `box-sizing`
- `html/body/#root/#app` 基础高度与字体
- 表单控件继承字体
- `::selection`

`ui/css/primitives.css`

- 放最通用的 `ui-*` 控件类
- 来源于 `dataview/demo/styles.css` 中真正可复用的那一层

建议第一批迁入：

- `ui-control`
- `ui-button-primary`
- `ui-button-destructive`
- `ui-button-outline`
- `ui-input`
- `ui-text-input`
- `ui-hover-control`
- `ui-popover-panel`
- `ui-switch`
- `ui-divider-*`
- `ui-tag-tone-*`
- `ui-checkbox-tone-*`
- `ui-accent-*`

`ui/css/patterns.css`

- 放共享但不算最低层 primitive 的模式样式

建议放这里：

- `ui-query-chip`
- `ui-panel-control`
- `ui-chip-control`
- `ui-surface-floating`

`ui/css/whiteboard.css`

- 保留 `wb-*`
- 保留 `--wb-*` 适配变量
- 继续承载白板专有画布、节点、selection、toolbar、palette 等样式
- 不再自己定义主题 token，只消费 `theme.css` 的 `--ui-*`

`ui/css/compat.css`

- 只做迁移兼容
- 放旧类名别名
- 迁移完成后删除

`ui/react`

- 放真正的共享 React primitives
- 第一轮只迁通用层，不把所有 dataview pattern 一起抬过去

`ui/tailwind/preset.cjs`

- 给需要 Tailwind 的消费侧提供 token 映射
- 作用是“消费共享 token”，不是“承载共享主题”

## 命名方案

### 主题作用域类名

推荐统一成：

- `.rostack-ui-theme`

不再新增：

- `.group-notion-theme`
- `.wb-theme-notion`

迁移期建议兼容：

```css
:root,
.rostack-ui-theme,
.group-notion-theme,
.wb-theme-notion {
  /* shared tokens */
}
```

dark 也做同样兼容，等两个库都切完后再删别名。

### token 命名

保留现有 `--ui-*`。

原因很直接：

- `dataview` 已经大量使用
- `whiteboard-react.css` 和 `whiteboard/demo/src/app.css` 已经在消费
- 现在改 token 前缀几乎只有成本，没有收益

### 类命名分层

建议长期保持：

- 通用层：`ui-*`
- 白板专用层：`wb-*`
- 应用/demo 层：`demo-*`

## 推荐迁移阶段

### Phase 1：统一主题与基础 CSS

动作：

1. 创建根目录 `ui/css/theme.css`
2. 把 `dataview/demo/styles.css` 的 token 层抽进去
3. 创建 `ui/css/base.css`
4. 引入新主题类名 `.rostack-ui-theme`
5. 让旧类名进入兼容期
6. `whiteboard/demo/src/notion-theme.css` 不再作为主题源文件，可以改成 shim，或直接删掉并改引用

完成标志：

- 主题 token 只有一份源头

### Phase 2：抽共享 primitives CSS

动作：

1. 从 `dataview/demo/styles.css` 抽出通用 `ui-*`
2. 拆成 `ui/css/primitives.css` 和 `ui/css/patterns.css`
3. `dataview/demo/styles.css` 只保留 demo 入口职责
4. `whiteboard/demo/src/app.css` 的面板壳、按钮壳、输入壳开始复用共享类，而不是继续手写相似外观

完成标志：

- 通用控件样式不再散落在两个库里重复维护

### Phase 3：抽共享 React primitives

动作：

1. 把 `dataview/src/react/ui` 中真正通用的组件迁到根目录 `ui/react`
2. `dataview` 改为消费根目录共享 primitives
3. `whiteboard` 先在 demo/app 层接入这些组件

这一步不要一上来就要求 `@whiteboard/react` 整个库全面依赖共享 React primitives。先让共享 CSS 契约稳定，再判断是否下沉到库层。

### Phase 4：白板控件层逐步接入

优先改这些共性明显的位置：

- demo 面板
- demo 联机控制区
- `NodeToolbar` 的菜单壳/按钮壳
- `ToolPalette` 的按钮壳/列表壳/菜单壳

先不动这些白板专有层：

- 画布
- 节点渲染
- 连线渲染
- viewport/selection/marquee 专有结构

## 构建与依赖建议

### 推荐策略

根目录 `ui/` 先作为 repo 内共享源码目录，不急着第一天就变成完整对外发布包。

原因：

- 根目录当前没有统一 `package.json`
- `dataview` 和 `whiteboard` 还是两套构建语境
- 先统一源码与 CSS contract，落地成本最低

### 明确不推荐

不要第一步就做这些事：

- 直接把 `dataview/src/react/ui` 整个移动过去并全局替换 import
- 直接让 `@whiteboard/react` 依赖一套仍带 Tailwind 假设的共享 React 层
- 直接把 `whiteboard-react.css` 全部改写成 `ui-*`

### Tailwind 的角色

建议把 Tailwind 定位成“消费共享 token 的辅助工具”，不是共享样式唯一承载层。

也就是说：

- 共享 token 尽量写成普通 CSS
- 共享 primitives CSS 也尽量写成普通 CSS
- Tailwind preset 只是给需要 utility class 的消费侧提供便利

## 第一轮最值得直接做的事

按收益和风险比，我建议先做下面五件事：

1. 创建根目录 `ui/css/theme.css`
2. 把 `group-notion-theme` / `wb-theme-notion` 统一兼容到 `.rostack-ui-theme`
3. 创建 `ui/css/base.css`
4. 让 `dataview/demo/styles.css` 从“大一统文件”变成共享 CSS 的入口文件
5. 让 `whiteboard/demo/src/notion-theme.css` 退出主题源角色

这五步做完，整个 repo 的 UI 统一就进入正确轨道了。

## Definition of Done

至少满足下面几点，才算完成真正的统一起点：

1. 主题 token 唯一源头在根目录 `ui/css/theme.css`
2. `.rostack-ui-theme` 成为统一作用域类名
3. `group-notion-theme` 和 `wb-theme-notion` 只作为兼容别名存在
4. `whiteboard` 不再维护第二份 notion token
5. 通用 `ui-*` 样式从 `dataview/demo/styles.css` 中拆出到根目录共享层
6. 后续 React primitives 的迁移不再被主题和基础样式混杂问题卡住

## 最终建议

方向完全对，但不要先搬组件，先搬契约。

最优顺序是：

1. 先抽主题
2. 再抽共享 CSS primitives
3. 最后抽共享 React primitives

这样既能最大化复用 `dataview/demo/styles.css` 的现有成果，也不会一下子把 `whiteboard-react` 的样式和打包边界打碎。
