# `group/`

新的 `group engine` / UI 交互态实验内核。

当前已经可以把 `group/` 视为一个**可独立拆仓**的候选包来推进：

- 明确采用 **latest-only / engine-first / document-only**
- **不兼容**旧 `src/core/components/group`
- `engine / react(ui)` 核心边界已经成形
- 当前对外入口已经收敛成明确子入口
- demo 待迁移到 React UI 状态，暂不作为当前收敛目标

## 先看这些文档

- `./ARCHITECTURE.md`：当前架构、数据流、分层边界
- `./REPO_MIGRATION.md`：是否适合拆到新仓库，以及迁移清单
- `./ROADMAP.md`：下一阶段优先级
- `./AGENTS.md`：在 `group/` 下开发时应遵守的 AI / 工程原则

当前仓库中的更深层设计稿仍可参考：

- `../GROUP_ENGINE.md`
- `../GROUP_CHANGE_DRIVEN_ENGINE.md`
- `../GROUP_VIEW_ORDERING.md`

## 当前结论

可以迁移到新仓库做，而且我认为**现在就可以开始**。

原因不是“所有细节都完工了”，而是：

- 方向已经收敛，不再需要兼容旧实现
- 代码边界已经比以前清晰很多
- `group/` 已经有自己的 package、demo、导出入口
- `instance.document`、`changes` 边界已经明确，UI 状态直接留在 React
- 后续剩余工作大多是**在新边界内继续打磨**，而不是继续依赖主仓历史包袱

真正的迁仓前置项，主要是工程化收尾，而不是架构重做。

## 当前原则

- engine 唯一真相源只有 `document`
- `instance.document` 是内部唯一的 document store authority
- public API 只暴露 `GroupDocument`
- `core` 内部纯 read / write / history helper 优先直接消费 `GroupDocument`
- canonicalization 在 runtime create / replace 时发生；public `export()` 只负责返回隔离 copy
- 写侧主链路是：`commands -> operations -> apply -> changes`
- `changes` 是唯一正式 change protocol
- 不再公开 `ports` / default ports 这类策略注入面
- field / filter / search / sort / group 语义固定收敛在 `core/read/semantics`
- read runtime 是内部优化层，不上升为公共语义
- UI state 不进入 engine
- 排序只保留：`view.ordering + placements + derived projection order`
- field sort 视为 display overlay；sort 激活时读侧忽略 placements，clear sort 后恢复 persisted manual order
- `placements.rank` 使用可插入的 sparse rank
- `view.placeRecord` 保留单记录 fast path；`view.placeRecords` 提供 block reorder 的原子写入口
- 当前先做内部打通，不优先插件化

## 对外入口

当前导出入口：

- `@rendevoz/group-next`
- `@rendevoz/group-next/engine`
- `@rendevoz/group-next/react`

其中：

- 根入口保留 foundation + engine 常用导出
- 根入口不再公开 `GroupEnginePorts` / `createDefaultGroupEnginePorts`
- `engine` 暴露 headless runtime facade 与稳定 contracts，不再公开 runtime commit/history helper utilities
- `react` 提供 UI 状态 hooks / reconcile 基础，以及 `GroupTableView` / `GroupKanbanView` 这类 React surface
- `engine.read.record.* / field.* / view.* / search.* / index.*` 是正式稳定读 facade
- `engine.read.view` 当前已提供 `axis / columns / orderedRecords / visibleRecords / recordPathMap / visibleRecordIds / groupedRecords` 这组 projection read
- `engine.read.query(...)` 已删除，不再保留 detached selector snapshot 兼容层
- `engine.read.events.subscribe(...)` 是正式 change fanout
- adapter 暂不内置，后续如需接入层，优先在 engine API 稳定后再外置实现

## 当前已落地

- `document-only` 基础状态模型
- `instance.document` 只保留 `peekDocument()` / `installDocument()` 这层 document store authority
- commit runtime 统一承接 `applyOperations()`、history 维护与 `document.replace()` 生命周期
- public `engine.document.export()` / `replace()` 由 facade 基于 runtime 组装，不把内部 store 细节暴露出去
- document-centric `command -> operation -> reducer` 主链路
- public write API 只保留 `dispatch(command | command[])`
- inverse operations 驱动的 `history / undo / redo`
- 只保留 `changes` 提交结果模型
- commit changeSet / history stack 的纯协议与 helper 已收敛到 `core`
- `engine.read.events.subscribe(listener)` 只 fanout 可选的 `changes` 摘要
- `engine.read.record.* / field.* / view.* / search.* / index.*` facade 已落地，内部直接基于 document/runtime ref 做 targeted subscribe
- table / kanban 已改走 facade，不再依赖 selector snapshot 读路径
- read-model runtime：`search` / `field value index` / `view materialization`
- read 内部已收敛为 `changes -> readRuntime.reconcile -> explicit facade pull result`
- `core/read/*` 保持内部实现，不再公开独立 `./read` 子入口
- `search.recordIds()` / `index.fieldValueBuckets()` 的稳定缓存输出
- react hooks 已提供 UI 状态基础能力（selection / focus / currentView）
- react surface 已落地 `GroupTableView` / `GroupKanbanView`
- table public react surface 已收敛到统一 `useTable()` facade；读统一为 namespace 下的 `get/use`
- kanban options schema 已收敛到 `core/contracts/kanban` 与 `core/model/kanban`
- 根入口已导出 `resolveGroupKanbanOptions()` / `patchGroupKanbanViewOptions()`
- `useKanban()` 已收敛到统一 resource facade：读统一走 namespace 下的 `get/use`，写只保留 `view.change`、`options.patch`、`cards.create/move`
- kanban 当前采用 `view.options.kanban` 保存 bucket catalog；bucket 内容仍由 `groupBy + read projection + placements` 派生
- `group/demo` 已同时覆盖 table / kanban 两个 view

## 不在 engine 内的内容

以下能力不应直接进入 engine：

- selection
- active cell / focused cell
- current UI view
- hover / drag / editing / scroll
- DOM / React 生命周期临时态
- 只服务于某个单一 view 的交互细节

这些都应留在 UI / 外部调用层。

## 目录说明

- `src/core/contracts`：状态、commands、operations、envelope、changeSet
- `src/core/commit`：changeSet / history stack helpers
- `src/core/model`：document / ordering canonical helpers
- `src/core/write`：normalize / validate / planning / apply / inverse / history
- `src/core/read/semantics.ts`：field / filter / search / sort / group 的 canonical 读语义
- `src/core/read/contracts`：projection / axis contracts
- `src/core/read/derive`：纯派生算法
- `src/core/read/runtime`：search / field value index / view materialization runtime
- `src/engine/instance`：context / create / facade / document
- `src/engine/runtime`：commit orchestration / read / write
- `src/react`：UI 侧 hooks / reconcile / table / kanban 状态建模与 view surface
- `demo/`：本地验证用 demo

## 本地验证

- `npm run typecheck`
- `npm run test`
- `npm run demo:typecheck`
- `npm run demo:dev`
- `npm run demo:build`
- `npm run build`

## 迁仓时要注意

当前 `group/` 已经适合拆仓，但仍有几个工程化收尾点：

- 根目录还有一批设计文档，拆仓时要同步搬到新仓库 `docs/`
- 当前包还是 `private: true`，若要单独发布需要重新整理 metadata / deps / CI

如果只是开始在新仓库继续开发，这些都不是阻塞项。
