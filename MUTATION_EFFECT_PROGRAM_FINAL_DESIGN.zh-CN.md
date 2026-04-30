# MutationEffectProgram 最终设计与实施方案

## 1. 最终结论

- `MutationEffectProgram` 应该成为 `shared/mutation` 的**内部执行 IR**。
- 它不是新的 public operation 层，不是新的 intent 层，也不是新的 commit 中转层。
- 最终链路应当收敛为：

```ts
intent
  -> compile handlers
  -> authored operation
  -> operation planner
  -> MutationEffectProgram
  -> apply
  -> commit
```

- 不能做成下面这种“再包一层”的设计：

```ts
intent / authored operation
  -> execution plan
  -> effect scope
  -> effect phase
  -> MutationEffectProgram
  -> runtime
```

- `MutationEffectProgram` 的价值不在“中转”，而在于它必须直接成为以下产物的唯一来源：
  - next document
  - inverse
  - footprint
  - normalized `MutationDelta`

也就是说，`MutationEffectProgram` 不是 adapter，而是 mutation runtime 的真实执行语义。

- `compile handlers` 不应默认直接产出最终 `MutationEffectProgram`。
- 更长期最优的分层是：
  - `compile handlers` 负责 intent 归一化、校验、拆分、产出 authored operation
  - `operation planner` 负责把 authored operation lower 成 effect program
  - `runtime` 只负责执行 effect program

这样可以避免 `compile handlers` 膨胀成第二套 domain runtime，也可以保留稳定的 authored operation 边界。

---

## 2. 最终 API 设计

## 2.1 顶层结构

```ts
export interface MutationEffectProgram<
  Doc extends object,
  Tag extends string = string
> {
  readonly effects: readonly MutationEffect<Doc, Tag>[]
}
```

- 不需要 `kind: 'program'`
- 不需要 `version`
- 不需要 `meta`
- 不需要 `scope`
- 不需要 `phases`

这是内部 IR，越薄越好。

## 2.2 effect 联合类型

```ts
export type MutationEffect<
  Doc extends object,
  Tag extends string = string
> =
  | MutationEntityEffect<Doc, Tag>
  | MutationOrderedEffect<Tag>
  | MutationTreeEffect<Tag>
  | MutationTagEffect<Tag>
```

只保留四类 effect：

1. `entity`
2. `ordered`
3. `tree`
4. `tag`

不要继续扩成更多平行 effect 家族。未来如果需要增强，优先在这四类内部扩展，而不是新增一层 taxonomy。

## 2.3 entity effect

```ts
export interface MutationEntityRef {
  table: string
  id: string
}

export type MutationEntityEffect<
  Doc extends object,
  Tag extends string = string
> =
  | {
      type: 'entity.create'
      entity: MutationEntityRef
      value: unknown
      tags?: readonly Tag[]
    }
  | {
      type: 'entity.patch'
      entity: MutationEntityRef
      writes: Readonly<Record<string, unknown>>
      tags?: readonly Tag[]
    }
  | {
      type: 'entity.patchMany'
      table: string
      updates: readonly {
        id: string
        writes: Readonly<Record<string, unknown>>
      }[]
      tags?: readonly Tag[]
    }
  | {
      type: 'entity.delete'
      entity: MutationEntityRef
      tags?: readonly Tag[]
    }
```

约束：

- `writes` 直接复用现有 record write 模型，不重新发明 patch DSL。
- 保留 `patchMany`，因为很多动作天然是批量 patch，没必要人为拆碎。

## 2.4 ordered effect

```ts
export type MutationOrderedEffect<Tag extends string = string> =
  | {
      type: 'ordered.insert'
      structure: string
      itemId: string
      to: MutationOrderedAnchor
      tags?: readonly Tag[]
    }
  | {
      type: 'ordered.move'
      structure: string
      itemId: string
      to: MutationOrderedAnchor
      tags?: readonly Tag[]
    }
  | {
      type: 'ordered.splice'
      structure: string
      itemIds: readonly string[]
      to: MutationOrderedAnchor
      tags?: readonly Tag[]
    }
  | {
      type: 'ordered.delete'
      structure: string
      itemId: string
      tags?: readonly Tag[]
    }
```

约束：

- 保留 `splice`，不要把 block move 降成多个 `move`。
- effect 保留动作语义，而不是退化成 path 写入。

## 2.5 tree effect

```ts
export type MutationTreeEffect<Tag extends string = string> =
  | {
      type: 'tree.insert'
      structure: string
      nodeId: string
      parentId?: string
      index?: number
      tags?: readonly Tag[]
    }
  | {
      type: 'tree.move'
      structure: string
      nodeId: string
      parentId?: string
      index?: number
      tags?: readonly Tag[]
    }
  | {
      type: 'tree.delete'
      structure: string
      nodeId: string
      tags?: readonly Tag[]
    }
  | {
      type: 'tree.restore'
      structure: string
      snapshot: MutationTreeSubtreeSnapshot
      tags?: readonly Tag[]
    }
```

约束：

- `restore` 必须是一等能力，不要把 subtree restore 再拆成很多 insert/move。
- tree effect 继续直接表达结构语义，不回退到 document path patch。

## 2.6 tag effect

```ts
export type MutationTagEffect<Tag extends string = string> = {
  type: 'tag'
  value: Tag
}
```

`tag` 是一等能力，不是 helper，也不是后处理。

下游真正关心的通常不是“某个路径变了”，而是：

- `node.geometry`
- `edge.route`
- `mindmap.structure`
- `canvas.order`

这些都应当直接从 effect program 进入 delta。

---

## 3. authoring API

## 3.1 builder 是 authoring helper，不是新的一层 runtime

最终建议保留一个极薄的 builder，并按命名空间分组：

```ts
export interface MutationEffectBuilder<
  Doc extends object,
  Tag extends string = string
> {
  entity: {
    create(entity: MutationEntityRef, value: unknown, tags?: readonly Tag[]): void
    patch(entity: MutationEntityRef, writes: Readonly<Record<string, unknown>>, tags?: readonly Tag[]): void
    patchMany(
      table: string,
      updates: readonly { id: string; writes: Readonly<Record<string, unknown>> }[],
      tags?: readonly Tag[]
    ): void
    delete(entity: MutationEntityRef, tags?: readonly Tag[]): void
  }
  structure: {
    ordered: {
      insert(structure: string, itemId: string, to: MutationOrderedAnchor, tags?: readonly Tag[]): void
      move(structure: string, itemId: string, to: MutationOrderedAnchor, tags?: readonly Tag[]): void
      splice(structure: string, itemIds: readonly string[], to: MutationOrderedAnchor, tags?: readonly Tag[]): void
      delete(structure: string, itemId: string, tags?: readonly Tag[]): void
    }
    tree: {
      insert(structure: string, nodeId: string, parentId?: string, index?: number, tags?: readonly Tag[]): void
      move(structure: string, nodeId: string, parentId?: string, index?: number, tags?: readonly Tag[]): void
      delete(structure: string, nodeId: string, tags?: readonly Tag[]): void
      restore(structure: string, snapshot: MutationTreeSubtreeSnapshot, tags?: readonly Tag[]): void
    }
  }
  semantic: {
    tag(value: Tag): void
  }
  build(): MutationEffectProgram<Doc, Tag>
}
```

这里 builder 的职责只有两个：

1. 让 planner 编写起来简单
2. 统一产出最终 `MutationEffectProgram`

它不是 phase，不是 plan，不是 runtime context，不是二次抽象。

## 3.2 compile handlers 的最终职责

`compile handlers` 不应该默认直接产最终 program。

最终职责应当是：

1. 读取当前 `document` / `reader`
2. 做 intent 级别的校验与归一化
3. 必要时把一个 intent 扩展为多个 authored operation
4. 产出 execute output

也就是：

```ts
intent
  -> compile handlers
  -> authored operations
```

而不是：

```ts
intent
  -> compile handlers
  -> final MutationEffectProgram
```

原因：

- 如果 `compile handlers` 直接写最终 program，这一层会逐渐吞掉 authored operation 层
- compile table 会变成第二套领域运行时
- history / log / replay / sync 更难保留稳定的领域语义边界
- 多个入口会开始重复拼装相同 effects

例外：

- 很简单的内部桥接场景，可以在 compile 内部直接组装一个短 program
- 但这不应成为默认架构，更不能作为公共主路径

## 3.3 custom 的最终形式

`custom` 不应该再是“直接改 document 的 reducer”。

最终应当改成 authored operation 对应的 planner：

```ts
export interface MutationCustomPlannerInput<
  Doc extends object,
  Op,
  Reader,
  Services = void,
  Tag extends string = string
> {
  op: Op
  document: Doc
  reader: Reader
  services: Services | undefined
  effects: MutationEffectBuilder<Doc, Tag>
  fail(issue: MutationIssue): never
}

export interface MutationCustomSpec<
  Doc extends object,
  Op,
  Reader,
  Services = void,
  Tag extends string = string
> {
  plan(input: MutationCustomPlannerInput<Doc, Op, Reader, Services, Tag>): void
}
```

也就是：

- custom 负责“读上下文并声明 effects”
- runtime 负责“应用 effects 并自动推导 inverse / footprint / delta”

不能再让 custom 自己手写：

- `document`
- `inverse`
- `delta`
- `footprint`

## 3.4 custom 仍然需要保留

`MutationEffectProgram` 并不意味着不再需要 custom op。

恰恰相反，长期最优里应该保留 custom authored operation，但把它的职责改对：

- authored custom op：表达领域动作
- custom planner：把领域动作 lower 成 effects
- runtime：执行 effects

也就是说，真正要删掉的不是 custom op，而是 custom reducer。

如果完全取消 custom op，让 compile handlers 直接产 program，问题会变成：

- compile 表无限膨胀
- 领域动作失去稳定命名与边界
- history / analytics / sync / debug 只能看到 effect，缺少领域层语义
- 多入口容易重复实现同一段 planner 逻辑

所以长期最优不是“去掉 custom op”，而是“保留 custom authored operation，去掉 custom reducer 特权”。

## 3.5 authored operation 不需要被迫降级成 public canonical op

这点需要明确：

- `MutationEffectProgram` 不是要求所有 authored custom op 在 public API 上拆成无数 canonical op。
- authored operation 仍然可以保留领域语义。
- 只是运行时不再让它直接修改 document，而是先 lower 成 effect program。

最终模型是：

```ts
domain op
  -> domain planner
  -> effect program
  -> runtime apply
```

而不是：

```ts
domain op
  -> 展开成很多 public op
  -> 再走既有 apply
```

---

## 4. runtime 最终职责

runtime 只做一件事：执行 `MutationEffectProgram`。

它的职责应该严格收敛为：

1. apply effect program，得到 next document
2. 记录执行过程中需要的 before/after 信息
3. 从执行记录自动派生 inverse program
4. 从 effect + 执行记录自动派生 footprint
5. 从 effect + tags + 写入路径自动派生 normalized `MutationDelta`

最终建议内部 API：

```ts
export interface AppliedMutationProgram<
  Doc extends object,
  Tag extends string = string
> {
  document: Doc
  applied: MutationEffectProgram<Doc, Tag>
  inverse: MutationEffectProgram<Doc, Tag>
  footprint: readonly MutationFootprint[]
  delta: MutationDelta
  issues: readonly MutationIssue[]
}
```

这里不需要额外的：

- `executionPlan`
- `effectScope`
- `effectFacts`
- `phaseContext`

apply 过程内部当然可以有局部纯函数，但不能把这些局部实现概念抬升成新的公共模型。

---

## 5. commit 最终形态

commit 应该直接保留 authored 输入和 effect 执行结果：

```ts
export interface MutationCommitRecord<
  Doc extends object,
  Op,
  Tag extends string = string
> {
  authored: readonly Op[]
  applied: MutationEffectProgram<Doc, Tag>
  inverse: MutationEffectProgram<Doc, Tag>
  delta: MutationDelta
  footprint: readonly MutationFootprint[]
}
```

其中：

- `authored` 用于日志、调试、回放入口
- `applied` 是这次真正执行了什么
- `inverse` 是自动推导出的 effect program

不要再要求 commit 里把 `inverse` 重新翻译回 authored op。那只会重新引入第二套语义。

---

## 6. 明确不要做的事

- 不要新增 `MutationExecutionPlan`
- 不要新增 `MutationEffectScope`
- 不要新增 `MutationEffectPhase`
- 不要新增“effect program -> normalized mutation op”的二次翻译
- 不要保留 custom reducer 直接返回 `document/delta/inverse/footprint`
- 不要同时维护“旧 custom runtime”和“新 effect runtime”
- 不要把 semantic tag 作为外部 helper 后处理
- 不要为了统一而把领域 op 退化成很多 public canonical op

最终只能保留一条执行链。

---

## 7. 与当前代码的对应关系

当前最厚的部分主要是：

- `shared/mutation/src/engine/runtime.ts`
- `shared/mutation/src/engine/structural.ts`
- `whiteboard/packages/whiteboard-core/src/operations/custom.ts`

长期最优的收敛方向：

- `runtime.ts`
  - 从“分别处理 entity / structural / custom 的拼接式 apply”
  - 改成“统一执行 effect program”
- `structural.ts`
  - 从“结构 op 直接改数据并返回 apply 结果”
  - 改成“结构 effect apply kernel”
- `custom.ts`
  - 从“自定义 reducer”
  - 改成“领域 planner”

---

## 8. 一步到位实施方案

## Phase 1：建立 effect IR 与 apply kernel

新增内部文件：

- `shared/mutation/src/engine/effect.ts`
- `shared/mutation/src/engine/effectBuilder.ts`
- `shared/mutation/src/engine/effectApply.ts`

落地内容：

- 定义 `MutationEffectProgram`
- 定义四类 `MutationEffect`
- 定义极薄 `MutationEffectBuilder`
- 定义 effect apply kernel 的统一返回结构

要求：

- 只作为 engine 内部能力引入
- 不保留第二套 effect 语义

## Phase 2：把 entity / structural apply 下沉到 effect apply

重写：

- `shared/mutation/src/engine/entity.ts`
- `shared/mutation/src/engine/structural.ts`

目标：

- entity canonical op 先 lower 成 entity effect，再执行
- structural canonical op 先 lower 成 ordered/tree effect，再执行
- 旧的直接返回 `MutationApplyResult` 的结构性 apply 逻辑删除

## Phase 3：runtime 改成以 program 为中心

重写：

- `shared/mutation/src/engine/runtime.ts`

目标：

- compile 完成后，不再分支进入 entity/structural/custom 三套 apply 逻辑
- 所有 authored op 统一 lower 成 `MutationEffectProgram`
- runtime 只执行 program
- `delta / inverse / footprint` 全部由 program apply 结果自动产出

## Phase 4：custom 从 reducer 切到 planner

重写：

- `MutationCustomSpec`
- `whiteboard/packages/whiteboard-core/src/operations/custom.ts`

目标：

- `reduce()` 删除
- `plan()` 成为唯一形式
- 领域 custom op 不再直接返回 document / inverse / delta / footprint
- 白板侧 custom 只声明 entity / ordered / tree / tag effects

## Phase 5：commit / history 全量切换

修改：

- history record
- commit record
- undo / redo apply

目标：

- 历史记录中的 inverse 改为 `MutationEffectProgram`
- undo / redo 直接执行 effect program
- 不再要求自定义 op 提供 replayable forward/inverse authored op

如果某些场景仍需保留 `authored` 作为日志，可单独记录，但不得作为执行真相。

## Phase 6：收口 public surface

修改：

- `shared/mutation/src/engine/index.ts`
- `shared/mutation/src/index.ts`
- 测试与类型导出

目标：

- public surface 不暴露多余的过渡模型
- custom 对外只暴露 planner 能力
- engine 内部只保留一条基于 `MutationEffectProgram` 的执行链

---

## 9. 最终判断标准

完成后必须满足：

- custom 不能直接改 document
- custom 不能直接手写 inverse
- custom 不能直接手写 delta
- custom 不能直接手写 footprint
- runtime 只能执行 `MutationEffectProgram`
- `MutationDelta` 只能从 effect program 自动归一化得到
- undo / redo 只能执行 effect program
- 不存在旧 runtime 与新 runtime 并存
- 不存在 canonical op apply 与 effect apply 两套真相

只要还存在两套执行真相，这轮重构就不算完成。
