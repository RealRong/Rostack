# Whiteboard 多选 Resize 底层模型重构方案

## 目标

把 whiteboard 的单选 / 多选 resize 从“按节点类型到处特判”重构为“selection plan 驱动的统一底层模型”。

这次方案只接受一步到位的长期最优设计，不保留兼容层，不保留临时桥接状态，不接受 editor / react / core 三处各自补丁式修修补补。

目标是同时解决下面这类问题：

- 多选包含 `text` 时，不能只靠当前的 `multi-scale` 粗暴处理。
- `text`、`sticky`、`shape` 的内容布局语义不同，不能用一个 `text-like` 粗分类糊过去。
- UI 不应该只知道 `canResize: boolean`，而应该知道“哪些 handle 可见、每个 handle 对应什么操作族”。
- transform engine 不应该再有“单选 text 旁路”和“其他节点通用”这两套平行实现。

---

## 现状问题

### 1. Selection 层语义过粗

当前 selection summary / affordance 只有这类粗粒度信号：

- `transform.resize: 'resize' | 'scale' | 'none'`
- `affordance.canResize: boolean`

这不足以表达：

- 哪些 handle 应该显示
- `e/w` 和 `corners` 是否是不同操作
- 多选里 `text` 与 `shape` 是否可以共享同一操作
- 某个操作对不同 member 的提交语义是否不同

因此系统只能回答“能不能 resize”，回答不了“如何 resize”。

### 2. Text 语义被做成 editor 侧旁路

当前 `text` 的 resize 语义只在单选路径里存在：

- `e/w => reflow`
- `corners => scale`
- `n/s => none`

但这套逻辑不在 core transform 模型内，而是在 editor 侧单独有一条 `single-text` 分支。

结果：

- 单选 `text` 是专门规则
- 多选 `text` 没有对应规则
- 多选一旦进入 resize，统一落到 `multi-scale`

这意味着底层没有真正的“text transform model”，只有一个 editor 侧 workaround。

### 3. `text` / `sticky` / `shape` 被错误地放进同一抽象桶里

这三类节点不是一回事。

#### `text`

- 有明确的排版数据模型：
- `widthMode = 'auto' | 'wrap'`
- `wrapWidth`
- 左右 resize 本质是“改变排版宽度”
- 四角 resize 才接近“几何 scale + 字号缩放”

#### `sticky`

- 没有 `wrapWidth` 这套持久化语义
- 文本大小是由“盒子尺寸 + 内容量”共同决定的 autofit 结果
- resize 的核心是 box 变化，文本只是重新布局 / 重新 fit

#### `shape`

- 文字通常是固定字号或显式字号
- resize 主要是几何盒子变化
- 文本只是跟着新的 content box 重新排版，不具有 `text` 那种 flow width 语义

因此，`text-like` 不是正确的长期抽象。它会很快再次裂成：

- flow-text
- autofit-text
- fixed-text

既然必然会裂，不如一开始就按正确维度建模。

---

## 最终保留的公开概念

长期最优方案只保留下面 4 个公开概念：

1. `TransformOperationFamily`
2. `NodeTransformBehavior`
3. `SelectionTransformPlan`
4. `projectSelectionTransform(...)`

其余概念全部降为内部实现细节，不再作为系统级名词暴露。

不要再保留任何“单选 text 特判分支”或“多选统一 multi-scale”的平行实现。

---

## 一、TransformOperationFamily

这是系统统一的 transform 原语，必须保留，而且只保留最少的三个：

- `resize-x`
- `resize-y`
- `scale-xy`

selection planner、React handles、editor input、core projector 都只围绕这三个 family 协作。

不要再引入：

- `resize`
- `scale`
- `reflow`

这种混合了“几何操作”和“内容响应”的粗粒度概念。`reflow` 不是 selection-level family，而是某类节点在 `resize-x` 下的内部落地语义。

---

## 二、NodeTransformBehavior

这是节点级唯一的 transform 模型。

它替代此前拆开的：

- `BoxTransformPolicy`
- `ContentLayoutPolicy`

原因不是这两个维度不重要，而是它们不应该都暴露成一等公开概念。长期正确做法是把它们收束到一个节点行为对象里。

### NodeTransformBehavior 的职责

它至少回答两件事：

- 这个节点支持哪些 `TransformOperationFamily`
- 当 selection projector 把 selection box 投影到该节点后，该节点如何把 `nextRect` 转换成 preview / commit

也就是说，节点不再只声明：

- `canResize`
- `canRotate`

而是声明一份完整的 transform behavior。

### 三类节点的行为差异

#### `text`

- 支持 `resize-x`
- 支持 `scale-xy`
- 不支持 `resize-y`

内部语义：

- `resize-x` 是 flow width / wrap width 语义
- `scale-xy` 是几何缩放 + 字号缩放

#### `sticky`

- 支持 `resize-x`
- 支持 `resize-y`
- 支持 `scale-xy`

内部语义：

- 任何 family 的核心都是 box 变化
- 文本大小由 autofit / 测量逻辑响应 box，而不是通过 `wrapWidth` 持久化

#### `shape`

- 支持 `resize-x`
- 支持 `resize-y`
- 支持 `scale-xy`

内部语义：

- 主要是几何 box 变化
- 文本区跟随 box 变化
- 文字字号通常保持不变

### 内部实现细节怎么处理

如果工程实现时仍然需要内部拆分维度，可以在 `NodeTransformBehavior` 内部保留：

- box capability
- content response policy

但它们都只是 `NodeTransformBehavior` 的内部字段，不再成为独立的系统级概念，也不再写进最终架构作为一等模型。

---

## 三、SelectionTransformPlan

这是整个系统的核心中间结果，也是 selection 层到 transform 层的唯一桥。

selection 不再只产出：

- `canResize: boolean`

而是必须产出一份完整 plan：

- 当前 selection 的可见 handles
- 每个 handle 对应哪个 operation family
- 当前参与 transform 的 members
- 每个 member 使用哪个 `NodeTransformBehavior`

### 建议的数据结构

```ts
type TransformOperationFamily =
  | 'resize-x'
  | 'resize-y'
  | 'scale-xy'

type SelectionHandleId =
  | 'w'
  | 'e'
  | 'n'
  | 's'
  | 'nw'
  | 'ne'
  | 'se'
  | 'sw'

type SelectionTransformPlan = {
  box: Rect
  handles: readonly {
    id: SelectionHandleId
    visible: boolean
    enabled: boolean
    family?: TransformOperationFamily
    cursor: string
  }[]
  members: readonly {
    id: NodeId
    node: Node
    rect: Rect
    behavior: NodeTransformBehavior
  }[]
}
```

上面只是结构示意，最终命名可按现有仓库风格收敛，但概念必须保留。

### planner 的职责

planner 只做四件事：

1. 收集当前 selection 的 members
2. 读取每个 member 的 `NodeTransformBehavior`
3. 决定当前 selection 允许哪些 handle
4. 把 handle 映射到 `TransformOperationFamily`

planner 不直接做几何投影，不直接做 commit。

---

## 四、projectSelectionTransform(...)

projector 不再暴露成三个系统级函数名：

- `projectSelectionResizeX`
- `projectSelectionResizeY`
- `projectSelectionScaleXY`

它们如果存在，也只是 `projectSelectionTransform(...)` 内部按 family 分派的私有实现。

### 统一入口

最终对外只保留一个选择级投影入口：

```ts
projectSelectionTransform({
  plan,
  family,
  nextBox,
  modifiers
})
```

它输入：

- `SelectionTransformPlan`
- `TransformOperationFamily`
- `nextSelectionBox`
- modifiers / snap 上下文

它输出：

- 每个 member 的 preview patch
- guides
- commit 所需的预览状态

### 为什么必须统一入口

因为 input 层不应该知道：

- text 多选该调哪个函数
- sticky 多选该调哪个函数
- mixed selection 该调哪个函数

input 层只应该知道：

- 当前 handle 对应哪个 `TransformOperationFamily`

然后统一调用：

- `projectSelectionTransform(...)`

再由 projector 根据 `plan.members[].behavior` 分发到节点级实现。

---

## 推荐的产品策略

底层模型要比当前产品策略更强，但默认产品层可以保守。

### 纯 `text` 多选

显示：

- `e`
- `w`
- `nw`
- `ne`
- `se`
- `sw`

语义：

- `e/w => resize-x`
- `corners => scale-xy`
- `n/s` 不显示

### 纯 `sticky` 多选

显示：

- `n`
- `e`
- `s`
- `w`
- `corners`

语义：

- `e/w => resize-x`
- `n/s => resize-y`
- `corners => scale-xy`

### 纯 `shape` 多选

显示：

- `n`
- `e`
- `s`
- `w`
- `corners`

语义同 sticky，但内容布局策略不同。

### 混合多选：包含 `text`

#### 底层能力

底层应该支持：

- `resize-x`
- `scale-xy`

也就是说，从 engine 能力上讲，mixed selection 并不需要被硬禁掉。

#### 默认产品策略

建议默认只暴露：

- `corners => scale-xy`

不默认暴露：

- `e/w => resize-x`
- `n/s => resize-y`

原因：

- mixed selection 里的 `resize-x` 在用户心智上不是完全同一种行为：
- `text` 是 reflow
- `sticky` 是 box 改宽再 autofit
- `shape` 是 box 改宽但字号不变

底层可以统一，产品默认不一定要统一暴露。

因此：

- engine / planner 保留 mixed `resize-x` 能力
- 默认 UI policy 先只暴露 `scale-xy`
- 以后如需开放 mixed `resize-x`，只改 planner policy，不改 transform engine

---

## 旧层必须删除

这是一步到位方案里最关键的部分。下面这些旧中间层不应该继续保留。

### 必删 1：selection 粗粒度 resize 枚举

删除：

- `selection.transform.resize: 'resize' | 'scale' | 'none'`

原因：

- 它太粗，表达不了 handle 粒度和 operation family

替代：

- `SelectionTransformPlan`

### 必删 2：`affordance.canResize` 作为唯一 resize 信息源

删除：

- “只靠 `boolean` 控制是否显示 transform handles”

替代：

- `SelectionTransformPlan.handles`

### 必删 3：editor 侧 `single-text` 旁路

删除：

- `single-text`
- editor input 层按 `node.type === 'text'` 做 transform 特判

原因：

- 这是把核心 transform 语义放在最外层 session 做补丁

替代：

- `projectSelectionTransform(...)` + `NodeTransformBehavior`

### 必删 4：`multi-scale` 作为唯一多选 resize 模型

删除：

- “多选 resize 永远等于几何比例缩放”

替代：

- `resize-x`
- `resize-y`
- `scale-xy`

这三个 selection-level operation family

### 必删 5：`isNodeScalable(...)` 这种只按单维 capability 决策的中间层

删除：

- selection 阶段通过一个 `isNodeScalable` 布尔值决定多选 resize 能否启用

原因：

- 它只能回答“能不能 scale”
- 回答不了“能不能 resize-x / resize-y”

替代：

- node-level `NodeTransformBehavior`

---

## 最终只保留哪些东西

最终底层只保留下面这些概念：

- `TransformOperationFamily`
- `NodeTransformBehavior`
- `SelectionTransformPlan`
- `projectSelectionTransform(...)`

最终 UI / editor / core 的职责边界：

### core

- 定义 transform model
- 生成 selection transform plan
- 做 projector 投影
- 输出 preview / commit patch

### editor

- 根据 pick 的 handle id 启动对应 operation
- 管理 interaction session
- 不再拥有 text 专属 transform 语义

### react

- 只消费 handle presentation
- 不再自己推断哪些 handle 该出现

---

## 一步到位重构路径

虽然这次文档不要求写代码，但为了避免未来实施时再次回到兼容思路，这里明确一步到位的落地顺序。

### 1. core：引入节点 transform behavior 模型

为节点定义：

- `NodeTransformBehavior`

内部如果实现上还需要拆分：

- box capability
- content response policy

也只能作为 `NodeTransformBehavior` 的内部字段存在，不再成为公开概念。

### 2. core：selection 不再产出 resize boolean，改产出 plan

替换：

- `transform.resize`
- `canResize`

为：

- `SelectionTransformPlan`

### 3. core：把 text 单选 transform 语义下沉并通用化

把当前 editor 里的单选 text resize 语义下沉到 `NodeTransformBehavior`，并通过统一投影入口复用：

- `resize-x`
- `scale-xy`

### 4. core：实现统一的 selection transform projector

对外只保留：

- `projectSelectionTransform(...)`

内部再按 `TransformOperationFamily` 分支处理：

- `resize-x`
- `resize-y`
- `scale-xy`

并通过 `plan.members[].behavior` 分发到具体节点实现。

### 5. editor：删除 `single-text` transform branch

editor input 层不再按节点类型推导 transform 语义，只根据 plan 的 handle family 启动通用 session。

### 6. react：按 plan 渲染 handles

React 只接收：

- 哪些 handle visible
- 哪些 enabled
- 对应 cursor

不再从 `canResize` 反推全部 handles。

---

## 关键设计原则

### 原则 1：不要按节点类型写 transform 逻辑

应该按 `NodeTransformBehavior` 做统一节点级抽象，而不是在 selection、editor session、React handle 三层重复按节点类型写规则。

### 原则 2：selection 只做 plan，不做业务特判

selection planner 的工作是：

- 汇总能力
- 决策 handles
- 生成 operation family

不是在 selection 层直接决定 patch 怎么写。

### 原则 3：projector 是唯一投影入口

所有：

- 单选 resize
- 单选 text reflow
- 多选 scale
- 多选 resize-x

都应该进入统一 projector 体系，而不是 session 里各开旁路。

### 原则 4：产品策略和底层能力分离

底层可以支持 mixed selection 的 `resize-x`，但产品默认可以不显示。

这必须体现在：

- planner policy 可调
- engine capability 不受限

---

## 最终结论

这次多选 resize 的长期正确方向不是：

- 继续保留 `multi-scale` 再补几个特判
- 继续在 editor 里为 text 开旁路
- 用一个 `text-like` 概念把 `text/sticky/shape` 粗暴塞在一起

长期最优方案是：

- 用 `NodeTransformBehavior` 描述节点级 transform 语义
- 用 `SelectionTransformPlan` 统一生成 handle 与 operation family
- 用 `projectSelectionTransform(...)` 统一生成 preview / commit

最终系统才会真正具备：

- 单选和多选同构
- text / sticky / shape 差异可表达
- mixed selection 可被 planner 精细控制
- UI / editor / core 职责边界清晰
- 后续不需要再到处打补丁
