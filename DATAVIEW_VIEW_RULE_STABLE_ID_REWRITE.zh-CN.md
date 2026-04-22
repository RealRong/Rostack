# DATAVIEW View Rule Stable ID Rewrite

## 1. 结论

是的，`sort` / `filter` 需要稳定 id。

而且这件事不能只停在 React key 层，也不能只在 engine publish/runtime projection 临时补一个 id。  
长期最优必须是：

- stable id 直接进入 `View` 的底层持久化模型
- engine / runtime / React 全链路都以 rule 的稳定 `id` 为准
- 所有 index-based 的 rule route / mutation / row lookup 全部删除

当前 `dataview` 里，真正缺少 stable id 的核心可编辑数组，主要就是这两类：

- `view.filter.rules`
- `view.sort`

其他很多数组其实已经有内建 identity，或者本身只是标量列表，不需要再额外发明一层 id。

## 2. 当前问题不在 React，而在底层模型

现在这条链的问题是统一的。

### 2.1 core state 没有稳定 id

当前底层模型里：

- [FilterRule](/Users/realrong/Rostack/dataview/packages/dataview-core/src/contracts/state.ts#L216) 没有 `id`
- [Sorter](/Users/realrong/Rostack/dataview/packages/dataview-core/src/contracts/state.ts#L244) 没有 `id`
- `View.sort` 甚至还是裸数组，不像 `filter` 一样有一个明确容器对象

这意味着：

- rule identity 只能靠 `index`
- 或者靠 `fieldId` 这种“伪 identity”

这两个都不对。

### 2.2 engine API 仍然按 index 操作 rule

[active/api/query.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/active/api/query.ts) 里：

- `filters.update(index, rule)`
- `filters.setPreset(index, presetId)`
- `filters.setValue(index, value)`
- `filters.remove(index)`
- `sort.replace(index, sorter)`
- `sort.remove(index)`
- `sort.move(from, to)`

这些 API 本质上是在说：

- public mutation target 不是“某条 rule”
- 而是“当前数组第 N 项”

这在协作、重排、异步 UI route 里都不稳。

### 2.3 runtime session route 仍然按 index 记 filter

[session/page.ts](/Users/realrong/Rostack/dataview/packages/dataview-runtime/src/session/page.ts) 里：

- `QueryBarEntry.filter` 现在是 `{ kind: 'filter', index: number }`
- route normalize 也是 `activeView.filter.rules[route.index]`

这会导致：

- 只要前面插入/删除一条 filter
- 当前打开的 popover 就可能指向错的 rule

### 2.4 React 已经开始暴露这个问题了

现在 React 里已经有两个很明显的“补丁式信号”：

- [sortUi.ts](/Users/realrong/Rostack/dataview/packages/dataview-react/src/page/features/sort/sortUi.ts) 还在自己拼 `sorter_${index}`
- [ViewQueryBar.tsx](/Users/realrong/Rostack/dataview/packages/dataview-react/src/page/features/viewQuery/ViewQueryBar.tsx) 里 filter key 是 ``filter_${entry.rule.fieldId}_${index}``

这类代码不是“局部实现丑一点”，而是在说明：

- 底层没有真正可用的 rule identity

### 2.5 “创建后打开刚创建项”现在靠长度猜

这条链也很脆弱：

- [ViewQueryBar.tsx](/Users/realrong/Rostack/dataview/packages/dataview-react/src/page/features/viewQuery/ViewQueryBar.tsx)
- [QueryActions.tsx](/Users/realrong/Rostack/dataview/packages/dataview-react/src/page/toolbar/QueryActions.tsx)
- [ColumnHeader.tsx](/Users/realrong/Rostack/dataview/packages/dataview-react/src/views/table/components/column/ColumnHeader.tsx)
- [QueryFieldPickerPanel.tsx](/Users/realrong/Rostack/dataview/packages/dataview-react/src/page/features/viewSettings/panels/QueryFieldPickerPanel.tsx)

它们现在都是：

- 先 `create(fieldId)`
- 再用 `filters.length` 或当前 index 猜“新 rule 在哪”

这说明 create API 本身没有返回稳定 target。

## 3. 为什么 React 自己拼 key 不够

只在 React 层做：

- `key={rule.fieldId}`
- `key={fieldId + index}`
- `getItemId={() => index}`

只能解决 render key 的一小部分问题，解决不了下面这些真正的边界问题：

- mutation target 不稳
- route 不稳
- reorder 后 editor 绑定对象漂移
- future collaboration 无法精确 rebasing

最典型的例子：

1. 用户 A 正在编辑第 2 条 filter 的值
2. 用户 B 删除了第 1 条 filter
3. A 继续发送 `setValue(index = 1, value)`

此时：

- index 语义已经变了
- A 修改的可能是错的 rule
- 或者直接 no-op

如果 target 是 rule 自身的稳定 `id`，这个问题天然不存在。

所以这件事的正确解法只有一个：

- 把 stable id 放进 core state

## 4. 长期最优的最终模型

## 4.1 filter rule 必须是 document-stable entity

最终应该改成：

```ts
export type ViewFilterRuleId = string & {
  readonly __brand: 'ViewFilterRuleId'
}

export interface FilterRule {
  id: ViewFilterRuleId
  fieldId: FieldId
  presetId: FilterPresetId
  value?: FilterValue
}

export interface Filter {
  mode: 'and' | 'or'
  rules: EntityTable<ViewFilterRuleId, FilterRule>
}
```

这里的关键点是：

- `id` 是 rule identity
- `fieldId` 只是 rule payload

也就是说：

- rule 不再靠 `fieldId` 当 identity
- 是否允许同一 field 出现多条 filter，以后可以是产品策略，而不是数据模型被迫限制

## 4.2 sort 应该一起收敛，不建议继续保留 `Sorter`

长期最优我不建议继续保留 `Sorter` 这个名字。

因为一旦它变成：

- 持久化
- 可编辑
- 可移动
- 需要 stable id

它本质上就是 rule，不再只是一个“排序描述片段”。

最终更合理的模型应该是：

```ts
export type ViewSortRuleId = string & {
  readonly __brand: 'ViewSortRuleId'
}

export interface SortRule {
  id: ViewSortRuleId
  field: FieldId
  direction: SortDirection
}

export interface Sort {
  rules: EntityTable<ViewSortRuleId, SortRule>
}
```

然后 `View` 也一起变成：

```ts
export interface View {
  id: ViewId
  type: ViewType
  name: string
  search: Search
  filter: Filter
  sort: Sort
  group?: ViewGroup
  calc: ViewCalc
  display: ViewDisplay
  options: ViewOptions
  orders: RecordId[]
}
```

这比现在的：

- `filter: { rules: [...] }`
- `sort: Sorter[]`

要协调得多。

但如果 rule 已经是有稳定 `id` 的 embedded entity，底层继续保留数组并不是最终最优。

长期最优里：

- `filter.rules` 不应该再是 `FilterRule[]`
- `sort.rules` 不应该再是 `SortRule[]`
- 它们都应该直接采用 `byId + order` 的 `EntityTable`

原因很直接：

- public API 已经按 `id` 操作 rule
- 如果底层还是数组，内部就还得反复做 `id -> index`
- `move/remove/patch` 仍然会残留 index 思维
- `fieldId` 很容易又被偷偷当回“伪 identity”

而 `EntityTable` 其实不是新模型。  
当前 document 顶层的：

- `records`
- `fields`
- `views`

已经都在用同样的 `byId + order` 形态。

所以长期最优不是“顶层实体用 `EntityTable`，嵌套 rule 继续用数组”，而是：

- 只要它是有稳定 `id`、可 patch、可 remove、可 reorder 的 entity
- 就统一进入 `EntityTable`

## 4.3 `EntityTable` 应下沉到 `shared/core`

一旦 `EntityTable` 不只服务 document 顶层实体，而是也开始服务 `View.filter.rules` / `View.sort.rules`，它就已经不是 dataview document 专属概念了。

当前放置位置：

- `EntityTable` 类型在 `dataview-core/contracts/state.ts`
- 通用读写工具在 `dataview-core/document/table.ts`

这个归属已经不太对。

长期最优应该拆成两层：

### shared/core

放真正通用的“有序实体表” primitive，例如：

```ts
export interface EntityTable<TId extends string, TEntity extends { id: TId }> {
  byId: Record<TId, TEntity>
  order: TId[]
}

export const entityTable = {
  access,
  clone,
  normalize,
  read,
  write,
  overlay,
  patch
} as const
```

这一层只关心：

- `byId + order`
- ordered access
- generic clone / normalize / put / patch / remove
- generic patch merge

它不应该依赖：

- `DataDoc`
- `DataRecord`
- `fields / records / views` 这种 dataview 文档语义

### dataview-core

只保留 dataview 自己的 document adapter，例如：

- `replace(document, 'fields' | 'records' | 'views', table)`
- `document.fields.*`
- `document.records.*`
- `document.views.*`

也就是说：

- `document/table.ts` 不应该继续同时承担“generic ordered entity table”和“dataview document adapter”两种职责
- 应该把 generic 部分下沉到 `shared/core`
- dataview-core 只保留 document 语义那一薄层

这也和现有 [shared/core/collection.ts](/Users/realrong/Rostack/shared/core/src/collection.ts#L1) 的方向一致。  
`EntityTable` 本质上就是建立在 ordered collection 之上的更高一层泛型基础设施，放在 `shared/core` 比放在 `dataview-core/document` 更自然。

## 4.4 engine projection 应直接带 rule id

当前 [contracts/view.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/contracts/view.ts) 里的 projection 也要一起收敛。

最终建议：

```ts
export interface FilterRuleProjection {
  rule: FilterRule
  field?: Field
  fieldMissing: boolean
  activePresetId: FilterPresetId
  effective: boolean
  editorKind: FilterEditorKind
  value: FilterValuePreview
  bodyLayout: 'none' | 'inset' | 'flush'
  conditions: readonly FilterConditionProjection[]
}

export interface SortRuleProjection {
  rule: SortRule
  field?: Field
}
```

也就是说：

- `FilterRuleProjection.rule.id` 直接就是 public stable id
- `SortRuleProjection.rule.id` 直接就是 public stable id

不再保留现在这种：

- `FilterRuleProjection.rule`
- `SortRuleProjection.sorter`

语言不对称的形态。

## 5. 从 engine 到 runtime 的最终 API

## 5.1 ActiveViewApi 不再接受 index

长期最优下，engine active API 应该直接改成稳定 `id` 语义。

这里命名也应该一起收敛：

- 类型名保留强语义：`ViewFilterRuleId`、`ViewSortRuleId`
- rule 实体字段统一叫 `id`
- rule-scope API 参数统一短名 `id`
- 只有脱离 rule 作用域、进入混合上下文时，才写更长的前缀名

同时行为约束也应该明确：

- `create()` 成功就必须返回新建 rule 的 `id`
- `create()` 不允许 silent no-op
- 同一 view 内重复 `fieldId` 创建 filter / sort，直接报错
- React 可以提前禁用重复选项，但 engine 必须自己维护这个不变量

### filter

```ts
filters: {
  create: (fieldId: FieldId) => ViewFilterRuleId
  patch: (
    id: ViewFilterRuleId,
    patch: Partial<Pick<FilterRule, 'fieldId' | 'presetId' | 'value'>>
  ) => void
  remove: (id: ViewFilterRuleId) => void
  clear: () => void
  setMode: (mode: Filter['mode']) => void
}
```

### sort

```ts
sort: {
  create: (
    fieldId: FieldId,
    direction?: SortDirection
  ) => ViewSortRuleId
  patch: (
    id: ViewSortRuleId,
    patch: Partial<Pick<SortRule, 'field' | 'direction'>>
  ) => void
  move: (
    id: ViewSortRuleId,
    beforeId?: ViewSortRuleId | null
  ) => void
  remove: (id: ViewSortRuleId) => void
  clear: () => void
}
```

这里有两个关键点：

- `create()` 返回新建 rule 的 `id`
- `move()` 不再用 `from/to index`，而是用 `id + beforeId`

这样上层 UI 在 create 后、reorder 后都不需要再猜 index。

## 5.2 runtime session route 也要切到 id

[session/page.ts](/Users/realrong/Rostack/dataview/packages/dataview-runtime/src/session/page.ts) 的最终形态应该是：

```ts
export type QueryBarEntry =
  | { kind: 'filterCreate' }
  | { kind: 'sortCreate' }
  | {
      kind: 'filter'
      id: ViewFilterRuleId
    }
  | {
      kind: 'sort'
      id: ViewSortRuleId
    }
```

这里：

- `filter` 必须带 `id`
- `sort` 也直接带 `id`
- create picker 和 rule editor 不是一个语义节点，应该拆成不同 route kind

然后 route normalize 应该从：

- `activeView.filter.rules[route.index]`

改成：

- `activeView.filter.rules.byId[route.id]`

## 5.3 runtime page model 应提供 id-keyed row access

现在 [page/api.ts](/Users/realrong/Rostack/dataview/packages/dataview-runtime/src/model/page/api.ts) 里的：

- `sortRow` 还是 `KeyedReadStore<number, PageSortRow | undefined>`

长期最优应改成：

```ts
sortRow: store.KeyedReadStore<ViewSortRuleId, PageSortRow | undefined>
```

并且 `PageSortRow` 自身持有：

```ts
export interface PageSortRow {
  rule: SortRule
  field?: Field
  availableFields: readonly Field[]
}
```

这样：

- React row 组件按 `id` 订阅
- 不再通过 “当前第几行” 找 row store

## 6. React 层最终应该怎么变

## 6.1 filter key 不再自己拼

[ViewQueryBar.tsx](/Users/realrong/Rostack/dataview/packages/dataview-react/src/page/features/viewQuery/ViewQueryBar.tsx) 里的：

- ``key={`filter_${entry.rule.fieldId}_${index}`}``
- `open={query.route?.kind === 'filter' && query.route.index === index}`
- `filters.setPreset(index, ...)`
- `filters.setValue(index, ...)`
- `filters.remove(index)`

最终都应该改成：

- `key={entry.rule.id}`
- `open={query.route?.kind === 'filter' && query.route.id === entry.rule.id}`
- `filters.patch(entry.rule.id, { presetId: ... })`
- `filters.patch(entry.rule.id, { value: ... })`
- `filters.remove(entry.rule.id)`

## 6.2 sort list item id 应该来自 rule.id

[sortUi.ts](/Users/realrong/Rostack/dataview/packages/dataview-react/src/page/features/sort/sortUi.ts) 里当前在自己拼：

- `sorter_${index}`

这个文件本身就是一个信号：

- 当前 public projection 没有给出真正的 row identity

长期最优应该直接删掉这类 helper，改成：

- `getItemId={(entry) => entry.rule.id}`

## 6.3 创建后打开刚创建项，必须用返回 id

现在这一类代码都在猜：

- `filters.length`
- `filterCount`
- `current sort index`

长期最优应该统一收敛成：

```ts
const id = engine.active.filters.create(fieldId)
page.query.open({
  kind: 'filter',
  id
})
```

对于 sort：

```ts
const id = engine.active.sort.create(fieldId)
page.query.open({
  kind: 'sort',
  id
})
```

这样：

- React 不再猜数组位置
- `create()` 成功后必然拿到目标 `id`
- 重复 `fieldId` 创建直接报错，不再存在 dedupe/no-op 这种暧昧语义

## 7. 其他地方还需不需要 stable id

结论是：真正“需要补一层 generated stable id”的，当前主要就是 filter/sort rule。

下面这些不用额外生成：

### 7.1 已经有内建 identity 的

- `View.id`
- `Record.id`
- `Field.id`
- `FieldOption.id`
- `Section.key`
- `ItemId`
- `RecordId`

### 7.2 本身就是标量 id 列表的

- `view.display.fields`
- `view.search.fields`
- `view.orders`

这些元素本身已经是 stable id，不需要再包一层对象 id。

### 7.3 本身就是 map / keyed object 的

- `view.calc`
- `group.buckets`
- `summary` keyed by `fieldId` / `sectionKey`

### 7.4 projection 里已经有稳定值的

- `FilterRuleProjection.conditions[*].id`

这里的 `id` 来自 preset id，本身已经够稳定。

### 7.5 runtime-local 临时 id 不属于这次问题

例如：

- `ItemIdPool`
- interaction coordinator 里的自增 id
- table block / rail / virtual 里的 runtime-only id

这些都是 ephemeral runtime identity，不是 document-stable rule `id`。  
它们不应该和这次的 rule id 混为一谈。

## 8. 还需要一起清理的“不和谐点”

stable id 真落地后，下面这些名字/辅助函数也应该一起收敛。

## 8.1 `Sorter` / `sorter` 这套语言最好直接删

长期最优里：

- `Sorter` -> `SortRule`
- `SortRuleProjection.sorter` -> `SortRuleProjection.rule`

否则语言会一直不对称：

- filter 说 rule
- sort 说 sorter

## 8.2 `indexOfFilterRule` / `indexOfSortRule` 这套思路本身该消失

当前 core 里：

- filter 的 `indexOfFilterRule(rules, fieldId)`
- sort 的 `indexOfSortRule(sorters, fieldId)`

本质上都不是“按 rule identity 查找”，而是：

- 按 `fieldId` 查找

如果底层最终直接改成 `EntityTable`，那长期最优不是把它们扩成 4 个新 helper，而是：

- public 语义全面切到 `id`
- 常规读取直接走 `rules.byId[id]`
- reorder 如需 `id -> index`，只在局部实现里基于 `order` 做私有查找
- `fieldId` 维度只保留“重复字段校验”，不再保留“字段就是查找键”的通用 helper

也就是说，真正该保留的不是：

- `findFilterRuleIndexByFieldId`
- `findSortRuleIndexByFieldId`

而是类似：

- `assertFilterFieldAvailable(rules, fieldId, exceptId?)`
- `assertSortFieldAvailable(rules, fieldId, exceptId?)`

这样语义才是对的，因为这里关心的是“不变量校验”，不是“identity 查找”。

## 8.3 validate / issue path 也不该继续只报 index

现在 [mutate/planner/views.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/mutate/planner/views.ts) 里的 issue path 很多是：

- `${path}.rules.${index}.fieldId`

长期最优里最好至少把目标 rule 的 `id` 也带出来。  
不一定非要把 path 语法完全改成 id-based，但 issue payload 里应该能看到目标 rule id。

否则：

- reorder 以后错误定位会漂

## 9. id generator 的长期最优复用方案

## 9.1 不同 id 其实是三类，不要混着做

当前 dataview 里至少有三类 id：

### A. 持久化 opaque id

这类 id 的特点是：

- 写进 document
- 不要求可读
- 只要求稳定唯一

包括：

- `RecordId`
- `FieldId`
- `ViewId`
- `ViewFilterRuleId`
- `ViewSortRuleId`

### B. 语义型 scoped id

这类 id 的特点是：

- 通常带用户语义
- 往往需要“局部唯一”
- 可能需要可读 slug

典型例子：

- `FieldOption.id`

当前 [createFieldOptionId()](/Users/realrong/Rostack/dataview/packages/dataview-core/src/shared/option.ts#L146) 这种做法就是这一类。  
它不应该和 opaque id generator 合并。

### C. runtime-only ephemeral id

这类 id 的特点是：

- 不进 document
- 只在本轮 runtime / interaction / projection 内使用

包括：

- `ItemIdPool`
- UI interaction 临时 id
- 某些 virtual layout 内部 id

这类也不应该复用 document opaque id generator。

## 9.2 dataview 应该统一复用的，是 A 类 opaque id generator

当前 dataview 自己的 entity id 在：

- [engine/mutate/entityId.ts](/Users/realrong/Rostack/dataview/packages/dataview-engine/src/mutate/entityId.ts)

它现在是：

- `Date.now() + process-local seed`

这不算理想。

长期最优建议是：

- 统一到一个 repo-level 通用 opaque id primitive
- 底层实现优先用 `crypto.randomUUID()`
- fallback 再退到 `Date.now() + random`

## 9.3 推荐的复用分层

最稳的分层是：

### shared/core

提供最底层的无业务语义 primitive：

```ts
export const createId = (prefix?: string): string
```

这里不关心 dataview / whiteboard，只做泛用 primitive。

长期最优里，不需要在各业务包里再扩散出一堆：

- `createRecordId()`
- `createFieldId()`
- `createViewId()`
- `createViewFilterRuleId()`
- `createViewSortRuleId()`

这类并列工厂函数。

shared/core 只保留一个真正的底层实现即可：

- `createId(prefix?)`

`prefix` 是否进入最终字符串，是 shared 层自己的实现细节。  
调用方不应该直接依赖“具体 prefix 长什么样”。

### dataview-core

提供 dataview 自己唯一的 typed 入口：

```ts
export type DataviewIdKind =
  | 'record'
  | 'field'
  | 'view'
  | 'filterRule'
  | 'sortRule'

export const createDataviewId = <
  TKind extends DataviewIdKind
>(kind: TKind): DataviewIdOf<TKind>
```

这样：

- dataview-specific typed id 不会散落在 engine 各处
- core normalize / duplicate / repair / create 都能直接用
- public 入口只剩一个，不再有 5 个平铺函数
- 业务代码表达的是“我要哪类 id”，而不是“我要哪个 prefix 字符串”

如果要再短一点，甚至可以直接导出：

```ts
export const id = {
  create: <TKind extends DataviewIdKind>(kind: TKind): DataviewIdOf<TKind>
} as const
```

调用侧统一写成：

```ts
id.create('record')
id.create('field')
id.create('view')
id.create('filterRule')
id.create('sortRule')
```

这比 `createRecordId()` 那一排更短，也比到处裸用 `createId(prefix)` 更稳。

### engine

engine 不再自己维护 id 生成实现，只消费 dataview-core 暴露出来的唯一 typed 入口。

也就是说：

- 现有 `engine/mutate/entityId.ts` 最终应删除
- 或者退化为薄 re-export，不再保留自己的实现

## 9.4 为什么不建议把 rule id generator 放在 engine

因为 rule id 最终应该属于：

- `View` 的 core state

而不是 engine runtime state。

一旦要在这些地方生成/修复 id：

- `normalizeFilterRule`
- `normalizeSortRule`
- `duplicateViewInput`
- `repairView`

它就天然应该能在 `dataview-core` 层被调用。

所以：

- engine 负责用
- core 才是 id 语义归属层

## 9.5 duplicate / normalize / create / patch 的 id 规则

长期最优下，规则应该明确：

### normalize

- 旧数据缺 id 时，自动补 id
- 同一 view 内发现重复 rule `id` 时，后者重生新 id

### create rule

- `create()` 创建新 rule 时生成新 id
- 如果同一 view 内已存在相同 `fieldId` 的 filter / sort rule，直接报错

### patch rule

- `patch()` 更新 field / preset / value / direction 时保留原 id

### move rule

- 只改顺序，不改 id

### duplicate view

- duplicate 出来的 view 应重新生成其 embedded rule id

原因：

- duplicate view 是“创建新 embedded entity”
- 不是“同一 rule 在新父节点下继续存在”

这会让：

- 调试
- 日志
- future collaboration

都更干净。

## 10. 我对“还有没有其他需要 stable id 的地方”的最终判断

如果只看 dataview engine -> runtime -> react 这一整条链，真正必须一次性补齐的核心缺口就是：

1. `FilterRule`
2. `SortRule`
3. `filter.rules` / `sort.rules` 的 `EntityTable` 容器

其他大多数地方：

- 要么已经有 intrinsic id
- 要么本身只是 scalar id list
- 要么只是 runtime-local identity

所以这次不建议把问题泛化成“所有数组元素都要补生成 id”。  
长期最优应该是：

- 只给真正的、可编辑的、需要持久化 identity 的 embedded rule entity 补 id
- 其他地方继续使用现有 intrinsic key

## 11. 最终判断

`sortUi.ts` 自己拼 `current sorter id` 这件事，确实说明边界还没彻底对。

但长期最优不是：

- 再写一个更聪明的 React helper
- 或者在 runtime projection 临时生成 `viewId:index`

真正应该做的是：

- 把 `filter rule` 和 `sort rule` 的稳定 `id` 做进 core state
- 把 `Sorter` 整体收敛成 `SortRule`
- 把 `filter.rules` / `sort.rules` 都直接收敛成 `EntityTable`
- 把 engine command / runtime route / react key 全部切到 rule 的稳定 `id`
- 把 `EntityTable` 的泛型定义和通用读写工具下沉到 `shared/core`
- 把 id generator 收敛成 `shared/core.createId()` + `dataview-core.id.create(kind)`

这才是这条链的一次性最终收敛。

## 12. 最终实施方案

下面这套顺序是按“直接做到最终形态，不留兼容层”设计的。

### 12.1 shared/core

- 新增或统一通用 `createId(prefix?)`
- 下沉 `EntityTable` 类型与泛型工具
- 下沉 generic `entityTable.read/write/normalize/access/overlay/patch`
- 保持这一层完全不依赖 `DataDoc`、`DataRecord`、`View`

### 12.2 dataview-core contracts

- 给 `FilterRule` 增加 `id: ViewFilterRuleId`
- 把 `Sorter` 改名为 `SortRule`
- 给 `SortRule` 增加 `id: ViewSortRuleId`
- 把 `Filter.rules` 改成 `EntityTable<ViewFilterRuleId, FilterRule>`
- 把 `Sort.rules` 改成 `EntityTable<ViewSortRuleId, SortRule>`
- 在 dataview-core 暴露唯一 id 入口：`id.create(kind)` 或 `createDataviewId(kind)`
- 删除 `createRecordId()` / `createFieldId()` / `createViewId()` / `createViewFilterRuleId()` / `createViewSortRuleId()`

### 12.3 dataview-core state / normalize / duplicate / repair

- 全量改写 filter/sort 的 clone / same / normalize / write
- `normalize()` 负责补缺失 id、清理重复 id、清理脏 order
- `create()` 负责生成新 rule id
- `patch()` 保留原 id
- `move()` 只改 `order`
- duplicate view 时重生全部 embedded rule id
- 删除基于数组 index 的 filter/sort helper
- 删除把 `fieldId` 当 identity 的 helper，改成字段唯一性校验函数

### 12.4 dataview-core document

- 让 document 顶层 `records / fields / views` 改为复用 shared 的 `EntityTable`
- 把 `document/table.ts` 收缩成 dataview document adapter
- 删除 document 层里重复的 generic table 能力

### 12.5 dataview-engine

- active query API 全部切到 `create / patch / move / remove / clear`
- 删除 `add / update / setPreset / setValue / replace / keepOnly / upsert`
- `create()` 成功必返 id
- 重复 `fieldId` 创建直接报错
- query publish / projection 全量改成 `SortRuleProjection.rule`
- 所有 filter/sort 读取都改成基于 `byId + order`
- issue / validation payload 至少带目标 rule id
- 删除 `engine/mutate/entityId.ts` 自有实现，改用 dataview-core typed id 入口

### 12.6 dataview-runtime

- `QueryBarEntry` 改成 `filterCreate | sortCreate | filter{id} | sort{id}`
- page model / keyed store 全部改成按 rule id 订阅
- route normalize 改为直接读 `rules.byId[id]`
- 删除 runtime 内部 filter/sort index route 和 index row lookup

### 12.7 dataview-react

- 所有 filter/sort key 改为 `rule.id`
- 所有 create 后打开 editor 的逻辑直接使用返回 id
- 删除 React 自拼 `sorter_${index}` / `fieldId + index` / `filters.length` 这类补丁式逻辑
- field picker 继续提前禁用重复字段，但不再承担最终一致性职责

### 12.8 清理验收

- 删除所有 index-based filter/sort public API
- 删除所有旧 `Sorter` 类型与 `sorter` 命名
- 删除所有 legacy id factory
- 删除所有“重复字段 create 时 silent no-op”逻辑
- 最终保证：
  - public 规则 identity 只有 `id`
  - 底层容器统一是 `EntityTable`
  - shared/core 持有 generic table 与 generic id primitive
  - dataview-core 持有 dataview typed id 与 document adapter
