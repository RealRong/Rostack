# AI 时代复杂前端的中轴化架构

> 一篇面向复杂前端系统的 architecture manifesto。
>
> 核心观点：AI 时代的软件生产力上限不取决于 AI 能写多少代码，而取决于人能否为 AI 建立稳定的系统中轴。中轴越清晰，AI 越能高效扩展；中轴越模糊，AI 越容易制造重复、分叉和隐性耦合。

## 1. 背景：AI 编程不是代码生成问题

AI 已经足够擅长编写局部代码。它可以快速生成组件、纯函数、测试、类型定义、adapter、样板 API，也可以在明确边界下完成大量重构。

但复杂前端系统的难点从来不只是“写代码”。真正困难的是：

- 状态从哪里来。
- 状态由谁修改。
- 修改如何被描述。
- 修改影响哪些读模型。
- UI 应该订阅哪些最小状态。
- undo/redo、collab、history、projection、render 如何共享同一套事实。
- 当需求增长时，系统是否仍然只有一条主路径。

在 AI 编程里，这些问题会被进一步放大。AI 的局部实现能力很强，但它天然容易在全局结构上发散：

- 相似逻辑重复实现。
- 同一概念出现多个名字。
- 组件绕过中轴直接改状态。
- 状态，渲染，副作用互相污染。
- 读，写，状态store，runtime编排边界逐渐模糊。
- 为了解一个局部 bug，生成另一条旁路。

因此，AI 时代复杂前端的核心架构任务不是“让 AI 多写”，而是“让 AI 不跑偏”。

这就是中轴化架构的意义。

## 2. 什么是中轴化架构

中轴化架构不是堆抽象，也不是把项目拆成很多包。它的目标是为复杂系统建立少数几条不可绕过的主路径，让所有功能扩展都围绕这些主路径发生。

一个典型复杂前端系统可以抽象成如下链路：

intent
  -> writer
  -> mutation
  -> delta / footprint
  -> projection
  -> runtime / store
  -> reader
  -> renderer / adapter

简化后可以理解为：

mutation -> delta/footprint -> projection -> runtime/store -> renderer/adapter

这条链路不是为了显得“架构高级”，而是为了给复杂状态系统建立稳定的流向。

每一层都是一个中轴：

- `writer` 是业务写入中轴。
- `mutation` 是状态变更中轴。
- `delta / footprint` 是影响范围中轴。
- `projection` 是读模型生成中轴。
- `runtime / store` 是订阅和状态传播中轴。
- `reader` 是查询访问中轴。
- `renderer / adapter` 是外部环境接入中轴。

AI 可以在每个中轴周围快速填充实现，但不应该绕开中轴另造路径。

## 3. 为什么复杂前端需要中轴

普通前端应用常见路径是：

component event -> setState/store action -> component render

这对简单 CRUD 足够有效。但当系统进入复杂前端领域，这条路径会快速失控。

复杂前端通常包含：

- 高密度数据，例如数万行数据的表格、看板、分组和聚合。
- 高频交互，例如拖拽、框选、缩放、连线、自动布局。
- 多读模型，例如 document、graph、spatial index、render model、selection chrome。
- 多写入来源，例如用户操作、快捷键、远端协作、undo/redo、系统修复、导入导出。
- 多渲染适配，例如 React、DOM、SVG、Canvas、WebGL、clipboard、keyboard、pointer。
- 高性能约束，例如每帧 16.7ms 以内，甚至 8.3ms 以内。

如果没有中轴，复杂度会向组件和临时状态泄漏。最终系统会变成：

组件里算派生状态
hook 里修状态同步
effect 里补副作用
store action 里混业务和 UI
collab 直接侵入 document
undo/redo 到处打补丁
性能靠 useMemo 和局部缓存续命

中轴化架构的目标是反过来：

写入统一
影响明确
读模型增量
订阅细粒度
渲染可替换
外部系统 adapter 化

## 4. 核心原则

### 4.1 Writer：业务写入只能从一个方向进入

`writer` 是业务意图进入系统的入口。

它不应该只是一个薄薄的 setter，也不应该成为无边界的巨型 command 层。它的职责是把用户意图转换为稳定的 mutation program。

设计原则：

- writer 接收业务意图，不直接暴露底层结构写入。
- writer 可以做参数归一化、默认值补齐、业务约束检查。
- writer 不应该持有 renderer 细节。
- writer 不应该直接更新 projection store。
- writer 产出的结果应该可测试、可回放、可用于 history/collab。

推荐路径：

user action -> writer API -> mutation program -> engine commit

反模式：

React component -> document.nodes[id].x = nextX
React component -> setState(...)
shortcut handler -> patchState(...)

### 4.2 Mutation：所有持久状态变更必须可描述

`mutation` 是系统的写入事实。

复杂应用不应该把“改了什么”藏在一堆函数副作用里。每次写入都应该能被描述、提交、记录、反转、重放。

设计原则：

- mutation program 是唯一持久写入协议。
- mutation 应该表达领域变化，而不是 UI 操作细节。
- mutation 粒度要适中：太底层会失去语义，太高层会形成巨型 command。
- mutation 应该能产生 commit result，供 history、collab、projection 使用。
- checkpoint、replace document、remote replay 等特殊路径也应纳入统一协议。

mutation 的价值：

- undo/redo 有统一来源。
- collab 有统一 replay 入口。
- tests 可以直接验证 document transition。
- projection 不需要猜测状态变化来源。
- AI 扩展新写入时有固定槽位。

### 4.3 Delta / Footprint：不要只知道“状态变了”，要知道“哪里变了”

复杂系统的性能关键不是“如何重算”，而是“如何不重算”。

`delta` 描述实际变化，`footprint` 描述影响范围。

示例：

用户移动 node:123

delta:
  node:123.geometry changed

footprint:
  node:123
  connected edges
  spatial records
  render node view
  render edge paths
  selection chrome

设计原则：

- delta 应足够精确，让 projection 可以增量更新。
- footprint 应覆盖影响范围，让 history/collab/cache invalidation 可用。
- delta 不应过细到难以维护。
- footprint 不应粗到每次都全局 invalidation。
- delta/footprint 的 contract 应通过测试保护。

在 AI 编程里，delta/footprint 尤其重要。它们给 AI 明确告诉系统“你改这里，就应该触发那里”。否则 AI 很容易写出全量重算或漏更新。

### 4.4 Projection：读模型必须从写模型投影出来

写模型和读模型通常不是同一种结构。

写模型关注领域事实：

records
fields
views
nodes
edges
groups
mindmaps
canvas order

读模型关注运行时使用：

filtered rows
group buckets
summary values
visible item ids
graph facts
spatial records
edge paths
render node views
selection chrome
hit test candidates

把读模型直接塞进 document，会污染持久状态。把读模型散落在 React 组件里，会破坏性能和一致性。

因此需要 projection。

设计原则：

- projection 是从 document/editor state 到 read model 的唯一主路径。
- projection 应尽可能增量，而不是每次全量 derive。
- projection phase 应表达真实依赖关系。
- projection 产物应写入 runtime stores，而不是直接驱动 renderer。
- projection 不应依赖 DOM 或 React 生命周期。

典型 projection DAG：

document
  -> graph
  -> spatial
  -> items
  -> ui
  -> render

projection 的本质是把复杂状态拆成可验证、可优化、可替换的读模型流水线。

### 4.5 Runtime / Store：UI 订阅最小事实，而不是整个世界

复杂 UI 不能依赖一个巨型状态对象。

正确做法是把 projection 产物放入细粒度 store，renderer 只订阅需要的部分。

设计原则：

- store 是 renderer 观察 runtime state 的唯一入口。
- keyed store 用于 entity view，例如 `node.byId[id]`、`edge.byId[id]`。
- list store 用于顺序，例如 `items.ids`。
- value store 用于单值，例如 viewport、selection summary、background。
- store 更新粒度应与 UI 重渲染边界匹配。
- store 不应暴露可变内部对象给外部随意修改。

keyed store 是 AI 友好的中轴，因为它给组件和 projection 一个明确协议：

projection 更新 key
renderer 订阅 key
只有这个 key 的消费者更新

这比让 AI 在组件里到处写 selector、memo、effect 更稳定。

### 4.6 Reader：读取必须有边界

复杂系统里，读取路径和写入路径一样需要治理。

没有 reader 中轴，AI 容易在任何地方直接穿透内部结构：

engine.doc().nodes.byId[id].geometry
projection.working.graph.nodes.get(id)
store.internalMap.get(id)

短期方便，长期会让内部结构无法演进。

设计原则：

- reader 暴露语义化查询，而不是内部结构。
- reader 可以组合 projection facts、stores、indexes。
- reader 不应产生副作用。
- 高频 reader 应有性能约束。
- adapter 和 renderer 应优先使用 reader，而不是穿透 runtime。

reader 的价值是稳定系统外壳，让内部重构不会外溢。

### 4.7 Renderer / Adapter：UI 和外部系统只是适配层

React、DOM、SVG、Canvas、Yjs、clipboard、keyboard、pointer 都不应该成为 domain kernel 的一部分。

它们是 adapter。

设计原则：

- renderer 订阅 store，调用 actions/writer，不直接修改 document。
- DOM ref、pointer event、keyboard event 留在 adapter 层。
- collab transport 不应污染 document model。
- clipboard/import/export 通过 reader/writer 接入。
- renderer 可以替换，engine 不应被 React 绑死。

这条原则对长期演进很重要。今天用 React + SVG，明天可能局部切 Canvas/WebGL；今天用 Yjs，明天可能换自研 transport。只要 adapter 边界稳定，内核就不会被外部技术锁死。

## 5. AI 友好架构的核心：降低自由度，而不是增加提示词

AI 编程最常见的误区是试图通过更长的 prompt 管住 AI。

更有效的方式是通过架构降低 AI 的自由度。

好的 AI 友好架构应该具备：

- 明确目录归属。
- 明确写入入口。
- 明确读取入口。
- 明确 projection phase。
- 明确 store 粒度。
- 明确 adapter 边界。
- 明确测试和 benchmark。
- 明确哪些东西不能绕过中轴。

当 AI 要新增一个功能时，它不应该需要“自由思考架构”，而应该能自然找到槽位。

示例：

新增一种 dataview summary:
  1. 在 core 定义语义和类型。
  2. 在 engine projection 中计算。
  3. 在 runtime store 中暴露。
  4. 在 React 层订阅并渲染。
  5. 增加 projection tests 和 demo scenario。

新增一种 whiteboard edge label:
  1. 在 core model 定义 label 字段。
  2. 在 mutation registry 增加变更。
  3. 在 graph/render projection 中生成 label view。
  4. 在 keyed store 暴露 label render state。
  5. React edge label layer 订阅对应 store。

AI 的工作是填充每一步。人的工作是确保它没有跳步、绕路和重复造轮子。

## 6. Case Study：Dataview

### 6.1 问题域

`dataview` 的核心问题不是“渲染一个表格”，而是维护一个复杂的数据视图系统：

- records。
- fields。
- views。
- table / kanban 等不同视图。
- filter。
- sort。
- group。
- summary。
- display fields。
- selection / editing / interaction。

这些能力如果直接写在 React 组件里，会迅速失控。

### 6.2 中轴设计

`dataview` 的合理中轴是：

DataDoc
  -> engine mutation
  -> active projection
  -> query/membership/summary stores
  -> React Page/View renderer

关键边界：

- `core` 定义文档和领域语义。
- `engine` 负责 mutation、projection、runtime。
- `react` 负责 provider、page、view、interaction。
- `table` / view modules 负责具体视图表现。
- `shared/ui` 提供 UI primitives。

### 6.3 为什么 projection 重要

Dataview 的 UI 需要的不是原始 records，而是一个 active read model：

当前 view
过滤后的 record ids
排序后的 record ids
分组 buckets
每个 bucket 的 rows
summary values
可显示字段
行/列交互状态

这些都是 projection 产物。

如果每次 React render 都从 `DataDoc` 现场计算这些结果，50k 数据场景会不可控。projection 把这部分逻辑集中到 engine，使其可以被缓存、增量更新、测试和 profiling。

### 6.4 Benchmark 场景

已验证场景：

数据规模:
  50k records

操作:
  table 中增加一个 filter

计算内容:
  filter
  group
  sort
  summary

Chrome DevTools 观测:
  query/projection 约 25ms
  render 约 40ms

这个结果说明 `dataview` 没有把复杂数据处理完全散落到 renderer，也没有在 50k 数据量下陷入不可用的全量 UI 重渲染。

对离散操作而言，约 65ms 的完整反馈已经具备实用价值。

### 6.5 架构价值

`dataview` 证明了中轴化架构可以支撑数据密集型前端：

- 写入不污染 UI。
- query pipeline 可集中优化。
- projection 成为性能主战场。
- React 只是消费 read model。
- AI 可以围绕 filter/sort/group/summary 的纯函数和 projection contract 快速推进。

## 7. Case Study：Whiteboard

### 7.1 问题域

`whiteboard` 的复杂度高于普通 canvas demo。它需要同时处理：

- nodes。
- edges。
- groups。
- mindmaps。
- canvas order。
- geometry。
- routing。
- hit testing。
- spatial index。
- selection。
- hover。
- edit state。
- viewport。
- drag sessions。
- render layers。
- collab/presence。

如果没有中轴，whiteboard 很容易退化成事件处理、React state、DOM/SVG 计算互相穿透的泥潭。

### 7.2 双状态内核

Whiteboard 的关键设计是区分两类状态：

persistent document state
ephemeral editor state

持久文档状态包括：

nodes
edges
groups
mindmaps
canvas order
background
meta

编辑器临时状态包括：

tool
selection
hover
edit
interaction
viewport
overlay
draw state

这两者不应混在一起。

推荐模型：

document engine:
  管持久文档 mutation/history/collab

editor state engine:
  管本地编辑器状态，无持久 history

这个分离非常重要。否则 hover、drag preview、selection、viewport 等本地状态会污染文档模型，collab 和 undo/redo 也会变得混乱。

### 7.3 Scene Projection DAG

Whiteboard 的核心 projection 可以表达为：

document
  -> graph
  -> spatial
  -> items
  -> ui
  -> render

每个 phase 有明确职责：

- `document`: 捕获当前文档快照、revision、background 等基础事实。
- `graph`: 将 nodes/edges/groups/mindmaps 转成可查询图模型。
- `spatial`: 构建命中测试和空间查询索引。
- `items`: 维护 scene item 顺序。
- `ui`: 合成 selection、hover、tool、viewport 等 UI facts。
- `render`: 生成 React/SVG/DOM 可以直接消费的 render model。

这条 DAG 是 whiteboard 性能的核心。

### 7.4 Benchmark 场景

已验证场景：

数据规模:
  约 2000 nodes
  几千条 edges

操作:
  拖拽一个连接大量 edges 的 node

行为:
  edges 自动跟随
  拖拽过程无明显卡顿

Chrome DevTools 观测:
  单个主任务火焰图约 4ms

这个结果非常关键。拖拽高连接节点通常会触发：

pointer move
node geometry mutation
connected edge fanout
edge route/path update
graph projection
spatial/render projection
store notification
React/SVG 更新

如果系统每帧全量扫描 2000 nodes 和几千 edges，或让整个 canvas 全量 re-render，很难稳定在 4ms。

这个结果说明：

- touched edge tracking 有效。
- graph/render projection 具备增量路径。
- keyed stores 降低了 UI 重渲染范围。
- document state 和 render state 的分离产生了实际收益。
- 高频交互路径没有被 React 全局状态拖垮。

### 7.5 架构价值

`whiteboard` 证明了中轴化架构可以支撑高频交互型复杂前端：

- document model 不被 UI 状态污染。
- editor state 有独立 runtime。
- scene projection 让 graph/spatial/render 可分别优化。
- renderer 只消费 render stores。
- collab/presence 作为 adapter 接入。
- AI 可以把复杂几何、routing、hit test 等纯函数交给局部实现，同时不破坏全局主路径。

## 8. Benchmark 和 Profiling 原则

AI 时代的复杂系统开发必须有 benchmark。否则 AI 很容易生成“看起来正确但性能很差”的代码。

### 8.1 Benchmark 应覆盖真实压力路径

无效 benchmark：

100 records filter
10 nodes drag
单个组件 render
只测 pure function 不测 projection/render

有效 benchmark：

50k records + filter/group/sort/summary
2000 nodes + 几千 edges + 高频拖拽
大量 selection + edge follow
多 overlay/menu/focus 嵌套
undo/redo 长链路
remote replay + local projection

### 8.2 Profiling 应拆开看

不要只看“感觉不卡”。应拆分：

- mutation commit time。
- projection time。
- store notification time。
- React render time。
- React commit time。
- layout/paint/composite time。
- memory allocation。
- long task。

### 8.3 性能指标应成为架构 contract

示例目标：

whiteboard drag frame:
  JS task < 8ms
  target < 4ms for common high-degree drag

dataview filter 50k:
  query/projection < 50ms
  render < 50ms

store update:
  affected keyed components only

projection:
  no full rebuild unless reset/checkpoint/document replace

AI 修改核心路径时，必须重新跑 benchmark。否则“功能正确”不够。

## 9. AI Coding Workflow

### 9.1 人负责中轴，AI 负责局部扩展

推荐分工：

人:
  定义架构中轴
  定义不变量
  定义目录归属
  定义 benchmark
  review 产出是否绕路
  删除重复实现

AI:
  实现纯函数算法
  补类型
  写 adapter
  写测试
  执行机械重构
  按既有 pattern 扩展功能

### 9.2 拆任务方式

一个 AI 任务应该足够小，并且有明确写入范围。

好的任务：

在 dataview active projection 中新增 median summary。
只修改 summary projection 和相关 tests。
不要改 React UI。
保持现有 summary store contract。

不好的任务：

帮我给 dataview 加一个高级统计功能。

好的任务：

为 whiteboard edge render model 增加 label mask 的 dirty update。
只触碰 render/labels、render/masks 和对应 tests。
不要修改 document schema。

不好的任务：

优化 whiteboard edge 性能。

### 9.3 验收顺序

每次 AI 修改后，至少按如下顺序验收：

1. 是否沿用中轴
2. 是否新增重复路径
3. 类型是否通过
4. 单测是否通过
5. demo 是否跑通
6. benchmark 是否退化
7. 是否有无意义抽象
8. 是否有 renderer 穿透 engine
9. 是否有 writer 之外的写入路径
10. 是否有 projection 之外的派生状态

### 9.4 防重复实现

AI 最容易重复实现。解决办法不是事后整理，而是提前给它中轴。

常用策略：

- 新功能前先搜索现有概念。
- 要求 AI 复用现有 reader/writer/store。
- 禁止在组件里新增 parallel state。
- 禁止绕过 mutation 直接改 document。
- 禁止在 adapter 里复制 domain logic。
- 每次 refactor 后删除旧路径。
- 为关键中轴写 README 或 contract docs。

### 9.5 让纯函数成为 AI 的主战场

AI 最适合写：

- geometry calculation。
- route calculation。
- hit testing。
- grouping。
- sorting。
- summary aggregation。
- normalization。
- serialization。
- diff/patch helpers。

这些函数应具备：

- 明确 input/output。
- 无副作用。
- 可单测。
- 可 benchmark。
- 不依赖 React/DOM。

人的重点不是手写这些函数，而是定义它们的 contract 和性能目标。

## 10. Anti-pattern：AI 最容易写散的地方

### 10.1 绕过 writer 直接写状态

坏味道：

component -> engine.doc().nodes[id] = next
component -> store.set(next)
shortcut -> direct document patch

后果：

- history 失效。
- collab 不知道变化。
- projection 无法获得 delta。
- tests 很难覆盖。

### 10.2 在 React 组件里派生复杂读模型

坏味道：

const visibleRows = records.filter(...).sort(...).group(...)
const edgePath = computePath(nodes, edge)

后果：

- 每次 render 可能重算。
- 无法共享 cache。
- projection contract 被绕过。
- 性能问题难定位。

### 10.3 同一个概念多套实现

坏味道：

dataview 自己一套 store
whiteboard 自己一套 store
shared 里又一套 store
React demo 里再写一套 local state sync

后果：

- bug 修一处漏三处。
- AI 后续不知道复用哪套。
- 架构逐渐失去主路径。

### 10.4 Adapter 污染 domain

坏味道：

Document 中保存 DOMRect
core 依赖 HTMLElement
mutation 中出现 React event
collab change 中混入 UI selection object

后果：

- 内核不可测试。
- renderer 不可替换。
- collab/replay 语义混乱。

### 10.5 Projection 全量重算伪装成增量

坏味道：

每次 commit 后 rebuild all graph
每次 pointermove 后 recompute all edges
每次 filter 后 rerender all rows

后果：

- 小 demo 可用。
- 大数据场景崩溃。
- 性能优化只能靠临时缓存。

### 10.6 Runtime 变成垃圾桶

坏味道：

runtime 里既有 document mutation
又有 DOM event
又有 projection patch
又有 React state sync
又有 collab protocol

后果：

- 所有东西互相依赖。
- AI 很难找到正确修改点。
- 后续重构成本极高。

### 10.7 只增加抽象，不删除旧路径

AI 很擅长“新增一层”，但不擅长主动删除旧实现。

坏味道：

newWriter 和 legacyWriter 并存
newProjection 和 oldSelector 并存
newStore 和 localState 并存

后果：

- 系统表面更先进，实际更混乱。
- bug 可能来自任何路径。
- 中轴失效。

中轴化架构必须要求：

引入新路径时，必须删除旧路径。

## 11. 团队协作模型

中轴化架构不意味着所有人都要懂所有层。

更合理的团队分工是：

engine owner:
  mutation
  projection
  store
  reader/writer
  performance contracts

renderer/UI owner:
  React components
  visual design
  interactions surface
  accessibility
  product flows

adapter owner:
  collab
  clipboard
  keyboard
  pointer
  persistence

algorithm owner or AI-assisted lane:
  geometry
  query
  routing
  layout
  summary

在 AI 时代，一个强 engine owner 可以配合 AI 快速建立系统中轴，让其他人围绕中轴写 UI 和业务表面。

这会显著提高团队效率，因为大家不再争论“状态应该放哪里”，而是沿着统一协议扩展。

## 12. 何时不应该使用这套架构

中轴化架构不是银弹。

不适合：

- 简单 CRUD。
- 一次性 demo。
- 小型 marketing page。
- 状态很少、交互很轻的页面。
- 没有 undo/collab/performance 需求的普通表单。

过早使用会导致：

- 文件变多。
- 初始开发变慢。
- 新人理解成本上升。
- 简单需求被迫走复杂链路。

适合：

- 数据视图。
- 白板/画布。
- 图编辑器。
- 流程编排器。
- 低代码编辑器。
- 富文本/块编辑器。
- BI/dashboard builder。
- IDE-like web app。
- 协作编辑器。
- 设计工具。

判断标准很简单：

如果你的系统有复杂写入、复杂派生读模型、高频交互、undo/collab/performance 需求，中轴化架构值得。
如果没有，不要为了架构而架构。

## 13. 方法论比项目本身更重要

`dataview` 和 `whiteboard` 的价值不只在于它们分别实现了数据视图和白板。

更重要的是，它们验证了一个 AI 时代复杂前端开发的方法：

1. 人定义中轴。
2. AI 围绕中轴写代码。
3. 复杂编排由架构隔离。
4. 复杂算法变成纯函数交给 AI。
5. 重复实现被持续消灭。
6. benchmark 和 demo 形成反馈闭环。
7. 系统在快速演进中仍保持主路径清晰。

这套方法可以迁移到其他复杂应用。

真正的资产不是某个组件、某个 hook、某段算法，而是：

- 如何设计 writer。
- 如何定义 mutation。
- 如何表达 delta/footprint。
- 如何拆 projection phase。
- 如何定义 keyed stores。
- 如何暴露 reader。
- 如何让 renderer 成为 adapter。
- 如何让 AI 在这些边界内高产。

## 14. 结语

AI 时代，代码生成能力会快速商品化。真正稀缺的是架构中轴、系统不变量、性能反馈和收束能力。

复杂前端不缺代码，缺的是主路径。

中轴化架构的目标就是为复杂系统建立主路径：

writer
  -> mutation
  -> delta / footprint
  -> projection
  -> runtime / store
  -> reader
  -> renderer / adapter

这条路径让人能够理解系统，让 AI 能够扩展系统，让性能可以被优化，让复杂度不会无限扩散。

在这种模式下，个人开发的上限会显著提高。一个具备架构判断的人，可以借助 AI 完成过去需要小团队才能推进的复杂系统雏形。

但前提是：人不能放弃架构责任。

AI 可以写每一行代码，但不能替系统承担不变量。  
AI 可以实现复杂算法，但不能决定哪些路径必须唯一。  
AI 可以快速重构，但不能自动知道哪些重复实现必须删除。  
AI 可以生成工程，但需要人建立中轴。

这就是 AI 时代复杂前端的核心命题：

不是让 AI 自由写，而是让 AI 围绕中轴写。
