# Shared Mutation / Projection / Delta 长期最优收口结论

更新日期：2026-04-30

## 1. 总结

这三个基础包的长期最优目标很明确：

- `@shared/mutation` 只负责 **canonical mutation protocol + execution runtime**
- `@shared/projection` 只负责 **单一 projection runtime**
- `@shared/delta` 只负责 **少量派生 delta 基元**

原则只有三条：

- **只保留一套实现**
- **默认路径必须短**
- **复杂度优先级高于灵活度**

## 2. `@shared/mutation`

## 2.1 结论

`shared/mutation/src/index.ts` 的问题不是文件长度，而是**语义过宽**。

长期最优下，`@shared/mutation` 应该是一个窄接口包，不应该继续把底层 helper、内部桥接件、runtime 细节全部摊平暴露。

## 2.2 最终职责

`@shared/mutation` 只保留四件事：

- canonical delta / footprint / commit 协议
- canonical op 执行引擎
- entity spec 到 typed schema 的桥接
- typed delta 的标准写侧 / 读侧入口

## 2.3 最终公开 API

根出口只保留：

- `MutationEngine`
- `defineEntityMutationSchema`
- `createDeltaBuilder`
- `createTypedMutationDelta`

以及核心类型：

- `MutationEntitySpec`
- `MutationDelta`
- `MutationDeltaInput`
- `MutationFootprint`
- `MutationCustomTable`
- `MutationCompileHandlerTable`
- `HistoryPort`

其余 low-level helper 不再作为默认公开 API：

- delta read helpers
- delta normalize / merge helpers
- footprint conflict helpers
- history controller 细节

这些能力要么内部化，要么明确降为非默认能力，但不应该继续作为根出口标准表面的一部分。

## 2.4 delta 表达最终形态

长期最优下，`MutationDelta` 只保留**一套表示法**。

目标不是 runtime 一套、序列化一套、桥接再来一套，而是统一成**单一 plain object 结构**：

- `reset?: true`
- `changes?: Record<string, MutationChange>`

结论很直接：

- 不再保留 `MutationChangeMap` 这类 hybrid 形态
- 不再让 `MutationDelta` 和 `MutationDeltaInput` 变成两套长期共存的核心模型
- engine、collab、typed facade、commit 全部围绕同一份 plain object delta 工作

这样复杂度最低。

## 2.5 entity spec 最终形态

`MutationEntitySpec.change` 只保留 **declarative** 形式。

不再允许：

- function form 的动态 change 生成

最终原则：

- entity spec 只描述静态 canonical delta 语义
- extra signal 通过 schema signals 补
- 非 canonical 的领域联动只放在 custom reducer

这样可以保证：

- entity spec 真正成为唯一 schema 来源
- engine 和 typed delta bridge 不再分叉

## 2.6 typed delta 最终形态

typed delta 的标准链路固定为：

1. `defineEntityMutationSchema(...)`
2. `createDeltaBuilder(...)`
3. `createTypedMutationDelta(...)`

除此之外，不再鼓励上层直接消费 raw helper 自己拼读逻辑。

也就是说：

- 写侧统一走 builder
- 读侧统一走 typed facade
- raw delta helper 不再构成 shared 推荐路径

## 2.7 history 最终边界

history 可以继续存在于 `@shared/mutation`，但它不是 mutation protocol 的中心。

长期最优要求是：

- `HistoryPort` 作为稳定 runtime facade 保留
- history controller / policy 内部细节不再成为默认共享表面

也就是说，history 是 runtime 的附属能力，不是 shared mutation 的第一主轴。

## 3. `@shared/projection`

## 3.1 结论

projection 在 store 这一层，当前方向已经是对的。

现在的 `createProjection(...)` 内部 store runtime 是：

- 单一递归构建
- `value` 直接落到 `createValueStore`
- `family` 直接落到 `createFamilyStore`
- sync 逻辑内聚在一处

这就是长期最优方向。

不需要：

- 第二套 store runtime
- 一组额外的 store factory 公共 API
- “轻量版 / 高级版 / declarative 版” projection 变体

projection 的长期最优不是继续抽象，而是**保持单实现并固定 vocabulary**。

## 3.2 最终职责

`@shared/projection` 只做一件事：

- 接收输入 delta
- 跑 phase graph
- 同步 stores
- 产出 capture / trace

不要让它承担：

- 领域 delta 协议
- 额外 DSL
- 多套 store 组织方式

## 3.3 最终 API

projection 的公共中心只保留：

- `createProjection`
- `ProjectionContext`
- `ProjectionRuntime`
- `ProjectionStoreTree`
- `ProjectionFamilySnapshot`
- `ProjectionValueChange`
- `ProjectionFamilyChange`
- `Revision`
- `ProjectionTrace`

这套 vocabulary 固定，不再保留同义替代词。

最终术语只保留：

- `stores`
- `change`
- `capture`
- `phases`
- `plan`

不再出现第二套术语。

## 3.4 store 层最终原则

projection 的 store 层保持当前单实现思路，继续收口，不再扩展。

长期最优要求：

- `createStoreRuntime` 保持内部实现
- value store / family store 同步逻辑继续内聚在 `createProjection`
- 上层只声明 `read` 和 `change`

不再引入额外公共层：

- `createProjectionValueStore`
- `createProjectionFamilyStore`
- `projectFamilyFromSnapshots`
- `reuseStableIds`

这类能力如果只是局部复用，就留在使用方私有 helper，不进入 shared 公共 API。

shared projection 的目标不是“帮所有上层写样板”，而是提供**唯一稳定 runtime**。

## 3.5 dirty 最终原则

`ProjectionDirty` 保持最小：

- `reset`
- `delta`

不把它发展成一个可无限扩展的共享协议层。

如果具体 runtime 需要额外的 phase 协调信息，应在：

- input 预处理
- 本地 state
- 本地 helper

里解决，而不是继续扩大 projection 核心类型面。

## 4. `@shared/delta`

## 4.1 结论

`@shared/delta` 的长期最优状态应该是一个**小而硬的派生 delta 工具包**。

只保留已经被多个业务证明有效的基元。

## 4.2 最终公开能力

根出口只保留：

- `idDelta`
- `entityDelta`
- `projectListChange`

以及对应类型：

- `IdDelta`
- `EntityDelta`
- `ListChange`

## 4.3 必须退出默认共享表面的能力

下面这些不应该继续代表 shared delta 的公共方向：

- `change.ts`
- `writeEntityChange.ts`

最终处理原则：

- `change.ts` 如果仍然只被 whiteboard 一侧使用，就迁回 whiteboard 局部
- `writeEntityChange.ts` 删除或内联

shared delta 不负责提供通用 change DSL。

## 4.4 最终职责

`@shared/delta` 只做：

- ID 粒度变更聚合
- entity store patch 语义
- ordered list diff

不做：

- mutation protocol
- schema bridge
- commit delta
- 通用嵌套 change 框架

## 5. 三包最终关系

长期最优链路固定为：

### 5.1 `@shared/mutation`

- compile / custom / canonical execute
- 产出 canonical delta

### 5.2 领域包

- 定义 entities
- 定义 compile
- 定义 custom reducer
- 不自建第二套 mutation 协议

### 5.3 `@shared/projection`

- 消费 canonical delta 或 typed facade
- 运行单一 projection runtime

### 5.4 `@shared/delta`

- 给 projection / runtime 提供局部派生 delta 基元

## 6. 最终收口动作

如果只按长期最优执行，动作顺序应该是：

1. 收窄 `@shared/mutation` 根出口
2. 统一 `MutationDelta` 为单一 plain object 表达
3. 删除 `MutationEntitySpec.change` 的 function 形态
4. 固定 `@shared/projection` 当前单实现 runtime，不再新增公开 store 抽象
5. 从 `@shared/delta` 根出口移除 `change.ts` 与 `writeEntityChange.ts`

## 7. 最后结论

最终最优设计不是“让 shared 提供更多 helper 给上层自己拼”，而是：

- `mutation` 更窄
- `projection` 更单一
- `delta` 更克制

也就是说：

- **只保留一套 mutation 协议**
- **只保留一套 projection runtime**
- **只保留一套小型 derived delta 工具集**

这就是复杂度最低、长期维护成本最低的 shared 基础层形态。
