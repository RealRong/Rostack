# Dataview Engine 长期极简化方案

## 1. 目标

这份文档只回答一个问题：

在当前 `dataview/src/engine` 已经完成多轮重构之后，下一步如果完全不考虑历史包袱，只追求长期最简单、层级最少、复杂度最低、性能仍然合理的结构，应该怎么继续收口。

本文采用以下前提：

- 不保留兼容过渡
- 不保留第二套实现
- 不为了迁移容易保留旧中间层
- 优先减少重复表达
- 优先减少层级，而不是继续横向拆文件


## 2. 当前代码量概览

截至当前工作区，`dataview/src/engine` 主要目录的代码量如下：

- `project`：`3852` 行，`27` 个文件
- `command`：`3648` 行，`15` 个文件
- `index`：`2617` 行，`15` 个文件
- `services`：`1439` 行，`5` 个文件
- `runtime`：`650` 行，`7` 个文件
- [types.ts](/Users/realrong/Rostack/dataview/src/engine/types.ts)：`521` 行

当前最大的文件：

- [view.ts](/Users/realrong/Rostack/dataview/src/engine/command/commands/view.ts)：`1927` 行
- [view.ts](/Users/realrong/Rostack/dataview/src/engine/services/view.ts)：`1037` 行
- [resolve.ts](/Users/realrong/Rostack/dataview/src/engine/command/field/resolve.ts)：`571` 行
- [types.ts](/Users/realrong/Rostack/dataview/src/engine/types.ts)：`521` 行
- [aggregate.ts](/Users/realrong/Rostack/dataview/src/engine/index/aggregate.ts)：`340` 行
- [index.ts](/Users/realrong/Rostack/dataview/src/engine/index/search/index.ts)：`321` 行
- [nav.ts](/Users/realrong/Rostack/dataview/src/engine/project/nav.ts)：`307` 行
- [publish.ts](/Users/realrong/Rostack/dataview/src/engine/project/publish.ts)：`302` 行
- [delta.ts](/Users/realrong/Rostack/dataview/src/engine/project/runtime/delta.ts)：`293` 行
- [state.ts](/Users/realrong/Rostack/dataview/src/engine/index/group/state.ts)：`293` 行

这里最重要的结论不是“哪些文件长”，而是：

- `view` 写入语义被多处重复表达
- `project` 的依赖关系存在中间计划层
- published projection 仍然分成 thin build 和 reuse build 两段


## 3. 当前复杂度的真正来源

## 3.1 同一套 view 写语义被表达了两次

当前有两套强相关层：

- [view.ts](/Users/realrong/Rostack/dataview/src/engine/services/view.ts)
- [view.ts](/Users/realrong/Rostack/dataview/src/engine/command/commands/view.ts)

前者负责把 UI/调用侧动作翻译成 command，后者再把 command 翻译成 operation。

问题在于：

- 两层都知道 `view.group / view.sort / view.filter / view.display / view.order`
- 两层都在表达“一个 view 怎么被修改”
- 一部分领域规则在 service，一部分在 command

这不是健康的分层，而是同一语义的双重表达。

长期最优目标应该是：

- 写入语义只保留一个权威层
- 另一层如果保留，只做极薄的用户态转译，不再承载领域规则


## 3.2 `project/runtime/delta.ts` 是典型中间计划层

[delta.ts](/Users/realrong/Rostack/dataview/src/engine/project/runtime/delta.ts) 当前负责为以下 stage 预判动作：

- `query`
- `sections`
- `calc`
- `nav`
- `adapters`

它会提前决定 `reuse / sync / rebuild`，然后 [run.ts](/Users/realrong/Rostack/dataview/src/engine/project/runtime/run.ts) 再按计划执行。

这个结构的问题不是“写得不好”，而是它天然有重复：

- stage 依赖关系在 `delta.ts` 写一遍
- stage 自己的增量/重建能力在各自模块里又写一遍

这意味着：

- 新增一种变化时，要同步维护中央 plan 和局部 stage
- 很难证明中央 plan 没有多做事
- 很难证明局部 stage 不会和 plan 冲突


## 3.3 `nav` 更像 publish adapter，不像独立语义层

[nav.ts](/Users/realrong/Rostack/dataview/src/engine/project/nav.ts) 主要做三件事：

- 从 `SectionState` 生成 `AppearanceList`
- 从 `SectionState` 生成 published `Section[]`
- 提供少量 appearance 帮助函数

这说明 `nav` 本质上不是独立 projection 语义，而是：

- `sections` 的发布态适配
- UI 导航层的读取模型

因此它长期更像是 `sections publish`，而不是单独 stage。


## 3.4 published projection 仍然分成两段

当前 published 相关逻辑拆在：

- [publish.ts](/Users/realrong/Rostack/dataview/src/engine/project/publish.ts)
- [publish.ts](/Users/realrong/Rostack/dataview/src/engine/project/runtime/publish.ts)

前者偏 thin projection build，后者偏 equality/reuse/final assembly。

这带来的问题是：

- projection 构造和 projection 复用被拆成两层
- 一部分领域语义放在 thin 层，一部分放在 runtime 层
- 阅读时要同时理解“先生成什么，再怎么复用”

长期最优方向是：

- 每类 published projection 自己负责最终构造和引用复用
- 不再先造“薄对象”，再由总装层二次决定是否复用


## 3.5 `field resolve` 仍然混着 command 和 effects

[resolve.ts](/Users/realrong/Rostack/dataview/src/engine/command/field/resolve.ts) 当前同时承担：

- 字段 schema command 解析
- option 写入逻辑
- record value 联动变更
- view display 联动修复

这代表一个问题：

字段命令的“核心语义”和它带来的“跨 record/view 副作用”没有彻底分层。

长期最优是：

- `field command` 只说明字段发生了什么变化
- `field effects` 统一负责 record/view 侧的派生操作


## 3.6 `types.ts` 是概念拥挤，不是单纯行数问题

[types.ts](/Users/realrong/Rostack/dataview/src/engine/types.ts) 同时放了：

- engine public api
- read/project/document/history/perf api
- trace 类型
- stats 类型
- service api
- view table/gallery/kanban/items/cards 子接口

它不是运行时复杂度来源，但它显著提高了理解成本。


## 4. 长期最优判断

如果完全按“长期最简单”来取舍，我认为下一步最合理的方向不是继续微调性能，而是继续收掉以下三类重复表达：

1. 同一套 view 写语义在 `services` 和 `command` 各表达一次
2. 同一套 projection 依赖关系在 `delta plan` 和 stage 内部各表达一次
3. 同一套 published projection 在 `project/publish` 和 `runtime/publish` 分两段表达

这三类重复一旦收掉：

- 文件数不一定更少，但概念层数会更少
- 很多“看起来必要的 glue code”会直接消失
- 后续继续做性能优化时更容易定位真正瓶颈


## 5. 长期极简化原则

## 5.1 写入语义只保留一层权威表达

任何一个领域动作，例如：

- 改 filter
- 改 sort
- 改 group
- 改 display
- 改 manual order

只能有一个权威层负责“它到底会改什么”。

其他层如果存在，只能做：

- 参数整形
- 当前上下文读取
- 高层动作翻译

不能再重复定义领域规则。


## 5.2 stage 决策优先局部自治，不优先中央预判

如果一个 stage 自己知道：

- 是否能复用
- 是否能增量 sync
- 是否必须 rebuild

那么中央层就不应该再维护一套平行的决策网络。

中央层只负责：

- 提供输入
- 调度顺序
- 收集 trace


## 5.3 publish 应该是最终对象构造，不要先 thin 再 reconcile

长期最优的 publish 层应该直接回答：

- 最终投影对象长什么样
- 能不能复用 previous 引用

而不是：

1. 先造一个薄对象
2. 再用另一个模块判断是否复用


## 5.4 中间层如果没有独立语义，就应该删

一个中间层如果：

- 只是在做 shape 转换
- 只是在传递状态
- 只是在重复已有依赖判断

那它不应该长期存在。


## 6. 最高优先级改造点

## 6.1 Priority 1: `view command` 收口

目标文件：

- [view.ts](/Users/realrong/Rostack/dataview/src/engine/command/commands/view.ts)

当前问题：

- 一个文件承载几乎全部 view 命令
- 不同命令重复同一套 resolver 模板
- 校验、updater、operation build 全混在一起

长期最优方案：

- 按领域拆成子模块：
  - `view/meta.ts`
  - `view/filter.ts`
  - `view/sort.ts`
  - `view/group.ts`
  - `view/display.ts`
  - `view/options.ts`
  - `view/order.ts`
  - `view/calc.ts`
- 统一 resolver 骨架：
  - validate
  - read current view
  - build next view
  - unchanged => no-op
  - changed => `document.view.put`

预期收益：

- 大量重复模板消失
- 更容易证明每类 view 命令的正确性
- 新命令不会继续把一个文件堆到 2k 行以上


## 6.2 Priority 2: `services/view` 去重

目标文件：

- [view.ts](/Users/realrong/Rostack/dataview/src/engine/services/view.ts)

当前问题：

- 它既像 facade，又像业务层，又像 command builder
- 很多规则和 `command/commands/view.ts` 强耦合

长期最优方案：

只保留两类 service：

- 纯 facade：
  - 直接把方法映射为 command
- 真正依赖当前 projection 的高层动作：
  - `moveAppearances`
  - `createInSection`
  - `writeCell`
  - 这类动作确实需要当前 `sections / appearances / group projection`

其余 view API 最好收缩成极薄包装，甚至允许直接由上层发 command。

预期收益：

- 少掉一层重复领域表达
- service 层明显变薄
- view 相关 bug 定位路径更短


## 6.3 Priority 3: 删除 `ProjectionDelta` 中央计划层

目标文件：

- [delta.ts](/Users/realrong/Rostack/dataview/src/engine/project/runtime/delta.ts)
- [run.ts](/Users/realrong/Rostack/dataview/src/engine/project/runtime/run.ts)

当前问题：

- 中央层预判每个 stage 的动作
- stage 内部自己又有 sync/rebuild 语义

长期最优方案：

- 去掉中央 `ProjectionDelta` 决策网络
- 改成每个 stage 自己暴露统一接口，例如：
  - `runQuery(input)`
  - `runSections(input)`
  - `runCalc(input)`
  - `publishView(input)`
- stage 内部自己返回：
  - `value`
  - `action`
  - `metrics`

`run.ts` 只负责：

- 顺序调用
- 传递上游结果
- 汇总 trace

预期收益：

- stage 依赖关系只保留一份表达
- 更容易把 projection 进一步收成自治模块


## 6.4 Priority 4: 移除独立 `nav` stage

目标文件：

- [nav.ts](/Users/realrong/Rostack/dataview/src/engine/project/nav.ts)
- [run.ts](/Users/realrong/Rostack/dataview/src/engine/project/runtime/run.ts)

当前问题：

- `nav` 本质是 section 的发布态衍生
- 但当前被作为独立 stage 存在

长期最优方案：

- `sections` 只负责 section state
- publish 时直接从 section state 生成：
  - `AppearanceList`
  - `Section[]`
- `NavState` 不再作为独立 projection state 长期存在

预期收益：

- 少一个 stage
- 少一层 action plan
- `sections -> publish` 链路更直


## 6.5 Priority 5: 合并 publish 两段式结构

目标文件：

- [publish.ts](/Users/realrong/Rostack/dataview/src/engine/project/publish.ts)
- [publish.ts](/Users/realrong/Rostack/dataview/src/engine/project/runtime/publish.ts)

长期最优方案：

- 每类 projection 自己提供最终 published builder
- builder 内部直接完成 equality/reuse
- 去掉“thin build + runtime reconcile”的二段式结构

例如：

- `publishActiveView(...)`
- `publishFilter(...)`
- `publishGroup(...)`
- `publishSearch(...)`
- `publishSort(...)`
- `publishFields(...)`
- `publishCalculations(...)`
- `publishRecords(...)`
- `publishSections(...)`
- `publishAppearances(...)`

每个函数直接接收：

- current source data
- previous published value

直接返回最终 published value。


## 6.6 Priority 6: `field resolve` 分离 command 与 effects

目标文件：

- [resolve.ts](/Users/realrong/Rostack/dataview/src/engine/command/field/resolve.ts)

长期最优方案：

- `field/commands/*.ts` 只负责字段命令本身
- `field/effects/*.ts` 统一负责：
  - record value cleanup
  - view display repair
  - schema dependent propagation

最终结构更像：

- `field/create.ts`
- `field/patch.ts`
- `field/options.ts`
- `field/remove.ts`
- `field/effects/create.ts`
- `field/effects/remove.ts`
- `field/effects/convert.ts`


## 6.7 Priority 7: `types.ts` 拆分

目标文件：

- [types.ts](/Users/realrong/Rostack/dataview/src/engine/types.ts)

长期最优方案：

- `types/api.ts`
- `types/viewApi.ts`
- `types/project.ts`
- `types/trace.ts`
- `types/perf.ts`
- `types/history.ts`

这块不影响架构，但对长期理解成本有直接收益。


## 7. 可以复用已有代码的地方

不是所有地方都要重写。有几块已经写对了，应该复用，而不是再发明一套新抽象。

## 7.1 `derive/index.ts` 更适合作为长期唯一入口

[index.ts](/Users/realrong/Rostack/dataview/src/engine/derive/index.ts) 现在已经承接了 index 的真实主线。

长期更合理的方向是：

- 不再保留额外的 index runtime 包装器
- 直接让 `createIndexState/deriveIndex` 成为唯一入口
- 把 demand/trace 装配留在这条纯派生线上


## 7.2 `query/sections/calc` 的局部模块边界可以复用

当前这些目录形态已经比早期单文件好很多：

- `query`
- `sections`
- `calc`

下一步不是推翻，而是：

- 去掉中央 delta 计划
- 让这些 stage 自己返回 action/metrics


## 7.3 `group/search/sort/records` 的 index 子目录结构可以保留

这些目录已经基本符合长期方向：

- `group`
- `records`
- `search`
- `sort`

真正该继续收口的是：

- 共享策略逻辑是否还能复用 `core`
- 是否需要继续减少重复 helper

而不是再把它们重新打散。


## 8. 一个更简单的长期目标结构

这里只写长期最优，不考虑过渡。

```text
dataview/src/engine/
  command/
    resolve.ts
    shared.ts
    field/
      create.ts
      patch.ts
      options.ts
      remove.ts
      effects/
        create.ts
        convert.ts
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
  project/
    runtime/
      index.ts
      run.ts
      query/
      sections/
      calc/
      publish/
        activeView.ts
        filter.ts
        group.ts
        search.ts
        sort.ts
        fields.ts
        records.ts
        sections.ts
        appearances.ts
        calculations.ts
  services/
    fields.ts
    records.ts
    views.ts
    view.ts
  types/
    api.ts
    viewApi.ts
    trace.ts
    perf.ts
    project.ts
```

关键点不是目录本身，而是：

- `command` 是唯一写语义权威层
- `project` 没有中央 delta 计划层
- `nav` 不再是独立 stage
- published projection 不再做两段式构造


## 9. 分阶段实施方案

## Phase 1: view command 按领域拆分

目标：

- 把 [view.ts](/Users/realrong/Rostack/dataview/src/engine/command/commands/view.ts) 从“一个巨型文件”收成按领域模块

完成标准：

- 单个领域文件不再同时关心 filter/sort/group/display/options/order
- `commands/index.ts` 只负责 dispatch


## Phase 2: 收缩 `services/view`

目标：

- service 层只保留 facade 和真正依赖 active projection 的高层交互动作

完成标准：

- 简单 view 修改动作不再在 service 层重复表达领域规则
- `services/view.ts` 显著变薄


## Phase 3: 去掉 `ProjectionDelta`

目标：

- stage 自己决定 `reuse/sync/rebuild`

完成标准：

- [delta.ts](/Users/realrong/Rostack/dataview/src/engine/project/runtime/delta.ts) 被删除
- [run.ts](/Users/realrong/Rostack/dataview/src/engine/project/runtime/run.ts) 只做 stage orchestration


## Phase 4: 合并 `nav` 到 publish/sections

目标：

- 删除独立 `nav` stage

完成标准：

- `AppearanceList` 和 `Section[]` 直接由 `sections + publish` 产出
- `NavState` 不再长期存在


## Phase 5: 合并 publish 两段式结构

目标：

- 让每个 published builder 直接负责最终对象构造和引用复用

完成标准：

- `project/publish.ts` 和 `project/runtime/publish.ts` 的职责不再交叉
- 更理想的结果是二者之一被彻底吸收


## Phase 6: field command/effects 分离

目标：

- 把字段命令本体和派生副作用分开

完成标准：

- duplicate/remove/option-remove 这类命令的副作用不再散落在主 resolver 里


## Phase 7: types 拆分

目标：

- 降低公共类型入口的概念密度

完成标准：

- [types.ts](/Users/realrong/Rostack/dataview/src/engine/types.ts) 被拆成多个职责明确的文件


## 10. 不建议做的事

为了避免“简化”变成新的复杂化，下面这些事不建议做。

## 10.1 不要为了拆分继续增加中间计划对象

例如：

- 新的 stage plan
- 新的 command plan
- 新的 publish descriptor

如果一个对象只是为了在两个层之间传递“稍后还要再解释一次”的信息，那它大概率应该被删，而不是被新增。


## 10.2 不要把 service 做成第二套 command 系统

service 不是命令解析器，也不是业务规则中心。

它要么是：

- 极薄 facade

要么是：

- 少数依赖当前 projection 的高层交互助手

不要处于两者之间。


## 10.3 不要把 publish 的 equality/reuse 抽成全局万能 helper

projection 各自的 equality 语义并不完全一样。

长期更简单的方式通常不是发明一个更抽象的通用层，而是：

- 每个 projection 在自己的 builder 内表达自己的复用规则


## 11. 最终判断

如果只从长期极简化角度判断，`dataview/src/engine` 接下来最值得做的不是再拆零散文件，也不是继续压局部性能，而是继续去掉三类重复层：

1. `services/view` 与 `command/view` 的重复写语义
2. `ProjectionDelta` 这种中央计划层
3. `nav` 与 publish 两段式构造带来的中间适配层

这三类问题解决后，engine 的主结构会更接近长期最优：

- command 是唯一写语义权威层
- project stage 自治决策
- publish 直接生成最终稳定对象
- service 只保留必要的高层交互助手

这会比继续在现有层级上做局部优化更有长期价值。
