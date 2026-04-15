# Whiteboard Node Layout 长期中轴方案

## 1. 结论

Whiteboard 的节点布局应该收敛为一条中轴：

- `core` 负责节点布局语义
- `editor` 负责何时重算、如何写回 document、如何给 edit / transform 提供统一结果
- `react` 只负责 Web 平台下的 DOM 测量 backend

最终只保留一个布局 runtime：

- 名字就叫 `layout`

最终只保留一组短 API：

- `NodeLayoutSpec`
- `LayoutRequest`
- `LayoutResult`
- `LayoutBackend`
- `LayoutRuntime`

最终只保留三种布局类型：

- `none`
- `size`
- `fit`

一句话总结：

`text` 负责“内容决定外框”，`sticky` 负责“外框决定字号”，`shape` 当前只负责“外框容纳标签但不自动拟合”；三者都走同一个 `layout` 中轴，不再把语义散落在 toolbar、renderer、hook、EditableSlot、transform session 里。

---

## 2. 目标

这套方案追求四件事：

1. 布局语义只在一处定义。
2. 所有写回 document 的 computed data 都由 editor 统一产出。
3. React 不再决定“要不要重算布局”，只负责“怎么测量”。
4. 旋转、缩放、编辑、toolbar 改字重字号等行为，全部走同一个布局入口。

明确不做的事：

- 不在 renderer 里 `useLayoutEffect + write.patch(...)` 自行修正文档
- 不让 toolbar 负责 sticky / text 的特殊补丁逻辑
- 不让 `EditableSlot` 自己决定测量语义
- 不让 transform session 维护一套独立于 editor 的文本布局规则
- 不再用 live node 的 `getBoundingClientRect()` 定义逻辑布局 box

---

## 3. 节点分类

从布局视角，当前节点应分成三类，而不是每个节点都发明一套独立机制。

| 节点 | layout kind | 外框来源 | 字号来源 | document 中的 computed 写回 |
| --- | --- | --- | --- | --- |
| `text` | `size` | 内容布局结果 | authored | `node.size` |
| `sticky` | `fit` | authored | `auto` 时为 layout，`fixed` 时为 authored | `node.style.fontSize` |
| `shape` | `none` | authored | authored | 无 |
| `frame` | `none` | authored | 无 | 无 |
| `draw` | `none` | authored / path bounds | 无 | 无 |
| `mindmap` | `none` | mindmap 自己的布局系统 | 自己管理 | 自己管理 |

这里最重要的两条：

- `text.size` 是 computed outer size cache，不是 authored height
- `sticky.style.fontSize` 是最终生效字号；它在 `auto` 模式下可以是 computed 值，在 `fixed` 模式下是 authored 值

这并不脏。document 里保存 computed data 很正常，关键是要把“来源模式”讲清楚，而不是强行要求所有字段都只承载 authored 含义。

---

## 4. 最终语义

## 4.1 `text`

`text` 的 authored inputs 只有这些：

- `position`
- `rotation`
- `data.text`
- `style.fontSize`
- `style.fontWeight`
- `style.fontStyle`
- `data.widthMode`
- `data.wrapWidth`

`text` 的输出只有一个：

- `size`

语义如下：

- `widthMode = 'auto'`
  - 宽度由内容决定
  - 高度由内容决定
  - 最终测量结果写回 `node.size`
- `widthMode = 'wrap'`
  - `wrapWidth` 是 authored
  - 高度由内容决定
  - 最终测量结果写回 `node.size`
- 左右 resize
  - 修改 `widthMode / wrapWidth`
  - 重新布局
  - 写回新的 `size`
- 四角 scale
  - 修改 `fontSize`
  - 如果起始为 `wrap`，同步修改 `wrapWidth`
  - 重新布局
  - 写回新的 `size`
- 上下 resize
  - 永远禁用

最核心的一条：

- `text.size.height` 永远不是 authored 值

## 4.2 `sticky`

`sticky` 的外框始终是 authored：

- `position`
- `rotation`
- `size`

`sticky` 的文本布局只解决一件事：

- 在给定的外框内容区里，最终应该显示多大字号

因此 `sticky` 必须有一个显式字段：

```ts
type FontMode = 'auto' | 'fixed'
```

建议放在：

- `node.data.fontMode`

规则如下：

- `fontMode = 'auto'`
  - `style.fontSize` 是最终生效字号
  - 这个值由 layout 计算并写回 document
  - `text`、`size`、`fontWeight`、`fontStyle` 变化时重算
  - `rotation` 变化时绝不重算
- `fontMode = 'fixed'`
  - `style.fontSize` 是 authored 值
  - 不走自动拟合

用户从 toolbar 或快捷键手动设置字号时：

- 如果当前是 `auto`
  - 直接切到 `fixed`
  - 把目标值写到 `style.fontSize`
- 如果当前是 `fixed`
  - 直接改 `style.fontSize`

用户如果想恢复自动拟合：

- 把 `data.fontMode` 设回 `auto`
- `layout` 立刻重新算一个新的 `style.fontSize`

这样 sticky 不需要额外引入 `computedFontSize`、`fitFontSize`、`resolvedFontSize` 之类的第二套字段，复杂度最低。

## 4.3 `shape`

`shape` 当前最合理的语义就是：

- 外框 authored
- 标签字号 authored
- label 只渲染，不自动回写布局结果

也就是：

- `shape` 当前保持 `layout.kind = 'none'`

原因很简单：

- 现在 shape label 没有“内容反推外框”
- 也没有“外框反推字号”的产品约束
- 它只是一个固定字体的内嵌标签

但长期上不要再为 shape 单独做一套 label layout 子系统。

如果未来有需求，例如：

- 圆形里的文字需要自动缩小
- 菱形里的标题需要自动 fit
- 不同 shape kind 的可用文本区不同

那也不要新增第四套机制，直接让 shape 切到同一条 `fit` 管线：

- 外框仍然 authored
- 内容区来自 `readShapeSpec(kind).labelInset`
- 字号通过 `layout.fit` 产出

也就是：

- `shape` 未来只是在同一个 `layout` 中轴里从 `none` 升级为 `fit`
- 不是新增 `shapeTextLayout`、`shapeLabelManager`、`useShapeAutoFont` 之类的旁路

---

## 5. 中轴 API

## 5.1 `NodeLayoutSpec`

节点定义层只需要一个极小的布局配置：

```ts
export type LayoutKind = 'none' | 'size' | 'fit'

export type NodeLayoutSpec = {
  kind: LayoutKind
}
```

建议把它挂到节点定义上：

```ts
export type NodeDefinition = BaseNodeDefinition & {
  layout?: NodeLayoutSpec
}
```

示例：

```ts
TextNodeDefinition.layout = { kind: 'size' }
StickyNodeDefinition.layout = { kind: 'fit' }
ShapeNodeDefinition.layout = { kind: 'none' }
```

这里故意不把 spec 做复杂。

不需要一开始就塞进去：

- `readInput`
- `buildKey`
- `readComputed`
- `shouldPatch`
- 一堆字段路径字符串

这些都应该留在 `core/node/layout.ts` 的中心 resolver 里，由它统一 switch，不要散落在很多小 helper 里。

## 5.2 `LayoutRequest`

`editor` 发给测量 backend 的请求只保留两种：

```ts
import type { NodeId, Size } from '@whiteboard/core/types'

export type LayoutRequest =
  | {
      kind: 'size'
      nodeId: NodeId
      text: string
      placeholder: string
      widthMode: 'auto' | 'wrap'
      wrapWidth?: number
      fontSize: number
      fontWeight?: number | string
      fontStyle?: string
    }
  | {
      kind: 'fit'
      nodeId: NodeId
      text: string
      box: Size
      maxFontSize?: number
      minFontSize?: number
      fontWeight?: number | string
      fontStyle?: string
      textAlign?: 'left' | 'center' | 'right'
    }
```

说明：

- `kind = 'size'`
  - 给 `text` 用
  - 输出的是外框 `size`
- `kind = 'fit'`
  - 给 `sticky` 用
  - 未来也可以给 shape auto label 用
  - 输出的是 `fontSize`

注意：

- `box` 必须是逻辑内容区
- 不能来自 live DOM 旋转后的 `getBoundingClientRect()`
- 必须来自 `rect` 加节点自己的内容 inset 规则

## 5.3 `LayoutResult`

输出同样只保留两种：

```ts
import type { Size } from '@whiteboard/core/types'

export type LayoutResult =
  | {
      kind: 'size'
      size: Size
    }
  | {
      kind: 'fit'
      fontSize: number
    }
```

## 5.4 `LayoutBackend`

React 侧只暴露一个 backend：

```ts
export type LayoutBackend = {
  measure: (request: LayoutRequest) => LayoutResult | undefined
}
```

建议实现名：

```ts
export const createLayoutBackend: (
  input: {
    textSources: TextSourceStore
  }
) => LayoutBackend
```

它做的事只有三件：

1. 通过 `nodeId` 找到当前文本 source DOM
2. 用隐藏 measurement host 做精确排版测量
3. 返回 `LayoutResult`

它不做的事：

- 不决定是否需要重算
- 不 patch document
- 不关心 transform / toolbar / edit 的业务语义

## 5.5 注入方式

React 侧给 editor 提供 layout 能力，最终应当走 `createEditor` 的构造参数注入。

原因：

- `layout` 会被 `node.patch`、`edit`、`transform.preview` 这些底层路径使用
- 它属于 editor 的基础能力，不是 renderer 层的可选附属行为
- 构造期注入最容易做测试、做 headless、做平台替换

但最终形态不应该继续停留在当前这种：

```ts
createEditor({
  ...,
  measureText
})
```

这只是 `text` 阶段的过渡方案。

长期最优应该直接收敛成：

```ts
export type EditorServices = {
  layout?: LayoutBackend
}

export const createEditor = ({
  engine,
  initialTool,
  initialViewport,
  registry,
  services
}: {
  engine: Engine
  initialTool: Tool
  initialViewport: Viewport
  registry: NodeRegistry
  services?: EditorServices
}): Editor
```

也就是：

- editor 不直接接收 `measureText`
- editor 接收 `services.layout`

这样做的好处：

- `text` 的 `size` 和 `sticky` 的 `fit` 共用一个注入点
- 以后不会继续长出 `measureStickyFont`、`measureShapeLabel` 之类的新散参数
- editor 的平台边界保持稳定

React 侧的推荐装配方式：

```ts
const textSources = createTextSourceStore()
const layout = createLayoutBackend({
  textSources
})

const editor = createEditor({
  engine,
  initialTool,
  initialViewport,
  registry,
  services: {
    layout
  }
})
```

## 5.6 `TextSourceStore`

layout backend 需要访问当前 node 的文本 source DOM，但这不意味着它应该反向依赖 editor 实例。

长期最优做法不是：

- 在 `WeakMap<editor, registry>` 上挂 source registry

而是引入一个很小的独立宿主：

```ts
export type TextField = 'text' | 'title'

export type TextSourceStore = {
  set: (
    nodeId: NodeId,
    field: TextField,
    element: HTMLElement | null
  ) => void
  get: (
    nodeId: NodeId,
    field: TextField
  ) => HTMLElement | undefined
}
```

建议实现名：

```ts
export const createTextSourceStore: () => TextSourceStore
```

React renderer 负责：

- 在节点挂载/卸载时调用 `textSources.set(...)`

layout backend 负责：

- 在测量时调用 `textSources.get(...)`

这样可以避免：

- layout backend 持有 editor 闭包
- text source registry 和 editor 生命周期硬绑定
- 平台测量层反向耦合 editor runtime

一句话总结：

- `editor` 接收 `services.layout`
- `react` 提供 `createLayoutBackend(...)`
- `renderer` 与 `layout backend` 通过 `TextSourceStore` 共享 DOM source

## 5.7 `LayoutRuntime`

真正的中轴在 editor 里：

```ts
import type { NodeId, NodeUpdateInput } from '@whiteboard/core/types'
import type { Size } from '@whiteboard/core/types'

export type LayoutRuntime = {
  patch: (nodeId: NodeId, update: NodeUpdateInput) => NodeUpdateInput
  edit: (nodeId: NodeId, draftText: string) => {
    size?: Size
    fontSize?: number
  }
  preview: (
    nodeId: NodeId,
    preview: NodeUpdateInput
  ) => NodeUpdateInput
}
```

这三个入口覆盖全部场景：

- `patch`
  - 给 command / toolbar / node.patch 用
- `edit`
  - 给编辑态 live draft 用
- `preview`
  - 给 transform preview 用

以后任何布局问题都先看这三个入口，不再去 renderer / hook / toolbar 里找旁路。

---

## 6. 分层职责

## 6.1 `core`

`core/node/layout.ts` 只负责纯语义：

- 读节点 definition 的 `layout.kind`
- 根据 `node + rect` 构造 `LayoutRequest`
- 根据 `LayoutResult` 产出应该写回 document 的 patch
- 判定哪些字段变化会触发布局重算

建议内部只保留一个中心入口：

```ts
resolveLayout(node, rect, update?) => {
  request?: LayoutRequest
  apply(result): NodeUpdateInput | undefined
  affects(update): boolean
}
```

可以是内部结构，不要求对外完整导出；重点是逻辑集中在一个文件，不要分散成很多 `readXxx` 小函数。

## 6.2 `editor`

`editor` 负责：

- 在 `node.patch` 时统一调用 `layout.patch`
- 在 edit session 里统一调用 `layout.edit`
- 在 transform session 里统一调用 `layout.preview`
- 把 computed 结果合并进真实更新

这里要强调：

- 只有 editor 可以把 computed layout 写回 document

原因：

- editor 才知道当前更新的业务语义
- editor 才能决定历史记录、协作补丁、selection、projection 一致性
- renderer 自己 patch 文档很容易形成循环、抖动和职责穿透

## 6.3 `react`

`react` 只提供 Web backend：

- text line / block 的测量 host
- fit font 的测量 host
- text source registry

React 里允许存在 DOM 测量细节，但不允许存在布局业务语义。

例如：

- 可以有 `measureText(...)`
- 可以有 `measureFit(...)`
- 但不应该再有 `useStickyFontSize(...)` 这种“边测量边决定业务行为”的 hook

---

## 7. 测量规则

## 7.1 唯一允许的测量方式

所有文本相关测量都应通过隐藏 DOM host 完成。

测量时允许读取：

- source element 的 computed typography
- 隐藏 host 里的 `scrollWidth / scrollHeight`
- 隐藏 host 里的 `getBoundingClientRect()`

测量时不允许读取：

- live node root 的 `getBoundingClientRect()` 作为逻辑 box
- 旋转后的 shell / frame 的外接矩形作为 fit box

## 7.2 逻辑 box 的来源

逻辑 box 必须来自节点模型，不来自 live DOM 几何。

规则如下：

- `text`
  - 逻辑宽度来自 `widthMode / wrapWidth`
- `sticky`
  - 逻辑内容区来自 `node.size` 扣掉 sticky 固定 inset
- `shape`
  - 逻辑内容区来自 `shape spec.labelInset`

这条规则直接解决 sticky 旋转时字号变化的问题：

- 旋转只改变屏幕上的 transform
- 不改变逻辑内容区
- 所以不该触发 auto fit font 重算

## 7.3 cache

layout backend 可以有内部缓存，但缓存 key 必须基于 request，而不是基于 live DOM rect。

也就是缓存只看：

- `text`
- `widthMode / wrapWidth`
- `box`
- `fontSize / fontWeight / fontStyle`
- 对齐方式

不能看：

- 节点当前是否旋转
- 节点当前屏幕外接矩形

---

## 8. 写回规则

写回 document 的规则必须非常明确。

## 8.1 `text`

`text` 的布局输出：

- 写回 `fields.size`

不写回：

- `position`
- `rotation`
- 任何额外 computed layout store

## 8.2 `sticky`

`sticky` 在 `fontMode = 'auto'` 时：

- 写回 `style.fontSize`

`sticky` 在 `fontMode = 'fixed'` 时：

- 不写回 computed font

外框始终不因为文本内容变化而被 layout 改写：

- `size` 仍然是 authored

## 8.3 `shape`

`shape` 当前不写回任何 layout output。

如果未来升级为 auto-fit label，也只允许写回：

- `style.fontSize`

仍然不改外框。

---

## 9. 交互行为

## 9.1 toolbar

toolbar 只表达 authored intent，不做布局修正。

例如：

- 改 text `fontSize`
  - 只发 `style.fontSize`
  - editor 自己触发 `layout.patch`
- 改 sticky `fontSize`
  - 如果 `fontMode = 'auto'`
    - 先切 `fontMode = 'fixed'`
  - 再写 `style.fontSize`
  - 其余交给 editor

toolbar 不应该知道：

- wrap text 是否要补 height
- sticky 是否要重算 auto font
- shape label 是否要补测量

这些都应该下沉到 `layout.patch`。

## 9.2 edit

编辑组件只做三件事：

- 输入文本
- 管理 caret
- 绑定 source element

编辑组件不再直接负责：

- 计算 `measuredSize`
- 决定 `wrapWidth`
- 触发特殊节点类型的布局补丁

长期最优做法是：

- `EditableSlot` 只上报 `draftText`
- editor 的 `layout.edit` 根据当前 edit session 所属节点类型统一返回：
  - `size`
  - 或 `fontSize`

这样 commit 时不再需要：

- `if (node.type === 'text') ...`

而是：

- 看节点的 `layout.kind`

## 9.3 transform

transform preview 也必须走同一条 `layout.preview`。

规则如下：

- `text` 左右拖拽
  - 修改 `wrapWidth`
  - 走 `layout.preview`
  - 预览新的 `size`
- `text` 四角 scale
  - 修改 `fontSize`
  - 必要时同步 `wrapWidth`
  - 走 `layout.preview`
- `sticky` resize
  - 修改 authored `size`
  - 如果 `fontMode = 'auto'`
    - 走 `layout.preview`
    - 预览新的 `fontSize`
- `sticky` rotate
  - 只改 `rotation`
  - 不触发布局

这能避免现在这种问题：

- transform session 里有一套字体预览逻辑
- renderer 里又有一套 DOM 回写逻辑
- 两套逻辑相互打架，导致抖动、换行来回跳

---

## 10. 当前代码应当收敛掉的分散点

长期目标不是继续加 helper，而是删掉这些分散入口：

- renderer 内的文本尺寸自回写
- `useStickyFontSize`
- `EditableSlot` 里的直接测量与业务补丁判断
- toolbar 对特定节点类型的字号修正职责
- transform session 内与 editor 语义重复的文本布局判断

可以保留的只有两类局部实现：

- React 测量 backend 的 DOM 细节
- 节点 definition 的 `layout.kind`

其余布局语义一律收敛回 editor 的 `layout` runtime。

---

## 11. 推荐落地顺序

为了不留兼容层，建议按下面四步直接切：

## 阶段 1：建立中轴

- 在 node definition 上加 `layout.kind`
- 新增 `core/node/layout.ts`
- 新增 `editor/layout`
- 新增 `react/runtime/layout`
- 把 `createEditor(..., measureText)` 收敛为 `createEditor(..., services.layout)`
- 引入独立的 `TextSourceStore`

验收标准：

- editor 可以通过 `layout.patch` 统一处理布局型更新

## 阶段 2：收编 `text`

- `text` 完全切到 `layout.kind = 'size'`
- renderer 不再自回写 `size`
- edit commit / toolbar / transform 都走 `layout`

验收标准：

- wrap 模式改字号时高度自动更新
- resize-x / scale-xy 没有旁路回写

## 阶段 3：收编 `sticky`

- 新增 `data.fontMode`
- sticky 改成 `layout.kind = 'fit'`
- 删除 `useStickyFontSize`
- 禁止用 rotated DOM rect 参与 auto fit

验收标准：

- rotate sticky 时字号不变
- resize sticky 时 auto font 平滑更新
- 手动设字号会稳定切到 `fixed`

## 阶段 4：清理 `shape` 与剩余旁路

- `shape` 暂时保留 `layout.kind = 'none'`
- 删除所有残留的文本布局旁路
- 如果将来需要 shape auto label，直接复用 `fit`

验收标准：

- 代码里不存在第二套 `text/sticky/shape` 自治布局系统

---

## 12. 最终判断

长期最优不是“继续给 plain text / sticky / shape 各补几个 helper”，而是把节点布局提升为一个一级能力。

最简单、最稳、最不中途跑偏的版本就是：

- definition 上只有一个极小的 `layout.kind`
- editor 里只有一个 `layout` runtime
- react 里只有一个 `layout` backend
- `text` 用 `size`
- `sticky` 用 `fit`
- `shape` 当前 `none`，未来如果要 auto label 也继续用 `fit`

这样整个系统里：

- 只有一条布局语义中轴
- 只有一套测量 backend
- 只有一个 computed writeback 入口
- 没有 renderer / toolbar / edit / transform 四处散落的特例

这就是长期复杂度最低的方案。
