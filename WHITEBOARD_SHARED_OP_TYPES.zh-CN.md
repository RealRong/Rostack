# Whiteboard Shared Op Type Surface

本文定义 whiteboard 长期最优的 shared operation type surface。

目标只有一个：

- 把正式共享协议层收敛成一套语义清晰、冲突规则可定义、不会重新粗化用户意图的 op family

本文与以下文档互补：

- [`WHITEBOARD_SHARED_OP_PATH_MUTATION.zh-CN.md`](/Users/realrong/Rostack/WHITEBOARD_SHARED_OP_PATH_MUTATION.zh-CN.md)
- [`WHITEBOARD_YJS_CRDT_OPERATION_DESIGN.md`](/Users/realrong/Rostack/WHITEBOARD_YJS_CRDT_OPERATION_DESIGN.md)

如果三者冲突：

1. 本文决定 shared op 的正式 type surface
2. path mutation 文档决定 record / collection 细节
3. YJS 文档决定协作排序、checkpoint、replay contract

---

## 0. 结论

长期最优下，shared op 层不应该再保留：

- `node.patch`
- `edge.patch`
- `group.patch`
- `mindmap.topic.patch`
- `mindmap.branch.patch`

这类 heterogeneous patch bag。

正式共享协议应该收敛为四类 op：

### 0.1 Existence Op

- `create`
- `delete`
- `restore`

### 0.2 Structural Op

- `canvas.order.move`
- `mindmap.topic.insert`
- `mindmap.topic.move`
- `mindmap.topic.delete`
- `edge.label.insert/delete/move`
- `edge.route.point.insert/delete/move`

### 0.3 Field Op

- `<entity>.field.set`
- `<entity>.field.unset`

### 0.4 Record Op

- `<entity>.record.set`
- `<entity>.record.unset`

换句话说：

- bag patch 不进入长期正式 shared op
- scalar / small-register 统一成 field set/unset
- record tree 统一成 record set/unset
- ordered collection 统一成 stable-id structural op

---

## 1. 为什么 patch bag 不是长期最优

### 1.1 一个 op 混了多种语义

`node.patch` 这种 op 往往同时允许：

- top-level scalar 更新
- optional field 清空
- `data` / `style` 整树替换

这三类东西的冲突规则完全不同，塞进一个协议类型里，长期一定会糊。

### 1.2 patch bag 鼓励粗粒度更新

一旦 shared op 层保留 `patch`：

- 本地 planner 很容易偷懒，把多处细粒度意图重新合并成一个粗 patch
- 协作层又会退回整字段 LWW

这和 long-term path mutation 方向相冲突。

### 1.3 inverse / reject / telemetry 都更难解释

如果协议里是一条 `node.patch`：

- inverse 往往会退化成一包旧值快照
- reject 难以指出是哪一个字段或哪一条 path 失效
- telemetry 很难直接回答“用户到底改了什么”

而 `field.set` / `record.set` 则天然精确。

### 1.4 batch 已经提供了“多字段原子提交”

去掉 patch bag 不意味着失去一次改多个字段的能力。

因为 shared change 本来就是：

- `ops: Operation[]`

所以同一次用户操作，完全可以生成一个小 batch：

```ts
[
  { type: 'node.field.set', id, field: 'size', value: nextSize },
  { type: 'node.field.set', id, field: 'rotation', value: nextRotation },
  { type: 'node.record.set', id, scope: 'style', path: 'color', value: '#f00' }
]
```

原子性还在，语义反而更清楚。

---

## 2. 为什么不是所有对象都 path 化

很多字段从 JSON 形状上看也是 object，但这不意味着它们在 shared op 层应该一律走 path mutation。

长期最优下，判断标准不是“是不是 object”，而是：

- 这个值是不是内核已知 schema 的 atomic field
- 还是开放扩展的 record tree

### 2.1 Atomic Field 与 Record Tree 的区别

`field` 的特点是：

- key 空间有限
- value type 固定
- 合法性由内核 schema 直接定义
- 最小合法更新单位通常是整个 field

`record` 的特点是：

- key/path 空间开放
- 值结构可扩展
- 允许不同路径独立并发修改
- 需要 ancestor / descendant 冲突规则

这里要额外强调一件事：

- `path` 只是 record tree 内部的寻址方式
- `field` / `record` 才是 shared op 的语义分层

也就是说，`path` 解决的问题是“在一个开放 object tree 里写哪一条 leaf”；
它不负责回答“这个字段是否允许被拆成内部局部更新”。

如果把两者混成一件事，协议就会退化成：

- `set('position.x', 10)`
- `set('owner.kind', 'mindmap')`
- `set('data.theme.primary', '#f00')`

表面上全都只是 path set，但实际上它们属于完全不同的语义域：

- `position` / `owner` 是 schema-known atomic field
- `data` 是开放 record tree

这两类东西如果共用同一套“根路径更新”协议，就会立刻丢失：

- 哪些字段允许 auto-create ancestor
- 哪些字段允许 partial update
- 哪些字段可以 `unset`
- 哪些冲突按 field register 处理，哪些冲突按 record path 处理

所以长期最优不是“所有更新统一成根路径 `set/unset`”，而是：

- 先按字段语义分成 `field` 与 `record`
- 只有进入 `record` 的那部分，才继续使用 `path`

所以不是“凡是 object 都 path 化”，而是：

- schema-known atomic field 保留 field 边界
- 开放 record tree 才进入 path mutation

### 2.2 为什么 `position/size/owner/source/target/layout` 不应该 path 化

这些值虽然长得像 object，但它们更像 atomic field，而不是 record tree。

原因：

- `position` 的最小合法单位通常是整个 `Point`
- `size` 的最小合法单位通常是整个 `Size`
- `owner` 的最小合法单位通常是整个 `NodeOwner`
- `source` / `target` 的最小合法单位通常是整个 `EdgeEnd`
- `mindmap.layout` 的最小合法单位通常是整个 layout field 或显式声明过的 layout field set

如果把这些东西也压成 path：

- `position.x`
- `owner.kind`
- `source.anchor.offset`

协议就必须额外回答很多原本不值得回答的问题：

- 只改 `owner.kind` 不改 `owner.id` 合不合法
- 只改 `position.x` 不改 `position.y` 合不合法
- `source.anchor` 缺失时可不可以自动创建
- `layout.side` 和 `layout.mode` 是否完全独立

这些问题本质上不是 path mutation 应该解决的问题，而是 field schema 应该直接约束的问题。

### 2.3 为什么 `data/style` 必须 path 化

`data` / `style` 与上面这些 field 相反，它们本来就是开放 record tree。

它们的特点是：

- 内核不应预先枚举所有 key
- 不同路径的并发修改是常态
- 自动创建 object ancestor 是合理语义

因此：

- `data.text`
- `style.color`
- `data.theme.primary`

这些路径应该进入正式的 `record.set/unset` 协议。

### 2.4 collection 更不能 path 化

ordered collection 比 record tree 更特殊：

- 它不是 object tree
- 它的核心语义是顺序和元素身份

所以：

- collection 不应该走 path mutation
- collection 也不应该走 generic `splice`
- collection 必须走 stable-id structural op

例如：

- `canvas.order.move`
- `edge.label.insert/delete/move`
- `edge.route.point.insert/delete/move`

### 2.5 一句话原则

长期正式 shared op 层的分层原则是：

- existence / structure：保留语义 op
- atomic field：`field.set/unset`
- record tree：`record.set/unset`
- ordered collection：stable-id collection op

而不是：

- “凡是对象都 path 化”

---

## 3. Shared Op 的正式分类

### 3.1 Existence Op

这类 op 负责实体存在性。

```ts
type Op =
  | { type: 'node.create'; node: NodeSnapshot }
  | { type: 'node.delete'; id: NodeId }
  | { type: 'node.restore'; node: NodeSnapshot; slot?: CanvasSlot }
  | { type: 'edge.create'; edge: EdgeSnapshot }
  | { type: 'edge.delete'; id: EdgeId }
  | { type: 'edge.restore'; edge: EdgeSnapshot; slot?: CanvasSlot }
  | { type: 'group.create'; group: GroupSnapshot }
  | { type: 'group.delete'; id: GroupId }
  | { type: 'group.restore'; group: GroupSnapshot }
  | { type: 'mindmap.create'; ... }
  | { type: 'mindmap.delete'; id: MindmapId }
  | { type: 'mindmap.restore'; ... }
```

这些 op 不能被 `set/unset` 替代。

### 3.2 Structural Op

这类 op 负责序列和树结构。

```ts
type Op =
  | { type: 'canvas.order.move'; refs: CanvasItemRef[]; to: CanvasOrderAnchor }
  | { type: 'mindmap.topic.insert'; ... }
  | { type: 'mindmap.topic.move'; ... }
  | { type: 'mindmap.topic.delete'; ... }
  | { type: 'edge.label.insert'; ... }
  | { type: 'edge.label.delete'; ... }
  | { type: 'edge.label.move'; ... }
  | { type: 'edge.route.point.insert'; ... }
  | { type: 'edge.route.point.delete'; ... }
  | { type: 'edge.route.point.move'; ... }
```

这些 op 也不能被 generic path set/unset 替代。

### 3.3 Field Op

这类 op 负责小粒度 register。

```ts
type NodeField =
  | 'position'
  | 'size'
  | 'rotation'
  | 'layer'
  | 'zIndex'
  | 'groupId'
  | 'owner'
  | 'locked'

type EdgeField =
  | 'source'
  | 'target'
  | 'type'
  | 'locked'
  | 'groupId'
  | 'textMode'

type GroupField =
  | 'locked'
  | 'name'

type MindmapTopicField =
  | 'size'
  | 'rotation'
  | 'locked'

type MindmapBranchField =
  | 'color'
  | 'line'
  | 'width'
  | 'stroke'
```

```ts
type Op =
  | { type: 'node.field.set'; id: NodeId; field: NodeField; value: unknown }
  | { type: 'node.field.unset'; id: NodeId; field: Exclude<NodeField, 'position'> }
  | { type: 'edge.field.set'; id: EdgeId; field: EdgeField; value: unknown }
  | { type: 'edge.field.unset'; id: EdgeId; field: Exclude<EdgeField, 'source' | 'target' | 'type'> }
  | { type: 'group.field.set'; id: GroupId; field: GroupField; value: unknown }
  | { type: 'group.field.unset'; id: GroupId; field: GroupField }
  | { type: 'mindmap.topic.field.set'; id: MindmapId; topicId: NodeId; field: MindmapTopicField; value: unknown }
  | { type: 'mindmap.topic.field.unset'; id: MindmapId; topicId: NodeId; field: Exclude<MindmapTopicField, 'size'> }
  | { type: 'mindmap.branch.field.set'; id: MindmapId; topicId: NodeId; field: MindmapBranchField; value: unknown }
  | { type: 'mindmap.branch.field.unset'; id: MindmapId; topicId: NodeId; field: MindmapBranchField }
```

### 3.4 Record Op

这类 op 负责 object tree path mutation。

```ts
type Op =
  | { type: 'node.record.set'; id: NodeId; scope: 'data' | 'style'; path: string; value: unknown }
  | { type: 'node.record.unset'; id: NodeId; scope: 'data' | 'style'; path: string }
  | { type: 'edge.record.set'; id: EdgeId; scope: 'data' | 'style'; path: string; value: unknown }
  | { type: 'edge.record.unset'; id: EdgeId; scope: 'data' | 'style'; path: string }
  | { type: 'edge.label.record.set'; edgeId: EdgeId; labelId: string; scope: 'data' | 'style'; path: string; value: unknown }
  | { type: 'edge.label.record.unset'; edgeId: EdgeId; labelId: string; scope: 'data' | 'style'; path: string }
  | { type: 'mindmap.topic.record.set'; id: MindmapId; topicId: NodeId; scope: 'data' | 'style'; path: string; value: unknown }
  | { type: 'mindmap.topic.record.unset'; id: MindmapId; topicId: NodeId; scope: 'data' | 'style'; path: string }
```

---

## 4. 哪些东西不需要统一成 set/unset

你的问题是“能否统一成 set/unset”，答案是：

- 对 patch bag：可以，而且应该
- 对整个 shared op 层：不能

原因是：

### 4.1 `create/delete/restore` 是存在性语义

它们不是“给某个字段赋值”。

### 4.2 `canvas.order.move` 是序列语义

它不是 path set。

### 4.3 `mindmap.topic.insert/move/delete` 是树结构语义

它们有 parent、slot、cycle、cascade 这类结构约束，不能压成 set/unset。

所以长期最优不是“全协议只剩 set/unset”，而是：

- patch bag 消失
- set/unset 成为 update 主体
- 结构性语义 op 继续保留

---

## 5. 从旧 patch family 到新 type surface 的映射

### 5.1 Node

旧：

- `node.patch`

新：

- `node.field.set/unset`
- `node.record.set/unset`

映射：

- `position` -> `node.field.set`
- `size` -> `node.field.set`
- `rotation` -> `node.field.set`
- `layer` -> `node.field.set/unset`
- `zIndex` -> `node.field.set/unset`
- `groupId` -> `node.field.set/unset`
- `owner` -> `node.field.set/unset`
- `locked` -> `node.field.set/unset`
- `data.*` -> `node.record.set/unset`
- `style.*` -> `node.record.set/unset`

### 5.2 Edge

旧：

- `edge.patch`

新：

- `edge.field.set/unset`
- `edge.record.set/unset`
- `edge.label.*`
- `edge.route.point.*`

映射：

- `source/target/type/locked/groupId/textMode` -> `edge.field.set/unset`
- `data.*` / `style.*` -> `edge.record.set/unset`
- `labels` -> `edge.label.insert/delete/move/field.set/record.set`
- `route.points` -> `edge.route.point.insert/delete/move/field.set`

### 5.3 Group

旧：

- `group.patch`

新：

- `group.field.set/unset`

### 5.4 Mindmap Topic

旧：

- `mindmap.topic.patch`

新：

- `mindmap.topic.field.set/unset`
- `mindmap.topic.record.set/unset`

### 5.5 Mindmap Branch

旧：

- `mindmap.branch.patch`

新：

- `mindmap.branch.field.set/unset`

---

## 6. Conflict Surface

这套 type surface 的价值之一，是把冲突面直接变成类型面。

### 6.1 Field Op

冲突规则：

- 同 field：LWW
- `unset` 只允许 optional field

### 6.2 Record Op

冲突规则：

- exact-path：LWW
- ancestor / descendant：覆盖范围裁决

### 6.3 Collection Structural Op

冲突规则：

- item 存在性：delete-wins
- move：按总序依次作用在当前序列
- anchor 丢失：no-op

这比 patch bag 更容易定义，也更容易实现。

---

## 7. 实现边界

### 7.1 planner 不得再把细粒度 intent 重新粗化成 patch

长期正式实现要求：

- planner 可以接收高层 command input
- 但 planner 产出的 shared op 必须直接使用本文件定义的 op family

不允许：

- command 层是细粒度
- 到 shared op 层又合成 `node.patch`

### 7.2 reducer 可以继续批量 apply，但协议不能退回 bag patch

reducer 内部怎么做可以是实现问题；
shared op type surface 必须稳定。

### 7.3 checkpoint 允许物化，live log 不允许粗化

checkpoint 里仍然可以存普通 document snapshot。

但：

- live shared op 不能因此退化成粗粒度 patch

---

## 8. 推荐的长期正式 surface

如果要一句话总结最终类型面，就是：

- 实体存在性：`create/delete/restore`
- 结构：`move/insert/delete`
- 标量字段：`field.set/unset`
- record tree：`record.set/unset`

而不是：

- 一个 `patch` 把所有语义全打包

一句话结论：

**shared op 层长期最优不是“只有 set/unset”，而是“去掉 patch bag，让更新统一成 field.set/unset 与 record.set/unset，同时保留存在性和结构性语义 op”。**
