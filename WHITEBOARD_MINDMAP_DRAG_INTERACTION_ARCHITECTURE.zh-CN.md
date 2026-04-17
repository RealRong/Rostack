# Whiteboard Mindmap Drag Interaction 最终架构

## 1. 结论

`mindmap root` / `subtree` 拖拽的长期最优方案，不应该继续依赖 React 侧的 `previewOffset` 一类局部补丁。

最终方案必须满足三条硬约束：

1. preview 由 editor interaction 统一产出。
2. query/projection 统一消费 preview，生成所有可见几何。
3. React 只渲染投影结果，不单独发明拖拽偏移语义。

也就是说：

- 普通 node drag 和 mindmap drag 应该共享同一种“preview 投影模型”
- 但 commit 仍然可以走不同命令
- `mindmap` 不需要假装自己是普通 node move
- 但它必须接入统一的 interaction -> preview -> projection 中轴

这是复杂度最低、长期最稳定的方案。

---

## 2. 当前问题

当前 `mindmap` 拖拽存在两类问题，本质上都来自 preview 不在中轴里：

### 2.1 root body drag

- 走的是 `mindmap-drag`
- commit 是正确的
- 但中间态没有统一投影
- 所以会出现“pointerup 后瞬移”

### 2.2 root text field drag

- 一度走成普通 `node-drag`
- 普通 node move preview 会出现
- 但 commit 对 `mindmap owned node` 不成立
- 所以会出现“有预览，pointerup 回弹”

### 2.3 selection box / toolbar / handles 不一致

即使后面补了 React 侧 `previewOffset`，也仍然会出现：

- node/tree 视觉上动了
- selection box 留在原地
- toolbar anchor 不同步
- connectors / node / chrome 来自不同 truth

因为：

- React 组件自己的平移，不会进入 editor query/projection
- selection overlay、toolbar、node rect、pick 几何都还在读 editor 投影

所以 `previewOffset` 只能止血，不能作为最终模型。

---

## 3. 为什么不能继续用 React 侧 previewOffset

`previewOffset` 的问题不是“命名不好”，而是职责位置错了。

它的问题有四个：

1. 它是视图私有状态，不是 editor 公共 preview 语义。
2. 它只影响某个 React 子树，不影响 query 里的 node rect / selection box / toolbar。
3. 它会让 mindmap 再次拥有一套独立于 node projection 的几何体系。
4. 它迫使后续所有 chrome 都去“补读 mindmap 偏移”，最终函数会散得到处都是。

所以长期最优必须明确：

**禁止组件自己发明拖拽偏移。**

任何拖拽中的可见几何变化，都必须经过 editor interaction / local feedback / query projection。

---

## 4. 最终设计原则

### 4.1 interaction 中轴化

拖拽状态由 editor interaction 统一管理，而不是 React 自己管理。

### 4.2 projection 中轴化

所有 preview 都在 query/projection 层变成统一几何：

- node rect
- mindmap tree bbox
- connectors
- selection box
- toolbar anchor
- transform overlay

### 4.3 commit 与 preview 解耦

preview 和 commit 可以共享同一套投影语义，但 commit 命令可以不同：

- 普通 node drag -> `node.move`
- mindmap root drag -> `mindmap.moveRoot`
- mindmap subtree drag -> `mindmap.moveByDrop`

### 4.4 React 无业务几何

React 只负责：

- 订阅 query/read
- 渲染 projected rect / bbox / connectors

React 不负责：

- 计算拖拽 delta
- 生成 preview 偏移
- 决定 toolbar/selection 是否跟随

---

## 5. 最终模型

## 5.1 interaction 层

当前已有：

- `selection-move`
- `selection-transform`
- `mindmap-drag`

最终建议保留 `mindmap-drag` 这个 interaction mode，因为它的 commit 语义确实不是普通 node move。

但是它不能只产出 React 私有 feedback，而要产出统一 preview。

推荐模型：

```ts
type InteractionPreview =
  | {
      kind: 'selection-move'
      nodePatches: readonly NodePatchEntry[]
      edgePatches: readonly EdgePatchEntry[]
      guides: readonly Guide[]
    }
  | {
      kind: 'mindmap-root-move'
      treeId: NodeId
      delta: Point
    }
  | {
      kind: 'mindmap-subtree-move'
      treeId: NodeId
      nodeId: MindmapNodeId
      ghost: Rect
      drop?: MindmapDragDropTarget
    }
```

关键点：

- root move 不需要直接 patch 每个 node
- 只需要产出 `treeId + delta`
- subtree move 需要 ghost/drop 语义

---

## 5.2 feedback 层

feedback 不应再只是一个 React 能读、query 不读的旁路对象。

建议把当前 `mindmap.drag` 收敛成显式 preview：

```ts
type MindmapPreviewState = {
  rootMove?: {
    treeId: NodeId
    delta: Point
  }
  subtreeMove?: {
    treeId: NodeId
    nodeId: MindmapNodeId
    ghost: Rect
    drop?: MindmapDragDropTarget
  }
}
```

注意这里不要继续叫 `baseOffset` / `previewOffset` 这类视图导向名字。

统一用：

- `delta`
- `ghost`
- `drop`

这些是 interaction 语义，不是 React 样式语义。

---

## 5.3 query/projection 层

这是最终设计的核心。

### 5.3.1 node projection

对任意 `mindmapId === treeId` 的 owned node：

- committed rect 来自 engine
- 如果存在 `rootMove.delta`，则 projected rect = committed rect + delta

也就是说，root move preview 应该直接进入 node projection。

这样：

- root topic
- child topics
- node geometry
- node overlay

都会自动跟随。

### 5.3.2 mindmap render projection

对 `mindmap.render(treeId)`：

- committed bbox/connectors 来自 engine
- 如果存在 `rootMove.delta`，则 projected bbox/connectors 整体平移

这样 branch 也会跟随。

### 5.3.3 selection projection

selection overlay / selection box / toolbar anchor 继续只读 query：

- 如果当前选中的是 root topic 或 child topic
- 由于 node projection 已经带了 preview delta
- selection box 会天然跟随

这就是统一中轴的价值：

**selection 不需要知道 “这是 mindmap 特例”。**

它只需要继续读 node rect。

---

## 6. root drag 的最终语义

## 6.1 preview

root drag 期间：

- interaction 产出 `{ kind: 'mindmap-root-move', treeId, delta }`
- node projection 给整棵树的 owned nodes 加上 `delta`
- mindmap render projection 给 tree bbox/connectors 加上 `delta`

最终画面：

- root node 跟着动
- child nodes 跟着动
- branch 跟着动
- selection box 跟着动
- toolbar 跟着动

这才是产品级语义。

## 6.2 commit

pointer up 后：

- interaction 仍调用 `mindmap.moveRoot`
- commit 更新 tree container position
- engine relayout 写回 subtree node positions

由于 preview 与 commit 读的是同一套中轴几何，视觉上不会跳变。

---

## 7. subtree drag 的最终语义

subtree drag 不能简单复用 root move delta，因为它还涉及：

- ghost rect
- drop target
- reorder line
- parent / side / index

但 projection 原则仍然一致：

- preview 由 interaction 产出
- query/projection 统一消费
- React 不自己发明 subtree 偏移

推荐：

- subtree preview 不改 committed tree render
- 只通过 projection 渲染一个 ghost subtree 和 drop indicator
- 原 subtree 是否隐藏，也应由 projection 决定

这样依然不会散落到 React 各处。

---

## 8. selection box 为什么会留在原地

因为当前 selection box 不是读 React 的 `previewOffset`，而是读 editor query 的 overlay。

而当前 overlay 的几何来源是：

- node projection
- selection projection

如果 preview 没进入 projection，selection box 就一定不会跟。

所以 selection box 留在原地不是单点 bug，而是架构信号：

**preview 没进中轴。**

---

## 9. 是否应该让 mindmap node 走普通 node drag 语义

结论：

### 不应该复用 commit 语义

因为：

- root drag = move whole tree
- subtree drag = move subtree/drop/reorder

这不是普通 `node.move`。

### 应该复用 preview/projection 语义

因为：

- selection box
- toolbar
- node rect
- connectors
- overlay

都需要共用同一个 projected geometry truth。

所以正确答案不是“完全复用普通 node drag”，而是：

**复用普通 drag 的 preview 中轴，不复用普通 drag 的 commit 命令。**

---

## 10. 推荐 API

## 10.1 local feedback

```ts
type MindmapPreviewState = {
  rootMove?: {
    treeId: NodeId
    delta: Point
  }
  subtreeMove?: {
    treeId: NodeId
    nodeId: MindmapNodeId
    ghost: Rect
    drop?: MindmapDragDropTarget
  }
}
```

## 10.2 query

```ts
type EditorQueryRead = {
  ...
  feedback: {
    ...
    mindmapPreview: ReadStore<MindmapPreviewState>
  }
}
```

## 10.3 projection helpers

```ts
readMindmapRootMoveDelta(
  preview: MindmapPreviewState,
  treeId: NodeId
): Point | undefined

projectMindmapNodeRect(
  rect: Rect,
  node: Node,
  preview: MindmapPreviewState
): Rect

projectMindmapRenderView(
  render: MindmapRenderView,
  preview: MindmapPreviewState
): MindmapRenderView
```

命名重点：

- 用 `preview`
- 用 `delta`
- 用 `project`

不要再引入：

- `previewOffset`
- `baseOffset`
- `renderOffset`

这些名字会把模型带回视图补丁思路。

---

## 11. React 层最终职责

React 最终只做三件事：

1. 订阅 `editor.read.node.view`
2. 订阅 `editor.read.mindmap.render`
3. 渲染它们

React 不负责：

1. 计算 drag delta
2. 把 tree 手动 `transform: translate(...)`
3. 补 selection 跟随
4. 给 connectors 手动套偏移

如果某个 UI 还需要自己套 offset，说明 preview 还没进入 projection。

---

## 12. 落地顺序

### Phase 1

把 `mindmap.drag` 重命名并重构为 `mindmapPreview`，明确 root move / subtree move 语义。

### Phase 2

在 query 层把 `mindmapPreview` 暴露出来。

### Phase 3

在 node projection 中，对 `mindmap owned node` 应用 root move delta。

### Phase 4

在 mindmap render projection 中，对 bbox/connectors 应用 root move delta。

### Phase 5

删除 React 侧 `previewOffset` / tree wrapper transform 之类补丁。

### Phase 6

把 subtree ghost/drop 也逐步迁入同一 projection 模型。

---

## 13. 硬约束

1. `mindmap` drag preview 由 editor interaction 统一产出。
2. preview 必须进入 query/projection，而不是只停留在 React。
3. `selection box`、`toolbar`、`node`、`connectors` 必须共享同一份 projected geometry。
4. React 不能自己发明拖拽偏移。
5. `mindmap` 不复用普通 `node.move` 提交语义。
6. `mindmap` 必须复用普通 drag 的 preview/projection 中轴。

---

## 14. 一句话总结

长期最优不是把 `mindmap` 硬塞成普通 node move。

长期最优是：

**interaction 统一产出 preview**

**projection 统一消费 preview**

**commit 仍保留 mindmap 专属语义**

只要这三条成立，`selection box`、`toolbar`、`nodes`、`branches`、`handles` 就会天然对齐，不需要 React 再到处补偏移。
