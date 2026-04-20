# Whiteboard Yjs + CRDT + Operation 协作设计

本文定义 whiteboard 的长期协作协议。

目标不是再讨论“要不要用 Yjs”，也不是重写本地 write kernel，而是把当前已经成型的
`command -> op -> reduce -> commit` 本地写入线，正式扩展成一套可以落地的多人协作 contract。

本文替换旧版文档里的过期接口和错误假设。凡是与当前代码不符的描述，以本文为准。

---

## 0. 当前结论

先把最重要的判断写清楚：

- 本地 write kernel 已经基本到位，不需要再做一次大改
- 真的还没完成的是协作协议层，而不是 reducer 主线
- `whiteboard-collab` 当前仍然是 snapshot sync，不是 operation sync
- 长期正确方向仍然是：保留 Yjs，重做 collab，同步单元从 snapshot 变成 operation log + checkpoint

当前仓库里的真实情况：

- `engine` 已经是 operation-first 本地写内核
- `Commit` 正式字段是：
  - `doc`
  - `ops`
  - `inverse`
  - `changes`
  - `invalidation`
  - `impact`
- `Commit` 没有 `kind`
- 远端应用入口是 `engine.apply({ ops }, { origin: 'remote' })`
- 远端 bootstrap / repair 入口是 `engine.execute({ type: 'document.replace', document })`
- `whiteboard-collab` 当前本地写 Yjs 时，仍然是把最新 snapshot 整份回写
- `whiteboard-collab` 当前远端回放时，基本仍然是 `document.replace`

因此，当前的主问题不是 write kernel 复杂度，而是：

- 协作层没有把 `Commit.ops` 作为正式同步协议
- 协作层没有定义完整的排序、冲突、checkpoint、reject、undo contract

---

## 1. 设计目标

### 1.1 保留现有 engine

当前最有价值的部分已经存在：

- `command -> op -> reduce -> commit`
- lock validate
- inverse / history
- invalidation / impact

协作方案必须复用它，而不是绕过它。

### 1.2 继续使用 Yjs

Yjs 的价值没有问题：

- provider 生态成熟
- awareness 已有
- 断线重连和状态同步基础设施成熟

但 Yjs 的角色要调整：

- 不再直接作为白板领域 document 的唯一真相源
- 而是作为分布式 change log、checkpoint 容器和 awareness runtime

### 1.3 同步单元改成 operation

理想状态：

- 本地变更发布 `Commit.ops`
- 远端也消费 `Operation[]`
- `engine` 负责业务约束和 materialize
- `document.replace` 退化为 bootstrap / recovery 手段

### 1.4 明确协作 contract

本文必须把下面几件事写死：

- client identity 与序号 contract
- 远端排序 contract
- 冲突裁决 contract
- undo / redo contract
- checkpoint / recovery contract
- 哪些状态共享，哪些状态只属于本地视图

### 1.5 优先长期正确，不优先兼容

本文面向长期最优方案：

- 不为了兼容旧 snapshot sync 保留错误抽象
- 不把“先能跑”写成永久协议
- 允许为长期语义清晰度引入新的协作层模型

---

## 2. 当前实现中哪些地方是错的

旧版设计里有几类不正确描述，先统一删掉。

### 2.1 不应该再说 `Commit.changes` 是同步主载体

正式同步主载体应该是：

- `Commit.ops`

`changes` 的职责只是：

- 增量刷新摘要
- 订阅和 runtime invalidation 辅助信息

它不是可回放协议。

### 2.2 不应该再说远端入口是 `engine.applyOperations(...)`

当前正式入口是：

- `engine.apply({ ops }, { origin: 'remote' })`

本文后续都使用这个接口名。

### 2.3 不应该再说 `Commit.kind === 'replace'`

当前正式 `Commit` 没有 `kind`。

协作层判断“这是不是 bootstrap / recovery replace”不能再依赖 commit kind，而应依赖调用上下文。

### 2.4 不应该再使用旧 translate 路径

旧版文档提到的这些路径已经不是正式实现边界：

- `whiteboard-engine/src/write/translate/*`
- `whiteboard-engine/src/write/translate/plan/*`

后续如果要新增 order 规划逻辑，应该放到当前 planner / command 体系中，而不是引用已经删除的 translate 架构。

### 2.5 不应该再把 `node.update.records` 当成正式协作 op

旧版设计把 path mutation 只当成 command/helper 层能力，这个方向不对。

长期最优下，shared op 层本身就必须正式支持 path mutation。

也就是说：

- `data` / `style` 一类 record tree，不能继续依赖整字段 replace
- shared op 层必须提供正式的 `set` / `unset`
- ordered collection 不能继续依赖 generic `splice`
- 所有集合移动都必须升级为基于稳定 id 的 `move`

这里的正式约束以：

- [`WHITEBOARD_SHARED_OP_PATH_MUTATION.zh-CN.md`](/Users/realrong/Rostack/WHITEBOARD_SHARED_OP_PATH_MUTATION.zh-CN.md)
- [`WHITEBOARD_SHARED_OP_TYPES.zh-CN.md`](/Users/realrong/Rostack/WHITEBOARD_SHARED_OP_TYPES.zh-CN.md)

为准。

尤其要强调一点：

- shared op 分层不是“凡是 object 都 path 化”
- schema-known atomic field 继续保留 field 边界
- 只有开放 record tree 才进入 `record.set/unset`

### 2.6 不应该把 tombstone 写成领域 document 的正式存储模型

当前本地 write kernel 的领域模型是物理删除，不是软删除。

因此：

- tombstone 可以存在于协作 replay / conflict 层
- tombstone 不应该强行进入当前 `Document` 正式模型

本文后续的 tombstone 一律指：

- 协作层的存在性裁决元数据
- 不是 reducer 持久化 document 的正式字段

---

## 3. 总体架构

### 3.1 一句话定义

用 Yjs 承载 whiteboard 的 CRDT change log 与 checkpoint；
whiteboard 本地状态始终由 `engine` 基于 checkpoint + tail ops 归约生成。

### 3.2 三层分工

#### engine

- command 规划
- op 约束校验
- op reduce
- inverse / history
- invalidation / impact
- materialize document

#### collab-crdt layer

- 本地 `Commit.ops` 编码成 change entry
- 维护 client / seq / lamport / basis
- 从 Yjs 读取 unseen changes
- 排序、补洞、去重、reject、checkpoint recovery
- 通过 `engine.apply({ ops }, { origin: 'remote' })` 做远端回放

#### Yjs

- change entry 广播
- checkpoint 存储
- awareness
- provider 层同步与断线重连

### 3.3 真相源定义

统一定义两层真相源：

#### 分布式真相源

- `ops + checkpoints`

#### 本地运行态真相源

- `engine.document.get()`

这两层不是竞争关系，而是：

- `ops + checkpoints` 是可同步、可恢复的协作真相
- `engine.document.get()` 是当前副本把协作真相 materialize 后的运行态

---

## 4. 协议范围

### 4.1 哪些东西进入共享协议

进入共享协议的，是会改变 document 领域状态的 persistent op。

当前长期目标下，live op log 允许的共享 op 包括：

- `document.background`
- `canvas.order.move`
- `node.create`
- `node.restore`
- `node.field.set`
- `node.field.unset`
- `node.record.set`
- `node.record.unset`
- `node.move`
- `node.delete`
- `edge.create`
- `edge.restore`
- `edge.field.set`
- `edge.field.unset`
- `edge.record.set`
- `edge.record.unset`
- `edge.label.insert`
- `edge.label.delete`
- `edge.label.move`
- `edge.label.field.set`
- `edge.label.field.unset`
- `edge.label.record.set`
- `edge.label.record.unset`
- `edge.route.point.insert`
- `edge.route.point.delete`
- `edge.route.point.move`
- `edge.route.point.field.set`
- `edge.delete`
- `group.create`
- `group.restore`
- `group.field.set`
- `group.field.unset`
- `group.delete`
- `mindmap.create`
- `mindmap.restore`
- `mindmap.delete`
- `mindmap.root.move`
- `mindmap.layout`
- `mindmap.topic.insert`
- `mindmap.topic.restore`
- `mindmap.topic.move`
- `mindmap.topic.delete`
- `mindmap.topic.field.set`
- `mindmap.topic.field.unset`
- `mindmap.topic.record.set`
- `mindmap.topic.record.unset`
- `mindmap.branch.field.set`
- `mindmap.branch.field.unset`

### 4.2 哪些 op 绝不能进入 live op log

下面这些东西不能作为 live shared op 发布：

- `document.replace`
- 当前的全量 `canvas.order`
- `node.duplicate`
- `mindmap.topic.clone`
- `node.patch`
- `edge.patch`
- `group.patch`
- `mindmap.topic.patch`
- `mindmap.branch.patch`
- generic `record.splice`
- 任何 index-based list move
- 所有 selection / hover / toolbar / drag preview / measuring / local layout draft 之类的 UI state

原因：

- `document.replace` 只能是 bootstrap / recovery 路径
- `canvas.order` 是全量 set，冲突面过大，应该降级为 fallback
- `node.duplicate`、`mindmap.topic.clone` 本身不是 reducer 可执行的正式共享语义，必须在 planner 本地展开成 concrete create / restore / field / record / structural ops
- `*.patch` bag 会重新把不同冲突语义混成一条 op，不是长期正式 shared op
- generic `splice` 与 index-based move 都不是稳定协作语义，必须用 stable-id collection op 替代

### 4.3 哪些状态只属于本地视图

下面这些状态默认不共享：

- selection
- hover
- active tool
- drag preview
- measuring cache
- local pending ops
- undo / redo stack
- `mindmap.topic.collapse`

`mindmap.topic.collapse` 在本文中明确归类为 local view state，而不是 shared document state。

原因：

- collapse 更接近每个用户自己的阅读和演示视图
- 把 collapse 当 shared state 会引入大量不必要冲突

### 4.4 哪些状态是共享 persistent state

下面这些 mindmap 状态明确共享：

- `mindmap.layout`
- `mindmap.root.move`
- `mindmap.topic.insert`
- `mindmap.topic.move`
- `mindmap.topic.delete`
- `mindmap.topic.field.set/unset`
- `mindmap.topic.record.set/unset`
- `mindmap.branch.field.set/unset`

其中：

- `mindmap.layout` 是共享布局策略
- topic 几何位置仍由 reducer / reconcile 在本地根据共享 tree + layout 持久化收敛

这要求 layout 计算必须是确定性的：

- 相同 persistent state
- 相同 node size 输入
- 相同 layout spec

必须得到相同结果。

---

## 5. Yjs 顶层数据模型

建议在 Yjs 根下定义：

```text
whiteboard
  ├─ protocolVersion: number
  ├─ meta: Y.Map
  ├─ ops: Y.Array<Y.Map>
  ├─ checkpoints: Y.Array<Y.Map>
  ├─ heads: Y.Map<number>
  └─ awareness: provider awareness
```

字段职责：

- `protocolVersion`：协作协议版本
- `meta`：board 元数据
- `ops`：共享 change log
- `checkpoints`：共享 checkpoint
- `heads`：每个 client 已发布到的最高 `seq`
- `awareness`：用户 presence

`heads` 只作为诊断和恢复辅助信息，不是排序真相源。

---

## 6. 核心身份与时序 contract

这一节是整个协作协议的核心。

如果这里不明确，后面的 LWW、delete-wins、undo、checkpoint 都会变成模糊语义。

### 6.1 BoardId

每个协作文档都有唯一 `boardId`。

要求：

- `boardId` 必须写入 change entry 和 checkpoint
- 不允许把不同 board 的 change log 混在同一个流里解释

### 6.2 ClientId

`clientId` 是副本身份，不是 tab 身份。

要求：

- 对同一个用户设备 / 本地副本，`clientId` 必须稳定
- 刷新、重连、短暂离线后，必须继续复用同一个 `clientId`
- `clientId` 不应按 tab 临时生成

原因：

- `seq` 的单调性依赖稳定的 `clientId`
- checkpoint 和 dedupe 依赖 `clientId`

### 6.3 SessionId

`sessionId` 是一次运行实例的临时身份。

作用：

- 诊断
- awareness
- telemetry

`sessionId` 不参与 change 排序和去重。

### 6.4 Seq

`seq` 是某个 `clientId` 在某个 `boardId` 下的单调递增发布序号。

要求：

- 同一 `clientId` 内严格递增
- 不能回退
- 必须持久化
- 重启后继续从本地已发布最大值之后开始

### 6.5 ChangeId

正式定义：

```ts
type ChangeId = `${ClientId}:${number}`
```

要求：

- `changeId = clientId + ':' + seq`
- 协议里建议显式存储 `changeId`，不要只靠派生

原因：

- 调试直接
- reject / telemetry / server 日志更清晰
- 避免 decode 后重复拼装

### 6.6 Lamport

MVP 也必须带 `lamport`。

这是本文与旧版设计的关键修正之一。

要求：

- 每条 change entry 必须携带 `lamport`
- 本地发布新 change 时：
  - `lamport = max(localLamport, maxSeenRemoteLamport) + 1`
- 收到远端 change 时：
  - `localLamport = max(localLamport, remote.lamport)`

作用：

- 提供全局稳定总序的一部分
- 避免把 “Y.Array append 顺序” 错当成正式业务排序

### 6.7 Basis Vector

仅有 `clientId + seq + lamport` 还不够。

为了定义 delete-wins、undo 冲突、并发关系，change entry 还必须记录 authoring basis：

```ts
type ChangeVector = Record<ClientId, number>
```

`basis` 的语义：

- 这条 change 在作者本地生成时，已经看见了每个 client 的哪些 seq

例如：

- `basis['a'] = 5`
- 表示作者生成这条 change 时，已经看见 client `a` 的前 5 条 change

### 6.8 因果关系定义

给定 change `A` 和 `B`：

- 如果 `A.basis[B.clientId] >= B.seq`，则 `A` 因果上发生在 `B` 之后
- 如果 `B.basis[A.clientId] >= A.seq`，则 `B` 因果上发生在 `A` 之后
- 如果两者都不成立，则 `A` 和 `B` 并发

本文后续所有“并发冲突”都按这个定义计算。

### 6.9 总序定义

当两个 change 需要稳定裁决顺序时，正式比较键为：

1. `lamport`
2. `clientId`
3. `seq`

记作：

```ts
type ChangeOrderKey = [lamport, clientId, seq]
```

这个总序只负责“稳定排序”，不等于“因果关系”。

---

## 7. Change Entry 与 Checkpoint contract

### 7.1 Change Entry

正式定义：

```ts
type ChangeSource =
  | 'command'
  | 'undo'
  | 'redo'
  | 'system'

type CrdtChangeEntry = {
  protocolVersion: 1
  boardId: string
  changeId: string
  clientId: string
  sessionId: string
  seq: number
  lamport: number
  basis: Record<string, number>
  source: ChangeSource
  ops: readonly Operation[]
}
```

字段要求：

- `protocolVersion`：协议版本
- `boardId`：文档归属
- `changeId`：唯一 change id
- `clientId`：稳定副本身份
- `sessionId`：运行实例身份
- `seq`：本 client 局部序号
- `lamport`：全局稳定排序辅助
- `basis`：authoring 时已见 change vector
- `source`：命令、undo、redo 或系统生成
- `ops`：正式共享 op

### 7.2 Change Entry 的硬约束

- `ops.length` 不能为 0
- `ops` 不能包含 `document.replace`
- `ops` 不能包含 `node.duplicate`
- `ops` 不能包含 `mindmap.topic.clone`
- `ops` 不能包含 `mindmap.topic.collapse`
- `ops` 不能包含当前全量 `canvas.order` 主路径 op

如果违反，必须标记为 `rejectedChange`。

### 7.3 Checkpoint

正式定义：

```ts
type CrdtCheckpoint = {
  protocolVersion: 1
  boardId: string
  checkpointId: string
  clientId: string
  lamport: number
  at: number
  doc: Document
  covered: Record<string, number>
}
```

字段语义：

- `checkpointId`：checkpoint 唯一标识
- `clientId`：生成该 checkpoint 的副本
- `lamport`：该 checkpoint 覆盖到的逻辑时序位置
- `at`：诊断时间戳
- `doc`：checkpoint document
- `covered`：该 checkpoint 已覆盖到的 seq vector

### 7.4 Checkpoint 选择规则

存在多个 checkpoint 时，优先选择：

1. `lamport` 更大
2. 若相同，则 `checkpointId` 字典序更大

选择的目标是：

- 最大覆盖
- 稳定 deterministic

### 7.5 Checkpoint 与 `document.replace`

`document.replace` 的正式用途只有：

- 启动时加载 checkpoint
- resync / repair
- 协议不兼容回退

它不进入 live op log。

---

## 8. 本地 Session 状态 contract

每个副本都要维护自己的协作状态。

### 8.1 最小状态

```ts
type PendingChanges = Record<string, CrdtChangeEntry[]>

type RejectedChange = {
  changeId: string
  reason:
    | 'protocol_invalid'
    | 'version_mismatch'
    | 'duplicate_conflict'
    | 'dependency_missing'
    | 'replay_invalid'
    | 'gap_timeout'
  details?: unknown
}

type CrdtSessionState = {
  boardId: string
  clientId: string
  sessionId: string
  nextSeq: number
  localLamport: number
  applied: Record<string, number>
  appliedChangeIds: Set<string>
  pending: PendingChanges
  latestCheckpointId?: string
  rejectedChanges: RejectedChange[]
}
```

### 8.2 必须持久化的字段

下面这些字段必须落本地 durable storage：

- `clientId`
- `nextSeq`
- `localLamport`
- `applied`
- `latestCheckpointId`

原因：

- 刷新 / 重连不能换身份
- `seq` 不能回退
- bootstrap 后要知道哪些 tail ops 还没 replay

### 8.3 不要求持久化的字段

下面这些可以只驻留内存：

- `sessionId`
- `pending`
- `appliedChangeIds`
- `rejectedChanges`

如果要做更强恢复，再考虑把 `rejectedChanges` 和部分 dedupe 状态持久化。

---

## 9. 启动、发布、回放流程

### 9.1 冷启动

正式启动流程：

1. 取得最新 checkpoint
2. `engine.execute({ type: 'document.replace', document: checkpoint.doc })`
3. 初始化本地 `applied = checkpoint.covered`
4. 连接 Yjs/provider
5. 读取所有不被 checkpoint 覆盖的 change entries
6. 补洞、排序、回放 tail changes
7. 进入 live sync

这里的关键点：

- 启动不是从 Yjs materialize 整份 document
- 启动一定是 `checkpoint.doc + tail ops`

### 9.2 本地发布

本地 publish 流程：

1. 用户操作先走 `engine.execute(command)` 或 `engine.apply(...)`
2. 得到本地 `Commit`
3. 如果 `origin === 'remote'`，不发布
4. 如果 `commit.ops.length === 0`，不发布
5. 生成 `CrdtChangeEntry`
6. 追加到 `ops`
7. 更新 `heads[clientId]`

注意：

- publish 的输入是 `commit.ops`
- 不是 `commit.changes`
- `inverse` 不发布到协作层

### 9.3 发布 basis

一条本地 change 的 `basis` 必须来自它生成前本地 session 已应用的 vector。

也就是说：

- `basis` 反映“作者生成这条 change 时看见了什么”
- 不是“这条 change 发布后本地的最新状态”

### 9.4 远端接收

Yjs transaction 到达后：

1. decode 新出现的 change entries
2. 过滤错误版本和错误 board
3. 按 `changeId` 去重
4. 依据 `seq` 和 `basis` 进入 ready / pending
5. 对 ready changes 按总序排序
6. 聚合后调用 `engine.apply({ ops }, { origin: 'remote' })`
7. 成功则更新 `applied`
8. 失败则记录 `rejectedChange`，并视情况触发 resync

### 9.5 Ready 条件

一条 change `E` 只有在下面两个条件都满足时，才允许 replay：

1. `E.seq === (applied[E.clientId] ?? 0) + 1`
2. 对于 `E.basis` 中每个 `(clientId, seq)`：
   - `(applied[clientId] ?? 0) >= seq`

也就是说：

- 同 client 严格顺序
- 跨 client 必须满足 basis 依赖

### 9.6 Pending 与补洞

不满足 ready 条件的 change 必须进入 `pending`，不能直接强行回放。

需要区分两种 pending：

- `seq` 缺口
- `basis` 依赖未满足

如果 gap 长时间不闭合，必须触发：

- `gap_timeout`
- resync from latest checkpoint

### 9.7 远端 batch replay

协作层可以把多个 ready changes 聚合成一次 remote batch，以减少 UI 抖动和 invalidation 次数。

但要求：

- 必须保留 change 边界信息
- 如果整批 `engine.apply(...)` 失败，必须能够回退到更小粒度定位哪个 change 被 reject

推荐策略：

1. 优先把一小段 ready changes flatten 成一个 batch
2. 如果 `engine.apply(...)` 失败，则二分或退化到逐 change replay
3. 只把真正失败的 change 标记为 `rejected`

### 9.8 远端 change 永不进入 local undo

remote replay 必须继续走：

- `origin: 'remote'`

这样：

- remote change 不会进入本地 undo stack
- 本地 history 仍然是本地用户视角的线性历史

---

## 10. 冲突裁决总规则

本节定义 whiteboard 协作里的正式冲突语义。

### 10.1 三层裁决

所有冲突按三层处理：

#### 第一层：协议有效性

非法协议直接 reject：

- 错版本
- 错 board
- 错 op 白名单
- 错 `changeId`
- `seq` 非法回退

#### 第二层：因果与顺序

先按 ready 条件补足因果，再按总序回放。

#### 第三层：领域冲突

在领域层按本文定义的存在性、LWW、delete-wins、order、mindmap 规则裁决。

### 10.2 Duplicate 规则

同一个 `changeId`：

- payload 完全相同：视为重复投递，直接忽略
- payload 不同：协议损坏，必须 reject 并建议 resync

### 10.3 No-op 与 Reject 的区别

必须区分这两类结果：

#### no-op

语义上允许，但当前已经没有可做的事情。

例如：

- 删除一个已经不存在的 edge
- 重复收到相同 change

#### reject

语义或协议不成立。

例如：

- `document.replace` 进入 live log
- `node.field.set` 指向永远不存在的 node
- 同 id create 但 payload 冲突
- 结构性 mindmap move 造成 cycle

只有 reject 才进入 `rejectedChanges`。

---

## 11. 领域冲突 contract

### 11.1 实体存在性模型

协作层维护一张存在性裁决表，逻辑上类似 tombstone index。

它不是 `Document` 的正式字段，而是 replay 辅助元数据。

对每个 entity id，协作层需要能够回答：

- 当前是否存在
- 如果不存在，是被哪条 delete-like change 删除

### 11.2 create / restore

`create` 与 `restore` 在协作层都属于“使实体重新存在”的 op。

规则：

- 若目标 id 当前不存在：允许创建
- 若目标 id 已存在且 payload 等价：视为重复 no-op
- 若目标 id 已存在且 payload 不等价：reject

由于 whiteboard 的 id 应该由本地生成器保证全局近似唯一，因此“同 id 冲突 create”属于协议异常，不应当被正常合并。

### 11.3 delete-wins

本文正式采用：

- 并发 `delete` 与 `update`，`delete-wins`

这里的“并发”按 `basis` 定义，不按到达顺序定义。

实现语义：

- 如果某 change 对某实体做 mutation
- 且存在一个与它并发或发生在它之后的 delete-like change 覆盖该实体
- 则该 mutation 必须被丢弃或导致该 change reject，不能 resurrect 被删实体

### 11.4 哪些 op 属于 delete-like

delete-like 包括：

- `node.delete`
- `edge.delete`
- `group.delete`
- `mindmap.delete`
- `mindmap.topic.delete`

其中：

- `mindmap.delete`
- `mindmap.topic.delete`

会级联删除其子树节点和相关连接边，因此它们对被覆盖实体都建立 delete tombstone。

### 11.4.1 missing target 的正式处理

针对目标实体缺失，正式处理规则如下：

- `delete` 指向缺失目标：no-op
- `create` / `restore` 指向已存在且同 payload：no-op
- `create` / `restore` 指向已存在且不同 payload：reject
- `patch` / `move` / 结构性 mutation 指向缺失目标：
  - 如果是因为依赖 change 还没 ready：pending
  - 如果完成补洞和 recovery 后目标仍不存在：reject

这里不允许偷偷把缺失目标 mutation 降级成 no-op。

原因：

- delete missing target 通常是幂等语义
- patch / move / structural op 缺依赖则意味着用户意图无法成立，直接吞掉会掩盖协议错误

### 11.5 scalar / register 字段

长期正式协议里，下列字段继续按字段级 register 处理：

- `position`
- `size`
- `rotation`
- `groupId`
- `locked`
- `owner`
- `textMode`
- `mindmap.layout`
- `mindmap.branchStyle`

并发写同一字段时：

- 赢家是总序更后的 change

这些字段必须通过显式 field op 表达：

- `node.field.set/unset`
- `edge.field.set/unset`
- `group.field.set/unset`
- `mindmap.topic.field.set/unset`
- `mindmap.branch.field.set/unset`

这些字段的特点是：

- 本身就是小粒度 register
- 不值得再拆 path
- 但也不应该再被装进 `*.patch` bag

### 11.6 record tree 的正式语义

长期正式协议里，下面这些字段不再允许走整字段 replace 主路径：

- `node.data`
- `node.style`
- `edge.data`
- `edge.style`
- `edge label record/style`
- `mindmap topic data`
- `mindmap topic style`

它们必须进入 shared op 层的 path mutation 协议：

- `record.set`
- `record.unset`

或者等价的实体专用命名：

- `node.record.set`
- `node.record.unset`
- `edge.record.set`
- `edge.record.unset`
- `mindmap.topic.record.set`
- `mindmap.topic.record.unset`

规则：

- path 只允许 object key，不允许数组 index
- exact-path 并发：LWW
- ancestor / descendant 并发：更晚 change 对其覆盖范围生效
- 缺失 object ancestor 可以自动创建
- 如果 path 穿过非 object container，则该 op 非法

这部分正式语义以：

- [`WHITEBOARD_SHARED_OP_PATH_MUTATION.zh-CN.md`](/Users/realrong/Rostack/WHITEBOARD_SHARED_OP_PATH_MUTATION.zh-CN.md)

为准。

### 11.7 `node.move`

`node.move` 本质上是 `position` register mutation。

冲突语义：

- 并发 move，按总序最后一个生效

### 11.8 `document.background`

`document.background` 是共享 document-level register。

冲突语义：

- LWW

### 11.9 `group.field.set/unset`

`group.field.set/unset` 只覆盖：

- `locked`
- `name`

冲突语义：

- 按字段级 LWW

### 11.10 `edge.field.set/unset`

长期正式协议里，`edge.field.set/unset` 只处理 edge 自身的 scalar / small-register 字段。

尤其注意：

- `route`
- `labels`
- `data`
- `style`

都不应该再继续挂在粗粒度 `edge.patch` 更新下。

长期正确做法是：

- `edge.data` / `edge.style` 进入 path mutation
- `edge.labels` 进入 stable-id label collection
- `edge.route.points` 进入 stable-id route point collection

### 11.11 ordered collection 的正式语义

长期正式协议里，任何需要协作的有序集合都必须满足：

- 元素带稳定 id
- 插入 / 删除 / 移动 / 内容更新分开建模
- move 一律基于元素 id 和 anchor
- 不允许 generic `splice`
- 不允许 index-based `move`

正式集合包括但不限于：

- `canvas order`
- `edge labels`
- `edge route points`

这意味着：

- `canvas.order.move`
- `edge.label.insert/delete/move/field.set/unset/record.set/unset`
- `edge.route.point.insert/delete/move/field.set`

是长期主路径；

而：

- 全量 `canvas.order`
- `labels` 整字段 replace
- `route` 整字段 replace
- generic `splice`

都只能退出正式 shared op 主路径。

---

## 12. Order 协议

`canvas.order` 是协作里必须先补齐的正式 contract。

### 12.1 长期目标

长期正式共享 op 应该是：

```ts
type CanvasOrderAnchor =
  | { kind: 'front' }
  | { kind: 'back' }
  | { kind: 'before'; ref: CanvasItemRef }
  | { kind: 'after'; ref: CanvasItemRef }

type Operation =
  | ...
  | {
      type: 'canvas.order.move'
      refs: readonly CanvasItemRef[]
      to: CanvasOrderAnchor
    }
```

### 12.2 全量 `canvas.order` 的定位

全量 `canvas.order` 只能保留为：

- import
- repair
- resync
- checkpoint recovery

它不应该进入 live op log 主路径。

### 12.3 `canvas.order.move` 的共享语义

apply 语义是：

- 先把 `refs` 从当前 order 里抽出
- 再按 anchor 插回
- 保留 `refs` 内部相对顺序

### 12.4 anchor 失效规则

如果 `to.kind` 是 `before` 或 `after`，必须定义 anchor 丢失时的行为。

正式规则：

- anchor 不存在：整条 `canvas.order.move` no-op
- anchor 包含在 `refs` 自己内部：整条 no-op
- `refs` 里没有任何仍然存在的元素：整条 no-op

选择 no-op 而不是隐式降级到 `front/back`，是为了避免引入额外惊讶行为。

### 12.5 并发 move 的规则

多个并发 `canvas.order.move` 同时操作同一批 refs 时：

- 先按总序回放
- 后序 move 看到的是前序 move 已改写后的 order
- 因此更后的 move 获得最终胜出结果

### 12.6 inverse

`canvas.order.move` 的 inverse 第一版直接使用：

- `canvas.order` 快照恢复

也就是：

- 业务共享主路径用 `move`
- history inverse 允许暂时退回 `set`

### 12.7 CRDT 落地层

业务语义层保留 `canvas.order.move`。

底层具体 CRDT 存储可以有两种实现：

- 用 Yjs sequence 表达 order
- 用 `orderKey` 表达 order

但这两层不能混淆：

- `move` 是领域协议
- sequence / orderKey 是底层收敛实现

---

## 13. Mindmap 协议

mindmap 是第二个必须明确 contract 的区域。

### 13.1 shared vs local

正式结论：

- shared：
  - `mindmap.layout`
  - `mindmap.root.move`
  - `mindmap.topic.insert`
  - `mindmap.topic.restore`
  - `mindmap.topic.move`
  - `mindmap.topic.delete`
  - `mindmap.topic.field.set/unset`
  - `mindmap.topic.record.set/unset`
  - `mindmap.branch.field.set/unset`
- local-only：
  - `mindmap.topic.collapse`

### 13.2 `mindmap.layout`

`mindmap.layout` 是共享 persistent state，不是本地偏好。

原因：

- side / mode / hGap / vGap 会改变整个 mindmap 的持久化几何收敛
- 这属于 document 语义，而不是个人视图

### 13.3 `mindmap.topic.insert`

正式规则：

- `child`：要求 parent 存在
- `sibling`：要求 target 存在，且其 parent 可解析
- `parent`：要求 target 存在

若依赖对象暂时未就绪：

- 进入 pending

若依赖经 checkpoint recovery 后仍然不存在：

- reject

### 13.4 `mindmap.topic.move`

要求：

- 被移动 topic 存在
- 新 parent 存在
- 不得把节点移到自己的子树里

如果目标 parent 丢失：

- pending 或 reject，不能隐式降级到 root

### 13.5 `mindmap.topic.delete`

规则：

- 删除不存在 topic：no-op
- 删除 root topic：reject
- 删除子树时，同时对该子树节点和关联 edge 建立 delete tombstone

### 13.6 `mindmap.topic.field.set/unset`

长期正式协议里，`mindmap.topic.field.set/unset` 只处理 topic 自身的 scalar 字段：

- `size`
- `rotation`
- `locked`

而：

- `topic.data`
- `topic.style`

必须进入 path mutation：

- `mindmap.topic.record.set`
- `mindmap.topic.record.unset`

### 13.7 `mindmap.branch.field.set/unset`

`branchStyle` 按字段级 LWW。

### 13.8 mindmap layout 几何收敛

mindmap layout 仍然通过本地 reducer / reconcile 执行。

要求：

- 同一 shared tree + layout spec
- 同一 node size 输入
- 所有副本都得到同一 persistent geometry

否则协作会出现重复 layout 抖动。

---

## 14. Lock contract

lock 规则继续由 engine 决定，不交给 Yjs。

正式规则：

- 所有 remote change 最终都进入 `engine.apply({ ops }, { origin: 'remote' })`
- 不允许 collab 层绕过 engine 直接改本地 document

这样可以保留当前已存在的批处理合法性：

- 先 unlock 再 delete
- 先 unlock 再 field / record mutation

这些都应该继续由 engine 一次 batch 校验和执行。

要求：

- 单条 change entry 的 `ops` 不能被拆散到不同的 engine.apply 调用里
- 否则 lock 合法性会被破坏

---

## 15. Undo / Redo contract

这一节必须明确，不然协作上线后最容易出错。

### 15.1 undo / redo 是本地行为，不是全局历史重写

正式定义：

- undo / redo 永远只操作本地 history
- 它们的结果是新的本地 commit
- 这个新的本地 commit 会像普通 change 一样发布到共享 log

也就是说：

- 不存在“全局协作 undo”
- 不存在“删除远端历史条目”
- 只有“本地生成 inverse change，再发布”

### 15.2 协议 source

undo / redo 发布 change 时：

- `source: 'undo'`
- `source: 'redo'`

这主要用于诊断，不改变 replay 语义。

### 15.3 undo 冲突

如果用户尝试 undo 一条本地历史，但目标对象已经被远端改写：

- undo 仍然生成普通 inverse ops
- inverse ops 进入正常协作裁决流程

结果可能有三种：

- 正常生效
- 部分 op no-op
- 整条 change reject

不允许为了“强行 undo 成功”去改写共享历史。

### 15.4 remote change 不进入 local undo

继续保留当前规则：

- remote replay 不进本地 undo stack

这条规则不改。

---

## 16. Replay 失败与 Reject contract

### 16.1 必须显式记录 rejected change

远端 replay 失败时不能静默吞掉。

必须记录：

```ts
type RejectedChange = {
  changeId: string
  reason:
    | 'protocol_invalid'
    | 'version_mismatch'
    | 'duplicate_conflict'
    | 'dependency_missing'
    | 'replay_invalid'
    | 'gap_timeout'
  details?: unknown
}
```

### 16.2 什么情况下 reject

下面这些情况必须 reject：

- live log 收到 `document.replace`
- 收到不允许进入共享协议的 op 类型
- 同 `changeId` 不同 payload
- seq 回退或非法跳跃
- 依赖恢复后仍不存在
- reducer / engine 判定这条 change 在当前正确因果前提下仍然非法

### 16.3 什么情况下触发 resync

下面这些情况建议直接触发 resync：

- `protocolVersion` 不兼容
- gap 长时间不闭合
- 同一个 client 连续出现协议错误
- replay 失败后无法靠单条 reject 恢复到稳定状态

resync 流程：

1. 拉最新 checkpoint
2. `document.replace`
3. 清空 pending
4. 重新 replay checkpoint tail

---

## 17. Checkpoint 与 GC contract

### 17.1 Checkpoint 不是主同步单元

主同步单元是：

- change log

checkpoint 的职责只有：

- 冷启动加速
- replay 尾部变短
- repair / resync 锚点

### 17.2 何时生成 checkpoint

第一版可以用简单策略：

- 每 N 条 change 生成一个 checkpoint

也可以加：

- idle time 压缩
- 日志字节阈值
- 实体数阈值

### 17.3 GC 前提

GC 只能在满足下面条件时进行：

- 至少保留一个有效 checkpoint
- 被删除的 op 全部已被该 checkpoint 的 `covered` 向量覆盖
- 删除后仍能通过“checkpoint + tail ops”完整恢复

### 17.4 第一版可以不做自动 GC

MVP 可接受：

- 先做 op log + checkpoint
- 暂不做 aggressive GC

但必须从协议层预留：

- checkpoint
- covered vector

否则后续 GC 无法补。

---

## 18. 性能 contract

### 18.1 为什么这条路线会更快

相比当前 snapshot sync：

- 本地小改动不再整份回写 snapshot
- 远端小改动不再以 `document.replace` 为主
- `engine` 现有 `impact` / `invalidation` 可以继续发挥作用

### 18.2 高频交互批量 flush

不要每次 pointermove 都发一条 change。

建议：

- UI 先本地乐观更新
- collab 层按手势边界或小时间窗合并 publish

例如：

- drag 中 16ms 或 32ms flush
- pointerup 强制 flush

### 18.3 replay 聚合

远端 replay 时：

- 先聚合 ready changes
- 再尽量 flatten 成一个或少数几个 `engine.apply(...)` batch

但必须保留失败时回退到 change 粒度定位 reject 的能力。

### 18.4 高频大字段不是第一版目标

第一版明确不承诺真正多人同时编辑下列热点字段会有理想 CRDT 体验：

- 富文本内容
- draw points
- 大型 `labels` 数组
- 大型自定义 `data` 树

这些都需要后续专门 op family。

---

## 19. 对当前代码的影响

### 19.1 不需要大改的部分

下面这些可以直接复用：

- `engine.execute(...)`
- `engine.apply({ ops }, { origin })`
- `Commit`
- `reduceOperations(...)`
- `history`
- `lock validate`

### 19.2 必须重做的部分

真正要重做的是：

- `whiteboard-collab`

原因很明确：

- 本地写 Yjs 仍然是 snapshot mirror
- 远端回放仍然是 `document.replace`

### 19.3 需要新增的协作层模块

建议新增：

- `collab/crdt/types.ts`
- `collab/crdt/session.ts`
- `collab/crdt/encode.ts`
- `collab/crdt/decode.ts`
- `collab/crdt/log.ts`
- `collab/crdt/checkpoint.ts`
- `collab/crdt/replay.ts`
- `collab/crdt/reject.ts`
- `collab/crdt/order.ts`

### 19.4 对 engine 的小改动建议

本地 write core 不需要大改，但建议做两件小事：

1. 新增 `canvas.order.move`
2. 去掉 `node/edge/group/mindmap.*.patch` bag，改成 `field.set/unset`
3. 新增正式的 shared-op path mutation family
4. 新增 stable-id collection op family（至少覆盖 labels / route points）
5. 给 replay / commit 增加更清楚的调试元数据

例如：

```ts
type CommitMeta = {
  sourceChangeId?: string
  sourceClientId?: string
  replay?: boolean
}
```

这不是协议必需项，但会显著改善协作诊断。

---

## 20. 实施阶段

### 第 1 期：协议与双写打底

目标：

- 定义 `CrdtChangeEntry`
- 定义 `CrdtCheckpoint`
- 本地 commit 双写到 op log 与现有 snapshot

注意：

- 这一期仍可保留 snapshot 主路径，目的是先把协议跑通

### 第 2 期：remote op-first replay

目标：

- remote 优先走 op log
- 只在失败时 fallback recovery replace

这一期必须完成：

- dedupe
- seq / basis / lamport
- pending / gap handling
- rejected change

### 第 3 期：checkpoint 正式化

目标：

- 启动改为 checkpoint + tail replay
- snapshot mirror 从主路径降级

### 第 4 期：order 与热点结构优化

优先级：

1. `canvas.order.move`
2. rich text / draw / label 专用 op
3. 更细粒度 collaborative field types

---

## 21. 最终结论

长期正确路线不是继续修补 snapshot sync，而是：

- 保留现有本地 write kernel
- 把 `Commit.ops` 升级为正式协作协议
- 用 Yjs 承载 change log + checkpoint
- 让远端回放重新回到 `engine.apply({ ops }, { origin: 'remote' })`

一句话总结：

**本地 write core 已经基本成型，真正需要补的是完整协作 contract；同步单元必须从 snapshot 变成 operation log + checkpoint。**
