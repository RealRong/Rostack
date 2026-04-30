# Whiteboard Ordered / Tree 底层模型收口方案

## 1. 目标

- 不再把 whiteboard 的结构类变更重复翻译很多遍。
- 不再让 `edge` / `mindmap` 维护自己的“半底层模型”。
- 不再把结构项 patch 借道 host entity 整体回写。
- 不再把细粒度 public op 一路泄漏到 planner / lock / runtime。
- 一步到位收敛到统一底层模型：
  - `entity.*`
  - `ordered.*`
  - `tree.*`
  - `semantic.*`

最终判断标准：

- `edge.label.patch` 不再走 `entity.patch(edge, { labels: ... })`
- `edge.route.point.patch` 不再走 `entity.patch(edge, { route: ... })`
- `mindmap side / collapsed / branchStyle` 不再走 `entity.patch(mindmap, { members.xxx: ... })`
- planner 不再需要 `edge.collection.*` 这种域内中间概念
- planner 不再负责拼结构字符串、拼 host path、拼 whole collection

---

## 2. 当前真正的问题

### 2.1 `edge` 的重复不是 edge 特例，而是 `ordered` 缺 `patch`

现在 `edge.label.patch` / `edge.route.point.patch` 的典型流程还是：

1. 读完整 collection
2. 找 item
3. 生成 patched item
4. 整体回写 host entity

这说明缺的不是 helper，而是底层一等能力：

- `ordered.insert`
- `ordered.move`
- `ordered.delete`
- `ordered.splice`
- `ordered.patch`

只要 `ordered.patch` 缺失，domain 就一定会自己补一层 “读数组 -> 改一项 -> 回写整个字段”。

### 2.2 `mindmap` 的重复不是 planner 写法问题，而是 `tree` 缺 node value patch

mindmap 里混了三类不同层次的东西：

- canvas 顺序
- tree 拓扑
- tree node value

其中：

- `topic insert / move / delete / restore` 属于 `tree`
- `topic side / collapsed / branchStyle` 属于 `tree node value`
- `layout` 才属于 `mindmap entity`

现在 `members.xxx` path patch 仍然大量存在，本质上说明 `tree` 只有拓扑能力，没有 `tree.node.patch`。

### 2.3 `edge.collection.*` 不是长期概念

如果 whiteboard 再发明：

- `edge.collection.insert`
- `edge.collection.move`
- `edge.collection.patch`

这只是把重复从 `edge.ts` 挪到另一层。

长期最优不是再包一层 domain collection runtime，而是直接让底层 `ordered` / `tree` 足够完整。

### 2.4 authored 层没有及时收敛

today 的细 public op 仍然过深地参与：

- compile
- planner
- lock
- runtime

这会导致：

- 同一语义在多处 switch
- domain 自己维护额外 capability 判断
- 底层模型明明只有几类，但上游到下游一直带着大量 op name

长期最优应该是：

- public intent 可以细
- compile 后立刻收敛成少量 authored op
- planner / lock / runtime 只面向底层 authored capability

---

## 3. 最终 API 设计

## 3.1 authored op 顶层只保留四类

```ts
type WhiteboardAuthoredOp =
  | EntityAuthoredOp
  | OrderedAuthoredOp
  | TreeAuthoredOp
  | SemanticAuthoredOp
```

whiteboard 不再长期保留：

- `edge.collection.*`
- `mindmap.member.*`
- `mindmap.branch.*` 这类内部中间 authored 概念

public intent 仍然可以保留业务名词，但 compile 后必须马上收敛。

## 3.2 `ordered` 最终 API

```ts
type OrderedAuthoredOp<TItem = unknown, TPatch = unknown> =
  | {
      type: 'ordered.insert'
      target: OrderedHandle<TItem, TPatch>
      itemId: string
      value: TItem
      to: MutationOrderedAnchor
    }
  | {
      type: 'ordered.move'
      target: OrderedHandle<TItem, TPatch>
      itemId: string
      to: MutationOrderedAnchor
    }
  | {
      type: 'ordered.splice'
      target: OrderedHandle<TItem, TPatch>
      itemIds: readonly string[]
      to: MutationOrderedAnchor
    }
  | {
      type: 'ordered.delete'
      target: OrderedHandle<TItem, TPatch>
      itemId: string
    }
  | {
      type: 'ordered.patch'
      target: OrderedHandle<TItem, TPatch>
      itemId: string
      patch: TPatch
    }
```

关键点：

- `ordered.patch` 是一等能力，不再绕 `entity.patch`
- patch 作用对象是 ordered item，不是 host entity
- inverse / delta / footprint / structural facts 仍然由 shared 底层统一派生

## 3.3 `tree` 最终 API

```ts
type TreeAuthoredOp<TNodeValue = unknown, TPatch = unknown> =
  | {
      type: 'tree.insert'
      target: TreeHandle<TNodeValue, TPatch>
      nodeId: string
      parentId?: string
      index?: number
      value?: TNodeValue
    }
  | {
      type: 'tree.move'
      target: TreeHandle<TNodeValue, TPatch>
      nodeId: string
      parentId?: string
      index?: number
    }
  | {
      type: 'tree.delete'
      target: TreeHandle<TNodeValue, TPatch>
      nodeId: string
    }
  | {
      type: 'tree.restore'
      target: TreeHandle<TNodeValue, TPatch>
      snapshot: MutationTreeSubtreeSnapshot<TNodeValue>
    }
  | {
      type: 'tree.node.patch'
      target: TreeHandle<TNodeValue, TPatch>
      nodeId: string
      patch: TPatch
    }
```

关键点：

- `tree.node.patch` 是一等能力
- patch 对象是 tree node value
- `mindmap side / collapsed / branchStyle` 必须回到这里表达

## 3.4 `entity` 的职责只保留实体本身

`entity.patch` 只处理真正属于实体本身的字段，例如：

- `node.position`
- `node.size`
- `edge.style`
- `edge.data`
- `mindmap.layout`

不再用于表达：

- `edge.labels[].text`
- `edge.route.points[].x`
- `mindmap.members[nodeId].collapsed`

## 3.5 handle 替代裸字符串 target

结构 target 不再由 domain 手工拼字符串。

```ts
interface OrderedHandle<TItem = unknown, TPatch = unknown> {
  kind: 'ordered'
  key: string
}

interface TreeHandle<TNodeValue = unknown, TPatch = unknown> {
  kind: 'tree'
  key: string
}
```

whiteboard 只暴露 handle factory：

```ts
const whiteboardHandles = {
  canvasOrder(): OrderedHandle<CanvasItemRef>
  edgeLabels(edgeId: EdgeId): OrderedHandle<EdgeLabel, EdgeLabelPatch>
  edgeRoutePoints(edgeId: EdgeId): OrderedHandle<EdgeRoutePoint, EdgeRoutePointPatch>
  mindmapTree(mindmapId: MindmapId): TreeHandle<MindmapTopicValue, MindmapTopicPatch>
}
```

长期目标是：

- planner 不再拼 `edge.labels:${edgeId}`
- planner 不再知道结构字符串协议
- lock / delta / structural facts / structure registry 都围绕 handle 收敛

## 3.6 structure spec 补齐 patch 能力

shared/mutation 的 structure spec 需要直接支持 patch，而不是让 domain 自己回写 whole snapshot。

```ts
interface MutationOrderedStructureSpec<TItem, TPatch> {
  read(document: Doc): readonly TItem[]
  identify(item: TItem): string
  clone(item: TItem): TItem
  patch(item: TItem, patch: TPatch): TItem
  write(document: Doc, items: readonly TItem[]): Doc
}

interface MutationTreeStructureSpec<TNodeValue, TPatch> {
  read(document: Doc): MutationTreeSnapshot<TNodeValue>
  clone(value: TNodeValue): TNodeValue
  patch(value: TNodeValue, patch: TPatch): TNodeValue
  write(document: Doc, tree: MutationTreeSnapshot<TNodeValue>): Doc
}
```

关键点：

- patch 规则属于 structure spec
- domain planner 只负责给出 `patch`
- “怎么把 patch 作用到 item / node value” 是底层结构能力，不是每个 domain planner 自己再解释一遍

## 3.7 effect program 仍然是唯一执行真相

custom op 不需要直接返回：

- 完整 inverse
- 完整 delta
- 完整 footprint

它只需要编译成少量 canonical authored effect：

- `entity.*`
- `ordered.*`
- `tree.*`
- `semantic.*`

最终 commit / history 存的仍然是 applied / inverse effect program。

这不叫“又包一层中转”，而是把 custom 语义收敛到底层通用 mutation program。

---

## 4. whiteboard 各域最终映射

## 4.1 canvas

canvas 只是一条 ordered 结构：

```ts
canvas.order.move
-> ordered.move(target = whiteboardHandles.canvasOrder(), ...)
```

不需要额外 domain runtime。

## 4.2 edge

edge 最终只有两条 ordered 结构：

- `edgeLabels(edgeId)`
- `edgeRoutePoints(edgeId)`

对应关系：

- `edge.label.insert/delete/move` -> `ordered.*(edgeLabels(edgeId))`
- `edge.label.patch` -> `ordered.patch(edgeLabels(edgeId), labelId, patch)`
- `edge.route.point.insert/delete/move` -> `ordered.*(edgeRoutePoints(edgeId))`
- `edge.route.point.patch` -> `ordered.patch(edgeRoutePoints(edgeId), pointId, patch)`

只有真正的 edge entity 字段才走 `entity.patch(edge, ...)`。

这意味着现有这类中间层最终都应删除：

- `readItems`
- `patchItem`
- `writePatch`
- “先读 collection，再整体回写 edge”的 planner 代码
- `orderedEdge.ts` 这类只为弥补底层缺项存在的 domain 适配层

## 4.3 mindmap

mindmap 最终拆成三层：

- canvas 顺序 -> `ordered.*(canvasOrder())`
- 树拓扑 -> `tree.*(mindmapTree(id))`
- topic value -> `tree.node.patch(mindmapTree(id), ...)`

对应关系：

- `mindmap.topic.insert/move/delete/restore` -> `tree.*`
- `mindmap.topic.collapse` -> `tree.node.patch(..., { collapsed })`
- `mindmap.branch.patch` -> `tree.node.patch(..., { branchStyle })`
- root branch side 等 node value 变更 -> `tree.node.patch(..., { side })`
- `mindmap.layout` -> `entity.patch(mindmap, { layout })`

这意味着现有这类写法最终都应删除：

- `entity.patch(mindmap, { ['members.xxx']: ... })`
- tree topology 和 node value 混在一起的 planner 分支
- domain 自己维护的 `members.xxx` path patch 逻辑

---

## 5. authored 收敛策略

## 5.1 public intent 可以细，但 authored 必须少

允许保留的 public intent：

- `edge.label.patch`
- `edge.route.point.patch`
- `mindmap.topic.insert`
- `mindmap.topic.collapse`

但 compile 后必须立刻收敛成：

- `ordered.patch`
- `tree.insert`
- `tree.node.patch`
- `entity.patch`

## 5.2 planner 只做三件事

长期最优下，planner 只做：

1. 读当前状态
2. 做业务校验
3. 产 canonical effect program

planner 不再做：

- 结构字符串拼接
- host entity whole collection 回写
- `members.xxx` path 组装
- 自己推 inverse / delta / footprint

## 5.3 lock / audit / validate 只看 authored capability

`lock.ts`、审计、校验，不再 switch 大量 public op 名字。

它们只看：

- `ordered` on `canvasOrder`
- `ordered` on `edgeLabels(edgeId)`
- `ordered` on `edgeRoutePoints(edgeId)`
- `tree` on `mindmapTree(id)`
- `entity` on `mindmap / node / edge`

这样 public naming 与底层执行能力解耦。

---

## 6. 可以直接删除的重复层

完成底层收口后，下列类型的代码都应该直接删除，而不是继续保留：

- domain collection adapter
- whole collection patch helper
- `members.xxx` path patch helper
- 只为拼 structure key 存在的 helper
- planner 内部的 `patchItem` / `writePatch` / `readPatch` 配置协议
- 只为 preview no-op move 而存在的 domain 结构模拟层

如果某段代码的职责只是：

- 补 `ordered.patch`
- 补 `tree.node.patch`
- 把结构项 patch 转成 host entity patch

那它不是长期资产，最终都应该删掉。

---

## 7. 实施方案

## Phase 1：shared/mutation 补底层能力

- 新增 `ordered.patch`
- 新增 `tree.node.patch`
- `effect.ts` / `effectBuilder.ts` 补齐对应 effect authoring API
- `effectApply.ts` / `structural.ts` 统一实现 apply / inverse / no-op / structural facts
- `effectMaterialize.ts` 支持 materialize 成 canonical authored op
- commit / history / applyProgram 全部以新 effect program 为唯一真相

验收标准：

- 底层已经能独立表达 ordered item patch 与 tree node value patch
- 任何 domain 不需要再借道 `entity.patch(host, wholeCollection)`

## Phase 2：handle + spec 收口

- 引入 `OrderedHandle` / `TreeHandle`
- structure registry 改为围绕 handle 提供 spec
- `ordered.patch` / `tree.node.patch` 直接调用 spec.patch
- domain 不再手工拼结构 key 字符串

验收标准：

- planner 调用底层 API 时只拿 handle，不碰字符串协议
- patch 行为完全由结构 spec 执行

## Phase 3：whiteboard authored 收敛

- compile 仍可接收细 public intent
- compile 输出改为 canonical authored op
- `edge` / `mindmap` 不再把细 public op 直接喂给 custom planner

验收标准：

- planner / lock / runtime 不再以细 public op 枚举为核心输入
- authored 层只剩 `entity / ordered / tree / semantic`

## Phase 4：edge 重写到底层模型

- `edge.label.*` 全部改成 `ordered.*(edgeLabels(edgeId))`
- `edge.route.point.*` 全部改成 `ordered.*(edgeRoutePoints(edgeId))`
- 删除 domain collection patch adapter
- 删除 whole collection 回写链路

验收标准：

- `edge.ts` 里不再出现“读数组 -> 改 item -> 整体回写 edge”
- `orderedEdge.ts` 这类过渡文件可以删除

## Phase 5：mindmap 重写到底层模型

- `mindmap.topic.*` 拆分为 canvas ordered / tree topology / tree node value / entity layout
- `side / collapsed / branchStyle` 统一改走 `tree.node.patch`
- 删除 `members.xxx` path patch 方案

验收标准：

- `mindmap.ts` 不再混用 tree 拓扑和 entity path patch
- `mindmap.layout` 成为 mindmap entity 的唯一核心 patch 入口

## Phase 6：lock / validate / tests 收口

- lock 基于 authored capability，而不是 public op 名称
- validate / audit / tests 围绕底层 authored model 重写
- 删除已经失效的 helper 与兼容层

验收标准：

- 同一语义只在一处 capability 层表达
- 不再保留旧路径兼容、不保留双实现

---

## 8. 最终结论

最简单、长期最优的方案不是继续抽 `edge.collection.*`，也不是继续给 domain planner 加 helper。

真正该做的是：

1. 让 `shared/mutation` 原生支持 `ordered.patch` 和 `tree.node.patch`
2. 让 structure spec 原生支持 item / node value patch
3. 让 compile 后立刻收敛到 `entity / ordered / tree / semantic`
4. 让 whiteboard 只提供 handle、业务校验和少量 domain value 规则

这样做之后：

- `edge` 不再是一套特例
- `mindmap` 不再是一套特例
- `canvas` 也不再是一套特例

它们都只是同一套 mutation 底层模型在 whiteboard 域内的不同 target。
