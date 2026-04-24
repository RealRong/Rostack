# Dataview MutationEngine 整体迁移方案

本文只描述 `dataview` 写入侧的最终形态、已落地实现，以及清理结果。

约束明确：

- 不保留兼容层
- 不接受双轨实现
- 旧 commit runtime / planner / delta projector 必须退出主轴
- 以长期最优、结构简单、职责清晰为准

---

## 1. 最终主轴

`dataview` 当前已经统一到下面这条链路：

```text
Intent[]
  -> compileIntents(...)
  -> DocumentOperation[]
  -> MutationEngine.execute / executeMany / apply
  -> EngineWrite { inverse, footprint, trace }
  -> publish.reduce(...)
  -> DataviewCurrent
```

对应代码收口点：

- `dataview/packages/dataview-core/src/mutation/compile/index.ts`
- `dataview/packages/dataview-core/src/mutation/apply.ts`
- `dataview/packages/dataview-core/src/mutation/footprint.ts`
- `dataview/packages/dataview-core/src/mutation/trace.ts`
- `dataview/packages/dataview-engine/src/mutation/spec.ts`
- `dataview/packages/dataview-engine/src/mutation/publish.ts`
- `dataview/packages/dataview-engine/src/mutation/delta.ts`
- `dataview/packages/dataview-engine/src/createEngine.ts`

---

## 2. 最终 API 形态

### 2.1 core mutation

`dataview-core` 现在只保留纯 mutation 原语：

- `Intent`
- `DocumentOperation`
- `compileIntents(...)`
- `applyOperations(...)`
- `collectOperationFootprint(...)`
- `dataviewTrace`

compile 目录内部也已经统一到 `compile*` 语义，不再保留 `planAction / PlannerScope / PlannedActionResult` 这类旧命名。

### 2.2 engine public API

`dataview-engine` 当前对外 API 固定为：

```ts
interface Engine {
  readonly writes: EngineWrites
  readonly history?: DataviewHistory
  readonly active: ActiveViewApi
  readonly views: ViewsApi
  readonly fields: FieldsApi
  readonly records: RecordsApi
  readonly performance: PerformanceApi

  current(): DataviewCurrent
  subscribe(listener: (current: DataviewCurrent) => void): () => void

  doc(): DataDoc
  load(document: DataDoc): void

  execute<K extends IntentKind>(
    intent: Intent<K>,
    options?: MutationOptions
  ): ExecuteResult<K>

  executeMany(
    intents: readonly Intent[],
    options?: MutationOptions
  ): BatchExecuteResult

  apply(
    operations: readonly DocumentOperation[],
    options?: MutationOptions
  ): MutationResult<void, EngineWrite, DataviewErrorCode>
}
```

已经删除的旧 public 形态：

- `result()`
- `document.get()`
- `document.replace()`
- `execute(action | action[])`
- `ActionResult`
- `CommitResult`

### 2.3 history / footprint

`EngineWrite` 已经不再使用 `Key = never`，当前为真实 footprint key：

```ts
type EngineWrite = Write<
  DataDoc,
  DocumentOperation,
  DataviewMutationKey,
  { trace: DataviewTrace }
>
```

其中 `DataviewMutationKey` 已统一为 path 型 key，并用于：

- history conflict
- undo / redo replay
- 后续 collab 复用

### 2.4 publish / delta

delta 已经完全收口到 mutation publish 层：

- `dataview/packages/dataview-engine/src/mutation/publish.ts`
- `dataview/packages/dataview-engine/src/mutation/delta.ts`

`apply` 只负责：

- 文档变更
- inverse
- footprint
- trace

`publish` 只负责：

- active snapshot
- document delta
- active delta
- `DataviewCurrent.publish`

---

## 3. MutationEngineSpec 形态

`dataview-engine` 当前已经通过 `createDataviewMutationSpec(...)` 接入统一内核：

```ts
createDataviewMutationSpec({
  history,
  performance
})

new MutationEngine({
  doc,
  spec
})
```

`spec` 的最终职责边界已经固定：

- `clone`：文档 clone
- `normalize`：文档标准化
- `compile`：`Intent -> DocumentOperation[]`
- `apply`：`DocumentOperation[] -> EngineWrite`
- `publish`：`write -> DataviewPublishState`
- `history`：track / clear / conflict 策略

`createEngine.ts` 已经不再自行编排 commit runtime。

---

## 4. 已删除旧实现

下面这些旧主轴文件已经删除，不再参与运行：

- `dataview/packages/dataview-core/src/contracts/actions.ts`
- `dataview/packages/dataview-core/src/operation/applyOperations.ts`
- `dataview/packages/dataview-engine/src/mutate/planner/fields.ts`
- `dataview/packages/dataview-engine/src/mutate/planner/index.ts`
- `dataview/packages/dataview-engine/src/mutate/planner/records.ts`
- `dataview/packages/dataview-engine/src/mutate/planner/scope.ts`
- `dataview/packages/dataview-engine/src/mutate/planner/views.ts`
- `dataview/packages/dataview-engine/src/mutate/commit/runtime.ts`
- `dataview/packages/dataview-engine/src/mutate/commit/trace.ts`
- `dataview/packages/dataview-engine/src/runtime/history.ts`
- `dataview/packages/dataview-engine/src/core/runtime.ts`
- `dataview/packages/dataview-engine/src/core/delta.ts`
- `dataview/packages/dataview-engine/src/active/publish/delta.ts`
- `dataview/packages/dataview-engine/src/contracts/core.ts`

这些能力已经分别迁移到：

- `dataview-core/src/mutation/*`
- `dataview-engine/src/mutation/spec.ts`
- `dataview-engine/src/mutation/publish.ts`
- `dataview-engine/src/mutation/delta.ts`

---

## 5. 分阶段对照

### Phase 1：术语迁移

已完成：

- `Action -> Intent`
- `ActionResult / CommitResult -> MutationResult`
- `execute(action | action[]) -> execute / executeMany`

### Phase 2：core mutation 原语收口

已完成：

- compile / apply 全量下沉到 `dataview-core/src/mutation/*`
- `executeOperation.ts` / `reducer.ts` 旧轴已退出
- compile 内部统一为 `CompileScope + CompiledIntentResult + compile*`

### Phase 3：MutationEngineSpec 接入

已完成：

- `createEngine.ts` 改为 `new MutationEngine({ doc, spec })`
- `createWriteControl(...)` 退出
- `createEngineHistory(...)` 退出

### Phase 4：history footprint 真建模

已完成：

- `Key = never` 删除
- footprint 改为真实 path key
- history conflict 使用统一 key 规则

### Phase 5：publish 收口

已完成：

- document delta / active delta 合流到 `mutation/delta.ts`
- publish 成为唯一 delta 派生出口
- runtime source 已切到 `engine.current().publish?.delta`

### Phase 6：public facade 清理

已完成：

- `current()` / `doc()` / `load()` 成为稳定读取入口
- facade API 全部改走 `execute / executeMany / apply`
- history 改为直接暴露 raw controller

---

## 6. 额外落地说明

### 6.1 history 恢复路径

undo / redo 当前固定为：

```ts
const ops = history.undo() // or redo()
engine.apply(ops, { origin: 'history' })
history.confirm() // or cancel('restore')
```

不再包装旧 history runtime。

### 6.2 load reset 语义

`load()` 当前通过 publish `init()` 返回 reset delta，保证 runtime source 能正确做全量重建。

### 6.3 normalize 根因修复

`dataview/packages/dataview-core/src/document/normalize.ts` 已修复 `activeViewId` 保留逻辑，不再把 active view 误重置为首个 view。

---

## 7. 验证结果

当前迁移完成后的验证结果：

- `pnpm -C dataview run typecheck`
- `pnpm -C dataview run test`

均已通过。

---

## 8. 完成标准核对

下面各项当前都已经满足：

- `createEngine.ts` 内部使用 `new MutationEngine(...)`
- 写入主轴中不再存在 `Action`
- 旧 planner / commit runtime / history runtime 已删除
- delta 已完全从旧 runtime 迁到 publish
- public engine 已切到 `current()` / `doc()` / `load()`
- facade 已切到 `execute / executeMany / apply`
- history footprint 已使用真实 path key
- runtime source 已切到 `current().publish?.delta`
- compile 内部旧 planner 命名已清理

结论：`dataview` 的 MutationEngine 迁移已全部落地，旧实现已退出主轴，当前代码状态与本文档一致。
