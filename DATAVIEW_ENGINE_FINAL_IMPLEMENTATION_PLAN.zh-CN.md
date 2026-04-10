# Dataview Engine 最终收敛实施方案

## 1. 目的

这份文档不是继续讨论“是否应该简化”，而是直接给出一份最终可执行方案，回答四个问题：

- 最终态到底长什么样
- 哪些实现应该保留
- 哪些旧实现必须删除
- 应该按什么顺序实施，才能在不损失性能和功能的前提下完成收敛

本文明确覆盖：

- `dataview/src/core`
- `dataview/src/engine/command`
- `dataview/src/engine/project`
- `dataview/src/engine/services/view.ts`

本文不追求兼容过渡层长期存在。
过渡可以有，但必须是短期、可删除、可验证的。


## 2. 当前判断

当前 engine 的主要问题已经不是“某几个文件太长”，而是仍然存在多层重复表达。

最主要的重复有四类：

- `view` 写入语义仍然集中在一个超大 legacy 文件中，并且 service 侧还有一层 API 包装重复表达
- `ProjectionDelta` 在中央提前决定 `reuse/sync/rebuild`，而 stage 本身又各自实现了一套同步/重建判定
- `nav` 作为独立 stage 存在，但本质只是 `SectionState -> AppearanceList / Section[]` 的发布适配
- publish 仍然分成 `project/publish.ts` 与 `project/runtime/publish.ts` 两段，先造 thin object，再做 reuse/reconcile

此外还有一个必须先承认的现实：

- 当前工作区仍处于半重构状态
- `[dataview/src/engine/command/commands/index.ts](/Users/realrong/Rostack/dataview/src/engine/command/commands/index.ts)` 还在引用不存在的 `./view`
- `[dataview/src/engine/command/field/index.ts](/Users/realrong/Rostack/dataview/src/engine/command/field/index.ts)` 还在引用不存在的 `./resolve`
- 实际文件已经变成 `view.legacy.ts` 与 `resolve.legacy.ts`

这说明现状里混入了过渡噪音。最终实施方案必须先收掉这些噪音，再谈长期极简结构。


## 3. 最终态原则

### 3.1 `command` 是唯一写语义权威层

任何 view/field 写动作只能有一个权威解释位置。

允许存在的其他层只有两种：

- 极薄 facade
- 依赖当前投影态的高层交互助手

不允许长期存在的层：

- 第二套 view 规则层
- 重新解释 command 的 service 层
- “先翻译一次，再解释一次”的中间 plan 层

### 3.2 `core` 只放纯领域规则

只要逻辑满足以下条件，就应该优先进入 `dataview/src/core`：

- 输入只依赖 `View` / `Field` / `Filter` / `Group` / `Sort` / `Order`
- 输出是 plain data
- 不依赖 `previous projection`
- 不依赖 store
- 不依赖 perf trace
- 不依赖 runtime 调度顺序

`core` 不负责：

- 复用 previous 引用
- store commit
- trace 采集
- stage orchestration

### 3.3 runtime 只保留真正的增量阶段

最终 `project/runtime` 只应该保留三类内部 projection stage：

- `query`
- `sections`
- `calc`

不应再保留的独立 stage：

- `nav`
- `adapters`

### 3.4 保留 published boundary，不保留 publish 子系统膨胀

最终态仍然需要“published state boundary”，因为 UI 不能直接消费内部 runtime state。

但不需要保留下面这些多余层级：

- 独立 `nav` stage
- 独立 `adapters` stage
- `thin build + reconcile` 两段式 publish

最终 publish 的职责应该非常收敛：

- 把内部 state 映射到最终 UI store shape
- 只在这一层做 previous 引用复用
- 只在这一层统计 changed stores


## 4. 最终目标结构

下面是建议的最终结构。
这里写的是长期目标，不是第一步就必须完全达到。

```text
dataview/src/
  core/
    field/
    filter/
    group/
    query/
    search/
    sort/
    view/
      demand.ts
      display.ts
      equality.ts
      naming.ts
      normalize.ts
      options.ts
      order.ts
      repair.ts
      shared.ts

  engine/
    command/
      commands/
        index.ts
        record.ts
        value.ts
      field/
        create.ts
        patch.ts
        options.ts
        remove.ts
      view/
        meta.ts
        filter.ts
        sort.ts
        group.ts
        display.ts
        options.ts
        order.ts
        calc.ts
        create.ts
        remove.ts
      shared.ts

    project/
      runtime/
        index.ts
        run.ts
        state.ts
        query/
        sections/
        calc/
      publish/
        view.ts
        records.ts
        sections.ts
        calculations.ts

    services/
      view.ts
      views.ts
      fields.ts
      records.ts
```

这个结构的关键不是目录，而是边界：

- `core` 表达纯规则
- `command` 负责写语义
- `project/runtime` 负责内部 projection 与增量
- `project/publish` 只负责最终 published value 构造与 reuse
- `services/view.ts` 只保留真正依赖当前投影态的交互助手


## 5. 哪些规则应该进入 `dataview/src/core`

以下内容应该明确下沉到 `core`。

### 5.1 view 纯写规则

应进入 `core/view/*` 的内容：

- display 字段列表替换、插入、移动、隐藏、显示规则
- record manual order 的归一化、重排、应用规则
- view options 的 clone、normalize、patch、prune 规则
- view equality 判断
- view 命名规则

对应现有来源主要包括：

- `[dataview/src/engine/command/commands/view.legacy.ts](/Users/realrong/Rostack/dataview/src/engine/command/commands/view.legacy.ts)`
- `[dataview/src/engine/command/field/effects.ts](/Users/realrong/Rostack/dataview/src/engine/command/field/effects.ts)`

### 5.2 view 依赖提取规则

以下内容本质是“从 `View` 提取依赖集合”，不是 runtime orchestration：

- search 依赖字段
- filter 依赖字段
- sort 依赖字段
- calc 依赖字段
- display 依赖字段

这类逻辑应该从 `project/runtime/demand.ts` 下沉为 `core/view/demand.ts`。

### 5.3 field schema 变化引发的 view repair 规则

以下逻辑应该从 engine effect 转为 core rule：

- 删除字段后 view 如何清理 filter/sort/group/search/display/options/calc
- 字段类型转换后 view 如何修复 group/filter/calc

建议落到：

- `core/view/repair.ts`

`command/field/*` 只负责：

- 识别发生了什么命令
- 调用 repair rule
- 生成 operation


## 6. 哪些规则不应该进入 `dataview/src/core`

以下逻辑必须继续留在 engine：

- projection 增量同步
- stage 调度顺序
- previous projection 复用
- published store commit
- perf trace
- changed store 统计

对应模块包括：

- `engine/project/runtime/*`
- `engine/project/publish/*`
- `engine/perf/*`

原因很直接：

- 这些逻辑依赖 runtime 状态与执行时序
- 不是纯领域规则
- 下沉到 `core` 会污染边界而不会让系统更简单


## 7. 明确保留的实现

以下方向应保留，并继续作为最终态骨架。

### 7.1 `core/group` 当前方向正确

`[dataview/src/core/group/write.ts](/Users/realrong/Rostack/dataview/src/core/group/write.ts)` 这类纯 group write 规则已经在正确边界上。

它表达的是：

- 目标 bucket key 如何映射到字段值
- 不同字段种类下分组写入如何工作

这类逻辑不应回流到 service 或 command giant file。

### 7.2 `core/view/order.ts` 当前方向正确

`[dataview/src/core/view/order.ts](/Users/realrong/Rostack/dataview/src/core/view/order.ts)` 已经是正确的 core 规则载体。

后续应做的是继续把 display/order 相关规则向这里收，而不是在 command/service 再写一遍。

### 7.3 `sections` 与 `calc` 的局部增量实现可以保留

`[dataview/src/engine/project/runtime/sections/sync.ts](/Users/realrong/Rostack/dataview/src/engine/project/runtime/sections/sync.ts)`
`[dataview/src/engine/project/runtime/calc/sync.ts](/Users/realrong/Rostack/dataview/src/engine/project/runtime/calc/sync.ts)`

这两块已经具备局部增量能力。

下一步不是推翻重写，而是：

- 去掉中央 `ProjectionDelta`
- 让它们直接根据输入自己决定 `reuse/sync/rebuild`


## 8. 明确要删除的旧实现

以下内容不是“可考虑删除”，而是最终态必须删除。

### 8.1 过渡命名遗留

必须删除：

- `view.legacy.ts`
- `resolve.legacy.ts`

要求：

- 不允许长期以 `legacy` 文件名存在
- 如果还没有拆完，可以短期保留，但一旦拆分落地，必须物理删除

### 8.2 `ProjectionDelta` 中央计划层

必须删除：

- `[dataview/src/engine/project/runtime/delta.ts](/Users/realrong/Rostack/dataview/src/engine/project/runtime/delta.ts)`

删除原因：

- 与各 stage 内部判定重复
- 增加中央耦合
- 新增变更语义时需要双处维护

### 8.3 独立 `nav` stage

必须删除：

- `[dataview/src/engine/project/nav.ts](/Users/realrong/Rostack/dataview/src/engine/project/nav.ts)` 中作为独立 stage 的职责
- `ProjectionState.nav`
- `ProjectStageName` 中的 `nav`
- perf/trace 中对 `nav` stage 的专门统计

保留方式：

- `AppearanceList` 与 published `Section[]` 的构造逻辑保留
- 但应迁移到 `project/publish/sections.ts`

### 8.4 两段式 publish

最终必须删除以下职责交叉：

- `[dataview/src/engine/project/publish.ts](/Users/realrong/Rostack/dataview/src/engine/project/publish.ts)` 作为 thin builder 汇总入口
- `[dataview/src/engine/project/runtime/publish.ts](/Users/realrong/Rostack/dataview/src/engine/project/runtime/publish.ts)` 作为统一 reconcile 层

最终目标不是两个文件都一定消失，而是：

- 不再存在 “先 thin build，再 runtime reconcile” 这种两段式结构
- 每个 published facet 在自己的 builder 中直接完成最终构造与 reuse

### 8.5 `services/view.ts` 中的大量 command 薄包装

以下内容不应该长期保留在 service：

- `type.set`
- `search.set`
- 全套 `filter.*`
- 全套 `sort.*`
- 全套 `group.*`
- `calc.set`
- 全套 `display.*`
- `table.setWidths`
- `table.setVerticalLines`
- `gallery.setLabels`
- `gallery.setCardSize`
- `kanban.setNewRecordPosition`
- `kanban.setFillColor`
- `kanban.setCardsPerColumn`
- `order.move`
- `order.clear`

这些 API 如需保留对外接口，也必须收敛为极薄 facade，不承载任何重复规则。


## 9. 最终保留的 `services/view.ts` 职责

最终 `services/view.ts` 只保留以下几类动作：

- `moveAppearances`
- `createInSection`
- `removeAppearances`
- `writeCell`
- `createCard`
- `moveCards`
- `insertLeft`
- `insertRight`

保留原因：

- 它们确实依赖当前 active projection
- 它们需要读取 `sections / appearances / group projection`
- 它们本质是交互动作，不是单个 command 的语义解释

除此之外，service 层不再承担规则中心职责。


## 10. 最终运行模型

最终 runtime 应按下面方式工作：

### 10.1 三个内部 stage

- `query.run(input) -> { state, publishedRecords, action, metrics }`
- `sections.run(input) -> { state, publishedSections, publishedAppearances, action, metrics }`
- `calc.run(input) -> { state, publishedCalculations, action, metrics }`

这里的 `published*` 指 stage 自己能够直接产出的最终发布值。

### 10.2 一个轻量 publish merge 边界

`project/runtime/index.ts` 负责：

- 调用各 stage
- 合并 published facets
- 对 view/filter/group/search/sort/fields 这类静态 facet 做轻量 builder
- 统一做 previous 引用复用
- 提交 stores
- 记录 changed stores 与 perf trace

这里仍然存在 published boundary，但不再存在独立 publish stage。

### 10.3 不再存在中央 action plan

`run.ts` 不再接收预先计算好的 `ProjectionDelta`。

最终的 `run.ts` 只负责：

- 准备公共输入
- 顺序执行 stage
- 汇总 trace

每个 stage 自己根据输入判断：

- `reuse`
- `sync`
- `rebuild`


## 11. 分阶段实施方案

下面的实施顺序是强约束，不建议跳步。

### Phase 0: 收掉半重构状态，恢复可编译

目标：

- 先让当前仓库重新稳定可编译

必须完成：

- `commands/index.ts` 不再引用不存在的 `./view`
- `field/index.ts` 不再引用不存在的 `./resolve`
- 所有 legacy 过渡导出链条变成明确、可工作的暂时别名，或者直接切到真实新路径

验收标准：

- `pnpm --dir dataview typecheck`
- `pnpm --dir dataview test`

### Phase 1: 拆分 `view.legacy.ts`，建立真正的 view command 模块

目标：

- 把一个 2k 级别的 giant file 拆成按领域组织的 command 文件

新模块至少应包括：

- `view/meta.ts`
- `view/filter.ts`
- `view/sort.ts`
- `view/group.ts`
- `view/display.ts`
- `view/options.ts`
- `view/order.ts`
- `view/calc.ts`
- `view/create.ts`
- `view/remove.ts`

同时要做：

- 把纯规则尽量下沉到 `core/view/*`

必须删除：

- `view.legacy.ts`

验收标准：

- `command/commands/index.ts` 只做 dispatch
- 不再存在一个承载所有 view command 的单文件

### Phase 2: 完成 field command 与 field effects 的最终分层

目标：

- field command 只关心字段本体变化
- view/record 侧修复逻辑变成明确 effect 或 core repair rule

必须完成：

- `resolve.legacy.ts` 拆为 `create.ts` / `patch.ts` / `options.ts` / `remove.ts`
- 删除字段与转换字段的 view repair 规则迁移到 `core/view/repair.ts`

必须删除：

- `resolve.legacy.ts`

验收标准：

- `field/index.ts` 只导出明确模块
- `effects.ts` 不再混入字段主命令解析

### Phase 3: 删除 `ProjectionDelta`

目标：

- 去掉中央 plan

必须完成：

- 删除 `project/runtime/delta.ts`
- `run.ts` 不再依赖 `projectionDelta`
- `query/sections/calc` 各自返回 `action`

需要同步修改：

- `types.ts` 中的 `ProjectPlanTrace`
- perf 采集逻辑
- benchmark 输出中对 project plan 的解释

验收标准：

- stage action 只在 stage 内部决定
- 没有任何中央 delta/network 判断层

### Phase 4: 合并 `nav` 到 sections publish

目标：

- 删除独立 nav stage

必须完成：

- `SectionState -> AppearanceList`
- `SectionState + AppearanceList -> Section[]`

这两步直接并入：

- `project/publish/sections.ts`

必须删除：

- `ProjectionState.nav`
- 独立 `nav` stage trace
- `project/nav.ts` 作为 stage 模块的角色

可保留但应迁移的内容：

- `AppearanceList` 构造
- `recordIdsOfAppearances`
- `readSectionRecordIds`

验收标准：

- runtime 内部只剩 `query / sections / calc`
- published `sections` 与 `appearances` 直接由 sections 输出

### Phase 5: 合并 publish 两段式结构

目标：

- 各 published facet 自己负责最终构造与 reuse

建议拆分：

- `project/publish/view.ts`
- `project/publish/records.ts`
- `project/publish/sections.ts`
- `project/publish/calculations.ts`

必须完成：

- 不再先构造 `rawThin`
- 不再由统一 `reuseProjection()` 汇总协调所有 facet

必须删除：

- `project/publish.ts` 旧汇总形态
- `project/runtime/publish.ts` 旧总装形态

验收标准：

- 每个 facet 的构造和 equality 语义在同一个地方
- 没有 “thin build + runtime reconcile” 两段链路

### Phase 6: 收缩 `services/view.ts`

目标：

- service 只保留交互助手

必须完成：

- 删除大多数 command facade 逻辑
- view 简单写动作直接走 command 或极薄 facade

验收标准：

- `services/view.ts` 只剩 interaction-oriented API
- 不再重复表达 filter/sort/group/display/order 的领域规则

### Phase 7: 类型与 perf 收尾

目标：

- 收掉因为阶段重构带来的类型噪音

建议完成：

- 拆分 `engine/types.ts`
- 删除 `nav` / `adapters` 相关 stage 名称
- perf trace 改成反映真实 stage 结构

验收标准：

- trace 名称与真实运行模型一致
- 不再有历史阶段名残留


## 12. 每个阶段允许的临时过渡

允许的临时过渡只有两类：

- import/export alias
- 为保证测试通过而保留的短期桥接文件

不允许的临时过渡：

- 新增中央计划对象
- 新增第二套 publish descriptor
- 为兼容旧结构长期保留 `legacy` 文件
- 在 service 中复制一套 command 规则


## 13. 最终验收标准

最终收敛完成后，应同时满足以下条件。

### 13.1 结构标准

- 没有 `view.legacy.ts`
- 没有 `resolve.legacy.ts`
- 没有 `project/runtime/delta.ts`
- 没有独立 `nav` stage
- 没有两段式 publish

### 13.2 边界标准

- `core` 只承载纯领域规则
- `command` 是唯一写语义权威层
- `services/view.ts` 只保留交互助手
- `project/runtime` 只负责 runtime projection 与调度

### 13.3 运行标准

- `pnpm --dir dataview typecheck`
- `pnpm --dir dataview test`
- `pnpm --dir dataview bench`

### 13.4 行为标准

- 功能无回退
- grouped view 的增量更新仍然保留
- section/calculation 的局部复用仍然保留
- publish/store 层的引用稳定性不回退


## 14. 最终判断

最终最简单的 Dataview Engine，不是“没有 publish”，而是：

- 没有重复写语义
- 没有中央计划层
- 没有独立 nav stage
- 没有两段式 publish
- 没有把 service 当成第二套 command

因此最终态应该是：

- `core` 放纯规则
- `command` 放唯一写语义
- `runtime` 只保留 `query / sections / calc`
- published boundary 只作为最终 UI store 边界存在
- `services/view.ts` 只保留真正依赖当前投影的交互动作

这条路线比继续在现有层级上做局部整理更直接，也更接近长期最优。
