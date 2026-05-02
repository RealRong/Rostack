# WHITEBOARD_EDITOR_LONG_TERM_API_SIMPLIFICATION_PLAN

## 1. 目标

这份文档只讨论长期最优结构，不考虑兼容、不考虑过渡、不保留双协议。

目标很明确：

1. `whiteboard-editor` 只保留一套主轴协议。
2. `editor`、`editor-scene`、`input` 上下游必须尽量同构，减少“转一层再转一层”的数据搬运。
3. `Editor` 顶层只暴露稳定、清晰、可理解的主能力，不把内部 runtime 细节平铺到根对象。
4. 输入特性直接依赖 `editor` 主轴，不再为单个 feature 造一批局部 transport types。
5. helper 能内联就内联，不能内联的就绑定到明确中轴，避免散落在各处的小读取函数。

---

## 2. 当前主要问题

### 2.1 `Editor` 根对象过宽，职责混杂

当前 `Editor`：

```ts
export type Editor = {
  scene: EditorSceneFacade
  document: DocumentFrame
  history: HistoryPort<IntentResult>
  input: EditorInputHost
  write: EditorWrite
  mutate: EditorMutationWrite
  viewport: EditorStateRuntime['viewport']
  snapshot: () => EditorStateDocument
  config: BoardConfig
  nodeType: NodeTypeSupport
  snap: SnapRuntime
  dispatch: (command: EditorDispatchInput) => void
  dispose: () => void
}
```

问题：

1. 顶层同时混入了公开 API、输入内部依赖、runtime 细节、策略配置。
2. `write` / `mutate` 命名反了。
3. `viewport`、`config`、`nodeType`、`snap` 被平铺到根对象，导致根 API 不稳定、不可收敛。
4. `snapshot()` 暴露的是完整 editor state engine snapshot，这更像内部 runtime 能力，不像消费层主 API。
5. `history` 还挂在根上，但当前方向已经不是 editor 内部自己围绕 history 建模。

结论：

`Editor` 现在更像“内部总线对象”，不是“最终公开 API”。

### 2.2 `write` / `mutate` 语义不清

当前：

1. `write` 实际是高层 action API。
2. `mutate` 实际是低层写入 runtime。

这会直接造成读代码的人误判调用层级。

长期应该改成：

1. `editor.actions`
2. `editor.write`

语义分别是：

1. `actions`：面向产品语义的高层操作，如创建节点、切换工具、提交边连接。
2. `write`：面向 editor/document state 的低层同步写入能力，仅供输入编排和内部过程层使用。

### 2.3 `viewport`、`snap`、`nodeType`、`config` 不应都留在顶层

这些能力不是同一层：

1. `viewport` 是 editor state runtime 的一部分。
2. `snap` 是输入/交互使用的运行时能力。
3. `nodeType` 是节点规格与策略读取能力。
4. `config` 是 board 级只读配置。

把它们全部平铺到根上，会让 `Editor` 继续膨胀，并迫使 feature 随手拿根对象里所有东西。

### 2.4 输入层仍有大量局部协议类型

`whiteboard/packages/whiteboard-editor/src/input/features/edge/connect.ts` 里仍然有很多“只服务单文件搬运”的自定义类型：

1. `EdgeConnectNodeRead`
2. `EdgeConnectPreviewGeometryRead`
3. `EdgeConnectEdgeRead`
4. `EdgeConnectSnap`
5. `EdgeConnectStartInput`
6. `EdgeConnectStepInput`
7. `EdgeConnectGestureInput`
8. `ConnectNodeEntry`

这些类型大多不是领域模型，而是“为了局部函数签名舒服一点临时造的壳”。这会导致：

1. 真实依赖被遮蔽。
2. 上下游协议难统一。
3. 文件内部出现第二套小型抽象层。

### 2.5 `NodeTypeSupport` 周围 helper 过多

`whiteboard/packages/whiteboard-editor/src/types/node/support.ts` 当前有明显的细碎读取 helper：

1. `readStyleValue`
2. `readFallbackMeta`
3. `readStyleValueMatchesKind`
4. `readDefinitionCapability`

这里的问题不是函数数量本身，而是：

1. 编译后的 node support 没有成为足够明确的单一能力对象。
2. 读定义、读 fallback、读 style kind、读 capability 被拆成很多散函数。
3. feature 侧还需要知道 `resolveNodeEditorCapability` 这种二次规则。

长期应该让 `nodeType` 自身就成为更完整、更直接的策略读取中轴。

### 2.6 selection policy 读取逻辑过散

`whiteboard/packages/whiteboard-editor/src/editor/ui/selection-policy-node.ts` 里存在大量 style 读取 helper 和聚合逻辑。它已经不只是“小 helper”，而是在承担一块明确的 UI policy。

问题在于：

1. 它目前看起来像一个 helper 文件，实际却是选择态 UI 的核心策略模块。
2. 其内部仍有大量 `readString` / `readNumber` / `readNumberArray` 这类样板代码。
3. `selection.ts`、`selection-policy-toolbar.ts` 共同依赖它，边界不够直接。

### 2.7 `projection` 仍然承担部分 store 构造职责

`whiteboard/packages/whiteboard-editor/src/editor/projection.ts` 当前还在：

1. `createEditorStateStores`
2. `createEditorStateView`

这意味着 `editor` 包内部仍然保有一层 store 组装与 view 包装逻辑。即使这是给 React/scene 侧消费方便，也说明职责还没有完全收拢。

长期目标不一定是“彻底没有任何 store 工厂函数”，但至少应该做到：

1. store/view 是明确的 scene/ui 出口能力，不属于 editor 核心 API。
2. 不要在多个地方重复创建同一套 state stores。
3. 不要让 `projection` 既负责 scene facade 拼装，又负责状态 store 适配。

---

## 3. 最终设计原则

### 3.1 根对象只留稳定主能力

建议最终 `Editor` 只保留以下根字段：

```ts
export type Editor = {
  scene: EditorSceneFacade
  document: DocumentFrame
  actions: EditorActions
  write: EditorWrite
  input: EditorInputHost
  dispatch: (command: EditorDispatchInput | readonly EditorDispatchInput[]) => void
  read(): EditorStateDocument
  dispose(): void
}
```

说明：

1. `scene`：对外可见的 projection / scene 出口。
2. `document`：文档读能力。
3. `actions`：高层语义操作。
4. `write`：低层同步写能力。
5. `input`：交互宿主。
6. `dispatch`：editor command 中轴。
7. `read()`：统一读取当前 editor state snapshot。
8. `dispose()`：生命周期结束。

这里的 `read()` 比 `snapshot()` 更符合“当前状态读取”语义，也避免让人误解为“生成可持久化快照”的能力。

### 3.2 内部运行时能力进入 `editor.runtime`

如果仍需要把某些内部能力挂在 `editor` 上，应该收进一个明确的内部轴，而不是顶层平铺：

```ts
export type EditorRuntime = {
  viewport: EditorViewportRuntime
  snap: SnapRuntime
  nodeType: NodeTypeRuntime
  config: BoardConfig
}
```

最终形式：

```ts
export type Editor = {
  scene: EditorSceneFacade
  document: DocumentFrame
  actions: EditorActions
  write: EditorWrite
  input: EditorInputHost
  dispatch: (command: EditorDispatchInput | readonly EditorDispatchInput[]) => void
  read(): EditorStateDocument
  runtime: EditorRuntime
  dispose(): void
}
```

原则：

1. 公开主 API 在根上。
2. 内部过程依赖放到 `runtime`。
3. feature 代码如果确实需要低层能力，显式从 `ctx.editor.runtime.*` 取，避免“根对象上什么都有”。

### 3.3 命名统一

最终命名建议：

1. `write -> actions`
2. `mutate -> write`
3. `snapshot() -> read()`
4. viewport 写操作统一进入 `editor.actions.viewport.*`
5. viewport 读能力改为扁平的 `editor.runtime.viewport.*`
6. `nodeType` 不再顶层暴露，改为 `editor.runtime.nodeType`
7. `snap` 不再顶层暴露，改为 `editor.runtime.snap`
8. `config` 不再顶层暴露，改为 `editor.runtime.config`

### 3.4 输入层直接依赖主轴，不再造局部 transport types

输入层函数签名原则：

1. 能直接吃 `EditorInputContext` 的就直接吃。
2. 能直接吃明确的领域对象，如 `PointerDownInput`、`EdgeConnectState`，就直接吃。
3. 不再为“从 `ctx.editor` 挑几项出来”专门定义一批 `Pick<>` 类型。

只有两类类型值得保留：

1. 真正跨文件复用的领域类型。
2. 明确表达状态机节点的类型。

### 3.5 `NodeTypeSupport` 要变成完整策略对象

长期不应再由外部自由组合：

1. `nodeType.capability(type)`
2. `resolveNodeEditorCapability(node, nodeType)`
3. `nodeType.supportsStyle(node, field, kind)`
4. `nodeType.hasControl(node, control)`

建议最终收敛成：

```ts
type NodeTypeRuntime = {
  meta(type: NodeType): NodeMeta
  edit(type: NodeType, field: EditField): EditCapability | undefined
  style(node: Pick<Node, 'type' | 'style'>, field: NodeStyleFieldKey): unknown
  supports(node: Pick<Node, 'type' | 'style' | 'owner'>): {
    connect: boolean
    resize: boolean
    rotate: boolean
    controls: readonly ControlId[]
    style: {
      fill: boolean
      stroke: boolean
      text: boolean
      fontSize: boolean
      fontWeight: boolean
      fontStyle: boolean
      textAlign: boolean
      fillOpacity: boolean
      strokeOpacity: boolean
      strokeDash: boolean
      opacity: boolean
    }
  }
}
```

重点不是这份 shape 必须一字不差，而是：

1. feature 不该再自己拼 capability 规则。
2. `mindmap owner` 之类 editor 特有规则应编进运行时能力对象。
3. `resolveNodeEditorCapability` 这种外围 helper 最终应被吃掉。

### 3.6 selection UI policy 应升级成中轴模块

`selection-policy-node.ts` 不该继续表现为“一个 helper 文件”，而应该成为明确的策略读取模块，例如：

1. `editor/ui/nodeSelectionScope.ts`
2. 或 `editor/ui/nodeSelectionPolicy.ts`

要求：

1. 对外只暴露一个主要入口。
2. 内部小读取函数能内联则内联。
3. 样式读取优先复用 `nodeType runtime` 的统一读取能力，而不是每个 policy 文件都自己解析 style。

### 3.7 scene 与 editor 的边界要更直接

最终目标仍然是：

1. `document snapshot + document delta`
2. `editor snapshot + editor delta`
3. 两者一起喂给 projection

`editor-scene` 不应再定义一套与 editor 平行但不完全同构的轻微变体协议。scene 只吃统一输入、输出统一投影。

---

## 4. 建议的最终 API 形状

### 4.1 `Editor`

```ts
export type Editor = {
  scene: EditorSceneFacade
  document: DocumentFrame
  actions: EditorActions
  write: EditorWrite
  input: EditorInputHost
  dispatch: (command: EditorDispatchInput | readonly EditorDispatchInput[]) => void
  read(): EditorStateDocument
  runtime: EditorRuntime
  dispose(): void
}
```

### 4.2 `EditorRuntime`

```ts
export type EditorRuntime = {
  viewport: EditorViewportRuntime
  snap: SnapRuntime
  nodeType: NodeTypeRuntime
  config: BoardConfig
}
```

`runtime` 的定位：

1. 不是产品层 API。
2. 是 editor 内部编排和高级接入层使用的能力桶。
3. 必须集中，不能继续散在顶层。

### 4.3 `EditorViewportRuntime`

当前 `EditorStateRuntime['viewport']` 直接透出不够好，类型名也不稳定；同时 `read` / `input` / `resolve` 这类嵌套也没有必要保留。

最终应当压平成扁平 runtime：

```ts
export type EditorViewportRuntime = {
  get(): Viewport
  subscribe(listener: () => void): () => void
  pointer(input: { clientX: number; clientY: number }): {
    screen: Point
    world: Point
  }
  worldToScreen(point: Point): Point
  worldRect(): Rect
  screenPoint(clientX: number, clientY: number): Point
  size(): {
    width: number
    height: number
  }
  setRect(rect: Rect): void
  setLimits(limits: ViewportLimits): void
}
```

写操作全部收进 `editor.actions.viewport.*`：

```ts
editor.actions.viewport.set(viewport)
editor.actions.viewport.panBy(delta)
editor.actions.viewport.panScreenBy(deltaScreen)
editor.actions.viewport.zoomTo(zoom, anchor)
editor.actions.viewport.fit(rect, options)
editor.actions.viewport.reset()
editor.actions.viewport.wheel(input)
```

重点：

1. `viewport` 不是值，而是 runtime。
2. `viewport` runtime 只负责读、坐标换算、宿主环境同步。
3. `viewport` 相关状态写入全部通过 `actions.viewport.*`。
4. 不再保留 `viewport.resolve.*`。
5. 不再保留 `viewport.read.*` / `viewport.input.*` 这种纯分组式嵌套。
6. 不应继续用 `EditorStateRuntime['viewport']` 这种“从实现里抠类型”的方式暴露。

---

## 5. 需要重点清理的重复与异构点

### 5.1 `types/editor.ts`

要做：

1. 收窄根对象。
2. 改正 `write` / `mutate` 命名。
3. 引入 `EditorRuntime`、`EditorViewportRuntime` 显式类型。
4. 把顶层的 `config`、`nodeType`、`snap` 下沉到 `runtime`。
5. 顶层 `viewport` 删除，读能力进入扁平的 `editor.runtime.viewport.*`，写能力进入 `editor.actions.viewport.*`。
5. `snapshot` 改成 `read`。

### 5.2 `editor/createEditor.ts`

要做：

1. 创建 `actions` 与 `write` 的最终命名。
2. 把 viewport 写逻辑收到 `actions.viewport.*`。
3. 组装 `runtime` 对象，而不是把内部件平铺到根。
4. 停止返回“半公开半内部”的杂糅对象。
5. 让 `input` 只依赖最终 `Editor` 形状。

### 5.3 `input/runtime.ts`

要做：

1. `EditorInputContext` 只依赖最终的 `Editor` 协议。
2. 不再假设根对象上直接有 `viewport` / `snap` / `nodeType` / `config`。
3. viewport 写入统一走 `editor.actions.viewport.*`。
4. viewport 读取统一走扁平的 `editor.runtime.viewport.*`。
5. 其他运行时能力统一改从 `editor.runtime.*` 读取。

### 5.4 `input/features/edge/connect.ts`

要做：

1. 删除局部 transport types。
2. 改为直接吃 `ctx.editor.runtime.nodeType`、`ctx.editor.runtime.snap`、`ctx.editor.runtime.config`、`ctx.editor.runtime.viewport`。
3. `ConnectNodeEntry` 如果只是 `scene.nodes.get()` 的返回值别名，应内联。
4. 本文件保留的类型只应是明确的状态机输入/输出类型。

### 5.5 `input/features/selection/press.ts` 与 `transform.ts`

这两处已经明显依赖：

1. `resolveNodeEditorCapability`
2. `editor.nodeType`
3. `editor.snap`
4. `editor.viewport`
5. `editor.mutate`

要做：

1. 全部切到 `editor.runtime.*` + `editor.write` / `editor.actions`。
2. 消灭 `resolveNodeEditorCapability` 这种外围 capability 二次拼装。

### 5.6 `types/node/support.ts`

要做：

1. 合并细碎 helper。
2. 把 editor 特有 capability 规则编进 `NodeTypeRuntime`。
3. 对外导出更直接的统一读取能力。
4. 删除外围 `resolveNodeEditorCapability`。

### 5.7 `editor/ui/selection-policy-node.ts`

要做：

1. 升级为明确 policy 模块。
2. 能内联的 style 读取逻辑内联。
3. 能复用 `NodeTypeRuntime` 的统一读取能力就不要自己再读 style。
4. 与 `selection-policy-toolbar.ts` 的边界重新压平，避免两处来回拼装 scope。

### 5.8 `editor/projection.ts`

要做：

1. 检查 `createEditorStateStores` 是否仍重复构造。
2. `createEditorProjection` 与 `createEditorSceneFacade` 不要重复建 state stores。
3. 把“state view 适配”和“scene facade 拼装”拆清楚，避免一个文件同时承担太多角色。

---

## 6. 分阶段实施方案

### Phase 1：收敛 `Editor` 根 API

目标：

1. 完成 `write -> actions`
2. 完成 `mutate -> write`
3. `snapshot() -> read()`
4. 引入 `runtime`
5. viewport 写操作迁到 `actions.viewport.*`
6. viewport 读能力迁到扁平的 `runtime.viewport.*`
7. 根对象移除 `viewport` / `snap` / `nodeType` / `config`

实施清单：

1. 改 `types/editor.ts`
2. 改 `editor/createEditor.ts`
3. 改所有 viewport 写调用到 `editor.actions.viewport.*`
4. 改所有 viewport 读调用到扁平的 `editor.runtime.viewport.*`
5. 改所有直接访问 `editor.snap` 的地方到 `editor.runtime.snap`
6. 改所有直接访问 `editor.nodeType` 的地方到 `editor.runtime.nodeType`
7. 改所有直接访问 `editor.config` 的地方到 `editor.runtime.config`
8. 改所有直接访问 `editor.write` 的高层 action 调用到 `editor.actions`
9. 改所有直接访问 `editor.mutate` 的低层写入调用到 `editor.write`

验收标准：

1. `Editor` 根对象只保留主能力字段。
2. 运行时内部能力全部收进 `editor.runtime`。
3. viewport 不再存在 `resolve` / `read` / `input` 分层。
4. 代码里不再出现旧命名访问面。

### Phase 2：压平 input 协议

目标：

1. 输入特性不再依赖一批局部 transport types。
2. `EditorInputContext` 成为唯一主上下文。

实施清单：

1. 清理 `input/features/edge/connect.ts` 局部壳类型。
2. 清理其他 feature 内仅为拆字段而定义的 `Pick<>`、`Read`、`Input` 小类型。
3. 保留真正的状态机类型，删除仅用于搬运字段的别名。
4. 统一 feature 读路径，全部从 `ctx.editor` 与 `ctx.layout` 出发。

验收标准：

1. feature 文件签名可直接反映真实依赖。
2. 不再存在一批“只是从 editor 上摘几项”的局部协议类型。

### Phase 3：统一 node type / capability 体系

目标：

1. 让 `NodeTypeSupport` 成为真正的 `NodeTypeRuntime`。
2. 删除外围 capability helper。

实施清单：

1. 重写 `types/node/support.ts` 的导出面。
2. 把 `resolveNodeEditorCapability` 合并进 runtime 本体。
3. 给出统一的 style 支持读取和 capability 读取出口。
4. 调整 `selection/press.ts`、`transform.ts`、`edge/connect.ts` 等调用点。

验收标准：

1. 外部不再自己拼 node capability。
2. `resolveNodeEditorCapability` 已删除。
3. 节点能力读取路径单一明确。

### Phase 4：收拢 selection policy

目标：

1. 选择态 UI policy 不再像一堆 helper。
2. scope 读取中轴更集中。

实施清单：

1. 重构 `selection-policy-node.ts`
2. 精简 `selection-policy-toolbar.ts`
3. 用统一 style / capability 读取能力替代局部读 style helper
4. 只保留明确的 policy 入口

验收标准：

1. selection policy 的主入口清晰。
2. helper 数量明显下降。
3. 选择态 scope 组装不再分散在多个文件之间互相跳转。

### Phase 5：收敛 projection / store 适配边界

目标：

1. 明确 store/view 适配只属于 scene/ui 消费出口。
2. 消灭重复构造与重复包装。

实施清单：

1. 审查 `createEditorStateStores` 的创建次数。
2. 避免 `createEditorProjection` 和 `createEditorSceneFacade` 重复构造相同适配层。
3. 明确 editor 核心对象不承担 UI store 组装。
4. 如有必要，把 facade 适配和 state view 适配拆文件。

验收标准：

1. store 适配位置单一。
2. projection 文件不再同时承担过多角色。

---

## 7. 明确要删除的东西

以下内容不是“可选优化”，而是应视为最终清理目标：

1. `Editor` 顶层的 `write` 旧命名。
2. `Editor` 顶层的 `mutate` 旧命名。
3. `Editor` 顶层的 `viewport` 平铺能力。
4. `Editor` 顶层的 `snap` 平铺能力。
5. `Editor` 顶层的 `nodeType` 平铺能力。
6. `Editor` 顶层的 `config` 平铺能力。
7. `snapshot()` 旧命名。
8. `viewport.resolve.*`
9. `viewport.read.*`
10. `viewport.input.*`
11. `resolveNodeEditorCapability` 外围 helper。
12. `edge/connect.ts` 中仅用于字段搬运的局部协议类型。
13. `selection-policy-node.ts` 中无必要保留的细碎 style helper。
14. `projection.ts` 中重复 state store 构造。

---

## 8. 迁移时的硬约束

1. 不做兼容层。
2. 不保留旧字段别名。
3. 不保留新旧命名并存。
4. 不保留第二套 capability 协议。
5. 不保留第二套 feature context 协议。
6. 不为了“少改几处调用点”继续维持顶层平铺设计。

---

## 9. 最终推荐结论

长期最优方案是：

1. `Editor` 根对象只暴露主能力。
2. 运行时内部依赖全部下沉到 `editor.runtime`。
3. viewport 写操作统一进入 `editor.actions.viewport.*`，runtime 只保留扁平读能力。
4. `actions` 与 `write` 按层级语义重新命名。
5. `NodeTypeSupport` 升级成统一 runtime 能力对象，吃掉外围 capability helper。
6. 输入特性直接依赖 `EditorInputContext`，不再定义大量局部 transport types。
7. selection policy 升级成明确中轴模块，不再继续以 helper 堆叠。
8. projection/store 适配边界继续压平，避免 editor 核心对象承担 UI 适配角色。

如果按这个方向收尾，`whiteboard-editor` 的主轴会明显更简单：

1. 外部看 `Editor`，入口少、语义稳。
2. 内部看 input，依赖轴单一。
3. scene 看 editor snapshot + delta，协议一致。
4. feature 看 node capability / viewport / snap，读取路径统一。

这才符合“长期最优、不留兼容、不留第二套实现”的目标。
