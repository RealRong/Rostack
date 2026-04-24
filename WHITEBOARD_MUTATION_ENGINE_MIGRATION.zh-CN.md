# Whiteboard MutationEngine 迁移完成说明

## 1. 当前状态

本次迁移已经完成，且按“不做兼容、不保留双轨、直接收口到底层统一设施”的目标落地。

当前 Whiteboard 写入链已经满足下面几点：

- `whiteboard-engine` 写入内核由 `new MutationEngine(...)` 驱动
- public 写接口全面使用 `Intent`
- `whiteboard-engine/src/write/*` 旧接入层命名已经删除，统一收口到 `mutation/*`
- runtime 不再手写 commit orchestration，只保留 `MutationEngine + publish` 薄壳
- local history / collab 直接围绕 `engine.history` 与 `engine.writes` 运转
- record operation、history footprint、editor/react/schema 消费端全部切到 `Path`
- `shared/mutation/collab` 不再对本地 user write 重复 capture history

这份文档只记录最终落地后的结构、API 与实施结果，不再保留过渡方案。

---

## 2. 最终架构

最终主轴已经固定为：

`Intent -> compile -> Operation[] -> MutationEngine.apply -> EngineWrite -> publish -> EnginePublish`

按层拆分如下：

### 2.1 shared 层

`shared/mutation` 负责通用底层设施：

- `MutationEngine`
- `history`
- `collab`
- `Path`
- `MutationResult`

其中关键收口点有两个：

- `MutationEngineSpec.apply` 支持成功 / 失败双分支，engine 直接处理 apply 失败
- `shared/mutation/collab.ts` 不再重复 capture 本地 user write，history 单一来源固定为 engine 内部 controller

### 2.2 whiteboard-engine mutation 层

`whiteboard/packages/whiteboard-engine/src/mutation/` 已经成为唯一写入接入层：

- `spec.ts`
- `compile/*.ts`
- `apply.ts`
- `publish.ts`
- `types.ts`

这里负责：

- `Intent -> Operation[]`
- `Operation[] -> EngineWrite`
- `EngineWrite -> EnginePublish`

原先散在 engine 包里的旧壳已删除：

- `src/types/command.ts`
- `src/contracts/command.ts`
- `src/write/*`
- `src/runtime/document.ts`
- `src/runtime/publish.ts`
- `src/runtime/state.ts`
- `src/mutation/draft.ts`
- `src/change/*`

### 2.3 whiteboard-engine runtime 层

`whiteboard/packages/whiteboard-engine/src/runtime/engine.ts` 现在只负责：

- 解析 `config / registries / history`
- 创建 `whiteboardMutationSpec`
- 创建 `new MutationEngine(...)`
- 暴露 public engine
- 对 checkpoint write 做 history clear

它不再负责：

- compile orchestration
- apply orchestration
- 本地 write runtime
- 本地 history 内核创建

---

## 3. 最终 API 形态

## 3.1 Intent 表

Whiteboard 对外已经用本地表驱动类型，不再暴露旧 `Command*` 体系。

核心形态如下：

```ts
export interface WhiteboardIntentTable {
  ...
}

export type IntentKind = keyof WhiteboardIntentTable & string

export type Intent<K extends IntentKind = IntentKind> =
  WhiteboardIntentTable[K]['intent']

export type IntentData<K extends IntentKind = IntentKind> =
  WhiteboardIntentTable[K]['output']

export type ExecuteResult<K extends IntentKind = IntentKind> =
  MutationResult<IntentData<K>, EngineWrite, WhiteboardErrorCode>
```

这里最终采用的是 `IntentData`，不再保留之前设计稿里的 `IntentOutput` 命名。

## 3.2 结果壳

Whiteboard 结果壳已经完全下沉到 shared 通用结果模型：

```ts
export type IntentResult<T = void> =
  MutationResult<T, EngineWrite, WhiteboardErrorCode>
```

Whiteboard 只保留领域别名，不再维护本地独立的 `CommandResult / CommandFailure` 命名。

## 3.3 Engine

最终 public engine 形态已经是：

```ts
export interface Engine {
  readonly config: BoardConfig
  readonly writes: WriteStream<EngineWrite>
  readonly history?: HistoryController

  current(): EnginePublish
  subscribe(listener: (publish: EnginePublish) => void): () => void

  execute<K extends IntentKind>(
    intent: Intent<K>,
    options?: MutationOptions
  ): ExecuteResult<K>

  apply(
    ops: readonly Operation[],
    options?: MutationOptions
  ): IntentResult
}
```

## 3.4 createEngine

创建入口已经支持显式 history 配置：

```ts
export interface CreateEngineOptions {
  registries?: CoreRegistries
  document: Document
  onDocumentChange?: (document: Document) => void
  config?: Partial<BoardConfig>
  history?: Partial<EngineHistoryConfig>
}
```

history controller 直接由 engine 暴露，不再由 history / collab 包自行创建私有内核。

---

## 4. 各阶段落地结果

## Phase 1：术语迁移

已完成：

- `types/command.ts -> types/intent.ts`
- `contracts/command.ts -> contracts/intent.ts`
- `CommandResult / CommandFailure -> IntentResult / MutationResult`
- engine public API 全部切到 `Intent`

额外清理：

- `MindmapCommandResult -> MindmapMutationResult`
- `mindmap/commands.ts -> mindmap/mutate.ts`
- `mindmap.command -> mindmap.mutate`

## Phase 2：mutation 接入层重组

已完成：

- `write/compile/* -> mutation/compile/*`
- `write/apply.ts -> mutation/apply.ts`
- publish 逻辑固定在 `mutation/publish.ts`
- `change/*` 已并回 `mutation/publish.ts`

结果是：engine 包内不再保留写入接入层的旧目录命名。

## Phase 3：runtime 薄壳化

已完成：

- `runtime/engine.ts` 改为 `MutationEngine + publish` 薄壳
- 删除 `runtime/document.ts`
- 删除 `runtime/publish.ts`
- 删除 `runtime/state.ts`

现在 runtime 只承担组装职责，不再承担写入内核职责。

## Phase 4：history / collab 收口

已完成：

- `whiteboard-history` 直接包装 `engine.history`
- `whiteboard-collab` 直接包装 `engine.history`
- `history` 配置前移到 `createEngine(...)`
- shared collab 不再重复 capture 本地 user write

关键结果：

- 本地历史只有一份 controller
- undo / redo / invalidation 与 shared change 流程已经对齐
- 不再存在 collab 私有历史内核

## Phase 5：Path 统一

已完成：

- `whiteboard-core/src/types/operations.ts`
- `whiteboard-core/src/mutation/recordPath.ts`
- `whiteboard-core/src/spec/history/key.ts`
- reducer record 写入点
- schema field / visibility
- engine compile 层
- editor write / layout / panel
- react schema 消费端
- 相关测试断言

现在 Whiteboard 的 record path 统一为：

- `Path`
- `mutationPath.eq / overlaps / append / root`
- `draftPath.get / set / unset`

旧的 string path split/join 兼容逻辑已删除。

---

## 5. 删除与清理确认

下面这些旧实现已经清理掉：

- `whiteboard-engine/src/write/*`
- `whiteboard-engine/src/runtime/document.ts`
- `whiteboard-engine/src/runtime/publish.ts`
- `whiteboard-engine/src/runtime/state.ts`
- `whiteboard-engine/src/mutation/draft.ts`
- `whiteboard-engine/src/change/*`
- `whiteboard-engine/src/types/command.ts`
- `whiteboard-engine/src/contracts/command.ts`

下面这些旧模式也已经移除：

- `CommandResult / CommandFailure`
- `compileCommand`
- record op 的 `path: string`
- history key 的 string overlap 逻辑
- collab 侧重复 history capture

---

## 6. 对照完成标准

下列标准已经全部满足：

- Whiteboard 写入内核由 `new MutationEngine(...)` 驱动
- 外层 engine 只是 `MutationEngine + Publish` 的薄壳
- public API 全面使用 `Intent`
- `EngineWrite` 继续使用 shared `Write`
- collab / history 围绕 `engine.writes` 与 `engine.history` 运转
- record operation 与 footprint 全量使用 `Path`
- runtime 中不再存在手写 commit orchestration

---

## 7. 校验结果

已通过：

- `pnpm --filter @shared/mutation run typecheck`
- `pnpm --filter @whiteboard/core run typecheck`
- `pnpm --filter @whiteboard/engine run typecheck`
- `pnpm --filter @whiteboard/history run typecheck`
- `pnpm --filter @whiteboard/collab run typecheck`
- `pnpm --filter @whiteboard/editor run typecheck`
- `pnpm --filter @whiteboard/react run typecheck`
- `pnpm --filter @whiteboard/editor-graph run typecheck`

已通过的针对性测试：

- `pnpm --filter @shared/mutation test -- test/engine.test.ts`
- `pnpm --filter @whiteboard/core test -- test/schema.test.ts test/node-update.test.ts test/transform.test.ts`
- `pnpm --filter @whiteboard/engine test -- test/engine-write.test.ts`
- `pnpm --filter @whiteboard/collab test -- test/yjs-session.test.ts`
- `pnpm --filter @whiteboard/editor test -- test/transform-session.test.ts`

---

## 8. 一句话结论

Whiteboard 写入链已经完成从“本地定制 commit runtime”到“统一 `MutationEngine` 内核”的收口，旧实现已清理，剩下的就是沿这套统一底层继续扩展 Dataview / Whiteboard 的共用写入基础设施。
