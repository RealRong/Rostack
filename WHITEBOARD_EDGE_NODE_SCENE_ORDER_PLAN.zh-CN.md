# Whiteboard Edge / Node 全局排序修复方案

## 结论

当前 whiteboard 的排序问题，本质不是 `CanvasItemRef` 设计错误，也不是 document order 没有生效，而是：

1. 数据层保存的是全局混合顺序
2. read model 把 node 和 edge 拆成了两条独立列表
3. React scene 又把它们渲染成固定的独立 DOM layer
4. CSS 再用固定 `z-index` 把 edge 压在 node 下

所以现在的系统虽然“有全局顺序”，但这个顺序在最终 DOM 里没有表达空间。

如果目标是让 edge 可以真正排到 node 上方，长期正确修法不是继续调整 `z-index`，也不是把 `EdgeLayer` 和 `NodeSceneLayer` 互换顺序，而是：

- 保留 `Document.order: CanvasItemRef[]` 作为唯一全局排序来源
- 在 read/render 层引入真正消费全局顺序的 scene 模型
- 将 canvas 主体渲染从“固定 layer”改成“shape-wrapper scene 渲染”
- overlay、selection、toolbar 继续保留独立层，不参与 canvas item 排序

## 当前问题链路

## 1. 数据层其实已经支持全局混排

`Document.order` 本身就是 `CanvasItemRef[]`，可以同时保存：

- node
- edge

因此从模型表达力上说，`edge A < node B < edge C` 是可以表示的。

排序写入逻辑也已经是基于混合 ref 工作的，因此 bring to front / send backward 这一套逻辑在语义上没有先天缺陷。

换句话说：

- 问题不在 document schema
- 问题不在 order command translator
- 问题主要出在 read / render 层把全局顺序切碎了

## 2. read model 先把全局顺序拆成了 node list 和 edge list

当前 read model 的典型路径是：

1. `listNodes(document)` 生成 node 顺序
2. `listEdges(document)` 生成 edge 顺序
3. node 和 edge 各自维护独立 projection / store

这样做以后，系统只保留了：

- node 内部顺序
- edge 内部顺序

但已经丢失了：

- edge 相对 node 的位置关系

即使底层 `Document.order` 是混合的，到了 React 层也无法从两条独立列表还原出跨类型顺序。

## 3. React scene 把 node / edge / mindmap 渲染成固定层

当前 `Surface` 中的主场景渲染顺序是固定的：

1. `EdgeLayer`
2. `NodeSceneLayer`
3. `MindmapSceneLayer`
4. `NodeOverlayLayer`
5. `EdgeOverlayLayer`
6. `DrawLayer`

这意味着：

- edge 永远处于 node scene 下方
- 无论 `CanvasItemRef` 怎么排，edge 都不可能真实盖住 node
- mindmap 也有同类问题，因为它也被独立抽成 scene layer

所以这不是排序算法失效，而是固定 layer 架构覆盖了排序结果。

## 4. CSS 的 `z-index` 只是把这个问题显式固化了

当前样式里：

- `.wb-edge-layer` 的层级低于 `.wb-node-layer`
- `.wb-node-overlay-layer`、`.wb-edge-overlay-layer`、selection、toolbar 等又各自占据更高层

这套层级只适合表达“edge 作为统一背景线层”的模型，不适合表达任意混排的 canvas item order。

## 不建议的修法

## 1. 不建议只改 CSS `z-index`

如果只是把 edge layer 提到 node layer 上方，只会把当前规则从：

- edge 永远在 node 下方

变成：

- edge 永远在 node 上方

问题本质没有变化，仍然不能表达：

- 某些 edge 在下
- 某些 edge 在上
- 中间穿插 node

这不是修复，只是把全局偏置方向改了。

## 2. 不建议只交换 `EdgeLayer` 和 `NodeSceneLayer` 的 DOM 顺序

理由和只改 `z-index` 一样：

- 只是把固定层顺序改成另一种固定层顺序
- 无法支持真正的跨类型局部混排

## 3. 不建议新增“补丁式 edge-top layer”

例如：

- 底部保留旧 `EdgeLayer`
- 再新增一个“置顶 edge layer”
- 只有某些 edge 复制到上层显示

这种方案短期看像是低成本，但长期问题很重：

- 同一类实体被分裂进多个渲染层
- hit test、selection、hover、overlay 容易出现双份语义
- 很快会演化成一堆例外分支
- 仍然不能自然表达完整全局顺序

它更像 workaround，不是可持续架构。

## 推荐方向

## 核心原则

主场景应当分成两类层次：

1. canvas content scene
2. interaction / chrome overlay

其中：

- canvas content scene 需要尊重 `CanvasItemRef` 全局顺序
- interaction overlay 不应该参与内容层排序

所以真正要改的是“canvas content scene 的表达方式”，不是把所有层全揉成一个 div。

## 推荐架构：Shape-Wrapper Scene

方案明确为：

1. canvas content 采用统一 `shape-wrapper` scene
2. 每个可排序内容项都对应一个独立 wrapper
3. wrapper 的 DOM 顺序或显式 `z-index` 直接表达 `CanvasItemRef` 全局顺序
4. interaction / chrome overlay 继续独立，不参与内容层排序

这里的关键不是“把 edge 拆成很多 svg”本身，而是把内容层的建模统一成：

- node 是一个 shape
- edge 是一个 shape
- mindmap root 是一个 shape

每个 shape 都有自己的 wrapper，排序在 wrapper 这一层表达。

## 为什么明确选择 Shape-Wrapper

当前 whiteboard 的核心问题是：

- 数据层有全局顺序
- React 内容层没有统一的内容项容器

而 `shape-wrapper` 方案正好直接补上这个缺口。

它的优势是：

1. 内容层语义统一
2. DOM stacking 能直接表达真实顺序
3. edge / node / mindmap 不再依赖固定 sibling layer
4. pointer pick 更接近最终视觉顺序

相比 run 方案，`shape-wrapper` 的改动更大，但模型更统一，也更接近成熟白板编辑器的内容层组织方式。

## 内容层与交互层边界

主场景仍然应该分成两类层：

1. canvas content scene
2. interaction / chrome overlay

其中：

- canvas content scene 使用 shape-wrapper
- interaction overlay 继续独立

继续独立的层包括：

- node transform handles
- edge endpoint / route overlays
- selection box
- toolbar
- context menu
- presence
- draw preview

这些层是交互层，不应该被内容层的全局排序吸进去。

## 具体实现建议

## 1. 新增统一的 scene read 模型

不要再让 React 主场景直接消费：

- `editor.read.node.list`
- `editor.read.edge.list`
- `editor.read.mindmap.list`

而应该新增一个统一 scene 读取结果，例如：

- `editor.read.scene.list`

### 推荐数据结构：扁平 scene item list

形式大致类似：

```ts
type SceneItemRef =
  | { kind: 'node'; id: NodeId }
  | { kind: 'edge'; id: EdgeId }
  | { kind: 'mindmap'; id: NodeId }
```

优点：

- 语义直接
- 最容易从 `Document.order` 推导
- 最适合 shape-wrapper 渲染
- React 端实现简单

缺点：

- 每个内容项都会多一个 wrapper 容器
- edge 需要从共享全局 svg 迁到局部 svg wrapper

## 2. React 主场景改成单入口 `CanvasScene`

当前固定并列的：

- `EdgeLayer`
- `NodeSceneLayer`
- `MindmapSceneLayer`

建议收敛成：

- `CanvasScene`

这个组件只负责一件事：

- 按统一 scene order 渲染 canvas content

内部直接根据 item 类型渲染现有内容组件：

- `EdgeItem`
- `NodeItem`
- `MindmapTreeView`

不建议为了表达 shape-wrapper 再额外引入一层纯转发组件。  
也就是说：

- 不要为了名字好看而新增 `NodeShape`
- 不要为了抽象对称而新增 `EdgeShape`
- 不要为了统一结构而新增 `MindmapShape`

如果一个组件只是：

- 收一个 id
- 读一点数据
- 再把同样的东西转发给下层

那这个组件就不应该存在。

## 3. 保留现有 overlay 结构

以下层建议保持独立，不参与 scene order：

- `NodeOverlayLayer`
- `EdgeOverlayLayer`
- `DrawLayer`
- `Marquee`
- toolbar / chrome / context menu / presence

原因很简单：

- 它们表达的是交互状态
- 不是 document content 的一部分
- 如果强行纳入 scene order，会让职责边界变差

## 4. mindmap 要一并纳入 scene order

这个点很重要。

如果只修 edge 和 normal node，但继续把 `MindmapSceneLayer` 独立放在固定层，那么系统仍然会保留一块“内容层例外”：

- mindmap 总是在某个固定层
- 仍然无法和 edge / node 做真实全局顺序协作

因此建议：

- mindmap 作为一种 canvas content item 进入 scene 模型
- 但其内部树形节点和连线仍由自己的子组件负责

也就是说：

- scene order 决定“整棵 mindmap 在 canvas content 中处于哪一层”
- mindmap 内部局部结构仍归它自己管理

## 5. frame 采用“统一渲染，受约束排序”的 barrier 语义

这里需要明确一个产品语义：

- frame 不是固定 layer
- frame 仍然进入统一 shape-wrapper scene
- 但 frame 也不是和所有内容完全平等的自由排序项
- 如果某条 edge 被 `send to back`，那么这条 edge 应该可以排到 frame 下方
- 如果某个普通 node 被 `send to back`，它仍然应该停在 frame 上方

这意味着：

- 不能继续把 frame 视为固定 background tier
- 不能继续用“frame 天然压住所有 edge”这种简单隐式规则
- 但也不能把 frame 与 node / edge 完全当成一个无约束 total order

更准确的说法是：

- 渲染时：frame 和 edge / node 一样进入统一 scene
- 排序时：frame 充当普通 node 的 barrier

具体约束应当是：

1. 普通 node 不能被排到 frame 下方
2. edge 可以被排到 frame 下方
3. frame 自己也参与 scene，但不应被排序操作带到普通 node 之上

因此我们要实现的不是“完全自由全局排序”，而是：

- 统一 shape-wrapper 渲染
- 受约束的 reorder policy

换句话说，shape-wrapper 方案里：

- frame 是 `node` 的一个具体类型
- frame 和 edge 一样进入统一 scene
- 但 reorder 时必须额外考虑 frame barrier 规则

## 6. 排序策略必须从“自由 reorder”改成“受约束 reorder”

如果目标行为参考 Miro，那么排序逻辑需要按内容角色区分。

建议把内容角色至少分成三类：

1. `frame`
2. `content-node`
   指普通 node、mindmap 等内容节点
3. `edge`

然后定义以下规则：

### `send to back`

- `content-node`
  只能后退到“frame 上方的最低位置”，不能越过 frame
- `edge`
  可以退到整个 scene 的最底部，包括 frame 下方
- `frame`
  可以在 frame 区域内调整，但不能被带到普通 node 上方

### `send backward`

- `content-node`
  逐步后退，但遇到 frame barrier 时停止
- `edge`
  逐步后退，可以跨越 frame barrier
- `frame`
  只能在允许的 frame 区域内后退

### `bring forward` / `bring to front`

- `content-node`
  正常前移
- `edge`
  正常前移，可以压过 frame 和 node
- `frame`
  不应前移到普通 node 之上

这套规则的核心是：

- frame 不是固定底层
- frame 也不是完全自由层
- node 永远压 frame
- edge 可在 frame 上下两侧自由移动

## 7. 混合选择不能再按一个整体 block 无脑搬动

一旦有了 frame barrier 语义，混合选择就不能继续简单地把所有选中项当成一个整体 block 做 reorder。

例如以下组合都可能有不同约束：

- node + edge
- frame + edge
- frame + node

建议规则是：

1. 先按角色拆分 selection
2. `edge` 一组
3. `frame` 一组
4. `content-node` 一组
5. 各组按自己的 reorder policy 处理
6. 尽量保留组内相对顺序

这样做虽然比自由 reorder 更复杂，但它和 Miro 类语义是一致的，也最不容易出现违反直觉的结果。

## read 层建议怎么改

## 1. 保留 node / edge keyed item store

不需要把一切都改成 scene keyed store。

建议保留：

- `read.node.item`
- `read.edge.item`
- `read.edge.resolved`
- `read.mindmap.item`

因为这些 keyed store 承担的是实体级读缓存和局部订阅能力，本身没有问题。

真正要改的是：

- 列表型入口

也就是从“多个固定列表”改成“一个统一 scene 列表”。

## 2. 新增 scene projection，而不是替换所有 projection

比较稳的方式是：

1. 继续保留 node projection
2. 继续保留 edge projection
3. 继续保留 mindmap projection
4. 额外新增一个 scene projection，负责组织顺序

scene projection 的职责应该只包括：

- 消费 document order
- 将 node / edge / mindmap 合成为可渲染顺序
- 为 shape-wrapper 渲染提供 item 级顺序入口

它不负责：

- 几何计算
- edge 路由
- node rect 测量
- mindmap layout

这些仍由原有 projection 负责。

这样改动范围更可控，不会把现有 read 缓存体系整体推翻。

但这里需要额外说明：

- scene projection 只负责“当前顺序是什么”
- frame barrier 语义不应该塞进 scene projection
- frame barrier 应由 reorder / order normalize 逻辑负责

也就是说：

- 渲染层统一
- 排序策略受约束

## React 层建议怎么改

## 1. Scene renderer 只负责顺序，不新增纯转发组件

例如：

- `NodeItem` 继续渲染 node
- `EdgeItem` 继续渲染 edge path
- `MindmapTreeView` 继续渲染整棵 mindmap

要改的是：

- 它们如何被排布到 DOM 中

而不是额外插入一层只负责“包一下再传下去”的组件。

推荐关系应当是：

```ts
CanvasScene
  -> NodeItem
  -> EdgeItem
  -> MindmapTreeView
```

而不是：

```ts
CanvasScene
  -> NodeShape
      -> NodeItem
  -> EdgeShape
      -> EdgeItem
  -> MindmapShape
      -> MindmapTreeView
```

除非中间层真的承载了独立职责，否则不应该为了结构对称保留它。

## 2. EdgeItem 直接升级为局部 svg wrapper renderer，而不是新增 `EdgeShape`

这里明确选择 shape-wrapper，因此 edge 不再维持单个全局 `EdgeLayer`。

推荐做法是：

1. 每条 edge 对应一个 wrapper
2. wrapper 使用 edge bounds 作为局部包围盒
3. wrapper 内部渲染局部 svg
4. path、hit path、selection path、marker 都在局部坐标系内完成

这里推荐直接改造现有 `EdgeItem`：

- 让 `EdgeItem` 自己接收 edgeId
- 自己读取 `edge.item` / `edge.resolved` / `edge.box`
- 自己渲染局部 bbox svg
- 自己收纳 label

而不是再新增一个只包住 `EdgeItem` 的 `EdgeShape`。

这里要避免的不是“每个 edge 一个 svg”，而是：

- 每个 edge 一个全屏 svg

不推荐的是全屏 svg；  
推荐的是：

- 每个 edge 一个局部 bbox svg wrapper

## 3. Edge label 明确收回到 `EdgeItem` 内部

这里也需要明确一个边界：

- edge label 不再停留在独立 overlay 层
- edge label 应作为 edge shape 的一部分进入 edge wrapper

这样做的原因是：

1. label 的视觉层级应跟随 edge
2. edge 在 node 上方时，label 也应一起在上方
3. edge 被 send to back 时，label 也应一起下沉

因此在 shape-wrapper 方案里，`EdgeItem` 的渲染单元应当包含：

- visible path
- hit path
- selection path
- label

overlay 层只保留交互性 handles，不保留 edge 内容本体。

如果 label 编辑逻辑太大，可以保留一个内部辅助组件：

- `EdgeLabel`

但它应当只作为 `EdgeItem` 的内部实现细节存在，不应再作为独立 scene / layer 入口。

## 4. NodeItem 直接承担 node 的 shape-wrapper 职责

node 这边通常不需要像 edge 那样改坐标模型。

更合理的做法是：

1. 每个 node 仍对应一个独立 wrapper
2. wrapper 继续采用绝对定位 html 容器
3. `NodeItem` 直接渲染这个 wrapper 和内部内容

因此 node 这边也不建议再额外新增 `NodeShape`。

更推荐的是直接升级现有 `NodeItem`：

- 继续读取 `useNodeView`
- 继续负责 auto measure
- 继续负责 definition.render
- 同时直接成为 scene 中的 node shape 单元

## 5. Mindmap 也不建议额外新增 `MindmapShape`

mindmap 这边同样遵守“组件尽量少”的原则。

推荐做法是：

- `CanvasScene` 直接按 scene item 渲染 `MindmapTreeView`

如果后面需要一个很薄的适配层，也应优先内联在 `CanvasScene` 里，而不是专门再建一个 `MindmapShape`。

## 5. Shared defs 采用“全局 defs + 局部 defs”双层模型

shape-wrapper 方案下，defs 不需要二选一。

建议明确区分两类资源：

### 全局 shared defs

放在顶层 svg context 中，承载：

- 通用 arrow markers
- 全局 pattern / filter
- 可被多个 shape 共享的资源

### shape 局部 defs

放在单个 edge 或单个 shape 的局部 svg 中，承载：

- 局部 clipPath
- 仅当前 shape 使用的局部定义

这和成熟白板实现的组织方式是一致的。  
因此 shape-wrapper 方案里：

- 可以保留一个全局 shared svg context
- 每个 edge wrapper 的局部 svg 仍然可以有自己的 `<defs>`

## 6. 命名建议

这次改造涉及 read、render、order 三层。  
命名上建议尽量短，不要引入一串近义词。

建议统一采用以下短名：

- `scene`
  表示内容层顺序模型
- `item`
  表示一个可排序内容项
- `shape`
  表示一个 wrapper 渲染单元
- `frameRole`
  表示 frame barrier 角色
- `orderPolicy`
  表示排序约束策略

不建议再引入这些长名：

- `canvasContentSceneProjection`
- `globalCanvasItemOrderingModel`
- `shapeWrapperRenderCoordinator`

它们太长，而且语义重叠。

推荐命名如下：

### read / projection

- `read.scene.list`
- `createSceneProjection`
- `SceneItem`

### render

- `CanvasScene`
- `NodeItem`
- `EdgeItem`
- `MindmapTreeView`

### order

- `normalizeOrder`
- `applyOrder`
- `orderPolicy`
- `frameRole`

### edge 局部结构

- `EdgeBox`
- `EdgeDefs`

总原则是：

- 一个概念一个词
- `scene` 只表示内容顺序
- `overlay` 只表示交互层
- 不为转发而新增组件

## 7. 新 API 设计

建议新增的 API 尽量少，且只暴露真正需要的新边界。

### read API

新增：

```ts
type SceneItem =
  | { kind: 'node'; id: NodeId }
  | { kind: 'edge'; id: EdgeId }
  | { kind: 'mindmap'; id: NodeId }

editor.read.scene.list: ReadStore<readonly SceneItem[]>
```

说明：

- `scene.list` 是内容层唯一顺序入口
- `node.item` / `edge.item` / `mindmap.item` 继续保留，不做替换

### edge shape API

建议新增一个局部 bbox 视图，而不是让 React 自己拼装：

```ts
type EdgeBox = {
  rect: Rect
  path: string
  pad: number
}

editor.read.edge.box(edgeId): EdgeBox | undefined
```

这个 API 的职责是：

- 返回 edge wrapper 的局部包围盒
- 返回已转换到局部坐标的 path
- 提供 stroke / marker / label 所需 padding

这样 React 层就不必重复写一套 bbox 和局部坐标换算。

### order API

现有 document order 命令不需要推翻，但内部策略要收敛。

建议保留外部调用面：

```ts
editor.document.order(refs, mode)
```

内部新增短名策略函数：

```ts
normalizeOrder(doc, refs, mode, orderPolicy)
```

其中：

```ts
type OrderPolicy = {
  canCrossFrame(ref: CanvasItemRef): boolean
  isFrame(ref: CanvasItemRef): boolean
}
```

默认 whiteboard policy：

- node / mindmap 不能跨 frame
- edge 可以跨 frame

这样 API 面不需要大改，只改内部语义。

## 8. 旧实现删除清单

这次改造完成后，建议明确删除以下旧实现，不保留双轨。

### React 内容层

应删除：

- `EdgeLayer`
- `NodeSceneLayer`
- `MindmapSceneLayer`

这些组件的“内容层入口”职责会被 `CanvasScene` 取代。

应保留并直接升级为 scene item renderer 的：

- `NodeItem`
- `EdgeItem`
- `MindmapTreeView`

它们可以继续存在，但不再直接挂在 `Surface` 顶层，而是由 `CanvasScene` 直接渲染。

### edge label 旧路径

应删除旧的“edge label 作为独立内容层”的实现路径。

具体来说：

- `EdgeLabelLayer` 不再作为独立内容渲染入口
- 与之绑定的内容层接线应删除

如果其中一小部分编辑态逻辑还能复用，可以下沉到内部 `EdgeLabel` 组件，但：

- 旧 layer 本身不应保留

### 旧列表消费点

应删除这些直接驱动内容层渲染的入口：

- `editor.read.edge.list` 在 React 主场景中的直接消费
- `editor.read.node.list` 在 React 主场景中的直接消费
- `editor.read.mindmap.list` 在 React 主场景中的直接消费

注意：

- 这些 store 本身可以保留
- 但不应再作为内容层 stacking 的直接来源

### 旧排序假设

应删除这些隐含假设：

- edge 整体低于 node
- frame 整体固定在单一底层
- edge label 永远属于 overlay

如果这些假设还残留在：

- CSS `z-index`
- pick 规则
- selection 规则
- toolbar 定位

都应该一起清理。

## 最终分阶段实施方案

建议拆成四个阶段，每个阶段都有明确完成标准，避免半旧半新状态拖太久。

## Phase 1: Scene

目标：

- 建立统一内容顺序入口
- 不动现有内容层渲染

实施项：

1. 新增 `SceneItem`
2. 新增 `createSceneProjection`
3. 新增 `editor.read.scene.list`
4. 让 `scene.list` 直接基于 `Document.order`
5. 保留 `node.item` / `edge.item` / `mindmap.item`

完成标准：

- 能稳定读到完整内容顺序
- 不再需要在 React 层自己拼 node / edge / mindmap 的顺序

本阶段不删除：

- `EdgeLayer`
- `NodeSceneLayer`
- `MindmapSceneLayer`

## Phase 2: Edge Shape

目标：

- 把 edge 从共享全局 svg 迁到局部 wrapper
- 让 edge 真正能和 node 混排

实施项：

1. 新增 `editor.read.edge.box(edgeId)`
2. 升级 `EdgeItem`
3. 将 label 收回 `EdgeItem`
4. 仅在必要时保留内部 `EdgeLabel`
5. 保留 shared defs，同时允许局部 defs

完成标准：

- 单条 edge 能以局部 bbox svg 渲染
- edge label 与 edge 一起移动和排序
- edge 能真实压过 node，也能退到 frame 下方

本阶段删除：

- `EdgeLayer`
- `EdgeLabelLayer` 的内容层职责

## Phase 3: Canvas Scene

目标：

- 用统一内容层替换三个旧 scene layer

实施项：

1. 新增 `CanvasScene`
2. 升级 `NodeItem`
3. 让 `CanvasScene` 直接渲染 `MindmapTreeView`
4. `Surface` 只挂一个 `CanvasScene`
5. `CanvasScene` 只消费 `editor.read.scene.list`

完成标准：

- `Surface` 顶层不再并列挂 `EdgeLayer / NodeSceneLayer / MindmapSceneLayer`
- 所有内容项都通过 shape wrapper 进入同一 scene

本阶段删除：

- `NodeSceneLayer`
- `MindmapSceneLayer`
- React 顶层对 `read.node.list` / `read.edge.list` / `read.mindmap.list` 的直接消费

## Phase 4: Order Policy

目标：

- 将排序语义切换到 frame barrier policy

实施项：

1. 新增 `orderPolicy`
2. 重写 `normalizeOrder`
3. 区分 `frame / content-node / edge`
4. 处理混合选择 reorder
5. 清理旧的固定 layer 假设

完成标准：

- `node send to back` 停在 frame 上方
- `edge send to back` 可跌到 frame 下方
- 混合选择 reorder 行为稳定

本阶段删除：

- “自由 reorder” 的旧假设
- frame 固定底层的旧逻辑
- edge 整体低于 node 的旧逻辑

## 迁移顺序建议

建议分三步落地，而不是一口气全量替换。

## 第一步：先新增 scene projection，不改写入模型

先做：

1. 新增 scene read 结构
2. 从 `Document.order` 推导统一 scene list / items
3. 保留现有 node / edge / mindmap projection 不变

这一步的目标是：

- 先把“全局顺序可读”这件事建立起来

## 第二步：React 主场景切换到 `CanvasScene`

再做：

1. 用 `CanvasScene` 替换 `EdgeLayer + NodeSceneLayer + MindmapSceneLayer`
2. 将 edge 改成局部 svg wrapper
3. 将 edge label 收回到 edge wrapper
4. overlay 层保持不动
5. 验证 edge / node / mindmap / frame 的 stacking 行为

这一步完成后，功能上应该已经修掉：

- edge 无法盖住 node
- mindmap 仍被固定层支配
- frame 被错误固定成单一底层
- node `send to back` 仍错误地跌破 frame
- edge `send to back` 不能跌到 frame 下方

## 第三步：清理旧的固定 layer 假设

最后再做清理：

1. 删除旧 scene list 的直接消费点
2. 收敛不再需要的固定 `z-index` 假设
3. 检查 selection / hover / hit test 是否仍有隐含依赖旧层次
4. 清理旧的 edge label overlay 依赖
5. 将 reorder 逻辑切换到 frame barrier policy

## 风险点

## 1. hit test 行为可能暴露出新的遮挡关系

当前因为 edge 永远在 node 下方，一些用户实际感知到的 pick 行为可能已经默认依赖这个事实。

一旦支持真实混排，需要重新确认：

- pointer event 命中优先级
- edge hit path 和 node body 的遮挡关系
- selection 行为是否与视觉顺序一致

这是预期内工作，不是坏事，但必须提前考虑。

## 2. selected overlay 不能错误地下沉到内容层

node transform handles、edge route handles、selection frame 这些必须继续保持在 interaction overlay 中。  
如果在改 scene 时把它们一起揉进内容层，会导致：

- handles 被内容遮住
- selection 可见性不稳定
- 交互体验退化

## 3. mindmap 作为整块内容进入 scene 后，要确认内部交互不受影响

推荐把 mindmap 视为 scene item，但它内部仍然是自己的局部场景。  
需要验证：

- tree 内部节点 pick
- add child 按钮
- ghost / insert line

是否仍然正常工作。

## 4. edge wrapper 的局部 bbox 需要正确包含 label 和 stroke 外扩

因为 edge label 被收回到 wrapper 内部，wrapper 边界不能只覆盖裸 path。

至少需要考虑：

- stroke width
- selection stroke
- marker 外扩
- label 位置

如果 bbox 只按 path 几何计算，局部 wrapper 很容易裁掉 label 或 marker。

## 推荐的最终判断

如果只给一个明确建议，那么应该是：

- 不修 `CanvasItemRef`
- 不修 `CanvasItemRef` 的表达模型
- 不靠 `z-index` 打补丁
- 直接把主场景改成基于全局 scene order 的 shape-wrapper 渲染模型
  但排序命令要切换到 frame barrier 规则

更具体一点：

1. 保留 `Document.order` 作为唯一内容顺序来源
2. 新增 scene projection
3. 主场景改为 `CanvasScene`
4. 内容层明确采用 shape-wrapper
5. edge 使用局部 bbox svg wrapper
6. edge label 收回到 edge wrapper
7. frame 进入统一 scene，但排序时作为 node 的 barrier
8. overlay / selection / toolbar 继续保持独立层

## 最终推荐方案摘要

最稳、最符合现有架构边界的方案是：

- 用 `CanvasItemRef` 驱动一个新的 scene projection
- React 使用统一 `CanvasScene` 按顺序渲染内容层
- 内容层采用统一 shape-wrapper
- edge/node/mindmap/frame 不再以固定 sibling layer 的方式决定上下关系
- edge label 与 edge 内容本体一起进入 wrapper
- reorder 逻辑引入 frame barrier policy，而不是完全自由排序
- overlay 体系保持独立，不被内容排序污染

这套方案的关键收益是：

- 真正支持跨类型排序
- 能表达 Miro 类语义：node 永远压 frame，edge 可上下穿越 frame
- edge 与 label 的视觉层级保持一致
- 能把 mindmap 一并纳入正确模型
- 改动集中在 read/render 边界，不需要推翻 document schema 和写入模型
