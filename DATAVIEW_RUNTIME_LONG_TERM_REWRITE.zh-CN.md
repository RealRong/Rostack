# DATAVIEW Runtime Long-Term Rewrite

## 1. 结论

这次对 `dataview-runtime` 的长期最优判断，按更务实的方向收敛如下：

- `engine` 继续作为直接的 domain write API，对 React 保持可见，这不是大问题。
- `runtime` 不需要强行变成“唯一写命令边界”。
- `runtime` 真正该做好的，是 `source / session / workflow / model` 这四类 UI 侧职责。
- React 可以继续直接调用简单的 `engine.*` 命令，但不应该承担跨 session / source / 时序的多步 workflow。

也就是说，下一步不应该把重点放在“把所有写操作都包进 `runtime.intent`”，而应该放在：

- 清理 `runtime` 自己内部的层次和模型。
- 去掉重复建模和错位的中间层。
- 让 `runtime` 变成稳定、简单的 UI 读边界和 workflow 边界。

前提：

- 以长期最优为目标。
- 不考虑兼容层和过渡 API。
- 任何阻碍长期最优的旧结构都可以删。

## 2. 对 runtime 的重新定性

## 2.1 engine 是 domain API，不必藏起来

下面这些直接调用，本身没有问题：

- `engine.views.*`
- `engine.fields.*`
- `engine.records.*`
- `engine.active.*`
- `engine.history.*`

原因很简单：

- 这些本来就是 domain command。
- 它们不是 store 泄漏。
- 它们也不是 runtime/source 的职责错位。

如果一个操作只是“一跳直达 domain mutation”，runtime 再包一层通常只有形式收益，没有实质收益。

所以长期最优不是“React 不能碰 engine”，而是：

- React 不要自己拼复杂 workflow。

## 2.2 runtime 是 UI projection + UI session + UI workflow

runtime 应该稳定承担下面四类职责：

- `source`
  engine `snapshot + delta` 到 store/source 的投影层
- `session`
  selection / inline / valueEditor / marquee / page 这类 UI 会话状态
- `workflow`
  创建记录后等待投影稳定再打开、跨 source 和 session 的时序流程
- `model`
  page / table / gallery / kanban 这类给 React 用的 UI 读模型

这四块才是 runtime 真正应该做好的边界。

## 2.3 React 的职责

React 应该负责：

- DOM
- render
- pointer / keyboard / overlay effect
- 订阅 runtime 的 `source / session / model`
- 调用简单 `engine.*` 命令
- 调用少量 runtime `workflow`

React 不该负责：

- 在组件里拼跨 source / session / retry / focus 的业务链条

## 3. 当前已经正确、应该保留的部分

## 3.1 store 发布已经从 engine 隔离出去

这点已经正确，不应再回退。

当前链条是：

- engine 公开 `snapshot / delta / subscribe`
- runtime 在 `createEngineSource()` 里把它们投影成 `DocumentSource / ActiveSource`

这说明：

- engine 不负责 store
- runtime 才负责 UI read source

这是正确的长期方向。

## 3.2 selection / marquee / inline / valueEditor 属于 runtime

这些都是 UI session/controller，不属于 engine。

它们的职责方向没有问题：

- `selection`
  通用选择算法和 controller
- `marquee`
  selection 的 UI preview/commit 层
- `inlineSession`
  卡片内联编辑会话
- `valueEditor`
  浮层值编辑会话

## 3.3 page / table / gallery / kanban 的读模型属于 runtime

这类东西本质上都是“给 React 消费的 UI model”。

它们依赖：

- source
- session overlay
- UI convenience projection

不应该回到 engine。

## 4. 当前真正需要处理的问题

## 4.1 `source` 语义被污染了

当前 `DataViewSource` 里除了 engine projection data，还有：

- `selection`
- `inline`

这会把两类语义混在一起：

- `doc / active`
  是 engine projected data source
- `selection / inline`
  是 UI session overlay

长期最优里，`source` 应该只表示：

- engine projected source

而不是“所有 UI 可读 store 的集合”。

否则问题会一直存在：

- model 看起来在读 source，实际在读 session
- 读依赖不清楚
- source boundary 很难稳定

## 4.2 `page/session -> page/state -> model/page` 过度分层

现在 page 相关逻辑拆成：

- `page/session`
- `page/state`
- `model/page`

这条链太长，而且中间层价值不高。

`page/state/page.ts` 本质只做了：

- route normalization
- `valueEditorOpen`
- `lock`

其中 `lock` 当前甚至只有：

- `value-editor`

这不值得长期单独保留一个 `page/state` 子系统。

更合理的最终形态应该是：

- `page/session`
  只保留 raw page session controller
- `model/page`
  直接吸收 route normalization 和 UI projection
- `lock`
  如果还需要，局部 derive，不再占一个公共状态层

## 4.3 `session.page.store` 的语义是错位的

当前 `createPageSessionApi()` 内部操作的是 raw page session，
但 runtime 最后暴露给外部的 `session.page.store` 却是 normalized 的 `PageState`。

也就是说同一个 `page` 对象里：

- 方法写 raw session
- `store` 读 normalized state

这会让 API 长期变得别扭。

最终应该统一成：

- `session.page`
  只代表 raw page session controller
- page 的 effective UI state
  进入 `model.page`

## 4.4 `model/page` 还在重复建模 active view

当前 page model 还在用：

- `active.view.id`
- `doc.views`

重新拼 `currentView`。

但 runtime source 已经有：

- `source.active.view.current`

所以这不是缺少能力，而是重复建模。

长期最优应统一为：

- `activeView` 直接来自 `source.active.view.current`
- `doc.views` 只表示所有 view 列表

不再做二次解析。

## 4.5 `table/runtime.ts` 实际上是 model，不是 runtime assembly

当前 `table/runtime.ts` 做的事包括：

- 派生 `TableGrid`
- 派生 `TableViewState`
- 派生列状态
- 派生 summary

这本质上就是 table 的 UI model/read model。

问题不是逻辑错，而是：

- 名字错
- 位置错
- 顶层挂载方式也错

长期最优里应该改成：

- `model/table.ts`
- `TableRuntime` 改名 `TableModel`
- `DataViewRuntime.table` 删除
- `DataViewRuntime.model.table` 成为唯一入口

这样和 `page / gallery / kanban` 才对称。

## 4.6 `createRecord` 不是一级职责域

`createCreateRecordApi()` 做的事情是：

- create
- 等待目标出现在当前 view/source
- 再 open

它本质上是一个 UI workflow。

所以它不应该长期占一个独立一级目录：

- `createRecord/`

更合理的归属是：

- `workflow.createRecord`

或者后续更明确的：

- `workflow.records.createAndOpen`

## 4.7 `createEngineSource.ts` 过大，但不需要更抽象框架

`createEngineSource.ts` 现在体量已经明显过大。

问题不是缺框架，而是职责还没拆平。

它现在同时承担：

- source store 构造
- reset 逻辑
- delta apply 逻辑
- document projection
- active projection
- item / section / field / summary 这些 artifact patch 细节

长期最优的处理方式应该很朴素：

- `createDocumentSource`
- `createActiveSource`
- 共享 patch helper
- 顶层 `createEngineSource` 只保留装配和 subscribe

目标是隔离基础设施复杂度，不是再套一层 runtime framework。

## 4.8 package boundary 太宽，内部 helper 泄露

现在 `@dataview/runtime` 的 package export 里有：

- `"./*": "./src/*"`

这会带来两个后果：

- 所有内部文件都被事实公开
- runtime 无法自由移动内部目录和 helper

更糟的是，React 现在已经在直接依赖 runtime 的内部 helper：

- `dataview-react` 直接用 `@dataview/runtime/store`

这说明 runtime 内部实现已经泄露到了上层。

长期最优必须做两件事：

- 去掉 wildcard export
- 停止跨包依赖 runtime 内部文件

## 4.9 runtime 仍依赖 engine 的内部 contracts 路径

runtime 现在有不少 import 指向：

- `@dataview/engine/contracts/core`
- `@dataview/engine/contracts/view`
- `@dataview/engine/contracts/shared`

这说明 runtime 依赖的不是 engine 稳定 public root，而是 engine 内部 contract 路径。

长期最优里应只允许：

- 从 `@dataview/engine` root import
- 或者 engine 单独提供稳定的 runtime-facing contract entry

否则 engine/runtime 的边界仍然是半开的。

## 4.10 `session.store` / `DataViewSessionState` 聚合层价值不高

当前 runtime 又把：

- page
- editing
- selection

拼成了一个 `DataViewSessionState` 聚合 store。

这层的主要问题是：

- 它不是原始 session source
- 也不是稳定的 UI model
- 只是把几个 controller 状态拼在一起

这类聚合层很容易变成新的中间层负担。

长期最优里更合理的做法是：

- 直接暴露各 session controller/store
- 不再额外暴露一个总的 `session.store`

## 5. 哪些事不是主要问题

## 5.1 React 直接调用简单 engine 命令不是主要问题

这件事可以明确降级处理，不必作为 rewrite 主目标。

像下面这些：

- `engine.views.open`
- `engine.views.rename`
- `engine.records.fields.set`
- `engine.active.filters.add`
- `engine.active.items.move`
- `engine.history.undo`

如果本身就是单步 domain command，React 直接调是可以接受的。

## 5.2 runtime 不需要为了“纯度”强造一层完整 intent

如果把所有写操作都包进 `runtime.intent`，收益未必大。

它带来的通常只是：

- 多一层转发
- 多一层 API 面
- 多一层维护成本

而不会自动带来更少 bug。

所以长期最优不应该追求：

- “runtime 吞掉所有命令”

而应该追求：

- “复杂 workflow 不要散落在 React 里”

## 6. 长期最优职责边界

## 6.1 Engine

engine 只负责：

- domain mutation command
- snapshot
- delta
- 必要的同步 read API

engine 不负责：

- store
- UI session
- UI model
- UI workflow

## 6.2 Runtime

runtime 负责：

- engine snapshot/delta -> source projection
- UI session/controller
- 少量跨 source / session / retry / focus 的 workflow
- page/table/gallery/kanban 读模型

runtime 不负责：

- DOM
- React effect
- pointer / keyboard 事件接线
- 包装所有简单 engine 命令

## 6.3 React

React 负责：

- render
- DOM
- host effect
- gesture / overlay / pointer / keyboard wiring
- 调用简单 `engine.*`
- 调用复杂 `runtime.workflow.*`
- 订阅 `runtime.source / runtime.session / runtime.model`

## 7. 最终 public API

这里需要先把两层边界分开：

- `DataViewRuntime` 对象表面
- `@dataview/runtime` package export 表面

前者是运行时对象的职责边界，后者是 npm/package 的公开边界，这两层不应该混在一起。

### 7.1 `DataViewRuntime` 对象表面

按这个更务实的方向，建议最终 `DataViewRuntime` 收敛成下面这样。

```ts
export interface DataViewRuntime {
  engine: Engine
  source: EngineSource
  session: {
    page: PageSessionController
    selection: ItemSelectionController
    inline: InlineSessionApi
    valueEditor: ValueEditorController
    marquee: MarqueeController
  }
  workflow: {
    createRecord: CreateRecordApi
  }
  model: {
    page: PageModel
    table: TableModel
    gallery: DataViewGalleryModel
    kanban: DataViewKanbanModel
  }
  dispose(): void
}
```

这里有几个关键点：

- 保留 `runtime.engine`
- 删除 `runtime.intent`
- 删除 `runtime.table` 顶层入口
- 保留 `engine` 作为简单命令入口
- 把真正高阶的 UI 流程收进 `workflow`
- `source` 只保留纯 engine projected source

### 7.2 `@dataview/runtime` package export 表面

长期最优里，package 边界应该比对象表面更收敛。

最终目标不是把 `source / session / workflow / model` 都各自变成稳定子入口，而是：

- 默认只保留 root export：`@dataview/runtime`
- 只有在某个模块被明确证明是“独立复用、与 runtime 主装配解耦、跨包长期稳定”的前提下，才考虑单独子入口

当前唯一勉强可能单独存在的候选，只是：

- `@dataview/runtime/selection`

但这也不是默认要求；如果没有明确复用收益，长期最优仍然是 root-only。

也就是说，下面这些目录即使在实现上存在，也不应自动变成 public subpath：

- `./source`
- `./model`
- `./workflow`
- `./valueEditor`
- `./inlineSession`
- `./marquee`
- `./page/*`
- `./store`

原因很简单：

- runtime 已经有 `runtime.source / runtime.session / runtime.workflow / runtime.model` 这组对象边界
- 如果 package export 再复制一层同构边界，只会把移动文件、收缩目录、重命名模块的成本永久公开化
- 对外真正稳定的应是 runtime root API，不是内部目录结构

## 8. 最终目录形态

建议把 runtime 收敛成下面这四个一级职责域。

```text
src/
  index.ts
  runtime.ts
  contracts.ts

  source/
    index.ts
    contracts.ts
    createEngineSource.ts
    createDocumentSource.ts
    createActiveSource.ts
    patch.ts

  session/
    page.ts
    selection.ts
    inline.ts
    valueEditor.ts
    marquee.ts
    controller.ts

  workflow/
    index.ts
    createRecord.ts

  model/
    index.ts
    page.ts
    table.ts
    gallery.ts
    kanban.ts
    card.ts
    queryFields.ts
```

这里说的是实现目录，不等于 package public subpath。

这不是增加抽象层，而是把现在分散在：

- `createRecord`
- `inlineSession`
- `marquee`
- `valueEditor`
- `page/session`
- `page/state`
- `table`
- `model/internal`
- `dataview`

这些目录里的职责重新压平。

关键变化：

- `table` 并入 `model`
- `createRecord` 并入 `workflow`
- `page/state` 删除
- `store.ts` 改名并归入 `session/controller.ts`
- `model/internal` 删除

## 9. 具体整理建议

## 9.1 保留 `runtime.engine`

不再把“删除 `runtime.engine`”当成目标。

更合理的判断是：

- `engine` 是稳定的 domain API
- 对外保留它没有本质问题
- 重点是不要让 React 自己承担复杂 workflow

## 9.2 删除 `intent` 概念

当前 `intent` 只覆盖了部分 UI 控制器，既不完整，也不必要。

长期最优里更简单的做法是：

- 简单数据命令继续走 `engine`
- UI controller 命令继续挂在各自 `session` controller 上
- 真正跨步骤的流程进入 `workflow`

这样 API 语义更清楚，也更少中间层。

## 9.3 `source` 改回纯 projected source

最终建议：

- 删除 `DataViewSource`
- 直接复用 `EngineSource`
- `selection` / `inline` 不再挂在 `source`

这些 overlay 留在：

- `session.selection`
- `session.inline`
- `session.marquee.preview`

model 如果需要它们，就显式接收。

## 9.4 删除 `page/state`

最终建议：

- 删除 `PageState`
- 删除 `createPageStateStore`
- `session.page` 只保留 raw page session
- `model.page` 直接产出 header / toolbar / body / query / settings 这些 UI model

## 9.5 page model 全部改成 `activeView`

page model 里所有：

- `currentView`

统一改名成：

- `activeView`

并直接来自：

- `source.active.view.current`

不再通过 `active.view.id + doc.views` 二次解析。

这里不建议再继续缩短成：

- `active`
- `view`

原因是：

- `active` 过于宽泛，和 `active.query / active.items / active source` 很容易混
- `view` 又过于泛，和 `views / viewId / viewType` 的集合语义冲突

`activeView` 已经是能保持精确语义的最短稳定命名。

## 9.6 `table/runtime.ts` 改名为 `model/table.ts`

最终建议：

- `TableRuntime` -> `TableModel`
- `runtime.table` -> `runtime.model.table`

这是语义对齐，不是行为改造。

## 9.7 `createRecord` 并入 `workflow`

最终建议：

- `session.creation` 删除
- `createRecord/` 一级目录删除
- 变成 `workflow.createRecord`

如果后面类似流程变多，可以继续扩成：

- `workflow.records.createAndOpen`

## 9.8 `store.ts` 改名并且不再外漏

当前 `store.ts` 只是 controller helper，不应该成为 public runtime surface。

最终建议：

- 改名到 `session/controller.ts`
- 停止从 React 直接 import
- 如果需要跨包复用，优先上提到 `@shared/core`

## 9.9 `createEngineSource.ts` 做简单拆分

建议做最基础的拆分：

- document source
- active source
- patch helper

而不是引入更抽象的 runtime graph 或 phase framework。

## 9.10 删掉 `session.store` 聚合层

最终建议：

- 删除 `DataViewSessionState`
- 删除 `session.store`

因为这层只是把多个 controller 状态再拼一次，没有稳定职责。

React 直接订阅：

- `session.page.store`
- `session.selection.state.store`
- `session.inline.store`
- `session.valueEditor.store`
- `session.marquee.store`

就够了。

## 9.11 去掉 wildcard export

`package.json` 里的：

- `"./*": "./src/*"`

应删除。

最终原则应改成：

- 默认只导出 `"."`
- `selection` 只有在确认它要作为独立通用模块跨包复用时，才保留 `"./selection"`

除了这个可选例外，不建议继续暴露：

- `"./source"`
- `"./model"`
- `"./workflow"`
- `"./valueEditor"`
- `"./inlineSession"`
- `"./marquee"`
- `"./page/*"`
- `"./store"`

也就是说，去掉 wildcard export 之后，不是把所有内部目录改成“显式子入口”，而是反过来把 package 边界收口到 root。

内部 helper 不再导出，内部目录可以自由整理。

## 9.12 停止跨包依赖 runtime 内部文件

像下面这种依赖必须清掉：

- `dataview-react` -> `@dataview/runtime/store`

还包括这类深路径依赖：

- `dataview-react` -> `@dataview/runtime/dataview/runtime`
- `dataview-react` -> `@dataview/runtime/page/session/types`
- `dataview-react` -> `@dataview/runtime/table`

最终应尽量收敛成：

- `@dataview/runtime`
- 可选的 `@dataview/runtime/selection`

否则 runtime 无法自由整理目录。

## 10. 建议实施顺序

## 阶段 1：先整理 runtime public surface

- 保留 `runtime.engine`
- 删除 `intent`
- 删除 `session.creation`
- 新增 `workflow.createRecord`
- 删除 `runtime.table`
- 新增 `runtime.model.table`
- 删除 `session.store`

## 阶段 2：清理 source / session / model 边界

- `source` 改回纯 `EngineSource`
- 删除 `source.selection`
- 删除 `source.inline`
- 删除 `page/state`
- page model 吸收 route normalization
- `currentView` 改成统一消费 `active.view.current`

## 阶段 3：整理目录和 package boundary

- `table/runtime.ts` -> `model/table.ts`
- `createRecord` -> `workflow/createRecord.ts`
- `store.ts` -> `session/controller.ts`
- `model/internal` 删除
- `createEngineSource.ts` 按 document/active 拆分
- 删除 wildcard export
- 清掉 React 对 runtime 内部文件的 import
- package export 收口到 root-only，`selection` 仅在明确需要时保留单独入口

## 11. 最终判断

`dataview-runtime` 下一步最该做的，不是继续讨论“要不要把所有命令都包起来”，而是把它自己内部整理干净。

最重要的三件事是：

- 让 `source` 重新变纯
- 让 `session / workflow / model` 三类职责分开
- 删掉 page/table/createRecord 这些语义错位和多余中间层

另外一个必须同步完成的收口是：

- package export 不再镜像内部目录，默认只保留 root API

一句话概括最终形态：

- `engine` 继续做 domain command
- `runtime` 做 UI projection、UI session、少量 UI workflow、UI model
- `react` 做 DOM 和交互接线

这条路线比“强推 runtime 成为唯一写边界”更轻，也更符合长期最优。
