# Dataview Engine Project 最终 API 与落地方案

## 最终 API 设计

本节是唯一实现目标。后续落地以本节为准，不保留兼容层，不保留第二套 helper 线，不新增并行旧 API。

### 顶层 Engine API

```ts
interface Engine {
  read: EngineReadApi
  active: ActiveApi
  views: ViewsApi
  fields: FieldsApi
  records: RecordsApi
  action: (action: Action | readonly Action[]) => ActionResult
  history: HistoryApi
  perf: PerfApi
}
```

约束：

- 不再公开 `project` 顶层 API。
- active view projection 的公共读取全部进入 `engine.active`。
- 不再新增 `project.*` 风格公共 helper。

### `engine.active`

```ts
interface ActiveApi extends ViewApi {
  id: ReadStore<ViewId | undefined>
  view: ReadStore<View | undefined>
  state: ReadStore<ActiveViewState | undefined>
  select: ActiveSelectApi
  read: ActiveReadApi

  table: ActiveTableApi
  gallery: ActiveGalleryApi
  kanban: ActiveKanbanApi
}
```

约束：

- `state` 提供完整活动视图快照。
- `select` 负责精细订阅。
- `read` 是唯一解析入口。
- `table/gallery/kanban` 只保留各自真正特殊的内容，不复制通用投影状态。

### `ActiveViewState`

```ts
interface ActiveViewState {
  view: View
  query: ActiveQuery
  records: RecordSet
  sections: SectionList
  appearances: AppearanceList
  fields: FieldList
  calculations: ReadonlyMap<SectionKey, CalculationCollection>
}

interface ActiveQuery {
  filter: ViewFilterProjection
  group: ViewGroupProjection
  search: ViewSearchProjection
  sort: ViewSortProjection
}
```

约束：

- `filter/group/search/sort` 收进 `query`，不再并列挂在 `ActiveViewState` 顶层。
- `sections` 必须是 `SectionList`，不能再是数组。
- `fields` 必须是完整显示列模型。

### `RecordSet`

```ts
interface RecordSet {
  viewId: ViewId
  derived: readonly RecordId[]
  ordered: readonly RecordId[]
  visible: readonly RecordId[]
}
```

约束：

- 不再使用 `derivedIds/orderedIds/visibleIds`。
- `RecordSet` 只表达 record id 集，不承担其他读取职责。

### `SectionList`

```ts
interface SectionList {
  ids: readonly SectionKey[]
  all: readonly Section[]
  get: (key: SectionKey) => Section | undefined
  has: (key: SectionKey) => boolean
  indexOf: (key: SectionKey) => number | undefined
  at: (index: number) => SectionKey | undefined
}

interface Section {
  key: SectionKey
  title: string
  color?: string
  bucket?: SectionBucket
  collapsed: boolean
  appearanceIds: readonly AppearanceId[]
  recordIds: readonly RecordId[]
}
```

约束：

- 原 `ids` 改为 `appearanceIds`。
- `recordIds` 作为底层发布能力直接提供。
- 上层不允许再通过 `sections.find(...)` 做 key 查找。

### `AppearanceList`

```ts
interface AppearanceList {
  ids: readonly AppearanceId[]
  count: number

  get: (id: AppearanceId) => Appearance | undefined
  has: (id: AppearanceId) => boolean
  indexOf: (id: AppearanceId) => number | undefined
  at: (index: number) => AppearanceId | undefined

  prev: (id: AppearanceId) => AppearanceId | undefined
  next: (id: AppearanceId) => AppearanceId | undefined
  range: (anchor: AppearanceId, focus: AppearanceId) => readonly AppearanceId[]
}

interface Appearance {
  id: AppearanceId
  recordId: RecordId
  sectionKey: SectionKey
}
```

约束：

- `Appearance.section` 统一改为 `sectionKey`。
- `AppearanceList` 只负责 appearance 导航，不再把外层依赖的解析散落到 helper。

### `FieldList`

```ts
interface FieldList {
  ids: readonly FieldId[]
  all: readonly Field[]
  custom: readonly CustomField[]

  get: (id: FieldId) => Field | undefined
  has: (id: FieldId) => boolean
  indexOf: (id: FieldId) => number | undefined
  at: (index: number) => FieldId | undefined
  range: (anchor: FieldId, focus: FieldId) => readonly FieldId[]
}
```

约束：

- `ids` 与 `view.display.fields` 一一对应。
- `all` 与 `ids` 一一对应。
- `title` 必须进入主路径。
- `custom` 只是派生视图，不是主体模型。

### `ActiveReadApi`

```ts
interface ActiveReadApi {
  record: (recordId: RecordId) => DataRecord | undefined
  field: (fieldId: FieldId) => Field | undefined

  section: (key: SectionKey) => Section | undefined
  appearance: (id: AppearanceId) => Appearance | undefined
  cell: (ref: CellRef) => ActiveCell | undefined

  filterField: (index: number) => Field | undefined
  groupField: () => Field | undefined

  planMove: (
    appearanceIds: readonly AppearanceId[],
    target: Placement
  ) => ItemMovePlan
}
```

约束：

- 统一使用短名：
  - `record`
  - `field`
  - `section`
  - `appearance`
  - `cell`
  - `planMove`
- 不再保留新的长 getter 风格 API。
- 外层通过返回的完整对象拿数据，不再依赖辅助 helper 拼装。

### `ActiveCell`

```ts
interface ActiveCell {
  appearanceId: AppearanceId
  recordId: RecordId
  fieldId: FieldId
  sectionKey: SectionKey
  record: DataRecord
  field: Field | undefined
  value: unknown
}
```

约束：

- `CellRef -> record/field/value/section` 必须一次解析完成。
- table、value editor、cell write 不再手动拼 `appearance -> record -> field -> value`。

### `ItemMovePlan`

```ts
interface ItemMovePlan {
  appearanceIds: readonly AppearanceId[]
  recordIds: readonly RecordId[]
  changed: boolean
  sectionChanged: boolean
  target: {
    sectionKey: SectionKey
    beforeAppearanceId?: AppearanceId
    beforeRecordId?: RecordId
  }
}
```

约束：

- gallery、kanban、facade 都统一消费 `planMove(...)` 的结果。
- 不再自己计算 `recordIds`、`beforeRecordId`、`sectionChanged`。

### View-specific active state

```ts
interface ActiveTableState {
  showVerticalLines: boolean
}

interface ActiveGalleryState {
  cardSize: GalleryCardSize
  canReorder: boolean
  groupUsesOptionColors: boolean
}

interface ActiveKanbanState {
  cardsPerColumn: KanbanCardsPerColumn
  fillColumnColor: boolean
  canReorder: boolean
  groupUsesOptionColors: boolean
}
```

约束：

- table/gallery/kanban 不复制通用投影数据。
- 通用数据统一从 `ActiveViewState` 读取。
- view-specific state 只保留各自真正特殊的项。

### 基础输入类型

```ts
interface CellRef {
  appearanceId: AppearanceId
  fieldId: FieldId
}

interface Placement {
  sectionKey: SectionKey
  before?: AppearanceId
}
```

约束：

- `Placement.section` 一律改为 `sectionKey`。
- `Appearance.sectionKey`、`ActiveCell.sectionKey`、`ItemMovePlan.target.sectionKey` 命名保持一致。

### 明确删除的公共 helper / API

以下名字不作为最终公共 API 保留：

- `recordIdsOfAppearances`
- `readSectionRecordIds`
- `sectionIds`
- `fieldOf`
- `toRecordField`
- `move.plan`
- `move.before`
- `move.apply`
- `replaceField`
- `sameFieldLookup`

以下文件目标是删除或彻底收缩到内部实现：

- `dataview/src/engine/project/appearanceHelpers.ts`
- `dataview/src/engine/project/sectionHelpers.ts`
- `dataview/src/engine/project/movePlan.ts`
- `dataview/src/engine/project/refs.ts`

---

## 具体执行落地方案

本节是一步到位执行方案，默认不保留兼容、不保留过渡实现、不保留旧导出。

### 阶段 1. 重定义公开模型

目标：

- 重写 `readModels.ts`
- 重写 `engine/api/public/project.ts`
- 把最终命名与结构一次切到位

具体动作：

- `ActiveViewState` 改成：
  - `view`
  - `query`
  - `records`
  - `sections`
  - `appearances`
  - `fields`
  - `calculations`
- `RecordSet` 改成：
  - `derived`
  - `ordered`
  - `visible`
- `Section.ids` 改成 `appearanceIds`
- `Section` 新增 `recordIds`
- `Appearance.section` 改成 `sectionKey`
- `Placement.section` 改成 `sectionKey`
- `ActiveViewReadApi` 直接改成最终的 `ActiveReadApi`

完成标准：

- 类型层不再残留旧命名：
  - `derivedIds`
  - `orderedIds`
  - `visibleIds`
  - `section`
  - 各类 `getXxx` 风格读取函数

### 阶段 2. 重写 publish 层，直接发布最终读模型

目标：

- `publish/view.ts`
- `publish/sections.ts`
- `publish/records.ts`

直接生成最终形态的：

- `SectionList`
- `AppearanceList`
- `FieldList`
- `RecordSet`
- `ActiveQuery`

具体动作：

- `SectionList` 在 publish 阶段构建完整索引：
  - `ids`
  - `all`
  - `get`
  - `has`
  - `indexOf`
  - `at`
- `Section` 在 publish 阶段就填好：
  - `appearanceIds`
  - `recordIds`
- `AppearanceList` 保留最小导航职责：
  - `get`
  - `has`
  - `indexOf`
  - `at`
  - `prev`
  - `next`
  - `range`
- `FieldList` 按完整 `view.display.fields` 生成，不再跳过 `title`
- `filter/group/search/sort` 组装成 `query`

完成标准：

- `sections` 不再是数组。
- `fields` 不再是“custom fields 视图”。
- `RecordSet` 不再带 `Ids` 后缀命名。

### 阶段 3. 重写 `engine.active.read`

目标：

- 让 `engine.active.read` 成为唯一解析入口。

具体动作：

- 在 `store/selectors.ts` 中直接实现：
  - `record`
  - `field`
  - `section`
  - `appearance`
  - `cell`
  - `filterField`
  - `groupField`
  - `planMove`
- `cell(ref)` 一次返回：
  - `appearanceId`
  - `recordId`
  - `fieldId`
  - `sectionKey`
  - `record`
  - `field`
  - `value`
- `planMove(...)` 一次返回：
  - `appearanceIds`
  - `recordIds`
  - `changed`
  - `sectionChanged`
  - `target.sectionKey`
  - `target.beforeAppearanceId`
  - `target.beforeRecordId`

完成标准：

- `store/selectors.ts` 不再依赖：
  - `readSectionRecordIds`
  - `toRecordField`
  - `sections.find(...)`
  - `appearances.sectionOf(...)`

### 阶段 4. 删除 root-level helper 依赖

目标：

- 清掉 facade、React、store 对 `engine/project` helper 的主路径依赖。

具体动作：

- `engine/facade/view/index.ts`：
  - 改为使用 `active.read.planMove(...)`
  - 改为使用 `active.read.cell(...)`
  - 不再自己计算 `recordIds`、`beforeRecordId`
- `react/views/table/openCell.ts`：
  - 改为使用 `engine.active.read.cell(...)`
  - 删除 `fieldOf(...)`
- `react/views/gallery/runtime.ts`：
  - indicator 和 drop 全部改成 `engine.active.read.planMove(...)`
- `react/views/kanban/runtime.ts`：
  - indicator 和 drop 全部改成 `engine.active.read.planMove(...)`

完成标准：

- 外层不再 import：
  - `recordIdsOfAppearances`
  - `readSectionRecordIds`
  - `fieldOf`
  - `toRecordField`
  - `move.plan`
  - `move.before`

### 阶段 5. 删除旧文件与旧导出

目标：

- 彻底收口 `dataview/src/engine/project` 的公共导出面。

具体动作：

- 删除：
  - `appearanceHelpers.ts`
  - `sectionHelpers.ts`
  - `movePlan.ts`
- `refs.ts` 只保留必要的类型：
  - `CellRef`
  - 如仍需要才保留极少量纯类型定义
- `index.ts` 只导出稳定模型和必要类型：
  - `Appearance`
  - `AppearanceList`
  - `Section`
  - `SectionList`
  - `FieldList`
  - `CellRef`
  - `Placement`
  - projection types

完成标准：

- `@dataview/engine/project` 不再是 helper 出口。
- `engine/project` 对外只剩稳定领域模型定义。

### 阶段 6. 同步 React 订阅方式

目标：

- 让 React 尽量直接订阅稳定对象，不在组件内派生重复逻辑。

具体动作：

- 通用投影读取优先使用：
  - `engine.active.state`
  - `engine.active.select(...)`
  - `engine.active.read`
- 细粒度订阅原则：
  - 通用快照走 `state`
  - 单值优化走 `select`
  - 即时解析走 `read`
- 不允许在 React 中继续写：
  - `sections.find(...)`
  - `appearances.get(...).recordId`
  - `view.display.fields.indexOf(...)`
  - `state.group.active ? ... : ...` 这一类原本应由底层读模型提供的重复拼装

完成标准：

- table/gallery/kanban 只处理 UI 逻辑，不再承担投影拼装。

### 阶段 7. 编译与清理校验

目标：

- 确认没有残留旧命名、旧 helper 依赖、旧导出。

具体动作：

- 全局检索旧 API 名称并清零：
  - `recordIdsOfAppearances`
  - `readSectionRecordIds`
  - `fieldOf`
  - `toRecordField`
  - `move.plan`
  - `move.before`
  - `derivedIds`
  - `orderedIds`
  - `visibleIds`
- 检查 `engine/project/index.ts` 的导出面，只保留最终模型和类型。
- 运行 TypeScript 编译，修复所有连锁类型错误。

完成标准：

- 不存在旧 helper 主路径引用。
- 不存在旧命名字段。
- 不存在第二套 API。

---

## 实施要求

- 一步到位，不留兼容层。
- 旧实现必须删除干净。
- 不允许同一语义保留两套命名。
- 优先做底层模型和 `active.read`，再改 facade 和 React。
- 所有上层改动都以“减少 helper、减少手动拼装、统一读路径”为验收标准。
