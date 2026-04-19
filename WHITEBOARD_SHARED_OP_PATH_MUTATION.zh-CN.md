# Whiteboard Shared Op Path Mutation 设计

本文只讨论一件事：

- whiteboard 的 shared operation 层，如何长期正确地支持细粒度 record 更新
- 为什么不能接受粗粒度整字段替换
- 为什么不能接受 generic `splice`
- 为什么所有可协作数组移动都必须收敛到“基于稳定 id 的 move”

本文是 `WHITEBOARD_YJS_CRDT_OPERATION_DESIGN.md` 的补充设计。
如果两者在 record / list 协议上有冲突，以本文为准。

本文不负责 shared op 总类型面的最终命名。
shared op 总 surface 以：

- [`WHITEBOARD_SHARED_OP_TYPES.zh-CN.md`](/Users/realrong/Rostack/WHITEBOARD_SHARED_OP_TYPES.zh-CN.md)

为准。

---

## 0. 结论

先把长期最优结论写死：

- shared op 层必须正式支持 path mutation
- `data` / `style` / 类似 record 字段，不能再以整字段 replace 作为正式协作主路径
- `field patch` bag 不应该继续作为长期正式 shared op
- generic `splice(index, deleteCount, values)` 不能进入长期正式 shared op 协议
- 所有需要多人协作的有序集合，都必须升级为“元素带稳定 id”的集合模型
- 所有集合移动语义，一律使用基于元素 id 的 `move`，不能使用裸 index

换句话说：

- scalar field：`field.set` / `field.unset`
- map / object：`record.set` / `record.unset`
- ordered collection：`insert` / `delete` / `move`
- 不允许“数组既想保留裸 JSON 形状，又想直接用 generic splice 协作”

---

## 1. 为什么必须做 path mutation

如果 shared op 层继续让这些字段走整字段 replace：

- `node.data`
- `node.style`
- `edge.data`
- `edge.style`
- `edge.labels`
- `edge.route`
- `mindmap topic data/style`

会产生三个长期问题：

### 1.1 并发粒度过粗

两个用户同时修改同一个对象树的不同路径时：

- 如果 shared op 只有整字段 replace
- 最终只能整字段 LWW

这会把本来彼此独立的修改强行打成冲突。

### 1.2 payload 过大

用户只改了：

- `data.text`
- `style.color`
- `labels[labelId].text`

如果协议仍然发送整个字段：

- 网络放大明显
- replay 成本明显增大
- undo / redo 也会跟着变粗

### 1.3 无法演进 richer collaboration

如果 shared op 层没有正式 path mutation：

- 后面 rich text
- draw points
- comments / labels
- schema-driven properties

这些都很难继续细化。

所以长期正确做法不是“本地 helper 里支持 path mutation，shared op 里再粗化回整字段”，而是：

- shared op 自己就是 path-aware protocol

---

## 2. 字段模型与寻址模型

shared op 层必须先把“字段是什么”与“字段内部怎么寻址”分开。

长期最优下：

- `field` / `record` / `collection` 是语义模型
- `path` 只是 `record` 模型内部的寻址方式

也就是说，不能因为某个值长得像 object，就把它直接塞进 generic path set/unset。
是否允许 path mutation，先由字段模型决定；只有被判定为 record tree 的字段，才继续进入 path 协议。

### 2.1 Scalar Register

这类字段不再用 patch bag，而是统一进入 `field.set` / `field.unset`：

- `position`
- `size`
- `rotation`
- `layer`
- `zIndex`
- `groupId`
- `owner`
- `locked`
- `textMode`
- `mindmap.layout`
- `mindmap.branchStyle`

这些字段的特点是：

- 语义本身就是小粒度 register
- 不值得再拆 path
- 最小合法更新单位通常是整个 field，而不是 field 内部 path

例如：

- `position`
- `size`
- `owner`
- `source`
- `target`

虽然 JSON 形状看起来也是 object，但它们在 shared op 层更适合作为 atomic field，而不是 record tree。

如果把它们也硬并入 generic root-path 更新：

- `position.x`
- `source.anchor.offset`
- `owner.kind`

协议就必须重新定义大量本来不该由 path 层回答的问题：

- partial write 是否合法
- 缺失 ancestor 是否自动创建
- `unset` 是否允许
- 冲突到底按 register 还是按 record path 裁决

所以这里保留 `field`，不是为了增加类型数，而是为了把 schema 约束留在 field 边界内。

### 2.2 Record Tree

这类字段必须用 path mutation：

- `node.data`
- `node.style`
- `edge.data`
- `edge.style`
- `edge label style/data`
- `mindmap topic data`
- `mindmap topic style`

这些字段的特点是：

- 本质是 object tree
- 并发常发生在不同路径
- 需要细粒度 conflict resolution

也只有这类字段，`path` 才是稳定且值得公开的协议维度。

### 2.3 Ordered Collection

这类字段不能用 generic splice，必须建模成稳定 id 集合：

- `canvas order`
- `edge labels`
- `edge route points`
- 未来任何需要多人同时编辑顺序的列表

这些字段的特点是：

- 顺序本身是语义的一部分
- 裸 index 不是稳定语义
- 并发 move / insert / delete 必须以元素 id 为基准

---

## 3. Path Mutation 协议

### 3.1 基本形状

长期正式协议建议收敛为：

```ts
type RecordScope =
  | { entity: 'node'; id: NodeId; field: 'data' | 'style' }
  | { entity: 'edge'; id: EdgeId; field: 'data' | 'style' }
  | { entity: 'edge.label'; edgeId: EdgeId; labelId: string; field: 'data' | 'style' }
  | { entity: 'mindmap.topic'; mindmapId: MindmapId; topicId: NodeId; field: 'data' | 'style' }

type RecordSetOp = {
  type: 'record.set'
  scope: RecordScope
  path: string
  value: unknown
}

type RecordUnsetOp = {
  type: 'record.unset'
  scope: RecordScope
  path: string
}
```

如果后续不想做 generic `record.*`，也可以拆成：

- `node.record.set`
- `node.record.unset`
- `edge.record.set`
- `edge.record.unset`

本文不强制最终命名，但强制语义。

### 3.2 path 只允许 object path

`path` 必须满足：

- 只包含 object key
- 不包含数组 index
- 不包含“第 3 个元素”这类瞬时位置语义

也就是说：

- `text`
- `theme.color`
- `label.typography.size`

是合法 path。

而：

- `items.0`
- `labels.3.text`
- `points.12.x`

不是合法 path。

### 3.3 set 语义

`record.set(scope, path, value)` 的语义：

- 对目标 record tree 的某个 leaf path 赋值
- 缺失的 object ancestor 自动创建
- ancestor 必须是 object container；如果遇到非 object container，则该 op 非法

例如：

- `theme.color = '#f00'`
- 若 `theme` 不存在，则先创建 `{}` 再写入 `color`

但如果当前 `theme` 已经是字符串：

- 该 op 非法

### 3.4 unset 语义

`record.unset(scope, path)` 的语义：

- 删除 leaf key
- path 不存在时是 no-op

不允许用 `unset` 去表达“删除列表第 N 项”。

### 3.5 exact-path 冲突

两个 change 同时写同一条 path：

- `set` vs `set`
- `set` vs `unset`
- `unset` vs `unset`

都按同一条规则裁决：

- 更晚的 change order key 胜出

### 3.6 ancestor / descendant 冲突

最容易出问题的是：

- 一个 change 改 `a`
- 另一个 change 改 `a.b`

长期正式规则：

- 更晚的 ancestor mutation 可以 shadow 整个子树
- 更晚的 descendant mutation 只影响它自己的 leaf path

也就是说：

- 如果 `set(a, scalar)` 晚于 `set(a.b, x)`，则 `a.b` 被 ancestor 覆盖
- 如果 `set(a, object)` 早于 `set(a.b, x)`，则后者继续在新对象上生效

### 3.7 path mutation 不负责数组协作

如果某个 path 对应值是 ordered collection：

- path mutation 不再继续向下工作
- 必须转入 collection op family

这是一条硬边界。

---

## 4. 为什么 generic splice 不能进入 shared op

`splice(index, deleteCount, values)` 看上去很通用，但它不适合作为长期正式协作协议。

原因很简单：

### 4.1 index 不是稳定语义

并发下最先失效的就是 index。

例如：

- A 在 index 3 插入
- B 在 index 1 删除

回放时：

- A 的 index 3 已经不再指向原对象

### 4.2 splice 混合了太多语义

一个 `splice` 同时可能代表：

- insert
- delete
- replace
- move 的局部近似

这会导致：

- inverse 难解释
- conflict semantics 不清晰
- telemetry / audit 不清晰

### 4.3 splice 不利于 schema 收敛

一旦 shared op 层允许 generic splice：

- 各种集合都会偷懒走裸数组
- 后面很难再要求“请给 label / point / item 引入稳定 id”

所以长期正确的策略是：

- 不要在正式 shared op 层提供 generic splice

---

## 5. Ordered Collection 协议

### 5.1 基本原则

所有有序集合都必须满足：

- 每个元素有稳定 id
- 插入 / 删除 / 移动 / 内容更新 分开建模
- 顺序依赖 anchor，而不是 index

### 5.2 通用形状

建议统一成下面这类语义：

```ts
type ListAnchor<ItemId extends string> =
  | { kind: 'front' }
  | { kind: 'back' }
  | { kind: 'before'; id: ItemId }
  | { kind: 'after'; id: ItemId }

type CollectionInsertOp<Item> = {
  type: 'collection.insert'
  collection: CollectionScope
  item: Item
  to: ListAnchor<string>
}

type CollectionDeleteOp = {
  type: 'collection.delete'
  collection: CollectionScope
  id: string
}

type CollectionMoveOp = {
  type: 'collection.move'
  collection: CollectionScope
  id: string
  to: ListAnchor<string>
}
```

命名可以按具体领域展开，例如：

- `edge.label.insert`
- `edge.label.delete`
- `edge.label.move`
- `edge.route.point.insert`
- `edge.route.point.delete`
- `edge.route.point.move`

### 5.3 move 一律基于 id

这一点必须写死：

- move 的目标永远是 item id
- anchor 永远是 item id
- 不接受 `fromIndex`
- 不接受 `toIndex`

### 5.4 anchor 失效规则

长期建议规则：

- anchor 丢失：no-op
- item 自己不存在：no-op
- anchor 指向 item 自己：no-op

这样能保证：

- replay deterministic
- 不会偷偷降级成意外顺序

### 5.5 item 内容更新

集合元素的内容更新不能回退成整元素 replace。

长期建议：

- 如果元素本质是 atomic field register，就继续用 field op
- 如果元素本质是 record tree，就继续用 record path mutation

例如：

- `edge.label.field.set/unset`
- `edge.label.record.set/unset`
- `edge.route.point.field.set`

---

## 6. 典型领域落地

### 6.1 Node

长期 shared op 建议拆成两层：

#### scalar

- `node.field.set`
- `node.field.unset`

只负责：

- `position`
- `size`
- `rotation`
- `layer`
- `zIndex`
- `groupId`
- `owner`
- `locked`

不再负责：

- `data`
- `style`

#### record

- `node.record.set`
- `node.record.unset`

负责：

- `node.data.*`
- `node.style.*`

### 6.2 Edge

#### scalar

- `edge.field.set`
- `edge.field.unset`

只负责：

- `source`
- `target`
- `type`
- `locked`
- `groupId`
- `textMode`

不再负责：

- `data`
- `style`
- `labels`
- `route`

#### record

- `edge.record.set`
- `edge.record.unset`

负责：

- `edge.data.*`
- `edge.style.*`

#### labels

labels 必须变成稳定 id 集合：

- `edge.label.insert`
- `edge.label.delete`
- `edge.label.move`
- `edge.label.field.set`
- `edge.label.field.unset`
- `edge.label.record.set`
- `edge.label.record.unset`

### 6.3 Edge Route

`route.points` 不能再用整字段 replace，也不能用 generic splice。

长期正确模型：

- 手动 route point 带稳定 `pointId`
- 使用：
  - `edge.route.point.insert`
  - `edge.route.point.delete`
  - `edge.route.point.move`
  - `edge.route.point.field.set`

### 6.4 Mindmap Topic

topic 也是 node，只是有 aggregate 约束。

长期建议：

- `mindmap.topic.field.set`
- `mindmap.topic.field.unset`

负责 scalar：

- `size`
- `rotation`
- `locked`

同时：

- `mindmap.topic.record.set`
- `mindmap.topic.record.unset`

负责：

- `topic.data.*`
- `topic.style.*`

---

## 7. 冲突规则

### 7.1 scalar register

scalar field 继续按 LWW：

- 更晚的 change order key 胜出

### 7.2 record path

record path 冲突按两级规则：

- exact-path：LWW
- ancestor / descendant：更晚 change 对其覆盖范围生效

### 7.3 collection

collection 冲突按 item 维度处理：

- item create / delete：存在性裁决
- item move：按总序依次作用在当前序列
- item content mutation：继续走 field 或 record 规则

### 7.4 delete-wins

如果实体已被 delete-like op 删除：

- 后续或并发的 content mutation 不能 resurrect 它
- delete-wins 继续成立

对于 collection item 也是一样：

- 被 delete 的 label / point / item
- 后续 patch / move 不能复活它

---

## 8. 实现约束

### 8.1 path mutation 是 shared op，不是 command helper

长期最优下，path mutation 不能只停留在本地 helper 层。

也就是说：

- command 层可以接受更高层 update input
- 但 planner 产出的 shared op，自己就必须是 path-aware

不允许：

- command 层是细粒度
- 到 shared op 层又粗化回整字段 replace
- 或重新打包成 `node.patch` / `edge.patch` 这类 bag patch

### 8.2 checkpoint 可以 materialize，live log 不行

即使最终 `Document` checkpoint 里仍然存普通 JSON：

- live shared op 层也不能因此回退到 coarse patch

checkpoint 是物化结果；
shared op 是协作协议。

这两层必须分开。

### 8.3 数组必须先规范化，再协作

任何希望进入正式 shared op 协议的数组字段，都必须先回答三个问题：

1. 元素的稳定 id 是什么
2. 移动的 anchor 是什么
3. 元素内容更新走 field 还是 record mutation

如果答不出来：

- 说明这个数组还不具备协作协议资格

---

## 9. 最终建议

如果只保留一组长期最优原则，就是这四条：

- record tree 一律 path mutation
- ordered collection 一律 stable-id collection op
- 不提供 generic splice
- 不允许 shared op 主路径出现 coarse replace 的 `data/style/labels/route`

一句话总结：

**shared op 层必须直接表达“改哪个 path、移动哪个 item id”，而不是把细粒度用户意图重新压扁成整字段 replace 或 index-based splice。**
