# Whiteboard Editor State Engine 的 Mutation / Intent 设计说明

## 1. 结论

结合当前 `shared/mutation`、`UNIFIED_INTENT_PROGRAM_DELTA_FINAL_PLAN.zh-CN.md` 的 Phase 5 要求，以及现有 `whiteboard-editor` 实现，结论很明确：

- 文档侧已经基本走在目标链路上：`whiteboard-editor/write/* -> whiteboard-engine.execute(intent) -> shared/mutation`
- editor 本地状态还没有进入同一条链，它目前仍然分散在 `session/*`、`interaction/*`、`preview/*`、`scene/binding.ts`
- Phase 5 真正要补的是第二个本地 engine：`EditorStateEngine`
- 这个 engine 不负责 whiteboard document，只负责 editor 本地可观察状态
- 后续统一链路应该变成：

```ts
WhiteboardIntent -> shared/mutation -> document delta
EditorIntent     -> shared/mutation -> editor delta
scene            <- document + editor state + 两份 normalized delta
```

换句话说，当前 whiteboard document domain 已经在往目标态靠，editor domain 还没有。

另外有一个很重要的建模原则也需要明确：

- whiteboard document 里的 `ids/byId`、ordered/tree 结构，核心是为了文档级变更、结构编辑、协作冲突和增量 apply
- editor 本地态不是协作文档，不要机械复用 document 的结构复杂度
- 对 editor 本地态里的数组，如果没有明确的结构型编辑需求，默认直接整体替换
- 不要为了“看起来统一”把本地态预先拆成 `ids/byId`
- 只有当 scene 增量更新确实需要按 id 精确触达，而且整体替换成本明显过高时，才把局部状态升级成 map entity

这条原则比“形式统一”更重要。

---

## 2. 现在 editor 的真实实现状态

### 2.1 文档写入已经有 intent 链

当前文档写入入口已经不是直接改 document，而是：

- `whiteboard/packages/whiteboard-editor/src/write/*`
- 调用 `engine.execute(intent)`
- 由 `whiteboard/packages/whiteboard-engine/src/runtime/engine.ts` 交给 `MutationEngine`
- compile handler 在 `whiteboard/packages/whiteboard-core/src/operations/compile/*`
- 最终 program step 由 `shared/mutation` apply，产出 normalized delta

这部分和总方案并不冲突。

### 2.2 editor 本地状态仍然是 session store 体系

当前本地真相中心仍然是：

- `whiteboard/packages/whiteboard-editor/src/session/runtime.ts`

它把状态分散在多个 store：

- `tool`
- `draw`
- `selection`
- `edit`
- `viewport`
- `interaction`
- `preview`

而这些状态的读写逻辑又分别散落在：

- `session/selection.ts`
- `session/edit.ts`
- `session/viewport.ts`
- `session/interaction.ts`
- `session/preview/*`

这和 Phase 5 “`session/runtime.ts` 不再是本地状态真相中心” 是直接冲突的。

### 2.3 editor 输入链还在直接改本地 store

现在这些路径还在直接写 session：

- `services/tool.ts` 直接 `session.mutate.tool.set / selection.clear / edit.clear`
- `action/edit.ts` / `edit/runtime.ts` 直接 `session.mutate.edit.*`
- `action/index.ts` 里 viewport/draw 仍然直调 `session.viewport.commands.*`、`session.mutate.draw.*`
- `tasks/mindmap.ts` 直接 `session.preview.write.set(...)`
- `input/runtime.ts` 组装的 host 通过 `input.session.interaction.write.*`
- `input/*` feature 体系仍然依赖 `preview.write / interaction.write / viewport.input`

也就是说，现在 editor 的输入系统还是“命令式改 session”，不是“编译 EditorIntent”。

### 2.4 scene 还依赖 ad hoc change 协议

当前 scene 的输入桥接在：

- `whiteboard/packages/whiteboard-editor/src/scene/binding.ts`

它做了两件事：

1. 把 document engine 当前值 + session 当前值拼成 `EditorSceneSourceSnapshot`
2. 再根据订阅来源手写 `EditorSceneSourceChange`

配套的 ad hoc change 协议在：

- `whiteboard/packages/whiteboard-editor-scene/src/contracts/source.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/projection/input.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/projection/runtimeFacts.ts`

这套协议本质上是：

- document 用 normalized delta
- editor session 用另一套自定义 delta

这正是总方案里 Phase 7 想删除的东西。

### 2.5 一个重要现状：`draw` 也必须进入 editor state engine

Phase 5 文档列了：

- `selection / edit / preview / interaction / viewport`

但从现有代码看，`draw` 不能遗漏：

- `action/index.ts` 仍然暴露 `draw.set / draw.slot / draw.patch`
- `session/runtime.ts` 中 `draw` 是单独 store

所以真正的 `EditorStateDocument` 应该包含 `draw`，不能只包含 `tool`。

---

## 3. Editor domain 应该怎么 define mutation

这里建议把 editor 看成一个独立的 local mutation domain，和 whiteboard document domain 平级。

### 3.1 先定义 editor 本地 document，而不是先想 API

建议的 document 形状：

```ts
interface EditorStateDocument {
  tool: ToolState
  draw: DrawState
  selection: SelectionTarget
  edit: EditSession | null
  preview: EditorPreviewState
  interaction: EditorInteractionDocumentState
  viewport: Viewport
}

interface EditorInteractionDocumentState {
  mode: InteractionMode
  chrome: boolean
  space: boolean
  hover: HoverState
}
```

这里有几个边界必须提前定清楚：

- `busy` 不需要存，它是 `mode !== 'idle'` 的派生值
- `editingEdge` 不需要存，它是 `mode` 的派生值
- `pointer` 不建议进 document，它更像输入 runtime 的瞬时样本
- `gesture` 不建议进 document，它是 input session 闭包态，不是最终可观察状态
- viewport 的 `rect` / `limits` 不建议进 document，它们是 host/container 环境，不是 editor state 真相
- task scheduler 继续留在 `tasks/runtime.ts`，但 task 产生的可观察结果必须发 `EditorIntent`

### 3.2 mutation schema 建议按“状态块”分实体，而不是按 store 文件分实体

建议至少拆成下面几类：

| 实体 | 建议形态 | 目的 |
| --- | --- | --- |
| `tool` | singleton | 当前工具 |
| `draw` | singleton | draw preset / brush slot |
| `selection` | singleton | 当前选区 |
| `edit` | singleton | 当前编辑态 |
| `interaction` | singleton | hover / mode / chrome / space |
| `viewport` | singleton | zoom / center |
| `preview.node` | map | 节点 preview，要求按 id 精确触达 |
| `preview.edge` | map | 边 preview，要求按 id 精确触达 |
| `preview.session` | singleton | draw preview / edgeGuide / marquee / guides / mindmap preview |

原因：

- `tool / draw / selection / edit / interaction / viewport` 都是单值状态块
- `preview.node / preview.edge` 只有在需要对单个 node/edge 做高频 patch 时，才值得做成 map entity
- 其余 preview 片段更像“全局 UI chrome”，适合 singleton
- editor 本地态默认优先用最直接的数据形状，不要先把所有数组都改造成 document 风格的 `ids/byId`

更具体地说：

- `selection.nodeIds / selection.edgeIds` 直接保留数组即可，replace 整个数组没有问题
- `preview.selection.guides` 直接整体替换即可
- `draw.preview.points` 直接整体替换即可
- `hover target`、`marquee`、`mindmap preview` 这类单值或小对象也直接整体替换即可
- 只有 `preview.node`、`preview.edge` 这类确实需要“按对象局部 patch，并让 scene 精确知道 touched ids”的区域，才值得单独 map 化

所以 editor mutation schema 的默认策略应该是：

- 能整体替换的，就整体替换
- 能保持原始数组/对象形状的，就保持原始形状
- 不为本地态引入协作文档式 `ids/byId` 基础设施

### 3.3 Phase 5 不需要强行上 ordered/tree

`shared/mutation` 支持 entity / ordered / tree，但 editor state 在这一阶段不需要为了“形式统一”硬上结构型 registry。

我建议：

- Phase 5 先只用 entity
- 真正需要顺序语义的地方再补 ordered
- 不要为了 selection 数组或 guides 数组，把整个 editor state 过早抽成结构树
- 不要因为 document 里有 ordered/tree，就把 editor 本地数组也包装成结构编辑模型

editor state 的重点是“统一主链”和“统一 delta”，不是把所有本地状态结构化到极致。

### 3.4 delta 命名要语义化，不要照搬 store 路径

建议 editor delta key 的命名按“scene 真正关心什么”来设计，而不是照抄内部字段名。

推荐粒度：

- `tool.value`
- `draw.value`
- `selection.value`
- `selection.node`
- `selection.edge`
- `edit.value`
- `preview.node`
- `preview.edge`
- `preview.draw`
- `preview.guides`
- `preview.marquee`
- `preview.edgeGuide`
- `preview.mindmap`
- `interaction.mode`
- `interaction.hover`
- `interaction.chrome`
- `interaction.space`
- `viewport.value`

其中：

- `preview.node` / `preview.edge` 适合直接利用 map entity 产生的按 id 变化
- `selection.node` / `selection.edge` 更建议 compile handler 手工补充 semantic delta
- `interaction.hover` 是否需要分 node/edge/mindmap/group，可以由 scene phase 决定；第一版只要能触发 hover 重算即可

### 3.5 对 selection / hover 这类“语义差量”，优先用 compile metadata，而不是逼 schema 推导

`shared/mutation` 已经允许 step 带自定义 `delta` metadata。

这点对 editor 很重要，因为：

- selection replace 需要触达“旧选区 ∪ 新选区”
- hover set 需要触达“旧 hover ∪ 新 hover”
- edit clear 可能需要触达“旧编辑目标”

这些都不是简单的 record path diff 能优雅表达的。

所以建议：

- entity schema 负责 document 形状
- compile handler 负责补语义化 delta

这和 dataview / whiteboard document domain 的做法是一致的。

### 3.6 editor delta 也应该有 typed wrapper，但只能做薄映射

参照：

- `whiteboard/packages/whiteboard-engine/src/mutation/delta.ts`

editor 也应该有：

- `createEditorMutationDelta(raw)`

但这个 wrapper 只能做：

- key 命名映射
- `changed / ids / has` 的薄封装

不应该再造一整套第二语言。

---

## 4. EditorIntent 应该怎么设计

### 4.1 设计原则

`EditorIntent` 应该表达“editor 本地语义”，而不是“某个 store 的 setter”。

可以接受两层：

1. 语义 intent
2. 机械 patch intent

但是要有边界：

- 有稳定业务规则的地方，用语义 intent
- 高频、纯本地、无复杂规则的 preview patch，可允许机械 intent
- 对数组型本地态，intent 默认直接携带“下一整个数组”，而不是先拆成 insert/move/delete

例如：

- `selection.replace` 直接给完整 `SelectionTarget`
- `preview.guides.set` 直接给完整 `Guide[]`
- `preview.draw.set` 直接给完整 draw preview

这种写法对本地态是更自然的，不需要模仿文档结构型 mutation。

### 4.2 推荐的 intent 分层

建议第一版的 intent 分组：

```ts
type EditorIntent =
  | ToolIntent
  | DrawIntent
  | SelectionIntent
  | EditIntent
  | PreviewIntent
  | InteractionIntent
  | ViewportIntent
```

推荐具体形状：

```ts
type ToolIntent =
  | { type: 'tool.set'; tool: ToolState }

type DrawIntent =
  | { type: 'draw.set'; state: DrawState }
  | { type: 'draw.slot.set'; brush: DrawBrushKind; slot: DrawSlot }
  | { type: 'draw.patch'; brush: DrawBrushKind; slot: string; patch: BrushStylePatch }

type SelectionIntent =
  | { type: 'selection.replace'; selection: SelectionTarget }
  | { type: 'selection.apply'; mode: 'add' | 'subtract' | 'toggle'; input: SelectionInput }
  | { type: 'selection.clear' }

type EditIntent =
  | { type: 'edit.startNode'; session: NodeEditSession }
  | { type: 'edit.startEdgeLabel'; session: EdgeLabelEditSession }
  | { type: 'edit.input'; text: string }
  | { type: 'edit.caret'; caret: EditCaret }
  | { type: 'edit.composing'; composing: boolean }
  | { type: 'edit.clear' }

type PreviewIntent =
  | { type: 'preview.node.upsertMany'; entries: readonly NodePreviewEntry[] }
  | { type: 'preview.node.removeMany'; ids: readonly NodeId[] }
  | { type: 'preview.edge.upsertMany'; entries: readonly EdgePreviewEntry[] }
  | { type: 'preview.edge.removeMany'; ids: readonly EdgeId[] }
  | { type: 'preview.draw.set'; preview: DrawPreview }
  | { type: 'preview.draw.clear' }
  | { type: 'preview.guides.set'; guides: readonly Guide[] }
  | { type: 'preview.guides.clear' }
  | { type: 'preview.marquee.set'; marquee: MarqueePreviewState }
  | { type: 'preview.marquee.clear' }
  | { type: 'preview.edgeGuide.set'; guide: EdgeGuide }
  | { type: 'preview.edgeGuide.clear' }
  | { type: 'preview.mindmap.set'; preview: MindmapPreviewState }
  | { type: 'preview.mindmap.clear' }
  | { type: 'preview.reset' }

type InteractionIntent =
  | { type: 'interaction.mode.set'; mode: InteractionMode; chrome?: boolean }
  | { type: 'interaction.hover.set'; hover: HoverState }
  | { type: 'interaction.space.set'; value: boolean }
  | { type: 'interaction.reset' }

type ViewportIntent =
  | { type: 'viewport.set'; viewport: Viewport }
  | { type: 'viewport.panBy'; delta: Point }
  | { type: 'viewport.zoomTo'; zoom: number; anchor?: Point }
  | { type: 'viewport.fit'; bounds: Rect; padding?: number }
  | { type: 'viewport.reset' }
```

### 4.3 `edit.start*` intent 必须是“已编译完的 payload”

`edit.startNode` / `edit.startEdgeLabel` 不应该在 editor engine compile 时再去读 whiteboard document。

正确做法是：

- action / input 先读 document / scene
- 计算出最终 edit session
- 再发 `EditorIntent`

例如：

- `startNodeEdit` 先读取 node 当前文本
- 构造 `{ kind: 'node', nodeId, field, text, caret, composing: false }`
- 再发给 editor engine

这样 editor engine 只依赖 editor state document，不需要跨 domain 读 whiteboard doc。

### 4.4 `edit.commit` 不应该是 EditorIntent

`edit.commit` 的本质是写 whiteboard document，不是写 editor state。

所以提交编辑时应该拆成两部分：

- `WhiteboardIntent`
- `EditorIntent`

例如节点文本提交：

```ts
[
  { type: 'node.text.commit', nodeId, field, value },
  { type: 'edit.clear' }
]
```

同理：

- tool 切换导致清 selection / clear edit，可以做成一个语义化 `tool.set` compile 规则
- 而不是让调用方永远手动发三条 setter

### 4.5 pointer / gesture / auto-pan 不要做成 intent 真相

这些更适合保留在 input runtime 闭包里：

- pointer sample
- drag 起点
- session 私有中间计算状态
- auto-pan timer / frame job

它们可以参与“生成 EditorIntent”，但自己不应该成为 editor state document 真相。

---

## 5. shared/mutation 在 editor 上的落法

推荐新增一个本地 engine，形态上接近 `whiteboard-engine`：

```ts
createEditorStateEngine({
  document: initialEditorState,
  normalize: normalizeEditorState,
  createReader: createEditorStateReader,
  compile: editorCompileHandlers,
  entities: editorStateEntities,
  history: false
})
```

几个关键点：

- `history` 建议直接关闭
- editor state 不应该进 undo/redo
- origin 也可以统一走本地，不需要 remote/history 语义
- `normalizeEditorState` 需要复用现在 `selection/edit/preview/viewport` 里的 normalize 逻辑

可以复用但要改成纯函数的现有模块：

- `session/selection.ts`
- `session/edit.ts`
- `session/viewport.ts`
- `session/preview/*`

这些模块未来更适合变成：

- `normalizeSelection`
- `applySelectionMode`
- `normalizePreviewState`
- `applyViewportPan`
- `applyViewportZoom`

而不是继续持有 store。

---

## 6. scene 这一层应该怎么改

### 6.1 不再发布 `EditorSceneSourceChange`

当前：

- `scene/binding.ts` 手工拼 snapshot
- 手工推 `EditorSceneSourceChange`
- `editor-scene` 再把它翻译成 runtime delta

目标应该是：

- document engine commit 直接提供 `document delta`
- editor engine commit 直接提供 `editor delta`
- scene 只拿当前 document、当前 editor state、当前 view 环境

也就是从：

```ts
document + session snapshot + ad hoc change
```

改成：

```ts
document + editor state + document delta + editor delta + host view
```

### 6.2 `whiteboard-editor-scene` 里需要替换的不是“数据内容”，而是“差量来源”

scene 当前真正依赖的数据有三类：

- document graph
- editor runtime state
- view

这些内容本身并不需要重写；真正要重写的是：

- `contracts/source.ts`
- `projection/input.ts`
- `projection/runtimeFacts.ts`

因为现在它们依赖的是：

- `session.selection`
- `interaction.hover`
- `session.preview`
- `EditorSceneSourceChange`

Phase 5/7 之后应该依赖：

- `EditorStateDocument`
- `EditorMutationDelta`

当前很多 phase/query 逻辑都还能保留，只需要改它们的输入适配层。

### 6.3 `draft.edges` 现在看起来不是稳定真相，Phase 5 不要把它重新做大

`editor-scene` 里仍然保留了 `draft.edges` 输入位，但当前 editor 侧并没有一套真正对应的持久 store，更多是历史遗留的输入面。

因此建议：

- Phase 5 不要先重建一个新的 `draft engine`
- 优先把 route 编辑相关可观察状态收进 `edit / preview.edge`
- 等 editor state engine 稳定后，再决定 `draft` 是否还有独立存在价值

---

## 7. 需要改哪些地方

### 7.1 新增的模块

建议新增一组 editor state engine 文件，例如：

- `whiteboard/packages/whiteboard-editor/src/state-engine/document.ts`
- `whiteboard/packages/whiteboard-editor/src/state-engine/entities.ts`
- `whiteboard/packages/whiteboard-editor/src/state-engine/delta.ts`
- `whiteboard/packages/whiteboard-editor/src/state-engine/intents.ts`
- `whiteboard/packages/whiteboard-editor/src/state-engine/compile/*`
- `whiteboard/packages/whiteboard-editor/src/state-engine/runtime.ts`

### 7.2 `createEditor` 装配层要改

重点文件：

- `whiteboard/packages/whiteboard-editor/src/editor/createEditor.ts`

要从：

- 创建 `EditorSession`
- 再把 session 暴露给 action / input / scene

改成：

- 创建 `EditorStateEngine`
- 用 engine current/subscribe 包装出 `EditorState`
- action / input / scene 都依赖 engine，而不是依赖 session store

### 7.3 action/service 层要从“直接 mutate session”改成“发 EditorIntent”

重点文件：

- `services/tool.ts`
- `action/index.ts`
- `action/edit.ts`
- `edit/runtime.ts`
- `tasks/mindmap.ts`

这里建议的改法不是一次性推翻接口，而是先换内部实现：

- 现有 public API 尽量不变
- 内部从 `session.mutate.*` 改成 `editorStateEngine.execute(...)`

### 7.4 input 层要改成 compiler，而不是 store writer

重点文件：

- `input/runtime.ts`
- `input/core/runtime.ts`
- `input/host.ts`
- `input/features/**/*`

目标不是让 input 直接操作 engine program，而是让它：

1. 读 document / scene / editor state
2. 产出 `EditorIntent[]`
3. 必要时产出 `WhiteboardIntent[]`

例如：

- hover move：只发 `interaction.hover.set`
- marquee drag：发 `interaction.mode.set + preview.marquee.set + preview.guides.set`
- transform preview：发 `preview.node.upsertMany`
- pointer up commit：发 whiteboard intent，然后发 `preview.reset + interaction.reset`

### 7.5 document engine 与 editor engine 之间需要一层 bridge

当前 `editor/events.ts` 的职责不能直接消失，只是要改写。

现在它做的是：

- document commit 后 reconcile selection/edit
- replace/checkpoint 后 reset session

未来建议改成：

- 监听 whiteboard document commit
- 生成对应的 `EditorIntent`

例如：

- document replace -> `selection.clear + edit.clear + preview.reset + interaction.reset`
- 文档删除当前编辑对象 -> `edit.clear`
- 文档删除选中对象 -> `selection.replace(retainedSelection)`

这样跨 domain 关系仍然存在，但不再是“直接改 session store”，而是“文档事件 -> editor intent”。

### 7.6 `editor-scene` 输入层改成双 delta

重点文件：

- `whiteboard/packages/whiteboard-editor/src/scene/binding.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/contracts/source.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/projection/input.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/projection/runtimeFacts.ts`

这里的目标是删除：

- `EditorSceneSourceChange`
- `createSourceRuntimeInputDelta` 这类 editor 专属 change 翻译器

改成直接消费：

- `WhiteboardMutationDelta`
- `EditorMutationDelta`

---

## 8. 推荐实施顺序

### 第一步：先建立 editor state engine，但先不动 input feature 形状

先做：

- `EditorStateDocument`
- `EditorIntent`
- `editorStateEntities`
- `createEditorStateEngine`
- `createEditorMutationDelta`

然后把：

- tool
- draw
- selection
- edit
- viewport

这五块先迁进去。

这是最小可行闭环，因为它们的行为边界最清晰。

### 第二步：迁 preview / interaction

再把：

- hover
- mode
- chrome
- marquee
- guides
- edgeGuide
- node/edge preview
- draw preview
- mindmap preview

迁进 engine。

这一步完成后，`session/preview/*` 和 `session/interaction.ts` 就可以退化成纯 helper。

### 第三步：改写 scene binding

等 editor delta 已经稳定后，再去删：

- `EditorSceneSourceChange`
- editor-scene runtime 自定义 delta 协议

否则一边迁 editor state，一边还保留旧 change 协议，很容易又形成双真相。

### 第四步：最后清理 session runtime

最后再把：

- `session/runtime.ts`
- `createEditorSession`

从“真相中心”降级为：

- 纯适配壳
- 或直接删除

---

## 9. 最终建议

如果目标是严格符合 `UNIFIED_INTENT_PROGRAM_DELTA_FINAL_PLAN.zh-CN.md`，那么 editor 这一侧不要再做“更漂亮的 session store”，而是要直接做一个真正的 `EditorStateEngine`。

最关键的三条原则是：

- editor 可观察状态必须进 `EditorStateDocument`
- editor 输入必须产出 `EditorIntent`
- scene 必须吃 `editor delta`，而不是继续吃 `EditorSceneSourceChange`
- editor 本地态默认保持简单数据形状，数组优先整体替换，不引入不必要的 `ids/byId`

按这个方向做，shared/mutation 在 whiteboard 里才会真正从“文档内核统一”扩展到“编辑器全链统一”。
