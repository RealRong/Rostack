# Unified Draft Foundation 设计 v3

本文给出最终收敛方案。

目标不是继续讨论“是否可以”，而是明确：

- 最终基础设施放在哪里
- 最终 API 长什么样
- `preview` 应该怎么处理
- Whiteboard 与 Dataview 如何一起推进

---

## 1. 最终结论

这件事值得做，而且应该和 compile/apply 收口一起推进。

最终应同时成立的结论有五条：

1. 统一 draft foundation
   - mutable draft
   - lazy copy-on-write
   - untouched branches stable references
2. 外部公开写入 API 只保留 `apply`
3. compile 内部继续维护 `current document`
4. `preview` 不再作为公开概念存在
5. `DraftEntityTable` 也进入 `shared/draft`
   - 但它是建立在 `record/list` 之上的薄组合层
   - 它与 `root / record / list / path` 一起作为一等 shared primitive 落地
   - 不是反向驱动 primitive 设计的高层框架

也就是说：

> 要删除的不是“compile 阶段推进 current document”这件事。  
> 要删除的是把这件事暴露成一个叫 `preview` 的外部 API。

---

## 2. 为什么 `preview` 设计得不好

当前 Dataview / shared compile 里的 `preview` 本质不是 UI preview，而是：

- speculative apply
- advance working document
- 让后一个 intent 能基于前一个 intent 的结果继续编译

这件事本身是对的。

问题在于当前设计把它暴露成了错误的概念：

- `preview` 这个名字不准确
- Dataview 还把它公开成 `operation.preview`
- 它和正式 apply 不是同一个明确的内核边界

最终应该收口为：

- compile handler 继续只拿 `ctx.doc()` 作为 current document
- compile runtime 在每轮 intent 后，用 **apply** 推进 working doc
- 外部不再暴露 `preview`

一句话：

> current document 需要保留；public preview 不需要保留。

---

## 3. 最终边界

最终有三层：

### 3.1 `shared/draft`

只负责 draft primitive：

- root
- record
- list
- entityTable
- path

### 3.2 `shared/mutation`

只负责 compile / engine / history / collab。

其中 compile 不再依赖 `previewApply`，而是依赖一个内部 `apply` 回调来推进 `workingDoc`。

### 3.3 domain apply kernel

Dataview / Whiteboard 各自提供：

- `apply(document, ops)` 或等价 reducer kernel

它既服务正式 apply，也服务 compile 阶段的 working document 推进。

---

## 4. 放置位置

最终建议新增独立基础包：

```txt
shared/draft
```

原因：

1. `shared/reducer` 已经收成最小 apply runner，不应该再因为 draft 变胖。
2. draft 不只服务 reducer，也服务 compile 内部 apply、preview 替代链、domain write helper。
3. draft 是独立基础设施，应该和 `shared/reducer`、`shared/projector` 并列。

最终导入方式：

```ts
import { draft } from '@shared/draft'
```

不建议：

- 继续由 `shared/mutation` 持有 draft
- 把 draft 再塞回 `shared/reducer`
- 保留兼容 re-export

---

## 5. 最终 API

## 5.1 `@shared/draft`

最终 API 包含五个：

- `draft.root`
- `draft.record`
- `draft.list`
- `draft.entityTable`
- `draft.path`

导出形态：

```ts
export const draft = {
  root,
  record,
  list,
  entityTable,
  path
}
```

### `DraftRoot`

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

- `current()` 返回当前事务态
- `write()` 第一次调用时 shallow copy root
- `replace(doc)` 只用于 full-document replace 特例
- `finish()` 未变返回 `base`

关键约束：

- `replace()` 不是常规写入口
- Dataview 迁移完成后，普通 operation handler 不再依赖它
- `DraftRoot` 只管理 root lifecycle 与 full-document replace
- `DraftRecord / DraftList / DraftEntityTable` 是 branch draft，不自动绑定 root path
- domain draft document 必须在 finalize 阶段显式组装最终 document

### `DraftRecord`

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

约束：

- 第一次 `set/delete` 才 copy
- `set(id, value)` 在当前值与目标值 `Object.is` 相等时不触发 copy
- `delete(id)` 在 key 不存在时不触发 copy
- 后续写入复用同一个 current
- `finish()` 未变返回 `base`
- `has()` 必须基于 own-key 语义，不能基于 `Boolean(value)`
- 不允许 tombstone
- 不允许 prototype overlay

### `DraftList`

```ts
export interface DraftList<Value> {
  readonly base: readonly Value[]

  current(): readonly Value[]
  write(): Value[]
  set(values: readonly Value[]): void

  push(value: Value): void
  insert(index: number, value: Value): void
  removeAt(index: number): void
  move(from: number, to: number): void

  changed(): boolean
  finish(): readonly Value[]
}
```

### `DraftEntityTable`

`DraftEntityTable` 也放在 `@shared/draft`。

原因：

- 它不是 Dataview 私有语义，而是 ordered keyed table 的通用 draft 组合
- 它只是 `DraftRecord + DraftList` 的薄组合层
- 它不是“以后再抽”的可选 helper，而是第一阶段直接落地的 shared primitive
- Dataview 会大量使用它
- Whiteboard 即使暂时不用，也不妨碍它作为 shared draft 能力存在

最终 API：

```ts
export interface EntityTable<
  Id extends string,
  Entity extends { id: Id }
> {
  byId: Record<Id, Entity>
  order: readonly Id[]
}

export interface DraftEntityTableOptions<
  Id extends string,
  Entity extends { id: Id }
> {
  hasPatchChanges?: (
    current: Entity,
    patch: Partial<Omit<Entity, 'id'>>
  ) => boolean
}

export interface DraftEntityTable<
  Id extends string,
  Entity extends { id: Id }
> {
  readonly base: EntityTable<Id, Entity>

  readonly byId: DraftRecord<Id, Entity>
  readonly order: DraftList<Id>

  get(id: Id): Entity | undefined
  has(id: Id): boolean

  ids(): readonly Id[]
  list(): readonly Entity[]

  put(entity: Entity): void
  patch(
    id: Id,
    patch: Partial<Omit<Entity, 'id'>>
  ): Entity | undefined
  remove(id: Id): Entity | undefined

  changed(): boolean
  finish(): EntityTable<Id, Entity>
}

draft.entityTable(base, options?: DraftEntityTableOptions<Id, Entity>)
```

设计约束：

- `put` 只在 entity 不存在时追加 `order`
- `patch` 只在 patch 真实变化时写入
- 默认比较语义是 patch 各字段逐项 `Object.is` 的 shallow compare
- shared 层不内建 JSON deep equal
- 如领域需要不同 patch 判定，使用 `draft.entityTable(base, { hasPatchChanges })`
- `remove` 同时移除 `byId` 和 `order`
- `finish()` 未变化时返回 `base`
- `finish()` 只替换发生变化的 `byId/order`

边界约束：

- `DraftEntityTable` 只是组合层
- `DraftRecord / DraftList` 仍然是更底层 primitive
- 不允许为了 `DraftEntityTable` 反向把 primitive 做复杂

### `draft.path`

`draft.path` 只做：

- 在已经可写的 object / array 上执行 `get/set/unset`

它不负责：

- root copy
- record copy
- list copy

---

## 5.2 `@shared/mutation` compile 最终 API

compile 继续保留 `ctx.doc()` 这个 current document 上下文。

但它不再接收 `previewApply`。
这里的 `apply` 必须是 pure apply kernel。

最终 API 改成：

```ts
export type CompileApplyResult<Doc> =
  | {
      ok: true
      doc: Doc
    }
  | {
      ok: false
      issue: Issue
    }

export const compile = <
  Doc,
  Intent,
  Op,
  Output = void
>(input: {
  doc: Doc
  intents: readonly Intent[]
  run: CompileOne<Doc, Intent, Op, Output>
  apply(doc: Doc, ops: readonly Op[]): CompileApplyResult<Doc>
  stopOnError?: boolean
}): CompileResult<Doc, Op, Output>
```

compile loop 语义固定为：

```txt
workingDoc = input.doc

for each intent:
  run intent against ctx.doc() === workingDoc
  collect issues
  collect pendingOps
  if current intent has blocking issue:
    append issues
    if stopOnError:
      break
    continue
  if pendingOps not empty:
    next = input.apply(workingDoc, pendingOps)
    if next failed:
      append issue
      break
    append issues
    append pendingOps to output ops
    workingDoc = next.doc
  else:
    append issues
```

这意味着：

- current document 保留
- preview 概念删除
- 推进 working document 的唯一语义变成 apply
- 只有当前 intent 没有 blocking issue 且存在 `pendingOps` 时才推进 `workingDoc`
- warning / non-blocking issue 不阻止 apply
- `compile.apply` 只能做 reducer/apply，自身不能触发 publish / history / write stream

---

## 5.3 domain 对外 API 最终形态

Dataview / Whiteboard 对外都不再暴露 `preview`。

最终公开面只保留：

```ts
export const operation = {
  meta,
  apply
}
```

compile 内部如果需要推进 working document，直接调用 domain apply kernel。

换句话说：

> external API only apply  
> internal compile also uses apply

这才是最干净的边界。

---

## 6. 基础不变量

无论 Whiteboard 还是 Dataview，统一 foundation 必须满足：

1. 第一次写某个 branch 时才 copy。
2. 同一事务中同一 branch 只存在一个 writable copy。
3. 未触碰 branch 在 `finish()` 后保持原引用。
4. 未发生任何变更时，`finish()` 返回 `base`。
5. compile 的 `current document` 与正式 apply 语义一致。
6. 外部不再暴露 `preview` 作为 public API。

如果做不到这六条，就不是最终方案。

---

## 7. Whiteboard 迁移方案

Whiteboard 先迁，因为收益最大，而且已经有 reducer kernel。

## 7.1 阶段 1：tables 迁到 `DraftRecord`

把：

```ts
nodes: OverlayTable<NodeId, Node>
edges: OverlayTable<EdgeId, Edge>
groups: OverlayTable<GroupId, Group>
mindmaps: OverlayTable<MindmapId, MindmapRecord>
```

替换为：

```ts
nodes: DraftRecord<NodeId, Node>
edges: DraftRecord<EdgeId, Edge>
groups: DraftRecord<GroupId, Group>
mindmaps: DraftRecord<MindmapId, MindmapRecord>
```

## 7.2 阶段 2：`canvas.order` 迁到 `DraftList`

```ts
canvasOrder: DraftList<CanvasItemRef>
```

## 7.3 阶段 3：compile 收口到 internal apply

Whiteboard compile 不再依赖 `preview` 名义上的概念。

保留 current document：

- handler 继续只读 `ctx.doc()` / `ctx.tx.read.document.get()`

但 compile runtime 在每轮 intent 后，统一调用 reducer/apply kernel 推进 `workingDoc`。

## 7.4 阶段 4：删除 overlay 与 preview 残留

删除：

```txt
whiteboard/packages/whiteboard-core/src/kernel/overlay.ts
```

同时不再保留任何 public preview 概念。

---

## 8. Dataview 迁移方案

Dataview 要和 compile/apply 收口一起做，不能只迁 draft。

## 8.1 先引入领域 draft 文档

```ts
export interface DataviewDraftDocument {
  root: DraftRoot<DataDoc>

  fields: DraftEntityTable<CustomFieldId, CustomField>
  records: DraftEntityTable<RecordId, DataRecord>
  views: DraftEntityTable<ViewId, View>
  activeViewId: DraftValue<ViewId | undefined> // 若 Phase 1 不单独提供 DraftValue，则由 root field helper 承接
}
```

这里需要明确两点：

- `fields` 只表示 custom fields，不包含 title field 这类 schema 固定字段
- `activeViewId` 是 scalar branch；Phase 1 可先由 root field helper 承接，不强制要求 `shared/draft` 先提供 `DraftValue`

## 8.2 operation handler 改写目标

当前写法：

```txt
read document
build nextDocument
replace(nextDocument)
```

目标写法：

```txt
read draft branch
mutate writable branch
collect inverse
collect trace
```

也就是：

- 不再构造 `nextDocument`
- 不再把 `replace()` 当常规写入口
- 最终统一由 `draft.finish()` 产出 doc

## 8.3 compile 去掉 public preview 依赖

删除：

```ts
operation.preview(...)
```

compile 内部改成直接依赖 apply kernel：

```ts
compile({
  doc,
  intents,
  run,
  apply: (document, operations) => {
    const result = applyOperations(document, operations)
    return result.ok
      ? {
          ok: true,
          doc: result.doc
        }
      : {
          ok: false,
          issue: {
            code: result.error.code,
            message: result.error.message,
            details: result.error.details
          }
        }
  }
})
```

也就是：

- current document 保留
- preview public API 删除
- compile 内部直接 apply

## 8.4 previewOperations 的最终处理

`previewOperations` 不是最终基础设施。

它的真实职责只是 compile 阶段推进 `workingDoc`。

因此最终处理应该是：

- 删除 `operation.preview`
- 删除 `previewOperations.ts`
- 保留 compile 阶段“推进 current document”这件事
- 这件事改由 apply kernel 完成

---

## 9. 明确不做的事

下面这些都不进入第一阶段：

## 9.1 `DraftValue` 不是 Phase 1 必选项

原因：

- `activeViewId` 这类标量字段可以先由 root field helper 承接
- 当前主要复杂度仍在 record / list / entity table
- 不是主要复杂度来源

也就是说：

- 不把 `DraftValue` 放进当前 `shared/draft` 的必选 primitive 集合
- 但如果后续多个 domain 都稳定出现同类 scalar branch，再单独抽 `DraftValue` 也可以

## 9.2 不把 draft 塞回 reducer 核心

原因：

- `shared/reducer` 现在的正确边界是最小 runner
- draft 是数据结构基础设施，不是 reducer 生命周期能力

## 9.3 不保留 public preview

原因：

- preview 是概念泄漏
- 真正需要保留的是 compile 的 current document
- 这件事应该由 internal apply 完成，不该作为外部 API 公开

## 9.4 不保留兼容双轨

原因：

- 目标已经明确：不在乎重构成本，不做兼容

---

## 10. 一起推进的实施顺序

这件事不能拆成“先做 draft，compile 以后再说”。

正确顺序是一起推进：

### Phase 1：`shared/draft` + compile API 收口

同时完成：

- 新增 `shared/draft`
- `shared/mutation.compile` 从 `previewApply` 改成 `apply`
- 删除 public preview 概念
- 落地 `root / record / list / entityTable / path`

新增文件：

```txt
shared/draft/src/root.ts
shared/draft/src/record.ts
shared/draft/src/list.ts
shared/draft/src/entityTable.ts
shared/draft/src/path.ts
shared/draft/src/index.ts
```

同时修改：

```txt
shared/mutation/src/compiler.ts
```

### Phase 2：Whiteboard draft + internal apply 收口

同时完成：

- `OverlayTable` -> `DraftRecord`
- `canvas.order` -> `DraftList`
- compile 通过 reducer/apply 推进 working doc

### Phase 3：Dataview draft + public preview 删除

同时完成：

- Dataview draft 文档落地
- reducer/apply 从 immutable replace 改成 draft mutation
- compile 直接依赖 apply
- 删除 `operation.preview`
- 删除 `previewOperations.ts`

### Phase 4：残留旧写入清理

删除：

- Dataview reducer/apply 对 immutable write helper 的依赖
- Whiteboard overlay 残留
- 所有 public preview 残留

---

## 11. 验收标准

### Foundation 验收

- `shared/draft` 提供 `root / record / list / entityTable / path`
- 未变 branch 引用稳定
- 未变 root 返回 `base`
- `DraftEntityTable.finish()` 未变时返回 `base`

### Compile / Apply 验收

- `shared/mutation.compile` 不再依赖 `previewApply`
- compile 仍然维护 `ctx.doc()` current document
- compile 通过 internal apply 推进 `workingDoc`
- 外部不再暴露 preview

### Whiteboard 验收

- `OverlayTable` 删除
- reducer / compile 同一套 apply 语义

### Dataview 验收

- `nextDocument -> replace()` 不再是 apply 主链
- `operation.preview` 删除
- `previewOperations.ts` 删除
- compile 与 apply 共用同一套 apply kernel

---

## 12. 最终判断

最终方案不是“保留 preview，再额外引入 draft”。

最终方案是：

1. 用 `shared/draft` 统一 draft primitive
2. 把 compile 的 `previewApply` 收口成 `apply`
3. 保留 current document
4. 删除 public preview
5. Whiteboard 与 Dataview 一起迁到这套边界

一句话总结：

> 要统一推进的不是 draft 和 preview。  
> 要统一推进的是：`shared/draft` + compile internal apply + external apply-only API。
