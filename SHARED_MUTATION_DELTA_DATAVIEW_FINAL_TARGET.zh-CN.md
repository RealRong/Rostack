# Shared Mutation / Delta 驱动的 Dataview 最终目标方案

## 1. 目标

本文定义 `dataview` 基于 `@shared/mutation` 与 `@shared/delta` 的最终长期方案。

约束前提：

- 不考虑兼容成本
- 不保留旧 API 包袱
- 不保留 `dataview-core` 私有 mutation runtime
- 不允许 dataview 继续定义一套平行于 shared 的 delta/impact/trace 协议

最终原则只有一条：

`shared/mutation` 是唯一 mutation 执行与 commit/delta 协议中心，`shared/delta` 是唯一 typed/derived delta 工具箱，`dataview` 只在 shared 之上定义领域 spec 与 projection 逻辑。

## 2. 对 shared 现状的判断

## 2.1 `@shared/mutation` 已经是协议中心

`@shared/mutation` 当前已经具备最终中心层的大部分关键能力：

- `MutationEngine`
- canonical entity op 执行
- custom op reduce
- compile handler table
- history / inverse / replay
- canonical `MutationDelta`
- `MutationFootprint`
- typed mutation schema 与 typed delta reader

这意味着：

- `MutationDelta` 的最终归属必须是 `@shared/mutation`
- commit record 的最终归属必须是 `@shared/mutation`
- canonical entity spec 的最终归属必须是 `@shared/mutation`
- typed delta 读取 API 也应继续放在 `@shared/mutation`

因此 `dataview-core` 不应该再保留任何“自己包装出来的 mutation runtime”。

## 2.2 `@shared/delta` 不是协议层，而是通用增量工具箱

`@shared/delta` 当前提供的核心能力是：

- `idDelta`
- `entityDelta`
- `change`
- `listChange`
- `writeEntityChange`

这一层非常适合做：

- package-local typed delta 聚合
- projection 内部脏集计算
- source patch / render patch / active publish patch 的局部增量归并
- 任意运行时状态之间的集合差异、order 变化、entity 变化推导

这一层不适合做：

- commit 协议定义
- mutation 执行协议定义
- history/inverse 协议定义
- canonical delta 存储格式定义

所以长期上，`@shared/delta` 应被定位成：

- `@shared/mutation` 的下游工具层
- projection/runtime/model 侧的通用差异计算库

而不是与 `@shared/mutation` 并列的第二套 mutation 协议。

## 2.3 typed delta 的中心应留在 `@shared/mutation`

`@shared/mutation/src/typed.ts` 已经提供：

- `defineMutationSchema`
- `createTypedMutationDelta`
- `collectMutationTouchedIds`
- `readMutationChangeIds`
- `readMutationChangePaths`
- `readMutationChangePathsOf`

这是正确方向。

最终不应该让各 package 再自己发明“MutationDelta -> package-local impact”的二次协议层。正确形态是：

- package 定义 schema
- package 基于 schema 构建 typed delta view
- projection/runtime 直接消费 typed delta view

换句话说：

- `typed delta reader` 属于 `@shared/mutation`
- `typed delta derived state` 可以用 `@shared/delta` 继续做

## 3. Dataview 的最终分层

最终 dataview 必须严格拆成四层。

### 3.1 `@shared/mutation`

职责：

- 统一 mutation engine
- 统一 canonical entity op
- 统一 custom op reduce 协议
- 统一 `MutationDelta`
- 统一 commit / history / footprint
- 统一 typed delta schema / reader

### 3.2 `@dataview/core`

职责：

- 定义 `Intent`
- 定义 `DocumentOperation`
- 定义 `entities`
- 定义 `custom`
- 定义 `compile`

边界：

- 只负责任务领域语义
- 不持有 runtime mutation 协议
- 不定义额外 delta 协议
- 不定义额外 impact 协议
- 不定义额外 commit 类型

### 3.3 `@dataview/engine`

职责：

- 持有 `MutationEngine<DataDoc, IntentTable, DocumentOperation>`
- 定义 dataview mutation schema
- 将 `MutationDelta` 转成 dataview typed delta view
- 基于 typed delta 驱动 active/index/publish/projection 更新

边界：

- 只消费 shared mutation commit
- 不消费 dataview-core 私有 mutation internals
- 不从 dataview-core 读取 trace/impact 协议

### 3.4 `@shared/delta`

职责：

- 作为 engine/runtime/projection 内部 derived delta 工具
- 做 touched ids / set / remove / order / stage patch / publish patch 聚合

边界：

- 不作为 mutation commit 格式
- 不作为 dataview external delta 协议

## 4. Dataview Core 的最终公开 API

最终 `@dataview/core` 只允许对外暴露：

```ts
export { intent } from '@dataview/core/intent'
export { op } from '@dataview/core/op'
export { entities } from '@dataview/core/entities'
export { custom } from '@dataview/core/custom'
export { compile } from '@dataview/core/compile'
```

可以继续存在领域读写 helper，但它们属于：

- `document/*`
- `field/*`
- `view/*`

它们是纯领域模块，不是 mutation runtime 的组成部分。

最终必须删除或禁止成为对外依赖边界的内容：

- `operations` 聚合命名空间
- `operations.plan`
- `operations/internal/compile/*`
- `operations/internal/read` 这类 compile runtime helper 作为稳定边界存在
- dataview 私有 commit / impact / trace 协议
- dataview 私有 delta payload 协议

## 5. Dataview Core 的最终内部形态

## 5.1 compile 只保留“intent -> op”

`compile` 的最终职责只有一个：

- 接收 `Intent`
- 校验领域合法性
- 输出 canonical op 或 custom op

最终 compile 不应该承担：

- 再包装一套 compile scope runtime
- 维护 dataview 专属 emit/issue/resolve 协议外壳
- 模拟 mutation 执行
- 生产 impact / trace / delta

compile 允许使用 helper，但 helper 必须是普通领域函数，不再形成 `operations/internal/compile/*` 子系统。

## 5.2 entities 是唯一 canonical delta 语义源

最终所有 entity delta key 必须只来自 `entities` spec：

- `document.schemaVersion`
- `document.activeViewId`
- `document.meta`
- `record.title`
- `record.type`
- `record.values`
- `record.meta`
- `field.schema`
- `field.meta`
- `view.query`
- `view.layout`
- `view.calc`

create/delete lifecycle key 继续来自 canonical entity operation：

- `record.create`
- `record.delete`
- `field.create`
- `field.delete`
- `view.create`
- `view.delete`

custom signal 只允许保留少量 shared 可识别 key，例如：

- `external.version`

最终 dataview-engine、runtime、projection 不允许依赖任何不在 schema 中声明的 key。

## 5.3 custom 只保留不可 canonical 化的领域操作

最终保留的 custom op：

- `record.remove`
- `record.values.writeMany`
- `record.values.restoreMany`
- `field.remove`
- `view.open`
- `view.remove`
- `external.version.bump`

保留原因不是“历史兼容”，而是它们天然是：

- 跨实体联动
- 批量值写入
- inverse 需要领域语义
- 纯信号事件

custom reducer 的最终要求：

- 只返回 shared 认可的 `MutationCustomReduceResult`
- delta 只返回 canonical `MutationDeltaInput`
- 不附加 dataview 私有 payload 包装
- history 只使用 shared 的 `history: false` 或 `history.inverse/forward`

## 6. Dataview Engine 的最终形态

## 6.1 engine 只吃 shared commit

最终 `dataview-engine` 只能依赖：

- `document`
- `forward`
- `inverse`
- `delta`
- `footprint`
- `issues`
- `outputs`

来源统一为 `MutationEngine` commit。

不再允许 engine 读取：

- dataview-core 旧 trace
- dataview-core 旧 impact
- dataview-core 旧 mutation payload
- dataview-core 旧 operation side-channel

## 6.2 engine 维护 package-local typed delta view

最终 engine 应保留自己的 typed delta facade，例如当前 `src/mutation/delta.ts` 这种方向是对的，但要更进一步收敛：

- schema 必须完全来自 core entities + custom signal
- facade 只做 typed read，不再引入额外协议
- downstream dirty/projection 全部基于 facade 读 delta

最终 facade 的职责：

- `changed(...)`
- `touchedIds(...)`
- `pathsOf(...)`
- `matches(...)`
- `summary()`

这层是 `MutationDelta` 的读模型，不是新的写模型。

## 6.3 projection/runtime 内部差异统一使用 `@shared/delta`

engine 内部的 active/index/publish/projection 增量运算，统一基于：

- `idDelta`
- `entityDelta`
- `change`
- `listChange`

适用范围：

- touched record/field/view 聚合
- bucket / section / stage / row / publish result 的局部变更
- render/publish/source patch 生成
- 各 projection slice 的 derived dirty set

不再允许每个 runtime slice 各自重新造 set/remove/order 差异结构。

## 7. Shared 层需要先演进到的最终能力

如果完全按长期最优来做，shared 侧应继续收敛。

## 7.0 `MutationDeltaInput` 的 typed 化原则

长期上，不应把 `MutationDeltaInput` 本体改造成整个系统强依赖的重泛型协议类型。

最终原则应是：

- `MutationDeltaInput` 继续作为 raw canonical protocol
- typed 能力放在 authoring helper 与 read facade
- 不让 schema 泛型向 `MutationEngine` / `MutationCustomReduceResult` / merge/normalize 主链扩散

原因：

- `MutationDeltaInput` 是 commit/delta 协议的最小公共格式
- 它需要易于 merge、normalize、coerce、序列化、跨层传递
- 一旦把它本体升级为 `MutationDeltaInput<TSchema>` 这类中心泛型，shared/mutation 的大量核心类型都会被 schema 泛型污染

最终推荐形态是两层：

### 协议层

- `MutationDeltaInput`
- `MutationDelta`

这两者保持 schema-agnostic。

### authoring / reading 层

- `createTypedMutationDelta(schema, raw)` 负责 typed read
- `createDeltaBuilder(schema)` 负责 typed write

如果需要额外类型约束，可以补充轻量 authoring type，例如：

- `MutationDeltaInputOf<TSchema>`

但它只用于 helper 的输入输出约束，不应反向污染 engine 主协议。

## 7.1 `@shared/mutation` 应成为唯一 delta 规范库

应新增或强化以下能力：

### A. 更强的 typed schema 能力

- schema key 的更严格类型化
- path codec 的更强推导
- `changed/matches/touchedIds/pathsOf` 的更完整类型推断
- 对 custom signal key 的显式 schema 支持

### B. entity spec 到 typed schema 的桥接

长期理想状态下，`MutationEntitySpec` 不只是 apply 规则源，也应该能辅助生成 typed delta schema 的骨架。

目标不是完全自动生成，而是：

- entity lifecycle key 自动推导
- entity change bucket key 自动推导
- path member codec 可按 package 显式补充

这样 package 不必手工重复写一份 schema key 列表。

### C. custom signal 的正式机制

现在 custom op 可以直接返回任意 key 的 delta change，这会让 schema 与 reducer 容易漂移。

长期应该在 `@shared/mutation` 里显式支持：

- package 声明 custom signal schema
- reducer 只能写入 schema 内允许的 signal key

这样 `external.version` 这类 key 就能成为一等公民，而不是隐式约定。

### D. mutation delta builder/helper

shared 应提供官方 helper，降低 reducer 手写 `changes` 结构的噪音与出错率，例如：

- `delta.flag(key)`
- `delta.ids(key, ids)`
- `delta.paths(key, paths)`
- `delta.order(key)`
- `delta.merge(...)`

这样 custom reducer 不必手工拼对象字面量。

更进一步，长期最优不是只提供无类型 helper，而是提供 schema-aware builder，例如概念上：

```ts
const delta = createDeltaBuilder(schema)

delta.flag('document.activeViewId')
delta.ids('record.create', ['record_1'])
delta.paths('record.values', {
  record_1: ['status', 'owner']
})
```

它的价值在于：

- 写侧 key 受 schema 约束
- path 类型可由 codec/entry 配置约束
- 最终输出仍然是普通 `MutationDeltaInput`

也就是说：

- typed 化发生在 helper authoring 层
- raw protocol 仍然保持简单稳定

## 7.2 `@shared/delta` 应明确成为 derived delta 工具层

应明确文档与 API 定位：

- `idDelta` 用于 touched id 聚合
- `entityDelta` 用于 entity set/remove/order 归并
- `change` 用于 typed nested delta state
- `listChange` 用于顺序与集合差异

可以继续补充，但只补“derived delta 工具”，不补 mutation 协议。

## 8. Dataview 必须删除的旧形态

最终必须完全删除下列形态，而不是只换导出路径。

## 8.1 删除 dataview 私有 mutation runtime

必须删除：

- compile scope runtime
- dataview 私有 mutation reduce 协议
- dataview 私有 delta payload 协议
- dataview 私有 inverse 包装协议
- dataview 私有 impact/trace 协议

## 8.2 删除 dataview 私有二次转译层

禁止出现：

- `MutationDelta -> DataviewImpact`
- `MutationDelta -> TracePayload`
- `MutationDelta -> projectionDirtyPayload`

允许出现的只有：

- `MutationDelta -> typed delta reader`
- `typed delta reader -> projection derived delta`

前者是读模型，后者是本地计算，不是新协议。

## 8.3 删除 operations 旧目录作为架构中心

最终 `src/operations` 不应再是 dataview-core 的架构中心。

允许保留的只有两类：

- 临时过渡文件
- 非公开的内部领域实现文件

最终稳定形态应改为：

- 顶层 `compile.ts`
- 顶层 `custom.ts`
- 顶层 `entities.ts`
- 领域模块 `document/*` `field/*` `view/*`

而不是继续保留一棵 `operations/internal/compile/*` 树。

## 9. 最终实施顺序

不考虑兼容成本时，正确顺序如下。

### 第一步：先完成 shared 规范收口

- 明确 `MutationDelta` 是唯一 commit delta 格式
- 明确 typed schema/read API 是唯一 delta 读取入口
- 为 custom signal 提供正式 schema 支持
- 为 reducer 提供 delta builder helper

### 第二步：重写 dataview-core 边界

- 顶层只保留 `intent/op/entities/custom/compile`
- 删除 `operations` 作为稳定架构层
- compile 只负责 `intent -> op`
- entities 成为唯一 entity delta 语义源
- custom 只负责不可 canonical 化的领域 mutation

### 第三步：重写 dataview-engine delta consumption

- 只消费 shared commit
- 只基于 typed delta facade 做 dirty 判断
- 所有内部 derived delta 统一改用 `@shared/delta`
- 删除任何旧 impact/trace payload 依赖

### 第四步：清空旧协议遗留

- 删掉旧测试
- 删掉旧导出
- 删掉旧文档
- 删掉旧兼容层

## 10. 最终结论

长期最优方案不是让 `dataview` 同时依赖两套 shared runtime，而是：

- `@shared/mutation` 负责“写入、执行、提交、标准 delta”
- `@shared/delta` 负责“读取之后的局部差异推导与聚合”
- `@dataview/core` 只负责领域语义
- `@dataview/engine` 只负责基于 typed delta 做 projection/runtime

最终数据流应固定为：

`intent -> compile -> op -> MutationEngine -> commit/delta -> typed delta facade -> derived delta -> projection/runtime`

最终绝不允许再出现：

- `dataview-core mutation runtime`
- `dataview private impact protocol`
- `dataview private trace/delta payload`
- `MutationDelta` 之外的第二套 commit dirtiness 协议

这才是 shared-first 的最终形态。
