# Dataview Engine Project Helper 收敛方案

## 目标

`dataview/src/engine/project` 当前的问题，不是“函数太多”，而是“公开读模型能力不完整”，导致 facade、store、React 侧不断补 helper，把本来应该在底层完成的解析和派生扩散到上层。

本方案的目标是：

- 把 `engine/project` 从“helper 集合”收敛回“投影运行时 + 发布读模型”。
- 把跨层重复出现的解析逻辑下沉到 `published read model` 或 `engine.active.read`。
- 删除不是稳定领域抽象的 root-level helpers。
- 让 React 和 facade 尽量只消费：
  - `engine.active.state`
  - `engine.active.read`
  - `engine.active.items`

最终状态下，外层不应该再理解 `sections + appearances + refs + movePlan` 之间的拼装细节。

---

## 当前问题

### 1. `engine/project` 混了三层职责

当前目录里同时存在三类内容：

- 运行时投影：
  - `runtime/*`
  - `publish/*`
- 公开读模型：
  - `readModels.ts`
  - `viewProjections.ts`
- 对外补洞 helper：
  - `appearanceHelpers.ts`
  - `sectionHelpers.ts`
  - `refs.ts`
  - `movePlan.ts`

问题不在于有纯函数，而在于最后一类 helper 实际上是在补“底层没把能力做好”的洞。

### 2. 公开读模型是半成品

当前对外暴露的读模型缺几个关键能力：

- `sections` 只是 `readonly Section[]`
- `appearances` 只有一半导航能力
- `fields` 不是完整列模型
- `cell -> record/field/section` 解析没有底层统一入口
- 拖拽移动计划没有底层统一入口

结果是上层不断出现这些行为：

- `sections.find(...)`
- `appearances.get(...).recordId`
- `appearances.sectionOf(...)`
- `readSectionRecordIds(...)`
- `recordIdsOfAppearances(...)`
- `toRecordField(...)`
- `move.plan(...)`

这说明 helper 不是附加便利，而是业务主路径依赖。

### 3. `ActiveViewReadApi` 还是补救层，不是最终读取层

当前 `engine.active.read` 已经开始吸收一部分能力，但仍然依赖：

- `toRecordField`
- `readSectionRecordIds`
- `sections.find`
- `appearances.sectionOf`

这说明它还没有做到“调用方不需要了解底层拼装关系”。

---

## 结论

需要在底层补能力，并删除一批 helper。

原则如下：

- 运行时内部纯函数可以保留。
- 发布阶段内部复用函数可以保留。
- 对外的 root-level helper 要尽量清空。
- 读能力应尽量长在读模型对象本身，或长在 `engine.active.read`。

核心方向不是“继续增加新的 helper”，而是：

1. 把发布模型做完整。
2. 把 `engine.active.read` 做成真正的一等读取入口。
3. 让 facade 和 React 停止自己做解析。

---

## 各文件判断

### 应删除或基本删除

#### `dataview/src/engine/project/appearanceHelpers.ts`

当前只有：

- `recordIdsOfAppearances`

这个能力本质上应该属于 `AppearanceList`，不应该是一个额外 helper 文件。

结论：

- 删除文件。
- 对应能力并入 `AppearanceList` 或 `engine.active.read`。

#### `dataview/src/engine/project/sectionHelpers.ts`

当前包含：

- `sectionIds`
- `readSectionRecordIds`

这是 `sections` 只暴露数组后的补救层。

结论：

- 删除文件。
- 引入 `SectionList`，把按 key 读取 section 的能力做成模型内建能力。

#### `dataview/src/engine/project/movePlan.ts`

当前暴露：

- `move.drag`
- `move.before`
- `move.apply`
- `move.plan`

这已经不是“工具函数”，而是视图移动语义的一部分。gallery、kanban、facade 都依赖它，说明它应该成为底层一等能力，而不是 root helper。

结论：

- 对外删除 `movePlan.ts`。
- 如有必要，保留内部实现，但收进 `AppearanceList` 或 `engine.active.read.planItemMove(...)`。

#### `dataview/src/engine/project/refs.ts`

当前混了三类内容：

- 类型：`CellRef`、`RecordFieldRef`、`ViewFieldRef`
- 比较：`sameCellRef`、`sameViewField`
- 解析：`fieldOf`、`toRecordField`

问题最大的不是类型，而是解析函数。`fieldOf`、`toRecordField` 都是在补“cell 没有统一解析入口”。

结论：

- `fieldOf`、`toRecordField` 删除。
- `ViewFieldRef`、`RecordFieldRef` 视最终 API 设计决定是否保留。
- `sameCellRef` 可保留，但应迁出 root project helper 区。
- `sameFieldLookup` 倾向删除。

### 可保留，但应视为内部实现

#### `dataview/src/engine/project/publish/sections.ts`

里面的：

- `createAppearanceId`
- `parseAppearanceId`

属于 `AppearanceList` 的编码实现细节，不应该被外层依赖。

结论：

- 保留实现。
- 不对外强调为 helper。

#### `dataview/src/engine/project/runtime/sections/shape.ts`

里面的：

- `visibleOf`
- `collapsedOf`
- `buildSectionNode`

属于运行时阶段内部结构函数。

结论：

- 保留。
- 仅作为 runtime 内部函数。

#### `runtime/query/index.ts`、`runtime/sections/index.ts`、`runtime/calc/index.ts`

这里的 `resolve*Action` 是阶段调度逻辑，不属于问题。

结论：

- 保留。

---

## 需要补的底层能力

### 1. 引入 `SectionList`

当前 `ActiveViewState.sections` 是 `readonly Section[]`，这会迫使上层：

- 遍历查找 section
- 从 section key 找 ids
- 从 section key 找 color
- 从 section key 再配合 appearances 算 record ids

这说明数组不是合适的公开模型。

建议新增发布模型：

```ts
interface SectionList {
  ids: readonly SectionKey[]
  all: readonly Section[]
  get: (sectionKey: SectionKey) => Section | undefined
  has: (sectionKey: SectionKey) => boolean
  indexOf: (sectionKey: SectionKey) => number | undefined
  appearanceIds: (sectionKey: SectionKey) => readonly AppearanceId[]
  recordIds: (sectionKey: SectionKey) => readonly RecordId[]
  color: (sectionKey: SectionKey) => string | undefined
}
```

说明：

- `recordIds(sectionKey)` 应直接是底层能力，不应再让调用方自己用 `appearances` 转。
- `all` 保留是为了列表渲染方便。
- `ids` 保留是为了稳定顺序、低成本比对和导航。

落地后可以删除：

- `sectionHelpers.ts`
- `getSectionColor` 中的 `find(...)`
- `getSectionRecordIds` 里的拼接逻辑

### 2. 增强 `AppearanceList`

当前 `AppearanceList` 已经有：

- `get`
- `has`
- `indexOf`
- `at`
- `prev`
- `next`
- `range`
- `sectionOf`
- `idsIn`

但还缺最关键的跨层常用能力：

```ts
interface AppearanceList {
  recordId: (appearanceId: AppearanceId) => RecordId | undefined
  recordIds: (appearanceIds: readonly AppearanceId[]) => readonly RecordId[]
  planMove: (
    appearanceIds: readonly AppearanceId[],
    target: Placement
  ) => {
    ids: readonly AppearanceId[]
    target: {
      section: SectionKey
      before?: AppearanceId
    }
    changed: boolean
  }
}
```

说明：

- `recordId` 和 `recordIds` 是 `recordIdsOfAppearances` 的模型内化。
- `planMove` 是 `move.plan` 的模型内化。

如果继续只给 `get`，那外层就必然继续自己拼 dedupe、filter、order 和 `before` 计算。

### 3. 增强 `FieldList`

当前 `FieldList` 的定义和实际语义不够一致，尤其 `publish/view.ts` 里当前生成逻辑会排除 title，导致它更像“可见 custom fields 列表”，而不是“当前视图显示字段模型”。

建议统一为完整列模型：

```ts
interface FieldList {
  ids: readonly FieldId[]
  all: readonly Field[]
  custom: readonly CustomField[]
  get: (fieldId: FieldId) => Field | undefined
  has: (fieldId: FieldId) => boolean
  indexOf: (fieldId: FieldId) => number | undefined
  at: (index: number) => FieldId | undefined
  range: (anchor: FieldId, focus: FieldId) => readonly FieldId[]
}
```

关键要求：

- `ids` 必须和 `view.display.fields` 对齐。
- `all` 必须和 `ids` 对齐。
- `title` 必须能出现在 `get/indexOf/range` 的主路径里。
- `custom` 只是派生，不是主体。

这样可以收敛这些散落读取：

- `view.display.fields.indexOf(...)`
- `fields.get(...)`
- `fields.custom`
- `active.read.getDisplayFieldIndex(...)`

### 4. 把 cell 解析做成底层统一入口

当前从一个 `CellRef` 走到真实业务对象，需要额外依赖：

- `appearances`
- `toRecordField`
- `fieldOf`
- `getRecord`
- `getField`

这导致 table、facade、active.read 到处重复“cell -> recordId -> field -> value”的解析链。

建议 `engine.active.read` 直接提供：

```ts
interface ActiveCell {
  appearanceId: AppearanceId
  recordId: RecordId
  fieldId: FieldId
  section: SectionKey
  record: DataRecord
  field: Field | undefined
}

interface ActiveViewReadApi {
  resolveCell: (cell: CellRef) => ActiveCell | undefined
  getCellRecordId: (cell: CellRef) => RecordId | undefined
  getCellField: (cell: CellRef) => Field | undefined
  getCellValue: (cell: CellRef) => unknown
  getCellSection: (cell: CellRef) => SectionKey | undefined
}
```

结论：

- `fieldOf` 删除。
- `toRecordField` 删除。
- table `openCell`、cell write、hover/selection 里的部分解析统一走 `active.read`。

### 5. 把移动计划做成底层统一读取能力

当前 gallery、kanban、facade 在做移动时，需要组合：

- `move.plan`
- `recordIdsOfAppearances`
- `readSectionRecordIds`
- `move.before`

这说明“拖拽移动计划”已经是领域读能力，不该继续散在 helper 里。

建议直接提供：

```ts
interface ItemMovePlan {
  appearanceIds: readonly AppearanceId[]
  recordIds: readonly RecordId[]
  changed: boolean
  sectionChanged: boolean
  target: {
    section: SectionKey
    beforeAppearanceId?: AppearanceId
    beforeRecordId?: RecordId
  }
}

interface ActiveViewReadApi {
  planItemMove: (
    appearanceIds: readonly AppearanceId[],
    target: Placement
  ) => ItemMovePlan
}
```

这样：

- React 侧只判断 `plan.changed`
- facade 直接拿 `plan.recordIds` 和 `plan.target.beforeRecordId`
- 不再自己算 `sectionChanged`
- 不再自己算 `beforeRecordId`

---

## 最终 API 形态建议

### `ActiveViewState`

保留它作为“完整活动视图快照”，但其内部读模型要升级：

```ts
interface ActiveViewState {
  view: View
  filter: ViewFilterProjection
  group: ViewGroupProjection
  search: ViewSearchProjection
  sort: ViewSortProjection
  records: RecordSet
  sections: SectionList
  appearances: AppearanceList
  fields: FieldList
  calculations: ReadonlyMap<SectionKey, CalculationCollection>
}
```

关键变化：

- `sections` 从数组升级为 `SectionList`
- `fields` 变成完整显示列模型

### `ActiveViewReadApi`

目标不是继续补零碎 getter，而是成为唯一解析入口。

建议最终至少具备：

```ts
interface ActiveViewReadApi {
  getRecord: (recordId: RecordId) => DataRecord | undefined
  getField: (fieldId: FieldId) => Field | undefined

  getGroupField: () => Field | undefined
  getFilterField: (index: number) => Field | undefined

  getAppearanceRecordId: (appearanceId: AppearanceId) => RecordId | undefined
  getAppearanceRecord: (appearanceId: AppearanceId) => DataRecord | undefined
  getAppearanceSectionKey: (appearanceId: AppearanceId) => SectionKey | undefined
  getAppearanceColor: (appearanceId: AppearanceId) => string | undefined

  getSectionRecordIds: (section: SectionKey) => readonly RecordId[]
  getSectionColor: (section: SectionKey) => string | undefined

  getDisplayFieldIndex: (fieldId: FieldId) => number

  resolveCell: (cell: CellRef) => ActiveCell | undefined
  getCellRecordId: (cell: CellRef) => RecordId | undefined
  getCellField: (cell: CellRef) => Field | undefined
  getCellValue: (cell: CellRef) => unknown
  getCellSection: (cell: CellRef) => SectionKey | undefined

  planItemMove: (
    appearanceIds: readonly AppearanceId[],
    target: Placement
  ) => ItemMovePlan
}
```

最终目标是：外层使用 `read`，而不是直接依赖 `engine/project` helper。

---

## 对现有调用方的影响

### `engine/store/selectors.ts`

当前这里仍然在自己拼：

- `toRecordField`
- `readSectionRecordIds`
- `sections.find(...)`
- `appearances.sectionOf(...)`

最终应该变成直接调用发布模型对象方法或统一 read API，不再手写拼装逻辑。

### `engine/facade/view/index.ts`

这是目前 helper 依赖最重的地方，主要依赖：

- `recordIdsOfAppearances`
- `readSectionRecordIds`
- `move.plan`
- `move.before`
- `toRecordField`

最终应变为：

- record id 由 `appearances.recordIds(...)` 或 `active.read.planItemMove(...)` 提供
- section record ids 由 `sections.recordIds(...)` 提供
- cell 解析由 `active.read.resolveCell(...)` 提供
- 拖拽计划由 `active.read.planItemMove(...)` 提供

### React table

`openCell` 当前依赖 `fieldOf(...)`。  
最终应改为：

- `engine.active.read.resolveCell(cell)`

这样 table 不再需要知道 `viewId + appearances` 的拼装逻辑。

### React gallery / kanban

当前拖拽 indicator 和 drop 逻辑依赖 `viewMove.plan(...)`。  
最终应改为：

- `engine.active.read.planItemMove(...)`

React 只读计划结果，不做移动语义计算。

---

## 目录收敛建议

最终 `dataview/src/engine/project` 建议收敛为三层：

### 1. `runtime/*`

只负责：

- query
- sections
- calc
- demand
- trace

不对外承担 helper 职责。

### 2. `publish/*`

负责把 runtime state 发布成完整读模型：

- `SectionList`
- `AppearanceList`
- `FieldList`
- filter/group/search/sort projection

### 3. `public types`

只保留稳定领域模型：

- `readModels.ts`
- `viewProjections.ts`
- `index.ts`

其中 `index.ts` 不应再导出一堆 root helper。

---

## 最终文件级建议

### 删除

- `dataview/src/engine/project/appearanceHelpers.ts`
- `dataview/src/engine/project/sectionHelpers.ts`
- `dataview/src/engine/project/movePlan.ts`

### 大幅收缩或重组

- `dataview/src/engine/project/refs.ts`
- `dataview/src/engine/project/index.ts`

### 保留并增强

- `dataview/src/engine/project/readModels.ts`
- `dataview/src/engine/project/viewProjections.ts`
- `dataview/src/engine/project/publish/sections.ts`
- `dataview/src/engine/project/publish/view.ts`

### 配套调整

- `dataview/src/engine/api/public/project.ts`
- `dataview/src/engine/store/selectors.ts`
- `dataview/src/engine/facade/view/index.ts`
- `dataview/src/react/views/table/openCell.ts`
- `dataview/src/react/views/gallery/runtime.ts`
- `dataview/src/react/views/kanban/runtime.ts`

---

## 一步到位实施方案

### 阶段 1. 完整化发布模型

目标：

- `sections` 升级为 `SectionList`
- `fields` 升级为完整列模型
- `appearances` 增加 `recordId / recordIds / planMove`

完成标准：

- `readModels.ts` 不再只是薄接口定义，而是明确承载最终读能力设计
- `publish/sections.ts`、`publish/view.ts` 直接生成完整模型

### 阶段 2. 收口到 `engine.active.read`

目标：

- 新增 cell 解析能力
- 新增 item move plan 能力
- 所有 section/appearance/field 的常用读取都从这里统一出去

完成标准：

- `ActiveViewReadApi` 能承接 table、gallery、kanban、facade 的主读取路径

### 阶段 3. 删除 helper 依赖

目标：

- facade 不再 import `recordIdsOfAppearances`、`readSectionRecordIds`、`move.plan`、`toRecordField`
- React 不再 import `fieldOf`、`move.plan`

完成标准：

- `appearanceHelpers.ts`、`sectionHelpers.ts`、`movePlan.ts` 删除
- `refs.ts` 只保留必要类型或直接并回更合理位置

### 阶段 4. 清理导出面

目标：

- `engine/project/index.ts` 只导出稳定模型和必要类型
- 不再对外导出补洞 helper

完成标准：

- 外层 import `@dataview/engine/project` 时，不再依赖 helper 思维

---

## 最终判断

`engine/project` 的问题，本质上不是 helper 太多，而是：

- 发布出来的读模型还不够完整
- 统一 read API 还没真正接管解析职责
- 导致 facade 和 React 被迫理解 project 内部结构

因此，正确方向不是继续增加 helper，而是：

1. 让 `SectionList`、`AppearanceList`、`FieldList` 成为完整读模型。
2. 让 `engine.active.read` 成为唯一解析入口。
3. 删除 `appearanceHelpers`、`sectionHelpers`、`movePlan` 这类补洞层。
4. 把 `refs` 从“解析 helper 集合”收缩回“必要类型定义”。

如果这套方案落地，`engine/project` 会从“对外散落 helper 的目录”收敛成“投影运行时 + 完整发布模型”的清晰结构。
