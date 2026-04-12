# Dataview Engine Facade 简化方案

## 目标

下一步 `dataview/src/engine/facade` 的优化重点，不是继续微调实现细节，而是把 facade 层的公共语义彻底收口到与真实运行时一致的形态。

系统的真实约束是：

- 一个文档可以持有多个持久化 view。
- 任意时刻只有一个 active view session。

因此 facade 层必须明确区分两件事：

- 持久化 view 配置管理
- 当前 active view 的完整运行时 domain 行为

目标是：

- 保留多 view 文档模型。
- 保留 `engine.active` 作为唯一完整 view domain API。
- 收缩 `engine.views.api(viewId)` 这条语义不诚实的接口。
- 让 `engine/facade/view/index.ts` 不再混合 config 写操作与 active-only 行为。

---

## 最终判断

### 成立的核心结论

1. `ActiveViewState` 不是主要问题。

它表达的是 active view 的运行时投影，本身是合理边界。当前 React 真实工作面也已经围绕 `engine.active` 在组织。

2. `engine.views` 不是问题。

`engine.views` 对应的是 document 级别的 view 集合管理：

- `list`
- `get`
- `open`
- `create`
- `rename`
- `duplicate`
- `remove`

这些能力与多 view 文档模型完全一致，应该保留。

3. `engine.views.api(viewId)` 是 facade 层当前最核心的问题。

类型上它表达的是：

- 任意 `viewId` 都可以拿到一套完整 `ViewEngineApi`

但实现上的真实语义不是这样。

当前完整 `ViewEngineApi` 里，有一批能力天然依赖 active runtime：

- `items`
- `cells`
- active runtime 下的 `read` / `select`
- 基于 `appearances`、`sections`、group runtime 语义的移动与写入

这意味着：

- 类型层面表达为“任意 view 都有完整 API”
- 运行时真实语义却是“只有 active 的那个 view 才有完整 API”

这就是 facade 当前最主要的语义错位。

---

## 当前问题

### 1. `ViewEngineApi` 混了两层职责

当前 `ViewEngineApi` 在 [services.ts](/Users/realrong/Rostack/dataview/src/engine/api/public/services.ts) 里同时承载：

- 持久化 view config 写操作
- active-only runtime 行为

这两层相关，但不是同一层职责。

具体看：

- 明显属于 config 的：
  - `type`
  - `search`
  - `filter`
  - `sort`
  - `group`
  - `calc`
  - `display`
  - `table` / `gallery` / `kanban` 下的静态配置项
  - `order` 的 record 级写入

- 明显属于 active runtime 的：
  - `items`
  - `cells`
  - active read / select
  - 基于 section / appearance / group runtime 计算出的移动行为

问题不是“这些能力不该存在”，而是它们不该继续挂在同一个 scoped `ViewEngineApi` 上，对任意 `viewId` 看起来都等价。

### 2. `createViewEngineApi()` 当前是总装混合层

[view/index.ts](/Users/realrong/Rostack/dataview/src/engine/facade/view/index.ts) 当前同时在做：

- view config patch builder
- active-only item / cell 行为
- active runtime read 依赖下的 group move / create 语义

这导致：

- `engine.active` 依赖它
- `engine.views.api(viewId)` 也依赖它

最后把 active-only 能力“借壳”暴露给了 scoped view API。

### 3. `views.ts` 的 `api(viewId)` 让 public surface 不诚实

[views.ts](/Users/realrong/Rostack/dataview/src/engine/facade/views.ts) 当前的：

```ts
api: (viewId: ViewId) => ViewEngineApi
```

最大的问题不是实现复杂，而是 public type 在撒谎。它暗示所有 view 都有完整 domain API，但实际上只有 active 的那个 view 才成立。

---

## 最终 API 方向

### 1. `engine.active` 保留为唯一完整 view domain API

最终只有 `engine.active` 拥有完整的 view domain surface。

它应继续承载：

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
- `read`
- `select`

结论：

- 只有 `engine.active` 能表达“完整 view session”。
- 任何依赖 active runtime projection 的能力都只能留在这里。

### 2. `engine.views` 保留为集合管理 API

最终 `engine.views` 只负责文档中的持久化 view 集合管理：

```ts
interface ViewsApi {
  list: () => readonly View[]
  get: (viewId: ViewId) => View | undefined
  open: (viewId: ViewId) => void
  create: (input: { name: string; type: ViewType }) => ViewId | undefined
  rename: (viewId: ViewId, name: string) => void
  duplicate: (viewId: ViewId) => ViewId | undefined
  remove: (viewId: ViewId) => void
}
```

结论：

- `engine.views` 不应继续看起来像“view domain API factory”。
- 它表达的是 document 级 view 集合，不是 active session。

### 3. 去掉或收缩 `engine.views.api(viewId)`

这是下一步 facade 简化的第一优先级。

推荐最终方向：

- 不再公开 `engine.views.api(viewId): ViewEngineApi`

如果业务确实需要“在不 open 的前提下编辑 inactive view 配置”，推荐显式引入一个更窄接口，而不是继续复用完整 `ViewEngineApi`。

更合理的候选形态是：

```ts
interface ViewsApi {
  config: (viewId: ViewId) => ViewConfigApi
}
```

或者更保守：

- 暂时不加 `config(viewId)`，只保留集合管理 API
- 当明确出现 inactive view config 编辑需求时，再补一个窄接口

当前最重要的不是立刻引入 `config(viewId)`，而是先让 `api(viewId)` 不再伪装成完整 `ViewEngineApi`。

---

## 推荐的接口拆分

### 1. `ActiveViewSessionApi`

这是 `engine.active` 的真实职责。

它应是当前完整 `ViewEngineApi` 加 active session 能力的归宿，包含：

- view config 行为
- active runtime 行为
- active read / select

换句话说：

- `engine.active` 保持大而全
- 但它的“大而全”是合理的，因为系统里同时只有一个 active session

### 2. `ViewConfigApi`

如果后续确实需要“编辑 inactive view”，这层只负责持久化 config 写入。

建议能力只包含：

- `rename`
- `type`
- `search`
- `filter`
- `sort`
- `group`
- `calc`
- `display`
- 静态 options
- record 级 `order`

不应放入的能力：

- `items`
- `cells`
- `read`
- `select`
- 任何依赖 `appearances`、`sections`、active projection 的行为

### 3. `order` 的归属

这里要特别说明：

- `order.move(recordIds, beforeRecordId)` 本质上是 config 层能力
- active-only 的是“如何从 runtime appearance / section / drag target 推导出这组 `recordIds + beforeRecordId`”

也就是说：

- `planMove(...)` 属于 active runtime 读取
- `order.move(...)` 本身可以保留在 config 层

因此后续拆分时不应把 `order` 粗暴归为 active-only。

---

## 对现有文件的具体判断

### `dataview/src/engine/facade/view/index.ts`

这是下一步重构核心文件。

当前问题：

- config 写操作和 active runtime 行为混在一起
- 被 `engine.active` 和 `engine.views.api(viewId)` 共同复用

最终方向：

- 拆成两层：
  - `createViewConfigApi(...)`
  - `createActiveViewApi(...)`

其中：

- `createViewConfigApi(...)` 只处理 config patch / write
- `createActiveViewApi(...)` 在 config API 之上叠加：
  - `items`
  - `cells`
  - active runtime 相关行为

### `dataview/src/engine/facade/view/commands.ts`

当前不是第一优先级问题。

它主要负责 config patch 构造，语义上更接近未来的 `ViewConfigApi` 内部实现。

结论：

- 先不把它当主要问题。
- 等 `view/index.ts` 拆层后，再决定：
  - 保留为 config patch builder
  - 或者直接内联

### `dataview/src/engine/facade/views.ts`

当前问题集中在：

```ts
api: (viewId: ViewId) => ViewEngineApi
```

最终方向：

- 删除 `api(viewId): ViewEngineApi`
- 或改为更窄的：
  - `config(viewId): ViewConfigApi`

### `dataview/src/engine/api/public/services.ts`

这是需要同步收口的 public type 定义文件。

最终方向：

- `ViewsEngineApi` 不再暴露 `api(viewId): ViewEngineApi`
- `ViewEngineApi` 应重新命名或重新界定为 active-only 语义
- 如果需要 inactive view config API，则新增独立的 `ViewConfigApi`

### `dataview/src/engine/facade/index.ts`

不是主要问题。

它只是导出组织层。等 `view/index.ts` 拆分后，再自然调整导出面即可。

---

## 最终推荐心智模型

系统应该被这样理解：

- `engine.views` 负责管理文档里的持久化 views
- `engine.active` 代表当前唯一的 active view session
- 只有 `engine.active` 拥有依赖运行时投影的完整 view 行为
- inactive view 如果允许直接编辑，也只通过更窄的 config-only API 处理

这一模型与实际运行时完全一致，也与当前 React 的真实使用方式一致。

---

## 具体落地方案

### 阶段 1. 先收口 public type

目标：

- 在 public types 上先把语义纠正过来

具体动作：

- 在 [services.ts](/Users/realrong/Rostack/dataview/src/engine/api/public/services.ts) 中：
  - 标记 `ViewEngineApi` 为 active-only 语义
  - 删除或准备删除 `ViewsEngineApi.api(viewId): ViewEngineApi`
- 明确 `engine.active` 是唯一完整 view domain API

完成标准：

- 公共类型不再表达“任意 view 都有完整 runtime API”

### 阶段 2. 拆 `createViewEngineApi()`

目标：

- 把 config 与 active runtime 行为分层

具体动作：

- 从 [view/index.ts](/Users/realrong/Rostack/dataview/src/engine/facade/view/index.ts) 中提炼：
  - `createViewConfigApi(...)`
  - `createActiveViewApi(...)`

建议边界：

- `createViewConfigApi(...)`：
  - `type`
  - `search`
  - `filter`
  - `sort`
  - `group`
  - `calc`
  - `display`
  - 静态 `table/gallery/kanban` config
  - `order`

- `createActiveViewApi(...)`：
  - `items`
  - `cells`
  - active-specific runtime write behavior

完成标准：

- `view/index.ts` 不再是总装混合层

### 阶段 3. 收缩 `views.ts`

目标：

- 让 `engine.views` 回到集合管理职责

具体动作：

- 从 [views.ts](/Users/realrong/Rostack/dataview/src/engine/facade/views.ts) 删除：
  - `api(viewId): ViewEngineApi`

可选动作：

- 如果确实需要 inactive config 编辑：
  - 新增 `config(viewId): ViewConfigApi`

完成标准：

- `engine.views` 不再作为完整 domain API factory

### 阶段 4. 只保留 `engine.active` 的完整行为

目标：

- 把完整 domain surface 只留在 active session 上

具体动作：

- [createEngine.ts](/Users/realrong/Rostack/dataview/src/engine/api/createEngine.ts) 中：
  - active 只组合 `createActiveViewApi(...)`
  - views 只组合集合管理 API

完成标准：

- `engine.active` 成为唯一完整 view 行为入口

### 阶段 5. 清理旧调用点

目标：

- 清理所有对 `engine.views.api(viewId)` 的依赖

具体动作：

- 全局检索并替换所有 `views.api(...)` 调用
- 按使用场景改为：
  - `engine.active.*`
  - `engine.views.*`
  - 或未来的 `engine.views.config(...)`

完成标准：

- 仓库中不再残留 `views.api(viewId)` 这条旧线

---

## 实施要求

- 一步到位，不保留兼容层。
- 不允许继续让 scoped inactive view API 伪装成完整 `ViewEngineApi`。
- 先做语义拆分，再决定文件是否进一步内联。
- 优先以公共 API 是否诚实为判断标准，而不是以“复用实现”作为优先标准。
