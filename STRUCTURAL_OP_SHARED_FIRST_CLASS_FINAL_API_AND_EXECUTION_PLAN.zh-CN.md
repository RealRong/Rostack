# Structural Op Shared First-Class Final API And Execution Plan

## 目标

回答一个明确问题：

- `structural op` 是否应该全部上收到 `shared`
- 上收后会不会破坏 `move` / `insert` / `delete` 这类协作细粒度语义
- whiteboard / dataview 最终应该如何基于 shared 组织结构编辑链路

本文只保留长期最优结论，不保留兼容、过渡、多套实现。

---

## 最终结论

`structural op` 应该上收到 `shared`，但上收对象必须是 **first-class structural primitive**，不是把 whiteboard 现有 custom op 名字原样搬进 `shared`。

最终 shared 只拥有两类 canonical 写入能力：

- canonical entity op
- canonical structural op

其中：

- canonical entity op 负责实体自身存在性与字段内容
- canonical structural op 负责顺序关系、树关系、成员关系这类结构语义

最终不允许的做法：

- 把 `move` 退化成 `patch`
- 把 whiteboard 的领域语义直接塞进 `shared`
- 让 `shared` 通过 document diff 反推 structural semantic
- 让 app-local custom reducer 长期保留一整套结构执行 DSL

---

## 为什么要上收

不把 structural op 上收到 shared，长期一定会重复出现同一类问题：

- 每个 app 自己维护一套 ordered collection move/insert/delete
- 每个 app 自己维护一套 tree insert/move/delete
- 每个 app 自己维护一套 inverse/slot/anchor/footprint
- 每个 app 自己决定哪些结构变化应该怎样表达 delta

这样会导致：

- 逻辑重复
- 逆操作语义不统一
- footprint 粒度不稳定
- 协作冲突规则在各 app 间漂移

把 structural primitive 上收后，shared 可以统一提供：

- 结构原语执行
- 逆操作生成
- footprint 基础粒度
- anchor / slot / parent-position 语义
- canonical replay 语义

这不会天然损伤协作细粒度，前提是 structural primitive 仍然保持显式 `move` / `insert` / `delete` 语义，而不是退化为粗粒度 patch。

---

## 关键边界

最重要的边界只有一句话：

**shared 只能拥有通用结构语义，不能拥有领域语义。**

shared 可以知道：

- 一个 item 被插入到 ordered collection
- 一个 item 从 ordered collection 中移动到另一个 anchor
- 一个 tree node 被插入到某个 parent
- 一个 subtree 被移动到另一个 parent/index
- 一个 subtree 被删除

shared 不应该知道：

- 什么是 `mindmap`
- 什么是 `edge label`
- 什么是 `route point`
- 插入 topic 时需要补哪些 whiteboard node 字段
- 哪些结构变化要额外触发 `mindmap.layout`
- 哪些结构变化要转成 editor-scene 的 graph invalidation

这些都是 app semantic，不属于 shared。

---

## 最终分层

最终写入层固定分成三层：

### 1. shared canonical entity op

负责实体本身：

- `node.create / node.patch / node.delete`
- `edge.create / edge.patch / edge.delete`
- `mindmap.create / mindmap.patch / mindmap.delete`
- dataview 各种 entity create/patch/delete

它只表达：

- 实体是否存在
- 字段/record 是否变化

### 2. shared canonical structural op

负责结构本身：

- ordered collection primitive
- tree primitive
- relation membership primitive

它只表达：

- item 在结构中的位置变化
- parent / index / anchor / before / after / slot
- 删除与恢复所需的结构定位信息

### 3. app orchestration

负责领域动作拆解。

例如一个 whiteboard 领域 op 最终可以展开为：

- 若干 entity op
- 若干 structural op
- 明确的 app semantic delta
- 明确的 app semantic footprint 补充

app orchestration 是允许存在的，但它不再自己实现结构算法，只负责编排 shared primitive。

---

## 什么适合上收到 shared

下面这些是明确适合上收的。

### ordered collection primitive

统一抽象：

- `insert`
- `move`
- `delete`

适合承接：

- `canvas.order.move`
- `edge.label.insert`
- `edge.label.move`
- `edge.label.delete`
- `edge.route.point.insert`
- `edge.route.point.move`
- `edge.route.point.delete`

原因：

- 它们本质都是“有序成员集合”
- 都依赖 anchor/slot
- 都需要稳定 inverse
- 都需要细粒度协作，不应退化成 patch

### tree primitive

统一抽象：

- `insert child`
- `move subtree`
- `delete subtree`
- `restore subtree`

适合承接：

- `mindmap.topic.insert`
- `mindmap.topic.move`
- `mindmap.topic.delete`
- `mindmap.topic.restore`

但注意，这里上收的是 **树结构部分**，不是整个 whiteboard topic 领域操作。

---

## 什么不应该上收到 shared structural

下面这些不属于 shared structural op。

### `mindmap.move`

这不是 tree structural change。

它的本质是：

- root node 的真实 geometry 变化
- 以及 app 级 `mindmap.layout` 语义

它不应该伪装成 shared structural op。

### `mindmap.layout`

这是 layout semantic，不是结构 primitive。

### `mindmap.topic.patch`

这是 node content / geometry patch。

### `mindmap.branch.patch`

这是领域样式语义。

### `mindmap.topic.collapse`

它会影响可见布局，但不是 tree structure 本身变化。
最终应视为 app semantic，而不是 shared structural primitive。

---

## 语义风险与正确做法

### 风险 1：把领域 op 原样搬进 shared

错误做法：

- 在 shared 里定义 `mindmap.topic.insert`
- shared 里知道 `owner.kind = 'mindmap'`
- shared 里知道 `members / children / branchStyle / collapsed`

结果：

- shared 被 whiteboard 绑定
- shared 不再是 reusable structural layer
- dataview 或后续 app 无法自然复用

正确做法：

- shared 只定义 tree insert/move/delete primitive
- whiteboard 自己把领域动作拆成 entity op + tree primitive + semantic delta

### 风险 2：把 `move` 降成 patch

错误做法：

- 把 ordered move 变成“整个数组 patch”
- 把 subtree move 变成“members/children record patch”

结果：

- 协作粒度退化
- inverse 不稳定
- conflict 规则变粗
- 无法保留 before/after/slot 级语义

正确做法：

- `move` 仍然是 first-class op
- 只把位置关系显式编码出来

### 风险 3：shared 负责 app semantic delta 命名

错误做法：

- shared tree move 自动产出 `mindmap.structure`
- shared ordered move 自动产出 `canvas.order`

结果：

- shared 对 app semantic naming 产生依赖
- shared 无法泛化给别的 domain

正确做法：

- shared structural runtime 只返回结构变化事实
- app mapping 决定如何映射成 `mindmap.structure` / `canvas.order` / `edge.labels` / `edge.route`

---

## 最终 API 方向

shared 最终需要 first-class structural schema，但不绑定具体 app domain 名字。

### 1. ordered structure primitive

示意：

```ts
type StructuralOrderedMoveOp = {
  type: 'structural.ordered.move'
  structure: string
  itemId: string
  to:
    | { kind: 'start' }
    | { kind: 'end' }
    | { kind: 'before'; itemId: string }
    | { kind: 'after'; itemId: string }
}

type StructuralOrderedInsertOp<TValue> = {
  type: 'structural.ordered.insert'
  structure: string
  itemId: string
  value?: TValue
  to:
    | { kind: 'start' }
    | { kind: 'end' }
    | { kind: 'before'; itemId: string }
    | { kind: 'after'; itemId: string }
}

type StructuralOrderedDeleteOp = {
  type: 'structural.ordered.delete'
  structure: string
  itemId: string
}
```

`structure` 是 app 提供的结构标识，不是 shared 固定写死的领域名。

### 2. tree structure primitive

示意：

```ts
type StructuralTreeInsertOp<TNode> = {
  type: 'structural.tree.insert'
  structure: string
  nodeId: string
  parentId: string
  index?: number
  value?: TNode
}

type StructuralTreeMoveOp = {
  type: 'structural.tree.move'
  structure: string
  nodeId: string
  parentId: string
  index?: number
}

type StructuralTreeDeleteOp = {
  type: 'structural.tree.delete'
  structure: string
  nodeId: string
}

type StructuralTreeRestoreOp<TSnapshot> = {
  type: 'structural.tree.restore'
  structure: string
  snapshot: TSnapshot
}
```

这里 shared 只负责树关系。

如果某个领域动作还需要：

- 创建实体
- 删除实体
- 修改 owner
- 修改 layout

这些仍然由 app orchestration 组合出来。

---

## delta 与 footprint 的最终职责

这是最容易做错的地方。

### shared structural runtime 负责什么

shared structural runtime 可以稳定负责：

- 结构 primitive 的执行
- inverse 所需 slot/anchor/parent/index 信息
- 结构原语自身的 direct footprint

### app mapping 负责什么

app mapping 负责把结构变化映射成 app semantic：

- ordered move of canvas -> `canvas.order`
- edge label ordered change -> `edge.labels`
- edge route point ordered change -> `edge.route`
- tree structure change of mindmap -> `mindmap.structure`
- tree layout-affecting semantic -> `mindmap.layout`

### 最终规则

- `delta` 只表达 semantic meaning
- `footprint` 只表达 conflict boundary
- derived geometry 不进入 mutation contract
- shared structural 不替 app 命名 semantic delta

---

## whiteboard 最终映射

### 应该改成 shared structural 的

- `canvas.order.move`
  映射到 ordered move primitive
  app semantic delta: `canvas.order`

- `edge.label.insert / move / delete`
  映射到 ordered insert/move/delete primitive
  app semantic delta: `edge.labels`

- `edge.route.point.insert / move / delete`
  映射到 ordered insert/move/delete primitive
  app semantic delta: `edge.route`

- `mindmap.topic.insert / move / delete / restore`
  树关系部分映射到 tree primitive
  app semantic delta: `mindmap.structure`
  如有 layout 语义，再由 app 显式补 `mindmap.layout`

### 不改成 shared structural 的

- `mindmap.move`
- `mindmap.layout`
- `mindmap.topic.patch`
- `mindmap.branch.patch`
- `mindmap.topic.collapse`

这些继续保留为 app semantic reducer，但其内部尽量只做 entity op / semantic delta，不再自带结构算法。

---

## dataview 最终映射

dataview 大概率不需要像 whiteboard 那么厚的 structural primitive 集合，但应该直接复用 shared 的同一套能力，而不是再做一套轻量变体。

最终原则：

- dataview 如果存在 ordered relation / group / tree / nesting
- 直接落 shared structural primitive
- 不在 dataview 再包第二套“简化结构 op”

shared 的存在价值不是“whiteboard 专用”，而是所有 app 用同一套结构 calculus。

---

## 最终一句话

长期最优不是：

- 把 whiteboard 现有 custom op 名字整体搬进 shared

而是：

- 让 shared 拥有有限、稳定、无领域偏见的 first-class structural primitive
- 让 app 用 entity op + structural op + semantic delta mapping 组合领域动作

这样既不会破坏 `move` 的细粒度协作语义，也不会让 shared 失控地吞掉 app domain。

---

## 分阶段实施方案

实施原则固定为：

- 每个阶段直接落最终 API
- 不做兼容层
- 不保留 app-local 第二套结构实现
- 阶段完成后，旧入口立即删除

### 阶段 1：shared 增加 first-class structural contracts

目标：

- 在 `shared/mutation` 内补 canonical structural op contract

工作项：

- 定义 ordered primitive op
- 定义 tree primitive op
- 定义 structural inverse contract
- 定义 structural footprint contract
- structural runtime 只返回结构事实，不返回 app semantic delta 名字

完成标准：

- shared 已经可以独立执行 ordered/tree structural primitive
- `move` 没有退化成 patch

### 阶段 2：whiteboard ordered structure 全量迁移

目标：

- 把 ordered collection 结构算法从 whiteboard custom reducer 删除

工作项：

- `canvas.order.move` 接 shared ordered move
- `edge.label.insert/move/delete` 接 shared ordered primitive
- `edge.route.point.insert/move/delete` 接 shared ordered primitive
- whiteboard 只保留 semantic delta mapping：
  - `canvas.order`
  - `edge.labels`
  - `edge.route`

完成标准：

- whiteboard custom reducer 不再维护 ordered move/insert/delete 算法
- ordered inverse/slot/anchor 统一来自 shared

### 阶段 3：whiteboard tree structure 迁移

目标：

- 把 mindmap tree 结构算法迁到 shared tree primitive

工作项：

- `mindmap.topic.insert/move/delete/restore` 拆成：
  - entity op
  - shared tree primitive
  - explicit semantic delta mapping
- 明确区分：
  - `mindmap.structure`
  - `mindmap.layout`

完成标准：

- whiteboard custom reducer 不再自己维护 subtree move/delete/restore 树算法
- tree inverse/slot/parent/index 统一来自 shared

### 阶段 4：删除 app-local structural DSL

目标：

- 彻底去掉 whiteboard / dataview 内的第二套 structural execution DSL

工作项：

- 删除 app-local ordered helper 中属于 shared structural 的部分
- 删除 app-local tree structural helper 中属于 shared structural 的部分
- 收口 compile / custom / replay 到 shared structural

完成标准：

- 结构写入只有 shared structural 一套实现
- app 只做 orchestration 和 semantic mapping

---

## 最终检查表

- `shared/mutation` 同时拥有 canonical entity op 与 canonical structural op
- structural op 仍然保持 first-class `move / insert / delete`
- structural op 没有退化成 patch
- shared 不拥有 whiteboard / dataview 领域语义
- app semantic delta naming 仍归 app 所有
- whiteboard ordered structure 不再自带第二套实现
- whiteboard tree structure 不再自带第二套实现
- derived geometry 不进入 mutation contract
- app custom reducer 只做 orchestration，不再做结构算法宿主

