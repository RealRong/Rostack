# MutationEffectProgram 最终 API 设计与实施方案

## 1. 目标

- 让 `shared/mutation` 的真正执行单位从“直接改 document 的 reducer / op apply”收敛为 **MutationEffectProgram**。
- 让 `custom op` 不再：
  - 直接改文档
  - 直接返回完整 `inverse`
  - 直接返回完整 `footprint`
  - 直接返回完整 `delta`
- 但也**不**把它退化成“一堆 public canonical operation”。
- 保持 API 简单清晰，不再额外堆一层厚中转模型。

---

## 2. 核心判断

## 2.1 `MutationEffectProgram` 不是新的 public operation 层

它不是：

- 新的一套 `Operation`
- 新的一套 `Intent`
- 新的一套 `Commit`

它应该只是 **mutation runtime 的内部执行 IR**。

也就是：

- public authored action 仍然可以是 intent / operation
- compile/custom planner 负责产出 effect program
- runtime 只执行 effect program

最终链路应该是：

```ts
intent / authored operation
  -> compile / custom planner
  -> MutationEffectProgram
  -> apply program
  -> commit
```

而不是：

```ts
custom op
  -> many canonical operations
  -> apply operations
```

---

## 3. 为什么需要这层

当前最大问题不是“custom 太灵活”，而是 **custom 拿了太多解释权**。

现在 custom reducer 往往要自己决定：

- 怎么改 document
- delta 怎么写
- inverse 怎么写
- footprint 怎么写

这会导致：

- `shared/mutation` runtime 很厚
- `whiteboard-core/operations/custom.ts` 很厚
- 上下游都在重复解释一次同一件事

最优解不是继续给 custom 更多 helper，而是把解释权收回到底层 runtime。

---

## 4. 最终设计原则

## 4.1 effect program 必须是“执行 IR”，不是“过渡壳”

这点最重要。

`MutationEffectProgram` 不应该只是：

- 把今天的 `create / patch / structural / custom` 再包一层对象

如果只是这样，复杂度只会转移，不会下降。

它必须直接成为：

- next document 的唯一输入
- inverse 的唯一派生源
- footprint 的唯一派生源
- normalized delta 的唯一派生源

也就是说，**effect program 不是 adapter，而是执行语义本身**。

## 4.2 effect 要保留 batch 语义

不要把高层动作机械拆成很多零碎单步 effect。

例如：

- 一个 `group.merge`
- 一个 `mindmap.topic.moveByDrop`
- 一个 `edge.route.insertPoint`

这些都可以 lower 成一个 program，program 内包含多个 effect，但它们仍然是一个动作。

所以 program 应该支持：

- `patchMany`
- `splice`
- `move`
- `restore`

这种批量 effect，而不是只支持最小颗粒度原子写。

## 4.3 semantic change tags 必须是一等能力

downstream 真正关心的不是“你写了哪几个 path”，而是：

- `canvas.order`
- `edge.route`
- `mindmap.structure`
- `node.geometry`

所以 effect program 必须允许直接附带 semantic tag。

tag 不是 helper，也不是后处理，而是 program 的一部分。

---

## 5. 最终 API 设计

## 5.1 顶层结构

```ts
export interface MutationEffectProgram<
  Doc extends object,
  Tag extends string = string
> {
  readonly effects: readonly MutationEffect<Doc, Tag>[]
}
```

不需要额外的 `version`、`kind: 'program'`、`meta` 之类字段。

原因：

- 这是 internal IR
- 越薄越好
- 不需要为了抽象而抽象

真正的重点是 `MutationEffect`。

## 5.2 effect 联合类型

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

这里只保留四类 effect：

1. entity
2. ordered
3. tree
4. tag

不要再扩成很多平行 effect 大类。

如果未来要扩展，也优先扩在这四类内部，而不是再新增一层 effect taxonomy。

---

## 6. Entity effect

## 6.1 设计

```ts
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
      writes: MutationRecordWrites
      tags?: readonly Tag[]
    }
  | {
      type: 'entity.patchMany'
      table: string
      updates: readonly {
        id: string
        writes: MutationRecordWrites
      }[]
      tags?: readonly Tag[]
    }
  | {
      type: 'entity.delete'
      entity: MutationEntityRef
      tags?: readonly Tag[]
    }
```

```ts
export interface MutationEntityRef {
  table: string
  id: string
}
```

## 6.2 为什么保留 `patchMany`

因为很多动作天然是批量的：

- 多节点 style 更新
- mindmap topic batch update
- selection move 之后的一组 patch

如果不保留 `patchMany`，program 会无意义膨胀。

## 6.3 `writes` 用什么

直接复用现有 record write 模型即可：

```ts
export type MutationRecordWrites = Readonly<Record<string, unknown>>
```

或者直接复用 shared draft 的 typed writes。

这里不要重新发明 patch 语法。

---

## 7. Ordered effect

## 7.1 设计

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

```ts
export type MutationOrderedAnchor =
  | { kind: 'start' }
  | { kind: 'end' }
  | { kind: 'before'; itemId: string }
  | { kind: 'after'; itemId: string }
```

## 7.2 为什么结构名还是 string

因为这层是 shared internal IR。

shared 不应知道：

- `canvas.order`
- `edge.labels:<id>`
- `edge.route:<id>`

这些仍然由 domain 侧注册 structure spec。

shared 只负责：

- 读取 structure model
- 执行 ordered effect
- 派生 inverse / footprint / delta

---

## 8. Tree effect

## 8.1 设计

```ts
export type MutationTreeEffect<Tag extends string = string> =
  | {
      type: 'tree.insert'
      structure: string
      nodeId: string
      parentId?: string
      index?: number
      value: unknown
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
      snapshot: MutationTreeSnapshot
      tags?: readonly Tag[]
    }
```

这里直接保留 `restore`，因为 tree inverse 里它非常自然。

如果把 `restore` 去掉，inverse 规划反而会绕。

---

## 9. Tag effect

## 9.1 设计

```ts
export type MutationTagEffect<Tag extends string = string> = {
  type: 'tag'
  value: Tag
}
```

它非常薄，不要加别的东西。

tag effect 的目的只有一个：

- 表达 semantic change

它不是 document mutation。

## 9.2 为什么既有 `tags?: []` 又有 `type: 'tag'`

两者用途不同：

- `tags?: []` 是 effect 附带的语义标签，适合大多数情况
- `type: 'tag'` 适合显式补充纯语义变化

例如：

- 某些动作并不修改实体 path，但你仍然想明确标记 `canvas.order`
- 某些 effect 需要统一附带多个 tag

最优做法是两者都支持，但 runtime 会统一汇总。

---

## 10. Program builder

## 10.1 不要让外部手写裸对象

虽然 effect program 本体很薄，但仍然应该提供 builder：

```ts
export interface MutationEffectBuilder<
  Doc extends object,
  Tag extends string = string
> {
  create(entity: MutationEntityRef, value: unknown, tags?: readonly Tag[]): void
  patch(entity: MutationEntityRef, writes: MutationRecordWrites, tags?: readonly Tag[]): void
  patchMany(table: string, updates: readonly {
    id: string
    writes: MutationRecordWrites
  }[], tags?: readonly Tag[]): void
  delete(entity: MutationEntityRef, tags?: readonly Tag[]): void

  orderedInsert(structure: string, itemId: string, to: MutationOrderedAnchor, tags?: readonly Tag[]): void
  orderedMove(structure: string, itemId: string, to: MutationOrderedAnchor, tags?: readonly Tag[]): void
  orderedSplice(structure: string, itemIds: readonly string[], to: MutationOrderedAnchor, tags?: readonly Tag[]): void
  orderedDelete(structure: string, itemId: string, tags?: readonly Tag[]): void

  treeInsert(structure: string, nodeId: string, value: unknown, input?: {
    parentId?: string
    index?: number
    tags?: readonly Tag[]
  }): void
  treeMove(structure: string, nodeId: string, input?: {
    parentId?: string
    index?: number
    tags?: readonly Tag[]
  }): void
  treeDelete(structure: string, nodeId: string, tags?: readonly Tag[]): void
  treeRestore(structure: string, snapshot: MutationTreeSnapshot, tags?: readonly Tag[]): void

  tag(value: Tag): void
  build(): MutationEffectProgram<Doc, Tag>
}
```

## 10.2 builder 是 helper，不是第二层抽象

这里 builder 只是为了：

- 少写样板
- 做最基本校验
- 聚合 effects

它不能再引入：

- phase
- scope
- context
- nested DSL

否则又会变厚。

---

## 11. runtime 怎么执行

## 11.1 runtime 只看 program

shared runtime 的 apply 主逻辑最终应该收敛成：

```ts
applyProgram({
  document,
  program,
  entities,
  structures
}) -> {
  document,
  inverse,
  footprint,
  delta
}
```

这里的 `inverse` 不是 public op list，而是：

```ts
type MutationInverseProgram = MutationEffectProgram
```

也就是 inverse 也是 effect program。

## 11.2 自动派生的内容

runtime 从 effect program 自动派生：

- `next document`
- `inverse program`
- `footprint`
- `normalized MutationDelta`

domain 不再手写这四项。

## 11.3 history 里存什么

长期最优：

```ts
commit = {
  authored,
  applied: MutationEffectProgram,
  inverse: MutationEffectProgram,
  delta,
  footprint
}
```

也就是：

- authored: 原始动作，可选
- applied: 真正执行的 resolved effect program
- inverse: resolved inverse effect program

不要再要求 history.forward 一定是 public `Operation[]`。

---

## 12. custom 最终怎么改

## 12.1 custom 不再 reduce document

当前 custom reducer：

- 读 document
- 直接返回 next document / delta / inverse / footprint

最终应该改成：

```ts
export interface MutationCustomPlannerInput<Doc, Op, Reader, Services, Tag extends string> {
  op: Op
  document: Doc
  reader: Reader
  services: Services | undefined
  effects: MutationEffectBuilder<Doc, Tag>
  fail(issue: ...): never
}
```

返回值可以非常简单：

```ts
type MutationCustomPlannerResult<Tag extends string> = {
  outputs?: readonly unknown[]
  issues?: readonly MutationIssue[]
  history?: false
}
```

也就是：

- custom 只往 builder 里写 effect
- 可以补 outputs / issues
- `history: false` 仍然允许显式跳过 history

但它不再返回：

- `document`
- `delta`
- `inverse`
- `footprint`

## 12.2 这时 custom 还是 custom 吗

是的。

因为“custom”的核心在于：

- 它做领域规划
- 它读当前 document
- 它决定产生哪些 effect

而不在于它有没有 document mutation 特权。

---

## 13. compile 最终怎么改

compile handlers 与 custom planner 最终应该统一到同一出口：

```ts
intent -> MutationEffectProgram
custom op -> MutationEffectProgram
```

也就是说：

- compile 不再优先产 `Operation[]`
- custom 也不再特判为 document reducer

最终 shared runtime 只执行一种东西：

- `MutationEffectProgram`

---

## 14. delta 如何派生

## 14.1 不再由 custom 手写

delta 派生逻辑应从 effect 类型自动生成：

- `entity.create/delete/patch/patchMany`
  - 生成 entity/path 变化
- `ordered.*`
  - 生成 structure/path 变化
- `tree.*`
  - 生成 tree/path 变化
- `tag`
  - 生成 semantic changed channel

## 14.2 tag 是 delta 的高层入口

最终很多下游判断应尽量直接基于 tag/path schema，而不是依赖 custom 自己发明字段。

例如：

- `delta.changed('edge.route', id)`
- `delta.changed('mindmap.structure', id)`
- `delta.changed('canvas.order')`

---

## 15. footprint 如何派生

footprint 不再由 custom planner 自己拼。

统一规则：

- entity effect -> entity footprint
- ordered/tree effect -> structure footprint
- tag effect -> 不产生 footprint

这样 local history / remote conflict 才能真正统一。

---

## 16. inverse 如何派生

## 16.1 inverse 也应该是 effect program

不要再强制 custom planner 手写 inverse operation。

统一由 runtime 在 apply 时根据 current document 派生：

- `entity.create` -> `entity.delete`
- `entity.delete` -> `entity.create(snapshot)`
- `entity.patch` -> `entity.patch(inverseWrites)`
- `ordered.insert` -> `ordered.delete`
- `ordered.move` -> `ordered.move(previousAnchor)`
- `ordered.splice` -> `ordered.splice(previousPlan)`
- `tree.insert` -> `tree.delete`
- `tree.delete` -> `tree.restore(snapshot)`
- `tree.move` -> `tree.move(previousParent/index)`
- `tree.restore` -> `tree.delete`

## 16.2 为什么这比 today better

因为 inverse 解释权收回后：

- custom 不需要了解 history 细节
- history replay 更稳定
- 结构性动作不会遗漏 inverse/footprint/delta 一致性

---

## 17. 不需要的东西

为了保持简单，这些都不要引入：

- 不要再有 `MutationEffectRuntimeContext`
- 不要有 `program phases`
- 不要有 `effect scope`
- 不要有 `program frame`
- 不要把 effect program 再包装成 `plan -> execution plan -> effect plan`

最终就是：

```ts
builder -> program -> apply
```

够了。

---

## 18. 分阶段实施方案

## Phase 1：引入 effect program IR

- 在 `shared/mutation` 新增：
  - `effect.ts`
  - `effectBuilder.ts`
  - `effectApply.ts`
- 先把 effect 类型、builder、apply result 定义好
- 暂时不替换现有 runtime 主路径

## Phase 2：先迁移 structural / entity apply 内核

- 把今天的：
  - entity canonical apply
  - structural ordered/tree apply

  下沉为 effect apply kernel

- 保证 runtime 能执行：
  - entity effects
  - ordered effects
  - tree effects

这一步是核心。

## Phase 3：自动派生 inverse / footprint / delta

- effect apply 返回统一 execution result：

```ts
{
  document,
  inverse,
  footprint,
  delta
}
```

- 这一步完成后，effect program 就真正成为唯一执行入口

## Phase 4：compile handlers 改为产 program

- intent compile 先不再产 `Operation[]`
- 直接写入 builder
- 返回 `MutationEffectProgram`

## Phase 5：custom reducer 改为 custom planner

- 废弃 today 的 custom reduce document 模式
- 改成：
  - 读 document
  - 写 effects
  - 产 outputs / issues

## Phase 6：commit/history 改为存 applied/inverse program

- commit 结构中加入：
  - `applied`
  - `inverse`

- 若需要兼容极少数旧字段，可只在 internal runtime 临时保留，不对外暴露
- 长期最终形态不保留旧 `forward operation[]` 作为唯一真相

## Phase 7：whiteboard-core custom 拆域

- `operations/custom.ts` 拆分
- 每个 domain custom planner 各自产 program

## Phase 8：whiteboard-engine / editor-scene 全量切新 delta

- 让 typed delta 完全来自 effect-derived normalized delta
- 不再允许 custom 旁路写 delta

---

## 19. 最终判断

长期最优的 `MutationEffectProgram` 设计必须满足三点：

1. **它是唯一执行 IR，不是新的过渡壳**
2. **它保留 batch 语义，不退化成很多 public canonical op**
3. **它统一派生 inverse / footprint / delta，不再让 custom 手写**

最简洁、最清晰、最长期的形态就是：

```ts
intent / custom planner
  -> MutationEffectProgram
  -> runtime apply
  -> commit
```

其中 `MutationEffectProgram` 只保留四类 effect：

- entity
- ordered
- tree
- tag

不再扩出第二套 operation 体系，不再引入新的厚 runtime context，不再让 custom reducer 直接拥有 document mutation 特权。

这才是真正的“降级 custom，同时不新增一层中转抽象”。
