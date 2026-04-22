# Dataview Engine 大型 Keyed Table Store 重构方案

本文只讨论一件事：

在 `50k+` item 的 filter / group / section 变化下，如何把当前 `engine -> publish/store -> runtime/react` 这条发布链，重构到长期最优形态。

本文明确前提：

- 不在乎重构成本
- 不需要兼容
- 目标是最优形态，不是过渡形态
- 性能必须优于当前实现
- 复杂度必须低于当前实现

---

## 1. 现状判断

当前最主要的剩余发布热点不在 engine 推导，而在 store adapter 和底层 keyed store。

当前热链大致是：

1. core 产出一份 `ItemChange`
2. `publish/store/runtime.ts` 的 `applyItemChange()` 把一份 `ItemChange` 拆成：
   - `recordSet`
   - `sectionSet`
   - `placementSet`
3. 对三份 `KeyedStore` 分别执行 `patch()`
4. `shared/core/src/store/keyed.ts` 的 `patch()`：
   - clone 整张 `Map`
   - 遍历全部 changed keys
   - `commit()` 再遍历一遍全部 changed keys
   - 对每个 key 再判断 listener

这意味着：

- 一个逻辑上的 item delta，被发布层物理放大成了 3 次 patch
- 每次 patch 又被通用 `KeyedStore.patch()` 放大成 clone + commit + listener fanout

所以现在剩余的 20ms，本质上不是业务计算慢，而是发布模型不够收敛。

---

## 2. 对当前模型的结论

当前模型的问题不在于“还没有 delta”，而在于 delta 的形态不适合发布。

现在的 `ItemChange` 已经比旧方案强很多，因为：

- core 已经只算一次
- adapter 不再拿 `previousSnapshot/nextSnapshot` 再做一轮 diff

但它仍然不是最终形态，因为：

1. `ItemChange` 还是语义 delta，不是发布真源
2. item source 仍然被实现成三份物理 keyed store
3. 底层 `KeyedStore` 是通用 patch 容器，不是大型 table 容器

这三点叠起来，导致：

- 发布成本依然线性放大
- listener 稀疏时仍然会遍历大量无订阅 key
- item/source 仍然不是一个真正的“单真源表”

---

## 3. 最终结论

长期最优方案不是继续优化当前 `KeyedStore.patch()` 的常数，也不是继续在 adapter 里做更多特判。

长期最优方案是：

1. 在 `shared/core/store` 新增一个专门面向大型 keyed table 的底层设施
2. item source 改成一份 `ItemValue` table 真源
3. `record / section / placement` 只作为投影读面，不再是三份物理 store
4. adapter 只向这份 table apply 一次 `ItemChange`
5. table store 内部只比较有订阅的 key，不再对全部 changed keys 遍历

一句话概括：

> item 的发布真源应该是 `Table<ItemId, ItemValue>`，而不是三份平行 keyed store

---

## 4. 目标

这次重构只追求四件事：

1. item 发布只 apply 一次
2. 底层只维护一份 item 真源
3. 对大 patch 不再 clone 全表
4. 没有订阅的 key 不参与比较和通知

---

## 5. 非目标

下面这些不是本次重构的主目标：

- 重写 query / membership / summary 的业务推导
- 重写 section 或 summary 的发布模型
- 让所有 keyed store 都换成新设施
- 维持旧 `item.read.record/section/placement` 的内部实现方式

重点是：

- 只针对大规模、热路径、密集变更的 item/source 链路动刀
- 小规模 keyed 数据仍可继续用现有 `KeyedStore`

---

## 6. 适用边界

新设施只适合下面这类数据：

- key 数量大
- patch 数量大
- 更新频繁
- 订阅是稀疏的、按 key 分布的
- value 是结构化对象
- 经常需要从一个真值投影出多个字段读面

典型场景：

- `ItemId -> ItemValue`

不建议优先用于：

- `ViewId -> View`
- `FieldId -> Field`
- `SectionKey -> Section`
- `SectionKey -> Summary`

因为这些集合通常不够大，通用 `KeyedStore` 已经够用。

---

## 7. 最终底层设施

建议在：

`shared/core/src/store/keyTable.ts`

新增一套专门设施。

命名直接用 `KeyTable`，不搞抽象缩写。

---

## 8. 最终核心模型

### 8.1 TablePatch

```ts
export interface TablePatch<K, V> {
  set?: readonly (readonly [K, V])[]
  remove?: readonly K[]
}
```

### 8.2 KeyTableReadStore

```ts
export interface KeyTableReadStore<K, V> {
  read: {
    get: (key: K) => V | undefined
    has: (key: K) => boolean
    all: () => ReadonlyMap<K, V>
    size: () => number
  }
  subscribe: {
    key: (key: K, listener: () => void) => () => void
  }
}
```

### 8.3 KeyTableStore

```ts
export interface KeyTableStore<K, V> extends KeyTableReadStore<K, V> {
  write: {
    replace: (next: ReadonlyMap<K, V>) => void
    apply: (patch: TablePatch<K, V>) => void
    clear: () => void
  }
  project: {
    field: <T>(
      select: (value: V | undefined) => T,
      isEqual?: (left: T, right: T) => boolean
    ) => KeyedReadStore<K, T>
  }
}
```

这里的结构刻意按职责拆开：

- `read`
- `subscribe`
- `write`
- `project`

不做扁平大接口。

---

## 9. 新设施的关键语义

### 9.1 `replace(nextMap)`

适用场景：

- 初始化
- reset
- 整体切换 view
- 整体清空

语义：

- 直接替换当前表
- 只检查“当前有订阅的 key”
- 只对这些 key 比较 `previous/next`
- 只通知真正变化的订阅 key

### 9.2 `apply(set/remove)`

适用场景：

- filter 变化
- section membership 变化
- item placement 变化

语义：

- 直接原地修改内部 `Map`
- 不 clone 全表
- 只对 patch 命中的、并且有订阅的 key 做比较和通知
- 没订阅的 key 只做写入，不做多余工作

---

## 10. 内部实现原则

### 10.1 真源只有一张表

内部只维护：

```ts
Map<K, V>
```

不再维护：

- 平行三份 `Map`
- 三份 `changedKeys`
- 三次 `patch -> commit`

### 10.2 只跟踪已订阅 key

内部必须维护：

- `listenersByKey: Map<K, Set<Listener>>`

并以此为依据决定是否比较某个 key。

原则：

- 没有监听的 key，只写，不比，不通知
- 监听过的 key，才参与 `previous/next` 判断

### 10.3 `replace` 不遍历全量 changed keys

`replace(nextMap)` 不能像当前 `KeyedStore.commit()` 一样遍历所有变化 key。

它应该只遍历：

- 当前 `listenersByKey` 里存在监听的 key

这样才能把“50k 变化，但只订阅几百个 key”的场景压下来。

### 10.4 `apply` 不 clone 全表

`apply(set/remove)` 不允许先 `new Map(current)`。

因为对于 item/source 这类大表，clone 是纯发布税。

更优方式是：

- 原地改内部 `Map`
- 只对有订阅的被命中 key 取 `previous`
- 写完后只通知真正变的订阅 key

### 10.5 投影必须是按 key 投影，不是按整表投影

这点非常关键。

不能用现在这种“整张 source store 变了，再从里面投影 keyed read”的模式，因为那会让整个 source 成为依赖源。

最终投影必须是：

- 对同一个 key 订阅 table
- 对该 key 的值做字段投影
- 对投影值做 equality

也就是说：

```ts
itemTable.project.field(value => value?.record)
itemTable.project.field(value => value?.section)
itemTable.project.field(value => value?.placement)
```

这些投影的订阅粒度仍然是单 key，而不是整表。

---

## 11. 为什么不是继续用 `createProjectedKeyedStore`

当前 `shared/core/src/store/projected.ts` 里的 `createProjectedKeyedStore()` 不是长期最优。

原因不是它错，而是它的 source 模型不对。

它的输入是：

- 一个普通 `ReadStore<Source>`
- 然后 `select(source) -> ReadonlyMap<Key, Value>`

这意味着：

- source 是整表级依赖
- 即使最终暴露的是 keyed read，底层也还是先依赖整表 source

这不适合 `ItemId -> ItemValue` 这种 50k 热路径。

长期最优应该是：

- table 本身就是 keyed source
- 投影直接建立在 table key 上

所以这里不应该复用 `createProjectedKeyedStore()`，而应该新增一个基于 `KeyTableStore` 的 `project.field()` 能力。

---

## 12. Dataview Item Source 的最终形态

### 12.1 ItemValue

```ts
export interface ItemValue {
  record: RecordId
  section: SectionKey
  placement: ItemPlacement
}
```

### 12.2 ItemSource

```ts
export interface ItemSource {
  ids: ReadStore<readonly ItemId[]>
  table: KeyTableReadStore<ItemId, ItemValue>
  read: {
    record: KeyedReadStore<ItemId, RecordId | undefined>
    section: KeyedReadStore<ItemId, SectionKey | undefined>
    placement: KeyedReadStore<ItemId, ItemPlacement | undefined>
  }
}
```

说明：

- 对外仍然可以保留 `read.record / read.section / read.placement`
- 但底层真源只剩 `table`
- `read.*` 只是 `table.project.field(...)`

这就是最终一致性最强、复杂度最低的形态。

---

## 13. publish/store 最终实现

### 13.1 当前错误形态

当前 `applyItemChange()` 的做法是：

1. 从 `ItemChange` 构造三份 patch 数组
2. patch 三个 store

这是必须删除的。

### 13.2 最终形态

最终 adapter 只做：

```ts
itemIds.set(change.ids ?? snapshot.items.ids)
itemTable.write.apply({
  set: change.set,
  remove: change.remove
})
```

就这两步。

不再做：

- `recordSet`
- `sectionSet`
- `placementSet`

投影读面自动跟随 `itemTable` 变化。

---

## 14. 为什么这才是长期最优

这个方案能同时解决当前三类浪费。

### 14.1 去掉 3 倍 fanout

原来：

- 一份 item 变化
- 三份 store patch

现在：

- 一份 item 变化
- 一次 table apply

### 14.2 去掉全表 clone

原来：

- 每个 keyed store 首次 patch 时都要 `new Map(current)`

现在：

- table 原地 apply
- 不 clone 全表

### 14.3 去掉无订阅 key 的无效 compare

原来：

- 所有 changed keys 都要进 `commit()`

现在：

- 只有被订阅的 key 才做 compare / notify

这点在虚拟化 UI 下尤其重要，因为真正被订阅的 item key 通常远少于总 key 数。

---

## 15. 适配到 Dataview 的实施方案

### 第一步：新增 shared/core 底层设施

新增文件：

```text
shared/core/src/store/keyTable.ts
```

导出：

- `createKeyTableStore`
- `KeyTableReadStore`
- `KeyTableStore`
- `TablePatch`

必要时在 `shared/core/src/store/index.ts` 中导出。

### 第二步：新增按 key 投影能力

在 `KeyTableStore.project.field()` 中实现：

- `value => value.record`
- `value => value.section`
- `value => value.placement`

这一步是关键，不允许用整表 source 做投影。

### 第三步：重写 item source runtime

在：

`dataview/packages/dataview-engine/src/publish/store/runtime.ts`

里把当前：

- `record: KeyedStore`
- `section: KeyedStore`
- `placement: KeyedStore`

改成：

- `table: KeyTableStore<ItemId, ItemValue>`
- `read.record = table.project.field(...)`
- `read.section = table.project.field(...)`
- `read.placement = table.project.field(...)`

### 第四步：删除 `applyItemChange` fanout

当前的：

- `recordSet`
- `sectionSet`
- `placementSet`

全部删除。

最终只保留：

- `ids.set(...)`
- `table.write.apply(...)`

### 第五步：保留其余小集合 store

下面这些先不改：

- document records / fields / views
- active sections
- active summaries
- active fields

因为它们不是当前大热点。

### 第六步：补 item/source 级基准测试

必须新增基准：

1. `50k` filter change，visible item 大量删除
2. `50k` filter change，visible item 大量新增
3. `50k` grouped section 变化，placement 大量变化
4. 稀疏订阅下，viewport 只有少量 item 被订阅

基准目标不是单纯看 patch 总时间，而是要确认：

- 无订阅 key 不再进入 compare 主路径

---

## 16. 需要删除的旧实现

下面这些必须删，不保留兼容：

- item source 三份物理 keyed store 结构
- `applyItemChange()` 里的三份数组构造
- 任何围绕 item store fanout 的辅助函数
- 任何“把 `ItemValue` 再拆成三个 store 真源”的内部模型

如果保留这些旧结构，就会把新模型的收益吃掉。

---

## 17. 对 `KeyedStore` 的最终定位

重构完成后，`KeyedStore` 的定位应该更明确：

- 它是通用 keyed store
- 适合小规模 keyed entity
- 不再承担大型热路径 table 的真源职责

而新的 `KeyTableStore` 定位是：

- 大型 keyed table 专用 store
- 面向高频大 patch
- 面向稀疏 key 订阅
- 面向结构化 value 和字段投影

这两个设施并存是合理的。

不要试图让一个通用 `KeyedStore` 同时吃掉这两类需求。

---

## 18. 完成后的最终判断标准

重构完成后，系统应满足下面这些条件。

### 18.1 数据模型

- item 真源只有一份 `KeyTable<ItemId, ItemValue>`
- `record / section / placement` 只是投影读面

### 18.2 发布模型

- adapter 对 item 只 apply 一次
- 不再构造三份 fanout patch

### 18.3 底层算法

- `replace` 不遍历所有 changed keys
- `apply` 不 clone 全表
- 只有有订阅的 key 才参与 compare / notify

### 18.4 性能表现

- `50k` filter change 下，item/source 发布耗时显著下降
- `shared/core/store/keyed.ts patch` 不再是 item 热点
- 火焰图里的 item/source patch 不再出现 3 倍重复结构

---

## 19. 最终建议

如果目标是长期最优，就不要继续在当前这条链上修常数。

真正应该做的是：

1. 新增 `KeyTableStore`
2. 把 item/source 收成一份 table 真源
3. 把 `record / section / placement` 降级为投影读面

这是最稳、最清晰、长期错误率最低的形态。

继续沿着现在的“三份 keyed store + 通用 patch”打补丁，只会把结构越修越复杂。

真正的最终形态应该是：

- core 产出一份 `ItemChange`
- adapter apply 到一份 `ItemValue` table
- UI 通过 table projection 按 key 读取字段

这才是 item 发布链路的长期最优设计。
