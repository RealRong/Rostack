# Shared Collab Writes Final Plan

本文只定义 `shared/collab` 切换到 `writes` 主轴之后的最终设计与重构方案。

目标很明确：

- 不再依赖 `MutationProgram`
- 不再依赖 `MutationFootprint`
- 不再依赖 `HistoryPort`
- 不再让业务侧自己定义 `change.create/read/footprint`
- 不再把冲突 scope 作为第二套手写协议维护

结论先说：

- 协作共享协议统一建立在 `serialized writes` 之上
- 冲突收敛统一建立在 `canonical log order + missing target rejects`
- 本地 undo/redo 的失效判断统一由 `schema + writes` 自动推导，不再同步 footprint
- `shared/collab` 只负责 session / replay / checkpoint / local collab history
- `shared/mutation` 负责 write codec 与 conflict scope 推导

## 1. 当前问题

现在的 `shared/collab` 之所以整体需要重写，不是因为 Yjs，不是因为 replay，而是因为底层契约已经和新的 mutation 主体脱节了。

当前问题有五个：

1. 协作层仍然以 `MutationProgram` 为共享载体，但 mutation 主体已经切到 `writes`
2. 协作层仍然依赖 `MutationFootprint` 作为冲突 scope，但 footprint 本质上是手写第二协议
3. `HistoryPort` 暴露了 `sync.observeRemote / confirmPublished / withPolicy` 这类隐藏控制面，职责混乱
4. `shared/collab` 要求业务自己提供 `change.create/read/footprint`，导致 whiteboard/dataview 各自复制协议
5. 当前 `MutationWrite` 里的 `node` 是 schema node 引用，不能直接序列化，所以还没有真正可共享的 write 协议

真正该保留的只有两样：

- `append/reset` 这套 replay 规划
- `checkpoint + changes` 这套共享存储骨架

其余都应该按新 mutation 主体重写。

## 2. 目标状态

最终形态分成三层。

### 2.1 `shared/mutation`

负责：

- schema finalize 后生成稳定的 node 索引
- runtime `MutationWrite` 和 wire `SerializedMutationWrite` 互转
- 基于 `writes` 自动推导 conflict scopes
- 提供 scope 相交判断

不负责：

- Yjs
- provider
- checkpoint
- collab session

### 2.2 `shared/collab`

负责：

- bootstrap
- canonical replay
- publish local change
- apply remote change
- checkpoint rotation
- local collab history
- diagnostics

不负责：

- schema 节点定位规则
- write 编解码
- 业务语义 merge

### 2.3 业务封装层

`whiteboard-collab` / `dataview-collab` 只保留薄封装：

- 选择 document empty / clone / assert
- 接 Yjs transport
- 暴露产品层 session 类型

不再自定义：

- shared change 结构
- footprint 编码
- program codec

## 3. 最终共享协议

最终共享协议只保留两类持久对象。

### 3.1 Shared Change

每条共享 change 对应一次本地 `apply commit`。

结构应统一为：

- `id`
- `actorId`
- `writes`

其中：

- `writes` 是 `SerializedMutationWrite[]`
- 不包含 `inverse`
- 不包含 `delta`
- 不包含 `footprint`
- 不包含业务自定义 `kind: 'apply' | 'replace'`

原因很简单：

- steady-state live log 只需要 forward effect
- inverse 只服务本地协作历史
- delta 是本地 projection 输入，不是共享协议
- footprint 是可从 schema+writes 推导的冗余数据

### 3.2 Shared Checkpoint

checkpoint 只保留：

- `id`
- `document`

它的职责只有：

- bootstrap
- log compaction
- reset base

checkpoint 不需要增量格式，也不需要 CRDT 字段树。

## 4. 必须新增的 mutation 基础能力

`shared/collab` 切到 writes 主轴之前，`shared/mutation` 必须先补齐三项基础设施。

### 4.1 稳定 schema node id

当前 runtime `MutationWrite` 里持有的是 `node` 引用，这对本地 apply 很好，但对传输不可序列化。

最终方案：

- schema finalize 时，为每个 mutation node 生成稳定 `schemaNodeId`
- 这个 id 是内部索引 id，不是业务 path，不暴露给业务侧手写
- schema 同时持有：
  - `node -> schemaNodeId`
  - `schemaNodeId -> node`

这个 id 是 collab write codec 的正式定位键。

注意：

- 这里不能继续用业务手写 path
- 也不应该把 `node.geometry` 这种字符串泄漏给协作层
- 也不应该依赖对象地址跨进程传输

### 4.2 结构化 scope，而不是拼接 targetId 字符串

当前内部 `targetId` 依赖分隔符拼接嵌套作用域，这对 runtime 够用，但不是长期最优 wire 形态。

最终 wire write 不再直接传 `targetId`，而传结构化 scope：

- 根实体：`scope = ['nodeId']`
- 嵌套表项：`scope = ['edgeId', 'labelId']`
- 更深层继续按层级追加

decode 时再由 mutation 内部把 `scope` 还原成 runtime target。

这样可以直接消除：

- 分隔符协议
- path-like target 拼接心智
- transport 层对内部 targetId 编码细节的耦合

### 4.3 Write Codec

`shared/mutation` 需要提供标准 write codec。

职责是：

- `MutationWrite[] -> SerializedMutationWrite[]`
- `SerializedMutationWrite[] -> MutationWrite[]`

序列化内容只保留必要最小字段：

- `kind`
- `schemaNodeId`
- `scope`
- `value`
- `anchor`
- `key`
- `nodeId`

原则：

- encode/decode 完全由 schema 驱动
- 业务层不再自己写 program codec
- whiteboard/dataview 不再自己 assert program step

## 5. shared/collab 的最终公开 API

`shared/collab` 要从“可插拔 change 协议编排器”收敛成“标准 writes session”。

最终 `createMutationCollabSession(...)` 只接受这几类输入：

- `schema`
- `engine`
- `actor`
- `transport`
- `document`
- `policy`（可选）
- `history`（可选）

明确删除：

- `change.create`
- `change.read`
- `change.footprint`

原因：

- change 协议必须标准化
- read/write codec 应由 mutation 统一提供
- footprint 不再是外部配置项

## 6. Engine 契约

collab 对 engine 的依赖应收敛成以下最小面：

- `doc()`
- `apply(writes, options?)`
- `replace(document, options?)`
- `commits.subscribe(listener)`

其中 commit 只需要标准 mutation commit：

- `kind`
- `origin`
- `document`
- `writes`
- `inverse`
- `delta`

不再要求 engine 暴露旧 history port。

## 7. Replay 与共享收敛规则

共享收敛规则继续保留现在已经正确的主轴：

- canonical order 由 shared log 顺序决定
- cursor 仍然只分 `append` / `reset`

### 7.1 Append

满足以下条件时走 `append`：

- checkpoint id 未变化
- 本地 cursor 是远端 change id 列表的稳定前缀

此时：

- 只 decode 新 tail changes
- 依次 `engine.apply(remoteWrites, { origin: 'remote' })`

### 7.2 Reset

任一情况发生时走 `reset`：

- checkpoint id 变化
- change log 缩短
- 本地 cursor 不再是稳定前缀
- 调用方显式 resync

此时：

1. 读取 checkpoint document 或 `document.empty()`
2. `engine.replace(baseDocument, { origin: 'remote' })`
3. 全量 replay 当前 shared log

这部分不需要再发明新协议，当前 replay 规划可以直接保留。

## 8. 最终冲突契约

冲突要分两层看。

### 8.1 共享状态收敛冲突

这是副本之间最终 document 如何收敛的问题。

长期正式规则只有两条：

- `order decides`
- `missing target rejects`

展开就是：

1. 不做 OT
2. 不做 transform
3. 不做自动 merge
4. 所有副本都按同一个 checkpoint 和同一个 change 顺序 replay
5. 后 replay 的 write 覆盖前 replay 的结果
6. 如果某条 remote write 指向的目标已经不存在，或违反 schema/业务约束，则整条 change reject

典型语义：

- 两个客户端同时改同一字段：后到 shared log 的结果获胜
- 一方先删实体，另一方后改该实体：后者 reject
- 一方先 move order，另一方后 move order：后者获胜
- 一方先删，另一方后 recreate 同 id：按 shared log 顺序决定最终是否存在

这套规则小、确定、可收敛，不在协作层复制业务 reducer。

### 8.2 本地 undo/redo 失效冲突

这是本地协作历史是否还能安全 undo 的问题。

这里不再使用 footprint。

最终方案是：

- 基于 `schema + writes` 自动生成 `MutationConflictScope[]`
- remote change 到来时，对比 remote scopes 与本地历史 entry scopes
- 相交则 invalidate 本地 entry

## 9. 冲突 scope 的最终设计

`shared/mutation` 必须提供标准冲突 scope 推导器。

它不是业务 API，而是内部正式基础设施。

### 9.1 Scope 类型

最终 scope 只需要表达真实可冲突的 mutation 面。

正式范围应包括：

- `document-reset`
- `entity-existence`
- `collection-order`
- `field`
- `dictionary-entry`
- `dictionary-all`
- `sequence`
- `tree-structure`
- `tree-node`

### 9.2 从 write 到 scope 的映射

规则如下。

#### entity.create / entity.remove / entity.replace

生成：

- 当前实体的 `entity-existence`
- 如果是 table，还要包含所属 collection 的 `collection-order`

原因：

- create/remove/replace 会改变实体是否存在
- table collection 还会改变 ids 顺序面

#### entity.move

生成：

- 所属 table collection 的 `collection-order`

#### field.set

生成：

- 对应字段的 `field`

#### dictionary.set / dictionary.delete

生成：

- 对应 key 的 `dictionary-entry`

#### dictionary.replace

生成：

- `dictionary-all`

#### sequence.insert / move / remove / replace

生成：

- 对应 sequence 的 `sequence`

#### tree.insert / move / remove / replace

生成：

- `tree-structure`

#### tree.patch

生成：

- 对应 node 的 `tree-node`

### 9.3 相交规则

相交规则必须由 mutation 内部统一实现，而不是业务自己拼。

核心规则：

1. `document-reset` 与任何 scope 相交
2. 同一实体上的 `entity-existence` 与该实体下所有 field / dictionary / sequence / tree scope 相交
3. 同一 collection 上的 `collection-order` 与该 collection 的 create/remove/move 相交
4. 同一 field scope 彼此相交
5. 同一 dictionary key 相交，`dictionary-all` 与该 dictionary 下所有 key 相交
6. 同一 sequence scope 相交
7. 同一 tree 上 `tree-structure` 与任何该 tree 的 `tree-node` / `tree-structure` 相交
8. 同一 `tree-node` 彼此相交

这套规则已经足够支撑 local history invalidation，不需要再同步 footprint。

## 10. Local Collab History 的最终形态

`shared/collab` 必须内建一套新的 `CollabLocalHistory`，不再借旧 `HistoryPort`。

### 10.1 公开接口

公开面只保留：

- `state()`
- `subscribe(listener)`
- `undo()`
- `redo()`
- `clear()`

不再暴露：

- `sync.observeRemote`
- `sync.confirmPublished`
- `sync.cancel`
- `withPolicy`

这些都属于 session 内部机制，不应该泄漏给 UI 或业务层。

### 10.2 Entry 结构

每个本地历史 entry 至少保存：

- `changeId`
- `writes`
- `inverse`
- `scopes`
- `status`

其中：

- `writes` 用于 redo
- `inverse` 用于 undo
- `scopes` 用于 remote invalidation
- `status` 取值只需要 `live | invalidated`

### 10.3 capture 规则

本地 commit 发布成功后：

1. session 拿到 commit 的 `writes/inverse`
2. 生成 scopes
3. append 到 local history undo 栈

这里的 capture 点必须是“已经成功 publish 到 shared log 之后”，不是单纯本地 apply 之后。

这样可以保证：

- local history 里的 entry 都有正式 `changeId`
- undo/redo 产生的新 change 仍然是普通 shared change

### 10.4 remote invalidation 规则

remote change 到来时：

1. decode remote writes
2. 生成 remote scopes
3. 从最新到最旧扫描本地 live entries
4. 若 scope 相交，则标记为 invalidated

不做：

- 自动补偿
- 自动 rebase
- 自动 partial salvage

### 10.5 undo / redo 规则

`undo()`：

- 取最近的 live entry
- `engine.apply(entry.inverse, { origin: 'history' })`
- 这会产生新的本地 apply commit
- session 像普通本地 change 一样发布它

`redo()`：

- 对 redo entry 执行同样逻辑，只是 apply `entry.writes`

因此：

- undo/redo 不是本地隐藏动作
- undo/redo 是新的共享 change
- 共享协议里仍然只有 forward writes

### 10.6 reset 时的处理

最终规则：

- 任何 `reset` replay
- 任何外部 `replace`
- 任何 checkpoint 旋转导致的全量重建

都直接 `clear local collab history`

原因：

- reset 后 base document 已重建
- 保留旧 inverse 的收益远小于额外复杂度
- 这是最简单、最稳定、最可解释的正式规则

## 11. shared/collab session 的最终职责划分

session 内部最终只做这几件事：

1. bootstrap
2. 监听 engine commits 并 publish local change
3. 监听 transport store 并 replay remote change
4. 轮转 checkpoint
5. 维护 diagnostics
6. 维护 local collab history

明确不做：

- transform
- merge
- footprint 生成
- program codec
- 业务 reducer

## 12. Yjs 层最终需要的变化

`shared/collab-yjs` 不需要大的架构变化，只需要把 payload 从旧 shared change 切到标准 writes change。

也就是说：

- transport store 模型仍然可以是 `checkpoint + changes`
- codec 只需 encode/decode `SerializedMutationWrite[]`

白板和 dataview 两侧的 codec 会大幅收缩：

- 不再 assert `MutationProgram`
- 不再 assert `MutationFootprint`
- 不再关心 checkpoint program 过滤

## 13. whiteboard/dataview 封装层的最终状态

两侧 collab 包最终都应该薄到接近同构。

### whiteboard-collab

只保留：

- `document.empty`
- `checkpoint create/read`
- Yjs transport 绑定
- session 类型别名

删除：

- `readLiveProgram`
- `program` codec
- `footprint` codec
- checkpoint-only 过滤逻辑

### dataview-collab

同样只保留：

- empty document / clone / normalize
- Yjs transport 绑定
- session 暴露

删除：

- `program` codec
- `footprint` codec
- 任何 program step 断言逻辑

## 14. 重构步骤

按最终状态，一步到位重构顺序应是：

### Phase 1: `shared/mutation` 提供 collab 基础设施

完成：

- schema stable node id
- `SerializedMutationWrite`
- write codec
- conflict scope 推导与相交判断

### Phase 2: 重写 `shared/collab`

完成：

- 删除 `MutationProgram` 依赖
- 删除 `MutationFootprint` 依赖
- 删除 `HistoryPort` 依赖
- 删除 `change.create/read/footprint`
- 新建标准 `CollabLocalHistory`
- replay 改为 decode serialized writes 后直接 `engine.apply(writes)`

### Phase 3: 重写 `shared/collab` 测试

测试覆盖至少包括：

- bootstrap 空库写 checkpoint
- local publish 追加 writes change
- remote append replay
- reset replay
- duplicate diagnostics
- rejected diagnostics
- local history invalidation
- undo/redo 作为新 shared change 发布

### Phase 4: 重写 `whiteboard-collab`

完成：

- 删除 program/footprint 类型
- 删除旧 codec
- 切到标准 writes shared change
- 跑通 yjs session tests

### Phase 5: 重写 `dataview-collab`

完成：

- 删除 program/footprint 类型
- 删除旧 codec
- 切到标准 writes shared change
- 跑通 yjs session tests

### Phase 6: 收口调用方

完成：

- `whiteboard-react` 改用新的 `CollabLocalHistory`
- 删除 `setHistorySource(next: HistoryPort<...>)` 这类旧签名
- 所有 collab session 暴露统一的新 history 面

## 15. 最终删除清单

这次重构完成后，以下概念应从 collab 主轴彻底消失：

- `MutationProgram`
- `MutationFootprint`
- `HistoryPort`
- `change.create`
- `change.read`
- `change.footprint`
- program step codec
- footprint codec
- 外部 `sync.observeRemote / confirmPublished / withPolicy`

## 16. 最终结论

`shared/collab` 的长期最优设计不是“继续兼容旧 program/footprint，再给 writes 打补丁”，而是直接承认三件事：

1. mutation 的唯一正式执行载体已经是 `writes`
2. 冲突 scope 不应该由业务手写 footprint，而应由 `schema + writes` 自动生成
3. collab local history 应该是 session 内建能力，而不是旧 history port 的外置拼装

所以最终方案就是：

- `shared/mutation` 负责 `write codec + conflict scopes`
- `shared/collab` 负责 `log replay + checkpoint + local collab history`
- `whiteboard/dataview collab` 退化成薄封装

这就是这条线最简单、最稳定、长期维护成本最低的终态。
