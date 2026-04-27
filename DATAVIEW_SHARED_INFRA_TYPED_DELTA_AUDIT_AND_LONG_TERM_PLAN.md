# Dataview Shared Infra 类型化 Delta 审计与长期方案

状态：本轮仅做调研与方案整理，不改业务代码。

## 范围

本文档覆盖三件事：

1. `dataview-runtime/src/source/patch.ts` 为什么会显得别扭，以及它背后的根因。
2. 仓库里所有已确认存在同类问题的地方。
3. 长期最优架构，以及推荐的迁移顺序。

## 执行摘要

当前的问题并不只存在于 `dataview-runtime/src/source/patch.ts`。

同一类结构性问题同时出现在三层：

1. 上游 contract 在导出时丢失了领域类型信息，或者公共 API 断裂。
2. package 根 barrel 没有稳定暴露真实 public surface。
3. 下游代码不得不本地补 `parse/decode/adapt` 逻辑，把缺失的语义重新拼回来。

所以 `patch.ts` 现在看起来很拧巴，不是因为这一个文件写差了，而是因为它同时在替两类问题兜底：

1. `@shared/delta` 产出的 delta leaf 类型过弱。
2. `@shared/delta`、`@shared/mutation`、`@shared/projection` 的根导出面不完整。

长期最优解不是单点“整理一下 `patch.ts`”，而是：

1. 先修复 `shared/*` 的稳定包级 contract。
2. 再让 delta 在生产端保留 typed ids。
3. 然后把 runtime 里的 decode/parse 补丁全部移除。
4. 最后在 whiteboard 仍可工作的前提下逐步完成迁移。

## 核心诊断

这批问题的共同模式是：

1. 某个 infra package 内部其实已经有正确 primitive。
2. 但它的根导出不再稳定地暴露这些 primitive。
3. 上层包仍然按“预期中的公共 API”来写。
4. 另一些下游包则开始用本地 `parse/decode/adapt` 方式补洞。

它在代码里具体表现为：

1. `IdDelta<unknown>`，而不是 `IdDelta<RecordId | ItemId | ValueRef | ...>`。
2. 字符串编码后的 key 泄漏到 package 边界之外。
3. runtime 层去解析本不该由它解析的 ID。
4. 同一概念存在多套重叠 API。
5. 一个 shared package 的 root import 只导出了一小部分实际公共能力。

## 已确认的同类问题分布

### 1. Dataview Runtime Source Projection 层

涉及文件：

1. `dataview/packages/dataview-runtime/src/source/patch.ts`
2. `dataview/packages/dataview-runtime/src/source/createDocumentSource.ts`
3. `dataview/packages/dataview-runtime/src/source/createActiveSource.ts`

现象：

1. `patch.ts` 里定义了 `IdDeltaLike`，内部是 `ReadonlySet<unknown>`。
2. `applyEntityDelta` 和 `applyMappedEntityDelta` 需要调用方传 `parseKey`。
3. `createDocumentSource.ts` 通过 `'\u0000'` 分隔字符串去反解 `ValueRef`。
4. `createActiveSource.ts` 本地存在 `parseItemId`、`parseSectionId`、`parseFieldId`。

为什么它属于同类问题：

1. runtime 的职责应该是把 typed delta 投影到 store。
2. runtime 不应该从 `unknown` 里猜一个 key 是不是合法领域 ID。
3. runtime 更不应该知道 `ValueRef` 的字符串编码细节。

影响：

1. projection 代码读起来比业务逻辑本身还重。
2. 类型安全从编译期退化成了运行时过滤。
3. 未来一旦 ID 形态调整，runtime glue 会继续扩散。

### 2. Dataview Engine Delta Contract

涉及文件：

1. `dataview/packages/dataview-engine/src/contracts/delta.ts`
2. `dataview/packages/dataview-engine/src/mutation/documentDelta.ts`
3. `dataview/packages/dataview-engine/src/active/publish/activeDelta.ts`

现象：

1. `documentChange` 和 `activeChange` 都建立在通用 `'ids'` spec 之上。
2. 导出的 `DocumentDelta`、`ActiveDelta` 直接来自 `change(...).create()`。
3. `DocumentDelta.values` 实际上通过编码后的字符串 key 在传递。
4. `activeDelta.ts` 里已经能看到 `IdPatch<TId = unknown>` 这类类型压力。

为什么它属于同类问题：

1. delta 生产端其实知道准确的领域 ID 类型。
2. 但到了导出 contract 时，类型信息被冲掉了。
3. 下游拿到的是比真实模型更弱的形态。

影响：

1. engine 和 runtime 被隐藏的字符串编码协议绑死。
2. dataview 的 delta 类型弱于真实领域模型。
3. 下游必须重新解释上游意图。

### 3. `@shared/delta` 公共契约漂移

涉及文件：

1. `shared/delta/src/index.ts`
2. `shared/delta/src/change.ts`
3. `shared/delta/src/changeState.ts`
4. `shared/delta/src/entityDelta.ts`
5. `shared/delta/src/entityPublish.ts`
6. `shared/delta/src/entitySync.ts`
7. `shared/delta/src/idDelta.ts`
8. `shared/delta/src/listChange.ts`
9. `shared/delta/src/publishStruct.ts`
10. `shared/delta/src/writeEntityChange.ts`

现象：

1. `shared/delta/src/index.ts` 目前只导出了 `change`。
2. 但包内实现和测试已经明显依赖更大的 public surface：
   `idDelta`、`entityDelta`、`publishEntityList`、`createEntityDeltaSync`、`projectListChange`、`publishStruct`、`changeState` 一整套。
3. `change.ts` 里的 `'ids'` leaf 最终是 `IdDelta<unknown>`。
4. `changeState.ts` 形成了另一套平行的 delta schema 体系。

为什么它属于同类问题：

1. 这个包内部其实已经有这些能力。
2. 但 root contract 没有把它们稳定暴露出来。
3. 同时 generic builder 在 leaf 级别丢了类型。

影响：

1. dataview 在包边界处直接断掉。
2. whiteboard 依赖旧 `changeState`，不能被忽略。
3. 一个 package 内实际上存在两套 delta DSL，但没有清晰的长期边界。

### 4. `@shared/mutation` 公共契约漂移

涉及文件：

1. `shared/mutation/src/index.ts`
2. `shared/mutation/src/engine.ts`
3. `shared/mutation/src/compiler.ts`
4. `shared/mutation/src/planningContext.ts`
5. `shared/mutation/src/mutationTrace.ts`
6. `shared/mutation/src/path.ts`
7. `shared/mutation/src/meta.ts`
8. `shared/mutation/src/localHistory.ts`
9. `shared/mutation/src/createHistoryPort.ts`

现象：

1. `shared/mutation/src/index.ts` 现在只导出了：
   `createMutationEngine`
   `createHistoryPort`
2. 但 dataview 和 whiteboard 实际从 `@shared/mutation` 根包读取大量符号：
   `compile`、`planningContext`、`mutationTrace`、`path`、`MutationOptions`、`MutationResult`、`MutationOperationsSpec`、`HistoryPort`、`CommandMutationEngine`、`OpSync` 等。
3. 现在还存在两套不同语义的 `createHistoryPort`：
   一个是 `createHistoryPort.ts` 里的轻量 list-like helper；
   一个是 `localHistory.ts` 里的 engine-coupled history port。

为什么它属于同类问题：

1. package root 已经不能代表真实的公共 API。
2. `createHistoryPort` 这个名字还掩盖了两个不兼容抽象。

影响：

1. dataview 和 whiteboard 的 typecheck 会一起爆。
2. 消费方无法判断哪个 history abstraction 才是公开标准。
3. 即便不做领域重构，这个包的公共 contract 也已经不稳定。

### 5. `@shared/projection` 公共契约漂移

涉及文件：

1. `shared/projection/src/index.ts`
2. `shared/projection/src/runtime.ts`
3. `shared/projection/src/core.ts`
4. `shared/projection/src/scope.ts`
5. `shared/projection/src/trace.ts`
6. `shared/projection/src/phase.ts`
7. `shared/projection/src/phaseGraph.ts`
8. `shared/projection/src/plan.ts`
9. `shared/projection/src/metrics.ts`

现象：

1. `shared/projection/src/index.ts` 目前只导出了 `createProjectionRuntime`。
2. 但消费方实际还在从 `@shared/projection` 根包读这些类型：
   `ProjectionSpec`、`Revision`、`ProjectionTrace`、`ScopeSchema`、`ScopeInputValue`、`ScopeValue`。
3. 这些类型本来就存在于包内，尤其在 `runtime.ts`、`core.ts`、`trace.ts`、`scope.ts` 中。

为什么它属于同类问题：

1. root export 只暴露了一个运行时入口。
2. 但真实消费者把它当作一个带完整类型契约的框架包在使用。

影响：

1. projection 内部能力无法被干净复用。
2. dataview 和 whiteboard 都会在公共 facade 这一层断裂。

### 6. Whiteboard 对旧 Delta DSL 的强依赖

涉及文件：

1. `whiteboard/packages/whiteboard-editor-scene/src/contracts/delta.ts`
2. `whiteboard/packages/whiteboard-editor-scene/src/runtime/model.ts`
3. `whiteboard/packages/whiteboard-editor-scene/src/model/items/patch.ts`
4. `whiteboard/packages/whiteboard-engine/src/mutation/publish.ts`
5. `whiteboard/packages/whiteboard-core/src/reducer/internal/state.ts`
6. 以及其他大量直接导入 `idDelta`、`entityDelta`、`ChangeSchema`、`createChangeState` 的 whiteboard 文件

现象：

1. whiteboard 大量直接使用 `idDelta`。
2. whiteboard 也强依赖 `changeState` 和 `ChangeSchema`。
3. whiteboard 同时依赖 `@shared/projection` 和 `@shared/mutation` 的根导出完整可用。

为什么这件事重要：

1. 这说明后续不能只按 dataview 的视角粗暴重写 shared infra。
2. `changeState` 不是死代码，不能简单删。

影响：

1. shared infra 清理必须按阶段推进，不能局部拍脑袋。

## 哪些不属于这次问题的主轴

下面这些 parse helper 虽然名字上看起来像“parse”，但它们属于领域编码或 UI key scheme，不是这次 infra contract 缺陷的主目标：

1. `dataview-core/src/view/groupWrite.ts`
2. `dataview-core/src/field/kind/date.ts`
3. `dataview-react/src/views/table/virtual/blockId.ts`
4. `dataview-core/src/operations/key.ts`

原因：

1. 这些解析逻辑本身就是领域规则或展示层 key 规则的一部分。
2. 它们不是 runtime 在替上游类型丢失擦屁股。

这些位置可以后续顺手做一致性审视，但不该和这轮核心治理混在一起。

## 长期最优架构

### A. Public Package Facade 必须稳定且有意图

每个 `shared/*` package 的 root import 都应该是稳定 contract，而不是偶然导出。

规则：

1. 只要多个 package 在从 `@shared/x` 读取某个符号，这个符号就必须从 `shared/x/src/index.ts` 稳定导出。
2. 内部重构不能悄悄缩窄 root surface。
3. 即使在 monorepo 内部，root barrel 也应该被视为版本化 API 边界。

这条规则立即适用于：

1. `@shared/delta`
2. `@shared/mutation`
3. `@shared/projection`

### B. Delta Leaf 必须保留领域 ID 类型

最优目标：

1. `DocumentDelta.records` 是 `IdDelta<RecordId>`
2. `DocumentDelta.fields` 是 `IdDelta<FieldId>`
3. `DocumentDelta.schemaFields` 是 `IdDelta<CustomFieldId>`
4. `DocumentDelta.views` 是 `IdDelta<ViewId>`
5. `DocumentDelta.values` 是 `IdDelta<ValueRef>`
6. `ActiveDelta.items` 是 `IdDelta<ItemId>`
7. `ActiveDelta.sections` 是 `IdDelta<SectionId>`
8. `ActiveDelta.summaries` 是 `IdDelta<SectionId>`
9. `ActiveDelta.fields` 是 `IdDelta<FieldId>`

直接结果：

1. runtime projection 不再需要 `parseKey`。
2. `ValueRef` 的字符串编码退回成 engine 内部实现细节。

### C. 字符串 Key 编码不能跨越 Engine/Runtime 边界泄漏

最优规则：

1. 如果生产端为了去重需要稳定 map key，可以内部编码。
2. 但导出的 delta contract 仍然必须是 typed IDs。
3. 消费端不应该承担 decode transport key 的职责。

以 `ValueRef` 为例：

1. `documentDelta.ts` 内部如果需要字符串 key 去重，可以保留。
2. 但真正导出的 `DocumentDelta.values` 应该暴露 `ValueRef`，而不是编码字符串。

### D. `shared/delta` 需要一个统一的长期故事

当前状态：

1. `change.ts` 是较新的 generic state builder。
2. `changeState.ts` 是仍被 whiteboard 使用的平行 schema 体系。

长期最优方向：

1. `idDelta`、`entityDelta`、`publishEntityList`、`projectListChange`、`publishStruct`、`writeEntityChange` 作为稳定 primitive 保留。
2. 让 `change.ts` 演化为主要的 typed delta builder。
3. `changeState.ts` 视为兼容层，而不是未来主线。
4. dataview 先迁到新 typed builder，whiteboard 再逐步迁移。

### E. `shared/mutation` 必须明确区分公共概念

最优公共模型：

1. 一套清晰的 mutation engine surface：
   `CommandMutationEngine`、`MutationOptions`、`MutationResult`、`MutationOperationsSpec` 等。
2. 一套清晰的 compiler/planning surface：
   `compile`、`planningContext`、`Issue`、`CompileControl`、`path`、`mutationTrace`。
3. 一套清晰的 history surface：
   以 `localHistory.ts` 中那套 engine-coupled `HistoryPort` 为主。

关键澄清：

1. `createHistoryPort.ts` 里的轻量 helper 不应该继续和 rich history port 共用同一个公共名字。
2. 长期看，它应该：
   改名为类似 `createHistoryBuffer`
   或者直接退回 internal helper，不从 root export 暴露。

### F. `shared/projection` 必须同时导出 Runtime 和 Contract Types

最优 public surface：

1. `createProjectionRuntime`
2. `ProjectionSpec`
3. `ProjectionRuntime`
4. `Revision`
5. `ProjectionTrace`
6. `ScopeSchema`
7. `ScopeInputValue`
8. `ScopeValue`
9. 如有必要，再补稳定 phase/core 类型

原因：

1. projection 不是一个单纯的 runtime function。
2. 它本质上是一个 typed modeling framework，消费者必须能从根包引用它的 spec 和 trace 类型。

### G. Runtime Source Projection 需要按职责拆开

dataview runtime 的长期文件结构建议：

1. 一类文件负责 store/runtime 构造：
   `createSourceTableRuntime`
   `createMappedTableSourceRuntime`
   `createEntitySourceRuntime`
   `resetEntityRuntime`
   `resetSourceTableRuntime`
2. 一类文件负责 apply typed delta：
   `applyEntityDelta`
   `applyMappedEntityDelta`
3. 调用方最终只应提供：
   typed delta
   `readIds`
   `readValue`
   以及确实需要内部 key 映射时的 `keyOf`

必须消失的东西：

1. `IdDeltaLike`
2. `parseStringKey`
3. `parseItemId`
4. `parseSectionId`
5. `parseFieldId`
6. `parseValueRefKey`

## 各 Package 的长期方案

### `@shared/delta`

#### 近期目标

1. 先恢复 root export，让包消费者能够按预期公共 API 编译通过。
2. 这一步尽量不改运行时语义。

#### 长期目标

1. 给 `change` builder 增加 typed leaf 支持。
2. 在 whiteboard 迁移前保留 `changeState` 兼容。
3. 让 dataview 先吃到 typed builder 的收益。

#### 推荐 public surface

1. `change`
2. `idDelta`
3. `entityDelta`
4. `projectListChange`
5. `publishEntityList`
6. `publishStruct`
7. `writeEntityChange`
8. `createEntityDeltaSync`
9. `createChangeState`
10. `cloneChangeState`
11. `mergeChangeState`
12. `takeChangeState`
13. `hasChangeState`
14. `ChangeSchema`
15. `IdDelta`
16. `EntityDelta`

#### 战略整理

1. `changeState` 标记为兼容 API。
2. 新增工作统一走 typed `change(...)` 路线。

### `@shared/mutation`

#### 近期目标

1. 先恢复 root export，覆盖当前 dataview 和 whiteboard 实际依赖的符号。
2. 同时拆清 `createHistoryPort` 的命名歧义。

#### 长期目标

1. 把“engine”“compiler/planning”“history”三块公共 surface 分层整理。
2. root barrel 作为稳定 facade，对外承接这些分层能力。

#### 推荐 public surface

至少应该稳定导出当前已经被跨包使用的内容：

1. `CommandMutationEngine`
2. `MutationOptions`
3. `MutationResult`
4. `MutationOperationsSpec`
5. `MutationPublishSpec`
6. `HistoryPort`
7. `compile`
8. `planningContext`
9. `mutationTrace`
10. `path`
11. `OpSync`
12. 相关 write/history/compiler support types

### `@shared/projection`

#### 近期目标

1. 恢复 root export，把现有消费者已经在用的 contract types 重新接出来。

#### 长期目标

1. 把 `@shared/projection` 明确定位成一个 typed framework package，而不是一个只暴露 runtime function 的小包。
2. 用稳定 root barrel 体现这层定位。

#### 推荐 public surface

1. `createProjectionRuntime`
2. `ProjectionSpec`
3. `ProjectionRuntime`
4. `ProjectionTrace`
5. `Revision`
6. `ScopeSchema`
7. `ScopeInputValue`
8. `ScopeValue`
9. 如有需要，再补其他稳定 phase/core 类型

### Dataview Runtime / Engine Boundary

#### 近期目标

1. 不再把编码后的 `ValueRef` 字符串泄漏给 runtime。
2. 一旦 typed delta 到位，就删除 runtime 侧的 decode adapter。

#### 长期目标

1. engine 负责 change production 和内部 transport encoding 细节。
2. runtime 只负责 store projection。

## 推荐迁移顺序

### Phase 1. 先恢复 Shared Package Root Facade

目标：

1. 让 `@shared/delta`、`@shared/mutation`、`@shared/projection` 的根导出重新覆盖当前消费者实际使用的 API。

原因：

1. 这是风险最低、收益最高的一步。
2. 它先把大面积断裂收口，但不急着改语义。

### Phase 2. 引入 Typed Delta 支持，同时不破坏 Whiteboard

目标：

1. 扩展 `@shared/delta`，让 dataview 可以生产 typed delta leaves。
2. 保持 `changeState` 继续可用，给 whiteboard 留迁移窗口。

原因：

1. dataview 和 whiteboard 没必要在同一 patch 一起迁完。

### Phase 3. 迁移 Dataview Engine Delta Contract

目标：

1. 让 `DocumentDelta` 和 `ActiveDelta` 显式带上领域 ID 类型。
2. 把所有仅用于去重的内部编码留在 producer 侧。

### Phase 4. 简化 Dataview Runtime Source Projection

目标：

1. 删掉 `parseKey` 和 runtime 侧 decode helper。
2. 让 `patch.ts` 按职责拆分或显著瘦身。

### Phase 5. 迁移 Whiteboard 离开 Legacy Delta Schema

目标：

1. 在合适的时机，把 whiteboard 从 `changeState` 逐步迁向新的 typed `change(...)` 模型。
2. 只有在消费者都完成迁移后，再决定 `changeState` 是保留兼容还是正式废弃。

## 第一轮修复不该混进来的事情

下面这些内容不应该和第一波 shared infra 修复绑在一起：

1. 整体重写 whiteboard 的 delta 架构。
2. 修改 mutation history 的业务语义。
3. 重写 projection runtime 算法。
4. 顺手改那些与 runtime delta projection 无关的领域 parse helper。

## 可落地的完成标准

当以下条件都满足时，这轮重构才算真正闭环：

1. `dataview-runtime/src/source/*` 不再从 `unknown` 解析 delta key。
2. `DocumentDelta.values` 在 contract 边界上是 `ValueRef`，不是编码字符串。
3. `@shared/delta`、`@shared/mutation`、`@shared/projection` 的 root import 暴露的就是它们真实公共 contract。
4. dataview 和 whiteboard 都能稳定编译在这些 root export 之上。
5. `patch.ts` 要么被拆分，要么职责被压缩到单一维度。

## 结论

`patch.ts` 的别扭只是症状，不是病根。

真正的问题是 shared infra contract drift：

1. delta leaf 类型太弱
2. package root export 不完整
3. 编码 key 泄漏跨边界
4. 重叠抽象没有明确归属

长期最优解应该是先修公共 package contract，再让 runtime projection 自然简化，而不是反过来只在 `patch.ts` 上打补丁。
