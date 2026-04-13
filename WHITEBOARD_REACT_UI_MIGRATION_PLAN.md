# whiteboard-react 样式与组件迁移到 ui 的整体方案

## 目标

将 `whiteboard/packages/whiteboard-react` 的视觉样式、浮层组件和颜色体系尽量迁移到 `ui/css` 与 `@shared/ui/src`，使：

- `whiteboard/packages/whiteboard-react/src/styles/whiteboard-react.css` 只保留 whiteboard runtime 必需的结构类、缩放相关几何、overlay 层级和少量编辑态 class。
- 颜色、边框、阴影、surface、accent 等主题能力统一依赖 `ui/css` 的 token 和 semantic 层，不再在 whiteboard 内维护一套二级 token。
- whiteboard 的 toolbar、panel、menu、toolbox、dock 等 chrome 组件复用 `@shared/ui/src` 的基础组件和 primitive，减少局部实现。
- whiteboard 仍保留自身领域内强耦合的 runtime 结构和交互样式，不为了抽象而抽象。

## 当前现状

### 1. `whiteboard-react.css` 混了三种职责

文件 [whiteboard/packages/whiteboard-react/src/styles/whiteboard-react.css](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/styles/whiteboard-react.css) 当前同时承担了三种职责：

- whiteboard 自己的 token alias 和 fallback 颜色。
- 通用 chrome 组件样式。
- whiteboard runtime 必需的结构与几何样式。

这三者应该拆开，否则迁移会一直卡在半成品状态。

### 2. 已经有一部分迁到了 `@ui`

whiteboard-react 并不是从零开始迁移，已经有明显基础：

- `OverlayProvider` 来自 `@ui`。
- `WhiteboardPopover` 本质上是 `@shared/ui/Popover` 的轻封装。
- 右键菜单已经基于 `@shared/ui/Menu`。
- 多数 toolbar、toolbox、dock 已经使用 `@shared/ui/Button`、`@shared/ui/Slider` 和 `ui` token class。
- 颜色选项已经使用 `@ui` 的 color family 和 `resolveOptionColorToken`。

说明整体方向是成立的，问题主要在于旧 CSS 没清理干净，以及还缺少一层真正可复用的 UI primitive。

### 3. `whiteboard-react.css` 中存在明显死代码

扫描结果显示：

- `whiteboard-react.css` 中共有 `94` 个 `wb-*` selector。
- 其中只有 `58` 个 selector 仍然在源码中被引用。
- 剩余 `36` 个 selector 已经没有对应 `className` 使用，属于死代码。

这些死代码主要集中在：

- `wb-node-toolbar*`
- `wb-selection-summary*`
- `wb-selection-filter*`
- `wb-node-handle-top/right/bottom/left`

这部分说明 whiteboard 已经在源码层转向 `@ui` 化实现，但样式文件还停留在旧时代。

## 应保留在 `whiteboard-react.css` 的内容

以下内容建议继续保留在 `whiteboard-react.css`，因为它们与 whiteboard runtime、世界坐标、缩放、命中区域或文本编辑耦合过深，不适合上移到 `ui/src`。

### 1. Stage / viewport / overlay 结构层

保留：

- `wb-container`
- `wb-root-container`
- `wb-root-viewport`
- `wb-overlay`
- `wb-scene`
- `wb-scene-defs`
- `wb-canvas-background`

原因：

- 这些 class 是画布容器、viewport transform、overlay 布局的运行时骨架。
- 与 `Surface.tsx`、`CanvasScene.tsx` 的结构强绑定。
- 它们不是通用 UI 容器，而是 whiteboard 场景系统的一部分。

### 2. Overlay stacking 和交互层

保留：

- `wb-node-overlay-layer`
- `wb-drag-guides-layer`
- `wb-draw-preview-layer`
- `wb-edge-endpoint-layer`
- `wb-edge-control-point-layer`
- `wb-presence-layer`
- `wb-marquee-layer`
- `wb-selection-transform-box`
- `wb-node-transform-frame`

原因：

- 这些样式依赖 whiteboard 的 z-index 语义和 pointer event 策略。
- 与 node overlay、selection overlay、guides、draw preview、presence 的运行时层级直接耦合。

### 3. 缩放相关的几何控制点和手柄

保留：

- `wb-node-handle`
- `wb-node-connect-handle-layer`
- `wb-node-transform-handle`
- `wb-node-transform-handle-icon`
- `wb-edge-endpoint-handle`
- `wb-edge-control-point-handle`

原因：

- 这些元素大量使用 `--wb-zoom`、局部 CSS variable 和 transform 进行缩放补偿。
- 同时承担命中区域、可拖拽手柄、边控制点的几何职责。
- 它们是 whiteboard 交互 affordance，不是通用按钮。

### 4. 文本编辑壳与节点内容布局

保留：

- `wb-default-text-editor`
- `wb-default-text-display`
- `wb-text-node-viewport`
- `wb-text-node-content`
- `wb-sticky-node`
- `wb-sticky-node-shell`
- `wb-sticky-node-text`
- `wb-shape-node`
- `wb-shape-node-svg`
- `wb-shape-node-label-shell`
- `wb-shape-node-label-content`
- `wb-frame-header`
- `wb-frame-title`

原因：

- 这部分和 `EditableSlot`、文本测量、sticky fit、node text source binding 深度绑定。
- 行为上不是通用文本组件，而是 whiteboard node content renderer 的一部分。

### 5. Mindmap 和 presence 的布局类

保留：

- `wb-mindmap-tree`
- `wb-mindmap-tree-canvas`
- `wb-mindmap-tree-ghost`
- `wb-mindmap-node-item`
- `wb-mindmap-node-label`
- `wb-mindmap-node-actions`
- `wb-mindmap-add-button`
- `wb-presence-selection`
- `wb-presence-selection-edge`
- `wb-presence-cursor`
- `wb-presence-cursor-dot`
- `wb-presence-cursor-label`

原因：

- 这些 UI 是 whiteboard 领域模型的一部分，不是通用表单或菜单 primitive。
- 坐标、attach target、ghost line、peer cursor 全是 whiteboard 专属语义。

## 应迁移到 `ui/css` 的内容

### 1. 取消 whiteboard 内部的 token alias 层

应删除或尽量压缩：

- `--wb-ui-canvas`
- `--wb-ui-surface`
- `--wb-ui-surface-muted`
- `--wb-ui-surface-subtle`
- `--wb-ui-surface-strong`
- `--wb-ui-surface-hover`
- `--wb-ui-text-primary`
- `--wb-ui-text-secondary`
- `--wb-ui-text-tertiary`
- `--wb-ui-border-subtle`
- `--wb-ui-border-strong`
- `--wb-ui-accent`
- `--wb-ui-accent-surface`
- `--wb-ui-danger`
- 以及基于这层再派生出的 `--wb-surface*` / `--wb-text*` / `--wb-accent*`

迁移原则：

- whiteboard 样式里直接使用 `--ui-*`。
- 只保留 whiteboard 自己真正独有的变量，例如 `--wb-z-*`、`--wb-zoom`、少量运行时几何变量。

### 2. 将颜色语义完全统一到 `ui/css`

whiteboard 需要统一依赖：

- `ui/css/tokens.css`
- `ui/css/semantic.css`
- `ui/css/core.css`

颜色迁移原则：

- surface 直接使用 `--ui-bg-card`、`--ui-bg-panel`、`--ui-bg-subtle`、`--ui-floating-bg` 等语义 token。
- border 直接使用 `--ui-border-default`、`--ui-border-strong`、`--ui-divider`。
- text 直接使用 `--ui-text-primary`、`--ui-text-secondary`、`--ui-text-tertiary`。
- accent 和 selection 直接基于 `--ui-accent`、`--ui-accent-overlay`、`--ui-accent-outline` 生成。
- 色板和 node 默认色统一使用 `@shared/ui/src/color` 的 helper 与 family 数据。

### 3. whiteboard-specific 样式中的颜色也要直接吃 `--ui-*`

即使保留在 `whiteboard-react.css` 中，下面这些内容的颜色也不应继续走 `--wb-ui-*` 中转：

- canvas 背景与 pattern 色
- sticky 便签背景渐变
- selection border / fill
- handle 的边框和阴影
- mindmap 线条与节点文本
- frame header 的表面色

也就是说，保留 class，不保留白板内部的主题系统。

## 应迁移到 `@shared/ui/src` 的组件与 primitive

### 1. 优先抽取 selection panel primitive

当前文件：

- `whiteboard/packages/whiteboard-react/src/features/selection/chrome/panels/ShapeToolbarPrimitives.tsx`

建议迁移为 UI 通用 primitive，例如：

- `Panel`
- `PanelSection`
- `SegmentedButton`
- `ColorSwatchGrid`
- `SliderSection`

原因：

- 这些组件已经不包含 whiteboard 世界坐标、viewport、document 语义。
- 本质上只是通用面板内控件组织方式。
- `EdgeToolbar`、selection panel、未来其他产品面板都能复用。

### 2. 抽取 toolbox primitive

当前文件：

- `whiteboard/packages/whiteboard-react/src/features/toolbox/primitives.tsx`

适合迁移的内容：

- toolbox surface
- toolbox panel surface
- toolbox icon button
- toolbox option button
- toolbox color swatch button

原因：

- 它们已经高度依赖 `@shared/ui/Button` 和 `ui` token。
- 逻辑上更像是 UI 组件库的一部分，而不是 whiteboard runtime 的核心。

### 3. 抽取 toolbar primitive

当前文件：

- `whiteboard/packages/whiteboard-react/src/features/selection/chrome/toolbar/primitives.tsx`

适合迁移的内容：

- `ToolbarIconButton`
- `ToolbarDivider`
- 颜色/描边图标辅助组件

原因：

- 它们是通用 toolbar 元件。
- edge toolbar、node toolbar、未来其他工具条都能使用。

### 4. 不建议迁移到 `ui/src` 的组件

以下组件不建议迁移：

- `FloatingToolbarShell`
- `NodeTransformHandles`
- `NodeConnectHandles`
- `EdgeOverlayLayer`
- `MindmapTreeView`
- `PresenceLayer`

原因：

- 它们依赖 whiteboard 的世界坐标、screen 坐标、hit test、selection overlay、viewport zoom。
- UI 层不应该知道这些领域语义。

## 建议删除的旧 CSS

以下 class 可以作为第一批清理对象：

- `wb-node-toolbar`
- `wb-node-toolbar-button`
- `wb-node-toolbar-icon`
- `wb-node-toolbar-menu`
- `wb-node-toolbar-menu-section`
- `wb-node-toolbar-menu-title`
- `wb-node-toolbar-swatch-grid`
- `wb-node-toolbar-swatch`
- `wb-node-toolbar-chip-row`
- `wb-node-toolbar-chip-column`
- `wb-node-toolbar-chip`
- `wb-node-toolbar-menu-list`
- `wb-node-toolbar-menu-item`
- `wb-node-toolbar-layout-panel`
- `wb-node-toolbar-layout-align-grid`
- `wb-node-toolbar-layout-distribute-grid`
- `wb-node-toolbar-layout-divider`
- `wb-node-toolbar-icon-button`
- `wb-node-toolbar-textarea`
- `wb-selection-summary`
- `wb-selection-summary-icons`
- `wb-selection-summary-icon`
- `wb-selection-summary-overflow`
- `wb-selection-summary-body`
- `wb-selection-summary-title`
- `wb-selection-summary-detail`
- `wb-selection-filter-strip`
- `wb-selection-filter-chip`
- `wb-selection-filter-chip-icon`
- `wb-selection-filter-chip-label`
- `wb-selection-filter-chip-count`
- `wb-node-handle-top`
- `wb-node-handle-right`
- `wb-node-handle-bottom`
- `wb-node-handle-left`

这些 class 当前源码里已经没有对应使用，继续保留只会增加理解成本。

## 迁移后的 `whiteboard-react.css` 预期职责

迁移完成后，这个文件应该只保留四类内容：

### 1. 层级与运行时变量

- `--wb-z-edge`
- `--wb-z-node`
- `--wb-z-guides`
- `--wb-z-node-overlay`
- `--wb-z-edge-overlay`
- `--wb-z-preview`
- `--wb-z-selection`
- `--wb-z-toolbar`
- `--wb-z-context-menu`
- `--wb-z-presence`

### 2. 结构类

- container / root / overlay / scene / viewport
- marquee / guides / preview / presence layer

### 3. 几何控制类

- transform handle
- connect handle
- edge endpoint / control point
- selection frame

### 4. whiteboard-specific 内容类

- text / sticky / shape / frame
- mindmap
- presence

除此之外，不再承载主题、通用浮层、通用按钮、通用 panel 样式。

## 迁移顺序

### 阶段一：先清依赖契约

需要先确认并补齐：

- `@whiteboard/react` 是否正式依赖 `@shared/ui`。
- whiteboard 作为包被外部消费时，是否要求宿主显式引入 `@shared/ui/css/core.css`。
- whiteboard 的 UI class 是否继续依赖宿主侧 Tailwind content 扫描源码。

当前现状是：

- demo app 已经显式引入 `@shared/ui/css/core.css`。
- demo app 的 Tailwind content 也显式扫描 `whiteboard-react/src` 与 `ui/src`。

如果这个契约不明确，后面所有“组件迁移到 `@shared/ui/src`”都只能在当前 app 内成立，不能保证库消费场景稳定。

### 阶段二：先删死代码

先从 `whiteboard-react.css` 删除没有任何源码引用的旧 selector。

原因：

- 这一步风险最低。
- 能显著降低后续迁移噪音。
- 也能快速验证哪些样式仍然真实参与运行。

### 阶段三：抽 UI primitive

优先把以下白板内部 primitive 上移到 `@shared/ui/src`：

- selection panel primitive
- toolbox primitive
- toolbar primitive

迁移完成后，让以下调用方全部改为依赖新的 UI primitive：

- `EdgeToolbar`
- selection panels
- toolbox menus
- viewport dock
- 浮动 toolbar 内的按钮和 panel

### 阶段四：移除 whiteboard 内部 token alias

在 chrome 组件已经切换到 UI primitive 后，再删除 `whiteboard-react.css` 顶部的大量 `--wb-ui-*` / `--wb-surface*` / `--wb-text*` token。

同步调整：

- sticky 渐变
- frame header
- background pattern
- handle / selection / preview 的颜色表达

### 阶段五：瘦身 `whiteboard-react.css`

最后只保留运行时必须的结构和几何样式，并对剩余内容做一次职责整理：

- stage
- overlays
- handles
- node content
- mindmap
- presence

## 风险与注意点

### 1. 最大风险是打包和消费契约，不是视觉

如果 whiteboard 继续通过 Tailwind class 直接写 UI 样式，但消费方并没有扫描到这些 class，最终产物会出现缺样式问题。

因此迁移时必须同时定义清楚：

- whiteboard 是源码复用模式，还是构建后独立消费模式。
- UI 样式是由宿主应用提供，还是由 whiteboard 包自身保证。

### 2. 不要过度抽象 whiteboard-specific 交互

以下能力不应为了“统一”而搬到 UI：

- viewport transform
- selection overlay
- drag handle
- edge control point
- presence cursor
- mindmap attach/ghost line

这些都是 whiteboard runtime 的一部分，不是通用设计系统组件。

### 3. presence 颜色是一个单独问题

`@shared/ui/src/color` 现在擅长固定 family token，但 presence 使用的是用户自定义任意颜色。

因此 presence 相关视觉统一时，需要额外决定：

- 是继续允许任意原始色值直接驱动 UI。
- 还是在 `ui` 层增加一个“任意色转 overlay / alpha / label background”的 helper。

## 结论

正确的迁移路径不是简单地“把 `whiteboard-react.css` 改薄”，而是：

1. 先明确 `@whiteboard/react` 与 `@shared/ui` 的依赖和样式契约。
2. 删除 `whiteboard-react.css` 中已经废弃的旧 chrome 样式。
3. 把白板内部已成熟的 toolbar / panel / toolbox primitive 抽到 `@shared/ui/src`。
4. 让剩余 whiteboard-specific class 继续存在，但颜色直接改吃 `--ui-*`。
5. 最终把 `whiteboard-react.css` 收敛为一个纯 runtime 结构样式文件。

如果后续开始实际实施，建议第一轮只做两件事：

- 删除死代码 selector。
- 抽取 `ShapeToolbarPrimitives`、`toolbox/primitives`、`toolbar/primitives` 到 `@shared/ui/src`。

这两步收益最大，风险最低，也最能验证迁移方向是否正确。
