# DATAVIEW Document Value Delta / Source / Store API 长期最优重构方案

## 前提

- 这份文档只讨论长期最优，不讨论兼容和过渡。
- 目标不是继续优化 `applyDocumentValueDelta()` 里的循环细节。
- 目标是把整条链的语言摆正：
  - core commit impact
  - engine public delta
  - runtime source
  - shared store primitive
- 优先级是：
  1. 先修正边界
  2. 再删除 runtime 里的补推逻辑
  3. 最后收敛命名

## 直接结论

### 1. 当前 `DocDelta` 不够

如果 runtime 要继续公开 `document.values` 这个 artifact，那么当前 `DocDelta` 就不够。

原因很直接：

- `DocDelta` 现在只发布：
  - `records`
  - `fields`
  - `views`
  - `meta`
- 它没有发布：
  - `values`

于是 runtime 想维护 `document.values` 时，就只能根据：

- `records.update`
- `records.remove`
- `fields.remove`

自己回推：

- 哪些 `(recordId, fieldId)` value key 该更新
- 哪些 key 该删除

这就是 [createDocumentSource.ts](/Users/realrong/Rostack/dataview/packages/dataview-runtime/src/source/createDocumentSource.ts) 里 `applyDocumentValueDelta()` 现在还在自己收集 id 的根因。

### 2. 当前 source 复杂，不是因为 store 抽象不够，而是因为边界错了

现在 source 层的复杂度主要不是来自：

- `KeyTableStore`
- `ValueId`
- `createSourceTableRuntime`

而是来自：

- engine public delta 没有 value artifact
- runtime source 被迫把 record / field 级 invalidation 再翻译成 value 级 patch

只要这一层不改，对 source 再做抽象化整理，也只是把复杂度挪位置。

### 3. `KeyTableStore` 应该改名，`applyExact()` 也应该改短

我建议改，而且应该一次性改。

原因：

- `KeyTableStore` 这个名字不顺
- `key` 在 `store` 语境里是冗余的
- `applyExact()` 的 `Exact` 也是冗余的
- 这个 primitive 的长期职责已经很清楚，就是“key-addressed table store”

长期最优里，这套 API 应该收敛成更短、更直白的名字。

### 4. `title` 统一进 value 模型，不等于 card UI 要把 title 当普通 property 渲染

这两件事必须分开。

- 底层 document / delta / source / reader 语言里：
  - `title` 应该和其他 field 一样走统一 value 语义
- card UI artifact 里：
  - `title` 仍然应该保留独立 title slot
  - 不应该被塞进 `properties` 列表

也就是说，长期最优不是：

- 继续让 `title` 留在 `record.title` 特判
- 或者反过来把 card 标题强塞进普通 field 列表

而是：

- 底层统一 value 语言
- 上层继续保留 title-first 的 UI artifact

## 当前根因

整条链现在是这样折损信息的。

### 一. operation 层其实拿得到 pair 级 value 变化

底层 [records.ts](/Users/realrong/Rostack/dataview/packages/dataview-core/src/document/records.ts) 的 `writeFieldsWithChanges()` 已经拿到了：

- `recordId`
- `changedFields`

也就是说，真实可用的信息是：

- 哪条 record
- 哪些 field

这已经足够表达 value artifact 变化。

### 二. `CommitImpact` 把它压扁成了全局 field 集合

当前 [executeOperation.ts](/Users/realrong/Rostack/dataview/packages/dataview-core/src/operation/executeOperation.ts) 最后保留下来的是：

- `records.titleChanged?: Set<RecordId>`
- `records.valueChangedFields?: Set<FieldId> | 'all'`

这里已经丢失了最关键的 pair 信息：

- 不是“哪些 field 变了”
- 而是“哪些 record-field pair 变了”

### 三. `projectDocumentDelta()` 又继续压成 record 级 delta

当前 [core/delta.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/core/delta.ts) 的 `projectDocumentDelta()` 最后只投影出：

- `records.update`
- `fields.update/remove`
- `views.update/remove`

这意味着对 runtime 来说，value artifact 根本不存在于 public delta 里。

### 四. runtime source 只能自己补推

于是 [createDocumentSource.ts](/Users/realrong/Rostack/dataview/packages/dataview-runtime/src/source/createDocumentSource.ts) 里 `applyDocumentValueDelta()` 被迫自己做这些事：

- 读 old record
- 读 next record
- 展开 next record 的全部 value entry
- 比较 old/new key 集
- 处理 record remove
- 处理 field remove

这说明复杂度已经越过了 runtime 应有边界。

runtime source 的职责应该是：

- 应用已经成型的 artifact delta

而不是：

- 从更粗的 invalidation 语言里反推出 artifact delta

## 长期最优原则

### 1. public delta 必须直接对齐 published artifact

只要某个 artifact 被 public source 暴露，它就应该拥有自己的 public delta。

如果 `document.values` 是 public source artifact，那么 public delta 里就必须有：

- `doc.values`

而不是让 runtime 再从 `doc.records` 回推。

### 2. `title` 应该在 value 语言里被视为普通 field

长期最优里不应该继续把：

- `titleChanged`
- `valueChangedFields`

拆成两套语言。

`title` 在 value artifact 里就是：

- `fieldId = TITLE_FIELD_ID`

这个规则应该在底层统一，而不是在 runtime/source/model 各自写分支。

### 3. runtime source 只负责 apply，不负责推导

长期最优里，`createDocumentSource.ts` 不应该再维护一套自定义 value 推导逻辑。

最终形态应该是：

- engine 输出 `doc.values` delta
- runtime source 只把 `doc.values` 应到 table store 上

### 4. 共享 store primitive 的名字要反映职责，而不是实现细节

`KeyTableStore` 这个名字的问题不是“技术上错”，而是长期不够顺。

它真正表达的是：

- 这是一个 table-like keyed store
- 它支持 replace / patch / project

在 `store.*` 命名空间里，`key` 已经没有必要重复。

## 最终边界

## 一. `CommitImpact` 最终形态

长期最优不建议继续保留：

- `records.titleChanged`
- `records.valueChangedFields`

建议直接补一层独立的 value impact。

```ts
export interface CommitImpact {
  reset?: true
  records?: {
    inserted?: Set<RecordId>
    removed?: Set<RecordId>
    patched?: Map<RecordId, Set<RecordPatchAspect>>
    touched?: Set<RecordId> | 'all'
    recordSetChanged?: boolean
  }
  values?: {
    touched?: ReadonlyMap<RecordId, ReadonlySet<FieldId>> | 'all'
  }
  fields?: {
    inserted?: Set<CustomFieldId>
    removed?: Set<CustomFieldId>
    schema?: Map<FieldId, Set<FieldSchemaAspect>>
    schemaTouched?: Set<FieldId>
    touched?: Set<FieldId> | 'all'
  }
  views?: {
    inserted?: Set<ViewId>
    removed?: Set<ViewId>
    changed?: Map<ViewId, CommitImpactViewChange>
    touched?: Set<ViewId> | 'all'
  }
  activeView?: {
    before?: ViewId
    after?: ViewId
  }
  external?: {
    versionBumped?: boolean
    source?: string
  }
}
```

这里的关键点：

- `values.touched` 是 pair 级信息
- key 是 `recordId`
- value 是该 record 下变动的 `fieldId` 集合
- `TITLE_FIELD_ID` 直接放进这个集合

这一步完成后：

- engine index 需要的“按 field 聚合”信息可以由 helper 从 `values.touched` 反推
- runtime source 需要的“按 pair 发布”信息也可以直接投影出来

也就是说：

- 底层保留最完整的信息
- 上层按自己需要做只读派生

而不是反过来先压扁，再让 runtime 回补。

## 二. `DocDelta` 最终形态

长期最优里，document public delta 应该和 active delta 一样有自己的 reset 语义。

不建议继续沿用“load / replace 时把所有 collection 都伪装成全量 update”的写法。

最终建议：

```ts
export interface KeyDelta<Key> {
  update?: readonly Key[]
  remove?: readonly Key[]
}

export interface ListedDelta<Key> {
  ids?: true
  update?: readonly Key[]
  remove?: readonly Key[]
}

export interface DocDelta {
  reset?: true
  meta?: true
  records?: ListedDelta<RecordId>
  values?: KeyDelta<ValueRef>
  fields?: ListedDelta<FieldId>
  views?: ListedDelta<ViewId>
}
```

这里有两个关键判断。

### A. `values` 不应该复用 `CollectionDelta`

因为 `document.values` 不是 ordered/listed collection。

它只有：

- key lookup
- update/remove

它没有：

- ids store
- list order

所以 `values` 最好单独用 `KeyDelta<ValueRef>`。

### B. `values` 的 public key 应该继续用 `ValueRef`

我不建议在 public delta 里用 `ValueId`。

原因：

- public source 现在就是 `KeyedReadStore<ValueRef, unknown>`
- `ValueRef` 是结构化坐标
- runtime apply 时可以直接读 snapshot value，不需要 parse id
- clarity 比字符串 key 更高

`ValueId` 仍然可以继续作为 runtime 内部 table key。

## 三. `projectDocumentDelta()` 的最终职责

长期最优里，`projectDocumentDelta()` 应该直接产出 `doc.values`，而不是只产出 `doc.records`。

投影规则应该是：

### 1. `impact.reset`

直接返回：

```ts
{
  reset: true
}
```

不要再伪装成所有 collection 全量 update。

### 2. record field write / clear

从 `impact.values.touched` 遍历 pair：

- next 里还有 value:
  - 放进 `values.update`
- next 里没有 value:
  - 放进 `values.remove`

### 3. record remove

从 previous document 里展开该 record 原有的全部 value ref，放进：

- `values.remove`

### 4. field remove

从 previous document 遍历 record，找到持有该 field value 的 pair，放进：

- `values.remove`

这里即便需要扫一次 previous record table 也是可以接受的。

因为用户目标是：

- 简单
- 正确
- 可维护

而不是为了回避一次线性扫描，继续把复杂度压到 runtime。

## 四. document core helper 必须下沉

当前 `TITLE_FIELD_ID` 的 value 读取逻辑散落在：

- runtime source
- engine active read
- 其他 record/value 读取点

这不对。

长期最优里，这个 helper 应该回到 core document 层。

最终建议至少补齐：

```ts
export const document = {
  values: {
    get(record: DataRecord, fieldId: FieldId): unknown | undefined
    fieldIds(record: DataRecord): readonly FieldId[]
    entries(record: DataRecord): readonly (readonly [FieldId, unknown])[]
  }
}
```

然后再在 `DocumentReader` 上补一层：

```ts
export interface DocumentReader {
  values: {
    get(recordId: RecordId, fieldId: FieldId): unknown | undefined
  }
}
```

这样：

- `title` 作为 value 的规则只定义一次
- `createDocumentSource.ts`
- `active/api/read.ts`
- 未来任何 cell/value 读取点

都不用再手写 `fieldId === TITLE_FIELD_ID ? record.title : record.values[fieldId]`

## 五. card artifact 最终形态

`title` 统一进入 value 模型之后，gallery / kanban card 这条链不应该退化成“title 只是第一条 property”。

当前 [RecordCard.tsx](/Users/realrong/Rostack/dataview/packages/dataview-react/src/views/shared/RecordCard.tsx) 的结构其实是对的：

- title 单独一行
- properties 单独列表

问题不在 UI 结构，而在当前 runtime card model 还在混两种语言：

- title 从 `record.title` 读
- properties 从 `record.values[field.id]` 读
- title 编辑命令却又已经走 `TITLE_FIELD_ID`

这说明：

- 命令路径把 title 当 field
- 读路径却还把 title 当独立存储细节

长期最优里，这种不一致要消失。

### 1. card UI 继续保留 title slot

card 的视觉结构天然就是：

- title
- body properties

这和 document 底层 value 模型是否统一，没有直接冲突。

所以长期最优不建议：

- 把 title 混进 `properties`
- 再让 `RecordCard` 自己猜第一项是标题

这会把正确的 UI artifact 分层打碎。

### 2. card runtime model 要显式区分 title 和 properties

当前 [shared.ts](/Users/realrong/Rostack/dataview/packages/dataview-runtime/src/model/shared.ts) 的 `CardContent` 还是：

```ts
export interface CardContent {
  titleText: string
  placeholderText: string
  properties: readonly CardProperty[]
  hasProperties: boolean
}
```

这会把 title 留成一个“裸字符串”，继续掩盖它其实也是 field value 的事实。

长期最优更建议直接改成：

```ts
export interface CardTitle {
  field: TitleField
  value: string
  placeholderText: string
}

export interface CardProperty {
  field: CustomField
  value: unknown
}

export interface CardContent {
  title: CardTitle
  properties: readonly CardProperty[]
  hasProperties: boolean
}
```

这样可以同时满足两点：

- title 在数据语言里仍然是 field
- title 在 UI artifact 里仍然是独立 title slot

### 3. card 内容读取必须走统一 value reader

长期最优里，card model 不应该再这样读：

- title:
  - `record.title`
- property:
  - `record.values[field.id]`

而应该统一成：

- title:
  - `reader.values.get(recordId, TITLE_FIELD_ID)`
- property:
  - `reader.values.get(recordId, field.id)`

也就是说，card model 不应该知道 `title` 物理上是不是还单独存放在 `record.title`。

如果底层最终仍暂时保留 `record.title`，那也只能是：

- `document.values.get`
- `DocumentReader.values.get`

内部的实现细节。

### 4. `fields` 这个名字会继续制造误导

当前 gallery / kanban card model 里：

- `card.fields`

实际装的是 custom fields，不包含 title。

这在 title 统一 value 语言之后会更别扭，因为调用点会天然以为：

- 既然 title 是 field，为什么 `fields` 里没有 title

长期最优里这里应该直接改名，例如：

- `propertyFields`
- 或者 `bodyFields`

不应该再叫泛泛的 `fields`。

### 5. `EditableCardTitle` 保留，但它应该只依赖 title artifact

当前 [EditableCardTitle.tsx](/Users/realrong/Rostack/dataview/packages/dataview-react/src/views/shared/EditableCardTitle.tsx) 的命令路径本身没有问题：

- 它已经通过 `TITLE_FIELD_ID` 写回 engine

长期最优里要改的是它的输入来源：

- 不再接收一个和 value 模型脱钩的 `titleText: string`
- 而是直接接收 `CardTitle`

例如：

```ts
export interface EditableCardTitleProps {
  viewId: ViewId
  itemId: ItemId
  recordId: RecordId
  title: CardTitle
  wrap?: boolean
  showEditAction?: boolean
}
```

这样 React title 组件就不会继续成为“底层 title 特判语言”的末端。

## 六. runtime source 最终形态

长期最优里，`createDocumentSource.ts` 不该再有一段专门的“value 自己补推 id”逻辑。

它应该退化成：

- reset 时：
  - 从 snapshot 一次性重建 table
- incremental apply 时：
  - 直接应用 `delta.values`

最终 apply 形态应该接近：

```ts
applyKeyDelta({
  delta: input.delta.values,
  table: input.runtime.values.table,
  readValue: ref => input.snapshot.reader.values.get(ref.recordId, ref.fieldId)
})
```

也就是说，长期最优里 runtime source 不再需要：

- `runtime.records`
- `previousRecord`
- `collectValueEntries(nextRecord)`
- `collectValueIds(previousRecord)`
- `field remove -> 遍历 runtime.records.ids 自己删`

这些都应该从 `applyDocumentValueDelta()` 里彻底删除。

### source helper 的最终职责

source 层只需要两种 runtime helper：

```ts
createListedSourceRuntime<Key, Value>()
createMappedTableSourceRuntime<PublicKey, InternalKey, Value>()
```

语义：

- `createListedSourceRuntime`
  - 给 records / fields / views / sections 这种 `ids + keyed source`
- `createMappedTableSourceRuntime`
  - 给 `ValueRef -> ValueId -> value` 这种 public key 和 internal key 不同的 source

不需要再给 source 层引入更大的泛型框架。

## 七. shared store primitive 最终命名

我建议改名，而且要一次性改到位。

最终建议：

```ts
export interface TablePatch<Key, Value> {
  set?: readonly (readonly [Key, Value])[]
  remove?: readonly Key[]
}

export interface TableReadStore<Key, Value> {
  read: {
    get(key: Key): Value | undefined
    has(key: Key): boolean
    all(): ReadonlyMap<Key, Value>
    size(): number
  }
  subscribe: {
    key(key: Key, listener: Listener): Unsubscribe
  }
}

export interface TableStore<Key, Value> extends TableReadStore<Key, Value> {
  write: {
    replace(next: ReadonlyMap<Key, Value>): void
    apply(patch: TablePatch<Key, Value>): void
    clear(): void
  }
  project: {
    field<Projected>(
      select: (value: Value | undefined) => Projected,
      isEqual?: Equality<Projected>
    ): KeyedReadStore<Key, Projected>
  }
}

export const createTableStore: <Key, Value>(options?: {
  initial?: ReadonlyMap<Key, Value>
  isEqual?: Equality<Value>
}) => TableStore<Key, Value>
```

对应重命名：

- `ExactKeyTablePatch` -> `TablePatch`
- `KeyTableReadStore` -> `TableReadStore`
- `KeyTableStore` -> `TableStore`
- `createKeyTableStore` -> `createTableStore`
- `write.applyExact()` -> `write.apply()`

### 为什么这样更好

#### 1. `key` 是冗余的

在 `store.*` 命名空间里，`TableStore<Key, Value>` 已经明确是按 key 读写的 table。

不需要再额外重复一个 `key`。

#### 2. `Exact` 是冗余的

这个 primitive 的 patch 语义本来就应该是 exact apply。

如果未来真的需要：

- merge
- upsert with policy
- lazy fill

那应该加新的显式方法，而不是让默认方法背一个 `Exact` 后缀。

#### 3. `apply()` 比 `applyExact()` 更顺

调用点会直接变成：

```ts
table.write.apply({
  set,
  remove
})
```

这比：

```ts
table.write.applyExact({
  set,
  remove
})
```

更短，也没有语义损失。

## 不建议做的事

- 不建议继续保留 runtime 里的 value key 回推逻辑。
- 不建议为了避免 engine output 多做一点投影，就让 runtime source 绑定 `records + fields + snapshot` 三份上下文。
- 不建议把 `ValueId` 提升成 public delta 语言。
- 不建议为了 source 简化，反过来删掉 `document.values`，再让 table model 自己读整条 record。
- 不建议只改 store 名字，不改 delta 边界。那样只是表面更顺，根因没动。

## 最终实施顺序

### 1. 先补 core value helper

- `document.values.get`
- `document.values.fieldIds`
- `document.values.entries`
- `DocumentReader.values.get`

### 2. 再重写 `CommitImpact`

- 删除 `records.titleChanged`
- 删除 `records.valueChangedFields`
- 改成 `values.touched`

### 3. 再重写 `projectDocumentDelta()`

- 给 `DocDelta` 增加 `reset`
- 给 `DocDelta` 增加 `values`
- 直接投影 value artifact delta

### 4. 最后简化 runtime source

- 删除 `applyDocumentValueDelta()` 里的自定义 collect 逻辑
- 把 `document.values` apply 收敛成简单 table patch
- 清理 `createDocumentSource.ts` 对 `runtime.records` 的 value apply 依赖

### 5. 再收敛 card runtime / react artifact

- `CardContent.titleText` 改成 `CardContent.title`
- card 读取统一走 `DocumentReader.values.get`
- `card.fields` 改成 `card.propertyFields` 或 `card.bodyFields`
- `EditableCardTitle` 改为直接接收 `CardTitle`

### 6. 最后统一 store 命名

- `KeyTableStore` 全量改名为 `TableStore`
- `applyExact()` 全量改名为 `apply()`
- `SourceTableRuntime` / `createSourceTableRuntime` 同步改成对应的新术语

## 最终判断

针对你最开始的两个问题，结论是：

### `applyDocumentValueDelta()` 为什么还要自己收集 id

因为当前 `DocDelta` 不发布 value artifact，而底层 `CommitImpact` 又把 pair 级 value 变化压扁了。

所以 runtime 没有足够信息，只能自己回推。

### source 这里能不能更简单

可以，而且应该更简单。

但前提不是继续在 source 层抽象 helper，而是：

- 让 engine 直接输出 `doc.values` delta
- 让 core 提供统一 value reader
- 让 runtime source 只做 apply

做到这三点之后，`createDocumentSource.ts` 会自然收敛成很薄的一层。

### `title` 统一进 value 模型之后，card 会不会更别扭

不会。真正应该保留的是：

- card UI 里的独立 title slot

真正应该删除的是：

- card 读路径继续直接读 `record.title`
- `card.fields` 这种实际不含 title 的误导命名

长期最优应该是：

- 底层 value 语言统一
- card artifact 继续 `title + properties`
- title 作为 field，通过统一 value reader 供给 card title slot
