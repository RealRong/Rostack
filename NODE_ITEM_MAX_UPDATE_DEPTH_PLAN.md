# NodeItem Maximum Update Depth 修复方案

## 问题结论

当前 `NodeItem` 的 `Maximum update depth exceeded`，更像是 React 外部 store 快照不稳定导致的自激，而不是某一个局部 `setState` 没有写好。

现状里，一个 node 的可视状态被拆成了多条 React 可见的订阅链：

- `CanvasScene -> SceneNodeById` 先订阅一次 `editor.read.node.item`
- `NodeItem -> useNodeView` 再订阅一次 `editor.read.node.item`
- `NodeItem -> useNodeView` 还额外订阅 `editor.read.node.state`
- `text/sticky` renderer 内部继续订阅 `editor.read.overlay.node`
- `text/sticky` renderer 还会订阅 `editor.state.edit`、`editor.state.viewport`

这些链路并不是一次性产出一个稳定 snapshot，而是会在拖拽过程中分批通知 React。对于 `useSyncExternalStore` 来说，这种“同一个组件一次 render 周期内看到多份相关但不同步的 snapshot”是高风险设计，很容易触发嵌套更新保护。

## 关键判断

### 1. 主问题不是 node 测量

虽然一开始看起来 `NodeItem` 的 `ref`、测量、文本尺寸计算都很可疑，但当前代码里其实没有 node definition 真正启用 `autoMeasure`。

这意味着：

- `NodeItem -> registerMeasuredElement -> nodeSizeObserver` 不是当前拖拽报错的主链
- 继续围绕测量做局部补丁，收益会很低

### 2. 主问题是 React-facing store 拓扑过碎

`editor.read.node.item` 和 `editor.read.node.state` 都是围绕同一个 node 的视图数据，但被拆成两条不同的 derived store。

其中：

- `node.item` 表示 committed item 叠加 overlay patch 后的结果
- `node.state` 表示 overlay 衍生出的 `hovered / hidden / resizing / patched`

这两个值逻辑上应该是同一个“node view snapshot”的不同字段，但现在却分别进入 React。组件在一次 render 中要自己把两条 store 拼起来，这就是结构性风险。

### 3. `SceneNodeById` 是无意义的重复订阅

当前 `CanvasScene` 已经有 `scene.list`，实际上不需要再多一层：

- `SceneNodeById` 先读 `node.item`
- 然后才决定渲染 `NodeItem`

`NodeItem` 自己又会重新读取 node 相关 store，这导致同一个 node 至少被订阅两次，而且订阅边界不一致。

### 4. display renderer 仍然不够“纯”

即便把若干局部 `setState` 收敛掉，`text/sticky` 这条路径仍然明显比其他 node 更复杂：

- 依赖编辑态
- 依赖 viewport
- 依赖 overlay
- 依赖 DOM 测量

这类组件如果继续在 display 分支里读 store 或做回写，就算主订阅链修好，也可能重新把更新环接回来。

## 目标状态

目标不是继续修单个 setter，而是把“一个 node 在 React 中的可视状态”收敛成一条稳定的、单订阅的数据流。

最终应该变成：

- React 对每个 node 只订阅一次
- 这一条订阅直接给出完整 `node.view`
- `NodeItem` 不再自己拼装多个 store
- 非编辑态 renderer 只吃 props，不直接读 editor store

## 新的数据模型

建议新增：

- `editor.read.node.view`

它是唯一给 React 内容层使用的 node 视图 store。

### `node.view` 建议字段

字段尽量短，但要覆盖 `NodeItem` 当前实际需要的信息：

- `nodeId`
- `node`
- `rect`
- `frameRect`
- `rotation`
- `selected`
- `hovered`
- `hidden`
- `resizing`
- `canConnect`
- `canResize`
- `canRotate`
- `definition`
- `nodeStyle`
- `transformStyle`
- `renderProps`

如果不想把 `selected` 并入 runtime read，也可以继续从 selection 单独传入，但从长期看，最好也收进同一份 view，避免 React 再额外拼接一次。

### `node.view` 的约束

- 相同语义的 view 必须尽量复用旧引用
- 不能让 React 每次 `get()` 都拿到一个“值相等但对象全新”的 snapshot
- 所有和 node 内容层展示相关的值都在 runtime read 层先合成好

## 需要删除或降级的旧实现

### 删除 React 侧重复订阅链

应删除：

- `CanvasScene` 里的 `SceneNodeById`
- `NodeItem` 内对 `editor.read.node.state` 的直接依赖
- `useNodeView` 里“在 React hook 内拼装 item + state + capability + style”的做法

### 从 React-facing API 中降级的旧 store

不建议再让内容层直接使用：

- `editor.read.node.item`
- `editor.read.node.state`

这两个可以继续保留为 runtime 内部实现细节，但不应该再直接进入 `NodeItem`。

也就是说，内容层只读：

- `editor.read.scene.list`
- `editor.read.node.view`

### display renderer 中要删掉的能力

非编辑态 renderer 应删除：

- 直接订阅 `editor.read.overlay.node`
- 直接订阅 `editor.state.viewport`
- 直接回写 `editor.view.preview.nodeText`
- 直接 patch document size

这些逻辑如果必须保留，应放到：

- 编辑态 renderer
- 或 runtime 层的统一文本预览/测量服务

## 组件结构调整

### CanvasScene

当前：

- `scene.list`
- `SceneNodeById`
- `NodeItem`

目标：

- `scene.list`
- 直接渲染 `NodeItem`

即：

- `ref.kind === 'edge'` 渲染 `EdgeItem`
- 其他非 mindmap item 直接渲染 `NodeItem`
- mindmap 走自己单独的 tree view

### NodeItem

当前 `NodeItem` 同时承担了：

- 订阅多个 store
- 绑定 pick
- 绑定测量
- 调 definition.render

目标是保留它作为内容层唯一 node 宿主，但它只做两件事：

- 读取单一 `node.view`
- 渲染统一壳子并把 `renderProps` 交给 definition

也就是说，`NodeItem` 不再负责在 React 里拼 view。

### useNodeView

当前的 `useNodeView` 应该从“组合逻辑所在处”变成“读取 `editor.read.node.view` 的薄 hook”。

它可以保留名字，但职责应简化为：

- `useOptionalKeyedStoreValue(editor.read.node.view, nodeId, undefined)`

不要再在 hook 里二次 `useMemo` 拼对象。

## runtime 层改造

### 新增 `createNodeViewStore`

建议在 editor runtime read 层新增一条 keyed store：

- 输入：
  - committed `node.item`
  - overlay projection
  - selection
  - registry
- 输出：
  - React 直接消费的 `NodeView`

实现方式建议：

- 使用 `createKeyedDerivedStore`
- 在 store 内部统一合成 view
- 提供稳定 `isEqual`
- 对象复用要比当前 `resolveNodeViewState` 更严格

### `NodeView` 的相等判断

至少要比较这些东西：

- `node` 引用
- `rect` 四元组
- `frameRect` 四元组
- `rotation`
- `selected`
- `hovered`
- `hidden`
- `resizing`
- `canConnect`
- `canResize`
- `canRotate`
- `definition`
- `nodeStyle` 的关键字段
- `transformStyle` 的关键字段

如果觉得完整比较太重，可以把 `nodeStyle` 和 `transformStyle` 也在 view store 内部做缓存复用，只要输入没变，就直接复用旧对象。

### `node.state` 的处理

`node.state` 可以保留给 runtime 或 overlay 内部逻辑用，但不应继续作为内容层的公开消费入口。

长期看，最好让：

- `hovered / hidden / resizing / patched`

都变成 `node.view` 的内部字段来源，而不是 React 自己再去额外读取。

## 文本节点的处理原则

`text/sticky` 是高风险区域，必须做边界隔离。

### display 分支

display 分支应做到：

- 只使用 `renderProps`
- 不直接读取 editor store
- 不直接写 preview
- 不直接 patch document

display 分支只负责展示文字、占位符、样式。

### editing 分支

editing 分支可以继续持有：

- `draft`
- `editorRect`
- viewport 依赖
- portal

但它应只在编辑中挂载。拖拽时不要进入这条路径。

### 文本自动尺寸

文本自动尺寸如果仍需要保留，有两条可选方向：

1. 先临时降级
   - 非编辑态不做真实 DOM 测量
   - 仅使用估算字号或固定尺寸

2. 后续重新抽象
   - 把文本测量移到 runtime 服务
   - React renderer 只消费测量结果

在当前这个 bug 修复阶段，优先级应该是稳定性，不是文本自动测量精度。

## overlay 调度建议

当前 `overlay.selectors.node` 使用 `microtask` 调度，这对 React 来说风险偏高。

建议：

- 不要让 React 直接订阅 `microtask` 级别的 node overlay selector
- `node.view` 这条 React-facing store 应该自己提供稳定 snapshot

是否要把 `microtask` 改成 `sync` 或 `raf`，可以作为第二阶段优化，但不建议只改调度而不改数据拓扑。

原因是：

- 只改调度，无法消除 `item + state + overlay + selection` 多链并存的问题
- 结构不收敛，问题只是概率下降，不会真正消失

## 分阶段实施方案

### 第一阶段：收敛数据流

1. 在 editor runtime read 层新增 `editor.read.node.view`
2. 把 `NodeView` 合成逻辑从 React hook 搬到 runtime
3. 为 `node.view` 写稳定 `isEqual`
4. 保证 `node.view.get(nodeId)` 在语义不变时复用旧对象

### 第二阶段：收敛 React 订阅边界

1. 删除 `CanvasScene` 中的 `SceneNodeById`
2. `CanvasScene` 直接按 `scene.list` 渲染 `NodeItem`
3. `NodeItem` 只读取 `node.view`
4. `useNodeView` 降级为单纯读取 store 的薄 hook

### 第三阶段：收敛 renderer 副作用

1. `text/sticky` display 分支去 store 化
2. display 分支不再直接 patch preview/document
3. 编辑态逻辑单独保留
4. 如有必要，先临时降级文本自动测量

### 第四阶段：清理旧接口

完成稳定后，清理内容层不再需要的旧实现：

- 删除 `SceneNodeById`
- 删除 `NodeItem` 中围绕 `node.state` 的拼装逻辑
- 删除 `useNodeView` 中旧的 `resolveNodeViewState`
- 让 `editor.read.node.item` / `editor.read.node.state` 退出 React 内容层直接使用路径

## 不建议的修法

以下方案不建议作为主修方向：

- 继续在 `NodeItem`、`text.tsx` 里补更多 `current === next ? current : next`
- 继续围绕 `ref callback`、`setState` 点状修补
- 只把 `overlay.selectors.node` 的调度从 `microtask` 改成别的
- 继续新增更多 wrapper 组件来隔离问题

这些做法可能能短期降低复现率，但不会改变根因。

## 一句话总结

这次问题的正确修法不是继续局部打补丁，而是把 node 内容层从“多条 store 组合渲染”改成“单一 `node.view` 快照渲染”。

只有先把 React 看到的数据拓扑收敛，`NodeItem` 的拖拽更新环才会真正稳定下来。
