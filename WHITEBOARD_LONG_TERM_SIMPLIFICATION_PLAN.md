# Whiteboard Long-Term Simplification Plan

## 目标

这份文档只定义长期最优形态。

前提：

- 不考虑兼容性
- 不考虑迁移成本
- 不保留现有多余抽象
- 以减少噪音、减少重复、降低理解成本为唯一目标

结论先行：

- `engine` 只保留一个规范写入口
- `editor` 只保留一个公开动作入口
- 所有中间包装层都降级为内部 helper，或者直接删除
- 类型只围绕真实边界存在，不为“转发”和“重命名”单独建模

## 当前问题

从 `engine` 到 `editor`，现在同时存在多套表达同一件事的 API：

1. `engine` 内部 write command union
2. `engine.commands.*`
3. `editor.write.*`
4. `editor.actions.*`

这四层里，只有两层真正有必要：

- `engine` 的底层 document mutation 语义
- `editor` 的上层交互语义

其余层大多是在重复命名、重复转发、重复包装。

最典型的问题：

- 同一个 node update，会经历 raw command、engine command、editor write、editor action 多次包装
- `document`、`board`、`canvas`、`doc` 这些名字同时存在，职责边界不清
- `text/style/shape/appearance/lock/document` 同时挂在 `node` 下，层级太深且语义不均衡
- public type、internal type、runtime type 混在同一个大文件里
- `Pick`、`Omit`、类型别名转发太多，类型名数量和真实概念数量严重不成比例

## 长期原则

### 1. 只有一个规范写模型

底层只能有一个规范 mutation 表达。

长期应以 command union 作为唯一底层写模型。

不是：

- 一套 union
- 一套 imperative methods
- 一套 editor write transaction
- 一套 editor actions

而是：

- `engine` 只有一个可执行写入口
- `editor` 只有一个对外公开动作入口

补充：

- `patch` 不是协同层 canonical unit
- `operation` 才是 history、collab、sync 的 canonical unit
- `patch` 只用于 editor/public API 表达编辑意图

### 2. 边界命名必须稳定

全局只保留以下几个边界词：

- `document`
- `history`
- `read`
- `state`
- `input`
- `view`
- `session`

删除以下重名或近义词：

- `board`
- `doc`
- `commands` 作为 editor 对外入口名
- `actions` 作为内部 write 包装名

### 3. editor 不再暴露内部 runtime write

`editor.write` 是内部运行时工具，不是产品边界。

长期方案里：

- 它不应该是公开导出的类型
- 它不应该拥有一整套正式 API 命名
- 它最多是内部模块传递的 host object

### 4. 类型只服务真实概念

不为下面这些东西单独定义公开类型：

- 单纯的 `Pick`
- 单纯的 `Omit`
- 单纯的转发别名
- 只在一个文件内部使用的 host object
- 与实现一一绑定的装配类型

一个类型存在的前提必须是：

- 它对应真实领域概念
- 或它对应真实公开边界

### 5. 公开 API 优先扁平，不优先“可组合”

当前很多复杂度来自“为了组合而组合”。

长期最优解不是继续加抽象，而是减少层级：

- 少一层路径，胜过多一个“优雅”的 wrapper
- 少一个中间类型，胜过多一层复用
- 少一组 setter，胜过多一套 façade

### 6. editor patch 与 collab operation 必须分层

长期必须明确三层粒度：

1. `EditorPatch`
   面向 UI 和产品语义，目标是易用
2. `EngineCommand`
   面向 engine 语义，目标是可验证、可规范化
3. `Operation`
   面向 history、collab、持久化、重放，目标是最细且稳定

原则：

- `patch` 不能直接作为协同同步货币
- `patch` 必须先编译成 command
- `command` 必须再规范化为细粒度 `operations`
- `collab` 只同步 `operations`

原因：

- `patch` 本质是意图，不是最终事实
- `patch` 常常带 convenience 语义
- `patch` 的对象合并模型不适合作为并发合并基元
- 协同真正需要的是确定性的最小变更单位

## 最终目标架构

### 总体结构

长期最终态只保留两层：

1. `engine`
   负责 committed document 语义
2. `editor`
   负责交互、选择、视图、剪贴板、预览、编辑态

中间不再存在正式的第三层命令体系。

## Engine 最终形态

### Engine 的职责

`engine` 只负责：

- document 持久语义
- history
- read projection
- 少量影响 read 的 runtime config

`engine` 不负责：

- selection
- viewport
- pointer
- preview
- tool
- edit session
- clipboard interaction policy
- canvas 级 UI 语义

### Engine 公开 API

长期只保留：

```ts
type Engine = {
  read: EngineRead
  history: EngineHistory
  commit: ReadStore<Commit | null>
  execute: <C extends EngineCommand>(command: C, options?: ExecuteOptions) => ExecuteResult<C>
  applyOperations: (operations: readonly Operation[], options?: ApplyOperationsOptions) => CommandResult
  configure: (config: EngineConfig) => void
  dispose: () => void
}
```

删除：

- `engine.commands`
- `engine.commands.document`
- `engine.commands.canvas`
- `engine.commands.node`
- `engine.commands.edge`
- `engine.commands.group`
- `engine.commands.mindmap`

原因：

- 这些 façade 与底层 command union 重复表达同一套能力
- 每增加一个 command，都要同步维护 union、output、method tree
- 命令树让 domain surface 看起来更友好，但长期维护噪音更大

### Engine command 模型

保留 command union，但拆文件，不再集中塞在一个大文件里。

建议结构：

```text
whiteboard-engine/src/command/
  document.ts
  node.ts
  edge.ts
  group.ts
  mindmap.ts
  index.ts
  output.ts
```

目标：

- 每个 domain 自己维护自己的 command
- 每个 domain 自己维护自己的 output
- 聚合处只负责导出，不混写 API façade

### Engine domain 设计

`engine` 里不再保留 `canvas` 这个 domain。

原因：

- `canvas.delete/duplicate/order` 本质仍然是 document mutation
- `canvas` 是 editor 的交互视角，不是 engine 的领域边界
- 同时保留 `document` 和 `canvas` 只会制造重复语义

长期 engine domain 只保留：

- `document`
- `node`
- `edge`
- `group`
- `mindmap`

### Engine 命令设计原则

所有底层命令统一遵循：

- 一个 command 对应一个明确的 document mutation 语义
- 底层不做 UI 级 convenience 分组
- 底层不以 setter 风格扩散 API 数量

例如 node 只保留：

- `create`
- `move`
- `patch`
- `align`
- `distribute`
- `remove`
- `duplicate`

删除：

- `update`
- `updateMany`

原因：

- `update/updateMany` 是实现形态，不是长期语义形态
- 长期应该统一为 `patch`
- 单个和批量由参数形状统一，而不是拆成两个命令名

建议：

```ts
type NodePatchCommand = {
  type: 'node.patch'
  ids: readonly NodeId[]
  patch: NodePatch
}
```

而不是：

```ts
node.update(id, update)
node.updateMany(updates)
```

### Engine command 与 operation 的关系

长期最优不是让 `patch` 直接落到协同层，而是：

- `editor` 发出 patch intent
- `engine` 接收 structure-aware command
- translator 产出 normalized operations
- history 和 collab 只处理 operations

即：

```text
editor patch
  -> engine command
  -> normalized operations
  -> history / collab / replay
```

`Operation` 仍然必须保留，而且要比 command 更细。

例如：

- `document.nodes.patch([a, b], { style: { fill: '#f00' } })`
  不是同步单位
- 最终应编译成多个独立 `node.update` operations
- `edge.route.insert(edgeId, point)` 最终应编译成单个明确 `edge.update` operation
- `mindmap.move(...)` 最终应编译成多个有顺序的 node/group/edge operations

### Editor patch 结构

长期应给 editor/public API 建立稳定 patch 结构，而不是在 UI 层临时拼接。

但要注意：

- 这是 editor-facing patch
- 不是 collab-facing patch
- 它服务于“表达编辑意图”
- 它不直接进入 history 和 sync

### Operation 设计原则

长期要求：

- operation 必须是可重放的 committed 事实
- operation 粒度必须足够细，便于 diff、undo/redo、collab 合并
- operation 必须避免“整体对象替换”式粗粒度写入
- 结构化集合必须尽量通过结构化 operation 或可预测的细粒度 update 表达

以下数据尤其不能只靠粗 patch 表达：

- edge route points
- edge labels
- mindmap subtree
- group members

这些场景需要明确的结构操作，而不是整个数组整体替换。

### 底层规范化边界

长期保留的真正规范单位是 normalized operations，不是 patch。

不允许：

- editor patch 直接进 history
- editor patch 直接进 collab
- 未规范化的 convenience command 直接进 sync

必须：

- 所有写入先过 engine translator
- translator 统一生成 normalized operations
- commit、history、collab 只消费 normalized operations

### Patch compiler 与 command translator 的职责

长期应拆开两类编译器：

- `compile*Patch`
  从 editor-facing patch 生成 engine command
- `translate*Command`
  从 engine command 生成 normalized operations

不能再把这两层糊在一起。

```ts
type NodePatch = {
  fields?: Partial<{
    position: Point
    size: Size
    locked: boolean
  }>
  style?: Partial<NodeStyle>
  data?: Record<string, unknown>
}
```

```ts
type EdgePatch = {
  fields?: Partial<{
    source: EdgeEnd
    target: EdgeEnd
  }>
  style?: Partial<EdgeStyle>
}
```

这里特意不把 `routePoints`、`labels` 放进通用 patch 主结构。

原因：

- 它们是结构化集合
- 并发编辑时需要更细粒度的结构操作
- 直接整体替换会放大协同冲突面

不允许在 editor action 里临时发明另一套 patch 语义。

## Editor 最终形态

### Editor 的职责

`editor` 是 UI 和交互的统一宿主。

它负责：

- input dispatch
- session state
- selection
- edit state
- preview state
- viewport
- clipboard policy
- 将 UI 语义翻译为 engine command

### Editor 公开 API

长期不保留 `editor.actions` 这个额外层。

公开结构直接收敛为：

```ts
type Editor = {
  read: EditorRead
  state: EditorState
  input: EditorInput
  document: EditorDocumentApi
  session: EditorSessionApi
  view: EditorViewApi
  configure: (config: EditorConfig) => void
  dispose: () => void
}
```

也就是：

- `editor.document`
- `editor.session`
- `editor.view`

直接作为公开入口，不再包一层 `actions`。

原因：

- `editor.actions.document.nodes.*` 这种路径没有信息增量
- 外部调用频率非常高时，额外路径深度就是纯噪音

### Editor 内部实现

长期不再有正式建模的 `EditorWriteApi`、`EditorWriteTransaction`。

内部运行时需要共享写能力时，只允许使用私有 host object：

```ts
type EditorRuntimeHost = {
  execute: Engine['execute']
  read: EditorRead
  state: InternalEditorState
  preview: InternalPreviewState
}
```

它是内部实现对象，不进入公开类型，不进入包导出。

删除：

- `EditorWriteApi`
- `EditorWriteTransaction`
- `EditorDocumentWrite`
- `EditorSessionWrite`
- `EditorViewWrite`
- `EditorPreviewWrite`
- `createEditorWrite`

### Editor document API 设计

对外只暴露真正面向产品语义的 API。

建议：

```ts
type EditorDocumentApi = {
  replace: (document: Document) => CommandResult
  history: {
    undo: () => CommandResult
    redo: () => CommandResult
    clear: () => void
  }
  selection: {
    delete: (target: SelectionInput) => boolean
    duplicate: (target: SelectionInput, options?: DuplicateOptions) => boolean
    order: (target: SelectionInput, mode: OrderMode) => boolean
    group: (target: SelectionInput, options?: GroupOptions) => boolean
    ungroup: (target: SelectionInput, options?: UngroupOptions) => boolean
    frame: (target: SelectionInput, options?: FrameOptions) => boolean
  }
  nodes: {
    create: (input: NodeInput) => CommandResult<{ nodeId: NodeId }>
    patch: (ids: readonly NodeId[], patch: EditorNodePatch) => CommandResult | undefined
    move: (ids: readonly NodeId[], delta: Point) => CommandResult
    align: (ids: readonly NodeId[], mode: NodeAlignMode) => CommandResult
    distribute: (ids: readonly NodeId[], mode: NodeDistributeMode) => CommandResult
    remove: (ids: readonly NodeId[]) => CommandResult
    duplicate: (ids: readonly NodeId[]) => CommandResult
  }
  edges: {
    create: (input: EdgeInput) => CommandResult<{ edgeId: EdgeId }>
    patch: (ids: readonly EdgeId[], patch: EditorEdgePatch) => CommandResult | undefined
    move: (edgeId: EdgeId, delta: Point) => CommandResult
    reconnect: (edgeId: EdgeId, end: 'source' | 'target', target: EdgeEnd) => CommandResult
    remove: (ids: readonly EdgeId[]) => CommandResult
    route: {
      insert: (edgeId: EdgeId, point: Point) => CommandResult
      move: (edgeId: EdgeId, index: number, point: Point) => CommandResult
      remove: (edgeId: EdgeId, index: number) => CommandResult
      clear: (edgeId: EdgeId) => CommandResult
    }
    labels: {
      add: (edgeId: EdgeId) => string | undefined
      patch: (edgeId: EdgeId, labelId: string, patch: EdgeLabelPatch) => CommandResult | undefined
      remove: (edgeId: EdgeId, labelId: string) => CommandResult | undefined
    }
  }
  mindmaps: {
    create: (options?: MindmapCreateInput) => CommandResult
    patchNode: (id: MindmapId, nodeId: MindmapNodeId, patch: MindmapNodePatch) => CommandResult | undefined
    insert: (input: MindmapInsertInput) => CommandResult | undefined
    move: (input: MindmapMoveInput) => CommandResult | undefined
    clone: (input: MindmapCloneInput) => CommandResult | undefined
    remove: (input: MindmapRemoveInput) => CommandResult | undefined
  }
  clipboard: {
    copy: (target?: EditorClipboardTarget) => ClipboardPacket | undefined
    cut: (target?: EditorClipboardTarget) => ClipboardPacket | undefined
    paste: (packet: ClipboardPacket, options?: EditorClipboardOptions) => boolean
  }
}
```

这里最关键的变化是：

- `selection` 收拢所有“针对选区做文档操作”的能力
- `nodes` 只保留 node-specific 语义
- `edges` 只保留 edge-specific 语义
- `clipboard` 用 `copy/paste`，不再混用 `export/insert`
- `replace` 直接在 `document` 根上，不再套 `board`

### Node API 长期收敛方向

长期彻底删除下面这些分叉：

- `nodes.update`
- `nodes.updateMany`
- `nodes.text.*`
- `nodes.style.*`
- `nodes.shape.*`
- `nodes.lock.*`
- `node.document.*`
- `node.appearance.*`

全部收敛为一个入口：

```ts
document.nodes.patch(ids, patch)
```

其中：

```ts
type EditorNodePatch = {
  fields?: Partial<{
    position: Point
    size: Size
    locked: boolean
  }>
  style?: Partial<{
    fill: string
    fillOpacity: number
    stroke: string
    strokeWidth: number
    strokeOpacity: number
    strokeDash: readonly number[]
    opacity: number
    color: string
    fontSize: number
    fontWeight: number
    fontStyle: 'normal' | 'italic'
    textAlign: 'left' | 'center' | 'right'
  }>
  data?: Partial<{
    text: string
    title: string
    kind: string
    background: string
  }>
}
```

理由：

- 文本样式、图形样式、锁定状态本质都是 node patch
- 当前分裂成多套 setter，只是为了把 patch 编译散落到不同文件
- 这些 setter 的存在让 node API 数量膨胀，但没有增加真实能力

补充：

- `measuredSizeById` 这类 runtime hint 不应进入 committed patch
- 这类数据只能作为 patch compiler 的附加参数
- 最终是否写入 document，由 engine translator 明确决定

建议额外引入内部输入：

```ts
type NodePatchCompileHints = {
  measuredSizeById?: Readonly<Record<NodeId, Size>>
}
```

它是内部 compiler 输入，不是 public patch 结构。

### Node patch 与协同

`nodes.patch` 适合作为 editor API，但不适合作为 collab sync unit。

协同时的 canonical 行为应该是：

- 一个 node patch 按 node 拆开
- 每个 node 再拆成细粒度 `node.update` operations
- 没有变更的字段不产生 operation
- 纯 hint 不产生 operation

### Edge API 长期收敛方向

`edges` 也统一为 patch 模型。

保留：

- `create`
- `patch`
- `move`
- `reconnect`
- `remove`
- `route.*`
- `labels.*`

不再额外保留：

- `set`
- `style.set`
- `style.swapMarkers`

改为：

```ts
document.edges.patch([edgeId], {
  style: {
    start: nextStart,
    end: nextEnd
  }
})
```

也就是：

- 不为单个 style convenience 单独挂名字
- 所有 edge 修改都走同一 patch 面

但要明确例外：

- `route.*` 不并入通用 `patch`
- `labels.*` 不并入通用 `patch`

原因：

- route points 是有顺序的结构化集合
- labels 也是有 identity 的结构化集合
- 这两类数据整体覆盖会显著恶化并发冲突

### Edge patch 与协同

edge 的协同友好粒度应明确区分三类：

1. 普通字段和 style
   走 `edges.patch`
2. route points
   走 `route.insert/move/remove/clear`
3. labels
   走 `labels.add/patch/remove`

也就是：

- 对外 API 可以统一挂在 `edges` 下
- 但结构化集合必须保持结构化操作
- 不允许把 `routePoints`、`labels` 简化成整段数组 patch

### Mindmap API 长期收敛方向

mindmap 不能再同时保留：

- engine 级 subtree command
- editor 级 placement command
- editor 级 drop command
- editor 级 root move command

长期应该统一为编辑语义：

- `create`
- `insert`
- `move`
- `clone`
- `remove`
- `patchNode`

内部再把 placement、drop、layout hint 解析为底层 engine command。

也就是外部只看到 mindmap 编辑意图，不看到多套中间命令名。

### Mindmap 与协同

mindmap 不适合用一个宽泛的 `patch` 覆盖整棵树。

长期要求：

- 树结构变化必须通过结构命令表达
- node 内容变化可以通过 `patchNode` 表达
- subtree insert/move/clone/remove 必须保留结构操作语义

原因：

- tree editing 的协同冲突主要来自结构重排，不是字段更新
- 如果把 subtree move 退化成大 patch，会让顺序、父子关系、side、index 的并发语义变得不可控
- 结构化 intent 更容易翻译成稳定 operations

## 类型系统重建方案

### 公开类型与内部类型彻底分离

包入口只允许导出 public types。

不再导出任何 runtime-internal types。

#### Engine 公开类型

只保留：

- `Engine`
- `EngineRead`
- `EngineConfig`
- `EngineCommand`
- `ExecuteResult`
- `Commit`

#### Editor 公开类型

只保留：

- `Editor`
- `EditorRead`
- `EditorState`
- `EditorInput`
- `EditorDocumentApi`
- `EditorSessionApi`
- `EditorViewApi`
- 必要的 patch/input/result 类型

注意：

- public patch 类型只代表 editor intent
- `Operation` 是 sync 和 history 规范
- 不导出任何“给 collab 直接用的 patch 类型”

删除所有中间层公开类型：

- `EditorNodeDocumentCommands`
- `EditorNodeTextCommands`
- `EditorNodeShapeCommands`
- `EditorNodeAppearanceCommands`
- `EditorNodeCommands`
- `EditorDocumentNodeTextWrite`
- `EditorDocumentNodeWrite`
- `EditorDocumentWrite`
- `EditorSessionWrite`
- `EditorViewWrite`
- `EditorPreviewWrite`
- `EditorWriteTransaction`
- `EditorWriteApi`

### 杜绝 “类型为实现服务”

以下情况不允许出现在 public types 中：

- `type X = Pick<Y, ...>`
- `type X = Omit<Y, ...>`
- `type X = RuntimeRead`
- `type X = EngineCommands['node']`

规则：

- 如果只是重命名现有类型，不导出新名字
- 如果确实是新概念，就写成独立结构，而不是引用切片

### 文件组织

不再允许 `types/editor.ts` 这种巨型汇总文件承载所有语义。

建议结构：

```text
whiteboard-editor/src/public/
  editor.ts
  document.ts
  session.ts
  view.ts
  input.ts
  patch.ts
  index.ts

whiteboard-editor/src/internal/
  runtime/
  preview/
  translate/
  selection/
  interactions/
```

`public/` 与 `internal/` 必须明确分开。

### 最终目录结构 Blueprint

以下不是“从现状平滑迁移”的目录，而是长期最终目录。

#### Engine

```text
whiteboard/packages/whiteboard-engine/src/
  index.ts

  public/
    engine.ts
    read.ts
    commit.ts
    config.ts
    command.ts
    operation.ts

  command/
    document.ts
    node.ts
    edge.ts
    group.ts
    mindmap.ts
    index.ts
    output.ts

  translate/
    document.ts
    node.ts
    edge.ts
    group.ts
    mindmap.ts
    index.ts

  read/
    document.ts
    node.ts
    edge.ts
    group.ts
    mindmap.ts
    indexes/
    index.ts

  runtime/
    createEngine.ts
    history.ts
    commit.ts
    execute.ts
    applyOperations.ts

  normalize/
    document.ts
    operations.ts
    finalize.ts
```

要求：

- `public/` 只放对外契约
- `command/` 只放 engine command 与 output
- `translate/` 只负责 `command -> operations`
- `runtime/` 只负责 engine 实例装配
- `normalize/` 只负责 operation 规范化与 finalize

不再允许：

- `types/command.ts` 这种巨型混合文件
- `commands/` 这种 imperative façade 目录
- 公开类型、内部类型、装配实现混放

#### Editor

```text
whiteboard/packages/whiteboard-editor/src/
  index.ts

  public/
    editor.ts
    document.ts
    session.ts
    view.ts
    state.ts
    input.ts
    patch.ts
    result.ts
    index.ts

  internal/
    createEditor.ts

    runtime/
      state/
      viewport/
      overlay/
      selection/
      preview/

    input/
      dispatch.ts
      keyboard.ts
      pointer.ts
      contextMenu.ts

    intent/
      nodes.ts
      edges.ts
      selection.ts
      clipboard.ts
      mindmaps.ts

    compile/
      nodePatch.ts
      edgePatch.ts
      clipboard.ts
      mindmap.ts

    interactions/
      selection/
      transform/
      draw/
      edge/
      viewport/
      mindmap/

    bridge/
      engine.ts
      registry.ts
```

要求：

- `public/` 只描述 editor 外部契约
- `intent/` 表达 editor 级操作意图
- `compile/` 负责把 public patch / intent 编译成 engine command
- `internal/runtime/` 只保留 transient state 与宿主 glue
- `interactions/` 只处理交互流程，不定义公开 API

不再允许：

- `runtime/write/`
- `runtime/editor/actions.ts`
- `types/editor.ts`
- 任何以 `*Commands` 命名、却并非公开边界的内部 helper

### 目录组织约束

长期要求每个文件都只属于一种角色：

- public contract
- internal state
- patch compiler
- command translator
- runtime assembly
- interaction flow

一个文件不允许同时承担两种以上角色。

尤其禁止：

- public type + internal implementation 混放
- runtime assembly + business logic 混放
- patch compiler + translator 混放
- editor intent + collab operation 混放

### 最终 Public Exports 清单

包根入口只允许导出下面这些内容。

#### `@whiteboard/engine`

值导出：

- `createEngine`

类型导出：

- `Engine`
- `EngineRead`
- `EngineConfig`
- `EngineCommand`
- `ExecuteOptions`
- `ExecuteResult`
- `ApplyOperationsOptions`
- `Commit`
- `Operation`

可以接受的次级子路径导出，最多只保留：

- `@whiteboard/engine/command`
- `@whiteboard/engine/operation`

用途：

- 前者用于需要显式构造 engine command 的调用方
- 后者用于 collab、history、tooling

不再导出：

- `EngineCommands`
- `CommandResult`
- `GroupRead`
- `SliceRead`
- `MindmapRead`
- 各种仅为了拆分实现而存在的局部类型名

原因：

- 对外只保留“真正稳定的总边界”
- 局部 read 分片不应变成对外命名负担

#### `@whiteboard/editor`

值导出：

- `createEditor`
- `selectTool`
- `handTool`
- `edgeTool`
- `insertTool`
- `drawTool`
- 必要的 tool 常量

类型导出：

- `Editor`
- `EditorRead`
- `EditorState`
- `EditorInput`
- `EditorConfig`
- `EditorDocumentApi`
- `EditorSessionApi`
- `EditorViewApi`
- `EditorNodePatch`
- `EditorEdgePatch`
- `MindmapNodePatch`
- `EditorClipboardTarget`
- `EditorClipboardOptions`
- 输入事件类型
- tool 类型
- insert preset 类型
- node registry 类型

不再导出：

- `EditorActions`
- `EditorDocumentActions`
- `EditorWriteApi`
- `EditorDocumentWrite`
- `EditorNodeCommands`
- `EditorNodeTextCommands`
- `EditorNodeAppearanceCommands`
- `EditorNodeShapeCommands`
- 所有 runtime-internal host object 类型

### 最终 Public Type 预算

长期不应只看“能不能表达”，还应看“是否过度命名”。

建议预算：

- `@whiteboard/engine` 根入口公开类型总数不超过 10 个
- `@whiteboard/editor` 根入口公开类型总数不超过 25 个

超过这个数量，默认意味着：

- 有内部实现细节泄漏
- 有转发型类型没有被删除
- 有同义层没有被压平

### 命名规则

长期只允许两类公开命名：

1. 边界类型
   例如 `Editor`、`Engine`、`Commit`
2. 真实领域输入
   例如 `EditorNodePatch`、`EditorClipboardOptions`

不允许公开出现以下命名风格：

- `*Actions`
- `*Commands`
- `*Write`
- `*Transaction`
- `*Host`
- `*Runtime`，除非它本身就是公开产品概念

因为这些名字几乎都在暴露实现层级，而不是产品边界。

### 最终根入口示例

#### `@whiteboard/engine`

```ts
export { createEngine } from './runtime/createEngine'

export type { Engine } from './public/engine'
export type { EngineRead } from './public/read'
export type { EngineConfig } from './public/config'
export type { EngineCommand } from './public/command'
export type { ExecuteOptions, ExecuteResult } from './public/command'
export type { ApplyOperationsOptions } from './public/engine'
export type { Commit } from './public/commit'
export type { Operation } from './public/operation'
```

#### `@whiteboard/editor`

```ts
export { createEditor } from './internal/createEditor'
export {
  selectTool,
  handTool,
  edgeTool,
  insertTool,
  drawTool
} from './public/tool'

export type { Editor } from './public/editor'
export type { EditorRead } from './public/editor'
export type { EditorState } from './public/state'
export type { EditorInput } from './public/input'
export type { EditorConfig } from './public/editor'
export type { EditorDocumentApi } from './public/document'
export type { EditorSessionApi } from './public/session'
export type { EditorViewApi } from './public/view'
export type { EditorNodePatch, EditorEdgePatch, MindmapNodePatch } from './public/patch'
```

### 最终子路径导出策略

长期建议：

- 根入口只给大多数消费者使用
- 少量子路径只服务明确场景
- 不允许为了“方便”把 internal 目录暴露出去

建议保留的子路径：

- `@whiteboard/editor/input`
- `@whiteboard/editor/tool`
- `@whiteboard/editor/node-registry`

建议删除的子路径倾向：

- 一切 `runtime/*`
- 一切 `types/*`
- 一切 `commands/*`
- 一切 `write/*`

### Blueprint 使用方式

这份 Blueprint 的作用不是指导增量改造，而是提供最终目标校验。

任何未来重构方案都应能回答两个问题：

1. 最终会收敛到上面的哪个目录位置
2. 最终会收敛到上面的哪个 public export

如果一个新文件或新类型找不到归宿，默认说明它不属于长期结构。

## 代码组织规则

### 1. 装配层不能承载业务逻辑

类似 `createEditorActions` 的装配函数只能做拼装，不能再做：

- patch merge
- kind 过滤
- sticky 特判
- measured size 合并

这些逻辑必须收敛到单独 translator/compiler 模块里。

### 2. 每个领域只允许一个 patch compiler

长期只保留：

- `compileNodePatch`
- `compileEdgePatch`
- `compileMindmapIntent`
- `translateNodeCommand`
- `translateEdgeCommand`
- `translateMindmapCommand`

不允许：

- 一部分 node patch 在 actions 里拼
- 一部分在 text command 里拼
- 一部分在 appearance command 里拼
- 一部分在 shape command 里拼

也不允许：

- compiler 直接产出 commit
- public patch 绕过 translator 直接进入 operation 层

### 3. 内部 host object 不命名成正式 API

像 `createNodeAppearanceCommands`、`createNodeTextCommands` 这种命名，会让人误以为它们是正式边界。

长期应改成：

- `compileNodeAppearancePatch`
- `compileNodeTextPatch`
- `applyClipboardInsert`
- `resolveMindmapInsertIntent`

也就是 helper 命名，不再伪装成一套命令系统。

## 现有模块删除清单

这一节不是迁移步骤，而是长期最终态下的“应消失名单”。

判断标准只有一个：

- 这个模块在最终 Blueprint 里有没有明确归宿

如果没有归宿，就应该删除，而不是继续保留。

### Engine 必删模块

#### 直接删除

- `whiteboard/packages/whiteboard-engine/src/commands/index.ts`
- `whiteboard/packages/whiteboard-engine/src/commands/document.ts`
- `whiteboard/packages/whiteboard-engine/src/commands/canvas.ts`
- `whiteboard/packages/whiteboard-engine/src/commands/node.ts`
- `whiteboard/packages/whiteboard-engine/src/commands/edge.ts`
- `whiteboard/packages/whiteboard-engine/src/commands/group.ts`
- `whiteboard/packages/whiteboard-engine/src/commands/mindmap.ts`

原因：

- 这些文件定义的是 imperative façade，而不是长期 canonical 模型
- 长期只保留 `engine.execute(command)`
- `canvas` 不是 engine 领域边界，必须彻底消失

#### 拆散后删除原文件

- `whiteboard/packages/whiteboard-engine/src/types/command.ts`
- `whiteboard/packages/whiteboard-engine/src/types/instance.ts`
- `whiteboard/packages/whiteboard-engine/src/types/write.ts`
- `whiteboard/packages/whiteboard-engine/src/types/index.ts`

吸收去向：

- `public/`
- `command/`
- `translate/`
- `runtime/`

原因：

- 这些文件把 public type、internal type、command model、façade API 混在一起
- 长期结构不允许继续维持“巨型 types 文件”

#### 改名并吸收

- `whiteboard/packages/whiteboard-engine/src/instance/engine.ts`
  吸收到 `runtime/createEngine.ts`
- `whiteboard/packages/whiteboard-engine/src/write/translate/index.ts`
  拆到 `translate/*`
- `whiteboard/packages/whiteboard-engine/src/write/index.ts`
  拆到 `runtime/execute.ts` 与 `runtime/applyOperations.ts`

#### 长期不应再存在的公开概念

- `EngineCommands`
- `canvas` domain
- `updateMany` 作为长期对外命令名
- 命令树式 `engine.commands.*`

### Editor 必删模块

#### 直接删除

- `whiteboard/packages/whiteboard-editor/src/runtime/write/index.ts`
- `whiteboard/packages/whiteboard-editor/src/runtime/write/document.ts`
- `whiteboard/packages/whiteboard-editor/src/runtime/write/session.ts`
- `whiteboard/packages/whiteboard-editor/src/runtime/write/view.ts`
- `whiteboard/packages/whiteboard-editor/src/runtime/write/preview.ts`

原因：

- `editor.write` 在长期结构里不是公开边界，也不是正式命名层
- 这些模块只代表内部过渡层，应被内部 runtime host 吸收

#### 直接删除或彻底改写

- `whiteboard/packages/whiteboard-editor/src/runtime/editor/actions.ts`

原因：

- 它把 public API 装配、node patch merge、domain 逻辑混在一起
- 长期结构里不再有 `editor.actions`

#### 拆散后删除原文件

- `whiteboard/packages/whiteboard-editor/src/types/editor.ts`

吸收去向：

- `public/editor.ts`
- `public/document.ts`
- `public/session.ts`
- `public/view.ts`
- `public/patch.ts`
- `internal/*`

原因：

- 它同时承载 public contract、runtime internal type、write host type、装配中间类型
- 长期结构里这是最典型必须消失的巨型文件

#### 只保留语义，删除当前命名层

- `whiteboard/packages/whiteboard-editor/src/runtime/commands/node/document.ts`
- `whiteboard/packages/whiteboard-editor/src/runtime/commands/node/appearance.ts`
- `whiteboard/packages/whiteboard-editor/src/runtime/commands/node/lock.ts`
- `whiteboard/packages/whiteboard-editor/src/runtime/commands/node/shape.ts`
- `whiteboard/packages/whiteboard-editor/src/runtime/commands/node/text.ts`

原因：

- 这些模块现在是在定义一套伪“正式命令层”
- 长期结构里只保留：
  - public patch shape
  - internal patch compiler
  - engine command translator

吸收去向：

- `internal/compile/nodePatch.ts`
- `internal/intent/nodes.ts`

#### 应被压平吸收的 action 模块

- `whiteboard/packages/whiteboard-editor/src/runtime/commands/canvas.ts`
- `whiteboard/packages/whiteboard-editor/src/runtime/commands/group.ts`
- `whiteboard/packages/whiteboard-editor/src/runtime/commands/frame.ts`
- `whiteboard/packages/whiteboard-editor/src/runtime/commands/clipboard.ts`
- `whiteboard/packages/whiteboard-editor/src/runtime/commands/edge.ts`
- `whiteboard/packages/whiteboard-editor/src/runtime/commands/mindmap.ts`

原因：

- 这些模块表达的是 editor intent，但现在被命名成 `commands`
- 长期应收敛到：
  - `public/document.ts`
  - `internal/intent/*`
  - `internal/compile/*`

#### 长期不应再存在的公开概念

- `EditorActions`
- `EditorDocumentActions`
- `EditorWriteApi`
- `EditorWriteTransaction`
- `EditorDocumentWrite`
- `EditorSessionWrite`
- `EditorViewWrite`
- `EditorPreviewWrite`
- `EditorNodeCommands`
- `EditorNodeTextCommands`
- `EditorNodeAppearanceCommands`
- `EditorNodeShapeCommands`
- `board.replace`
- `doc.replace`
- `clipboard.export`
- `clipboard.insert`

### Collab 必删模块与边界修正

`collab` 不需要大改层级数量，但要修正它依赖的边界。

#### 应删除的旧依赖方式

- 直接依赖 `engine.commands.document.replace`

长期替代：

- `engine.execute({ type: 'document.replace', ... })`
  或等价的统一 command

原因：

- `collab` 不应依赖将被删除的 imperative command tree

#### 应禁止新增的依赖方式

- 直接消费 editor patch
- 直接消费 editor internal intent
- 直接依赖 `runtime/*`
- 直接依赖 `types/*`

原因：

- `collab` 的唯一稳定货币是 normalized operations
- `collab` 只应依赖 `Operation`、`Commit`、`engine.execute`、`engine.applyOperations`

#### 长期应保留的 collab 边界

- 监听 `commit`
- 同步 normalized operations
- 将远端 operations 回放到 engine
- 在 bootstrap 时做 document replace

长期不应保留：

- 任何基于 editor patch 的同步协议
- 任何基于 editor UI intent 的网络协议

### Whiteboard React 必删依赖路径

虽然这份文档主要讨论 `engine` / `editor` / `collab`，但长期还应明确上层调用点要删除哪些路径。

React 层长期不应再调用：

- `editor.actions.*`

React 层长期只应调用：

- `editor.document.*`
- `editor.session.*`
- `editor.view.*`
- `editor.input.*`

原因：

- 上层如果继续依赖 `actions`，会强迫 editor 保留一层纯包装入口

### 删除判定规则

未来任何现有模块，如果满足以下任一条件，都应该进入删除名单：

1. 它只是另一层 façade
2. 它只是重命名或转发现有类型
3. 它同时承载 public contract 和 internal implementation
4. 它把 patch compiler、translator、runtime assembly 混在一起
5. 它暴露了 `write`、`actions`、`commands`、`transaction` 这类实现层级名

### 删除后的最低结构

完成删除后，长期结构应压缩到下面这些稳定入口：

- `engine.execute`
- `engine.applyOperations`
- `engine.read`
- `engine.commit`
- `editor.document`
- `editor.session`
- `editor.view`
- `editor.input`
- `collab <-operations-> engine`

## 必删项

长期方案里，以下项目应该直接删除：

- `engine.commands`
- `engine.commands.canvas`
- `editor.actions`
- `editor.write`
- `createEditorWrite`
- `EditorWriteApi`
- `EditorWriteTransaction`
- `EditorDocumentWrite`
- `EditorSessionWrite`
- `EditorViewWrite`
- `EditorPreviewWrite`
- `EditorNodeDocumentCommands`
- `EditorNodeAppearanceCommands`
- `EditorNodeShapeCommands`
- `EditorNodeTextCommands`
- `EditorDocumentNodeTextWrite`
- `EditorDocumentNodeWrite`
- `nodes.text`
- `nodes.style`
- `nodes.shape`
- `nodes.lock`
- `board.replace`
- `doc.replace`
- `clipboard.export`
- `clipboard.insert`

对应替代：

- `engine.execute(command)`
- `editor.document / editor.session / editor.view`
- `document.replace`
- `clipboard.copy`
- `clipboard.paste`
- `nodes.patch`
- `edges.patch`

## 最终 API 示例

### Engine

```ts
const result = engine.execute({
  type: 'node.patch',
  ids: [nodeId],
  patch: {
    data: { text: 'Hello' },
    style: { fontSize: 16 }
  }
})
```

这里的返回结果可以带高层 output，但 commit、history、collab 仍然只依赖 translator 产出的 normalized operations。

### Editor

```ts
editor.document.nodes.patch([nodeId], {
  data: { text: 'Hello' },
  style: { fontSize: 16 }
})

editor.document.selection.duplicate(editor.state.selection.get())

editor.document.clipboard.paste(packet, {
  origin: point
})

editor.session.selection.replace({
  nodeIds: [nodeId]
})

editor.view.viewport.fit(bounds)
```

### Mindmap

```ts
editor.document.mindmaps.insert({
  id: mindmapId,
  targetNodeId,
  placement: 'right',
  payload: {
    kind: 'text',
    text: ''
  }
})
```

外部只表达编辑意图，不再知道底层是 `insert`、`move.subtree`、`layout hint` 还是 `node.patch`。

但协同层仍然只看 normalized operations，不看这些 editor-facing patch。

## 验收标准

当这轮长期重构完成后，应满足：

1. 看 public API 时，只能看到一套 engine 写模型和一套 editor 写模型
2. 没有任何 `document.node.document.*` 这种双重命名路径
3. node 修改只有一个入口，edge 修改只有一个入口
4. 包入口导出的类型数量显著下降，且大多数都对应真实概念
5. 装配层只拼装，不承载业务逻辑
6. 任何 UI 层开发者都不需要理解 engine 内部 write 包装链，才能完成编辑操作
7. collab 层不需要理解 editor patch，只消费 normalized operations

## 最终判断

长期最优方案不是“继续整理现有层级”，而是主动删除整层抽象。

真正应该保留的只有：

- `engine.execute`
- `engine.applyOperations`
- `engine.read`
- `editor.document`
- `editor.session`
- `editor.view`
- `editor.input`
- `editor.state`

以及一条必须长期保留的底层事实：

- normalized `operations` 是 history 与 collab 的统一货币

其余大量中间 command、write、action、type，大部分都应视为过渡期产物，而不是长期结构的一部分。
