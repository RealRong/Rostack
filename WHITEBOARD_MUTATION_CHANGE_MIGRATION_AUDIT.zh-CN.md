# Whiteboard Mutation Change 迁移审计

本文只覆盖 `whiteboard` 目录下需要迁移的地方，依据：

- `SHARED_MUTATION_SIMPLE_COMPILED_RUNTIME_FINAL_PLAN.zh-CN.md`
- `MUTATION_REPLACE_NEXT_PHASE_PLAN.zh-CN.md`

目标是把白板侧所有 mutation-facing 协议一次性迁移到最终形态，不考虑兼容成本。

## 结论

当前白板仍然同时存在三套旧心智：

- schema 内部的 `changes` 聚合
- `delta` 命名的 commit / scene / editor 流转
- `entity.replace` 驱动的整实体重建

这三套东西都需要收口到最终模型：

- `engine.replace(document)` 只保留 reset 级边界
- `MutationChange<typeof whiteboardMutationSchema>` 作为 base change
- `createWhiteboardChange(query, baseChange)` 作为 frame 边界扩展
- `entity.replace` 从 write 协议里彻底删除
- `document.delta` / `commit.delta` / `scene.update(...delta...)` 统一迁移到 `change`

## 最终要长成什么样

- `whiteboard-core` 只负责定义 schema、typed reader/writer、base change，以及白板领域的 read-only query。
- `whiteboard` 的业务聚合变化不再挂在 `schema(...).changes(...)` 里，而是挂在 frame 边界的 `createWhiteboardChange(query, baseChange)`。
- `whiteboard-engine` 的 commit 不再暴露 `delta`，而是暴露 `change`。
- `whiteboard-editor` / `whiteboard-editor-scene` 的 document mutation 输入输出也都要从 `delta` 改成 `change`。
- `entity.replace` 只允许作为 `engine.replace(document)` 的 reset 语义存在，不允许再出现在 write union、writer facade、change 聚合里。

## 1. `whiteboard-core` 必须迁移的点

- [whiteboard/packages/whiteboard-core/src/mutation/model.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/mutation/model.ts:155) 现在把 `node/edge/mindmap/group` 的 change 聚合直接写进 `schema(...).changes(...)`，并导出 `WhiteboardMutationDelta`。这必须拆掉，改成 base schema + frame 边界 `WhiteboardChangeExtension`。
- [whiteboard/packages/whiteboard-core/src/mutation/model.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/mutation/model.ts:217) 现在还在用 `write.targetId` / `TARGET_ID_SCOPE_SEPARATOR` / `readRootTargetId(...)` 这套字符串 scope 协议。这个协议要和 shared 计划一起清空。
- [whiteboard/packages/whiteboard-core/src/mutation/model.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/mutation/model.ts:258) 现在的 change 聚合还显式判断 `write.kind === 'entity.replace'`，并把它展开成全量 touched。这个分支要删除，改由 patch/create/remove/sequence/tree 的正式 writes 推导。
- [whiteboard/packages/whiteboard-core/src/mutation/model.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/mutation/model.ts:403) 这里的 `WhiteboardMutationWriterBase` 还是手写 writer 基础类型，且 `nodes/edges/groups/mindmaps` 都保留了 `.replace(...)`。后续要换成 shared 产出的 typed writer，并移除 entity-level replace。
- [whiteboard/packages/whiteboard-core/src/mutation/write.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/mutation/write.ts:162) 这里的 `WhiteboardWriter` facade 仍然暴露 `order.replace`、`nodes.replace`、`edges.replace`、`groups.replace`、`mindmaps.replace`。这些面都要收掉，保留 `patch/create/remove/move/sequence/tree`。
- [whiteboard/packages/whiteboard-core/src/mutation/write.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/mutation/write.ts:268) `edge.labels` / `edge.points` 现在是先读旧值、重建新对象、再下沉到 `write.edges(edgeId).patch(...)`。这个路径仍然依赖旧的整实体 patch/rebuild 语义，必须改成正式的字段级/子结构级 patch。
- [whiteboard/packages/whiteboard-core/src/mutation/write.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/mutation/write.ts:428) `edge.patch(...)` 现在把 `labels` / `points` 合成完整 `Edge` 后再调用 `write.edges.replace(...)`。这是白板里最明确的 `entity.replace` 入口之一，必须重写成只发正式 patch / 子集合 writes。
- [whiteboard/packages/whiteboard-core/src/mutation/write.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/mutation/write.ts:487) `document.replace` 现在会遍历 `nodes/edges/groups/mindmaps`，对已有实体调用 `replace`，对新增实体调用 `create`。这条整文档替换路径必须改成要么走 `engine.replace(document)`，要么变成真正的 document diff compiler，但不能再发 entity replace。
- [whiteboard/packages/whiteboard-core/src/mutation/compile/document.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/mutation/compile/document.ts:15) `document.replace` intent 现在直接调用 `ctx.writer.replace(...)`。如果这个 intent 继续保留，也必须改成 diff compiler；更干净的方案是删掉 intent，外部直接调用 `engine.replace(document)`。
- [whiteboard/packages/whiteboard-core/src/mutation/compile/index.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/mutation/compile/index.ts:115) compile context 仍然把 `change` 作为 `WhiteboardMutationDelta` 塞进来，而且 reader / query / writer 都是手工包的。这里要切到 shared 的 typed reader/writer/base change，再在 frame 边界挂 domain extension。
- [whiteboard/packages/whiteboard-core/src/query/index.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/query/index.ts:55) `WhiteboardQuery` 仍然暴露 `changes(input?)`，并用 `createMutationDelta(...)` 生成 `WhiteboardMutationDelta`。这个 API 需要删除或迁移成新的 frame/change 入口，query 本身只保留读模型。
- [whiteboard/packages/whiteboard-core/src/mutation/checkpoint.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/mutation/checkpoint.ts:18) checkpoint 检测现在还在把 `entity.replace + singleton` 视作 program。等 replace 协议清理后，这里必须同步改掉。
- [whiteboard/packages/whiteboard-core/src/mutation/lock.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/mutation/lock.ts:109) lock 逻辑仍然通过 `createWhiteboardQuery(reader.value)` 取 query。只要 query 读 API 保持，这里可以少动；如果 query 形态跟着重构，这个调用点要一起收口。

## 2. `whiteboard-engine` 必须迁移的点

- [whiteboard/packages/whiteboard-engine/src/mutation/index.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-engine/src/mutation/index.ts:8) 现在只是在导出 `WhiteboardMutationDelta = MutationDelta<typeof whiteboardMutationSchema>`。这条命名要迁移到 `WhiteboardMutationChange`，并和新 engine commit 形态对齐。
- [whiteboard/packages/whiteboard-engine/src/types/engineWrite.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-engine/src/types/engineWrite.ts:12) `EngineCommitBase` 里还叫 `delta`。这里要改成 `change`，并保证 `replace` 语义仍然是 reset 级 commit，而不是 entity replace。
- [whiteboard/packages/whiteboard-engine/src/runtime/engine.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-engine/src/runtime/engine.ts:85) `toEngineCommit(...)` 目前还把 `commit.delta` 原样映射到 engine commit。这个字段名要改，且 `replace` / `apply` 两种 commit 都要统一输出 change。
- [whiteboard/packages/whiteboard-engine/src/runtime/engine.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-engine/src/runtime/engine.ts:238) `engine.replace(document)` 作为 reset 边界要保留，但它返回的 commit 结构也要跟着变成 `change`，不能继续把它理解成 entity replace 的来源。

## 3. `whiteboard-editor` 必须迁移的点

- [whiteboard/packages/whiteboard-editor/src/write/document.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/write/document.ts:7) `DocumentWrite.replace(...)` 现在直接发 `document.replace` intent。这个入口要么删掉，要么改成显式走 `engine.replace(document)`，不能再依赖旧 intent 路径。
- [whiteboard/packages/whiteboard-editor/src/actions/app.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/actions/app.ts:4) App action 只是在转发 `context.write.document.replace(document)`。如果 document replace intent 收口，这个 action 也要一起改。
- [whiteboard/packages/whiteboard-editor/src/editor/create.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/editor/create.ts:48) editor 初始化时还在用 `createMutationResetDelta(...)` 生成 bootstrap delta。等变成 change 模型后，这里需要改成 reset change 或直接用 engine replace 边界。
- [whiteboard/packages/whiteboard-editor/src/editor/sync.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/editor/sync.ts:25) 同步层还在构造 `EMPTY_DOCUMENT_DELTA` / `EMPTY_EDITOR_DELTA`。这整套 delta 缓冲需要重写。
- [whiteboard/packages/whiteboard-editor/src/editor/sync.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/editor/sync.ts:134) `mergeMutationDeltas(...)` 说明这里还在做 delta 合并。最终模型下这层应该围绕 `change` / `writes` 重构，而不是继续合并 old delta。
- [whiteboard/packages/whiteboard-editor/src/editor/sync.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/editor/sync.ts:166) `commit.kind === 'replace'` / `isCheckpointProgram(commit.writes)` 的分支仍然依赖旧 commit 语义。这里要同步到新的 `change` / reset boundary。
- [whiteboard/packages/whiteboard-editor/src/state/runtime.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/state/runtime.ts:67) `EditorStateMutationDelta` 仍然是公开类型名，而且整个 runtime 仍然围绕 delta 命名。这个命名需要和 shared 的最终 API 统一。
- [whiteboard/packages/whiteboard-editor/src/state/runtime.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/state/runtime.ts:90) `EditorStateWriter.preview.*` 里现在已经是最终值写入，但外层仍然用 delta/commit 命名。这里需要和新 change 语义统一，不再混用两套名字。
- [whiteboard/packages/whiteboard-editor/src/input/features/selection/move.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/input/features/selection/move.ts:252) 这里会读取 `commit.delta` 再发 selection move。这个事件链要改成读取 `commit.change`。
- [whiteboard/packages/whiteboard-editor/src/input/features/edge/move.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/input/features/edge/move.ts:170) 同样依赖 `commit.delta` 驱动 edge move，需要改成 `change`。

## 4. `whiteboard-editor-scene` 必须迁移的点

- [whiteboard/packages/whiteboard-editor-scene/src/contracts/editor.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor-scene/src/contracts/editor.ts:94) `Input` 里还把 whiteboard mutation 作为 `delta` 暴露。这个公共输入形状要改成 `change`。
- [whiteboard/packages/whiteboard-editor-scene/src/contracts/editor.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor-scene/src/contracts/editor.ts:103) `SceneUpdateInput.document.delta` 也是同一问题，必须改名为 `change`，否则 projection 仍然在消费旧协议。
- [whiteboard/packages/whiteboard-editor-scene/src/projection/createProjectionRuntime.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor-scene/src/projection/createProjectionRuntime.ts:32) runtime normalize 现在只转发 `input.document.delta`。这里要跟着改成 `change`，并确保 scene 的 document 边界只看 base/document change。
- [whiteboard/packages/whiteboard-editor-scene/src/projection/runtimeFacts.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor-scene/src/projection/runtimeFacts.ts:63) runtime facts 仍然依赖 `EditorStateMutationDelta` 的 `delta` 名称来计算 touchedIds / overlayChanged / uiChanged。这个层面要一起迁移命名。
- [whiteboard/packages/whiteboard-editor-scene/src/model/facts.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor-scene/src/model/facts.ts:71) `createInputFacts(...)` 目前直接读取 `current.delta.node/edge/mindmap/group` 这套白板 change 形态。它是 whiteboard change 形态的最大消费者之一，必须跟着 change extension 一起重构。
- [whiteboard/packages/whiteboard-editor-scene/src/testing/builders.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor-scene/src/testing/builders.ts:31) 测试工厂还在创建 `WhiteboardMutationDelta` / `EditorStateMutationDelta`。这些 test builders 要改成新的 change 工厂。
- [whiteboard/packages/whiteboard-editor-scene/src/testing/input.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor-scene/src/testing/input.ts:53) `createEmptyRuntimeInputDelta()` / `createEditorStateInputDelta()` / `createEmptyInput()` 也都依赖 old delta 工厂，需要整体改名和改形状。
- [whiteboard/packages/whiteboard-editor-scene/test/runtime.test.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor-scene/test/runtime.test.ts:128) 测试里直接构造 `document.delta`，说明测试断言仍然跟旧协议绑定，要一起清掉。
- [whiteboard/packages/whiteboard-editor-scene/test/graphDelta.test.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor-scene/test/graphDelta.test.ts:122) 同类测试还在手工拼 `document.delta`，这类 fixture 要统一迁移。

## 5. `changes` 的最终形态应该怎么改

当前白板最关键的旧形态是：

- `whiteboardMutationSchema` 里直接挂 `changes((delta) => ...)`
- `WhiteboardMutationDelta` 既是 base change，又是 domain aggregate 的承载体
- `node/edge/mindmap/group` 的 touchedId 逻辑和 string key `changes` 表一起存在于 schema 层

最终应改成：

- `MutationChange<typeof whiteboardMutationSchema>` 只负责 base schema-level change
- `WhiteboardChangeExtension` 只负责白板领域聚合
- `createWhiteboardChange(query, baseChange)` 在 frame 边界把两者合并
- `frame.change` 是唯一对外可见的变化入口
- projection / editor-scene / engine 只读 `frame.change`，不再自己重新构造 domain change facade

白板现有的聚合分类可以保留语义，但必须换位置：

- `node.create/delete/geometry/owner/content`
- `edge.create/delete/endpoints/points/style/labels/data`
- `mindmap.create/delete/structure/layout`
- `group.create/delete/value`

这些分类不应该再由 `schema(...).changes(...)` 生产，而应该由 frame 边界的 change extension 生产。

## 6. 这次必须一并清掉的旧协议

- `entity.replace`
- `document.delta`
- `commit.delta`
- `WhiteboardMutationDelta`
- `EditorStateMutationDelta`
- `query.changes(...)`
- `schema(...).changes(...)`
- `WhiteboardMutationWriterBase` 里的 entity-level `.replace(...)`
- `write.targetId` 字符串 scope 协议
- `TARGET_ID_SCOPE_SEPARATOR`

## 7. 还需要一起改的测试和工具目录

- `whiteboard/packages/whiteboard-engine/test/*`
- `whiteboard/packages/whiteboard-editor/test/*`
- `whiteboard/packages/whiteboard-editor-scene/test/*`
- `whiteboard/packages/whiteboard-editor-scene/src/testing/*`
- `whiteboard/packages/whiteboard-editor-scene/src/projection/*`
- `whiteboard/packages/whiteboard-editor-scene/src/model/*`

这些地方虽然很多是测试或 projection 内部实现，但它们都在读写旧的 `delta` / `entity.replace` / `changes` 形态，最后必须和主协议同步，否则会留下双轨。

## 8. 执行顺序建议

如果完全按最终方案推进，白板侧的迁移顺序应该是：

- 先把 shared/mutation 的新 change / writer / reader / patch 形态补齐
- 再把 `whiteboard-core` 的 schema-attached `changes`、`entity.replace`、`query.changes`、手写 writer base 全部换掉
- 再把 `whiteboard-engine` 的 commit / runtime / history 全部从 `delta` 改为 `change`
- 再切 `whiteboard-editor` 的 document replace、sync、bootstrap、输入回调
- 最后切 `whiteboard-editor-scene` 的 contracts、runtime facts、test builders、fixture

如果要一句话概括白板最终目标，就是：

- `schema` 只描述结构
- `change` 只在 frame 边界组装
- `replace` 只保留 reset 边界
- `entity.replace` 不再存在
