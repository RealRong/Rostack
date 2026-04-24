# DATAVIEW Runtime Source Table Store 长期最优重构方案

## 前提

- 目标不是继续在 `applyDocumentValueDelta`、`applyEntityDelta` 上做局部循环优化。
- 目标是把 dataview runtime source 的底层 store 模型摆正。
- 只接受一步到位的长期最优方案，不保留 source 层的兼容双轨。
- 优先级是：
  1. 先区分“大型 source table”和“小型 UI keyed state”
  2. 再统一 source table 底层模型
  3. 最后才考虑局部 patch 细节

这份文档只讨论一件事：

- `shared/core/src/store/keyed.ts` 的 copy-on-write keyed store，哪些地方不该再用
- dataview-runtime source 这条链，长期最优应该统一成什么底层模型

## 问题根因

### 1. `createKeyedStore.patch()` 的真实成本是整图 clone

当前 [keyed.ts](/Users/realrong/Rostack/shared/core/src/store/keyed.ts#L126) 的 `patch()` 逻辑是：

- 先遍历 patch
- 只要发现第一个真正变化的 key
- 就执行一次 `next = new Map(current)`
- 后续所有写入都落在 `next` 上

也就是说，它的主成本不是：

- `set` 数组长度
- `delete` 数组长度

而是：

- `current.size`

这是一种典型的 copy-on-write 语义，复杂度接近：

- `O(current.size + changedKeys.size)`

对于小型 keyed state 没问题，但对大型 source table 会非常不合适。

### 2. `document.values` 是放大这个问题的最典型场景

当前 [createDocumentSource.ts](/Users/realrong/Rostack/dataview/packages/dataview-runtime/src/source/createDocumentSource.ts#L130) 的 `applyDocumentValueDelta()` 最后会把本次 value 变化一次性送进：

- [values.store.patch(...)](/Users/realrong/Rostack/dataview/packages/dataview-runtime/src/source/createDocumentSource.ts#L191)

问题在于 `document.values` 不是 record 表，而是展开后的 value 表：

- 每条 record 至少有一个 title value
- 还会加上所有已存在 field value
- 50k record 对应的 entry 数通常远大于 50k

因此这里的 `new Map(current)` 会直接变成大表 clone。

这类热点不是循环技巧问题，而是底层模型问题。

### 3. `EntitySourceRuntime.values` 也是同一类问题

当前 [patch.ts](/Users/realrong/Rostack/dataview/packages/dataview-runtime/src/source/patch.ts#L23) 的 `createEntitySourceRuntime()` 也是建立在 `createKeyedStore` 上，而 [applyEntityDelta()](/Users/realrong/Rostack/dataview/packages/dataview-runtime/src/source/patch.ts#L61) 的语义又是非常明确的：

- `update -> set[]`
- `remove -> delete[]`

这本质上就是 exact patch table，不需要 copy-on-write。

所以这里的问题不是只有 `document.values` 一处，而是整个 runtime source table 体系混用了两种不一致的底层模型：

- 一部分 source table 用 `createKeyedStore`
- 一部分 source table 用 `createKeyTableStore`

这不是长期最优。

## 长期最优原则

### 1. source table 和 UI keyed state 必须分开

长期最优里要明确分成两类。

#### A. source table

特点：

- entry 数可能很大
- 由 snapshot / delta 驱动
- 写入是 exact set/remove
- 关注的是 key 级通知
- 不需要 copy-on-write map 快照承诺

这类 store 不该继续用 `createKeyedStore`。

#### B. UI keyed state

特点：

- entry 数通常较小
- 生命周期短
- 主要用于 selection / hover / fill / preview membership
- 写入频率高但表通常不大

这类 store 继续用 `createKeyedStore` 没问题。

所以不应该一刀切地说“把所有 keyed store 都替换掉”。真正需要替换的是：

- 所有 runtime source table

而不是：

- 所有 keyed state

### 2. dataview runtime source 必须统一到底层 table store

既然 [createActiveSource.ts](/Users/realrong/Rostack/dataview/packages/dataview-runtime/src/source/createActiveSource.ts#L262) 里的 `items` 已经使用了 [keyTable.ts](/Users/realrong/Rostack/shared/core/src/store/keyTable.ts#L157) 这一类原地 apply 的模型，那么长期最优不应该继续让其他 source table 留在 `createKeyedStore` 上。

最终应该统一：

- source tables 全部走同一套 table store
- delta 写入全部走 exact patch
- key 级订阅语义一致

### 3. 最简单的长期方案是直接标准化到 `KeyTableStore`

长期最优这里不建议再发明第三种 primitive。

原因很简单：

- `keyTable` 已经存在
- `items` 已经在用
- 它的语义和 source table 高度匹配
- 它避免了 `new Map(current)` 这类固定成本

所以长期最优方案应直接定为：

- dataview runtime source table 全部标准化到 `KeyTableStore<Key, Value>`

而不是：

- `document.values` 单独魔改
- `entity source` 继续沿用 `createKeyedStore`
- 或者再造一个新的近似重复 store primitive

## 最终底层模型

### 一. `createKeyedStore` 的职责收缩

长期最优里，[keyed.ts](/Users/realrong/Rostack/shared/core/src/store/keyed.ts) 不需要马上删除，但职责必须明确收缩为：

- 小型 keyed UI state
- 临时 membership / preview state
- 低规模 local runtime state

它不应再出现在：

- dataview runtime source
- document published table
- active published table
- 大型 delta apply 链路

### 二. source table 全部标准化到 `KeyTableStore`

source table 的长期最优底层应统一成：

```ts
interface SourceTableRuntime<Key, Value> {
  table: store.KeyTableStore<Key, Value>
}
```

具体语义：

- reset / whole snapshot replace:
  - `table.write.clear() + table.write.applyExact(...)`
  - 或者 `table.write.replace(...)`
- delta apply:
  - `table.write.applyExact({ set, remove })`
- read:
  - `table.read.get(key)`
- subscribe:
  - `table.subscribe.key(key, listener)`
- per-field projection:
  - `table.project.field(...)`

### 三. source public read 接口继续保持 keyed read 语义

尽管底层换成 `KeyTableStore`，对外 public source 接口不需要暴露整套 table API。

也就是说，长期最优不是把 runtime/source public API 改成：

- `source.records.table.read.get`
- `source.values.table.read.get`

而是：

- source public 继续暴露 `get / subscribe`
- 内部 runtime 持有 `table`

例如：

```ts
interface EntitySourceRuntime<Key, Value> {
  source: EntitySource<Key, Value>
  ids: store.ValueStore<readonly Key[]>
  table: store.KeyTableStore<Key, Value>
  clear(): void
}
```

其中：

- `source.get = key => table.read.get(key)`
- `source.subscribe = (key, listener) => table.subscribe.key(key, listener)`

这样对上层 API 没有额外复杂度，底层又摆正了。

## 必须替换的范围

下面这些属于长期最优里必须替换的部分。

### 1. `DocumentSourceRuntime.values`

文件：

- [createDocumentSource.ts](/Users/realrong/Rostack/dataview/packages/dataview-runtime/src/source/createDocumentSource.ts)

必须替换原因：

- 当前是最大热点
- entry 规模最大
- exact patch 语义最明确
- 继续使用 `createKeyedStore` 没有任何长期合理性

最终应改成：

- `ValueId -> unknown` 的 `KeyTableStore`
- public `source: KeyedReadStore<ValueRef, unknown>` 只做包装
- `applyDocumentValueDelta` 改成 `table.write.applyExact(...)`

### 2. `EntitySourceRuntime.values`

文件：

- [patch.ts](/Users/realrong/Rostack/dataview/packages/dataview-runtime/src/source/patch.ts)

必须替换原因：

- 它是 source table 通用基础设施
- 现在所有 entity source 都被绑在 `createKeyedStore` 上
- 只替 `document.values` 不替它，会导致 source infra 永久双轨

最终应改成：

- `values` 字段直接改为 `table`
- `resetEntityRuntime()` 基于 `table.write`
- `applyEntityDelta()` 基于 `table.write.applyExact`

这一步会连带影响：

- `document.records`
- `document.fields`
- `document.views`
- `active.fields.all`
- `active.fields.custom`
- `active.sections`
- `active.summaries`

### 3. `createActiveSource.ts` 里仍然使用 `createKeyedStore` 的 source table

文件：

- [createActiveSource.ts](/Users/realrong/Rostack/dataview/packages/dataview-runtime/src/source/createActiveSource.ts)

必须替换的具体对象：

- `sections`
- `summaries`

原因：

- 它们和 `items` 都是 active published table
- `items` 已经在用 `KeyTableStore`
- `sections / summaries` 继续留在 `createKeyedStore` 上，长期语义不统一

长期最优里这三者应该统一成同一类 source table runtime。

## 建议一起替换的范围

### 4. `document.records / fields / views`

这些虽然不一定像 `document.values` 那么热，但仍然属于 entity source table。

长期最优里不建议只因为“当前还没打到 profile 热点”就继续保留旧底层。因为这样会留下长期不一致：

- 同样叫 source
- 同样叫 entity
- 同样走 delta
- 底层却分成 `createKeyedStore` 和 `KeyTableStore`

这不是长期最优。

### 5. `active.fields.all / active.fields.custom`

原因同上。

虽然规模通常不如 values 大，但：

- 模型完全一致
- 一次性替换成本最低
- 替完后 source infra 才真正统一

## 可以保留的范围

下面这些不需要因为这轮问题跟着替换。

### 1. table react runtime 的 membership store

文件：

- [fill.ts](/Users/realrong/Rostack/dataview/packages/dataview-react/src/views/table/runtime/fill.ts)
- [hover.ts](/Users/realrong/Rostack/dataview/packages/dataview-react/src/views/table/runtime/hover.ts)
- [select.ts](/Users/realrong/Rostack/dataview/packages/dataview-react/src/views/table/runtime/select.ts)

这些可以保留 `createKeyedStore`，因为它们是：

- UI membership
- 短生命周期
- 规模通常较小
- 不属于 published source table

### 2. marquee preview membership

文件：

- [marquee.ts](/Users/realrong/Rostack/dataview/packages/dataview-runtime/src/session/marquee.ts#L172)

也可以保留。

这是交互态 preview state，不是 runtime source table。

### 3. kanban runtime 的局部 keyed store

文件：

- [kanban/runtime/layout.ts](/Users/realrong/Rostack/dataview/packages/dataview-react/src/views/kanban/runtime/layout.ts)
- [kanban/runtime/visibility.ts](/Users/realrong/Rostack/dataview/packages/dataview-react/src/views/kanban/runtime/visibility.ts)

也不属于这轮必须替换的范围。

## 最终替换清单

### 第一批，必须先替换

- [dataview/packages/dataview-runtime/src/source/createDocumentSource.ts](/Users/realrong/Rostack/dataview/packages/dataview-runtime/src/source/createDocumentSource.ts)
  - `DocumentSourceRuntime.values`
  - `resetDocumentValues`
  - `applyDocumentValueDelta`

- [dataview/packages/dataview-runtime/src/source/patch.ts](/Users/realrong/Rostack/dataview/packages/dataview-runtime/src/source/patch.ts)
  - `EntitySourceRuntime`
  - `createEntitySourceRuntime`
  - `resetEntityRuntime`
  - `applyEntityDelta`

### 第二批，跟着第一批统一

- [dataview/packages/dataview-runtime/src/source/createActiveSource.ts](/Users/realrong/Rostack/dataview/packages/dataview-runtime/src/source/createActiveSource.ts)
  - `createSectionSourceRuntime`
  - `createSummarySourceRuntime`
  - `resetActiveSource` 内 sections / summaries 的 reset
  - `applyActiveDelta` 内 sections / summaries 的 delta apply

### 第三批，shared/core 职责收口

- [shared/core/src/store/keyed.ts](/Users/realrong/Rostack/shared/core/src/store/keyed.ts)
  - 保留，但明确只用于小型 keyed state

- [shared/core/src/store/keyTable.ts](/Users/realrong/Rostack/shared/core/src/store/keyTable.ts)
  - 提升为 runtime source table 标准模型

## 最终判断

一句话总结：

- 不需要替换所有 `createKeyedStore`
- 但必须替换所有 dataview runtime source table 上的 `createKeyedStore`

长期最优里应明确形成下面这条边界：

- `createKeyedStore`
  - 只给小型 UI keyed state 用

- `KeyTableStore`
  - 给 runtime source / published table / exact delta apply 用

当前这次 50k 数据下 `ensureNext -> new Map(current)` 的 25ms，不是局部循环问题，而是在明确告诉我们：

- dataview-runtime source 这条链的底层 store 模型不对

所以真正需要替换的不是某一个 patch 函数，而是：

- `DocumentSourceRuntime.values`
- `EntitySourceRuntime.values`
- `createActiveSource` 中仍然挂在 `createKeyedStore` 上的 source tables

这才是长期最优需要完成的一整套替换。
