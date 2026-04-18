# Whiteboard Editor Query P0 最终方案：Edge Label 轻量测量与 Query 去副作用

## 1. 目标

这份文档只定义一件事：

- `edge label` 的文本测量如何做到长期最优。

这里的“长期最优”不是继续优化当前的 DOM 精确测量链，而是直接改正语义：

- `edge label` 不是 node。
- `edge label` 不需要 node 那种精确 box。
- `edge label` 需要的是稳定、便宜、可缓存的摆放尺寸。

因此 P0 的最终目标有且只有四条：

1. `query` 不再同步测量 DOM。
2. `edge label` 不再走 node 那套精确 text box 模型。
3. `edge label` 的稳态成本尽量接近 0。
4. `createEditorQuery()` 不再依赖 `layout`。

## 2. 最终判断

## 2.1 为什么不能继续沿用 node text 方案

`node text` 和 `edge label` 的需求根本不同。

`node text` 需要：

- 精确 outer size
- wrap / widthMode
- transform box
- selection box
- resize / auto grow / relayout

`edge label` 不需要这些。

`edge label` 真正需要的只有：

- 一个稳定的 `width`
- 一个稳定的 `height`
- 一个可用于遮线的 `maskRect`
- 一个可用于 path 摆放的 `placement size`

所以如果继续让 `edge label` 走：

- `layout.measureText()`
- `getBoundingClientRect()`
- 真实 DOM typography source
- 精确 frame / inset / outer box

那么不是“通用”，而是明显过度设计。

## 2.2 最终语义

`edge label` 统一采用下面这套语义：

- 单行文本
- 不换行
- 不参与 document layout
- 不反推 node-like 几何
- 不要求像 node 一样 pixel-perfect

它的尺寸语义改成：

- `width`：用于 placement 和 mask 的近似稳定宽度
- `height`：由 typography 常量直接推导的稳定高度

只要这两个量稳定，就足够支撑：

- render
- drag
- edit
- mask

## 2.3 最终测量策略

`edge label` 的最终测量策略必须是：

1. 非编辑态不测 DOM
2. 编辑态也尽量不测 DOM
3. 默认走复用 `canvas context` 的文本宽度测量
4. 高度直接按 typography 规则推导
5. 最终尺寸做整数化与最小容错
6. mask 再单独加固定 bleed

换句话说，`edge label` 的“测量”本质上是：

- `measureText() on canvas`
- 加上少量固定 padding / bleed / rounding

而不是：

- 构造 DOM
- 应用样式
- `getBoundingClientRect()`
- 读取真实排版盒

## 3. 最终架构

P0 后，owner 明确分三层：

- engine：拥有 edge path / geometry
- layout：拥有轻量文本 metrics cache
- query.edge.label：拥有 content / metrics / placement / render

明确不允许的职责：

- query 不测量文字
- React 不拥有 label metrics 真正状态
- document 不存 edge label computed size

## 4. 最终 API

## 4.1 Layout API

`EditorLayout` 不再暴露通用的 `measureText()` 给 query 直接调用，统一改成 `text` 命名空间。

```ts
export type TextMetricsSpec = {
  profile: 'default-text' | 'sticky-text' | 'edge-label' | 'frame-title' | 'shape-label'
  text: string
  placeholder: string
  fontSize: number
  fontWeight?: number | string
  fontStyle?: string
}

export type TextMetrics = {
  width: number
  height: number
}

export type EditorLayout = {
  text: {
    read: (spec: TextMetricsSpec) => TextMetrics | undefined
    ensure: (spec: TextMetricsSpec) => TextMetrics
    ensureMany: (specs: readonly TextMetricsSpec[]) => void
    clear: () => void
  }
  patchNodeCreatePayload: (payload: NodeInput) => NodeInput
  patchNodeUpdate: (
    nodeId: NodeId,
    update: NodeUpdateInput,
    options?: { origin?: Origin }
  ) => NodeUpdateInput
  editNode: (
    input: {
      nodeId: NodeId
      field: EditField
      text: string
    }
  ) => Partial<EditLayout> | undefined
  resolvePreviewPatches: (
    patches: readonly TransformPreviewPatch[]
  ) => readonly TransformPreviewPatch[]
}
```

### 为什么 `TextMetricsSpec` 要这么短

这里故意不把 node 的 `widthMode / wrapWidth / frame / minWidth / maxWidth` 放进来。

原因很明确：

- 这份 P0 方案只服务 `edge label`
- `edge label` 不需要这些字段
- 如果现在为了“通用”把这些字段继续塞回来，只会把重型模型偷偷带回 layout text 中轴

P0 先把 `edge label` 这条线拉直。

node 以后如果还要保留更重的测量需求，可以走：

- `layout.node.*`
- 或 `layout.text.block.*`

但不应污染这里这条轻量单行 metrics 中轴。

## 4.2 Layout 内部策略

`layout.text` 对外一套 API，内部按 `profile` 选择策略。

P0 只要求把 `edge-label` 收到轻量策略：

```ts
profile === 'edge-label'
  -> canvas single-line metrics
```

内部最终需要两个私有实现：

```ts
measureCanvasText(spec): TextMetrics
buildTextMetricsKey(spec): string
```

`measureCanvasText(spec)` 规则：

1. 选择 `text || placeholder`
2. 在全局复用的离屏 `canvas` 上设置 font
3. 用 `context.measureText(content).width` 读取宽度
4. 宽度做 `ceil`
5. 高度按固定 typography 推导：
   - `height = ceil(fontSize * lineHeight)`
6. 返回整数尺寸

这里的 `lineHeight` 不从 DOM 读，直接由 profile 常量提供。

例如：

```ts
EDGE_LABEL_LINE_HEIGHT = 1.4
EDGE_LABEL_MASK_BLEED = 4
```

## 4.3 Query Edge Label API

P0 后，`edge` 读模型新增 `label` 命名空间：

```ts
export type EdgeLabelRef = {
  edgeId: EdgeId
  labelId: string
}

export type EdgeLabelContent = {
  ref: EdgeLabelRef
  text: string
  displayText: string
  editable: boolean
  caret?: Extract<NonNullable<EditSession>, { kind: 'edge-label' }>['caret']
  style: NonNullable<Edge['labels']>[number]['style']
  textMode: NonNullable<Edge['textMode']>
  t: number
  offset: number
  metrics: TextMetricsSpec
}

export type EdgeLabelPlacement = {
  point: Point
  angle: number
  size: Size
  maskRect: EdgeLabelMaskRect
}
```

```ts
edge.label.list(edgeId): readonly EdgeLabelRef[]
edge.label.content(ref): EdgeLabelContent | undefined
edge.label.metrics(ref): Size | undefined
edge.label.placement(ref): EdgeLabelPlacement | undefined
edge.label.render(ref): EdgeLabelRender | undefined
```

每一层只做一件事：

- `content(ref)`：文本、edit draft、placeholder、metrics spec
- `metrics(ref)`：从 layout cache 读轻量 metrics，并转成 placement size
- `placement(ref)`：用 path + metrics 算 point / angle / maskRect
- `render(ref)`：最终组装给 React

## 4.4 Render API 保持稳定

`edge.render(edgeId)` 保留，但只做聚合，不做测量：

```ts
edge.render(edgeId) = {
  ...edge.view(edgeId),
  selected,
  box,
  labels: edge.label.list(edgeId)
    .map(edge.label.render)
    .filter(Boolean)
}
```

这一步的核心约束是：

- path 变了，只重算 placement
- selection 变了，只重算 runtime
- text/style 变了，才可能重算 metrics

## 5. 关键语义

## 5.1 `edge.label.metrics(ref)` 返回什么

`edge.label.metrics(ref)` 不返回“原始 canvas 宽高”，而是返回最终用于摆放的尺寸。

也就是：

```ts
raw canvas metrics
  -> resolveEdgeLabelPlacementSize(...)
  -> placement size
```

这样 query 外部永远只面对一个尺寸语义，不需要区分：

- raw text size
- placement size
- mask size

外部只关心 label 在 edge 上该占多大。

## 5.2 mask 如何保证稳定

`edge label` 不要求像 node 一样精确 box，因此 `maskRect` 不应该追求和文本 DOM 一模一样。

正确做法是：

- `placement size` 保持稳定
- `maskRect` 在此基础上加固定 bleed

例如：

```ts
maskWidth = labelWidth + bleed * 2
maskHeight = labelHeight + bleed * 2
```

这样带来的好处：

1. 即使文字宽度和真实 DOM 相差 1 到 2 px，线也不会从边缘漏出来
2. 不需要为了抠一个极其精确的 mask 再回去测 DOM
3. 编辑态和非编辑态更容易保持视觉稳定

## 5.3 编辑态是否需要精确 DOM box

P0 的最终判断是：不需要。

只要 `edge label` 保持单行编辑，编辑态也可以继续复用同一套轻量 metrics。

这意味着：

- 输入字符时重新 `ensure(spec)`
- 不需要单独给编辑态再建一套 DOM 精确测量旁路

如果未来产品真要支持：

- 多行 edge label
- 富文本 edge label
- 自定义 padding / frame

那是新的产品语义，届时再开新模型；不应该反向污染当前这一条单行 label 主线。

## 6. 实施步骤

### 6.1 第一步：layout/runtime 建立轻量 metrics cache

修改文件：

- `whiteboard/packages/whiteboard-editor/src/layout/runtime.ts`
- `whiteboard/packages/whiteboard-editor/src/types/layout.ts`

具体实现：

1. 新增 `TextMetricsSpec` / `TextMetrics`
2. 在 `createEditorLayout()` 内维护：
   - 一个全局复用的离屏 `canvas`
   - 一个 `Map<string, TextMetrics>`
3. 实现：
   - `text.read(spec)`
   - `text.ensure(spec)`
   - `text.ensureMany(specs)`
   - `text.clear()`
4. `buildTextMetricsKey(spec)` 只包含：
   - `profile`
   - `text`
   - `placeholder`
   - `fontSize`
   - `fontWeight`
   - `fontStyle`

这里没有 `source`，也没有 `frame`。

### 6.2 第二步：query/edge/read.ts 拆 label 中轴

修改文件：

- `whiteboard/packages/whiteboard-editor/src/query/edge/read.ts`

必须新增：

1. `edge.label.list`
2. `edge.label.content`
3. `edge.label.metrics`
4. `edge.label.placement`
5. `edge.label.render`

必须删除：

- `readEdgeLabelRender(..., layout)` 这种“内容 + 测量 + placement”混在一起的旧函数

### 6.3 第三步：createEditorQuery() 去掉 layout 依赖

修改文件：

- `whiteboard/packages/whiteboard-editor/src/query/index.ts`
- `whiteboard/packages/whiteboard-editor/src/editor/createEditor.ts`

最终形态：

```ts
const query = createEditorQuery({
  engineRead: engine.read,
  registry,
  history: engine.history,
  session,
  defaults: defaults.selection
})
```

这一步必须完成，因为 P0 的核心就是把 query 从副作用与测量能力里拉出来。

### 6.4 第四步：把 metrics 预热点收回 editor 侧

修改文件：

- `whiteboard/packages/whiteboard-editor/src/editor/createEditor.ts`
- `whiteboard/packages/whiteboard-editor/src/action/index.ts`
- `whiteboard/packages/whiteboard-editor/src/write/edge.ts`
- `whiteboard/packages/whiteboard-editor/src/input/features/edge/label.ts`

#### A. editor 创建时预热 committed labels

在 `createEditor()` 中：

```ts
layout.text.ensureMany(allCommittedEdgeLabelSpecs)
```

目的：

- 首屏已有 label 时，尽量避免第一次 render miss

#### B. 编辑输入时预热当前 draft

在 `action/index.ts` 的 edit input 流程中：

```ts
if (current.kind === 'edge-label') {
  layout.text.ensure(specForDraft)
}
```

要求：

- 只预热当前正在编辑的 label
- 不把尺寸写回 edit session
- edit session 仍只保留 draft text / caret / composing 等真正编辑态数据

#### C. write.edge.label.* 要预热

在 `write/edge.ts` 中：

- `label.add(edgeId)`：预热默认空 label 的 metrics
- `label.patch(edgeId, labelId, patch)`：如果影响文本显示，预热新 metrics

这样可以覆盖：

- 外部命令式 patch
- 工具栏改文本样式
- 刚新增 label 马上显示

#### D. drag 起点允许一次单点 fallback

在 `input/features/edge/label.ts`：

1. 优先读 `query.edge.label.metrics(ref)`
2. miss 时再读 `query.edge.label.content(ref)`
3. 用 `layout.text.ensure(spec)` 补一次

这是 P0 唯一允许保留的 imperative fallback，因为：

- 它只发生在单个 label 的交互起点
- 它不在 render 热路径
- 它可以兜底所有漏预热情况

## 7. 旧接口与旧实现必须删除

P0 完成后，下面这些必须删掉，不留兼容：

1. `EditorLayout.measureText`
2. `createEdgeRead(..., layout)`
3. `createEditorQuery(..., layout)`
4. `query/edge/read.ts` 内基于 `layout.measureText()` 的 label render 路径
5. `input/features/edge/label.ts` 自己重复拼一套独立测量参数

最终只允许存在一条中轴：

```ts
build edge-label metrics spec
  -> layout.text.read / ensure
  -> edge.label.metrics
```

## 8. 性能收益

P0 做完后，`edge label` 的成本结构会变成：

### 高频路径

- path 变化
- selection 变化
- hover 变化
- drag 变化

这些都只重算：

- runtime
- placement

不会重测文本。

### 低频路径

- text 改变
- fontSize 改变
- fontWeight 改变
- fontStyle 改变

这些才重算：

- metrics

而且 metrics 的实现只是：

- `canvas.measureText`
- 常量高度推导
- cache 写入

这会比现有 DOM 精确测量便宜一个量级，而且更稳定。

## 9. 验收标准

P0 完成后，必须满足：

1. `rg "measureText\\(" whiteboard/packages/whiteboard-editor/src/query`
   结果为 0

2. `createEditorQuery()` 不再接收 `layout`

3. `createEdgeRead()` 不再接收 `layout`

4. `edge label` 的非编辑态 render 不再触发 DOM 同步测量

5. `edge label` 的编辑态输入只更新当前 label 的 metrics cache

6. path / selection / drag 不会导致 metrics 失效

7. `maskRect` 由 `placement size + bleed` 推导，不再依赖真实 DOM box

## 10. 为什么这是长期最优

这份方案的关键不是“缓存更多”，而是先把模型改对。

长期最优点在于：

1. `edge label` 不再被迫复用 node text 的重型语义
2. `query` 重新变回纯读层
3. `layout.text` 变成真正可复用的轻量单行文本 metrics 中轴
4. render、edit、drag 全部共享同一套 metrics source
5. 未来如果还要给 edge marker label、small badge、inline chip 等单行文本接同一套模型，可以直接复用

最重要的是，这条线做完后，`edge label` 的稳态成本会非常低：

- 大部分时候只在重算 placement
- 只有文本变化时才重新测量
- 测量也不再依赖 DOM

这才是 `edge label` 这类产品语义真正应该有的复杂度。
