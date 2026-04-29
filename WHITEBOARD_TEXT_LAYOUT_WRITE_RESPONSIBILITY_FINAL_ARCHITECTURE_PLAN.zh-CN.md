# Whiteboard Text Layout / Write 最终 API 设计与实施方案

## 目标

本文档只定义 whiteboard 文本布局相关的最终架构，不讨论兼容过渡，不保留中间层。

本文档解决以下问题：

- `whiteboard/packages/whiteboard-editor/src/layout/textLayout.ts` 为什么还在做 `patchNodeCreateByTextMeasure`
- 文本测量驱动的 committed patch 最终应该归谁
- `layout service` 应该定义在哪一层，谁实现，谁持有，谁注入
- `editor-scene` 的 measure/query 能力最终如何与 mutation/core 分工
- preview/runtime 是否需要收窄入口，避免到处拼 request、到处写 helper
- 哪些现有 API、类型、helper、导出必须删除

本文档只给最终态：

- 长期最优 API
- 长期最优模块边界
- 明确的落地阶段

---

## 一、研究结论

### 1. 当前的根问题不是“缺少测量能力”，而是“测量后的职责放错层”

当前系统已经具备文本测量能力，但这项能力被错误地分裂成两条消费链路：

- `editor` 先创建 `createEditorTextLayout(...)`
- 同一个 `measure` 再同时传给：
  - `editor write`
  - `editor input`
  - `editor-scene`

结果是：

- `editor` 在提交前自己补 committed patch
- `editor-scene` 在 runtime 里自己测 draft / label / live relayout
- `mutation/core` 反而不知道这些布局规则

这不是能力缺失，而是 committed normalize 没有下沉。

### 2. 现在真正错误的不是 `measure` 在 scene，而是 committed normalize 在 editor

`editor-scene` 拿 measure 本身并不奇怪，因为 scene 需要做：

- edge label runtime size
- node edit draft measure
- mindmap live relayout
- transform preview 的最终可视 geometry

这些都属于 projection/runtime 读模型职责。

真正错误的是以下 committed 路径还在 editor 层自己 patch：

- `node.create`
- `node.update`
- `mindmap.create`
- `mindmap.topic.insert`
- `node.text.commit`

也就是 editor 现在还在替 mutation/core 做“写前布局归一化”。

### 3. `textLayout.ts` 当前混合了三层职责

`whiteboard/packages/whiteboard-editor/src/layout/textLayout.ts` 现在同时承担：

1. backend request 构造
2. committed normalize
3. preview/runtime patch

这是长期最差形态。

这三类职责必须拆开：

- backend request 是 host-core 边界
- committed normalize 是 mutation/core 领域职责
- preview/runtime patch 是 editor/scene 读模型职责

### 4. 当前布局策略还错误地挂在 editor `NodeSpec` 上

现在 `layout kind` 通过：

- `NodeSpec.behavior.layout.kind`

在 `editor` 层定义，然后 `textLayout.ts` 用 `NodeSpecReader` 去读。

这意味着：

- committed document 的布局规则由 editor spec 决定
- core/mutation 如果想接管 normalize，还得反向依赖 editor spec

这是边界倒挂。

结论：

- `layout kind` 不能继续留在 editor `NodeSpec`
- 它必须成为 core layout 配置的一部分

### 5. `node.text.commit` 现在泄露了不该由上层承担的字段

当前 `node.text.commit` intent / write API 还暴露：

- `size`
- `fontSize`
- `wrapWidth`

这说明：

- editor 在把 draft layout 结果直接作为 committed intent 输入传给 engine
- mutation/core 并没有真正拥有文本 commit 的最终语义

长期最优必须收缩为纯语义输入：

- `nodeId`
- `field`
- `value`

其他 committed layout 字段全部由 core normalize 内部决定。

### 6. preview/runtime 的确也需要收窄入口

现在 preview/runtime 相关布局逻辑至少分散在以下方向：

- transform preview patch
- node edit draft measure
- mindmap live relayout
- edge label size

它们目前都在不同模块手工拼：

- node
- rect
- patch
- text
- style
- request

这会继续制造 `readXxx` / `buildXxx` / `patchXxx` helper 扩散。

结论：

- preview/runtime 必须也收口成正式布局入口
- 不能继续让 editor feature 和 scene model 到处自己构造 layout request

---

## 二、最终架构决策

## 决策 1：layout contract 定义在 `@whiteboard/core/layout`

最终 owner 是：

- `@whiteboard/core/layout`

不是：

- `@whiteboard/editor`
- `@whiteboard/editor-scene`
- `@shared`

原因：

- 这套能力直接决定 whiteboard committed document 语义
- 它依赖 whiteboard node/text/mindmap 领域规则
- 它不是通用 shared 基建
- 它也不是 editor UI 专属逻辑

### 最终结论

- layout contract 下沉到 `whiteboard-core`
- `editor` 和 `editor-scene` 都只消费它

## 决策 2：React 不实现 `LayoutService`，React 只实现 `LayoutBackend`

最终分层必须是：

1. `core` 定义高层 `LayoutService`
2. `react` 或其他宿主实现底层 `LayoutBackend`
3. `core` 用 backend 创建 `LayoutService`

也就是：

- React 不负责编排 committed normalize
- React 不负责组织 node type 语义
- React 只负责“给定 backend request，返回测量结果”

### 这点必须明确

错误形态：

- React 直接实现一整套 whiteboard 语义 layout service

正确形态：

- React 实现 backend
- core 基于 backend + layout config 生成 whiteboard 领域 service

## 决策 3：`LayoutService` 的持有者是 composition root，不是 editor

最终不能让 editor 成为 layout service 的 owner。

原因：

- engine 和 scene 都需要它
- editor 本身只是其中一个消费者
- engine 生命周期独立于 editor
- backend 可能持有缓存、DOM/canvas 资源与 dispose 生命周期，不能挂在 editor 内部私有创建

### 最终 ownership

持有者：

- whiteboard 组合根

消费者：

- engine
- editor-scene
- editor input / action / write

### 结论

最终模式不是“editor 创建 layout 再传给 engine”，而是：

- 组合根创建一个共享 `layout`
- 同一个实例分别注入给 engine 和 editor
- editor 再把它传给 scene/runtime 子系统

如果未来存在一层上层 convenience wrapper 同时创建 engine 和 editor，这个 wrapper 可以代替组合根转发，但 canonical ownership 仍然在组合根，而不是在 editor 包内部。

## 决策 4：committed 布局归一化归 mutation/core

以下能力必须全部下沉到 mutation/core：

- node create 前布局补全
- node update 前布局补全
- node text commit 的 size/fontSize/wrapWidth 归一化
- sticky auto font -> fixed 归一化
- mindmap create template 的文本布局补全
- mindmap topic insert seed 的文本布局补全

这类能力的统一名称定为：

- `layout normalize`

### 注意

这里的 `normalize` 不是：

- 整份 document 的全局 normalize
- shared/mutation 泛化层的通用 normalize

它是 whiteboard compile/custom 内部的领域 normalize stage。

也就是：

- intent 进入 compile
- 在 emit canonical/custom op 之前
- 调用 layout normalize
- 再产出最终 op

## 决策 5：preview/runtime 走收窄入口，不走散落 helper

最终 preview/runtime 不再对外暴露一套“谁都可以随便构 request”的 `TextMeasureTarget` 协议。

最终做法：

- 低层 backend 仍然吃 request
- 但 editor / scene 只调用窄入口

至少收成三类：

- node draft measure
- node transform preview patch
- edge label size

必要时未来可再扩展：

- node create ghost
- text edit overlay
- frame title / shape label 等其他 runtime 测量场景

## 决策 6：`layout kind` 从 editor `NodeSpec` 删除

`NodeSpec.behavior.layout` 不是 editor 专属能力。

它最终必须从 editor spec 中拿掉，避免：

- core normalize 反向依赖 editor spec
- layout policy 与 committed 语义错层
- editor spec 同时承担 UI 能力与 committed layout 规则

### 最终位置

`layout kind` 成为 `LayoutService` 创建配置的一部分。

例如：

- `text: 'size'`
- `sticky: 'fit'`
- 其他 node type 默认 `'none'`

这份配置归 `@whiteboard/core/layout` 管。

---

## 三、最终模块职责

## 1. `@whiteboard/core/layout`

职责：

- 定义 backend contract
- 定义 layout kind 配置
- 创建 whiteboard 领域 `LayoutService`
- 封装 layout request 构造
- 封装 committed normalize
- 封装 preview/runtime 窄入口

不负责：

- DOM / Canvas 实测实现
- projection graph state
- editor session 状态

## 2. `@whiteboard/react` 或宿主实现层

职责：

- 实现 `LayoutBackend`
- 内部处理 DOM/canvas/text metrics fallback/cache

不负责：

- committed normalize 规则
- node type layout 语义
- mindmap / node / edge 领域 patch 规则

## 3. `@whiteboard/engine`

职责：

- 持有 `layout` service
- 在 compile/custom 阶段调用 `layout.commit(...)`
- 产出最终 op / inverse / delta / history

不负责：

- UI preview
- render geometry

## 4. `@whiteboard/editor-scene`

职责：

- 使用 `layout.runtime(...)` 做 node draft measure / edge label size / live relayout
- 通过 projection 产出 runtime view

不负责：

- committed write normalize
- intent patch 生成
- 文本 commit 最终字段写回

## 5. `@whiteboard/editor`

职责：

- orchestration
- session / interaction / tool / action
- 调用 engine 与 scene query
- transient preview state 组织

不负责：

- 写前 committed layout patch
- 手工构建 layout request
- 解释 draft layout 并塞进 committed intent

---

## 四、最终 API 设计

## 1. `@whiteboard/core/layout` 最终公开 API

### 1.1 Layout Kind 与 node 布局配置

```ts
export type LayoutKind = 'none' | 'size' | 'fit'

export type LayoutNodeCatalog = Readonly<Record<string, LayoutKind>>
```

说明：

- `LayoutNodeCatalog` 是 committed 语义配置
- 不是 editor `NodeSpec`
- 不是 scene contract

### 1.2 Backend request/result

```ts
export type LayoutTypography =
  | 'default-text'
  | 'sticky-text'
  | 'edge-label'
  | 'frame-title'
  | 'shape-label'

export type LayoutBackendRequest =
  | {
      kind: 'size'
      typography: LayoutTypography
      text: string
      placeholder: string
      widthMode: 'auto' | 'wrap'
      wrapWidth?: number
      frame: TextFrameInsets
      minWidth?: number
      maxWidth?: number
      fontSize: number
      fontWeight?: number | string
      fontStyle?: string
    }
  | {
      kind: 'fit'
      typography: LayoutTypography
      text: string
      box: Size
      minFontSize?: number
      maxFontSize?: number
      fontWeight?: number | string
      fontStyle?: string
      textAlign?: 'left' | 'center' | 'right'
    }

export type LayoutBackendResult =
  | {
      kind: 'size'
      size: Size
    }
  | {
      kind: 'fit'
      fontSize: number
    }

export type LayoutBackend = {
  measure: (request: LayoutBackendRequest) => LayoutBackendResult
  dispose?: () => void
}
```

最终约束：

- backend 对它接到的 request 必须给出结果
- edge label fallback / text metrics cache 属于 backend 自己的内部实现
- 不再由 editor `textLayout.ts` 做 fallback

### 1.3 高层领域 service

`WhiteboardLayoutService` 的公开面最终只保留两个入口：

- `commit(...)`
- `runtime(...)`

原因：

- 这两个职责边界长期稳定
- `nodeCreate/nodeUpdate/nodeDraft/...` 只是当前内部场景，不应固化成公共方法数量
- 保持 plain object + 字符串 kind 的装配方式
- 内部仍可保留私有 helper，但不污染公共 surface

```ts
export type WhiteboardLayoutCommitInput =
  | {
      kind: 'node.create'
      node: NodeInput
      position?: Point
    }
  | {
      kind: 'node.update'
      nodeId: NodeId
      node: Node
      update: NodeUpdateInput
      origin?: Origin
    }
  | {
      kind: 'node.text.commit'
      nodeId: NodeId
      node: Node
      field: 'text' | 'title'
      value: string
    }
  | {
      kind: 'mindmap.create'
      input: MindmapCreateInput
      position?: Point
    }
  | {
      kind: 'mindmap.topic.insert'
      mindmapId: MindmapId
      input: MindmapInsertInput
    }

export type WhiteboardLayoutCommitOutput =
  | {
      kind: 'node.create'
      node: NodeInput
    }
  | {
      kind: 'node.update'
      update: NodeUpdateInput
    }
  | {
      kind: 'node.text.commit'
      update?: NodeUpdateInput
    }
  | {
      kind: 'mindmap.create'
      input: MindmapCreateInput
    }
  | {
      kind: 'mindmap.topic.insert'
      input: MindmapInsertInput
    }

export type WhiteboardLayoutRuntimeInput =
  | {
      kind: 'node.draft'
      nodeId: NodeId
      node: Node
      rect: Rect
      preview?: NodePreviewPatch
      draft: {
        field: 'text' | 'title'
        value: string
      }
    }
  | {
      kind: 'node.transform'
      patches: readonly TransformPreviewPatch[]
      readNode: (id: NodeId) => Node | undefined
      readRect: (id: NodeId) => Rect | undefined
    }
  | {
      kind: 'edge.label'
      edgeId: EdgeId
      labelId: string
      label: EdgeLabel
    }

export type WhiteboardLayoutRuntimeOutput =
  | {
      kind: 'node.draft'
      measure?: NodeDraftMeasure
    }
  | {
      kind: 'node.transform'
      patches: readonly TransformPreviewPatch[]
    }
  | {
      kind: 'edge.label'
      size?: Size
    }

export type WhiteboardLayoutService = {
  commit: (
    input: WhiteboardLayoutCommitInput
  ) => WhiteboardLayoutCommitOutput
  runtime: (
    input: WhiteboardLayoutRuntimeInput
  ) => WhiteboardLayoutRuntimeOutput
}
```

### 1.4 Service 创建入口

```ts
export const createWhiteboardLayout: (input: {
  nodes: LayoutNodeCatalog
  backend: LayoutBackend
}) => WhiteboardLayoutService
```

最终原则：

- editor/scene 不再自己构造 backend request
- 所有 `readLayoutKind` / `buildLayoutRequest` 逻辑收进 `createWhiteboardLayout(...)`
- 外界只拿到 `layout.commit(...)` 与 `layout.runtime(...)`

## 2. `@whiteboard/engine` 最终 API

最终 engine 必须正式接 layout service：

```ts
const layout = createWhiteboardLayout({
  nodes: {
    text: 'size',
    sticky: 'fit'
  },
  backend: createReactLayoutBackend()
})

const engine = createEngine({
  document,
  services: {
    layout,
    registries,
    ids
  },
  config
})
```

### 最终要求

- `WhiteboardCompileServices` 增加 `layout`
- compile/custom 全部通过 `ctx.services.layout.commit(...)` 访问 committed normalize 能力
- engine 不依赖 editor 包，不读取 editor `NodeSpec`

## 3. `@whiteboard/editor` 最终 API

editor 只消费现成 `layout`：

```ts
const editor = createEditor({
  engine,
  history: engine.history,
  initialTool,
  initialViewport,
  nodes,
  services: {
    layout,
    defaults
  }
})
```

这里的 `layout` 类型已经不是 `LayoutBackend`，而是：

- `WhiteboardLayoutService`

### 最终约束

- editor 不再创建 `createEditorTextLayout`
- editor 不再自己持有 backend request/result contract
- editor 不再把 `measure` 拆成独立函数传来传去

## 4. `@whiteboard/editor-scene` 最终 API

`editor-scene` 最终只消费 `layout.runtime(...)`。

最终内部 runtime 形态：

```ts
createEditorSceneRuntime({
  source,
  layout,
  nodeCapability
})
```

其中：

- `layout.runtime({ kind: 'node.draft', ... })`
- `layout.runtime({ kind: 'edge.label', ... })`

用于 scene graph / render / draft 计算。

### 必删公开导出

以下内容从 `editor-scene` 删除：

- `TextMeasure`
- `TextMeasureTarget`
- `TextMeasureResult`

原因：

- 这些是 host-core backend contract，不是 scene public contract

## 5. `editor.write` / `intent` 最终 API 收缩

### 5.1 `node.text.commit`

最终 intent：

```ts
type NodeTextCommitIntent = {
  type: 'node.text.commit'
  nodeId: NodeId
  field: 'text' | 'title'
  value: string
}
```

最终 `editor.write.node.text.commit(...)`：

```ts
commit: (input: {
  nodeId: NodeId
  field: 'text' | 'title'
  value: string
}) => IntentResult | undefined
```

必须删除：

- `size`
- `fontSize`
- `wrapWidth`

### 5.2 `node.create`

保留纯语义输入：

```ts
create: (input: {
  position: Point
  template: NodeTemplate
}) => IntentResult<{ nodeId: NodeId }>
```

但 committed size/fontSize 的补全转入：

- `layout.commit({ kind: 'node.create', ... })`

### 5.3 `node.update`

保留纯 patch intent：

```ts
update: (id: NodeId, input: NodeUpdateInput) => IntentResult
```

layout-affecting patch 的补全转入：

- `layout.commit({ kind: 'node.update', ... })`

### 5.4 `mindmap.create`

保持：

```ts
create: (input: MindmapCreateInput) => IntentResult<...>
```

template 里的 text/sticky 布局补全转入：

- `layout.commit({ kind: 'mindmap.create', ... })`

### 5.5 `mindmap.topic.insert`

保持：

```ts
insert: (id: MindmapId, input: MindmapInsertInput) => IntentResult<{ nodeId: MindmapNodeId }>
```

topic seed 的文本布局补全转入：

- `layout.commit({ kind: 'mindmap.topic.insert', ... })`

---

## 五、最终执行流

## 1. committed create/update 流

### `node.create`

最终执行流：

1. editor write 只发 `node.create`
2. engine compile 收到 intent
3. `layout.commit({ kind: 'node.create', ... })` 生成最终 committed input
4. compile 基于 normalized input 产出 canonical op
5. mutation apply / history / inverse / delta 正常运行

### `node.update`

最终执行流：

1. editor write 只发 `node.update`
2. compile 逐条读取 committed node
3. `layout.commit({ kind: 'node.update', ... })` 判断是否触发布局归一化
4. 若需要，则合并 size/fontSize/fontMode/wrapWidth 等 committed patch
5. 再走 `compileMindmapTopicUpdate(...)` / emit canonical op

### `node.text.commit`

最终执行流：

1. editor action commit 只提交 `{ nodeId, field, value }`
2. compile 读取 committed node
3. `layout.commit({ kind: 'node.text.commit', ... })` 生成最终 `NodeUpdateInput`
4. 再走 node/mindmap topic update 编排

### `mindmap.create`

最终执行流：

1. editor write 只发 `mindmap.create`
2. compile 先调用 `layout.commit({ kind: 'mindmap.create', ... })`
3. 然后 instantiate template / materialize nodes
4. emit `mindmap.create`

### `mindmap.topic.insert`

最终执行流：

1. editor write 只发 `mindmap.topic.insert`
2. compile 先调用 `layout.commit({ kind: 'mindmap.topic.insert', ... })`
3. 然后 `createMindmapTopicNode(...)`
4. emit `mindmap.topic.insert`

## 2. runtime / preview 流

### node edit draft

最终执行流：

1. scene 读取 committed node + preview rect
2. scene 调 `layout.runtime({ kind: 'node.draft', ... })`
3. 返回 `NodeDraftMeasure`
4. node view / mindmap layout 统一消费这个 measure

### transform preview

最终执行流：

1. input feature 生成 transform patches
2. 调 `layout.runtime({ kind: 'node.transform', ... })`
3. 返回收敛后的 preview patches
4. session preview / scene graph 继续消费

### edge label runtime size

最终执行流：

1. scene graph 构造 label runtime input
2. 调 `layout.runtime({ kind: 'edge.label', ... })`
3. 返回最终 size
4. 再做 label placement

---

## 六、必须删除的旧 API / 类型 / helper

## 1. 删除 `editor` 的 layout 组合器

必须删除：

- `createEditorTextLayout`
- `TextLayoutMeasure`
- `patchNodeCreateByTextMeasure`
- `patchNodeUpdateByTextMeasure`
- `patchMindmapTemplateByTextMeasure`
- `patchMindmapInsertInput`

允许保留但必须迁移：

- `patchNodePreviewByTextMeasure`

迁移目标：

- `layout.runtime({ kind: 'node.transform', ... })`

## 2. 删除 `editor-scene` 的 backend contract 暴露

必须删除：

- `TextMeasure`
- `TextMeasureTarget`
- `TextMeasureResult`

## 3. 删除 write/action 中的 committed layout 输入泄露

必须删除：

- `NodeTextWrite.commit.size`
- `NodeTextWrite.commit.fontSize`
- `NodeTextWrite.commit.wrapWidth`
- `NodeIntent['node.text.commit'].size`
- `NodeIntent['node.text.commit'].fontSize`
- `NodeIntent['node.text.commit'].wrapWidth`

## 4. 删除 editor `NodeSpec` 上的 `behavior.layout`

必须删除：

- `NodeLayoutSpec`
- `NodeSpec.behavior.layout`
- 所有依赖 `NodeSpecReader -> readLayoutKind(...)` 的 committed 规则读取

## 5. 删除 layout request 在上层的散落构造

必须删除以下分散逻辑的外露存在：

- `readLayoutKind`
- `buildLayoutRequest`
- `normalizeStickyFontModeUpdate`
- edge label fallback 逻辑放在 editor 层

这些逻辑最终都要被吸收到：

- `createWhiteboardLayout(...)`

---

## 七、实施方案

以下阶段只描述最终执行顺序。

明确规定：

- 各阶段之间不要求保留兼容
- 不要求中间态可运行
- 全部阶段完成后一次性跑通

## Phase 1. 建立 core layout contract 与 service

必须完成：

- 在 `@whiteboard/core/layout` 新建最终 contract
- 新增 `LayoutNodeCatalog`
- 新增 `LayoutBackendRequest/Result`
- 新增 `WhiteboardLayoutService`
- 新增 `createWhiteboardLayout(...)`
- 把 `LayoutBackend` / `LayoutRequest` / `TextTypographyProfile` 从 `editor` 迁出
- 删除 `editor-scene` 对 `TextMeasure*` 的 owner 身份

必须修改：

- `whiteboard/packages/whiteboard-editor/src/types/layout.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/contracts/editor.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/index.ts`
- `whiteboard/packages/whiteboard-editor/src/index.ts`

阶段结果：

- layout contract 的唯一 owner 变成 `@whiteboard/core/layout`

## Phase 2. 把 layout policy 从 editor NodeSpec 拆出

必须完成：

- 删除 `NodeSpec.behavior.layout`
- 删除 `NodeLayoutSpec`
- 在 composition root 侧提供 `LayoutNodeCatalog`
- `createWhiteboardLayout(...)` 只吃 plain object layout catalog

必须修改：

- `whiteboard/packages/whiteboard-editor/src/types/node/spec.ts`
- 所有测试里的 `nodes` 定义
- `createEditor(...)` / host 组合代码

阶段结果：

- committed layout policy 不再依赖 editor spec

## Phase 3. engine 接入 `layout.commit`

必须完成：

- `WhiteboardCompileServices` 增加 `layout`
- `createEngine(...)` 支持注入 `layout`
- `node.create` compile 路径调用 `layout.commit({ kind: 'node.create', ... })`
- `node.update` compile 路径调用 `layout.commit({ kind: 'node.update', ... })`
- `node.text.commit` compile 路径调用 `layout.commit({ kind: 'node.text.commit', ... })`
- `mindmap.create` compile 路径调用 `layout.commit({ kind: 'mindmap.create', ... })`
- `mindmap.topic.insert` compile 路径调用 `layout.commit({ kind: 'mindmap.topic.insert', ... })`

必须修改：

- `whiteboard/packages/whiteboard-engine/src/runtime/engine.ts`
- `whiteboard/packages/whiteboard-core/src/operations/compile/helpers.ts`
- `whiteboard/packages/whiteboard-core/src/operations/compile/node.ts`
- `whiteboard/packages/whiteboard-core/src/operations/compile/mindmap.ts`

阶段结果：

- committed normalize 完全下沉到 mutation/core

## Phase 4. editor write / action 收缩成纯 intent

必须完成：

- 删除 `createEditorTextLayout`
- 删除 `write/node.ts` 里 create/update 的 layout patch 逻辑
- 删除 `write/mindmap/index.ts` 的 template patch
- 删除 `write/mindmap/topic.ts` 的 insert patch
- `action/index.ts` 在 text commit 时只传 `{ nodeId, field, value }`
- `NodeTextWrite.commit(...)` 签名收缩
- `NodeIntent['node.text.commit']` 签名收缩

必须修改：

- `whiteboard/packages/whiteboard-editor/src/editor/createEditor.ts`
- `whiteboard/packages/whiteboard-editor/src/write/index.ts`
- `whiteboard/packages/whiteboard-editor/src/write/node.ts`
- `whiteboard/packages/whiteboard-editor/src/write/mindmap/index.ts`
- `whiteboard/packages/whiteboard-editor/src/write/mindmap/topic.ts`
- `whiteboard/packages/whiteboard-editor/src/write/types.ts`
- `whiteboard/packages/whiteboard-editor/src/action/index.ts`
- `whiteboard/packages/whiteboard-core/src/operations/intents.ts`

阶段结果：

- editor 不再持有 committed layout patch 责任

## Phase 5. scene/runtime 收口为窄入口

必须完成：

- `createEditorSceneRuntime(...)` 改为接收 `layout`
- graph/node draft 测量改走 `layout.runtime({ kind: 'node.draft', ... })`
- graph/mindmap live relayout 改走 `layout.runtime({ kind: 'node.draft', ... })`
- graph/edge label 测量改走 `layout.runtime({ kind: 'edge.label', ... })`
- transform preview 改走 `layout.runtime({ kind: 'node.transform', ... })`

必须修改：

- `whiteboard/packages/whiteboard-editor-scene/src/runtime/createEditorSceneRuntime.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/runtime/model.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/contracts/working.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/model/graph/node.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/model/graph/mindmap.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/model/graph/edge.ts`
- `whiteboard/packages/whiteboard-editor/src/input/features/transform.ts`

阶段结果：

- editor/scene 不再拼 backend request
- preview/runtime 正式收口

## Phase 6. 清理旧 helper、导出、测试装配

必须完成：

- 删除 `textLayout.ts` 旧模块，或仅保留 host backend adapter 中必要实现
- 删除所有对 `patchNodeCreateByTextMeasure` / `patchNodeUpdateByTextMeasure` / `TextMeasure*` 的引用
- 测试统一改为通过 shared `layout` service 装配
- `editor.dispose()` 不再清理内部 text metrics 资源
- backend `dispose()` 由组合根负责

必须修改：

- 所有 editor / scene / tests 中 layout 装配逻辑
- 所有相关导出入口

阶段结果：

- layout ownership、lifetime、API 边界全部统一

---

## 八、最终导出矩阵

## 1. `@whiteboard/core/layout` 保留公开

- `LayoutKind`
- `LayoutNodeCatalog`
- `LayoutBackendRequest`
- `LayoutBackendResult`
- `LayoutBackend`
- `WhiteboardLayoutService`
- `createWhiteboardLayout`

## 2. `@whiteboard/editor` 保留公开

- `createEditor(...)`
- editor action/write/query 相关 API

允许引用 core layout 类型，但不再自有定义：

- `WhiteboardLayoutService`

## 3. `@whiteboard/editor-scene` 不再公开

- `TextMeasure`
- `TextMeasureTarget`
- `TextMeasureResult`

## 4. React / host 层保留公开

- host backend 工厂，例如 `createReactLayoutBackend()`

它只返回：

- `LayoutBackend`

---

## 九、最终验收标准

以下条件必须同时成立：

- `patchNodeCreateByTextMeasure`、`patchNodeUpdateByTextMeasure`、`patchMindmapTemplateByTextMeasure`、`patchMindmapInsertInput` 全部消失
- `createEditorTextLayout` 消失
- `TextMeasure` / `TextMeasureTarget` / `TextMeasureResult` 不再由 `editor-scene` 对外导出
- `NodeSpec.behavior.layout` 消失
- `node.text.commit` 不再接受 `size/fontSize/wrapWidth`
- engine compile/custom 通过 `services.layout.commit(...)` 接管 committed layout normalize
- scene/runtime 通过 `layout.runtime(...)` 接管 node draft / transform preview / edge label 测量
- editor write 只发 semantic intent，不再做 committed patch 扩写
- layout service 生命周期归组合根，不归 editor

这就是 whiteboard text layout / write 职责的长期最优终态。
