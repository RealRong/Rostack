# Dataview Commit 单条流水线重构方案

## 1. 目标

这份文档只回答一个问题：

如果完全不考虑迁移成本，也不保留兼容层，怎样把当前 `dataview/src/engine/runtime/commit/runtime.ts` 这一整条链路改成一条足够简单、可证明正确、不会暴露半状态的提交流水线。

本文的设计目标非常明确：

- 不再到处 `peekDocument`
- 不再到处 `installDocument`
- 不再存在显式的 `syncDocument` 阶段 API
- 不再把 document、read、project 拆成多套可写状态源
- 不再允许 commit 过程中向外暴露中间态
- 不再允许“先写 document，再补 sync read/project”的两阶段提交

这里优先级最高的是结构简单和状态正确性，不是兼容旧实现，也不是最小改动。


## 2. 先说结论

我认为最合理、也最简单的长期架构是：

- engine 内部只保留一个权威状态对象，叫 `EngineSnapshot`
- 所有写入都只能通过一个统一入口 `transact(...)`
- `dispatch / undo / redo / replace` 都只是不同的 transaction plan
- transaction 在内存里完整算出 `nextSnapshot` 以后，只做一次原子发布
- `read` 和 `project` 不再自己维护独立可写 runtime，也不再接受 `syncDocument`
- `read` 直接从 `snapshot.document` 派生
- `project` 直接从 `snapshot.derived.project` 读取
- index/project 的增量更新逻辑属于 transaction 内部实现细节，而不是 runtime 间的同步协议

一句话概括：

把今天的

- `document store`
- `read runtime`
- `project runtime`
- `commit runtime`

这几段松散拼接的状态协议，收敛成一个单状态机。


## 3. 当前结构真正的问题

## 3.1 现在不是“一次提交”，而是“先写文档，再补同步”

当前 `dispatch` / `undo` / `redo` 的路径是：

1. `peekDocument()`
2. `applyWriteBatch()` 或 `applyHistoryReplay()`
3. `installDocument(afterDocument)`
4. 更新 history
5. `read.syncDocument(...)`
6. `project.syncDocument(...)`

也就是说，当前 commit 不是一个原子动作，而是：

- 先把新 document 写进去了
- 再希望别的 runtime 跟上

这个结构天然会产生三个问题：

- 中间态会泄漏
- 失败时无法保证一致性
- 同步阶段可以被重入


## 3.2 当前有多个“看似只读，实际上要被同步”的状态容器

今天的 engine 里至少有这些状态点：

- instance document
- read source 的 document store
- project runtime 的 published stores
- history stacks

这些状态不是一个 snapshot，而是一组彼此约定“你变了以后我也要跟着 sync”的容器。

这会导致一个长期问题：

- 复杂度不在单个函数，而在跨模块时序

也就是说，代码看起来都不长，但要理解正确性，必须同时理解：

- 先更新谁
- 后更新谁
- 谁能先对外发通知
- 谁能在通知期间再次触发 engine 写入

这是一种协议复杂度，不是实现复杂度。


## 3.3 `replace()` 明确会制造错误的过渡态

`replace()` 当前会先：

- `history.clear()`
- `read.clear()`
- `project.clear()`

然后才安装新文档并重建投影。

这意味着外部订阅者会看到：

- 旧 document
- 空 project

这种状态在语义上就是错误的，因为它不是任何一次真实提交后的稳定快照。


## 3.4 `read` 和 `project` 本质上不该是“被同步”的 runtime

`read` 的本质只是 document selector。

`project` 的本质是：

- 基于 document
- 基于 index
- 基于上一次派生状态

算出一份 projection。

它们不应该在架构上表现为：

- “外部有个 document store”
- “请你们俩收到通知后各自同步一下”

这会把“状态派生”错误地设计成“runtime 间通信协议”。


## 3.5 当前公开 API 暗示了错误的分层

今天 runtime 间存在以下接口：

- `peekDocument`
- `installDocument`
- `syncDocument`
- `clear`

这些接口说明系统默认认为：

- document 是一份独立状态
- read/project 是另外两份需要被驱动的状态

但长期最简单的设计应该是：

- 只有一份状态
- 其余都是这份状态的一部分，或者这份状态的只读投影


## 4. 重构原则

## 4.1 一个概念只保留一个可写源

在 engine 内部：

- `document` 只有一个可写源
- `history` 只有一个可写源
- `index/project` 只有一个提交入口

任何“写完 A 再去同步 B”的设计都要删除。


## 4.2 外部只能看到稳定快照，不能看到半提交过程

提交过程中允许存在中间变量，但它们必须只存在于 transaction 局部变量里。

外界只能看到：

- `previousSnapshot`
- `nextSnapshot`

不能看到：

- document 已变但 projection 未变
- projection 已清空但 document 还没换
- history 已前进但 read/project 尚未跟上


## 4.3 事务内部可以复杂，事务边界必须极简单

引擎内部允许保留：

- 增量 delta
- index 复用
- project 复用
- perf trace

但这些都必须隐藏在一个 transaction pipeline 内。

对外只有一个事实：

- 本次事务从 `prev` 生成了 `next`


## 4.4 不把“派生计算”设计成“跨 runtime 同步”

正确的问题表达应该是：

- 给定上一个 snapshot
- 给定一次 mutation
- 如何得到下一个 snapshot

而不是：

- 我已经装了 document
- 现在谁来把 read/project 跟上


## 5. 目标架构

## 5.1 唯一权威状态：`EngineSnapshot`

建议把 engine 内部状态收敛成一个 snapshot：

```ts
type EngineSnapshot = {
  revision: number
  document: DataDoc
  history: {
    undoStack: HistoryEntry[]
    redoStack: HistoryEntry[]
    capacity: number
  }
  derived: {
    index: IndexState
    project: ProjectState
  }
  perf?: {
    lastTrace?: CommitTrace
    traceBuffer?: readonly CommitTrace[]
    stats?: PerfStats
  }
}
```

这里最重要的不是字段名，而是边界：

- engine 任意时刻只有一个 current snapshot
- snapshot 是完整状态，而不是 document + 若干待同步 runtime


## 5.2 单一 store：`snapshotStore`

engine 运行时只保留一个 store：

```ts
interface EngineStore {
  get(): EngineSnapshot
  set(next: EngineSnapshot): void
  subscribe(listener: () => void): () => void
}
```

这里不再需要：

- `instanceDocument`
- `read.syncDocument`
- `project.syncDocument`

因为：

- `read` 直接读 `snapshot.document`
- `project` 直接读 `snapshot.derived.project`


## 5.3 单一写入口：`transact`

所有写入动作统一走：

```ts
type TransactionKind =
  | 'dispatch'
  | 'undo'
  | 'redo'
  | 'replace'

type TransactionPlan = {
  kind: TransactionKind
  apply(base: EngineSnapshot): TransactionDraft
}

type TransactionDraft = {
  document: DataDoc
  history: EngineSnapshot['history']
  delta: CommitDelta
  issues: ValidationIssue[]
  applied: boolean
  created?: CreatedEntities
  traceMeta?: {
    commitMs?: number
  }
}

function transact(plan: TransactionPlan): CommitResult
```

`transact` 做的事情固定且唯一：

1. 读取 `baseSnapshot`
2. 执行 plan，得到 `draft`
3. 基于 `baseSnapshot + draft` 派生 `nextIndex`
4. 基于 `baseSnapshot + draft + nextIndex` 派生 `nextProject`
5. 组装 `nextSnapshot`
6. 记录 trace/perf
7. `snapshotStore.set(nextSnapshot)`
8. 返回 result

整个过程没有第二套同步协议。


## 6. 新提交流水线

## 6.1 标准流水线

目标流水线如下：

```ts
function transact(plan: TransactionPlan): CommitResult {
  const base = snapshotStore.get()
  const startedAt = now()

  const draft = plan.apply(base)
  if (!draft.applied) {
    return toRejectedResult(draft)
  }

  const indexResult = deriveIndex({
    before: base.derived.index,
    beforeDocument: base.document,
    afterDocument: draft.document,
    delta: draft.delta
  })

  const projectResult = deriveProject({
    before: base.derived.project,
    beforeIndex: base.derived.index,
    afterIndex: indexResult.state,
    beforeDocument: base.document,
    afterDocument: draft.document,
    delta: draft.delta
  })

  const next = {
    ...base,
    revision: base.revision + 1,
    document: draft.document,
    history: draft.history,
    derived: {
      index: indexResult.state,
      project: projectResult.state
    },
    perf: commitPerf(...)
  }

  snapshotStore.set(next)
  return buildCommitResult(...)
}
```

关键点：

- `afterDocument` 只存在于 transaction 局部变量
- 在 `snapshotStore.set(next)` 之前，外界看不到任何中间态
- 发布只发生一次


## 6.2 `dispatch`

`dispatch` 只是构造一个 mutation plan：

1. 从 `base.document` resolve write batch
2. 如果不能应用，返回 rejected draft
3. 如果没有 operation，返回 empty draft
4. `applyOperations(base.document, operations)`
5. 生成新的 history
6. 返回 draft

也就是说：

- `dispatch` 不再负责安装 document
- 不再负责调用 read/project sync
- 它只负责生成一次合法 mutation


## 6.3 `undo` / `redo`

`undo` / `redo` 也只是 plan：

- 从 `base.history` 取 replay entry
- 如果没有 entry，返回 empty draft
- 用 replay operations 得到新 document
- 推进 history stack
- 返回 draft

这样 `undo/redo` 就和 `dispatch` 完全同构：

- 都是输入一个 plan
- 输出一个 draft
- 后面共享同一条派生和发布流水线


## 6.4 `replace`

`replace` 不能再做 “clear 然后 sync”。

正确做法是：

- 构造一份 `nextDocument`
- 生成 reset delta
- 直接派生 `nextIndex`
- 直接派生 `nextProject`
- 清空 history
- 发布完整 `nextSnapshot`

也就是说，`replace` 不是特殊同步协议，而只是另一种 transaction plan。


## 7. `read` 和 `project` 应该如何收口

## 7.1 `read` 不再是 runtime，只是 selectors

当前 `read` 本质只是 document 的读取投影，因此长期应该简化成：

```ts
const read = {
  document: select(store, snapshot => snapshot.document),
  activeViewId: select(store, snapshot => getDocumentActiveViewId(snapshot.document)),
  activeView: select(store, snapshot => getDocumentActiveView(snapshot.document)),
  recordIds: select(store, snapshot => snapshot.document.records.order),
  ...
}
```

这里不再存在：

- `createReadSource`
- `setDocument`
- `syncDocument`
- `clear`

因为 `read` 根本不应该被同步。


## 7.2 `project` 不再暴露“同步接口”

`project` 应该分成两层：

1. transaction 内部的 `deriveProject(...)`
2. 外部只读的 `project selectors`

对外暴露：

```ts
const project = {
  state: select(store, snapshot => snapshot.derived.project),
  view: select(store, snapshot => snapshot.derived.project.view),
  records: select(store, snapshot => snapshot.derived.project.records),
  sections: select(store, snapshot => snapshot.derived.project.sections),
  appearances: select(store, snapshot => snapshot.derived.project.appearances),
  ...
}
```

不再暴露：

- `project.clear()`
- `project.syncDocument()`

这两个接口一旦存在，就说明 project 仍被当成独立可写 runtime。


## 7.3 增量能力仍然保留，但藏进纯派生函数

如果希望保留增量优化，建议写成：

```ts
type DeriveProjectInput = {
  before: ProjectState
  beforeIndex: IndexState
  afterIndex: IndexState
  beforeDocument: DataDoc
  afterDocument: DataDoc
  delta: CommitDelta
}

function deriveProject(input: DeriveProjectInput): {
  state: ProjectState
  trace?: ProjectTrace
}
```

这样即使内部继续做：

- reuse
- sync
- rebuild

外部也只看到一个纯函数边界，而不是 `syncDocument()` 这种协议式接口。


## 8. 事件发布和订阅模型

## 8.1 只发布一次 snapshot 更新

当前系统最大的问题之一是：

- document 先通知一轮
- project 再通知一轮

未来应该改成：

- engine 只发布一次 snapshot 更新

订阅者如果只关心某个 slice，就通过 selector store 派生。


## 8.2 selector 层自己做相等性过滤

例如：

- `document` selector
- `activeView` selector
- `appearances` selector
- `sections` selector

都从 `snapshotStore` 订阅，但各自使用 `isEqual` 判定是否通知。

这样既不会暴露半状态，也不会把所有 UI 都迫使成“每次全量刷新”。


## 8.3 UI 订阅的输入必须来自同一个 snapshot

比如 page state、selection binding、inline session binding 这些逻辑，未来都必须基于同一个 committed snapshot 工作。

这意味着：

- 不允许 `read.document` 来自 revision N
- 而 `project.appearances` 还来自 revision N-1

这是这次重构最重要的收益之一。


## 9. 公开 API 调整建议

## 9.1 保留的 API

可以保留这些对外语义：

- `engine.command(...)`
- `engine.history.undo()`
- `engine.history.redo()`
- `engine.document.replace(...)`
- `engine.document.export()`

但它们内部都统一转成 `transact(plan)`。


## 9.2 删除的内部 API

建议直接删除以下内部协议：

- `peekDocument`
- `installDocument`
- `read.clear`
- `read.syncDocument`
- `project.clear`
- `project.syncDocument`
- `finalizeCommitResult`

这些接口的存在本身就是旧架构残留。


## 9.3 新内部 API

建议只保留这些内部能力：

- `snapshotStore.get()`
- `snapshotStore.set()`
- `createDispatchPlan(...)`
- `createUndoPlan(...)`
- `createRedoPlan(...)`
- `createReplacePlan(...)`
- `deriveIndex(...)`
- `deriveProject(...)`
- `recordCommitTrace(...)`

从概念上看会清楚很多：

- plan 负责生成 mutation
- derive 负责计算派生状态
- store 负责一次性提交 snapshot


## 10. 建议的目录收口

如果不考虑迁移成本，我建议做一次目录级重组。

## 10.1 删除/并入

建议删除或并入以下模块：

- `runtime/read/read.ts`
- `runtime/read/source.ts`
- `runtime/commit/sync.ts`
- `instance/document.ts`

这些文件都服务于“多 runtime 同步协议”，而不是“单 snapshot 事务”。


## 10.2 新结构建议

建议把 engine 运行时核心收敛到类似下面的结构：

```txt
dataview/src/engine/
  instance/
    create.ts
  state/
    snapshot.ts
    store.ts
    selectors.ts
  transaction/
    transact.ts
    plans.ts
    apply.ts
    history.ts
    trace.ts
  derive/
    index.ts
    project.ts
```

说明：

- `state/` 只负责 snapshot 和 selector
- `transaction/` 只负责写入
- `derive/` 只负责从旧状态算新状态

这样“读、写、派生”三件事会非常清楚。


## 11. 模块职责重新定义

## 11.1 `instance/create.ts`

只负责：

- 创建 `snapshotStore`
- 创建 selectors
- 创建 public engine api
- 把 public api 方法映射到 `transact`

不再负责：

- 维护 document store
- 组装 read runtime / commit runtime / project runtime 三段式协议


## 11.2 `transaction/plans.ts`

负责把外部动作转换为 transaction draft：

- command plan
- undo plan
- redo plan
- replace plan

它只改：

- document
- history
- delta
- result metadata

不做：

- project 同步
- read 同步
- store 发布


## 11.3 `derive/index.ts`

负责：

- 从 `base.derived.index + afterDocument + delta` 生成 `nextIndex`

这里可以保留增量算法，也可以先写成更纯、更粗暴的重建算法。


## 11.4 `derive/project.ts`

负责：

- 从 `base.derived.project + nextIndex + afterDocument + delta` 生成 `nextProject`

它是纯派生模块，不再是一个会被外部驱动同步的 runtime。


## 11.5 `state/selectors.ts`

负责：

- 从 `snapshotStore` 暴露只读 selector stores

例如：

- `selectDocument`
- `selectActiveView`
- `selectRecordIds`
- `selectProjectAppearances`

不再出现任何 `syncDocument` 名字。


## 12. 为什么这个方案更简单

## 12.1 状态图从“协议网络”变成“单状态机”

旧设计更像这样：

- command 改 document
- commit runtime 安装 document
- read runtime 跟着 sync
- project runtime 跟着 sync
- UI 在这几套状态之间订阅和联动

新设计是：

- transaction 从旧 snapshot 算出新 snapshot
- 发布新 snapshot

这就是单状态机。


## 12.2 正确性证明明显更容易

旧设计要证明正确，需要证明：

- install 之后 sync 一定完成
- sync 期间没人重入
- 清空阶段不会影响订阅者
- history 和 document 永远一致

新设计只需要证明：

- 每次 transaction 都从一个稳定 snapshot 出发
- 每次 transaction 都发布一个完整 snapshot

难度完全不是一个量级。


## 12.3 调试路径会短很多

未来调试一个 bug，只要回答两个问题：

1. 这次 transaction 的 base snapshot 是什么
2. 为什么 next snapshot 被算成这样

而不是今天这种：

1. document 什么时候 install 的
2. read 什么时候 sync 的
3. project 什么时候 sync 的
4. 中间谁先通知了订阅者
5. 订阅者有没有再触发一次 command


## 13. 推荐的一次性重构步骤

既然这里明确“不在乎成本，允许大面积重构”，我建议不要做小步兼容，而是直接按下面顺序切。

## 13.1 第一步：引入 `EngineSnapshot`

先定义：

- `EngineSnapshot`
- `EngineStore`
- `createInitialSnapshot(document, options)`

并让 engine 创建时只持有这一个 snapshot。


## 13.2 第二步：把 `dispatch/undo/redo/replace` 全部改成 plan

把今天分散在：

- `runtime/commit/runtime.ts`
- `runtime/commit/apply.ts`
- `runtime/commit/history.ts`

的逻辑收口成：

- `createDispatchPlan`
- `createUndoPlan`
- `createRedoPlan`
- `createReplacePlan`

统一返回 draft。


## 13.3 第三步：把 index/project 派生改成 transaction 内部调用

这一步完成后，engine 内部不再有：

- `read.syncDocument`
- `project.syncDocument`

transaction 直接拿：

- `base.document`
- `draft.document`
- `delta`

算出 `next.derived`。


## 13.4 第四步：把 read/project API 改成 snapshot selectors

把现有：

- `read runtime`
- `project runtime`

改成基于单 store 的 selectors。

做到这一步以后，旧的 runtime/sync 线就应该可以整体删除。


## 13.5 第五步：删除旧协议和过渡文件

最后统一删除：

- `instance/document.ts`
- `runtime/read/*`
- `runtime/commit/sync.ts`

以及所有调用它们的 glue code。


## 14. 测试策略

这次重构必须补的不是细碎单测，而是事务语义测试。

至少要有以下几类：

## 14.1 原子发布测试

验证任何一次：

- `command`
- `undo`
- `redo`
- `replace`

外部订阅者观察到的都只能是完整 snapshot。


## 14.2 重入保护测试

验证订阅者在 snapshot 更新回调里同步再次触发 command 时：

- 不会污染外层 transaction
- 不会导致 delta/document 不匹配

最简单方案是直接禁止 transaction 重入，并在开发态抛错。


## 14.3 replace 稳定性测试

验证 `replace()` 不会再出现：

- project 先被清空
- selection 被误清
- inline session 被误退出


## 14.4 history 一致性测试

验证：

- command 后 undoDepth/redoDepth 正确
- undo/redo 后 document 与 history 一致
- 任何失败提交都不会部分推进 history


## 15. 进一步的取舍建议

## 15.1 如果要绝对简单，先接受“派生全量重建”

如果这次目标是结构极简，而不是性能最优，那么最合理的做法甚至是：

- 第一版 transaction 里先全量重建 index
- 第一版 transaction 里先全量重建 project

先把正确的单流水线架起来。

等结构稳定后，再把：

- index 增量
- project 增量

作为 `deriveIndex / deriveProject` 的内部优化加回去。

这会比一边保留旧同步协议、一边做局部修补更干净。


## 15.2 如果要保留增量，也不要恢复旧 API

即使后续为了性能需要保留增量，也必须坚持：

- 增量是 `derive*` 的内部实现
- 不是 `syncDocument` 这种公开协议

也就是说，优化可以回来，架构边界不能退回去。


## 16. 最终建议

如果目标是“这条线尽量简单”，那就不要继续围绕：

- `peekDocument`
- `installDocument`
- `syncDocument`

去修局部 bug。

因为这些名字对应的就是旧架构本身。

长期最优方案不是把这些接口用得更谨慎，而是直接删除这套协议，改成：

- 一个 `EngineSnapshot`
- 一个 `snapshotStore`
- 一个 `transact(plan)` 提交入口
- 一次事务内完成 apply + derive + trace
- 一次性原子发布 `nextSnapshot`

这才是真正简单，而且能从结构上消掉当前这条线的大部分问题。
