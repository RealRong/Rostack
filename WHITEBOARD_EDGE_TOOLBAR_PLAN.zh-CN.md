# Whiteboard Edge Toolbar 方案

## 目标

为 edge 提供一套长期可维护、边界清晰、实现最简单的 toolbar 方案，覆盖以下能力：

- `line start`
- `switch start end`
- `line end`
- `line type`
- `color`
- `edge label`
- `text position`

前提约束：

- 不做兼容层
- 不把 edge 再塞回 node-only 的 selection toolbar 语义里
- 优先长期最优，不优先低改动

## 当前现状

### 现有能力

- edge 文档模型已经有足够字段：
  - `Edge.type`
  - `Edge.style.stroke`
  - `Edge.style.markerStart`
  - `Edge.style.markerEnd`
  - `Edge.labels`
- edge 渲染层已经支持：
  - 颜色
  - 线宽
  - dash
  - marker start / end
- edge 工具预设已经存在：
  - `edge.straight`
  - `edge.elbow`
  - `edge.curve`
- 右键菜单已经有 edge 专属菜单，但只有复制、剪切、复制一份、删除、层级

### 当前缺口

- toolbar 体系现在只支持纯 node selection
  - `editor.read.selection.toolbar` 在 `summary.items.edgeCount > 0` 时直接返回 `undefined`
- `NodeToolbar` 本质上是 node toolbar，不是 selection toolbar
- edge 现在没有 editor 语义层的 toolbar read model
- edge 也没有 editor 语义层的样式命令包装，React 侧如果直接调 `edge.update`，边界会越来越差
- `Edge.labels` 虽然在方案里已经明确需要支持，但 React 侧还没有渲染和编辑入口
- `markerStart` / `markerEnd` 现在是字符串，直接泄漏了 SVG marker 细节到文档模型，不是长期最优

## 结论

### 结论一

不要把 edge toolbar 建在现在的 `SelectionToolbarContext` 上。

原因很直接：

- 这个 context 当前是 node 样式聚合模型
- 字段命名、可编辑能力、recipe、panel 都是 node-first
- 如果把 edge 继续塞进去，会得到一个巨大、混杂、不断加分支的 presentation model

长期最优是：

- node toolbar 和 edge toolbar 拆开建模
- chrome 层只保留一个宿主
- 宿主根据 read model 渲染 node 或 edge toolbar

### 结论二

edge toolbar 应该是 editor 层的 presentation read，而不是 React hook 里临时拼装。

应该新增：

- `editor.read.edge.toolbar`

不应该继续扩张：

- `editor.read.selection.toolbar`

### 结论三

edge toolbar 的写入也应该是 editor 语义命令，不应该让 React 到处直接拼 `edge.update(...)` patch。

应该新增一组 editor 语义命令，隐藏底层 patch 细节。

## 交互范围

### 什么时候显示

只在以下条件全部满足时显示：

- 当前工具是 `select`
- 当前 `interaction.chrome === true`
- 当前不处于 edge 路由/重连/拖动中
- 当前 selection 是纯 edge selection

### edge 与 edge label 的点击语义

这里必须把 edge body 和 edge label 视为同一个 selection owner。

规则：

- 第一次点击 edge body：选中 edge，显示 edge toolbar
- 第一次点击 edge label：同样选中 edge，显示 edge toolbar
- 已经选中 edge 后，再点击 label：进入 label 编辑态
- 已经处于该 label 编辑态时，再点 toolbar 上的 `label` 按钮：无操作

也就是说：

- label 可以单独被 hit / pick
- 但 label 的所属 selection 仍然是 edge
- label 不是独立 node，也不是独立 selection 实体

这是最符合你描述的 Miro 语义的：

- 第一次点击只是选中 edge
- 第二次明确点 label 才是编辑文本

### 单选和多选策略

长期最简且实用的方案：

- 单选 edge：显示完整 toolbar
- 多选纯 edge：只显示可批量编辑的样式项
- mixed selection：不显示 edge toolbar
- 只要 selection 内有 node，就完全回到 node toolbar / 无 toolbar 语义，不做混合 toolbar

补充一条编辑态规则：

- 一旦进入 edge label 编辑态，toolbar 不再显示 edge toolbar，而是切换到 text toolbar

### 单选 edge toolbar 包含的项

- `line start`
- `switch start end`
- `line end`
- `line type`
- `color`
- `label`
- `text position`

### 多选 edge toolbar 包含的项

- `line start`
- `line end`
- `line type`
- `color`

多选时不显示：

- `switch start end`
- `label`
- `text position`

原因：

- `switch start end` 是单条 edge 的样式交换语义
- `label` 是单条 edge 的文本创建/编辑入口语义
- `text position` 是整个 edge 上所有 labels 的展示语义
- 这两个批量化后复杂度明显上升，但收益很低

## Toolbar 具体形态

建议形态：

- 一条紧凑浮动条
- 尽量少开 panel
- 只有需要更多输入的项才开 popover panel

推荐布局：

1. `line start`
2. `switch start end`
3. `line end`
4. 分割线
5. `line type`
6. `color`
7. 分割线
8. `label`
9. `text position`

### `line start`

按钮打开一个很小的 marker panel。

第一期只支持：

- `none`
- `arrow`

这已经覆盖绝大多数白板使用场景。

不建议第一期支持：

- 菱形
- 圆点
- 自定义 SVG marker

原因：

- 现在的数据模型还是裸字符串
- 如果先开放任意 marker，会把 UI 和 SVG 细节绑死

### `switch start end`

中间一个独立按钮，语义是“交换起点和终点的 marker 样式”。

这是纯样式操作，不是拓扑操作。

- 只交换 `markerStart` / `markerEnd`
- 不交换 `source` / `target`
- 不反转 route points
- 不修改 `label.position`
- 不改变 edge 的方向语义

如果按命名精确性看，这个按钮更准确的名字其实应该是：

- `swap markers`
- 或 `swap start/end style`

如果产品层继续展示为 `switch start end`，也应该在实现文档里明确它只是样式交换，而不是反转 edge。

### `line end`

和 `line start` 完全对称。

### `line type`

点击后打开一个 popover panel。

panel 从上到下固定为三段：

1. `line type`
2. `line style`
3. `line width`

#### `line type`

第一行是 type segmented control：

- `straight`
- `elbow`
- `curve`

长期最优不要再保留一层对外映射，领域命名直接统一成：

- `straight`
- `elbow`
- `curve`

也就是说：

- UI 用 `straight | elbow | curve`
- editor 用 `straight | elbow | curve`
- core 文档模型也用 `straight | elbow | curve`
- 真正的路径路由实现如果内部想继续叫 `linear router` / `step router`，那只是实现细节，不进入类型系统和跨层 API

这样最干净，因为现在的 `linear` 和 `step` 更像实现命名，不像产品命名。

如果强调行业常规，我建议保留：

- `straight`
- `elbow`
- `curve`

原因：

- whiteboard / diagram 工具面向用户时，`straight` 最自然
- `elbow` 比 `step` 更像连接线类型名，而不是路径算法名
- `curve` 也比 `curved` 更适合作为稳定的类型值

`step` 的问题是它更像“折线路由算法”术语，不像用户会直接理解的 connector type。

`orthogonal` 虽然在专业图编辑器里也常见，但对白板产品来说比 `elbow` 更技术化，所以这里不建议换成 `orthogonal`。

#### `line style`

第二行是 style segmented control：

- `solid`
- `dashed`
- `dotted`

映射到文档层：

- `solid -> dash = undefined`
- `dashed -> dash = [8, 6]`
- `dotted -> dash = [2, 4]`

#### `line width`

第三行是 `line width slider`。

第一期直接控制：

- `Edge.style.strokeWidth`

不把 opacity、animation、更多高级样式塞进这个 panel，先把核心链路做干净。

### `color`

`color` 继续单独一个按钮，打开简单色板 panel。

这里只负责：

- `stroke color`

不要把 width / dash 再塞到 color panel 里，因为这两项已经归到 `line type` panel。

实现上建议复用现有色板原语，但不要复用整个 node `BorderPanel`。

- 提取一个通用 `ColorPanel`
- node stroke / fill 和 edge color 都复用这个 panel

### `label`

单选时显示一个 label 按钮：

- 如果当前已经聚焦在这个 edge 的某个 label 文本框：点击按钮无反应
- 其他情况：在 edge 中部创建一个新的 label，并直接进入编辑态

这个按钮不再打开 label panel。

进入编辑态后：

- toolbar 从 edge toolbar 切换为 text toolbar
- 这个 text toolbar 服务的是当前 edge label 文本，而不是 node text

label 的长期交互定义：

- 默认创建在 edge 中部
- label 可以拖拽
- 拖拽必须沿着 edge path 进行
- 拖拽过程中自动更新 label 所在 path 参数位置
- `textMode === 'tangent'` 时，当前 label rotation 自动跟随 path 切线方向
- `textMode === 'horizontal'` 时，当前 label 始终保持水平
- 用户不直接拖一个自由世界坐标点，而是拖动“沿线位置”

也就是说，label 的核心语义不是“漂浮在 edge 附近的自由文本”，而是“附着在 edge path 上的文本标注”。

### `text position`

这是一个单独的 toolbar 项，只在单选 edge 时出现。

它控制的不是 label 放在哪，而是这个 edge 上所有 label 的文字朝向模式。

两种模式：

- `horizontal`
- `tangent`

定义：

- `horizontal`
  - 文本始终保持水平
  - 只跟随 `t + offset` 改变位置，不跟随 path 旋转
- `tangent`
  - 文本贴着线走
  - rotation 跟随当前 path 切线方向自动计算

这里的 `text position` 更接近“text orientation / text follow mode”，但如果产品层要叫 `text position` 也可以，文档里只要把语义说清楚即可。

## edge label 编辑态 toolbar

edge label 一旦进入编辑态，toolbar 应切换成 text toolbar，而不是继续停留在 edge toolbar。

这意味着长期最优不是“NodeToolbar”和“EdgeToolbar”两套完全隔离，而是：

- 几何/对象样式阶段：显示 edge toolbar
- 文本编辑阶段：显示 text toolbar

### 切换规则

- 选中 edge，但未编辑 label：显示 edge toolbar
- 正在编辑 edge label：显示 text toolbar
- 退出 label 编辑：回到 edge toolbar

### text toolbar 的来源

这里不要再把 text toolbar 绑定死为“text node toolbar”。

长期最优应该改成：

- `TextStyleToolbar`

它是一个共享文本样式 toolbar，可以服务：

- text node
- shape/sticky/frame 内文本
- edge label

Node 只是它的一个来源，不应该写死在概念上。

### edge label 编辑态下需要的 text toolbar 项

- `font size`
- `bold`
- `italic`
- `text color`
- `background color`

其中：

- `bold`
- `italic`
  - 作为直接按钮即可
- `background color`
  - 新增一个独立 panel
  - 用于控制 label 文本的背景底色

如果要和现有 text node toolbar 对齐，长期最优是把这几个项统一到共享 text toolbar 体系里，而不是给 edge label 单独做一套文本样式按钮。

### label 几何规则

长期最优不再保留 `position`，也不再保留自由 `Point` 位移。

建议直接收敛为：

```ts
type EdgeLabel = {
  id: string
  text?: string
  t?: number
  offset?: number
  style?: {
    size?: number
    weight?: number
    italic?: boolean
    color?: string
    bg?: string
  }
}
```

其中：

- `t` 表示 label 在 edge path 上的归一化位置，范围 `[0, 1]`
- `offset` 表示相对当前 path 法线方向的短距离偏移
- `offset` 必须做小范围 clamp，例如 `[-16, 16]`
- 默认创建时使用 `t = 0.5`、`offset = 0`
- `id` 用于精确标识某一个 label，支撑 pick、编辑态和命令定位

这个 edge 的文字朝向模式不挂在 label 上，而是挂在整个 edge 上：

```ts
type EdgeTextMode = 'horizontal' | 'tangent'
```

建议默认：

- `horizontal`

rotation 只在 `tangent` 模式下由 path 几何导出：

- `horizontal` 时 rotation 固定水平
- `tangent` 时 rotation 完全由当前 path 切线导出
- path 变化后自动重算

## 锚点与布局

### 单选 edge

toolbar 锚点直接使用 edge box 的顶边中心。

这里不需要再做 label anchor / path center 的额外优先级逻辑。

理由：

- 规则最简单
- 行为稳定
- 视觉预期明确
- 实现成本最低

### 多选 edge

多选同样直接使用 selection bounds top center。

## 最终 API 定稿

### 文档层

长期最优直接收成下面这套，不再保留旧命名：

```ts
type EdgeType = 'straight' | 'elbow' | 'curve' | (string & {})

type EdgeMarker = 'none' | 'arrow'

type EdgeDash = 'solid' | 'dashed' | 'dotted'

type EdgeTextMode = 'horizontal' | 'tangent'

type EdgeLabelId = string

type EdgeLabelStyle = {
  size?: number
  weight?: number
  italic?: boolean
  color?: string
  bg?: string
}
```

`Edge.labels` 建议直接收敛为：

```ts
type EdgeLabel = {
  id: EdgeLabelId
  text?: string
  t?: number
  offset?: number
  style?: EdgeLabelStyle
}
```

原因：

- `t` 负责“沿线位置”
- `offset` 负责“在线法线方向上的短距离偏移”
- `style` 负责具体 label 的文本样式
- `id` 负责具体 label 的身份
- 这正好对应“整体沿着 edge，但可稍微放在线的上/下/左/右”的交互

`textMode` 则建议挂在整个 edge 上，而不是挂在 label 上：

```ts
type Edge = {
  ...
  type?: EdgeType
  style?: {
    color?: string
    width?: number
    dash?: EdgeDash
    start?: EdgeMarker
    end?: EdgeMarker
  }
  textMode?: EdgeTextMode
  labels?: EdgeLabel[]
}
```

这样定义的好处是：

- 语义上更准确
- 多个 label 是一等公民，不再是假设单 label
- `textMode` 天然作用于整个 edge 的所有 labels
- toolbar 操作的是 edge 对象，不需要穿透到某个 label 字段

不建议继续保留：

- `position`
- `offset: Point`
- `markerStart`
- `markerEnd`
- `stroke`
- `strokeWidth`
- `textMode`

因为这两者都会把语义重新拉回“预设锚点 + 自由漂移”，和目标交互是冲突的。

### Editor 读取 API

新增且只保留：

```ts
editor.read.edge.toolbar
```

建议类型：

```ts
type EdgeToolbar = {
  key: string
  ids: readonly EdgeId[]
  box: Rect
  type?: EdgeType
  color?: string
  width?: number
  dash?: EdgeDash
  start?: EdgeMarker
  end?: EdgeMarker
  textMode?: EdgeTextMode
  labels: number
}
```

为什么只留这些字段：

- `key`
  - 供 toolbar 稳定判断 selection session
- `ids`
  - 足够区分单选和多选
- `box`
  - toolbar 锚点直接由 box 顶边中心导出
- `type / color / width / dash / start / end / textMode`
  - 正好覆盖 edge toolbar 需要的全部值
- `labels`
  - 只关心 label 数量，不把 label 详情塞进 edge toolbar context

不再保留：

- `mode`
- `primaryEdgeId`
- `anchorWorld`
- `canFlip`
- `canEditLabel`

这些都能从现有字段和交互上下文直接推导，继续保留只会增大 API 面积。

进入 label 编辑态后，edge toolbar 不再驱动当前 toolbar。

那时应直接切到共享 text toolbar 的 read model，不新增第二套 edge text read。

### Editor 写入 API

最终只保留下面这组：

```ts
editor.commands.edge.patch(ids, patch)
editor.commands.edge.swapMarkers(id)
editor.commands.edge.labels.add(edgeId)
editor.commands.edge.labels.edit(edgeId, labelId)
editor.commands.edge.labels.patch(edgeId, labelId, patch)
editor.commands.edge.labels.remove(edgeId, labelId)
```

其中：

- `edge.patch`
  - 负责 edge toolbar 的对象级修改
- `edge.swapMarkers`
  - 单独保留，因为它不是普通 patch，而是交换 `start` / `end`
- `edge.labels.add`
  - 创建一个新的中心 label 并进入编辑
- `edge.labels.edit`
  - 聚焦某个现有 label 并进入编辑
- `edge.labels.patch`
  - 承载 label 文本、几何、样式的全部更新
- `edge.labels.remove`
  - 删除指定 label

`edge.patch` 的最终结构：

```ts
editor.commands.edge.patch(ids, {
  type?: EdgeType
  textMode?: EdgeTextMode
  style?: {
    color?: string
    width?: number
    dash?: EdgeDash
    start?: EdgeMarker
    end?: EdgeMarker
  }
})
```

`edge.labels.patch` 的最终结构：

```ts
editor.commands.edge.labels.patch(edgeId, labelId, {
  text?: string
  t?: number
  offset?: number
  style?: EdgeLabelStyle
})
```

`edge.labels.add(edgeId)` 的产品语义要固定：

- 如果当前已经在编辑这个 edge 的某个 label：无操作
- 其他情况：总是创建一个新的中心 label
- 新 label 默认 `t = 0.5`，`offset = 0`
- 创建后立即进入这个新 label 的编辑态

`edge.labels.edit(edgeId, labelId)` 的语义则是：

- 聚焦并开始编辑指定 label

`textMode` 的默认值建议固定为：

- `horizontal`

为什么不要只暴露 `edge.update` 给 UI：

- `edge.update` 太底层
- UI 不应该知道旧字段兼容、数组替换、label 定位这些细节
- `patch / add / edit / remove / swapMarkers` 已经足够覆盖全部交互，而且更短更清楚

### 共享 text toolbar 的边界

edge label 进入编辑态后，不再新增一套专门的 edge text API。

长期最优是：

- edge 只负责 `labels.edit`
- 进入编辑态后，由共享 text toolbar 直接驱动当前 label 的 `labels.patch(..., { style })`

也就是说：

- edge toolbar API 只负责“选中 edge 时的对象编辑”
- text toolbar API 只负责“进入文本编辑后的文字样式编辑”

## 编辑状态的长期最优设计

现在 `EditTarget` 只支持 node：

```ts
{ nodeId, field: 'text' | 'title', caret }
```

这不够。

长期最优应该直接扩成实体级编辑状态：

```ts
type EditTarget =
  | {
      kind: 'node'
      nodeId: NodeId
      field: 'text' | 'title'
      caret: EditCaret
    }
  | {
      kind: 'edge'
      edgeId: EdgeId
      field: 'label'
      caret: EditCaret
    }
  | null
```

收益：

- node text edit 和 edge label edit 进入同一套 session 管理
- toolbar 隐藏逻辑统一
- 以后如果还有 connector label、group title，也不用再发明第二套编辑状态

这里再补一条：

- toolbar host 应根据 `EditTarget.kind` 和 `field` 判断是显示 edge toolbar 还是 text toolbar

## React 层结构

### 不建议继续保留的结构方向

不建议继续把 [`NodeToolbar`](./whiteboard/packages/whiteboard-react/src/features/selection/chrome/NodeToolbar.tsx) 当成唯一 toolbar 宿主长期扩张。

原因：

- 名字已经说明它是 node toolbar
- 现在 recipe、item registry、panel registry 都是 node-only
- edge 再并进去，只会变成一个巨大 switch 文件堆

### 推荐结构

chrome 层改成一个宿主：

- `SelectionToolbarHost`

内部按上下文分流：

- `NodeSelectionToolbar`
- `EdgeSelectionToolbar`
- `TextStyleToolbar`

其中：

- Node toolbar 继续走现有 recipe/item/panel 体系
- Edge toolbar 自己一套最小 registry
- Text toolbar 抽成共享文本样式 toolbar
- 两者只共享：
  - 定位逻辑
  - popover 宿主
  - panel primitives

### Edge toolbar React 最小组成

- `features/edge/toolbar/EdgeToolbar.tsx`
- `features/edge/toolbar/items.tsx`
- `features/edge/toolbar/panels/EdgeMarkerPanel.tsx`
- `features/edge/toolbar/panels/EdgeColorPanel.tsx`
- `features/edge/toolbar/panels/EdgeLinePanel.tsx`

### 共享 text toolbar 需要补的项

现有 text 类型 toolbar 还需要明确扩展：

- `bold`
- `italic`
- `background color`

其中 `bold`、`italic` 虽然按钮概念已经存在，但长期要确保这套 toolbar 能直接作用于 edge label，而不只是 node text。

`background color` 则需要新增 panel，并成为共享 text toolbar 的标准项。

不需要上来就做成 node toolbar 那种大而全 recipe 系统。

edge toolbar 项很少，第一期直接小型 registry 就够了。

## edge label 渲染方案

当前必须补一层渲染，否则 toolbar 的 `label` 只是空操作。

建议新增 `EdgeLabelItem`，职责明确：

- 遍历 `edge.labels` 渲染
- 每个 label 基于自己的 `t` 和 `offset` 计算位置
- `edge.textMode === 'horizontal'` 时保持水平
- `edge.textMode === 'tangent'` 时 rotation 跟随 path 切线自动计算
- pointer drag 时先投影到当前 path，再回写 `t`
- pointer drag 同时根据局部法线方向回写 `offset`
- `offset` 在交互层做 clamp，不能无限远离 edge
- 第一次点击 label 只选中 edge
- edge 已选中后再次点击 label 才进入编辑态
- 双击 label 进入 edge label edit session
- 每个 label 的 pick 语义独立于 edge body，并且必须携带 `labelId`

不建议把 label 作为 `EdgeItem` 里的一个 `text` 临时拼出来，长期会和 body pick、双击编辑、selection hit 纠缠在一起。

## 和现有代码的关系

### 应保留

- `editor.read.edge.item`
- `editor.read.edge.resolved`
- `editor.read.edge.state`
- edge overlay 里的 endpoint / route handle 逻辑
- toolbox 里的 edge preset 选择
- edge context menu

### 应新增

- `editor.read.edge.toolbar`
- editor 语义级 edge toolbar commands
- edge label 渲染
- edge label edit session
- edge toolbar React 组件
- 共享 `TextStyleToolbar`
- edge label 对接共享文本样式命令

### 不应继续扩张

- `editor.read.selection.toolbar`
- `SelectionToolbarContext`
- `NodeToolbar` 作为唯一 toolbar 宿主
- React 侧直接拼 `edge.update(...)`

## 分阶段实施方案

### Phase 1: 数据模型收口

目标：

- 把 edge 公共命名统一成一套
- 删除明显会持续制造映射噪音的旧字段

产出：

- `Edge.type -> straight | elbow | curve`
- `Edge.style -> { color, width, dash, start, end }`
- `Edge.textMode`
- `Edge.labels[]`
- `EdgeLabel -> { id, text, t, offset, style }`

完成标准：

- 文档层和 editor/core 公共类型不再同时出现两套命名
- 不再对外暴露 `markerStart / markerEnd / stroke / strokeWidth / textPosition`

### Phase 2: edge toolbar 主链路

目标：

- 先把选中 edge 时最核心的对象样式编辑跑通

产出：

- `editor.read.edge.toolbar`
- `editor.commands.edge.patch`
- `editor.commands.edge.swapMarkers`
- `EdgeSelectionToolbar`

覆盖能力：

1. `line start`
2. `switch start end`
3. `line end`
4. `line type`
5. `color`
6. `text position`

完成标准：

- 单选 edge 可以完整显示 edge toolbar
- 多选 edge 可以批量改 `type / color / width / dash / start / end`
- toolbar 锚点固定取 box 顶边中心

### Phase 3: 多 label 与画布交互

目标：

- 把 label 从“字段”变成真正可交互的实体

产出：

- `editor.commands.edge.labels.add`
- `editor.commands.edge.labels.edit`
- `editor.commands.edge.labels.patch`
- `editor.commands.edge.labels.remove`
- `EdgeLabelItem` 渲染
- label pick / drag / edit session

覆盖能力：

1. 点击 toolbar `label` 创建新 label
2. 第一次点 label 只选中 edge
3. edge 已选中后再次点 label 进入编辑
4. label 沿线拖拽
5. 法线小范围偏移
6. `textMode` 驱动 horizontal / tangent

完成标准：

- 一个 edge 可稳定承载多个 label
- 每个 label 有独立 `labelId`
- 每个 label 可被准确 pick / edit / remove

### Phase 4: 共享 text toolbar 接管编辑态

目标：

- 把 edge label 文本编辑并入统一文本体系

产出：

- `TextStyleToolbar`
- `background color` panel
- edge label 编辑态切换到共享 text toolbar

覆盖能力：

1. `font size`
2. `bold`
3. `italic`
4. `text color`
5. `background color`

完成标准：

- edge label 编辑态不再显示 edge toolbar
- text node 和 edge label 复用同一套 text toolbar
- text toolbar 最终只通过 `edge.labels.patch(..., { style })` 回写 edge label 样式

### Phase 5: 清理旧实现

目标：

- 删除过时概念，避免两套体系并存

产出：

- 删除旧 edge 字段适配
- 删除 React 侧直接拼 edge patch 的调用
- 删除不再需要的临时 bridge / helper / fallback

完成标准：

- 代码里只剩最终 API
- 没有兼容分支
- 没有中间态 mapping 层

## 最终裁决

长期最优方案不是“给现有 node toolbar 多加几个 edge 分支”，而是：

- editor 层新增 `edge.toolbar` presentation read
- editor 层只保留最小 edge API：`patch / swapMarkers / labels.add / labels.edit / labels.patch / labels.remove`
- 编辑状态升级为实体级
- React 层把 toolbar 宿主泛化，拆成 edge toolbar 和共享 text toolbar

这条路的结果最干净：

- 边界清楚
- UI 简单
- editor 负责语义
- React 负责渲染
- 后续扩展 edge label、更多 marker、edge style 时不会继续污染 node selection 模型
