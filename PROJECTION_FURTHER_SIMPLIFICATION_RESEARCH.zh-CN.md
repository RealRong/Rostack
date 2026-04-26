# PROJECTION_FURTHER_SIMPLIFICATION_FINAL_API_AND_EXECUTION_PLAN

## 1. 目标

这份文档只保留最终结论：

- **长期最优**
- **不考虑兼容**
- **API 简单清晰**
- **projection/internal glue 尽量收口**
- **上层只保留领域逻辑**

讨论范围只包括两块：

- `dataview/packages/dataview-engine/src/active` 与 `mutation/publish.ts`
- `whiteboard/packages/whiteboard-editor` / `whiteboard-editor-scene` 的 scene runtime 边界

---

## 2. 最终判断

### 2.1 dataview

当前 dataview 已经完成了：

- active projection
- index projection
- document projection

但还没有完成最后一步：

- **把这三段 projection 收成一个单一的 dataview publish projection runtime**

长期最优不是继续保留：

- active runtime
- index runtime
- document runtime
- `mutation/publish.ts` 手工 glue

而是收成：

- **一个 dataview publish projection runtime**

---

### 2.2 whiteboard

当前 whiteboard 的方向是对的：

- scene runtime 属于 `editor-scene`
- session / interaction / preview / document 的合成最终都应由 `editor-scene` 负责 planning

但当前还残留：

- `whiteboard-editor` 侧 scene-shaped delta assembly
- `projection/adapter.ts`
- `scene/orchestrator.ts`

这里的最终最优不是“删除编排”，而是：

- **删除 editor 侧 orchestrator**
- **把 orchestration 内聚进 `editor-scene runtime`**
- **让 `editor` 只暴露 source**
- **让 `editor-scene` 独占 source -> invalidation planning**

这点必须说清楚：

- 外部 orchestrator 要删
- 内部 orchestration 不会消失，只是回到 `editor-scene runtime`

---

## 3. dataview 最终 API 设计

## 3.1 最终内部结构

最终 dataview 应收口为：

```text
mutation engine
  -> dataview publish projection runtime
  -> publish snapshot
```

而不是：

```text
mutation engine
  -> document projection runtime
  -> index projection runtime
  -> active projection runtime
  -> publish adapter
```

---

## 3.2 最终 runtime 设计

建议最终固定一个正式 cluster：

```text
dataview/packages/dataview-engine/src/mutation/projection/
  runtime.ts
  spec.ts
  types.ts
  trace.ts
```

这个 runtime 内部统一处理：

- document delta
- plan resolve
- index derive
- query
- membership
- summary
- publish
- cache
- performance trace

phase 视图固定为：

```text
document
index
query
membership
summary
publish
```

`capture()` 直接返回：

```ts
{
  publish,
  cache,
  performance
}
```

---

## 3.3 `mutation/publish.ts` 最终形态

`mutation/publish.ts` 最终只能是薄壳。

它不再长期拥有这些知识：

- 如何 resolve plan
- 如何推进 index projection
- 如何推进 active projection
- 如何推进 document projection
- 如何组装 publish/cache/trace

它最终只负责：

```ts
createDataviewPublishSpec(...) => ({
  init(doc) {
    runtime.reset(doc)
    return runtime.capture()
  },
  reduce({ prev, doc, write }) {
    runtime.update({
      prev,
      doc,
      write
    })
    return runtime.capture()
  }
})
```

也就是说：

- dataview 的 publish 逻辑不再散落
- 所有 projection 编排都进入单一 runtime

---

## 3.4 active 最终边界

长期最优不再把 active 当成独立顶层 runtime 族。

`active` 最终只是 dataview publish projection 内部的一组 phase：

- query
- membership
- summary
- publish

因此这些都应该 internal 化：

- `ActiveProjectionWorking`
- `ActivePhaseScopeMap`
- `MembershipPhaseScope`
- `SummaryPhaseScope`
- `PublishPhaseScope`
- `createActiveProjectionRuntime`

最终不再维持：

- `active/contracts/projection.ts` 这种半 public contract 文件

更合适的是：

- `active/projection/types.ts`
- 或直接并回 `mutation/projection` cluster

原则只有一个：

- active projection 是 dataview 内部实现，不是对外正式 API

---

## 3.5 dataview public API

dataview 对外 API 不需要继续改 projection 语言。

继续保持：

- `engine.fields.*`
- `engine.records.*`
- `engine.views.*`
- `engine.active.*`

继续保持：

- `active` public API 读 `engine.current().publish?.active`

不建议把 projection runtime 暴露到 public API。

最终边界应固定为：

- projection internal
- publish snapshot external

---

## 4. whiteboard 最终 API 设计

## 4.1 最终边界

最终 whiteboard 边界固定为：

- `editor` 只拥有 source
- `editor-scene` 直接绑定 source
- `editor-scene` 内部独占：
  - source subscription
  - pending aggregation
  - schedule / flush
  - source diff
  - invalidation planning
  - projection execution

也就是说最终不是：

- `editor` 手工 `runtime.update(input)`

而是：

- `editor-scene runtime` 自己驱动 projection runtime

---

## 4.2 `editor` 最终职责

`whiteboard-editor` 最终只负责：

- engine
- session
- interaction
- viewport
- measure
- node capability
- source binding

最终只保留类似：

```ts
createEditorSceneSource({
  engine,
  session,
  viewport
}): EditorSceneSource
```

严格禁止继续保留：

- scene delta builder
- scene adapter
- scene flush scheduler
- editor 侧 scene orchestrator

---

## 4.3 `editor-scene` public runtime 最终 API

最终 public API 应收敛为：

```ts
createEditorSceneRuntime({
  measure?,
  nodeCapability?,
  source
}): EditorSceneRuntime
```

不再暴露：

- `Input`
- `InputDelta`
- `mark(delta)`
- `flush()`
- editor 主导的 `update(input)`

这些如果还存在，只能是 runtime internal。

---

## 4.4 `source` 最终 public contract

最终只保留 source-first contract：

```ts
type EditorSceneSource = {
  get(): EditorSceneSourceSnapshot
  subscribe(listener: (change: EditorSceneSourceChange) => void): () => void
}
```

其中 snapshot 固定表达 source 自己的真实状态：

```ts
type EditorSceneSourceSnapshot = {
  document: {
    publish: EnginePublish
  }
  session: {
    tool: ToolState
    selection: SelectionTarget
    edit: EditSession | null
    preview: EditorInputPreviewState
  }
  interaction: {
    hover: EditorHoverState
    mode: EditorInteractionMode
    chrome: boolean
  }
  view: {
    zoom: number
    center: Point
    worldRect: Rect
  }
  clock: {
    now: number
  }
}
```

关键原则：

- `document` 直接保留 `EnginePublish`
- `preview` 保留 editor 原生结构
- `view` 并入 source
- 不在上游预翻译成 scene preview maps

---

## 4.5 `source change` 最终 public contract

最终 `source change` 只能表达 source slice changed：

```ts
type EditorSceneSourceChange = {
  document?: true
  session?: {
    tool?: true
    selection?: true
    edit?: true
    preview?: true
  }
  interaction?: {
    hover?: true
    mode?: true
    chrome?: true
  }
  view?: true
  clock?: true
}
```

严格禁止继续出现：

- `preview.nodes`
- `preview.edges`
- `preview.mindmaps`
- `draft.edges`
- `clock.mindmaps`
- touched ids
- render-layer dirty flags
- scene-shaped invalidation fields

如果 scene 需要 touched ids，必须由 `editor-scene` 内部自己根据：

- previous source snapshot
- next source snapshot
- source change

来推导。

---

## 4.6 `editor-scene` 内部最终结构

最终 `editor-scene` 内部应固定为三层：

### 1. source runtime

负责：

- 订阅 source
- 聚合 pending source change
- schedule / flush
- 维护 previous/current source snapshot

### 2. source planning

负责：

- preview parsing
- hover parsing
- drag parsing
- edit parsing
- touched-id derivation
- source dirty facts
- source dirty -> phase scope

### 3. projection runtime

负责：

- 真正的 graph / spatial / view phase 执行
- stores / query / capture

注意：

- orchestration 仍然存在
- 只是它成为 `editor-scene runtime` 内部能力
- 不再由 `whiteboard-editor` 持有

---

## 4.7 whiteboard 最终删除清单

### 删除 `whiteboard-editor` 侧

最终删除：

- `whiteboard/packages/whiteboard-editor/src/projection/adapter.ts`
- `whiteboard/packages/whiteboard-editor/src/scene/orchestrator.ts`

原因：

- 它们只是 source -> scene 的外部中转层
- 不是 editor 自己的稳定领域能力

### 删除 `editor-scene` public bridge input

最终删除或 internal 化：

- `Input`
- `InputDelta`
- `DocumentInput`
- `SessionInput`
- `InteractionInput`
- `ClockInput`
- `sceneInputChangeSpec`

原因：

- 这些是 editor 向 scene 手工喂桥接输入的历史产物
- 最终 runtime 直接绑定 source，不再需要它们作为 public API

---

## 5. 共同原则

## 5.1 public 和 internal 必须分清

长期最优只保留真正稳定的 public contract。

以下两类都应该 internal 化：

- runtime working state
- phase scope schema
- runtime glue helper

不要再维持：

- 文件名叫 contract
- 内容却是 runtime 私有细节

---

## 5.2 单消费者 helper 不要平铺导出

如果某个 helper：

- 只有一个调用者
- 只是 runtime / translator 的局部零件

那它应该：

- 变成局部函数
- 或变成 internal translator/runtime 的方法

不再平铺导出。

---

## 6. 最终实施方案

## Phase 1：dataview 单一 publish projection runtime

目标：

- 合并 document / index / active runtime
- 建立 `mutation/projection` 单一 runtime cluster
- `mutation/publish.ts` 退化为薄壳

完成标准：

- dataview publish projection 成为唯一正式 projection pipeline

---

## Phase 2：dataview internal 收边

目标：

- `active/contracts/projection.ts` internal 化
- `context.ts / metrics.ts / reset.ts / trace.ts` 按 cluster 收边
- active 不再作为顶层 runtime 族存在

完成标准：

- active projection 只作为 publish projection 内部阶段簇存在

---

## Phase 3：whiteboard source contract 固化

目标：

- 建立 `EditorSceneSource`
- 建立 `EditorSceneSourceSnapshot`
- 建立 `EditorSceneSourceChange`

完成标准：

- source contract 只表达 source 自己的状态与变化
- 不再带 scene invalidation 语义

---

## Phase 4：whiteboard orchestration 内聚进 `editor-scene`

目标：

- `createEditorSceneRuntime({ source, ... })`
- `editor-scene` 内部接管 source subscribe / pending / flush
- 删除 editor 侧 orchestrator

完成标准：

- `whiteboard-editor` 不再 import `InputDelta`
- `whiteboard-editor` 不再存在 scene flush / mark / delta assembly

---

## Phase 5：whiteboard source planning 全量下沉

目标：

- preview parsing 下沉
- hover parsing 下沉
- drag parsing 下沉
- edit parsing 下沉
- touched-id derivation 下沉
- source dirty -> phase scope 下沉

完成标准：

- 删除 `whiteboard-editor/src/projection/adapter.ts`
- `editor-scene` 成为唯一合法的 source -> scene planner

---

## 7. 最终 API 结论

### dataview

最终内部 API：

```ts
createDataviewPublishProjectionRuntime(...)
```

最终 public API：

- `engine.fields.*`
- `engine.records.*`
- `engine.views.*`
- `engine.active.*`

### whiteboard

最终 public API：

```ts
createEditorSceneSource(...)
createEditorSceneRuntime({
  source,
  measure?,
  nodeCapability?
})
```

最终边界：

- `editor` 只暴露 source
- `editor-scene` 独占 planning / invalidation / flush / projection execution

这就是这两块的长期最优方案。
