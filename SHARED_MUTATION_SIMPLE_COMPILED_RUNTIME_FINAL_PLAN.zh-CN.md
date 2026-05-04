# shared/mutation 简化编译式运行时最终方案

## 目标

`shared/mutation` 最终只保留一套长期最优实现：

- schema 一处定义
- 自动得到 typed reader / writer / change
- mutation writer 产出 canonical writes
- engine 基于 writes apply / inverse / history / collab
- projection / domain pipeline 只消费扩展后的 typed `frame.change`

实现时必须先清空旧实现，再写新实现。不要兼容旧调用方式，不要过渡层，不要 adapter，不要为了旧测试保留第二套协议。

## 硬性约束

1. 不保留 path 协议。
2. 不保留 `delta.changes[...]` 协议。
3. 不保留 footprint。
4. 不保留 mutation registry / schema handle / entity registry 风格的第二套命名系统。
5. 不保留 `readOwnerValue` / `writeOwnerValue` / `readAtPath` / `writeAtPath` 这类运行时解释式 owner 回写模型。
6. 不保留字符串 scope 热路径协议，例如 `scopeTargetId()` / `readOwnerTargetId()` / `readCurrentTargetId()`。
7. 不保留 eager `createShapeDelta()`。
8. 不保留 runtime 每次递归解释 schema 的实现方式。
9. 不保留 `frame.changes` 第二入口。
10. 不保留 `query.changes(change)` 业务聚合入口。
11. 不为了调用方迁移保留兼容层。调用方必须一次性改到新 API。

## 最终 API

### Schema

schema 只描述 document shape，不暴露 registry / path / handle：

```ts
const schema = mutation.schema({
  activeViewId: field<string | undefined>(),
  records: table({
    title: field<string>(),
    values: dictionary<string, unknown>()
  }),
  views: table({
    name: field<string>(),
    fields: sequence<string>(),
    order: sequence<string>()
  })
})
```

节点只保留必要种类：

- `field<T>()`
- `optional(node)`
- `table(shape)`
- `map(shape)`
- `sequence<T>(config?)`
- `dictionary<TKey, TValue>()`
- `tree<TNodeId, TValue>()`
- `object(shape)` 如无必要可不暴露，优先普通嵌套 object shape

`MutationDocument<typeof schema>` 必须直接等于业务 document 形态。不能再靠 `as unknown as` 桥接。

### Reader

reader 是 typed facade：

```ts
const read = mutation.reader(schema, document)

read.activeViewId()
read.records.ids()
read.records(recordId).title()
read.records(recordId).values.get(fieldId)
read.views(viewId).fields.items()
read.views(viewId).order.items()
```

reader 不暴露 path，不暴露 node meta，不暴露 owner。

### Writer

writer 是 typed facade，唯一输出是 writes：

```ts
const writes: MutationWrite[] = []
const write = mutation.writer(schema, writes)

write.records.create(recordId, record)
write.records(recordId).title.set('Task')
write.records(recordId).values.set(fieldId, value)
write.views(viewId).order.replace(recordIds)
```

writer 不需要 `emit`，typed writer 自身已经携带 schema 类型。所有 writes 都必须由 writer 生成，业务层不手写 node/path/scope。

### Change

统一命名为 `change`，`delta` 只作为历史兼容概念从代码中删除。对外可以按包语义保留类型别名时也必须最终改名为 `MutationChange`。

```ts
const change = mutation.change(schema, writes)

change.reset()
change.writes()
change.activeViewId.changed()
change.records.created(recordId)
change.records(recordId).title.changed()
change.records(recordId).values.changed(fieldId)
change.views(viewId).order.changed()
```

change facade 必须 lazy + memoized。禁止创建时递归铺满整棵 shape。

### Query / Frame Change

query 是业务读模型的入口。业务聚合变化不再作为 `frame.changes` 第二入口存在，而是扩展到 `frame.change`：

```ts
const query = createDataviewQuery(document)
const baseChange = commit.change
const frame = createDataviewFrame({
  document,
  query,
  change: createDataviewChange(query, baseChange)
})

frame.change.views(viewId).fields.changed()
frame.change.view.layoutChanged(viewId)
```

shared/mutation 只生成 schema-level base change：

```ts
type DataviewBaseChange = MutationChange<typeof dataviewMutationSchema>
```

dataview / whiteboard 在 frame 边界生成 domain-extended change：

```ts
type DataviewChange =
  DataviewBaseChange & {
    record: {
      touchedIds(): readonly string[]
      values: {
        touchedFieldIds(recordId?: string): readonly string[]
      }
    }
    field: {
      schemaTouchedIds(): readonly string[]
    }
    view: {
      queryChanged(viewId: string, aspect?: DataviewViewQueryAspect): boolean
      layoutChanged(viewId: string): boolean
    }
  }
```

`createDataviewChange(query, baseChange)` / `createWhiteboardChange(query, baseChange)` 是 frame 创建边界内部函数，不是 query 方法，不是 pipeline API。业务侧永远只读 `frame.change`。

禁止：

```ts
input.delta.changes['record.values']
input.query.delta.recordSetChanged(input.delta)
input.delta.preview.document.edgeGuide.changed()
input.query.changes(input.change).viewLayoutChanged(viewId)
frame.changes.view.layoutChanged(viewId)
```

标准形态：

```ts
frame.change
```

`frame.change` 同时包含两类能力：

- schema-level typed change：由 shared/mutation 根据 schema 自动生成
- domain aggregate change：由业务包在 frame 边界扩展

命名规则：

- schema-level change 保持 document shape 的复数顶层名，例如 `records` / `fields` / `views`
- domain aggregate change 使用业务语义单数名，例如 `record` / `field` / `view`
- 扩展 key 不得和 schema 顶层 key 冲突
- 如果冲突，frame 创建阶段直接失败，不允许覆盖 schema-level change

`frame.change` 是 active pipeline / projection / index / plan 的唯一变化入口。frame 创建后，后续阶段禁止创建新的 domain change facade。

## 内部架构

### 1. Compile Once Schema

schema 创建时立即编译成 `CompiledSchema`，运行时只读 compiled plan。

```ts
type CompiledSchema = {
  root: CompiledObject
  nodes: readonly CompiledNode[]
}
```

每个 node 编译出：

- 稳定 `nodeId: number`
- `kind`
- `owner`
- entity 边界
- typed facade factory
- reader accessor
- writer target
- change index key
- apply writer

运行时禁止通过 `getNodeMeta(path)` 解释 shape。

### 2. No Path Protocol

path 最多只能作为 compile 阶段内部生成 accessor 的输入。运行时不能把 path 当协议。

删除：

- `MutationNodeMeta.path`
- `MutationNodeMeta.relativePath`
- `readAtPath`
- `writeAtPath`
- 所有外部 path string consumer

替代方案：

- compiled accessor 直接持有读写函数
- typed reader / writer / change 只通过 node plan 工作

### 3. Structured Scope

删除字符串 `targetId` scope 拼接协议。

旧形态：

```ts
targetId = "parent\u001fchild"
```

新形态：

```ts
type MutationScope = readonly string[]
```

或者在 write 中拆成结构化字段：

```ts
type EntityTarget = {
  scope: readonly string[]
  id: string
}
```

热路径不得 `split()` / `join()`。如果外部持久化需要序列化 scope，只在边界序列化。

### 4. Canonical Writes

`MutationWrite` 是 mutation 的唯一事实源：

```ts
type MutationWrite =
  | { kind: 'field.set'; nodeId: number; target?: EntityTarget; value: unknown }
  | { kind: 'dictionary.set'; nodeId: number; target?: EntityTarget; key: string; value: unknown }
  | { kind: 'dictionary.delete'; nodeId: number; target?: EntityTarget; key: string }
  | { kind: 'dictionary.replace'; nodeId: number; target?: EntityTarget; value: Record<string, unknown> }
  | { kind: 'entity.create'; nodeId: number; target: EntityTarget; value: unknown; anchor?: SequenceAnchor }
  | { kind: 'entity.replace'; nodeId: number; target: EntityTarget; value: unknown }
  | { kind: 'entity.remove'; nodeId: number; target: EntityTarget }
  | { kind: 'entity.move'; nodeId: number; target: EntityTarget; anchor?: SequenceAnchor }
  | { kind: 'sequence.insert'; nodeId: number; target?: EntityTarget; value: unknown; anchor?: SequenceAnchor }
  | { kind: 'sequence.move'; nodeId: number; target?: EntityTarget; value: unknown; anchor?: SequenceAnchor }
  | { kind: 'sequence.remove'; nodeId: number; target?: EntityTarget; value: unknown }
  | { kind: 'sequence.replace'; nodeId: number; target?: EntityTarget; value: readonly unknown[] }
  | { kind: 'tree.insert'; nodeId: number; target?: EntityTarget; treeNodeId: string; value: unknown }
  | { kind: 'tree.move'; nodeId: number; target?: EntityTarget; treeNodeId: string; value: unknown }
  | { kind: 'tree.remove'; nodeId: number; target?: EntityTarget; treeNodeId: string }
  | { kind: 'tree.patch'; nodeId: number; target?: EntityTarget; treeNodeId: string; value: Record<string, unknown> }
  | { kind: 'tree.replace'; nodeId: number; target?: EntityTarget; value: unknown }
```

write 中不再直接保存 schema node object。运行时通过 `nodeId` 找 compiled node。

### 5. Lazy COW Apply

apply 必须使用 commit-local lazy copy-on-write。

禁止旧模型：

```ts
writes.reduce((document, write) => applyOneImmutable(document, write), document)
```

新模型：

```ts
const draft = createCowDraft(document, compiled)

for (const write of writes) {
  applyWriteToDraft(draft, write)
}

const nextDocument = finalizeCowDraft(draft)
```

核心要求：

- 同一 commit 内，同一 object / table / map / entity 只 shallow copy 一次。
- 未触达分支保持原引用。
- 多条 writes 修改同一 entity 时复用同一个 writable entity draft。
- apply 不走 `writeOwnerValue()` 递归回写。
- table/map/sequence/tree 有专门 apply writer。

### 6. Inverse

inverse 继续保留，不能改成整文档快照。

inverse 生成必须和 lazy COW apply 共用读取逻辑：

```ts
const inverse = buildInverse(compiled, document, writes)
const nextDocument = applyWrites(compiled, document, writes)
```

或者在 COW apply 过程中按 write 读取 before 值生成 inverse。只允许一套实现，不允许 inverse 另写一套 path 解释器。

### 7. Change Index

change 构建只扫描 writes 一次：

```ts
type ChangeIndex = {
  reset: boolean
  writes: readonly MutationWrite[]
  nodeChanged: BitSet
  targetChanged: Map<number, Set<string> | 'all'>
  entityCreated: Map<number, Set<string>>
  entityRemoved: Map<number, Set<string>>
  dictionaryKeys: Map<number, Map<string, Set<string> | 'all'>>
  sequenceItems: Map<number, Map<string, Set<string> | 'all'>>
  treeNodes: Map<number, Map<string, Set<string> | 'all'>>
}
```

`changed()` / `touchedIds()` / `contains()` 全部读 index。禁止热路径 `writes.some(...)`。

### 8. Facade Generation

reader / writer / change facade 都从 compiled schema plan 生成。

必须共享同一套 compiled node tree：

- reader facade 读 document
- writer facade 产 writes
- change facade 读 change index

禁止三套各自递归解释 schema。

### 9. Domain Extended Change

业务聚合变化必须扩展到 `frame.change`，不再保留独立的 `frame.changes` / `DomainChanges` 入口：

```ts
type DataviewChange =
  MutationChange<typeof dataviewMutationSchema> &
  DataviewChangeExtension

type WhiteboardChange =
  MutationChange<typeof whiteboardMutationSchema> &
  WhiteboardChangeExtension
```

业务包提供 frame 边界 factory：

```ts
function createDataviewChange(
  query: DataviewQuery,
  base: MutationChange<typeof dataviewMutationSchema>
): DataviewChange {
  return extendMutationChange(base, createDataviewChangeExtension(query, base))
}
```

实现要求：

- `extendMutationChange()` 只做浅层 facade 合成，不复制 base change index。
- domain aggregate 方法内部 lazy + memoized。
- 同一个 frame 内只创建一次 extended change。
- pipeline 阶段只使用 `frame.change`。
- plan / index / projection / trace 不得重新创建 domain change facade。
- 扩展 key 必须和 schema 顶层 key 做冲突检查。

推荐 frame 结构：

```ts
type MutationFrame<Query, Change> = {
  document: Document
  query: Query
  change: Change
}
```

frame 创建时唯一允许扩展 change：

```ts
const frame = {
  document,
  query,
  change: createDataviewChange(query, commit.change)
}
```

## Engine

`MutationEngine` 只接受：

```ts
createMutationEngine({
  schema,
  document,
  normalize,
  compile,
  services,
  history
})
```

不需要：

- `createReader`
- `createWriter`
- mutation registry
- delta schema
- operation system
- reducer system
- metadata
- footprint
- path hooks

commit：

```ts
type MutationCommit<Schema> = {
  kind: 'apply' | 'replace'
  origin: MutationOrigin
  document: MutationDocument<Schema>
  writes: readonly MutationWrite[]
  inverse: readonly MutationWrite[]
  change: MutationChange<Schema>
}
```

`replace` 使用 reset change。`apply` 不 normalize applied document。normalize 只允许在 engine boot / explicit replace 边界使用，后续如果 document shape 完全稳定，也可以继续评估删除。

## 删除清单

实现前先删除旧主体文件，再补新实现。

必须删除或重写：

- `shared/mutation/src/internal/state.ts`
- `shared/mutation/src/internal/apply.ts`
- `shared/mutation/src/internal/inverse.ts`
- `shared/mutation/src/delta/createDelta.ts`
- `shared/mutation/src/query/createQuery.ts`
- `shared/mutation/src/reader/createReader.ts`
- `shared/mutation/src/writer/createWriter.ts`
- `shared/mutation/src/schema/meta.ts`
- `shared/mutation/src/schema/internals.ts` 中 path / registry / access override 相关内容

必须清除的符号：

- `MutationDelta`
- `createMutationDelta`
- `createMutationResetDelta`
- `MutationDeltaSource`
- `mergeMutationDeltas`
- `readOwnerValue`
- `writeOwnerValue`
- `readAtPath`
- `writeAtPath`
- `scopeTargetId`
- `readOwnerTargetId`
- `readCurrentTargetId`
- `targetIdToScope`
- `scopeToTargetId`

如短期类型名必须保留给包内引用，允许只在同一提交内替换完再删除，不允许合入兼容 alias。

## 业务侧迁移规则

dataview / whiteboard 必须一次性改完：

- `delta` 统一改名为 `change`
- `frame.change` 是唯一变化入口
- 删除 `frame.changes`
- 删除 `query.changes(change)`
- projection frame 只暴露 `frame.change`
- active pipeline / projection / index / plan 只读 `frame.change`
- 禁止在 frame 创建之后再次扩展 change
- 测试不得自造 `{ changes: ... }`
- 测试不得读取 `delta.changes[...]`
- 不得手写 path 字符串表达 mutation target
- 不得 `as unknown as MutationDocument`

dataview：

- `DataviewMutationDelta` 改为 `DataviewMutationChange`
- 删除 `createDataviewChanges(raw, query, delta)` / `createDataviewChanges(query, change)`
- 新增 `createDataviewChange(query, baseChange)`
- active/index/plan 全部复用 `frame.change`，不重复构造
- `createDataviewFrame()` 是 active pipeline 内唯一允许调用 `createDataviewChange()` 的位置

whiteboard：

- `WhiteboardMutationDelta` 改为 `WhiteboardMutationChange`
- editor scene 的 document delta 全部改为 document change
- projection 内部自定义 delta 保留为 projection delta，但不得混同 mutation change
- 新增 `createWhiteboardChange(query, baseChange)`
- whiteboard projection / editor scene / engine pipeline 只读 `frame.change`

## 实施阶段

### Phase 1: 清空 shared/mutation 旧主体

删除旧 path/owner/delta/apply/writer/reader 实现。保留 public export 空壳只为下一步补新实现，不能留下兼容行为。

完成标准：

- `writeOwnerValue` 不存在
- `createShapeDelta` 不存在
- `delta.changes` 不存在
- `MutationDelta` 不存在

### Phase 2: 编译 schema plan

实现 `CompiledSchema`。

完成标准：

- 每个 node 有稳定 `nodeId`
- reader/writer/change/apply 都只接收 compiled node
- runtime 不再读 path meta

### Phase 3: typed reader / writer

基于 compiled plan 实现 typed facade。

完成标准：

- 业务 writer 不手写 write
- reader/writer facade 类型从 schema 自动推导
- 无 `as unknown as` 文档桥接

### Phase 4: lazy COW apply + inverse

实现 commit-local lazy COW。

完成标准：

- 同一 commit 内相同 object 只 copy 一次
- inverse 与 apply 共用 compiled accessor
- history undo/redo 仍基于 inverse writes

### Phase 5: indexed change facade

实现 `MutationChange`。

完成标准：

- change 构建只扫描 writes 一次
- facade lazy + memoized
- changed/touched 不线性扫 writes

### Phase 6: engine 切换

engine commit 改为 `change`。

完成标准：

- apply 不 normalize
- commit 不暴露 delta
- history / subscribe / watch 全部走新 change

### Phase 7: dataview / whiteboard 全量替换

一次性替换所有调用方。

完成标准：

- `rg "MutationDelta|createMutationDelta|delta\\.changes|footprint|writeOwnerValue|readAtPath|scopeTargetId"` 无业务残留
- `rg "query\\.changes\\(|frame\\.changes" dataview whiteboard` 无业务残留
- `rg "createDataviewChange\\(|createWhiteboardChange\\(" dataview whiteboard` 只能出现在 frame 创建边界和 change 实现内部
- dataview / whiteboard typecheck 通过
- 相关 projection / engine 测试通过

## 性能完成标准

1. 小写入不递归构造整棵 reader/writer/change tree。
2. 一轮 commit 修改同一 entity 多个字段时，entity / byId / table 只 copy 一次。
3. change 查询不扫 writes。
4. target scope 不 split/join。
5. projection active pipeline 不重复扩展 domain change。
6. apply / inverse / change 都基于 compiled schema plan。
7. frame 内同一个 base change 只扩展一次。
8. pipeline 消费 `frame.change`，不重复创建 domain change facade。

## 最终判断

长期最优不是放弃 schema 驱动，而是删除解释式 runtime。

最终形态是：

```txt
shape-first schema
  -> compile once schema plan
  -> typed reader / writer / change facade
  -> canonical writes
  -> lazy COW apply + inverse
  -> indexed change
  -> domain-extended frame.change
```

这是一套实现，不保留第二套协议。
