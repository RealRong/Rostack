# Dataview / Whiteboard Mutation 最终 API 设计与实施方案

## 目标

这份文档只定义最终状态，以及从当前状态推进到最终状态还需要完成的工作。

约束：

- 不保留兼容层
- 不保留双轨实现
- 不保留旧 helper 协议
- 不保留 path 字符串消费
- 不保留 registry / handle 风格暴露
- mutation delta 由 writer 自动产出
- projection delta 由 projection 自己负责

最终目标：

- `shared/mutation` 只保留一套 shape-first schema 模型
- `dataview` / `whiteboard` 全面切到统一的 `read / write / delta / query / change`
- 业务层不再手写 path，不再手写 delta，不再消费第二套 reader / query / helper 协议

---

## 一、最终设计结论

### 1. schema 必须表达真实协作结构，而不是只表达 TypeScript 外形

typed writer 只能保证“写法类型正确”，不能替 schema 修正错误的数据建模。

如果某个结构需要：

- item 级 create
- item 级 patch
- item 级 remove
- item 级 move
- 精确 inverse
- 精确协作 merge
- 精确增量 projection

那它必须在 schema 里成为一级 mutation 结构，而不能藏在普通 `field<T>()` 里。

因此：

- 能整体替换的值，用 `field<T>()`
- 有序引用列表，用 `sequence<Id>()`
- 有稳定 id + 实体内容 + 顺序的集合，用 `table<Id>({...})`
- 无顺序 keyed collection，用 `map<Id>({...})`

### 2. `table` 是 `ids/byId` 语义，但业务名仍然应该是领域名

不要把底层拆分暴露为业务 API 名称。

错误设计：

```ts
optionsById: map<OptionId>({...})
optionsOrder: sequence<OptionId>()
```

正确设计：

```ts
options: table<OptionId>({
  name: field<string>(),
  color: field<string | null>(),
  category: field<OptionCategory | undefined>(),
})
```

`table` 自身就表达：

- `ids`
- `byId`
- `create`
- `remove`
- `replace`
- `move`

所以业务模型仍然只叫 `options`。

### 3. `shared/mutation` 必须支持对象内部和实体内部直接嵌套 `table / map / sequence / tree`

这是后续工作的核心前提。

最终必须允许：

```ts
const dataviewSchema = schema({
  records: table<RecordId>({
    title: field<string>(),
    values: dictionary<FieldId, unknown>(),
  }),

  fields: table<FieldId>({
    name: field<string>(),
    kind: field<FieldKind>(),
    options: table<FieldOptionId>({
      name: field<string>(),
      color: field<string | null>(),
      category: field<FieldOptionCategory | undefined>(),
    }),
  }),

  views: table<ViewId>({
    name: field<string>(),
    type: field<ViewType>(),
    search: field<Search>(),
    filter: field<Filter>(),
    sort: field<Sort>(),
    group: field<ViewGroup | undefined>(),
    calc: field<ViewCalc>(),
    options: field<ViewLayoutOptions>(),
    fields: sequence<FieldId>(),
    order: sequence<RecordId>(),
  }),
})
```

以及：

```ts
const whiteboardSchema = schema({
  order: sequence<CanvasItemRef>(),

  nodes: map<NodeId>({
    type: field<NodeType>(),
    geometry: object({
      x: field<number>(),
      y: field<number>(),
      width: field<number>(),
      height: field<number>(),
      rotation: field<number>(),
    }),
    text: field<NodeText | undefined>(),
    props: dictionary<string, unknown>(),
  }),

  edges: map<EdgeId>({
    source: field<NodeId>(),
    target: field<NodeId>(),
    labels: table<EdgeLabelId>({
      text: field<string>(),
    }),
    route: table<EdgeRoutePointId>({
      x: field<number>(),
      y: field<number>(),
    }),
  }),

  groups: map<GroupId>({
    name: field<string | undefined>(),
    locked: field<boolean>(),
  }),

  mindmaps: map<MindmapId>({
    rootId: field<NodeId>(),
    tree: tree<MindmapNodeId, MindmapNodeValue>(),
  }),
})
```

也就是说：

- schema 表达真实文档结构
- 内嵌 collection 是正式能力
- 不再为了内核限制，把领域结构拆成别扭的平铺字段
- whiteboard 顶层实体不做 `table`，因为顺序语义由 document 顶层 `order` 单独承担
- whiteboard 顶层实体最终统一为 `map + order`

### 4. mutation delta 由 writer 自动产出，业务不再手写 mutation delta

最终职责必须清晰：

- compile handler 只负责调用 `write`
- writer 产生 primitive writes
- shared mutation runtime 从 writes 自动生成 mutation delta
- `change` / `query.changes(...)` 只是 delta facade
- projection 的聚合变化由 projection 自己定义

不能再有以下模式：

- handler 手写 path
- handler 手写 delta 条目
- engine / active pipeline 自己拼 `input.query.delta`
- projection 层复用 mutation path 作为业务协议

### 5. 业务层只保留一套统一 facade

最终只允许以下心智：

- `read`: 读当前文档
- `write`: 写当前意图
- `delta`: 看这次 mutation 写出来的真实变化
- `query`: 基于当前文档做业务读模型查询
- `query.changes(delta)`: 将 mutation delta 投影成 query 视角的变化
- `frame.changes`: active pipeline 的正式入口

不再允许：

- reader helper 协议
- delta helper 协议
- compile helper 协议
- query helper 协议
- `input.delta` / `input.query.delta` 双入口心智

---

## 二、最终 API 形态

### 1. shared/mutation schema

最终需要支持：

```ts
const schemaDef = schema({
  order: sequence<ItemId>(),

  entities: table<EntityId>({
    name: field<string>(),
    meta: field<Record<string, unknown> | undefined>(),
    tags: sequence<TagId>(),
    attributes: dictionary<string, unknown>(),
    children: table<ChildId>({
      title: field<string>(),
    }),
  }),
})
```

### 2. writer

最终 writer 形态：

```ts
write.order.insert(itemId, { before })

write.entities.create({
  id,
  name,
  meta,
  tags: [],
  attributes: {},
  children: {
    ids: [],
    byId: {},
  },
})

write.entities(entityId).name.set('next')
write.entities(entityId).tags.insert(tagId, { before })
write.entities(entityId).attributes.set('k', 'v')

write.entities(entityId).children.create({
  id: childId,
  title: 'x',
})
write.entities(entityId).children.move(childId, { before: anotherId })
write.entities(entityId).children(childId).patch({
  title: 'y',
})
write.entities(entityId).children.remove(childId)
```

要求：

- `table` 必须正式支持顺序操作
- 内嵌 `table` 和顶层 `table` 用同一套 API
- 不再为业务保留第二套局部 mutation helper

### 3. reader / query

最终 reader / query 形态：

```ts
read.fields(fieldId).options.ids()
read.fields(fieldId).options.get(optionId)
read.fields(fieldId).options(optionId).name()

query.views(viewId).fields.ids()
query.views(viewId).order.contains(recordId)
```

要求：

- query 的底层仍然是 mutation reader
- query 只在业务确实需要时增加业务查询能力
- 不再通过额外 helper 包装“补 reader 缺口”

### 4. delta / change

最终 delta 形态：

```ts
delta.fields(fieldId).options.changed()
delta.fields(fieldId).options.created(optionId)
delta.fields(fieldId).options.removed(optionId)
delta.fields(fieldId).options(optionId).name.changed()

delta.views(viewId).fields.contains(fieldId)
delta.views(viewId).order.contains(recordId)
```

最终 change 入口：

```ts
const changes = query.changes(delta)
```

要求：

- mutation 基础变化由 schema 自动生成
- 聚合变化只有一套正式 facade
- 不再回退到 path 协议

---

## 三、Dataview 最终状态

### 1. schema 设计

Dataview 最终 schema：

```ts
schema({
  activeViewId: field<ViewId | undefined>(),

  records: table<RecordId>({
    title: field<string>(),
    type: field<string | undefined>(),
    values: dictionary<CustomFieldId, unknown>(),
    meta: field<Record<string, unknown> | undefined>(),
  }),

  fields: table<CustomFieldId>({
    name: field<string>(),
    kind: field<CustomFieldKind>(),
    displayFullUrl: field<boolean | undefined>(),
    format: field<NumberFormat | undefined>(),
    precision: field<number | null | undefined>(),
    currency: field<string | null | undefined>(),
    useThousandsSeparator: field<boolean | undefined>(),
    defaultOptionId: field<string | null | undefined>(),
    displayDateFormat: field<DateDisplayFormat | undefined>(),
    displayTimeFormat: field<TimeDisplayFormat | undefined>(),
    defaultValueKind: field<DateValueKind | undefined>(),
    defaultTimezone: field<string | null | undefined>(),
    multiple: field<boolean | undefined>(),
    accept: field<AssetAccept | undefined>(),
    meta: field<Record<string, unknown> | undefined>(),
    options: table<FieldOptionId>({
      name: field<string>(),
      color: field<string | null | undefined>(),
      category: field<string | undefined>(),
    }),
  }),

  views: table<ViewId>({
    name: field<string>(),
    type: field<ViewType>(),
    search: field<Search>(),
    filter: field<Filter>(),
    sort: field<Sort>(),
    group: field<ViewGroup | undefined>(),
    calc: field<ViewCalc>(),
    options: field<ViewLayoutOptions>(),
    fields: sequence<FieldId>(),
    order: sequence<RecordId>(),
  }),
})
```

### 2. `dataview/packages/dataview-core/src/mutation/model.ts` 过于复杂，必须拆职责

当前这个文件混了太多东西：

- schema shape
- `.from(...)` bridge
- title field 常量
- typed delta 聚合
- dataview 领域变化 helper
- mutation 类型导出

这会导致两个问题：

- schema 定义不再直观
- 任何 delta/query 设计变更都会把 schema 文件变成巨型文件

最终必须拆成：

### `src/mutation/schema.ts`

只负责：

- dataview mutation schema shape
- 必要的 `.from(...)`
- schema 导出

禁止放：

- 业务 change 聚合
- 业务 query wrapper
- title field 常量
- compile helper

### `src/mutation/change.ts`

只负责 dataview 业务聚合变化，例如：

- `record.touchedIds()`
- `record.values.touchedFieldIds()`
- `field.schemaTouchedIds()`
- `view.queryChanged(viewId, aspect)`
- `view.layoutChanged(viewId)`

要求：

- 基于标准 `MutationDelta<typeof schema>` 生成
- 不再自己维护第二套 raw/path 协议

### `src/mutation/query.ts`

只负责 dataview 业务查询包装，例如：

- title field 作为虚拟 field 暴露
- active view 推导
- record / field / view 列表化访问

要求：

- 只做 dataview 业务语义
- 不再承担 shared mutation 协议翻译工作

### `src/mutation/index.ts`

只负责整洁导出。

最终结果：

- schema 文件恢复成“定义 shape”的单一职责
- query / change 独立演化
- 不会再出现一个 `model.ts` 同时承担 5 类职责

### 3. compile 最终状态

Dataview compile handler 最终只面向：

- `read`
- `write`
- `query`
- `change`
- `issue`

不再保留：

- `reader` / `writer` 双别名
- `expect`
- `source`
- 兼容性 wrapper
- 历史 compile helper 协议

需要做的直接收口：

- `field.option.*` 不再假设“字段内部数组项有专属 writer”
- 直接改成 child `table` writer
- `view.fields` / `view.order` 全部走标准 `sequence`
- `record.values` 全部走标准 `dictionary`

### 4. active / projection 最终状态

Dataview active pipeline 最终只消费：

- `frame.delta`
- `frame.changes`

其中：

- `frame.delta` 是标准 mutation delta
- `frame.changes` 是 `query.changes(frame.delta)` 产物

删除：

- `DataviewDeltaQuery`
- 所有 `input.query.delta`
- 所有 path string 判断
- 所有 mutation helper 风格的历史增量协议

### 5. Dataview 聚合变化的最终判断

以下几项需要单独判断，它们到底是历史遗留，还是正式需求：

- `record.touchedIds()`
- `record.values.touchedFieldIds()`
- `field.schemaTouchedIds()`
- `view.queryChanged(viewId, aspect)`
- `view.layoutChanged(viewId)`

结论：

- **不是 shared mutation 核心层应该内建的通用概念**
- **也不是应该直接删除的历史残留**
- **它们是 dataview query/change 层必须保留的正式聚合变化 contract**

也就是说：

- 这些能力不该继续散落在业务 helper 里
- 不该由 active pipeline 自己拼
- 不该退回 path string
- 但它们的语义本身需要保留

原因很直接：dataview 的增量 index / active planner / publish 流程真实依赖这些聚合判断。

#### `record.touchedIds()`

这项必须保留。

原因：

- index sync 需要知道“哪些 record 被触达”
- membership / summary / sort / search 的增量更新都依赖 record touched set
- 只看 `recordSetChanged()` 不够，因为那只能回答“成员是否增删”，不能回答“已有 record 哪些内容变了”

因此它不是历史遗留，而是 dataview 增量执行的基础输入。

#### `record.values.touchedFieldIds()`

这项必须保留，但最终建议收口命名。

原因：

- dataview 不只关心“哪个 record 变了”，还关心“哪些 field value 维度变了”
- search / filter / sort / calculation 都要按字段依赖裁剪同步范围
- 如果去掉它，只保留 `record.touchedIds()`，很多阶段会退化成依赖字段全量重算

因此它不是 compile 遗留，而是 dataview 内容增量裁剪所需信息。

最终建议：

- 保留这层语义
- 从 `record.values.touchedFieldIds()` 收口为 `field.valueTouchedIds()`

#### `field.schemaTouchedIds()`

这项必须保留。

原因：

- dataview 明确区分“字段 schema 变更”和“字段 value 变更”
- 字段类型、选项、格式等变化，会改变 filter / sort / group / calc / search 的解释方式
- 如果把它和普通 value touched 混在一起，planner 会失去精确判断，index 也会扩大重算范围

因此这项不是历史包袱，而是 dataview 领域里的真实变化类别。

#### `view.queryChanged(viewId, aspect)`

这项必须保留。

原因：

- active query 阶段必须区分“view 查询定义变了”还是“底层内容变了”
- `search / filter / sort / group / order` 本来就是 view query definition 的正式组成部分
- planner 需要基于 aspect 精确决定 `reuse / sync / rebuild`

因此它不是临时 helper，而是 active planner 的正式输入。

#### `view.layoutChanged(viewId)`

这项必须保留。

原因：

- publish 阶段要区分“查询结果变了”与“展示布局变了”
- `name / type / fields / options` 这些变化不一定要求 query 重跑，但会要求 snapshot / projection 更新
- 如果每个消费方都自己重新拼这组条件，只会重新制造第二套隐式协议

因此它不是多余包装，而是 publish / projection 所需的一项正式聚合变化。

#### 总结

这 5 项里，没有一项应该按“历史 helper”直接删除。

真正应该删除的是：

- 自己手写相同聚合判断的重复实现
- `input.delta` / `input.query.delta` 双入口
- path string 版本的旧协议

最终应该保留的是：

- 一套正式的 dataview change facade

### 6. Dataview change facade 的最终归属与命名

这些聚合变化最终统一收口到：

```ts
const changes = query.changes(delta)
```

它们的归属是：

- `query` 负责把 mutation delta 解释成 dataview 业务变化
- `frame.changes` 作为 active pipeline 的正式入口

不应该继续挂在：

- raw mutation delta 扩展字段
- engine 私有 helper
- compile helper

建议最终收口成下面这套语义：

```ts
changes.record.setChanged()
changes.record.touchedIds()

changes.field.valueTouchedIds()
changes.field.schemaTouchedIds()
changes.field.touchedIds()
changes.field.schemaChanged(fieldId)

changes.view.queryChanged(viewId, aspect?)
changes.view.layoutChanged(viewId)
```

说明：

- `record.touchedIds()`：保留
- `record.values.touchedFieldIds()`：收口为 `field.valueTouchedIds()`
- `field.schemaTouchedIds()`：保留
- `view.queryChanged(...)`：保留
- `view.layoutChanged(...)`：保留

关键点不是改名本身，而是把它们稳定成唯一一套正式入口。

不再接受：

- engine 侧自己遍历 writes 推导 touched 集合
- projection 侧自己重复拼 `search/filter/sort/group/order`
- 同一语义同时存在 `delta.xxx` 和 `changes.xxx` 两套入口
- 用 path string 表达 `record.values` / `view.query` / `view.layout`

---

## 四、Whiteboard 最终状态

### 1. schema 设计

Whiteboard 最终必须把脆弱 path 收回 schema 本身。

例如历史上类似：

- `node.geometry`
- `mindmap.layout`
- `canvas.order`

都不应该再是手写 path 协议。

最终原则：

- `order` 直接成为 document 顶层 `sequence`
- `canvas.order` 全量替换为 `order`
- 节点几何信息成为正式对象字段
- mindmap tree 成为正式 tree 字段

### 2. compile / projection 分工

- mutation compile 只写 schema 正式字段
- projection 负责自己的聚合变化
- 不再通过 mutation delta 承担 projection 私有业务协议

### 3. reader / helper 清理

whiteboard 业务内历史 reader helper、delta helper、query helper、facts helper 只保留真正属于业务 query 的那部分。

以下模式需要全部删除：

- 只是弥补 shared mutation facade 不足的 helper
- 只是 path 协议包装的 helper
- registry / handle 风格访问点

---

## 五、shared/mutation 接下来必须先完成的能力

这是业务切换前的前置条件。

### Phase 1. 支持内嵌 `table / map / sequence / tree`

需要完成：

1. schema meta 和路径解析支持 collection 嵌套在 object / table entity / singleton 内部
2. reader 递归支持 child collection
3. writer 递归支持 child collection
4. delta 递归支持 child collection
5. query facade 自动继承这套能力

完成标准：

- `table` 可出现在任何正式 shape 节点下
- 内嵌 `table` 的 read/write/delta 和顶层 `table` 一致

### Phase 2. 补齐 `table` 的顺序能力

需要完成：

1. `table.create(value, anchor?)` 或等价顺序写接口
2. `table.move(id, anchor?)`
3. `delta.table.contains(id)` 或等价成员变化能力
4. reader/query 暴露 `ids()` 顺序视图

完成标准：

- `table` 可完整替代“有序子实体集合”场景
- `field.options` 之类不再需要 `field<T[]>()` 整体 patch

### Phase 3. 清理 shared/mutation 中仍然偏重的旧心智

需要继续做：

1. 删除剩余历史命名残留
2. 继续压缩公开类型面
3. 避免业务层需要显式理解 internal write 结构

完成标准：

- 业务作者只理解 schema / read / write / delta / query / change

---

## 六、业务侧实施顺序

### Phase 4. 重写 Dataview schema 到最终形态

需要完成：

1. `fields.options` 从普通 field 数组改为 child `table`
2. `mutation/model.ts` 拆成 `schema.ts / change.ts / query.ts / index.ts`
3. compile handlers 全面切到标准 writer API
4. 删除 compile helper、delta helper、query helper 的历史协议

完成标准：

- `dataview-core` 不再依赖历史 mutation helper 心智
- `dataview` mutation schema 接近真实文档 shape

### Phase 5. 重写 Dataview engine active / projection

需要完成：

1. 删除 `DataviewDeltaQuery`
2. `frame.changes` 成为唯一 active pipeline 变化入口
3. 所有索引和 active 规划逻辑改用正式 `change` facade
4. 删除所有 path string 消费

完成标准：

- active / index / membership / summary / projection 全部只面向正式 delta/change 接口

### Phase 6. 重写 Whiteboard schema 和 compile

需要完成：

1. 全量替换 `canvas.order` 为 `order`
2. whiteboard 顶层 `nodes / edges / groups / mindmaps` 固定为 `map`，不改成 `table`
3. 收回 node / geometry / tree / props 到正式 schema
4. `labels / route / mindmap tree` 这类真正需要局部结构操作的子结构，保留为正式 child collection
5. 删除 registry / handle / path string 暴露点
6. compile 只写正式 schema 字段

完成标准：

- `whiteboard-core` 不再存在 mutation path 业务协议
- `whiteboard-core` 顶层实体结构稳定为 `order + map stores`

### Phase 7. 重写 Whiteboard engine / editor-scene / projection

需要完成：

1. 删除 projection / active pipeline 中的 path 字符串消费
2. 删除历史 delta contract
3. projection 只保留 projection 自己的变化协议

完成标准：

- `whiteboard-engine` / `whiteboard-editor-scene` 全部切到统一 mutation 主体

---

## 七、接下来我准备怎么做

按顺序推进，不并行乱改：

1. 先改 `shared/mutation`，补齐内嵌 `table` 和 `table.move`
2. 用这套能力重写 dataview schema，尤其是 `fields.options`
3. 拆小 dataview `mutation/model.ts`
4. 收掉 dataview compile 的历史 wrapper / helper
5. 再切 dataview engine 的 active / projection
6. 最后重写 whiteboard 侧 schema 和 projection 消费

原因很直接：

- 不先补 shared/mutation，业务侧只能继续绕路
- 不先收敛 dataview schema，`model.ts` 会持续膨胀
- 不先删 engine 侧历史入口，就会一直保留第二套变化心智

---

## 八、本轮之后不再接受的设计

以下设计都视为非最终方案，不再继续扩展：

- `optionsById + optionsOrder` 作为业务命名
- `field.options: FieldOption[]` + 手写 option helper
- mutation handler 手写 delta
- path 字符串变化协议
- registry / handle 暴露
- compile 上下文兼容性 wrapper 长期保留
- `model.ts` 同时承载 schema / query / change / constants / wrappers

最终要求是：

**一处定义真实结构，处处 typed 使用；写入自动产出 delta；projection 只负责自己的变化。**
