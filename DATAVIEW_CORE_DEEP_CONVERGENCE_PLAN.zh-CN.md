# Dataview Core 深度收敛方案

## 目标

这份文档只讨论 `dataview/packages/dataview-core`：

- 哪些 API 还可以继续简化
- 哪些是重复的写入模型
- 哪些 helper 适合模块化
- `view/index.ts` 里的大量 `setXXX` 是否应该继续合并
- 最终推荐的长期 API 形态是什么

默认前提：

- 不考虑兼容成本
- 优先长期复杂度最低
- 不做过度抽象，不引入 `set(key, value)`、`op(type, payload)` 这类高抽象低语义 API

## 结论

可以继续明显收掉一波，而且不该只盯 `view/index.ts`。

这一轮真正值得收敛的，不是某几个函数名，而是三类底层重复模型：

1. 对象局部写入模型
2. entity table 读写模型
3. clone / normalize / same 三件套的重复壳

从 `core` 现状看，最大的问题不是“函数太多”本身，而是：

- 同一类对象写入逻辑在 `view/group/sort/search/document` 多处平行实现
- 很多模块已经有 owner，但内部仍然是平铺 helper 思维
- 一部分 public API 暴露的是实现步骤，而不是稳定职责

所以答案是：

- `view` 里的大量 `setXXX` 可以合并
- 但应该按“对象 patch”合并，而不是继续堆更多 `setXXX`
- 同时要连带把 `group.state.ts` 和 `document/table.ts` 一起收，不然复杂度不会真正下降

## 快速盘点

本次只扫了 `dataview/packages/dataview-core/src`。

比较突出的重复点：

- `view/state.ts` 里 `setXxx` 类公开写入函数有 12 个
- `group/state.ts` 里 `setXxx` 类公开写入函数有 6 个
- `sort/state.ts` 里写入函数有 7 个
- `document/table.ts` 里通用 helper 有 17 个
- `search/tokens.ts` 里 build / join / split / normalize 类函数有 9 个
- `field/index.ts` 文件体量 468 行，而且是聚合密度很高的“大总入口”
- `document/index.ts` 和 `field/options/index.ts` 仍然有 `export *`

这几个点说明：

- `core` 还有一层“helper 化残留”
- 现在适合进入第二轮收口：收模型，不只是收命名

## 总体设计原则

### 1. 保留 owner，收掉步骤名

应该优先保留：

- `view`
- `group`
- `search`
- `sort`
- `document`
- `field`
- `operation`
- `impact`

不应该继续放大：

- `setTableWrap`
- `setGalleryCardLayout`
- `setKanbanCardsPerColumn`
- `setMode`
- `setSort`
- `setInterval`

进入 owner 后，应该变成：

- `view.layout.table.patch`
- `view.layout.gallery.patch`
- `view.layout.kanban.patch`
- `group.patch`
- `group.bucket.patch`

### 2. 不做“万能 patch”，只做对象级 patch

不推荐：

```ts
view.set(options, 'gallery.card.size', 'lg')
group.set(group, 'bucketSort', 'manual')
```

这种虽然短，但类型边界和可读性都会变差。

推荐：

```ts
view.layout.table.patch(options, {
  wrap: true,
  showVerticalLines: false
})

view.layout.gallery.patch(options, {
  card: {
    size: 'lg',
    layout: 'stacked'
  }
})

group.patch(group, field, {
  mode: 'month',
  bucketSort: 'manual'
})
```

也就是：

- patch 的 owner 必须稳定
- patch 的 shape 必须是对象本身的结构
- 不把路径字符串暴露成 public API

### 3. clone / normalize / same 应该收成 state 能力，不要平铺散落

现在很多模块都是：

- `cloneXxx`
- `normalizeXxx`
- `sameXxx`
- 外加一组写入函数

这本身没错，但不该继续暴露为平铺 helper 群。

长期更好的模式是：

```ts
view.display.clone(...)
view.display.normalize(...)
view.display.same(...)

group.state.clone(...)
group.state.normalize(...)
group.state.same(...)

sort.rule.clone(...)
sort.rule.normalize(...)
sort.rules.same(...)
```

重点不是把方法藏起来，而是让“状态能力”和“写能力”在语义上归位。

## 模块级收敛建议

## 1. `view` 是第一优先级

涉及文件：

- `src/view/index.ts`
- `src/view/state.ts`
- `src/view/options.ts`
- `src/view/shared.ts`
- `src/view/normalize.ts`

### 当前问题

`view` 已经完成了第一轮 owner 化，但内部仍然保留了明显的 setter 膨胀：

- `setTableColumnWidths`
- `setTableVerticalLines`
- `setTableWrap`
- `setGalleryCardWrap`
- `setGalleryCardSize`
- `setGalleryCardLayout`
- `setKanbanCardWrap`
- `setKanbanCardSize`
- `setKanbanCardLayout`
- `setKanbanFillColumnColor`
- `setKanbanCardsPerColumn`

这些函数本质上都在做同一件事：

- clone `ViewOptions`
- patch 某个局部结构
- 返回新对象

### 核心结论

这 11 个 layout setter 应该收成 3 个 patch API。

### 推荐 API

```ts
view.options.clone(options)
view.options.normalize(options, context)
view.options.same(left, right)
view.options.defaults(type, fields)
view.options.pruneField(options, fieldId)

view.layout.table.patch(options, {
  widths?: Partial<Record<FieldId, number>>
  showVerticalLines?: boolean
  wrap?: boolean
})

view.layout.gallery.patch(options, {
  card?: {
    wrap?: boolean
    size?: CardSize
    layout?: CardLayout
  }
})

view.layout.kanban.patch(options, {
  card?: {
    wrap?: boolean
    size?: CardSize
    layout?: CardLayout
  }
  fillColumnColor?: boolean
  cardsPerColumn?: KanbanCardsPerColumn
})
```

### 为什么这比 `setXXX` 更好

- 直接把写入目标从“某一个属性”提升到“某一类对象”
- 减少公开方法数量
- 减少外层 import 面积
- 新增属性时不必继续扩 setter

### `view` 里还可以继续收的点

#### A. `view.display`

现状已经不错，但还能更统一：

- `replace`
- `move`
- `show`
- `hide`
- `clear`

这组可以保留，因为它们是用户动作，不只是属性 patch。

推荐最终形态：

```ts
view.display.clone
view.display.normalize
view.display.same
view.display.replace
view.display.move
view.display.show
view.display.hide
view.display.clear
view.display.insertBefore
```

#### B. `view.calc`

当前只有一个 `setViewCalcMetric`，可以保持为：

```ts
view.calc.set(calc, fieldId, metric)
```

这个不建议抽成 `patch`，因为这里只有单点增删，`set` 语义已经足够清晰。

#### C. `view.repair`

当前命名：

- `removedField`
- `convertedField`

还可以更对称：

```ts
view.repair.field.removed(...)
view.repair.field.converted(...)
```

是否需要继续拆，要看之后 `repair` 是否会长出更多 owner。

## 2. `group` 是第二优先级

涉及文件：

- `src/group/index.ts`
- `src/group/state.ts`
- `src/group/write.ts`

### 当前问题

`group/state.ts` 的模式和 `view.state.ts` 高度相似：

- clone / normalize / same
- 一组 patch 类 setter
- bucket 的 patch 逻辑单独分叉

公开写入函数包括：

- `set`
- `toggle`
- `setMode`
- `setSort`
- `setInterval`
- `setShowEmpty`
- `setBucketHidden`
- `setBucketCollapsed`
- `toggleBucketCollapsed`

### 核心结论

这里不应该继续维持 6 个 patch setter。

应该收成两层：

1. group 自身 patch
2. bucket patch

### 推荐 API

```ts
group.state.clone(group)
group.state.normalize(input)
group.state.same(left, right)

group.set(group, field)
group.clear(group)
group.toggle(group, field)

group.patch(group, field, {
  mode?: string
  bucketSort?: ViewGroup['bucketSort']
  bucketInterval?: ViewGroup['bucketInterval']
  showEmpty?: boolean
})

group.bucket.patch(group, field, key, {
  hidden?: boolean
  collapsed?: boolean
})

group.bucket.toggleCollapsed(group, field, key)
```

### 可以删除的公开函数

- `setMode`
- `setSort`
- `setInterval`
- `setShowEmpty`
- `setBucketHidden`
- `setBucketCollapsed`

### 额外建议

`cloneBucketState` / `cloneBuckets` / `cloneGroup` 三层 clone 过细。

更合理的 owner 结构是：

```ts
group.state.clone(...)
group.bucket.clone(...)
```

不要继续把 bucket clone 直接暴露成顶层函数。

## 3. `sort` 需要从“状态 helper”切到“规则集合 owner”

涉及文件：

- `src/sort/index.ts`
- `src/sort/state.ts`
- `src/sort/compare.ts`

### 当前问题

`sort.state.ts` 当前同时承载：

- rule 级能力：`cloneSorter` / `normalizeSorter`
- list 级能力：`cloneSorters` / `normalizeSorters` / `sameSorters`
- write 级能力：`add` / `set` / `keepOnly` / `replace` / `remove` / `move` / `clear`

这是典型的“一个文件装三层语义”。

### 推荐 API

```ts
sort.rule.clone(sorter)
sort.rule.normalize(input)

sort.rules.clone(sorters)
sort.rules.normalize(input)
sort.rules.same(left, right)
sort.rules.indexOf(sorters, fieldId)

sort.write.add(sorters, fieldId, direction?)
sort.write.upsert(sorters, fieldId, direction)
sort.write.keepOnly(sorters, fieldId, direction)
sort.write.replace(sorters, index, sorter)
sort.write.remove(sorters, index)
sort.write.move(sorters, from, to)
sort.write.clear(sorters)

sort.compare.records(...)
```

### 关键点

- 当前 `set` 更像 `upsert`，建议改名
- `keepOnly` 保留，因为语义明确
- 不建议抽成 `sort.patch(sorters, action)`，那会退化成命令对象 API

## 4. `search` 要从“文本构建步骤”收成文本 owner

涉及文件：

- `src/search/index.ts`
- `src/search/state.ts`
- `src/search/tokens.ts`
- `src/search/execute.ts`

### 当前问题

`search/tokens.ts` 里有大量彼此很近的函数：

- `normalizeSearchTokens`
- `joinSearchTokens`
- `splitSearchText`
- `buildFieldSearchText`
- `buildRecordFieldSearchTextFromField`
- `buildRecordFieldSearchText`
- `buildRecordDefaultSearchTextFromFields`
- `buildRecordDefaultSearchText`
- `buildRecordSearchTexts`

它们的差异大多只是：

- 输入是 field 还是 record
- 用的是 document 还是 fields
- 输出是一段 text 还是 text list

### 推荐 API

```ts
search.state.clone(search)
search.state.normalize(input)
search.state.same(left, right)
search.state.setQuery(search, query)

search.tokens.normalize(values)
search.tokens.join(values)
search.tokens.split(text)

search.text.field(field, value)
search.text.record.field(record, fieldId, context)
search.text.record.default(record, context)
search.text.record.all(record, search, context)

search.match.record(recordText, query)
```

### 关键收敛点

去掉这种名字：

- `buildRecordFieldSearchTextFromField`
- `buildRecordDefaultSearchTextFromFields`

这类名字把实现路径写进了 API，长期一定继续膨胀。

推荐引入简单 context：

```ts
interface SearchTextContext {
  document?: DataDoc
  fields?: readonly CustomField[]
}
```

这样 `document` / `fields` 两种调用形态就不需要拆成两个函数。

## 5. `document/table.ts` 是本轮最值得重做的底层模块

涉及文件：

- `src/document/index.ts`
- `src/document/table.ts`
- `src/document/normalize.ts`
- `src/document/fields.ts`
- `src/document/views.ts`
- `src/document/records.ts`

### 当前问题

`document/table.ts` 里其实混了三层东西：

1. entity clone / normalize
2. entity table read API
3. entity table write API

现在公开 helper 过多：

- `cloneRecordInput`
- `cloneEntityInput`
- `createEntityOverlay`
- `replaceDocumentTable`
- `listEntityTable`
- `getEntityTableIds`
- `getEntityTableById`
- `hasEntityTableId`
- `cloneEntityTable`
- `hasOwnKeys`
- `hasOwnValueChanges`
- `mergePatchedEntity`
- `putEntityTableEntity`
- `patchEntityTableEntity`
- `removeEntityTableEntity`
- `normalizeRecordInput`
- `normalizeEntityTable`

这个模块现在已经不是 helper，而是一个未命名的数据访问层。

### 核心结论

应该把它显式命名成 `entityTable`，并按职责拆成：

- `entityTable.clone`
- `entityTable.normalize`
- `entityTable.read`
- `entityTable.write`
- `entityTable.patch`

### 推荐 API

```ts
entityTable.clone.entity(entity)
entityTable.clone.table(table)

entityTable.normalize.table(table)
entityTable.normalize.records(records)

entityTable.read.list(table)
entityTable.read.ids(table)
entityTable.read.get(table, id)
entityTable.read.has(table, id)

entityTable.write.put(table, entity)
entityTable.write.patch(table, id, patch)
entityTable.write.remove(table, id)

entityTable.patch.same(current, patch)
entityTable.patch.merge(current, patch)

document.table.replace(document, key, table)
```

### `document/index.ts` 的问题

当前仍然有：

```ts
export * from '@dataview/core/document/table'
```

这会让 `document/table.ts` 里的底层 helper 漫出来。

推荐改成：

```ts
export const document = {
  table: entityTable,
  fields: ...,
  records: ...,
  views: ...
}
```

不要再把 table helper 直接平铺给外部。

## 6. `field/options/index.ts` 仍然是半收口状态

涉及文件：

- `src/field/options/index.ts`
- `src/field/options/spec.ts`

### 当前问题

这里已经有稳定 owner，但还是存在：

- `export * from spec`
- 读、匹配、token、替换逻辑混在一层

### 推荐 API

```ts
field.option.spec.get(field)

field.option.token.normalize(value)
field.option.token.create(options, name)

field.option.read.list(field)
field.option.read.get(field, optionId)
field.option.read.find(field, value)
field.option.read.findByName(options, name)
field.option.read.tokens(field, optionId)
field.option.read.order(field, optionId)

field.option.match.equals(field, actual, expected)
field.option.match.contains(field, value, expected)

field.option.write.replace(field, options)
```

### 可以删除的形式

- `export * from '@dataview/core/field/options/spec'`

## 7. `field/index.ts` 过大，但问题不是“多”，而是“聚合粒度不均匀”

涉及文件：

- `src/field/index.ts`

### 当前问题

`field/index.ts` 约 468 行，是一个大总入口。

它的问题不是 owner 不清晰，而是不同层级混在一起：

- `field.kind.*`
- `field.schema.*`
- `field.value.*`
- `field.compare.*`
- `field.search.*`
- `field.group.*`
- `field.display.*`
- `field.behavior.*`
- `field.option.*`
- `field.date.*`
- `field.status.*`

这说明 `field` 本身方向是对的，但聚合入口已经过密。

### 推荐做法

不是拆掉 `field`，而是进一步把第二层职责做整齐：

```ts
field.id.isTitle

field.kind.get
field.kind.convert
field.kind.spec.get

field.schema.normalize
field.schema.validate
field.schema.name.unique
field.schema.key.create

field.value.read
field.value.empty
field.value.number
field.value.token.normalize
field.value.searchable.normalize

field.search.tokens
field.display.value
field.compare.value
field.compare.sort

field.group.meta
field.group.entries
field.group.domain

field.option.spec.get
field.option.read.*
field.option.match.*
field.option.write.*

field.date.config.*
field.date.value.*
field.date.group.*
field.date.format.*
field.date.timezone.*
```

### 特别建议

`field.date` 还可以再整理。

比如：

- `getDateGroupKey`
- `createDateGroupKey`
- `createDateGroupValue`
- `readDateGroupStart`
- `parseDateGroupKey`
- `formatDateGroupTitle`

长期更好的结构是：

```ts
field.date.group.key.read
field.date.group.key.create
field.date.group.key.parse
field.date.group.value.create
field.date.group.start.read
field.date.group.title.format
```

现在还不一定要立刻改，但这是后续明显的收口方向。

## 8. `operation` 还停留在文件级 API，而不是 owner API

涉及文件：

- `src/operation/index.ts`
- `src/operation/reducer.ts`
- `src/operation/applyOperations.ts`
- `src/operation/executeOperation.ts`

### 当前问题

现在是：

- `applyOperations`
- `executeOperation`
- `reduceOperation`
- `reduceOperations`

这些名字都在描述步骤，而不是 domain。

### 推荐 API

```ts
operation.apply(document, operations)
operation.exec(document, operation)
operation.reduce.one(document, operation)
operation.reduce.all(document, operations)
```

如果后续 `apply` 和 `reduce` 语义重复，还可以继续收掉一层。

## 9. `commit/impact.ts` 和 `commit/aspects.ts` 适合 owner 化

涉及文件：

- `src/commit/impact.ts`
- `src/commit/aspects.ts`

### 当前问题

这里已经不是 helpers，而是完整的 impact 域。

但现在还是大量平铺函数：

- `createCommitImpact`
- `createResetCommitImpact`
- `finalizeCommitImpact`
- `hasIndexImpact`
- `hasActiveViewImpact`
- `getViewChange`
- 各种 `collectXxxAspects`

### 推荐 API

```ts
impact.create()
impact.reset(before, after)
impact.finalize(impact)

impact.has.index(impact)
impact.has.activeView(impact)

impact.view.change(impact, viewId)
impact.view.queryAspects(previous, next)
impact.view.layoutAspects(previous, next)
impact.view.calculationFields(previous, next)

impact.field.schemaAspects(previous, next)
impact.record.patchAspects(previous, next)
```

这样以后 engine 读起来会更稳定，不会继续向 helper 风格发散。

## 横向收敛主线

## 主线 1. 所有对象状态写入统一成“state + write”

适用模块：

- `view`
- `group`
- `search`
- `sort`

建议统一成：

```ts
owner.state.clone
owner.state.normalize
owner.state.same

owner.write.*
```

其中：

- `view` 可以保留 `display / layout / options / calc / order`
- `group` 可以保留 `state / patch / bucket`
- `sort` 可以保留 `rule / rules / write`
- `search` 可以保留 `state / tokens / text / match`

## 主线 2. 所有 entity table 统一成 `entityTable`

适用模块：

- `document.fields`
- `document.records`
- `document.views`

这会直接收掉大量重复函数和命名分裂。

## 主线 3. 停止继续暴露底层 `export *`

当前还应处理：

- `document/index.ts`
- `field/options/index.ts`

后续原则：

- spec 不要再靠 `export *` 漫出来
- table helper 不要再从 document 根入口平铺出去

## 最终推荐 API 草图

下面是我认为长期复杂度最低的一版，不求一次全做，但方向应该尽量稳定。

```ts
export const view = {
  display: {
    clone,
    normalize,
    same,
    replace,
    move,
    show,
    hide,
    clear,
    insertBefore
  },
  calc: {
    clone,
    same,
    set
  },
  order: {
    normalize,
    apply,
    move,
    moveBlock,
    reorder,
    clear
  },
  options: {
    clone,
    normalize,
    same,
    defaults,
    defaultDisplay,
    pruneField
  },
  layout: {
    table: {
      patch
    },
    gallery: {
      clone,
      normalize,
      patch
    },
    kanban: {
      clone,
      normalize,
      patch
    }
  },
  demand: {
    search,
    filter,
    sort,
    calc,
    display
  },
  name: {
    duplicate,
    unique
  },
  repair: {
    field: {
      removed,
      converted
    }
  },
  duplicate: {
    input
  }
}

export const group = {
  state: {
    clone,
    normalize,
    same
  },
  clear,
  set,
  toggle,
  patch,
  bucket: {
    patch,
    toggleCollapsed
  },
  write: {
    value
  }
}

export const search = {
  state: {
    clone,
    normalize,
    same,
    setQuery
  },
  tokens: {
    normalize,
    join,
    split
  },
  text: {
    field,
    record: {
      field,
      default,
      all
    }
  },
  match: {
    record
  }
}

export const sort = {
  rule: {
    clone,
    normalize
  },
  rules: {
    clone,
    normalize,
    same,
    indexOf
  },
  write: {
    add,
    upsert,
    keepOnly,
    replace,
    remove,
    move,
    clear
  },
  compare: {
    records
  }
}

export const document = {
  table: entityTable,
  fields,
  records,
  views,
  normalize,
  clone
}

export const field = {
  id,
  kind,
  schema,
  value,
  search,
  display,
  compare,
  group,
  option,
  date,
  status,
  behavior
}

export const operation = {
  apply,
  exec,
  reduce: {
    one,
    all
  }
}

export const impact = {
  create,
  reset,
  finalize,
  has: {
    index,
    activeView
  },
  view: {
    change,
    queryAspects,
    layoutAspects,
    calculationFields
  },
  field: {
    schemaAspects
  },
  record: {
    patchAspects
  }
}
```

## 实施优先级

### P1. 最高收益，应该先做

1. `view` layout setter 合并成 `patch`
2. `group` setter 合并成 `patch`
3. `document/table.ts` 改造成 `entityTable`
4. 去掉 `document/index.ts` 的 `export *`
5. 去掉 `field/options/index.ts` 的 `export *`

### P2. 中收益，适合紧接着做

1. `search/tokens.ts` 统一命名到 `search.text.*`
2. `sort.state.ts` 拆成 `rule / rules / write`
3. `operation/index.ts` 改成 owner API
4. `commit/impact.ts` owner 化

### P3. 收口与精修

1. `field/index.ts` 第二层职责再拆整齐
2. `field.date` 进一步分 `config / value / group / format / timezone`
3. 补齐各模块命名统一

## 哪些不建议动

### 1. 不建议把所有写入都抽成一个泛型 helper 暴露为 public API

例如：

```ts
state.patch(current, recipe)
```

这种可以作为内部实现工具，但不应该成为 public API 中心。

### 2. 不建议把 `sort` 和 `filter` 统一成同一种命令对象接口

虽然它们都有 rule list，但语义不同：

- `filter` 偏规则求值
- `sort` 偏有序规则列表

可以共享内部 list helper，但 public API 不要强行对齐。

### 3. 不建议把 `field` 再拆成多个顶层 owner

`field` 作为总 owner 是合理的。

问题不在于顶层叫 `field`，而在于第二层职责还不够均衡。

## 最终判断

如果只回答最开始那个问题：

`dataview/packages/dataview-core/src/view/index.ts` 里大量 `setXXX` 是否能整体合并简化？

答案是：

- 可以
- 而且应该合并
- 但最优方案不是只改 `view`
- 而是一起把 `group` 和 `document/table` 收成同一轮

因为这一波真正的收益来自：

- 减少 setter 膨胀
- 减少 helper 平铺
- 让对象写入模型一致
- 让底层 entity table 模型显式化

如果只做 `view.setXXX -> patch`，可以降一部分复杂度；
如果把 `view + group + entityTable + export*` 一起做，`dataview-core` 的整体 API 密度会明显下降，而且后续继续演进时不会再指数式长 helper。
