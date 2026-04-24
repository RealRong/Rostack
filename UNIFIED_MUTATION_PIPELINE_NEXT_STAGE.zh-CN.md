# Unified Mutation Pipeline 下一阶段收尾方案

## 1. 文档目标

这份文档不再只是列“下一阶段还有哪些事要做”，而是直接把下一阶段的收尾目标收口为一个明确方案：

- 在 `shared/mutation` 中新增 `MutationEngineSpec`
- 在 `shared/mutation` 中新增 `MutationEngine`
- Whiteboard 与 Dataview 的写入内核都迁移到 `new MutationEngine(...)`

目标不是继续补零散 shared 工具，而是把两边真正统一到同一个 mutation engine 内核上。

本文档继续遵守既有前提：

- 不做兼容
- 不保留旧术语双轨
- 不在乎重构成本
- 以长期最优和代码简单为第一目标

---

## 2. 核心判断

下一阶段最合适的收尾方式，不是继续分别整理 Whiteboard engine 和 Dataview engine，而是把两边共同的写入主轴抽成一个共享内核：

`Intent -> Compile -> Operation[] -> Apply -> Write -> Publish -> History/Collab`

这里真正应该被 spec 化的，不是“整个 engine”，而是 **mutation engine**。

原因很简单：

- Whiteboard 的读链已经基本独立，写链本身已经很接近一个通用 mutation engine
- Dataview 的写入侧也已经具备 `execute / apply / writes / history` 外观，只是当前 commit、active、delta 还耦合得偏重
- 两边真正重复的是“写入内核”，不是 query API，也不是领域 read model

所以正确收尾方式是：

- 不做 `EngineSpec`
- 做 `MutationEngineSpec`
- 不做 shared query/read framework
- 做 `new MutationEngine(spec)` 作为统一写入运行时

---

## 3. 边界定义

## 3.1 `MutationEngine` 管什么

`MutationEngine` 只负责下面这些事情：

- 接收 `intent`
- 调用 compiler 产出 `operation[]`
- 调用 apply 执行文档变异
- 产出标准 `write`
- 推进 `publish`
- 驱动 shared history
- 为 collab 提供稳定写入口：`apply(remoteOps, { origin: 'remote' })`

## 3.2 `MutationEngine` 不管什么

`MutationEngine` 不负责下面这些事情：

- Whiteboard 的 `query`
- Dataview 的 `active view`
- Dataview 的 fields / records / views 外层业务 API
- 领域 read index / facts / query cache 的完整定义
- performance / trace 的完整产品化外壳

这些仍然保留在领域侧，只是改为消费 `MutationEngine` 的 `current()` / `writes` / `subscribe(...)`。

## 3.3 为什么这个边界是对的

如果把 query/read 也一起 spec 化，shared 层会立刻被两边不同的读模型拖复杂。

如果只 spec 写入内核：

- Whiteboard 可以直接复用
- Dataview 可以先迁写入侧，再把 active/projector 变成下游
- history / collab / projector 都能围绕统一 `write` 主轴收口

---

## 4. 最终 API 设计

## 4.1 `MutationEngineSpec`

下一阶段建议在 `shared/mutation/src/engine.ts` 中只增加一个非常薄的 spec。

```ts
export interface MutationPlan<Op, Value = void> {
  ops: readonly Op[]
  issues?: readonly Issue[]
  canApply?: boolean
  value?: Value
}

export interface MutationPublishSpec<Doc, Op, Key, Extra, Publish> {
  init(doc: Doc): Publish
  reduce(input: {
    prev: Publish
    doc: Doc
    write: Write<Doc, Op, Key, Extra>
  }): Publish
}

export interface MutationHistorySpec<Doc, Op, Key, Extra> {
  capacity?: number
  track(write: Write<Doc, Op, Key, Extra>): boolean
  conflicts(left: Key, right: Key): boolean
}

export interface MutationEngineSpec<
  Doc extends object,
  Intent,
  Op,
  Key,
  Publish,
  Value = void,
  Extra = void
> {
  clone(doc: Doc): Doc
  normalize?(doc: Doc): Doc
  serializeKey(key: Key): string

  compile?(input: {
    doc: Doc
    intents: readonly Intent[]
  }): MutationPlan<Op, Value>

  apply(input: {
    doc: Doc
    ops: readonly Op[]
  }): ApplyResult<Doc, Op, Key, Extra>

  publish?: MutationPublishSpec<Doc, Op, Key, Extra, Publish>
  history?: MutationHistorySpec<Doc, Op, Key, Extra>
}
```

设计原则：

- 字段尽量少
- 不塞一堆 runtime policy
- `compile` 可选，允许纯 `apply(operation[])`
- `apply` 只做文档变异与 write 相关产物
- `publish` 可选，允许某些场景只关心文档与 writes
- `history` 只关心 track / conflicts，不再承载额外职责

## 4.2 `MutationEngine`

下一阶段推荐直接落成一个稳定运行时对象：

```ts
export class MutationEngine<
  Doc extends object,
  Intent,
  Op,
  Key,
  Publish,
  Value = void,
  Extra = void
> {
  constructor(input: {
    doc: Doc
    spec: MutationEngineSpec<Doc, Intent, Op, Key, Publish, Value, Extra>
  })

  doc(): Doc
  current(): {
    rev: number
    doc: Doc
    publish?: Publish
  }

  subscribe(listener: (current: {
    rev: number
    doc: Doc
    publish?: Publish
  }) => void): () => void

  readonly writes: WriteStream<Write<Doc, Op, Key, Extra>>

  execute(
    intent: Intent | readonly Intent[],
    options?: { origin?: Origin }
  ): {
    applied: boolean
    issues: readonly Issue[]
    value?: Value
    write?: Write<Doc, Op, Key, Extra>
  }

  apply(
    ops: readonly Op[],
    options?: { origin?: Origin }
  ): {
    applied: boolean
    issues: readonly Issue[]
    write?: Write<Doc, Op, Key, Extra>
  }

  load(doc: Doc): void

  history?: HistoryController<Op>
}
```

设计原则：

- `new MutationEngine(...)` 直接表达“这是共享的写入运行时”
- 对外只暴露 `execute / apply / writes / current / subscribe / load / history`
- `load(doc)` 用于统一 Dataview 的 `document.replace`
- query/read/projector 不进入这个类

---

## 5. `MutationEngine` 与现有 shared 模块的关系

`MutationEngine` 不是另起炉灶，而是把现有 `shared/mutation` 串起来。

实际关系应该是：

- `compile.ts` 负责 intent -> operation
- `apply.ts` 负责 operation -> next doc / inverse / footprint / extra
- `write.ts` 定义 write record
- `history.ts` 负责 undo/redo runtime
- `collab.ts` 消费 `engine.apply(remoteOps, { origin: 'remote' })`
- `engine.ts` 只是把这些拼成一个稳定运行时

也就是说，下一阶段新增的不是一套新模型，而是现有 shared 模块的统一宿主。

---

## 6. Whiteboard 如何收尾到 `new MutationEngine`

## 6.1 Whiteboard 当前适配度

Whiteboard 已经最接近最终形态：

- 有独立 compile
- 有独立 apply
- 有标准 `EngineWrite`
- `query` 已经和写链分离

所以 Whiteboard 不需要先大改结构，只需要把现有写侧塞进 `MutationEngineSpec`。

## 6.2 Whiteboard 最终形态

Whiteboard 应该收敛成：

- `whiteboardMutationSpec`
- `new MutationEngine({ doc, spec: whiteboardMutationSpec })`
- 外层 whiteboard engine 只负责：
  - 挂 `query`
  - 把 `publish` 映射成现有 `current()`
  - 暴露领域 API

## 6.3 Whiteboard 具体要做的事

### A. 先清掉术语

- `Command` 全量改成 `Intent`
- `compileCommand` 改成 `compileIntent`
- `contracts/command.ts`、`types/command.ts` 改名

### B. 把 compile / apply / publish 组装为 spec

- `compile` 直接复用现有写入 compile 主轴
- `apply` 直接复用现有 apply 主轴
- `publish` 负责从 write 递推出：
  - `snapshot`
  - `change`

### C. 把 engine runtime 变成薄壳

删除当前 runtime 里手写的 commit 主流程，改成：

- 先创建 `MutationEngine`
- 外层只保留 `query`
- `query` 继续读 `current().publish`

## 6.4 Whiteboard 剩余必须同步完成的清理

- record operation 的 `path: string` 全量改成 `Path`
- record path helper 改为直接消费 `Path`
- history key 的 record path 跟随升级
- 把 string path 兼容逻辑彻底删掉

## 6.5 Whiteboard 验收标准

- whiteboard engine 的写入内核不再手写 commit orchestration
- `execute / apply / writes / history` 均由 `MutationEngine` 驱动
- `query` 是外层读壳，不再混在 mutation runtime 内
- Whiteboard 内部不再暴露 `Command`

---

## 7. Dataview 如何收尾到 `new MutationEngine`

## 7.1 Dataview 当前问题

Dataview 当前不是不能 spec 化，而是写侧和 active/projector 还没有完全剥开。

当前最大问题有三个：

- 上层术语仍然是 `Action`
- `createWriteControl` 既在做 commit，又在做 active/index/delta 推进
- `EngineWrite` 还没有 footprint key，history 语义不完整

所以 Dataview 的正确收尾不是直接“把 createEngine 套进去”，而是先把写入内核切出来，再挂到 `MutationEngineSpec`。

## 7.2 Dataview 最终形态

Dataview 应该收敛成三层：

### 第一层：`dataviewMutationSpec`

只负责：

- `Intent -> Operation[]`
- `Operation[] -> ApplyResult`
- `Write -> doc-level publish`
- history footprint 规则

### 第二层：`new MutationEngine(...)`

只负责：

- 提交写入
- 产出 write
- 维护 rev / doc / publish
- 驱动 history

### 第三层：Dataview 外层 engine

只负责：

- active runtime / query index / publish delta
- fields / records / views / active 等业务 API
- performance 包装

也就是说，Dataview 的 `createEngine()` 以后不再自己掌握 mutation 内核，只是组装：

- `MutationEngine`
- `DataviewProjector`
- 外层 API

## 7.3 Dataview 具体要做的事

### A. 统一术语

- `Action` 全量改成 `Intent`
- `dispatch(...)` 改成 `execute(...)`
- `planActions(...)` 改成 intent compiler 命名

### B. 把 operation 收敛到最终 primitive

- 拆掉粗粒度 `patch / put / writeMany` operation
- record path 统一为 `Path`
- `writeMany` 退回 compiler convenience，不再长期作为基础 operation

### C. 把 apply 变成纯 mutation apply

- `operation.apply` 只负责文档变异、inverse、footprint、extra
- 删除 `documentApi.* -> nextDocument -> replace` 这种 apply 风格
- 直接切到 draft mutation + lazy COW

### D. 补齐 footprint

- 建 `HistoryKey`
- 建 `serializeHistoryKey`
- 建 `historyKeyConflicts`
- 建 `collectHistoryForOperation`

只有做到这里，Dataview 的 `MutationEngineSpec.history` 才是完整的。

### E. 把 active / delta 从 commit 主链里剥出去

Dataview 现在的 active/index/delta 逻辑，不应该继续塞在 mutation commit runtime 里。

正确做法是：

- `MutationEngine` 先提交 write
- `DataviewProjector` 订阅 writes
- projector 再产出：
  - active snapshot
  - active delta
  - doc delta

这样 Dataview 的写入内核才会变薄，和 Whiteboard 真正对齐。

## 7.4 Dataview 验收标准

- Dataview 的写入核心由 `MutationEngine` 驱动
- `createWriteControl` 这类私有 commit 内核被删除
- `active` / `delta` 变成 write 下游 projector
- `EngineWrite` 不再使用 `never` 作为 footprint key
- Dataview 内部不再暴露 `Action` / `dispatch`

---

## 8. 建议实施顺序

下一阶段建议按下面顺序收尾。

## Phase 1：先新增 shared `engine.ts`

只做两件事：

- 落 `MutationEngineSpec`
- 落 `MutationEngine`

这一阶段不碰 query，不碰 projector，不碰业务 API。

## Phase 2：先迁 Whiteboard

原因：

- Whiteboard 已经更接近最终形态
- 迁完后可以验证 `MutationEngine` API 是否够简单
- 可以反过来压 Dataview，不让 Dataview 把 shared engine 拖复杂

## Phase 3：再迁 Dataview 写入侧

Dataview 这一阶段只做：

- 术语统一
- operation primitive 收敛
- apply 纯化
- footprint 补齐
- 接入 `MutationEngine`

先不要在这一阶段追求 projector shared 化。

## Phase 4：Dataview active/projector 下游化

只有在 Dataview 写侧已经跑在 `MutationEngine` 上之后，才开始：

- 拆 `active`
- 拆 `delta`
- 拆 publish projector

## Phase 5：统一 history / collab 外观

当 Whiteboard 与 Dataview 都跑在 `MutationEngine` 上之后：

- local history 完全围绕 shared history runtime
- collab 完全围绕 `writes` 和 `apply(remoteOps)`
- 不再需要各自私有的写入编排层

---

## 9. 实现时的强约束

为了避免把 shared engine 做歪，下一阶段必须遵守这些约束：

- 不把 query/read API 放进 `MutationEngineSpec`
- 不把领域 projector 细节塞进 `MutationEngine`
- 不把 performance/tracing 设计成 shared 主接口的一部分
- 不为了 Dataview 当前现状，把 `MutationEngineSpec` 增加很多过渡字段
- 不保留 `Action` / `Command` / `dispatch` 双轨
- 不兼容 string path 与 `Path` 并存

如果某个需求只能靠增加很多 spec 字段才能满足，优先判断该需求是不是根本不该属于 shared mutation engine。

---

## 10. 最终完成标准

当下面这些条件同时满足时，下一阶段才算真正收尾：

- `shared/mutation` 中存在稳定的 `MutationEngineSpec`
- `shared/mutation` 中存在稳定的 `MutationEngine`
- Whiteboard 写入内核迁移到 `new MutationEngine(...)`
- Dataview 写入内核迁移到 `new MutationEngine(...)`
- 两边统一使用 `Intent / Operation / Write`
- 两边 operation 都落到结构 / field / record 三层 primitive
- 两边 record path 都统一为 `Path`
- 两边 apply 都是 direct draft mutation + lazy COW
- 两边 history 都建立在 footprint 语义上
- Dataview 的 active/delta 成为 write 下游 projector

---

## 11. 一句话结论

下一阶段不应该继续写“分散的迁移清单”，而应该直接落一条明确主线：

**在 `shared/mutation` 中新增 `MutationEngineSpec` 与 `MutationEngine`，然后让 Whiteboard 与 Dataview 的写入内核都迁移到 `new MutationEngine(...)`。**

只有这样，compile、apply、write、history、collab、projector 这整条链才会真正开始围绕同一个共享基础设施收口。
