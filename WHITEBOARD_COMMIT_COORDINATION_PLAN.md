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
3. 得到 `WriteDraft`
4. engine `commitDraft(draft, kind)`
5. 在 `commitDraft(...)` 内一次性完成：
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
type WriteDraft<T = void> =
  | {
      ok: false
      error: ...
    }
  | {
      ok: true
      kind: 'operations' | 'replace'
      doc: Document
      changes: ChangeSet
      impact?: KernelReadImpact
      inverse?: readonly Operation[]
      data: T
    }
```

然后：

- `createWrite()` 只返回 draft
- `createEngine()` 负责唯一的 `commitDraft(...)`

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
- `engine.publish(...)` 改成真正的 `commitDraft(...)`

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

- 把 whiteboard 收敛成单一 `commitDraft(...)` 协调点
- 让 `write` 只算 draft，不直接提交 document
- 保留 `impact -> invalidate -> projection sync` 这条 read 更新机制
- 保留现有 node/edge/mindmap/tracked 的细粒度设计

### 现在不建议做

- 不要为了形式统一而把 whiteboard 硬改成 dataview 的单 `State`
- 不要把 read/index/projection 全部塞进一个大 store 再假装“原子提交”
- 不要在没有 worker/time-travel/snapshot/debug 等强需求前，重写 read 体系

## 一句话总结

dataview 适合单 store，是因为它的 read/index/project 本来就是统一状态上的纯派生结果。

whiteboard 现在不适合单 store，是因为它的 read 侧本质上是一套 impact 驱动、按需同步、细粒度缓存的 projection 系统。

所以 whiteboard 正确的方向不是“全面单状态化”，而是：

- 保持增量 read 架构
- 收敛提交入口
- 把事务边界明确到一个地方
