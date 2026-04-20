# Dataview API 与类型收口评审

## 目标

这份文档只回答一件事:

- 现在 `dataview` 各包的 API 与类型，哪些适合删减、复用、合并、模块化、命名缩短

本文不改代码，只作为下一轮收口的依据。

## 盘点范围

本次盘点覆盖:

- `dataview-core`
- `dataview-engine`
- `dataview-runtime`
- `dataview-react`
- `dataview-table`

盘点方式:

- 看 package exports 与根入口
- 看各包 `index.ts` 与主要 barrel
- 看高导出密度文件
- 看高频类型后缀: `Api / State / Runtime / Result / Options / Input / Spec / Projection / Delta`
- 看最近已完成 namespace 化后的实际形态，判断哪些地方仍未收口

## 盘点结果

### 1. 导出体量仍然偏大

按 `src` 下 `export` 粗统计:

- `dataview-core`: 487
- `dataview-engine`: 336
- `dataview-runtime`: 167
- `dataview-react`: 614
- `dataview-table`: 29

这说明:

- `core` 与 `react` 仍然是导出面最宽的两个包
- 现在的问题已经不只是命名，而是出口组织方式本身过宽

### 2. 类型后缀高度集中，说明“层”和“壳”过多

高频后缀统计:

- `Api`: 31
- `State`: 30
- `Runtime`: 19
- `Result`: 17
- `Input`: 17
- `Options`: 16
- `Spec`: 15
- `Projection`: 10
- `Delta`: 7
- `Context`: 7

这说明:

- 很多类型是在描述“同一对象在不同阶段的壳”
- 存在明显的 layering 膨胀
- 不是每一层都值得有独立命名类型

### 3. 当前导出最宽的热点文件

高导出数文件:

- `dataview-engine/src/contracts/public.ts`: 70
- `dataview-core/src/contracts/state.ts`: 56
- `dataview-core/src/field/kind/date.ts`: 32
- `dataview-core/src/view/state.ts`: 25
- `dataview-engine/src/active/index/contracts.ts`: 23
- `dataview-core/src/calculation/reducer.ts`: 23
- `dataview-engine/src/contracts/internal.ts`: 21
- `dataview-runtime/src/index.ts`: 19
- `dataview-core/src/filter/spec.ts`: 18

这些文件基本就是本轮收口的主战场。

### 4. 仍有 `export *` 风格的宽口 barrel

当前明显的宽口入口:

- `dataview-core/src/view/index.ts`
- `dataview-core/src/document/index.ts`
- `dataview-core/src/field/options/index.ts`
- `dataview-engine/src/index.ts`

其中最大问题是:

- `view/index.ts` 仍然是完整平铺出口
- 这和已经完成 namespace 化的 `field/filter/calculation/document` 风格不一致

## 总体结论

### 1. 下一轮收口重点不该再是零散 helper，更该是“入口宽度”与“类型分层”

当前真正的问题是:

- 入口过宽
- 同一语义跨包重复命名
- 一组能力被拆成多层轻壳
- 根包与子包的 type re-export 太多

所以后续优先级应该是:

1. 收窄 barrel
2. 明确类型 owner
3. 合并轻壳类型
4. 最后再做命名压缩

### 2. 已经收口好的方向要继续扩展

目前相对好的模式是:

- `document.fields.get`
- `field.group.entries`
- `filter.rule.match`
- `calculation.reducer.entry.create`
- `query.fields.available.sortAt`

共同点:

- 顶层是名词 owner
- 第二层是职责
- 动词只留在局部

下一轮应该把同样的模式扩展到:

- `view`
- `search`
- `sort`
- `runtime`
- `table`

## 可删减项

### A. 可直接删的类型别名

这些类型本质上只是重命名，没有提供新的语义边界:

- `ValueEditorSession = OpenValueEditorInput`
- `HistoryActionResult = CommitResult`
- `FilterConditionProjection = FilterConditionProjectionCore`

这类别名的问题:

- 用户会误以为它们是不同阶段对象
- 实际只是同一结构被重复命名

建议:

- 若没有额外字段与约束，直接删除别名
- 如果确实代表不同生命周期，就让结构真正分化，而不是继续同构别名

### B. 可删的重复 re-export

这些不该继续在上层重复转发:

- `engine/contracts/public.ts` 对大量 `core/contracts` 的再导出
- `react/dataview/index.ts` 对大量 `runtime` 类型的再导出
- `react/src/index.ts` 对大量 `runtime` 类型的再导出

建议:

- domain data type 只从 `@dataview/core/contracts` 取
- runtime/session/controller/model type 只从 `@dataview/runtime` 取
- react 只导出 react 自己的 props、hooks、context type

也就是说:

- 不要让 `react` 变成 `runtime` 的第二个类型入口
- 不要让 `engine` 变成 `core` 的第二个 domain 类型入口

### C. 可删的平铺辅助出口

当前已经有统一 namespace 时，这些平铺出口不值得继续保留为对外推荐路径:

- `core/view/index.ts` 的整包 `export *`
- `core/document/index.ts` 中的 `export * from document/table`
- `core/field/options/index.ts` 中的 `export * from options/spec`

建议:

- 外部调用尽量只走 namespace 入口
- 子实现文件若仍需直出，只保留极少数明确的低层入口

## 可复用项

### A. `view` 下的状态变更函数应复用 namespace，而不是继续平铺

现在 `view/index.ts` 仍然把这些函数平铺出来:

- `showDisplayField`
- `hideDisplayField`
- `setTableWrap`
- `setGalleryCardLayout`
- `reorderViewOrders`
- `resolveUniqueViewName`

这些都已经足够形成稳定子域:

- `view.display.*`
- `view.order.*`
- `view.layout.table.*`
- `view.layout.gallery.*`
- `view.layout.kanban.*`
- `view.name.*`
- `view.calc.*`
- `view.repair.*`

建议:

- `view` 成为下一个完整 namespace 化的核心入口
- 不再继续扩展平铺 `view/*`

### B. `search` 与 `sort` 仍然是“半收口”

`search/index.ts` 与 `sort` 相关模块还保留很多平铺函数。

建议方向:

- `search.tokens.buildField`
- `search.tokens.buildRecord`
- `search.text.join`
- `search.text.split`
- `search.match.record`

- `sort.rules.*`
- `sort.compare.*`
- `sort.fields.*`

目标不是把一切都塞进一个巨对象，而是:

- 避免继续记忆一堆平铺长函数名
- 让 owner 稳定

### C. `table` 包已经有对象雏形，但还不够统一

当前:

- `gridSelection` 是对象
- `cellNavigation` 是对象
- `fill` 是对象
- `paste` 是对象
- `reorder` 还是多个平铺函数
- `keyboard` 也是多个平铺函数

建议统一成:

- `table.selection.*`
- `table.navigation.*`
- `table.fill.*`
- `table.paste.*`
- `table.reorder.*`
- `table.keyboard.*`

也就是:

- `table` 包可以直接成为小型工具域，而不是半平铺半对象

## 可合并项

### A. runtime selection 的接口层级过细

当前 selection 相关类型:

- `SelectionCommandApi`
- `SelectionQueryApi`
- `SelectionEnumerateApi`
- `SelectionController`
- `SelectionControllerInstance`
- `SelectionDomainSource`
- `SelectionScope`
- `SelectionSnapshot`

问题:

- 对外理解成本偏高
- controller / instance / source / scope 的边界太碎
- 同一能力被拆成多个轻壳

建议:

- `SelectionControllerInstance` 合并进 controller 生命周期返回值
- `command/query/enumerate` 收敛为更紧凑的 `selection.write / selection.read / selection.list`
- `SelectionDomainSource` 若只用于内部 wiring，应转 internal

不建议把 selection 做成泛型大全家桶的复杂抽象。
建议是收掉壳，不是增加抽象层。

### B. runtime value editor 类型可压缩

当前:

- `OpenValueEditorInput`
- `ValueEditorSession`
- `ValueEditorApi`
- `ValueEditorController`
- `ValueEditorResult`
- `ValueEditorSessionPolicy`
- `CloseValueEditorOptions`

问题:

- `Session` 与 `OpenInput` 同构
- `Api` 与 `Controller` 差异只多了 store
- `Policy` / `Result` / `CloseOptions` 都是很轻的局部类型

建议:

- 删除 `ValueEditorSession = OpenValueEditorInput`
- `ValueEditorController` 作为唯一主要对外类型
- 将 `Policy / Result / CloseOptions / OpenInput` 放入 `valueEditor.types` 的局部子域，避免全局漂浮

### C. page session 状态可以再压缩一层

当前:

- `QueryBarState`
- `SettingsState`
- `PageSessionState`
- `PageState`

问题:

- `PageState extends PageSessionState`，语义区分很弱
- `session state` 与 `page ui state` 差异只有少数补充字段

建议:

- 收敛成一个主类型，例如 `PageUiState`
- 或者保留 `PageState` 为唯一主类型，`PageSessionState` 转为内部构造类型

### D. engine 内部 stage delta 结构有合并空间

当前:

- `QueryDelta`
- `SectionDelta`
- `SummaryDelta`
- `ViewRuntimeDelta`

它们有明显共性:

- 都在描述阶段差异
- 都有 `rebuild` / `changed` / `removed` / `orderChanged` 这类重复结构

建议:

- 不要做过度泛型化
- 但可以统一到 `stage.query.delta / stage.section.delta / stage.summary.delta`
- 或抽出一个很薄的共享 shape，例如 `StageDeltaBase`

重点不是泛型炫技，而是减少“同义不同名”的重复定义。

## 可模块化项

### A. `view` 应该成为下一轮最优先的 namespace 目标

当前 `view/index.ts` 仍是整包平铺。

建议目标:

```ts
view.name.unique(...)
view.display.replace(...)
view.display.show(...)
view.display.hide(...)
view.order.normalize(...)
view.order.reorder(...)
view.layout.table.widths.set(...)
view.layout.table.wrap.set(...)
view.layout.gallery.size.set(...)
view.layout.kanban.cardsPerColumn.set(...)
view.calc.metric.set(...)
view.repair.forRemovedField(...)
view.repair.forConvertedField(...)
```

这是本轮最值得继续收的核心域。

### B. `runtime` 根入口应该收窄，不该继续超级平铺

当前 `runtime/src/index.ts` 把:

- session
- selection
- marquee
- valueEditor
- model
- page state

全部平铺到根入口。

建议:

- 根入口只保留最核心的 `createDataViewRuntime`
- 其余走模块入口:
  - `runtime.page.*`
  - `runtime.selection.*`
  - `runtime.editor.*`
  - `runtime.marquee.*`
  - `runtime.model.*`
  - `runtime.query.fields.*`

也就是说:

- `runtime` 应该像一个系统名词
- 不应该像一个大杂烩 root barrel

### C. `react` 根入口也应该收窄

当前 `react/src/index.ts` 同时承担:

- 组件入口
- provider 入口
- meta 入口
- runtime 类型转发入口

建议:

- `@dataview/react` 只暴露 UI 与 hooks
- runtime types 不再由 react 根入口转发
- provider 相关单独走 `react/dataview`
- 视图组件单独走 `react/views/*`

最终方向:

- 组件从 react 取
- session/runtime/model/controller type 从 runtime 取
- domain type 从 core/contracts 取

### D. `engine` 的 public contracts 应该拆域，而不是继续堆一个大文件

`engine/contracts/public.ts` 当前是最大热点。

建议按职责拆成:

- `engine/contracts/api`
- `engine/contracts/source`
- `engine/contracts/view`
- `engine/contracts/layout`
- `engine/contracts/change`
- `engine/contracts/history`
- `engine/contracts/perf`

理由:

- `public.ts` 已经同时承载 API、source、projection、layout、delta、history、perf
- 这不是一个文件该有的职责密度

## 命名缩短建议

### 1. 删除已知 owner 后的重复前缀

原则:

- 进入 owner 之后，名字不再重复 owner

例子:

- `view.display.show` 好过 `showDisplayField`
- `view.order.reorder` 好过 `reorderViewOrders`
- `field.option.spec.get` 好过 `getFieldOptionSpec`
- `selection.read.contains` 好过 `SelectionQueryApi.contains`

### 2. 类型名尽量不要同时带 package 前缀和域前缀

现在很多名字同时带了两个 owner:

- `DataViewTableModel`
- `DataViewGalleryModel`
- `DataViewKanbanModel`
- `DataViewRuntime`
- `DataViewSessionState`

如果类型已经从明确模块导出，前缀可以缩短为:

- `TableModel`
- `GalleryModel`
- `KanbanModel`
- `Runtime`
- `SessionState`

前提:

- import path 本身已经提供 owner

### 3. `Input / Options / Spec / Config / Patch / State` 需要严格分工

建议统一语义:

- `Input`: 单次调用入参
- `Options`: 用户可配置项
- `Spec`: 行为注册表或规则能力描述
- `Patch`: 局部写入
- `State`: 持久状态或运行时状态

当前有些类型虽然还能看懂，但语义混用明显。

### 4. `Projection` 只保留给“发布给 UI 的派生只读结构”

当前 `Projection` 用法基本合理，但还可以更严格:

- `Projection` 只用于 engine/runtime 对 UI 的只读派生结构
- 不要再让内部 state、store source、ui model 都各自再叫 projection

### 5. `Result` 只保留给一次性返回值

不建议:

- 把长期可持有对象也命名为 `Result`

建议:

- 一次性动作结果叫 `Result`
- 长生命周期对象叫 `State / Controller / Session / Runtime`

## 按包的收口建议

### dataview-core

优先级最高:

- 收 `view`
- 收 `search`
- 收 `sort`

明确问题:

- `view/index.ts` 仍然整包平铺
- `field/options/index.ts` 仍然公开 spec 子实现
- `contracts/index.ts` 继续承担“所有类型总入口”

建议:

- `contracts` 只保留真正稳定的 domain type 汇总
- 其余行为型 type 按模块 owner 暴露

### dataview-engine

优先级最高:

- 拆 `contracts/public.ts`
- 拆 `contracts/internal.ts`
- 统一 `ViewState / ActiveSource / ViewPublishDelta / ViewRuntimeDelta` 的命名边界

明确问题:

- engine 对外面向“调用者”的类型和面向“阶段内部”的类型混在一起
- stage delta 与 public publish delta 之间语义层级还不够清晰

建议:

- internal 只保留阶段缓存与同步结构
- public 只保留对外可消费结构
- core domain type 不要再从 engine 重复转发

### dataview-runtime

优先级最高:

- 收根入口
- 合并 selection/valueEditor/page 这些轻壳类型

明确问题:

- runtime 根入口扁平过宽
- selection / editor / page 都存在“1 个实体拆出 4 到 7 个类型壳”的问题

建议:

- runtime 做“系统入口”
- 细分功能走模块 owner

### dataview-react

优先级最高:

- 缩 root exports
- 删 runtime type 的再转发
- 统一视图 runtime 命名

明确问题:

- react 根入口现在同时承担 UI、provider、meta、runtime type forwarding
- 容易让调用方分不清类型 owner

建议:

- UI component / hook 留在 react
- runtime/controller/model type 回 runtime

### dataview-table

优先级中等:

- 当前体量小，问题不严重
- 但入口风格不统一

建议:

- 统一成 `table.xxx` 风格
- 不再混用对象与平铺函数

## 不建议做的事

### 1. 不建议做全局 `read/get/resolve/build` 顶级工具箱

原因:

- 这会重新把领域 API 打散成语法前缀桶
- 会比现在更难收敛 owner

### 2. 不建议做泛型化过重的“统一 stage framework”

例如把 query/section/summary 的所有 state/delta 都抽成复杂泛型框架。

原因:

- 会降低可读性
- 对性能主流程帮助有限
- 对调试和 flamegraph 理解反而更差

建议:

- 只抽共享 shape
- 不抽复杂抽象框架

### 3. 不建议再让 react 继续承担 runtime 类型门面

原因:

- owner 混乱
- import path 冗余
- 容易形成第三套“看起来像官方入口”的重复入口

## 建议的落地顺序

### 第一阶段

- 停止新增平铺 API
- 所有新增出口必须带 owner namespace

### 第二阶段

- 收 `core/view`
- 收 `runtime` 根入口
- 收 `react` 根入口

### 第三阶段

- 拆 `engine/contracts/public.ts`
- 拆 `engine/contracts/internal.ts`
- 清理 core/runtime/react 的重复 type re-export

### 第四阶段

- 合并 selection/valueEditor/page 轻壳类型
- 删除纯别名类型
- 再统一命名缩短

## 本文的最终判断

下一轮不该继续盯着零散 helper。

真正的收口主线应该是:

1. 收窄 root barrel
2. 明确类型 owner
3. 合并轻壳类型
4. 将 `view` 补齐为和 `field/filter/calculation/document/query.fields` 同级的 namespace 域

如果只做局部命名清理，而不处理这四点，整体复杂度不会明显下降。
