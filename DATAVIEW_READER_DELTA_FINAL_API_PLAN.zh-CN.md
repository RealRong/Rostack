# Dataview Reader / Delta 最终 API 设计与实施方案

## 目标

- dataview 只保留一套 authored mutation 协议。
- reader、writer、delta 都从同一份 model 自动生成。
- 不再手写 path 字符串表达 change 协议。
- 所有子集合协议统一为 `ids/byId`，不再混用裸数组与 `EntityTable`。
- 不再并存 `DocumentReader`、`CompileReader`、`DocumentReadContext`、手写 delta facade。
- 不保留兼容层、过渡层、双轨实现，只落长期最优形态。

## 最终结论

dataview 的长期最优形态不是继续维护：

- `dataviewEntities`
- `dataviewMutationRegistry`
- `createDocumentReader()`
- `createDocumentReadContext()`
- `createCompileReader()`
- `DataviewCompileReader`
- `createDataviewMutationDelta()`
- `DataviewMutationDelta` 手写 facade

而是收敛为：

1. 一份 `dataviewMutationModel`
2. 一份自动生成的 `MutationWriter<typeof dataviewMutationModel>`
3. 一份自动生成的 `MutationReader<typeof dataviewMutationModel>`
4. 一份自动生成的 `MutationDeltaOf<typeof dataviewMutationModel>`
5. 一份 dataview 自己的 `createDataviewQuery(reader)`，只承载派生读逻辑
6. compile 侧只保留 `ctx.expect.*`，不再自定义 reader 协议

核心原则只有一句话：

**base mutation 协议由 model 定义，base delta 由 writer / engine 自动产出；任何 dataview 语义聚合都放在 query 或 projection，不再放在 mutation delta facade。**

补充约束：

**凡是需要增删改排、需要 move/splice/insert/delete 的子集合，一律统一成 `ids/byId`；只有纯值载荷数组才保留数组。**

## 最终 API

### 1. 单一事实来源：`dataviewMutationModel`

```ts
export const dataviewMutationModel = defineMutationModel<DataDoc>()({
  document: singleton<DataDoc, DataDoc>()({
    access: documentAccess,
    members: {
      schemaVersion: value<number>(),
      activeViewId: value<ViewId | undefined>(),
      meta: record<DocumentMeta>(),
    },
  }),

  record: tableFamily<DataDoc, RecordId, DataRecord>()({
    access: recordAccess,
    members: {
      title: value<string>(),
      type: value<RecordType>(),
      values: keyed<FieldId, unknown>({ at: 'values' }),
      meta: record<RecordMeta>(),
    },
  }),

  field: tableFamily<DataDoc, FieldId, Field>()({
    access: fieldAccess,
    members: {
      name: value<string>(),
      kind: value<FieldKind>(),
      system: value<boolean>(),
      displayFullUrl: value<boolean>(),
      format: value<string | undefined>(),
      precision: value<number | undefined>(),
      currency: value<string | undefined>(),
      useThousandsSeparator: value<boolean | undefined>(),
      defaultOptionId: value<string | undefined>(),
      displayDateFormat: value<string | undefined>(),
      displayTimeFormat: value<string | undefined>(),
      defaultValueKind: value<string | undefined>(),
      defaultTimezone: value<string | undefined>(),
      multiple: value<boolean | undefined>(),
      accept: value<string | undefined>(),
      meta: record<FieldMeta>(),
    },
    ordered: {
      options: ordered<FieldOptionRef>()({
        read: (document, fieldId) => readFieldOptions(document, fieldId),
        write: (document, fieldId, options) => writeFieldOptions(document, fieldId, options),
        identify: (option) => option.id,
        emits: 'options',
      }),
    },
  }),

  view: tableFamily<DataDoc, ViewId, View>()({
    access: viewAccess,
    members: {
      name: value<string>(),
      type: value<ViewType>(),
      search: record<ViewSearch>(),
      filter: record<ViewFilter>(),
      sort: record<ViewSort>(),
      group: record<ViewGroup | undefined>(),
      display: record<ViewDisplay>(),
      calc: record<ViewCalc>(),
      options: record<ViewOptions>(),
    },
    ordered: {
      order: ordered<ViewOrderEntry>()({
        read: (document, viewId) => readViewOrder(document, viewId),
        write: (document, viewId, order) => writeViewOrder(document, viewId, order),
        identify: (entry) => entry.id,
        emits: 'order',
      }),
      displayFields: ordered<ViewDisplayFieldEntry>()({
        read: (document, viewId) => readViewDisplayFields(document, viewId),
        write: (document, viewId, fields) => writeViewDisplayFields(document, viewId, fields),
        identify: (entry) => entry.id,
        emits: 'order',
      }),
    },
  }),
})
```

约束：

- `dataviewMutationModel` 是唯一 authored mutation 定义。
- `dataviewEntities` 和 `dataviewMutationRegistry` 不再保留为 authored 协议。
- registry、reader、writer、delta 都从 model 编译生成。
- `record.values` 不能再靠 `values.<fieldId>` 这种 path 字符串表达，必须升级为 typed `keyed<FieldId, unknown>` member。
- `field.options`、`view.order`、`view.display.fields` 这种子集合必须统一成 `ids/byId`，不再保留裸数组。
- `view.order`、`field.options`、`view.display.fields` 的 mutation 必须直接建模成 structure，不再在外层写 prefix / path 约定。

### 2. Typed writer

```ts
type DataviewWriter = MutationWriter<typeof dataviewMutationModel>

writer.document.patch({ activeViewId: nextViewId })

writer.record.patch(recordId, { title: 'Next' })
writer.record.values(recordId).set(fieldId, value)
writer.record.values(recordId).remove(fieldId)

writer.field.patch(fieldId, { name: 'Status' })
writer.field.options(fieldId).insert(option, { before: otherOptionId })
writer.field.options(fieldId).move(optionId, { before: otherOptionId })

writer.view.patch(viewId, {
  search: nextSearch,
  filter: nextFilter,
  sort: nextSort,
  group: nextGroup,
  display: nextDisplay,
  calc: nextCalc,
})
writer.view.order(viewId).move(recordId, { before: otherRecordId })
```

约束：

- 业务侧禁止再直接写 `signal({ changes: { ... } })` 表达 dataview base mutation。
- dataview base delta 只能由 typed writer / engine 自动生成。
- projection 自己的 derived delta 仍然允许独立存在，但那已经不是 mutation delta。

### 3. Typed reader

```ts
type DataviewReader = MutationReader<typeof dataviewMutationModel>

reader.document.get()
reader.record.get(recordId)
reader.record.has(recordId)
reader.field.get(fieldId)
reader.view.get(viewId)

reader.field.options(fieldId).items()
reader.view.order(viewId).items()
```

结论：

- `DocumentReader` 没有独立存在价值。
- `DataviewCompileReader` 没有独立存在价值。
- 纯 document 读取由 `MutationReader<typeof dataviewMutationModel>` 统一承担。

### 4. Dataview query

reader 只负责“按 model 读实体 / 读结构”，所有 dataview 派生读逻辑统一进 query：

```ts
const query = createDataviewQuery(reader)

query.view.activeId()
query.view.active()
query.record.normalizeIds(recordIds, validIds?)
query.field.known(fieldId)
```

约束：

- `createDocumentReadContext()` 删除。
- 不再保留“通用大 context 对象”。
- 像 `fieldIds`、`fieldIdSet`、`fieldsById`、`activeView` 这种派生结果，如果需要，放到 `query` 的显式 API 或具体 subsystem 的局部缓存中，不再做第二套 reader 协议。

### 5. Public intent 边界

长期最优设计必须明确区分两层：

1. `MutationWriter<typeof dataviewMutationModel>` 是内部 typed 写接口
2. `engine.execute(intent)` 是外部 public intent 协议

这两层不应该长成同一套 API。

最终要求：

- typed writer 可以保留 `patch()`，因为它是内部强类型 API
- public intent 不保留 generic `patch`
- public intent 不保留 `EditTarget`
- public intent 不保留“单条 / 批量共用一个 target union”的设计

也就是说，内部可以这样写：

```ts
writer.record.patch(recordId, { title, type, meta })
writer.view.patch(viewId, { search, filter, sort, group, display, calc })
writer.field.patch(fieldId, { name, kind })
```

但外部 intent 最终应该是显式语义命令，例如：

```ts
{ type: 'record.title.set', recordId, title }
{ type: 'record.type.set', recordId, recordType }
{ type: 'record.meta.patch', recordId, patch }
{ type: 'record.remove', recordIds }
{ type: 'record.values.writeMany', recordIds, set, clear }

{ type: 'view.search.set', id, search }
{ type: 'view.filter.patch', id, rule, patch }
{ type: 'view.order.splice', id, records, before }
```

结论：

- generic patch 是 writer 级能力，不是 public intent 级能力
- batch 是具体 intent 的领域语义，不是一个公共 `target` 抽象
- compile 只负责把显式 intent lower 到 typed writer，不负责解释一层“通用 target 语言”

### 6. Compile context

compile 不再依赖 compile reader，而是依赖：

```ts
export interface DataviewCompileContext<
  TIntent extends Intent = Intent,
  TOutput = unknown
> extends MutationCompileHandlerInput<
  DataDoc,
  TIntent,
  DataviewWriter,
  TOutput,
  DataviewReader,
  void,
  ValidationCode
> {
  query: DataviewQuery
  expect: {
    record(id: RecordId, at?: string): DataRecord
    field(id: FieldId, at?: string): Field
    view(id: ViewId, at?: string): View
  }
}
```

使用方式：

```ts
const record = ctx.expect.record(recordId, 'recordId')
const field = ctx.expect.field(fieldId, 'fieldId')
const view = ctx.expect.view(viewId, 'id')
```

约束：

- compile diagnostics 仍然可以带 `at`，但这是 compile helper 的职责，不是 reader 的职责。
- `require(id, path?)` 这种 API 从 reader 中删除。
- `EditTarget` 不保留。
- `record.patch` 这种同时支持单条 / 批量 target 的泛化 intent 不保留。
- batch intent 直接使用领域自带输入结构，例如 `record.remove(recordIds)`、`record.values.writeMany(recordIds, set, clear)`。
- recordId 集合的去重、空集拦截、存在性校验属于具体 intent 自己的语义处理，不进入 compile context 公共 API。

### 7. Typed delta

```ts
type DataviewDelta = MutationDeltaOf<typeof dataviewMutationModel>

delta.document.activeViewId.changed()

delta.record.create.changed(recordId)
delta.record.delete.changed(recordId)
delta.record.title.changed(recordId)
delta.record.type.changed(recordId)
delta.record.values.changed(recordId)
delta.record.values.changed(recordId, fieldId)

delta.field.name.changed(fieldId)
delta.field.kind.changed(fieldId)
delta.field.options.changed(fieldId)

delta.view.search.changed(viewId)
delta.view.filter.changed(viewId)
delta.view.sort.changed(viewId)
delta.view.group.changed(viewId)
delta.view.display.changed(viewId)
delta.view.calc.changed(viewId)
delta.view.order.changed(viewId)
```

这里的关键结论：

- base delta 不再保留 `view.query(viewId).changed('search')` 这种手写 aspect facade。
- base delta 不再保留 `field.schema.changed(fieldId)` 这种手写聚合 facade。
- base delta 只暴露 model 原子成员和 structure 的 typed change。
- 更高层语义聚合由 dataview query / projection 自己组合。

例如：

```ts
query.delta.viewQueryChanged(delta, viewId)
// = delta.view.search.changed(viewId)
// || delta.view.filter.changed(viewId)
// || delta.view.sort.changed(viewId)
// || delta.view.group.changed(viewId)
// || delta.view.order.changed(viewId)

query.delta.fieldSchemaChanged(delta, fieldId)
// = delta.field.name.changed(fieldId)
// || delta.field.kind.changed(fieldId)
// || delta.field.options.changed(fieldId)
// || ...
```

这才是 dataview 需要的边界：

- mutation 层负责自动、稳定、typed 地表达 base change
- query / projection 负责解释 dataview 语义

## 必须删除的旧协议

以下内容在最终状态中必须删除：

- `dataview/packages/dataview-core/src/entities.ts`
- `dataviewMutationRegistry`
- `createDocumentReader()`
- `DocumentReader`
- `createDocumentReadContext()`
- `DocumentReadContext`
- `createCompileReader()`
- `DataviewCompileReader`
- `createDataviewMutationDelta()`
- `DataviewMutationDelta` 手写 facade
- `EditTarget`
- `record.patch` 这种 target union intent
- 所有 aggregate 级 public generic patch intent，例如 `record.patch`、`field.patch`、`view.patch`
- 所有 `delta.has('...')`
- 所有 `delta.changed('...', id)`
- 所有 `delta.paths(...)`
- 所有 `values.<fieldId>` 形式的 mutation delta path 解析
- 所有围绕 `view.query`、`field.schema` 的手写聚合 delta 适配层

## 实施阶段

### 阶段 1：建立 dataview mutation model

- 新增 `dataview/packages/dataview-core/src/mutation/model.ts`
- 用 `dataviewMutationModel` 完整接管当前 `dataviewEntities` 与 `dataviewMutationRegistry` 的 authored 定义职责
- 把 `record.values` 升级为 typed keyed member
- 把 `field.options`、`view.order` 升级为 ordered structure

完成标志：

- dataview 的 base mutation 定义只剩 `dataviewMutationModel`

### 阶段 2：补齐 shared mutation model 能力

shared 层必须补齐 dataview 需要的两类能力：

1. keyed member
2. ordered structure 的 typed delta / typed writer / typed reader

完成标志：

- `createMutationWriter()` 能直接写 `record.values(recordId).set(fieldId, value)`
- `createMutationDelta()` 能直接回答 `delta.record.values.changed(recordId, fieldId)`
- `createMutationDelta()` 能直接回答 `delta.view.order.changed(viewId)`、`delta.field.options.changed(fieldId)`

### 阶段 3：reader 全量切换

- 全部 document 读取切到 `createMutationReader(dataviewMutationModel, readDocument)`
- 新增 `createDataviewQuery(reader)`
- 删除 `createDocumentReader()` 与 `createDocumentReadContext()`
- 所有 `active`、`projection`、`api/context`、`compile` 使用方改为 `reader + query`

完成标志：

- repo 内不再引用 `DocumentReader`、`DocumentReadContext`

### 阶段 4：compile 全量切换

- compile context 改为 `reader + query + expect`
- 删除 `DataviewCompileReader`
- 删除 `createCompileReader()`
- 删除 `EditTarget`
- 删除 `record.patch`
- 删除所有 aggregate 级 public generic patch intent，改成显式语义 intent
- 所有 compile handler 改为通过 `ctx.expect.*` 做单实体校验；批量 intent 在各自 handler 内按自身语义校验输入

完成标志：

- repo 内不再引用 `DataviewCompileReader`
- reader 中不再存在 `require(..., path?)`
- repo 内不再存在 `EditTarget`
- repo 内不再存在 `record.patch`
- repo 内不再存在 aggregate 级 public generic patch intent

### 阶段 5：engine / projection / active 全量切换到 typed base delta

- engine commit 直接携带 `MutationDeltaOf<typeof dataviewMutationModel>`
- projection、active、index runtime 全部直接消费 typed base delta
- `view.query`、`field.schema`、`recordSetChanged` 这类语义聚合改成 query / projection 层显式组合

完成标志：

- repo 内不再引用 `createDataviewMutationDelta()`
- repo 内不再出现 `delta.has('...')`、`delta.paths(...)`

### 阶段 6：删除第二套实现

- 删除 `entities.ts`
- 删除 registry authored 定义
- 删除 document reader / compile reader
- 删除 handwritten delta facade
- 删除所有依赖旧 facade 的测试和适配代码，并改为新 API 测试

完成标志：

- dataview 代码库中只存在一套 mutation reader / writer / delta 协议

## 验收标准

- dataview 只有一份 authored mutation 定义：`dataviewMutationModel`
- dataview 只有一套 base reader：`MutationReader<typeof dataviewMutationModel>`
- dataview 只有一套 base delta：`MutationDeltaOf<typeof dataviewMutationModel>`
- compile 不再维护专用 reader 类型
- compile context 不再暴露 `resolveTarget` / `recordIds` 这类批量通用 helper
- public intent 不再暴露 aggregate 级 generic patch / target union
- engine 不再维护手写 delta facade
- `record.values` 的 field 粒度变更不再依赖 path 字符串解析
- `view.query` / `field.schema` 不再是 mutation 层手写 facade，而是 query / projection 层显式组合
- repo 内不再存在 `DocumentReader`、`DataviewCompileReader`、`DataviewMutationDelta` 这三套并行协议
