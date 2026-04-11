# DATAVIEW Command Boundary Simplification Plan

## 背景

当前 `dataview/src/engine/command` 的复杂度已经明显偏高，尤其是 `view` 相关写入。

从代码现状看：

- `dataview/src/core/contracts/commands.ts` 中已经定义了约 `72` 个 `type:` 字面量。
- `dataview/src/engine/command/commands/index.ts` 中有 `67` 个 `case` 分发。
- `dataview/src/engine/command/commands/view.ts` 中包含四十多个 `resolveView*Command`，其中大量实现都遵循同一种重复模板：
  1. `validateViewExists(...)`
  2. 校验 1 到 2 个局部参数
  3. 读取当前 `view`
  4. 调用若干 core 纯函数计算 `nextView`
  5. 判断是否变化
  6. 输出一个 `document.view.put`

这说明当前 `command` 层混入了太多 UI / service 层的交互意图，边界不够硬。

问题不在于 `switch` 长，而在于：

- 很多 command 不是“规范化写语义”
- 很多 command 只是“某个 UI 操作的名字”
- 结果是每个小动作都要独立 resolve / validate / test
- 规则被切散到大量 resolver 中，重复极高


## 现状判断

### 现有问题不是“没有 canonical command”，而是 canonical command 太少

当前系统里其实已经有一些 canonical command 的信号：

- `view.create` 和 `view.duplicate` 最终都会走 `view.put`
- `view.order.move` / `view.order.clear` 旁边已经存在 `view.order.set`
- 很多 `view.*` resolver 的最终结果其实都是“算出下一个 view，然后 put 回去”

这说明系统已经天然在向“高层意图 -> 低层 canonical write”演化，但现在还停在中间态。

### 当前 `view.*` 大部分 command 属于交互意图，而不是 command 层应该长期维护的领域语义

例如以下命令更像 UI / service 语义：

- `view.filter.add`
- `view.filter.preset`
- `view.filter.value`
- `view.sort.move`
- `view.group.bucket.toggleCollapse`
- `view.display.show`
- `view.display.move`
- `view.table.verticalLines.set`
- `view.gallery.labels.set`
- `view.kanban.cardsPerColumn.set`
- `view.order.move`

这些动作对 UI 很友好，但对 command 边界并不友好。  
它们都依赖“当前 view 的某个局部结构”，本质上是基于当前状态推导出一个新的 `View`。

因此它们更适合留在 service / helper 层，不适合全部成为顶层 `Command['type']`。


## 目标

把 `command` 层收敛为“少量 canonical domain writes”，把大量 UI intent 下沉到：

- `engine/services/*`
- `engine/viewmodel/*`
- `core/*` 纯函数

最终原则：

- UI 可以继续拥有丰富而方便的 API
- command 层只保留稳定、聚合级、可长期维护的写入边界
- validate 针对聚合对象集中执行，而不是分散到数十个微命令上


## 最终目标边界

### 1. `view` 聚合

`view` 是当前最值得收敛的写边界。

建议最终只保留：

- `view.create`
- `view.patch` 或 `view.put`
- `view.open`
- `view.remove`

其中建议优先采用：

- `view.patch`

原因：

- `patch` 比 `put` 更适合外部调用，避免 service 每次都需要构造完整 `View`
- 但内部仍然可以先基于当前 `view` 组装出完整对象，再统一校验
- `patch` 可以成为唯一的聚合更新入口

如果团队更偏好最严格、最单纯的聚合替换，也可以选：

- `view.put`

但这会把更多“基于当前状态求 next view”的逻辑推给 service 层。  
二者都能简化；优先推荐 `view.patch`，因为迁移成本更低。

### 2. `customField` 聚合

建议最终保留：

- `customField.create`
- `customField.patch`
- `customField.put` 或 `customField.replaceSchema`
- `customField.remove`

以下应视为高层意图，逐步下沉：

- `customField.convert`
- `customField.duplicate`
- `customField.option.create`
- `customField.option.reorder`
- `customField.option.update`
- `customField.option.remove`

### 3. `record` 聚合

建议先保持相对稳定：

- `record.create`
- `record.insertAt`
- `record.apply`
- `record.remove`

`record` 这条线的复杂度目前明显低于 `view`，不是第一优先级。

### 4. `value` 聚合

`value.apply` 目前仍然有保留价值，因为它承载了：

- `EditTarget`
- `set / patch / clear`

短期不建议和 `record.apply` 强行合并。


## 建议保留的最终 canonical commands

第一版目标建议收敛到以下集合：

- `value.apply`
- `record.create`
- `record.insertAt`
- `record.apply`
- `record.remove`
- `customField.create`
- `customField.patch`
- `customField.put` 或 `customField.replaceSchema`
- `customField.remove`
- `view.create`
- `view.patch` 或 `view.put`
- `view.open`
- `view.remove`
- `external.bumpVersion`


## 明确建议删除的旧 command 实现

以下内容建议从 `Command` 顶层类型中逐步删除。

### `view` 子命令

应删除：

- `view.duplicate`
- `view.rename`
- `view.type.set`
- `view.search.set`
- `view.filter.add`
- `view.filter.set`
- `view.filter.preset`
- `view.filter.value`
- `view.filter.mode`
- `view.filter.remove`
- `view.filter.clear`
- `view.sort.add`
- `view.sort.set`
- `view.sort.only`
- `view.sort.replace`
- `view.sort.remove`
- `view.sort.move`
- `view.sort.clear`
- `view.group.set`
- `view.group.clear`
- `view.group.toggle`
- `view.group.mode.set`
- `view.group.sort.set`
- `view.group.interval.set`
- `view.group.empty.set`
- `view.group.bucket.show`
- `view.group.bucket.hide`
- `view.group.bucket.collapse`
- `view.group.bucket.expand`
- `view.group.bucket.toggleCollapse`
- `view.calc.set`
- `view.display.replace`
- `view.display.move`
- `view.display.show`
- `view.display.hide`
- `view.display.clear`
- `view.table.setWidths`
- `view.table.verticalLines.set`
- `view.gallery.labels.set`
- `view.gallery.setCardSize`
- `view.kanban.setNewRecordPosition`
- `view.kanban.fillColor.set`
- `view.kanban.cardsPerColumn.set`
- `view.order.move`
- `view.order.clear`
- `view.order.set`

说明：

- 这些不是全部都要“一夜删除”
- 但它们最终都不应该继续作为 command 边界长期存在
- 它们应该转化为 service / helper 层 API，再统一收敛到 `view.patch` / `view.put`

### `customField` 子命令

第二阶段建议删除：

- `customField.convert`
- `customField.duplicate`
- `customField.option.create`
- `customField.option.reorder`
- `customField.option.update`
- `customField.option.remove`


## 新的边界分工

### `core/*`

职责：

- 纯规则
- 纯变换
- 纯校验
- 与 UI 无关的领域逻辑

例如：

- filter / sort / group / display / order 的纯计算
- view patch 合并逻辑
- customField schema 变换逻辑

### `engine/services/*`

职责：

- 承接 UI intent
- 读取当前聚合状态
- 调用 core 纯函数求出 `next`
- 最终只发 canonical command

例如：

- `currentView.sort.move(from, to)` 不再直接 dispatch `view.sort.move`
- 而是读取当前 `view.sort`，调用纯函数求出 `nextSort`
- 最终 dispatch `view.patch({ sort: nextSort })`

### `engine/command/*`

职责：

- canonical command validation
- canonical command -> operations
- 聚合级边界保护

它不再负责承接每一个 UI 动作名称。


## 推荐的新 command 设计

### 方案 A：`view.patch`

建议新增：

```ts
type Command =
  | {
      type: 'view.patch'
      viewId: ViewId
      patch: {
        name?: string
        type?: ViewType
        search?: Search
        filter?: Filter
        sort?: Sorter[]
        group?: ViewGroup | null
        calc?: ViewCalc
        display?: ViewDisplay
        options?: ViewOptions
        orders?: RecordId[]
      }
    }
```

优点：

- 迁移成本最低
- service 仍然可以提供丰富 API
- command 层统一集中校验 patch

缺点：

- 仍然是 patch 语义，不如 `put` 那么纯粹

### 方案 B：只保留 `view.put`

做法：

- 所有高层 view intent 都在 service 层构造完整 `View`
- command 层只接收 `view.put`

优点：

- command 层最纯
- resolve / validate 集中度最高

缺点：

- 迁移成本更高
- service 层需要更强的 view 组装能力

### 建议

先采用方案 A。

即：

- 先把海量 `view.*` 微命令收敛为 `view.patch`
- 等 service / core 侧稳定之后，再决定是否进一步收成 `view.put`


## 推荐实施顺序

### 阶段 1：先收敛 `view`

目标：

- 新增 `view.patch`
- `services/view.ts` 和 `viewCommands.ts` 不再直接发 `view.filter.* / sort.* / group.* / display.* / order.*`
- 它们改成：
  1. 读取当前 view
  2. 用 core 纯函数算 next
  3. 发一个 `view.patch`

保留：

- 老命令暂时继续存在，用于兼容

新增后应删除的旧实现：

- `engine/command/commands/view.ts` 中所有 `resolveViewFilter*Command`
- 所有 `resolveViewSort*Command`
- 所有 `resolveViewGroup*Command`
- `resolveViewCalcSetCommand`
- 所有 `resolveViewDisplay*Command`
- 所有 `resolveViewTable*Command`
- 所有 `resolveViewGallery*Command`
- 所有 `resolveViewKanban*Command`
- 所有 `resolveViewOrder*Command`

同时删除：

- `core/contracts/commands.ts` 中对应的 command 类型
- `engine/command/commands/index.ts` 中对应的 switch case

### 阶段 2：继续收敛 `view.create / duplicate / rename`

目标：

- `view.duplicate` 下沉到 service
- `view.rename` 下沉到 `view.patch`
- `view.type.set` / `view.search.set` 也并入 `view.patch`

最终 `view` 层只剩：

- `view.create`
- `view.patch`
- `view.open`
- `view.remove`

### 阶段 3：收敛 `customField`

目标：

- option 系列命令全部下沉为 helper
- 统一通过 `customField.patch` 或 `customField.put`

### 阶段 4：最后再评估 `value.apply` / `record.apply`

说明：

- 这一步不是优先级最高
- 没必要一开始就把所有写入边界一起重做


## 为什么这不会影响性能

这次调整主要发生在“写入解释层”，不是投影热路径。

性能上：

- 当前 `project` / `index` / `publish` 的性能主成本不在 command resolver
- `command` 简化后反而会减少重复 validation 和重复 patch 逻辑
- 真正的性能敏感部分仍然是投影 runtime，而不是 UI action 到 operation 的翻译层

因此该方案的核心收益是：

- 降低维护成本
- 收紧边界
- 减少重复
- 提高规则集中度

而不是追求写入路径本身的微小耗时差异。


## 主要风险

### 风险 1：过度简化成万能 patch

如果直接退化成“任意对象 patch”，会带来：

- 类型约束变弱
- domain validation 模糊
- service 和 command 的责任重新混乱

因此不能做成无限制 patch。  
必须是“限定聚合字段”的 canonical patch。

### 风险 2：service 层重新膨胀

如果只是把 resolver 代码机械搬到 service，而没有抽 pure helper，会得到另一种混乱。

因此必须同步做：

- core 纯函数化
- service 只拼装意图
- command 只做 canonical resolve

### 风险 3：迁移期双轨维护

在兼容阶段，旧命令和新命令可能共存。  
这会带来短期维护成本。

解决原则：

- 兼容期要短
- 新旧两套不能长期并存
- 一旦 `view.patch` 稳定，就尽快删除整批旧 `view.*` 微命令


## 最终态定义

最简单但仍保持功能和性能的最终态应当是：

- `engine/services/*` 提供丰富、贴近 UI 的高层 API
- `core/*` 提供纯规则和纯变换
- `engine/command/*` 只接收少量 canonical domain commands
- `commands/index.ts` 不再维护几十个 UI 动词
- `view.ts` 不再有四十多个近似 resolver

换句话说：

- UI 语义丰富
- command 语义稀疏
- operation 语义底层

三层分工清楚，不再混杂。


## 结论

当前复杂度不是偶然实现问题，而是边界设计问题。

应立即推进的不是“继续给每个微命令补 helper”，而是：

- 把 `view` 从“几十个微命令”收敛成“一个 canonical patch 边界”

这是当前整个 dataview engine 写入层最值得做、收益也最大的一次简化。
