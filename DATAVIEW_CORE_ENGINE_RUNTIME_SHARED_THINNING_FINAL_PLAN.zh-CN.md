# Dataview 核心包 Shared 利用度审查与最终重构方案

## 约束

- 不保留兼容层。
- 不保留两套 source / projection / mutation 解释链。
- 复杂度优先降低，不为了“渐进迁移”继续保留镜像层。
- 能直接复用 `shared` 的地方不再本地重包。
- 领域规则保留在 dataview，基础设施归 shared 或 engine 唯一出口。

## 范围

- `dataview/packages/dataview-core`
- `dataview/packages/dataview-engine`
- `dataview/packages/dataview-runtime`

下游消费者如 `dataview-react` 不作为本次核心重构主体，但必须跟随新的 engine/runtime 唯一接口。

---

## 1. 总体结论

这三个核心包里，真正最重的 shared 利用不足，不在 `dataview-core` 的领域规则层，而在 `dataview-engine -> dataview-runtime` 之间：

- `dataview-engine` 内部已经使用了 `@shared/projection`，但没有把 projection store surface 直接暴露出来。
- `dataview-runtime` 因此重新构建了一整套 `source` / `store` / `list` / `patch` 体系，形成第二套读取基础设施。
- `dataview-core` 还有局部重复实现，尤其是 record field write 逻辑被复制了两份。
- `dataview-core` 和 `dataview-engine` 还各自维护了一份 dataview mutation schema，说明 mutation 语义没有单点收口。

长期最优的方向不是继续增强 `runtime/source` 这层镜像，而是直接删除这层，让 runtime 建立在 engine 暴露的 projection stores 之上。

---

## 2. 当前存在的核心问题

## 2.1 `dataview-core` 和 `dataview-engine` 各自维护一份 mutation schema

当前现状：

- `dataview-core/src/custom.ts` 自己定义 `dataviewMutationSchema`，并基于它创建 `createDeltaBuilder(...)`。
- `dataview-engine/src/mutation/delta.ts` 又重新定义了一份 `dataviewMutationSchema`，再基于它创建 typed delta facade。

直接证据：

- `dataview/packages/dataview-core/src/custom.ts`
- `dataview/packages/dataview-engine/src/mutation/delta.ts`

这说明的问题：

- mutation entity / path / signal 语义没有唯一来源。
- core 和 engine 对 `record.values`、`view.query` 这些 channel 的理解不是单点定义。
- 后续任何一个字段、path codec、signal key 的调整，都存在双改风险。

长期最优要求：

- dataview mutation schema 必须只在一个地方定义。
- `core` 作为领域真相层，应该持有：
  - `dataviewEntities`
  - `dataviewMutationSchema`
  - path codec
  - delta builder
- `engine` 只能消费这套 schema，不能再重写一份。

最终收口形态：

```ts
// dataview-core
export {
  dataviewEntities,
  dataviewMutationSchema,
  createDataviewDeltaBuilder
}

// dataview-engine
import {
  dataviewMutationSchema
} from '@dataview/core/mutation'
```

说明：

- `engine` 可以保留 dataview-specific typed delta view。
- 但 schema、codec、builder 不能分裂。

---

## 2.2 `dataview-core` 内部存在实质性重复实现

最明显的是 record field write 内核被复制了两份：

- `dataview/packages/dataview-core/src/custom-recordFieldDraft.ts`
- `dataview/packages/dataview-core/src/document/records.ts`

重复内容包括：

- `compileRecordFieldWrite(...)`
- `applyCompiledRecordFieldWrite(...)`
- restore set / restore clear 生成
- title / values 的同构 patch 逻辑

这不是 shared 重复，而是 core 自己内部的重复基础逻辑。

长期最优要求：

- record field write 规则只能有一个 pure kernel。
- draft 版本和 immutable document 版本只允许共享同一个“编译 + 应用”核心，然后在最外层分别接：
  - draft entity table write
  - immutable document rebuild

最终结构：

```ts
dataview-core/src/document/recordFieldWriteKernel.ts
dataview-core/src/custom-recordFieldDraft.ts
dataview-core/src/document/records.ts
```

其中：

- `recordFieldWriteKernel.ts` 只包含：
  - compile
  - apply
  - restore metadata
- `custom-recordFieldDraft.ts` 只做 draft adapter
- `document/records.ts` 只做 immutable adapter

不允许继续保留两套同构实现。

---

## 2.3 `dataview-engine` 已经有 shared projection store tree，但对外只暴露 snapshot

当前现状：

- `dataview-engine/src/projection/createDataviewProjection.ts` 已经通过 `createProjection(...)` 建好了完整的 store tree：
  - `active`
  - `fields`
  - `sections`
  - `items`
  - `summaries`
- 但 `dataview-engine/src/createEngine.ts` 对外只暴露：
  - `current()`
  - `subscribe(...)`
  - imperative APIs

直接证据：

- `dataview/packages/dataview-engine/src/projection/createDataviewProjection.ts`
- `dataview/packages/dataview-engine/src/createEngine.ts`

这说明的问题：

- engine 内部已经拥有 shared projection runtime，但外部消费者拿不到。
- runtime 只能消费快照，无法直接消费 projection stores。
- shared/projection 的价值被困在 engine 内部，没有成为 dataview 的唯一读取基础设施。

长期最优要求：

- engine 必须直接暴露 projection stores。
- runtime 和下游 UI 只能建立在 engine 暴露的 stores / source 上，不能再自己把 `current()` 快照转一次。

最终 API 方向：

```ts
interface Engine {
  doc(): DataDoc
  current(): DataviewCurrent
  commits: ...
  history: ...
  performance: ...

  source: {
    document: DocumentSource
    active: ActiveSource
  }
}
```

或等价地：

```ts
interface Engine {
  projection: {
    stores: {
      document: ...
      active: ...
    }
  }
}
```

但无论命名如何，要求只有一个：

- runtime 不能再自己重建 source。

---

## 2.4 `dataview-runtime` 重新构建了一套 source/store 基础设施

这是当前最重的第二套实现。

当前链路：

```ts
engine.current() / engine.subscribe()
  -> createEngineSource()
  -> createDocumentSourceRuntime()
  -> createActiveSourceRuntime()
  -> resetDocumentSource()
  -> resetActiveSource()
  -> runtime model / session / selection
```

直接证据：

- `dataview/packages/dataview-runtime/src/source/createEngineSource.ts`
- `dataview/packages/dataview-runtime/src/source/createDocumentSource.ts`
- `dataview/packages/dataview-runtime/src/source/createActiveSource.ts`
- `dataview/packages/dataview-runtime/src/source/patch.ts`
- `dataview/packages/dataview-runtime/src/source/list.ts`

问题不只是“代码长”，而是这层已经成为独立基础设施：

- 重新定义 source contracts
- 重新创建 keyed/value stores
- 重新维护 ids / byId / list
- 重新做 document source
- 重新做 active source
- 重新实现 patch/reset 入口

更关键的是，这层还不是增量使用 projection，而是全量 reset：

- `createEngineSource.ts` 每次 engine 更新都执行 `resetDocumentSource(...)`
- 同时执行 `resetActiveSource(...)`

这说明 runtime/source 不是 shared store 的薄 adapter，而是 engine projection 的镜像系统。

长期最优要求：

- 整个 `runtime/src/source/*` 不能继续作为独立层存在。
- 不要把它“增量化”后继续保留。
- 不要把 `applyEntityDelta(...)` 接回 `createEngineSource(...)`，那只是在加固第二套实现。
- 正确方向是删除镜像层，让 runtime 直接读 engine 暴露的 source / projection stores。

必须删除的方向性模块：

- `dataview-runtime/src/source/createEngineSource.ts`
- `dataview-runtime/src/source/createDocumentSource.ts`
- `dataview-runtime/src/source/createActiveSource.ts`
- `dataview-runtime/src/source/patch.ts`
- `dataview-runtime/src/source/list.ts`

保留方式：

- 若 `DocumentSource` / `ActiveSource` 类型对下游有价值，可迁移到 `dataview-engine` 作为 engine 公开契约。
- 但实现必须归 engine 唯一持有。

---

## 2.5 `dataview-runtime/src/source/patch.ts` 已经形成未接入主链的本地 delta infra

当前现状：

- `source/patch.ts` 已经实现了：
  - `createSourceTableRuntime(...)`
  - `createEntitySourceRuntime(...)`
  - `applyEntityDelta(...)`
  - `applyMappedEntityDelta(...)`
- 但主链 `createEngineSource.ts` 实际并没有用这些 delta apply 能力，而是每次全量 reset。

这说明的问题：

- runtime/source 已经不是“简单 glue code”，而是正在长成自己的基础设施包。
- 它既没有真正复用 engine 的 projection stores，也没有真正把自己的 delta 路跑通。
- 这类“半独立基础设施”是最差状态：复杂但不成为 canonical。

长期最优要求：

- 这套 patch infra 不应该继续发展。
- 不要补齐它。
- 直接删除它背后的镜像层设计。

---

## 2.6 `dataview-engine` 内部还存在一次 snapshot <-> family snapshot 的往返

当前现状：

- publish 阶段先产出一个 UI 友好的肥 `ViewState`：
  - `view`
  - `query`
  - `records`
  - `sections`
  - `items`
  - `fields`
  - `table`
  - `gallery`
  - `kanban`
  - `summaries`
- 然后 `active/runtime.ts` 又从 `ViewState` 里重新拆：
  - `readFieldFamily(...)`
  - `readSectionFamily(...)`
  - `readItemFamily(...)`
  - `readSummaryFamily(...)`
- 再用这些 family snapshot 去喂 `@shared/projection` store change。

直接证据：

- `dataview/packages/dataview-engine/src/active/publish/stage.ts`
- `dataview/packages/dataview-engine/src/active/runtime.ts`

这说明的问题：

- engine 的 canonical active output 形态还不够稳定。
- 现在是先生成 UI snapshot，再反解成 projection family surface。
- 这不是严重架构错误，但确实是多余往返。

长期最优要求：

- active publish 阶段直接产出 canonical projection payload。
- `ViewState` 不再是唯一真相，只能是：
  - capture 视图
  - 或从 canonical stores 派生的 convenience snapshot

最终目标：

- engine 内部 canonical 形态是 projection stores 对应的数据结构。
- 若仍需 `current().active`，那只是 capture，不再反过来驱动 stores。

---

## 2.7 `dataview-runtime` 的 model helper 是薄封装，不是核心问题

像：

- `dataview-runtime/src/model/spec.ts`

这种只是：

- `createValueModelStore(...)`
- `createFamilyModelStore(...)`

它们只是 `@shared/core/store` 的薄封装，不是当前复杂度主源。

判断：

- 不是优先删除对象。
- 只有在 runtime/source 删除后，若仍无必要，再顺手内联或合并。

---

## 3. 长期最优的包职责

## 3.1 `dataview-core`

只保留领域真相：

- dataview document types
- entities
- mutation schema
- intent / op compile
- pure custom reduce
- pure document algorithms
- field / filter / sort / group / calc 等领域规则

不再承担：

- 第二份 mutation schema 定义
- 多份 record field write kernel

## 3.2 `dataview-engine`

成为唯一的 mutation + projection 宿主：

- 持有 `MutationEngine`
- 持有 `ProjectionRuntime`
- 持有 document source
- 持有 active source
- 对外暴露 imperative write API
- 对外暴露 projection/source read API

不再只是：

- “内部有 projection，但外部只给 current() 快照”

## 3.3 `dataview-runtime`

只保留 UI/runtime 层能力：

- selection
- marquee
- inline session
- page session
- value editor
- workflow
- UI model derived stores

不再持有：

- document source runtime
- active source runtime
- source patch runtime
- engine snapshot mirror

## 3.4 下游 UI

下游如 react 只能消费：

- engine 暴露的 source / projection stores
- runtime 暴露的 UI session / model

不能再各自从 `current()` 快照做二次 source 化。

---

## 4. 最终目标结构

## 4.1 mutation 收口

新增单点模块，例如：

```ts
dataview-core/src/mutation/index.ts
```

唯一职责：

- 导出 `dataviewEntities`
- 导出 `dataviewMutationSchema`
- 导出 dataview path codecs
- 导出 delta builder

然后：

- `core/custom.ts` 只消费它
- `engine/mutation/delta.ts` 只消费它

## 4.2 engine 成为 source 唯一宿主

最终 `createEngine()` 直接创建并持有：

- `mutationEngine`
- `projection`
- `source`

其中 `source` 直接来自 projection stores，而不是 runtime 再转一次。

最终效果：

```ts
const engine = createEngine(...)

engine.source.document.records
engine.source.document.values
engine.source.active.items
engine.source.active.sections
```

这些都由 engine 直接提供。

## 4.3 runtime 删除 source 镜像层

最终 `createDataViewRuntime(...)` 直接依赖：

```ts
input.engine.source
```

而不是：

```ts
createEngineSource({
  engine: input.engine
})
```

## 4.4 engine internal active canonical shape 收口

最终 publish 链不再是：

```ts
phase result
  -> ViewState
  -> family snapshot
  -> ProjectionFamilyChange
```

而是：

```ts
phase result
  -> canonical projection payload
  -> ProjectionFamilyChange
  -> optional capture snapshot
```

也就是说：

- stores 先于 snapshot
- snapshot 只是派生 surface

---

## 5. 明确的删除与收口清单

## 5.1 必须收口为单点

- `dataview-core/src/custom-recordFieldDraft.ts`
- `dataview-core/src/document/records.ts`
- `dataview-core/src/custom.ts`
- `dataview-engine/src/mutation/delta.ts`

## 5.2 必须删除的镜像层

- `dataview-runtime/src/source/createEngineSource.ts`
- `dataview-runtime/src/source/createDocumentSource.ts`
- `dataview-runtime/src/source/createActiveSource.ts`
- `dataview-runtime/src/source/patch.ts`
- `dataview-runtime/src/source/list.ts`

## 5.3 允许保留但必须瘦身

- `dataview-engine/src/active/runtime.ts`
- `dataview-engine/src/active/publish/stage.ts`
- `dataview-runtime/src/model/spec.ts`

---

## 6. 实施顺序

## 第一步：收口 mutation schema 与 record field write kernel

目标：

- schema 单点定义
- record field write 单内核

动作：

- 新增 `dataview-core/src/mutation/*`
- core/custom 与 engine/mutation/delta 改为统一消费
- 抽出 `recordFieldWriteKernel.ts`

完成标准：

- dataview 不再有第二份 mutation schema
- `custom-recordFieldDraft.ts` 和 `document/records.ts` 不再复制 record field write 逻辑

## 第二步：把 engine projection stores 提升为正式公开 surface

目标：

- engine 成为唯一 source 宿主

动作：

- 在 `createEngine()` 中直接暴露 projection stores 或 source facade
- 为 document / active 定义稳定的公开 read contract

完成标准：

- runtime 不需要 `engine.current() + subscribe()` 来重建 source
- runtime 可以直接消费 engine store surface

## 第三步：删除 runtime/source 镜像层

目标：

- runtime 不再维护第二套 source/store 系统

动作：

- 删除 `runtime/src/source/*` 的 runtime 实现
- runtime/model、session、workflow 改为直接消费 engine.source

完成标准：

- `createEngineSource(...)` 消失
- `resetDocumentSource(...)` / `resetActiveSource(...)` 消失
- `applyEntityDelta(...)` / `applyMappedEntityDelta(...)` 不再属于 runtime 主链

## 第四步：收紧 engine 内部 canonical active 形态

目标：

- 去掉 `ViewState -> family snapshot` 的反向拆解

动作：

- publish 阶段直接产出 family snapshot / family change 所需的 canonical 结构
- `current().active` 若保留，则从 canonical 结构派生

完成标准：

- `active/runtime.ts` 不再从 `ViewState` 重建 `fields/sections/items/summaries`
- projection store sync 不再依赖二次 snapshot diff

---

## 7. 最终判断

从长期最优视角看，真正应该动刀的不是 `dataview-core` 那些领域规则大文件，而是以下三件事：

1. mutation schema 单点收口，避免 core/engine 双定义。
2. engine 直接暴露 shared projection/source surface，停止把它藏在内部。
3. 删除 runtime/source 镜像层，不要在 dataview-runtime 继续维护第二套 store 基础设施。

一句话总结：

- `core` 现在主要问题是局部重复。
- `engine` 现在主要问题是 shared 能力没有公开成唯一 surface。
- `runtime` 现在主要问题是整层都在重建 engine 已经拥有的读取基础设施。

因此后续实施优先级必须是：

1. 先收口 mutation 单源。
2. 再让 engine 成为唯一 source 宿主。
3. 最后删除 runtime/source 整层镜像。

不要反过来先去“优化 runtime/source 的增量 patch”，那会把错误层级继续做厚。
