# Dataview Projection 长期最简架构方案

## 1. 前提

本文只讨论长期最优方案，不考虑兼容层、不考虑渐进迁移成本、不考虑对当前接口的平滑过渡。

这里采用一个明确前提，并围绕这个前提把概念压到最少：

1. 全局同一时刻只有一个 active view
2. `activeViewId` 属于 engine 层正式状态
3. `activeViewId` 是持久化数据的一部分
4. 所有 query / layout / calculation 都只围绕 active view 工作

在这个前提下，projection 体系不应该继续按 `viewId` 做 keyed cache，也不应该继续保留“每个 view 各有一套 projection store”的设计。


## 2. 顶层结论

长期最优方案应该是：

```txt
engine.read.*     // raw state
engine.project.*  // active-view derived projection
```

这里再加一条硬约束：

- 命名、API、接口都必须优先选择最短、最直白、最少层级的形式

其中：

- `engine.read` 只暴露原始状态
- `engine.project` 只暴露当前 active view 的派生结果
- `engine.project` 是扁平命名空间，不需要再包一层 `activeView`

也就是说，长期接口应该更像：

```ts
engine.read.document
engine.read.activeViewId
engine.read.record
engine.read.field
engine.read.view

engine.project.view
engine.project.search
engine.project.filter
engine.project.sort
engine.project.group
engine.project.records
engine.project.sections
engine.project.appearances
engine.project.fields
engine.project.calculations
```

而不是：

```ts
engine.read.filter.get(viewId)
engine.read.sort.get(viewId)
engine.read.group.get(viewId)
engine.read.search.get(viewId)
engine.read.viewProjection.get(viewId)
```

也不是：

```ts
engine.project.activeView.*
```

因为在“全局只有一个 active view”的前提下，这层命名只是在重复表达同一个事实，没有增加信息量。


## 2.1 命名原则

长期最优里，命名必须遵守下面四条。

1. 不重复表达上下文
2. 不为了抽象而抽象
3. 不把实现细节写进公开 API
4. 能用一个词解决，就不要用两个词

例如：

- 用 `engine.project.search`
- 不用 `engine.project.activeViewSearchProjection`

- 用 `engine.view.setActive(viewId)`
- 不用 `engine.views.setActiveViewId(viewId)`

- 用 `engine.project.records`
- 不用 `engine.project.recordSetProjection`

对外 API 里，尽量避免这些词：

- `runtime`
- `family`
- `registry`
- `resolved`
- `derived`
- `currentView`
- `projection` 作为字段名后缀

这些词可以存在于内部实现文件里，但不应该成为长期公开接口的主体。


## 3. 为什么要这样收敛

## 3.1 当前系统最大的问题不是功能不够，而是概念过多

现在的 projection 问题，本质不是少几个 equality，也不是少几个 memo。

本质是：

- raw read 和 derived projection 混在一起
- keyed per-view projection 和 current-view projection 并存
- React runtime 还要再补一层 `currentView`
- query 小 projection 和 view 大 projection 同时存在

这会导致：

- 谁是原始状态，谁是派生状态，不清楚
- 哪些对象应该稳定引用，没有统一边界
- 组件要自己组合多个 projection，订阅面碎片化
- 当前其实只关心 active view，却在架构上维护“所有 view 的 projection 能力”


## 3.2 如果系统天然只有一个 active view，就不该继续按 viewId 设计 projection

`viewId -> projection` 这种 keyed 模型只适合以下前提：

- 多个 view 同时被读取
- 非 active view 也需要完整 projection
- 后台要预热多个 view 的派生结果
- UI 会同时显示多个 view 的 query/layout 状态

如果这些都不是产品前提，那么 keyed projection 只是在为不存在的需求付复杂度。

长期最优里应该承认这个产品事实：

- 只有 active view 才值得有 projection


## 3.3 view 切换本来就是重建边界

view 切换时：

- search 语义变了
- filter 语义变了
- sort 语义变了
- group 语义变了
- visible records 变了
- sections / appearances / fields / calculations 都可能变

这本来就是整个 projection 管线的重建边界。

所以长期最优里不应该试图在 view switch 上做复杂复用，而应该直接接受：

- view 切换 => active projection 全量重建

这是简单且正确的。


## 4. 终态原则

## 4.1 `read` 只放 raw

长期最优里，`engine.read` 只保留原始状态，不再暴露 projection。

建议保留：

- `document`
- `activeViewId`
- `recordIds`
- `record`
- `fieldIds`
- `field`
- `viewIds`
- `view`

建议删除：

- `read.search`
- `read.filter`
- `read.sort`
- `read.group`
- `read.viewProjection`


## 4.2 `project` 只放 active-view projection

`engine.project.*` 每一项都只表示“当前 active view 的派生结果”，不接受 `viewId` 参数。

例如：

- `engine.project.search.get()`
- `engine.project.filter.get()`
- `engine.project.sort.get()`
- `engine.project.group.get()`
- `engine.project.records.get()`

外部没有 keyed 读取，也没有 per-view cache。


## 4.3 扁平优于包一层 `activeView`

长期最优命名不需要：

```ts
engine.project.activeView.search
engine.project.activeView.filter
```

因为 engine 已经只有一个 active view 语义。

最简单命名就是：

```ts
engine.project.search
engine.project.filter
```

这里的语义非常明确：

- `engine.project.search` 就是当前 active view 的 search projection

不用再重复一层。


## 4.4 projection 不再按“所有 view”建模，而按“当前管线”建模

长期最优里，projection 的思考方式应该从：

- “每个 view 有一套 projection”

变成：

- “engine 内有一条 active-view projection pipeline”

这会自然消掉很多复杂度：

- 不需要 keyed derived store
- 不需要 per-view cache
- 不需要 current view adapter store
- 不需要跨 view invalidation 路由


## 5. 推荐的终态接口

这一节的目标不是“完整”，而是“最少”。

只保留真正必要的接口。

## 5.1 Engine 状态

```ts
engine.read.document
engine.read.activeViewId
engine.read.recordIds
engine.read.record
engine.read.fieldIds
engine.read.field
engine.read.viewIds
engine.read.view
```

这里 `activeViewId` 是 engine 正式状态的一部分，而不是 React session 的派生状态。

同时建议补一个最直接的只读入口：

```ts
engine.read.activeView
```

它表示当前 active view 的 raw view 对象。

这样 UI 如果只是想读当前 view 的 name / type / id，就不需要自己再做：

- `activeViewId`
- `view.get(activeViewId)`

这能继续减少调用方复杂度。


## 5.2 Engine projection

```ts
engine.project.view
engine.project.search
engine.project.filter
engine.project.sort
engine.project.group
engine.project.records
engine.project.sections
engine.project.appearances
engine.project.fields
engine.project.calculations
```

每个 projection 统一协议：

```ts
type ReadProjection<T> = {
  get(): T
  subscribe(listener: () => void): () => void
}
```

也就是说，所有读取方只面对一种协议：

- `get`
- `subscribe`

不再区分：

- raw read store
- keyed projection store
- currentView store

这里再加一条约束：

- 不要给 projection 再包 selector 风格的花式 API

也就是说，长期公开接口只要：

- `get()`
- `subscribe()`

足够了。

如果上层需要 selector，就在 hook 层做，不要把 API 做复杂。


## 5.3 最小写接口

```ts
engine.view.setActive(viewId)
```

这个接口是 engine 层正式能力，不再由 React page session 持有“当前 view 是谁”的主语义。

如果要继续压缩命名，我建议长期直接叫：

```ts
engine.view.open(viewId)
```

含义就是：

- 把这个 view 设为当前 active view

原因是对于用户语义来说，“切到这个 view”比“set active”更自然，也更短。

如果团队内部更强调状态语义，则保留 `setActive` 也可以。  
但二者只能留一个，不要并存。


## 5.4 最简接口版本

如果把接口压到最低，我建议最终公开面只剩这些：

```ts
engine.read.document
engine.read.activeViewId
engine.read.activeView
engine.read.record
engine.read.field
engine.read.view

engine.project.view
engine.project.search
engine.project.filter
engine.project.sort
engine.project.group
engine.project.records
engine.project.sections
engine.project.appearances
engine.project.fields
engine.project.calculations

engine.view.open(viewId)
```

这已经足够覆盖：

- 当前 view 基本信息
- query UI
- body layout
- record rendering
- calculation rendering
- 视图切换

长期不应继续增加同义 API。


## 6. projection 的内部结构

长期最优里，不需要一个很重的 projection registry 系统。

只需要一个 active runtime 组件即可：

```txt
engine/
  project/
    runtime.ts
    search.ts
    filter.ts
    sort.ts
    group.ts
    records.ts
    sections.ts
    appearances.ts
    fields.ts
    calculations.ts
    view.ts
```

其中：

- `runtime.ts` 负责统一重建和发布
- 其余文件负责各自 projection 的纯构建逻辑

如果还要继续压缩命名，甚至可以把：

- `runtime.ts`

直接叫成：

- `project.ts`

也就是：

```txt
engine/project/
  project.ts
  view.ts
  search.ts
  filter.ts
  sort.ts
  group.ts
  records.ts
  sections.ts
  appearances.ts
  fields.ts
  calculations.ts
```

这样目录和接口名字会更统一。


## 6.1 `engine.project.view`

表示 active view 的最小 view projection。

它的作用只是：

- 提供当前 active view 的最小展示信息
- 给 UI 一个最直接的读取入口

它不是“大而全聚合 projection”。

这里建议只放最常用字段，例如：

- `id`
- `name`
- `type`
- `icon` 或其他最小显示元信息

不要把它重新做成第二个“大 view object”。


## 6.2 `engine.project.search`

表示当前 active view 的 search projection。

输出只包含 UI 和执行真正需要的字段，例如：

- `query`
- `fields`
- `active`

不需要再塞整个 raw `Search` 对象。


## 6.3 `engine.project.filter`

表示当前 active view 的 filter projection。

只负责：

- `mode`
- `rules`
- 每条 rule 的 label / preset / editor / effective / valueText


## 6.4 `engine.project.sort`

表示当前 active view 的 sort projection。

只负责：

- sorter entries
- field labels
- active


## 6.5 `engine.project.group`

表示当前 active view 的 group projection。

只负责：

- field
- mode
- bucketSort
- bucketInterval
- showEmpty
- available modes / sorts
- active


## 6.6 `engine.project.records`

表示当前 active view 的 record-set projection。

建议长期最优以 `recordId[]` 为核心，而不是 `Row[]`。

它至少应包含：

- `derivedIds`
- `orderedIds`
- `visibleIds`

理由很简单：

- `recordId[]` 更轻
- 更稳定
- 能减少 record object 引用变化的传播


## 6.7 `engine.project.sections`

表示当前 active view 的 sections projection。

只负责：

- section descriptors
- bucket metadata
- hidden/collapsed 处理后的 visible sections


## 6.8 `engine.project.appearances`

表示当前 active view 的 appearance list。

只负责：

- `byId`
- `ids`
- `indexOf / prev / next / range / sectionOf`


## 6.9 `engine.project.fields`

表示当前 active view 的 visible fields projection。

只负责：

- visible field ids
- visible fields
- 索引辅助函数


## 6.10 `engine.project.calculations`

表示当前 active view 的 calculations projection。

只负责：

- `calculationsBySection`


## 7. 重建模型

## 7.1 view 切换时全量重建

这是长期最优里的硬约束。

当 `activeViewId` 变化时，直接整棵 projection pipeline 全量重建：

1. resolve active view
2. build search
3. build filter
4. build sort
5. build group
6. build record set
7. build sections
8. build appearances
9. build fields
10. build calculations
11. 发布所有 projection store

这里不做 keyed 复用，不做跨 view cache，不做增量 patch。


## 7.2 document 变化时，只重建 active projection

长期最优里不再存在“所有 view projection”。

因此 document 变化时，不需要做全局 projection invalidation，只需要重建当前 active view 这一条管线。

也就是说：

- 不是“整个系统所有 projection 全量重建”
- 而是“当前唯一 active pipeline 重建”

这已经足够简单。


## 7.3 不再要求每个 projection 各自 `applyChange`

在这个简化模型里，不推荐：

- `searchProjection.applyChange(change)`
- `filterProjection.applyChange(change)`
- `sortProjection.applyChange(change)`

因为这会重新把系统引向“很多组件各自理解 change 并局部 patch”的高复杂度结构。

长期最优里更简单的模型是：

```ts
engine.project.rebuild()
```

或者：

```ts
engine.project.sync(document, activeViewId)
```

统一入口、统一重建。

如果以后确认 active pipeline 重建成本真的高，再讨论局部 patch。  
但那应该是后续性能优化，不应进入第一版终态架构。


## 7.4 内部实现允许复杂，公开接口不允许复杂

即使内部最后仍然保留：

- rebuild helper
- shared cache
- common builder

公开接口也不应该暴露这些概念。

长期最优里要坚持一个边界：

- 内部可以复杂
- 对外必须简单

也就是说，不要把内部实现概念泄漏成公开命名。


## 8. 是否需要 index

在这个简化方案里，index 需求也要一起简化。

## 8.1 不需要全局 projection invalidation index

因为系统里不再维护多 view projection。

既然只有一条 active pipeline，就没有必要再引入复杂的：

- projection family registry
- per-view dependency index
- change router


## 8.2 只需要 raw 数据本身已有的归一化索引

现在 `DataDoc` 已经有：

- `byId`
- `order`

这已经是最基础、也是最重要的 raw index。

长期最优里应直接基于这些归一化结构做 projection 计算，而不是在热路径里反复调用 helper materialize 新数组。


## 8.3 查询执行 index 不是第一优先级

例如：

- search 倒排索引
- grouping bucket 预索引
- sort key 预计算

这些都不是 projection 简化方案的前提。

先把架构做简单、语义做清楚，再看是否真有必要加执行索引。


## 9. React 层应该如何变化

## 9.1 `currentView` 概念应从 React runtime 删除

当前 `react/runtime/currentView` 本质上是在 engine 没有 active view projection 的前提下，用 React 再补一层当前视图概念。

长期最优里，这层应该删除。

React 直接读取：

- `engine.read.activeViewId`
- `engine.project.view`
- `engine.project.filter`
- `engine.project.sort`
- `engine.project.group`

不再需要：

- `createCurrentViewStore`
- `cachedProjection`
- `cachedCurrentView`

React hook 层长期也应该尽量压缩成最少集合，例如：

```ts
useEngineRead(engine.read.activeView)
useEngineProject(engine.project.filter)
```

而不是继续长出：

- `useCurrentView`
- `useActiveViewProjection`
- `useViewQueryProjection`

这些同义 hook。


## 9.2 Page session 不再拥有“当前 view 是谁”的主语义

当前 page/session 持有 `viewId`，这会让“当前 view”同时出现在：

- engine
- react page session

长期最优里只能有一个主语义来源：

- active view id 在 engine

page/session 只保留 UI session 状态，例如：

- query bar 是否展开
- settings route
- selection mode

不再保存 active view id。


## 9.3 UI 直接订阅扁平 projection

例如长期最优里，`PageToolbar` 不应该自己拼：

- `currentView`
- `searchProjection`
- `filterProjection`
- `sortProjection`

而应该直接读：

- `engine.project.view`
- `engine.project.search`
- `engine.project.filter`
- `engine.project.sort`

因为这些就是同一条 active pipeline 已经整理好的稳定投影。


## 10. 需要删除的旧模式

长期最优里，下面这些模式都应该删掉。

## 10.1 keyed view projection store

删除：

- `read.filter.get(viewId)`
- `read.group.get(viewId)`
- `read.search.get(viewId)`
- `read.sort.get(viewId)`
- `read.viewProjection.get(viewId)`


## 10.2 React current-view adapter

删除：

- `react/runtime/currentView/*`


## 10.3 Page session 里的 `viewId`

删除 page/session 对 active view 的所有权。


## 10.4 “所有 projection 都要独立 patch change” 的思路

删除把 projection 系统做成事件驱动 patch 网络的倾向。

在当前前提下，统一重建更简单，也更稳。


## 11. 推荐目录终态

```txt
dataview/src/
  core/
    filter/
    sort/
    search/
    group/
    view/

  engine/
    state/
      activeView.ts
    read/
      source.ts
    project/
      runtime.ts
      view.ts
      search.ts
      filter.ts
      sort.ts
      group.ts
      records.ts
      sections.ts
      appearances.ts
      fields.ts
      calculations.ts

  react/
    dataview/
    page/
```

其中最重要的是：

- `engine/state/activeView.ts`
- `engine/project/runtime.ts`

这两个文件会把“当前 active view 是 engine 的正式概念”真正落到代码结构里。


## 12. 分阶段实施方案

这一节只讨论实施顺序，目标不是“平滑”，而是“尽快进入正确结构”。

总原则：

1. 先确立唯一状态来源
2. 再收口 projection 出口
3. 再删除旧适配层
4. 最后统一命名和文件结构

每个阶段都要满足一个要求：

- 阶段结束后，系统复杂度必须下降，而不是暂时上升


## 12.1 第 0 阶段：冻结方向

### 目标

在真正改代码前，把错误方向先停掉。

### 要做的事

1. 停止新增 keyed per-view projection API
2. 停止在 React 层继续扩展 `currentView` 相关抽象
3. 停止给 `engine.read` 新增任何 derived projection 字段
4. 统一确认长期接口只保留：
   - `engine.read.*`
   - `engine.project.*`
   - `engine.view.open(viewId)` 或 `engine.view.setActive(viewId)`

### 完成标准

- 新代码里不再出现新的 `get(viewId)` projection 设计
- 团队对“active view 在 engine”达成一致
- 这份文档成为后续实现约束

### 这一阶段不要做的事

- 不要补局部 equality 作为长期方案
- 不要先做 projection registry
- 不要先做 query execution index


## 12.2 第 1 阶段：把 `activeViewId` 收进 engine

### 目标

让 engine 成为 active view 的唯一状态来源。

### 要做的事

1. 新增 engine 层 active view state
   - 建议文件：[activeView.ts](/Users/realrong/Rostack/dataview/src/engine/state/activeView.ts)
2. 在 engine 创建流程中初始化 active view state
3. 提供唯一写入口：
   - `engine.view.open(viewId)` 或
   - `engine.view.setActive(viewId)`
4. 提供唯一读入口：
   - `engine.read.activeViewId`
   - `engine.read.activeView`
5. 将当前 page/session 中的 `viewId` 降级，准备删除

### 完成标准

- 当前 view 切换由 engine 驱动
- React page session 不再是 active view 的主语义来源
- 任意调用方都能只通过 engine 读取 active view

### 这一阶段不要做的事

- 不要同时保留两套“谁是当前 view”的主接口
- 不要把 page/session 和 engine 做双向同步
- 不要为了兼容保留长期双写


## 12.3 第 2 阶段：建立最小 `engine.project`

### 目标

先把 projection 出口收口成一个地方，再讨论内部细节。

### 要做的事

1. 新增 `engine.project` 命名空间
2. 先只提供最小 projection：
   - `engine.project.view`
   - `engine.project.search`
   - `engine.project.filter`
   - `engine.project.sort`
   - `engine.project.group`
3. 所有 projection 统一协议：

```ts
type ReadProjection<T> = {
  get(): T
  subscribe(listener: () => void): () => void
}
```

4. `engine.project.*` 全部只面向 active view，不接受 `viewId`

### 完成标准

- `<PageToolbar>`、`ViewQueryBar`、settings 面板已经可以从 `engine.project.*` 读取 query projection
- 新代码不再直接读取 `read.filter/read.sort/read.search/read.group`

### 这一阶段不要做的事

- 不要急着一次性把 records/layout/calculations 全搬进去
- 不要暴露 `engine.project.activeView.*`
- 不要给 projection 加 selector API


## 12.4 第 3 阶段：做统一重建管线

### 目标

让 projection 的更新模型先简单稳定下来。

### 要做的事

1. 新增 `engine/project/runtime.ts`
2. runtime 只做一件事：
   - 基于 `document + activeViewId` 重建当前整条 active pipeline
3. 明确两个重建触发点：
   - active view 切换
   - document 变化
4. 第一版直接统一重建：
   - view
   - search
   - filter
   - sort
   - group

### 完成标准

- `engine.project.*` 的数据来源统一
- 外部不再关心某个 projection 是怎么更新的
- 系统里不存在“这个 projection 靠 patch，那个 projection 靠 derived store”的混搭

### 这一阶段不要做的事

- 不要做 `applyChange` 分发网络
- 不要做局部 patch
- 不要做 dependency index


## 12.5 第 4 阶段：把 records / sections / appearances / fields / calculations 迁入 `engine.project`

### 目标

让页面主体也使用同一条 active projection pipeline。

### 要做的事

1. 继续补齐 projection：
   - `engine.project.records`
   - `engine.project.sections`
   - `engine.project.appearances`
   - `engine.project.fields`
   - `engine.project.calculations`
2. 把 `engine/projection/view/*` 里现有纯 helper 拆出来继续复用
3. 统一由 `engine/project/runtime.ts` 重建这些 projection
4. 优先让 table / gallery / kanban 消费这些新 projection

### 完成标准

- 页面 body 不再依赖旧 `viewProjection.get(viewId)`
- records/layout/calculations 都来自 `engine.project.*`
- active view 切换后，整页都走同一条重建链路

### 这一阶段不要做的事

- 不要保留新旧两套 body projection 长期并存
- 不要在 React 侧再包一层 current-view store 来适配


## 12.6 第 5 阶段：删除旧 keyed projection store

### 目标

把旧设计真正移除，避免系统长期带着双结构。

### 要做的事

1. 删除 `engine.read` 中这些 derived 字段：
   - `filter`
   - `group`
   - `search`
   - `sort`
   - `viewProjection`
2. 删除 `createKeyedDerivedStore(viewId => projection)` 这条旧路线
3. 修改所有调用方，统一切到：
   - `engine.read.activeView`
   - `engine.project.*`

### 完成标准

- 代码库中不再存在 `read.filter.get(viewId)` 一类调用
- keyed per-view projection store 从 engine API 中消失
- projection API 只剩 active-view 语义

### 这一阶段不要做的事

- 不要留下“临时兼容导出”
- 不要保留 deprecated 壳接口长期存在


## 12.7 第 6 阶段：删除 React `currentView` 适配层

### 目标

把当前 view 语义彻底从 React runtime 回收到 engine。

### 要做的事

1. 删除：
   - `react/runtime/currentView/*`
2. 删除依赖 `currentView` store 的中转逻辑
3. React 组件改为直接读取：
   - `engine.read.activeView`
   - `engine.project.*`
4. 清理 hook 命名，避免继续保留：
   - `useCurrentView`
   - `useActiveViewProjection`
   - 同义 current-view hook

### 完成标准

- React 层不再维护 current view 语义
- `cachedProjection`、`cachedCurrentView` 一类补丁逻辑消失
- current view 的唯一来源就是 engine

### 这一阶段不要做的事

- 不要给 React 层再造一个新的 current-view wrapper


## 12.8 第 7 阶段：清理 page/session 职责

### 目标

让 page/session 只保留 UI session 状态。

### 要做的事

1. 从 page/session state 删除 `viewId`
2. 保留 page/session 只处理：
   - query bar visible/route
   - settings visible/route
   - 其他纯 UI session 状态
3. 所有“切换 view”行为统一改成调用 engine

### 完成标准

- page/session 不再持有 active view
- resolve page state 不再参与“当前 view 选择”
- engine 和 page/session 之间的职责清楚

### 这一阶段不要做的事

- 不要继续让 session 保存 active view 的镜像字段


## 12.9 第 8 阶段：统一命名与目录

### 目标

让最终结构和长期命名原则一致。

### 要做的事

1. 清理公开命名，尽量只保留：
   - `read`
   - `project`
   - `open`
   - `view/search/filter/sort/group/records/sections/appearances/fields/calculations`
2. 删除公开 API 中冗余命名：
   - `currentView`
   - `*Projection`
   - `resolved*`
   - `runtime/family/registry` 作为公开字段名
3. 清理目录，保证文件名也尽量短

### 完成标准

- 对外公开命名不再暴露内部实现概念
- 文档、类型、代码命名一致
- 读代码时能直接看懂，不需要先理解一层框架术语


## 12.10 第 9 阶段：最后再判断是否需要性能优化

### 目标

先得到简单正确结构，再决定要不要加优化。

### 要做的事

1. 实测 active pipeline 全量重建成本
2. 只在真实瓶颈存在时，考虑以下优化：
   - records projection 局部复用
   - calculations 局部复用
   - 必要时的 query execution index
3. 优化只能发生在内部实现层，不能扩大公开 API

### 完成标准

- 即使做优化，公开接口仍保持不变
- 系统没有重新长回 keyed projection store
- 优化是局部实现细节，不改变总体模型

### 这一阶段不要做的事

- 不要因为“以后可能需要”提前设计复杂路由
- 不要为尚未证明的瓶颈增加公开抽象


## 12.11 建议的实际执行顺序

如果要按最稳的顺序推进，我建议：

1. 第 0 阶段
2. 第 1 阶段
3. 第 2 阶段
4. 第 3 阶段
5. 第 5 阶段先做 query projection 的旧接口删除
6. 第 6 阶段删除 React `currentView`
7. 第 4 阶段把 body projection 全部迁入 `engine.project`
8. 第 7 阶段清理 page/session
9. 第 8 阶段统一命名与目录
10. 第 9 阶段最后做性能判断

这里刻意把“删除旧 query keyed projection”提前，是因为 query UI 的问题已经暴露出来了，越早删越能防止新代码继续依赖旧模型。


## 13. 最终结论

在“全局只有一个 active view，而且 active view id 属于 engine 持久化状态”的前提下，长期最优方案不是把 projection 体系做得更通用，而是主动放弃通用性，换取更低复杂度。

正确方向是：

1. `activeViewId` 进入 engine 正式状态
2. `engine.read` 只保留 raw state
3. `engine.project` 扁平暴露当前 active view 的 projection
4. 删除 keyed per-view projection store
5. 删除 React `currentView` adapter
6. view 切换时整棵 active projection 全量重建
7. document 变化时也只重建这唯一一条 active pipeline

这条路线的核心价值不是“更快”，而是：

- 概念最少
- 边界最清楚
- 不容易再次长回多层缓存和多套 current-view 语义

再补一句约束：

- 如果一个名字读起来像“框架”
- 如果一个 API 看起来像“为了以后可能会扩展”
- 如果一个接口只是把同义概念重新包了一层

那它大概率就不该出现在长期公开设计里。

如果长期目标真的是“复杂度越低越好”，那这就是比 per-view projection registry 更合适的终态。
