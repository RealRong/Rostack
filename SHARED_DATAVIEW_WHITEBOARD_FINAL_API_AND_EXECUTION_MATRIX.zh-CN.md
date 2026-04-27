# Shared / Dataview / Whiteboard 最终 API 与实施矩阵

## 1. 硬规则

| 规则 | 结论 |
| --- | --- |
| R1 | 只要某个符号仍被两个及以上 package 以 root import 直接消费，它就不得先从 root surface 删除。 |
| R2 | 真正的跨包稳定原语必须保留为 public API；不能为了“导出更少”把原语伪装成 internal。 |
| R3 | 只有机械 helper、兼容层、publish/sync glue、builder/registry/compile 辅助层可以从 root surface 收掉。 |
| R4 | authoring contract 和 runtime internal 必须分开；前者可保留 public type，后者必须 internal-only。 |
| R5 | 任何 shrink 必须先消灭所有跨包直接消费点，再删除 root export；禁止先删 facade、再让下游补 parse/adapt。 |
| R6 | `ids + byId` 是唯一公共实体族；`order` 不再作为公共实体表字段存在。 |
| R7 | plain object spec + 字符串 key 是唯一公共装配方式；builder、register、schema factory 全部退出最终 API。 |

## 2. 最终 Shared Root Surface

| Package | 最终保留 | 必删 / 必 internal | 结论 |
| --- | --- | --- | --- |
| `@shared/spec` | `walkSpec`、`createTableIndex`、`createOneToOneIndex`、`createOneToManyIndex`、`splitDotKey`、`joinDotKey` | 任何业务语义 helper、重复 walker、重复 reverse index | 这是最终稳定机械层，不再继续缩。 |
| `@shared/delta` | `change`、`idDelta`、`entityDelta`、`projectListChange`、`writeEntityChange`；类型仅保留 `IdDelta`、`EntityDelta`、`ListChange` | `publishStruct`、`publishEntityList`、`createEntityDeltaSync`、`changeState` 整层 | `idDelta` / `entityDelta` 是稳定原语，必须保留 public；publish/sync helper 必须退出 root。 |
| `@shared/projection` | `createProjectionRuntime`、`Revision`、`ProjectionSpec`、`ProjectionPlan`、`ProjectionTrace`、`ProjectionValueField`、`ProjectionFamilyField`、`ProjectionFamilySnapshot`、`ScopeSchema`、`ScopeInputValue`、`ScopeValue` | `ProjectionRuntime`、`ProjectionStoreRead`、`ProjectionSurfaceField`、`ProjectionSurfaceTree`、`ProjectionFieldSyncContext`、`DefaultPhaseScopeMap`、所有 internal phase/metrics helper | projection authoring contract 需要公开；runtime 结果类型和内部同步上下文不需要公开。 |
| `@shared/mutation` | `createMutationEngine`、`createHistoryPort`、`HistoryPort`、`MutationOperationsSpec`、`MutationPublishSpec`、`MutationResult`、`MutationFailure`、`MutationOptions` | `compile`、`compileControl`、`planningContext`、`mutationTrace`、`path`、`meta`、`record`、`history`、runtime class、所有 `Mutation*`/`History*`/`Planning*` 大型类型集合 | mutation root 只保留“引擎装配面 + 最小 authoring contract”；其余全部迁出 root。 |
| `@shared/core` | 现有 surface 暂时冻结 | 本轮不做 root shrink | 不在这轮收口 root；只禁止新增依赖面。 |

## 3. 哪些必须缩，哪些不能先缩

| 符号 / 族 | 当前状态 | 最终状态 | 是否必须 shrink | 原因 |
| --- | --- | --- | --- | --- |
| `changeState` 整层 | 旧 DSL，已无主路径必要性 | 直接删除 | 是 | 与 `change(spec)` 重叠，且只制造第二套 schema 体系。 |
| `publishStruct` | dataview active publish helper | 下沉到 `dataview-engine` 本地 publish 层 | 是 | 它不是 shared 原语，而是特定 snapshot 复用策略。 |
| `publishEntityList` | dataview section/item publish helper | 下沉到 `dataview-engine` 本地 publish 层 | 是 | 它绑定 dataview 列表发布语义，不应继续占 shared root。 |
| `createEntityDeltaSync` | runtime source sync helper | 下沉到 `dataview-runtime` 本地 source patch 层 | 是 | 它是 adapter 层 glue，不是跨包原语。 |
| `idDelta` | whiteboard / dataview / shared 广泛直接使用 | 保留 public | 否 | 它是最底层稳定变化原语，删除只会制造 facade 漂移。 |
| `entityDelta` | whiteboard render/projection、shared publish 直接使用 | 保留 public | 否 | 它是 `ids + byId` 体系下的稳定派生原语。 |
| `projectListChange` | dataview query 与 shared publish 都在用 | 保留 public | 否 | 它是稳定的列表差分原语。 |
| `ProjectionSpec` | dataview / whiteboard 都在 author projection spec | 保留 public | 否 | 这是 authoring contract，不是 runtime internal。 |
| `ScopeSchema` / `ScopeInputValue` / `ScopeValue` | dataview / whiteboard 都直接使用 | 保留 public | 否 | 这是 scope spec authoring contract。 |
| `Revision` | dataview / whiteboard runtime contract 直接使用 | 保留 public | 否 | 这是跨包稳定领域原语。 |
| `ProjectionRuntime` | 仅是 `createProjectionRuntime` 返回值包装类型 | 删除 root export | 是 | 可通过 `ReturnType` 或局部 runtime contract 推导，不值得单独暴露。 |
| `ProjectionFieldSyncContext` | 纯 runtime 内部同步上下文 | 删除 root export | 是 | 对 authoring 层没有稳定价值。 |
| `compile` / `planningContext` / `mutationTrace` / `path` / `meta` | 被 dataview-core / whiteboard-core 直接 root import | 迁到各自本地 operation infra，再从 shared root 删除 | 是 | 它们是 mutation 框架内部机制，不应长期暴露在 root。 |
| `HistoryPort` | editor/engine/collab 跨包直接消费 | 保留 public | 否 | 它是外部装配所需的最小稳定抽象。 |
| `createHistoryPort` | 外部运行时装配直接使用 | 保留 public | 否 | 这是唯一应该暴露的 history 工厂。 |
| `createEntryHistoryPort` | 局部轻量 helper | internal-only | 是 | 只服务 shared/mutation 内部，不应继续暴露为公共抽象。 |

## 4. 最终上层 API 约束

| 层 | 最终要求 |
| --- | --- |
| `dataview-engine` | 不再从 `@shared/delta` root 消费 `publishStruct`、`publishEntityList`、`createEntityDeltaSync`。 |
| `dataview-runtime` | `source/patch.ts` 只消费 typed delta，不再 parse/decode `unknown` key。 |
| `dataview` 全线 | 所有文档 fixture、bench fixture、测试数据统一为 `ids + byId`。 |
| `whiteboard-editor-scene` | 继续使用 `change(spec)`；render / ui / graph / surface sync 只消费 typed delta 与 projection spec。 |
| `whiteboard-core` | 逐步退出对 `@shared/mutation.path`、`Path`、`PathKey` 的 public 依赖。 |
| `whiteboard-engine` | 对 mutation 的依赖只停留在最终 root authoring contract，不再直接依赖 compile/path/meta/trace internal。 |

## 5. 最终 Mutation 收口目标

| 当前 root 能力 | 最终归宿 | 处理方式 |
| --- | --- | --- |
| `compile` / `compileControl` | `dataview-core`、`whiteboard-core` 各自本地 operation compiler | 复制语义到本地 operation 层后，删除 shared root 暴露。 |
| `planningContext` | `dataview-core`、`whiteboard-core` 本地 validation context | 本地化，不再从 shared root 直读。 |
| `mutationTrace` | `dataview-core`、`whiteboard-core` 本地 trace facade | 本地化，shared 只保留 engine 执行结果。 |
| `path` / `Path` / `PathKey` | 全仓统一迁到字符串 `fieldKey` / `targetKey` grammar | 这是最终删除项，不保留兼容。 |
| `meta` | 并入本地 operation schema 或 mutation spec literal table | 删除 shared root 暴露。 |
| `record` helper | 并入本地 write planner | 删除 shared root 暴露。 |
| `history` state helper | internal-only | root 只保留 `createHistoryPort` 和 `HistoryPort`。 |
| runtime classes | internal-only | 外部只通过 `createMutationEngine` 获取实例。 |

## 6. 最终 Delta 收口目标

| 当前 root 能力 | 最终状态 | 执行要求 |
| --- | --- | --- |
| `change` | 保留 | 所有新 delta spec 都统一到 `change(spec)`。 |
| `idDelta` | 保留 | 继续作为底层原语，禁止再包一层等价 facade。 |
| `entityDelta` | 保留 | 作为 family/entity 变化投影原语保留。 |
| `projectListChange` | 保留 | 作为稳定列表差分原语保留。 |
| `writeEntityChange` | 保留 | 作为稳定 leaf helper 保留。 |
| `publishStruct` | 删除 root，迁本地 | dataview active publish 自己持有 snapshot reuse 策略。 |
| `publishEntityList` | 删除 root，迁本地 | dataview section/item publish 自己持有 list publish 策略。 |
| `createEntityDeltaSync` | 删除 root，迁本地 | dataview-runtime source adapter 自己持有 sync 策略。 |

## 7. 最终 Projection 收口目标

| 类别 | 最终保留 | 最终删除 / internal |
| --- | --- | --- |
| authoring | `ProjectionSpec`、`ProjectionPlan`、`ProjectionTrace`、`ScopeSchema`、`ScopeInputValue`、`ScopeValue`、`ProjectionValueField`、`ProjectionFamilyField`、`ProjectionFamilySnapshot`、`Revision` | 无 |
| runtime factory | `createProjectionRuntime` | 无 |
| runtime internals | 无 | `ProjectionRuntime`、`ProjectionStoreRead`、`ProjectionSurfaceField`、`ProjectionSurfaceTree`、`ProjectionFieldSyncContext`、phase graph / metrics / sync internals |

## 8. 实施矩阵

| 阶段 | 目标 | 必做项 | 完成标准 |
| --- | --- | --- | --- |
| A | shared facade 冻结 | 以本文件为唯一目标面；禁止新增 root export；新增代码不得再引用待删除符号 | 新增代码不扩大 shared root surface。 |
| B | delta 收口 | dataview-engine 内联 `publishStruct` / `publishEntityList`；dataview-runtime 内联 `createEntityDeltaSync`；shared/delta root 只保留最终原语 | `@shared/delta` root 不再导出 publish/sync helper。 |
| C | projection 收口 | dataview / whiteboard 保留 authoring types 使用；删除 `ProjectionRuntime` 等非 authoring root type | `@shared/projection` root 只剩 authoring contract + `createProjectionRuntime`。 |
| D | mutation 去根依赖 | dataview-core / whiteboard-core 将 `compile`、`planningContext`、`mutationTrace`、`path`、`meta` 本地化 | `@shared/mutation` root 不再被上层直接拿 internal 机制。 |
| E | 字符串 grammar 收口 | `Path` / `PathKey` / `path` 全仓删除；统一改成 `fieldKey` / `targetKey` / literal grammar | shared root 与上层 public contract 中不再出现 `Path` 体系。 |
| F | 最终联调 | shared、dataview、whiteboard 全量 typecheck、测试、bench、构建 | 只保留本文件定义的最终 surface。 |

## 9. 最后需要收尾的清单

| 优先级 | 收尾项 | 当前状态 | 最终动作 |
| --- | --- | --- | --- |
| P0 | `@shared/delta` root publish/sync helper | 仍在导出与消费 | 下沉到 dataview 本地后删除 root export。 |
| P0 | `@shared/mutation` root internal 机制 | 仍被 dataview-core / whiteboard-core 大量直接消费 | 先本地化 operation infra，再删除 root export。 |
| P0 | `Path` / `PathKey` / `path` | 仍是 whiteboard/dataview/shared mutation 公共依赖 | 统一改成字符串 grammar 后整层删除。 |
| P1 | `@shared/projection` 非 authoring 类型 | 仍在 root 暴露 | 删除 root 暴露，仅保留 authoring contract。 |
| P1 | dataview active publish helper 共享化残留 | 仍依赖 shared publish helper 设计 | 改成 engine 私有 publish 策略。 |
| P1 | dataview-runtime source sync helper 共享化残留 | 仍依赖 shared sync helper 设计 | 改成 runtime 私有 source sync 策略。 |
| P2 | `@shared/core` 过宽 surface | 当前冻结 | 本轮不缩，只禁止扩大。 |

## 10. 最终 API 结论

| Package | 最终 root policy |
| --- | --- |
| `@shared/spec` | 不再继续缩。 |
| `@shared/delta` | 保留 delta 原语，删除 publish/sync helper。 |
| `@shared/projection` | 保留 authoring contract，删除 runtime internal type。 |
| `@shared/mutation` | 只保留引擎装配面与最小 authoring contract，其余全部退出 root。 |
| `@shared/core` | 暂不 shrink，冻结。 |

这就是最终 API 与实施矩阵。
