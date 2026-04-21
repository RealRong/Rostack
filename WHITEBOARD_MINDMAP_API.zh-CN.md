# Whiteboard Mindmap API

本文定义 whiteboard `mindmap` 这条线的长期最优模型、API 与实施方案。

目标固定为：

- 模型最少
- 职责最清
- 最不容易出错
- 性能不低于现状
- 不考虑重构成本
- 不保留兼容层

本文不重复设计过程，只给最终结论。

---

## 1. 固定结论

长期最优下，`mindmap` 必须收敛为下面五条硬规则：

1. `root` 和 `topic` 都是普通 `node`，继续参与 selection、toolbar、edge connect、node.read。
2. `mindmap` 自身是显式的 canvas scene entity，不再借 `root node` 充当顶层场景入口。
3. generic `node` 渲染链不再判断 `mindmapRoot`，也不再承担 scene 编排职责。
4. `mindmap` 的读取链只保留四层：`structure -> layout -> scene -> chrome`。
5. `editor` 不再自己拼 `mindmap scene`，只保留交互 chrome 与 intent dispatch。

一句话：

- `node` 负责“单个节点是什么”
- `mindmap` 负责“树如何组织、如何布局、如何作为场景渲染”
- `canvas` 负责“顶层显示什么场景实体”

---

## 2. 当前复杂度的根因

当前 `mindmap` 容易出错，不是因为层数多，而是因为同一个语义被重复表达了多次。

典型问题：

- `root node` 既被当作普通 `node`，又被当作 `mindmap scene entry`
- generic node renderer 里出现 `mindmapRoot` 这类场景级分支
- `childNodeIds` 这种字段名表达“children”，实际却包含整棵 subtree
- `engine -> editor -> react` 之间多次包一层 view model，但没有真正减少复杂度
- `editor` 里仍有一层“半 scene / 半 chrome”的拼装逻辑

这些问题会导致三个后果：

1. 一个布尔值同时承担多种职责，一改就容易把 root 从所有场景都隐藏掉。
2. 同一个事实在多个层里重复推导，很难知道哪一层才是真相源。
3. React 侧不得不补过滤、补特判、补命名修正，复杂度不断外溢。

---

## 3. 最终数据模型

## 3.1 `CanvasItemRef`

长期最优下，canvas 顶层实体必须显式支持 `mindmap`。

```ts
type CanvasItemRef =
  | { kind: 'node'; id: NodeId }
  | { kind: 'edge'; id: EdgeId }
  | { kind: 'mindmap'; id: MindmapId }
```

约束：

- 顶层 `mindmap` 通过 `{ kind: 'mindmap' }` 进入 canvas
- `mindmap root` 不再作为 top-level node 出现在 canvas order
- `node` 仍然完整存在于 document / selection / edge / toolbar 链路中

这一步是整条线最关键的收束点。

只要 `mindmap` 继续借 `root node` 作为 canvas 入口，后续就一定会在 `node` 层残留场景特判。

---

## 3.2 `NodeOwner`

`topic` 与 `root` 继续保留在 generic `node` 体系中。

```ts
type NodeOwner =
  | { kind: 'mindmap'; id: MindmapId }
  | undefined
```

约束：

- `owner == null` 表示普通 document node
- `owner.kind === 'mindmap'` 表示该 node 属于某棵树
- `root` 不再通过额外 role / flag / hidden rule 表达
- `root` 的唯一判定方式是：`document.mindmaps[mindmapId].root === node.id`

长期最优下，`document` 不是一个显式 owner。

也就是说：

- `canvas` 决定顶层显示什么
- `owner` 只表达“是否被结构容器接管”

不再允许出现：

- `mindmapRoot` 挂在 generic node render 上
- `owner.id === node.id` 这类历史残留语义
- UI 自己猜谁是 root
- `{ kind: 'document' }` 这类没有额外信息量的 owner 分支

---

## 3.3 `MindmapRecord`

长期最优下，`mindmap` 的结构真相源只保留一个 record。

```ts
type MindmapTopicRecord = {
  parentId?: NodeId
  children: readonly NodeId[]
  side?: 'left' | 'right'
  collapsed?: boolean
  branch?: MindmapBranchStyle
}

type MindmapRecord = {
  id: MindmapId
  root: NodeId
  layout: MindmapLayoutSpec
  topics: Record<NodeId, MindmapTopicRecord>
}
```

约束：

- 结构关系只存在于 `mindmap record`
- 文本、尺寸、颜色、锁定、selection 等 node 本体语义继续留在 `node`
- `mindmap` 不再维护第二份“节点内容镜像”

---

## 4. 最终读取链

长期最优下，`mindmap` 读取链固定为：

1. `structure`
2. `layout`
3. `scene`
4. `chrome`

只有这四层，不能再加第五层 view model。

---

## 4.1 `structure`

`structure` 是纯树结构读取，不包含几何，不包含 UI 状态。

位置：

- `whiteboard-core/src/mindmap/*` 提供纯函数
- `whiteboard-engine/src/read/store/mindmap/structure.ts` 提供缓存读层

```ts
type MindmapStructure = {
  id: MindmapId
  rootId: NodeId
  nodeIds: readonly NodeId[]
  topics: Readonly<Record<NodeId, MindmapTopicRecord>>
  layout: MindmapLayoutSpec
}

type MindmapStructureRead = {
  list: ReadStore<readonly MindmapId[]>
  get(id: MindmapId): MindmapStructure | undefined
}
```

约束：

- `nodeIds` 表示整棵 subtree，不再出现 `childNodeIds` 这种误导命名
- `structure` 不能包含 `bbox`、`connector path`、`selected`、`editing`
- `structure` 只在 document / relevant record 改变时失效

---

## 4.2 `layout`

`layout` 只负责把树结构映射成节点几何与连接线原始数据。

位置：

- `whiteboard-core/src/mindmap/layout.ts`
- `whiteboard-engine/src/read/store/mindmap/layout.ts`

```ts
type MindmapLayoutResult = {
  id: MindmapId
  rootId: NodeId
  bbox: Rect
  nodeRectById: ReadonlyMap<NodeId, Rect>
  connectors: readonly MindmapRenderConnector[]
}

type MindmapLayoutRead = {
  get(id: MindmapId): MindmapLayoutResult | undefined
}
```

约束：

- `layout` 只依赖：
  - `structure`
  - topic node size
  - root anchor position
  - layout spec
- `layout` 不关心 selection / edit / hover
- `layout` 是唯一 node rect 真相源

不再允许：

- editor 再包一层 rootRect / childNodeIds / connector copies
- react 再自己过滤 root / 重组 bbox / 重新算 connector

---

## 4.3 `scene`

`scene` 是给渲染层消费的最小场景对象。

位置：

- `whiteboard-engine/src/read/store/mindmap/scene.ts`

```ts
type MindmapScene = {
  id: MindmapId
  rootId: NodeId
  nodeIds: readonly NodeId[]
  bbox: Rect
  connectors: readonly MindmapRenderConnector[]
}

type MindmapSceneRead = {
  get(id: MindmapId): MindmapScene | undefined
}
```

`scene` 只解决一个问题：

- “一棵树作为一个 canvas scene 应该渲染什么”

它不解决：

- 加号按钮
- 键盘导航
- 当前是否在编辑
- 当前是否 selected

这些都属于 `chrome`。

---

## 4.4 `chrome`

`chrome` 是唯一允许依赖 selection / edit / hover 的 mindmap 读层。

位置：

- `whiteboard-editor/src/query/mindmap/chrome.ts`

```ts
type MindmapAddChildTarget = {
  targetNodeId: NodeId
  placement: 'left' | 'right'
  x: number
  y: number
}

type MindmapChrome = {
  addChildTargets: readonly MindmapAddChildTarget[]
}

type MindmapChromeRead = {
  get(id: MindmapId): MindmapChrome | undefined
  navigate(input: {
    id: MindmapId
    fromNodeId: NodeId
    direction: 'parent' | 'first-child' | 'prev-sibling' | 'next-sibling'
  }): NodeId | undefined
}
```

约束：

- `chrome` 只能读：
  - `mindmap scene`
  - `selection`
  - `edit`
  - `node rect`
- `chrome` 不得生成第二份 scene
- `chrome` 不得持有缓存树结构镜像

---

## 5. 最终渲染链

长期最优下，React 渲染必须改成“显式场景 + 纯节点 body”。

---

## 5.1 顶层 canvas

Canvas 顶层只按 `CanvasItemRef` 渲染。

```ts
type CanvasSceneItem =
  | { kind: 'node'; id: NodeId }
  | { kind: 'edge'; id: EdgeId }
  | { kind: 'mindmap'; id: MindmapId }
```

渲染规则：

- `node` -> `NodeSceneItem`
- `edge` -> `EdgeSceneItem`
- `mindmap` -> `MindmapSceneItem`

这一步之后，不再允许由 `NodeItem` 去判断“我其实应该渲染整棵树”。

---

## 5.2 `MindmapSceneItem`

```ts
type MindmapSceneItemProps = {
  mindmapId: MindmapId
}
```

内部只做三件事：

1. 读取 `scene`
2. 渲染 connectors
3. 渲染 scene 内的所有 node bodies 与 chrome

固定结构：

```tsx
<>
  <MindmapConnectors mindmapId={id} />
  <MindmapNodes mindmapId={id} />
  <MindmapChrome mindmapId={id} />
</>
```

---

## 5.3 `NodeBodyItem`

长期最优下，`CanvasNodeSceneItem` 应重命名为 `NodeBodyItem`。

```ts
type NodeBodyItemProps = {
  nodeId: NodeId
}
```

硬约束：

- `NodeBodyItem` 永远只渲染一个 node body
- 不再判断 `mindmap root`
- 不再判断“当前是否应该展开成整棵树”
- pick 注册、node definition render、selection data 都留在这里

也就是说：

- `NodeBodyItem` 只关心 node
- `MindmapSceneItem` 只关心 scene

这两个职责必须彻底拆开。

---

## 5.4 root 渲染规则

root 的最终规则非常简单：

- root 是一条普通 node body
- root 属于某个 `MindmapSceneItem`
- root 不再承担 scene entry 职责

因此不再需要：

- `mindmapRoot` render flag
- `if (isMindmapRoot) return null`
- `NodeItem` 里分支到 `MindmapTreeView`

---

## 6. 最终 node 读取边界

长期最优下，`node.read` 只保留 node 维度的事实。

```ts
type NodeRender = {
  nodeId: NodeId
  node: Node
  rect: Rect
  bounds: Rect
  rotation: number
  hovered: boolean
  hidden: boolean
  resizing: boolean
  patched: boolean
  selected: boolean
  edit: NodeRenderEdit | undefined
  canConnect: boolean
  canResize: boolean
  canRotate: boolean
}
```

必须删除：

- `mindmapRoot`
- generic node render 上的 scene 级判定
- 任何“如果这是 root 就不要渲染”的逻辑

允许保留：

- 通过 `owner.kind === 'mindmap'` 从 `mindmap layout` 读取几何 patch

也就是：

- node 可以读取“我的 rect 在哪里”
- node 不再读取“我是不是整个 scene 的顶层入口”

---

## 7. 最终写入链

长期最优下，`mindmap` 写入主轴保持两类语义：

1. `mindmap` 结构语义
2. `node` 内容语义

---

## 7.1 `mindmap` 语义

继续由 `mindmap` command / operation 负责：

- create
- delete
- move
- insert child / sibling / parent
- remove subtree
- move subtree
- branch style patch
- collapse / expand

其中顶层移动应明确表达为：

```ts
type MindmapCommand =
  | {
      type: 'mindmap.move'
      id: MindmapId
      position: Point
    }
```

不再要求 UI 通过“拖 root node”去隐式表达整棵树移动。

UI 可以从 root 上发起交互，但正式提交语义必须是 `mindmap.move`。

---

## 7.2 `node` 语义

继续由 generic `node` command 负责：

- 文本修改
- 尺寸修改
- style patch
- lock
- selection / toolbar / edge connect 相关读取

topic 与 root 都不再是写入特例。

---

## 7.3 editor 边界

`editor` 对 `mindmap` 的职责只保留：

- 交互 preview
- payload normalize
- 单次 intent dispatch
- chrome read

不再允许：

- editor 重新拼一套 tree scene
- editor 再缓存 `rootRect`、`childNodeIds`
- editor 自己决定 root 是不是 scene entry

---

## 8. 性能硬约束

长期最优方案必须满足下面这些性能条件，任何重构都不能退化。

### 8.1 不增加额外 diff

继续使用 ref-based invalidation：

- `structure` 只在 mindmap record 变更时失效
- `layout` 只在结构、root position、topic size、layout spec 变更时失效
- `scene` 只在 `layout` 或 `structure.nodeIds` 改变时失效
- `chrome` 只在 scene / selection / edit 改变时失效

不引入最终阶段全量 diff。

### 8.2 node rect 仍然是 O(1)

任意 `nodeId` 的最终 rect 读取必须保持 O(1)：

- generic document node 直接读 node item
- mindmap owned node 直接读 `layout.nodeRectById`

不允许在 `node.read` 内部做 tree walk。

### 8.3 顶层渲染不再额外过滤

React 侧不再做：

- `childNodeIds.filter(id !== rootId)`
- root scene entry 判断
- scene / body 双重分支

这会减少额外分配，也减少无效分支。

### 8.4 scene 对象保持稳定

`MindmapScene` 只有在真正场景变化时才创建新对象。

其中这些字段必须稳定：

- `nodeIds`
- `connectors`
- `bbox`

不能在 hook / component 内临时重组。

### 8.5 chrome 与 scene 解耦

`add child` 按钮这类 chrome 更新，不应导致整棵 scene 重建。

也就是：

- selection 变化 -> 只更新 `chrome`
- 不重新创建 `scene.connectors`
- 不重新创建 `scene.nodeIds`

---

## 9. 必须删除的旧设计

长期最优下，下面这些东西都应该删除：

- `mindmap root` 借 `node` 顶层入口渲染整棵树
- `node.render.mindmapRoot`
- `CanvasNodeSceneItem` 里屏蔽 root
- `NodeItem` 里根据 root 分支到 `MindmapTreeView`
- `childNodeIds` 这种错误命名
- editor 再包一层 `MindmapRenderView` 只为转手 scene 数据
- `rootRect`、`rootLocked` 这类没有明确单一消费者的中间字段

原则：

- 只保留真正被下游稳定消费的数据
- 不保留“可能以后有用”的中间 view model

---

## 10. 最终模块

长期最优下，`mindmap` 相关模块建议收敛为：

- `whiteboard/packages/whiteboard-core/src/mindmap/model.ts`
- `whiteboard/packages/whiteboard-core/src/mindmap/query.ts`
- `whiteboard/packages/whiteboard-core/src/mindmap/layout.ts`
- `whiteboard/packages/whiteboard-core/src/mindmap/render.ts`
- `whiteboard/packages/whiteboard-engine/src/read/store/mindmap/structure.ts`
- `whiteboard/packages/whiteboard-engine/src/read/store/mindmap/layout.ts`
- `whiteboard/packages/whiteboard-engine/src/read/store/mindmap/scene.ts`
- `whiteboard/packages/whiteboard-editor/src/query/mindmap/chrome.ts`
- `whiteboard/packages/whiteboard-react/src/features/mindmap/components/MindmapSceneItem.tsx`
- `whiteboard/packages/whiteboard-react/src/features/mindmap/components/MindmapConnectors.tsx`
- `whiteboard/packages/whiteboard-react/src/features/mindmap/components/MindmapChrome.tsx`
- `whiteboard/packages/whiteboard-react/src/features/node/components/NodeBodyItem.tsx`

`MindmapTreeView` 这种同时掺杂 scene、node、chrome 的组件应消失。

---

## 11. 分阶段实施方案

## 阶段 1：顶层模型改正

目标：

- 让 `mindmap` 成为显式 canvas item

动作：

- 给 `CanvasItemRef` 新增 `kind: 'mindmap'`
- document canvas order 改为直接存 `mindmap` 顶层项
- `document.query.isTopLevelNode` 不再把 root 当 top-level node
- canvas renderer 新增 `MindmapSceneItem`

完成后效果：

- root 不再承担 scene entry 角色
- `node` 渲染链可以开始删除特判

---

## 阶段 2：读取链拆正

目标：

- 明确 `structure / layout / scene / chrome` 四层边界

动作：

- engine mindmap store 拆成 `structure`、`layout`、`scene`
- 删除错误命名的 `childNodeIds`
- 删除 editor 侧仅转手 scene 的包装层
- `chrome` 单独下沉到 editor query

完成后效果：

- scene 成为真正单一真相源
- chrome 不再污染 scene

---

## 阶段 3：渲染链拆正

目标：

- generic node body 与 mindmap scene 彻底分离

动作：

- `CanvasNodeSceneItem` 重命名为 `NodeBodyItem`
- 删除 `node.render.mindmapRoot`
- 删除 `NodeItem` 中 root 特判分支
- `MindmapSceneItem` 直接渲染 root + descendants 的 `NodeBodyItem`

完成后效果：

- root 与 topic 在渲染层完全同构
- 不再存在“root 在这里要隐藏，在那里又要显示”的双重规则

---

## 阶段 4：写入边界收紧

目标：

- 让 root 交互发出正确的 `mindmap` 语义，而不是借 generic node 顶层规则

动作：

- 顶层拖 root 提交 `mindmap.move`
- topic 文本/样式继续走 generic `node` command
- branch / collapse / insert 等继续走 `mindmap` command

完成后效果：

- 写入语义与读取模型一致
- 不再有“场景入口是 node 还是 mindmap”这种边界混乱

---

## 阶段 5：删除旧实现

目标：

- 不留兼容，不留双轨

必须删除：

- root top-level node fallback
- `mindmapRoot` flag
- 旧 `MindmapTreeView`
- 旧 editor render wrapper
- 所有 root special-case tests

只保留新主轴。

---

## 12. 最终判断标准

当且仅当下面这些条件全部成立，说明 `mindmap` 这条线已经收束完成：

1. canvas 顶层直接渲染 `mindmap`，而不是渲染 root node 再转场景。
2. `NodeBodyItem` 完全不知道 `mindmap root` 是什么。
3. `editor` 不再创建第二份 scene view model。
4. `scene` 与 `chrome` 明确拆开，selection 改变不会重建 scene。
5. root 与 topic 在 `node.read`、selection、toolbar、edge connect 上完全同构。
6. 任何地方都不再出现 `childNodeIds` 这类语义错误字段。

满足以上六条，`mindmap` 才算真正变成：

- 模型简单
- 语义明确
- 不容易出错
- 性能不变差
