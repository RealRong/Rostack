# Whiteboard Mindmap Node Geometry 最终方案

本文只回答一个问题：

- `mindmap.nodeGeometry(nodeId)` 应不应该订阅 `live.node`
- 整条 `mindmap edit -> layout -> node render` 的上下游边界应该怎么收

本文不是兼容方案，也不是过渡方案。

目标只有三个：

- 不再依赖 `live.node` / `liveMindmapSignal` 这类补丁式唤醒
- `mindmap owned node` 的编辑态宽高变化，稳定地通过 tree relayout 驱动
- 下游不再知道上游细节，整条链只保留一个方向

---

## 1. 结论

`mindmap.nodeGeometry(nodeId)` 不应该直接订阅 `live.node`。

正确做法是：

1. `edit session` 只表达输入语义
2. `draft.node(nodeId)` 只表达测量结果
3. `liveMindmapLayout(treeId)` 只把编辑态测量结果桥接给 tree layout
4. `mindmap.layout(treeId)` 负责生成整棵树的最终 projected rect
5. `mindmap.nodeGeometry(nodeId)` 只是把 tree layout 投影成 node keyed geometry
6. `node.projected(nodeId)` 只消费 `ownerGeometry`

一句话：

- `live` 只能存在于 layout 上游
- `nodeGeometry` 只能存在于 layout 下游

如果 `nodeGeometry` 还要去直接知道 `live.node`，说明边界已经错了。

---

## 2. 正确的上下游

最终只接受下面这一条单向链路：

```text
edit.session
  -> draft.node(nodeId)
  -> liveMindmapLayout(treeId)
  -> mindmap.layout(treeId)
  -> mindmap.nodeGeometry(nodeId)
  -> node.projected(nodeId)
  -> node.render(nodeId)
  -> React
```

这条链里每一层的职责必须固定。

### 2.1 上游

上游只负责产生输入，不负责最终几何。

- `edit.session`
  - 只保存 `nodeId / field / text / caret / composing`
  - 不保存 `size / rect / wrapWidth / finalRect`

- `draft.node(nodeId)`
  - 只输出测量结果，例如 `size` 或 `fit fontSize`
  - 不输出最终画布几何
  - 不知道 mindmap tree 如何排

- `liveMindmapLayout(treeId)`
  - 只做一件事：把当前编辑中的 topic 测量结果桥接成 tree layout override
  - 它可以知道“当前编辑节点属于哪个 tree”
  - 它不应该被 query 层直接消费

### 2.2 中游

中游只有一个几何 owner：

- `mindmap.layout(treeId)`
  - 输入：committed tree、committed node size、draft size override、gesture preview
  - 输出：整棵树的 `computed.node`、`bbox`、`connectors`
  - 它是 `mindmap owned node` 最终 rect 的唯一 owner

### 2.3 下游

下游只能消费结果，不允许重新推导上游语义。

- `mindmap.nodeGeometry(nodeId)`
  - 只表达一个 node 的最终 owner geometry
  - 不知道 edit session
  - 不知道 draft text
  - 不知道 live signal

- `node.projected(nodeId)`
  - 对 `mindmap owned node` 只读 `ownerGeometry`
  - 绝不自己根据 `draft.size` 改 rect
  - 绝不自己知道 tree layout

- `node.render(nodeId)` 和 React
  - 只消费 projected 结果
  - 不知道几何来自 committed、draft、还是 mindmap relayout

---

## 3. 为什么 `nodeGeometry` 不该订阅 `live.node`

如果 `nodeGeometry` 需要直接订阅 `live.node`，本质上是在补一个“唤醒洞”。

这说明系统里至少有一个边界没收好：

- 要么 `live` 没有在 layout 层被消化
- 要么 `nodeGeometry` 不是 layout 层的直接产物
- 要么 `node.projected` 还在兼任 tree layout patcher

这些都不是最终形态。

`nodeGeometry` 的正确语义不是：

- “知道当前哪个 node 正在 live edit，然后自己想办法更新”

而是：

- “读取已经完成 live projection 的 owner geometry”

所以 `nodeGeometry` 的依赖应当只有：

- committed node owner 信息
- layout 层产出的 projected node geometry

而不应直接依赖：

- edit session
- draft.node
- live.node patch
- liveMindmapSignal

---

## 4. 最优实现形态

最优形态不是 query 层现算：

```ts
store.read(layout.layout, treeId)?.computed.node[nodeId]
```

因为这个实现虽然 API 叫 `nodeGeometry(nodeId)`，但本质仍然是：

```text
nodeId -> owner.treeId -> tree layout -> computed.node[nodeId]
```

这仍然是 tree-first 的查询方式。

一步到位的最终形态应该是：

```text
layout.mindmap.nodeGeometry(nodeId)
```

它是 layout 层直接产出的 node keyed store。

换句话说：

- `mindmap.layout(treeId)` 是 tree 级真相
- `mindmap.nodeGeometry(nodeId)` 是对 tree 真相的 node 级投影

这层投影应该在 layout 层完成，不应该在 query 层临时下钻。

---

## 5. 最终抉择：Store 放置位置

这一节是最终裁决，不是建议。

### 5.1 哪一层拥有 mindmap 几何 store

最终 ownership 必须这样分：

- `EngineRead.mindmap`
  - 只拥有 committed 真相
  - 例如 `list / structure / committed layout record`

- `EditorLayout.mindmap`
  - 只拥有 live geometry 真相
  - 例如 `layout(treeId) / nodeGeometry(nodeId)`

- `MindmapPresentationRead`
  - 只拥有 presentation 语义
  - 例如 `scene / chrome / navigate`

结论：

- `mindmap.layout` 和 `mindmap.nodeGeometry` 的 owner 必须是 `EditorLayout`
- 它们不应该只存在于 `MindmapPresentationRead`
- `MindmapPresentationRead` 不应该成为 raw geometry store 的承载层

### 5.2 `EditorLayout` 里的 `mindmap` 要不要暴露

要暴露，但这个“暴露”是 internal runtime 暴露，不是 public API 暴露。

也就是说：

- `EditorLayout` 作为 editor 内部模块之间的 contract，必须暴露 `mindmap`
- `EditorRead` 作为外部消费接口，不暴露 `mindmap.layout` 或 `mindmap.nodeGeometry`

这里的关键不是“暴露不暴露”，而是“暴露给谁”：

- 对内部 runtime：要暴露
- 对 public read：不要暴露

### 5.3 为什么不能只放在 `MindmapPresentationRead`

如果把 `layout / nodeGeometry` 放进 `MindmapPresentationRead`，会出现三个问题：

- presentation 层重新拥有了几何真相，层次倒挂
- `createNodeRead()` 会为了拿 owner geometry 去依赖 presentation API
- query 层会再次变成 geometry 和 presentation 的混合层

这正是之前链条越来越长、边界越来越糊的根源。

所以最终规则必须写死：

- 几何 store 归 layout 层
- presentation read 只归 presentation 层
- node query 直接依赖 layout 产出的几何 store，不通过 presentation 转手

### 5.4 模块应该各自依赖什么

最终注入规则如下：

- 需要 committed tree topology 的模块
  - 依赖 `engineRead.mindmap.structure`

- 需要 live tree geometry 的模块
  - 依赖 `layout.mindmap.layout`

- 需要某个 topic 的 owner geometry 的模块
  - 依赖 `layout.mindmap.nodeGeometry`

- 需要 scene / chrome / connector 展示语义的模块
  - 依赖 `MindmapPresentationRead`

这意味着：

- `createNodeRead()` 不应该依赖 `MindmapPresentationRead`
- `createNodeRead()` 应该直接依赖 `layout.mindmap.nodeGeometry`

---

## 6. 最终 API

### 6.1 Layout 层

这是 internal contract，不是 public read。

```ts
type EditorLayout = {
  draft: {
    node: KeyedReadStore<NodeId, DraftMeasure>
  }
  mindmap: {
    layout: KeyedReadStore<NodeId, MindmapLayoutItem | undefined>
    nodeGeometry: KeyedReadStore<NodeId, ProjectedOwnerGeometry | undefined>
  }
}
```

说明：

- `draft.node` 是测量层
- `mindmap.layout` 是 tree 级几何真相
- `mindmap.nodeGeometry` 是 node 级几何投影

`liveMindmapLayout` 可以继续存在，但只能是 layout 内部实现细节，不对外暴露。

最终明确抉择：

- `EditorLayout` 需要保留 `mindmap`
- 这是正确放置位置
- 不应该把这两个 store 挪到 `MindmapPresentationRead` 里当 owner

### 6.2 Node Query 输入

`createNodeRead()` 直接依赖 layout 产出的 owner geometry：

```ts
createNodeRead({
  mindmap: {
    nodeGeometry: layout.mindmap.nodeGeometry
  }
})
```

这里不经过 `query.mindmap`。

原因：

- `node.projected` 需要的是 geometry，不是 presentation
- 让 node query 依赖 layout geometry，比依赖 `MindmapPresentationRead` 更短、更准

### 6.3 Presentation 层

```ts
type MindmapPresentationRead = {
  scene: KeyedReadStore<NodeId, MindmapSceneItem | undefined>
  chrome: KeyedReadStore<NodeId, MindmapChrome | undefined>
  navigate: (input: {
    id: NodeId
    fromNodeId: NodeId
    direction: 'parent' | 'first-child' | 'prev-sibling' | 'next-sibling'
  }) => NodeId | undefined
}
```

最终明确抉择：

- `MindmapPresentationRead` 不再承载 `layout`
- `MindmapPresentationRead` 不再承载 `nodeGeometry`
- `MindmapPresentationRead` 只保留最终展示语义

如果内部模块需要 committed topology，直接依赖：

- `engineRead.mindmap.structure`

不要再通过 `EditorRead.mindmap` 对外转发。

### 6.4 Public Editor API

对外最终只暴露：

```ts
type EditorRead = {
  mindmap: {
    scene: KeyedReadStore<NodeId, MindmapSceneItem | undefined>
    chrome: KeyedReadStore<NodeId, MindmapChrome | undefined>
    navigate: (input: {
      id: MindmapId
      fromNodeId: MindmapNodeId
      direction: 'parent' | 'first-child' | 'prev-sibling' | 'next-sibling'
    }) => MindmapNodeId | undefined
  }
}
```

高层插入 API 也不再要求外部先读 tree：

```ts
type MindmapActions = {
  insertRelative: (input: {
    id: MindmapId
    targetNodeId: MindmapNodeId
    relation: 'child' | 'sibling' | 'parent'
    side?: 'left' | 'right'
    payload?: MindmapTopicData
    behavior?: MindmapInsertBehavior
  }) => CommandResult<{ nodeId: MindmapNodeId }> | undefined
}
```

规则：

- `relation: 'child'` 可选 `side`
- `relation: 'sibling'` 默认插入到目标后方；如果目标是 root，退化为 root child insert
- `relation: 'parent'` 直接包裹目标；如果目标是 root，返回 `undefined`

### 6.5 Node Projection 规则

`projectNode()` 对 mindmap node 的规则必须写死：

```ts
if (mindmapOwned) {
  rect = ownerGeometry.rect
}
```

也就是：

- 普通 text node 可以直接吃 `draft.size`
- mindmap owned text node 绝不能直接吃 `draft.size`
- mindmap topic 的编辑态几何变化必须先经过 tree relayout

---

## 7. 每层允许知道什么

### 7.1 `edit.session`

允许知道：

- 当前编辑哪个 node
- 当前文本内容
- caret / composing

禁止知道：

- final rect
- tree layout
- sibling geometry

### 7.2 `draft.node`

允许知道：

- committed node
- text
- typography / wrap mode / frame inset

禁止知道：

- treeId
- sibling node
- connectors
- selection chrome

### 7.3 `liveMindmapLayout`

允许知道：

- 当前编辑 node 是否属于某个 mindmap
- 当前编辑 node 的 measured size

禁止知道：

- render props
- React
- node projected result

### 7.4 `mindmap.layout`

允许知道：

- tree structure
- base layout
- committed node size
- live size override
- root/subtree preview

禁止知道：

- caret
- composing
- edit UI
- DOM

### 7.5 `mindmap.nodeGeometry`

允许知道：

- nodeId
- owner tree
- projected layout result

禁止知道：

- edit session
- draft measure
- live signal patch

### 7.6 `node.projected`

允许知道：

- committed node
- ownerGeometry
- node text preview
- edit text draft

禁止知道：

- tree layout details
- live mindmap override
- sibling layout

---

## 8. 明确禁止的设计

以下方案都不应该再出现：

- `node.projected` 对 mindmap node 直接读取 `draft.size` 改 rect
- `mindmap.nodeGeometry` 直接订阅 `live.node` 或 `liveMindmapSignal`
- `MindmapPresentationRead` 承载 `layout` 或 `nodeGeometry`
- query 层用“树级 layout + 额外唤醒补丁”去伪造 node 级几何
- React 层或 node.render 层再做几何补丁
- 同一个 mindmap topic 同时存在“node local rect”和“mindmap owner rect”两份真相

---

## 9. 一步到位落地顺序

如果不考虑兼容和成本，建议按下面顺序收口：

1. 在 layout 层恢复或重建真正的 `mindmap.nodeGeometry(nodeId)` keyed store
2. `liveMindmapLayout(treeId)` 只留在 layout 层内部
3. `createNodeRead()` 直接读取 `layout.mindmap.nodeGeometry`
4. `MindmapPresentationRead` 收缩为 `scene / chrome / navigate`
5. 删除所有 `live.node` / `liveMindmapSignal` 一类补丁唤醒
6. 删除 query 层从 `layout(treeId).computed.node[nodeId]` 的临时下钻实现
7. 用编辑态 topic 宽高增长、sibling relayout、scene bbox 变化三类测试覆盖

---

## 10. 最终判断标准

当下面三条同时成立时，说明边界收对了：

1. mindmap topic 编辑时，自己的宽高变化来自 `mindmap.nodeGeometry(nodeId)`，而不是 node 自己 patch rect
2. sibling relayout 和 edited node relayout 走的是同一条链
3. 删除所有 live signal 补丁后，编辑态宽高和 sibling 位置仍然自动更新

如果这三条里任何一条不成立，就说明系统里还残留了“node 和 mindmap 在争夺几何真相”的问题。
