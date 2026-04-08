# Whiteboard 删除后残留 Selection Chrome 的长期最优方案

## 问题定义

当前 whiteboard 在删除以下目标后，偶发或稳定出现 selection chrome 残留：

- 删除单个 node 后，node toolbar、selection box、handles 还留在原位置
- 删除 group 后，同样残留
- 删除多选 nodes 后，同样残留

这里的 `selection chrome` 指：

- `NodeToolbar`
- selection frame / selection box
- transform handles
- 单节点 transform overlay

这个问题的本质不是视觉层没隐藏，而是“删除后的 selection 相关派生状态没有被统一收敛为一个空态”。

## 当前代码现状

### 删除链路本身已经做了 selection clear

React 侧删除 helper 在删除成功后已经显式清空 selection：

- [whiteboard/packages/whiteboard-react/src/runtime/commands.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/runtime/commands.ts)

Editor runtime 在 commit 后还会再次按当前文档存在性裁剪 selection：

- [whiteboard/packages/whiteboard-editor/src/runtime/state/index.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/state/index.ts)

因此，这个问题不能简单归因为“delete 之后没有 clear selection”。

### React 正在自行拼装 selection presentation

当前 `useSelectionPresentation()` 的输入是多份独立 store：

- `selection.target`
- `selection.summary`
- `selection.transformBox`
- `selection.affordance`
- `tool`
- `edit`
- `interaction`

然后 React 在本地把它们重新组装为最终 chrome：

- [whiteboard/packages/whiteboard-react/src/features/node/selection.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/features/node/selection.ts)

问题在于，这意味着 selection chrome 的真相并不只存在于 editor 一处，而是：

- editor 提供一部分原始/派生状态
- React 再做一次 presentation 拼装
- `NodeToolbar` 还有自己的本地定位 session

状态来源被拆散后，只要其中任意一段派生在删除时没有同步归零，就会表现成残留 chrome。

### 实际 UI 都依赖这份 React 侧 presentation

Selection frame / handles / single-node overlay：

- [whiteboard/packages/whiteboard-react/src/features/node/components/NodeOverlayLayer.tsx](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/features/node/components/NodeOverlayLayer.tsx)

Node toolbar：

- [whiteboard/packages/whiteboard-react/src/features/selection/chrome/NodeToolbar.tsx](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/features/selection/chrome/NodeToolbar.tsx)

也就是说，只要这份 presentation 没有被严格收敛为空，所有 chrome 都可能留在画面上。

## 根因判断

长期视角下，根因不是某一个 delete 分支忘记 clear，而是以下架构问题：

1. selection chrome 的最终可见性不由 editor 单点决定
2. 空 selection 没有被定义成“必须无 chrome”的强约束
3. 删除、剪切、外部 document 变更之后，transient chrome 没有统一收口
4. React 层承担了过多 selection presentation 拼装责任

因此，这不是一个适合在 `deleteSelectionAndClear()` 里打补丁解决的问题。

## 长期最优目标

目标是把 selection chrome 变成 editor 的单一派生状态，React 只消费，不再自行拼装。

最终原则：

1. Editor 是 selection chrome 的唯一真相源
2. 只要 selection 为空，chrome 必须严格为空
3. 删除、剪切、结构性变更、commit reconcile 后，chrome 自动稳定归零
4. React 不再理解 selection affordance 细节，只根据 editor 给出的 presentation 渲染

## 推荐方案

### 方案核心

在 editor 侧新增统一的 `selection.presentation` read store，作为 selection chrome 的唯一输出。

这份 presentation 应统一包含：

- 当前 selection 是否可见
- 是否显示 toolbar
- 是否显示 selection frame
- 是否显示 handles
- 是否显示 single-node overlay
- single transform node id
- 已解析的 box / transform box
- toolbar 所需的最小上下文

React 不再直接分别订阅：

- `selection.summary`
- `selection.transformBox`
- `selection.affordance`
- `tool`
- `edit`
- `interaction`

而是只订阅：

- `editor.read.selection.presentation`

### 为什么必须放在 editor，而不是继续放在 React

因为 selection chrome 的业务约束本质上属于 editor 运行时，而不是 UI 组件：

- selection 是否为空
- 当前是否 editing
- 当前是否处于 transform
- 当前是否允许显示 chrome
- 删除/commit 后是否应该归零

这些都不是纯视觉逻辑，而是编辑器状态机的一部分。

如果继续放在 React：

- 逻辑会继续分散
- 以后任何 destructive action 都要额外想到“还有哪些 chrome 要清”
- toolbar / overlay / handles 会继续共享一份不够强约束的松散 presentation

## 目标状态设计

### 字段设计原则

之前那种平铺字段：

- `visible`
- `empty`
- `selectionKind`
- `box`
- `transformBox`
- `showToolbar`
- `showSelectionFrame`
- `showSelectionHandles`
- `showSingleNodeOverlay`
- `singleTransformNodeId`
- `toolbarContext`

不适合作为长期结构，原因有三个：

1. 冗余明显。`visible`、`empty`、`selectionKind` 之间语义重叠。
2. `showXxx` 平铺过多，字段名长，而且都暴露了中间判断细节。
3. 它鼓励 React 继续做“字段重新拼装”，而不是直接消费一个可渲染结构。

长期最优设计应该满足：

1. 用判别联合表达“有没有 selection”，不要再单独放 `visible` / `empty`
2. 用嵌套对象表达“几何信息”和“chrome 信息”，不要平铺一排 `showXxx`
3. 结构直接对齐最终渲染分支，而不是对齐中间推导过程

### 最终推荐结构

推荐在 editor 层定义唯一的 `SelectionPresentation`，使用判别联合加分组字段：

```ts
type SelectionPresentation =
  | {
      kind: 'none'
    }
  | {
      kind: 'node' | 'nodes' | 'group' | 'mixed'
      geometry: {
        box: Rect
        transformBox?: Rect
      }
      overlay:
        | {
            kind: 'selection'
            frame: boolean
            handles: boolean
          }
        | {
            kind: 'node'
            nodeId: NodeId
            handles: boolean
          }
      toolbar?: ToolbarContext
    }
```

这个结构的优点：

1. `kind: 'none'` 已经覆盖“空 selection”语义，不再需要 `visible` 和 `empty`
2. `kind: 'node' | 'nodes' | 'group' | 'mixed'` 已经表达 selection 类型，不再需要单独的 `selectionKind`
3. `geometry` 集中收纳 `box` / `transformBox`，避免字段散落
4. `overlay` 直接表达最终渲染分支，不再需要：
   - `showSelectionFrame`
   - `showSelectionHandles`
   - `showSingleNodeOverlay`
   - `singleTransformNodeId`
5. `toolbar` 直接按“有或没有”建模，不再需要 `showToolbar`

换句话说，最终渲染时应该直接按结构判断：

- `presentation.kind === 'none'`，什么都不渲染
- `presentation.overlay.kind === 'selection'`，渲染 selection frame / handles
- `presentation.overlay.kind === 'node'`，渲染 single-node overlay
- `presentation.toolbar` 存在时，渲染 toolbar

而不是再做一轮 `showXxx` 判断拼装。

### 为什么 `overlay` 要用判别联合

因为当前最容易出问题的地方正是 overlay 表达被拆碎了：

- frame 是否显示
- handles 是否显示
- 是否是单节点 overlay
- 单节点 overlay 对应哪个 node

这些信息如果继续拆成多个平铺字段，消费方很容易重新拼出非法组合，例如：

- `showSingleNodeOverlay = true` 但 `singleTransformNodeId = undefined`
- `showSelectionFrame = true` 且同时存在 single-node overlay
- `showSelectionHandles = true` 但没有 `transformBox`

`overlay` 改成判别联合后，非法组合在类型层就会大幅减少。

### 空 selection 的强约束

必须显式规定：

1. `summary.items.count === 0` 时，presentation 直接返回 `{ kind: 'none' }`
2. `kind: 'none'` 是唯一允许的空态
3. 空态下不存在任何补充字段：
   - 没有 `geometry`
   - 没有 `overlay`
   - 没有 `toolbar`

这样即便内部某些中间 derived store 短暂滞后，也不会把旧 chrome 泄漏到 UI。

## 运行时收敛策略

### 删除后不只 clear selection，还要收敛 selection chrome

长期最优方案里，不应再把“删除后清理 chrome”的责任放在 React helper。

正确做法是：

- 删除命令修改文档
- commit 到来后 editor reconcile selection
- selection presentation 基于最新 selection 和 interaction/edit 状态统一产出空态

如果 commit 后 selection 为空，但 interaction / overlay 还残留某些 transient 信息，也必须在 editor runtime 统一归零。

也就是说，editor runtime 需要明确拥有一个规则：

- 当当前 selection 在 commit 后被裁剪为空时，selection chrome 相关 transient state 必须被视为失效

### 不要把清理逻辑散落到各个 UI 组件

不推荐在这些地方单独加防御式逻辑：

- `NodeToolbar`
- `NodeOverlayLayer`
- `SelectionFrameOverlay`
- `SelectionHandlesOverlay`

这些组件可以有最薄的一层空态判断，但不应该各自承担状态修正职责。

否则结果会是：

- toolbar 修好了
- handles 还残留
- 以后又有新的 chrome 漏掉

## React 层最终职责

React 层的职责应该被压缩到两件事：

1. 订阅 `editor.read.selection.presentation`
2. 按 presentation 直接渲染

这里要明确：

- 不保留 React 侧 selection presentation 组装层
- 不保留“先读旧字段，再映射成新字段”的兼容层
- 不保留“薄封装 hook”继续包装 editor presentation

也就是说，React 不应该再存在一个类似：

- `useSelectionPresentation()`
- `resolveSelectionPresentation()`
- `resolveSelectionView()`

这种中间组装层来重新解释 editor 语义。

正确做法是：

- `NodeOverlayLayer` 直接读 `editor.read.selection.presentation`
- `NodeToolbar` 直接读 `editor.read.selection.presentation`
- 如有需要，只允许存在非常薄的“订阅 store”工具，不允许存在字段重组逻辑

### NodeOverlayLayer

未来应直接消费 editor 给出的：

- `presentation.kind`
- `presentation.geometry`
- `presentation.overlay`

它只做渲染分支：

- `kind === 'none'` 直接返回 `null`
- `overlay.kind === 'selection'` 渲染 frame / handles
- `overlay.kind === 'node'` 渲染 node overlay

它不再重新理解 affordance、owner、transformBox 的组合关系。

### NodeToolbar

未来应直接消费 editor 给出的：

- `presentation.toolbar`
- anchor / placement 所需信息

`NodeToolbar` 只保留自身纯 UI 的临时状态：

- 当前打开哪个 panel
- 本地 popover 定位 session

它不应该再决定 selection 是否有效，也不应该自己推断 selection 是否应显示 toolbar。

## 明确禁止保留的中间层

在“不留兼容”的前提下，以下层必须直接删除，而不是保留过渡：

1. React 侧的 selection presentation 组装层
2. 旧字段到新字段的映射层
3. `editor.read.selection.presentation` 的薄封装 hook
4. 任何把 `overlay` 再拆回 `showXxx` 字段的适配层

这意味着实现时要直接：

1. 在 editor 层产出最终 `SelectionPresentation`
2. 删除 React 侧 `selection.ts` 中与 presentation 组装相关的逻辑
3. 让消费方直接改读新结构

不做：

1. “先保留旧 API，再慢慢迁移”
2. “先做一个新 hook，内部转调旧 hook”
3. “先在 React 再包一层，后面有空再删”

## 不推荐的短期补丁

以下方案都不是长期最优：

### 1. 只修改 `deleteSelectionAndClear()`

例如在删除后额外调用若干 clear / reset：

- 只能覆盖这一条删除路径
- cut、外部命令、未来新命令仍可能漏
- 把 editor 真相继续分散到 React helper

### 2. 只在 React 组件里加 `if (!count) return null`

这类补丁虽然能暂时止血，但本质问题不变：

- 真相仍然分散
- 以后会在别的 chrome 上复发
- React 继续理解过多 editor 语义

### 3. 让 `NodeToolbar` 自己在 effect 里更多 reset 本地状态

这最多只能修 toolbar，修不了 selection frame / handles / single-node overlay。

## 一步到位实施建议

### 第一阶段

在 editor 层新增统一的 `selection.presentation` read store。

它内部整合：

- `selection.target`
- `selection.summary`
- `selection.transformBox`
- `selection.affordance`
- `tool`
- `edit`
- `interaction`

### 第二阶段

直接删除 React 侧的 selection presentation 组装层，不做薄封装，不做兼容映射。

### 第三阶段

让以下 UI 全部直接消费 editor presentation：

- `NodeOverlayLayer`
- `NodeToolbar`
- 任何未来 selection chrome

### 第四阶段

在 editor runtime 明确 selection 为空时的 transient chrome 收敛规则，不再依赖单个命令手动清理。

## 最终结论

这个 bug 的长期最优解不是“补 delete 后清理”，而是：

- 把 selection chrome 从 React 回收进 editor
- 建立单一的、结构化的 `selection.presentation`
- 用判别联合和分组字段替代平铺 `showXxx`
- 把“空 selection 必无 chrome”做成 editor 级强约束
- 直接删除 React 侧组装层、薄封装、兼容层
- 让 React 完全退化为 presentation consumer

这是成本更高的方案，但它能一次性解决：

- 删除后残留 toolbar
- 删除后残留 selection box
- 删除后残留 handles
- 未来其他 destructive action 的同类 stale chrome 问题

在“不在乎成本，优先长期最优，不留兼容”的前提下，这是正确方向。
