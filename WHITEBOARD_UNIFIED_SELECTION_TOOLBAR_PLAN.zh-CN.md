# Whiteboard 统一 Selection Toolbar 长期方案

## 背景

当前 whiteboard 的 selection toolbar 不是一套统一系统，而是两套互斥系统：

- 纯 node selection 走 `nodeToolbar`
- 纯 edge selection 走 `edgeToolbar`
- `node + edge` mixed selection 不属于任何一条链路，因此直接没有 toolbar

这不是一个局部 UI 漏洞，而是当前 selection presentation、toolbar context、toolbar recipe、toolbar item registry、action 语义整体偏 node-centric 的结果。

本方案的目标不是修补当前裂缝，而是直接把 toolbar 重构为一套 **selection-first、mixed-selection 原生支持、长期唯一模型**。

## 结论

长期最优方案是：

- 删除 `nodeToolbar` / `edgeToolbar` 的分裂架构
- 只保留一个 canonical `selectionToolbar`
- 把“过滤”从“改真实 selection”改为“切换 toolbar scope”
- 把 `align / distribute / group` 升级为一等 toolbar item
- 把 `lock` 改成 selection-wide action，而不是 node-only action
- 不做兼容层，不保留双轨，不保留过渡 API

这是一份 **一步到位、不兼容旧模型** 的方案。

## 兼容性立场

本方案明确采用以下立场：

- 不保留 `nodeToolbar` 与 `edgeToolbar` 并存
- 不保留 `NodeToolbarContext` 作为过渡层
- 不保留 `NodeToolbarFilter`
- 不做 adapter，不做双写，不做双渲染
- 不要求旧 toolbar item API 继续可用
- mixed selection 从第一天开始就是一等场景，而不是补丁场景

换句话说，落地时允许一次性替换整条链路，只以最终统一模型为准。

## 当前问题

### 1. mixed selection 没有 toolbar 是架构结果

当前 `resolveSelectionToolbar` 只在纯 node selection 时返回 toolbar。

当前 `createEdgeToolbarRead` 只在纯 edge selection 时返回 toolbar。

因此：

- `nodes only` 有 toolbar
- `edges only` 有 toolbar
- `nodes + edges` 无 toolbar

这不是 recipe 漏了一个 case，而是 query 层就已经把 mixed selection 排除掉了。

### 2. 当前 toolbar model 只有 node 语义

当前 `NodeToolbarContext` 只包含：

- `nodeIds`
- `nodes`
- `primaryNode`
- node style capability
- node type filter

它没有：

- `edgeIds`
- `edges`
- edge bucket
- selection-wide lock model
- selection-wide structure action model

所以它本质上不是 selection toolbar，而是 node toolbar。

### 3. 当前 filter 不是 scope，而是 destructive selection mutation

当前 filter menu 的点击行为是：

- 直接 `selection.replace({ nodeIds })`

这意味着：

- 它只能过滤 node
- 它不能过滤 edge
- 它会破坏原始 mixed selection
- 它不能承担“toolbar 内部焦点切换”的角色

这与 mixed selection 下用户真正需要的行为不一致。

### 4. 当前 recipe 过于保守，且锁逻辑过粗

现在 `mixedRecipe` 和 `groupRecipe` 只有：

- `filter`
- `lock`
- `more`

同时，只要 `locked !== 'none'`，recipe 就整体退化为 `groupRecipe`。

这会导致：

- locked selection 丢失大量非破坏性能力
- mixed selection 看起来像“没有功能”
- toolbar 的信息密度与操作价值过低

### 5. 结构动作没有进入 toolbar 的一等层

当前 capability 已经计算：

- `makeGroup`
- `ungroup`
- `align`
- `distribute`

但 toolbar item registry 没有这些 item，导致这些动作既不是一等入口，也没有稳定的可见性规则。

### 6. lock 仍然是 node-only

当前 toolbar 上的 `lock` 调的是 node lock：

- 作用对象只有 `context.nodeIds`

这意味着即使强行让 mixed selection 显示 toolbar，`lock` 的语义仍然不完整。

## 设计目标

最终系统必须满足以下目标：

### 1. 一个 selection，只有一个 toolbar

不论当前选择是：

- 纯 node
- 纯 edge
- mixed node + edge

都只走一套 selection toolbar pipeline。

### 2. mixed selection 是原生场景

mixed selection 不是“退化态”，而是正常态。

它必须能稳定展示：

- selection-wide actions
- 结构动作
- 可切换的 node/edge 编辑 scope

### 3. 结构动作前置

以下动作必须成为 toolbar 主路径：

- align
- distribute
- group
- ungroup

它们不能只放在 `more` 里。

### 4. filter 改名改义

当前“filter”本质上承担的是“选择哪个子集来编辑”的职责。

最终它应当变成：

- `scope`
- `segment`
- 或其它等价名称

总之，它不再表示“过滤掉其它对象并重写 selection”，而是表示“在当前 selection 内切换编辑焦点”。

### 5. action visibility 必须 capability-driven

最终哪些 item 可见、可用，不再由粗糙的 `kind` 或硬编码 recipe 决定，而应主要由 capability 决定。

### 6. locked 只影响对应 action，不影响整条 toolbar

锁定只应逐项禁用变更型动作，而不是让整个 toolbar 退化为极简版本。

## 最终模型

## 一、唯一的 Toolbar Context

最终只保留一个 context：

`SelectionToolbarContext`

建议结构：

```ts
type SelectionToolbarContext = {
  selectionKey: string
  box: Rect
  selectionKind: 'nodes' | 'edges' | 'mixed'

  target: {
    nodeIds: readonly NodeId[]
    edgeIds: readonly EdgeId[]
  }

  nodes: readonly Node[]
  edges: readonly Edge[]

  summary: {
    nodeCount: number
    edgeCount: number
    totalCount: number
    exactGroupIds: readonly GroupId[]
  }

  lock: {
    state: 'none' | 'mixed' | 'all'
    canToggle: boolean
  }

  scopes: readonly SelectionToolbarScope[]
  activeScopeKey: string

  capabilities: SelectionToolbarCapabilities
  presentation: SelectionToolbarPresentation
}
```

这里的关键变化是：

- selection toolbar 直接持有完整 selection，而不是只持有 node 子集
- mixed selection 不需要特殊补丁，它本来就是合法输入

## 二、Scope 是核心，而不是附属 filter

建议引入 `SelectionToolbarScope`：

```ts
type SelectionToolbarScope =
  | {
      key: 'all'
      kind: 'all'
      label: string
      target: { nodeIds: readonly NodeId[]; edgeIds: readonly EdgeId[] }
    }
  | {
      key: 'nodes'
      kind: 'nodes'
      label: string
      target: { nodeIds: readonly NodeId[]; edgeIds: readonly [] }
      nodeTypes: readonly SelectionNodeTypeBucket[]
    }
  | {
      key: 'edges'
      kind: 'edges'
      label: string
      target: { nodeIds: readonly []; edgeIds: readonly EdgeId[] }
      edgeTypes: readonly SelectionEdgeTypeBucket[]
    }
  | {
      key: `node-type:${string}`
      kind: 'node-type'
      label: string
      target: { nodeIds: readonly NodeId[]; edgeIds: readonly [] }
    }
  | {
      key: `edge-type:${string}`
      kind: 'edge-type'
      label: string
      target: { nodeIds: readonly []; edgeIds: readonly EdgeId[] }
    }
```

核心原则：

- scope 只改变 toolbar 的编辑焦点
- scope 不改变真实 selection
- toolbar 中所有“子集动作”都基于 active scope 计算

这能同时解决：

- mixed selection 没 toolbar
- filter 不能过滤 edge
- align/distribute/group 在 mixed selection 下不知道该不该出现

## 三、能力模型必须区分 selection-wide 与 scope-local

建议把 capability 拆成两层：

```ts
type SelectionToolbarCapabilities = {
  selection: {
    copy: boolean
    cut: boolean
    duplicate: boolean
    delete: boolean
    order: boolean
    lock: boolean
    zoom: boolean
  }

  scope: {
    group: boolean
    ungroup: boolean
    align: boolean
    distribute: boolean
    createFrame: boolean

    canChangeShapeKind: boolean
    canEditFontSize: boolean
    canEditFontWeight: boolean
    canEditFontStyle: boolean
    canEditTextAlign: boolean
    canEditTextColor: boolean
    canEditFill: boolean
    canEditStroke: boolean
    canEditNodeOpacity: boolean

    canEditEdgeType: boolean
    canEditEdgeDash: boolean
    canEditEdgeWidth: boolean
    canEditEdgeColor: boolean
    canEditEdgeMarker: boolean
    canEditEdgeTextMode: boolean
  }
}
```

其中：

- `selection.*` 面向整个选区
- `scope.*` 面向当前 active scope

这比现在一个扁平 `NodeToolbarContext` 更稳定。

## 四、结构动作必须基于“作用子集”而不是“总选中数”

例如：

- `group` 不是“总数 >= 2 就可用”
- 而是“当前结构作用子集里，满足 group 约束的 nodes >= 2”

同理：

- `align` 看的是 active node scope 的 node 数量
- `distribute` 看的是 active node scope 的 node 数量
- edge 不参与 align/distribute

这能避免 `1 node + 1 edge` 这种混合选区在结构动作上出现语义模糊。

## 五、presentation 与 capability 分离

建议把“当前值”和“当前能否编辑”分开：

- capability 决定 item 是否可见、可用
- presentation 决定 item 当前显示什么值

例如：

```ts
type SelectionToolbarPresentation = {
  shapeKind?: ShapeKind
  fontSize?: number
  fontWeight?: number
  fontStyle?: 'normal' | 'italic'
  textAlign?: 'left' | 'center' | 'right'
  textColor?: string
  fill?: string
  stroke?: string
  strokeWidth?: number
  strokeDash?: readonly number[]
  opacity?: number

  edgeType?: EdgeType
  edgeDash?: EdgeDash
  edgeWidth?: number
  edgeColor?: string
  edgeStartMarker?: EdgeMarker
  edgeEndMarker?: EdgeMarker
  edgeTextMode?: EdgeTextMode
}
```

## 最终 UI 结构

## 一、只保留一个顶层 Toolbar Shell

最终 React 层只保留：

- `SelectionToolbar`

不再保留两个并行外壳：

- `NodeToolbar`
- `EdgeToolbar`

它们的样式 panel 可以复用，但顶层 shell 必须统一。

## 二、建议的 toolbar item 一等集合

最终一等 item 应至少包括：

- `scope`
- `align`
- `distribute`
- `group`
- `shape-kind`
- `font-size`
- `bold`
- `italic`
- `text-align`
- `text-color`
- `stroke`
- `fill`
- `edge-line`
- `edge-marker-start`
- `edge-marker-end`
- `edge-text-mode`
- `lock`
- `more`

如需压缩，可把 edge 相关合并为：

- `edge-line`
- `edge-endpoints`
- `edge-text`

但无论如何，`align / distribute / group` 不能再缺席。

## 三、建议的 recipe 逻辑

最终 recipe 不应再是“按 node kind 写死几套模板”，而应是：

- selection-wide 区
- structure 区
- scope-style 区
- utility 区

推荐顺序：

### 1. selection-wide 区

- `scope`

### 2. structure 区

- `align`
- `distribute`
- `group`

### 3. style 区

根据 active scope 动态切换：

- node scope: 显示 node style items
- edge scope: 显示 edge style items
- all scope: 只显示 selection-wide items，不显示冲突 style items

### 4. utility 区

- `lock`
- `more`

## 四、mixed selection 的默认行为

推荐默认规则：

- 只要当前 selection 同时包含 node 和 edge，并且 nodeCount > 0
- 默认 `activeScope = 'nodes'`

原因：

- 用户在 mixed selection 下最常见的诉求通常仍然是 node 结构操作
- `align / distribute / group` 是高频动作，应该直接出现
- edge 编辑可通过 scope 切换进入，不应抢占默认主位

如果是纯 edge selection：

- 默认 `activeScope = 'edges'`

如果是纯 node selection：

- 默认 `activeScope = 'nodes'`

## 五、scope 切换的交互原则

scope 切换必须满足：

- 不改变真实 selection
- 不丢失 mixed selection
- 不触发 selection history 污染
- 只更新 toolbar 内部状态

用户应该感知为：

- “我还选中了这些对象”
- “我现在正在编辑其中的 nodes” 或 “我现在正在编辑其中的 edges”

而不是：

- “工具替我重新改了选区”

## 动作设计

## 一、selection-wide actions

以下动作始终针对完整 selection target：

- copy
- cut
- duplicate
- delete
- order
- lock / unlock
- zoom to selection

这些动作不受 active scope 影响。

## 二、scope-local actions

以下动作只针对 active scope target：

- align
- distribute
- group
- ungroup
- create frame
- node style edit
- edge style edit

例如：

- mixed selection 下，active scope 是 `nodes`，`align` 对 node 子集生效
- mixed selection 下，active scope 切到 `edges`，显示 edge line/color/marker/text mode

## 三、lock 的最终语义

`lock` 必须从 node-only 改为 selection-wide ref action。

也就是说：

- pure node: 锁 node
- pure edge: 锁 edge
- mixed: 同时锁当前 selection refs

同时，lock 状态应基于完整 selection 计算：

- `none`
- `mixed`
- `all`

这与当前 node-only lock context 完全不同。

## 四、group / ungroup 的最终语义

group / ungroup 必须显式绑定“当前结构作用子集”。

建议规则：

- `group` 只对当前 active node scope 生效
- `ungroup` 只对 active node scope 内完整命中的 exact groups 生效
- edge 不参与 group 基础能力判定

如果未来产品决定支持“group 内包含 edge relation”，也应在 command 语义层单独定义，而不是让 toolbar 继续依赖总选中数推导。

## 五、align / distribute 的最终语义

这两个动作必须只对 active node scope 生效。

规则建议：

- `align`: active node scope 中 node 数量 >= 2
- `distribute`: active node scope 中 node 数量 >= 3
- 不因 mixed selection 而消失
- 不因 selection 内含 edge 而整体失效

## `more` 的职责重定义

最终 `more` 只保留低频、次级或危险动作。

建议包括：

- copy
- cut
- paste
- duplicate
- layer
- create frame
- zoom to selection
- delete

不应再放在 `more` 里的动作：

- align
- distribute
- group
- ungroup
- lock

这些动作都应位于主 toolbar。

## 查询与渲染链路重构

## 一、Editor Query

删除：

- `query.read.selection.nodeToolbar`
- `query.read.edge.toolbar`

新增：

- `query.read.selection.toolbar`

它是唯一来源。

## 二、Editor Facade

panel 中删除：

- `nodeToolbar`
- `edgeToolbar`

新增：

- `selectionToolbar`

panel facade 最终不应暴露两个互斥 toolbar 槽位。

## 三、React 顶层组件

删除顶层并行渲染：

- `NodeToolbar`
- `EdgeToolbar`

新增统一组件：

- `SelectionToolbar`

它内部根据 active scope 渲染对应 panel。

## 四、Toolbar Item Registry

需要直接重建 item key 和 panel key。

当前 item registry 是 node-centric 的，长期不适合继续扩展。

建议以 unified item spec 重新定义，而不是在旧 registry 上不断追加条件分支。

## 需要删除的中间层

以下中间层在最终架构中不应保留：

- `NodeToolbarContext`
- `NodeToolbarFilter`
- node-only `resolveSelectionToolbar`
- 独立的 `createEdgeToolbarRead`
- panel facade 中的 `nodeToolbar`
- panel facade 中的 `edgeToolbar`
- 顶层 `NodeToolbar.tsx`
- 顶层 `EdgeToolbar.tsx`
- 当前“filter = selection.replace(...)”语义
- `locked !== 'none' => groupRecipe` 的 recipe 退化策略
- 仅按 `ToolbarSelectionKind` 决定 toolbar 主体的模板体系

## 最终只保留的核心层

最终只应保留：

- `SelectionToolbarContext`
- `SelectionToolbarScope`
- `SelectionToolbarCapabilities`
- `SelectionToolbarPresentation`
- `query.read.selection.toolbar`
- `panel.selectionToolbar`
- `SelectionToolbar` 顶层 React shell
- unified toolbar item registry
- node / edge style panel 作为 scope-specific 子面板

## 直接落地顺序

虽然本方案不做兼容，但仍建议按下面顺序实施，以避免重构过程中语义打架。

### 1. 先定义新类型系统

先建立：

- `SelectionToolbarContext`
- `SelectionToolbarScope`
- `SelectionToolbarCapabilities`
- `SelectionToolbarPresentation`

并删掉旧的 node-only toolbar type。

### 2. 重写 query 侧 toolbar 生成

直接用 selection target 生成统一 toolbar context。

这一层完成后：

- mixed selection 应当首次成为合法输入
- node / edge / mixed 都从同一个入口进入

### 3. 重写 panel facade

把 panel toolbar surface 收敛到一个字段：

- `selectionToolbar`

### 4. 重写顶层 toolbar shell

用统一 `SelectionToolbar` 替代两个并行 toolbar 组件。

### 5. 重建 item registry

按 unified model 重建：

- `scope`
- `align`
- `distribute`
- `group`
- node style items
- edge style items
- `lock`
- `more`

### 6. 改写 action 语义

保证：

- selection-wide action 走 full target
- scope-local action 走 active scope target

### 7. 删除旧系统

删除所有旧字段、旧组件、旧 recipe、旧 registry 分支，不保留死代码。

## 验收标准

最终应满足以下结果：

### 1. mixed selection 一定有 toolbar

以下场景均需显示：

- `2 nodes + 1 edge`
- `1 node + 3 edges`
- `group node + edge`

### 2. mixed selection 默认可见结构动作

只要 active scope 有可操作 node 子集，就应显示：

- align
- distribute
- group / ungroup

### 3. edge 编辑能力可从 mixed selection 内进入

用户不必重选 edge，就能从 scope 切换到 edge 编辑。

### 4. scope 切换不改 selection

切换 scope 后：

- 画布选区不变
- selection history 不变
- 只变更 toolbar 内部编辑焦点

### 5. lock 语义统一

`lock` 对纯 node、纯 edge、mixed selection 的行为一致且可预测。

### 6. locked selection 不再退化成极简 toolbar

锁只影响对应 action 的 enabled state，不再粗暴切 recipe。

## 不建议的替代方案

以下方向都不建议采用：

### 1. 放宽 `pureNodeSelection` 判断，让 mixed selection 继续走 node toolbar

问题：

- 只是把 edge 塞进 node-centric model
- `lock`、`filter`、style 能力仍然会错

### 2. 保留三套 toolbar：node / edge / mixed

问题：

- 会把当前二分裂变成三分裂
- 规则只会更难维护

### 3. 继续让 filter 改真实 selection

问题：

- mixed selection 体验被破坏
- 真实 selection 与编辑焦点混为一谈

### 4. 继续把结构动作放在 `more`

问题：

- 高频动作进入二级菜单，效率太差
- toolbar 失去作为“结构操作主入口”的意义

## 总结

这个问题的根因不是“mixed selection 少了一个 toolbar case”，而是当前 toolbar 从模型到渲染都不是 selection-first。

长期最优解只有一个：

- 用统一 `SelectionToolbar` 取代 `nodeToolbar + edgeToolbar`
- 用 `scope` 取代 node-only filter
- 用 selection-wide / scope-local 双层 action model 取代当前 node-centric action model
- 把结构动作提升为主 toolbar 一等能力

这条路虽然是重构，但它能一次性解决：

- mixed selection 无 toolbar
- filter 无法处理 edge
- 结构动作入口过深
- lock 语义不完整
- recipe 对 locked / mixed 的退化过粗

并且它会成为后续所有 selection chrome、style editing、group 语义、lock 语义的唯一稳定基础。
