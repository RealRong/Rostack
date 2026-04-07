# Whiteboard Flat Group System Refactor Plan

## 前提

这份方案基于以下硬约束：

- 不允许嵌套 group
- `node + group` 执行 `Group`，结果不是再包一层，而是把 node 加进原 group
- `group + group` 执行 `Group`，结果是 merge groups，不允许保留 group 套 group
- edge 可以参与 group
- edge 可以参与前后层级排序，且允许出现在 node 前面
- group 本身不是独立 paint object
- group 没有独立 order

在这些前提下，长期最优方案不是：

- 把 edge 变成 node
- 继续维护 `nodes.order + edges.order` 双轨顺序
- 继续把 group 当 node / owner / container

长期最优方案应当是：

- node 和 edge 继续保持各自类型
- 但在更高一层统一成 `canvas item`
- 整个画布只维护一条 `order`
- group 只是结构对象与交互对象，不是绘制对象

## 最终结论

最简、最稳、长期最优的模型是：

- group 不再是 `node type`
- group 不再持有 `children`
- group 不再进入 paint order
- group 不再进入 owner tree
- node 和 edge 都可以属于一个 group
- `order` 是唯一真实绘制顺序
- 同一个 group 的所有成员在 `order` 中必须始终连续
- group 的 bounds / outline / shell / hit area 全部从成员 items 派生

一句话总结：

- node 和 edge 是 paint entity
- group 是 structure entity + interaction entity
- `order` 是唯一顺序真相

## 为什么不该让 edge 变成 node

edge 和 node 的本体语义完全不同：

- node 是 box-like object
- edge 是 path / connection object

如果为了统一 group 和 order 强行把 edge 塞进 node，后果只会是：

- node 模型里充满对 edge 无意义的字段
- transform / hit test / route / endpoint / resize 全部出现特判
- 系统更乱，不会更简单

正确抽象不是 “edge is a node”，而是：

- node 和 edge 都是 `canvas item`

## 数据模型

## Document

建议长期收口到：

```ts
type Document = {
  nodes: Record<NodeId, Node>
  edges: Record<EdgeId, Edge>
  order: CanvasItemRef[]
  groups: Record<GroupId, Group>
}
```

这里要强调：

- 不再有 `nodes.order`
- 不再有 `edges.order`
- `order` 是 document 中唯一全局顺序
- group 没有任何独立 order 字段

## CanvasItemRef

```ts
type CanvasItemRef =
  | { kind: 'node', id: NodeId }
  | { kind: 'edge', id: EdgeId }
```

它只表示：

- 一个可绘制 item 的身份
- 一个可参与顺序、分组、选择、复制、删除的最小单位

## Node / Edge

node 和 edge 都增加同一个字段：

```ts
type Node = {
  id: NodeId
  ...
  groupId?: GroupId
}

type Edge = {
  id: EdgeId
  ...
  groupId?: GroupId
}
```

含义很直接：

- `undefined` 表示未分组
- `groupId` 表示属于哪个 group
- 一个 item 最多属于一个 group

## Group

group 只保留最轻结构：

```ts
type Group = {
  id: GroupId
  locked?: boolean
  name?: string
}
```

注意：

- `Group` 不存 `children`
- `Group` 不存 `position`
- `Group` 不存 `size`
- `Group` 不存 `rotation`
- `Group` 不存 `layer`
- `Group` 不存 `order`

group 的所有可视与几何表现全部派生。

这里还要明确一条：

- group 不再使用 `children`
- group 不再使用 `descendant`
- group 不再进入 `owner` 体系

也就是说，flat group 方案下，group 不再是树结构实体。

## 核心不变量

整个系统只需要维护 5 条不变量：

### 1. 单一归属

每个 canvas item 最多属于一个 group。

### 2. 非嵌套

group 不包含 group。

### 3. 顺序唯一真相

画布前后层级只看 `order`。

不是看：

- node order
- edge order
- owner tree
- group shell

### 4. 连续切片

同一个 group 的全部成员在 `order` 中必须形成连续 slice。

例如：

`A [B C D] E`

如果 `B C D` 属于同一 group，则合法。

`A B E C D`

如果 `B C D` 属于同一 group，则非法。

### 5. 组内顺序稳定

group 进行任何整体操作时：

- 组内成员相对顺序不变
- 组外 items 相对顺序不变

## 读模型

## Canvas Items

需要一层统一读取：

```ts
read.canvas.item(ref: CanvasItemRef): CanvasItem | undefined
read.canvas.order(): CanvasItemRef[]
```

这里的 `CanvasItem` 仍然可以在运行时分发成：

- node item
- edge item

只是读模型统一了。

## Group Members

group 成员列表直接从 `order` 派生：

```ts
read.group.members(groupId): CanvasItemRef[]
```

实现方式：

- 扫 `order`
- 过滤出 `groupId === targetGroupId` 的 node / edge

因为 group 成员要求连续，所以这个读取结果天然也是正确视觉顺序。

## Group Slice

底层必须有一个统一工具：

```ts
type GroupSlice = {
  groupId: GroupId
  items: CanvasItemRef[]
  start: number
  end: number
}

read.group.slice(groupId): GroupSlice | undefined
```

这是一切 group order / duplicate / delete / clipboard 的基础。

## Group Bounds

group bounds 从 member items 的 bounds 包围盒派生：

```ts
read.group.bounds(groupId): Rect | undefined
```

这里的 member items 包括：

- node bounds
- edge path bounds

所以 group outline 会天然包住 node 和 edge 的联合区域。

## 命中模型

group 不是 scene item，不常驻参与 paint order。

group 的命中壳来自：

- `read.group.bounds(groupId)`

推荐命中优先级：

1. 具体 node / edge
2. group shell
3. 空白背景

这样既能保证精细编辑，又能保证整体 group 操作。

## Selection 模型

推荐长期保留三类 target：

```ts
type SelectionTarget = {
  nodeIds: NodeId[]
  edgeIds: EdgeId[]
  groupIds: GroupId[]
}
```

原因：

- group 不是 paint entity
- 但 group 是 interaction entity
- 所以 selection target 仍然需要显式支持 `groupIds`

## 规范化规则

- 若选中了 group，canonical selection target 中不重复保存该 group 的 member items
- 但渲染层必须把这些 member items 视为 `selected via group`
- `selected via group` 的 node 显示蓝框
- `selected via group` 的 edge 显示选中态
- 普通散选 node/edge 不会自动提升为 group，除非交互本身显式命中了 group 规则

## Group Selection 交互规则

固定为 Miro 式两级选择：

- 首次点击 group 内的 member item：
  进入 `group selection`
- `group selection` 状态下：
  显示整组 outline
- `group selection` 状态下：
  组内全部 member items 显示 selected via group
- `group selection` 状态下拖拽：
  移动整个 group
- 已处于 `group selection` 时再次点击某个 member item：
  下钻为该单个 node 或 edge 的选择
- 点击 group outline 空白壳：
  保持或进入 `group selection`
- marquee 完整覆盖整组成员：
  直接进入 `group selection`

这里要明确：

- 首击 member，不是直接编辑 member
- 首击 member 的目标是操作整组
- 二击 member 的目标才是编辑局部

所以 group 的定位是：

- 不是 paint entity
- 不是 order entity
- 是 interaction entity

## 命令系统

## 1. mergeGroup

不要再把核心命令理解成 `group.create(ids)`，而应该是：

```ts
commands.group.merge(selection)
```

因为你真正需要的是 merge 语义：

- 选 node/edge，新建 group
- 选 item + group，把 item 加入该 group
- 选 group + group，合并 groups
- 选 item + group + group，统一 merge

### 规范化流程

先把输入统一展开为 item 集合：

```ts
normalizedItems =
  selection.nodeIds
  + selection.edgeIds
  + expand(selection.groupIds)
```

然后：

- 若没有涉及现有 group：创建新 group
- 若只涉及一个 group：把额外 items 加入该 group
- 若涉及多个 group：merge groups

### 多个 group 的保留策略

建议：

- 保留第一个 group id
- 删除其他 group

理由：

- id churn 最小
- selection 更稳定
- undo/redo 更清晰

## 2. ungroup

```ts
commands.group.ungroup(groupIds)
```

语义非常简单：

- 把该 group 全部 member items 的 `groupId` 清空
- 删除 group 实体
- `order` 完全不变

因为成员本来就在 `order` 中，且本来就连续。

## 3. deleteGroup

要严格区分：

- `ungroup`
- `delete selection`

若选中 group 后按删除：

- 删除整个 group 的全部成员 items
- 删除 group 实体

若执行显式 `ungroup`：

- 只删除 group 实体
- 保留成员 items

## 4. duplicateGroup

duplicate group 时：

- 按 group slice 顺序复制全部 member items
- 新复制 items 插入到原 slice 后面
- 创建一个新 group
- 新 items 的 `groupId` 指向新 group

这对 node + edge 混合 group 也成立。

## Order 系统

## 核心原则

整个画布只有一条统一顺序：

- `order`

这也是 edge 能排到 node 前面的必要条件。

所以 order 系统必须统一成：

- item order
- group order

但这两者都作用在 `order` 上。

## Item Order

对未分组 item：

- 正常按 `order` 移动

对已分组 item：

- 默认只允许在所属 group slice 内 reorder
- 不允许通过普通 reorder 穿出组边界

如果未来需要“从组里拖出来”，那是显式命令：

- `removeFromGroup`
- 或拖拽脱组

不要让普通 order 命令顺带承担“脱组”语义。

## Group Order

group reorder 的本质不是移动 group 实体，而是：

- 把这个 group 的 member slice 当作一个 block 移动

### Bring to front

- 找到 group slice
- 把整段 slice 移到可参与排序范围末尾

### Send to back

- 把整段 slice 移到可参与排序范围开头

### Bring forward / Send backward

- 让整段 slice 与相邻外部 block 交换一步
- 组内 items 相对顺序不变

## Group 与 Layer

如果以后仍保留 layer 概念，建议它也提升到 `canvas item` 级别，而不是 node-only：

- order 的作用域是同 layer 的 `order`
- group slice 不能跨 layer
- 不允许一个 group 的成员横跨多个 layer

这样规则最简单。

## 推荐 API

这一节只保留长期真正需要的 API。

原则：

- 名字短
- 语义直白
- 不把实现细节暴露到接口层
- 不为了“架构统一感”引入多余抽象

### 命名原则

- 文档模型里统一使用 `item`
  指 node 或 edge
- 只有真的需要区分时，才显式写 `node` / `edge`
- `group.merge` 表示最终用户要的 `Group` 行为
- `order` 永远指 document 里的唯一全局顺序

### 最终核心类型

```ts
type CanvasItemRef =
  | { kind: 'node', id: NodeId }
  | { kind: 'edge', id: EdgeId }

type SelectionTarget = {
  nodeIds: NodeId[]
  edgeIds: EdgeId[]
  groupIds: GroupId[]
}

type GroupSlice = {
  groupId: GroupId
  items: CanvasItemRef[]
  start: number
  end: number
}

type OrderMode =
  | 'front'
  | 'back'
  | 'forward'
  | 'backward'
```

### 为什么不用更多类型

不建议继续引入：

- `CanvasEntity`
- `GroupMember`
- `SceneItem`
- `RenderableItem`

这些词都太宽，长期只会让语义漂移。

当前这套系统真正需要记住的只有三件事：

- `CanvasItemRef`
- `SelectionTarget`
- `GroupSlice`

## Read

```ts
read.canvas.item(ref): CanvasItem | undefined
read.canvas.order(): CanvasItemRef[]

read.group.ids(): GroupId[]
read.group.item(groupId): Group | undefined
read.group.members(groupId): CanvasItemRef[]
read.group.slice(groupId): GroupSlice | undefined
read.group.bounds(groupId): Rect | undefined

read.node.groupId(nodeId): GroupId | undefined
read.edge.groupId(edgeId): GroupId | undefined
```

### 推荐补充的最小读接口

上面的接口足够表达模型，但为了减少上层重复逻辑，建议再补四个只读工具：

```ts
read.group.has(groupId): boolean
read.group.isEmpty(groupId): boolean
read.group.contains(groupId, ref): boolean
read.item.group(ref): GroupId | undefined
```

用途：

- `has`
  用于 selection / command 的快速校验
- `isEmpty`
  用于 merge / ungroup / delete 后清理空 group
- `contains`
  用于命中、下钻、hover、drag 过程
- `item.group`
  用于统一 node/edge 的读取入口

### 不建议暴露的读接口

不建议保留或新增：

```ts
read.group.children(...)
read.group.descendants(...)
read.group.owner(...)
read.group.depth(...)
```

这些都属于旧模型遗产。

## Commands

```ts
commands.group.merge(selection)
commands.group.ungroup(groupIds)
commands.group.addItems(groupId, items)
commands.group.removeItems(groupId, items)

commands.group.order.bringToFront(groupIds)
commands.group.order.sendToBack(groupIds)
commands.group.order.bringForward(groupIds)
commands.group.order.sendBackward(groupIds)

commands.canvas.order.bringToFront(items)
commands.canvas.order.sendToBack(items)
commands.canvas.order.bringForward(items)
commands.canvas.order.sendBackward(items)
```

### 推荐补充的最小写接口

为了让实现和 UI 代码更短，建议底层命令再补这几类：

```ts
commands.group.delete(groupIds)
commands.group.duplicate(groupIds)

commands.group.select(groupId)
commands.group.drill(ref)

commands.canvas.delete(items)
commands.canvas.duplicate(items)
```

其中：

- `group.delete`
  等价于删组及其全部成员
- `group.duplicate`
  等价于复制整段 slice 并创建新 group
- `group.select`
  是显式进入 group selection 的入口
- `group.drill`
  是从 group selection 下钻到 member 的统一入口
- `canvas.delete / duplicate`
  让 node/edge 混合操作时不必在 UI 层拆两套逻辑

### 最终建议保留的命令集合

如果只看长期最少集合，我建议保留为：

```ts
commands.group.merge(selection)
commands.group.ungroup(groupIds)
commands.group.delete(groupIds)
commands.group.duplicate(groupIds)
commands.group.order(groupIds, mode)

commands.canvas.order(items, mode)
commands.canvas.delete(items)
commands.canvas.duplicate(items)
```

也就是进一步把四个 order 命令再压成一个：

```ts
commands.group.order(groupIds, mode)
commands.canvas.order(items, mode)
```

如果你更重视调用时直观性，可以继续保留：

- `bringToFront`
- `sendToBack`
- `bringForward`
- `sendBackward`

但从长期维护和减少 API 面积的角度，我更偏向：

```ts
order(target, mode)
```

### 推荐的内部辅助函数

这些函数不一定要暴露给产品层，但底层实现最好固定下来：

```ts
normalizeGroupMergeInput(selection): CanvasItemRef[]
normalizeSelectionTarget(selection): SelectionTarget
expandGroups(selection): CanvasItemRef[]
findGroupSlices(order): Map<GroupId, GroupSlice>
moveSlice(order, slice, mode): CanvasItemRef[]
moveItems(order, items, mode): CanvasItemRef[]
```

这些名字都尽量直白，避免出现：

- `resolveTransactionalGroupingPlan`
- `deriveOwnershipProjection`
- `materializeGroupMembers`

这类过度设计命名。

注意：

- group 没有独立顺序字段
- `group.order.*` 的输入是 `groupIds`，但真正移动的是 `order` 里的 member slice
- `canvas.order.*` 的输入是 item refs，不再分 node/edge 两套命令

## 哪些现有复杂度可以删掉

如果采用这套模型，可以删掉这些旧复杂度：

- group 作为 `node.type`
- group `children`
- group owner tree
- group descendant 逻辑
- nested group
- group 几何字段与相关 sanitize
- `nodes.order + edges.order` 双轨顺序
- edge 永远在 node 下方的固定渲染链
- node-only group 逻辑
- node-only order 逻辑

这条清理目标只针对 group：

- group 彻底退出 `children / descendant / owner` 体系

不意味着全系统所有 tree 工具都要删除，因为：

- frame
- mindmap
- 其他未来真正有层级关系的结构

仍然可能需要这些能力。

因此更准确的目标是：

- 保留系统级 tree 能力给真正的层级结构
- 但 group 不再复用这套能力

## 分阶段重构方案

下面的阶段划分遵循三个原则：

- 每阶段都可单独验收
- 每阶段都尽量减少同时改动的系统面
- 尽量先建立新真相，再删除旧逻辑

## Phase 1: 锁死产品规则

先把这些规则固定：

- 不允许嵌套 group
- edge 可以参与 group
- edge 可以排到 node 前面
- group 没有独立 order
- 首击 member 进入 group selection
- 再击 member 下钻

本阶段产出：

- 最终文档定稿
- 所有入口统一按这套规则评估

本阶段不改：

- 数据结构
- 渲染顺序
- 旧 group node

验收点：

- 团队对规则没有二义性
- 后续开发不再争论“edge 算不算 group 成员”“group 是否是 node”

## Phase 2: 引入统一 `order`

先建立统一顺序真相：

- 新增统一 `order`
- 仍保留旧 `nodes.order / edges.order` 作为兼容输入
- read/render 开始以 `order` 为主

这一步先解掉 “edge 不能到 node 前面” 的根问题。

本阶段建议做法：

- 写一层迁移构造逻辑，把旧 `nodes.order + edges.order` 合成为新 `order`
- 先不删除旧字段
- 新读模型优先读 `order`
- 老逻辑若还依赖旧顺序，则通过适配层从 `order` 反推

本阶段不改：

- group 结构
- group selection
- group 命令语义

验收点：

- edge 可以稳定排到 node 前后
- 渲染链不再固定 edge 永远在 node 下方
- undo/redo 下 `order` 结果稳定

## Phase 3: 引入 `groupId` 到 node / edge

新增：

- `node.groupId`
- `edge.groupId`

并建立只读索引：

- `group -> members`
- `group -> slice`
- `group -> bounds`

本阶段建议做法：

- group 暂时仍可兼容旧 group node 数据
- 但新逻辑统一从 `groupId` 读取成员关系
- `read.group.members / slice / bounds` 全部建立起来

本阶段不改：

- `Group` 命令语义
- selection 下钻规则
- 删除旧 owner 逻辑

验收点：

- 单个 group 的成员、边界、切片都能从 `groupId + order` 正确派生
- node + edge 混合组能正确读出 outline
- 不再需要依赖 group children 才能算 bounds

## Phase 4: group 命令改成 merge 语义

把 `group.create` 升级成：

- expand selected groups
- normalize items
- merge into existing / retained group

彻底禁止嵌套 group。

本阶段建议做法：

- `Group` 主入口统一走 `commands.group.merge(selection)`
- 输入一律先 expand groups 再 normalize
- 多 group merge 时固定“保留第一个 group id”
- 同时落地 `ungroup / delete / duplicate`

本阶段不改：

- group order
- grouped item 组内 reorder 限制

验收点：

- `node + group` 结果是 add to group
- `group + group` 结果是 merge，不再产生嵌套
- 不再出现 group 里包含 group 的数据

## Phase 5: order 切到 item/slice 模型

实现：

- `canvas.order.*`
- `group.order.*`
- grouped item 仅允许组内 reorder

到这一步，用户可见行为就已经正确。

本阶段建议做法：

- 普通 item order 统一基于 `order`
- group order 统一基于 `GroupSlice`
- grouped item 的单项 reorder 明确限制在组内
- selection / context menu / shortcuts 全部改走新命令

本阶段验收点：

- edge 和 node 可以混合排序
- group 整体 bring to front / send to back 正确
- group 内 member 相对顺序始终稳定
- 组外 item 相对顺序始终稳定

## Phase 6: 删除旧 group node 与双轨 order

最后彻底删掉：

- group node type
- group children / owner 逻辑
- `nodes.order`
- `edges.order`
- edge-before-node 的固定层次假设

本阶段建议做法：

- 删除所有 group-as-node 的路径
- 删除 group children / descendants / owner 特判
- 删除 node-only / edge-only 双轨顺序逻辑
- 清理只剩兼容意义的 read adapter

验收点：

- group 相关核心逻辑只依赖：
  - `groups`
  - `node.groupId`
  - `edge.groupId`
  - `order`
- 文档模型与代码模型一致

## 推荐实施顺序

如果只看投入产出比，推荐按下面顺序拆任务：

1. `order` 统一
2. `groupId` 落地
3. group 派生读模型
4. `group.merge / ungroup / delete / duplicate`
5. `canvas.order / group.order`
6. selection 下钻与 Miro 式交互收口
7. 删除旧 group node / owner / children 逻辑

这个顺序的好处是：

- 先把“顺序真相”定下来
- 再把“成员关系真相”定下来
- 最后再删旧模型

这样最不容易把系统搞半残。

## 最终建议

在你当前确认的产品方向下，长期最优、同时也是最简的方案是：

- 不让 edge 变成 node
- 让 node 和 edge 都成为 `canvas item`
- 整个画布只保留一条 `order`
- group 是轻量结构对象，不是绘制对象
- group 通过 `groupId` 关联 node / edge
- group 的所有可见表现都从 member slice 派生

这条路线比继续修 node-only group 系统更简单，也更符合你要的最终能力。
