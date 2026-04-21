# Dataview Engine 多 Section Item 模型长期最优方案

本文只讨论一件事：

在下面这个前提成立时，`dataview-engine` 的 item / membership / publish / runtime / react / DOM 边界，长期最优应该如何统一。

- 同一个 `section` 内，`recordId` 不会重复。
- 同一个 `recordId`，可以同时出现在多个 `section` 里。

这意味着：

- `item` 不能退化成 `record`
- `itemId` 不能直接等于 `recordId`
- 当前 `sectionKey + ':' + recordId` 的字符串协议也不是最终形态

## 一、最终结论

长期最优方案是：

1. 内部 `ItemId = number`
2. item 的真实语义是 `placement = (sectionKey, recordId)`
3. publish 阶段只做一次 placement materialize
4. runtime/source/read 统一改成 `read.record / read.section / read.placement`
5. DOM 只保留 bridge，不再让 attribute / dataset 成为真源
6. table virtual 不再依赖 row id 反解协议，内部改成结构化 block id + codec

换句话说：

- 不是继续优化 `createItemId`
- 不是保留 `Map<ItemId, ViewItem>`
- 不是继续让 `dataset.rowId -> parse -> lookup` 充当主路径

而是：

- 直接删掉旧的 string item identity 模型
- 让 placement 和 opaque id 各自承担清晰职责

## 二、核心模型

### 1. Placement

```ts
export interface ItemPlacement {
  sectionKey: SectionKey
  recordId: RecordId
}
```

这是 item 的业务语义真源。

### 2. ItemId

```ts
export type ItemId = number
```

它只承担内部 identity，不承诺可读格式。

### 3. ItemIdPool

```ts
export interface ItemIdPool {
  allocate: {
    placement: (sectionKey: SectionKey, recordId: RecordId) => ItemId
  }
  read: {
    placement: (itemId: ItemId) => ItemPlacement | undefined
  }
  gc: {
    keep: (itemIds: ReadonlySet<ItemId>) => void
    clear: () => void
  }
}
```

约束：

- 同一 active view 生命周期内，同一个 placement 必须稳定返回同一个 `ItemId`
- filter / sort / visible 变化不应让已有 placement 重新分配 id
- view 切换或 runtime clear 时再整体清空

### 4. PublishedItems

```ts
export interface PublishedItems {
  ids: readonly ItemId[]
  count: number
  order: OrderedAccess<ItemId>
  read: {
    record: (itemId: ItemId) => RecordId | undefined
    section: (itemId: ItemId) => SectionKey | undefined
    placement: (itemId: ItemId) => ItemPlacement | undefined
  }
}
```

关键点：

- 下线 `get(id) => ViewItem`
- 不再为每个 item 分配对象
- 一切访问都走更窄的 read namespace

### 5. PublishedSection

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

`recordIds` 和 `itemIds` 都保留：

- `recordIds` 给 summary / calculation / engine 语义读路径
- `itemIds` 给 selection / drag / layout / react

但两者必须在同一次 placement materialize 中一起产出，不能分开投影。

## 三、publish 最终流程

### 1. 先确定可发布 section

对 membership state 只做一轮遍历，过滤掉隐藏 bucket，保留：

- `sectionKey`
- `recordIds`
- `meta`
- `collapsed`

### 2. 单次 materialize placement

对每个 section 的每个 `recordId`：

1. `itemId = itemIdPool.allocate.placement(sectionKey, recordId)`
2. 写入 section 的 `itemIds`
3. 写入全局可见 `items.ids`
4. 写入 `recordByItemId`
5. 写入 `sectionByItemId`
6. 写入 `placementByItemId`

这一轮结束后，publish 需要的全部 item projection 都已经齐了。

这意味着旧逻辑应直接删除：

- `createItemId`
- `buildItemsById`
- `projectSectionItemIds`
- 任何围绕 `ViewItem` 的重复投影 helper

### 3. 基于 materialize 结果构造 publish 输出

直接发布：

- `SectionList`
- `PublishedItems`

不再中心化保存 `Map<ItemId, ViewItem>`。

## 四、runtime / source / read 统一形态

### 1. snapshot 读模型

```ts
state.items.read.record(itemId)
state.items.read.section(itemId)
state.items.read.placement(itemId)
```

### 2. source 读模型

```ts
source.active.items.read.record
source.active.items.read.section
source.active.items.read.placement
```

### 3. active read api

```ts
engine.active.read.placement(itemId)
```

不再暴露 `read.item()` 这种回到旧对象模型的接口。

## 五、DOM 边界

### 1. 最终原则

- DOM 不是 item identity 真源
- DOM 只负责 `Element -> ItemId`
- `dataset` / attribute 可以保留给调试和 selector，但业务逻辑不能依赖它们反解真实 id

### 2. ItemDomBridge

```ts
export interface ItemDomBridge {
  bind: {
    node: (node: Element, itemId: ItemId) => void
  }
  read: {
    node: (node: Element | null) => ItemId | undefined
    closest: (target: EventTarget | null) => ItemId | undefined
  }
  clear: {
    node: (node: Element) => void
  }
}
```

实现可以是：

- `WeakMap<Element, ItemId>`

适用场景：

- table cell / row pointer hit
- row hover
- card inline session host

## 六、table virtual 最终模型

### 1. 内部 block id 使用结构化模型

```ts
export type TableBlockId =
  | { kind: 'row'; rowId: ItemId }
  | { kind: 'section-header'; sectionKey: SectionKey }
  | { kind: 'column-header'; sectionKey: SectionKey }
  | { kind: 'create-record'; sectionKey: SectionKey }
  | { kind: 'column-footer'; sectionKey: SectionKey }
```

### 2. 对外 key 只保留 codec

```ts
tableBlockKey(id: TableBlockId): string
parseTableBlockKey(key: string): TableBlockId | undefined
```

要求：

- React key / measurement hook 可以继续消费字符串 key
- layoutModel 内部定位不再依赖 `slice(4)` 反解 row id
- anchor / compensate / top lookup 统一优先走结构化 `TableBlockId`

### 3. measurement 的边界原则

- 结构化 id 是内部真源
- 字符串 key 只作为测量系统的边界 codec
- 不再让字符串协议反过来决定业务模型

## 七、已落地的最终状态

这一轮落地完成后，系统应满足：

- `ItemId` 已统一为 `number`
- `ViewItem` 已删除
- `MoveTarget` 和 `ItemPlacement` 职责分离
- membership publish 已改成一次 placement materialize
- source / runtime / engine read 已统一到 `read.record / read.section / read.placement`
- filter 加减、sort 变化、group 可见性变化下，已出现过的 placement 不再抖动 item id
- table pointer / hover / inline host 主路径已可通过 DOM bridge 回到 `ItemId`
- table virtual 内部已具备结构化 block id，不再依赖 row key 反解

## 八、明确不再保留的旧模型

- `createItemId(sectionKey, recordId)`
- `ItemId = string`
- `Map<ItemId, ViewItem>`
- `state.items.get(itemId)`
- `source.active.items.get(itemId)`
- `engine.active.read.item(itemId)`
- table virtual 内部的 `row:${id}` -> `slice(4)` 反解逻辑

## 九、为什么这是长期最优

这条方案同时满足三件事：

1. 热路径更轻：不再批量分配字符串 itemId，也不再重复投影 `ViewItem`
2. 结构更短：publish/source/read/DOM 都围绕同一套 placement + opaque id 模型
3. 出错概率更低：字符串协议和对象中间层被删除后，状态错位面会明显减少

这不是“把某个热点再优化几毫秒”，而是把 item identity 这条主链改成更便宜、更稳定、也更不容易写错的底层模型。
