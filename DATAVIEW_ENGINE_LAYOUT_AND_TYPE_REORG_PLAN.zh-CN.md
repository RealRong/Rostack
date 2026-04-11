# Dataview Engine 目录与类型重排研究方案

## 1. 目标

这份文档只回答三个问题：

1. `dataview/src/engine` 当前文件排布是否值得重排。
2. 各类类型文件是否应该重新归位，包括实现文件内部声明的类型。
3. 哪些类型可以简化、合并，哪些“中间层类型”应该直接去掉。

本文只给方案，不涉及代码改动。


## 2. 结论摘要

我的结论是：值得重排，而且收益主要不在“少几个文件”，而在于收掉几层当前没有长期价值的概念折返。

当前最明显的问题不是单点代码质量，而是三类结构性摩擦：

- `engine` 目录同时按“生命周期”“职责面”“对外 API”三种维度混排，顶层语义不稳定。
- 投影类类型放在 `core/filter|group|search|sort`，但真正的生产者和消费者其实在 `engine/project` 与 `react`，导致层次倒挂。
- 有一批只做重命名或轻包装的类型层，例如 `FilterView` / `GroupView` / `SearchView` / `SortView`、`Schema`，它们没有提供新的领域语义，反而增加跳转。

整体上，我建议的方向不是“继续抽象”，而是：

- 保留真正有领域意义的类型别名。
- 删除纯重命名中间层。
- 把共享契约移到真正拥有它的模块。
- 把只在单文件内服务实现的类型收回实现文件，不再塞进总 `types.ts`。


## 3. 当前结构观察

### 3.1 顶层目录按多个维度混排

当前 `dataview/src/engine` 顶层主要包含：

- `command`
- `derive`
- `index`
- `instance`
- `perf`
- `project`
- `services`
- `state`
- `viewmodel`
- `write`
- `types.ts`
- `api.ts`

这里混了至少五种不同维度：

- 写入命令解析：`command`
- 派生索引：`index`
- 投影运行时：`project`
- 对外 facade：`services`
- store / selector / commit：`state`、`write`
- 公共导出：`api.ts`、`types.ts`

结果是：看目录名时，并不能稳定推断“它是领域模块、运行时模块、public API 还是 glue code”。


### 3.2 几个热点文件已经说明边界还没完全收口

当前 `engine` 中最大的几个文件是：

- `dataview/src/engine/command/commands/view.ts`：`705` 行
- `dataview/src/engine/services/view.ts`：`695` 行
- `dataview/src/engine/services/viewCommands.ts`：`592` 行
- `dataview/src/engine/command/field/resolve.ts`：`571` 行
- `dataview/src/engine/types.ts`：`521` 行
- `dataview/src/engine/project/publish/view.ts`：`471` 行
- `dataview/src/engine/write/commit.ts`：`462` 行

这些文件长并不是原罪，问题是它们都在承担“跨层拼装”：

- `services/view.ts` 与 `services/viewCommands.ts` 负责高层 view 操作语义。
- `command/commands/view.ts` 又负责一整套 view patch / validate / clone / operation resolve。
- `project/publish/view.ts` 同时包含多个投影构造与 equality/reuse。
- `engine/types.ts` 承担 public api、trace、perf、history、project stores、view 子 API 等多种契约。

这说明现在更需要的是重新收边界，而不是继续局部拆小。


### 3.3 类型文件本身也存在“归属权不清”

当前几个最值得关注的类型文件：

- `dataview/src/core/contracts/state.ts`：`304` 行
- `dataview/src/core/contracts/commands.ts`：`208` 行
- `dataview/src/engine/types.ts`：`521` 行
- `dataview/src/engine/index/types.ts`：`117` 行
- `dataview/src/engine/project/runtime/state.ts`：`114` 行
- `dataview/src/engine/project/model.ts`：`51` 行
- `dataview/src/engine/viewmodel/types.ts`：`23` 行

此外还有一组很关键但位置不理想的投影类型：

- `dataview/src/core/filter/types.ts`
- `dataview/src/core/group/types.ts`
- `dataview/src/core/search/types.ts`
- `dataview/src/core/sort/types.ts`

这四个文件定义的是：

- `ViewFilterProjection`
- `ViewGroupProjection`
- `ViewSearchProjection`
- `ViewSortProjection`

它们本质上不是“core 领域原型”，而是“engine 发布给 UI 的读模型”。


## 4. 当前最核心的结构问题

### 4.1 `services` 与 `command` 之间存在同一概念的双重表达

最典型的是 view 写语义：

- `dataview/src/engine/services/view.ts`
- `dataview/src/engine/services/viewCommands.ts`
- `dataview/src/engine/command/commands/view.ts`

这三块并不是简单的薄转译关系，而是共同知道：

- view filter
- view sort
- view group
- view display
- view options
- manual order

这会带来两个长期问题：

- 同一语义在不同层重复演化。
- 一旦补规则，很容易不确定该补在哪一层。

我的判断是：

- `services` 应该是 facade，负责读取上下文、组合动作、组织高阶命令。
- `command` 应该是权威写语义层，负责校验、归一化、转 operation。
- 二者都不应该各自完整拥有一套 view 语义实现。


### 4.2 `derive` 是可删的过渡层

当前：

- `derive/index.ts` 负责 index derive orchestration。
- `derive/project.ts` 负责 project derive orchestration。

但这两块又分别只是：

- 包一层 `index/*`
- 包一层 `project/runtime/*`

从长期结构上看，`derive` 不是稳定领域目录，更像历史过渡层。它的存在让人误以为这里有第三套语义层，实际没有。

我的建议是：

- 删除 `derive` 目录。
- 把 index derive 逻辑并回 `engine/index/runtime.ts` 或 `engine/index/derive.ts`。
- 把 project derive 逻辑并回 `engine/project/runtime.ts` 或 `engine/project/run.ts`。


### 4.3 `viewmodel` 命名过宽，且内部类型层过薄

`viewmodel` 现在主要包含：

- `field.ts`
- `appearances.ts`
- `sections.ts`
- `move.ts`
- `types.ts`
- `equality.ts`

但它实际上并不是完整 VM 层，而是：

- appearance / field 引用工具
- section/appearance 辅助读取
- 移动规划 helper

尤其 `viewmodel/types.ts` 只有：

- `Schema`
- `Placement`
- `Plan`

其中：

- `Schema` 只是在包一层 `ReadonlyMap<FieldId, Field>`。
- `Placement` 与 `Plan` 只服务 `move.ts` 这类重排辅助。

这类结构不值得单独维持一个“viewmodel types 层”。


### 4.4 `project/model.ts` 其实不是 model，而是 published read model

`project/model.ts` 现在定义：

- `AppearanceId`
- `SectionKey`
- `SectionBucket`
- `Appearance`
- `Section`
- `AppearanceList`
- `FieldList`

这里有两个命名问题：

1. `model.ts` 容易让人以为它是 project runtime 的内部核心状态，其实它更接近 published read model。
2. `AppearanceList` / `FieldList` 不是纯数据 model，而是带方法的只读集合对象。

这意味着它更适合被放在：

- `project/published.ts`
- 或 `project/readModels.ts`
- 或 `project/publish/types.ts`

而不是一个泛泛的 `model.ts`。


### 4.5 projection 类型放在 `core/*/types.ts` 是分层倒挂

例如：

- `core/filter/types.ts` 里有 `FilterRuleProjection`、`ViewFilterProjection`
- `core/group/types.ts` 里有 `ViewGroupProjection`
- `core/search/types.ts` 里有 `ViewSearchProjection`
- `core/sort/types.ts` 里有 `ViewSortProjection`

但这些类型有明显的 UI/read-model 特征：

- 带 `viewId`
- 带 `fieldLabel`
- 带 `active`
- 带 `conditions`
- 带 `editorKind`

这些信息不是 core 领域规则本身，而是 publish 之后的读取投影。

因此更合理的归属应是：

- `engine/project/publish/viewTypes.ts`
- 或 `engine/project/readModels/view.ts`

`core/filter|group|search|sort` 应该只保留：

- 领域函数
- normalize
- equality
- write helper
- spec / behavior

不应继续持有 UI 投影契约。


### 4.6 命名上仍有一层“property / field”历史混用

例如：

- `createPropertyId`
- `resolvePropertyCreateCommand`
- `resolvePropertyPatchCommand`
- `resolvePropertyOptionUpdateCommand`

但对外命令和大多数契约使用的是 `customField` / `field`。

这层命名映射本身就是一种中间层，虽然不是类型文件，但它会放大类型理解成本：

- 阅读者需要反复确认 property 是否等于 customField。
- 函数名与命令名不一致，影响 grep 和导航。

这部分不一定要立刻改实现，但在目录和类型重排时，应该把命名一起收口。


## 5. `engine` 目录重排建议

## 5.1 我建议的重排原则

- 顶层只保留稳定的一层职责分类。
- 不把“中转胶水层”长期保留为一级目录。
- public API 与 internal runtime 分开。
- feature-specific 类型尽量跟 feature 走，不再集中堆在总 `types.ts`。


## 5.2 保守版目标布局

这是我更推荐优先落地的版本，改动范围相对可控：

```text
dataview/src/engine
  api/
    createEngine.ts
    index.ts
    public/
      engine.ts
      history.ts
      perf.ts
      project.ts
      services.ts
  command/
    index.ts
    context.ts
    issues.ts
    resolveWriteBatch.ts
    field/
    commands/
  index/
    demand.ts
    state.ts
    records/
    search/
    group/
    sort/
    calculations/
    runtime.ts
  project/
    runtime/
      run.ts
      query/
      sections/
      calc/
    publish/
    readModels.ts
    equality.ts
  facade/
    fields.ts
    records.ts
    views.ts
    view/
      index.ts
      commands.ts
      items.ts
      order.ts
  store/
    state.ts
    selectors.ts
  write/
    apply.ts
    commit.ts
    translate.ts
  perf/
  history.ts
```

对应当前目录的大致映射：

- `services` -> `facade`
- `state/index.ts` + `state/select.ts` -> `store/state.ts` + `store/selectors.ts`
- `instance/create.ts` -> `api/createEngine.ts`
- `derive` -> 删除，合并进 `index/runtime.ts` 与 `project/runtime/run.ts`
- `project/model.ts` -> `project/readModels.ts`
- `viewmodel` -> 并入 `project` 或 `facade/view`


## 5.3 长期最优版目标布局

如果完全按语义来命名，我认为长期更清晰的是把 `project` 明确改成 `projection`：

```text
dataview/src/engine
  api/
  command/
  facade/
  index/
  projection/
    runtime/
    publish/
    readModels.ts
  store/
  write/
  perf/
  history.ts
```

原因很简单：

- 当前 `project` 在代码里指的是“从文档和索引投影出来的当前视图读状态”。
- 这个概念其实就是 projection，不是一般意义上的 project。

但这个命名调整会影响非常多 import 路径，所以我建议它属于第二阶段，不是第一阶段。


## 5.4 对几个现有目录的具体判断

### `services`

建议改名为 `facade` 或 `apiFacade`。

原因：

- 它不是基础 service 层。
- 它本质是高层操作入口。
- `view.ts` 里大量逻辑依赖 current projection、appearance、section、group write context，这更像 facade，不像 service。


### `derive`

建议删除。

原因：

- 没有独立领域语义。
- 只是 orchestration 过渡层。
- 保留它会让 index/project 的真实入口更难找。


### `viewmodel`

建议拆散，不保留为一级概念目录。

更合理的归位方式：

- `field.ts` -> `project/refs.ts`
- `appearances.ts` + `sections.ts` -> `project/readHelpers.ts`
- `move.ts` -> `facade/view/movePlan.ts` 或 `project/reorder.ts`
- `types.ts` -> 删除，类型内联或并到相邻文件


### `state`

建议重命名为 `store`。

原因：

- 当前仓内已经有很多 `state.ts`，`engine/state` 这个名字过于泛。
- 这里存放的是 engine root store，不是某个 feature 的 state 领域。


### `project/publish/view.ts`

建议按投影子域拆开，而不是继续纵向堆在一个文件里。

推荐拆分为：

- `publish/activeView.ts`
- `publish/filter.ts`
- `publish/search.ts`
- `publish/sort.ts`
- `publish/group.ts`
- `publish/fields.ts`
- `publish/index.ts`

这样做的目的不是追求碎文件，而是让“投影构造”和“引用复用规则”对齐到同一子域里。


### `command/commands/view.ts`

建议至少拆成四块：

- `view/validate.ts`
- `view/patch.ts`
- `view/create.ts`
- `view/resolve.ts`

当前文件同时拥有：

- equality
- clone
- validate
- patch apply
- create defaults
- resolve to operations

这些逻辑都属于 view 命令域，但不应该继续揉成单个 700 行文件。


### `command/field/resolve.ts`

建议拆成：

- `field/create.ts`
- `field/patch.ts`
- `field/options.ts`
- `field/effects.ts`
- `field/resolve.ts`

并顺手统一 `property` 命名到 `field` / `customField`。


## 6. 类型文件重排建议

## 6.1 `core/contracts/state.ts` 应拆，但不要过度拆

这个文件当前同时装着：

- 各类 ID
- enum-like union
- field schema
- record
- filter/search/sort/group
- view
- document

建议拆成：

```text
core/contracts/
  ids.ts
  field.ts
  record.ts
  view.ts
  document.ts
  commands.ts
  delta.ts
  operations.ts
  index.ts
```

建议保留单个 `index.ts` 作为对外 barrel。

不建议再继续拆成“一种 field 一个文件”，原因是：

- 字段 schema 之间天然属于同一张 discriminated union。
- 拆太散会恶化阅读与维护。


## 6.2 `core/contracts/commands.ts` 不必继续膨胀

这个文件现在问题不在行数，而在它对 view 细节知道得太多。

建议：

- 保留 command union 本身。
- 但把 `ViewPatch`、`ViewCreateInput` 这种强耦合 view 契约，和 `View` 相关类型一起放到 `core/contracts/view.ts`，`commands.ts` 只引用。

这样可以把：

- 领域实体契约
- 命令输入契约

分开归属，而不是都堆在命令文件里。


## 6.3 `engine/types.ts` 必须拆

这是当前最该拆的类型文件。

它现在混有：

- engine public api
- history api
- perf api
- project store api
- commit trace / perf stats
- view child apis
- high-level command results

建议拆分为：

```text
engine/api/public/
  engine.ts
  command.ts
  project.ts
  history.ts
  perf.ts
  services.ts
```

拆分原则：

- 面向调用者的公共 API 契约放一起。
- trace/perf 与主 engine api 分开。
- history 与 document api 分开。
- view child api 单独成组。

`engine/api.ts` 只做 re-export，不再承载“大而全”的类型入口。


## 6.4 `engine/index/types.ts` 应收回 feature 本地

当前 `engine/index/types.ts` 同时包含：

- demand
- record index
- search index
- group index
- sort index
- calculations index
- aggregate state
- field context

建议改成：

```text
engine/index/
  demand.ts
  state.ts
  records/types.ts
  search/types.ts
  group/types.ts
  sort/types.ts
  calculations/types.ts
  aggregate.ts
```

其中：

- `IndexState` 留在 `index/state.ts`
- 各 feature index 的细节类型放回 feature 自己目录
- `AggregateState` 可以继续和 `aggregate.ts` 同处一个模块，不必单独包装


## 6.5 `engine/project/runtime/state.ts` 需要拆成“published”和“internal”

这个文件当前混在一起的东西有：

- published `ProjectState`
- internal `QueryState`
- internal `SectionState`
- internal `CalcState`
- root `ProjectionState`

建议拆成：

```text
engine/project/runtime/
  published.ts
  query/state.ts
  sections/state.ts
  calc/state.ts
  projection.ts
```

这会直接减少两个误导：

- `ProjectState` 不是 query/section/calc 内部 state。
- `ProjectionState` 不是对外 published state。


## 6.6 `project/model.ts` 建议改名为 `readModels.ts`

我建议把：

- `Appearance`
- `AppearanceList`
- `FieldList`
- `Section`
- `SectionBucket`

统一放到 `project/readModels.ts`。

如果还要再精确一点，可以拆为：

- `project/readModels/appearance.ts`
- `project/readModels/section.ts`
- `project/readModels/fieldList.ts`

但第一阶段没有必要。


## 6.7 `viewmodel/types.ts` 建议直接删除

这个文件过薄，且里面至少有一个明显可删的中间层：

- `Schema`

建议：

- `Placement` / `Plan` 并回 `move.ts`
- `Schema` 直接删除，改用更直接的类型表达


## 6.8 projection 类型从 `core/*/types.ts` 移到 `engine/project`

我建议把下面这些类型整体迁出 `core`：

- `FilterConditionProjection`
- `FilterRuleProjection`
- `ViewFilterProjection`
- `ViewGroupProjection`
- `ViewSearchProjection`
- `SortRuleProjection`
- `ViewSortProjection`

推荐落点：

```text
engine/project/readModels/
  filter.ts
  group.ts
  search.ts
  sort.ts
```

或者：

```text
engine/project/publish/viewTypes/
  filter.ts
  group.ts
  search.ts
  sort.ts
```

这样 `core/filter|group|search|sort` 就可以回到纯领域层。


## 7. 类型简化、合并与去中间层建议

## 7.1 应该删掉的“纯重命名别名”

这些类型现在没有新增语义，只是换了个名字：

- `FilterView = ViewFilterProjection`
- `GroupView = ViewGroupProjection`
- `SearchView = ViewSearchProjection`
- `SortView = ViewSortProjection`
- `Schema = { fields: ReadonlyMap<FieldId, Field> }`

建议：

- 全部删除。
- 直接使用原始投影类型，或者在迁移后使用新的 `readModels/*` 类型。
- `Schema` 直接用 `ReadonlyMap<FieldId, Field>` 或一个更准确的 `FieldLookup`。


## 7.2 应该保留的语义别名

不是所有别名都该删。

我建议保留：

- `RecordId`
- `ViewId`
- `CustomFieldId`
- `FieldId`
- `AppearanceId`
- `SectionKey`

虽然它们底层都是 `string`，但这些别名提供了真实的领域语义边界。删掉之后，API 会更难读，而不是更简单。


## 7.3 `FieldList` / `AppearanceList` 可以改名，但不建议先内联

它们当前有一个命名精度问题：

- `FieldList` 其实是“当前视图可见字段集合”，不是全部字段。
- `AppearanceList` 其实是“当前投影视图里的可见 appearance 集合”，不是任何 appearance 的通用列表。

如果要提高清晰度，更准确的命名会是：

- `VisibleFieldList`
- `VisibleAppearanceList`

但这类名字变更会波及 `react` 较多文件，所以我建议：

- 第一阶段先改文件归属。
- 第二阶段再评估是否重命名。


## 7.4 `SectionBucket` 这种薄包装可以保留为 type，不必再用 interface

当前：

```ts
export interface SectionBucket extends Pick<Bucket, 'key' | 'title' | 'value' | 'clearValue' | 'empty' | 'color'> {}
```

这类类型更适合直接写成：

```ts
export type SectionBucket = Pick<Bucket, 'key' | 'title' | 'value' | 'clearValue' | 'empty' | 'color'>
```

原因：

- 它没有自身扩展语义。
- 用 `interface extends Pick<...>` 只是额外增加一层样板。


## 7.5 不建议为了“减少重复”引入新的泛型父接口

例如不要为了消除字段 schema 里重复的：

- `id`
- `name`
- `kind`
- `meta`

就引入一整套：

- `BaseField<TKind, TId>`
- `NamedEntity<TId>`
- `CustomFieldBase<TKind>`

原因：

- 这会把显式 schema 变成类型体操。
- 对当前项目而言，这属于新增中间层，不属于减层。

这里更合理的做法是：

- 保持字段 schema 显式可读。
- 只删除纯包装型 alias。


## 7.6 `ViewQuery` 值得保留，但不要立刻把 `View` 改成嵌套结构

`ViewQuery` 目前被 `core/query` 使用，作为：

- `search`
- `filter`
- `sort`
- `group`

的组合契约，这是有价值的。

但我不建议第一阶段就把：

```ts
View {
  search
  filter
  sort
  group
}
```

强行改成：

```ts
View {
  query: ViewQuery
}
```

原因：

- 这是实体形状级别的变更。
- 会波及 command、view helpers、publish、react 全链路。
- 它确实能减少少量重复，但不是当前最优先的复杂度来源。

我的判断是：

- `ViewQuery` 保留。
- `View` 是否嵌套化，放到更后期的结构稳定之后再评估。


## 7.7 `property` 命名中间层应去掉

建议统一成：

- `field`
- `customField`

具体包括：

- `createPropertyId` -> `createFieldId` 或 `createCustomFieldId`
- `resolvePropertyCreateCommand` -> `resolveCustomFieldCreateCommand`
- `resolvePropertyPatchCommand` -> `resolveCustomFieldPatchCommand`

这虽然不是纯类型工作，但它会直接减少类型与函数名之间的一次脑内映射。


## 8. 非类型文件中的类型，哪些该外提，哪些不该

这里需要一个明确原则，否则重排后还会继续生成新的“大总类型文件”。

### 8.1 应该保留在实现文件里的

这些类型只服务单文件内部实现，我建议继续本地化：

- `services/view.ts` 里的 `ActiveViewContext`
- `services/viewCommands.ts` 里的 `ViewPatchContext`
- `project/runtime/run.ts` 里的 `ProjectRunResult`
- `perf/runtime.ts` 里的 `PendingCommitTrace`
- `write/commit.ts` 里的 `Kind`、`Draft`、`Plan`

判断标准：

- 只在一个文件使用
- 语义强绑定实现细节
- 不构成跨文件契约


### 8.2 应该移到相邻 feature 契约文件里的

这些类型会被多个相邻文件共享，不适合继续散落在实现文件里：

- `CommandResolution`
- `ResolvedCommand`
- `ResolvedWriteBatch`
- `ValidationIssue`
- `NormalizedIndexDemand`
- `IndexDeriveResult`
- `ProjectDeriveResult`

建议不要再塞回总 `engine/types.ts`，而是放到各自 feature 下的：

- `command/contracts.ts`
- `index/contracts.ts`
- `project/contracts.ts`

或者更细的相邻目录里。


### 8.3 一个简单但应长期坚持的规则

我建议后续执行时统一遵守：

- 单文件专用类型：留在实现文件
- 同一 feature 多文件共享类型：放 feature-local `types.ts` / `contracts.ts`
- 公开 API 类型：放 `engine/api/public/*`

不要再出现“为了省事全丢进 `engine/types.ts`”的做法。


## 9. 推荐的执行顺序

## 9.1 第一阶段：只收类型归属，不碰运行时语义

优先做：

- 拆 `engine/types.ts`
- 拆 `core/contracts/state.ts`
- 拆 `engine/project/runtime/state.ts`
- 删除 `viewmodel/types.ts`
- 把 projection 类型从 `core/*/types.ts` 迁出
- 清掉 `FilterView` / `GroupView` / `SearchView` / `SortView` / `Schema`

这一阶段的目标是：

- import 路径更稳定
- 类型归属更正确
- 不改变行为


## 9.2 第二阶段：只做目录重排，不顺手重写语义

优先做：

- `services` -> `facade`
- `state` -> `store`
- 删除 `derive`
- `instance/create.ts` -> `api/createEngine.ts`
- `project/model.ts` -> `project/readModels.ts`
- 拆散 `viewmodel`

这一阶段要避免的错误是：

- 一边挪目录，一边改运行时逻辑
- 一边改命名，一边补业务规则


## 9.3 第三阶段：拆大文件，收口同域逻辑

优先做：

- `command/commands/view.ts`
- `command/field/resolve.ts`
- `services/view.ts`
- `services/viewCommands.ts`
- `project/publish/view.ts`

目标是让每个大文件只保留单一方向的职责。


## 9.4 第四阶段：再评估实体形状级简化

例如：

- `View` 是否改成 `query: ViewQuery`
- `FieldList` / `AppearanceList` 是否重命名
- `project` 是否改名为 `projection`

这些都属于“值得讨论，但不是第一优先级”的事项。


## 10. 我认为最值得立刻执行的几条

如果只挑最有价值的几件事，我会这样排：

1. 拆 `engine/types.ts`，把 public api / trace / history / perf / child apis 分开。
2. 把 `ViewFilterProjection`、`ViewGroupProjection`、`ViewSearchProjection`、`ViewSortProjection` 从 `core` 迁到 `engine/project`。
3. 删除 `viewmodel/types.ts`，去掉 `Schema` 这层纯包装。
4. 把 `project/model.ts` 改成更准确的 `readModels.ts`。
5. 删除 `derive` 目录，避免继续保留没有长期语义价值的中间层。
6. 在重排过程中统一 `property` / `field` 命名。


## 11. 最终判断

这次重排最重要的，不是把目录变得更“漂亮”，而是把 ownership 收回来。

我对当前结构的总体判断是：

- `core` 应只保留领域规则和基础契约，不应继续承载 UI/read projection。
- `engine` 应明确区分 public api、write pipeline、index、projection、facade、store。
- `types.ts` 这种总文件应该只保留在真正必要的 public barrel 层，不能再作为内部共享垃圾桶。
- 单文件实现类型应尽量本地化，真正共享的契约再外提。

如果按这个方向做，后续收益会非常直接：

- 文件名更能反映真实职责。
- 类型跳转层数显著下降。
- `core` / `engine` / `react` 三层边界会更清楚。
- 后面再做 view、field、projection、perf 相关重构时，不会继续被旧中间层拖住。
