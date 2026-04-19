# DATAVIEW Store Read Path 审计完成度与下一阶段方案

## 1. 目的

这份文档承接两份已有文档：

- `DATAVIEW_STORE_READ_PATH_PERF_AUDIT.zh-CN.md`
- `DATAVIEW_TABLE_KANBAN_HOVER_VISIBILITY_RENDER_REFACTOR.zh-CN.md`

目标不是重复原审计，而是回答一个更具体的问题：

- 截至当前代码，原审计里的问题哪些已经完成
- 哪些还没完成
- 剩余问题的优先级和实施顺序应该是什么

结论先行：

- `shared/core` 的 family cache 读路径优化已完成。
- table / kanban 的高频 hover / visibility / render 混合源重构已基本完成。
- 但原审计里更大的 P0 项“`dataview-runtime` keyed model 去 whole-state 依赖化”还没有完成。
- P1 的 per-key 重算压缩、page model 签名缓存，以及 P2 的 array selection domain 索引化也都还没有完成。

所以从整体上看，当前不是“都优化完了”，而是完成了第一阶段里最直接的 UI 热点治理，但底层 keyed read source 还没有收口。

## 2. 当前完成度总览

### 2.1 已完成

#### A. `shared/core/src/store/family.ts`

已完成内容：

- family cache 命中路径改为 O(1)
- idle eviction 脱离读路径
- cleanup 改成 microtask 异步增量回收

这部分对应原审计文档中的“发现 2”，可以视为完成。

#### B. table 的高频 hover / selection / fill / chrome 拆源

当前已经完成：

- 删除旧 `views/table/hover.ts`
- 删除旧 `views/table/rowRender.ts`
- 新增：
  - `views/table/runtime/hover.ts`
  - `views/table/runtime/select.ts`
  - `views/table/runtime/fill.ts`
  - `views/table/runtime/rail.ts`
  - `views/table/runtime/can.ts`
  - `views/table/runtime/chrome.ts`
- `Row` 改为只读 row chrome
- `Cell` 改为直接读 cell chrome
- hover 改为 old/new key 增量 patch，而不是 keyed getter 读 whole hover state

这部分对应原审计文档中的“发现 3.1 / 3.2”，可以视为完成。

#### C. kanban 的 section / visibility / layout 分层

当前已经完成：

- 删除旧的 `KanbanSectionData`
- 删除 `visibility.bySection`
- 新增：
  - `views/kanban/runtime/visibility.ts`
  - `views/kanban/runtime/layout.ts`
- `ColumnHeader` 只消费基础 section
- `ColumnBody` 单独消费 `visibility.section(sectionKey)`
- drag / marquee hit test 继续使用 whole `layout.board`

这部分对应原审计文档中的“发现 3.3”，可以视为完成。

### 2.2 未完成

#### A. `dataview-runtime` keyed model 去 whole active state 依赖化

这是当前剩余问题里最重要的一项。

`table / gallery / kanban` 的 runtime model 虽然已经使用 keyed store，但很多 keyed getter 仍然先读：

- `input.source.active.view.current`

再按 `fieldId / itemId / sectionKey` 派生结果。

这意味着它们仍然属于：

- 表面 keyed
- 实际 first dependency 还是 whole active state

这部分正是原审计文档中的“发现 1”，目前仍未完成。

#### B. gallery / kanban content projection 的全字段扫描

当前 `content(itemId)` 仍然会：

- 遍历全部 custom fields
- 重建 `properties`
- 再执行一次 `properties.some(...)`

这部分对应原审计文档中的“发现 4.1”，目前仍未完成。

#### C. page model 的 available fields / toolbar / query / settings 重算

当前 page model 仍然在 query/doc 变化时重算：

- `availableFilterFields`
- `availableSortFields`
- `toolbar`
- `query`
- `settings`

这部分对应原审计文档中的“发现 4.3”，目前仍未完成。

#### D. `createItemArraySelectionDomain` 线性路径

当前 `indexOf / prev / next / range` 仍然直接走 `ids.indexOf(...)`。

这部分对应原审计文档中的“发现 6”，目前仍未完成。

## 3. 逐项状态判断

## 3.1 原审计发现 1：keyed model 仍依赖 whole runtime / active state

### 当前状态

未完成。

### 仍然存在的问题

以下 runtime model 仍然保留了这一模式：

- `dataview/packages/dataview-runtime/src/model/table/api.ts`
- `dataview/packages/dataview-runtime/src/model/kanban/api.ts`
- `dataview/packages/dataview-runtime/src/model/gallery/api.ts`

它们的共同模式仍然是：

```ts
createKeyedDerivedStore({
  get: key => {
    const view = read(input.source.active.view.current)
    ...
  }
})
```

这会导致：

- active view 变化先污染 keyed node
- keyed cache 只是缓存结果，不是真正按数据边界 invalidation

### 为什么这仍然是 P0

table / kanban UI 热状态虽然已经拆了，但如果底层 model 还是 whole active state 驱动，那么：

- 某些 query / active view 变更仍然会让大量 keyed node 先 dirty
- 只是比重构前少了 hover/focus/fill/visibility 这类高频噪音
- 但整体 invalidation 边界仍然不够理想

### 最终目标

把 runtime model 从：

- `whole active view -> keyed getter`

改成：

- `active keyed source -> keyed model`

最终应该优先具备以下 source：

- `active.item`
- `active.section`
- `active.sectionSummary`
- `active.field`
- `active.customField`
- `active.sortDir`
- `active.calc`

以及少量明确职责的 low-frequency whole source：

- `active.view.id`
- `active.view.type`
- `active.query.grouped`

## 3.2 原审计发现 2：family cache 命中路径 O(1)

### 当前状态

已完成。

### 后续是否还需要动作

不需要再以它为主要工作项。

后续只需要：

- 保持不要引入新的读路径 sweep
- 在新 keyed family 设计里继续沿用当前 family 实现

## 3.3 原审计发现 3：table / kanban 高频 UI 状态混合源

### 当前状态

基本完成。

### 已完成的实际变化

table：

- hover 不再通过 keyed getter 读 whole hover state
- row 不再承载 cell 级 hover / focus / fill
- cell 改为直接消费 cell chrome

kanban：

- visibility 不再走 `Map -> section(key) -> .get(key)` 的伪 keyed 结构
- section 基础数据和 visibility window 已拆开
- layout.board 与 keyed visibility 已分层

### 剩余注意点

这里虽然主要问题已解决，但还需注意两个小点：

1. 不要在后续重构里把 cell / section 热字段重新混回 row / section 大对象。
2. 不要在 React 层再用 `useMemo(() => new Map(...)) -> keyed getter .get(key)` 方式回退。

## 3.4 原审计发现 4：per-key 重算仍有中等成本

### 当前状态

未完成。

### 仍然存在的问题

#### A. gallery / kanban content projection

当前每个 `content(itemId)` 仍然会：

- 读全部 custom field ids
- 对每个 field 再读 field
- 重建 `properties`
- 再跑 `some(...)`

这在以下场景会明显放大：

- 字段很多
- 卡片很多
- active fields / doc records 变化较频繁

#### B. table header / query fields / page toolbar/settings

当前 page model 仍然存在：

- 规则数组 map
- 可用字段重算
- toolbar/query/settings 重组

这不是 UI 热状态那样的最高频热点，但属于每次 query/doc/page state 变化都会触发的一类稳定成本。

### 为什么这一步要排在 keyed-source 重构之后

如果 invalidation 还是 whole active state 级别，那么先优化单个 getter 的扫描，只能降低单次重算成本，无法解决 dirty fan-out。

所以正确顺序是：

1. 先修 keyed source 边界
2. 再修 per-key 重算内容

## 3.5 原审计发现 5：React selector 本身并不消除 selector 成本

### 当前状态

原理仍然成立，但这不是独立实现项。

### 当前判断

这条不需要单独立项去“修 hook”，而应该作为后续设计约束：

- 不要依赖 `useStoreSelector` 去掩盖上游 whole-store 问题
- 热路径优先把 selector 前移成 store graph 内的稳定派生
- React 层优先消费 coarse-grained source 或 exact-key source

也就是说，这一项不会以“重写 hook”为目标，而会在下一阶段 keyed source 重构里自然收敛。

## 3.6 原审计发现 6：array selection domain 线性扫描

### 当前状态

未完成。

### 现状

`createItemArraySelectionDomain` 仍然使用：

- `ids.indexOf(id)`

来实现：

- `indexOf`
- `prev`
- `next`
- `range`

### 处理优先级

仍然是 P2。

原因：

- 它是显式低效路径
- 但当前主性能杠杆仍然不在这里

### 最终改法

一次性构建：

- `indexById: Map<ItemId, number>`

然后把：

- `indexOf`
- `prev`
- `next`
- `range`

改成 O(1) 索引访问。

## 3.7 原审计发现 7：`sameOrder / sameMap` 线性比较

### 当前状态

原理仍然成立，但目前不应单独立项优先处理。

### 当前判断

这项仍然应该放在：

- keyed source 边界修好之后
- per-key projection 扫描缩减之后

再处理。

否则只是用结构化 equality 去给过宽 invalidation 做止损，收益有限。

## 4. 当前最终判断

当前代码库的 read path 优化完成度可以这样描述：

- 第一阶段已完成：
  - family cache 读路径优化
  - table / kanban 高频 UI 热点源拆分
- 第二阶段未完成：
  - `dataview-runtime` model keyed read source 去 whole-state 化
- 第三阶段未完成：
  - content projection / page model / query field projection 的扫描压缩
- 第四阶段未完成：
  - array selection domain 索引化

所以当前最准确的结论是：

- 最明显的 UI 高频热点已经处理掉
- 但底层 model 和中层派生还没有收口
- 还不能把 `DATAVIEW_STORE_READ_PATH_PERF_AUDIT.zh-CN.md` 判定为“全部完成”

## 5. 下一阶段优先级

## 5.1 P0：重构 `dataview-runtime` model 的 keyed read source

这是下一阶段唯一的 P0。

目标：

- 禁止 runtime model keyed getter 先读 `active.view.current`
- 引入真正可 keyed 订阅的 active source
- 让 model 直接建立在 `active.item / active.section / active.field / active.summary` 之上

覆盖范围：

- `dataview-runtime/src/model/table/api.ts`
- `dataview-runtime/src/model/gallery/api.ts`
- `dataview-runtime/src/model/kanban/api.ts`

预期结果：

- keyed model invalidation 不再先挂在 whole active view 上
- gallery / kanban / table 的 model 读路径边界和数据边界一致

## 5.2 P1：压缩 content projection 与 page model 重算

包括两块：

### A. gallery / kanban content

目标：

- 把 “visible custom fields” 和 “record -> properties projection” 分层
- 字段列表没变时，不要每个 card 都重新全量 `map + some`

### B. page model

目标：

- 对 `availableFilterFields` / `availableSortFields` 做 query-signature 缓存
- 避免 toolbar/query/settings 重复读取和重复投影

## 5.3 P2：selection domain 与 equality 优化

包括：

- `createItemArraySelectionDomain` 的 `indexById`
- 后续视情况引入更强的版本号 / 稳定引用，降低 `sameOrder / sameMap` 压力

## 6. 推荐实施顺序

建议严格按下面顺序做，不要跳步：

1. `dataview-runtime` model keyed source 重构
2. gallery / kanban content projection 分层缓存
3. page model query-signature 缓存
4. array selection domain 索引化

原因：

- 第 1 步决定 invalidation 边界
- 第 2、3 步决定单次重算成本
- 第 4 步是局部补强，不是主杠杆

## 7. 与现有文档的关系

文档分工如下：

- `DATAVIEW_STORE_READ_PATH_PERF_AUDIT.zh-CN.md`
  - 负责原始问题审计
- `DATAVIEW_TABLE_KANBAN_HOVER_VISIBILITY_RENDER_REFACTOR.zh-CN.md`
  - 负责 table / kanban UI 热点源重构方案
- `DATAVIEW_RUNTIME_KEYED_SOURCE_REFACTOR.zh-CN.md`
  - 负责下一阶段 runtime keyed source 总体重构方案
- 本文档
  - 负责说明“截至当前代码，原审计到底完成到哪一步”

## 8. 最终结论

如果用一句话总结当前状态：

- UI 热点层已经明显收敛，但 runtime model 层和中层 projection 层还没有完成。

如果用工程优先级总结：

- 下一阶段不要再继续围着 React memo、selector、局部 hook 做微调。
- 最该做的是把 `dataview-runtime` model 的 keyed read source 彻底改成真正 keyed 的依赖图。

只有这一步做完，原审计文档中的 P0 才能真正关闭。
