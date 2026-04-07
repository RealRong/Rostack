# Whiteboard Group Order Long-Term Plan

## 背景

现在 whiteboard 的 `bring to front / send to back / bring forward / send backward` 本质上是在改一条全局 `doc.nodes.order` 数组。

这套模型对普通 root node 还勉强成立，但对 `group` 不成立，原因很简单：

- `group` 是一个 owner/container。
- 真正可见的是 `group` 下面的 children。
- `group` 自身只承担 shell / hit area / 包围盒语义。
- 现在对 `groupId` 做 order，不等于对“整组可见内容”做 order。

所以当前容易出现这些问题：

- 对 group 执行 bring to front，视觉上不一定到最前。
- group shell 和 group children 的层级语义不一致。
- group 内 child 可能和 group 外 sibling 在 order 上互相干扰。
- 逻辑上混淆了 `owner tree` 和 `paint order`。

## 目标

长期最优方案只追求一件事：

`group` 在排序时必须被视为一个原子 block，行为和用户直觉完全一致。

具体目标：

- 选中 group，排序时移动整个 group。
- group 内部 children 的相对顺序保持不变。
- group 外部其他 sibling 的相对顺序保持不变。
- child 的排序只在所属 parent 内生效。
- 排序不能穿透 owner 边界。
- 排序不能跨 layer 边界。
- 多选排序时，选区内部相对顺序保持不变。

## 用户可见行为定义

### 1. 选中一个 group

- `Bring to front`
  把整个 group 作为一个 sibling block 移到同级最前。
- `Send to back`
  把整个 group 作为一个 sibling block 移到同级最后。
- `Bring forward`
  把整个 group 向前移动一个 sibling block。
- `Send backward`
  把整个 group 向后移动一个 sibling block。

这里的“整个 group”包括：

- group 节点本身的 shell / bounds 语义
- group 的全部 descendants

但排序时真正参与移动的是 group 这个直属 sibling block，不是把 descendants 拆开逐个移动。

### 2. 选中 group 内的普通 child

- 只能在该 child 所属 parent 的 children 范围内排序。
- 不能通过排序把 child 移到 group 外面。
- 不能跨 parent 排序。

### 3. 多选

多选时先做规范化：

- 如果同时选中了 ancestor 和 descendant，只保留最高层 ancestor。
- 只允许同一 owner 下的直属 sibling 一起参与同一组排序。
- 不同 owner 的选中项分开独立处理。
- 不同 layer 的选中项分开独立处理。

多选排序的结果必须满足：

- 选区内部相对顺序不变。
- 非选区 sibling 的相对顺序不变。

### 4. layer

layer 的优先级高于 order。

- `front/back/forward/backward` 只在同一 layer 内生效。
- 默认不允许通过 order 跨 `background / default / overlay`。
- 如果未来要支持“Move to overlay”这种语义，应该是单独命令，不应复用 order。

## 长期最优模型

## 核心原则

不要再维护“全局扁平 order”作为唯一真相。

长期最优模型应该是：

- root 有自己的 sibling order。
- 每个 owner 有自己的 `children` order。
- `children` 顺序就是直属 children 的唯一绘制顺序来源。
- 渲染顺序通过从 root 开始递归展开得到。
- group 是 owner block，不是一个和其 children 并列争夺可见顺序的特殊节点。

换句话说：

`owner tree = structure`

`children order = paint order`

而不是：

`owner tree` 一套，`global order` 再来一套。

## 推荐的数据语义

建议把“排序单元”明确为：

- `SiblingBlock`

它的含义是：

- 在某个 `ownerId` 下的直属 child
- 这个 child 可以是普通 node，也可以是 group
- 如果是 group，它天然代表整棵子树

因此 reorder 的真实作用对象不是任意 node id，而是：

- 某个 `(ownerId, layer)` 范围内的一组 `SiblingBlock`

## 推荐的 API 语义

现有 API 可以暂时保留名字，但内部语义应改成 block 级别：

- `bringToFront(ids)`
- `sendToBack(ids)`
- `bringForward(ids)`
- `sendBackward(ids)`

执行流程应统一为：

1. 规范化选区
2. 展开为顶层 sibling blocks
3. 按 `(ownerId, layer)` 分组
4. 在每个分组内执行 reorder
5. 产出新的 owner children 顺序

长期如果允许重构 API，建议底层显式化：

- `reorderSiblingBlocks({ ids, mode })`
- `normalizeSelectionToSiblingBlocks(ids)`

这样命名更接近真实语义。

## 为什么当前模型会错

当前问题不是 UI 问题，而是模型问题：

- `group.create` 只是创建了一个 `group` node，并把 children 挂进去。
- 现有 order 只是重排 `doc.nodes.order`。
- 渲染时真正可见的是 content nodes。
- group shell 又在独立 container layer 里渲染。

因此当前相当于：

- 可见内容顺序看的是 children 和 content node 的展开结果
- 排序命令改的是另一套扁平 id 顺序

两者天然会偏离。

## 长期最优规则细化

### Bring to front / Send to back

这是绝对移动：

- `Bring to front`
  把选中的 sibling blocks 放到同层同 owner 的末尾。
- `Send to back`
  把选中的 sibling blocks 放到同层同 owner 的开头。

### Bring forward / Send backward

这是相对移动：

- 步长是“跨过一个未选 sibling block”
- 不是跨过一个 descendant
- 不是跨过一个全局 node id

例如：

当前同 owner sibling 顺序：

`A [Group B] C D`

若选中 `Group B` 执行 `Bring forward`：

结果应为：

`A C [Group B] D`

而不是：

- 只把 `groupId` 往前挪
- 或把 B 的 children 拆出来穿过 C

## 边界规则

### 1. 同时选中 group 和其内部 child

只保留 group。

理由：

- descendant 已被 ancestor 覆盖
- 否则语义冲突

### 2. 同时选中不同 group 内的 child

各自在自己的 owner 范围内独立排序。

不做跨 owner 联合 reorder。

### 3. group 与普通 node 混选

如果它们是同 owner、同 layer 的直属 siblings，则可以一起排序。

否则按 owner/layer 分组，各自执行。

### 4. ungroup 后顺序

ungroup 时，原 group 在 parent 中占据的位置，应由它原先的 children 顺序直接顶替。

也就是：

- group 在 parent 中的位置不变
- children 在该位置原地展开
- children 内部相对顺序不变

这是用户最容易理解的行为。

### 5. group 后再次 group

重新 group 后，新 group 应占据原选区在 parent 中的那段连续位置。

不要因为 regroup 改变选区整体层级。

## 最佳实现路径

## Phase 1: 规则修正，但尽量少改渲染层

目标：

- 不先大改整个 read/render 管线
- 先修正 group reorder 的用户可见行为

做法：

- 引入“selection normalize to sibling blocks”
- 所有 order 命令先把输入 ids 规范化成顶层 sibling blocks
- group 作为 block 参与移动
- reorder 时按 owner 分组
- 同 owner 下不再直接对任意 descendants 做顺序运算

这一步可以先基于现有数据结构实现一层翻译逻辑。

## Phase 2: 把 order 真正下沉到 owner children

目标：

- 把排序真相从全局 `doc.nodes.order` 迁移到 root/owner children

做法：

- root 维护 root sibling 顺序
- owner 的 `children` 维护直属 children 顺序
- read model 改为递归展开 paint order
- reorder 直接改 parent children，而不是改全局 order

这是长期正确解。

## Phase 3: 清理历史兼容层

目标：

- 去掉对“全局扁平 node order”的依赖
- 统一 selection、render、hit test、group、ungroup 的语义

完成后应达到：

- 排序规则可直接从 owner tree 推导
- group 行为与普通 container 一致
- 不再需要在上层补特殊 case

## 我建议的最终结论

group 的 bring to front / send to back 最终应该这样定义：

- 它不是移动一个透明容器 id
- 它是移动一个“同级原子 block”
- 这个 block 代表整个 group 子树

如果模型层还是把 group 和 children 的 paint order 拆成两套，后面无论怎么补 UI 和命令层，都会不断出现边界 bug。

所以长期最优路线不是继续给 `group` 做特判，而是把 reorder 的基本单位改成：

- `owner 内直属 sibling block`

这是最简单、最稳定、也最容易长期维护的方案。
