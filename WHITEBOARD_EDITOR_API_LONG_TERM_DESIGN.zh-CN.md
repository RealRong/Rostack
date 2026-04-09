# Whiteboard Editor API 长期最优设计

## 目标

这份文档讨论的不是“当前代码怎么跑通”，而是 whiteboard 整个 editor API 体系在长期应该如何收敛，包含：

- `whiteboard-editor` 的公开 API
- `whiteboard-engine` 的 durable write model
- `editor.read` 的 presentation / query 边界
- `whiteboard-collab` 对操作粒度的要求

原则很简单：

- 优先长期边界清晰
- 不为兼容保留历史包袱
- editor 层负责用户语义
- engine 层负责 durable op
- collab 层只消费 durable op，不猜 UI intent

---

## 当前问题

### 1. `editor.commands` 混了三种完全不同的东西

现在 `editor.commands` 同时包含：

- 文档写入命令
- session 命令
- view 命令

例如：

- `tool.set` 是 session
- `selection.replace` 是 session
- `edit.startNode` 是 session
- `viewport.fit` 是 view
- `node.create` 是 document
- `nodes.delete` 是 document semantic wrapper

这会导致几个问题：

- 命名不一致
- 可协同与不可协同操作混在一起
- React 很容易误把 session 写入当成 durable command

### 2. `editor.commands` 有的直接透传 engine，有的是 editor 语义 facade

当前是一种混合状态：

- `node.create/move/align/distribute/delete/duplicate` 基本直接继承 engine
- `nodes.delete/duplicate/order` 是 editor facade
- `group.merge/ungroup` 是 editor facade
- `edge.patch/labels.*` 是 editor facade
- `mindmap` 又是半透传半增强

这说明当前公开 API 的分层标准并不统一。

### 3. `node` / `nodes` 并存，语义不稳定

当前：

- `node.*` 更像单个 domain command
- `nodes.*` 更像对 selection target 的批量语义命令

这在表面上能用，但长期很别扭：

- 用户不知道应该优先用哪个
- selection target 和实体 ids 的边界不清晰
- 很容易继续扩出 `edge` / `edges` / `canvas` 三套平行接口

### 4. `edge` 的 editor facade 是对的，但 durable model 还不够细

当前 editor facade：

- `edge.patch(ids, patch)`
- `edge.swapMarkers(id)`
- `edge.labels.add/edit/patch/remove`

这个方向本身是对的，因为它表达的是用户语义。

但底层仍然有两个结构性问题：

- `style` 是整对象覆盖
- `labels` 是整数组覆盖

这在单机没问题，在真正的多端并发下会放大冲突。

### 5. `editor.read` 里 query、projection、toolbar presentation 还是混得有点重

目前已经比之前好很多，但仍然有两个倾向：

- 把 selection toolbar 当作总入口
- 把 React 需要的 presentation model 和基础 query 一起塞进同一个 read domain

长期看应该更明确地区分：

- 基础 query / resolved geometry
- editor 语义 read model
- toolbar / chrome presentation

### 6. `whiteboard-collab` 现在根本不是 op-based

这一点最关键。

当前 `whiteboard-collab` 的实际行为是：

- 本地 commit 后，把整份 document snapshot 回写到 Yjs
- 远端 Yjs 变化后，如果和本地 document 不同，就直接 `document.replace`

也就是说，现在 collab 实际上不是：

- “同步 engine operations”

而是：

- “同步整份 document 快照”

这意味着当前 API 是否叫 `patch` 或 `setXxx`，对协同质量几乎没有决定性影响。

真正影响长期协同质量的是：

- engine durable op 是否足够细
- collab 是否真正按 op / field / entity 粒度同步

---

## 长期设计原则

### 1. 公开 API 只暴露 editor 语义，不暴露 engine 结构

React 和产品层调用的应该是：

- 选区语义
- 对象语义
- 交互语义

而不是：

- 底层 patch 结构
- engine command 原样透传
- Yjs / CRDT 细节

### 2. durable write model 决定协同质量

长期协同能不能做对，不取决于 editor facade 名字是否细，而取决于 engine durable op 的 merge unit 是否正确。

错误的做法：

- editor facade 很漂亮
- engine durable op 仍然是整对象 patch
- collab 只能整块覆盖

正确的做法：

- editor facade 可以粗一点
- engine durable op 足够细
- collab 直接同步 durable op

### 3. session / view / document 必须拆开

长期最优应该明确三类写入：

- `session`
  - 本地、瞬时、不可协同
- `view`
  - 本地视图、不可协同
- `document`
  - durable、可撤销、可协同

### 4. 公开 API 用“语义分组”，不是“底层 patch 分组”

公开 API 的理想分组不是：

- `update`
- `updateMany`
- `patch`

而是：

- `nodes.text`
- `nodes.style`
- `edges.labels`
- `groups`
- `mindmaps`

也就是说，按用户心智和领域语义分组。

### 5. plural collection domain 应成为公开 API 主体

长期建议统一用复数 domain：

- `nodes`
- `edges`
- `groups`
- `mindmaps`

原因：

- 大多数命令天然支持批量
- 单个实体只是批量的退化
- 公开 API 一套就够，不需要 `node` / `nodes` 双系统

---

## 最终分层

长期最优建议把 editor 暴露面收敛为四个部分。

```ts
type Editor = {
  read: EditorRead
  state: EditorState
  actions: EditorActions
  input: EditorInput
  configure(...)
  dispose()
}
```

这里我建议长期把 `commands` 改名成 `actions`。

原因不是语法偏好，而是边界更清楚：

- `command` 很容易让人误以为都是 durable write
- `action` 更适合同时容纳 session / view / document intent

如果名字暂时不改，也至少要在内部按这四层设计。

### `read`

只暴露：

- query
- resolved geometry
- presentation read model

不暴露写入能力。

### `state`

只暴露本地 observable state：

- tool
- selection
- edit
- interaction
- viewport

### `actions`

分成三层：

```ts
editor.actions.session.*
editor.actions.view.*
editor.actions.document.*
```

### `input`

只负责把 DOM / pointer / keyboard 输入编译成内部 interaction。

---

## 长期最优公开 API

下面的“公开 API”指 React / app / integration 应该看到的那一层。

## 1. Session API

```ts
editor.actions.session.tool.set(tool)
editor.actions.session.selection.replace(target)
editor.actions.session.selection.add(target)
editor.actions.session.selection.remove(target)
editor.actions.session.selection.toggle(target)
editor.actions.session.selection.clear()
editor.actions.session.selection.selectAll()
editor.actions.session.edit.startNode(nodeId, field, options?)
editor.actions.session.edit.startEdgeLabel(edgeId, labelId, options?)
editor.actions.session.edit.clear()
```

### 应保留

- `tool`
- `selection`
- `edit`

### 应明确

- 这些不是 durable command
- 不进 history
- 不进 collab

### 当前问题

现在这些挂在 `editor.commands` 下，容易被误用成 document 写入。

---

## 2. View API

```ts
editor.actions.view.viewport.set(viewport)
editor.actions.view.viewport.panBy(delta)
editor.actions.view.viewport.zoomTo(zoom, anchor?)
editor.actions.view.viewport.fit(bounds)
editor.actions.view.viewport.reset()
editor.actions.view.viewport.setRect(rect)
editor.actions.view.viewport.setLimits(limits)

editor.actions.view.pointer.set(sample)
editor.actions.view.pointer.clear()

editor.actions.view.space.set(value)

editor.actions.view.draw.set(preferences)
editor.actions.view.draw.slot(slot)
editor.actions.view.draw.patch(patch)
```

### 应保留

- viewport
- draw preferences
- pointer / space

### 应明确

- 这些也是本地 view/session 语义
- 不属于 document API

---

## 3. Document API

这是最重要的一层。

长期建议统一收敛到：

```ts
editor.actions.document.canvas.*
editor.actions.document.nodes.*
editor.actions.document.edges.*
editor.actions.document.groups.*
editor.actions.document.mindmaps.*
editor.actions.document.clipboard.*
```

---

## 3.1 Canvas

### 目标 API

```ts
editor.actions.document.canvas.delete(target, options?)
editor.actions.document.canvas.duplicate(target, options?)
editor.actions.document.canvas.order(target, mode)
```

### 结论

当前 `nodes.delete/duplicate/order` 的方向是对的，但 domain 名不对。

因为这里操作的不是 nodes，而是 canvas target：

- node
- edge
- group selection 展开后的 refs

长期应收敛到 `canvas.*`。

### 当前应该删除的方向

- `nodes.delete`
- `nodes.duplicate`
- `nodes.order`

这三个不应作为长期公开命名保留。

---

## 3.2 Nodes

### 目标 API

```ts
editor.actions.document.nodes.create(payload)
editor.actions.document.nodes.move(ids, delta)
editor.actions.document.nodes.delete(ids)
editor.actions.document.nodes.duplicate(ids)
editor.actions.document.nodes.align(ids, mode)
editor.actions.document.nodes.distribute(ids, mode)

editor.actions.document.nodes.update(ids, update)

editor.actions.document.nodes.text.set(ids, patch)
editor.actions.document.nodes.text.commit(nodeId, field, value, options?)

editor.actions.document.nodes.style.set(ids, patch)
editor.actions.document.nodes.shape.set(ids, patch)
editor.actions.document.nodes.lock.set(ids, locked)

editor.actions.document.nodes.frames.createFromBounds(bounds, options?)
```

### 结论

长期不要再同时保留：

- `node.*`
- `nodes.*`

应该统一保留 `nodes.*`。

单个 node 就传单个 id。

### 为什么

- document command 的默认单位应该是 collection domain
- 单选只是批量的特例
- 这样最不容易扩出平行体系

### 关于 `setXxx`

node 侧 `setFill/setStroke/setColor/setWeight...` 不应该机械地保留为公开 API 表面。

长期最优应该是：

```ts
nodes.style.set(ids, {
  fill?,
  stroke?,
  strokeWidth?,
  opacity?
})

nodes.text.set(ids, {
  color?,
  size?,
  weight?,
  italic?,
  align?
})
```

### 但要注意

这只是 editor facade。

底层 durable op 仍然应该继续用 node record mutation / field mutation，而不是退回整对象覆盖。

也就是说：

- editor facade 可以是 `set(patch)`
- engine durable layer 仍然必须是 field-level

---

## 3.3 Edges

### 目标 API

```ts
editor.actions.document.edges.create(payload)
editor.actions.document.edges.move(ids, delta)
editor.actions.document.edges.reconnect(id, end, target)

editor.actions.document.edges.set(ids, {
  type?,
  textMode?
})

editor.actions.document.edges.style.set(ids, {
  color?,
  width?,
  dash?,
  start?,
  end?
})

editor.actions.document.edges.style.swapMarkers(id)

editor.actions.document.edges.route.insert(id, point)
editor.actions.document.edges.route.move(id, index, point)
editor.actions.document.edges.route.remove(id, index)
editor.actions.document.edges.route.clear(id)

editor.actions.document.edges.labels.add(edgeId)
editor.actions.document.edges.labels.remove(edgeId, labelId)
editor.actions.document.edges.labels.update(edgeId, labelId, {
  text?,
  t?,
  offset?,
  style?
})
```

### 为什么不建议长期保留 `edge.patch`

`edge.patch` 作为 editor facade 入口是可接受的，但不是长期最优命名。

问题在于它把两个不同层级混在一起：

- 顶层标量字段
- style 子域

更坏的是它会诱导继续往里塞：

- `route`
- `labels`
- `source/target`

长期结果就是一个无限膨胀的 super patch。

### 长期最优

把 edge 拆成几个稳定子域：

- `edges.set`
- `edges.style.set`
- `edges.style.swapMarkers`
- `edges.route.*`
- `edges.labels.*`

### 这和协同的关系

editor facade 可以是粗的。

但 engine durable op 绝不能继续是：

- 整个 `style` 对象覆盖
- 整个 `labels[]` 数组覆盖

真正长期最优的 durable op 应该是：

```ts
edge.setType
edge.setTextMode
edge.style.setField
edge.route.insert
edge.route.move
edge.route.remove
edge.label.add
edge.label.remove
edge.label.setText
edge.label.setT
edge.label.setOffset
edge.label.style.setField
```

或者等价地，提供统一的 field/path mutation 体系。

### 结论

- editor facade 层不需要回退到一堆 `setXxx`
- engine durable layer 必须细粒度
- 公开 API 长期最好从 `patch` 收口到按子域组织

---

## 3.4 Groups

### 目标 API

```ts
editor.actions.document.groups.merge(target, options?)
editor.actions.document.groups.ungroup(target, options?)
editor.actions.document.groups.order(ids, mode)
```

### 结论

group 不是 node，也不是 canvas。

它应该保留为独立 document domain：

- `groups`

现在 `group.merge/ungroup` 的思路基本是对的，只是长期最好统一成复数域 `groups`。

---

## 3.5 Frames

### 目标 API

frame 已经是普通 node，不是 container。

所以长期不应该保留一个强独立 `frame` domain。

更合理的归属是：

```ts
editor.actions.document.nodes.frames.createFromBounds(bounds, options?)
```

或者：

```ts
editor.actions.document.frames.createFromBounds(bounds, options?)
```

两者里我更倾向第一种，因为 frame 本质上是 node constructor，而不是独立文档实体系统。

### 结论

- frame read query 可以存在
- frame document command 不应继续长成独立大 domain

---

## 3.6 Mindmaps

### 目标 API

mindmap 现在属于独立图结构，不适合塞进 node/edge API。

长期建议保留独立 domain：

```ts
editor.actions.document.mindmaps.create(...)
editor.actions.document.mindmaps.insert(...)
editor.actions.document.mindmaps.move(...)
editor.actions.document.mindmaps.remove(...)
editor.actions.document.mindmaps.clone(...)
editor.actions.document.mindmaps.update(...)
```

### 结论

mindmap 保持独立 domain 是合理的。

---

## 3.7 Clipboard

### 目标 API

```ts
editor.actions.document.clipboard.export(target?)
editor.actions.document.clipboard.cut(target?)
editor.actions.document.clipboard.insert(packet, options?)
```

### 说明

clipboard 本质上横跨：

- document
- session selection
- browser host

但从 app 的调用心智看，它仍然应该被视为 document action。

---

## Read API 长期最优

## 1. `editor.read` 只保留三类东西

### 基础 query

例如：

- `read.node.item`
- `read.edge.item`
- `read.group.nodeIds`
- `read.index.*`

### resolved geometry / derived model

例如：

- `read.edge.resolved`
- `read.selection.box`
- `read.selection.overlay`

### presentation read model

例如：

- `read.node.toolbar`
- `read.edge.toolbar`
- `read.contextMenu.*`

---

## 2. 不要再把所有 toolbar 都塞进 `selection.toolbar`

长期应明确：

- node toolbar 是 node presentation
- edge toolbar 是 edge presentation
- text toolbar 是 editing presentation

所以长期 read model 应该是：

```ts
read.node.toolbar
read.edge.toolbar
read.text.toolbar
```

而不是继续扩张：

```ts
read.selection.toolbar
```

---

## 3. selection read 应收敛成“基础选择语义”，不要继续承载太多展示细节

selection 适合保留：

- `summary`
- `affordance`
- `geometry/box`
- `overlay`

selection 不适合继续承载：

- node toolbar recipe
- edge toolbar state
- text editing toolbar state

---

## State API 长期最优

长期 `editor.state` 建议只保留本地状态，不混 query：

```ts
state.tool
state.selection
state.edit
state.interaction
state.viewport
state.draw
```

这里最重要的边界是：

- `state` 只表达“当前本地 editor 在什么状态”
- `read` 才负责“根据文档和状态推导出什么”

---

## Engine Durable API 长期最优

这一层才真正决定协同质量。

## 1. Engine 不应该继续暴露大块对象 patch 作为长期主模型

对 node：

- 现在已经有 field / record mutation 体系，这是对的

对 edge：

- 现在仍然太粗

长期应该统一成：

- 标量字段操作
- path / record mutation
- collection member op

## 2. Engine durable op 的理想特征

- 可以单独撤销
- 可以单独协同
- merge unit 小
- 不依赖 UI 现读快照做整块 merge

## 3. 长期建议的 edge durable op

```ts
edge.create
edge.delete
edge.move
edge.reconnectEnd

edge.setType
edge.setTextMode

edge.style.set(field, value)

edge.route.insert
edge.route.move
edge.route.remove
edge.route.clear

edge.label.add
edge.label.remove
edge.label.set(field, value)
edge.label.style.set(field, value)
```

是否一定要实现成这么多操作，不重要。

重要的是 durable op 的 merge unit 要等价于这个粒度。

---

## Collab 长期最优

## 当前状态

当前 collab 实际行为是：

- 本地 commit -> 整份 snapshot 写回 Yjs
- 远端变更 -> diff 不同就 `document.replace`

这不是长期方案。

## 为什么现在 public API 粒度并不决定 collab 质量

因为当前 collab 根本没有消费 editor / engine 的操作粒度。

所以现在：

- `patch`
- `setXxx`
- `labels.patch`

这些公开 API 的细不细，对当前 collab 几乎没有决定性影响。

## 长期最优

collab 层应该直接消费 engine durable op。

理想路径：

```ts
editor action
-> compile to engine durable ops
-> engine commit durable ops
-> collab sync durable ops
-> remote engine apply durable ops
```

而不是：

```ts
editor action
-> engine commit
-> serialize whole snapshot
-> remote replace whole document
```

## 这意味着什么

长期要做真协同，必须同时改两层：

### 1. engine durable op 变细

特别是 edge：

- style
- labels

### 2. collab 不再整文档 replace

它至少应该做到：

- 同步 operation list
- 远端按 operation apply

再往后才考虑：

- Yjs 内部 entity map / field map 级 materialization

---

## 对现有 API 的最终裁决

## 应保留的方向

- editor 分为 `read / state / input / action`
- edge label 作为 edge 子域
- group 作为独立逻辑集合域
- frame 视为普通 node 类型
- toolbar 使用独立 presentation read model

## 应删除的方向

- 把所有 toolbar 都继续塞进 `selection.toolbar`
- 继续混用 `node` / `nodes` 双系统
- 继续让 React 直接拼 engine patch
- 继续把 durable op 做成 edge 整对象浅 patch
- collab 继续长期停留在整文档 snapshot replace

## 应收敛的公开命名

长期建议：

- `commands` -> `actions`
- `node` / `nodes` -> `nodes`
- `edge` -> `edges`
- `group` -> `groups`
- `mindmap` -> `mindmaps`

如果暂时不改名字，也应该先把内部架构按这个方向重组。

---

## 最终推荐结构

```ts
editor.read
editor.state
editor.input
editor.actions.session
editor.actions.view
editor.actions.document.canvas
editor.actions.document.nodes
editor.actions.document.edges
editor.actions.document.groups
editor.actions.document.mindmaps
editor.actions.document.clipboard
```

其中最关键的长期要求只有两条：

### 1. 公开 API 只表达 editor 语义

不要把 engine patch / CRDT 结构泄漏给 React。

### 2. engine durable op 必须是协同友好的真实 merge unit

尤其：

- node 继续走 field / record mutation
- edge 从整块 patch 升级成 field / sub-entity 粒度
- collab 从整文档 replace 升级成 op-based 同步

这才是 whiteboard 整个 editor API 体系的长期最优。
