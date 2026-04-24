# Unified Draft Foundation 设计：mutable draft + lazy COW + stable references

## 1. 背景

`UNIFIED_MUTATION_PIPELINE_FOUNDATION.zh-CN.md` 的 Draft Foundation 8.1 已经明确最终态只允许一种 draft 模型：

- mutable draft
- lazy copy-on-write
- stable references for untouched branches

这意味着：

- 不再保留 immutable current replace 模型。
- 不再把 Whiteboard overlay draft 作为 shared foundation 暴露。
- Dataview 与 Whiteboard 的 reducer/apply 都应统一到同一种 draft 风格。

本文进一步明确：Dataview 目前也存在和 Whiteboard 类似的问题，只是表现形式不同。

- Whiteboard 当前问题是私有 `OverlayTable`。
- Dataview 当前问题是 immutable `nextDocument -> replace` 链，以及 `entityTable.overlay` 原型 overlay。

两边都应该收敛到 shared reducer 的统一 Draft Foundation。

---

## 2. 当前问题判断

## 2.1 Whiteboard 当前问题

Whiteboard reducer 的 `DraftDocument` 当前使用私有 overlay table：

```ts
nodes: OverlayTable<NodeId, Node>
edges: OverlayTable<EdgeId, Edge>
groups: OverlayTable<GroupId, Group>
mindmaps: OverlayTable<MindmapId, MindmapRecord>
```

`OverlayTable` 的实现是：

```txt
base record
+ overlay Map
+ tombstone
+ materialize() => { ...base } + overlay patches
```

它已经有 lazy overlay 的味道，但还不是最终 Foundation：

1. 它是 Whiteboard 私有设施，不是 shared reducer foundation。
2. `materialize()` 对每张表都会 `{ ...base }`，未变表也会产生新引用。
3. 缺少 `changed()` / `baseIfUnchanged()` 语义。
4. tombstone + overlay Map 是一套额外模型，不是统一 mutable draft。
5. `background` / `canvasOrder` 仍是领域侧手写半 immutable 状态。

所以 Whiteboard 不应该长期保留 `createOverlayTable`。

## 2.2 Dataview 当前问题

Dataview 目前的问题更明显：operation apply 仍是 immutable replace 模型。

当前 `DocumentMutationContext` 是：

```ts
export interface DocumentMutationContext {
  doc(): DataDoc
  replace(doc: DataDoc): void
  inverse: {
    prependMany(ops: readonly DocumentOperation[]): void
  }
  trace: DataviewTrace
}
```

operation handler 经常做：

```txt
const document = ctx.doc()
const nextDocument = documentApi.records.patch(document, ...)
if (nextDocument === document) return
commitMutation(ctx, nextDocument, inverse)
```

而 `commitMutation` 本质是：

```ts
ctx.replace(document)
ctx.inverse.prependMany(inverse)
```

这正是 Foundation 8.1 要删除的 immutable current replace 模型。

Dataview 还有另一层问题：`entityTable.write.*` 使用 `Object.create(table.byId)` 做 overlay：

```ts
const createOverlay = (table) => Object.create(table.byId)
```

这会产生原型链式 byId record。虽然它能减少浅拷贝，但它不适合作为统一 Foundation：

1. 原型链 record 不直观，容易影响枚举、序列化和调试。
2. 多次 write 会产生多层 table/byId 引用关系。
3. 它仍是 immutable table replacement 风格。
4. 它没有明确的 draft lifecycle。
5. 它和 Whiteboard 的 `OverlayTable` 是两套不同模型。

所以 Dataview 也需要迁移到统一 lazy COW draft。

---

## 3. 统一目标

最终 reducer/apply 阶段只允许一种写法：

```txt
create draft from base document
  -> read from draft
  -> mutate writable branches in place
  -> collect inverse / footprint / trace
  -> finish draft
  -> unchanged branches keep stable references
```

核心不变量：

1. `draft.current()` 读当前事务态。
2. `draft.write()` 或 domain writer 返回可写分支。
3. 第一次写某个 branch 时才 copy。
4. 未触碰的 branch 返回原始引用。
5. 同一个事务内同一个 branch 只有一个 writable copy。
6. reducer helper 不返回 `nextDocument`，而是直接 mutate draft。
7. apply preview 和正式 apply 使用同一套 draft primitives。

---

## 4. shared/reducer 应提供的 Draft Foundation

建议 Draft Foundation 放在 `shared/reducer`，因为它是 reducer/apply runtime 的底层设施，不应该继续属于 `shared/mutation`。

`shared/mutation` 可以继续消费它，但不拥有它。

建议结构：

```txt
shared/reducer/src/draft/
  root.ts
  record.ts
  list.ts
  value.ts
  path.ts
  index.ts
```

公开 API 仍然保持克制：

```ts
export { draft } from './draft'
export type {
  DraftRoot,
  DraftRecord,
  DraftList,
  DraftValue
} from './draft'
```

---

## 5. Draft Root API

统一 root draft：

```ts
export interface DraftRoot<Doc extends object> {
  readonly base: Doc

  current(): Doc
  write(): Doc
  replace(doc: Doc): void
  changed(): boolean
  finish(): Doc
}
```

语义：

- `current()` 返回当前事务态。
- `write()` 第一次调用时 shallow copy root。
- `replace(doc)` 替换整个 root，标记 changed。
- `changed()` 判断 root 是否变化。
- `finish()` 返回最终 doc；未变化则返回 `base`。

实现原则：

```txt
let current = base
let written = false

write():
  if !written:
    current = shallowClone(base)
    written = true
  return current

finish():
  return written ? current : base
```

这类似当前 `shared/mutation/cowDraft`，但应迁入 `shared/reducer` 并扩展 branch draft 能力。

---

## 6. Draft Record API

这是替代 Whiteboard `OverlayTable` 和 Dataview `entityTable.overlay` 的关键。

```ts
export interface DraftRecord<Id extends string, Value> {
  readonly base: Record<Id, Value>

  get(id: Id): Value | undefined
  has(id: Id): boolean
  set(id: Id, value: Value): void
  delete(id: Id): void

  keys(): IterableIterator<Id>
  entries(): IterableIterator<[Id, Value]>
  values(): IterableIterator<Value>

  changed(): boolean
  finish(): Record<Id, Value>
}
```

实现模型：lazy COW record。

```ts
const createDraftRecord = <Id extends string, Value>(
  base: Record<Id, Value>
): DraftRecord<Id, Value> => {
  let current: Record<Id, Value> | undefined

  const write = () => {
    if (!current) {
      current = { ...base }
    }
    return current
  }

  return {
    base,
    get: id => (current ?? base)[id],
    has: id => Boolean((current ?? base)[id]),
    set: (id, value) => {
      write()[id] = value
    },
    delete: id => {
      delete write()[id]
    },
    entries: function * () {
      yield * Object.entries(current ?? base) as IterableIterator<[Id, Value]>
    },
    values: function * () {
      yield * Object.values(current ?? base) as IterableIterator<Value>
    },
    keys: function * () {
      yield * Object.keys(current ?? base) as IterableIterator<Id>
    },
    changed: () => current !== undefined,
    finish: () => current ?? base
  }
}
```

关键优势：

- 无 tombstone。
- 无原型链 overlay。
- 第一次写才 `{ ...base }`。
- 未修改时 `finish()` 返回 base。
- API 与 Whiteboard 当前 `OverlayTable` 基本兼容。
- Dataview table mutation 也能复用。

---

## 7. Draft Entity Table API

Dataview 和 Whiteboard 都有 `{ byId, order }` 或类似结构。

建议在 `shared/reducer` 提供更高层 entity table draft：

```ts
export interface DraftEntityTable<Id extends string, Entity extends { id: Id }> {
  readonly base: {
    byId: Record<Id, Entity>
    order: readonly Id[]
  }

  byId: DraftRecord<Id, Entity>
  order: DraftList<Id>

  get(id: Id): Entity | undefined
  has(id: Id): boolean
  put(entity: Entity): void
  patch(id: Id, patch: Partial<Omit<Entity, 'id'>>): Entity | undefined
  remove(id: Id): Entity | undefined

  changed(): boolean
  finish(): {
    byId: Record<Id, Entity>
    order: Id[]
  }
}
```

语义：

- `put` 新增时自动维护 order。
- `remove` 删除 byId 并从 order 移除。
- `patch` 只在字段有变化时写。
- `finish()` 未变时返回 base table。

这可以替代 Dataview `entityTable.write.put/patch/remove` 的 immutable 返回模式。

但建议分阶段做：

1. 先提供 `DraftRecord`。
2. Whiteboard 先迁掉 `OverlayTable`。
3. Dataview 再迁 `EntityTable` 写入。
4. 最后再抽 `DraftEntityTable`，避免 API 过早定死。

---

## 8. Draft List API

Whiteboard `canvasOrder`、Dataview `order` 都是 list 类分支。

建议提供：

```ts
export interface DraftList<Value> {
  readonly base: readonly Value[]

  read(): readonly Value[]
  write(): Value[]
  set(values: readonly Value[]): void

  push(value: Value): void
  insert(index: number, value: Value): void
  remove(index: number): void
  move(from: number, to: number): void

  changed(): boolean
  finish(): readonly Value[]
}
```

实现：

```txt
write() 第一次调用时 copy [...base]
finish() 未变化返回 base
```

这样 Whiteboard 的 `canvasOrder` 可以从反复返回新数组，逐步转成 mutable list 操作。

Dataview table order 也可以复用。

---

## 9. Draft Value API

对于 `background`、`activeViewId` 这类单值分支，可以提供：

```ts
export interface DraftValue<Value> {
  readonly base: Value
  get(): Value
  set(value: Value): void
  changed(): boolean
  finish(): Value
}
```

不过它不是第一优先级，因为这类字段手写也不复杂。

优先级：

```txt
DraftRecord > DraftList > DraftEntityTable > DraftValue
```

---

## 10. Whiteboard 迁移设计

## 10.1 替换 OverlayTable

当前：

```ts
nodes: OverlayTable<NodeId, Node>
```

目标：

```ts
nodes: DraftRecord<NodeId, Node>
```

`createDraftDocument`：

```ts
export const createDraftDocument = (document: Document): DraftDocument => ({
  base: document,
  background: document.background,
  canvasOrder: draft.list(document.canvas.order),
  nodes: draft.record(document.nodes),
  edges: draft.record(document.edges),
  groups: draft.record(document.groups),
  mindmaps: draft.record(document.mindmaps)
})
```

## 10.2 materialize 保持 stable references

当前：

```ts
nodes: draft.nodes.materialize()
```

目标：

```ts
nodes: draft.nodes.finish()
```

并且：

```ts
canvas: draft.canvasOrder.changed()
  ? { order: draft.canvasOrder.finish().map(cloneCanvasRef) }
  : draft.base.canvas
```

完整思路：

```ts
export const materializeDraftDocument = (draft: DraftDocument): Document => {
  const backgroundChanged = draft.background.changed()
  const canvasOrderChanged = draft.canvasOrder.changed()
  const nodes = draft.nodes.finish()
  const edges = draft.edges.finish()
  const groups = draft.groups.finish()
  const mindmaps = draft.mindmaps.finish()

  if (
    !backgroundChanged
    && !canvasOrderChanged
    && nodes === draft.base.nodes
    && edges === draft.base.edges
    && groups === draft.base.groups
    && mindmaps === draft.base.mindmaps
  ) {
    return draft.base
  }

  return {
    ...draft.base,
    background: backgroundChanged
      ? cloneBackground(draft.background.get())
      : draft.base.background,
    canvas: canvasOrderChanged
      ? { order: draft.canvasOrder.finish().map(ref => cloneCanvasRef(ref)!) }
      : draft.base.canvas,
    nodes,
    edges,
    groups,
    mindmaps
  }
}
```

## 10.3 API 兼容

Whiteboard 当前代码大量使用：

```ts
state.draft.nodes.get(id)
state.draft.nodes.set(id, node)
state.draft.nodes.delete(id)
state.draft.edges.values()
```

`DraftRecord` 可以直接提供同名方法，因此迁移成本低。

需要调整的是：

- `materialize()` -> `finish()`
- `canvasOrder` 从数组变成 `DraftList` 后，调用点要逐步改为 `canvasOrder.read()` / `canvasOrder.write()`。

可以先不迁 `canvasOrder`，第一阶段只迁 tables。

## 10.4 删除私有 overlay

当所有 `createOverlayTable` 使用都迁完后，删除：

```txt
whiteboard/packages/whiteboard-core/src/kernel/overlay.ts
```

---

## 11. Dataview 迁移设计

## 11.1 当前 immutable replace 链

Dataview 当前 operation handler 是：

```ts
const document = ctx.doc()
const nextDocument = documentApi.records.patch(document, ...)
if (nextDocument === document) return
commitMutation(ctx, nextDocument, inverse)
```

目标是改成：

```ts
const record = ctx.records.get(recordId)
if (!record) return
ctx.records.patch(recordId, patch)
ctx.inverse.prependMany(inverse)
ctx.trace.recordPatched(recordId)
```

也就是 operation handler 不再产生 `nextDocument`，而是 mutate draft branch。

## 11.2 Dataview DraftDocument

建议新增 Dataview reducer draft：

```ts
export interface DataviewDraftDocument {
  base: DataDoc
  records: DraftEntityTable<RecordId, DataRecord>
  fields: DraftEntityTable<CustomFieldId, CustomField>
  views: DraftEntityTable<ViewId, View>
  activeViewId: DraftValue<ViewId | undefined>
  meta?: DraftValue<...>
}
```

如果先不做 `DraftEntityTable`，可以先用：

```ts
recordsById: DraftRecord<RecordId, DataRecord>
recordsOrder: DraftList<RecordId>
fieldsById: DraftRecord<CustomFieldId, CustomField>
fieldsOrder: DraftList<CustomFieldId>
viewsById: DraftRecord<ViewId, View>
viewsOrder: DraftList<ViewId>
activeViewId: ViewId | undefined
```

## 11.3 Dataview documentApi 分层

当前 `documentApi.records.patch(document, ...)` 返回新 `DataDoc`。

建议分成两层：

### read API 保留

```ts
documentApi.records.get(document, id)
documentApi.records.ids(document)
documentApi.fields.get(document, id)
```

### write API 新增 draft 版本

```ts
documentDraft.records.insert(draft, records, index)
documentDraft.records.patch(draft, recordId, patch)
documentDraft.records.remove(draft, recordIds)
documentDraft.records.writeFields(draft, input)

documentDraft.fields.put(draft, field)
documentDraft.fields.patch(draft, fieldId, patch)
documentDraft.fields.remove(draft, fieldId)

documentDraft.views.put(draft, view)
documentDraft.views.remove(draft, viewId)
documentDraft.views.setActive(draft, viewId)
```

不要让 reducer handler 继续调用 immutable `documentApi.write.*`。

## 11.4 previewOperations 迁移

当前 preview 已使用 `cowDraft`，但仍通过 `replace(nextDocument)` 重建 draft：

```ts
replace: (nextDocument) => {
  draft = createDraft(nextDocument)
}
```

这只是包了一层 immutable replace，未达到 Foundation 目标。

目标：preview 与 apply 共用同一套 `DataviewDraftDocument`：

```ts
const draft = createDataviewDraft(document)
operations.forEach(op => applyDataviewOperation(draftCtx, op))
return draft.finish()
```

## 11.5 entityTable.overlay 迁移

Dataview `entityTable.overlay` 不应再作为 write primitive。

迁移后：

- read/normalize helper 可保留在 domain/core。
- write helper 改成 draft entity table 操作。
- `Object.create(table.byId)` overlay 删除或仅作为 legacy internal，最终删除。

---

## 12. shared/mutation 与 shared/reducer 的关系

当前 `shared/mutation/src/draft.ts` 已有：

- `cowDraft`
- `draftPath`
- `draftList`

但 Draft Foundation 更适合归属 `shared/reducer`。

推荐迁移：

```txt
shared/mutation/src/draft.ts
  -> shared/reducer/src/draft/*
```

然后 `shared/mutation` 从 `@shared/reducer` re-export 或内部依赖：

```ts
export { draft } from '@shared/reducer'
```

最终：

- `shared/reducer` 拥有 draft primitives。
- `shared/mutation` 拥有 MutationEngine。
- `shared/mutation/apply` 如保留，也使用 reducer draft。

---

## 13. 推荐 API

统一入口：

```ts
import { draft } from '@shared/reducer'
```

```ts
const root = draft.root(document)
const records = draft.record(document.records.byId)
const order = draft.list(document.records.order)
```

API：

```ts
export const draft = {
  root,
  record,
  list,
  value,
  entityTable,
  path
}
```

其中第一阶段只实现：

```ts
draft.root
draft.record
draft.list
draft.path
```

`draft.entityTable` 第二阶段再实现。

---

## 14. 迁移顺序

## 阶段 1：shared/reducer 新增 DraftRecord / DraftList

新增：

```txt
shared/reducer/src/draft/record.ts
shared/reducer/src/draft/list.ts
shared/reducer/src/draft/root.ts
shared/reducer/src/draft/index.ts
```

并加测试：

- 未写入 finish 返回 base。
- 第一次 set/delete 才 copy。
- 多次写同一 record 只用同一 current。
- entries/values/keys 反映当前态。
- list 未写返回 base，写后返回 copy。

## 阶段 2：Whiteboard tables 迁移

- `OverlayTable` -> `DraftRecord`
- `createOverlayTable` -> `draft.record`
- `materialize()` -> `finish()`
- 未变表保持 base 引用

此阶段暂不改 `canvasOrder`。

## 阶段 3：Whiteboard list/value 迁移

- `canvasOrder` -> `DraftList<CanvasItemRef>`
- `background` -> `DraftValue<Background | undefined>` 或继续手写 changed flag
- 删除 `kernel/overlay.ts`

## 阶段 4：Dataview draft 文档引入

- 新增 `DataviewDraftDocument`
- operation context 从 `doc/replace` 改为领域 draft writer
- 先迁 records，再迁 fields/views/activeViewId

## 阶段 5：Dataview 删除 immutable write API 依赖

- operation handler 不再调用 `documentApi.records.patch -> nextDocument`
- previewOperations 不再重建 cowDraft
- `entityTable.overlay` 不再用于写入

## 阶段 6：shared/mutation draft 迁出

- `shared/mutation/cowDraft` 迁到 `shared/reducer/draft.root`
- 保留兼容 re-export 一段时间
- 最终所有 reducer/apply 使用 `@shared/reducer` draft

---

## 15. 验收标准

## 15.1 Foundation 验收

- reducer/apply 阶段只有 mutable draft 风格。
- 不再有 immutable `nextDocument -> replace` apply 主链。
- 未触碰 branch 的引用稳定。
- table/list 第一次写才 copy。
- preview apply 与正式 apply 使用同一套 draft primitive。

## 15.2 Whiteboard 验收

- `OverlayTable` 删除。
- `createOverlayTable` 删除。
- 未修改的 `nodes/edges/groups/mindmaps` 在 reduce 后保持原引用。
- reducer handler 仍可用 `get/set/delete/values` 语义。

## 15.3 Dataview 验收

- `DocumentMutationContext` 不再暴露 `replace(doc)` 作为常规写入口。
- operation handler 不再返回或提交 `nextDocument`。
- `documentApi.*` 的 immutable write helper 不再被 reducer apply 使用。
- `entityTable.overlay` 不再用于 document mutation。
- `previewOperations` 与正式 apply 共用同一 draft 写法。

---

## 16. 最终判断

Dataview 有同样的问题，而且比 Whiteboard 更需要迁移。

Whiteboard 当前是私有 overlay table 模型，不适合作为 shared foundation，但迁移到 `DraftRecord` 很直接。

Dataview 当前是 immutable current replace 模型，已经与 Foundation 8.1 的目标冲突，需要逐步重写 operation apply，使其直接 mutate draft。

最终应统一为：

```txt
shared/reducer/draft
  root
  record
  list
  value
  entityTable
  path

Whiteboard reducer
  uses DraftRecord for nodes/edges/groups/mindmaps
  uses DraftList for canvasOrder

Dataview reducer
  uses DraftEntityTable for records/fields/views
  uses DraftValue for activeViewId
```

这会让两边都满足：

- mutable draft
- lazy copy-on-write
- stable references for untouched branches

也会让 `Reducer` 真正成为多项目可复用的底层 mutation foundation。
