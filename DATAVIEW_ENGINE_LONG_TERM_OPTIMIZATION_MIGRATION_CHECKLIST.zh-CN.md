# Dataview Engine 单 Active View 最终重构清单

## 文档定位

这份文档是 `dataview/src/engine` 的最终收口方案，前提已经明确：

- 运行时全局只有一个 active view。
- 不需要多面板并行存在。
- 不需要同时维护多个 view runtime。
- 不需要预热 inactive view。
- 切换 view 时允许重建当前 active runtime。

因此，这份方案不再为“未来可能出现的多 view 并行 runtime”预留结构。

这不是保守兼容方案，也不是局部整理建议，而是基于单 active view 约束做出的更简单、更激进、也更适合当前产品的长期版本。

## 核心结论

当前 `engine` 最大的问题，不是算法不够强，而是围绕“当前 active view”这个单一事实，仍然堆出了太多中间层：

- `action`
- `command`
- `operation`
- `index`
- `project/runtime`
- `project/publish`
- `store/active`
- `api/public`
- `facade/view`

这些层里有不少在做的其实是同一件事：

- 重新包装 active view 状态
- 重新拼接上下文
- 重新命名同一组数据
- 重新把一次写入拆成另一种中间形式

在“全局只有一个 active view”的前提下，这些层里有一大半都应该被压平。

一句话结论：

- 保留多 view 的文档数据模型。
- 删除多余的多 session runtime 心智模型。
- 把 engine 收口成 `doc + active runtime + write planner` 三个主轴。

## 对当前代码的判断

## 1. `activeViewId` 驱动 index demand 不是问题，应该被接受

当前 `resolveIndexDemand(document, activeViewId)` 直接按 active view 推导 demand，见：

- `dataview/src/engine/project/runtime/demand.ts`
- `dataview/src/engine/store/state.ts`

如果要支持多个并行 runtime，这会成为结构限制。

但在你当前明确不要多面板、不要多 runtime 的前提下，这恰恰是正确的简化。

也就是说，这里不该继续往“全局 per-view index registry”方向演进，而应该明确承认：

- index 就是当前 active view 服务的 active index
- 它和 active view 生命周期绑定是合理的

后续方案里应该保留这一点，而不是把它视为必须消除的耦合。

## 2. 真正多余的是 `project/runtime -> publish -> store/active` 三层包装

当前 active view 派生链路里，存在明显重复包装：

- `project/runtime` 生成内部派生状态
- `project/publish` 再把它包装成更像 public 的结构
- `store/active` 再把 `project.*` 拼成 `ActiveViewState`
- `store/active/read.ts` 再补 `cell`、`planMove`、`filterField`、`groupField`

这条链过长，而且所有层都围绕“当前 active view”工作，并没有真正的多 session 价值。

在单 active view 模式下，正确做法是：

- 删除 `project` 这个中间主语
- 直接建立 `active runtime`
- internal 只保留一份 `ActiveSnapshot`
- public `engine.active.state` 直接读它

也就是说，应该从：

```text
doc -> index -> project/runtime -> project/publish -> store/active -> active api
```

变成：

```text
doc -> activeIndex -> activeSnapshot -> active api
```

## 3. `lowerAction -> runCommands` 双阶段写入链过重

当前主写入路径是：

- `resolveActionBatch(...)`
- `lowerAction(...)`
- `runCommands(...)`
- `applyOperations(...)`

这里的问题是：

- action 层循环维护一次 `workingDocument`
- command 层循环又维护一次 `workingDocument`
- `lowerAction` 与 `runCommands` 都在做存在性校验、结构校验、补默认值、生成下游 payload

这条链条在“engine 想保留一套 command IR”时还能自圆其说。

但对你现在的目标来说，这条链已经明显过度设计了。

最终应该改成：

```text
dispatch(action)
  -> planActions(document, actions)
  -> applyOperations(document, operations)
  -> deriveActive(document, delta)
```

也就是：

- 只保留一套 planner
- planner 直接产出 operation plan
- 不再保留现有 `command` 这一层的中间抽象

## 4. `facade/view/index.ts` 已经不是 façade，而是 active runtime 的上帝对象

当前这个文件同时承担：

- active store 装配
- patch action 构造
- query 写入
- group 规则写值
- item move
- item create
- cell 写入
- table/gallery/kanban 特化
- 字段创建与显示列插入

它的问题不是“大”，而是：

- 轻量 patch 操作和重业务动作混在一起
- 上下文缺失，只能靠 `withView`、`withField`、`withGroupField` 这类 helper 拼
- active runtime 的真实规则被埋在 façade 里

在单 active view 模式下，更应该直接拆成 active domain services：

- `active/query`
- `active/items`
- `active/cells`
- `active/display`
- `active/table`
- `active/gallery`
- `active/kanban`

façade 本身只能保留薄路由。

## 5. 当前命名重复，且很多名字在单 active view 语义下已经没有必要

当前有一组很重的名字：

- `EngineReadApi`
- `ActiveReadApi`
- `ActiveEngineApi`
- `ViewsEngineApi`
- `FieldsEngineApi`
- `RecordsEngineApi`
- `ProjectState`
- `ProjectionState`

这些名字的问题不只是长，更重要的是：

- 很多名字是在为“可能还有别的 engine/view/runtime 变体”做区分
- 但你的产品语义并不需要那么多区分

在单 active view 模式下，命名应该更直接：

- `DocumentReadApi`
- `ViewApi`
- `ViewReadApi`
- `ViewsApi`
- `FieldsApi`
- `RecordsApi`
- `ActiveIndex`
- `ActiveSnapshot`
- `ActiveCache`

## 最终架构决策

## 一、保留什么

- 保留 `DataDoc.views` 和 `DataDoc.activeViewId`
- 保留 `engine.views` 作为 view 集合管理
- 保留 `engine.active` 作为唯一完整 view API
- 保留 active view 驱动的 index 体系
- 保留 perf trace 与 history
- 保留 search/group/sort/calc 这些索引算法

## 二、删除什么

- 删除 `project` 作为中间 runtime 主语
- 删除“可能存在多个并行 session”的设计预留
- 删除 `command` 这层中间 IR
- 删除 `store/active` 对 active state 的二次包装
- 删除 scoped view runtime façade 的心智模型
- 删除 inactive view runtime 预热/缓存方向

## 三、明确接受什么代价

- `view.open(viewId)` 时可以重建当前 active runtime
- 不为 inactive view 维持派生缓存
- 不追求切 view 时复用旧 active runtime 身份

这是有意识的简化，不是退化。

## 目标结构

建议最终收口为：

```text
dataview/src/engine/
  api/
    createEngine.ts
    public/
      engine.ts
      index.ts
  contracts/
    public.ts
    internal.ts
  state/
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
      shared.ts
      validate.ts
  derive/
    activeIndex/
      ...
    active/
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
```

这里最重要的不是目录名，而是依赖方向：

- `contracts/internal.ts` 只给 engine 内部用
- `contracts/public.ts` 只给外部与 services 边界用
- `derive/active/*` 不 import `api/public`
- `api/createEngine.ts` 只做装配
- `services/*` 不承载核心派生规则

## 目标 store 形状

单 active view 模式下，store 应该非常直接：

```ts
interface EngineState {
  rev: number
  doc: DataDoc
  history: HistoryState
  active: {
    demand: ActiveDemand
    index: ActiveIndex
    cache: ActiveCache
    snapshot: ActiveSnapshot
  }
}
```

这里的关键点：

- 不再有 `project`
- 不再有 `cache.indexDemand + cache.projection` 的拆散组合
- 所有 active runtime 相关状态都放在 `active` 下

## 目标 derive 链路

最终链路应该是：

```text
dispatch(action)
  -> planActions(base.doc, actions)
  -> applyOperations(base.doc, operations)
  -> resolveActiveDemand(nextDoc, nextDoc.activeViewId)
  -> deriveActiveIndex(previous.active.index, nextDoc, delta, demand)
  -> deriveActiveSnapshot(previous.active.snapshot, previous.active.cache, nextDoc, activeIndex, delta)
  -> commit(nextState)
```

这里要点只有两个：

- active index 继续只服务当前 active view
- active snapshot 是唯一 active 派生快照

## 目标 public API

建议最终稳定版：

```ts
interface Engine {
  read: DocumentReadApi
  active: ViewApi
  views: ViewsApi
  fields: FieldsApi
  records: RecordsApi
  dispatch: (action: Action | readonly Action[]) => ActionResult
  document: DocumentApi
  history: HistoryApi
  perf: PerfApi
}
```

约束如下：

- `engine.views` 只做 view 集合管理
- `engine.active` 是唯一完整 active view API
- 任何依赖 sections、appearances、group runtime 的能力，只能存在于 `engine.active`
- 顶层显式暴露 `dispatch`，facade 只做 convenience layer

## `engine.views` 的职责

只保留：

- `list`
- `get`
- `open`
- `create`
- `rename`
- `duplicate`
- `remove`

不允许：

- scoped runtime façade
- inactive view 的 read/select/session 操作
- `items` / `cells` / `planMove` 这类 active-only 能力

## `engine.active` 的职责

`engine.active` 是唯一完整 active view API，包含：

- 当前 active view 的读取
- 当前 active snapshot 的订阅
- query 相关写入
- display/layout 相关写入
- items move/create/remove
- cells set/clear
- table/gallery/kanban 特化行为

也就是说：

- 只有这里可以消费 active runtime
- 只有这里允许操作 appearance、section、cell

## 目标类型命名

建议统一如下：

| 当前 | 目标 |
| --- | --- |
| `EngineReadApi` | `DocumentReadApi` |
| `ActiveEngineApi` | `ViewApi` |
| `ActiveReadApi` | `ViewReadApi` |
| `ViewsEngineApi` | `ViewsApi` |
| `FieldsEngineApi` | `FieldsApi` |
| `RecordsEngineApi` | `RecordsApi` |
| `ProjectState` | `ActiveSnapshot` |
| `ProjectionState` | `ActiveCache` |
| `IndexState` | `ActiveIndex` |

这里不追求“最学术正确”的命名，而追求与你的真实约束一致：

- 全局只有一个 active runtime
- 所以 internal name 也应该承认自己是 active-only

## 必须保留的内部模型

下面这些结构仍然有价值，不该推倒：

- record index
- search index
- group index
- sort index
- calculation aggregate state
- commit trace
- history replay

也就是说：

- 算法层保留
- 包装层削掉

## 必须删除的内部模型

下面这些概念应该被彻底删除或吸收：

- `project` 作为目录和类型主语
- `publish` 作为单独中间层
- `store/active` 作为 active state 二次拼装层
- `LoweredCommand`
- `LowerActionResult`
- `ResolvedWriteBatch` 里依赖 command 语义的旧结构
- `createCommandContext`

## 一次性迁移 checklist

### A. 锁定单 active view 约束

- [ ] 在根方案和实现注释里明确：runtime 全局只有一个 active view。
- [ ] 不再设计 per-view runtime cache。
- [ ] 不再为 inactive view 维护 snapshot/index。

### B. 先收口类型边界

- [ ] 新建 `contracts/internal.ts` 与 `contracts/public.ts`。
- [ ] internal runtime 全面移除对 `api/public` 的依赖。
- [ ] `project/runtime/state.ts` 现有类型全部迁到 internal contract。
- [ ] `readModels.ts`、`viewProjections.ts`、`refs.ts` 重新分配归属。

完成标准：

- internal derive 层在不 import public api type 的情况下可独立编译。

### C. 删除 `project` 主语，改成 active runtime

- [ ] `project/runtime` 改为 `derive/active`
- [ ] `project/publish` 合并进 `derive/active/snapshot`
- [ ] `ProjectState` 改为 `ActiveSnapshot`
- [ ] `ProjectionState` 改为 `ActiveCache`
- [ ] `store.state` 中的 `project` 字段改为 `active.snapshot`

完成标准：

- engine 内部不再出现 `project.*` 作为 active runtime 的统称。

### D. 压平写入链

- [ ] 新建统一入口 `planActions(...)`
- [ ] 按 domain 拆 planner：`record`、`value`、`field`、`view`
- [ ] `action/lower.ts` 拆除
- [ ] `runCommands.ts` 拆除
- [ ] `command/context.ts` 拆除
- [ ] planner 直接产出 operations、delta draft、issues、created entities

完成标准：

- `dispatch(action)` 到 operations 之间只有一层 planner。

### E. 合并 active state 包装层

- [ ] 删除 `store/active/state.ts` 中的 active state 拼装逻辑
- [ ] 删除 `store/active/read.ts` 中对 snapshot 空洞的补模型职责
- [ ] `engine.active.state` 直接订阅 `active.snapshot`
- [ ] `engine.active.read` 只保留解析型 helper，不再承担“补足 public state”职责

完成标准：

- active snapshot 只有一个来源，不再先 publish 再 store 拼装。

### F. 拆分 active services

- [ ] 把当前 `facade/view/index.ts` 拆成 domain files
- [ ] `items.move` 与 `items.create` 下沉到 `services/active/items.ts`
- [ ] `cells.set/clear` 下沉到 `services/active/cells.ts`
- [ ] query/group/display/table/gallery/kanban 各自独立
- [ ] façade 入口文件只负责组装

完成标准：

- 不再存在单个 active façade 文件承载所有规则。

### G. 统一 public API 命名

- [ ] `ViewsEngineApi` 改为 `ViewsApi`
- [ ] `FieldsEngineApi` 改为 `FieldsApi`
- [ ] `RecordsEngineApi` 改为 `RecordsApi`
- [ ] `EngineReadApi` 改为 `DocumentReadApi`
- [ ] `ActiveEngineApi` 改为 `ViewApi`
- [ ] `ActiveReadApi` 改为 `ViewReadApi`
- [ ] `table.setColumnWidths` 与 `table.setWidths` 统一成一个名字
- [ ] `records.field.set/clear` 改成更直接的 value 语义命名

完成标准：

- 同类行为只保留一套命名。

### H. 清理旧 API 残影

- [ ] bench/test/fixtures 全量改成新 API
- [ ] 删除仓库内所有 `engine.view(...)` 风格旧调用
- [ ] 删除仓库内所有 `engine.project.*` 风格旧调用
- [ ] 删除仓库内所有 `engine.records.setValue(...)` 风格旧调用

完成标准：

- 仓库内部不再存在旧 API 心智残影。

### I. 保持 active-coupled performance 模型

- [ ] 保留 active view 驱动的 demand 模型
- [ ] 保留 `reuse/sync/rebuild` trace 能力
- [ ] 确保切 view 时重建 active runtime 路径可观测
- [ ] benchmark 重点覆盖 active write 与 active switch，不再验证不存在的多 runtime 场景

完成标准：

- 性能模型服务当前产品事实，而不是未来假设。

## 不该再做的事

后续重构中，下面这些方向不应该再被引入：

- 为 inactive view 预留 runtime cache
- 为未来多面板加 `byViewId` session registry
- 为 command 体系保留第二套中间 IR
- 再引入一个介于 derive 与 public state 之间的新 publish 层
- 再造一层 `active store` 来拼已有 snapshot

这些都只会把已经明确不需要的复杂度重新带回来。

## 最终验收标准

这次重构完成后，真正达标应该满足以下条件：

- engine 内部只存在一个 active runtime 主轴
- active index 与 active snapshot 生命周期一致
- `project` 作为 active runtime 主语被彻底删除
- 写入链只有一套 planner
- active public state 只有一个来源
- façade 变薄，业务规则回到 domain services
- bench/test 不再出现旧 API 残影

如果重构完成后还存在以下任一情况，就说明没有真正做简单：

- internal 还在 import public types
- active state 还要靠二次包装拼出来
- write path 还保留 `action -> command -> operation` 双阶段
- 还在讨论 inactive view runtime cache
- 一个 active façade 文件仍然承载所有业务规则

## 结论

在“全局只有一个 active view”的约束下，Dataview engine 的长期最优方向不是做更通用，而是做更诚实：

- 承认 runtime 是 active-only
- 承认切 view 可以重建 runtime
- 保留真正有价值的 index 与 perf 基础
- 删除所有为并不存在的多 runtime 场景预留的中间层

最终应该把 engine 收口成一个非常清楚的结构：

- 文档层负责持久化 view 集合
- planner 负责把 action 规划成写入
- active runtime 负责当前 view 的派生与读取
- façade 只负责提供薄 API

这才是你当前约束下真正简单、真正稳、也真正适合长期演进的方案。
