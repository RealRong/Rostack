# Whiteboard Editor 读取路径与 Transient 索引现状表

## 1. 结论

当前 `whiteboard-editor` 没有自建一套完整的 transient 空间索引。

editor 的真实结构是三层：

1. `engine`
   负责 committed document、committed geometry、空间索引、基础范围查询。
2. `editor local transient`
   负责 session state 和 feedback patch。
   这里没有完整空间索引，只有局部状态和按 `id` 的投影源。
3. `editor query`
   负责把 `engine committed` 和 `local transient` 合成为当前交互应看到的 live view。

所以当前主语义不是：

`editor 自己维护一套 transient index`

而是：

`engine index 做 coarse query`
`editor query 做 live projection`

---

## 2. 总表

| 场景 | 第一跳读什么 | 是否依赖 engine 索引 | 是否读取 editor transient | 最终消费层 | 备注 |
| --- | --- | --- | --- | --- | --- |
| 普通 node 范围查询 | `engine.read.index.snap.inRect` | 是 | 否，第一跳不读 | `snap` runtime / interaction | 典型 coarse query |
| node `idsInRect` | `engine.read.node.idsInRect` | 是 | 否，第一跳不读 | `query.node.idsInRect` | editor 只在结果上做 selectable 过滤 |
| edge connect 候选集 | `query.node.idsInRect(rect)` | 间接是 | 是，候选逐个读取 `node.canvas` | `query.edge.connectCandidates` | 先 engine inRect，再读 editor 投影 |
| edge hover hint | `ctx.snap.edge.connect` | 间接是 | 是 | `input/edge/hover` | connect 候选来自上面的混合链路 |
| 单个 node 当前几何 | `query.node.item/view/canvas` | 否 | 是 | interaction / render / overlay | committed + transient 合成 |
| 单个 edge 当前几何 | `query.edge.item/view/render` | 否 | 是 | interaction / render / toolbar | committed + transient 合成 |
| transform 过程 node 几何 | `query.node.canvas.get(nodeId)` | 否 | 是 | `input/transform` | 读取的是投影后 live geometry |
| selection overlay / handles | `query.selection.overlay` | 否 | 是 | React chrome | 从 query 统一读 |
| selection toolbar | `query.selection.toolbar` | 否 | 是 | React panel | 从 query 统一读 |
| text 编辑 layout | `edit session + node text preview + committed node` | 否 | 是 | `layout runtime` / `query.node` | 不依赖空间索引 |
| edge guide / connect guide | `local.feedback.edge.guide` | 否 | 是 | React chrome | 纯 transient 视觉反馈 |
| marquee rect / guides | `local.feedback.selection` | 否 | 是 | React chrome | 纯 transient 视觉反馈 |
| draw preview / erase hidden | `local.feedback.draw` | 否 | 是 | render/query | 纯 transient 视觉反馈 |
| mindmap drag / enter preview | `local.feedback.mindmap` | 否 | 是 | `query.mindmap` / `query.node` | 纯 transient 布局预览 |

---

## 3. 各层职责

## 3.1 Engine 层

| 能力 | 来源 | 说明 |
| --- | --- | --- |
| committed node item | `engine.read.node.item` | 文档权威状态 |
| committed edge item | `engine.read.edge.item` | 文档权威状态 |
| node 空间索引 | `engine.read.index.snap.inRect` | 用于 snap / 范围候选 |
| node rect query | `engine.read.node.idsInRect` | 用于 `query.node.idsInRect` 的底层 |
| scene / order / group 等 | `engine.read.*` | editor 不复制这些索引 |

关键入口：

- [createEditor.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/editor/createEditor.ts)
- [query/node/read.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/query/node/read.ts)

结论：

- editor 不重新维护 committed 层的空间索引
- 大范围候选检索默认还是 engine 的职责

---

## 3.2 Editor Local Transient 层

| 分支 | 形态 | 是否索引 | 用途 |
| --- | --- | --- | --- |
| `selection` | value store / session | 否 | 当前选区 |
| `edit` | value store / session | 否 | 当前编辑态 |
| `tool` | value store | 否 | 当前工具 |
| `pointer` | value store | 否 | 当前指针位置 |
| `feedback.node` | patch 列表 | 否 | text preview / selection patch |
| `feedback.edge` | patch 列表 + guide | 否 | edge interaction patch / hover guide |
| `feedback.draw` | preview + hidden ids | 否 | 绘制预览 |
| `feedback.mindmap` | preview object | 否 | rootMove / subtreeMove / enter |

关键入口：

- [local/runtime.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/local/runtime.ts)
- [local/actions/feedback.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/local/actions/feedback.ts)
- [local/feedback/types.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/local/feedback/types.ts)

结论：

- transient 层存的是 patch 和 session，不是空间索引
- 它知道“哪个 id 有补丁”，但不知道“某个 rect 内有哪些 transient 对象”

---

## 3.3 Editor Query Projection 层

| 读模型 | 输入 | 输出 | 作用 |
| --- | --- | --- | --- |
| `query.node.item` | committed node + node feedback + edit + mindmap preview | projected node item | 合成当前 live node |
| `query.node.view/render/canvas` | `query.node.item` + selection | live view / render / canvas snapshot | interaction 和 React 统一读取 |
| `query.edge.item/view/render` | committed edge + edge feedback + edit + node canvas | projected edge | 合成当前 live edge |
| `query.mindmap.item/render` | committed mindmap + mindmap preview + edit | projected tree | 合成当前 live tree |
| `query.selection.overlay/toolbar` | selection model + tool + edit + interaction | overlay / toolbar context | 面板与 chrome 中轴 |

关键入口：

- [query/index.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/query/index.ts)
- [query/node/read.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/query/node/read.ts)
- [query/edge/read.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/query/edge/read.ts)
- [query/mindmap/read.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/query/mindmap/read.ts)
- [query/selection/presentation.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/query/selection/presentation.ts)

结论：

- editor 真正的“中轴读取层”是 query，不是 local state 本身
- 大部分 interaction 不直接拼 local feedback，而是读 query 投影后的 live view

---

## 4. 当前“索引化”能力到底是什么

严格说，editor 当前只有两类“轻索引化”结构：

## 4.1 按 id 的投影映射

例如：

- [selectors.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/local/feedback/selectors.ts) 的 `createProjectedKeyedStore`
- [node.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/local/feedback/node.ts) 的 `toNodeFeedbackMap`

它们能做的是：

- `nodeId -> transient projection`
- `edgeId -> transient projection`

它们不能做的是：

- `rect -> nodeIds`
- `nearest(point) -> candidate`
- `spatial partition`

所以这不是空间索引，只是 keyed projection map。

## 4.2 基于 committed 索引结果再叠 transient

典型例子：

- [query/edge/read.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/query/edge/read.ts) 的 `connectCandidates`

流程是：

1. 先 `node.idsInRect(rect)`
2. 再逐个 `node.canvas.get(nodeId)`
3. 再用 live capability / live geometry 过滤

这属于：

`engine coarse index + editor live refinement`

不是 editor 自己的独立空间索引。

---

## 5. 读取路径明细

## 5.1 范围查找类

| 接口 | 底层第一跳 | 第二跳 | 是否看到 transient geometry |
| --- | --- | --- | --- |
| `query.node.idsInRect` | `engine.read.node.idsInRect` | selectable 过滤 | 否 |
| `snap.node.query` | `engine.read.index.snap.inRect` | 无 | 否 |
| `query.edge.connectCandidates` | `query.node.idsInRect` | `query.node.canvas.get` | 是，第二跳才看到 |

含义：

- editor 目前没有“基于 transient 几何重建 inRect”
- 大范围候选仍然按 committed 几何粗筛
- 只有候选进入第二跳后，才会使用 transient 投影

## 5.2 单对象读取类

| 接口 | 是否读 committed | 是否读 transient | 说明 |
| --- | --- | --- | --- |
| `query.node.item.get(id)` | 是 | 是 | node live item |
| `query.node.canvas.get(id)` | 是 | 是 | interaction 常用 live geometry |
| `query.edge.item/get(id)` | 是 | 是 | edge live item |
| `query.mindmap.item/get(id)` | 是 | 是 | tree live item |
| `query.selection.toolbar/get()` | 是 | 是 | 聚合后的 UI 语义 |

含义：

- 一旦交互已经拿到具体 `id`，基本都会走 editor query 投影
- 这部分 transient 语义是完整的

## 5.3 纯临时视觉反馈类

| 接口 | 数据源 | 是否经过 engine | 说明 |
| --- | --- | --- | --- |
| `read.feedback.edgeGuide` | `local.feedback.edge.guide` | 否 | hover / connect guide |
| `read.feedback.snap` | `local.feedback.selection.guides` | 否 | snap 辅助线 |
| `read.feedback.draw` | `local.feedback.draw.preview` | 否 | draw preview |
| `read.feedback.mindmapPreview` | `local.feedback.mindmap.preview` | 否 | tree enter/move preview |

含义：

- 这类内容根本不需要进入 engine
- editor local feedback 就是它们的真实来源

---

## 6. 现在的主读取范式

可以把当前 editor 的主读取范式压缩成下面这张表：

| 问题类型 | 当前推荐路径 |
| --- | --- |
| 我想知道某个 node 当前长什么样 | `query.node.*` |
| 我想知道某个 edge 当前长什么样 | `query.edge.*` |
| 我想知道当前 selection 的 UI 语义 | `query.selection.*` |
| 我想知道某个范围里有哪些 committed 对象 | `engine index` / `query.node.idsInRect` |
| 我想做 hover / guide / preview 这种纯临时反馈 | `local.feedback.*` |
| 我想在 coarse candidate 上再考虑 transient patch | `engine/index -> query projection refine` |

---

## 7. 当前边界是否合理

我认为当前边界本身是合理的：

- `engine` 负责 committed index
- `editor local` 负责 transient patch
- `editor query` 负责 live projection

这条边界让系统复杂度保持较低，没有把 editor 变成“第二个 engine”。

---

## 8. 当前不足

当前真正的限制不是“没有按 id 的 transient map”，而是：

**没有通用的 transient spatial query。**

也就是说，系统擅长：

- `已知 id -> 读取 live projected geometry`

但不擅长：

- `基于 transient geometry -> 做大范围候选检索`

这会带来一个固定特征：

- 如果某个交互需要“拖动中实时改变几何，并且新的几何还要参与范围检索”，当前系统往往只能：
  - 先用 committed 几何做 coarse query
  - 再在候选集上用 transient geometry refine

这对很多交互已经够用，但不是完整的 transient spatial index。

---

## 9. 长期最优建议

长期最优不是给 editor 再造一份全局 transient index，而是保持下面这条原则：

## 9.1 默认原则

- 默认继续用 engine 做 committed 空间索引
- 默认继续用 editor query 做 live projection
- 默认不要让 local transient 直接到处被交互代码拼装读取

## 9.2 什么时候才需要专用 transient spatial query

只有当某类交互满足下面条件时，才值得单独做一层专用候选结构：

1. 候选集依赖 transient geometry
2. 范围检索发生得很频繁
3. committed coarse query 明显不够
4. 这类需求是局部的、可专门建模的

例如：

- 某种 drag preview 期间，临时对象位置会大幅漂移，而且需要参与大量 nearest / inRect 判断

这时也应该优先做：

`专用 transient candidate layer`

而不是做：

`editor 全局第二套空间索引`

## 9.3 最终原则

可以把长期原则写成一句话：

**editor transient 应该是 patch/projection 系统；只有在某个交互确实需要时，才为那个交互补一层专用 transient spatial query，而不是把 editor 升级成第二个 engine。**

---

## 10. 对当前代码的最终判断

最终可以这样描述当前实现：

| 判断项 | 结论 |
| --- | --- |
| editor 是否有完整 transient 空间索引 | 没有 |
| editor 是否有按 `id` 的 transient projection map | 有 |
| 交互的大范围查找主要靠什么 | 主要靠 engine index |
| 交互的对象级 live 几何主要靠什么 | 主要靠 editor query projection |
| 交互是否会直接拼 local transient 原始状态 | 少量会，但主路线不是 |
| 当前架构是否应继续保持 | 应保持 |
| 是否应该默认给 editor 增加第二套全局索引 | 不应该 |

---

## 11. 关键文件索引

| 文件 | 角色 |
| --- | --- |
| [createEditor.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/editor/createEditor.ts) | 组装 engine/query/local/snap 的总入口 |
| [query/node/read.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/query/node/read.ts) | node live projection 中轴 |
| [query/edge/read.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/query/edge/read.ts) | edge live projection 与 connectCandidates |
| [query/mindmap/read.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/query/mindmap/read.ts) | mindmap live projection |
| [query/selection/presentation.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/query/selection/presentation.ts) | selection UI 聚合 |
| [local/runtime.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/local/runtime.ts) | local state / interaction runtime |
| [local/feedback/selectors.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/local/feedback/selectors.ts) | transient keyed projection selector |
| [local/feedback/node.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/local/feedback/node.ts) | node feedback map 合成 |
| [input/core/snap.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/input/core/snap.ts) | snap runtime |
| [editor/input.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/editor/input.ts) | editor input 分发入口 |

