# Dataview Engine Facade 最终实施方案

## 1. 明确决策

本次 `dataview/src/engine/facade` 重构，按下面结论一步到位执行，不保留兼容层，不保留过渡接口，不保留双轨实现。

硬性结论如下：

- 保留多 view 文档模型。
- 保留 `engine.active` 作为唯一完整的 active view session API。
- 保留 `engine.views`，但它只负责 view 集合管理。
- 明确删除 `engine.views.api(viewId)`。
- 不新增 `engine.views.config(viewId)`。
- 不允许再通过 scoped `viewId` 暴露完整 `ViewEngineApi`。

这份方案里没有“先保留再观察”的模糊空间。最终 API 直接收口到真实运行时语义：

- 一个文档可以有多个持久化 view。
- 任意时刻只有一个 active view session。

因此只有 `engine.active` 可以承载完整 view domain 行为。

## 2. 最终 API 设计

### 2.1 `Engine`

最终顶层结构保持简短直接：

```ts
interface Engine {
  active: ActiveEngineApi
  views: ViewsEngineApi
  fields: FieldsEngineApi
  records: RecordsEngineApi
  document: EngineDocumentApi
  history: EngineHistoryApi
  perf: EnginePerfApi
  read: EngineReadApi
}
```

顶层不再额外提供按 `viewId` scoped 的完整 facade。

### 2.2 `ViewsEngineApi`

`engine.views` 只保留集合管理能力：

```ts
interface ViewsEngineApi {
  list: () => readonly View[]
  get: (viewId: ViewId) => View | undefined
  open: (viewId: ViewId) => void
  create: (input: { name: string; type: ViewType }) => ViewId | undefined
  rename: (viewId: ViewId, name: string) => void
  duplicate: (viewId: ViewId) => ViewId | undefined
  remove: (viewId: ViewId) => void
}
```

明确禁止：

- `api(viewId)`
- `config(viewId)`
- 任何 scoped runtime facade

原因不是“以后完全不可能编辑 inactive view”，而是当前系统没有必要为这种需求保留一整套 facade 结构。需要编辑某个 inactive view 时，先 `open(viewId)`，再通过 `engine.active` 操作。

### 2.3 `ActiveEngineApi`

`engine.active` 是唯一完整 view session API。它同时承载两类能力：

- 当前 active view 的 config 写入
- 当前 active runtime 的读取与写入

最终边界如下：

```ts
interface ActiveEngineApi {
  id: ReadStore<ViewId | undefined>
  view: ReadStore<View | undefined>
  state: ReadStore<ActiveViewState | undefined>
  select: ActiveSelectApi
  read: ActiveReadApi

  type: { set: (type: ViewType) => void }
  search: { set: (value: string) => void }
  filter: ...
  sort: ...
  group: ...
  calc: ...
  display: ...
  table: ...
  gallery: ActiveGalleryApi
  kanban: ActiveKanbanApi
  order: ViewOrderApi
  items: ViewItemsApi
  cells: ViewCellsApi
}
```

结论：

- 只有 `engine.active` 能做 `items.move`
- 只有 `engine.active` 能做 `items.create`
- 只有 `engine.active` 能做 `cells.set/clear`
- 只有 `engine.active` 能访问 `read` / `select`
- 只有 `engine.active` 能消费 `appearances` / `sections` / `calculations`

### 2.4 `ViewEngineApi`

最终不再保留“可同时代表 active 和 inactive scoped view”的 `ViewEngineApi` 心智模型。

实施上允许两种等价收口方式，目标一致：

方案 A：

- 删除 `ViewEngineApi`
- 直接让 `ActiveEngineApi` 成为唯一 view facade 类型

方案 B：

- 保留 `ViewEngineApi` 这个名字
- 但它明确只表示 active view facade
- 不允许再被 `engine.views` 复用

最终推荐方案是 A，因为更干净，不会继续制造 scoped facade 的误解。

## 3. 职责拆分

### 3.1 `engine.views` 的职责

只处理文档级 view 集合管理：

- 列表
- 读取单个持久化 view
- 打开某个 view
- 创建
- 重命名
- 复制
- 删除

它不负责：

- item 级行为
- cell 级行为
- active query/runtime 行为
- `read` / `select`
- group runtime 下的移动推导

### 3.2 `engine.active` 的职责

处理当前 active session 的完整行为：

- view config 修改
- 当前投影读取
- section / appearance / cell 推导
- 拖拽移动
- 当前视图下的新建记录
- 当前视图下的 cell 写入

### 3.3 `order` 的归属

`order.move(recordIds, beforeRecordId)` 保留在 active facade 上对外暴露，但语义上它属于“对 active view config 的写入”，不是独立 runtime 模块。

active-only 的部分是：

- 从 `appearanceIds + Placement` 推导出 `recordIds + beforeRecordId`

这部分继续由 `engine.active.read.planMove(...)` 及 `items.move(...)` 消费，不向 `engine.views` 下沉。

## 4. facade 文件最终形态

### 4.1 `dataview/src/engine/facade/views.ts`

最终只保留集合管理实现：

- `list`
- `get`
- `open`
- `create`
- `rename`
- `duplicate`
- `remove`

必须删除：

- `api`
- 任何 `viewId => createViewEngineApi(...)` 的依赖

### 4.2 `dataview/src/engine/facade/view/index.ts`

这个文件必须从“混合总装层”收口成“只服务 active facade 的构造器”。

最终要求：

- 不再支持任意 `viewId` scoped 复用
- 不再接收 `resolveViewId()` 这种为 scoped facade 服务的参数
- 不再承载“如果恰好 active 才能正常工作”的半真半假的语义

推荐的最终形态：

```ts
createActiveViewApi({
  activeBase,
  readDocument,
  dispatch,
  fields,
  records
})
```

该构造器内部直接依赖 active context：

- active view
- active state
- active read

而不是再人为绕一层 scoped `viewId`。

### 4.3 `dataview/src/engine/facade/view/commands.ts`

这个文件只保留 config patch 构造逻辑。如果拆分后内容足够短，可以直接内联回 `view/index.ts`。

明确原则：

- 如果保留独立文件，它只服务 active facade 的 config 部分
- 不允许再以“复用给 scoped inactive facade”为理由保留复杂抽象

### 4.4 `dataview/src/engine/api/createEngine.ts`

最终装配方式必须改成：

- `active` 直接由 active base 加 active view facade 组合而成
- `views` 直接由集合管理 facade 生成
- 删除 `createScopedViewApi`

明确禁止保留：

```ts
const createScopedViewApi = (viewId: string) => ...
```

## 5. public type 具体修改

### 5.1 `dataview/src/engine/api/public/services.ts`

必须修改：

- 从 `ViewsEngineApi` 中删除 `api: (viewId: ViewId) => ViewEngineApi`
- 如果 `ViewEngineApi` 还保留，必须明确改为 active-only 语义
- 更推荐直接删除 `ViewEngineApi`，让 `services.ts` 只保留真正还存在的公共接口

### 5.2 `dataview/src/engine/api/public/project.ts`

`ActiveEngineApi` 保持为唯一完整 view session 类型。

如果删除 `ViewEngineApi`，则这里直接显式声明 active 的 config/action surface，不再通过：

```ts
extends Omit<ViewEngineApi, ...>
```

原因很简单：

- `ViewEngineApi` 这个中间层已经不再有独立存在价值
- 继续 `Omit` 只会保留旧架构痕迹

### 5.3 `dataview/src/engine/api/public/index.ts`

同步删除不再对外导出的 facade 类型。

### 5.4 `dataview/src/index.ts`

同步删除不再对外 re-export 的 facade 类型。

## 6. 代码层必须删除的旧实现

这次重构中必须删干净的内容：

- `engine.views.api(viewId)`
- `ViewsEngineApi.api`
- `createScopedViewApi`
- scoped `createViewEngineApi(viewId)` 复用路径
- 任何“传入任意 `viewId`，返回完整 view facade”的实现
- 任何仅为支持这条旧线而存在的类型中间层

清理标准不是“外部暂时不用了”，而是：

- 类型删掉
- 实现删掉
- 调用面删掉
- re-export 删掉

## 7. 实施步骤

### 阶段 1. 收口 public API

修改文件：

- `dataview/src/engine/api/public/services.ts`
- `dataview/src/engine/api/public/project.ts`
- `dataview/src/engine/api/public/index.ts`
- `dataview/src/index.ts`

执行内容：

- 删除 `ViewsEngineApi.api`
- 删除或收缩 `ViewEngineApi`
- 让 `ActiveEngineApi` 成为唯一完整 facade 类型

完成标准：

- public type 不再表达 scoped 完整 view facade

### 阶段 2. 收口 facade 实现

修改文件：

- `dataview/src/engine/facade/views.ts`
- `dataview/src/engine/facade/view/index.ts`
- `dataview/src/engine/facade/view/commands.ts`
- `dataview/src/engine/facade/index.ts`

执行内容：

- `views.ts` 删除 `api`
- `view/index.ts` 改成只构造 active facade
- 去掉为 scoped viewId 复用服务的参数和分支
- 对过短的 helper 直接内联

完成标准：

- facade 层只剩两条线：`engine.views` 集合管理、`engine.active` 完整 session

### 阶段 3. 重组 engine 装配

修改文件：

- `dataview/src/engine/api/createEngine.ts`

执行内容：

- 删除 `createScopedViewApi`
- `active` 直接装配 active facade
- `views` 只装配集合管理 facade

完成标准：

- `createEngine()` 中不再出现 scoped view facade 工厂

### 阶段 4. 全局清理

全局检索并清理：

- `views.api(`
- `ViewEngineApi`
- `createScopedViewApi`

完成标准：

- 仓库里不再残留旧架构名字和实现

## 8. 实施约束

这次实施必须遵守：

- 一步到位
- 不保留兼容层
- 不保留 fallback
- 不保留双轨实现
- 不新增 `engine.views.config(viewId)` 作为折中方案
- 不允许继续把 active-only 能力伪装成任意 `viewId` 都可用的 facade

## 9. 最终结果

重构完成后，engine facade 的心智模型必须简化为：

- `engine.views` 管理“有哪些 view”
- `engine.active` 操作“当前这个 view”

只有这两条线。

不再存在第三条：

- “给我任意一个 viewId，我拿到一套完整 facade”

这条线必须彻底删除。
