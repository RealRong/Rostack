# Shared Mutation Kernel 极简重写最终方案

## 1. 目标

- 不保留兼容，直接从根重写 `@shared/mutation`。
- 从 public API 中删除 `semantic.change`、`semantic.footprint`、public `structures`、`MutationPathCodec`、schema builder 这整套厚模型。
- `@shared/mutation` 收敛为执行内核，不再承担领域语义抽象框架。
- dataview、whiteboard 自己定义领域 writer 和 typed delta facade，不再把领域语义上推到 shared。

## 2. 当前根复杂度

当前 `shared/mutation` 的复杂度根源不是某个 helper，而是把三层职责揉在了一起：

1. 通用 mutation 执行内核
2. 领域语义 delta / footprint 表达框架
3. ordered / tree 结构 DSL

直接表现为：

- program step 里有 entity / ordered / tree
- 还额外有 `semantic.change`
- 还额外有 `semantic.footprint`
- 还额外有 public `MutationStructureSource`
- 还额外有 public `MutationPathCodec`
- domain 还要自己写 prefix / resolver / codec

这套模型的结果是：

- shared 太厚
- domain 还是要重复解释语义
- dataview / whiteboard 都被迫写第二层适配

## 3. 最终原则

### 3.1 shared 只做执行，不做领域语义框架

shared 最终职责只有：

- program step 容器
- apply
- inverse
- history
- delta merge / normalize / query primitive
- entity change 自动推导
- structural adapter 调用

shared 不再负责：

- 领域 semantic change DSL
- 领域 typed path schema
- 领域 structure family public API

### 3.2 delta / footprint 不是单独 step

`delta` 和 `footprint` 仍然需要，但不再以独立 `semantic.*` step 形式存在。

最终原则：

- 每个 step 自带自己的 `delta?`
- 每个 step 自带自己的 `footprint?`
- runtime apply 时统一 merge

也就是从：

```ts
program.structure.ordered.move(...)
program.semantic.change(...)
program.semantic.footprint(...)
```

改成：

```ts
program.ordered.move({
  ...,
  delta: ...,
  footprint: ...
})
```

### 3.3 structures 不再是 public DSL

ordered / tree runtime 仍然需要底层适配信息，但这不应继续作为 public `structures` 模型暴露给 domain。

最终原则：

- `structures` 从 public API 删除
- shared 内部保留最小 `structuralAdapters`
- domain 不再定义 `PREFIX + startsWith + slice`
- domain 不再定义 `orderedFamily({...})`

### 3.4 typed delta 回到 domain

shared 不再提供通用 typed schema / codec 框架。

最终原则：

- shared 只保留标准化 `MutationDelta`
- dataview 自己定义 `DataviewMutationDelta`
- whiteboard 自己定义 `WhiteboardMutationDelta`
- typed semantic path 是 domain 自己的 facade，不是 shared 的公共 DSL

## 4. 最终 shared public API

## 4.1 保留

- `createEngine`
- `applyMutationProgram`
- `MutationProgram`
- `MutationProgramStep`
- `MutationProgramWriter`
- entity spec
- `normalizeMutationDelta`
- `mergeMutationDeltas`
- delta 基础 query primitive
- history runtime

## 4.2 删除

- `semantic.change`
- `semantic.footprint`
- public `MutationStructureSource`
- public `MutationStructureResolver`
- public `MutationStructureTable`
- public `MutationPathCodec`
- public `defineEntityMutationSchema`
- public `createDeltaBuilder`
- public typed structure family DSL

## 5. 最终 program 模型

program 只保留两大类 step：

1. entity step
2. structural step

不再存在第三类 semantic step。

### 5.1 entity step

```ts
type MutationEntityProgramStep =
  | {
      type: 'entity.create'
      entity: MutationEntityRef
      value: unknown
      tags?: readonly string[]
      delta?: MutationDeltaInput
      footprint?: readonly MutationFootprint[]
    }
  | {
      type: 'entity.patch'
      entity: MutationEntityRef
      writes: Readonly<Record<string, unknown>>
      tags?: readonly string[]
      delta?: MutationDeltaInput
      footprint?: readonly MutationFootprint[]
    }
  | ...
```

说明：

- entity delta 默认仍可自动推导
- `delta?` 和 `footprint?` 用于领域覆盖或补充

### 5.2 structural step

```ts
type MutationStructuralTarget = {
  adapter: string
  key: string
}

type MutationStructuralProgramStep =
  | {
      type: 'ordered.insert'
      target: MutationStructuralTarget
      itemId: string
      value: unknown
      to: MutationOrderedAnchor
      tags?: readonly string[]
      delta?: MutationDeltaInput
      footprint?: readonly MutationFootprint[]
    }
  | {
      type: 'ordered.move'
      target: MutationStructuralTarget
      itemId: string
      to: MutationOrderedAnchor
      tags?: readonly string[]
      delta?: MutationDeltaInput
      footprint?: readonly MutationFootprint[]
    }
  | {
      type: 'tree.move'
      target: MutationStructuralTarget
      nodeId: string
      parentId?: string
      index?: number
      tags?: readonly string[]
      delta?: MutationDeltaInput
      footprint?: readonly MutationFootprint[]
    }
  | ...
```

说明：

- `structure: string` 删除
- 改为 internal `target`
- `target` 不是 public domain 概念，只是 shared 内部 step 字段

## 6. 最终 writer 模型

shared 基础 writer 不再暴露 `semantic` 分组。

最终 shared 基础 writer：

```ts
interface MutationProgramWriter {
  entity: { ... }
  ordered: { ... }
  tree: { ... }
  build(): MutationProgram
}
```

注意：

- shared 基础 writer 是内核 writer，不是 domain 最终 writer
- domain 自己封装更友好的 writer API

例如 dataview：

```ts
writer.view.order.move(viewId, recordId, { before })
writer.field.option.insert(fieldId, option, { before })
```

例如 whiteboard：

```ts
writer.edge.label.move(edgeId, labelId, { before })
writer.edge.route.patch(edgeId, pointId, patch)
writer.mindmap.topic.move(mindmapId, topicId, to)
```

这些 domain writer 内部再转成 shared step，并附带精确 `delta/footprint`。

## 7. structuralAdapters 内部模型

public `structures` 删除，但 shared 内部仍然需要最小 structural adapter。

最终内部模型：

```ts
type StructuralAdapterRegistry<Doc> = Readonly<Record<string, {
  kind: 'ordered' | 'tree'
  read(document: Doc, key: string): unknown
  write(document: Doc, key: string, next: unknown): Doc
  identify?: (item: unknown) => string
  patch?: (item: unknown, patch: unknown) => unknown
  diff?: (before: unknown, after: unknown) => unknown
}>>
```

说明：

- internal only
- 不再承载 semantic change
- 不再承载 public family DSL
- 不再承载 codec

### 7.1 还能继续收薄

adapter 还可以提供三类内部快捷构造：

- `orderedValues`
- `orderedRecords`
- `treeRecords`

用于减少重复的 `identify/patch/diff`。

但这仍然是 internal，不进入 domain public API。

## 8. delta 最终模型

shared 只保留标准化 delta 容器：

```ts
type MutationDelta = {
  reset?: true
  changes: Record<string, {
    ids?: readonly string[] | 'all'
    paths?: Record<string, readonly string[] | 'all'> | 'all'
    order?: true
  }>
}
```

shared 负责：

- merge
- normalize
- primitive query

shared 不再负责：

- 领域 path codec
- 领域 semantic schema builder
- 领域 typed delta API

## 9. footprint 最终模型

footprint 也从单独 step 降为 step 附带字段。

shared 只负责：

- normalize footprint
- dedupe footprint
- conflict 判断

entity step 的 footprint 仍可自动推导。

structural step 的 footprint 由 domain writer 显式附带。

## 10. domain 侧最终职责

## 10.1 dataview

dataview 自己负责：

- compile intent -> domain writer
- domain writer -> shared step
- 为 structural step 附带 `delta/footprint`
- 定义 `DataviewMutationDelta` facade

dataview 不再负责：

- public structure family registry
- public path codec

## 10.2 whiteboard

whiteboard 自己负责：

- compile op -> domain writer
- graph / route / labels / mindmap structural step 语义附带
- 定义 `WhiteboardMutationDelta` facade

whiteboard 不再负责：

- public prefix resolver
- public structure DSL

## 11. 目录建议

shared 最终目录建议：

```text
shared/mutation/src/
  engine/
    index.ts
    runtime.ts
    apply.ts
    history.ts
    delta.ts
    footprint.ts
    entity.ts
    structural/
      apply.ts
      inverse.ts
      adapters.ts
      ordered.ts
      tree.ts
    program/
      program.ts
      writer.ts
  index.ts
```

说明：

- 删除独立 `typed.ts` 主位
- 删除 public `structure` / `path` DSL 层
- `structural/adapters.ts` 仅 internal

## 12. 不兼容重写实施方案

### Phase 1：删除 semantic step

- 删除 `semantic.tag` 之外的 semantic step
- 删除 `semantic.change`
- 删除 `semantic.footprint`
- 把 `delta/footprint` 并入 entity/structural step

验收标准：

- program model 不再有独立 change / footprint step

### Phase 2：删除 public structures

- 删除 public `MutationStructureSource` 主路径
- 删除 public `MutationStructureResolver`
- 删除 public `MutationStructureTable`
- 引入 internal `structuralAdapters`
- structural step 的 `structure: string` 改为 internal `target`

验收标准：

- domain 不再接触 public structures
- shared structural runtime 只依赖 internal adapters

### Phase 3：删除 shared typed schema / codec 主路径

- 删除 public `MutationPathCodec`
- 删除 public `defineEntityMutationSchema`
- 删除 public `createDeltaBuilder`
- 保留 raw delta normalize / merge / primitive query

验收标准：

- shared 不再承担 typed semantic schema 框架

### Phase 4：重写 shared writer

- 删除 `writer.semantic`
- shared writer 改成 `entity / ordered / tree`
- structural steps 支持附带 `delta/footprint`

验收标准：

- shared writer API 明显变薄

### Phase 5：迁移 dataview

- dataview writer 直接产出 shared steps
- structural step 附带 dataview delta / footprint
- 删除 dataview 的 public structures / codec 依赖
- 自己定义 `DataviewMutationDelta`

验收标准：

- dataview 不再使用 shared schema/codec/public structures 模型

### Phase 6：迁移 whiteboard

- whiteboard writer 直接产出 shared steps
- route / labels / tree step 附带 whiteboard delta / footprint
- 删除 prefix / resolver / codec 依赖
- 自己定义 `WhiteboardMutationDelta`

验收标准：

- whiteboard 不再使用 shared public structures / codec 模型

### Phase 7：清理 shared public API

- 删掉所有旧 public 入口
- 收口 `index.ts`
- 更新所有使用方

验收标准：

- `shared/mutation` 成为极简执行内核

## 13. 最终状态判定

满足以下条件才算完成：

- shared public API 不再有 `semantic.change`
- shared public API 不再有 public `structures`
- shared public API 不再有 `MutationPathCodec`
- program step 只剩 entity / structural
- `delta/footprint` 成为 step 附带数据
- dataview / whiteboard 自己提供 typed delta facade

## 14. 明确不做的事情

- 不保留旧 `semantic.change` 兼容层
- 不保留 public `structures` 兼容层
- 不保留 shared typed schema / codec 兼容层
- 不保留 domain 手写 prefix / resolver 模型
- 不继续让 shared 负责领域 semantic DSL
