# Dataview Engine 长期最优重构审计与迁移清单

## 文档定位

这不是局部优化建议，也不是保守兼容方案。

这份文档面向 `dataview/src/engine` 的一次性架构收口，目标是：

- 把类型定义收拢到清晰边界，结束“类型散落在各处”的状态。
- 把上下文传递改成稳定、可组合、可推导的模型，结束 ad-hoc helper 链条。
- 把公开 API、内部 runtime、派生状态、写入编排分层做实，结束边界倒置。
- 把命名缩短并统一，结束 `Engine*Api` / `Active*Api` / `View*Api` / `project/*` 的混杂状态。
- 保留当前引擎里真正有价值的增量派生与性能意识，但移除多余包装层。

这份文档整合并上收现有几份局部方案：

- `DATAVIEW_ACTIVE_VIEW_API_SIMPLIFICATION_PLAN.zh-CN.md`
- `DATAVIEW_ENGINE_FACADE_SIMPLIFICATION_PLAN.zh-CN.md`
- `DATAVIEW_ENGINE_PROJECT_HELPER_REDUCTION_PLAN.zh-CN.md`

后续如果决定执行，应以本文件为主，不再并行维护多份局部计划。

## 一句话判断

当前 `engine` 的核心问题不是某个模块写得“不够好看”，而是内部同时存在太多“半重叠但不完全等价”的模型层：

- document model
- command/action model
- operation model
- index state
- project/projection state
- published state
- active store state
- public API state

这些层没有形成严格单向依赖，而是在互相借类型、互相重复包装、互相补 helper。

结果就是：

- 类型越补越多，但抽象没有变清晰。
- 上下文越传越多，但责任没有真正收口。
- API 越分越细，但命名越来越长，重复越来越多。
- 任何一个看似简单的改动，都会跨 `action` / `command` / `project` / `store` / `facade` 多层同步修改。

## 现状审计结论

### 1. 边界倒置：内部 runtime 依赖 public type

这是当前最危险的问题之一。

`project/runtime/state.ts` 里的内部状态直接依赖 `../../api/public` 导出的 `ActiveView`、`ActiveQuery`、`RecordSet`，见：

- `dataview/src/engine/project/runtime/state.ts:15-35`

这意味着：

- internal state 不是自己的闭包模型。
- public contract 反过来决定 internal runtime 结构。
- 任何 public type 改名或裁剪，都会直接冲击 runtime 层。

同类问题还出现在：

- `dataview/src/engine/store/active/state.ts:7-18`
- `dataview/src/engine/store/active/read.ts:13-26`
- `dataview/src/engine/project/publish/view.ts:38-47`
- `dataview/src/engine/api/public/command.ts:8`

结论：

- public contract 必须从 internal runtime 派生，不能反过来被 internal runtime 引用。
- `api/public` 只能位于最外层，不能被 `project/runtime`、`store/active` 这类内部模块反向依赖。

### 2. 状态模型重复过多，名称与职责不匹配

当前至少同时存在这些相邻但不同的状态概念：

- `State`：全局 store 状态，见 `dataview/src/engine/store/state.ts:45-55`
- `IndexState`：索引状态
- `ProjectionState`：query/sections/calc 的内部派生缓存，见 `dataview/src/engine/project/runtime/state.ts:71-75`
- `ProjectState`：发布后的 active view 投影，见 `dataview/src/engine/project/runtime/state.ts:28-35`
- `ActiveViewState`：public active state，见 `dataview/src/engine/api/public/project.ts:84-92`
- `ActiveGalleryState` / `ActiveKanbanState`：UI 特化 state，见 `dataview/src/engine/api/public/project.ts:130-149`

这些模型的问题不是“数量多”，而是：

- 名称不精确。
- 边界不闭合。
- 有的本该 internal，有的本该 public，但相互穿插。

`ProjectState` 这个名字尤其差，因为它并不是 project，也不是 generic projection，它其实表达的是“当前 active view 的发布快照”。

推荐最终命名：

- `ProjectState` -> `ViewSessionSnapshot`
- `ProjectionState` -> `ViewSessionCache`
- `ActiveViewState` -> `ViewSession`

### 3. 写入链路层次过多，而且存在重复验证与重复 document 演算

当前写入主链是：

- `Action`
- `lowerAction(...)`
- `LoweredCommand[]`
- `runCommands(...)`
- `BaseOperation[]`
- `applyOperations(...)`
- `deriveIndex(...)`
- `deriveProject(...)`

关键问题：

- `resolveActionBatch(...)` 会在 action 级循环里维护 `workingDocument`，见 `dataview/src/engine/command/index.ts:8-55`
- `runCommands(...)` 又会在 command 级循环里维护 `workingDocument`，见 `dataview/src/engine/command/runCommands.ts:228-266`
- `action/lower.ts` 已经做了一轮存在性/结构性校验，`runCommands.ts` 又做一轮存在性/结构性校验
- `action/lower.ts` 把高层行为拆成“看起来更 canonical 的 command”，但这些 command 本质上仍然只是下游 operation 的过渡层

最明显的信号是：

- `dataview/src/engine/action/lower.ts` 已经达到 1508 行
- 同时还配着一个 266 行的 `runCommands.ts`
- 再加一个 `command/context.ts`

这不是“拆得细”，而是“同一条语义链被迫走了两次”。

最终决策：

- 取消现有 `lowerAction -> runCommands` 双阶段编排。
- 合并为单一 `planActions(document, actions): WritePlan`。
- 如果仍需要中间 IR，保留为 internal-only `MutationPlanItem`，不再叫 `Command`，也不再对外泄漏。

### 4. `action/lower.ts` 是典型的“单文件领域编译器”，必须拆

`dataview/src/engine/action/lower.ts` 同时承担了：

- action 入口分发
- 文档查询
- 默认值生成
- view 归一化
- field option 处理
- record/view/field 修复逻辑
- validation
- command 生成
- clone / equality / normalize helper

从 `LoweredCommand` 定义到总 switch 的主干见：

- `dataview/src/engine/action/lower.ts:77-100`
- `dataview/src/engine/action/lower.ts:1226-1508`

这种文件形态会让任何一个 action domain 的改动都触发整片回归风险。

最终拆分目标：

- `mutate/planner/record.ts`
- `mutate/planner/value.ts`
- `mutate/planner/field.ts`
- `mutate/planner/view.ts`
- `mutate/planner/shared.ts`
- `mutate/planner/validate.ts`

并且入口文件只做路由，不持有业务细节。

### 5. `facade/view/index.ts` 已经变成 active session 的“上帝对象”

`dataview/src/engine/facade/view/index.ts` 838 行，内部直接塞满：

- active store 组装
- patch action 生成
- view query 写入
- item move 规则
- section/group 写值逻辑
- table/gallery/kanban 特化
- cell 写入
- field 创建 + 插列

见：

- `dataview/src/engine/facade/view/index.ts:160-260`
- `dataview/src/engine/facade/view/index.ts:306-837`

这层的问题不是代码重复，而是：

- 它既像 façade，又像 command builder，又像 session service，又像 UI adapter。
- `withView` / `withField` / `withFilterField` / `withGroupField` 这些 helper 说明 context 缺失，只能靠闭包一点点兜。
- `items.move` / `items.create` 这类强语义行为，和 `table.setWidths` 这种简单 patch 写入放在同一个对象里，导致“轻写入”和“重业务动作”混杂。

最终决策：

- `facade/view/index.ts` 必须拆成按 domain 划分的 active session service。
- façade 只能做薄路由，不能承载业务规则。

建议拆分：

- `api/active/query.ts`
- `api/active/layout.ts`
- `api/active/items.ts`
- `api/active/cells.ts`
- `api/active/display.ts`
- `api/active/table.ts`
- `api/active/gallery.ts`
- `api/active/kanban.ts`

### 6. API 命名冗长、重复，而且同义能力命名不统一

代表性问题：

- `EngineReadApi` / `ActiveReadApi` / `ActiveEngineApi` / `ViewsEngineApi` / `FieldsEngineApi` / `RecordsEngineApi`
- `ViewTableApi.setColumnWidths(...)` 对应 active 侧却叫 `table.setWidths(...)`
- `fields.update(...)`、`fields.replaceSchema(...)`、`fields.convert(...)`、`field.patch`、`field.put`、`field.replace` 混着出现

相关位置：

- `dataview/src/engine/api/public/project.ts:52-240`
- `dataview/src/engine/api/public/services.ts:26-125`
- `dataview/src/engine/facade/view/index.ts:774-820`

最终决策：

- 顶层 service 去掉 `Engine` 前缀，统一为 `ViewsApi` / `FieldsApi` / `RecordsApi` / `DocumentApi` / `HistoryApi` / `PerfApi`
- active 侧统一为 `ViewSessionApi`
- 所有名词层统一短名，所有动词层统一动词集合

统一动词集合：

- `get`
- `list`
- `create`
- `update`
- `replace`
- `remove`
- `move`
- `clear`
- `set`
- `toggle`

不再混用：

- `put` 和 `create/update/replace`
- `setWidths` 和 `setColumnWidths`
- `field.set` 这种语义模糊命名

### 7. `project/publish/*` 与 `store/active/*` 之间重复包装过多

当前存在明显的“publish 一次，再包装一次，再 select 一次”现象：

- `publishViewState(...)` 负责从文档和 view 构建 public-ish query/fields/view 模型，见 `dataview/src/engine/project/publish/view.ts:396-460`
- `publishSectionsState(...)` 负责构建 `AppearanceList` / `SectionList`，见 `dataview/src/engine/project/publish/sections.ts:244-271`
- `store/active/state.ts` 又从 `current.project.*` 重新拼 `ActiveViewState`，见 `dataview/src/engine/store/active/state.ts:72-112`
- `store/active/read.ts` 再补 `cell` / `planMove` / `filterField` / `groupField`，见 `dataview/src/engine/store/active/read.ts:38-158`

这说明当前系统没有一个稳定的“session snapshot”边界。

最终决策：

- internal 层只保留一个稳定的 `ViewSessionSnapshot`
- public `engine.active.state` 直接读这个 snapshot
- `engine.active.read` 只做解析，不再承担“补模型空洞”的责任

### 8. appearance/section 这类 UI read model 里混入了 ID 语义解析

`publish/sections.ts` 中 `AppearanceId` 被编码为：

- `section:${sectionKey}\u0000record:${recordId}`

然后又在 `parseAppearanceId(...)` 里解析回来，见：

- `dataview/src/engine/project/publish/sections.ts:24-48`

这是一个明显的边界泄漏信号：

- 说明 snapshot 没有稳定保存 appearance 对象，只保存了半语义字符串
- 说明 list model 正在拿 ID 当数据结构用

最终决策：

- internal session snapshot 直接保存 `AppearanceNode`
- `AppearanceId` 只作为外部索引 key，不再反向解析业务语义

### 9. active view 过度耦合整个 derive/index 生命周期

当前 store 初始化与每次 commit 都把 index demand 绑定到 `activeViewId`：

- `dataview/src/engine/project/runtime/demand.ts:25-53`
- `dataview/src/engine/store/state.ts:59-87`

这会导致：

- 全局 index 生命周期受 UI active view 影响
- view 切换是“全局 demand 切换”，不是“session 切换”
- 难以支持 per-view snapshot cache，也不利于未来多面板/并行预热

最终决策：

- document-level index 与 active session 解耦
- `index` 保持 document 维度的可复用 read model
- `session` 保持 `viewId` 维度的派生快照缓存

### 10. 仓库外部消费面已经出现 API 漂移

当前 bench/test 仍在用旧式 API，如：

- `engine.view(viewId)...`
- `engine.project...`
- `engine.records.setValue(...)`

见：

- `dataview/bench/scenarios/index.cjs:13-100`

这说明 public API 迁移并没有形成单一收口面，仓库内已经存在“旧心智模型残留”。

最终决策：

- 执行长期重构时，必须把 bench/test/fixtures 一并清理
- 不允许再保留旧 API 幻影用法

## 当前代码中值得保留的部分

这次重构不应该推倒重写一切。下面几块是当前引擎真正有价值的基础：

- `index/records` 的增量同步思路是对的，见 `dataview/src/engine/index/records/index.ts`
- `index/search` 的 demand-driven 构建是对的，见 `dataview/src/engine/index/search/index.ts`
- `index/aggregate` 的纯函数聚合状态设计是可复用的，见 `dataview/src/engine/index/aggregate.ts`
- `write/commit.ts` 把 commit、history、derive、perf 串起来的总流程是对的，见 `dataview/src/engine/write/commit.ts`
- perf trace 模型是有长期价值的，不该删，只该下沉到更清晰的边界

换句话说：

- 要重写的是边界和编排
- 不是重写所有索引算法

## 最终目标架构

## 一、硬性架构决策

- 保留多 view 文档模型。
- 保留“任意时刻只有一个 active session”的产品语义。
- 保留 `engine.active` 作为唯一完整 view session API。
- `engine.views` 只保留 view 集合管理，不再承载 scoped runtime façade。
- 顶层新增稳定的 `dispatch` 基础能力，所有 façade 退化为薄便利层。
- 删除 `project` 作为 engine 内部目录和类型主语，统一改为 `session`。
- public contract 与 internal contract 分离，internal 不允许 import `api/public`。

## 二、目标目录

建议最终收口为：

```text
dataview/src/engine/
  api/
    createEngine.ts
    public/
      index.ts
      contracts.ts
      engine.ts
  core/
    store.ts
    history.ts
    perf.ts
  mutate/
    planner/
      index.ts
      record.ts
      value.ts
      field.ts
      view.ts
      validate.ts
      shared.ts
  derive/
    index/
      ...
    session/
      runtime.ts
      snapshot.ts
      query.ts
      sections.ts
      calculations.ts
      collections.ts
  services/
    views.ts
    fields.ts
    records.ts
    active/
      index.ts
      query.ts
      items.ts
      cells.ts
      display.ts
      table.ts
      gallery.ts
      kanban.ts
  contracts/
    public.ts
    internal.ts
    naming.ts
```

这里最重要的不是目录名，而是依赖方向：

- `contracts/public` 只被外层消费
- `contracts/internal` 只服务 engine 内部
- `derive/*` 不 import `api/public`
- `services/*` 可以 import public contract，但不反向定义 internal state
- `api/createEngine.ts` 只做装配，不写业务规则

## 三、目标类型命名

推荐统一命名如下：

| 当前 | 目标 | 说明 |
| --- | --- | --- |
| `EngineReadApi` | `DocumentReadApi` | 文档读取，不是 engine 级行为 |
| `ActiveReadApi` | `ViewReadApi` | 读取的是 active view session |
| `ActiveEngineApi` | `ViewSessionApi` | 真正表达语义 |
| `ViewsEngineApi` | `ViewsApi` | 去掉冗余 `Engine` |
| `FieldsEngineApi` | `FieldsApi` | 去掉冗余 `Engine` |
| `RecordsEngineApi` | `RecordsApi` | 去掉冗余 `Engine` |
| `EngineDocumentApi` | `DocumentApi` | 去掉冗余 `Engine` |
| `EngineHistoryApi` | `HistoryApi` | 去掉冗余 `Engine` |
| `EnginePerfApi` | `PerfApi` | 去掉冗余 `Engine` |
| `ProjectState` | `ViewSessionSnapshot` | internal 发布快照 |
| `ProjectionState` | `ViewSessionCache` | internal 派生缓存 |
| `QueryState` | `QueryCache` | internal query cache |
| `SectionState` | `SectionCache` | internal section cache |
| `CalcState` | `CalculationCache` | internal calc cache |
| `ActiveViewState` | `ViewSession` | public session 快照 |

注意：

- public 层允许用短名
- internal 层允许用精确名
- 但不能再出现“同一个概念在不同层被叫完全不同东西”的情况

## 四、目标 `Engine` 形状

推荐长期稳定版：

```ts
interface Engine {
  read: DocumentReadApi
  active: ViewSessionApi
  views: ViewsApi
  fields: FieldsApi
  records: RecordsApi
  dispatch: (action: Action | readonly Action[]) => ActionResult
  document: DocumentApi
  history: HistoryApi
  perf: PerfApi
}
```

说明：

- `dispatch` 是最低层能力，facade 只是方便。
- `engine.views` 只负责 view 集合管理。
- 任何依赖 active session runtime 的能力，只能存在于 `engine.active`。

## 五、最终 context 模型

必须把“零碎 helper 闭包上下文”换成显式上下文对象。

推荐统一为三类：

### 1. 写入上下文 `WriteContext`

```ts
interface WriteContext {
  document: DataDoc
  readers: DocumentReaders
  ids: IdFactory
  issues: ValidationCollector
}
```

用途：

- action 规划
- schema/default 解析
- 跨实体修复

### 2. 派生上下文 `DeriveContext`

```ts
interface DeriveContext {
  document: DataDoc
  delta: CommitDelta
  index: IndexSnapshot
  perf: DerivePerfRecorder | null
}
```

用途：

- index derive
- session derive

### 3. active session 上下文 `SessionContext`

```ts
interface SessionContext {
  view: View
  session: ViewSession
  document: DataDoc
  dispatch: Engine['dispatch']
}
```

用途：

- active façade 各 domain service

这三类 context 必须显式建模，不再继续扩散：

- `withView`
- `withField`
- `withGroupField`
- `withFilterField`
- `createCommandContext`

这种“缺什么补什么”的闭包 helper。

## 一步到位迁移清单

以下 checklist 假设执行的是一次性重构，不保留双轨 API，不保留旧 façade，不保留 `project.*` 公开入口。

### A. 先决条件

- [ ] 冻结 `dataview/src/engine` 新功能开发，先做架构切换。
- [ ] 明确这次重构的 public API 以本文件为准，不再接受临时兼容接口。
- [ ] 先补齐当前行为快照测试，特别是 view query、group move、calc、history、undo/redo。
- [ ] 把 bench、fixtures、test 视为迁移范围的一部分，不允许“代码换了，基准脚本继续飘”。

### B. 类型与边界收口

- [ ] 新建 `engine/contracts/public.ts`，承接所有对外 engine contract。
- [ ] 新建 `engine/contracts/internal.ts`，承接所有 internal runtime contract。
- [ ] 从 internal 层移除对 `api/public` 的反向 import。
- [ ] 删除 `project/runtime/state.ts` 中对 `ActiveView` / `ActiveQuery` / `RecordSet` 的 public 依赖。
- [ ] 把 `readModels.ts`、`viewProjections.ts`、`refs.ts` 中仍有长期价值的类型归并到 `session` 相关 contract 文件。
- [ ] 统一 `AppearanceId` / `SectionKey` / `CellRef` 这类 session domain 类型的归属，不再散落在 `project/*` 多个文件。

完成标准：

- internal runtime 所有类型都能在不 import `api/public` 的前提下独立编译。

### C. 改写写入编排链

- [ ] 新建 `mutate/planner/index.ts`，提供统一 `planActions(...)` 入口。
- [ ] 按 `record` / `value` / `field` / `view` 拆 planner 子模块。
- [ ] 把 `action/lower.ts` 的业务规则拆进各 domain planner。
- [ ] 把 `command/runCommands.ts` 的重复存在性校验合并到 planner 流程。
- [ ] planner 直接产出 `WritePlan`：
  - operations
  - semantic draft
  - issues
  - created entities
- [ ] 删除 `LoweredCommand` / `LowerActionResult` 这类只服务旧链路的中间类型。
- [ ] 删除 `command/context.ts`。
- [ ] `command` 目录只保留真正仍有独立意义的 validation / issue 结构；如果不再需要，整体删除。

完成标准：

- 从 public `dispatch(action)` 到 `BaseOperation[]` 只经过一套 planner，不再有 `lower -> runCommands` 双阶段。

### D. 重建 session derive 层

- [ ] 把 `project` 目录重命名并收口为 `session`。
- [ ] 把 `ProjectState` 改为 `ViewSessionSnapshot`。
- [ ] 把 `ProjectionState` 改为 `ViewSessionCache`。
- [ ] `runProjection(...)` 改名为 `deriveSession(...)`。
- [ ] `query` / `sections` / `calc` stage 统一输入输出接口，收敛 `previousProjection` / `previousPublished` 这种平铺大对象。
- [ ] 建立 `SessionDeriveInput` / `SessionDeriveResult` 明确 contract。
- [ ] 让 stage 只处理 internal cache，不直接产出 public model。
- [ ] publish 行为退化为“把 internal cache 转为 stable snapshot”，而不是另起一套 public-ish 类型系统。

完成标准：

- `deriveSession(...)` 的输入对象不再携带一组互相平行的 `previousProjection.query`、`previousPublished.records`、`previousSections` 之类碎片。

### E. 改写 view/session publish 与 collection model

- [ ] 统一 `FieldList` / `SectionList` / `AppearanceList` 的构造方式，提取共享 collection builder。
- [ ] 停止从 `AppearanceId` 反向 parse 业务语义。
- [ ] internal snapshot 直接持有 `AppearanceNode` / `SectionNode`。
- [ ] public collection 只暴露必要导航能力，不内嵌额外派生逻辑。
- [ ] 合并 `publishViewState`、`publishSectionsState`、`publishCalculations` 里的 equality/reuse 工具，抽成共享 snapshot reuse 机制。
- [ ] 让 `engine.active.state` 直接读取 stable session snapshot，而不是 `store/active/state.ts` 再拼一遍。

完成标准：

- session snapshot 变成唯一可信的 active view published model。

### F. 改写 store 结构

- [ ] `store/state.ts` 不再把 `project` 作为全局状态字段名。
- [ ] 新建 `session` 字段，明确表示 active view session snapshot。
- [ ] 为 per-view session cache 预留结构：
  - `session.active`
  - `session.byViewId`
  - `session.cacheRev`
- [ ] `indexDemand` 不再只绑定 `activeViewId`。
- [ ] `index` 改造成 document-level 可复用 index registry。

完成标准：

- 切 view 主要切 session，而不是重新定义整套全局 index 身份。

### G. 改写 public API 与 façade

- [ ] 顶层 `Engine` 增加 `dispatch(...)`。
- [ ] `ViewsEngineApi` 改名为 `ViewsApi`。
- [ ] `FieldsEngineApi` 改名为 `FieldsApi`。
- [ ] `RecordsEngineApi` 改名为 `RecordsApi`。
- [ ] `ActiveEngineApi` 改名为 `ViewSessionApi`。
- [ ] `EngineReadApi` 改名为 `DocumentReadApi`。
- [ ] `ActiveReadApi` 改名为 `ViewReadApi`。
- [ ] `ViewTableApi.setColumnWidths(...)` 与 active table 的 `setWidths(...)` 统一成一个名字。
- [ ] `records.field.set/clear` 改成更直观的 value 语义命名：
  - 推荐 `records.values.set`
  - 推荐 `records.values.clear`
- [ ] `engine.views` 只保留 view collection 操作：
  - `list`
  - `get`
  - `open`
  - `create`
  - `rename`
  - `duplicate`
  - `remove`
- [ ] `engine.active` 保留唯一完整 session 行为面。

完成标准：

- 顶层公开 API 不再出现一组带 `Engine` 前缀的 service 名。
- 同类行为在 active 与非 active 侧不再出现“同义不同名”。

### H. 拆分 active service 实现

- [ ] 删除 `facade/view/index.ts` 的上帝对象结构。
- [ ] 拆成 active service 子域文件：
  - `query`
  - `group`
  - `display`
  - `items`
  - `cells`
  - `table`
  - `gallery`
  - `kanban`
- [ ] `items.move` / `items.create` 中的 group write 推导下沉到专用 domain service。
- [ ] `table.insertLeft` / `insertRight` 中的“建字段 + 插列”流程下沉到 layout/domain service。
- [ ] active service 构造器统一接受 `SessionContext`。

完成标准：

- 不再存在一个 800 行 active façade 文件同时承载所有 active domain 行为。

### I. 清理遗留命名与旧 API 残影

- [ ] 删除 `project` 目录名和 `project.*` 顶层 public 概念。
- [ ] 删除 bench/test 中的旧用法：
  - `engine.view(...)`
  - `engine.project.*`
  - `engine.records.setValue(...)`
- [ ] 所有测试和 benchmark 改为消费新 public API。
- [ ] `src/index.ts` 只导出最终稳定 contract，不再兼容旧命名别名。

完成标准：

- 仓库内不存在旧 API 字符串模式。

### J. 性能与稳定性验收

- [ ] 保留 commit trace / perf stats，但重新绑定到新边界。
- [ ] 对比重构前后 benchmark：
  - value write
  - grouped move
  - search update
  - sort/group/calc 更新
  - undo/redo
- [ ] 确保 view 切换不会无意义触发全局 index 重建。
- [ ] 确保 `reuse` / `sync` / `rebuild` 策略仍然可观测。
- [ ] 补齐 snapshot identity 测试，验证无关改动不会破坏 selector 复用。

完成标准：

- 不只是“行为没坏”，还要证明结构重构后复用率和切换路径更稳定。

## 迁移顺序建议

虽然目标是“一步到位”，但实现上仍然应该按下面顺序推进，避免中途结构塌陷：

1. 先收口 contract 与命名，建立新目录与新类型。
2. 再替换写入 planner。
3. 再替换 session derive。
4. 再替换 active services。
5. 最后统一 public export、bench、tests、fixtures。
6. 所有新链路稳定后，删除旧目录与旧 barrel。

不要反过来从 façade 改起。因为 façade 是最表层，先动它只会把内部混乱继续抹平到别处。

## 必删清单

执行完成后，下面这些旧结构不应继续存在：

- 旧 `project` 命名主干
- 旧 `command/context.ts`
- 旧 `action/lower.ts` 单文件巨型编排器
- 旧 `runCommands.ts` 双阶段 command executor
- 任何 internal 层对 `api/public` 的反向 type import
- 任何 `engine.view(...)` / `engine.project.*` 仓库内调用

## 最终验收标准

如果这次重构完成后，仍然存在下面任意一条，就说明没有做到“长期最优”：

- internal runtime 还在 import public types
- active session 仍然要靠 `withView` / `withField` 这类 helper 补上下文
- action 写入还要走两次 document 模拟
- `project` 这个命名还同时指 runtime、published model、public API 三种东西
- 同类 API 还存在 `setColumnWidths` / `setWidths` 这种不一致
- 仓库内部还有旧 API 消费残影

反过来说，真正达标的状态应该是：

- 写入链路只有一套 planner
- 派生链路只有一套 session snapshot
- public / internal 类型边界完全分离
- `engine.active` 的语义明确且唯一
- 所有 service 命名短、统一、稳定
- benchmark、tests、fixtures 全部收口到同一套 API

## 结论

`dataview/src/engine` 当前不是“再整理几个 helper”和“移动几份 type”就能长期健康的状态。

它已经进入典型的二阶段架构债阶段：

- 第一阶段为了把功能做出来，增加了必要包装。
- 第二阶段这些包装开始彼此重叠，继续补丁式优化只会让边界越来越模糊。

正确做法不是继续做局部减法，而是直接完成一次边界重建：

- 以 `dispatch + document/index/session` 为核心骨架
- 以 `public contract / internal contract` 为类型边界
- 以 `engine.active` 为唯一完整 session API
- 以 `service 薄层 + domain planner + derive snapshot` 为最终结构

这是当前 engine 走向长期最优的唯一合理方向。
