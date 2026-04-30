# Unified Intent / Program / Delta 最终方案

## 1. 目标

- 整条链统一成一条主轴：`intent -> program -> apply -> normalized delta -> projection`
- 不再保留 `custom op / canonical op / domain op / helper runtime` 多层中转
- `dataview`、`whiteboard`、未来 `whiteboard-editor` 本地交互态都走同一模型
- 不保留兼容层，不保留双 runtime，不保留双 delta，不保留双真相

---

## 2. 最终结论

### 2.1 shared/mutation 只保留一个内部执行模型

最终只保留一个内部 IR：

```ts
type MutationProgramStep<Tag extends string = string> =
  | { type: 'entity.create', ... }
  | { type: 'entity.patch', ... }
  | { type: 'entity.delete', ... }
  | { type: 'ordered.insert', ... }
  | { type: 'ordered.move', ... }
  | { type: 'ordered.splice', ... }
  | { type: 'ordered.delete', ... }
  | { type: 'ordered.patch', ... }
  | { type: 'tree.insert', ... }
  | { type: 'tree.move', ... }
  | { type: 'tree.delete', ... }
  | { type: 'tree.restore', ... }
  | { type: 'tree.node.patch', ... }
  | { type: 'semantic.mark', ... }

interface MutationProgram<Tag extends string = string> {
  steps: readonly MutationProgramStep<Tag>[]
}
```

shared/mutation 对外只提供三件事：

1. compile：把 domain intent 编译成 `MutationProgram`
2. apply：执行 `MutationProgram`，统一产出 next document / inverse / footprint / normalized delta
3. engine：维护 current / history / subscribe

明确删除或继续收口的概念：

- domain custom op 作为内部真相
- canonical op 作为另一层内部真相
- domain 自己手写 inverse / delta / footprint / structural facts
- compile 后再进 custom reducer 做第二次解释

### 2.2 structure spec 只做 storage adapter

`ordered/tree` 仍然保留，但它们只负责：

- 读结构
- 写结构
- patch item / patch tree node value
- 供 shared 自动派生 inverse / delta / footprint

它们不是另一套 op 模型，不是另一套 runtime。

### 2.3 projection 继续保留，但变薄

`shared/projection` 不需要删除，但职责必须收薄到：

- phase graph
- 执行顺序
- store sync
- capture / subscribe

不再承载：

- domain 特有的 changed 语义翻译
- 厚 `surface/family/patch snapshot` 中间语义
- 大量 domain helper 风格读写协议

domain 自己在 phase 里直接读 normalized delta，写自己的 working state，再通过 spec 同步到 store。

---

## 3. shared/mutation 最终 API

### 3.1 compile API

```ts
interface MutationCompileContext<Doc, Intent, Reader, Program> {
  intent: Intent
  document: Doc
  reader: Reader
  program: Program
  output(value: unknown): void
  issue(issue: MutationIssue): void
  fail(issue: MutationIssue): never
}

type MutationIntentCompiler<Doc, Intent, Reader, Program> = (
  context: MutationCompileContext<Doc, Intent, Reader, Program>
) => void
```

这里 `program` 是唯一写入口，而且它在 domain compile handler 里就已经是最终 writer 形状。

也就是：

- shared 底层仍然只认一套 `MutationProgramWriter`
- 但 shared runtime / engine 在进入 compile handler 前，就必须把它提升成 domain writer
- handler / stage / lower 函数内部不允许再 `readProgram(...)` 二次提取
- compile 链内部不允许再保留 `emitOps / emitData / appendXXX` 这类过渡 helper

最终不再要求 domain emit 自己的 op，再让 shared 二次 lower。

### 3.2 typed program writer

shared 提供的是通用底层 writer：

```ts
interface MutationProgramWriter<Tag extends string = string> {
  entity: {
    create(entity: { table: string; id: string }, value: unknown, tags?: readonly Tag[]): void
    patch(entity: { table: string; id: string }, writes: Record<string, unknown>, tags?: readonly Tag[]): void
    delete(entity: { table: string; id: string }, tags?: readonly Tag[]): void
  }
  structure: {
    ordered: {
      insert(structure: string, itemId: string, value: unknown, to: MutationOrderedAnchor, tags?: readonly Tag[]): void
      move(structure: string, itemId: string, to: MutationOrderedAnchor, tags?: readonly Tag[]): void
      splice(structure: string, itemIds: readonly string[], to: MutationOrderedAnchor, tags?: readonly Tag[]): void
      delete(structure: string, itemId: string, tags?: readonly Tag[]): void
      patch(structure: string, itemId: string, patch: unknown, tags?: readonly Tag[]): void
    }
    tree: {
      insert(...): void
      move(...): void
      delete(...): void
      restore(...): void
      patch(...): void
    }
  }
  semantic: {
    change(key: string, change?: MutationChangeInput): void
    footprint(footprint: readonly MutationFootprint[]): void
  }
}
```

但 domain compile 不应长期直接手拼：

- `{ table: 'view', id }`
- `view.filter.rules:${viewId}`
- `{ type: 'ordered.move', ... }`
- 各种 `appendXXX(...)` helper

最终应当是：

1. `shared` 提供一套唯一底层 `MutationProgramWriter`
2. `domain` 基于它封装一层很薄的 `typed program writer`
3. `shared` 在 compile context 边界直接注入这个 typed writer
4. compile 只拿 `ctx.program` 往下传，不再直接 append 裸 step

约束非常明确：

- typed writer 只能 append 到底层 `MutationProgramWriter`
- typed writer 不能持有 document apply / inverse / delta / footprint 逻辑
- typed writer 不是第二套 op model
- typed writer 不是第二套 runtime
- typed writer 不能靠 `readProgram` 之类 helper 在 handler 内临时转换出来
- compile 内部函数签名应当统一直接传 `ctx`，而不是 `input + reader + readProgram`

shared compile runtime 需要支持：

```ts
interface MutationCompileOptions<Doc, Intent, Reader, DomainProgram> {
  createProgram(base: MutationProgramWriter<string>): DomainProgram
}
```

也就是 shared 负责：

- 创建唯一底层 `MutationProgramWriter`
- 调用 `createProgram(base)` 产出 domain writer
- 把这个 domain writer 作为 `ctx.program` 传给 handler

domain 负责：

- 定义 typed writer
- 在 compile 中只使用 typed writer

理想写法：

```ts
ctx.program.view.patch(view.id, {
  search: next.search
})

ctx.program.view.filter.insert(view.id, rule, { before })
ctx.program.view.filter.patch(view.id, rule.id, { presetId, value })
ctx.program.view.filter.move(view.id, rule.id, { before })
ctx.program.field.option.insert(field.id, option, { before })
```

也就是：

- shared 保证只有一套底层 step IR
- domain 只负责把领域命名映射成这套 step
- compile 文件里只保留领域校验、领域推导、编排
- writer 应当作为 compile 主轴一路下传，而不是在中途被 helper 再解释一次

### 3.3 delta API

`MutationDelta` 保持一份 normalized 数据，同时提供统一读接口：

```ts
interface MutationDelta {
  reset?: true
  changes: Readonly<Record<string, MutationChange>>

  has(key: string): boolean
  changed(key: string, id?: string): boolean
  ids(key: string): ReadonlySet<string> | 'all'
  paths(key: string, id: string): readonly string[] | 'all' | undefined
}
```

原则：

- 先把底层通用读能力放进 `MutationDelta`
- domain typed delta 只允许做 schema 命名映射，不允许再造一堆 `readXXX / hasXXX / appendXXX` helper
- 如果一个 domain 还需要大量 helper 才能读 delta，说明 delta schema 设计错了

### 3.4 history / current

commit 里保存的唯一真相是：

```ts
interface MutationCommit<Doc, Tag extends string = string> {
  rev: number
  applied: MutationProgram<Tag>
  inverse: MutationProgram<Tag>
  delta: MutationDelta
  footprint: readonly MutationFootprint[]
}
```

不再把 domain op 作为 history 唯一真相。

---

## 4. Dataview 最终设计

这轮只覆盖 `dataview-core` 的 `intent -> compile -> op/program`，不覆盖 `active/index/publish`。

### 4.1 现状问题

当前真正厚的是：

- `compile-field.ts`
- `compile-view.ts`
- `compile-view-ops.ts`
- `custom.ts`
- `types/operations.ts`

现状本质是：

- intent 先降成一大批 `DocumentOperation`
- 结构类语义再由 `custom.ts` 兜底解释
- `view.filter/sort/display/order` 等集合语义被拆成 domain op + structural helper 两层

这不是长期最优。

### 4.2 最终模型

`dataview-core` 最终不再把 `DocumentOperation` 作为内部真相。

compile 不直接手写裸 step，而是通过 `DataviewProgramWriter` 产出 shared program step。

而且 dataview compile context 必须直接是：

```ts
interface DataviewCompileContext {
  intent: DataviewIntent
  document: DataDoc
  reader: DocumentReader
  program: DataviewProgramWriter
  output(value: unknown): void
  issue(issue: ValidationIssue): void
  fail(issue: ValidationIssue): never
}
```

也就是：

- `compileRecordIntent(ctx)`
- `compileFieldIntent(ctx)`
- `compileViewIntent(ctx)`
- 所有更小的 lower / stage / write 函数继续直接传 `ctx`
- 不允许再出现 `readProgram(ctx)` / `emitOps(...)` / `emitData(...)`

最终写法：

- `record.create / patch / delete`
  - 直接产出 `entity.*`
- `record.fields.writeMany`
  - 直接产出一批 `entity.patch(record, values.xxx)`
- `field.option.*`
  - 直接产出 `ordered.*`
- `view.filter.*`
  - 直接产出 `ordered.* + entity.patch(view.filter.mode)`
- `view.sort.*`
  - 直接产出 `ordered.*`
- `view.display.*`
  - 直接产出 `ordered.*`
- `view.order.*`
  - 直接产出 `ordered.*`
- `view.group / calc / layout / open`
  - 直接产出 `entity.patch`

`DataviewProgramWriter` 只是对以下内容做类型化收口：

- entity family 名称
- structure key 命名
- patch 形状
- ordered/tree 写法

它不是 `DocumentOperation` 替代品，不会形成第二套 runtime。

### 4.3 Dataview 需要保留的 domain 概念

只保留：

- `DataviewIntent`
- `dataview compile handlers`
- `DataviewCompileContext`
- `DataviewProgramWriter`
- `dataview mutation schema`
- `ordered/tree/entity` handle factory

删除：

- `DocumentOperation` 作为内部主执行模型
- `custom.ts` 这类二次解释层
- `compile-view-ops.ts` 这类先造 op 再下放的中间层
- `readProgram / emitOps / emitData / appendXXX` 这类 compile 期桥接 helper

### 4.4 Dataview 实施结果标准

- compile handler 直接写 program
- delta 直接来自 shared apply
- dataview 不再维护自己的结构 op runtime
- `dataview-core` 的复杂度集中在 domain validation，不集中在 op 翻译

---

## 5. Whiteboard 最终设计

### 5.1 whiteboard-core

最终只保留：

- public intent
- compile
- domain 算法
- handle factory

compile 不直接手写裸 step，而是通过 `WhiteboardProgramWriter` 写 shared program step：

- node / edge / group / mindmap 实体字段变更走 `entity.*`
- canvas order / edge labels / edge route points 走 `ordered.*`
- mindmap tree 拓扑与 topic value 走 `tree.*`

不再保留：

- domain custom op 作为主执行层
- compile 后再进 custom planner 第二次翻译
- edge / mindmap 自己的半底层结构 op 层

### 5.2 whiteboard-engine

职责保持简单：

- 暴露 document engine
- 暴露 normalized `MutationDelta`
- 暴露 typed schema 映射

typed delta 只做命名映射，例如：

```ts
delta.changed('edge.route', edgeId)
delta.ids('mindmap.structure')
delta.has('canvas.order')
```

不再追加 domain helper 森林。

### 5.3 whiteboard-editor-scene

`editor-scene` 继续是 projection，不再自己定义另一套零散 change 协议。

最终输入改成：

```ts
interface EditorSceneInput {
  document: {
    rev: number
    doc: WhiteboardDocument
    delta: MutationDelta
  }
  editor: {
    state: EditorStateDocument
    delta: MutationDelta
  }
  view: SceneViewSnapshot
}
```

也就是 scene 只消费两份标准化输入：

- document delta
- editor state delta

删除：

- ad hoc `EditorSceneSourceChange`
- session / interaction / preview 各自不同的 change 结构
- scene 自己额外维护的“非 mutation 风格输入差量协议”

---

## 6. Whiteboard Editor 最终设计

### 6.1 editor 也要成为一个 mutation domain

`whiteboard-editor` 未来不再把状态散落在：

- `session/runtime.ts`
- `selection.ts`
- `preview/*`
- `interaction/*`
- `tasks/*`
- 各 input session 闭包局部状态

而是统一为一个本地 document：

```ts
interface EditorStateDocument {
  tool: ToolState
  selection: SelectionTarget
  edit: EditSession | null
  preview: EditorPreviewState
  interaction: EditorInteractionState
  viewport: Viewport
}
```

如果未来 task 需要持久状态，也进入这里；如果只是调度器，不进 state。

### 6.2 editor 的输入链改成 intent compiler

输入系统不再直接 `set / mutate / preview.write / interaction.write`。

最终改成：

```ts
type EditorIntent =
  | { type: 'selection.replace', ... }
  | { type: 'selection.add', ... }
  | { type: 'selection.remove', ... }
  | { type: 'edit.startNode', ... }
  | { type: 'edit.startEdgeLabel', ... }
  | { type: 'edit.input', ... }
  | { type: 'preview.node.set', ... }
  | { type: 'preview.edge.set', ... }
  | { type: 'preview.draw.set', ... }
  | { type: 'interaction.hover.set', ... }
  | { type: 'interaction.drag.set', ... }
  | { type: 'interaction.mode.set', ... }
  | { type: 'viewport.set', ... }
```

pointer / keyboard / task / action 只做两件事：

1. 读 document / scene / editor state
2. 产出 `EditorIntent[]` 和 `WhiteboardIntent[]`

然后分别喂给：

- document engine
- editor state engine

### 6.3 tasks 的最终位置

task runtime 只保留调度能力，例如：

- nextFrame
- delay
- cancel / dispose

task 产生的所有可观察状态必须走 `EditorIntent -> editor delta`。

也就是：

- task 不直接改 scene
- task 不直接改 preview store
- task 不等待“scene publish 完成后再读特殊结果”
- task 每一帧发 intent，本地 editor engine 立刻 apply，scene 正常消费 editor delta

### 6.4 editor-scene 和 editor 的边界

最终边界非常清晰：

- editor 负责本地交互状态与本地 intent
- engine 负责文档 intent
- scene 只负责把 `document + editor state` 投影为可读 scene

scene 不是 session 容器，不是 task runtime，不是 interaction runtime。

---

## 7. shared/projection 最终设计

### 7.1 shared/projection 保留什么

保留：

- phases
- `after` dependency
- runtime revision
- stores spec
- capture

### 7.2 shared/projection 不再负责什么

不负责：

- domain dirty helper 体系
- domain facts helper 体系
- domain patch helper 体系
- domain delta 二次翻译协议

这些都应由 domain 自己基于 normalized delta 直接完成。

### 7.3 projection phase 的最终写法

最终 phase 只做：

1. 读输入 delta
2. 读当前 state / previous read
3. 写 working state
4. 写 store change

不再引入额外 `scope/action/emit` 中间协议。

---

## 8. 实施方案

## Phase 1：收口 shared/mutation 公共模型

- 把公共术语统一成 `intent / program / apply / delta`
- 继续删除 `custom op / canonical op` 作为主对外概念
- compile handler 以写 `MutationProgramWriter` 为唯一出口
- `MutationDelta` 补齐统一读接口：`has / changed / ids / paths`
- commit/history/current 只围绕 applied/inverse program

完成标准：

- shared/mutation 不再把多套内部 op 概念暴露成主要 API

## Phase 2：先做 typed program writer

- `shared` 保持唯一底层 `MutationProgramWriter`
- `shared` compile runtime 增加 `createProgram(base)` 注入点
- `dataview-core` 新建 `DataviewProgramWriter`
- `whiteboard-core` 新建 `WhiteboardProgramWriter`
- typed writer 负责 family / structure / patch 形状的类型化映射
- 这一阶段只落基础设施，不改 compile 真相
- Phase 3/4 的 compile 迁移必须以 typed writer 为唯一目标 API
- 禁止再引入 `appendXXX helper` 作为长期 API

完成标准：

- typed writer 公共 API 完整可用
- shared compile context 已经能直接承载 domain typed writer
- domain 不再需要在 compile 之外手拼结构 key / entity ref / step object

## Phase 3：Dataview core 直接写 program

- 先把 dataview compile context 改成直接持有 `DataviewProgramWriter`
- 重写 `dataview-core` compile 层
- 删除 `DocumentOperation` 作为内部真相
- 删除 `custom.ts` 二次解释层
- `field.option / view.filter / view.sort / view.display / view.order` 直接走 `ordered.*`
- 其余 view/field/record 字段变更直接走 `entity.*`
- 全部基于 `DataviewProgramWriter`
- 删除 `readProgram / emitOps / emitData` 一类 compile bridge helper

完成标准：

- `dataview-core` compile 后直接得到 shared program
- compile 链上 `ctx.program` 直接一路传到底

## Phase 4：Whiteboard core 直接写 program

- 所有 whiteboard compile handler 直接写 shared program
- 删除残余 domain custom op 主执行层
- edge/mindmap/canvas 结构变更全部回到底层 `ordered/tree`
- 全部基于 `WhiteboardProgramWriter`

完成标准：

- `whiteboard-core` 不再维护第二套内部 op runtime

## Phase 5：引入 editor state engine

- 新建 `EditorStateDocument`
- 新建 `EditorIntent`
- 用同一套 shared/mutation 驱动 editor 本地状态
- `selection / edit / preview / interaction / viewport` 全部迁入

完成标准：

- `session/runtime.ts` 不再是本地状态真相中心

## Phase 6：改写 editor 输入与 task

- `input/core/runtime.ts` 从“直接改 session”改成“编译 editor/document intent”
- 各 input session 只保留编排和局部瞬时闭包状态
- task runtime 只保留调度，不再直接写 preview / scene

完成标准：

- editor 输入链不再直接调用 `mutate.* / preview.write / interaction.write`

## Phase 7：改写 editor-scene 输入

- scene 输入统一成 `document delta + editor delta + view`
- 删除 ad hoc `EditorSceneSourceChange`
- phase 直接消费两份 normalized delta

完成标准：

- scene 不再依赖 session 专属 change 协议

## Phase 8：shared/projection 收薄

- 删除 projection/domain 间多余 helper 适配层
- stores 按 spec 直接映射
- 保留 phase graph 与 store sync

完成标准：

- projection 成为真正通用薄层

---

## 9. 不允许保留的东西

- dataview 一边走 `DocumentOperation`，一边又走 shared program
- whiteboard 一边走 domain custom op，一边又走 shared program
- editor 一边直接改 session store，一边又引入 editor intent
- scene 一边吃 normalized delta，一边又维护专属 change 协议
- history 一边存 domain op，一边又存 applied/inverse program

最终只能保留一条链：

`intent -> program -> apply -> normalized delta -> projection`
