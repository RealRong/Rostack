# Dataview Delta / Query 长期最优 API 方案

## 最终结论

长期最优方案不是继续堆 `query.delta.xxx(delta)`、`reader` helper、`EntityTable<Id, { id }>` 这种机械统一，而是把协议收敛成下面四条：

1. `mutation model` 只负责定义 authored mutation 语义。
2. `typed mutation delta` 由 model 自动生成，不再手写 path 协议。
3. `query` 保持现有聚合形态，不拆成 `read / resolve`。
4. 所有“顺序集合”统一按语义分成两类：
   - `sequence<Id>`：纯引用顺序
   - `sequence<Entity>`：有 payload 的有序项

这意味着：

- `input.query.delta.recordSetChanged(input.delta)` 这种形态应被淘汰
- `query.changes(delta)` 应成为 delta 语义入口
- active pipeline 统一用 `frame.changes`
- `view.order`、`view.fields` 不应该继续存成 `EntityTable<Id, { id }>`
- `field.options`、`filter.rules`、`sort.rules` 应明确视为 `sequence<Entity>`
- whiteboard 的 `document.order` 已经证明了：**可以保留数组态状态，同时拥有 typed 的结构化 mutation**

---

## 一、最终 API 形态

### 1.1 `query` 不拆，增加 `query.changes(delta)`

保留：

```ts
query.records.get(id)
query.fields.get(id)
query.views.active()
query.values.get(recordId, fieldId)
```

新增：

```ts
const changes = query.changes(delta)
```

然后所有 delta 语义从这里读取：

```ts
changes.recordSetChanged()
changes.touchedRecords()
changes.touchedFields()
changes.fieldSchemaChanged(fieldId)
changes.viewQueryChanged(viewId, 'sort')
changes.viewLayoutChanged(viewId)
```

不再保留：

```ts
query.delta.recordSetChanged(delta)
query.delta.touchedFields(delta)
query.delta.viewQueryChanged(delta, viewId, 'sort')
```

原因很简单：当前写法把“这次分析绑定的是哪个 delta”这个上下文拆散了，调用方要不停重复传 `delta`，语义边界不干净。

### 1.2 `frame.changes` 作为 active pipeline 标准入口

active pipeline 最终统一成：

```ts
interface ActiveFrame {
  query: DataviewQuery
  delta: DataviewMutationDelta
  changes: DataviewDeltaQuery
}
```

构造时一次绑定：

```ts
const frame = {
  query,
  delta,
  changes: query.changes(delta),
}
```

之后 active plan / runtime 全部只读：

```ts
frame.changes.recordSetChanged()
frame.changes.viewQueryChanged(active.id, 'filter')
frame.changes.fieldSchemaTouchedIds()
```

这比现在反复写 `input.frame.query.delta.xxx(input.frame.delta)` 明显更稳定。

### 1.3 `DataviewDeltaQuery` 的职责边界

`DataviewDeltaQuery` 只做“delta 语义解释”，不做 document 读取，不做 projection 计算，不做业务求值。

推荐接口：

```ts
interface DataviewQuery {
  document(): DataDoc
  records: ...
  fields: ...
  views: ...
  values: ...

  changes(delta: DataviewMutationDelta): DataviewDeltaQuery
}

interface DataviewDeltaQuery {
  raw: DataviewMutationDelta

  recordSetChanged(): boolean
  touchedRecords(): ReadonlySet<RecordId> | 'all'
  touchedViews(): ReadonlySet<ViewId> | 'all'
  touchedValueFields(): ReadonlySet<FieldId> | 'all'
  touchedFields(): ReadonlySet<FieldId> | 'all'

  fieldSchemaTouchedIds(): ReadonlySet<FieldId> | 'all'
  fieldSchemaChanged(fieldId?: FieldId): boolean

  viewQueryChanged(
    viewId: ViewId,
    aspect?: 'search' | 'filter' | 'sort' | 'group' | 'order'
  ): boolean

  viewLayoutChanged(viewId: ViewId): boolean
}
```

---

## 二、sequence 不等于 `ids/byId`

这里需要把协议讲死。

### 2.1 `sequence<T>` 是 mutation / delta 语义，不是存储形状

`sequence<T>` 的本质是：

- 有稳定顺序
- 有 `insert / move / remove / replace` 这类结构操作
- delta 需要表达“结构变化”，而不是整块 replace

它并不要求状态一定是：

```ts
{ ids, byId }
```

也不要求一定是 `EntityTable`。

whiteboard 的 `document.order: CanvasItemRef[]` 已经是反例：状态是数组，但 mutation model 依然可以提供 typed ordered 操作。

所以长期规则应该是：

- **先按领域语义决定是不是 sequence**
- **再决定状态最自然的承载形状**

而不是为了 mutation engine 方便，把一切都捏成 `EntityTable`。

### 2.2 两类 sequence

#### `sequence<Id>`

适用于：

- 元素本身就是 identity
- 除了顺序和引用关系，没有独立 payload
- 常见状态形状就是 `Id[]` 或 `Ref[]`

典型操作：

- `insert`
- `move`
- `remove`
- `replaceAll`

典型状态承载：

```ts
type SequenceIdState<TId> = readonly TId[]
```

或：

```ts
type SequenceRefState<TRef> = readonly TRef[]
```

#### `sequence<Entity>`

适用于：

- 元素有稳定 identity
- 元素本身还有 payload
- 需要 item-level patch / diff

典型状态承载可以是：

- `Entity[]`
- `EntityTable<Id, Entity>`
- 某个 record 内部的数组

最终取哪种状态形状，要看领域模型最自然的表达，不看 engine 内部实现习惯。

---

## 三、Dataview 的最终分类

## 3.1 应改为 `sequence<Id>`

### `view.fields`

当前状态本质上是：

```ts
display: {
  fields: EntityTable<FieldId, { id: FieldId }>
}
```

这里的问题不只是 `EntityTable<FieldId, { id: FieldId }>` 语义膨胀，还有 `display` 这一层本身没有独立领域价值。

如果 `display` 下面长期只有 `fields` 一个结构，那 `display` 就只是历史遗留空壳，不应该继续保留。

这里不采用“保留 `display`，再用 `NestedProperty` 把 surface 做成 `view.display.fields`”的方案。

原因是 `NestedProperty` 只能改善 API 命名形状，不能替代领域建模判断。对于没有独立子域价值的空壳层级，长期最优做法是直接删除，而不是继续包装。

长期最优应改成：

```ts
fields: FieldId[]
```

mutation surface：

```ts
fields: sequence<FieldId>()
```

理由：

- 元素只有 `FieldId`
- 不存在 `{ id }` 之外的局部数据
- `display` 没有独立子域价值时，不应该为了命名保留空壳
- `EntityTable<FieldId, { id: FieldId }>` 只是实现层自我说服，不是领域模型

### `view.order`

当前状态：

```ts
order: EntityTable<RecordId, { id: RecordId }>
```

长期最优应改成：

```ts
order: RecordId[]
```

mutation surface：

```ts
order: sequence<RecordId>()
```

理由相同：

- 这里只表达 record 引用顺序
- 没有独立 payload
- `EntityTable<RecordId, { id: RecordId }>` 纯属机械统一

## 3.2 应保留 / 明确为 `sequence<Entity>`

### `field.options`

当前状态：

```ts
options: EntityTable<FieldOptionId, FlatOption | StatusOption>
```

长期最优语义：

```ts
options: sequence<FieldOption>
```

状态可接受两种最终形态：

```ts
options: FieldOption[]
```

或者：

```ts
options: EntityTable<FieldOptionId, FieldOption>
```

这里更推荐直接用数组：

```ts
options: FieldOption[]
```

因为：

- option 本来就是局部序列
- 每项 payload 很小
- 读写更直观
- 不必为了 engine 再套一层 `ids/byId`

### `view.filter.rules`

当前状态：

```ts
rules: EntityTable<ViewFilterRuleId, FilterRule>
```

长期最优语义：

```ts
rules: sequence<FilterRule>
```

推荐状态形状：

```ts
rules: FilterRule[]
```

原因：

- rule 有稳定 `id`
- rule 有 payload：`fieldId / presetId / value`
- rule 顺序本身有语义
- 通常不需要 `ids/byId` 的随机访问复杂度

### `view.sort.rules`

同上，长期最优语义：

```ts
rules: sequence<SortRule>
```

推荐状态形状：

```ts
rules: SortRule[]
```

## 3.3 不应该变成 sequence 的 dataview 字段

下面这些字段虽然看起来像集合或包含数组，但不应该 sequence 化：

### `records` / `fields` / `views`

它们是文档级 entity family，不是局部有序集合。

应保持：

- 顶层 table / map family
- create / delete / patch 语义

而不是 sequence。

### `view.search.fields?: FieldId[]`

这只是 search 配置值，不是一个需要 `move / insert / delete item patch` 的结构集合。

长期应保持普通 value / record 语义。

### `FilterOptionSetValue.optionIds: string[]`

这只是一个过滤值载荷，不是独立结构对象。

长期应保持普通 value。

### `view.calc: Partial<Record<FieldId, CalculationMetric>>`

这是 keyed value map，不是 sequence。

### `view.group.buckets`

这是 bucket state map，不是 sequence。

---

## 四、Whiteboard 的最终分类

whiteboard 比 dataview 更接近长期正确方向，因为它已经证明：

- 文档状态可以保持自然数组形状
- mutation model 依然可以提供 typed ordered/tree 操作

## 4.1 应明确为 `sequence<Id>` / `sequence<Ref>`

### `document.order: CanvasItemRef[]`

这不是标量 id，而是 ref：

```ts
type CanvasItemRef =
  | { kind: 'node'; id: NodeId }
  | { kind: 'mindmap'; id: MindmapId }
  | { kind: 'edge'; id: EdgeId }
```

但在协议语义上，它仍然属于：

- 纯引用顺序
- 无独立 payload
- 需要结构操作

所以长期应把它视为：

```ts
sequence<CanvasItemRef>
```

其中 `CanvasItemRef` 的语义等价于“ref id”。

这也是 dataview `view.order` 的直接参照物：**状态可以是数组，typed sequence 不受影响。**

### `mindmap.children[parentId]: MindmapNodeId[]`

当前 `MindmapRecord`：

```ts
children: Record<MindmapNodeId, MindmapNodeId[]>
```

长期语义上，每个 `children[parentId]` 都是一个：

```ts
sequence<MindmapNodeId>
```

但 whiteboard 已经有更高层的：

```ts
tree.structure
```

因此长期最优不是把 `children` 单独再扩成一套公开 helper，而是：

- 对外以 `tree` 作为唯一结构 mutation/query 入口
- 在 tree 内部把每个 parent 的 child list 视为 `sequence<Id>`
- 删除散落在外的 children/order slot/groupRefs 类 helper 协议

## 4.2 应明确为 `sequence<Entity>`

### `edge.labels?: EdgeLabel[]`

这是标准的 `sequence<Entity>`：

- 有稳定 `label.id`
- 有 payload：`text / t / offset / style / data`
- 有顺序语义
- 需要 item-level patch

状态保持数组就是最自然的。

### `EdgeRoute.manual.points`

`route` 当前是：

```ts
type EdgeRoute =
  | { kind: 'auto' }
  | { kind: 'manual'; points: EdgeRoutePoint[] }
```

其中 `manual.points` 是标准的 `sequence<Entity>`：

- 有稳定 `point.id`
- 有 payload：`x / y`
- 有顺序语义

长期应继续保留这种表达，不需要为了统一变成 `ids/byId`。

## 4.3 不应该 sequence 化的 whiteboard 字段

### `nodes / edges / groups / mindmaps`

这些是文档级 map family，不是 sequence。

### `NodeOutline.points`、`polygon sides`

这些是几何值，不是结构协议对象。

它们通常整块替换或按专门几何算法处理，不需要进入统一 sequence 协议。

### `SchemaField.options?: readonly SchemaFieldOption[]`

这是 schema 描述值，不是核心 mutation 结构协议。

除非未来明确需要对 schema options 做增量结构编辑，否则不进入 shared sequence。

---

## 五、统一规则

长期只保留下面这套判断标准。

### 5.1 什么时候是 `sequence<Id>`

满足以下条件就用：

1. 元素没有独立 payload，identity 本身就是内容
2. 需要表达顺序变化
3. 需要 `insert / move / remove`

典型例子：

- `view.fields: FieldId[]`
- `view.order: RecordId[]`
- `document.order: CanvasItemRef[]`
- `mindmap.children[parentId]: MindmapNodeId[]`

### 5.2 什么时候是 `sequence<Entity>`

满足以下条件就用：

1. 元素有稳定 `id`
2. 元素自身有 payload
3. 顺序变化和 item patch 都有意义

典型例子：

- `field.options`
- `view.filter.rules`
- `view.sort.rules`
- `edge.labels`
- `edge.route.manual.points`

### 5.3 什么时候不是 sequence

满足以下任一条件就不要硬上：

1. 没有顺序语义
2. 没有结构操作
3. 只是某个 value payload 内部的普通数组
4. 更高层已有更合适的结构协议，比如 tree

---

## 六、Dataview 最终状态模型建议

长期最优 dataview state 建议收敛成：

```ts
interface SelectField {
  id: CustomFieldId
  name: string
  kind: 'select'
  options: FlatOption[]
  meta?: Record<string, unknown>
}

interface MultiSelectField {
  id: CustomFieldId
  name: string
  kind: 'multiSelect'
  options: FlatOption[]
  meta?: Record<string, unknown>
}

interface StatusField {
  id: CustomFieldId
  name: string
  kind: 'status'
  options: StatusOption[]
  defaultOptionId: string | null
  meta?: Record<string, unknown>
}

interface Filter {
  mode: 'and' | 'or'
  rules: FilterRule[]
}

interface Sort {
  rules: SortRule[]
}

interface ViewBase {
  id: ViewId
  name: string
  search: Search
  filter: Filter
  sort: Sort
  calc: ViewCalc
  fields: FieldId[]
  order: RecordId[]
}
```

顶层仍保持：

```ts
records: EntityTable<RecordId, DataRecord>
fields: EntityTable<CustomFieldId, CustomField>
views: EntityTable<ViewId, View>
```

因为这些是真正的文档级 entity family。

---

## 七、Whiteboard 最终状态模型建议

whiteboard 不需要为了统一而向 dataview 的旧 `EntityTable<Id, { id }>` 倒退。

长期最优保持：

```ts
interface Document {
  order: CanvasItemRef[]
  nodes: Record<NodeId, NodeRecord>
  edges: Record<EdgeId, EdgeRecord>
  groups: Record<GroupId, GroupRecord>
  mindmaps: Record<MindmapId, MindmapRecord>
}
```

并明确：

- `document.order` 是 `sequence<Ref>`
- `edge.labels` 是 `sequence<Entity>`
- `edge.route.manual.points` 是 `sequence<Entity>`
- `mindmap` 结构统一走 `tree`

---

## 八、实施方案

### 阶段 1：统一 query / changes 入口

1. 删除 `DataviewQuery['delta']`
2. 新增 `DataviewQuery['changes(delta)']`
3. 引入 `DataviewDeltaQuery`
4. active pipeline 统一增加 `frame.changes`
5. 所有 `input.query.delta.xxx(input.delta)` 全部替换为 `input.changes.xxx()` 或 `input.frame.changes.xxx()`

### 阶段 2：收敛 dataview 状态形状

1. 删除 `display` 空壳
   - `display.fields` -> `fields`
2. `View.fields`
   - `EntityTable<FieldId, { id: FieldId }>` -> `FieldId[]`
3. `ViewBase.order`
   - `EntityTable<RecordId, { id: RecordId }>` -> `RecordId[]`
4. `SelectField / MultiSelectField / StatusField.options`
   - `EntityTable<...>` -> `FieldOption[]`
5. `Filter.rules`
   - `EntityTable<...>` -> `FilterRule[]`
6. `Sort.rules`
   - `EntityTable<...>` -> `SortRule[]`

### 阶段 3：sequence 作为统一 mutation surface

shared mutation 层最终统一成语义更明确的结构类型：

```ts
sequence<Id>()
sequence<Entity>()
tree<Entity>()
```

并替代当前仅强调“顺序”的 `ordered` 命名。

如果 shared 层必须保留一个总类名，推荐：

```ts
structures: {
  ...
}
```

而不是继续混用：

- `ordered`
- `tree`
- 一些零散 helper

### 阶段 4：删除实现层冗余 helper

dataview 删除：

- 围绕 `EntityTable<Id, { id }>` 的 order/fields adapter
- 为了 `ids/byId` 形状存在的 normalize/replace/read helper
- 围绕 `display` 空壳存在的命名适配层

whiteboard 删除：

- 对外暴露的零散 order/children helper 协议
- 能被统一 `query` / `tree` / `sequence` 吸收的 reader helper

---

## 九、最终判断

关于你提到的几个点，最终结论如下：

### `input.query.delta.recordSetChanged(input.delta)` 是否应该消失

是。长期最优应改为：

```ts
input.query.changes(input.delta).recordSetChanged()
```

在 active pipeline 内进一步收敛为：

```ts
input.frame.changes.recordSetChanged()
```

### `view.order`、`view.fields` 要不要拆 `ids/byId`

不要。长期最优就是普通数组：

- `view.order: RecordId[]`
- `view.fields: FieldId[]`

它们属于 `sequence<Id>`，不是 entity table。

### `field.options` 要不要当 structure

要，但它属于 `sequence<Entity>`，不是 `sequence<Id>`。

而且长期最优状态更接近：

```ts
FieldOption[]
```

不是必须继续保留 `EntityTable`。

### 其他还要不要有 `sequence<Id>` / `sequence<Entity>`

要，长期应明确收敛为：

`sequence<Id>` / `sequence<Ref>`：

- `dataview.view.fields`
- `dataview.view.order`
- `whiteboard.document.order`
- `whiteboard.mindmap.children[parentId]`（内部归 tree 管）

`sequence<Entity>`：

- `dataview.field.options`
- `dataview.view.filter.rules`
- `dataview.view.sort.rules`
- `whiteboard.edge.labels`
- `whiteboard.edge.route.manual.points`

其余大多数 map/value/geometry/schema arrays 都不应该为了统一而 sequence 化。

这就是长期最优的边界：**只把真正有结构语义的局部集合变成 typed sequence，其余保持最自然的领域模型。**
