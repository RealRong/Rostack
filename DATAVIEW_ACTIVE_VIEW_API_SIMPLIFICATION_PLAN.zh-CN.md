# Dataview Active View API 简化方案

## 目标

在符合真实产品约束的前提下，澄清 engine API 中与 view 访问相关的边界：

- 一个文档可以包含多个持久化 view。
- 任意时刻只会有一个 active view。

这份方案的目标不是去掉多 view 支持，而是去掉下面两个概念之间的 API 混淆：

- 持久化的 view 配置
- active view 的运行时状态 / session 状态

这份文档只记录当前判断和推荐的简化方向，不包含代码改动。

## 当前模型

当前架构里和 view 相关的概念，主要有三层：

1. 持久化 view 集合

- `DataDoc.views`
- `DataDoc.activeViewId`
- `getDocumentActiveView()` 这一类 document helper

这一层本身是合理的。文档模型明确就是多 view。

2. Active view 运行时投影

- `ActiveViewState`
- `filter`、`group`、`search`、`sort`、`records`、`sections`、`appearances`、`fields`、`calculations` 这些 active 投影

这一层也合理。它们描述的是“当前 active view 的运行时 / session 投影”，不是简单重复一个 `View` 实体。

3. View facade 层

- `engine.active`
- `engine.views`
- `engine.views.api(viewId)`
- `createViewEngineApi()`
- `createViewCommandNamespaces()`

真正开始让 API 语义变绕的，是这一层。

## 主要结论

真正的问题并不是 `ActiveViewState`。

`ActiveViewState` 是一个合理边界。它代表当前 active view 的运行时状态，而 React 层的大部分真实工作面，本身也已经是围绕 `engine.active` 在组织。

更值得怀疑的抽象，是 `engine.views.api(viewId): ViewEngineApi`。

从接口表面上看，它像是在说：

- 任意一个 view，都可以拿到一套完整的 domain API

但运行时真实语义并不是这样。

`ViewEngineApi` 里有一部分能力天然依赖 active-only 的运行时状态，尤其是那些需要以下信息的操作：

- `appearances`
- `sections`
- group 下的移动 / 写入语义
- active view 下的排序 / 投影视图

而现在的 scoped API 在实现上，只有当这个 `viewId` 恰好就是当前 active view 时，`readState()` 才真正可用。

这就导致一个语义错位：

- 类型层面表达的是“任意 view 都有完整 API”
- 实际语义却是“只有 active 的那个 view 才有完整 API”

这才是当前“多绕了一圈”的核心来源。

## 哪些不是主要问题

### `engine.views`

`engine.views` 本身不是问题，而且应该保留。

因为文档就是多 view，所以集合级别的管理能力是必要的：

- `list`
- `get`
- `open`
- `create`
- `rename`
- `duplicate`
- `remove`

这些都是 document 级别的 view 管理操作，不是 active view session 操作。

### `commands.ts`

`dataview/src/engine/facade/view/commands.ts` 更多是在做实现抽取，不是核心架构问题。

它主要把一批基于 `readView/readDocument -> build patch/commit patch` 的命令构造器收拢在一起。这个文件是否保留拆分，可以以后再看，但即使把它内联回 `view/index.ts`，当前最根本的语义问题也依然存在。

所以它不是第一优先级的简化目标。

### `facade/index.ts`

`dataview/src/engine/facade/index.ts` 只是一个 barrel export，本身并不会决定架构复杂度。

## 推荐方向

真正应该做的简化，是把下面两个概念拆得更明确：

1. active view session API
2. 持久化 view 集合 / 配置 API

### 保留 `engine.active` 作为唯一完整的 view domain API

`engine.active` 应该继续作为唯一完整的 view domain surface。

原因：

- 它天然拥有 `ActiveViewState`
- 它和现有 UI 的使用方式一致
- 它准确表达了“只有当前 active view 才有完整运行时语义”

自然属于这里的能力包括：

- `search`
- `filter`
- `sort`
- `group`
- `calc`
- `display`
- `table`
- `gallery`
- `kanban`
- `order`
- `items`
- `cells`
- `select`
- active read helper

### 保留 `engine.views` 作为集合管理 API

`engine.views` 应该聚焦在“管理文档里的持久化 views 集合”。

推荐保留的能力：

- `list`
- `get`
- `open`
- `create`
- `rename`
- `duplicate`
- `remove`

这一层应该描述“文档中的 view 实体”，而不是“某个 view 的运行时 session”。

### 去掉或弱化 `engine.views.api(viewId)`

这是当前最值得收缩的一层。

它现在对外给人的感觉是：

- “给我那个 view 的 API”

但实际语义更接近：

- “给我一个以 patch 为主的 view 配置 API，再混入一些只有它恰好是 active 时才真正可用的能力”

这个契约是不干净的。

推荐方向有两个：

- 不再把 `engine.views.api(viewId)` 作为公开完整能力暴露出去
- 或者把它缩窄到一个不会伪装成完整 `ViewEngineApi` 的接口

## 更合理的 API 切分

如果业务上确实需要“在不先 open 的前提下，直接编辑 inactive view 的配置”，那应该显式暴露一个更窄的 API，专门处理持久化 view 配置，而不是继续复用完整 `ViewEngineApi`。

概念上，可以把现在的 `ViewEngineApi` 拆成两类：

### 1. `ActiveViewSessionApi`

这一层就是现在 `engine.active` 所代表的能力形状，包含所有依赖运行时投影的操作。

职责包括：

- 运行时 read / select API
- item 的 move / create / remove
- cell 写入
- 依赖 active runtime context 的 order 操作
- 依赖 section / group 运行时状态的行为

### 2. `ViewConfigApi`

这一层是针对任意 `viewId` 的持久化配置编辑 API。

职责包括：

- rename
- type
- search
- filter
- sort
- group 定义
- calc 配置
- display 配置
- view options
- 如果仍视为 view schema 一部分，也可以包含静态 order 配置

不应该放进来的能力包括：

- `items`
- `cells`
- `select`
- active read helper
- 任何依赖 `appearances`、`sections` 或 active runtime projection 的能力

这样切分之后，接口语义会更诚实。

## 为什么这样更简单

这个方向主要会从三个层面变简单。

### 1. 公共 API 会和运行时事实一致

系统里任意时刻只有一个 active view session。

API 应该直接把这件事表达出来，而不是让所有持久化 view 看起来都像有一套完整的运行时 domain。

### 2. 实现边界会更干净

现在 `createViewEngineApi()` 里混合了两类责任：

- 基于 patch 的 view config 写操作
- 依赖 active runtime 的 item / cell / order 行为

这两类能力相关，但不是同一层职责。

拆开后，哪些逻辑依赖 `ActiveViewState` 会变得非常明确，而不是现在这样通过复用被揉在一起。

### 3. React 侧当前的真实使用方式本来就更接近这个模型

现在 React 里大多数场景已经是：

- 当前工作 view 的行为走 `engine.active.*`
- tab 管理和跨-view 文档操作走 `engine.views.*`

所以这个简化方向，本质上是在让公开 engine 形状更贴近现有代码的真实心智模型。

## 最小重构路径

如果后续要落地，我建议走一条尽量低风险的路径：

1. 先把目标语义固定到文档和类型注释里。
2. 停止新增 `engine.views.api(viewId)` 的调用点。
3. 如果确实需要编辑 inactive view，引入更窄的 config-scoped API。
4. 所有依赖 active runtime 的能力，只保留在 `engine.active` 下。
5. 如果最终没有有意义的调用场景，再废弃并移除 `engine.views.api(viewId)`。

这样可以不动文档数据模型，只简化运行时 API 的心智负担。

## 非目标

这份方案不建议做以下事情：

- 去掉文档层面的多 view 支持
- 把 `views` 收缩成单个 `view`
- 去掉 `ActiveViewState`
- 改写文档持久化语义
- 按“文档永远只有一个 view”的假设去重写 React 功能

## 推荐的最终心智模型

理想状态下，系统应该是这样被理解：

- `engine.views` 负责管理文档里的持久化 views
- `engine.active` 代表当前唯一的 active view session
- 只有 `engine.active` 拥有依赖运行时投影的完整 view 行为
- inactive view 如果允许直接编辑，也只通过更窄的 config-only API 处理

这样既保留了真实存在的多 view 文档结构，也让全局 API 语义变得最直接、最诚实。
