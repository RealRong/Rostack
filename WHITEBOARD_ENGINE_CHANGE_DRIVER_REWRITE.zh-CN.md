# `whiteboard-engine change` 与 `projection driver` 的长期最优重写

## 1. 这件事必须先做

在继续落实 [WHITEBOARD_EDITOR_GRAPH_DELTA_REWRITE.zh-CN.md](/Users/realrong/Rostack/WHITEBOARD_EDITOR_GRAPH_DELTA_REWRITE.zh-CN.md) 之前，必须先把：

- `whiteboard-engine` 的 published `change`
- `whiteboard-editor` 的 `projection driver`

一起重写掉。

这不是“顺手优化”，而是前置第一步。

原因很简单：

1. `editor-graph` 的增量 patch 必须建立在稳定、精确、单事务的输入 delta 之上。
2. 当前 `engine -> driver -> editor-graph` 链路既不精确，也不是单事务。
3. 如果先做 `editor-graph delta`，最后只会把一套本应干净的增量系统建立在错误输入边界上。

所以长期最优的顺序必须写死：

1. 先重写 `engine change` publish contract
2. 再重写 `projection driver` 的 `mark / merge / flush` 机制
3. 最后再落实 `editor-graph` 的 `InputDelta / UpdateDelta`

这一步必须：

- 不计成本
- 不做兼容
- 不保留双轨
- 不接受“先沿用 reasons，后面再慢慢换”

---

## 2. 当前链路的问题

当前主链是：

```txt
engine.subscribe(() => update(['document']))
session/tool/edit/selection/preview/viewport.subscribe(() => update([...]))
  -> createEditorGraphInput(...)
  -> runtime.update(...)
```

它的问题不是一个，是整条链同时有问题。

### 2.1 engine 明明有 `change`，driver 却把它压平成 `'document'`

现在 engine publish 出来的 snapshot 已经带 `change`：

- `snapshot.change`

但 driver 没消费它，而是直接写成：

```ts
engine.subscribe(() => {
  update(['document'])
})
```

这相当于把 engine 已经具备的文档 delta 能力彻底浪费掉了。

### 2.2 driver 是“多 source 直接推 update”，不是事务聚合器

现在每个 source 都各自订阅、各自直接 `update(...)`：

- engine document
- tool
- edit
- selection
- preview
- viewport

这会导致：

- 同一轮事件内可能触发多次 `runtime.update`
- 同一个最终状态可能被重复算多次
- 每次 update 读的是最新整份状态，但带进去的 reason 却只是局部的

### 2.3 reason 模型天然太粗

现在 `EditorGraphInputReason[]` 只有：

- `document`
- `session`
- `measure`
- `interaction`
- `viewport`
- `clock`

这对长期最优完全不够。

因为它无法表达：

- 哪个 node draft 变了
- 哪个 edge label measure 变了
- 哪个 mindmap 正在跑动画 tick
- 这次只该 patch ui，还是该 patch graph

### 2.4 `lastWrite` 不是 projection 输入

`lastWrite` 带的是 write/history 语义：

- `origin`
- `forward`
- `inverse`
- `footprint`

这些对 projection 来说既过重，也不稳定。

projection 需要的是：

- 当前 published document snapshot
- 当前 published document change

而不是 write log。

### 2.5 当前链路没有事务边界

如果同一个 turn 内同时发生：

- `selection`
- `viewport`

当前通常会变成两次 `update()`，而不是一次合并事务。

这不是线程并发问题，而是：

- 没有统一 pending delta
- 没有统一 flush 边界
- 没有统一 coalescing

---

## 3. 长期最优原则

最终架构必须满足下面八条。

### 3.1 engine publish 结果必须是 projection 主输入

projection driver 不再从 engine 读取：

- “只有 snapshot”
- 或 “只有 lastWrite”

而是直接消费：

- published snapshot
- published change

### 3.2 driver 必须成为单事务输入聚合器

driver 不再是“多路订阅直接推 update”。

它必须变成：

- `mark`
- `merge`
- `flush`

三步式事务聚合器。

### 3.3 一轮 flush 只能调用一次 `runtime.update`

不允许同一轮输入变化里：

- selection 先跑一次
- viewport 再跑一次
- preview 又跑一次

长期最优里，一轮 flush 就是一份完整 `InputDelta`，一次 `runtime.update`。

### 3.4 engine `change` 必须足够精确，不能只给 touched-all

长期最优里，engine 的 published `change` 不能只保留：

- `Ids.all`

因为 projection patch 需要知道：

- add
- update
- remove

否则后面仍然会被迫 diff。

### 3.5 `lastWrite` 必须退出 projection 主链

`lastWrite` 或 `subscribeWrite` 可以保留，但只留给：

- history
- analytics
- editor events
- host callbacks

它不再参与 projection driver。

这里要进一步区分两件事：

1. `lastWrite()` 这个“缓存最近一次 write”的读取接口
2. `subscribeWrite()` 这个“订阅 write 事件”的接口

它们不应该被一起看待。

repo 内实际结论是：

- `lastWrite()` 没有稳定消费者，只是在 engine 内部多维护了一份最近 write 缓存
- `subscribeWrite()` 仍被 `whiteboard-history`、`whiteboard-collab`、`editor.events` 直接依赖

所以长期最优结论是：

- `lastWrite()` 可以直接删除，而且应立即删除
- `subscribeWrite()` 不应保留在最终 `Engine` document publish 接口里，但在建立独立 write feed 之前不能裸删

### 3.6 driver 只聚合 delta，不解释 whiteboard 语义

driver 的职责是：

- 汇总 engine change
- 汇总 session/layout/preview/viewport seed
- 合成一份 `InputDelta`
- 触发一次 runtime update

driver 不负责：

- graph fanout
- spatial fanout
- publish fanout

这些都属于 `editor-graph runtime`。

### 3.7 engine change 和 local input seed 必须在 driver 汇合

最终 `InputDelta` 的形成位置应该在 driver，而不是在：

- engine
- editor-graph runtime
- 任意 feature 内部

### 3.8 不保留 reasons 双轨

下面这些必须删除：

- `update(['document'])`
- `update(['session'])`
- `EditorGraphInputReason[]`
- planner 继续吃粗 flags

---

## 4. `whiteboard-engine` 的长期最优 publish contract

长期最优里，engine 不应只暴露：

- `snapshot()`
- `subscribe(listener: (snapshot) => void)`

而应收敛成正式的 publish result：

```ts
interface EnginePublish {
  rev: number
  snapshot: Snapshot
  change: EngineChange
}
```

对应 engine API：

```ts
interface Engine {
  current(): EnginePublish
  subscribe(listener: (publish: EnginePublish) => void): () => void
  execute(...)
  apply(...)
}

interface EngineWrites {
  subscribe(listener: (write: EngineWrite) => void): () => void
}
```

这里明确：

- `current()` / `subscribe()` 是 document publish 语义
- `EngineWrites.subscribe()` 是 write 语义

两者不能再混。

### 4.1 `EngineChange` 的最终形态

长期最优里，engine 的 published `change` 应直接保留增量语义，而不是压成 touched-all。

建议形态：

```ts
interface EngineChange {
  root: {
    doc: boolean
    background: boolean
    order: boolean
  }
  entities: {
    nodes: IdDelta<NodeId>
    edges: IdDelta<EdgeId>
    mindmaps: IdDelta<MindmapId>
    groups: IdDelta<GroupId>
  }
  relations: {
    graph: boolean
    ownership: boolean
    hierarchy: boolean
  }
}
```

这里故意不用：

- `owners.mindmaps`
- `owners.groups`

而直接用：

- `mindmaps`
- `groups`

因为 projection driver 和 editor-graph 更关心实体类型，而不是 contracts 内部旧命名层级。

### 4.2 为什么 `Ids.all` 不够

如果 engine publish 只保留：

```ts
nodes: { all: Set<NodeId> }
```

那 projection 后面仍然会不知道：

- 哪些 node 是 add
- 哪些 node 是 remove
- 哪些 node 是 update

这会直接逼出：

- graph patch 里的补充 diff
- publish 里的补充 compare

长期最优里不能接受这种退化。

### 4.3 engine publish 里不该混 `lastWrite`

`EnginePublish` 不包含：

- `origin`
- `forward`
- `inverse`
- `footprint`

因为这些都是 write/history 语义，不属于 publish truth。

### 4.4 关于 `lastWrite()` 与 `subscribeWrite()`

这两个接口需要分开处理。

#### `lastWrite()`

长期最优里应直接删除。

原因：

- 它不是 publish truth
- 它不是 write stream
- 它只是“最近一次 write”的缓存读取
- repo 内没有形成稳定消费面

也就是说，它既没有 document publish 价值，也没有独立事件流价值。

这类接口只会让 engine 多维护一份无意义缓存。

#### `subscribeWrite()`

长期最优里也不应继续挂在 `Engine` document 接口上。

但它不能像 `lastWrite()` 一样直接裸删，因为当前还有三类真实消费者：

- `whiteboard-history`
- `whiteboard-collab`
- `whiteboard-editor/events`

这些消费的是 write 语义：

- `origin`
- `forward`
- `inverse`
- `footprint`

不是 document publish 语义。

所以长期最优不是“继续把 `subscribeWrite()` 挂在 Engine 上”，而是：

- 把它迁到独立的 `EngineWrites` / `WriteFeed`
- 从 `Engine` 主接口中删除

结论非常明确：

- `lastWrite()`：可以立即删除
- `subscribeWrite()`：最终也应从 `Engine` 主接口删除，但必须先迁出为独立 write feed

---

## 5. `projection driver` 的长期最优职责

driver 最终只做四件事：

1. 持有最新 engine publish
2. 接收本地 source 的输入 seed
3. 合并成一份 pending `InputDelta`
4. 在 flush 边界调用一次 `runtime.update`

也就是说，driver 应收敛成：

```ts
engine publish
local session/layout seed
  -> driver pending input
  -> merge
  -> flush once
  -> editor-graph runtime.update(input)
```

### 5.1 driver 不再直接 `update(...)`

所有订阅回调都只做：

- `markDocument(...)`
- `markGraph(...)`
- `markUi(...)`
- `markScene(...)`

不再直接跑：

- `runtime.update(...)`

### 5.2 driver 必须维护 pending transaction

建议直接持有：

```ts
interface DriverState {
  engine: EnginePublish
  pending: PendingInputDelta
  flushing: boolean
  scheduled: boolean
}
```

其中：

- `engine`
  - 最新 engine publish
- `pending`
  - 尚未 flush 的合并输入
- `flushing`
  - 防止同步重入
- `scheduled`
  - 防止重复排队

---

## 6. driver 的 `mark / merge / flush` 机制

长期最优里，driver 的基本模型应是：

```txt
subscribe source
  -> mark pending delta
  -> schedule flush

flush
  -> consume pending delta
  -> read latest engine publish / session / layout
  -> build one Input
  -> runtime.update once
```

### 6.1 `mark`

每个 source 只负责向 pending delta 写 seed。

例如：

```ts
mark({
  ui: {
    selection: true
  }
})
```

```ts
mark({
  scene: {
    viewport: true
  }
})
```

```ts
markDocument(enginePublish.change)
```

### 6.2 `merge`

所有 mark 都必须合并进同一份 `PendingInputDelta`。

例如同一轮里同时发生：

- selection 变化
- viewport 变化

最终 pending 应变成：

```ts
{
  ui: { selection: true },
  scene: { viewport: true }
}
```

而不是两次独立 `update()`。

### 6.3 `flush`

`flush` 只做一次：

1. 取出当前 pending delta
2. 读取最新 engine publish
3. 读取 session/layout 当前值
4. 构造一份 runtime input
5. 调用一次 `runtime.update`

如果 flush 期间又有新的 `mark`，则在当前 flush 结束后再开下一轮。

### 6.4 推荐伪代码

```ts
const state = {
  engine: engine.current(),
  pending: createEmptyPendingInputDelta(),
  flushing: false,
  scheduled: false
}

const mark = (seed: PendingInputDelta) => {
  mergePending(state.pending, seed)
  scheduleFlush()
}

const flush = () => {
  if (state.flushing) {
    return
  }

  state.flushing = true
  try {
    while (!isPendingEmpty(state.pending)) {
      const delta = consumePending(state.pending)
      runtime.update(createEditorGraphInput({
        engine: state.engine,
        session,
        layout,
        delta
      }))
    }
  } finally {
    state.flushing = false
    state.scheduled = false
    if (!isPendingEmpty(state.pending)) {
      scheduleFlush()
    }
  }
}
```

---

## 7. 调度与 flush 的边界

这里必须严格区分两件事：

1. 谁决定什么时候产生一份输入
2. driver 什么时候把 pending input 提交为一次 `runtime.update`

长期最优里，driver 不需要“两种 flush 机制”。

driver 只需要一条 `flush` 管线：

- 收集 pending delta
- 合并最新 engine publish 与本地状态
- 调用一次 `runtime.update`

需要区分的不是 `flush`，而是上游 source 的调度节奏。

### 7.1 普通输入：事件后立即 `mark`

适用于：

- engine publish
- selection
- hover
- edit
- preview
- viewport
- measure

这些输入的长期最优做法是：

- source 变化时立刻 `mark(...)`
- driver 通过 microtask coalescing 安排同一轮 `flush`

目标是：

- 同一个事件 turn 内自动合并
- 在本帧渲染前完成一次 runtime update
- 不让普通编辑交互多一拍

### 7.2 动画输入：由 source 自己按帧 `mark`

适用于：

- mindmap enter preview
- 任何明确按帧推进的 graph animation

这些输入的长期最优做法不是“driver 提供 frame flush”，而是：

- editor 侧的 animation controller / preview source 自己持有 `raf`
- 每帧决定是否还需要推进动画
- 需要推进时 `mark(...)`
- driver 仍然走同一条 `flush` 管线

目标是：

- 一帧最多产生一次动画输入
- tick 只 mark 对应的 graph entity
- driver 不负责推断动画是否存活
- driver 不负责维护动画时钟

### 7.3 为什么不能把 frame tick 放进 flush

如果让 `flush` 自己决定是否继续 frame tick，会把两层职责混在一起：

- source 语义会泄漏进 driver
- 时间采样点会变得不稳定
- 动画生命周期会绑定到 projection infrastructure

这会直接导致：

- driver 需要认识 mindmap preview / enter animation 之类的上层语义
- 文档输入和动画输入难以用同一模型推理
- 测试时很难单独验证“产生输入”和“提交输入”

长期最优里，`tick` 是 source 产生的输入，不是 `flush` 的内部职责。

### 7.4 为什么不是全部都上 frame

如果所有输入都延后到 frame：

- 普通编辑交互会多一拍
- 语义操作响应会变钝

如果所有输入都直接同步 `update`：

- 同一轮 turn 会重复计算
- 无法稳定 coalescing

所以长期最优必须收敛成：

- 一条 `flush`
- 普通输入：事件后 `mark`，microtask 合并
- 动画输入：source 按帧 `mark`，仍走同一条 `flush`

---

## 8. engine change 和 local seed 如何汇合

这是 driver 最关键的职责。

长期最优里，driver 要把两类输入合成同一份 `InputDelta`：

1. engine publish change
2. local non-document seed

例如：

- engine commit 让一个 node document update
- 同一个 turn 内 selection 也变化了

driver 最终应产出一份：

```ts
{
  input: {
    document: {
      nodes: { updated: [nodeId] }
    },
    ui: {
      selection: true
    }
  }
}
```

而不是：

1. 先 `update(['document'])`
2. 再 `update(['interaction'])`

### 8.1 为什么这件事不能留给 editor-graph

因为 `editor-graph` 不应该自己认识：

- engine subscribe 语义
- session store subscribe 语义
- viewport store subscribe 语义

这些都是 driver 的宿主责任。

`editor-graph` 只应该吃一份已经聚合好的 runtime input。

---

## 9. `lastWrite` 放在哪里

长期最优里，`lastWrite()` 直接删除；`subscribeWrite()` 迁出 `Engine` 主接口。

保留位置：

- `EngineWrites.subscribe()`
- history
- collab
- editor events
- analytics
- host integration

不再使用位置：

- projection driver
- editor-graph input
- planner
- `Engine.current()` / `Engine.subscribe()` document publish 接口

### 9.1 为什么 `lastWrite` 不够

因为 `lastWrite()` 回答的是：

- 这次写入怎么发生的

而 projection 需要回答的是：

- 当前 published document 哪些部分变了

这不是一个层级。

### 9.2 为什么 `subscribeWrite()` 不能继续留在 `Engine`

因为 `Engine` 的 document publish 主接口应该只负责：

- 当前 document snapshot
- 当前 document change

而 `subscribeWrite()` 暴露的是另一套语义：

- write origin
- write ops
- inverse ops
- history footprint

这会把 document publish 和 write bus 混在同一个 contract 上。

长期最优里二者必须拆开：

- `Engine`
  - document publish
- `EngineWrites`
  - write stream

---

## 10. 为什么这一步优先于 `editor-graph delta`

如果不先做 engine change 和 driver，直接做 `editor-graph delta`，会立刻出现三类问题。

### 10.1 document delta 不稳定

因为 driver 只给 `'document'`，不给精确 document change。

### 10.2 一轮输入被拆成多次 update

同一个最终状态被拆成：

- document update
- interaction update
- viewport update

增量 patch 很快就会因为事务边界不稳定而变脆。

### 10.3 editor-graph 会被迫承担宿主聚合职责

如果 driver 不做合并，最后就只能让 `editor-graph`：

- 自己猜 source
- 自己猜事务边界
- 自己补 delta

这会直接污染 runtime 边界。

所以必须明确：

> `WHITEBOARD_EDITOR_GRAPH_DELTA_REWRITE.zh-CN.md` 依赖这份文档先落地。  
> 不先做这一步，后面的 delta 设计没有稳定基础。

---

## 11. 必须删除的旧机制

为了不留双轨，下面这些必须一起删掉：

- `engine.subscribe(() => update(['document']))`
- 所有 subscribe 回调里直接 `update(...)`
- `EditorGraphInputReason[]`
- `FULL_REASONS`
- projection driver 内自带 `frameTask`
- projection driver 内自带 `hasActiveMindmapEnterPreview()`
- projection driver 内自带 `syncClock()`
- 把动画 tick 作为 driver 内部时钟维护的旧模型
- projection driver 内按 source 直接推进 runtime 的旧模型
- projection 主链对 `lastWrite()` / `subscribeWrite()` 的任何依赖

如果这些旧机制还留着，最终一定会出现：

- 一边 driver 聚合
- 一边直接 update

然后把事务边界重新搞乱。

---

## 12. 最终实施顺序

### 第一步

重写 `whiteboard-engine` publish contract：

- 引入正式 `EnginePublish`
- `subscribe` 改为发布 `EnginePublish`
- `change` 改成真正的 `IdDelta` 形态
- 删除 `lastWrite()`
- 把 `subscribeWrite()` 从 `Engine` 主接口迁出到独立 `EngineWrites`

### 第二步

重写 `projection driver`：

- 删除直接 `update(reasons)`
- 引入 `pending input delta`
- 引入 `mark / merge / flush`
- driver 只保留一条 `flush` 管线
- driver 不再持有 animation/frame 时钟

### 第三步

把动画 source 从 driver 拆出去：

- editor / preview / animation controller 自己持有 `raf`
- 每帧只负责按需 `mark(...)`
- 删除 driver 对 preview animation 生命周期的推断

### 第四步

把 engine publish change 映射成 `InputDelta.document`。

### 第五步

把 session / preview / layout / viewport 输入映射成：

- `InputDelta.graph`
- `InputDelta.ui`
- `InputDelta.scene`

这里要明确区分两类 source：

- 普通 source：事件后立即 `mark`
- 动画 source：按帧 `mark`

### 第六步

让 driver 一轮 flush 只调用一次 `runtime.update`。

这里要验证的是：

- 同一 turn 内 `selection + viewport + engine publish` 只合并成一次 flush
- 动画帧输入与普通输入仍然走同一条 flush 管线
- driver 不再因为 animation source 存在而自带 clock 逻辑

### 第七步

在此基础上，再开始落实：

- [WHITEBOARD_EDITOR_GRAPH_DELTA_REWRITE.zh-CN.md](/Users/realrong/Rostack/WHITEBOARD_EDITOR_GRAPH_DELTA_REWRITE.zh-CN.md)

---

## 13. 最终结论

长期最优里，白板不能继续让：

- engine 只发 snapshot
- driver 把 document delta 压平成 reason
- 多个 source 各自直接 `update()`

最终必须统一成：

1. engine 以 publish result 形式同时发布 `snapshot + change`
2. driver 成为唯一输入事务聚合器
3. 所有 source 只 `mark`，不直接 `update`
4. 同一轮输入只 `flush` 一次，只跑一次 `runtime.update`
5. `lastWrite()` 直接删除，`subscribeWrite()` 迁出 `Engine` 主接口
6. 这一步必须先于 `editor-graph delta` 落地

只有先把这条基础链路重写干净，后面的 `graph delta / spatial delta / publish delta` 才有稳定、清晰、低成本的前提。 
