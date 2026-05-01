# WHITEBOARD_EDITOR_PROJECTION_SINGLE_OUTLET 实施方案与迁移清单

## 1. 目标状态

这次重构的终点不是“把现有层再整理一下”，而是直接改成新的单出口架构：

- document truth 只有 `engine`
- editor local truth 只有 `state-engine`
- projection 直接接收：
  - `document snapshot`
  - `document delta`
  - `editor snapshot`
  - `editor delta`
- projection 成为最终主读出口

理想主链：

```ts
engine commits --------------------------\
                                          -> projection.update(...)
editor commits / transient changes -------/

projection
  -> stores
  -> read/query
  -> pick
  -> capture
```

最终 `Editor` 对外尽量只保留：

- `dispatch`
- `write`
- `input`
- `projection`
- `history`
- `dispose`

必须坚持的简化原则：

- `document` 的 `ids/byId` 继续服务协作、冲突处理、稳定索引
- `editor local state` 不模仿 document schema
- 本地态数组直接整体替换，不为“统一感”引入 `ids/byId`
- 不做兼容层
- 不做过渡层
- 不要求重构过程中代码随时可运行

---

## 2. 重构范围

这次文档只关心一件事：

- 怎么把 editor 到 projection 之间的所有不必要中转层整体拆掉

重点范围：

- `whiteboard/packages/whiteboard-editor/src/editor/createEditor.ts`
- `whiteboard/packages/whiteboard-editor/src/session/runtime.ts`
- `whiteboard/packages/whiteboard-editor/src/editor/state/index.ts`
- `whiteboard/packages/whiteboard-editor/src/editor/derived/index.ts`
- `whiteboard/packages/whiteboard-editor/src/edit/runtime.ts`
- `whiteboard/packages/whiteboard-editor/src/editor/events.ts`
- `whiteboard/packages/whiteboard-editor/src/input/runtime.ts`
- `whiteboard/packages/whiteboard-editor/src/scene/*`
- `whiteboard/packages/whiteboard-editor-scene/src/contracts/source.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/projection/input.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/projection/createRuntime.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/projection/createProjectionRuntime.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/projection/scene.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/projection/stores.ts`

不在这次重构里动摇的内核：

- `whiteboard/packages/whiteboard-editor/src/state-engine/runtime.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/projection/createProjection.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/projection/query/index.ts`

---

## 3. 先判定哪些必须删

### 3.1 直接删除的桥链

这条链是最典型的桥上再架桥，最终必须整体清空：

- `whiteboard/packages/whiteboard-editor/src/scene/binding.ts`
- `whiteboard/packages/whiteboard-editor/src/scene/sourceSnapshot.ts`
- `whiteboard/packages/whiteboard-editor/src/scene/sourceEvent.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/contracts/source.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/projection/input.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/projection/createRuntime.ts`

### 3.2 直接删除的 regroup facade

这条链让 projection 已经存在的情况下，editor 外面又长了一套读面，最终也必须删：

- `whiteboard/packages/whiteboard-editor/src/session/runtime.ts`
- `whiteboard/packages/whiteboard-editor/src/editor/state/index.ts`
- `whiteboard/packages/whiteboard-editor/src/editor/derived/index.ts`

### 3.3 删除 runtime 壳，保留业务规则

这些不一定是“整个业务功能删除”，而是删掉多余壳：

- `whiteboard/packages/whiteboard-editor/src/edit/runtime.ts`
- `whiteboard/packages/whiteboard-editor/src/editor/events.ts`
- `whiteboard/packages/whiteboard-editor/src/services/tool.ts`
- `whiteboard/packages/whiteboard-editor/src/action/mindmap.ts`

---

## 4. 目标结构定义

### 4.1 projection 输入

直接定义 projection 的最终输入，而不是继续围绕 source bridge 设计：

```ts
type ProjectionUpdateInput = {
  document: {
    snapshot: Document
    rev: number
    delta: MutationDelta
  }
  editor: {
    snapshot: EditorProjectionSnapshot
    delta: EditorProjectionDelta
  }
}
```

### 4.2 editor snapshot

建议的 `EditorProjectionSnapshot`：

```ts
type EditorProjectionSnapshot = {
  tool: Tool
  draw: DrawState
  selection: SelectionTarget
  edit: EditSession
  interaction: {
    mode: InteractionMode
    chrome: boolean
    space: boolean
    hover: HoverState
  }
  preview: EditorInputPreviewState
  viewport: Viewport
}
```

这里用简单结构，不引入本地态的 `ids/byId`。

### 4.3 editor delta

建议的 `EditorProjectionDelta`：

```ts
type EditorProjectionDelta = {
  tool?: true
  draw?: true
  selection?: true
  edit?: true
  interaction?: {
    mode?: true
    chrome?: true
    space?: true
    hover?: true
  }
  preview?: true
  viewport?: true
}
```

这个 delta 的职责只有一个：

- 告诉 projection 哪些 runtime block 变了

不要让 editor delta 伪装成 document mutation。

### 4.4 projection store tree

最终 projection 必须把 editor local read 也收进去：

```ts
stores.document
stores.graph
stores.render
stores.items

stores.runtime.editor.tool
stores.runtime.editor.draw
stores.runtime.editor.selection
stores.runtime.editor.edit
stores.runtime.editor.interaction
stores.runtime.editor.preview
stores.runtime.editor.viewport
```

只有做到这一步，projection 才能成为唯一 store 出口。

---

## 5. 分阶段实施方案

下面的阶段不是“建议”，而是实际落地顺序。每一阶段都要有明确的修改范围、删除范围和完成定义。

### Phase 1：建立 projection 新输入边界

目标：

- 让 projection runtime 直接接 `document + editor` 两份 snapshot/delta
- 停止以 `EditorSceneSource` 作为输入边界

要做的事：

- 在 `whiteboard-editor-scene` 里定义新的 projection update input 类型
- 明确 `EditorProjectionSnapshot`
- 明确 `EditorProjectionDelta`
- 让 projection runtime 接收这个新输入
- 删除对 `contracts/source.ts` 的设计依赖

要改的文件：

- `whiteboard/packages/whiteboard-editor-scene/src/projection/createRuntime.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/projection/input.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/contracts/source.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/projection/createProjectionRuntime.ts`
- 以及所有引用这些类型的调用点

完成定义：

- projection update 不再接受 `EditorSceneSource`
- projection update 不再依赖 source event/source snapshot
- 新的 update input 类型已经成为唯一输入边界

本阶段结束时允许：

- 仍然有旧 editor facade 没拆
- 仍然有 `session` 还活着

本阶段结束时不允许：

- source bridge 仍然是 projection 的正式输入协议

### Phase 2：把 createEditor 改成直接驱动 projection

目标：

- 取消 editor 和 projection 之间的 bridge runtime
- `createEditor(...)` 自己完成 projection bootstrap 和后续更新推送

要做的事：

- 在 `createEditor(...)` 中直接初始化 projection runtime
- 初次启动时直接推 bootstrap snapshot/delta
- 订阅 engine commits，直接推 document update
- 订阅 editor commits，直接推 editor update
- 订阅 preview / hover / viewport 等 transient 变化，直接推 editor runtime delta

要改的文件：

- `whiteboard/packages/whiteboard-editor/src/editor/createEditor.ts`
- `whiteboard/packages/whiteboard-editor/src/scene/binding.ts`
- `whiteboard/packages/whiteboard-editor/src/scene/sourceSnapshot.ts`
- `whiteboard/packages/whiteboard-editor/src/scene/sourceEvent.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/projection/createRuntime.ts`

本阶段要删除：

- `whiteboard/packages/whiteboard-editor/src/scene/binding.ts`
- `whiteboard/packages/whiteboard-editor/src/scene/sourceSnapshot.ts`
- `whiteboard/packages/whiteboard-editor/src/scene/sourceEvent.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/projection/createRuntime.ts`

完成定义：

- `createEditor(...)` 成为 engine/editor -> projection 的唯一装配点
- `scene/binding.ts` 整条桥链已经清空

### Phase 3：把 editor local runtime state 推进 projection stores

目标：

- 让 projection 不只读 document/graph/render/items
- 让 projection 同时成为 editor local state 的主读出口

要做的事：

- 扩展 `editorSceneStores`
- 让 `tool/draw/selection/edit/interaction/preview/viewport` 进入 projection store tree
- 按 projection store 需要的颗粒度定义 editor runtime change

要改的文件：

- `whiteboard/packages/whiteboard-editor-scene/src/projection/stores.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/contracts/state.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/contracts/runtime.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/projection/createProjectionRuntime.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/projection/query/*`

完成定义：

- 外部读取 editor local state 时，不再需要 `editor.state`
- projection stores 已经完整覆盖 editor runtime blocks

### Phase 4：删除 editor 侧 regroup facade

目标：

- 去掉 `session -> state -> derived` 这条重复读链

要做的事：

- 让调用方直接依赖 projection 和 state-engine
- 删除 `createEditorSession(...)`
- 删除 `createEditorState(...)`
- 删除 `createEditorDerived(...)`
- 把必要的 derived 规则折回 projection query 或业务模块

要改的文件：

- `whiteboard/packages/whiteboard-editor/src/session/runtime.ts`
- `whiteboard/packages/whiteboard-editor/src/editor/state/index.ts`
- `whiteboard/packages/whiteboard-editor/src/editor/derived/index.ts`
- `whiteboard/packages/whiteboard-editor/src/types/editor.ts`
- 所有直接依赖 `EditorState`、`EditorDerived`、`EditorSession` 的调用方

本阶段要删除：

- `whiteboard/packages/whiteboard-editor/src/session/runtime.ts`
- `whiteboard/packages/whiteboard-editor/src/editor/state/index.ts`
- `whiteboard/packages/whiteboard-editor/src/editor/derived/index.ts`

完成定义：

- editor 外不再暴露第二套 `state`
- editor 外不再暴露第三套 `derived`
- projection 成为唯一读出口

### Phase 5：瘦身 input runtime

目标：

- `input/runtime.ts` 从“消费 editor facade”改成“装配输入功能”

要做的事：

- 移除 `input/runtime.ts` 对 `EditorSession` 的依赖
- 移除 `input/runtime.ts` 对 `EditorState` 的依赖
- 移除 `input/runtime.ts` 对 `EditorSceneDerived` 的依赖
- 把 pointer / gesture transient 内聚到 input host 内部
- 让 input host 只依赖：
  - `projection`
  - `dispatch`
  - `write`
  - 少量业务读函数

要改的文件：

- `whiteboard/packages/whiteboard-editor/src/input/runtime.ts`
- `whiteboard/packages/whiteboard-editor/src/input/host.ts`
- `whiteboard/packages/whiteboard-editor/src/input/core/runtime.ts`
- 所有 input features 的 deps 类型

完成定义：

- input runtime 成为真正的 composition root
- 不再通过 `session.read` 或 `editor.state` 读 editor 运行态

### Phase 6：清理 runtime/service/controller 壳

目标：

- 删掉只剩“转发职责”的壳文件

要做的事：

- 删除 `edit/runtime.ts`
- 把 `editor/events.ts` 改成纯 reconcile 规则函数
- 把 `services/tool.ts` 改成纯命令解析函数
- 把 `action/mindmap.ts` 这类 facade 折回业务模块

要改的文件：

- `whiteboard/packages/whiteboard-editor/src/edit/runtime.ts`
- `whiteboard/packages/whiteboard-editor/src/editor/events.ts`
- `whiteboard/packages/whiteboard-editor/src/services/tool.ts`
- `whiteboard/packages/whiteboard-editor/src/action/edit.ts`
- `whiteboard/packages/whiteboard-editor/src/action/mindmap.ts`

完成定义：

- 没有只负责 emit/forward 的 runtime 壳
- 保留下来的文件必须承载实际业务规则

### Phase 7：收紧最终 Editor API

目标：

- 让 `Editor` 对外形状匹配新架构，不保留旧出口

要做的事：

- 从 `Editor` 类型里移除：
  - `document`
  - `scene`
  - `state`
  - `derived`
  - `events`
- 明确 `projection` 是唯一读入口
- 调整所有 editor 消费方

要改的文件：

- `whiteboard/packages/whiteboard-editor/src/types/editor.ts`
- `whiteboard/packages/whiteboard-editor/src/editor/createEditor.ts`
- 所有依赖旧 `Editor` 结构的调用方

完成定义：

- `Editor` API 与目标态一致
- 外部再也拿不到第二套读面

---

## 6. 迁移清单

下面这份清单是之后落地代码时需要逐项对照的。

### 6.1 新增或重定义

- 定义 `ProjectionUpdateInput`
- 定义 `EditorProjectionSnapshot`
- 定义 `EditorProjectionDelta`
- 定义 projection runtime 对 editor runtime blocks 的 store tree
- 定义 engine commit -> document delta 的直接映射
- 定义 editor commit -> editor delta 的直接映射
- 定义 transient preview/hover/viewport -> editor delta 的直接映射

### 6.2 删除桥协议

- 删除 `EditorSceneSource`
- 删除 `EditorSceneSourceSnapshot`
- 删除 `EditorSceneSourceEvent`
- 删除 source snapshot 构造
- 删除 source event 构造
- 删除 `source.subscribe -> projection.update` 的 bridge runtime

### 6.3 删除 editor 重复读层

- 删除 `EditorSession`
- 删除 `EditorState`
- 删除 `EditorDerived`
- 删除 `editor.events` runtime facade

### 6.4 回收业务规则

- node edit start 规则并入 edit action
- edge label edit start 规则并入 edit action
- selection/edit reconcile 改成纯规则函数
- tool switch 改成纯命令解析函数
- mindmap facade 折回 mindmap 业务模块

### 6.5 调整 input 依赖

- input features 不再依赖 `session`
- input features 不再依赖 `editor.state`
- input features 不再依赖 `editor.derived`
- transient gesture/pointer 转移到 input host 内部

### 6.6 调整外部消费面

- 所有读取 `editor.state` 的地方改读 projection
- 所有读取 `editor.derived` 的地方改读 projection
- 所有读取 `editor.scene` 的地方改读 `editor.projection`
- 所有监听 `editor.events` 的地方改走 engine/projection 合适出口

---

## 7. 最终删除清单

这份清单表示目标态下不应再存在的第二套实现。

必须删除：

- `whiteboard/packages/whiteboard-editor/src/session/runtime.ts`
- `whiteboard/packages/whiteboard-editor/src/editor/state/index.ts`
- `whiteboard/packages/whiteboard-editor/src/editor/derived/index.ts`
- `whiteboard/packages/whiteboard-editor/src/edit/runtime.ts`
- `whiteboard/packages/whiteboard-editor/src/scene/binding.ts`
- `whiteboard/packages/whiteboard-editor/src/scene/sourceSnapshot.ts`
- `whiteboard/packages/whiteboard-editor/src/scene/sourceEvent.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/contracts/source.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/projection/input.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/projection/createRuntime.ts`

应压薄或并回内核：

- `whiteboard/packages/whiteboard-editor/src/editor/events.ts`
- `whiteboard/packages/whiteboard-editor/src/services/tool.ts`
- `whiteboard/packages/whiteboard-editor/src/action/mindmap.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/projection/createProjectionRuntime.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/projection/scene.ts`

---

## 8. 完成判定

只有同时满足下面条件，才算这次重构真正结束：

### 8.1 真相中心

- document truth 只有 `engine`
- editor local truth 只有 `state-engine`

### 8.2 projection 边界

- projection 直接接 `document snapshot + document delta`
- projection 直接接 `editor snapshot + editor delta`
- 不再存在 source bridge 协议

### 8.3 读出口

- projection 是唯一主读出口
- 不再存在 `editor.state`
- 不再存在 `editor.derived`
- 不再存在 `EditorSession` 的对外读 facade

### 8.4 写入口

- editor local 写入口统一为 `dispatch`
- document 写入口继续走 `write`

### 8.5 中转层

- 不再存在 bridge runtime
- 不再存在 regroup runtime
- 不再存在只负责转发的 runtime/service/controller 壳

### 8.6 结构原则

- document 继续保留它需要的 `ids/byId`
- editor local snapshot 保持简单平铺结构
- 本地数组直接整体替换

---

## 9. 实施提醒

这份文档是为了指导“直接到目标态”的重构，不是为了做平滑迁移。

所以实施时要明确遵守：

- 不保留兼容 API
- 不保留旧新双轨
- 不保留 fallback
- 不在旧结构上继续缝合
- 某阶段进入后，可以直接删第二套实现
- 不要求每一小步都能跑通

如果某一处实现让人不得不再引入：

- source bridge
- session regroup
- state facade
- derived facade

那就说明方案偏离了目标，应回退设计，而不是加一层过渡。
