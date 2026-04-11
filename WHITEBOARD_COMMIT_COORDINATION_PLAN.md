# Whiteboard 提交协调收敛方案

## 结论

whiteboard 当前没有必要直接重构成 dataview 那种：

- 单 `State`
- 单 `Store`
- 单 `commit(plan)`

但有必要把当前分散的提交职责收敛成一个明确的事务协调点。

更准确地说：

- 值得做的是“单提交协调器”
- 现在不值得做的是“全引擎单状态化”

原因不是理念差异，而是两个引擎的 read 模型和缓存策略完全不同。

## 当前 whiteboard 的真实提交流程

目前一个写操作的提交实际分成三段：

1. `write` 先把新文档写进 `documentSource`
- 位置：[index.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-engine/src/write/index.ts#L96)
- `runOperations(...)` 成功后直接 `commitDocument(reduced.data.doc)`
- `runReplace(...)` 成功后直接 `commitDocument(nextDocument)`

2. `engine.publish(...)` 再根据 impact 追平 read 侧
- 位置：[engine.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-engine/src/instance/engine.ts#L73)
- 对 operations 走 `readControl.invalidate(committed.impact)`
- 对 replace 走 `readControl.invalidate(RESET_READ_IMPACT)`

3. read 追平之后，`engine.commit` 再作为对外事件发布
- 位置：[engine.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-engine/src/instance/engine.ts#L85)
- 然后再调用 `onDocumentChange`

所以当前 whiteboard 并不是“单状态原子切换”，而是：

- 先提交 document
- 再增量刷新 read/projection/index
- 最后发布 commit 事件

## 当前设计并不是完全错误

这套设计不是随意长出来的，而是跟 whiteboard 的 read 模型绑定得很深。

`documentSource` 本身只是一个最薄的不可变文档引用：

- 位置：[document.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-engine/src/instance/document.ts#L15)
- 只有 `get()` 和 `commit()`
- 没有订阅能力

这意味着：

- 外部观察者不会直接在 `documentSource.commit(...)` 上收到通知
- 对外真正的可观察提交屏障，其实是 `engine.commit`

而 editor 和 collab 也确实把 `engine.commit` 当成“read 已经追平后的 barrier”来使用：

- editor 在 commit 后做 runtime reconcile：[createEditor.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/editor/createEditor.ts#L199)
- collab 在 commit 后同步到 Yjs：[session.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-collab/src/session.ts#L104)

所以 whiteboard 现在的问题不是“完全没有事务边界”，而是：

- 事务边界存在
- 但边界定义分散在 `write` 和 `engine` 两层

## whiteboard 真正值得收敛的点

### 目标

把“提交 document / 追平 read / 发布 commit”收敛到一个唯一协调点。

也就是说：

- `write` 不再直接 commit document
- `write` 只负责纯计算
- `engine` 统一负责真正提交

最终形态应该是：

1. translate command
2. reduce / normalize / finalize
3. 得到 `Draft`
4. engine `commit(draft)`
5. 在 `commit(...)` 内一次性完成：
   - `documentSource.commit(nextDoc)`
   - `readControl.invalidate(impact)`
   - `commit.set(nextCommit)`
   - `onDocumentChange?.(nextDoc)`

这一步是值得做的，因为它能让 whiteboard 的事务语义变得明确，而不强迫它改成 dataview 的状态模型。

## 推荐的最小收敛方案

### 方案核心

把当前 `WriteResult` 改造成“已算好、未提交”的 draft 结果。

例如概念上收敛成：

```ts
type Draft<T = void> =
  | {
      ok: false
      error: ...
    }
  | {
      ok: true
      kind: 'apply' | 'replace' | 'undo' | 'redo'
      doc: Document
      changes: ChangeSet
      impact?: KernelReadImpact
      inverse?: readonly Operation[]
      value: T
    }
```

然后：

- `createWrite()` 只返回 draft
- `createEngine()` 负责唯一的 `commit(...)`

### 为什么这是正确的收敛方向

因为当前两种职责本来就不同：

1. write 职责
- 命令翻译
- operation reduce
- normalize/finalize
- 历史捕获素材准备
- impact 计算

2. engine 职责
- 维护 document 生命周期
- 维护 read 生命周期
- 维护 commit 事件
- 维护外部回调边界

现在的问题是：

- `write` 越权做了 `document.commit`

把它收回来之后，事务边界会更清晰。

## 推荐的阶段性落地顺序

### 第一阶段：只收敛提交入口，不改 read 结构

先做这件事：

- `write` 不再调用 `documentSource.commit(...)`
- `engine.publish(...)` 收敛成唯一的 `commit(...)`

保持不变：

- `KernelReadImpact`
- `readControl.invalidate(...)`
- node/edge/mindmap projection
- tracked keyed store
- history 语义

这是最小、最稳的切法。

### 第二阶段：给 commit 增加更强的内部语义

当第一阶段完成后，可以再加：

- `rev`
- perf trace
- commit timing
- commit source / meta

但这些都只是增强项，不是这次收敛的前提。

### 第三阶段：只在出现明确痛点时，再考虑更深层状态统一

只有在未来出现这些需求时，才值得继续向单状态推进：

- worker 化或异步派生
- time-travel / snapshot debug
- 需要显式持久化 read/index/project 状态
- 需要严格保证任意 read 订阅都观察到完全单次切换

如果没有这些需求，现在不值得把 whole engine 改成 dataview 风格。

## 为什么 dataview 用单 store 是合理的

dataview 当前的状态定义天然适合单 store：

- 位置：[state/index.ts](/Users/realrong/Rostack/dataview/src/engine/state/index.ts#L44)
- `State` 里直接包含：
  - `doc`
  - `history`
  - `index`
  - `project`
  - `cache`

写入时也天然是“plan -> derive -> set”：

- 位置：[commit.ts](/Users/realrong/Rostack/dataview/src/engine/write/commit.ts#L351)
- 先从 `store.get()` 拿 `base`
- 执行 `plan(base)`
- derive `index`
- derive `project`
- 最后一次 `store.set(next)`

它合理的原因有四个。

### 1. dataview 的 read 大部分是 selector，不是投影子系统

dataview 的读层主要是从统一 `State` 上做 selector：

- 位置：[select.ts](/Users/realrong/Rostack/dataview/src/engine/state/select.ts#L55)
- `createSelector(...)` 和 `createKeyedSelector(...)` 都是从 `store.get()` 读 state
- 底层依赖的是 equality + selector，而不是显式 impact invalidate

所以：

- 单 store 更新后
- selector 自己判断是否需要通知

这和 whiteboard 现在的 read 模型完全不同。

### 2. dataview 的 index/project 本来就是“状态产物”

在 dataview 里：

- `index` 是 document + demand 推导结果
- `project` 是 doc + index + delta 推导结果

也就是说：

- 它们天然可以被视为 `State` 的不可变组成部分
- 每次 commit 直接得到一个新的完整 `next`

这非常适合单 store。

### 3. dataview 的派生链更像纯函数流水线

dataview 的 `commit(...)` 本质上就是：

- plan 文档变化
- derive 索引
- derive 投影
- 一次提交

这里没有 whiteboard 那种长期存活的几何缓存对象，也没有独立的 keyed tracked projection 实体。

所以把这些结果合进统一 state，不会显著扭曲模型。

### 4. dataview 更需要全量事务快照语义

dataview 的 `doc/index/project/history` 是一个强耦合整体：

- 任一层变化都会影响用户看到的排序、分组、sections、records、appearance

因此对 dataview 来说：

- “一次 commit 对应一个完整状态快照”

这是自然且高价值的。

## 为什么单 store 对 whiteboard 现在不合理

whiteboard 不合理的关键不是“不能单 store”，而是“代价大于收益”。

### 1. whiteboard read 不是 selector 系统，而是增量缓存系统

whiteboard read 侧当前依赖：

- `NodeRectIndex`
- `SnapIndex`
- `nodeProjection`
- `edgeProjection`
- `mindmapProjection`
- `tracked` keyed store

入口在：

- [read/store/index.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-engine/src/read/store/index.ts#L55)

这些结构不是“从 immutable state 读一下就行”，而是带有明确的增量同步语义。

### 2. whiteboard 当前强依赖 impact 驱动的局部失效

例如：

- node projection 只同步 changed ids：[node.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-engine/src/read/store/node.ts#L58)
- edge projection 区分 `dirty` 和 `full` rebuild：[edge.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-engine/src/read/store/edge.ts#L213)
- edge projection 还能只修受影响 edge：[edge.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-engine/src/read/store/edge.ts#L493)
- mindmap projection 维护树级缓存并按 layout/visible nodes 复用：[mindmap.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-engine/src/read/store/mindmap.ts#L171)

这类模型天然适合：

- document 更新后
- 用 impact 驱动 projection/index 局部追平

而不是：

- 每次都产出一个统一的 read state 快照替换掉旧值

### 3. `tracked` keyed store 表明 whiteboard 的通知目标是“已订阅 key”

tracked 机制在：

- [tracked.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-engine/src/read/store/tracked.ts#L23)

它的语义是：

- 只同步当前真正被订阅的 key
- 不为无人订阅的 key 做无意义 fanout

这说明 whiteboard 的读层设计目标是：

- 尽量细粒度
- 尽量按需
- 尽量局部刷新

而单 store 的天然重心是：

- 先提交一个整体状态
- 再让 selector 自己决定哪些订阅者更新

这不是同一类优化方向。

### 4. 如果强行单 state，很多缓存只会“换个壳继续存在”

whiteboard 如果硬改单 store，通常只会出现两种结果：

1. 把现有 projection/index/cache 都塞进 `State`
- 形式上变成单 state
- 实际仍然是可变缓存对象在工作
- 只是把结构包装得更大

2. 把 projection 每次 commit 都完全重算成新快照
- 模型更纯
- 但性能和增量复用很可能变差

这两种都没有明显收益。

### 5. whiteboard 当前的外部可观察边界已经是 `engine.commit`

虽然内部不是单 `store.set(next)`，但对外已经存在明确 barrier：

- 先 `invalidate`
- 再 `commit.set`

而 `commit` store 的 `set()` 是同步通知：

- 位置：[store.ts](/Users/realrong/Rostack/shared/core/src/store.ts#L243)

所以对 editor / collab / 上层服务而言：

- 它们是在 read 已经追平之后收到 commit

也就是说，whiteboard 当前并不缺“可消费的事务完成信号”，缺的是：

- 内部职责收口

## 最终建议

### 建议做

- 把 whiteboard 收敛成单一 `commit(...)` 协调点
- 让 `write` 只算 draft，不直接提交 document
- 保留 `impact -> invalidate -> projection sync` 这条 read 更新机制
- 保留现有 node/edge/mindmap/tracked 的细粒度设计

### 现在不建议做

- 不要为了形式统一而把 whiteboard 硬改成 dataview 的单 `State`
- 不要把 read/index/projection 全部塞进一个大 store 再假装“原子提交”
- 不要在没有 worker/time-travel/snapshot/debug 等强需求前，重写 read 体系

## 推荐的最终 API 设计

目标不是改变 whiteboard 对外能力，而是把“纯计算”和“真正提交”拆清楚。

最终推荐收敛成两个内部动作：

1. `writer` 算 `Draft`
2. `engine.commit(...)` 统一提交

对外公开面尽量保持不变：

- `write.apply(...)`
- `write.replace(...)`
- `history.undo()`
- `history.redo()`
- `engine.commit`
- `engine.read`

### 一、命名最终收敛

这一轮不再保留“长版”和“短版”双轨建议，直接以更短版本为最终目标。

建议保留的名字：

| 保留 | 用途 |
| --- | --- |
| `Draft` | write 计算结果，尚未提交 |
| `Writer` | 纯计算控制器 |
| `commit(...)` | engine 内唯一提交入口 |
| `Commit` | 对外发布的提交对象 |
| `rev` | 提交版本号 |
| `at` | 提交时间戳 |
| `doc` | 文档引用 |
| `value` | 业务返回值 |

建议删除的名字：

| 删除 | 原因 |
| --- | --- |
| `WriteDraft` | 比 `Draft` 多余 |
| `WritePlanner` | 比 `Writer` 更长，且不增加语义 |
| `commitDraft(...)` | 既然唯一提交入口就是 commit，不需要 `Draft` 后缀 |
| `CommitDraftOptions` | `Draft.kind` 自己就能表达提交类型 |
| `PublishedCommit` | `Commit` 直接就是最终发布对象 |
| `toCommit(...)` | 可以内联进 `commit(...)` |
| `replay(...)` | `undo/redo` 直接产出 `Draft` 即可 |
| `plan(...)` / `planReplace(...)` / `undoDraft(...)` / `redoDraft(...)` | 中间动作过多，直接收敛成 `run/replace/undo/redo` |

命名收敛后的核心心智模型只有一句话：

- `writer` 负责算 `Draft`
- `engine` 只负责 `commit(Draft)`

### 二、内部结果类型

最终推荐直接采用这组内部类型：

```ts
type Draft<T = void> =
  | {
      ok: false
      code: string
      message: string
    }
  | {
      ok: true
      kind: 'apply' | 'replace' | 'undo' | 'redo'
      doc: Document
      changes: ChangeSet
      value: T
      impact?: KernelReadImpact
      inverse?: readonly Operation[]
    }

type Commit = {
  kind: 'apply' | 'replace' | 'undo' | 'redo'
  rev: number
  at: number
  doc: Document
  changes: ChangeSet
  impact?: KernelReadImpact
}
```

这组类型里最关键的是：

- `Draft` 自己带 `kind`
- `Commit` 直接就是最终发布对象
- 不再需要任何“draft commit meta”的中间类型

### 三、Writer API

最终推荐把 write 层收敛成下面这组最薄 API：

```ts
type Writer = {
  run: <D extends WriteDomain, C extends WriteCommandMap[D]>(
    input: WriteInput<D, C>
  ) => Draft<WriteOutput<D, C>>
  ops: (
    operations: readonly Operation[],
    origin?: Origin
  ) => Draft<void>
  replace: (
    doc: Document
  ) => Draft<void>
  undo: () => Draft<void>
  redo: () => Draft<void>
  history: {
    get: () => HistoryState
    clear: () => void
    configure: (config: Partial<HistoryConfig>) => void
  }
}
```

这里的关键约束是：

- `writer` 可以读当前 `doc`
- `writer` 不能提交当前 `doc`

也就是说，保留：

- translate
- normalize
- reduce
- inverse/history 计算

删除：

- `documentSource.commit(...)`

### 四、Engine API

engine 内只保留一个真正的事务入口：

```ts
function commit<T>(
  draft: Draft<T>
): CommandResult<T>
```

所有内部调用统一成：

- `commit(writer.run(input))`
- `commit(writer.ops(operations, origin))`
- `commit(writer.replace(doc))`
- `commit(writer.undo())`
- `commit(writer.redo())`

`commit(...)` 内部统一负责：

1. 处理失败 draft
2. 生成 `rev` / `at`
3. `documentSource.commit(draft.doc)`
4. `readControl.invalidate(...)`
5. 同步 history side effect
6. `commit.set(nextCommit)`
7. `onDocumentChange?.(draft.doc)`
8. 返回 `success(nextCommit, draft.value)`

### 五、Read API 保持不变

read 层不建议跟着一起改名或改单模型。

继续保留：

- `engine.read.node.list`
- `engine.read.node.item`
- `engine.read.edge.item`
- `engine.read.mindmap.item`

不要改成：

- `store.get().read.node`
- `store.get().project.edge`

因为 whiteboard 的 read 侧本质上还是 projection/index/tracked store 体系，不是单 immutable state 的扁平字段。

### 六、最终推荐的极简内部轮廓

最终建议文档只认这套内部轮廓：

```ts
type Draft<T = void> =
  | Fail
  | {
      ok: true
      kind: 'apply' | 'replace' | 'undo' | 'redo'
      doc: Document
      changes: ChangeSet
      value: T
      impact?: KernelReadImpact
      inverse?: readonly Operation[]
    }

type Writer = {
  run(input): Draft
  ops(operations, origin?): Draft
  replace(doc): Draft
  undo(): Draft
  redo(): Draft
  history: {
    get()
    clear()
    configure(...)
  }
}

function commit(draft): CommandResult
```

整个内部流程只保留两步：

1. `writer` 算 draft
2. `engine.commit(...)` 统一提交

这样做的收益是：

- 名字短
- 中间对象少
- 心智路径短
- 职责边界仍然清楚
- 不会把 whiteboard 强行改成单 store

## 分阶段实施方案

这里按“先收边界，再补语义，最后才考虑深改”的顺序来做。

### 阶段 0：建立保护性测试

先补测试，不改生产逻辑。

目标：

- 固定当前外部语义
- 防止提交边界重构时出现行为回归

建议覆盖：

1. `apply()` 成功后：
- `engine.document.get()` 已经是新文档
- `engine.read` 已经追平
- `engine.commit` 订阅回调能读到追平后的 read

2. `replace()` 成功后：
- read 走 reset invalidate
- `commit.kind === 'replace'`

3. `undo()` / `redo()`：
- 提交顺序正确
- history 行为不变

4. editor / collab 侧契约：
- editor 的 commit 监听仍然在 read 追平后执行
- collab 的 commit mirror 仍然只在 publish 后执行

这一步的意义是：

- 先把“外部观察到的提交语义”钉住

### 阶段 1：把 write 改成只产出 draft

这是第一阶段的核心。

改动目标：

- 删除 `write/index.ts` 中对 `documentSource.commit(...)` 的直接调用
- 让 `runOperations(...)` / `runReplace(...)` 返回 draft
- 暂时保留 `WriteResult` 名字也可以，但语义必须变成“未发布”

建议调整点：

1. `createWrite()` 入参去掉 `document: EngineDocument`
- 或至少不再暴露 `commit`
- 最终只需要 `get()` 或直接传当前 `Document`

2. `runOperations(...)`
- 只返回 `{ ok, kind, doc, changes, inverse, impact, data }`
- 不做 side effect

3. `runReplace(...)`
- 只返回 `{ ok, kind: 'replace', doc, changes }`
- 不做 side effect

4. `history.replay`
- 仍然可以通过“当前文档 -> operations -> draft”的方式工作
- 只是 replay 结果改成 draft，再交给 engine 提交

这一阶段结束后，whiteboard 的结构会变成：

- `write` 纯计算
- `engine` 仍然 publish

但 `publish` 此时已经是唯一的 side effect 入口。

如果按更极简的目标推进，阶段 1 里就建议顺手完成命名收敛：

- `WriteResult` 语义改成 `Draft`
- `runOperations(...)` 收敛成 `ops(...)`
- `runReplace(...)` 收敛成 `replace(...)`
- `history.replay(...)` 对外不再暴露成独立中间概念

### 阶段 2：把 `publish(...)` 收敛成 `commit(...)`

第二阶段不再只是“发布结果”，而是明确事务语义。

建议做法：

1. 把 `publish(...)` 直接重命名为 `commit(...)`
2. 在内部统一处理：
- revision
- timestamp
- history capture/clear
- document commit
- read invalidate
- commit publish
- `onDocumentChange`

3. 让所有入口都走这里：
- `write.apply(...)`
- `replace(...)`
- `applyOperations(...)`
- `undo()`
- `redo()`
- `execute(...)`

这一阶段的目标不是新增功能，而是让代码结构表达真实语义：

- 这是 commit
- 不是单纯 publish

阶段 2 结束时建议直接到位：

- `publish(...)` 改成 `commit(...)`
- 不引入 `commitDraft(...)` 这种过渡命名

原因是：

- 在最终结构里，它就是唯一提交入口
- 再加 `Draft` 后缀只是重复信息

### 阶段 3：收敛 history 职责边界

当前 history 逻辑一部分在 write，一部分在 engine 使用。

第三阶段建议明确分工：

1. write/history 负责：
- capture inverse 素材
- 生成 undo draft
- 生成 redo draft
- 提供 history state

2. engine/commit 负责：
- 决定本次成功提交后是否 capture
- 决定 replace 成功后是否 clear
- 保证 history 变更和 commit publish 属于同一事务边界

如果要进一步统一，可以考虑把 history 的 side effect 也放到 `commit(...)` 里，但这一步不是第一优先级。

如果阶段 2 已经直接采用 `commit(...)` 命名，这里对应就是：

- 把 history side effect 尽量收进 `commit(...)`

而不是再保留：

- `capture(...) -> publish(...)`
- `clear(...) -> publish(...)`

### 阶段 4：给 commit 增加 revision 和 meta

当事务入口稳定后，再给 commit store 补强。

建议新增：

- `revision`
- `timestamp`
- 可选 `origin`
- 可选 perf meta

这样做的收益：

- collab 更容易去重
- editor 更容易做调试
- 以后要做日志或 devtools 更稳定

### 阶段 5：只在明确收益下，评估更深层状态统一

只有在以下情况之一发生时，才建议继续推进：

1. 需要 worker 化 derive/read pipeline
2. 需要完整事务快照调试
3. 需要 engine 内统一 revisioned snapshot
4. 当前 read fanout 出现明确 tearing 问题

如果没有这些证据，阶段 5 可以不做。

## 实施时的注意事项

### 1. 不要同时改 read 结构

这次重构的收益来自：

- 事务边界单点化

而不是来自：

- read API 统一
- projection 模型改写

如果把两件事绑在一起，风险会大很多。

### 2. 不要先上单 `State`

如果一开始就引入：

- `EngineState`
- `EngineStore`
- `revisioned snapshot`

大概率会把这次简单的边界收敛，做成一次无必要的大重写。

### 3. 对外兼容面应尽量保持

建议尽量保持以下 API 不变：

- `engine.execute(...)`
- `engine.applyOperations(...)`
- `engine.commit`
- `engine.read`
- `engine.document.get()`

内部重构完成后，上层 editor / collab 最好不需要同步改协议。

### 4. 先保证“顺序语义不变”，再做命名优化

最重要的顺序是：

1. commit document
2. invalidate read
3. publish commit
4. 回调 `onDocumentChange`

只要这个顺序稳定，对外契约就基本稳定。

命名是否叫：

- `publish`
- `commit`
- `finalize`

是第二优先级。

## 一句话总结

dataview 适合单 store，是因为它的 read/index/project 本来就是统一状态上的纯派生结果。

whiteboard 现在不适合单 store，是因为它的 read 侧本质上是一套 impact 驱动、按需同步、细粒度缓存的 projection 系统。

所以 whiteboard 正确的方向不是“全面单状态化”，而是：

- 保持增量 read 架构
- 收敛提交入口
- 把事务边界明确到一个地方
