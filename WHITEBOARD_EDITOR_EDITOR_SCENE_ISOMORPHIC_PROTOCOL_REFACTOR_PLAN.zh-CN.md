# WHITEBOARD_EDITOR / EDITOR_SCENE 同构协议重构方案

## 1. 目标

这次重构只追求一个结果：

- `whiteboard-editor` 和 `whiteboard-editor-scene` 必须上下游同构

这里的“同构”不是“差不多”，而是：

- 上游只有一份 editor snapshot 协议
- 上游只有一份 editor delta 协议
- 下游直接消费这两份协议
- 中间不再允许重新定义一套 scene 专用 editor schema

最终要求：

- 越统一越好
- 越简单越好
- 重复定义必须消灭
- 两套协议必须消灭
- 中转层必须尽量归零

这份文档不讨论兼容，不讨论过渡，不保留双实现。

---

## 2. 总原则

### 2.1 单一 truth source

最终只允许两份真正的输入 truth：

1. document truth

- 来自 whiteboard engine
- 提供 document snapshot + document delta

2. editor local truth

- 来自 whiteboard-editor 内部 mutation engine
- 提供 editor snapshot + editor delta

`editor-scene` 不是第三个 truth source。

`editor-scene` 只是 projector。

### 2.2 上下游必须直接说同一种语言

禁止这类链路长期存在：

```ts
editor snapshot
  -> scene snapshot
    -> runtime input
      -> projection state
```

最终只允许：

```ts
document snapshot + document delta
editor snapshot + editor delta
  -> projection
```

也就是说：

- `editor-scene` 不能再发明自己的 editor snapshot
- `editor-scene` 不能再发明自己的 editor delta 入口语义
- `editor-scene` 不能再要求上游先做一次“适配后再喂给我”

### 2.3 本地态保持简单

必须明确写死这个原则：

- `document ids/byId` 是为了协作、冲突处理、稳定索引
- `editor local state` 不需要模仿 document schema
- 本地态如果本质上是数组，就直接整体替换
- 本地态不为了“看起来统一”去强行做 `ids/byId`

这条原则同样适用于 command 和 delta 设计。

### 2.4 本地 keyed 数据一律 plain object / record

editor 本地态和 overlay 必须全部使用 plain object / array / record：

- 允许 `Record`
- 允许数组
- 不允许 `Map`

原因不是风格，而是要让 mutation / delta / patch 保持直接、透明、稳定。

### 2.5 projection 是唯一读出口

最终 store/read 出口应该只剩 projection。

`editor` 内部不再维护给消费层用的第二套 store，不再保留中途 runtime store，不再保留旁路可读状态树。

---

## 3. 当前剩余问题

虽然现在代码能编译、测试能通过，但上下游还没有真正统一。主要问题如下。

### 3.1 Tool 重复定义

当前同时存在：

- `whiteboard-editor/src/types/tool.ts`
- `whiteboard-editor-scene/src/contracts/editor.ts` 里的 `ToolState`

问题：

- 同一份语义被定义成两套类型
- `InsertTemplate` 也被重复定义
- 后续很容易漂移

原则：

- `editor-scene` 不应该再定义自己的 tool 协议
- 应直接使用 `editor` 的 `Tool`

### 3.2 DrawState 重复定义

当前同时存在：

- `whiteboard-editor/src/session/draw/state.ts` 的 `DrawState`
- `whiteboard-editor-scene/src/contracts/editor.ts` 的 `EditorDrawState`

问题：

- 同一份 draw 状态被复制成两套 shape
- 这不是投影，而是协议重复

原则：

- `editor-scene` 必须直接复用 `DrawState`

### 3.3 Interaction 建模分裂

当前至少有两套 editor interaction 语义：

1. `editor` 稳定态

- `mode`
- `chrome`
- `space`
- `hover` 在 overlay

2. `editor-scene` 输入态

- `selection`
- `hover`
- `drag`
- `chrome`
- `editingEdge`

问题：

- 上游提供的是一套状态
- 下游消费的是另一套重组状态
- `drag`、`editingEdge` 其实是派生结果，不该成为上游输入协议主体

原则：

- editor snapshot 只保留源头状态
- scene 需要的派生语义在 scene 内部投影
- 不允许为了 scene 再定义一套 `InteractionInput`

### 3.4 Preview 被拆成两份 truth

当前 preview 被拆成：

- `base`
- `transient`

并且存在两份 merge：

- `whiteboard-editor/src/session/preview/state.ts`
- `whiteboard-editor-scene/src/projection/createProjectionRuntime.ts`

问题：

- preview 不是单一 truth，而是两份半成品
- 任何消费方都要先知道“需要 merge 之后才能读”
- 同一份合并规则出现两次
- 修改一边极易忘记另一边

原则：

- preview 必须收口成单一 truth
- `base/transient` 双层必须删除
- `editor-scene` 不再重复 merge

### 3.5 scene 内部仍然在重建 editor snapshot

当前 `editor-scene` 仍然有这类步骤：

- `toEditorSceneSnapshot(...)`
- `createEditorRuntimeInputDelta(...)`

问题：

- 说明 scene 没有直接吃 editor snapshot / delta
- 说明 scene 仍然拥有一套自己的 editor 协议翻译层

原则：

- 这两层必须删掉
- scene update 入口直接使用 editor engine 提供的协议

### 3.6 scene 内部仍保留独立 runtime editor schema

当前 `editor-scene` 的 `Input.runtime.editor` 仍然包含：

- `state`
- `interaction`
- `facts`
- `delta`

问题：

- 这本质上仍是 scene 自己定义的一层 editor 运行时协议
- query / model / render / ui 全都依赖这层

原则：

- scene 内部只能依赖最终统一的 `editor snapshot + editor delta`
- `facts` 如果保留，也必须是 scene 自己的内部工作产物，不是上游输入协议的一部分

### 3.7 DraftInput 等残留中转结构还在

比如 `DraftInput.edges: ReadonlyMap<...>` 这类结构还在 scene contract 里存活。

问题：

- 既不属于 document truth
- 也不属于最终 editor local truth
- 而且继续使用 `Map`

原则：

- 这类中转结构要么进入最终 editor snapshot，要么直接删除
- 不能继续以“临时 runtime 结构”长期存在

---

## 4. 最终协议

## 4.1 最终主链

最终数据主链必须是：

```ts
engine.document.snapshot + engine.document.delta
editor.state.snapshot + editor.state.delta
  -> editor-scene projection
  -> scene stores
  -> react
```

禁止再出现：

- editor -> scene snapshot adapter
- editor delta -> scene delta adapter
- preview merge adapter
- interaction adapter

## 4.2 最终 editor snapshot

最终只保留一份 editor snapshot，直接来自 `whiteboard-editor` mutation engine。

建议形状：

```ts
type EditorSnapshot = {
  state: {
    tool: Tool
    draw: DrawState
    selection: SelectionTarget
    edit: EditSession | null
    interaction: {
      mode: InteractionMode
      chrome: boolean
      space: boolean
    }
    viewport: Viewport
  }
  overlay: {
    hover: HoverState
    preview: PreviewInput
  }
}
```

关键点：

- 上游只提供源头状态
- `hover` 仍属于 overlay
- `preview` 只有一份最终 truth
- 不再保留 `base/transient`
- `drag`、`editingEdge`、`busy` 这类都不是 snapshot 主协议字段
- scene 如果要这些，自己从 snapshot 派生

## 4.3 最终 editor delta

最终只保留一份 editor delta，直接来自 `whiteboard-editor` mutation engine 提交结果。

建议语义：

```ts
type EditorDelta = {
  tool?: true
  draw?: true
  selection?: true
  edit?: true
  interaction?: {
    mode?: true
    chrome?: true
    space?: true
  }
  hover?: true
  preview?: true
  viewport?: true
  reset?: true
}
```

要求：

- delta 直接描述 editor snapshot 哪些部分变了
- 不再引入 scene 专用 delta 命名
- 不再引入 runtime input delta 这一层

如果 scene 需要更细粒度的内部 facts，可以在 scene 内部从这份 delta 继续计算，但那是 scene 内部实现，不是上游对外协议。

## 4.4 最终 scene.update 输入

最终 `editor-scene` 只接受：

```ts
type SceneUpdateInput = {
  document: {
    snapshot: WhiteboardDocument
    rev: Revision
    delta: MutationDelta
  }
  editor: {
    snapshot: EditorSnapshot
    delta: EditorDelta
  }
}
```

这里不再允许：

- `EditorSceneSnapshot`
- `InteractionInput`
- `EditorSceneRuntimeDelta`
- `EditorProjectionSnapshot -> EditorSceneSnapshot` 的转换层

---

## 5. 最终职责分工

### 5.1 whiteboard-editor

只负责：

- 维护 editor mutation engine
- 定义 editor snapshot 协议
- 定义 editor command
- 产出 editor delta
- 暴露单一 `dispatch(...)` 入口

不再负责：

- scene 专用协议翻译
- scene 专用 interaction 重组
- scene 专用 preview merge

### 5.2 whiteboard-editor-scene

只负责：

- 读取 document snapshot + delta
- 读取 editor snapshot + delta
- 计算 graph/ui/render/items/projection
- 维护最终对 React 可读的 stores

不再负责：

- 再定义一套 editor contract
- 再定义一套 tool / draw / insert template 类型
- 再做一轮 preview merge 规则
- 再做一轮 editor runtime input schema

### 5.3 projection

projection 只是一层 projector。

最终 projection 可以存在，但它只能做：

- 接线
- 调用 `scene.update(...)`
- 暴露 stores / read api

projection 不能再承担协议翻译职责。

---

## 6. 必须删除的重复层

这次重构要明确删掉这些东西。

### 6.1 类型重复

必须删除或收敛：

- `editor-scene` 自己的 `ToolState`
- `editor-scene` 自己的 `InsertTemplate`
- `editor-scene` 自己的 `EditorDrawState`

最终全部改为直接 import `editor` 的源类型。

### 6.2 snapshot 重建层

必须删除：

- `toEditorSceneSnapshot(...)`

### 6.3 delta 重建层

必须删除：

- `createEditorRuntimeInputDelta(...)`

### 6.4 preview 双层与双实现

必须删除：

- `overlay.preview.base`
- `overlay.preview.transient`
- scene 内部重复的 `mergePreview(...)`

### 6.5 runtime editor 中转协议

必须清理 `editor-scene` 里作为输入边界存在的这类结构：

- `Input.runtime.editor.state`
- `Input.runtime.editor.interaction`
- `Input.runtime.editor.delta`

如果内部工作态仍需要拆分，必须只存在于 scene 内部 working state，不允许作为上下游边界协议存在。

### 6.6 Map 残留

必须删除 editor local / overlay 协议里的：

- `ReadonlyMap`
- `Map`

尤其是：

- `DraftInput.edges`
- 其他 editor local keyed 中转数据

---

## 7. 推荐收口方式

### 7.1 先统一类型源头

优先级最高的是把协议名义统一：

- `ToolState` -> 直接用 `Tool`
- `InsertTemplate` -> 直接用 `editor` 的 `InsertTemplate`
- `EditorDrawState` -> 直接用 `DrawState`

先解决“同义不同型”，再解决“同型不同流”。

### 7.2 再统一 snapshot / delta 入口

`editor-scene` 的 `SceneUpdateInput.editor` 入口直接改成吃最终 editor snapshot / delta。

这样之后：

- scene 内部不需要 `toEditorSceneSnapshot`
- scene 内部不需要 `createEditorRuntimeInputDelta`

### 7.3 派生逻辑下沉到 scene 内部

像这些语义应该只作为 scene 内部派生：

- `drag`
- `editingEdge`
- `busy`
- `selection chrome`
- `hover impact`

它们不是上游协议的一部分。

### 7.4 preview 改成单一 truth

最终 preview 不再分 `base/transient`。

要求：

- `overlay.preview` 直接保存最终显示值
- scene 直接消费这一份 preview
- 不再需要 preview merge
- 不再需要“两份 preview touched ids 先合成再算 delta”

这里的关键不是把 preview 做细，而是把 preview 的生产收口成单一中轴。

推荐做法：

- `editor.dispatch` 允许收普通 command 或 updater
- 同一 microtask 内先收集所有写入
- flush 时在 editor 侧解析出最终 preview
- 只向 engine 提交一份最终 preview command

也就是说：

- 可以粗粒度 `preview.set`
- 但必须由单一中轴统一产出
- 不能让多个模块各自整块覆盖同一份 preview

### 7.5 scene.update 做 microtask 合并

最终目标不是把 mutation engine 变成异步，而是把 editor 一轮本地写入的下游传播合并成一次。

明确要求：

- `dispatch` 负责同步入队
- engine commit 在 microtask flush 时发生
- mutation engine 仍然只接受普通 object intent
- `scene.update(...)` 在同一 microtask 内只触发一次

推荐时序：

```ts
editor.dispatch(input)
  -> microtask queue 收集 command / updater
  -> flush 时解析为普通 EditorCommand[]
  -> engine.execute(commands)
  -> 产出一份 editor commit / delta
  -> scene.update(...) 一次
```

这里的 updater 语义可以类似 React `setState(prev => next)`，但它只存在于 editor dispatch queue 层，不进入 mutation engine 协议。

时序语义必须明确：

- `dispatch(...)` 调用时，输入立即进入 queue
- 同一 microtask 内后续 `dispatch(...)` 会继续追加到同一批次
- flush 前不产生新的 mutation engine commit
- flush 时才统一解析并执行
- 如果调用方需要 flush 后的最终状态，必须订阅 commit 或等 flush 完成，不能假设 `dispatch(...)` 返回后 engine 状态已经更新

允许的 dispatch 输入形状可以是：

```ts
type EditorDispatchInput =
  | EditorCommand
  | readonly EditorCommand[]
  | ((state: EditorSnapshot) => EditorCommand | readonly EditorCommand[] | null)
```

要求：

- updater 在 flush 前解析
- 解析结果必须收敛成普通 `EditorCommand[]`
- mutation engine commit 里不出现函数
- scene 只看最终 snapshot + delta

这样做的收益：

- 同一 microtask 内多次本地写入合成一次 commit
- 同一 microtask 内只做一次 scene.update
- 调用方需要依赖前序结果时可以用 updater，减少本地覆盖冲突
- 协议仍保持纯数据

---

## 8. 分阶段实施清单

## Phase 1：统一协议命名与类型源头

目标：

- scene contract 不再重复定义 tool / insert template / draw

要做的事：

- `whiteboard-editor-scene/src/contracts/editor.ts` 直接 import `Tool`
- `whiteboard-editor-scene/src/contracts/editor.ts` 直接 import `InsertTemplate`
- `whiteboard-editor-scene/src/contracts/editor.ts` 直接 import `DrawState`
- 删除 `ToolState`
- 删除 `InsertTemplate` 的本地重复定义
- 删除 `EditorDrawState`

完成标准：

- editor / editor-scene 之间关于 tool / draw 的协议只剩一份源定义

## Phase 2：统一 update 边界

目标：

- scene.update 直接吃最终 `EditorSnapshot + EditorDelta`

要做的事：

- 改 `SceneUpdateInput.editor.snapshot` 类型到最终 editor snapshot
- 改 `SceneUpdateInput.editor.delta` 类型到最终 editor delta
- 删除 `EditorSceneSnapshot`
- 删除 `EditorProjectionStableState / OverlayState` 这种 scene 自己复制 editor state 的接口
- 把 `EditorSnapshot.overlay.preview` 收口为单一 `PreviewInput`

完成标准：

- scene 不再拥有第二份 editor snapshot 类型树
- preview 不再有双层结构

## Phase 3：删除 snapshot / delta adapter

目标：

- 移除 scene update 前的二次重建

要做的事：

- 删除 `toEditorSceneSnapshot(...)`
- 删除 `createEditorRuntimeInputDelta(...)`
- 删除相关辅助函数
- 调整 scene runtime / projection runtime 直接消费 editor snapshot / delta

完成标准：

- editor -> scene 不再经过 snapshot adapter 和 delta adapter

## Phase 4：删除重复 interaction 协议

目标：

- 只保留 editor snapshot 的源 interaction

要做的事：

- 删除 `InteractionInput` 作为上下游边界协议
- scene 内部需要的 `drag`、`editingEdge` 改为从 editor snapshot 派生
- 收口 `runtime.editor.interaction()` 和 `runtime.editor.interactionState()` 的双口问题

完成标准：

- 对外只有一套 interaction 语义

## Phase 5：收口 preview 为单一 truth

目标：

- preview 不再分层
- preview 只有一份最终 truth

要做的事：

- 删除 `overlay.preview.base`
- 删除 `overlay.preview.transient`
- 删除 `mergeEditorPreviewState(...)`
- 删除 scene 内部 `mergePreview(...)`
- 把 preview 写入改成单一 truth 写入
- preview delta 直接基于前后两份最终 preview 计算

完成标准：

- preview 不再需要 merge
- 所有消费方都直接读最终 preview

## Phase 6：引入 microtask dispatch queue 与单次 scene.update

目标：

- 同一 microtask 内 editor 本地写入只形成一次 engine commit 和一次 scene.update

要做的事：

- `editor.dispatch` 支持普通 command 和 updater
- 在 editor runtime 外围增加 microtask queue
- flush 时把 updater 解析成普通 `EditorCommand[]`
- 改 `EditorStateRuntime.dispatch` 为一次 `engine.execute(commands)`
- 改 `createEditor.ts` 的 editor commit -> scene.update 链路，只对 flush 后的单次 commit 响应

完成标准：

- 同一 microtask 内不会发生多次 scene.update
- mutation engine 协议仍然保持纯 object intents

## Phase 7：清理 Map 和残留 runtime schema

目标：

- editor local / overlay 协议里不再出现 `Map`
- scene 输入边界里不再出现 runtime editor 中转 schema

要做的事：

- 删除 `DraftInput`
- 删除 `ReadonlyMap` 形式的 editor local 输入
- 全量改成 `Record` 或数组
- scene 内部如果仍需 keyed lookup，放在内部 working/index 层，不暴露到上下游协议

完成标准：

- editor/editor-scene 边界协议完全 plain object 化

## Phase 8：最终 API 收口

目标：

- 对外只有一套统一读法

要做的事：

- 收口 `EditorProjection.runtime.editor` 里重复接口
- 避免同时保留 scene 语义和 editor 语义的双 API
- 最终只保留必要的统一读口

完成标准：

- 顶层 editor API 不再暴露双语义入口

---

## 9. 需要重点改动的文件

优先关注这些文件：

- `whiteboard/packages/whiteboard-editor/src/state-engine/document.ts`
- `whiteboard/packages/whiteboard-editor/src/state-engine/delta.ts`
- `whiteboard/packages/whiteboard-editor/src/state-engine/runtime.ts`
- `whiteboard/packages/whiteboard-editor/src/editor/projection.ts`
- `whiteboard/packages/whiteboard-editor/src/types/editor.ts`
- `whiteboard/packages/whiteboard-editor/src/editor/createEditor.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/contracts/editor.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/projection/createProjectionRuntime.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/projection/query/index.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/model/facts.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/model/ui/runtime.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/model/ui/chrome.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/model/render/*`
- `whiteboard/packages/whiteboard-editor-scene/src/model/graph/*`

---

## 10. 完成判定

全部落地后，必须同时满足以下条件：

1. `editor` 和 `editor-scene` 之间只剩一份 editor snapshot 协议。
2. `editor` 和 `editor-scene` 之间只剩一份 editor delta 协议。
3. `editor-scene` 不再重复定义 `Tool` / `InsertTemplate` / `DrawState`。
4. `editor-scene` 不再重建 `EditorSceneSnapshot`。
5. `editor-scene` 不再重建 scene 专用 runtime delta。
6. preview 已经收口成单一 truth，不再存在 `base/transient`。
7. 不再需要任何 preview merge。
8. interaction 不再存在上下游两套边界语义。
9. editor local / overlay 边界协议里不再有 `Map`。
10. 同一 microtask 内只发生一次 editor commit 和一次 `scene.update`。
11. projection 只做接线和投影，不再做协议翻译。
12. 最终复杂度显著下降，阅读链路能收敛到：

```ts
editor snapshot + editor delta
document snapshot + document delta
  -> scene.update
  -> projection stores
```

如果还有任何一层需要“先把 editor 状态翻译成 scene 自己的 editor 状态再继续”，就说明这次重构还没有完成。
