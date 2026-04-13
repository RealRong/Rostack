# DATAVIEW 类型迁移最终方案

## 1. 目标

这份方案只处理 `dataview` 包内 `core / engine / react` 三层的类型归属、命名和导出边界，不做运行时代码改写。

本轮扫描的目标不是“把所有类型集中到一个文件”，而是建立稳定的所有权规则：

- `core` 只拥有文档模型和纯领域契约。
- `engine` 只拥有运行时读模型、公开 API 契约、内部派生/缓存契约。
- `react` 只拥有 React 层会话、交互、视图运行时和组件契约。
- 同一个概念只能有一个 canonical type。
- 实现文件不再承担公共契约出口的职责。

## 2. 扫描结论

### 2.1 真正需要处理的重复类型

本次按名字扫描后，真正需要纳入迁移的重复项很少，核心问题集中在“同名不同层”和“同一概念被派生 alias 再次导出”。

#### A. `ViewQuery`

当前存在两份同名类型：

- `dataview/src/core/contracts/state.ts`
- `dataview/src/engine/contracts/public.ts`

它们语义不同：

- `core` 里的 `ViewQuery` 是文档层 query 结构组合。
- `engine` 里的 `ViewQuery` 是 active view 的 projection/read-model。

这属于最典型的跨层同名冲突。继续保留这个名字，调用方很容易在 `@dataview/core/contracts` 和 `@dataview/engine` 之间拿错。

最终处理：

- `core/contracts/state.ts` 的 `ViewQuery` 重命名为 `DocumentViewQuery`。
- `engine/contracts/public.ts` 的 `ViewQuery` 重命名为 `ActiveViewQuery`。
- `ViewState.query` 跟随改为 `ActiveViewQuery`。

#### B. `DateDisplayFormat` / `DateValueKind`

当前存在两套来源：

- canonical 定义在 `dataview/src/core/contracts/state.ts`
- 同名 alias 又在 `dataview/src/core/field/kind/date.ts` 再导出一次

这不是“不同语义”，而是“同一语义重复出口”。更糟的是 `core/field/index.ts` 会继续把 `date.ts` 的别名重新暴露出去，导致使用者很难判断应该从 contracts 还是 field 模块拿。

最终处理：

- `DateDisplayFormat`、`DateValueKind`、`TimeDisplayFormat` 只保留 `core/contracts/state.ts` 为 canonical。
- `core/field/kind/date.ts` 不再导出这些重复 alias，只 import 使用。
- `DateTimeFormat` 不再单独存在，统一使用 `TimeDisplayFormat`。

### 2.2 位置不对的类型

这些类型不一定重复，但归属明显不稳定，已经出现“实现文件泄漏 contract”或“上层依赖下层实现路径”的问题。

#### A. `DocumentEntityRead`

当前文件：

- `dataview/src/engine/document/entities.ts`

问题：

- 这是一个通用 contract 风格的类型，却放在 `document` 实现目录。
- 当前全仓没有其他文件使用它，属于未被消费的导出。

最终处理：

- 如果继续无人使用，直接删除。
- 如果后续需要保留，只能放到 `engine/contracts/internal.ts` 或 `engine/document/contracts.ts`，不能留在实现 helper 文件里做导出。

#### B. `NormalizedIndexDemand`

当前文件：

- `dataview/src/engine/active/index/demand.ts`

问题：

- 这是 index 子系统的稳定内部契约。
- 现在 `engine/runtime/state.ts` 直接从 `active/index/demand.ts` 引它，说明 runtime state 已经依赖了实现路径。

最终处理：

- 新建 `dataview/src/engine/active/index/contracts.ts`。
- `NormalizedIndexDemand` 移入这个 contracts 文件。
- `runtime/state.ts` 只允许依赖 `active/index/contracts.ts`，不再依赖 `demand.ts`。

#### C. `FieldSyncContext`

当前文件：

- `dataview/src/engine/active/index/sync.ts`

问题：

- 这是 index sync 相关的共享内部 contract。
- 当前被 `search / sort / calculations / group/runtime / trace` 多处消费，但仍然挂在 `sync.ts` 实现文件上。

最终处理：

- 移入 `dataview/src/engine/active/index/contracts.ts`。
- `sync.ts` 只保留算法与 helper，不再承载共享类型出口。

#### D. `IndexDeriveResult`

当前文件：

- `dataview/src/engine/active/index/runtime.ts`

问题：

- 它是 active index runtime 的输出契约，不该只存在于 `runtime.ts` 实现文件中。

最终处理：

- 移入 `dataview/src/engine/active/index/contracts.ts`。
- `runtime.ts` 只 import 该类型。

#### E. `ViewRuntimeResult`

当前文件：

- `dataview/src/engine/active/runtime.ts`

问题：

- 它描述 active runtime orchestration 的结果，是内部稳定契约，不应挂在 runtime 实现文件上。

最终处理：

- 移入 `dataview/src/engine/contracts/internal.ts`，或者拆成 `engine/contracts/runtime.ts`。
- `active/runtime.ts` 只保留 runtime orchestration 实现。

#### F. `DataViewContextValue` / `DataViewSession`

当前文件：

- `dataview/src/react/dataview/runtime.ts`
- `dataview/src/react/dataview/provider.tsx` 只是转手 re-export

问题：

- 这是 React dataview 层的公开契约，却放在 runtime 实现文件。
- `provider.tsx` 和 `runtime.ts` 都在绕着这个类型转，说明 contract 没有固定归属。

最终处理：

- 新建 `dataview/src/react/dataview/types.ts`。
- `DataViewContextValue`、`DataViewSession`、`EngineProviderProps` 统一收口到这里。
- `provider.tsx` 和 `runtime.ts` 都只 import types。

#### G. `GalleryActiveState` / `GalleryRuntime`

当前文件：

- `dataview/src/react/views/gallery/runtime.ts`

问题：

- 这是 gallery view 模块对外暴露的 view-specific React contract。
- 当前与 `useGalleryRuntime` hook 实现混在同一个文件。

最终处理：

- 新建 `dataview/src/react/views/gallery/types.ts`。
- 迁移 `GalleryActiveState`、`GalleryRuntime`。
- `runtime.ts` 只保留 `useGalleryRuntime`。

#### H. `KanbanActiveState` / `KanbanRuntime` / `KanbanSectionVisibility`

当前文件：

- `dataview/src/react/views/kanban/runtime.ts`

问题与 gallery 完全相同。

最终处理：

- 新建 `dataview/src/react/views/kanban/types.ts`。
- `runtime.ts` 只保留 hook 和实现。

### 2.3 导出边界混层

#### A. `react/index.ts` 直接再导出 `core` 类型

当前文件：

- `dataview/src/react/index.ts`

现状：

- 这里直接 re-export `TableOptions`、`ViewDisplay`、`GalleryCardSize`、`GalleryOptions`、`KanbanNewRecordPosition`、`KanbanOptions` 等 `core` 类型。

问题：

- `react` 入口本应只代表 React 层契约。
- 现在它成了 `core` 类型的旁路出口，导致 import path 不再表达所有权。

最终处理：

- `react/index.ts` 只导出 React 层类型。
- 领域/引擎类型统一从包根 `dataview/src/index.ts` 或对应子入口拿。

#### B. `engine/contracts/internal.ts` 反向依赖 `public.ts`

当前文件：

- `dataview/src/engine/contracts/internal.ts`

现状：

- `internal.ts` 当前依赖 `SectionBucket`、`SectionKey`、`ViewRecords`、`ViewState` 等 public 类型。

问题：

- `internal` 与 `public` 没有形成稳定单向边界。
- 后续内部 contract 一旦演化，很容易被 public 类型命名牵制。

最终处理：

- 新建 `dataview/src/engine/contracts/shared.ts`。
- `shared.ts` 承载 public/internal 都要用的 view-state primitive。
- `public.ts` 和 `internal.ts` 都从 `shared.ts` 引用。

## 3. 最终所有权边界

### 3.1 `core`

`core` 只拥有下面这些类型：

- 文档持久化模型
- action / command / operation / delta 契约
- 领域枚举、字段 schema、view options、filter/search/sort/group 基础结构
- 可跨 `engine` 与 `react` 复用的纯领域类型

最终要求：

- `core/contracts/*` 是唯一 canonical 出口。
- `core/<domain>/*` 可以有内部 helper type，但不再重复导出 canonical contract。
- `core/field/kind/date.ts` 这种实现模块不再重复定义 `contracts` 已经存在的同名类型。

### 3.2 `engine`

`engine` 分三层：

#### A. `engine/contracts/shared.ts`

只放 public/internal 都会用到的 read-model primitive，例如：

- `ItemId`
- `SectionKey`
- `SectionBucket`
- `ViewRecords`
- 其他不会直接绑定 API 行为、但会被内部缓存和 public state 同时复用的结构

#### B. `engine/contracts/public.ts`

只放对外 API 与公开读模型：

- `Engine`
- `ActiveViewApi`
- `DocumentSelectApi`
- `ViewsApi` / `FieldsApi` / `RecordsApi`
- `ActiveViewQuery`
- `ViewState`
- 性能 traces/stats public contract

#### C. `engine/contracts/internal.ts`

只放 engine 内部稳定契约：

- runtime state
- view cache
- snapshot cache
- runtime orchestration result

#### D. `engine/active/index/contracts.ts`

只放 active index 子系统内部稳定契约：

- `IndexDemand`
- `GroupDemand`
- `NormalizedIndexDemand`
- `FieldSyncContext`
- `IndexState`
- `IndexDeriveResult`

实现文件：

- `demand.ts`
- `sync.ts`
- `runtime.ts`
- `search.ts`
- `sort.ts`
- `group/runtime.ts`
- `calculations.ts`

都只消费这些 contract，不再自行承担导出职责。

### 3.3 `react`

`react` 的 contract 统一遵循“模块有自己的 `types.ts`，实现 hook/component 不直接承担公共类型出口”。

建议最终结构：

```text
react/dataview/types.ts
react/runtime/selection/types.ts
react/runtime/marquee/types.ts
react/runtime/inlineSession/types.ts
react/runtime/valueEditor/types.ts
react/views/gallery/types.ts
react/views/gallery/runtime.ts
react/views/kanban/types.ts
react/views/kanban/runtime.ts
```

其中：

- `react/runtime/*/types.ts` 已经是对的，继续保持。
- `react/dataview/runtime.ts` 与 `react/views/*/runtime.ts` 需要向这个模式靠拢。

## 4. 最终命名方案

### 4.1 必须改名

| 当前名 | 最终名 | 原因 |
| --- | --- | --- |
| `core/contracts/state.ts::ViewQuery` | `DocumentViewQuery` | 明确它是文档层 query 组合 |
| `engine/contracts/public.ts::ViewQuery` | `ActiveViewQuery` | 明确它是 active view projection |
| `core/field/kind/date.ts::DateTimeFormat` | 删除，统一为 `TimeDisplayFormat` | 避免同一语义三套命名 |

### 4.2 建议改名

| 当前名 | 建议名 | 原因 |
| --- | --- | --- |
| `GalleryActiveState` | `ActiveGalleryViewState` | 和 `ActiveViewApi` 命名方向一致 |
| `KanbanActiveState` | `ActiveKanbanViewState` | 同上 |
| `GalleryRuntime` | `GalleryViewRuntime` | 避免和 hook/runtime 文件语义重叠 |
| `KanbanRuntime` | `KanbanViewRuntime` | 同上 |

## 5. 具体迁移矩阵

| 当前位置 | 最终位置 | 动作 | 备注 |
| --- | --- | --- | --- |
| `dataview/src/core/contracts/state.ts::ViewQuery` | `dataview/src/core/contracts/state.ts::DocumentViewQuery` | 重命名 | 所有 core query helper 跟随 |
| `dataview/src/engine/contracts/public.ts::ViewQuery` | `dataview/src/engine/contracts/public.ts::ActiveViewQuery` | 重命名 | `ViewState.query` 跟随 |
| `dataview/src/core/field/kind/date.ts::DateDisplayFormat` | 删除重复出口 | 改为 import canonical type | canonical 保留在 `core/contracts/state.ts` |
| `dataview/src/core/field/kind/date.ts::DateValueKind` | 删除重复出口 | 改为 import canonical type | 同上 |
| `dataview/src/core/field/kind/date.ts::DateTimeFormat` | 删除 | 改用 `TimeDisplayFormat` | 不再制造 alias |
| `dataview/src/engine/document/entities.ts::DocumentEntityRead` | 删除或移至 `engine/contracts/internal.ts` | 删除优先 | 当前无人使用 |
| `dataview/src/engine/active/index/demand.ts::NormalizedIndexDemand` | `dataview/src/engine/active/index/contracts.ts` | 移动 | runtime state 不再依赖实现文件 |
| `dataview/src/engine/active/index/sync.ts::FieldSyncContext` | `dataview/src/engine/active/index/contracts.ts` | 移动 | index 子系统共享内部契约 |
| `dataview/src/engine/active/index/runtime.ts::IndexDeriveResult` | `dataview/src/engine/active/index/contracts.ts` | 移动 | runtime.ts 只保留实现 |
| `dataview/src/engine/active/runtime.ts::ViewRuntimeResult` | `dataview/src/engine/contracts/internal.ts` 或 `engine/contracts/runtime.ts` | 移动 | 视图 runtime orchestration 结果 |
| `dataview/src/react/dataview/runtime.ts::DataViewContextValue` | `dataview/src/react/dataview/types.ts` | 移动 | React dataview 公共契约 |
| `dataview/src/react/dataview/runtime.ts::DataViewSession` | `dataview/src/react/dataview/types.ts` | 移动 | 同上 |
| `dataview/src/react/views/gallery/runtime.ts::GalleryActiveState` | `dataview/src/react/views/gallery/types.ts` | 移动 | 视图模块公开 contract |
| `dataview/src/react/views/gallery/runtime.ts::GalleryRuntime` | `dataview/src/react/views/gallery/types.ts` | 移动 | 同上 |
| `dataview/src/react/views/kanban/runtime.ts::KanbanActiveState` | `dataview/src/react/views/kanban/types.ts` | 移动 | 同上 |
| `dataview/src/react/views/kanban/runtime.ts::KanbanRuntime` | `dataview/src/react/views/kanban/types.ts` | 移动 | 同上 |
| `dataview/src/react/views/kanban/runtime.ts::KanbanSectionVisibility` | `dataview/src/react/views/kanban/types.ts` | 移动 | 同上 |
| `dataview/src/engine/contracts/public.ts` 和 `internal.ts` 共享的 primitive | `dataview/src/engine/contracts/shared.ts` | 抽离 | 建立单向依赖 |
| `dataview/src/react/index.ts` 对 `core` 类型的 re-export | 从 `react/index.ts` 移除 | 收紧边界 | React 入口只导出 React 类型 |

## 6. 实施阶段

### Phase 0：先建立类型骨架

先创建这些文件，不改行为：

- `dataview/src/engine/contracts/shared.ts`
- `dataview/src/engine/active/index/contracts.ts`
- `dataview/src/react/dataview/types.ts`
- `dataview/src/react/views/gallery/types.ts`
- `dataview/src/react/views/kanban/types.ts`

### Phase 1：消灭明确重复名

按优先级处理：

1. `ViewQuery` 双重命名冲突
2. date 相关重复 alias
3. `react/index.ts` 的越层 re-export

理由：

- 这一步对调用方认知收益最大。
- 也最容易先建立 import path 正确性。

### Phase 2：把 engine 内部 contract 从实现文件抽离

按顺序：

1. `NormalizedIndexDemand`
2. `FieldSyncContext`
3. `IndexDeriveResult`
4. `ViewRuntimeResult`
5. `DocumentEntityRead` 删除或收口

理由：

- 这一步能彻底切断 `runtime/state.ts -> active/index/demand.ts` 这种实现路径依赖。

### Phase 3：整理 react 层 contract

按模块迁移：

1. `react/dataview/*`
2. `react/views/gallery/*`
3. `react/views/kanban/*`

每个模块统一规则：

- `types.ts` 只放 contract
- `runtime.ts` 只放 hook/runtime
- `context.tsx` 只放 provider/context
- `index.ts` 只做稳定 re-export

### Phase 4：收口导出面

最终检查：

- `dataview/src/index.ts` 可以继续做聚合出口
- `dataview/src/react/index.ts` 只剩 React 类型和组件
- `dataview/src/engine/api/engine.ts` 只转出 engine public contract
- `core/field/index.ts` 不再把重复 alias 带出

## 7. 非目标

以下内容本轮不建议纳入迁移：

- 组件级 `Props` 就地定义
- 局部 `interface Options` / `type State` / `type Input` 这类纯实现私有类型
- `engine/mutate/*` 内部局部 helper type，只要没有跨层泄漏
- `core/filter/types.ts`、`core/calculation/contracts.ts` 这类已经按领域单独收口的文件

## 8. 迁移完成后的判定标准

完成后应满足：

1. `core` 与 `engine` 不再存在同名但不同语义的 `ViewQuery`
2. `DateDisplayFormat` / `DateValueKind` 只有一份 canonical 定义
3. `engine/runtime/state.ts` 不再 import `active/index/demand.ts`
4. `react/views/*/runtime.ts` 不再导出公共 contract
5. `react/dataview/runtime.ts` 不再导出 provider/session 公共 contract
6. `react/index.ts` 不再代发 `core` 领域类型
7. `engine/contracts/internal.ts` 不再直接依赖 `engine/contracts/public.ts` 的共享 primitive

## 9. 建议执行顺序

实际执行时建议严格按这个顺序：

1. 先建 `shared.ts / contracts.ts / types.ts` 骨架
2. 再改 `ViewQuery` 命名
3. 再处理 date 重复 alias
4. 再抽离 engine internal/index contracts
5. 最后收口 react public types 与 `react/index.ts`

这个顺序的原因很简单：

- 先有目标文件，后改 import，返工最少
- 先改同名冲突，再改内部归属，类型错误更容易看懂
- 最后做 `react/index.ts` 出口收口，避免在迁移中反复破坏调用方路径

