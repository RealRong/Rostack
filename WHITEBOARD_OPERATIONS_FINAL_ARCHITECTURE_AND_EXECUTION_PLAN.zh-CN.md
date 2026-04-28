# Whiteboard Operations 下一轮最终收口架构与实施方案

## 目标

本文档只定义 `whiteboard operations` 下一轮收口后的最终态。

本轮目标固定为：

- 不做兼容。
- 不保留过渡层。
- 不要求阶段之间代码可运行，只要求全部完成后一次性跑通。
- 不允许继续保留为了测试、旧调用面或中间装配而存在的 runtime wrapper。
- 必须把 `whiteboard-core/operations` 收敛成纯领域定义层，把真正的 runtime 边界收回 `whiteboard-engine`。

本文档只保留当前仍未收口的部分。已经完成的旧 reducer 删除、custom/canonical 合流、engine 主路径接入 `MutationEngine` 不再重复讨论。

## 当前基线

当前主路径已经满足：

- `whiteboard-engine` 是 editor/runtime 使用的持久化 mutation engine。
- `MutationEngine` 已经是唯一的主 mutation runtime。
- `whiteboard-core` 已经提供 `compile / entities / custom / lock / checkpoint` 等核心领域能力。
- 旧 reducer runtime 已经不在主链路。

但 `operations` 仍然没有收口到长期最优，当前仍有以下异味：

- `whiteboard-core/src/operations/mutation.ts` 里仍然会临时 `new MutationEngine(...)`，形成第二套短生命周期 runtime 装配。
- `whiteboard-core/src/operations/apply.ts` 仍然把这套临时 runtime 作为 public API 暴露。
- `whiteboard-engine` 与 `whiteboard-core/operations/mutation.ts` 仍然各自装配一次 mutation runtime，职责重复。
- compile 仍然是 `MutationCompileHandlerInput -> createWhiteboardCompileScope -> scoped handler -> wrapScopedHandler -> handlers table` 这套双层包装。
- `operations/patch.ts` 仍然承担 `fields + record` 到 plain patch、以及 plain patch 再拆回旧 update input 的桥接。
- `history.ts / history-key.ts` 只是 `MutationFootprint` 的白板别名和断言壳，没有独立领域价值。
- `plan.ts` 只服务 compile 内部，但仍作为 `operations` 对外模块存在。
- `impact.ts` 是 read/projection 消费层，不属于 mutation/operation 核心，却仍挂在 `operations` 根出口。
- `operations/index.ts` 同时导出 namespace object 和一整组 named exports，形成重复出口。
- `@whiteboard/core` 根出口仍然 re-export `operations` namespace，但实际业务没有必要依赖这层聚合。

## 最终架构决策

### 1. runtime 边界唯一化

最终规则固定为：

- 只有 `whiteboard-engine/src/runtime/engine.ts` 可以创建持久化 `MutationEngine`。
- `whiteboard-core/operations` 不再创建 `MutationEngine`。
- `whiteboard-core/operations` 只输出被 runtime 消费的领域装配件。

最终数据流固定为：

```text
intent
  -> whiteboard compile handlers
  -> concrete operation batch
  -> whiteboard-engine MutationEngine
    -> canonical entity runtime
    -> custom reducer
  -> commit / delta / history / publish
```

禁止再出现：

```text
whiteboard-core/operations
  -> new MutationEngine(...)
  -> apply(...)
```

### 2. `whiteboard-core/operations` 只保留领域定义

`whiteboard-core/operations` 最终只承担以下职责：

- 定义 intent 类型。
- 定义 compile handlers。
- 定义 entity spec。
- 定义 custom reducer。
- 定义 operation batch 级领域校验。
- 定义 lock 领域规则。
- 定义 checkpoint operation 语义。

`whiteboard-core/operations` 不再承担：

- runtime constructor
- apply helper
- publish helper
- history port 装配
- document 持有
- 测试专用 mutation runtime 入口

### 3. compile 层去包装化

compile 最终不再保留以下包装层：

- `compile/contracts.ts`
- `compile/scope.ts`
- `createWhiteboardCompileScope`
- `WhiteboardCompileScope`
- `WhiteboardScopedIntentHandler`
- `wrapScopedHandler`

最终 compile 直接定义为 shared mutation 原生 handler table：

```ts
export const whiteboardCompileHandlers = {
  'node.create': (ctx) => {},
  'node.update': (ctx) => {},
  'mindmap.create': (ctx) => {}
} satisfies MutationCompileHandlerTable<
  WhiteboardMutationTable,
  Document,
  Operation,
  WhiteboardCompileServices,
  ResultCode
>
```

最终规则固定为：

- handler 直接接收 shared compile ctx。
- 读取 document、读取 services、发出 issue、发出 output 都直接基于 shared ctx 完成。
- 如需复用，只允许保留 compile 内部的无状态辅助函数，例如 `readRequiredNode(ctx, id)`、`failInvalid(ctx, message)`。
- 不允许再创建一层 whiteboard 自定义 compile scope object。

### 4. patch 桥接层必须删除

`operations/patch.ts` 不是最终态，必须删除。

当前它承担两种桥接：

- intent/update input -> canonical patch
- canonical patch -> 旧 `fields + record` update input

这意味着 operation 层仍在替下层领域 API 做协议转换，长期一定会留下中间层。

最终规则固定为：

- `Operation` 上的 canonical patch 继续保持 plain object。
- `operations` 层内部不再出现 `splitNodePatch / splitEdgePatch / splitMindmapTopicPatch` 这类“反向拆 patch”。
- `node / edge / mindmap` 领域模块必须自己吃最终的 patch 形状，或者自己在本模块内部完成转换。
- compile/custom 不再依赖 `operations/patch.ts` 作为跨模块桥。

这轮的明确落点固定为：

- `node.update` 相关内部逻辑收口到 `node` 模块内部。
- `edge.label.patch` 相关内部逻辑收口到 `edge` 模块内部。
- `mindmap.topic.patch` 相关内部逻辑收口到 `mindmap` 模块内部。
- `operations` 目录里不再保留通用 patch 转换中心。

### 5. history footprint wrapper 必须删除

`history.ts / history-key.ts` 最终必须删除。

原因固定为：

- `HistoryKey = MutationFootprint` 只是别名，没有独立领域语义。
- `createCollector / isKey / assertHistoryFootprint` 只是 shared footprint 的壳。
- `whiteboard-collab` 继续从 operations 引这些壳，会把 operations 无意义地扩成基础设施层。

最终规则固定为：

- whiteboard 直接使用 `MutationFootprint`。
- footprint 的断言和 collector 能力下沉或直接来自 `@shared/mutation`。
- `whiteboard-collab` 直接依赖 shared footprint 能力，不再经过 `@whiteboard/core/operations` 包一层。

### 6. compile 内部计划器本地化

`plan.ts` 最终不再作为 `operations` 公共模块存在。

原因固定为：

- `canvasOrderMove` 只被 `compile/canvas.ts` 使用。
- `groupOrderMove` 只被 `compile/group.ts` 使用。
- 它们属于 compile 内部算法，不是跨包公共契约。

最终规则固定为：

- 若仍需复用，迁移为 `compile/internal` 级 helper。
- 不再从 `operations` 根出口暴露。

### 7. read-side impact 必须移出 operations

`impact.ts` 不属于 operation 合同，必须从 `operations` 移出。

最终规则固定为：

- `deriveImpact / summarizeInvalidation / RESET_READ_IMPACT` 迁移到新的 read-side 模块。
- 固定新位置：`whiteboard-core/src/invalidation/impact.ts`
- `@whiteboard/core/operations` 根出口不再暴露 impact。

`isCheckpointOperation` 可以继续保留在 operations 侧，因为它判断的是 operation 语义本身，不是 read-side 派生产物。

### 8. public export 面必须缩到单轨

`operations/index.ts` 最终不再同时提供：

- `operations` namespace object
- 同一批 named exports

最终规则固定为：

- `@whiteboard/core/operations` 只保留 named exports。
- `@whiteboard/core` 根出口不再 re-export `operations` namespace。
- 所有调用方直接从 `@whiteboard/core/operations` 获取所需 named exports。

## 最终 public API

`@whiteboard/core/operations` 最终只暴露以下内容：

```ts
export {
  whiteboardCompileHandlers,
  whiteboardEntities,
  whiteboardCustom,
  validateWhiteboardOperationBatch,
  resolveLockDecision,
  validateLockOperations,
  isCheckpointOperation
}

export type {
  WhiteboardIntent,
  WhiteboardIntentKind,
  WhiteboardIntentOutput,
  WhiteboardIntentTable,
  WhiteboardMutationTable,
  WhiteboardCompileIds,
  WhiteboardCompileServices
}
```

明确不再暴露：

- `apply`
- `reduceWhiteboardOperations`
- `operations` namespace object
- `createCollector`
- `isKey`
- `assertHistoryFootprint`
- `canvasOrderMove`
- `groupOrderMove`
- `deriveImpact`
- `summarizeInvalidation`
- `RESET_READ_IMPACT`
- `WhiteboardCompileScope`
- `WhiteboardScopedIntentHandler`

## 最终模块结构

`whiteboard-core/src/operations` 最终结构固定为：

```text
operations/
  compile/
    index.ts
    canvas.ts
    document.ts
    edge.ts
    group.ts
    mindmap.ts
    node.ts
    helpers.ts
  checkpoint.ts
  custom.ts
  entities.ts
  intents.ts
  lock.ts
  validate.ts
  index.ts
```

固定删除：

- `operations/apply.ts`
- `operations/mutation.ts`
- `operations/history.ts`
- `operations/history-key.ts`
- `operations/impact.ts`
- `operations/patch.ts`
- `operations/plan.ts`
- `operations/compile/contracts.ts`
- `operations/compile/scope.ts`

固定重命名：

- `operations/intent-types.ts` -> `operations/intents.ts`
- `operations/compile.ts` -> `operations/compile/index.ts`

固定新增：

- `whiteboard-core/src/invalidation/impact.ts`

## 最终 engine 装配

`whiteboard-engine` 最终只在一个地方装配 mutation runtime：

```ts
const core = new MutationEngine({
  document,
  normalize: normalizeDocument,
  services,
  entities: whiteboardEntities,
  custom: whiteboardCustom,
  compile: whiteboardCompileHandlers,
  history
})
```

`engine.apply(...)` 在进入 `core.apply(...)` 之前只做一层白板领域校验：

```ts
const invalid = validateWhiteboardOperationBatch({
  document: core.document(),
  operations,
  origin
})
```

除此之外，不再存在第二个 runtime constructor。

## 纯函数 apply 的最终处理

`whiteboard-core` 不再提供 public `apply`。

最终规则固定为：

- 业务运行时统一使用 `whiteboard-engine`。
- `whiteboard-core` 测试如果需要“给定 document + ops 直接求值”，在测试内部本地创建 helper。
- 不允许为了测试 convenience 把 runtime constructor 留在 `operations` 公共 API。

如果后续 shared 需要真正的 stateless batch apply helper，应当下沉到 `@shared/mutation`，而不是留在 whiteboard-core。

## 一步到位实施阶段

### Phase A. 删掉 operations runtime wrapper

必须完成：

- 删除 `operations/mutation.ts`
- 删除 `operations/apply.ts`
- 删除 `@whiteboard/core/operations` 对这两者的 export
- `whiteboard-engine` 保持唯一 runtime constructor
- core 测试改为本地 helper，不再依赖 public `apply`

### Phase B. compile 去包装化

必须完成：

- 删除 `compile/contracts.ts`
- 删除 `compile/scope.ts`
- 删除 `createWhiteboardCompileScope`
- 删除 `wrapScopedHandler`
- compile handler 直接改成 shared 原生 handler table
- `compile.ts` 改为 `compile/index.ts`

### Phase C. 删掉 patch bridge

必须完成：

- 删除 `operations/patch.ts`
- 删除 compile/custom 对 `create*Patch / split*Patch` 的依赖
- `node / edge / mindmap` 内部完成最终 patch 协议收口
- `operations` 层不再承担 update <-> patch 转换

### Phase D. 删掉 history 与 plan wrapper

必须完成：

- 删除 `history.ts`
- 删除 `history-key.ts`
- `whiteboard-collab` 直接改用 shared footprint 能力
- 删除 `plan.ts`
- compile 内部自行持有 order plan helper

### Phase E. 把 read-side 能力移出 operations

必须完成：

- `impact.ts` 迁移到 `src/invalidation/impact.ts`
- `@whiteboard/core/operations` 根出口删除 impact 相关 export
- 调用方改为从新的 invalidation 模块导入

### Phase F. 收口最终 public API

必须完成：

- `operations/index.ts` 改成单一 named export 面
- 删除 `operations` namespace object
- `@whiteboard/core` 根出口删除 `operations` namespace re-export
- `intent-types.ts` 重命名为 `intents.ts`
- 所有调用方切到最终 import 路径

## 完成判定

只有同时满足以下条件，本轮才算完成：

- `whiteboard-engine` 是唯一创建 `MutationEngine` 的地方。
- `whiteboard-core/operations` 中不存在 `new MutationEngine(...)`。
- `@whiteboard/core/operations` 不再暴露 `apply` 和 `reduceWhiteboardOperations`。
- compile 不再存在 `scope/contracts/wrapScopedHandler` 这套包装。
- `operations/patch.ts` 已删除。
- `operations/history.ts` 和 `operations/history-key.ts` 已删除。
- `operations/plan.ts` 已删除。
- `operations/impact.ts` 已迁出。
- `@whiteboard/core/operations` 只保留单轨 named exports。
- `@whiteboard/core` 根出口不再 re-export `operations` namespace。

只要以上任一项未完成，就不算达到 operations 下一轮的长期最优。
