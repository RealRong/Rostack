# Shared Core 复用与瘦身方案

## 1. 背景

根据 `UNIFIED_MUTATION_PIPELINE_NEXT_STAGE.zh-CN.md`，Whiteboard 与 Dataview 已经迁移到 `MutationEngine` 作为共同写入主轴。下一阶段不应该继续把零散工具堆进 `shared/core`，而应该把可复用底层设施按职责拆成更小、更稳定的包：

- `shared/mutation`
- `shared/reducer`
- `shared/projector`
- `shared/projection-runtime`

目标是让多项目复用底层设施时，只引入需要的最小能力，避免 `shared/core` 变成事实上的大杂烩。

本文基于当前代码结构观察：

- `whiteboard/packages/whiteboard-core`
- `dataview/packages/dataview-core`
- `shared/core`
- `shared/mutation`
- `shared/projection-runtime`

结论先行：**还可以复用，但复用点主要不在领域模型，而在 mutation/reducer/projector/store 四类基础设施；`shared/core` 应该退回到极少量通用 primitive。**

---

## 2. 当前问题判断

## 2.1 两个 core 已经不适合继续抽“业务 core”

Whiteboard 与 Dataview 的领域差异很大：

- Whiteboard 的复杂度在坐标、视口、节点、边、树/脑图、分组、几何命中、布局约束。
- Dataview 的复杂度在字段、记录、视图、过滤、排序、分组、搜索、计算、active view。

这些不应该进入 shared。尤其不应该抽象成一个统一的 `CoreEngine`、`QueryEngine` 或 `ReadModelFramework`。这样会把两个项目最不相同的部分强行统一，最后只会得到更多泛型、adapter、hook 与 runtime policy。

真正可以复用的是更低层、更机械的设施：

- intent/action 编译上下文
- operation apply/reduce 上下文
- inverse buffer
- footprint collector
- issue collector
- mutation trace/impact 计数
- path/key/path-key
- entity delta 发布辅助
- projector runtime
- 小型 store runtime

## 2.2 `shared/core` 现在职责过宽

当前 `shared/core/src/index.ts` 同时导出了：

- 基础工具：`json`、`equal`、`string`、`parse`、`compare`、`order`、`collection`、`set`
- 数据结构：`entityTable`、`entityDelta`、`changeSet`、`keySet`、`record`、`selection`
- mutation/reducer 设施：`mutationContext`、`mutationTx`、`operationBuffer`、`historyFootprint`、`planningContext`、`issueCollector`、`mutationTrace`
- store 设施：`store/*`、`scheduler`、`frame`、`timeout`、`metrics`

这导致 `@shared/core` 被两类完全不同的消费者依赖：

- 领域 core 只是想要 `json/equal/string/entityTable/changeSet`
- mutation/projection/runtime 想要 reducer、store、scheduler、footprint 等底层设施

结果是任何项目只要 import `@shared/core`，语义上就把全部 shared 基础设施都拉进来了。长期看会产生三个问题：

1. 依赖边界不清：不知道一个模块依赖的是纯工具、mutation 设施还是 reactive store。
2. 迁移成本上升：`shared/core` 内的 mutation 设施很难演进，因为看起来所有包都可能受影响。
3. 复杂度扩散：新需求容易继续塞进 `shared/core`，而不是进入明确的 shared 子域。

---

## 3. 两个 core 之间还能复用什么

## 3.1 不建议复用的部分

这些应继续留在领域侧：

### Whiteboard 保留领域侧

- geometry：point、rect、segment、polyline、rotation、viewport、collision
- edge：anchor、route、resolved path、hit test、label mask、endpoint 约束
- mindmap/tree：topic、branch、layout、collapse、structure
- group/canvas/node 的领域生命周期与约束
- selection 的白板语义模型
- whiteboard query/read index

### Dataview 保留领域侧

- field kind 与 schema
- record/value/title 语义
- view/card/gallery/kanban/table options
- filter/sort/group/search/calculation
- active view 与 view demand
- dataview query/read index
- commit impact 的领域维度定义

这些代码可以消费 shared 底层设施，但不应该被抽到 shared。

## 3.2 建议复用的底层设施

### A. Mutation 写入主轴

已经落位到 `shared/mutation`，应继续作为多项目写入基础设施：

- `MutationEngine`
- `MutationEngineSpec`
- `MutationIntentTable`
- `MutationPlan`
- `ApplyResult`
- `Write`
- `HistoryController`
- `collab` 入口
- `draft` / COW mutation helper
- `Path` / `PathKey`

Whiteboard 与 Dataview 不应该再各自维护完整 commit orchestration。领域侧只提供：

- `compile(intent[]) -> op[]`
- `apply(op[]) -> ApplyResult`
- `publish.reduce(write)`
- `history.track/conflicts`

### B. Reducer / Apply 底层设施

目前散在 `shared/core` 的 reducer 类设施，应该沉到新的 `shared/reducer`：

- `changeSet`
- `historyFootprint`
- `issueCollector`
- `mutationContext`
- `mutationTx`
- `mutationTrace`
- `operationBuffer`
- `planningContext`

这些不是普通 core 工具，而是 mutation apply/reduce 时使用的 runtime primitives。

建议命名从 `mutationTx/mutationContext` 逐步改为更中性的 reducer 术语：

- `mutationTx` -> `reducerTx`
- `mutationContext` -> `reduceContext`
- `planningContext` -> `planContext`
- `operationBuffer` 保持，或改为 `inverseBuffer` / `opBuffer`
- `historyFootprint` 保持，归入 reducer/history 目录
- `mutationTrace` 可改为 `reduceTrace`，但如果已经被 Dataview impact 语义消费，可以先保留导出别名

`shared/reducer` 的职责是：**帮助领域实现 apply/reduce，不拥有 MutationEngine，也不拥有领域 operation。**

### C. Projector 声明层

建议新增 `shared/projector`，承载 projector 的纯声明、patch、delta、发布 contract，不包含完整 runtime 调度。

候选迁入内容：

- `entityDelta`
- entity/list/family change helper
- projector phase/source/sink 的轻量 contract
- projector publish patch 类型
- 通用 `ChangeSet` / `KeySet` 中与 projector 发布强相关的部分

`shared/projector` 与 `shared/projection-runtime` 的关系：

- `shared/projector`：类型、delta、patch、contract、纯函数
- `shared/projection-runtime`：脏标记、依赖 fanout、phase graph、runtime update、publisher 调度、testing harness

这样 Dataview active/index/delta 和 Whiteboard publish/query delta 都可以复用 projector 的结果结构，而不必都依赖完整 runtime。

### D. Projection Runtime

现有 `shared/projection-runtime` 方向正确，建议保留，但减少对 `shared/core` 的依赖。

当前它主要依赖：

- `scheduler`
- `entityDelta`

下一阶段应改成：

- `scheduler` 移入 `shared/store` 或 `shared/projection-runtime` 内部
- `entityDelta` 移入 `shared/projector`
- `projection-runtime` 依赖 `shared/projector`，不依赖大而全的 `shared/core`

### E. Store / Observable 基础设施

`shared/core/src/store/*` 是一个独立子系统，不应继续藏在 `shared/core`。

建议拆为 `shared/store`，用于：

- shared/react 的 `useStoreValue`
- projection runtime 的局部发布/订阅
- 未来跨项目 lightweight reactive state

迁入内容：

- `store/*`
- `scheduler`
- `frame`
- `timeout`
- 可能还有 `metrics`，如果 metrics 主要服务 runtime/store

拆出后：

- `@shared/react` 依赖 `@shared/store`
- `@shared/projection-runtime` 视情况依赖 `@shared/store`
- `@shared/core` 不再暴露 `store`

---

## 4. `shared/core` 应该剩下什么

长期目标：`shared/core` 只保留无业务、无 runtime、无 mutation 语义的 primitive。

建议最终保留：

- `json`
- `equal`
- `string`
- `parse`
- `compare`
- `order`
- `collection`
- `set`
- `id`
- 可能保留 `path`，但建议与 `shared/mutation/path` 合并评估

需要移出的内容：

| 当前模块 | 建议去向 | 原因 |
| --- | --- | --- |
| `changeSet` | `shared/reducer` 或 `shared/projector` | 不是基础 primitive，主要服务变更传播 |
| `entityDelta` | `shared/projector` | 是 projection publish 结构 |
| `entityTable` | 短期留 core，长期评估 `shared/model` | Dataview 高频使用，但它是通用实体表数据结构 |
| `historyFootprint` | `shared/reducer` | mutation/history 专属 |
| `issueCollector` | `shared/reducer`，由 mutation compiler 复用 | compile/reduce 诊断设施 |
| `mutationContext` | `shared/reducer` | apply/reduce runtime |
| `mutationTrace` | `shared/reducer` 或 `shared/projector` | commit impact/trace 专属 |
| `mutationTx` | `shared/reducer` | reducer transaction helper |
| `operationBuffer` | `shared/reducer` | inverse/op 收集器 |
| `planningContext` | `shared/reducer` | compile/plan 诊断上下文 |
| `store/*` | `shared/store` | 独立 reactive store 子系统 |
| `scheduler` | `shared/store` 或 `shared/projection-runtime` | runtime 调度，不是 core primitive |
| `frame` / `timeout` / `metrics` | `shared/store` 或 `shared/runtime` | runtime 支撑设施 |
| `record` / `selection` / `keySet` | 按使用场景归并 | 若用于 projection 则进 projector；若泛用则保留或新建 model |

`shared/core` 可以在一个过渡期保留 re-export，但应标记为 legacy facade，禁止新增模块。

---

## 5. 推荐目标包结构

```txt
shared/
  core/
    src/
      json.ts
      equality.ts
      string.ts
      parse.ts
      compare.ts
      order.ts
      collection.ts
      set.ts
      id.ts
      index.ts

  mutation/
    src/
      engine.ts
      apply.ts
      compiler.ts
      write.ts
      history.ts
      collab.ts
      draft.ts
      path.ts
      meta.ts
      index.ts

  reducer/
    src/
      context.ts
      tx.ts
      operationBuffer.ts
      inverse.ts
      footprint.ts
      issue.ts
      trace.ts
      plan.ts
      changeSet.ts
      index.ts

  projector/
    src/
      delta.ts
      entityDelta.ts
      keySet.ts
      change.ts
      publish.ts
      contracts.ts
      index.ts

  projection-runtime/
    src/
      dirty/
      runtime/
      source/
      publish/
      testing/
      index.ts

  store/
    src/
      value.ts
      keyed.ts
      table.ts
      derived.ts
      family.ts
      projected.ts
      staged.ts
      frame.ts
      scheduler.ts
      runtime.ts
      index.ts
```

依赖方向必须保持单向：

```txt
shared/core
  ↑
shared/reducer        shared/projector        shared/store
  ↑                         ↑                    ↑
shared/mutation       shared/projection-runtime shared/react
  ↑                         ↑
whiteboard-core       dataview-core
```

更明确地说：

- `shared/core` 不依赖任何 shared 子包。
- `shared/reducer` 可以依赖 `shared/core`。
- `shared/mutation` 可以依赖 `shared/core` 与 `shared/reducer`。
- `shared/projector` 可以依赖 `shared/core`。
- `shared/projection-runtime` 可以依赖 `shared/projector` 与可选的 `shared/store`。
- 领域包可以依赖 `shared/mutation/reducer/projector/projection-runtime/store`，但不能反向依赖领域包。

---

## 6. Whiteboard 的具体落点

Whiteboard 当前高频消费 `@shared/core` 的是：

- `json`
- `changeSet`
- `mutationTrace`
- `mutationTx`
- `operationBuffer` / `InverseBuilder`
- `historyFootprint`
- `equal`

建议迁移后：

- `json/equal` 继续来自 `@shared/core`
- `changeSet` 来自 `@shared/reducer` 或 `@shared/projector`
- `mutationTx` 改为 `reducerTx`，来自 `@shared/reducer`
- `operationBuffer` / `InverseBuilder` 来自 `@shared/reducer`
- `historyFootprint` 来自 `@shared/reducer`
- `mutationTrace` 短期来自 `@shared/reducer`，长期看是否被 `MutationEngine` write extra 或 projector delta 替代

Whiteboard 不建议抽出的部分：

- `geometry/*`
- `edge/*`
- `mindmap/*`
- `kernel/reduce/handlers/*`
- node/group/canvas 的领域 reduce handlers

Whiteboard 可以减少复杂度的关键不是抽领域逻辑，而是把 `kernel/reduce/runtime.ts` 周围的 transaction、inverse、footprint、trace 依赖替换为 `shared/reducer` 明确入口，并让 `MutationEngine` 成为唯一写入 orchestration。

---

## 7. Dataview 的具体落点

Dataview 当前高频消费 `@shared/core` 的是：

- `string`
- `equal`
- `json`
- `entityTable`
- `collection`
- `parse`
- `planningContext`
- `mutationTrace`
- `InverseBuilder`

建议迁移后：

- `string/equal/json/collection/parse` 继续来自 `@shared/core`
- `planningContext` 改为 `planContext`，来自 `@shared/reducer`
- `InverseBuilder` 来自 `@shared/reducer`
- `mutationTrace` 来自 `@shared/reducer`，或者被 Dataview 的 `CommitImpact` builder 替代
- `entityTable` 短期继续来自 `@shared/core`，长期考虑 `shared/model` 或 `shared/projector` 下的 entity collection primitives

Dataview 不建议抽出的部分：

- field kind/spec/validate
- filter/sort/group/search/calculation
- view/card/gallery/kanban/table
- active view runtime
- domain commit impact 的具体维度

Dataview 可以减少复杂度的关键是：

1. `operation/applyOperations.ts` 与 `operation/mutation.ts` 只保留纯文档 apply。
2. inverse、issues、trace、footprint 统一消费 `shared/reducer`。
3. active/index/delta 从 commit 主链剥离，变成 `MutationEngine.writes` 的下游 projector。
4. 若需要通用 dirty/fanout/update，再接入 `shared/projection-runtime`，否则先用 `shared/projector` 的纯 delta contract。

---

## 8. `shared/reducer` 是否值得新建

值得，而且应该优先新建。

原因：

- `shared/mutation` 负责 engine orchestration，不应该继续装所有 reducer helper。
- `shared/core` 不应该包含 mutation/reduce 语义。
- Whiteboard 与 Dataview 都已经在用同一类 helper：inverse buffer、issue collector、trace、footprint、planning context。
- 这些 helper 复用价值高，且不涉及领域逻辑。

`shared/reducer` 的最小 API 建议：

```ts
export type { InverseBuilder, OperationBuffer } from './operationBuffer'
export { operationBuffer } from './operationBuffer'

export type { HistoryFootprintCollector } from './footprint'
export { footprint } from './footprint'

export type { IssueCollector, IssueInput, IssueSeverity, ValidationIssue } from './issue'
export { issueCollector } from './issue'

export type { ReduceContext } from './context'
export { reduceContext } from './context'

export type { ReducerTxRuntime } from './tx'
export { reducerTx } from './tx'

export type { ReduceTrace, ReduceTraceBuilder } from './trace'
export { reduceTrace } from './trace'

export type { PlanContext } from './plan'
export { planContext } from './plan'
```

短期为了减少迁移风险，可以提供兼容别名：

```ts
export { reducerTx as mutationTx } from './tx'
export { reduceContext as mutationContext } from './context'
export { reduceTrace as mutationTrace } from './trace'
export { planContext as planningContext } from './plan'
```

但新代码必须只使用 reducer 命名。

---

## 9. `shared/projector` 与 `shared/projection-runtime` 的边界

建议不要把 `projection-runtime` 当成唯一 projector 包。它现在更像完整 runtime，而不是 contract 层。

拆分原则：

### `shared/projector` 管

- `EntityDelta`
- `ChangeSet`
- `KeySet`
- `Flags` / `Ids`
- publish patch 类型
- projector source/publish 的纯 contract
- 不含调度、不含订阅、不含 runtime state

### `shared/projection-runtime` 管

- dirty plan
- fanout dependent graph
- phase graph
- runtime state
- update 调度
- source sync
- testing harness

这样可以让领域包有三个选择：

1. 只用 `shared/projector` 的 delta 类型。
2. 用 `shared/projector` + 自己的轻量订阅。
3. 用完整 `shared/projection-runtime`。

这比把所有项目都推向完整 runtime 更低复杂度。

---

## 10. 迁移顺序

## 阶段 1：建立新包，不改变行为

1. 新建 `shared/reducer`。
2. 从 `shared/core` 移动 reducer 类模块，保持源码基本不变。
3. `shared/core` 暂时 re-export 旧入口，避免一次性改全仓。
4. 新建 `shared/store`，移动 `store/*` 与 `scheduler`，`shared/core` 暂时 re-export。
5. 新建 `shared/projector`，先移动 `entityDelta/keySet/changeSet` 中明确属于 projector 的部分。

验收：所有测试与 typecheck 行为不变。

## 阶段 2：改 shared 内部依赖

1. `shared/mutation` 不再从 `@shared/core` 读取 `historyFootprint/operationBuffer/issueCollector`，改依赖 `@shared/reducer`。
2. `shared/projection-runtime` 不再依赖 `@shared/core` 的 `entityDelta/scheduler`，改依赖 `@shared/projector` 与 `@shared/store`。
3. `shared/react` 不再依赖 `@shared/core` 的 store，改依赖 `@shared/store`。

验收：shared 包之间依赖方向清晰，`shared/core` 不再被 runtime 包当作杂货铺。

## 阶段 3：改领域 core import

1. Whiteboard 把 reducer 设施 import 改到 `@shared/reducer`。
2. Dataview 把 reducer 设施 import 改到 `@shared/reducer`。
3. Dataview/Whiteboard 若使用 projector delta，则改到 `@shared/projector`。
4. 普通 primitive 仍从 `@shared/core` 读取。

验收：领域包对 `@shared/core` 的使用只剩 `json/equal/string/parse/compare/order/collection/entityTable` 等低层工具。

## 阶段 4：收紧 `shared/core`

1. 删除或标记 deprecated 的 re-export。
2. `shared/core/src/index.ts` 只暴露 primitive。
3. 文档规定：禁止新增 mutation/reducer/projector/store 模块到 `shared/core`。

验收：新增底层设施必须选择明确包，不再默认进 core。

---

## 11. 最终判断

### 还有没有可以复用而且减少复杂度的？

有，但不是复用领域逻辑，而是复用底层写入、reduce、projector、store 设施。

最值得做的是：

1. 继续把 `MutationEngine` 作为唯一写入主轴。
2. 新建 `shared/reducer`，承接当前 `shared/core` 里的 mutation/reduce helper。
3. 新建 `shared/projector`，承接纯 projection delta/contract。
4. 保留并瘦身 `shared/projection-runtime`，让它只做完整 runtime。
5. 新建 `shared/store`，把 reactive store 从 `shared/core` 拆出去。
6. 把 `shared/core` 降级为 primitive 包。

### `shared/reducer` 是否应该有？

应该有。它正好填补 `shared/core` 与 `shared/mutation` 之间的空层：

- `shared/core` 太底层，不应理解 reducer。
- `shared/mutation` 太上层，不应塞 transaction/buffer/trace 的所有细节。
- `shared/reducer` 负责让多个项目用同一套 apply/reduce 基础设施实现自己的领域 operation。

### 最推荐的长期形态

```txt
shared/core                 通用 primitive
shared/reducer              apply/reduce 基础设施
shared/mutation             MutationEngine 与写入主轴
shared/projector            projection contract/delta/publish primitive
shared/projection-runtime   完整 projector runtime
shared/store                reactive store runtime
```

这个形态比继续扩张 `shared/core` 更适合多项目复用，也更符合 `MutationEngine` 迁移后的长期目标：**shared 层提供稳定底层设施，领域 core 只保留领域复杂度。**
