# Dataview Field Calculation 设计方案

## 背景

你要的能力本质上是 Notion table footer 那类「按 field 配一个 calculation，然后在当前 view 作用域里显示结果」。

目标能力大致分三层：

- 通用统计：
  - 总数
  - 值的总数
  - 唯一值的总数
  - 空单元格总数
  - 非空单元格总数
  - 空单元格百分比
  - 非空单元格百分比
- 数字字段附加统计：
  - 总和
  - 平均数
  - 中位数
  - 最小值
  - 最大值
  - 范围
- status 字段附加统计：
  - 各 option / category 的总数
  - 各 option / category 的百分比

问题不是“怎么算”，而是“这个能力应该挂在哪层、用什么数据模型、怎么保证实现足够简单”。

## 现状调研

### 1. view 上已经有 `aggregates`，但这次不应继续沿用它的语义

当前 `dataview` 的状态合同里已经有：

- `View.aggregates`
- `view.aggregates.set` command

相关位置：

- `dataview/src/core/contracts/state.ts`
- `dataview/src/core/contracts/commands.ts`
- `dataview/src/engine/command/commands/view.ts`

当前代码里的结构是一个很早期的通用 aggregate 设计：

```ts
export interface AggregateSpec {
  key: string
  op: 'count' | 'sum' | 'avg' | 'min' | 'max'
  property?: CustomFieldId
  scope?: 'all' | 'visible'
}
```

它有几个明显问题：

- 只支持很少的 op
- `property` 只允许 `CustomFieldId`，不支持 `title`
- 模型偏“SQL 风格聚合列表”，不偏“每个列脚一个 calculation”
- 没有能力表达：
  - `countValues`
  - `countUniqueValues`
  - `countEmpty`
  - `countNonEmpty`
  - `percentEmpty`
  - `percentNonEmpty`
  - `median`
  - `range`
  - `status` 的分布型结果

这次设计里我建议明确一件事：

- 不兼容这套旧 aggregate 语义
- 可以直接重构

也就是说，当前 `View.aggregates` 这个名字可以保留，也可以改名；但它背后的 schema 不需要迁就现在这套 `key/op/property/scope` 模型。

### 2. engine projection 还没有 aggregate 结果

当前 `resolveViewProjection()` 只会产出：

- `view`
- `schema`
- `appearances`
- `sections`
- `fields`

相关位置：

- `dataview/src/engine/projection/view/types.ts`
- `dataview/src/engine/projection/view/projection.ts`

也就是说，`engine.read.viewProjection.get(viewId)` 现在没有任何 footer / summary / calculation 结果。

### 3. React current view 只是包了一层 projection

`createCurrentViewStore()` 只是把 `engine.read.viewProjection` 包成 `CurrentView`：

- `dataview/src/react/runtime/currentView/store.ts`

所以如果 aggregate 想进入 React，最自然的入口不是在 React 里自己重新扫描 record，而是把结果并进 projection。

### 4. table 虚拟块模型里没有 footer

当前 table block 只有三种：

- `section-header`
- `column-header`
- `row`

相关位置：

- `dataview/src/react/views/table/virtual/types.ts`
- `dataview/src/react/views/table/virtual/buildBlocks.ts`

所以现在根本没有 footer row 的承载点。

### 5. field 语义层已经有一部分可直接复用

当前已有的可复用语义很关键：

- 读 cell value：
  - `getRecordFieldValue(record, fieldId)`
- 空值判断：
  - `isEmptyFieldValue(value)`
- 数字读取：
  - `readNumberValue(value)`
- status / select grouping domain 和 label/color 解析：
  - `getFieldOption()`
  - `getFieldOptions()`
  - `getStatusOptionCategory()`
  - `resolveFieldGroupBucketDomain()`
  - `resolveFieldGroupBucketEntries()`

相关位置：

- `dataview/src/core/field/index.ts`
- `dataview/src/core/field/kind/shared.ts`
- `dataview/src/core/field/kind/index.ts`

这意味着 calculation 口径不应该在 React 里重写一套，而应该直接建立在 `core/field` 的既有语义上。

## 结论

## 1. 计算应该放在 engine/read projection，不应该放在 React render

这是这次设计里最重要的结论。

原因很直接：

- calculation 的输入是 view document truth，不是 DOM truth
- calculation 依赖 field semantic：
  - title 与 custom field 的取值方式
  - empty 的定义
  - number 的解析
  - status option / category 的解释
- grouped view、filtered view、search view 的统计口径都应该和 engine 的 visible records 完全一致
- 如果在 React 里算，table / gallery / kanban 后面会各自长出一套重复逻辑
- projection 已经是当前 view 的统一派生结果，把 calculation 放进去最顺

所以分层建议是：

- `core`：定义 calculation capability 和纯计算逻辑
- `engine/projection`：基于当前 view visible scope 产出 calculation result
- `react/table`：只负责 footer row block 和结果展示

## 2. 不建议再新开一套 `table.footerCalculations` 持久化模型

如果需要兼容旧数据，我之前建议“复用 `view.aggregates` 并重定义语义”。

但在你现在明确说“完全不需要兼容”的前提下，我会把方案再收得更干净一点：

- 不保留旧 aggregate 语义
- 不继续把它理解成通用 aggregate 列表
- 直接把它收敛成 field calculation 配置

理由：

- `View` 上已经有 `aggregates`
- `view.aggregates.set` command 已经存在
- view duplicate / normalize / field remove cleanup 已经把它串起来了一部分
- calculation 本质上是 view-local persisted state，不是纯 UI 临时态
- 后续如果 gallery / kanban 也想消费同一套 field calculation 配置，不需要再复制一份

当前问题不是“有没有存储位”，而是“这个存储位设计得不对”。

如果允许完全重构，我更推荐进一步简化成：

- 把 `View.aggregates` 直接改名为 `View.calculations`
- 把 `view.aggregates.set` 改成 `view.calculations.set`

这样语义更直接，也不会背着旧 aggregate 的历史包袱。

## 推荐方案

## 1. 在“不兼容旧 aggregate”的前提下，直接改成 `calculations`

建议直接把模型改成：

```ts
export type CalculationMetric =
  | 'countAll'
  | 'countValues'
  | 'countUniqueValues'
  | 'countEmpty'
  | 'countNonEmpty'
  | 'percentEmpty'
  | 'percentNonEmpty'
  | 'sum'
  | 'average'
  | 'median'
  | 'min'
  | 'max'
  | 'range'
  | 'countByOption'
  | 'percentByOption'

export interface View {
  ...
  calculations: Partial<Record<FieldId, CalculationMetric>>
}
```

对应 command：

```ts
type Command =
  | {
      type: 'view.calculations.set'
      viewId: ViewId
      calculations: Partial<Record<FieldId, CalculationMetric>>
    }
```

这是我现在最推荐的最终命名。

原因：

- `calculation` 比 `aggregate` 更贴近 Notion 心智
- 它本来就是“字段列脚计算”，不是通用 analytics aggregate
- 彻底去掉旧模型后，理解成本会小很多

## 2. `calculations` 继续保持最小 schema

`calculations` 不要再加多余结构，保持最小：

```ts
export type CalculationMetric =
  | 'countAll'
  | 'countValues'
  | 'countUniqueValues'
  | 'countEmpty'
  | 'countNonEmpty'
  | 'percentEmpty'
  | 'percentNonEmpty'
  | 'sum'
  | 'average'
  | 'median'
  | 'min'
  | 'max'
  | 'range'
  | 'countByOption'
  | 'percentByOption'

export type ViewCalculations = Partial<Record<FieldId, CalculationMetric>>
```

这个模型简单的关键点是：

- 直接表达 `field -> metric`
- 不要数组项结构
- 不要 `key`
- 不要 `property`
- 不要 `scope`
- 不要 `label`
- 不要 `format`
- 不要给 status 单独再塞配置

这些东西都不是第一阶段必须的。

对应约束：

- 一个 field 最多一个 calculation
- 未配置的 field 就是不显示 calculation
- table footer 只展示当前 `view.options.display.fieldIds` 里出现的配置

我现在更推荐 `Record` 而不是数组，原因是：

- 我们没有“一个 field 多个 calculation”的需求
- 我们没有 calculation 自身顺序语义
- footer 展示顺序本来就由 `view.options.display.fieldIds` 决定
- render / projection 读取时直接 `calculations[fieldId]` 最简单
- 写入时天然避免重复项和 normalize

## 2. capability 用 field kind 驱动，不要靠 UI 手写 if/else

建议新增一套 capability resolver：

```ts
export const getFieldCalculationMetrics = (
  field: Field | undefined
): readonly CalculationMetric[]
```

建议矩阵如下。

### 所有 field 都支持

- `countAll`
- `countValues`
- `countUniqueValues`
- `countEmpty`
- `countNonEmpty`
- `percentEmpty`
- `percentNonEmpty`

### number 支持追加

- `sum`
- `average`
- `median`
- `min`
- `max`
- `range`

### status 支持追加

- `countByOption`
- `percentByOption`

### 可选扩展，但不建议第一阶段做

- `select` 也支持 `countByOption` / `percentByOption`
- `boolean` 支持 checked / unchecked 专用统计
- `date` 支持 earliest / latest

这部分不要一开始就做太满。第一阶段先把你列出来的能力做实。

## 3. 这个模型能不能支持“筛选后、分组后”的 aggregate

答案是：能，而且这个简单模型天然就支持。

关键不是在配置里额外存：

- filter scope
- group scope
- section id

而是把 scope 彻底交给 projection。

### 筛选后 aggregate

当前 view 的：

- filter
- search
- sort

已经在 `resolveViewRecordState()` 里收敛成了：

- `visibleRecords`

所以 calculation 只要基于 `visibleRecords` 算，天然就是“筛选后 aggregate”。

### 分组后 aggregate

当前 grouped view 在 projection 里已经会产出：

- `sections`
- 每个 section 下的 row ids

所以 calculation 只要改成“按 section 计算”：

- flat view：一个 section
- grouped view：多个 section

天然就是“分组后 aggregate”。

这就是为什么我说这个模型能支持，而且不需要在 config 里再加任何 scope 字段。

### 最简原则

不要把“筛选后”和“分组后”设计成配置项。

它们不是配置，而是 view projection 的自然结果：

- 当前 view visible scope 是什么
- 当前 section scope 是什么

calculation 只消费 scope，不负责定义 scope。

这是最简单也最稳的做法。

## 4. 结果模型不要只返回一个 number

通用 count/sum 当然可以是标量，但 status 分布不是一个标量，所以返回值必须是结构化结果。

建议用统一结果协议：

```ts
export type CalculationResult =
  | {
      kind: 'scalar'
      metric: CalculationMetric
      value: number
      display: string
    }
  | {
      kind: 'percent'
      metric: CalculationMetric
      numerator: number
      denominator: number
      value: number
      display: string
    }
  | {
      kind: 'distribution'
      metric: CalculationMetric
      denominator: number
      items: readonly {
        key: string
        label: string
        count: number
        percent: number
        color?: string
      }[]
      display: string
    }
  | {
      kind: 'empty'
      metric: CalculationMetric
      display: string
    }
```

这里的 `display` 很重要。

不要把所有展示责任都扔给 React。engine 可以产出结构化数据，React 再决定是：

- 直接用 `display`
- 还是对 `distribution.items` 做更丰富的 UI

这样既保留结构化扩展性，也避免渲染层被迫理解全部统计细节。

## 5. 作用域统一按 section visible scope 计算

这是实现既简单又符合直觉的关键点。

### flat table

flat table 只有一个 scope：

- 当前 view visible rows

### grouped table

grouped table 不做“一个总 footer + 一堆 section footer”的双轨模型。

第一阶段直接做：

- 每个 section 一个自己的 footer
- footer 只统计当前 section visible rows

这样 status 的“每个分组总数 / 百分比”天然就有了，不需要额外设计第二套“按 group 统计”的语义。

换句话说：

- 不是给 `status` 单独做“每个分组总数”
- 而是让 grouped table 的 footer 本身就是 section-local scope

这是最简单、最统一的方案。

## 6. projection 里增加 `calculationsBySection`

推荐把结果直接并进 `ViewProjection`：

```ts
export interface CalculationCollection {
  byField: ReadonlyMap<FieldId, CalculationResult>
  get: (fieldId: FieldId) => CalculationResult | undefined
}

export interface ViewProjection {
  view: View
  schema: Schema
  appearances: AppearanceList
  sections: readonly Section[]
  fields: FieldList
  calculationsBySection: ReadonlyMap<SectionKey, CalculationCollection>
}
```

这样 table render 只需要：

- 知道当前 block 的 `scopeId`
- 从 `currentView.calculationsBySection.get(scopeId)` 取结果

不需要额外再开一个独立 read store。

## 7. flat scope id 应统一成真实 section key

当前 flat table column header 用的是硬编码：

```ts
scopeId: 'flat'
```

而 projection 里的 flat section key 是：

```ts
ROOT_SECTION_KEY = 'root'
```

这两个命名分叉会让 footer lookup 变得别扭。

建议顺手统一：

- flat table 的 header block 也直接使用真实 section key
- 不再额外发明 `'flat'`

这样后面 footer block、selection scope、aggregate scope 都可以复用同一个 key。

## 计算语义细节

## 1. 空值定义

不要重新发明定义，直接复用：

- `isEmptyFieldValue(value)`

当前规则是：

- `undefined` / `null` 是空
- 空字符串或全空白字符串是空
- 空数组是空
- `false` 不是空
- `0` 不是空

这套规则已经足够合理，应成为 calculation 的唯一口径。

## 2. count 系列定义

### `countAll`

- 分母是当前 scope 的 row 总数
- 与 field value 无关

### `countValues`

- 非空 cell 的数量

### `countUniqueValues`

- 对非空 cell 做去重后的数量

建议去重 key 规则：

- title / text / url / email / phone：trim 后字符串
- number：`readNumberValue()` 后的 number
- boolean：布尔值
- select / status：option id
- date：标准化后的原值序列化
- multiSelect：排序后的 option id 数组序列化
- asset：先不做特别聪明的语义，直接按稳定序列化

第一阶段不需要追求极限“人类语义去重”，只要规则稳定即可。

### `countEmpty`

- 空 cell 数量

### `countNonEmpty`

- 非空 cell 数量
- 本质上等于 `countValues`

这两个命名同时保留是合理的，因为 UI 文案层和 notion 心智都需要。

## 3. percent 系列定义

### `percentEmpty`

- `countEmpty / countAll`

### `percentNonEmpty`

- `countNonEmpty / countAll`

如果 `countAll === 0`：

- 返回 `kind: 'empty'`
- display 用 `--`

不要偷偷返回 `0%`，那会误导。

## 4. number 系列定义

数字统计只对 `readNumberValue(value) !== undefined` 的 cell 生效。

也就是说：

- 空值跳过
- 非法 number 跳过

### `sum`

- 所有有效 number 求和

### `average`

- `sum / numericCount`

### `median`

- 对有效数字排序后取中位数

### `min`

- 最小值

### `max`

- 最大值

### `range`

- `max - min`

如果有效 number 个数为 0：

- 返回 `kind: 'empty'`
- display 为 `--`

## 5. status 分布定义

### `countByOption`

返回每个 option 的 count。

### `percentByOption`

返回每个 option 的 percent。

这里建议分母使用：

- 非空 status value 的总数

不要用 `countAll` 当分母。

原因：

- 空值占比已经由 `percentEmpty` / `percentNonEmpty` 负责
- status 分布更应该表达“已填状态里各状态的占比”

如果后面产品想完全对齐 Notion，再单独加可选分母策略；第一阶段不要引入这个复杂度。

## engine 设计

## 1. `core` 新增 calculation 纯逻辑

建议新增目录：

- `dataview/src/core/calculation/`

或者：

- `dataview/src/core/field/calculation/`

我更倾向于 `core/calculation/`，因为这不只是 field schema，而是 view-visible-scope 的统计协议。

建议最小文件拆法：

- `contracts.ts`
- `capability.ts`
- `compute.ts`
- `format.ts`

职责建议：

- `contracts.ts`
  - `CalculationMetric`
  - `ViewCalculations`
  - `CalculationResult`
- `capability.ts`
  - `getFieldCalculationMetrics(field)`
- `compute.ts`
  - `computeCalculation(field, metric, records)`
  - `computeCalculationsForFields(calculations, fields, records)`
- `format.ts`
  - 标量和百分比的 display 字符串

## 2. projection 阶段按 section 批量计算

建议在 `resolveViewProjection()` 内完成：

1. 先拿到现有 `sections`
2. 为每个 section 拿到 record 列表
3. 读取 `view.calculations`
4. 遍历 `Object.entries(view.calculations)`
5. 对每个已配置 field 计算结果
5. 产出 `calculationsBySection`

这里的关键是：

- 计算输入必须是已经过 filter/search/group 后的 visible rows
- grouped table 只按 section rows 计算
- flat table 就按唯一 section rows 计算

这样统计口径自动和界面一致。

## 3. 不要在 commit/runtime 层维护复杂 cache

第一阶段不需要专门做 calculation runtime cache。

原因：

- 目前 `engine.read.viewProjection` 本身就是 document pull derived
- 先把能力做对，比过早优化更重要
- 计算量只与：
  - 当前 view 显示 field 数
  - 当前配置了 aggregate 的 field 数
  - 当前 visible rows 数
  有关

更简单的策略是：

- projection 重算时顺带重算 calculations
- 只对 `view.calculations` 中声明过的 field 计算

这已经足够作为第一版。

如果后面性能真有问题，再做：

- per-section memo
- per-field reducer cache
- changes-aware partial recompute

但第一阶段不要先背这个复杂度。

## React / 渲染设计

## 1. table block 新增 `column-footer`

建议把 block 类型扩成：

- `section-header`
- `column-header`
- `row`
- `column-footer`

对应位置：

- `dataview/src/react/views/table/virtual/types.ts`
- `dataview/src/react/views/table/virtual/buildBlocks.ts`
- `dataview/src/react/views/table/components/body/BlockContent.tsx`

### flat table

顺序：

- column-header
- rows
- column-footer

### grouped table

顺序：

- section-header
- column-header
- rows
- column-footer

如果 section collapsed：

- 不渲染 section footer

这和现在 column-header 的处理方式一致，行为直观。

## 2. footer UI 只做薄展示

建议新增：

- `TableFooterRow`
- `TableFooterCell`

渲染责任只包括：

- 没配置 calculation 时显示空态按钮，比如“计算”
- 有配置时显示 result display
- 如果 result 是 distribution，可做一层轻量富展示

不要把统计逻辑写进 footer cell。

## 3. calculation picker 从 column header menu 进入

最自然的入口不是 view settings panel，而是 column header menu。

当前 column header 已经有 menu：

- `dataview/src/react/views/table/components/column/ColumnHeader.tsx`

建议直接新增一个 submenu：

- `计算`

内容根据 `getFieldCalculationMetrics(field)` 动态生成。

这里名称也应同步成：

- `getFieldCalculationMetrics(field)`

交互：

- 选择某个 metric：设置 `view.calculations[fieldId] = metric`
- 选择“无”：删除 `view.calculations[fieldId]`

这比先做一个全局设置面板简单很多，也更符合用户心智。

## 4. distribution 的展示不要过度复杂

status 的 `countByOption` / `percentByOption`，第一阶段不要做成超复杂的小图表。

建议只做：

- 单行 wrap text / token 串
- 例如：
  - `Todo 3 · In progress 5 · Complete 2`
  - `Todo 30% · In progress 50% · Complete 20%`

需要颜色时：

- 直接复用 option/status 既有 color token

不要一开始就引入 mini bar chart、tooltip、legend 之类复杂展示。

## 为什么不建议把计算留在 render 层

如果把这件事留在 render 层，会立即出现几个坏结果：

- `TableFooterCell` 必须直接读 document / records / field semantics
- grouped scope 逻辑会塞进 React component
- gallery / kanban 以后想复用时只能复制逻辑
- 测试会集中在 UI 层，纯逻辑难测
- 当前 `engine -> projection -> currentView -> table` 这条链路会被绕开

这和当前 dataview 的收敛方向是反着走的。

所以答案很明确：

- 数据应该在 engine 层算
- 更准确一点说，应该在 `core + engine/projection` 里算
- 渲染层只消费 projection result

## 对现有 aggregate 的处理建议

既然已经明确不需要兼容，我的建议也会更直接：

- 不保留旧 `AggregateSpec`
- 不做 schema migration
- 不做 normalize 兼容
- 直接删掉旧 aggregate 语义
- 新建 `calculations`

### 原因

- 当前结构的 `key` 没有业务价值
- `property` 限制了 title
- `op` 设计太窄
- `scope` 第一阶段没有必要
- 数组结构会引入重复项和无意义顺序

### 建议

- 直接移除旧 `AggregateSpec`
- 新增 `ViewCalculations`
- 对应更新：
  - `core/contracts/state.ts`
  - `core/contracts/commands.ts`
  - `engine/command/commands/view.ts`
  - `engine/command/field/effects.ts`
  - `core/document/views.ts`
- `engine/projection/view/types.ts`
- `engine/projection/view/projection.ts`

## 最小实现路径

## Phase 1: 先把 engine 与 table footer 跑通

1. 删除旧 aggregate schema 和旧 command 语义
2. 新增 `View.calculations` 与 `view.calculations.set`
3. 增加 capability 和 compute 纯逻辑
4. projection 增加 `calculationsBySection`
5. table block 增加 `column-footer`
6. footer row / footer cell 落地
7. column header menu 增加 calculation submenu

这一阶段完成后，你已经得到：

- field -> metric 的最小 calculation 配置
- 筛选后 aggregate
- 分组后 section aggregate
- engine-first 统计
- table footer 展示

## Phase 2: 补 polish

1. status distribution 的颜色和 token 展示优化
2. 更好的 number display formatter
3. empty state 文案和 loading/placeholder 细化
4. 视图设置面板里的 calculation overview

## 最终推荐

如果目标是：

- 不兼容旧 aggregate
- 支持筛选后 aggregate
- 支持分组后 aggregate
- 设计尽量简单

那我现在的最终建议就是：

1. 不继续沿用旧 `aggregate` 语义，直接改名为 `calculation`。
2. `View` 上只保留一个极小配置：`calculations: Partial<Record<FieldId, CalculationMetric>>`。
3. 不在配置里表达 filter/group/scope，这些全部由 projection 的 `visibleRecords + sections` 决定。
4. engine projection 产出 `calculationsBySection`，flat 和 grouped 统一都是 section scope。
5. table 只新增 footer block 和展示层，column header menu 作为唯一配置入口。

这条路径是我能给出的最简方案。
