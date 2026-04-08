# Whiteboard Selection 架构重构方案

## 背景

当前 whiteboard 的 selection 能力已经跨越了 `core`、`editor`、`react` 三层，但边界还不够干净，导致几个问题叠在一起：

1. `editor.read.selection` 暴露的是一个偏“大而全”的读取面，`summary` 同时承载 target、items、groups、transform、box 等多类语义。
2. `whiteboard-react` 又在 React 层额外包了一层 `useSelection()`，把 `target`、`summary`、`transformBox`、`affordance` 再次聚合成一个 `SelectionView`。
3. 这个 React 聚合 hook 被 node、edge、selection chrome 多处复用，但它挂在 `features/node/selection.ts` 下，职责命名和目录归属都已经不对。
4. 组件经常为了拿一小块 selection 数据，订阅整套 selection 视图，扩大重渲染面，也放大循环更新风险。
5. editor 层存在旧模型残留，例如 selection read 仍然读取全量 runtime nodes，即使当前 `resolveSelectionBoxTarget()` 已经退化为直通实现。

这块不是简单修一个 hook 就够了，长期最优是整体重构 selection 的分层和消费方式。

## 现状判断

### 1. `editor.read.selection` 本身是否有问题

有问题，但不是“不该存在”，而是“存在得不够收敛”。

selection 是编辑器会话态和交互态的一部分，因此：

- 不应该放到 engine 层。
- 应该继续留在 editor 层。
- 但应该改成更细粒度、更语义化的 read 面。

当前 editor 层做对的部分：

- selection 作为 editor 会话态和交互态的一部分，确实应该由 editor 层统一负责。
- toolbar / overlay 这类 selection chrome 视图模型，确实应该由 editor 层产出，而不是放到 React 里拼装。

当前 editor 层做得不够好的部分：

- `editor.state.selection` 和 `editor.read.selection.target` 同时暴露同一个事实 target，存在重复设计。
- `summary` 过胖，混入了几何和交互前置派生。
- `affordance` 主要服务交互内部，但被挂到了公共 read 面上。
- `presentation` 把 overlay 和 toolbar 绑在一起，粒度仍然偏粗。
- `box` 分散在 `summary`、`transformBox`、`affordance`、`presentation` 之间。
- selection read 还保留了和旧 container / frame 路径有关的多余依赖。

### 2. `whiteboard-react/src/features/node/selection.ts` 职责是否正确

不正确。

这个文件现在承担的是“React 侧 selection 聚合适配器”，但它：

- 不属于 node feature。
- 不只是 hook 封装，而是在重复 editor 已有派生。
- 已经被 edge、selection chrome、node scene 等多个 feature 复用。
- 会诱导后续代码继续依赖一个“大对象 selection view”而不是最小订阅。

因此长期最优不是移动位置，而是删除这类总入口聚合 hook。

## 根因分析

### 1. 事实、派生语义、UI 视图模型混在一起

selection 至少包含三类不同层次的数据：

1. 事实
   - 当前选中了哪些 node/edge
   - 这些对象是否存在、主对象是谁、group 涉及哪些 id
2. 交互语义
   - 能否 move / resize / rotate
   - transform box 是什么
   - move hit body 是否成立
3. UI 视图模型
   - overlay 应该渲染单节点框还是 selection 框
   - toolbar 是否显示，显示什么上下文

当前实现的问题是：

- `summary` 里已经混入一部分 1 和 2。
- `affordance` 再次混入一部分 2。
- `presentation` 又承担 3。
- React 的 `useSelection()` 继续把 1、2、3 混装成一个 `SelectionView`。

这会让 selection API 越来越肥，最终谁都能“顺手再加一段”。

### 2. React 侧错误地承担了 editor 语义聚合

React 层当前多做了两件不该做的事：

1. 重算 `nodeSummary`
2. 重算 `boxState`

这两个本质都不是组件内部私有状态，而是 editor selection 语义的一部分。只要 React 还保留这类二次聚合，后面一定会继续长出第三个、第四个派生字段。

### 3. 订阅粒度过粗

典型问题：

- `EdgeLayer` 只需要 `selectedEdgeIds`，却订阅整套 `useSelection()`
- `useSelectedEdgeView()` 只需要“当前是否单选 edge”与 `edgeId`，却订阅整套 `useSelection()`
- `NodeSceneLayer` 只需要 `selectedNodeIds` / `selectedNodeSet`，却订阅整套 `useSelection()`

这会导致：

- 无关 selection 字段变化也触发这些组件更新
- React effect / memo 更容易错误依赖聚合对象
- 出现最大更新深度问题时，排查面被放大

## 长期最优分层

### Core 层职责

`@whiteboard/core` 只负责纯算法和纯类型：

- `SelectionTarget` 归一化
- selection summary / affordance 推导纯函数
- marquee / press / bounds 等纯决策与推导

core 不负责：

- editor registry
- tool / edit / interaction chrome
- toolbar / overlay 的 UI 视图模型
- React hook

### Editor 层职责

`@whiteboard/editor` 负责：

- selection session state
- 基于文档事实和交互态派生 selection 内部模型
- 对 React 暴露细粒度 read stores
- 产出 overlay / toolbar 等 selection UI 视图模型

editor 是 selection 的主边界层。

### React 层职责

`@whiteboard/react` 只做：

- 订阅 editor read stores
- 渲染
- 处理极局部的组件状态

React 不应该再有 selection 总聚合 hook。

## 最终最小公开 API

这里先给最终结论，再解释原因。

长期最优、最简、无兼容包袱的公开 API 不应该是：

```ts
editor.read.selection.target
editor.read.selection.summary
editor.read.selection.geometry
editor.read.selection.affordance
editor.read.selection.nodeSummary
editor.read.selection.presentation
```

这 6 个里至少有 3 个应该删，另外 2 个应该改名和收口。

最终建议的公开面应当是：

```ts
editor.state.selection

editor.read.selection.box
editor.read.selection.node
editor.read.selection.overlay
editor.read.selection.toolbar
```

如果一定要维持 `editor.read.selection.*` 这一命名空间，也只应保留这 4 个派生读口，不再公开 `target`、`summary`、`affordance`、`presentation`。

### 为什么 `editor.read.selection.target` 应该删除

因为事实 target 已经存在于：

```ts
editor.state.selection
```

它本身就是 selection session state。

当前同时存在：

- `editor.state.selection`
- `editor.read.selection.target`

本质是在暴露同一份数据两次，这是重复设计。

长期最优应该明确边界：

- `editor.state.selection`
  - 唯一的 selection 事实源
  - 类型只保留 `SelectionTarget`
- `editor.read.selection.*`
  - 只放派生读模型

因此：

- `editor.read.selection.target` 应删
- 所有读取当前选中 ids 的地方统一改读 `editor.state.selection`

`SelectionTarget` 也应保持最小：

```ts
type SelectionTarget = {
  nodeIds: readonly NodeId[]
  edgeIds: readonly EdgeId[]
}
```

不应继续公开：

- `nodeSet`
- `edgeSet`
- `groupIds`
- `count`
- `kind`

这些如果内部为了性能需要，可以留在私有 model 中，但不应该出现在公开 target 上。

### 为什么 `summary` 应该删除

`summary` 当前的问题不是“实现不好”，而是“公共抽象就不该存在”。

它把太多维度混在了一起：

- 事实摘要
- 选中实体对象
- group 聚合
- transform 前置信息
- box

从实际使用来看，公开 `summary` 并没有形成清晰边界，反而让调用方习惯性依赖一个万能对象。

而现有公共消费方真正需要的其实是：

- 当前选中 ids
- 当前 selection 的 box
- 纯 node selection 的少量摘要
- toolbar / overlay 视图模型

也就是说：

- `summary` 对内部实现也许有价值
- 但对公开 API 没有价值

长期最优做法：

- 删除公开 `editor.read.selection.summary`
- 如果 editor 内部还需要一份聚合模型，用私有 `selectionModel` 或 `selectionResolved` 承载
- 私有模型不进入 `Editor['read']` 类型

### 为什么 `geometry` 不建议保留为公共对象

`geometry` 这个名字太大，而现在真正稳定、公共、跨组件有价值的只有一件事：

- 当前 selection 的外接 `box`

`transformBox` 并不是公共语义，它只服务于：

- transform interaction
- selection overlay

这两类都不需要一个公共 `geometry` 对象：

- interaction 用私有 selection model
- overlay 直接读 `editor.read.selection.overlay`

所以长期最优不是保留：

```ts
editor.read.selection.geometry
```

而是直接公开：

```ts
editor.read.selection.box
```

类型直接就是：

```ts
ReadStore<Rect | undefined>
```

这样更简单，也更贴近真实用途。

### 为什么 `affordance` 应该删除

`affordance` 只对 editor 内部交互有意义。

它的主要消费者是：

- selection press
- selection transform
- selection chrome 组装

这些都属于 editor 内部实现，不该被挂到公共 API 上。

公开 `affordance` 的问题在于：

- 概念抽象偏内部
- 很容易被 React 层误用
- 和 `box`、`overlay`、`toolbar` 会形成重复语义

长期最优做法：

- 删除公开 `editor.read.selection.affordance`
- 把相关字段并回私有 `selectionModel`
- interaction / chrome builder 直接依赖私有 model

### 为什么 `nodeSummary` 可以保留，但应该缩小并改名

在公开派生模型里，纯 node selection 仍然需要一个很小的摘要面。

原因不是为了 toolbar，toolbar 已经可以走专用 `toolbar` view。
原因是 selection action menu 这类非 toolbar UI 仍然需要：

- 当前是否全锁
- 选中的 node 类型统计

但现在的 `nodeSummary` 仍然偏胖，包含：

- `ids`
- `count`
- `hasGroup`
- `lock`
- `types`
- `mixed`

其中这些都不该公开：

- `ids`
  - 已有 `editor.state.selection`
- `count`
  - 已有 `editor.state.selection.nodeIds.length`
- `mixed`
  - 可由 `types.length > 1` 得出
- `hasGroup`
  - 当前公共消费并不需要

长期最优建议保留一个缩小后的纯 node 读口，最好改名为：

```ts
editor.read.selection.node
```

类型建议为：

```ts
type SelectionNodeInfo = {
  lock: 'none' | 'mixed' | 'all'
  types: readonly SelectionNodeTypeInfo[]
}
```

并且：

- 仅在“纯 node selection”时返回对象
- 其他情况返回 `undefined`

这比公开一个大 `nodeSummary` 更简单。

### 为什么 `presentation` 不该保留为一个总对象

`presentation` 的问题和 React 侧 `useSelection()` 类似：

- 它把 overlay 和 toolbar 两种不同消费面绑在一起了

而当前真实消费方是分离的：

- `NodeOverlayLayer` 只关心 overlay
- `NodeToolbar` 只关心 toolbar

所以长期最优不是保留：

```ts
editor.read.selection.presentation
```

而是拆成两个专用 store：

```ts
editor.read.selection.overlay
editor.read.selection.toolbar
```

这样有几个直接好处：

- 订阅更小
- 类型更直接
- overlay 变更不会强迫 toolbar 跟着更新
- toolbar 变更不会强迫 overlay 跟着更新

## 公开 API 的最终结论

### 应保留

```ts
editor.state.selection
editor.read.selection.box
editor.read.selection.node
editor.read.selection.overlay
editor.read.selection.toolbar
```

### 应删除

```ts
editor.read.selection.target
editor.read.selection.summary
editor.read.selection.geometry
editor.read.selection.affordance
editor.read.selection.nodeSummary
editor.read.selection.presentation
editor.read.selection.transformBox
```

其中：

- `target` 删除不是功能删除，而是回归到 `editor.state.selection`
- `nodeSummary` 删除是因为要被更小的 `node` 取代
- `presentation` 删除是因为要拆成 `overlay` 和 `toolbar`
- `geometry` 删除是因为 `box` 足够
- `affordance` 和 `summary` 删除是因为它们都应退回内部实现层

## editor 内部最小私有模型

公开 API 变小，不代表 editor 内部不能有一份聚合模型。

恰恰相反，长期最优应该是：

- editor 内部保留一份私有 `selectionModel`
- 所有复杂推导都围绕它集中
- 公开面只从它派生出最小读口

建议的私有模型大致如下：

```ts
type SelectionModel = {
  target: SelectionTarget
  nodes: readonly Node[]
  edges: readonly Edge[]
  groups: {
    ids: readonly GroupId[]
    primaryId?: GroupId
  }
  primaryNode?: Node
  primaryEdge?: Edge
  box?: Rect
  transformBox?: Rect
  interaction: {
    canMove: boolean
    canResize: boolean
    canRotate: boolean
    dragSelectionBox: boolean
    showSingleNodeOverlay: boolean
    owner: 'none' | 'single-node' | 'multi-selection'
    ownerNodeId?: NodeId
  }
}
```

注意：

- 这份 model 只用于 editor 内部
- 不进入 `Editor['read']`
- interaction、overlay、toolbar 都直接依赖它

## React 层最终形态

### 总原则

取消 `useSelection()` 这种总聚合 hook，按组件用途直接订阅 editor 的最小 read store。

### 建议消费方式

`NodeOverlayLayer`

- 只订阅 `editor.read.selection.overlay`

`NodeToolbar`

- 只订阅 `editor.read.selection.toolbar`

`NodeSceneLayer`

- 只订阅 `editor.state.selection`
- 不应为了 `selected` 判定订阅整个 selection view

`EdgeLayer`

- 只订阅 `editor.state.selection`
- 不应依赖 node feature 下的 selection hook

`SelectionActionMenu`

- 订阅：
  - `editor.state.selection`
  - `editor.read.selection.node`
  - 需要定位时再读 `editor.read.selection.box`

`useSelectedEdgeView()`

- 只订阅 `editor.state.selection`
- 不应依赖整套 `useSelection()`

## 目录与命名调整

### 要删除的文件

应删除：

- `whiteboard/packages/whiteboard-react/src/features/node/selection.ts`

原因：

- 目录归属错误
- 职责越界
- 会继续诱导大对象订阅

### 不建议新增的新文件形态

不建议把它简单搬到：

- `features/selection/useSelection.ts`
- `runtime/hooks/useSelection.ts`

因为这只是换位置保留旧问题。

### 可以接受的轻量 hook 形态

如果确实需要 hook 便利层，只允许保留极窄接口，例如：

- `useSelectedNodeIds()`
- `useSelectedEdgeIds()`
- `useSelectionBox()`
- `useSelectionOverlay()`
- `useSelectionToolbar()`
- `useSelectionNodeInfo()`

每个 hook 只对应一个 store，不做跨 store 聚合，不返回万能对象。

## 一步到位重构内容

### 第一部分：editor selection read 收口

1. 删除 `editor.read.selection.target`，统一以 `editor.state.selection` 作为 selection 事实源。
2. 删除 selection read 中对全量 runtime nodes 的无效依赖。
3. 在 editor 内部建立私有 `selectionModel`，取代公开的 `summary`、`transformBox`、`affordance`。
4. 从私有 model 只派生公开的：
   - `box`
   - `node`
   - `overlay`
   - `toolbar`

### 第二部分：React selection 聚合层删除

1. 删除 `whiteboard-react/src/features/node/selection.ts`
2. 删除 `features/node/index.ts` 中对 `useSelection` 的导出
3. 所有 consumer 改成直接订阅 editor 的最小 selection read

### 第三部分：selection consumers 拆小

重点清理：

1. `EdgeLayer`
2. `useSelectedEdgeView()`
3. `NodeSceneLayer`
4. `SelectionActionMenu`
5. `NodeOverlayLayer`
6. `NodeToolbar`

其中：

- overlay 只使用 `overlay`
- toolbar 只使用 `toolbar`
- scene layer / edge layer / selected edge hook 只使用 `editor.state.selection`
- action menu 只使用 `editor.state.selection`、`node`、`box`

### 第四部分：interaction 与公开 API 解耦

1. `InteractionContext` 不应再依赖公开 `Editor['read']['selection']` 的胖接口。
2. selection press / transform 所需能力统一改读私有 `selectionModel`。
3. 公开 read 面只服务于外部消费和 React 渲染，不再反向约束 editor 内部实现。

## 实施方案

### 第一步：先收 state / read 边界

目标：

- 明确 `editor.state.selection` 是唯一事实源
- `editor.read.selection` 从“事实 + 派生混合”改成“只放派生”

实施：

1. 调整 `Editor` 类型定义，删掉 `editor.read.selection.target`。
2. 所有读取当前 selection ids 的代码统一改读 `editor.state.selection`。
3. `EditorState['selection']` 保持不变，继续直接映射 runtime selection source。

涉及文件：

- `whiteboard/packages/whiteboard-editor/src/types/editor.ts`
- `whiteboard/packages/whiteboard-editor/src/runtime/state/index.ts`
- `whiteboard/packages/whiteboard-editor/src/runtime/read/index.ts`

### 第二步：建立私有 selectionModel

目标：

- 把当前 `summary`、`transformBox`、`affordance` 的内部依赖收束成一份私有 model
- 以后 selection 内部复杂度只在 editor 内部存在一次

实施：

1. 新建 editor 内部 selection model 模块。
2. 由 `target`、node/edge read、bounds query、registry capability 等输入统一产出私有 model。
3. 删除公开 `summary`、`transformBox`、`affordance`。

涉及文件：

- `whiteboard/packages/whiteboard-editor/src/runtime/read/selection.ts`
- `whiteboard/packages/whiteboard-editor/src/interactions/selection/press.ts`
- `whiteboard/packages/whiteboard-editor/src/interactions/transform.ts`

### 第三步：从私有 model 派生最小公开读口

目标：

- 只暴露外部真实需要的 4 个 selection 派生读口

实施：

1. `box`
   - 从私有 model 直接导出 selection 外接框
2. `node`
   - 仅在纯 node selection 时导出精简 node 信息
3. `overlay`
   - 产出 node overlay / selection overlay 的直接视图模型
4. `toolbar`
   - 产出 toolbar 的直接视图模型

这里的原则是：

- 不再暴露中间推导对象
- 公开的 store 要尽量接近最终消费面

涉及文件：

- `whiteboard/packages/whiteboard-editor/src/runtime/read/selection.ts`
- `whiteboard/packages/whiteboard-editor/src/runtime/read/selectionPresentation.ts`
- `whiteboard/packages/whiteboard-editor/src/selection/nodeSummary.ts`
- `whiteboard/packages/whiteboard-editor/src/types/selectionPresentation.ts`

### 第四步：React 侧改成最小订阅

目标：

- 删除 React 聚合 selection hook
- 所有组件按用途直接订阅最小 store

实施：

1. 删除 `whiteboard-react/src/features/node/selection.ts`
2. `EdgeLayer` / `NodeSceneLayer` / `useSelectedEdgeView()` 改读 `editor.state.selection`
3. `SelectionActionMenu` 改读：
   - `editor.state.selection`
   - `editor.read.selection.node`
   - `editor.read.selection.box`
4. `NodeOverlayLayer` 改读 `editor.read.selection.overlay`
5. `NodeToolbar` 改读 `editor.read.selection.toolbar`

涉及文件：

- `whiteboard/packages/whiteboard-react/src/features/node/selection.ts`
- `whiteboard/packages/whiteboard-react/src/features/node/index.ts`
- `whiteboard/packages/whiteboard-react/src/features/node/components/NodeSceneLayer.tsx`
- `whiteboard/packages/whiteboard-react/src/features/edge/components/EdgeLayer.tsx`
- `whiteboard/packages/whiteboard-react/src/features/edge/hooks/useEdgeView.ts`
- `whiteboard/packages/whiteboard-react/src/features/selection/chrome/panels/SelectionActionMenu.tsx`
- `whiteboard/packages/whiteboard-react/src/features/node/components/NodeOverlayLayer.tsx`
- `whiteboard/packages/whiteboard-react/src/features/selection/chrome/NodeToolbar.tsx`

### 第五步：删掉旧命名与旧类型

目标：

- 不留双轨
- 不让旧概念继续存活

必须删除：

- `SelectionRead['target']`
- `SelectionRead['summary']`
- `SelectionRead['geometry']`
- `SelectionRead['transformBox']`
- `SelectionRead['affordance']`
- `SelectionRead['nodeSummary']`
- `SelectionRead['presentation']`
- React 侧 `useSelection`

应该新增：

- `SelectionRead['box']`
- `SelectionRead['node']`
- `SelectionRead['overlay']`
- `SelectionRead['toolbar']`

## 明确不做的事

这次重构不应做这些折中方案：

1. 不保留旧的 `useSelection()` 兼容导出
2. 不保留“旧 hook + 新 store”双轨
3. 不做仅移动文件位置的伪重构
4. 不把 selection 下沉到 engine
5. 不让 React 继续持有 editor 语义派生职责

## 预期收益

### 架构收益

- selection 事实、内部交互模型、公开 UI 读口三层边界清晰
- editor 成为 selection 唯一语义边界层
- React 回归最小订阅和渲染职责

### 运行时收益

- 减少无关 selection 变化带来的重渲染
- 降低循环更新和最大更新深度问题的触发概率
- 缩小 selection 问题排查面

### 维护收益

- 后续新增 selection UI 时，不会再顺手把逻辑塞进 React 聚合 hook
- node / edge / selection chrome 的依赖关系更明确
- selection API 更容易被约束，不会继续膨胀

## 最终判断

结论如下：

1. `editor.read.selection.target` 不该存在，selection target 只应保留在 `editor.state.selection`。
2. `editor.read.selection.summary` 和 `editor.read.selection.affordance` 都不该作为公开 API 存在，应退回 editor 私有实现层。
3. `editor.read.selection.geometry` 不值得保留为公共对象，公开 `box` 即可。
4. `editor.read.selection.nodeSummary` 可以保留其语义，但应缩小并改名为 `editor.read.selection.node`。
5. `editor.read.selection.presentation` 不该保留为总对象，应拆成 `editor.read.selection.overlay` 和 `editor.read.selection.toolbar`。
6. `whiteboard-react/src/features/node/selection.ts` 职责不对，长期最优是删除，不是迁移。
7. React 层应该按组件用途直接订阅最小 selection store，不再存在总入口 `useSelection()`。
8. 如果全面重构，应该一步到位，不保留兼容层和两套实现。
