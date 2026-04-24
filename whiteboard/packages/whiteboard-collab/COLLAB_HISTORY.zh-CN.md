# Whiteboard Collab History

本文定义 whiteboard 在协作场景下的本地 history 最终方案。

目标只有三个：

- 远端变更不再清空全部本地 history
- 不做 full collaborative undo
- 用最小复杂度得到长期可维护的冲突策略

本文只定义最终 API、冲突规则与实施方案，不重复设计背景。

---

## 1. 固定结论

长期最优下，whiteboard 的协作 history 不是：

- `engine.history` 直接复用到多人协作
- 远端一来就全量 `history.clear()`
- shared history stack
- OT / transform 驱动的 collaborative undo
- tombstone 驱动的恢复模型

长期最优的最简方案固定为：

- `engine.history` 继续是单机 history
- 协作态单独使用 `session.localHistory`
- `localHistory` 只记录本地已发布的 shared change
- 远端 change 不进入本地 undo 栈
- 远端 change 只会使“冲突”的本地历史项失效
- undo / redo 永远是新的 forward shared change append

一句话：

- 协作态要做的是 `conflict-aware local history`
- 不是 `shared undo`

---

## 2. 非目标

本文明确不做：

- shared undo stack
- shared redo stack
- collaborative intention transform
- undo 回退 shared log 历史
- 用 tombstone 维持 deleted 实体的长期存在性
- 远端 change 自动修补本地失效 history

只要进入这些方向，复杂度都会明显高于当前目标。

---

## 3. 设计原则

### 3.1 历史始终是本地视图能力

history 是 editor / session 的本地运行态能力，不是共享协议。

shared protocol 仍然只认：

- checkpoint
- shared change log

### 3.2 undo / redo 只能追加新 change

undo / redo 不回滚 Yjs log。

它们的正式语义始终是：

- 根据一条本地历史项生成新的 forward change
- 发布到 shared log
- 让所有副本像普通 change 一样回放

### 3.3 远端 change 只使冲突项失效

远端 change 不再触发全量清空本地 history。

它只会：

- 扫描本地历史项
- 找出与自己冲突的项
- 把这些项标记为 invalidated

不冲突的历史项必须继续可 undo / redo。

### 3.4 冲突判定必须基于语义 footprint

不能只看：

- change id
- op type
- entity id

必须引入正式的 `HistoryKey` 模型。

否则只剩两种错误选择：

- 远端一来全部清空
- 直接拿 stale inverse 继续 undo

---

## 4. 底层模型

### 4.1 `HistoryKey`

协作 history 的最小底层模型是语义键集合。

```ts
type HistoryKey =
  | { kind: 'document.background' }
  | { kind: 'canvas.order' }
  | { kind: 'node.exists'; nodeId: NodeId }
  | { kind: 'node.field'; nodeId: NodeId; field: NodeField }
  | { kind: 'node.record'; nodeId: NodeId; scope: 'data' | 'style'; path: Path }
  | { kind: 'edge.exists'; edgeId: EdgeId }
  | { kind: 'edge.field'; edgeId: EdgeId; field: EdgeField }
  | { kind: 'edge.record'; edgeId: EdgeId; scope: 'data' | 'style'; path: Path }
  | { kind: 'edge.labels'; edgeId: EdgeId }
  | { kind: 'edge.label.exists'; edgeId: EdgeId; labelId: string }
  | { kind: 'edge.label.field'; edgeId: EdgeId; labelId: string; field: EdgeLabelField }
  | { kind: 'edge.label.record'; edgeId: EdgeId; labelId: string; scope: 'data' | 'style'; path: Path }
  | { kind: 'edge.route'; edgeId: EdgeId }
  | { kind: 'edge.route.point'; edgeId: EdgeId; pointId: string }
  | { kind: 'group.exists'; groupId: GroupId }
  | { kind: 'group.field'; groupId: GroupId; field: GroupField }
  | { kind: 'mindmap.exists'; mindmapId: MindmapId }
  | { kind: 'mindmap.structure'; mindmapId: MindmapId }
  | { kind: 'mindmap.layout'; mindmapId: MindmapId }
  | { kind: 'mindmap.branch.field'; mindmapId: MindmapId; topicId: NodeId; field: MindmapBranchField }
```

约束：

- topic field / record 统一映射到底层 `node.*` key
- topic 所属 mindmap 额外补一条 `mindmap.exists`
- subtree delete / restore 必须展开成全部受影响实体的 `*.exists` key

`HistoryFootprint` 只是：

```ts
type HistoryFootprint = readonly HistoryKey[]
```

### 4.2 `ObservedChangeSeq`

为了让 reset / resync 不会把旧 remote change 反复当成“新远端冲突”，session 还必须维护一条本地观察时钟：

```ts
type ObservedChangeClock = {
  nextSeq: number
  byChangeId: Map<string, number>
}
```

规则：

- 每个 `changeId` 第一次被当前 session 观察到时，分配一个单调递增 `seq`
- 之后无论 reset / resync / replay 多少次，这个 `changeId` 的 `seq` 不变

这样可以稳定回答：

- 这个 remote change 是在某条本地历史项之前就存在，还是之后才出现

### 4.3 `LocalHistoryEntry`

```ts
type LocalHistoryEntry = {
  id: string
  changeId: string
  baseSeq: number
  forward: readonly SharedOperation[]
  inverse: readonly SharedOperation[]
  footprint: HistoryFootprint
  state: 'live' | 'undone' | 'invalidated'
}
```

含义：

- `changeId` 是这条本地历史项对应的 shared change
- `baseSeq` 是它 capture 时 session 已知的最大 `ObservedChangeSeq`
- `forward` / `inverse` 是这条历史项自己的语义操作
- `footprint` 用于冲突判定
- `state` 决定它处于 undo、redo 还是失效状态

---

## 5. Upstream Contract

`@whiteboard/collab` 不能自己从 raw `Operation[]` 猜完整 history footprint。

原因是这些信息只有 reducer / runtime 才最清楚：

- subtree delete 到底删了哪些 topic / node
- cascade edge delete 到底删了哪些 edge
- node 当前 owner 是不是 `mindmap`
- 哪些 change 实际影响了 `canvas.order`

因此，长期正式 contract 是：

- footprint 必须由 `core -> engine` 写入线生成
- `collab` 只消费，不重建

### 5.1 `WriteRecord`

长期正式上游接口：

```ts
type WriteRecord = {
  rev: number
  origin: Origin
  forward: readonly Operation[]
  inverse: readonly Operation[]
  history: {
    footprint: HistoryFootprint
  }
}
```

约束：

- `forward` / `inverse` 与本次本地写入完全对应
- `history.footprint` 必须在 reducer apply 期间收集
- `document.replace` 的 `WriteRecord` 只用于 hard reset，不进入 `localHistory`

### 5.2 `engine` 暴露面

最终落地形态没有新增 `writeRecord`。

长期正式形态是：

- 本地 publish 直接来自 `engine.writes`
- 本地 history 直接复用 `engine.history`
- collab 侧只负责 remote observe 与 history applying confirm
- shared collab 不再重复 capture 本地 user write

---

## 6. Footprint 收集规则

下面是直接可实施的采集规则。

### 6.1 标量键

- `document.background` -> `document.background`
- `canvas.order.move` -> `canvas.order`
- `mindmap.root.move` / `mindmap.layout` / `mindmap.topic.collapse` -> `mindmap.layout(mindmapId)`

### 6.2 存在性键

- `node.create` / `node.restore` / `node.delete` -> `node.exists(nodeId)`
- `edge.create` / `edge.restore` / `edge.delete` -> `edge.exists(edgeId)`
- `group.create` / `group.restore` / `group.delete` -> `group.exists(groupId)`
- `mindmap.create` / `mindmap.restore` / `mindmap.delete` -> `mindmap.exists(mindmapId)`

### 6.3 字段与 record 键

- `node.field.*` -> `node.field(nodeId, field)`
- `node.record.*` -> `node.record(nodeId, scope, path)`
- `edge.field.*` -> `edge.field(edgeId, field)`
- `edge.record.*` -> `edge.record(edgeId, scope, path)`
- `group.field.*` -> `group.field(groupId, field)`
- `mindmap.topic.field.*` -> `node.field(topicId, field)` + `mindmap.exists(mindmapId)`
- `mindmap.topic.record.*` -> `node.record(topicId, scope, path)` + `mindmap.exists(mindmapId)`
- `mindmap.branch.field.*` -> `mindmap.branch.field(mindmapId, topicId, field)`

### 6.4 集合键

- `edge.label.insert/delete/move` -> `edge.labels(edgeId)`
- `edge.label.field.*` -> `edge.label.field(edgeId, labelId, field)`
- `edge.label.record.*` -> `edge.label.record(edgeId, labelId, scope, path)`
- `edge.route.point.insert/delete/move` -> `edge.route(edgeId)`
- `edge.route.point.field.set` -> `edge.route.point(edgeId, pointId)`

### 6.5 结构键

- `mindmap.topic.insert/move/delete/restore` -> `mindmap.structure(mindmapId)`

并且：

- `mindmap.topic.delete` / `restore` 必须展开整棵子树的 `node.exists(nodeId)`
- `mindmap.delete` / `restore` 必须展开全部成员 topic 的 `node.exists(nodeId)`
- 任何作用在 mindmap owned node 上的 generic `node.*` op，必须额外带上 `mindmap.exists(owner.id)`

这条展开规则是直接实施的必要条件，不能偷懒。

---

## 7. 冲突策略

### 7.1 基本规则

远端 change 会使一条本地历史项 invalidated，当且仅当：

- 该远端 change 的 `ObservedChangeSeq` 大于这条历史项的 `baseSeq`
- 且远端 change 的 footprint 与这条历史项的 footprint 冲突

否则，这条本地历史项保持可 undo / redo。

### 7.2 `HistoryKey` 冲突规则

两个 key 冲突，当且仅当满足以下任一条：

1. 完全同类且同目标。
2. `*.exists` 与同实体上的任意 key 冲突。
3. 集合 key 与其成员 key 冲突。
4. 同一实体同一 record scope 下，两个 path 相等或存在祖先 / 后代关系。
5. `mindmap.exists(mindmapId)` 与同一 mindmap 下任何 `mindmap.*` key 冲突。

### 7.3 具体判定

#### 存在性 dominates

- `node.exists(nodeId)` 与 `node.field(nodeId, *)` / `node.record(nodeId, *, *)` 冲突
- `edge.exists(edgeId)` 与 `edge.*` / `edge.labels(edgeId)` / `edge.route(edgeId)` 冲突
- `group.exists(groupId)` 与 `group.field(groupId, *)` 冲突
- `mindmap.exists(mindmapId)` 与 `mindmap.structure/layout/branch.field` 冲突

#### 集合 dominates 成员

- `edge.labels(edgeId)` 与该 edge 的任何 `edge.label.*` 冲突
- `edge.route(edgeId)` 与该 edge 的任何 `edge.route.point.*` 冲突

#### record path overlap

以下都算冲突：

- `data.text` vs `data.text`
- `data.text` vs `data`
- `data` vs `data.text`
- `style.font.size` vs `style.font`

以下不冲突：

- `data.text` vs `data.color`
- `style.fill` vs `style.stroke`

### 7.4 删除与更新并发

这条规则必须明确：

- 删除不会被特殊 merge
- 删除相关 remote change 只要覆盖到同一存在性 key，就会使对应本地历史项 invalidated

因此：

- 本地 topic 文本修改，远端 topic delete -> 本地这条历史项 invalidated
- 本地 node 样式修改，远端 node delete -> 本地这条历史项 invalidated
- 本地 node A 改颜色，远端 node B 改文本 -> 不 invalidated

---

## 8. `session.localHistory` API

长期正式 API：

```ts
type CollabLocalHistoryState = {
  canUndo: boolean
  canRedo: boolean
  undoDepth: number
  redoDepth: number
  invalidatedDepth: number
  isApplying: boolean
  lastUpdatedAt?: number
}
```

```ts
type CollabLocalHistory = ReadStore<CollabLocalHistoryState> & {
  undo: () => IntentResult
  redo: () => IntentResult
  clear: () => void
}
```

```ts
type CollabSession = {
  awareness?: unknown
  status: ReadStore<CollabStatus>
  diagnostics: ReadStore<CollabDiagnostics>
  localHistory: CollabLocalHistory
  connect: () => void
  disconnect: () => void
  resync: () => void
  destroy: () => void
}
```

约束：

- 协作态 UI 只读 `session.localHistory`
- `session.localHistory` 是对 `engine.history` 的可观测包装
- 协作态 UI 不直接绕过 `session.localHistory` 调 `engine.history`

---

## 9. Local History Runtime

### 9.1 capture

当 session 观察到新的本地 `WriteRecord` 并成功发布为 `SharedChange` 后：

1. 为该 `changeId` 分配或读取 `ObservedChangeSeq`
2. 构造 `LocalHistoryEntry`
3. 压入 undo 栈
4. 清空 redo 栈

capture 条件：

- `origin === 'user'`
- `forward.length > 0`
- `inverse.length > 0`
- 不处于 `undo` / `redo` pending transition
- `forward` 不含 `document.replace`

### 9.2 remote invalidate

当 session 观察到新的 remote `SharedChange`：

1. 为每个新 `changeId` 分配或读取 `ObservedChangeSeq`
2. 读取 remote footprint
3. 扫描本地 undo / redo 栈
4. 对 `baseSeq < remoteSeq` 且 footprint 冲突的历史项标记 `invalidated`
5. 从 undo / redo 可用栈中移除 invalidated 项

注意：

- reset replay 不会把旧 remote change 再次当成新冲突
- 因为旧 `changeId` 的 `ObservedChangeSeq` 不会重新分配

### 9.3 undo

undo 流程固定为：

1. 取 undo 栈顶部 live entry
2. 设定 `pending = { kind: 'undo', entryId }`
3. 调用 `engine.apply(entry.inverse, { origin: 'user' })`
4. 这次本地写入像普通 change 一样发布到 shared log
5. 成功后把 entry 从 undo 栈移到 redo 栈，状态改为 `undone`
6. 失败则把 entry 标记为 `invalidated`

### 9.4 redo

redo 同理：

1. 取 redo 栈顶部 undone entry
2. 设定 `pending = { kind: 'redo', entryId }`
3. 调用 `engine.apply(entry.forward, { origin: 'user' })`
4. 成功后把 entry 移回 undo 栈，状态改为 `live`
5. 失败则标记 `invalidated`

### 9.5 pending transition

`undo` / `redo` 自己产生的新本地 commit 不能再次 capture 成一条全新的历史项。

因此 runtime 必须维护：

```ts
type PendingTransition =
  | { kind: 'undo'; entryId: string }
  | { kind: 'redo'; entryId: string }
  | null
```

只要 `pending` 存在，下一条本地 `WriteRecord` 只能用于完成该 transition，不能 capture 成新 entry。

---

## 10. 硬重置规则

以下事件会清空 `session.localHistory`：

- 本地显式 `document.replace`
- session bootstrap 到一个完全新文档
- 用户主动 `localHistory.clear()`

以下事件不会清空全部 local history：

- 普通 remote append
- 普通 reset replay
- checkpoint rotation
- resync 到同一 shared 文档

这些情况下只做基于 footprint 的增量 invalidation。

---

## 11. 为什么这比“远端一来全清空”更优

因为它满足三个关键目标：

1. 不相关的远端改动不会伤害我的本地历史。
2. 有冲突的本地历史会明确失效，不会偷偷生成错误 undo。
3. 不需要引入 OT、tombstone 或 shared undo 协议。

这正是长期最优的最简平衡点。

---

## 12. 为什么这比 full collaborative undo 更优

因为 full collaborative undo 需要回答更难的问题：

- 我的 undo 是否应该保留别人的后续修改
- 删除 / 恢复 / move / nested path update 如何 transform
- intent-preserving 的语义边界是什么

这些问题都远超当前需要。

而本文方案只回答更小的问题：

- 哪些本地历史还能安全重放

这已经足够显著改善协作体验，而且实现复杂度可控。

---

## 13. 实施方案

### 已落地阶段

- `HistoryFootprint` 已在 reducer / write 主线稳定产出
- 本地 publish 直接读 `engine.writes`
- `session.localHistory` 已直接包装 `engine.history`
- 远端 change 通过 footprint 做 invalidation
- `undo` / `redo` 已通过 shared change append 落地
- 协作态 UI 统一读 `session.localHistory`

---

## 14. 最终结论

whiteboard 协作 history 的长期最优最简方案不是：

- shared undo
- tombstone
- OT
- 全清空 history

而是：

- `HistoryFootprint`
- `ObservedChangeSeq`
- `session.localHistory`
- `undo/redo as new shared change append`

这套方案可以直接实施，而且不会把协作层重新做成另一套状态机。
