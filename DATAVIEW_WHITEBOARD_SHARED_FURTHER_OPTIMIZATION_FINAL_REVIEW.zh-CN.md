# Dataview Whiteboard Shared Further Optimization Final Review

## 目标

本文只回答四个最终问题：

- `shared` 是否需要 first-class `ordered.splice`
- `planner` 是否保留，保留到什么边界
- `dataview` / `whiteboard` 哪些 ordered 链路应该直接复用 shared
- `emitMany` 是否继续保留

只保留长期最优方案，不保留兼容层、过渡层、多套实现。

---

## 基于代码的现状结论

当前代码已经清楚暴露出三层不同语义，不能再混在一起讨论。

### 1. primitive ordered move 已经是 shared canonical

`shared/mutation` 当前已经有：

- `structural.ordered.insert`
- `structural.ordered.move`
- `structural.ordered.delete`

对应执行入口：

- `shared/mutation/src/engine/contracts.ts`
- `shared/mutation/src/engine/structural.ts`

这层表达的是：

- 单个 item 的插入
- 单个 item 的移动
- 单个 item 的删除

这层不需要 planner。

### 2. block move 语义已经客观存在，但还没有上收到 shared canonical

这不是推测，而是代码里已经反复出现。

`whiteboard`：

- `whiteboard/packages/whiteboard-core/src/operations/custom.ts`
  - `canvas.order.move` 接受 `refs + to`
  - reducer 会把一组 refs 作为逻辑块移动
- `whiteboard/packages/whiteboard-core/src/operations/compile/helpers.ts`
  - `reorderCanvasRefs`
  - `createCanvasOrderMoveOps`

`dataview`：

- `shared/core/src/order.ts`
  - 已经存在纯数组级 `moveBlock`
- `dataview/packages/dataview-core/src/view/order.ts`
  - `reorderRecordBlockIds`
- `dataview/packages/dataview-core/src/view/state.ts`
  - `moveDisplayFields`
  - `reorderViewOrders`

这说明：

- “把多个 item 作为一个逻辑块重排”不是 whiteboard 偶发需求
- 也不是 dataview 局部 convenience
- 它已经是跨 app 的稳定 ordered semantic

### 3. planner 处理的是高层 reorder 输入，不是 primitive execution

`whiteboard/packages/whiteboard-core/src/operations/compile/helpers.ts` 里两件事其实是两层能力：

- `reorderCanvasRefs`
  - 把 `mode = set/front/back/forward/backward` 变成目标顺序
- `createCanvasOrderMoveOps`
  - 把 `current -> target` 变成一串 move op

这不是 runtime。

这层处理的是高层输入，例如：

- `front`
- `back`
- `forward`
- `backward`
- 显式 `target order`

所以 planner 不应该被误认为是 ordered primitive 本身。

---

## 最终结论

### 1. `shared` 需要新增 first-class `structural.ordered.splice`

这是最终结论。

原因不是“为了方便”，而是：

- block move 已经是 whiteboard 和 dataview 共同存在的稳定语义
- 如果 shared 没有 first-class `splice`，app 就会继续各自保留一层 block 语义包装
- 这会让 shared 只承接 single-item primitive，却承接不了跨 app 反复出现的 ordered structural semantic

### 2. `planner` 要保留，但边界必须明显缩小

最终定位：

- `planner` 不是 ordered runtime
- `planner` 不是所有 move 的前置步骤
- `planner` 只是把高层 reorder 输入编译成 canonical structural op 的一层共享编排能力

因此：

- primitive `move` 不需要 planner
- direct semantic `splice` 不需要 planner
- `front/back/forward/backward/set/target-order` 才需要 planner

### 3. `splice` 只属于 ordered collection，不向 tree/custom 泛化

这点必须明确。

正确归属：

- ordered collection 可以有 `splice`

不应该做的事：

- 不做 `tree.splice`
- 不把 `mindmap.topic.move` 之类 custom op 变成 batch canonical op
- 不把所有多对象领域动作都解释成 shared batch primitive

`mindmap` 这类场景仍然应该保留：

- tree structural primitive
- entity patch
- app semantic orchestration

而不是硬塞进 `splice`。

### 4. `emitMany` 应删除，并入 `emit`

最终 compile contract 只保留：

```ts
emit(...ops: readonly Op[]): void
```

不再保留：

```ts
emitMany(...ops: readonly Op[]): void
```

原因很简单：

- 当前 runtime 里 `emitMany` 没有独立语义
- 它只是循环调用 append
- 保留两个名字只会让 compile 层继续分裂

---

## 为什么必须有 `splice`

### 1. 现在重复的不是 helper，而是语义

如果今天只补 planner，不补 `splice`，shared 仍然只认识：

- insert one
- move one
- delete one

但 app 实际在表达的是：

- move a logical block

结果就是：

- whiteboard 继续保留 `refs + to` 的 block move 语义壳
- dataview 继续保留 `moveBlock` 纯函数壳
- shared 仍然承接不了这层稳定语义

这不是长期最优。

### 2. `splice` 不是 patch，它仍然是 structural semantic

用户前面已经确认过：

- `move` 不能退化成 patch

`splice` 也一样。

它不是：

- 整段数组 patch
- document diff
- “我给你一个 target order 你自己猜结构语义”

它应该仍然是显式 canonical op，例如：

```ts
{
  type: 'structural.ordered.splice',
  structure: string,
  itemIds: readonly string[],
  to: MutationOrderedAnchor
}
```

这保留的是显式结构语义，不是粗粒度 patch。

### 3. `splice` 可以保留细粒度协作，不需要退化

真正需要避免的是：

- 把 block move 做成整段 patch

不需要避免的是：

- shared 直接认识 block move 这个 canonical structural semantic

长期最优做法是：

- canonical op 是一个 `splice`
- runtime 内部按结构规则执行
- inverse 允许展开成多个 primitive move
- structural facts 允许继续按 item 级输出
- footprint 允许继续按 structure-item 输出

这样：

- 外层 API 简单
- 内层协作粒度不退化
- delta / footprint 消费方不必被迫升级到另一套 block 专用协议

### 4. `splice` 不应该要求输入本身就是连续块

这里必须和“连续块”区分开。

当前 dataview `order.moveBlock` 与 whiteboard block reorder 的真实语义，就是未来 `splice` 应承接的语义：

- 传入一组 moving ids
- runtime 以当前 structure 中的现有顺序提取这些 ids
- 把这组 ids 作为一个逻辑块插入到目标 anchor

也就是说：

- 输入选择集可以原本不连续
- 执行结果会把它们收拢成连续块
- 块内相对顺序来自当前 structure，不来自调用方传入顺序

这正是长期最优语义，因为它：

- 与当前 shared/core `moveBlock` 行为一致
- 与 whiteboard 当前 block reorder 目标一致
- 避免把调用方传入顺序变成另一套隐式 target-order 语义

### 5. `splice` 的 inverse 不要求同形

这是关键边界。

如果 moving ids 原本是离散的，那么：

- “一次 splice” 可以把它们收拢为连续块
- 但回到原位置时，不一定能用“一次同形 splice”还原

所以长期最优不应该要求：

- `splice` 的 inverse 也必须还是一个 `splice`

正确做法是：

- canonical forward op 可以是一个 `splice`
- runtime 产生的 inverse 允许是多个 `structural.ordered.move`

shared/mutation 当前本来就支持一条 op 生成多条 inverse，因此这不是问题。

---

## 为什么 planner 仍然要保留

### 1. 有些输入不是 canonical structural op

下面这些输入，不应该直接进入 mutation runtime：

- `front`
- `back`
- `forward`
- `backward`
- compile 内部推导出的 `current -> target order`

原因是它们表达的是：

- UI 行为模式
- 编译期重排意图
- 目标顺序

而不是最终 canonical structural primitive。

### 2. `forward/backward` 不能简单等价成一个 `splice`

这点从 whiteboard 现有代码已经能看出来。

`forward/backward` 的语义通常是：

- 选择集整体前进一步
- 但不把所有选中项强行收拢成一个块

这类行为本质上更接近：

- 先算目标顺序
- 再按目标顺序生成 canonical move 序列

所以 planner 不能删除。

### 3. `target-order` 也不是 `splice`

例如旧形态输入：

- `field.option.setOrder`

它给的是一份显式 order 列表，而不是：

- moving ids + anchor

因此这类输入天然需要 planner：

- 从当前顺序和目标顺序
- 规划成一串 canonical op

但这不代表 `field.option.setOrder` 可以在任何长期合同里保留。
长期最优是：

- 删除 `field.option.setOrder`
- 删除一切公开 `setOrder` 风格 contract
- 外部 API / intent 统一改成 direct semantic `move`

### 4. planner 不应该塞进 runtime

最终边界应该是：

- runtime 只执行 canonical structural op
- planner 只服务 compile / orchestration

不应该做成：

- runtime 接受 `mode`
- runtime 接受 `target order`
- runtime 自己推理应该发哪些结构 op

这会重新把 compile 语义塞回执行层，边界会再次变脏。

---

## 最终 API 设计

### 1. shared ordered canonical op

最终 ordered primitive 建议是：

```ts
type MutationStructuralOrderedInsertOperation = {
  type: 'structural.ordered.insert'
  structure: string
  itemId: string
  value: unknown
  to: MutationOrderedAnchor
}

type MutationStructuralOrderedMoveOperation = {
  type: 'structural.ordered.move'
  structure: string
  itemId: string
  to: MutationOrderedAnchor
}

type MutationStructuralOrderedSpliceOperation = {
  type: 'structural.ordered.splice'
  structure: string
  itemIds: readonly string[]
  to: MutationOrderedAnchor
}

type MutationStructuralOrderedDeleteOperation = {
  type: 'structural.ordered.delete'
  structure: string
  itemId: string
}
```

其中 `splice` 的规则固定为：

- `itemIds` 先去重
- 只表达选择集，不表达块内目标顺序
- 块内顺序始终取当前 structure 中的出现顺序
- anchor 基于“移除 moving set 后的剩余结构”解释

### 2. ordered runtime contract

`splice` 执行时建议固定输出行为：

- forward: 保留原始 `splice` op
- inverse: 允许展开为多个 `structural.ordered.move`
- structural facts: 继续按单 item move 输出
- footprint: 继续输出
  - `structure`
  - `structure-item`

这样 shared 现有消费链路最稳。

### 3. ordered planner contract

planner 保留，但只保留成 compile 层共享模块。

建议能力分成两类：

#### A. direct target reorder planner

```ts
planOrderedMoves(input: {
  structure: string
  currentIds: readonly string[]
  targetIds: readonly string[]
}): readonly MutationStructuralCanonicalOperation[]
```

用途：

- compile 内部已经得到目标顺序时，规划 canonical op
- 不暴露给 public intent / public engine API

#### B. mode reorder planner

```ts
planOrderedModeMoves(input: {
  structure: string
  currentIds: readonly string[]
  selectedIds: readonly string[]
  mode: 'front' | 'back' | 'forward' | 'backward' | 'set'
}): readonly MutationStructuralCanonicalOperation[]
```

用途：

- whiteboard `canvas/group` 的 mode reorder

planner 输出可以是：

- `move`
- `splice`

但长期最优不要求 planner 必须“最小化到最少 op 数”，只要求：

- 语义正确
- deterministic
- 不退化成 patch

### 4. emit contract

最终 compile output API：

```ts
emit(...ops: readonly Op[]): void
```

不再保留：

```ts
emitMany(...ops: readonly Op[]): void
```

---

## dataview / whiteboard 最终落点

### 1. whiteboard

#### 直接走 `splice` 的场景

- `canvas.order.move`
  - 已经是 `refs + to`
  - 这是 direct semantic block move

长期最优：

- 单 ref 直接编译成 `structural.ordered.move`
- 多 ref 直接编译成 `structural.ordered.splice`

#### 继续走 planner 的场景

- `canvas.order.move` intent 里的 `mode`
- `group.order.move`

原因：

- `front/back/forward/backward` 是高层 reorder mode
- 不是 canonical execution op

### 2. dataview

#### 应迁到 shared ordered structural 的场景

- `field.options:${fieldId}`
- `view.orders:${viewId}`

这两块是最明确的 ordered structure。

其中 `view.orders` 的最终方向比较直接：

- record/view reorder with `moving ids + before` -> direct `move` / `splice`
- 不保留任何 public target-order 输入
- record delete cleanup -> ordered delete

`field.options` 这一块还需要再明确收一次 API 面。

#### `field.options` 的最终 API

`field.option.setOrder` 必须删除。

它现在的真实问题不是“名字不好”，而是：

- 它暴露的是 target-order 输入
- 但真实 UI 场景几乎都只是“把一个 option 挪到另一个 option 前面/后面”
- 调用方现在被迫自己先构造整份 order，再交给 core

这不是长期最优。

`field.options` 的最终公开 API 应固定成：

- `field.option.create`
- `field.option.move`
- `field.option.patch`
- `field.option.remove`

其中：

- `field.option.create` -> ordered insert
- `field.option.move` -> direct `move`
- `field.option.patch` -> option entity patch
- `field.option.remove` -> ordered delete

`field.option.splice` 当前不进入 dataview public API。

原因不是要保守，而是当前 option 层没有稳定的“多选块移动”语义面。
长期最优不是超前暴露能力，而是只暴露已经稳定成立的 semantic primitive。

#### `field.option.move` 的最终语义

推荐最终 intent / API 形状：

```ts
{
  type: 'field.option.move'
  field: CustomFieldId
  option: string
  before?: string
  category?: StatusCategory
}
```

语义固定为：

- `option` 表示被移动的单个 option
- `before` 表示目标 anchor
- `category` 仅对 status option 生效
- 同一次 move 可以同时完成“换分类 + 调整顺序”

这样之后：

- 普通 option reorder 直接是 `move`
- status option 跨分类移动也是 `move`
- compile 再决定它要下沉成 `move`、`splice` 还是 `move + patch`

#### status option 跨分类移动必须收口成一次语义动作

当前 status option 跨分类移动本质是一个动作，但实现上被拆成了两次独立提交：

- 先 reorder
- 再 patch `category`

这不是长期最优。

最终要求应该是：

- UI 只发一次 `field.option.move`
- compile / runtime 在一次提交里完成
  - category 变化
  - 顺序变化

这样可以避免：

- 两次 history
- 两次 delta
- 中间态可见
- UI 自己拼 target-order

#### `field.option.setOrder` 的最终定位

最终定位只有一句话：

- 彻底删除

具体要求：

- 从 core intent 删除
- 从 engine public API 删除
- 从 engine type contract 删除
- 从 editor 调用点删除
- 从测试命名与辅助入口删除

compile 如果需要从目标顺序生成 canonical op，只能直接使用 shared planner 的普通输入结构：

- `currentIds`
- `targetIds`

不能继续保留名为 `field.option.setOrder` 的任何中转层。

#### dataview 其他 ordered API 的收口

`dataview` 里还存在一类旧 API：

- `view.order.reorder`

它本质也是“给我目标排序结果，我帮你算新顺序”的旧 helper，
不是最终 structural semantic。

长期最优应该是：

- `move`
- `splice`

作为公开 ordered API，
而把：

- `reorder`
- `setOrder`
- target-order transform

都不再出现在 public API / public intent / public helper 面上。
如果 compile 期确实要用 target-order planning，也只能直接调用 shared planner。

#### 还必须继续重写的同类语义

- `view.display.fields`

它已经在 `dataview/packages/dataview-core/src/view/state.ts` 上使用 `order.moveBlock`，也就是未来 canonical `splice` 对应的本地语义。

这说明：

- dataview 内部 ordered block semantic 不止一处

但它当前仍然包在较大的 `view.patch` 语义里。

因此长期设计上必须视作同一类 ordered structure。

如果目标是一步到位长期最优，那么这里不能再保留“大 patch 里夹带 ordered 变化”的形态。
必须继续拆到与 `view.orders` 一致的 ordered semantic API 面。

---

## 必须删除的历史形态

下面这些不是“可优化项”，而是必须删除：

- `field.option.setOrder`
- `engine.fields.options.setOrder`
- `view.order.reorder`
- `shared/core/order.moveBlock`
- `dataview view.order.moveBlock`
- 任何 public `ordered.setOrder`
- 任何 public `ordered.replaceOrder`
- UI 侧自行构造整份 target-order 后再提交的调用方式

对应替换关系固定为：

- `setOrder` -> `move`
- `moveBlock` -> `splice`
- `reorder` -> shared planner 的内部使用，不再公开

---

## 必须重写的链路

下面这些链路必须直接重写到最终形态，不留兼容层和中转层。

### 1. dataview field options

必须完成：

- intent 从 `field.option.setOrder` 改成 `field.option.move`
- engine public API 从 `fields.options.setOrder` 改成 `fields.options.move`
- React 调用点不再构造整份 order，而是直接表达 `option + before + category`
- status 跨分类移动收口成一次 `field.option.move`

### 2. dataview view orders

必须完成：

- `view.order.reorder` 退出 public API
- public reorder 语义只保留 `move` / `splice`
- `view.orders` compile 不再表达整份 patch 顺序语义

### 3. dataview view display fields

必须完成：

- 不再长期停留在 `view.patch.display.fields` 的大 patch 形态
- ordered 变化拆成独立 semantic op
- public 重排语义与 `view.orders` 保持一致，只保留 `move` / `splice`

### 4. shared ordered naming

必须完成：

- `shared/core/order.moveBlock` 改名为 `splice`
- dataview 所有 `moveBlock` 命名同步改成 `splice`
- 文档、类型、测试、调用点不再混用两套命名

---

## 不该做的事

### 1. 不要把 planner 当成 shared ordered 的主 API

否则会变成：

- app 不表达 canonical op
- 只表达 target order / mode
- shared 永远负责替 app 猜 primitive

这会让 shared 的边界重新变重。

### 2. 不要让 mutation runtime 接受 UI mode

例如不要让 runtime 直接理解：

- `front`
- `back`
- `forward`
- `backward`

这些都属于 compile/orchestration，不属于 canonical execution。

### 3. 不要把 `splice` 泛化成任意 custom batch op

尤其不要推广到：

- `mindmap.topic.move`
- tree 批量移动
- 任意多对象领域动作

`splice` 只解决 ordered collection。

### 4. 不要把 target-order 当成 canonical op

shared 不应该支持：

- `ordered.setOrder`
- `ordered.replaceOrder`

因为这会重新把结构语义推回粗粒度 patch。

正确做法是：

- target-order 进入 planner
- planner 输出 canonical move / splice

---

## 最终实施顺序

### P0

#### 1. `shared/mutation` 新增 first-class `structural.ordered.splice`

包括：

- contracts
- op creator
- runtime execution
- inverse generation
- structural facts
- footprint

#### 2. shared compile contract 删除 `emitMany`

统一改成：

- `emit(...ops)`

### P1

#### 3. whiteboard ordered compile 收口

目标：

- direct block move 直接发 `splice`
- mode reorder 统一走 shared planner

### P2

#### 4. dataview `field.options` 迁到 shared ordered structural

其中：

- `field.option.create` / `field.option.remove` 走 direct structural op
- `field.option.move` 成为唯一公开重排语义
- 删除 `field.option.setOrder` 及全部旧调用点

#### 5. dataview `view.orders` 迁到 shared ordered structural

其中：

- direct reorder 走 `move` / `splice`
- delete cleanup 走 ordered delete

### P3

#### 6. dataview `view.display.fields` 必须 structural 化

这不是可选项。

只要目标仍然是：

- 一步到位
- 长期最优
- 不留兼容

那么 `view.display.fields` 就必须从大 patch 里拆出来，收口到 ordered semantic API。

---

## 最终判断

最终设计应该固定成下面这句话：

**shared ordered 层同时承接 `primitive move` 和 `direct semantic splice`；public API 只保留 `move` / `splice`；所有 `setOrder` / `reorder` / `moveBlock` 历史形态全部删除。**

进一步展开就是：

- `move` 不需要 planner
- `splice` 也不需要 planner
- `forward/backward/front/back` 这类 mode 输入才需要 planner
- compile 内部如果已经得到 `current -> target order`，可以调用 planner，但这不形成任何 public API
- `splice` 只属于 ordered collection
- tree 和 custom 领域语义不跟着 batch 化
- `emitMany` 删除，并入 `emit`

这才是复杂度最低、边界最清楚、长期最优的 shared 设计。
