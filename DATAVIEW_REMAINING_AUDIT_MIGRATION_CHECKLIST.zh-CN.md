# Dataview 剩余代码审计与迁移清单

日期：2026-04-14

## 说明

这份清单是基于当前 `dataview` 真实源码重新扫描后的“第二轮剩余项”审计。

它不重复上一轮已经完成的迁移，只记录当前代码里还真实存在的：

1. 重复可复用逻辑
2. 重复类型定义
3. 不必要的中间翻译层
4. 建议的后续迁移顺序

本轮审计范围：

- `dataview/packages/dataview-core/src`
- `dataview/packages/dataview-engine/src`
- `dataview/packages/dataview-react/src`
- `dataview/packages/dataview-table/src`

## 当前结论

当前仓库已经明显比上一轮干净很多，但还剩 4 类值得继续收口的问题：

1. `engine` 里“有序 keyed collection”的构造仍然分散在多处手写。
2. `gallery / kanban` 的拖拽运行时还残留一层近似重复骨架。
3. `engine public projection` 里还有一批当前无消费方的镜像字段。
4. `core / engine / react / table` 里还残留若干空壳类型、死别名、微型重复 helper。

这轮剩余问题已经不再是“大块架构双轨”，而是第二阶段的结构清理：

- 继续减少 builder 样板
- 继续压缩 projection 字段
- 删除空壳类型
- 删除死 helper / 死别名

## P0 必做项

### 1. `engine` 的 ordered keyed collection builder 仍然分散手写

位置：

- `dataview/packages/dataview-engine/src/active/snapshot/base.ts`
- `dataview/packages/dataview-engine/src/active/snapshot/sections/publish.ts`
- `dataview/packages/dataview-engine/src/active/snapshot/list.ts`
- `dataview/packages/dataview-core/src/document/table.ts`

当前问题：

- `active/snapshot/base.ts` 里的 `createFields(...)` 手动组装了：
  - `ids`
  - `all`
  - `custom`
  - `get`
  - `has`
  - `indexOf`
  - `at`
  - `range`
- `active/snapshot/sections/publish.ts` 里的 `createItemList(...)`、`buildSections(...)` 又各自手动组装了一套：
  - `ids`
  - `all`
  - `get`
  - `has`
  - `indexOf`
  - `at`
  - `prev`
  - `next`
  - `range`
- `active/snapshot/list.ts` 虽然已经提供 `createOrderedListAccess(...)`，但目前只统一了“顺序索引原语”，没有统一“keyed list/list-with-entities”构造协议。
- `core/document/table.ts` 又维护了另一套实体表访问 helper：
  - `listEntityTable`
  - `getEntityTableIds`
  - `getEntityTableById`
  - `hasEntityTableId`

结论：

- 现在的重复不在“索引算法”，而在“把 ids + byId + ordered access 拼成 collection contract”这一步。
- 当前缺的是一个更高层的 canonical collection factory，而不是再加更多 ad-hoc helper。

迁移动作：

- [ ] 在 `shared/core` 或 `engine` 内部建立统一的 ordered keyed collection builder。
- [ ] 让 `FieldList / ItemList / SectionList` 都从统一 factory 生成，而不是各文件手写拼装。
- [ ] 评估 `core/document/table.ts` 的实体表读取 helper 是否也能降到同一套 collection protocol，至少统一：
  - `ids`
  - `get`
  - `has`
  - `indexOf`
  - `at`
- [ ] 删除迁移后不再有价值的局部 builder 代码。

完成标准：

- [ ] `createFields(...)`、`createItemList(...)`、`buildSections(...)` 不再各自手写 list contract 装配。
- [ ] ordered collection 的公开能力由单一 factory 输出。
- [ ] collection builder 的 owner 明确，不再在 `base.ts` 和 `sections/publish.ts` 之间分散。

### 2. `gallery / kanban` 拖拽运行时还残留一层重复骨架

位置：

- `dataview/packages/dataview-react/src/views/gallery/runtime.ts`
- `dataview/packages/dataview-react/src/views/kanban/runtime.ts`

当前问题：

- 两个 runtime 都在重复做同一组拖拽准备：
  - `const itemIds = input.active.items.ids`
  - `const [dragging, setDragging] = useState(false)`
  - `useItemInteractionRuntime({ disabled: dragging, ... })`
  - `itemMap: new Map(itemIds.map(id => [id, id] as const))`
  - 用已选中 ids 解析 `getDragIds(...)`
  - `onDraggingChange: setDragging`
- 现在 marquee / selection / visualTargets 已经统一了，但 drag shell 还没有收口。
- 这部分逻辑虽然不大，但现在是明确的视图间重复，而不是必要分叉。

迁移动作：

- [ ] 抽出共享的 `item drag runtime` helper，至少统一：
  - identity `itemMap`
  - `selectedIds -> dragIds` 解析
  - `dragging` 与 interaction disabled 的联动
- [ ] `gallery` 与 `kanban` 只保留：
  - 各自的布局读取
  - 各自的 drop target 解释
  - 各自的 onDrop 领域逻辑

完成标准：

- [ ] `gallery/runtime.ts` 与 `kanban/runtime.ts` 不再平行维护相同的 drag shell。
- [ ] identity item map 与 selected-drag-id 解析只有一份实现。

### 3. query/group/sort projection 里还残留无消费方镜像字段

位置：

- `dataview/packages/dataview-engine/src/contracts/public.ts`
- `dataview/packages/dataview-engine/src/active/snapshot/base.ts`
- `dataview/packages/dataview-react/src/page/features/filter/FilterRulePopover.tsx`
- `dataview/packages/dataview-react/src/page/features/sort/SortRuleRow.tsx`
- `dataview/packages/dataview-react/src/page/features/viewSettings/panels/GroupingPanel.tsx`

当前问题：

- 当前代码里仍有一批 projection 字段只在 engine 生成和 equality 比较中存在，但 React 侧没有真实消费：
  - `ViewSearchProjection.viewId`
  - `ViewSearchProjection.active`
  - `ViewFilterProjection.viewId`
  - `ViewFilterProjection.mode`
  - `ViewSortProjection.viewId`
  - `ViewGroupProjection.viewId`
  - `ViewGroupProjection.fieldLabel`
  - `SortRuleProjection.fieldLabel`
- 从当前消费方看：
  - `SortRuleRow.tsx` 已经直接用 `field?.name ?? deleted label`
  - `GroupingPanel.tsx` 没有使用 `group.fieldLabel`
  - `search.active` 没有消费方
  - 各 query projection 上的 `viewId` 也没有消费方
- `GroupingPanel.tsx` 还额外复制了一份 `EMPTY_GROUP: ViewGroupProjection`，与 `active/snapshot/base.ts` 的 inactive group projection 是同构空态。

结论：

- 上一轮已经删掉一批 projection mirror field，但这轮还可以继续压一层。
- 当前最明显的是“生成了字段，但 React 根本不读”。

迁移动作：

- [ ] 删除没有当前消费方的 projection 字段：
  - [ ] `ViewSearchProjection.viewId`
  - [ ] `ViewSearchProjection.active`
  - [ ] `ViewFilterProjection.viewId`
  - [ ] `ViewFilterProjection.mode`
  - [ ] `ViewSortProjection.viewId`
  - [ ] `ViewGroupProjection.viewId`
  - [ ] `ViewGroupProjection.fieldLabel`
  - [ ] `SortRuleProjection.fieldLabel`
- [ ] `FilterRuleProjection.fieldLabel` 保留，因 `FilterRulePopover.tsx` 当前仍在消费。
- [ ] 将 `GroupingPanel.tsx` 的 `EMPTY_GROUP` 收回到 engine/shared 默认值 owner，避免 UI 层复制 inactive projection shape。

完成标准：

- [ ] React 无消费方的 projection 字段全部删除。
- [ ] inactive group projection 的空态不再在 engine/react 各自写一份。
- [ ] query projection 只保留当前真实 UI 和 runtime 需要的字段。

## P1 应做项

### 4. 空壳类型与死别名仍然存在

位置：

- `dataview/packages/dataview-engine/src/contracts/shared.ts`
- `dataview/packages/dataview-engine/src/contracts/public.ts`
- `dataview/packages/dataview-react/src/runtime/selection/types.ts`
- `dataview/packages/dataview-react/src/runtime/valueEditor/types.ts`
- `dataview/packages/dataview-react/src/runtime/marquee/types.ts`
- `dataview/packages/dataview-table/src/cellNavigation.ts`

当前问题：

- 当前仓库里还保留一些几乎没有额外语义的空壳类型：
  - `Section extends SectionData {}`
  - `HistoryActionResult extends CommitResult {}`
  - `SelectionStore extends ValueStore<Selection> {}`
  - `ValueEditorSession extends OpenValueEditorInput {}`
  - `SelectionTarget extends RectItem<ItemId> {}`
  - `TableCellFieldId = FieldId`
- 其中 `TableCellFieldId` 目前扫描下只有定义处命中，没有引用。

迁移动作：

- [ ] 删除完全无意义且无引用的死别名：
  - [ ] `TableCellFieldId`
- [ ] 对空壳类型按语义强度处理：
  - [ ] 如果只是纯转发，就删除并直接使用原始类型
  - [ ] 如果确实要保留命名语义，就改成 `type alias`，避免制造第二套 nominal-looking shape
- [ ] 优先清理明显没有独立领域价值的空壳 interface。

完成标准：

- [ ] 不再保留“只 extends 一层但没有新增任何字段”的中间壳类型。
- [ ] 不再保留零引用的死别名。

### 5. `sameOrder` 微包装仍然在多处平行定义

位置：

- `dataview/packages/dataview-engine/src/active/snapshot/query/derive.ts`
- `dataview/packages/dataview-engine/src/active/snapshot/sections/derive.ts`
- `dataview/packages/dataview-engine/src/active/snapshot/summary/sync.ts`
- `dataview/packages/dataview-core/src/document/table.ts`

当前问题：

- 当前还有几处微型重复 helper：
  - `const sameIds = sameOrder<RecordId>`
  - `const sameRecordIds = (...) => sameOrder(left, right)`
  - `isSameOrder(...)` 手写循环比较
- 其中 `core/document/table.ts` 的 `isSameOrder(...)` 当前仓库扫描下没有引用，且与共享 `sameOrder(...)` 功能重叠。

迁移动作：

- [ ] 删除 `core/document/table.ts` 中的死 helper `isSameOrder(...)`
- [ ] 将 snapshot 内部的 `sameIds / sameRecordIds` 统一为单一 helper，或直接内联使用 `sameOrder`

完成标准：

- [ ] 仓库里不再残留单行 `sameOrder` 包装器到处复制的情况。
- [ ] `isSameOrder(...)` 这类局部重复比较 helper 被删除。

### 6. table 对 page lock/value-editor 的派生 owner 仍然分散

位置：

- `dataview/packages/dataview-react/src/views/table/controller.ts`
- `dataview/packages/dataview-react/src/views/table/components/body/Body.tsx`

当前问题：

- `table/controller.ts` 已经从 `pageStore` 派生：
  - `lockedStore`
  - `valueEditorOpenStore`
- `Body.tsx` 又单独从 `dataView.page.store` 读取一次 `state.lock !== null`。
- 这不是大的重复，但仍然说明“table page-state 投影”的 owner 不唯一。

迁移动作：

- [ ] 统一 table 内对 `lock / valueEditorOpen` 的读取入口。
- [ ] 要么由 `TableController` 对外暴露 canonical store，要么将这类 projection 提取到单独 helper。

完成标准：

- [ ] table 内不再同时存在 controller-derived 和 component-local 的同类 page-state projection。

## P2 收尾项

### 7. `GroupingPanel` 仍在 UI 层复制 engine projection 空态

位置：

- `dataview/packages/dataview-react/src/page/features/viewSettings/panels/GroupingPanel.tsx`
- `dataview/packages/dataview-engine/src/active/snapshot/base.ts`

当前问题：

- `GroupingPanel.tsx` 维护了本地 `EMPTY_GROUP: ViewGroupProjection`
- `active/snapshot/base.ts` 维护了 `createInactiveGroupProjection(...)`
- 两者表达的是同一语义：group projection 的 inactive empty state

迁移动作：

- [ ] 为 inactive group projection 提供单一 owner
- [ ] React 组件侧不再手写同构空对象

完成标准：

- [ ] `EMPTY_GROUP` 这类 projection placeholder 不再在 UI 层复制一份。

### 8. `gallery / kanban` 的 typed runtime input 仍可再收一层

位置：

- `dataview/packages/dataview-react/src/views/gallery/types.ts`
- `dataview/packages/dataview-react/src/views/kanban/types.ts`

当前问题：

- `ActiveGalleryViewState` / `ActiveKanbanViewState` 已经统一到 `ActiveTypedViewState<TType>`
- 但 `GalleryRuntimeInput` / `KanbanRuntimeInput` 仍然保留一层平行 `active + extra` 输入壳
- 这层重复不大，但如果继续推进 drag runtime 统一，顺手也可以一起收掉

迁移动作：

- [ ] 评估是否引入共享的 `TypedRuntimeInput<TType, TExtra>`
- [ ] 如果不值得抽象，就保留现状，不必为了形式统一而再造一层泛型

完成标准：

- [ ] 明确这层是否保留；避免长期停在“半统一”状态。

## 不必要中间层清单

### 建议直接删除

- [ ] `TableCellFieldId = FieldId`
- [ ] `core/document/table.ts` 中的 `isSameOrder(...)`

### 建议收缩为直接类型或 `type alias`

- [ ] `Section extends SectionData {}`
- [ ] `HistoryActionResult extends CommitResult {}`
- [ ] `SelectionStore extends ValueStore<Selection> {}`
- [ ] `ValueEditorSession extends OpenValueEditorInput {}`
- [ ] `SelectionTarget extends RectItem<ItemId> {}`

### 建议继续压缩的 projection 镜像字段

- [ ] `ViewSearchProjection.viewId`
- [ ] `ViewSearchProjection.active`
- [ ] `ViewFilterProjection.viewId`
- [ ] `ViewFilterProjection.mode`
- [ ] `ViewSortProjection.viewId`
- [ ] `ViewGroupProjection.viewId`
- [ ] `ViewGroupProjection.fieldLabel`
- [ ] `SortRuleProjection.fieldLabel`

## 推荐迁移顺序

### 阶段 1：先压 projection 字段

- [ ] 删除当前无消费方的 query/group/sort projection 镜像字段
- [ ] 收回 inactive group projection 空态 owner

目标：

- 先把最确定的无效字段删掉
- 降低后续 runtime 和 type 层的噪音

### 阶段 2：统一 ordered keyed collection builder

- [ ] 抽象 `FieldList / ItemList / SectionList` 的统一构造协议
- [ ] 删除局部手写 builder

目标：

- 让 engine collection contract 只有一套构造方式

### 阶段 3：统一 gallery / kanban drag shell

- [ ] 抽出共享 drag runtime helper
- [ ] 删除 identity itemMap 与 selected-drag-ids 的重复实现

目标：

- 让跨视图重复只剩真正的布局/拖拽差异

### 阶段 4：删空壳类型与死 helper

- [ ] 清空壳 interface
- [ ] 清死别名
- [ ] 删 `sameOrder` 微包装

目标：

- 收掉最后一批 nominal-looking 中间层

## 验收规则

完成后应同时满足：

- [ ] `engine` collection builder 只有单一 owner
- [ ] `gallery/runtime.ts` 与 `kanban/runtime.ts` 不再复制 drag shell
- [ ] query/group/sort projection 不再携带无消费方镜像字段
- [ ] `GroupingPanel` 不再本地复制 inactive group projection 空态
- [ ] `TableCellFieldId`、`isSameOrder(...)` 等死别名/死 helper 已删除
- [ ] 仓库内不再保留空壳 `extends` 类型作为中间翻译层

建议验收命令：

```bash
pnpm -C dataview typecheck
pnpm -C dataview test
```

## 总结

当前 `dataview` 已经完成了上一轮最重的架构清理。

这轮剩余问题的性质已经变成：

- builder 样板
- projection 缩减
- 空壳类型删除
- 视图运行时微重复收口

如果把这份清单里的内容继续做完，`dataview` 会从“主结构已统一”进一步进入“边角层也没有重复和翻译壳”的状态。
