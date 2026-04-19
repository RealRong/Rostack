# DATAVIEW Store Read Path 审计落地状态

## 1. 结论

截至当前代码，`DATAVIEW_STORE_READ_PATH_PERF_AUDIT.zh-CN.md` 中 dataview 范围内约定的 P0 / P1 / P2 已全部落地完成。

当前状态可以概括为：

- P0 已完成：`dataview-runtime` model 不再把 `active.view.current` 当作 table / gallery / kanban keyed getter 的首依赖。
- P1 已完成：gallery / kanban 的 content projection 已分层缓存，page model 的 available fields / toolbar 读路径已改成更细粒度 source。
- P2 已完成：`createItemArraySelectionDomain` 已从线性 `indexOf` 改成 `indexById` 索引。

这意味着原审计里 dataview 的剩余主干项已经关闭；后续如果还要继续做性能工作，重点不再是这一轮文档里的 P0 / P1 / P2，而应转向新的热点审计。

## 2. 本轮实际落地

### 2.1 P0：runtime model keyed source 去 whole-state 化

已完成调整：

- [`dataview/packages/dataview-runtime/src/model/table/api.ts`](/Users/realrong/Rostack/dataview/packages/dataview-runtime/src/model/table/api.ts)
  - `body / column / section / summary` 不再先读 `active.view.current`
  - keyed getter 改为直接依赖：
    - `active.view.type`
    - `active.view.id`
    - `active.fields.*`
    - `active.sections.*`
    - `active.query.*`
    - `active.table.*`

- [`dataview/packages/dataview-runtime/src/model/gallery/api.ts`](/Users/realrong/Rostack/dataview/packages/dataview-runtime/src/model/gallery/api.ts)
  - `body / section / card` 不再先读 `active.view.current`
  - `card` 直接依赖 `active.items(itemId)`、active view 标量 source 和共享 custom field list

- [`dataview/packages/dataview-runtime/src/model/kanban/api.ts`](/Users/realrong/Rostack/dataview/packages/dataview-runtime/src/model/kanban/api.ts)
  - `board / section / card` 不再先读 `active.view.current`
  - `card` 直接依赖 `active.items(itemId)`、section keyed source、kanban option source 和共享 custom field list

- [`dataview/packages/dataview-runtime/src/model/page/api.ts`](/Users/realrong/Rostack/dataview/packages/dataview-runtime/src/model/page/api.ts)
  - `currentView` 不再直接读 `active.view.current`
  - 改为 `active.view.id -> doc.views(viewId)` 的 keyed 读路径

补充说明：

- [`dataview/packages/dataview-runtime/src/dataview/runtime.ts`](/Users/realrong/Rostack/dataview/packages/dataview-runtime/src/dataview/runtime.ts) 里仍然保留 `active.view.current`，但只用于 inline session / marquee 的生命周期绑定，不属于 model hot path，也不是这轮审计要消除的 whole-state 依赖。

### 2.2 P1：content projection / page model 重算压缩

已完成调整：

- 新增 [`dataview/packages/dataview-runtime/src/model/internal/list.ts`](/Users/realrong/Rostack/dataview/packages/dataview-runtime/src/model/internal/list.ts)
  - 提供通用 `createEntityListStore(...)`
  - 统一把 keyed entity source 投影成稳定列表

- 新增 [`dataview/packages/dataview-runtime/src/model/internal/card.ts`](/Users/realrong/Rostack/dataview/packages/dataview-runtime/src/model/internal/card.ts)
  - 提供 `createActiveCustomFieldListStore(...)`
  - 提供 `createRecordCardPropertiesStore(...)`
  - 提供 `createItemCardContentStore(...)`

- gallery / kanban content 改成两层缓存：
  1. `active.fields.custom -> customFields`
  2. `recordId -> properties`
  3. `itemId -> content`

这样带来的变化：

- 不再在每个 `content(itemId)` 里重复扫描 `active.fields.custom.ids`
- 不再在每个 card content getter 里重复 `fieldId -> field` 全量展开
- `properties` 投影从 “每次 item 读都重建” 变成 “按 recordId 分层缓存”

- page model 改成直接消费：
  - `active.query.filterFieldIds`
  - `active.query.sortFieldIds`
  - `active.view.id`
  - `doc.views(viewId)`

- `toolbar` 的 filter / sort 计数已拆成独立 `filterCount` / `sortCount` store
  - filter value 改动但条数不变时，不再因为读取整个 rules 数组而强迫 toolbar 投影变化

- `availableFilterFields` / `availableSortFields` 不再依赖：
  - `filters.rules.map(rule.fieldId)`
  - `sort.rules.map(sorter.field)`
  - 这类 query object 级重算链

### 2.3 P2：selection domain 索引化

已完成调整：

- [`dataview/packages/dataview-runtime/src/selection/domain.ts`](/Users/realrong/Rostack/dataview/packages/dataview-runtime/src/selection/domain.ts)
  - 新增惰性 `indexById`
  - `indexOf / prev / next / range` 均改为基于索引表读取

- [`dataview/packages/dataview-runtime/src/dataview/runtime.ts`](/Users/realrong/Rostack/dataview/packages/dataview-runtime/src/dataview/runtime.ts)
  - 新增 `activeSelectionDomain` derived store
  - selection controller 与 marquee 共用同一份 domain 投影，而不是每次读取时临时重建 domain 对象

## 3. 额外顺手修正

这轮同时修掉了几个和 read path 直接相关的正确性问题：

- `page` 的 views / fields / available fields equality 从 `sameIdOrder(...)` 改成 `sameOrder(...)`
  - view 名称、field 元数据变化现在可以正确通知下游
  - 不再为了压住 rerender 错误地吞掉真实字段/视图更新

- card property equality 改成基于 `field` 引用和 `value`
  - 字段元数据变化不会再被 `field.id` 级比较错误吞掉

- 通用 list helper 在 derived 里统一使用 `read(store, key)`，避免重新引入 “derived 内部调用 plain get” 的非法读路径

## 4. 当前残余边界

当前没有发现这份审计文档里的未关闭主项，但有两个边界需要明确：

- `active.view.current`
  - 仍存在于 runtime lifecycle 绑定里
  - 这是低频 session 同步逻辑，不属于 hot keyed model 依赖链

- `sameOrder / sameMap`
  - 仍然是线性 equality
  - 但在这轮 P0 / P1 / P2 完成后，它已经回到“局部成本”而不是“结构性主瓶颈”

## 5. 验证

已通过：

- `pnpm --filter @dataview/runtime typecheck`
- `pnpm --filter @dataview/react typecheck`
- `pnpm --filter @dataview/runtime test`
- `pnpm --filter @dataview/react test`
- `pnpm -C dataview run typecheck:packages`

## 6. 最终判断

如果只回答“`DATAVIEW_STORE_READ_PATH_PERF_AUDIT.zh-CN.md` 这一轮在 dataview 范围内是否已经做完”，答案是：

- 已做完。

如果继续做下一阶段优化，应该新开审计，而不是再沿用这份文档里的 P0 / P1 / P2 作为待办。
