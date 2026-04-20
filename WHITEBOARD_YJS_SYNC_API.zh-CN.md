# Whiteboard Yjs Sync API

本文定义基于最新 shared operation 的 whiteboard 长期最优 Yjs 协作模型，以及第一阶段最简实现。

目标只有两个：

- 先把共享协议做对
- 先用最小复杂度做出可收敛的模型

本文不复用旧的 snapshot diff 思路。凡是与旧版 [`WHITEBOARD_YJS_CRDT_OPERATION_DESIGN.md`](/Users/realrong/Rostack/WHITEBOARD_YJS_CRDT_OPERATION_DESIGN.md) 冲突的部分，以本文为准。

---

## 1. 固定结论

长期最优下，Yjs 的定位固定为：

- shared change log
- checkpoint container
- awareness runtime

Yjs 不再承担 whiteboard 领域 document 的主存储模型。

whiteboard 的领域状态固定为：

- 本地运行态真相源：`engine.document.get()`
- 分布式共享真相源：`checkpoint + change log`

也就是说：

- `engine` 负责 command、semantic validation、reduce、materialize
- `collab` 负责 publish、consume、replay、reset、checkpoint
- `Yjs` 只负责复制 shared payload，不负责解释 whiteboard 领域语义

---

## 2. 共享协议原则

### 2.1 共享单元必须是 semantic operation

共享层同步单元固定为最新 `Operation[]`。

共享层不再：

- 同步整份 document snapshot
- 在 steady-state 下做 snapshot diff
- 把 node / edge / mindmap 映射成一套 Yjs 领域状态树

共享层直接传输 reducer 可回放的语义操作。

### 2.2 `document.replace` 不进入 live change log

`document.replace` 只用于：

- bootstrap
- reset
- recovery
- checkpoint materialize

它不是 live collaborative op。

因此，shared change 的正式类型为：

```ts
type SharedOperation = Exclude<Operation, { type: 'document.replace' }>
```

### 2.3 path mutation 直接进入 shared op

shared 协议直接复用当前最新 op 类型：

- field set / unset
- record set / unset
- id-based move
- restore

共享层不再引入额外 patch DSL，也不再回退到粗粒度整字段 replace。

### 2.4 shared payload 必须是 immutable blob

Yjs 只存 immutable payload，不直接承载领域字段。

推荐固定为二进制 codec：

```ts
type SharedCodec = {
  encodeChange(change: SharedChange): Uint8Array
  decodeChange(data: Uint8Array): SharedChange
  encodeCheckpoint(checkpoint: SharedCheckpoint): Uint8Array
  decodeCheckpoint(data: Uint8Array): SharedCheckpoint
}
```

这样可以避免：

- 再做一套 field-level Yjs CRDT 映射
- Yjs 深层对象图带来的额外复杂度
- shared 层和领域 schema 强绑定

---

## 3. 最终数据模型

### 3.1 Yjs 根结构

长期最优下，Yjs 持久共享状态只保留三个根键：

```ts
type YjsSyncRoot = {
  meta: Y.Map<unknown>
  checkpoint: Y.Map<unknown>
  changes: Y.Array<Uint8Array>
}
```

约束：

- `meta` 只存协议元数据
- `checkpoint` 只存最新 checkpoint
- `changes` 只存 checkpoint 之后的 tail changes
- `awareness` 是 provider runtime，不属于持久共享文档根结构
- `awareness` 不进入持久领域状态

### 3.2 元数据

最简元数据只需要 schema version：

```ts
type SharedMeta = {
  schemaVersion: 1
}
```

如果 schema version 不兼容，session 直接进入 error，不做自动兼容。

### 3.3 Change

最简 shared change：

```ts
type SharedChange = {
  id: string
  actorId: string
  ops: readonly SharedOperation[]
  footprint: HistoryFootprint
}
```

约束：

- `id` 全局唯一
- `actorId` 是逻辑协作者身份，不等于 `Y.Doc.clientID`
- `ops` 是一次本地 `writeRecord.forward` 产出的完整 live 语义操作批次
- `footprint` 来自 `writeRecord.history.footprint`
- 一个 `SharedChange` 是 replay 原子单位

共享层不允许自己从 raw `ops` 反推完整 `footprint`。
`footprint` 必须由 `core -> engine` 写入线生成，再由 `collab` 原样发布与消费。

第一阶段不需要：

- lamport
- seq
- server order id
- per-op timestamp

change 的 canonical 顺序直接取 Yjs `changes` 数组顺序。

### 3.4 Checkpoint

最简 checkpoint：

```ts
type SharedCheckpoint = {
  id: string
  doc: Document
}
```

约束：

- 同一时刻只保留一个 checkpoint
- checkpoint 总是表示“当前共享真相的完整 materialized document”
- `changes` 只保存 checkpoint 之后的新 change

第一阶段不需要：

- 增量 checkpoint
- prefix tombstone
- 多 checkpoint 历史链

---

## 4. Canonical Order

### 4.1 唯一顺序来源

shared change 的唯一正式顺序来源是：

- Yjs `changes` 数组在事务收敛后的最终顺序

不是：

- 本地提交先后
- provider 到达顺序
- wall clock

### 4.2 为什么顺序必须以 Yjs 为准

本地可以先乐观执行自己的 change。

但一旦多个客户端并发 append，最终共享顺序只能以 Yjs 收敛后的顺序为准。

因此协作层必须允许：

- 本地先执行
- 远端收敛后按 canonical order 重放
- 必要时回滚并重建本地 materialized document

### 4.3 正确性优先于增量聪明

第一阶段只保留两个同步路径：

- fast path：checkpoint 未变，`changes` 只在尾部 append，直接增量 apply tail
- reset path：只要不是纯尾部 append，就整体 reset 到 checkpoint 后重新 replay

这条规则必须写死，不能为了省一次 replay 再引入局部 diff / transform 复杂度。

---

## 5. Session Runtime

### 5.1 本地运行态

协作 session 的最简本地状态：

```ts
type SyncCursor = {
  checkpointId: string | null
  changeCount: number
}
```

可选本地诊断状态：

```ts
type SyncDiagnostics = {
  rejectedChangeIds: Set<string>
  duplicateChangeIds: Set<string>
}
```

第一阶段不需要额外维护：

- remote document mirror
- snapshot diff cache
- per-entity Yjs shadow state

### 5.2 Bootstrap

长期最优下，bootstrap 规则固定为：

1. 如果 Yjs 里已有 checkpoint 或 changes，则以共享状态为准
2. 如果 Yjs 为空，则把当前本地 document 写成初始 checkpoint

不再需要长期保留 `engine-first` / `yjs-first` / `auto` 这类模式选择。

### 5.3 Local Publish

本地 publish pipeline 固定为：

1. `engine` 本地执行 command 或 ops
2. `session` 从 `engine.writeRecord` 读取本次语义写入结果
3. 如果 `origin === 'remote'`，跳过 publish
4. 如果 `writeRecord.forward` 含 `document.replace`，则写 checkpoint 并清空 `changes`
5. 否则组装 `SharedChange { id, actorId, ops, footprint }`
6. 编码后 append 到 Yjs `changes`

约束：

- 不回写 `engine.document`
- 不在 publish 阶段 materialize Yjs document
- 不做 snapshot replace mirror
- 不同步 `inverse`
- 不同步 `changes` / `invalidation`

### 5.4 Remote Consume

远端消费固定为：

1. 读取最新 checkpoint blob
2. 读取 `changes` 数组
3. 判断这次事务是否仍是“同一 checkpoint 上的纯 tail append”
4. 如果是，直接把新增 tail changes 逐个 `engine.apply(ops, { origin: 'remote' })`
5. 如果不是，执行 reset replay

reset replay 固定为：

1. `engine.execute({ type: 'document.replace', document: checkpoint.doc })`
2. 从 `changes[0]` 开始按 canonical order 逐个 replay
3. 更新本地 cursor

如果没有 checkpoint：

- 从本地默认空 document 开始 replay 全部 changes

### 5.5 Checkpoint Rotation

第一阶段最简 checkpoint rotation：

1. 取当前 canonical document
2. 生成新 `SharedCheckpoint`
3. 在一个 Yjs transaction 内写入新 checkpoint
4. 清空 `changes`

这意味着：

- checkpoint 永远代表最新完整状态
- log compaction 不需要保留前缀元数据
- consumer 只要发现 `checkpoint.id` 变化，就直接 reset replay

---

## 6. 冲突与拒绝规则

### 6.1 冲突裁决原则

第一阶段不做 OT，不做 op transform，不做 patch merge。

冲突裁决只有一条规则：

- 所有 change 按 canonical order 顺序 replay

也就是说，冲突不是在 Yjs 层解决，而是在统一顺序下由 reducer 语义自然解决。

### 6.2 同字段并发修改

如果两个 change 都修改同一个语义目标，最终结果由 replay 顺序决定。

例如：

- 同一个 node 的同一个 field 被并发 set
- 同一个 record path 被并发 set / unset
- 同一个 edge label 被并发移动

canonical order 更晚的那一个自然覆盖更早的结果。

### 6.3 删除与后续变更

如果某个实体已在更早的 canonical change 中被删除，则后续 change：

- 只有显式 `restore` / `create` 之后的变更才允许继续生效
- 直接针对已删除实体的变更应被 reject

例如：

- `node.delete` 之后直接 `node.field.set`
- `edge.label.delete` 之后直接 `edge.label.move`
- `mindmap.delete` 之后直接 `mindmap.topic.field.set`

都应该被 reject。

### 6.4 Reject Contract

最简 reject contract：

- `SharedChange` 是原子单位
- replay 时如果其中任一 op 违反 reducer 约束，则整个 change reject
- reject 只影响本地 replay，不自动写回补偿 change
- diagnostics 可记录 `rejectedChangeIds`

因为所有副本使用：

- 相同 checkpoint
- 相同 canonical order
- 相同 reducer 规则

所以 reject 结果也是确定的，最终仍可收敛。

### 6.5 本地乐观成功、最终远端 reject

这是第一阶段允许的行为。

也就是说：

- 本地先执行成功
- 共享顺序收敛后，该 change 可能因为更早的并发 change 而在 replay 中被 reject
- 最终通过 reset replay 把本地状态纠正到 canonical state

这是最简正确模型的一部分，不额外引入 rebase 层。

---

## 7. History Contract

### 7.1 不共享 inverse

共享层不传输：

- `inverse`
- 本地 history stack

共享层只传输新的 forward change。

### 7.2 协作态 history 不是 `engine.history`

长期最优下：

- `engine.history` 继续是单机 history
- 协作态单独使用 `session.localHistory`
- `session.localHistory` 只记录本地已发布的 `SharedChange`
- remote change 不进入本地 undo / redo 栈

因此 remote replay 不再清空本地 `engine.history`。
协作 UI 只应该读取 `session.localHistory`。

### 7.3 Undo / Redo 的正式语义

undo / redo 仍然是本地 editor / engine 行为，但一旦真的执行：

- 它产出的仍然是普通 `SharedChange`
- publish 后与其他 change 一样进入 canonical log

也就是说：

- 协作层只认 forward change
- 不认“这是 undo change”的特殊协议

### 7.4 远端 change 只做 footprint invalidation

远端 change 到来时，session 只做两件事：

- 读取 `SharedChange.footprint`
- 使与之冲突的本地 `session.localHistory` 项失效

不会发生：

- 全量清空协作态本地 history
- 继续重放已经冲突的 stale inverse

冲突判定 contract 由 [`whiteboard/packages/whiteboard-collab/COLLAB_HISTORY.zh-CN.md`](/Users/realrong/Rostack/whiteboard/packages/whiteboard-collab/COLLAB_HISTORY.zh-CN.md) 定义。

---

## 8. 非目标

第一阶段明确不做以下事情：

- document-state mirror sync
- remote snapshot diff
- field-level Yjs CRDT 映射
- OT / op transform
- 自动 salvage rejected change
- shared history stack
- 协议层 tombstone document
- 为 patch / splice 保留额外语义层

这些都不是“先把正确模型做出来”所必需的。

---

## 9. 最简 API

### 9.1 Codec

```ts
type YjsSyncCodec = {
  encodeChange(change: SharedChange): Uint8Array
  decodeChange(data: Uint8Array): SharedChange
  encodeCheckpoint(checkpoint: SharedCheckpoint): Uint8Array
  decodeCheckpoint(data: Uint8Array): SharedCheckpoint
}
```

### 9.2 Store

```ts
type YjsSyncStore = {
  readMeta(): SharedMeta
  readCheckpoint(): SharedCheckpoint | null
  readChanges(): readonly SharedChange[]
  appendChange(change: SharedChange): void
  replaceCheckpoint(checkpoint: SharedCheckpoint): void
  clearChanges(): void
}
```

### 9.3 Session

```ts
type CollabSession = {
  status: ReadStore<CollabStatus>
  diagnostics: ReadStore<CollabDiagnostics>
  localHistory: CollabLocalHistory
  connect(): void
  disconnect(): void
  destroy(): void
  resync(): void
}
```

### 9.4 Replayer

```ts
type ReplayPlanner = {
  plan(next: {
    checkpointId: string | null
    changeCount: number
    tailAppendOnly: boolean
  }): 'append' | 'reset'
}
```

```ts
type ReplayExecutor = {
  append(changes: readonly SharedChange[]): void
  reset(checkpoint: SharedCheckpoint | null, changes: readonly SharedChange[]): void
}
```

约束：

- reducer 不感知 Yjs
- Yjs store 不感知 whiteboard 语义
- session 只做 publish / consume / replay orchestration
- `SharedChange` 必须通过一次 batch replay 原子应用，不能拆成半成功状态

---

## 10. 实施方案

### Phase 1

目标：先把正确模型跑通。

- 删除 snapshot diff 主路径
- 删除 document mirror sync 主路径
- 引入 `SharedChange` blob log
- 引入单 checkpoint blob
- 引入 `engine.writeRecord` 作为本地 publish 上游
- 给 `SharedChange` 补齐 `footprint`
- 远端只保留 `append` / `reset` 两条 replay 路
- remote replay 使用 `engine.apply(ops, { origin: 'remote' })`
- reset replay 使用 `engine.execute({ type: 'document.replace', document })`
- local publish 统一基于 `writeRecord.forward`

### Phase 2

目标：补上稳定的 compaction 与协作态本地 history。

- 增加后台 checkpoint rotation
- 当 `changes` 达到阈值时生成新 checkpoint
- rotation 固定为“写新 checkpoint + 清空 changes”
- 新增 `session.localHistory`
- remote change 按 `footprint` invalidation
- undo / redo 作为新的 `SharedChange` append

### Phase 3

目标：只补必要优化，不补复杂协议。

- 追加 duplicate change diagnostics
- 追加 rejected change diagnostics
- 只在确实需要时补更细的 replay fast path
- 协作态 UI 统一读 `session.localHistory`

不进入下一阶段的内容：

- OT
- 全局协同 undo
- 基于 Yjs 字段树的领域 CRDT 映射

---

## 11. 最终一句话

长期最优的 whiteboard Yjs 方案，不是“把 document 做成一棵 Yjs CRDT 树”，而是：

- 用 Yjs 存 immutable `SharedChange` log
- 用 checkpoint 做 reset / compaction
- 用 `engine` 作为唯一语义 reducer
- 用 canonical replay 保证收敛

第一阶段只做 append / reset 两条路径，就足够形成最小且正确的协作模型。
