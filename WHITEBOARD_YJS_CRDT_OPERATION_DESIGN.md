# Whiteboard Yjs + CRDT + Operation 设计与实现方案

本文目标是给出一套**继续依赖 Yjs，但把业务同步真正拉回 CRDT / operation 层**的方案。它不是泛泛而谈协作，而是基于当前仓库中已有的两层能力来设计：

- `whiteboard/packages/whiteboard-engine`
- `whiteboard/packages/whiteboard-collab`

当前现状可以概括为：

- `engine` 内部已经是 operation-first 的本地写内核
- `collab` 目前仍然更接近 snapshot sync，而不是 operation sync
- `Yjs` 已经接入，但主要承载的是共享 document snapshot，而不是业务级 operation CRDT

本方案的核心目标是：

**保留 Yjs 作为分布式同步运行时，但让 whiteboard 的业务真相从“共享 document 快照”升级为“可复用 engine operation 的 CRDT 变更流”。**

---

## 1. 设计目标

这套方案优先解决五个问题。

### 1.1 最大化复用现有 engine

当前 `engine` 最有价值的部分已经存在：

- `command -> operation -> reduce -> commit`
- `sanitize`
- `lock validate`
- `inverse/history`
- `read impact`

新方案不应该绕过它，而应该让多人协作真正复用它。

### 1.2 继续使用 Yjs

Yjs 仍然有价值：

- provider 生态成熟
- awareness 现成
- 断线重连、广播、状态同步基础设施完备
- 已有接入成本不应被推翻

但 Yjs 的角色需要重新定义：

- 不再直接充当“白板业务 document 的唯一真相源”
- 而是充当“CRDT 变更分发层 + checkpoint 容器 + awareness runtime”

### 1.3 走 CRDT 路线，而不是 OT

本方案明确走 CRDT，不走传统 OT，原因是：

- whiteboard 是对象图编辑器，不是纯文本编辑器
- 业务对象包含 node、edge、group、order、mindmap、layout、副作用
- 批量 operation 和对象级 merge 比逐字符 transform 更自然
- Yjs 本身就是 CRDT runtime，继续基于它演进更顺手

### 1.4 远端变更要走 operation 语义，而不是 snapshot replace

理想结果是：

- 本地变更生成 `Operation[]`
- 远端同步也消费 `Operation[]`
- engine 负责业务约束和 materialize
- 远端不再主要通过 `document.replace` 回灌

### 1.5 性能要优于当前 snapshot sync

至少要优于当前的两个问题：

- 每次本地 commit 都整份写 snapshot，写放大明显
- 远端收到变化后经常整份 replace，本地历史和增量语义变粗

---

## 2. 对当前架构的判断

## 2.1 engine 值得保留，collab 需要重做同步语义

我对当前仓库的判断是：

- `engine` 架构方向正确，属于可继续放大的内核
- `collab` 当前只是一个可用的同步适配层，还不是最终方案

当前协作层的问题不是“没有 Yjs”，而是：

- **没有把 engine 的 operation 能力真正带进协作通道**

也就是说，今天最应该增强的不是 `reduceOperations`，而是：

- 本地 commit 如何以 CRDT 方式发布
- 远端变更如何以 operation 方式回放

## 2.2 当前方案为什么不够好

当前 `whiteboard-collab` 的核心问题有三个：

### 问题 1：本地提交同步粒度太粗

`applyOperationsToYjsDocument(...)` 名义上接收 operation，但当前实际上直接把最新 snapshot 写回 Yjs。

这意味着：

- operation 只是本地中间产物
- 同步层没有消费 operation
- 网络和存储粒度都偏粗

### 问题 2：远端变化回放粒度太粗

`compileRemoteDocumentChange(...)` 当前基本只有两种结果：

- 没变化
- `document.replace`

这意味着：

- 远端操作意图丢失
- engine 的约束和历史语义没有真正沿远端路径复用

### 问题 3：协作真相源层次不对

当前更像是：

- Yjs 维护共享 document
- engine 被动接受对齐

更理想的层次应该是：

- engine 维护领域状态和语义
- Yjs 维护分布式 CRDT 变更流和 checkpoint

---

## 3. 核心思路

## 3.1 一句话定义

**用 Yjs 存储 CRDT 变更流和必要的实体索引，不再把整份 document snapshot 作为主要同步单元；本地和远端都通过 `ChangeSet / Operation[]` 驱动 engine 收敛。**

## 3.2 角色分工

新的职责分工如下：

### engine

- command 翻译
- operation 约束校验
- operation reduce
- inverse/history
- read impact
- 从 operation materialize document

### collab-crdt layer

- 把本地 `Commit.changes` 发布到 Yjs CRDT 结构
- 从 Yjs CRDT 结构提取远端 changes
- 做去重、顺序确认、补洞、checkpoint 装载
- 调用 `engine.applyOperations(remoteOps, { origin: 'remote' })`

### Yjs

- 变更流广播
- CRDT 合并
- presence / awareness
- checkpoint 持久化容器

关键点在于：

**Yjs 负责“分布式收敛和同步”，engine 负责“业务语义和状态归约”。**

---

## 4. 方案选型：为什么是 ChangeSet CRDT，而不是共享 Document CRDT

如果继续用 Yjs，大致有三条路：

### 路线 A：继续共享整份 document

优点：

- 最容易实现

缺点：

- 本质仍是 snapshot sync
- 很难复用 engine operation
- 远端语义粗，性能一般

### 路线 B：共享 document 的实体分片

比如：

- `nodes/<id>`
- `edges/<id>`
- `groups/<id>`
- `order`

优点：

- 比整份 snapshot 更细
- 能减少写放大

缺点：

- 业务真相仍偏向 Yjs 结构
- operation 只是“翻译时顺便产生的东西”
- 很多约束仍然很难在远端路径复用完整

### 路线 C：共享 ChangeSet / Operation CRDT

也就是：

- document 由 engine materialize
- Yjs 共享的是 change log 和 checkpoint

优点：

- 与当前 engine 最匹配
- 真正复用 operation
- 更适合做审计、回放、离线恢复
- 协作路径和本地写路径统一

缺点：

- 实现难度更高
- 需要定义去重、因果、checkpoint 机制

**本方案选择路线 C。**

为了避免第一版协议过重，下面的设计都按 **MVP 优先** 来写：

- 先保证 `op log + replay + checkpoint recovery` 跑通
- 先不引入复杂因果图字段
- 先不把变更协议做成审计日志系统
- 高级元数据留给后续版本

---

## 5. CRDT 数据模型

## 5.1 顶层 Yjs 结构

建议在 Yjs 根节点下定义如下结构：

```text
whiteboard
  ├─ version: number
  ├─ ops: Y.Array<Y.Map>
  ├─ checkpoints: Y.Array<Y.Map>
  ├─ heads: Y.Map<number>
  └─ presence: awareness
```

说明：

- `ops` 存放 change entries
- `checkpoints` 存放快照检查点
- `heads` 记录每个 client 已发布到的本地序号
- `presence` 继续沿用 provider awareness

`ack`、`gc` 这类结构第一版可以不做，避免协议复杂度过高。等后面真的做服务端确认、日志压缩和后台 GC 时再补即可。

## 5.2 Change Entry 结构

每一个本地 commit 都发布为一条 change entry。

MVP 建议结构：

```ts
type CrdtChangeEntry = {
  protocolVersion: 1
  clientId: string
  seq: number
  operations: Operation[]
}
```

字段含义：

- `protocolVersion`: 协议版本，后续升级时用于兼容判断
- `clientId`: 发送端身份
- `seq`: 该 client 的单调递增序号
- `operations`: 真正的业务增量

额外约定：

- `changeId` 不必单独存，直接派生为 `${clientId}:${seq}`
- 第一版不加 `lamport`
- 第一版不加 `wallClock`
- 第一版不加 `parentChangeIds`
- 第一版不加 `hash`

原因很简单：

- 这些字段都不是“去重、顺序、回放”三件事的最小必要条件
- 协议第一版越小，越容易先把链路跑通

## 5.3 Checkpoint 结构

checkpoint 不是主同步单元，但对启动速度很重要。

MVP 建议结构：

```ts
type CrdtCheckpoint = {
  checkpointId: string
  at: number
  doc: Document
  lastSeqByClient: Record<string, number>
}
```

checkpoint 的职责：

- 新客户端快速加载
- 避免无限 replay 全量历史
- 为日志压缩和 GC 提供锚点

字段说明：

- `checkpointId`: checkpoint 标识
- `at`: 创建时间，主要用于诊断和选择最近 checkpoint
- `doc`: 当时的完整 document
- `lastSeqByClient`: 该 checkpoint 已经覆盖到每个 client 的哪个 `seq`

为什么保留 `lastSeqByClient`：

- 它比 `coveredChangeIds` 更轻
- 对“checkpoint 后哪些 change 还要 replay”这个问题已经足够
- 也更适合第一版恢复逻辑

## 5.4 为什么 `ops` 仍然用 Y.Array

看起来 `Y.Map<changeId, entry>` 也可以，但我更建议 `Y.Array` 配合 `changeId` 去重，因为：

- 变更流天然有 append 语义
- 调试和导出更直观
- 更容易做顺序扫描和 checkpoint 截断

应用层不要依赖 `Y.Array` 的物理顺序作为唯一顺序依据，而是：

- 先收集 entry
- 先按 `clientId + seq` 去重
- 再按 Yjs 中的 append 顺序回放

对 MVP 来说，这已经够用，因为：

- 每个客户端自己的顺序由 `seq` 保证
- 不需要第一天就引入全局逻辑时钟
- 如果后面要做跨 checkpoint 重排、服务端合并或更严格的因果排序，再引入 `lamport`

---

## 6. 状态收敛模型

## 6.1 真相源定义

新的真相源分两层：

### 分布式真相源

- `ops + checkpoints` 是协作层真相源

### 本地运行时真相源

- `engine.document.get()` 是当前节点上的 materialized runtime state

这两个真相源不是冲突关系，而是：

- 前者是可同步、可恢复的 CRDT 日志层
- 后者是日志层在本地通过 engine 归约出的运行态

## 6.2 本地状态构建方式

推荐区分两种来源，但统一语义：

- 有服务端时，优先加载服务端提供的 `latest checkpoint`
- 没有服务端时，再从 Yjs 中读取最新 checkpoint

这里的关键不是“是不是服务端 document”，而是：

**服务端返回的最新 document 必须被定义为 checkpoint，而不是一个裸 document。**

也就是说，服务端返回值至少要包含：

```ts
type LatestCheckpointPayload = {
  checkpointId: string
  at: number
  doc: Document
  lastSeqByClient: Record<string, number>
}
```

为什么不建议只加载“服务端最新 document”：

- 裸 document 不知道自己已经覆盖了哪些 changes
- 客户端无法判断后续该 replay 哪些 op
- 很容易把“服务端 document”和“Yjs/op log”变成两个真相源

所以更准确的说法应该是：

- 冷启动时优先拉服务端最新 checkpoint
- checkpoint 中的 `doc` 负责启动速度
- checkpoint 中的 `lastSeqByClient` 负责恢复精度

任一客户端启动时的推荐流程：

1. 获取最新 checkpoint
2. 用 `engine.execute({ type: 'document.replace', document: checkpoint.doc })` 初始化运行态
3. 连接 Yjs/provider
4. 根据 `checkpoint.lastSeqByClient` 找出 checkpoint 之后尚未应用的 changes
5. 按约定顺序 replay tail ops

注意：

- 不是从 Yjs materialize 整份 document
- 而是从 `checkpoint.doc + tail changes` materialize 当前状态

这一步才算真正进入 operation/CRDT 架构。

## 6.3 启动与恢复策略

为了统一团队语言，建议直接采用下面的术语约定：

- `latest document` 只在实现层做描述
- 协议层统一叫 `latest checkpoint`

也就是说：

**服务端提供的最新 document，在协议语义上就是 latest checkpoint。**

这样可以避免两种误解：

- 误解一：服务端 document 是独立真相源
- 误解二：checkpoint 只是 Yjs 里的本地缓存

推荐的数据流如下：

```text
client boot
  -> fetch latest checkpoint from server
  -> engine document.replace(checkpoint.doc)
  -> connect Yjs/provider
  -> read ops after checkpoint.lastSeqByClient
  -> replay tail ops
  -> enter live sync
```

如果没有服务端，则退化为：

```text
client boot
  -> read latest checkpoint from Yjs
  -> engine document.replace(checkpoint.doc)
  -> read ops after checkpoint.lastSeqByClient
  -> replay tail ops
  -> enter live sync
```

这两条路径的核心保持一致：

- 冷启动优化看 `checkpoint.doc`
- 增量恢复看 `lastSeqByClient`
- 实时协作看 `op log`

不要把这三层职责混在一起。

---

## 7. 操作流转设计

## 7.1 本地写入流程

```text
UI
  -> engine.execute(command)
  -> Commit
  -> Commit.changes
  -> convert to CrdtChangeEntry
  -> append into Yjs ops
  -> heads[clientId] = seq
```

流程解释：

- engine 仍然先本地执行，保证本地响应速度
- 本地 commit 成功后，再把 `changes.operations` 发布为一条 CRDT change

## 7.2 远端接收流程

```text
Yjs transaction arrives
  -> read newly seen change entries
  -> dedupe by changeId
  -> causal ordering / sort
  -> apply unseen operations to engine
  -> mark applied
```

这里的关键是：

- 远端只回放“没见过的 change”
- 远端不是直接把共享 document 覆盖进 engine

## 7.3 断线恢复流程

客户端恢复时：

1. 检查本地最后已应用 checkpoint id 和 applied change set
2. 优先拉取服务端最新 checkpoint；若不可用，再从 Yjs 重建最新 checkpoint
3. 依据 checkpoint 的 `lastSeqByClient` 回放缺失 changes
4. 如发现 local optimistic changes 已在日志里存在，则用 `changeId` 去重

---

## 8. 冲突处理策略

既然走 CRDT，就必须明确冲突如何裁决，而不是只说“最终一致”。

## 8.1 基本原则

本方案的冲突处理分三层：

### 第一层：change-level 去重

同一个 `changeId` 只应用一次。

### 第二层：causal ordering

MVP 版本不引入完整因果图，只定义一套足够稳定的回放规则：

- 同一 `clientId` 内严格按 `seq` 回放
- 跨客户端先按日志扫描顺序处理
- 若发现某客户端存在 `seq` 缺口，则暂存等待补洞

### 第三层：operation-level 领域冲突规则

真正业务冲突不由 Yjs 隐式决定，而由 engine + 明确规则决定。

## 8.2 节点和边的冲突语义

### `node.create / edge.create`

- 同 id 重复 create：只接受第一条合法 create
- 后续同 id create 视为重复或非法
- 若要支持更强幂等，后续版本可以再补 hash

### `node.update / edge.update`

建议拆成两类：

- `fields` 类更新：LWW register 语义
- `records` 类更新：path-level CRDT 语义

#### fields 更新

像这些字段：

- `position`
- `size`
- `rotation`
- `layer`
- `zIndex`
- `groupId`
- `locked`
- `textMode`
- `route`

可以采用：

- 先以“回放顺序上的最后写入”为准

也就是说：

- 同一字段并发写时，MVP 先按 change replay 顺序决定胜者
- 这依然是应用层明确规定的，而不是依赖 Yjs 默认结构冲突

后续如果发现“仅靠 replay 顺序”不够稳定，再升级为显式 `lamport` 驱动的 LWW。

#### records 更新

`node.update.records` 已经具备 path mutation 语义：

- `set`
- `unset`
- `splice`

这正是做 CRDT 的好入口。

建议策略：

- `set/unset` 走 path-level LWW register
- `splice` 仅对明确的 list path 开放，并转成 list CRDT 操作

如果 path 对应的是富文本、draw points、label list 这类高频数组字段，不建议继续复用“泛化 splice”，而应逐步细分为专门的 list/text CRDT 类型。

## 8.3 delete 冲突

删除最容易出问题，必须明确 tombstone 语义。

建议：

- `node.delete / edge.delete / group.delete` 不立即物理删除
- 先写 tombstone 元数据
- tombstone 的裁决优先级高于 update

规则：

- 并发 `update` 与 `delete`，默认 `delete-wins`
- 但允许某些系统级恢复操作显式 override

原因：

- 对对象图编辑器而言，删除后又被远端更新，通常比 delete-wins 更难解释

## 8.4 order 冲突

`canvas.order.set` 是当前 operation 里最需要重构的地方。

原因：

- 它是全量数组写
- 并发 reorder 时最容易产生粗粒度冲突

推荐改造方向：

- 不再把 order 当作单个大数组整体 LWW
- 把它升级为 sequence CRDT

可以用两种实现方式：

### 方式 A：Yjs sequence 承载 order list

优点：

- 实现快
- 能直接利用 Yjs 的序列 CRDT

缺点：

- order 语义部分脱离 engine operation

### 方式 B：自定义 position key

每个 canvas ref 有一个稳定顺序键，例如：

- `orderKey: string`

`front/back/forward/backward` 最终转化为：

- 重新分配受影响元素的 `orderKey`

优点：

- 更容易用 operation 表达
- 与日志/回放/幂等更一致

缺点：

- 需要设计 orderKey rebalance

**建议长期走方式 B，短期可以方式 A 过渡。**

### 8.4.1 为什么应该新增 `canvas.order.move`

结合当前代码实现，`document.order` 的 `front / back / forward / backward` 最终都会先在 translate 阶段算出一份完整的新数组，然后落成一条：

```ts
{ type: 'canvas.order.set', refs: nextOrder }
```

这有三个问题：

- 用户只是移动少量元素，但协议提交的是整份 order
- 协作回放丢失“移动意图”，只剩“最终数组结果”
- 对 CRDT 来说，全量 set 的冲突面太大

所以我建议把 `canvas.order.set` 从主路径降级，把正常交互改成新的领域 operation：

```ts
type CanvasOrderAnchor =
  | { kind: 'front' }
  | { kind: 'back' }
  | { kind: 'before'; ref: CanvasItemRef }
  | { kind: 'after'; ref: CanvasItemRef }

type Operation =
  | ...
  | {
      readonly type: 'canvas.order.move'
      readonly refs: readonly CanvasItemRef[]
      readonly to: CanvasOrderAnchor
    }
  | {
      readonly type: 'canvas.order.set'
      readonly refs: readonly CanvasItemRef[]
    }
```

设计原则：

- `move` 负责表达交互意图
- `set` 只保留给导入、repair、resync、checkpoint recovery 等兜底路径

### 8.4.2 为什么不用 `toIndex`

我不建议把协议设计成：

```ts
{
  type: 'canvas.order.move',
  refs: [...],
  fromIndex: 3,
  toIndex: 8
}
```

原因：

- index 是瞬时视图，不是稳定语义
- 并发下 index 最容易失效
- 远端 replay 时，数组状态很可能已经变化

所以协议应该使用相对锚点：

- `front`
- `back`
- `before ref`
- `after ref`

这类语义比 index 稳定得多，也更接近用户真实操作。

### 8.4.3 `forward/backward` 如何映射

上层 command 仍然可以保留：

- `front`
- `back`
- `forward`
- `backward`

但 translate 后建议这样收敛：

- `front` -> `canvas.order.move { to: { kind: 'front' } }`
- `back` -> `canvas.order.move { to: { kind: 'back' } }`
- `forward` -> 算出选择块在当前序列中的目标锚点，再转成 `before/after`
- `backward` -> 同上

也就是说：

- UI 命令层保留易用语义
- operation 层收敛为统一的 `move`

### 8.4.4 `move` 的 reduce 语义

`canvas.order.move` 的 apply 建议采用“抽出再插回”的语义，而不是原地 index 交换。

伪代码：

```ts
function applyCanvasOrderMove(
  current: CanvasItemRef[],
  refs: CanvasItemRef[],
  to: CanvasOrderAnchor
): CanvasItemRef[] {
  const selected = current.filter((ref) => refs.some((x) => same(x, ref)))
  if (!selected.length) return current

  const kept = current.filter((ref) => !refs.some((x) => same(x, ref)))

  switch (to.kind) {
    case 'front':
      return [...kept, ...selected]
    case 'back':
      return [...selected, ...kept]
    case 'before': {
      const index = kept.findIndex((ref) => same(ref, to.ref))
      if (index < 0) return current
      return [...kept.slice(0, index), ...selected, ...kept.slice(index)]
    }
    case 'after': {
      const index = kept.findIndex((ref) => same(ref, to.ref))
      if (index < 0) return current
      return [...kept.slice(0, index + 1), ...selected, ...kept.slice(index + 1)]
    }
  }
}
```

这套语义有几个优点：

- 对多选移动天然友好
- 保留被选中元素的相对顺序
- 更容易推导 inverse
- 更容易映射到 future orderKey / sequence CRDT

### 8.4.5 inverse 怎么做

`canvas.order.move` 的 inverse 最简单的做法不是“反向再 move 一次”，而是：

- 直接把移动前的顺序快照保存成一条 `canvas.order.set`

也就是说：

```ts
inverse(canvas.order.move) = {
  type: 'canvas.order.set',
  refs: [...document.order]
}
```

这样虽然不够“优雅”，但非常稳，适合作为第一版实现。

等后面 orderKey 稳定后，再考虑把 inverse 也细化成 move。

### 8.4.6 与 CRDT 的关系

短期内，`canvas.order.move` 本身就足以显著优于 `canvas.order.set`：

- 包更小
- replay 更轻
- 意图更清晰

长期建议是：

- 上层协议保留 `canvas.order.move`
- 底层存储用 orderKey 或 sequence CRDT 表达最终顺序

也就是：

- `move` 是业务语义
- orderKey / sequence 是 CRDT 落地结构

这两层不要混掉。

## 8.5 lock 冲突

当前 engine 的 lock 规则是 operation 批处理语义，这很好，应该保留。

在 CRDT 方案里，关键不是把 lock 交给 Yjs，而是：

- 所有远端 changes 最终都进入 `engine.applyOperations(remoteOps, { origin: 'remote' })`

这样：

- lock 校验与本地路径一致
- “先 unlock 再 delete” 这种批量合法路径也自然成立

注意一点：

如果某个远端 change 在当前本地上下文下被 engine 判为非法，不能直接忽略而不记录。建议记录为：

- `rejectedChange`
- 附 rejection reason

这样便于诊断协议问题或版本不兼容。

---

## 9. 与现有 engine 的集成方式

## 9.1 现有 engine 基本不用改动的大部分

可以直接复用的能力：

- `engine.execute(...)`
- `engine.applyOperations(...)`
- `Commit`
- `ChangeSet`
- `Operation`
- `reduceOperations(...)`
- `createHistory(...)`
- `validateLockOperations(...)`

这也是该方案最现实的地方：不用重写引擎。

### 9.1.1 order 相关建议改动

虽然整体不用重写，但我建议把 order 路径单独升级为：

1. 在 [`operations.ts`](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/types/operations.ts) 增加 `canvas.order.move`
2. 在 [`reduce.ts`](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/kernel/reduce.ts) 为 `canvas.order.move` 增加：
   - `buildInverse`
   - `trackReadImpact`
   - `applyOperation`
3. 在 [`policy.ts`](/Users/realrong/Rostack/whiteboard/packages/whiteboard-engine/src/write/translate/order/policy.ts) 中保留现有 `front/back/forward/backward` 算法，但输出从“整份 next order”改为“refs + anchor”
4. 在 [`document.ts`](/Users/realrong/Rostack/whiteboard/packages/whiteboard-engine/src/write/translate/plan/document.ts) 和 [`group.ts`](/Users/realrong/Rostack/whiteboard/packages/whiteboard-engine/src/write/translate/plan/group.ts) 中优先产出 `canvas.order.move`
5. `canvas.order.set` 仅保留给 fallback 路径

这样改的好处是：

- 不影响上层 command API
- 减少真正进入协作层的 payload
- 为 CRDT order 优化留出干净扩展点

## 9.2 需要新增的一层

建议新增一个新的包或目录：

- `whiteboard/packages/whiteboard-collab-crdt`

或者先放在现有包下：

- `whiteboard/packages/whiteboard-collab/src/crdt/*`

建议模块：

- `crdt/session.ts`
- `crdt/types.ts`
- `crdt/encode.ts`
- `crdt/decode.ts`
- `crdt/log.ts`
- `crdt/checkpoint.ts`
- `crdt/order.ts`
- `crdt/replay.ts`
- `crdt/materialize.ts`

## 9.3 session 重新定义

新的 session 不再监听 document snapshot diff，而是监听：

- engine commit -> 发布 local change
- Yjs ops/checkpoints transaction -> 拉取 remote changes

理想伪代码：

```ts
const onLocalCommit = (commit: Commit) => {
  if (commit.kind === 'replace') {
    publishCheckpoint(commit.doc)
    return
  }
  publishChange(commit.changes)
}

const onRemoteTransaction = () => {
  const unseen = readUnseenChanges()
  const ordered = sortChanges(unseen)
  replayChangesIntoEngine(ordered)
}
```

## 9.4 是否还要保留 document.replace

要保留，但只作为 fallback。

使用场景：

- checkpoint 装载
- 版本升级不兼容
- repair / resync
- replay 失败后的兜底恢复

也就是说：

- `document.replace` 从主路径降级为修复路径

---

## 10. 性能策略

这是本方案最重要的一部分之一，因为用户明确希望“更复用底层 operation，但性能更好”。

## 10.1 为什么会比当前方案更快

当前慢点主要在：

- 本地一次小改动也可能整份 snapshot 写回
- 远端一次小改动也可能触发整份 replace

CRDT operation 方案后：

- 网络只传本次变更的 `Operation[]`
- 远端只应用增量 operations
- engine 的 `read impact` 可以继续发挥作用

这三点组合起来，大画布下通常会明显优于 snapshot 替换。

## 10.2 批处理发送

不要每个小拖动都立即发一条 change。

建议：

- UI 高频交互先本地乐观更新
- 协作层按时间窗口或手势边界合并 commit

例如：

- drag 中 16ms 或 32ms 批量 flush
- pointerup 时强制 flush

这样可以显著减少 op 数量。

## 10.3 checkpoint 策略

建议在以下条件之一触发 checkpoint：

- 自上次 checkpoint 以来累计变更数 > N
- op log 字节数 > X
- 文档实体数 > 某阈值且日志尾过长
- 空闲时间触发压缩

初始可以用简单策略：

- 每 200 个 changes 一个 checkpoint

## 10.4 replay 优化

远端回放时不要一条一条地引发 UI 更新。

建议：

- session 先聚合一批 remote changes
- flatten 成一个 `Operation[]` 批次
- 单次调用 `engine.applyOperations(batch, { origin: 'remote' })`

收益：

- 复用 engine 的批处理语义
- `read impact` 聚合
- lock 校验能处理跨操作的前后依赖

## 10.5 热点字段专用 CRDT

不是所有字段都适合统一走通用 path-mutation。

高频热点字段建议专门优化：

- 富文本内容
- draw points
- 大型 labels 数组
- order

建议原则：

- 低频字段：继续走通用 operation
- 高频大字段：拆出专门 CRDT 数据类型，再映射回 operation

## 10.6 垃圾回收

如果引入 tombstone 和 op log，必须设计 GC。

建议：

- 仅在某 checkpoint 被所有活跃副本覆盖后，允许回收旧 log
- tombstone 在 checkpoint 固化后可以物理清理
- GC 只做后台维护，不进入交互关键路径

---

## 11. 失败与恢复策略

## 11.1 去重

每个客户端维护：

- `appliedChangeIds`
- `lastSeenSeqByClient`

这样可以避免：

- 重复投递
- reconnect 后重放重复 change

## 11.2 replay 失败

如果某条 remote change 无法被当前 engine 接受：

- 记录到 `rejectedChanges`
- 上报诊断
- 必要时触发 `resync from checkpoint`

不能简单静默吞掉。

## 11.3 协议版本升级

MVP 只要求 change entry 带版本即可：

```ts
protocolVersion: number
```

这样遇到老客户端时可以：

- 拒绝消费未知 operation
- 回退到 checkpoint replace

checkpoint 本身如果以后需要单独版本化，可以再补，不必第一版就加满。

---

## 12. 实施计划

建议分四期实施，而不是一步到位。

## 第 1 期：日志层打底

目标：

- 先把 Yjs 从 snapshot-only 改成 snapshot + op log 双写

实施：

- 保留当前 `replaceYjsDocument(...)`
- 新增 `publishChange(...)`
- 本地 commit 同时写 snapshot 与 op log
- 远端暂时仍用 snapshot 路径

收益：

- 不影响现网行为
- 先把 change protocol 跑起来

## 第 2 期：远端回放改为 op-first

目标：

- remote changes 优先走 `engine.applyOperations(...)`

实施：

- session 读取 unseen changes
- 按稳定顺序 batch replay
- replay 成功则更新 applied 状态
- replay 失败时 fallback checkpoint / replace

收益：

- 协作路径开始真正复用 engine

## 第 3 期：去掉 snapshot 主路径

目标：

- snapshot 从主同步路径降级为 checkpoint / recovery

实施：

- 本地写只发布 op log
- snapshot 改为定期 checkpoint
- 新客户端通过 checkpoint + tail replay 启动

收益：

- 明显减少写放大和 replace 频率

## 第 4 期：热点结构专门 CRDT 化

目标：

- 对高频字段做专用优化

实施优先级建议：

1. order
2. 富文本
3. draw points
4. mindmap tree

---

## 13. 推荐的代码落地方式

## 13.1 新增类型

建议新增：

```ts
type CrdtChangeEntry
type CrdtCheckpoint
type CrdtSessionState
type ChangeReplayResult
type RejectedChange
```

其中 `CrdtSessionState` 也建议先做最小版，例如：

```ts
type CrdtSessionState = {
  clientId: string
  nextSeq: number
  appliedSeqByClient: Record<string, number>
  latestCheckpointId?: string
}
```

## 13.2 新增 API

建议在 collab 层新增：

```ts
createYjsCrdtSession(...)
publishChange(...)
publishCheckpoint(...)
readUnseenChanges(...)
replayRemoteChanges(...)
compactCheckpoints(...)
```

## 13.3 对 engine 的轻量增强建议

虽然 engine 基本可复用，但我建议加两个增强点。

### 增强 1：批量 apply 的提交元数据

现在 `Commit` 已经有 `rev/at/doc/changes/impact`，可以考虑补：

- `sourceClientId?`
- `sourceChangeId?`
- `protocolVersion?`

这样调试协作时更方便。

### 增强 2：replay mode

建议 `applyOperations` 支持更明确的 replay 选项：

```ts
applyOperations(ops, {
  origin: 'remote',
  replay: true
})
```

目的是让未来：

- history
- telemetry
- side effects

能更明确地区分“用户实时操作”和“日志回放”。

---

## 14. 风险与 trade-off

这套方案不是没有代价，必须提前讲清楚。

### 风险 1：协议复杂度上升

从 snapshot sync 升级到 CRDT op log，必然更复杂。

### 风险 2：不是所有 operation 都天然是好 CRDT

尤其是：

- `canvas.order.set`
- mindmap 全树 patch
- 大数组 splice

这些需要细化。

### 风险 3：版本兼容压力更大

一旦把 operation 作为同步协议，旧客户端兼容性就比 snapshot 更敏感。

### 风险 4：日志和 checkpoint 的 GC 需要工程纪律

否则会出现：

- 日志膨胀
- checkpoint 失控
- 恢复复杂

但这部分不应该进入第一版协议。MVP 先把日志增长视为可接受成本，等链路稳定后再做压缩和 GC。

但总体上，这些风险都比“长期停留在 snapshot replace 协作”更值得解决。

---

## 15. 最终推荐

如果只给一句话建议，我的建议是：

**继续依赖 Yjs，但让 Yjs 承载 whiteboard 的 CRDT change log 和 checkpoint；把 document materialization、业务约束、远端回放重新收敛到现有 engine 的 operation pipeline。**

换句话说：

- 不换 Yjs
- 不重写 engine
- 重做 collab 的同步单元和状态层次

这是我认为对当前代码库最现实、最强复用、也最有长期价值的路线。

---

## 16. 简版实施结论

可以把最终形态理解成下面这张图：

```text
Local UI Command
  -> Engine translate/reduce
  -> Commit(ChangeSet)
  -> Publish CRDT change to Yjs

Remote Yjs changes
  -> Read unseen CRDT changes
  -> Order / dedupe / checkpoint resolve
  -> Engine.applyOperations(remoteOps)
  -> Materialized local document
```

与当前方案相比，核心变化只有一句：

**同步单元从“document snapshot”变成“CRDT change / operation”。**

这一步一旦完成，whiteboard 的多人协作架构才真正和它的 engine 内核对齐。
