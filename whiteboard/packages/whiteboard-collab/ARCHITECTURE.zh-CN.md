# Whiteboard Collab Architecture

本文定义 `@whiteboard/collab` 的包内架构、职责边界、同步主轴与关键取舍。

## 1. 包定位

`@whiteboard/collab` 的唯一职责是把 whiteboard 的本地语义写入主轴扩展成多人共享协议。

它不负责：

- command compile
- reducer 语义
- editor session / preview / selection
- DOM / awareness UI
- 把 whiteboard document 直接建模成一棵 Yjs 领域状态树

它只负责：

- 监听 `engine.writeRecord`
- 把本地 `writeRecord.forward` 与 `writeRecord.history.footprint` 发布成 shared change
- 从 Yjs 读取 checkpoint 与 shared change
- 以 canonical order 驱动 `engine.apply(...)` / `engine.execute(document.replace, ...)`
- 管理 bootstrap、resync、checkpoint rotation、diagnostics

一句话：

- `engine` 是语义真相源
- `collab` 是共享协议层
- `Yjs` 是复制运行时与共享存储

---

## 2. 设计目标

`@whiteboard/collab` 的长期目标只有四个：

1. shared state 必须建立在最新 `Operation[]` 之上，而不是 document snapshot diff。
2. 共享协议必须足够小，避免再长出第二套 reducer / 状态机。
3. 冲突处理必须可预测、可收敛，而不是做隐式 merge。
4. 包内模型必须长期稳定，不依赖 tombstone 才能成立。

这意味着本包故意不追求：

- field-level CRDT 文档树
- OT / transform
- shared undo stack
- 自动 salvage rejected change
- 墓碑驱动的软删除模型

---

## 3. 总体分层

### 3.1 `engine`

`engine` 负责：

- command -> operation compile
- semantic validation
- reducer apply
- inverse / history
- 生成 `Commit` / `WriteRecord`

`collab` 永远不复写这部分逻辑。

### 3.2 `collab`

`collab` 负责：

- 本地 `WriteRecord` 发布
- 远端 shared log 消费
- canonical replay
- checkpoint 读取与轮转
- duplicate / reject diagnostics

### 3.3 `Yjs`

`Yjs` 负责：

- 持久共享数据复制
- provider sync
- awareness runtime

`Yjs` 不负责 whiteboard 领域语义。

---

## 4. 共享模型

共享协议只定义三类持久数据：

```ts
type SharedMeta = {
  schemaVersion: 1
}

type SharedChange = {
  id: string
  actorId: string
  ops: readonly SharedOperation[]
  footprint: HistoryFootprint
}

type SharedCheckpoint = {
  id: string
  doc: Document
}
```

约束：

- `SharedOperation = Exclude<Operation, { type: 'document.replace' }>`
- steady-state live log 不允许出现 `document.replace`
- `document.replace` 只用于 bootstrap / reset / recovery
- Yjs 只保存 immutable blob，不保存 whiteboard 领域字段树

当前根结构固定为：

- `meta`
- `checkpoint`
- `changes`

`awareness` 属于 provider runtime，不属于持久共享文档结构。

---

## 5. 为什么是 op log，不是 document mirror

旧的 snapshot mirror / diff 路径有三个根本问题：

1. 它绕开了 `engine` 已经成型的 semantic-op-first 写入主轴。
2. 它把协作层变成 document materialize + diff 编排器，职责错误。
3. 它天然鼓励把 Yjs 当成 whiteboard 领域 document 的主模型，复杂度会持续上升。

当前设计明确反过来：

- 本地语义写入的共享载体是 `writeRecord.forward`
- 远端消费也只回放 `ops`
- 本地 document 只是 replay 结果，不是共享协议本身

这条约束是本包最核心的架构决策。

---

## 6. Canonical Order

共享 change 的唯一正式顺序来源是：

- Yjs `changes` 数组的最终顺序

不是：

- 本地提交先后
- provider 到达顺序
- wall clock

因此，本包的 replay 规则固定为：

- 只要本地 cursor 仍然是当前 shared log 的稳定前缀，就走 `append`
- 只要 checkpoint 变了、log 缩短了、或前缀不再匹配，就走 `reset`

这部分逻辑在：

- `src/replay.ts`

其核心思想是：

- 正确性优先于局部聪明
- 只保留 `append` / `reset` 两条路径
- 不做局部 diff merge

---

## 7. Session 主轴

`src/session.ts` 是整个包的组合器。

它内部只有五条正式路径。

### 7.1 Bootstrap

规则固定为：

- 如果 Yjs 已经有 checkpoint 或 changes，则以共享状态为准
- 如果 Yjs 为空，则把当前 engine document 写成初始 checkpoint

不再保留 `engine-first` / `yjs-first` / `auto` 一类模式。

### 7.2 Local Publish

本地 publish 流程：

1. 监听 `engine.writeRecord`
2. 忽略 `origin === 'remote'`
3. 如果 `writeRecord.forward` 含 `document.replace`，写 checkpoint 并清空 tail log
4. 否则把 `writeRecord.forward` 过滤成 `SharedOperation[]`
5. 用 `writeRecord.history.footprint` 组装 `SharedChange`
6. append 到 Yjs `changes`

约束：

- 不回写 `engine.document`
- 不做 snapshot materialize
- 不同步 `inverse`
- 不同步 `changes` / `invalidation`
- `document.replace` 不进入 `session.localHistory`

### 7.3 Remote Consume

远端事务到来时：

1. 读取 `checkpoint + changes`
2. 对照本地 cursor 判断 `append` 还是 `reset`
3. `append` 时只 replay 新 tail
4. `reset` 时先 `document.replace(checkpoint.doc | emptyDoc)`，再 replay 全量 changes

### 7.4 Checkpoint Rotation

当前 rotation 规则非常简单：

1. 当 tail log 超过阈值
2. 以当前 `engine.document.get()` 生成新 checkpoint
3. 在一个 Yjs transaction 里写新 checkpoint
4. 清空 `changes`

这样可以保持：

- replay 长度有上限
- shared state 不积累无限长 op log
- 不需要额外 prefix metadata

### 7.5 Diagnostics

本包只维护两类 diagnostics：

- `duplicateChangeIds`
- `rejectedChangeIds`

它们只用于可观测性，不参与语义裁决。

---

## 8. 冲突处理

本包当前与长期都采用同一套冲突 contract：

- 不做 OT
- 不做 op transform
- 不做自动 merge
- 只按 canonical order replay

具体语义：

- 同一目标上的并发更新，后 replay 的结果覆盖前 replay 的结果
- 删除在前、后续更新指向已不存在目标时，后续 change reject
- restore / create 是重新建立目标存在性的唯一正式方式

因此，本包的冲突策略可以概括为：

- `order decides`
- `missing target rejects`

这不是临时权宜，而是长期正式 contract。

理由很简单：

- 规则小
- 可预测
- 不需要在协作层复制 reducer 语义
- 所有副本只要使用同一 checkpoint 和同一 shared log 顺序，就能收敛

---

## 9. Undo / Redo

本包不共享：

- `inverse`
- 本地 history stack

共享协议只认 forward change。

长期正式语义是：

- 协作态单独使用 `session.localHistory`
- remote change 只会 invalidated 冲突的本地历史项
- undo / redo 始终是新的普通 `SharedChange`
- remote replay 不再清空 `engine.history`

也就是说：

- `engine.history` 继续是单机 history
- `session.localHistory` 才是协作态 history
- 不做 shared undo stack

---

## 10. 模块划分

### `src/session.ts`

包级组合器。

负责：

- bootstrap
- publish
- consume
- checkpoint rotation
- `localHistory` capture / invalidation 协调
- diagnostics

### `src/localHistory.ts`

负责：

- capture 本地已发布 `SharedChange`
- 基于 `SharedChange.footprint` 做 remote invalidation
- 把 undo / redo 转成新的本地 `engine.apply(...)`
- 保持 `session.localHistory` 为协作态唯一 history 视图

### `src/replay.ts`

负责 cursor 与 replay plan：

- `createSyncCursor`
- `planReplay`

它不接触 reducer，不接触 Yjs provider，只做 canonical replay 规划。

### `src/yjs/codec.ts`

负责 `SharedChange` / `SharedCheckpoint` 的 blob codec。

约束：

- 编码结果必须是 immutable payload
- decode 时做最小结构校验
- `document.replace` 禁止出现在 shared change log

### `src/yjs/store.ts`

负责 Yjs 持久共享数据存取：

- 读写 schema version
- 读写 checkpoint
- 读写 changes
- duplicate 去重视图

它不接触 `engine`，也不解释 whiteboard 业务语义。

### `src/types/*`

负责公开 contract：

- session API
- provider API
- shared protocol types
- internal replay snapshot types

---

## 11. 关键取舍

### 11.1 为什么 checkpoint 直接存完整 `Document`

因为 checkpoint 的职责只有两个：

- bootstrap
- compaction

它不需要增量格式，也不需要 CRDT 字段树。

完整 `Document` 的优点是：

- reset 简单
- 调试简单
- schema 明确

缺点是：

- checkpoint 写入不是最小体积

但这部分只在 bootstrap / rotation 发生，完全可以接受。

### 11.2 为什么 shared change 以 batch 为原子单位

因为 `writeRecord.forward` 本身就是一次完整的语义写入结果。

如果把一次本地语义写入再拆成多个共享原子，协作层就需要额外定义：

- 中间态是否可见
- 半成功如何处理
- inverse / reject 如何对应

这会平白增加复杂度。

因此，当前与长期都固定为：

- 一条 `SharedChange` 对应一次本地 `writeRecord`
- replay 失败按整条 change reject

### 11.3 为什么 reject 只记录，不自动补偿

自动补偿意味着协作层必须自己生成新的语义 op。

一旦这么做，`collab` 就开始侵入 `engine` 的职责。

本包明确不承担这个职责。

---

## 12. 为什么现在不做 tombstone

这里必须先区分两类 tombstone：

1. 领域 tombstone：把 `deleted: true` 放进正式 `Document` 的 `node` / `topic` / `edge`
2. 协议 tombstone：正式 `Document` 继续物理删除，但协作层额外保存“这个实体已被删除”的长期元数据

当前两种都不做。

### 12.1 不做领域 tombstone

如果把 `deleted: true` 变成正式领域字段，会立刻破坏当前 document 模型的基本假设：

- `nodes[id]` 不再等于活实体
- `canvas.order` 必须决定是否容纳 deleted node
- `group` / `edge` / `selection` / `bounds` / `export` 都要 everywhere 过滤 deleted
- `mindmap.members` / `children` 也要引入“存在但不可见”的第二层语义

对 mindmap 来说尤其糟糕，因为会多出大量问题：

- 父 topic deleted、子 topic alive 是否允许
- layout 是否跳过 deleted topic
- branch style 如何继承
- subtree delete 后并发 update 是否保留在 tombstone 上

这会把当前干净的“活实体图”模型变成“活实体 + 墓地混合图”，复杂度显著上升。

### 12.2 不做协议 tombstone

看起来协议 tombstone 只污染 collab，不污染 `Document`，但它仍然不是我们需要的模型。

原因是：

- 当前冲突策略已经由 canonical order + reject 解决，不需要额外删除元数据才能收敛
- 当前恢复机制已经由 explicit `restore` op + checkpoint 完成，不需要 tombstone 驱动 resurrection
- 当前 compaction 直接依赖 checkpoint，旧删除信息在 checkpoint 后没有长期保留价值

如果再加协议 tombstone，就必须再定义：

- tombstone 生命周期
- checkpoint 后 tombstone 是否保留
- delete 与 restore 的因果关系
- subtree delete 的 tombstone 作用域
- 与 duplicate / reject / resync 的交互

这些都不能显著提升当前模型，却会增加协议层负担。

---

## 13. 为什么将来也不做 tombstone

这不是“现在先不做，未来可能做”的保留项。
长期上也不做 tombstone，原因有三条。

### 13.1 它不符合本包的极简职责

`@whiteboard/collab` 的长期最优目标是：

- 共享 log
- checkpoint
- canonical replay

tombstone 会把它推向：

- 存在性管理器
- 删除冲突编排器
- resurrection policy runtime

这已经超出本包应该承担的职责。

### 13.2 它与 whiteboard 的显式 restore 模型冲突

whiteboard 的删除与恢复已经有正式语义 op：

- `node.restore`
- `edge.restore`
- `mindmap.restore`
- `mindmap.topic.restore`

也就是说，我们的恢复模型是：

- 删除就是删除
- 恢复必须是显式的新语义 change

这比“实体一直留着，只是 deleted”更明确。

### 13.3 它会长期污染读模型

哪怕只在未来才把 tombstone 推进领域模型，也会把整个 core -> engine -> editor 的读主轴拖进“存在性与可见性双语义”。

我们的长期最优方向恰恰相反：

- 正式 `Document` 永远只表示活实体
- 协作层永远只做 shared log replay
- 删除冲突永远通过顺序与 reject 解决

因此，tombstone 不是 postponed feature，而是正式排除项。

---

## 14. 最终结论

`@whiteboard/collab` 的长期架构固定为：

- Yjs 保存 `checkpoint + change log`
- shared payload 直接使用 semantic operation
- replay 只有 `append` / `reset`
- 冲突只靠 canonical order 与 reject 收敛
- 删除是物理删除
- 恢复必须显式 `restore`
- 现在不做 tombstone
- 将来也不做 tombstone

如果未来需要增强协作体验，也只能在这条主轴上局部增强：

- 更好的 diagnostics
- 更好的 checkpoint rotation
- 更好的 provider / awareness integration

而不是重新引入 document mirror、snapshot diff 或 tombstone 模型。
