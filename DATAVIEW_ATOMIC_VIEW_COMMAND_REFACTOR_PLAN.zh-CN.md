# Dataview View 最终态 API 与 Atomic Command 重构方案

## 当前状态

本文对应的重构已经按“最终态”在仓库内落地：

- `View` 已从 `view.query / view.calculations / options.display.fieldIds` 迁移到扁平结构
- `engine.view(viewId)` 已统一成 `type / search / filter / sort / group / calc / display / table / gallery / kanban / order`
- `group.toggleCollapse` 原子命令已落地，避免 React 侧先读再写
- React 层旧 `grouping / filters / sorters / calculations` 调用已清理

下面文档保留设计原因、命名取舍和分阶段清理原则，但结构示例以当前实际实现为准。

## 结论

这次重构按“最终态”设计，不保留兼容，不做别名，不做双轨，不做 adapter。

目标只有一个：

> React 只发 intent，service 只转发 command，resolver 基于最新 state 计算 next state。

如果一个交互需要“先读当前值，再决定写什么”，那这段逻辑必须在 reducer / resolver 层，不允许留在 React，也不允许留在 `engine/services/view.ts`。

这意味着这次不是只补几个 `toggle`，而是要一次性清理掉旧的 view API 设计：

- 删掉 `view.query.*` 公开 API
- 删掉 `view.query.set` 整块命令
- 删掉 `view.calculations.set` 整 map 命令
- 删掉 `view.display.setFieldIds` 作为主交互入口
- 删掉 `grouping / filters / sorters / calculations` 这些偏旧、偏长、风格不统一的公开命名

## 设计原则

### 1. 名字短，但语义完整

最终命名规则：

- domain 用单数：`filter` `sort` `group` `calc`
- 动作优先用短动词：`set` `add` `only` `move` `clear` `show` `hide` `collapse`
- 不重复写 domain 含义，例如不要 `grouping.setField`
- 不把“整块替换”包装成普通交互 API

### 2. 不允许 service 层组装完整下一状态

禁止这类模式：

1. 读当前 `view`
2. clone `query / calculations / fieldIds`
3. 在 service 里拼 `next`
4. 发一个大对象覆盖命令

允许的只有两类：

1. 纯转发命令
2. 纯参数标准化，例如去重、trim、空值归一化

### 3. 原子粒度按“用户 intent”定义，不按“存储块”定义

例如：

- “切换某个分组字段”是一个 intent
- “折叠某个 bucket”是一个 intent
- “把某列 calculation 设为 average”是一个 intent
- “显示某个字段”是一个 intent

这些都不应该退化成“覆盖整个 query / calc / display”

## 最终状态模型

这次建议直接把 view state 扁平化，不再保留 `query` 这个中间层。

当前模型的问题不是只有 API 冗长，数据结构本身也在鼓励“整块 query 更新”。

最终建议：

```ts
interface View {
  id: ViewId
  name: string
  type: ViewType

  search: Search
  filter: Filter
  sort: Sorter[]
  group?: ViewGroup
  calc: Partial<Record<FieldId, CalculationMetric>>

  display: {
    fields: FieldId[]
  }

  options: ViewOptions
  orders: RecordId[]
}
```

对应的 group：

```ts
interface ViewGroup {
  field: FieldId
  mode: string
  bucketSort: BucketSort
  bucketInterval?: number
  showEmpty?: boolean
  buckets?: Record<string, {
    hidden?: boolean
    collapsed?: boolean
  }>
}
```

这里保留 `Search` / `Filter` 结构，而不是进一步压平为字符串和规则数组，原因是：

- `search.fields` 需要支持未来“限定字段搜索”
- `filter.mode` 是稳定的一等语义，不应该散落在 UI 层自己拼
- 这两块虽然仍是结构对象，但它们已经脱离 `view.query` 这个历史壳层，不再诱导整块 query 覆盖

### 为什么直接扁平化

原因很简单：

- `search / filter / sort / group / calc / display` 本来就是一等概念
- 它们都有独立 command、独立 UI、独立校验规则
- 把它们包进 `query` 只会放大“整块替换”倾向

如果这次明确“不考虑兼容成本”，那就不应该继续背着 `ViewQuery` 这个历史包袱。

## 最终公开 API

最终 `engine.view(viewId)` 只保留下面这些 domain。

```ts
interface ViewApi {
  type: {
    set(type: ViewType): void
  }

  search: {
    set(value: string): void
  }

  filter: {
    add(fieldId: FieldId): void
    replace(index: number, rule: FilterRule): void
    remove(index: number): void
    clear(): void
  }

  sort: {
    add(fieldId: FieldId, direction?: SortDirection): void
    set(fieldId: FieldId, direction: SortDirection): void
    only(fieldId: FieldId, direction: SortDirection): void
    replace(index: number, sorter: Sorter): void
    remove(index: number): void
    move(from: number, to: number): void
    clear(): void
  }

  group: {
    set(fieldId: FieldId): void
    clear(): void
    toggle(fieldId: FieldId): void
    setMode(mode: string): void
    setSort(sort: BucketSort): void
    setInterval(interval?: number): void
    setShowEmpty(value: boolean): void
    show(key: string): void
    hide(key: string): void
    collapse(key: string): void
    expand(key: string): void
    toggleCollapse(key: string): void
  }

  calc: {
    set(fieldId: FieldId, metric: CalculationMetric | null): void
  }

  display: {
    replace(fieldIds: readonly FieldId[]): void
    move(fieldIds: readonly FieldId[], beforeFieldId?: FieldId | null): void
    show(fieldId: FieldId, beforeFieldId?: FieldId | null): void
    hide(fieldId: FieldId): void
    clear(): void
  }

  table: {
    setWidths(widths: Partial<Record<FieldId, number>>): void
    setVerticalLines(value: boolean): void
    insertLeft(anchorFieldId: FieldId, input?: CreateFieldInput): CustomFieldId | undefined
    insertRight(anchorFieldId: FieldId, input?: CreateFieldInput): CustomFieldId | undefined
  }

  gallery: {
    setCardSize(value: GalleryCardSize): void
    setLabels(value: boolean): void
  }

  kanban: {
    setNewRecordPosition(value: KanbanNewRecordPosition): void
    setFillColor(value: boolean): void
  }

  order: {
    move(recordIds: readonly RecordId[], beforeRecordId?: RecordId): void
    clear(): void
  }
}
```

## 命名取舍

### 为什么用 `group`，不用 `grouping`

- `group` 更短
- 是名词，不歧义
- 与 `filter` `sort` `search` 同一风格

### 为什么用 `calc`，不用 `calculation` / `calculations`

- `calc` 足够清晰
- 交互语义天然是“单 field calc”
- `calculations` 暗示整体 map，容易继续诱导整块覆盖

### 为什么保留 `replace`

`replace` 只用于“我明确要替换整个集合”的场景：

- `filter.replace(index, rule)`
- `sort.replace(index, sorter)`
- `display.replace(fieldIds)`

它比 `set` 更准确，因为这里不是标量写入，而是替换某个元素或整个列表。

### 为什么 `group.hide/show` 与 `group.collapse/expand` 分开

因为它们是两种不同语义：

- hidden: bucket 不显示
- collapsed: bucket 显示，但内容折叠

最终 API 必须把这两个概念完全拆开，不能用 `setBucketHidden(key, boolean)` 这种低层接口把语义压平。

## 最终 command 设计

command type 也同步一步到位收敛，不保留旧名字。

```ts
type Command =
  | { type: 'view.type.set'; viewId: ViewId; value: ViewType }
  | { type: 'view.search.set'; viewId: ViewId; value: string }

  | { type: 'view.filter.add'; viewId: ViewId; fieldId: FieldId }
  | { type: 'view.filter.replace'; viewId: ViewId; index: number; rule: FilterRule }
  | { type: 'view.filter.remove'; viewId: ViewId; index: number }
  | { type: 'view.filter.clear'; viewId: ViewId }

  | { type: 'view.sort.add'; viewId: ViewId; fieldId: FieldId; direction?: SortDirection }
  | { type: 'view.sort.set'; viewId: ViewId; fieldId: FieldId; direction: SortDirection }
  | { type: 'view.sort.only'; viewId: ViewId; fieldId: FieldId; direction: SortDirection }
  | { type: 'view.sort.replace'; viewId: ViewId; index: number; sorter: Sorter }
  | { type: 'view.sort.remove'; viewId: ViewId; index: number }
  | { type: 'view.sort.move'; viewId: ViewId; from: number; to: number }
  | { type: 'view.sort.clear'; viewId: ViewId }

  | { type: 'view.group.set'; viewId: ViewId; fieldId: FieldId }
  | { type: 'view.group.clear'; viewId: ViewId }
  | { type: 'view.group.toggle'; viewId: ViewId; fieldId: FieldId }
  | { type: 'view.group.mode.set'; viewId: ViewId; value: string }
  | { type: 'view.group.sort.set'; viewId: ViewId; value: BucketSort }
  | { type: 'view.group.interval.set'; viewId: ViewId; value?: number }
  | { type: 'view.group.empty.set'; viewId: ViewId; value: boolean }
  | { type: 'view.group.bucket.show'; viewId: ViewId; key: string }
  | { type: 'view.group.bucket.hide'; viewId: ViewId; key: string }
  | { type: 'view.group.bucket.collapse'; viewId: ViewId; key: string }
  | { type: 'view.group.bucket.expand'; viewId: ViewId; key: string }
  | { type: 'view.group.bucket.toggleCollapse'; viewId: ViewId; key: string }

  | { type: 'view.calc.set'; viewId: ViewId; fieldId: FieldId; metric: CalculationMetric | null }

  | { type: 'view.display.replace'; viewId: ViewId; fieldIds: FieldId[] }
  | { type: 'view.display.move'; viewId: ViewId; fieldIds: FieldId[]; beforeFieldId?: FieldId | null }
  | { type: 'view.display.show'; viewId: ViewId; fieldId: FieldId; beforeFieldId?: FieldId | null }
  | { type: 'view.display.hide'; viewId: ViewId; fieldId: FieldId }
  | { type: 'view.display.clear'; viewId: ViewId }
```

## resolver 职责边界

每个 command 的 next state 只能在 resolver 算。

### search

- trim 规则如果有，需要统一在 resolver 定义
- 相同值 no-op，也在 resolver 判定

### filter

- `add` 负责检查 field 是否存在、是否已添加
- `replace/remove` 负责 index 范围校验
- `clear` 直接把 filter 置空

### sort

- `add` 负责“如果 field 已存在则 no-op”
- `set` 负责“按 field ensure 一个 sorter”
- `only` 负责“替换成单一 sorter”
- `replace/remove/move` 负责 index 校验

### group

- `set/toggle` 负责 field 校验与 group meta 初始化
- `setMode/setSort/setInterval/setShowEmpty` 负责读取当前 active group field 与 group meta
- `show/hide/collapse/expand/toggleCollapse` 负责读取 bucket 当前状态并计算 next

### calc

- `set(fieldId, metric)` 负责：
  - field 是否存在
  - metric 是否支持
  - `metric === null` 时删除该 field 配置

### display

- `show` 负责“如果 field 已存在则只做 reposition 或 no-op”
- `hide` 负责删除单 field
- `move` 负责基于最新 display.fields 进行有序重排
- `replace` 负责一次性替换完整列表
- `clear` 等价于 `replace([])`，但保留独立 intent 更清晰

## 旧设计中要一次性删除的内容

### 1. 删状态与类型

- 删除 `ViewQuery`
- 删除 `view.query`
- 删除 `view.calculations`
- 删除 `options.display.fieldIds`

替换为：

- `view.search`
- `view.filter`
- `view.sort`
- `view.group`
- `view.calc`
- `view.display.fields`

### 2. 删公开 API

- 删除 `view.query.*`
- 删除 `view.filters.*`
- 删除 `view.sorters.*`
- 删除 `view.grouping.*`
- 删除 `view.calculations.*`
- 删除 `display.setVisibleFields`
- 删除 `display.moveVisibleFields`
- 删除 `table.setShowVerticalLines`
- 删除 `gallery.setShowPropertyLabels`
- 删除 `kanban.setFillColumnColor`

替换为最终 API：

- `filter`
- `sort`
- `group`
- `calc`
- `display`
- `table.setVerticalLines`
- `gallery.setLabels`
- `kanban.setFillColor`

### 3. 删 command

- 删除 `view.query.set`
- 删除 `view.group.bucket.toggleCollapsed`
- 删除 `view.calculations.set`
- 删除 `view.display.setFieldIds`

注意：

- `view.group.bucket.toggleCollapsed` 虽然方向是对的，但名字不是最终态，直接升级成 `view.group.bucket.toggleCollapse`
- 不需要保留过渡别名

### 4. 删 service 内的状态拼装

重点删除：

- `engine/services/view.ts` 里的 `updateQuery()`
- 所有 clone `query / calculations / fieldIds` 后再 dispatch 的逻辑

## React 层最终写法

最终所有交互都应该长成下面这样。

### 分组列头

```ts
view.group.toggle(field.id)
```

### 分组 bucket 折叠

```ts
view.group.toggleCollapse(section.key)
```

### calculation

```ts
view.calc.set(field.id, 'average')
view.calc.set(field.id, null)
```

### 显示字段

```ts
view.display.show(field.id)
view.display.hide(field.id)
view.display.move([field.id], beforeFieldId)
```

React 允许读当前 projection 仅用于渲染：

- `checked`
- `pressed`
- `suffix`
- `label`

React 不允许根据旧状态分支决定调哪个 setter。

## 分阶段实施方案

虽然最终态不保留兼容，但实施仍建议分阶段推进，目的是降低一次性改动冲突，而不是保留旧逻辑。

每个阶段完成后，旧代码立即删除，不留并存。

### Phase 1：改 contracts 与 state 结构

目标：

- 一次性改掉核心类型和持久化结构

执行项：

1. 重写 `core/contracts/state.ts`
2. 删除 `ViewQuery` 相关定义
3. 把 `view.calculations` 重命名为 `view.calc`
4. 把 `options.display.fieldIds` 提升为 `view.display.fields`
5. 更新 `core/document/views.ts` 的 normalize / parse / serialize
6. 更新所有 projection 类型

阶段完成标准：

- 全项目类型层面不再出现 `view.query`
- 全项目类型层面不再出现 `view.calculations`
- 全项目类型层面不再出现 `options.display.fieldIds`

### Phase 2：重建 command 系统

目标：

- 用最终命令集替换旧命令集

执行项：

1. 重写 `core/contracts/commands.ts`
2. 删除 `view.query.set`
3. 删除 `view.calculations.set`
4. 删除 `view.display.setFieldIds`
5. 新增完整的 `view.search/filter/sort/group/calc/display` command
6. 重写 `engine/command/commands/view.ts`
7. 删除旧 resolver 分支

阶段完成标准：

- reducer 中不存在整块 query set
- reducer 中不存在整 map calc set
- reducer 中不存在整列表 display set 作为普通交互路径

### Phase 3：重写 `engine/services/view.ts`

目标：

- service 从“状态拼装层”退化为“命令 façade”

执行项：

1. 删除 `updateQuery()`
2. 删除所有 service 里的 clone / patch / move 拼装
3. 公开 API 改成最终命名：
   - `filter`
   - `sort`
   - `group`
   - `calc`
   - `display`
4. 对已有专门命令的 no-op 预检查全部下沉到 resolver

阶段完成标准：

- `engine/services/view.ts` 里不存在 query 拼装
- `engine/services/view.ts` 里不存在 calc map 拼装
- `engine/services/view.ts` 里不存在 display fieldIds 拼装

### Phase 4：批量替换 React 调用点

目标：

- 所有 UI 全量切到新 API

必须改的地方：

1. `SectionHeader.tsx`
   - `grouping.toggleBucketCollapsed` -> `group.toggleCollapse`
2. `ColumnHeader.tsx`
   - `grouping.clear/setField` -> `group.toggle`
   - `calculations.*` -> `calc.set`
   - `display.hideField` -> `display.hide`
3. `GroupingPanel.tsx`
   - `grouping.*` -> `group.*`
4. `ViewQueryBar.tsx`
   - `filters.* / sorters.*` -> `filter.* / sort.*`
5. `SortPopover.tsx`
   - `sorters.*` -> `sort.*`
6. `ViewFieldsPanel.tsx`
   - `display.setVisibleFields/moveVisibleFields/showField/hideField`
   - -> `display.replace/move/show/hide/clear`
7. `LayoutPanel.tsx`
   - `setShowVerticalLines` -> `setVerticalLines`
   - `setFillColumnColor` -> `setFillColor`

阶段完成标准：

- React 中不再出现旧 domain 名：
  - `grouping`
  - `filters`
  - `sorters`
  - `calculations`
- React 中不再出现“读旧状态再 clear/set”的点击写法

### Phase 5：清理 projection / helper / query 模块

目标：

- 清除旧架构残留

执行项：

1. 删除 `core/query/` 下不再需要的抽象
2. 把 search/filter/sort/group helper 拆到各自模块
3. 删除围绕 `ViewQuery` 命名的 equality / normalize / clone helper
4. 重命名 projection 中相关字段：
   - `view.query.group` -> `view.group`
   - `view.calculations` -> `view.calc`
5. 清理所有 selector、hook、UI summary 文案的旧路径

阶段完成标准：

- 项目中不再存在 `query.` 这类旧 view 状态访问路径
- `core/query/` 可以被彻底删除或缩减为纯兼容空壳后立即删除

## 推荐的实施顺序

如果目标是“一步到位清理干净”，推荐的执行顺序是：

1. 先做 Phase 1 和 Phase 2
2. 接着做 Phase 3
3. 然后一次性扫 React 调用点
4. 最后做 projection/helper 清理

不要反过来先修 React。

原因：

- 如果底层 state 和 command 还没定，React 先改只会改两遍
- 真正的边界在 contracts / command / resolver，不在组件

## 这次重构后的直接收益

### 1. 时序问题从根上消失

因为所有“读当前状态决定 next state”的逻辑都被移到了 resolver。

### 2. API 名称显著更短

例如：

- `grouping.setField` -> `group.set`
- `grouping.toggleBucketCollapsed` -> `group.toggleCollapse`
- `calculations.clear` -> `calc.set(fieldId, null)`
- `display.setVisibleFields` -> `display.replace`
- `sorters.setOnly` -> `sort.only`

### 3. view 结构更直观

最终 view 是：

- `search`
- `filter`
- `sort`
- `group`
- `calc`
- `display`

不是：

- 一个大 `query`
- 外加 `calculations`
- 外加 `options.display.fieldIds`

### 4. 后续 aggregate / filter / group 组合逻辑更好加

因为每个状态 slice 都是清晰的一等概念，不再需要先穿透 `query` 再做大对象 clone。

## 最终建议

如果这次目标是长期最优，而不是最低改动成本，那我建议明确采用下面这个最终决策：

1. `view.query` 整体删除，状态扁平化。
2. `grouping / filters / sorters / calculations` 公开命名整体删除，统一成 `group / filter / sort / calc`。
3. `view.query.set / view.calculations.set / view.display.setFieldIds` 全部删除。
4. 所有 view 交互一律通过原子 command 进入 reducer。
5. service 不再负责 next state 计算。

这就是这套系统的一步到位长期最优形态。
