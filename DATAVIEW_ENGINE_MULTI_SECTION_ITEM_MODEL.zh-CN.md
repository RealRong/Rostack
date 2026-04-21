# Dataview Engine 多 Section Item 模型长期最优重构方案

本文只讨论一件事：

在下面这个前提成立时，`dataview-engine` 的 item / membership / publish / runtime / react 全链路，长期最优应该如何重构。

- 同一个 `section` 内，`recordId` 不会重复。
- 同一个 `recordId`，可能同时出现在多个 `section` 中。

这意味着：

- `item` 不能退化成 `record`
- `itemId` 不能直接等于 `recordId`
- 但当前 `itemId = encode(sectionKey) + ':' + encode(recordId)` 也不是长期最优

本文目标只有三个：

1. 降低 membership publish 的 CPU 与 GC 成本。
2. 降低 item identity 的系统复杂度。
3. 提高 engine / runtime / react / DOM 边界的一致性。

## 一、最终结论

这件事的长期最优解只有一条：

1. `ItemId` 内部统一改成 `number`
2. `item` 的核心语义统一定义为 `placement = (sectionKey, recordId)`
3. membership publish 改成单次 placement materialize
4. DOM 不再是真源，只通过 bridge 回到 `ItemId`
5. table virtual / measurement / inline session / cell key 这类内部字符串协议全部下线

换句话说：

- 不是继续优化 `createItemId`
- 不是给字符串 `itemId` 加缓存
- 不是保留当前模型再补一点 fast path

而是：

- 直接删掉整套 string-based item identity 模型

这是唯一同时满足下面三件事的方案：

1. 性能最优
2. 一致性最强
3. 长期复杂度最低

## 二、当前模型为什么不是长期最优

当前热点主要在：

- `dataview/packages/dataview-engine/src/active/snapshot/membership/publish.ts`
  - `buildItemsById`
  - `projectSectionItemIds`
- `dataview/packages/dataview-engine/src/active/shared/itemId.ts`
  - `createItemId`
- `shared/core/src/collection.ts`
  - `createOrderedKeyedAccess`

但这些热点背后的根因，不是某个循环写得不够快，而是底层模型本身就偏贵。

### 1. 同一批 placement 被重复投影

当前 publish 阶段里，同一批 `(sectionKey, recordId)` 至少会被处理两次：

1. `buildItemsById` 里构造一次 `itemId`
2. `projectSectionItemIds` 里再构造一次 `itemId`

50k 数据下，这意味着大量重复 allocation。

### 2. `createItemId` 过重

当前实现：

```ts
export const createItemId = (
  sectionKey: SectionKey,
  recordId: RecordId
): ItemId => `${encodeURIComponent(sectionKey)}:${encodeURIComponent(recordId)}`
```

它的问题不是“实现不够精巧”，而是方向错了：

- 两次 `encodeURIComponent`
- 一次字符串拼接
- 大量短命字符串
- 后续所有 `Map.get` / `Map.set` 都建立在长字符串 key 上

这本质上是在把 placement 语义编码成昂贵的字符串协议。

### 3. `ItemList.get` 的热点本质是长字符串 `Map.get`

像下面这种热点：

```ts
get: id => input.byId.get(id)
```

真正贵的不是箭头函数，而是：

- `id` 是重字符串
- `byId` 是 `Map<ItemId, ViewItem>`
- `ViewItem` 又只是一个很薄的对象

也就是：

- 最重的 key
- 查最薄的值

### 4. 当前 item 模型表达过重

当前 `ViewItem`：

```ts
interface ViewItem {
  id: ItemId
  recordId: RecordId
  sectionKey: SectionKey
}
```

但系统真正需要的事实只有两个：

1. 当前顺序里有哪些 item
2. 每个 item 对应哪个 `recordId` 和哪个 `sectionKey`

当前做法是把这两个事实包装成对象，再用 `Map<ItemId, ViewItem>` 存一次。

这不是最小模型。

## 三、必须先澄清的几个判断

### 1. `ItemId` 不能等于 `RecordId`

因为同一个 `recordId` 可以同时出现在多个 `section` 中。

所以 item identity 必须表达 placement，而不是 record identity。

也就是说：

- item 的真实身份是 `(sectionKey, recordId)`

不是：

- `recordId`

### 2. 但 item identity 也不等于字符串拼接

`placement` 是语义。

`itemId` 是 identity。

当前模型把它们硬绑定成：

- 可读字符串协议

这不是必须的。

长期最优里：

- `placement` 继续表达业务语义
- `itemId` 改成稳定、轻量、opaque 的内部 id

### 3. DOM 天然是 string 边界，但系统内部不需要跟着变 string

当前一部分逻辑把 `ItemId` 当 string 用，不是因为业务需要 string，而是因为：

- DOM attribute / dataset 返回 string
- 某些历史代码把 `itemId` 拼到字符串 key 里，再反解回来

这两类点都不是业务真约束，只是历史边界实现。

所以正确做法不是“因为 DOM 是 string，所以 `ItemId` 也必须是 string”，而是：

- 内部 `ItemId = number`
- DOM 走 bridge
- 少量字符串 key 走 codec

### 4. `WeakMap<Element, number>` 可行，但它只是 DOM bridge，不是 identity 模型

`WeakMap<Element, ItemId>` 很适合这些场景：

- pointer 事件命中
- mounted row / cell / card 反查
- 避免 `dataset -> parse -> lookup`

但它只能解决：

- `Element -> ItemId`

它解决不了：

- virtual layout key
- inline session key
- cell key
- 非 DOM 的跨层 identity

所以 `WeakMap<Element, number>` 值得做，但只能作为 bridge，不能代替 item 模型重构本身。

## 四、长期最优的最终模型

### 1. 核心语义：Placement

item 的底层语义就是 placement。

```ts
export interface ItemPlacement {
  sectionKey: SectionKey
  recordId: RecordId
}
```

这是 engine 内部的真实语义真源。

### 2. 核心 identity：`ItemId = number`

长期最优里，item identity 直接定义为 number。

```ts
export type ItemId = number
```

理由：

- number `Map` / `Set` 更轻
- 没有字符串拼接成本
- 没有 `encodeURIComponent`
- 没有大批临时字符串垃圾
- React key 也可直接使用

### 3. 核心分配器：ItemIdPool

不再每次即时拼 `itemId`，改成稳定分配。

```ts
export interface ItemIdPool {
  allocate: {
    placement(sectionKey: SectionKey, recordId: RecordId): ItemId
  }

  read: {
    placement(itemId: ItemId): ItemPlacement | undefined
  }

  gc: {
    keep(itemIds: ReadonlySet<ItemId>): void
    clear(): void
  }
}
```

约束：

- 对同一个 `(sectionKey, recordId)`，必须稳定返回同一个 `ItemId`
- `ItemId` 不承诺任何外部可读格式
- `ItemIdPool` 是 placement 到 identity 的唯一真源

### 4. 核心发布结果：Items 不再围绕 `ViewItem`

长期最优下，不再以 `Map<ItemId, ViewItem>` 为中心。

最终 item 结果应该是：

```ts
export interface PublishedItems {
  ids: readonly ItemId[]
  count: number

  order: {
    has(id: ItemId): boolean
    indexOf(id: ItemId): number | undefined
    at(index: number): ItemId | undefined
    prev(id: ItemId): ItemId | undefined
    next(id: ItemId): ItemId | undefined
    range(anchor: ItemId, focus: ItemId): readonly ItemId[]
    iterate(): IterableIterator<ItemId>
  }

  read: {
    record(id: ItemId): RecordId | undefined
    section(id: ItemId): SectionKey | undefined
    placement(id: ItemId): ItemPlacement | undefined
  }
}
```

关键点：

- 下线 `get(id) => ViewItem`
- 用更窄的 `record(id)` / `section(id)` / `placement(id)`
- 不再为每个 item 分配对象

### 5. Section 结果

```ts
export interface PublishedSection {
  key: SectionKey
  label: Token
  color?: string
  bucket?: SectionBucket
  collapsed: boolean

  recordIds: readonly RecordId[]
  itemIds: readonly ItemId[]
}
```

这里保留两套数组是合理的：

- `recordIds` 给 engine / summary / calculation 用
- `itemIds` 给 UI / selection / layout 用

但它们必须在同一次 placement materialize 中一起产出，不能各算各的。

## 五、publish 的长期最优流程

当前 publish 最大的问题，是围绕 `ViewItem` 做多轮重复投影。

长期最优应该改成：

### 1. 先确定 visible section

得到每个可见 section 的：

- `sectionKey`
- `recordIds`
- `meta`
- `collapsed`

这一轮还不生成对象，也不生成字符串 key。

### 2. 单次 materialize placement

对每个 visible section 的每个 `recordId`：

1. `itemId = itemIdPool.allocate.placement(sectionKey, recordId)`
2. 写入当前 section 的 `itemIds`
3. 写入全局 `visibleItemIds`
   仅当 section 未 collapsed
4. 写入 `recordByItemId`
5. 写入 `sectionByItemId`

这一轮结束时，所有 item projection 已经齐了。

这一步完成后，下面这些旧逻辑都应该删除：

- `buildItemsById`
- `projectSectionItemIds`
- 任何重复构造 item identity 的 publish helper

### 3. 基于 materialize 结果构造 publish 输出

直接构造：

- `PublishedSection[]`
- `PublishedItems`

不再需要：

- `Map<ItemId, ViewItem>`
- `createItemList({ byId })`

## 六、React / DOM 边界该怎么设计

长期最优里，DOM 不再承担 identity 真源职责。

### 1. DOM Bridge

```ts
export interface ItemDomBridge {
  bind: {
    node(node: Element, itemId: ItemId): void
  }

  read: {
    node(node: Element | null): ItemId | undefined
    closest(target: EventTarget | null): ItemId | undefined
  }

  clear: {
    node(node: Element): void
  }
}
```

内部实现可以是：

- `WeakMap<Element, ItemId>`

它负责：

- pointer 命中
- mounted row / cell / card 反查
- 避免 `dataset.rowId -> parse`

### 2. DOM attribute 的角色

`data-row-id` / appearance attr 可以保留，但只用于：

- 调试
- CSS / selector
- 某些不得不走 attribute 的极少数场景

它们不再是 item identity 的真源。

也就是说：

- 允许有 `data-row-id`
- 但业务逻辑不能依赖 `dataset.rowId` 反解出真实 `ItemId`

## 七、table virtual / measurement / inline key 的长期最优模型

这是这一轮必须一起重构的关键点。

当前像 [`layoutModel.ts`](dataview/packages/dataview-react/src/views/table/virtual/layoutModel.ts) 这种代码，问题不是性能，而是模型本身就把 `ItemId` 降级成字符串协议：

- `rowKeyOf(rowId) => "row:${rowId}"`
- 再 `slice(4)` 反解回来

这类模型必须整体下线。

### 1. 结构化 block key

长期最优应该改成结构化 block key，而不是字符串前缀协议。

```ts
export type TableBlockKey =
  | {
      kind: 'row'
      rowId: ItemId
    }
  | {
      kind: 'section-header'
      sectionKey: SectionKey
    }
  | {
      kind: 'column-header'
      sectionKey: SectionKey
    }
  | {
      kind: 'create-record'
      sectionKey: SectionKey
    }
  | {
      kind: 'column-footer'
      sectionKey: SectionKey
    }
```

内部索引都围绕这个结构化 key 工作。

### 2. measurement state 不再统一走 `Map<string, number>`

长期最优应该拆成按语义分开的 map：

```ts
export interface TableMeasuredHeights {
  row: ReadonlyMap<ItemId, number>
  sectionHeader: ReadonlyMap<SectionKey, number>
  columnHeader: ReadonlyMap<SectionKey, number>
  createRecord: ReadonlyMap<SectionKey, number>
  columnFooter: ReadonlyMap<SectionKey, number>
}
```

这样：

- 不需要 `row:${id}`
- 不需要 `slice(4)`
- 不需要字符串协议
- 结构更清晰

### 3. 组合字符串 key 只保留在明确边界

像下面这些地方：

- `tableCellKey`
- `inlineSessionKey`
- registry 内部 cell key

如果确实还需要组合 key，应该明确抽成 codec：

```ts
export interface ItemKeyCodec {
  cell(itemId: ItemId, fieldId: FieldId): string
  inline(viewId: ViewId, itemId: ItemId): string
}
```

规则是：

- 只允许在边界层组合字符串
- 不允许再用字符串协议反解业务 id

## 八、系统内哪些地方可以直接接受 `ItemId = number`

下面这些层本身没有 string 依赖，可以直接接受 `number`：

- engine state
- source runtime
- selection
- marquee
- hover
- drag state
- `Map<ItemId, T>`
- `Set<ItemId>`
- React key
- engine read api

真正需要改的不是这些地方，而是边界实现：

- DOM target resolve
- row / cell / card 节点命中
- table virtual layout key
- measurement key
- inline session key

## 九、为什么这是复杂度最低的方案

看起来这是一轮大重构，但它实际上是在删复杂度，而不是加复杂度。

### 当前复杂度来自

- 字符串 identity
- DOM string round-trip
- itemId 即时拼接
- prefix 协议
- `slice` 反解
- publish 多轮重复投影
- `Map<ItemId, ViewItem>` 中心模型

### 重构后的复杂度

- 内部只有一个 `number ItemId`
- placement 只有一个真语义
- DOM 只有一个 bridge
- virtual/layout 不再依赖字符串协议
- publish 只做一轮 placement materialize

这是典型的：

- 改动面变大
- 总体复杂度下降

## 十、不推荐的方案

下面这些都不是长期最优。

### 1. 保留 string `ItemId`，只去掉 `encodeURIComponent`

这会变快，但只是中期优化，不是最终形态。

问题仍然在：

- item identity 还是字符串
- publish 还是在重复投影
- layout 还是字符串协议

### 2. 给 `createItemId` 加缓存

这只是补丁：

- 生命周期复杂
- 缓存失效复杂
- 核心模型不变

### 3. 只上 `WeakMap<Element, number>`

这只能优化 DOM 热路径，不能解决：

- layout key
- inline key
- publish identity
- item list 模型

### 4. 保留 `ViewItem` 中心模型，只把 `Map` 换掉

这依然没有解决 item 模型过重的问题。

长期最优不是“换一种方式存 `ViewItem`”，而是让系统不再以 `ViewItem` 为核心。

## 十一、建议的最终 API

### 1. ItemIdPool

```ts
export type ItemId = number

export interface ItemIdPool {
  allocate: {
    placement(sectionKey: SectionKey, recordId: RecordId): ItemId
  }

  read: {
    placement(itemId: ItemId): ItemPlacement | undefined
  }

  gc: {
    keep(itemIds: ReadonlySet<ItemId>): void
    clear(): void
  }
}
```

### 2. PublishedItems

```ts
export interface PublishedItems {
  ids: readonly ItemId[]
  count: number

  order: {
    has(id: ItemId): boolean
    indexOf(id: ItemId): number | undefined
    at(index: number): ItemId | undefined
    prev(id: ItemId): ItemId | undefined
    next(id: ItemId): ItemId | undefined
    range(anchor: ItemId, focus: ItemId): readonly ItemId[]
    iterate(): IterableIterator<ItemId>
  }

  read: {
    record(id: ItemId): RecordId | undefined
    section(id: ItemId): SectionKey | undefined
    placement(id: ItemId): ItemPlacement | undefined
  }
}
```

### 3. PublishedSection

```ts
export interface PublishedSection {
  key: SectionKey
  label: Token
  color?: string
  bucket?: SectionBucket
  collapsed: boolean
  recordIds: readonly RecordId[]
  itemIds: readonly ItemId[]
}
```

### 4. ItemDomBridge

```ts
export interface ItemDomBridge {
  bind: {
    node(node: Element, itemId: ItemId): void
  }

  read: {
    node(node: Element | null): ItemId | undefined
    closest(target: EventTarget | null): ItemId | undefined
  }

  clear: {
    node(node: Element): void
  }
}
```

### 5. TableMeasuredHeights

```ts
export interface TableMeasuredHeights {
  row: ReadonlyMap<ItemId, number>
  sectionHeader: ReadonlyMap<SectionKey, number>
  columnHeader: ReadonlyMap<SectionKey, number>
  createRecord: ReadonlyMap<SectionKey, number>
  columnFooter: ReadonlyMap<SectionKey, number>
}
```

## 十二、推荐落地顺序

既然不在乎重构成本，推荐直接按最终形态推进。

## 第一阶段：先确定 `ItemId = number`

目标：

- engine / runtime / contracts 统一改成 `number`
- 下线旧的 string `ItemId`
- 引入 `ItemIdPool`

## 第二阶段：重写 membership publish

目标：

- 删除 `buildItemsById`
- 删除 `projectSectionItemIds`
- 改成单次 placement materialize
- 下线 `Map<ItemId, ViewItem>` 中心模型

## 第三阶段：重写 DOM bridge

目标：

- table / gallery / kanban 都走 `ItemDomBridge`
- 事件命中不再靠 `dataset -> parse`

## 第四阶段：重写 table virtual/layout

目标：

- 删除 `row:${id}` 协议
- 删除 `slice(4)` 反解
- 改成结构化 block key 与语义化 measurement state

## 第五阶段：清理所有剩余字符串协议

目标：

- `tableCellKey`
- `inlineSessionKey`
- 其它组合字符串 key

统一改成：

- typed model
- 或少量明确 codec

## 十三、实施完成后应得到什么结果

实施完成后，这条链上的结构应该出现这些变化：

- 不再有 `createItemId` 热点
- 不再有 itemId 批量字符串垃圾
- 不再有 `Map<ItemId, ViewItem>` 中心结构
- publish 只做一轮 placement 扫描
- DOM 命中不再依赖 `dataset -> parse`
- table virtual 不再有字符串 block key 协议
- selection / drag / hover / runtime 统一使用 number identity

最终效果不是“局部快几毫秒”，而是：

- item 语义正确
- identity 更轻
- publish 更短
- 边界更清晰
- 复杂度更低

这才是在“一个 record 可以出现在多个 section”前提下，`dataview-engine` item 模型的长期最优解。
