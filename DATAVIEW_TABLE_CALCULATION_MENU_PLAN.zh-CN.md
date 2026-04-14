# Dataview Table Header Calculation Menu 设计建议

日期：2026-04-15

## 背景

当前 `dataview-react` 的 table header cell menu 里，`计算` 是一个单层 submenu，直接平铺当前字段可用的所有 calculation metric。

相关实现位置：

- `dataview/packages/dataview-react/src/views/table/components/column/ColumnHeader.tsx`
- `dataview/packages/dataview-core/src/calculation/capability.ts`
- `dataview/packages/dataview-core/src/calculation/contracts.ts`
- `dataview/packages/dataview-engine/src/active/commands/summary.ts`
- `shared/ui/src/menu/types.ts`
- `shared/ui/src/menu/shared.ts`
- `shared/ui/src/menu/level.tsx`

这次文档要回答 4 个问题：

1. 现在的 `Menu` 能不能继续分 submenu
2. `计算` 这个 submenu 是否应该再分层
3. 各字段类型适合暴露哪些计算能力
4. 如果要做成更像 Notion 那样的层级菜单，底层还缺哪些模型

## 当前实现现状

### 1. UI 层现状

`ColumnHeader.tsx` 里当前的 `计算` 菜单结构是：

- `无`
- 然后把 `getFieldCalculationMetrics(field)` 返回的 metric 逐个平铺成 toggle item

也就是说：

- 现在没有“计数 / 百分比 / 数值统计 / 更多选择”这类二级分组
- 当前菜单的信息架构完全由 `readonly CalculationMetric[]` 这个扁平数组驱动

### 2. 当前 calculation capability

`dataview-core/src/calculation/capability.ts` 当前定义：

- `BASE_METRICS`
  - `countAll`
  - `countValues`
  - `countUniqueValues`
  - `countEmpty`
  - `countNonEmpty`
  - `percentEmpty`
  - `percentNonEmpty`
- `NUMBER_METRICS`
  - `sum`
  - `average`
  - `median`
  - `min`
  - `max`
  - `range`
- `STATUS_METRICS`
  - `countByOption`
  - `percentByOption`

当前按字段类型暴露规则：

- `number`: `BASE_METRICS + NUMBER_METRICS`
- `status`: `BASE_METRICS + STATUS_METRICS`
- 其他类型：仅 `BASE_METRICS`

### 3. 当前结果模型

`CalculationResult` 现在已经不是“只有一个字符串”，而是有结构化结果：

- `scalar`
- `percent`
- `distribution`
- `empty`

这说明：

- 计算结果的执行层已经比 UI 菜单层更成熟
- 当前真正扁平的是“菜单能力描述”，不是“结果模型”

### 4. 当前 Menu 能力

从 `shared/ui/src/menu` 的实现看，当前 `Menu` 是支持继续嵌套 submenu 的。

证据：

- `SubmenuItem.items?: readonly MenuItem[]`
- `findAtPath(...)` 按 path 递归查找 submenu
- `Level` 组件按 path/controller 递归展开 submenu
- 现有项目里已经有一层 submenu 的多个用例

结论：

- 从代码结构看，`shared/ui` 不缺“多级 submenu”的基础能力
- 但 dataview 目前没有真正使用“submenu 里的 submenu”来表达 calculation IA
- 这不代表完全没有风险，只代表“不是先天不支持”

## 结论

## 1. `计算` submenu 应该继续分层

结论是：`应该`，但不建议无限分层。

推荐规则：

- 顶层仍然保留一个 `计算`
- `计算` 里面最多再加一层语义分组 submenu
- 不建议出现三层以上的深菜单

原因：

- 当前 number/status 的 metric 数量已经超出“单层平铺”的舒适范围
- metric 之间语义差异很大：计数、百分比、数值统计、选项分布不是一类东西
- 现在的平铺菜单会让用户先记内部术语，再选功能，不够直观

## 2. 不是所有字段类型都要用同样深度

推荐不是“一刀切所有类型都二级分组”，而是：

- metric 很少的类型可以继续单层
- metric 多且语义跨度大的类型再启用二级 submenu

也就是说：

- `number` 应该二级分组
- `status` 建议二级分组
- `text / url / email / phone / date / boolean / select / multiSelect / asset / title` 可以先保持较浅结构

## 推荐菜单信息架构

### A. Number

推荐做成：

- 无
- 总数
- 百分比
- 更多选择

其中：

`总数` 下：

- 总数 -> `countAll`
- 值的总数 -> `countValues`
- 唯一值的总数 -> `countUniqueValues`
- 空单元格的总数 -> `countEmpty`
- 非空单元格的总数 -> `countNonEmpty`

`百分比` 下：

- 空单元格百分比 -> `percentEmpty`
- 非空单元格百分比 -> `percentNonEmpty`

`更多选择` 下：

- 总和 -> `sum`
- 平均数 -> `average`
- 中位数 -> `median`
- 最小值 -> `min`
- 最大值 -> `max`
- 范围 -> `range`

如果想更贴近你举的 Notion 风格，也可以把 `百分比` 暂时不放进 number 顶层，只做：

- 无
- 总数
- 更多选择

但这意味着：

- 现有 `percentEmpty / percentNonEmpty` 要么隐藏
- 要么塞进 `更多选择`

我的建议是不要隐藏现有能力，最好显式保留一个 `百分比` 分组。

### B. Status

推荐做成：

- 无
- 总数
- 百分比
- 按选项

其中：

`总数` 下：

- 总数 -> `countAll`
- 值的总数 -> `countValues`
- 唯一值的总数 -> `countUniqueValues`
- 空单元格的总数 -> `countEmpty`
- 非空单元格的总数 -> `countNonEmpty`

`百分比` 下：

- 空单元格百分比 -> `percentEmpty`
- 非空单元格百分比 -> `percentNonEmpty`

`按选项` 下：

- 每个选项总数 -> `countByOption`
- 每个选项百分比 -> `percentByOption`

### C. Select / MultiSelect

这里有两个设计方向。

保守方案：

- 先维持现状，只暴露基础计数/百分比
- 不立即引入 `countByOption / percentByOption`

积极方案：

- 把 `countByOption / percentByOption` 从“status 专属”扩展到 `select / multiSelect`

我建议文档先按积极方案设计，但实现可以分阶段。

如果走积极方案，推荐结构和 status 一致：

- 无
- 总数
- 百分比
- 按选项

### D. Text / Title / URL / Email / Phone

推荐先保持简单：

- 无
- 总数
- 百分比

其中：

`总数` 下：

- 总数 -> `countAll`
- 值的总数 -> `countValues`
- 唯一值的总数 -> `countUniqueValues`
- 空单元格的总数 -> `countEmpty`
- 非空单元格的总数 -> `countNonEmpty`

`百分比` 下：

- 空单元格百分比 -> `percentEmpty`
- 非空单元格百分比 -> `percentNonEmpty`

### E. Date

推荐先与 text 一样：

- 无
- 总数
- 百分比

后续如果要增强，再考虑是否加入：

- 最早日期
- 最晚日期
- 日期范围

但这已经不属于当前 `CalculationMetric` 集合，需要新 metric。

### F. Boolean

推荐：

- 无
- 总数
- 百分比

后续可选增强：

- 已勾选总数
- 未勾选总数
- 已勾选百分比

这也需要新增 metric，不是当前模型原生支持的。

### G. Asset

推荐先只给：

- 无
- 总数
- 百分比

不建议现在就扩展文件大小、附件总数之类能力，因为这需要字段值和 aggregation 模型一起升级。

## 字段类型与计算能力矩阵

下面是推荐中的“目标矩阵”，不是当前已经全部实现的矩阵。

### 当前已支持

- `number`
  - `countAll`
  - `countValues`
  - `countUniqueValues`
  - `countEmpty`
  - `countNonEmpty`
  - `percentEmpty`
  - `percentNonEmpty`
  - `sum`
  - `average`
  - `median`
  - `min`
  - `max`
  - `range`
- `status`
  - `countAll`
  - `countValues`
  - `countUniqueValues`
  - `countEmpty`
  - `countNonEmpty`
  - `percentEmpty`
  - `percentNonEmpty`
  - `countByOption`
  - `percentByOption`
- 其他字段
  - `countAll`
  - `countValues`
  - `countUniqueValues`
  - `countEmpty`
  - `countNonEmpty`
  - `percentEmpty`
  - `percentNonEmpty`

### 推荐目标

- `number`
  - 基础计数
  - 基础百分比
  - 数值统计
- `status`
  - 基础计数
  - 基础百分比
  - 按选项分布
- `select`
  - 基础计数
  - 基础百分比
  - 按选项分布
- `multiSelect`
  - 基础计数
  - 基础百分比
  - 按选项分布
- `text / title / url / email / phone / boolean / asset`
  - 基础计数
  - 基础百分比
- `date`
  - 第一阶段先基础计数/百分比
  - 第二阶段再考虑日期专属统计

## 是否需要补充底层模型

结论：`需要一点点`，但不需要一上来搞一整套很重的“菜单描述层”。

当前问题不是“算不出来”，而是“没有结构化描述 metric 的菜单语义”。

### 当前模型缺口

`getFieldCalculationMetrics(field)` 只返回：

- `readonly CalculationMetric[]`

它无法表达：

- 这个 metric 属于哪个菜单分组
- 分组标题是什么
- 哪些 metric 该放顶层，哪些该放 `更多选择`
- 哪些 metric 是推荐项
- 哪些字段类型应该共用同一套 IA
- 哪些 metric 是 capability 层存在但 UI 暂不暴露

### 推荐的轻量方案

第一阶段不建议直接引入一整套 descriptor / spec system。

更务实的做法是只补两个 helper：

```ts
interface CalculationMetricGroup {
  key: 'count' | 'percent' | 'distribution' | 'more'
  label: string
  metrics: readonly CalculationMetric[]
}

groupCalculationMetrics(
  field: Field | undefined,
  metrics: readonly CalculationMetric[]
): readonly CalculationMetricGroup[]

buildCalculationMenuItems(input: {
  field: Field | undefined
  selected?: CalculationMetric
  groups: readonly CalculationMetricGroup[]
  onSelect: (metric: CalculationMetric | null) => void
}): readonly MenuItem[]
```

职责分配：

- capability 继续决定“能不能算”
- `groupCalculationMetrics(...)` 决定“这些 metric 该怎么分组”
- `buildCalculationMenuItems(...)` 决定“最终怎么拼成 `MenuItem[]`”

这样已经足够支撑第一版 submenu 重构，而且复杂度明显低于完整 descriptor 层。

## 我建议的模型分层

### 第一层：计算能力层

继续保留：

- `CalculationMetric`
- `getFieldCalculationMetrics(field)`
- `supportsFieldCalculationMetric(field, metric)`

这层只回答：

- 某字段能不能用某 metric

### 第二层：菜单分组 helper 层

新增：

- `groupCalculationMetrics(field, metrics)`

这层回答：

- 菜单怎么分组
- 哪些 metric 放进 `总数`
- 哪些 metric 放进 `百分比`
- 哪些 metric 放进 `更多选择`

### 第三层：菜单组装 / 展示文案层

新增：

- `buildCalculationMenuItems(groups, selected, onSelect)`

不要把所有 label 都直接写死在 `ColumnHeader.tsx` 里。

建议把当前这种：

- `CALCULATION_LABELS`

抽到 calculation 模块附近，或者 meta 层附近，避免：

- capability 在 core
- label 在 react
- 最后菜单结构又在 react 再写一份

## 是否需要新增 metric

### 第一阶段：不需要

如果目标只是把现有菜单改成更合理的 submenu，不需要新增 metric。

因为当前已经有：

- 基础计数
- 基础百分比
- number 统计
- status 分布

足够支撑第一版 IA 重构。

### 第二阶段：如果要做更强产品化，建议新增

后续如果要进一步逼近成熟产品，建议考虑新增：

- `minDate`
- `maxDate`
- `dateRange`
- `countChecked`
- `countUnchecked`
- `percentChecked`
- `percentUnchecked`
- `countByOption`
- `percentByOption`
  - 扩展到 `select / multiSelect`

这已经超出“菜单重组”范围，会牵涉：

- capability
- aggregate/index
- result compute
- footer rendering

## 对 table footer/result model 的影响

当前 `CalculationResult` 已经够支撑第一阶段菜单重组。

但是如果要把产品做得更像完整 summary 系统，还存在两个可继续补的点：

### 1. `distribution` 结果现在只有 summary string

当前 `display` 是：

- `Todo 2 · Done 3`
- 或百分比拼接字符串

如果以后菜单里更强调“按选项”，footer 可能也要更明确：

- tooltip
- popover
- badge list
- mini breakdown

这时当前 `items` 其实已经够用，UI 层只需要更好利用它。

### 2. 当前缺“menu label”和“result label”的分离

例如：

- 菜单里希望显示 `总数`
- footer 里也许希望显示 `总数: 12`
- 某些地方又希望显示 `Count all`

这说明：

- metric label
- menu group label
- footer label

最好不要继续混在一个 `CALCULATION_LABELS` 常量里。

## 推荐落地顺序

### 阶段 1：只做 IA，不改计算引擎

- 抽出 `groupCalculationMetrics(...)`
- 抽出 `buildCalculationMenuItems(...)`
- `ColumnHeader` 改为按这两个 helper 渲染
- `number` 和 `status` 先做二级 submenu
- 其他字段先保持浅层

这是收益最高、风险最小的一步。

### 阶段 2：扩展 option field distribution

- 把 `countByOption / percentByOption` 扩展到 `select / multiSelect`
- 同步 capability、aggregate、result compute、footer display

### 阶段 3：补字段专属统计

- date 专属
- boolean 专属
- asset 专属

这一步才需要讨论新 metric。

## 最终建议

如果只回答“现在 table header cell 的 `计算` submenu 是否还该继续分 submenu”，我的结论是：

- `应该`
- `shared/ui Menu` 从实现上看是支持继续分 submenu 的
- 但先不要直接在 `ColumnHeader.tsx` 里手搓一大坨多层 menu 逻辑
- 第一阶段只需要补两个 helper，不需要完整 descriptor 模型

最合理的第一版是：

- `number`
  - 无
  - 总数
  - 百分比
  - 更多选择
- `status`
  - 无
  - 总数
  - 百分比
  - 按选项
- 其他类型
  - 暂时保持简单，不急着深挖

这样做的好处是：

- 用户先按语义选，再按 metric 选
- 不需要立刻改动计算引擎
- 能把当前扁平 `CalculationMetric[]` 演进成可维护的 UI 能力描述层

## 建议后续任务

如果下一步要实现，我建议拆成 3 个独立任务：

1. 抽 `groupCalculationMetrics(...)` 和 `buildCalculationMenuItems(...)`
2. 用这两个 helper 重写 `ColumnHeader` 的 `计算` submenu
3. 再决定是否扩展 `select / multiSelect / date / boolean` 的 metric 集合
