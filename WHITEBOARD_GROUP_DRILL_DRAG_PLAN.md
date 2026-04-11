# Whiteboard Group Drill Drag 方案

## 结论

当前这套行为不理想：

- 点击 group 内的 node 一次，选中整个 group
- 再点击一次，钻取成单个 node
- 但一开始拖动，又临时显示整个 group 的蓝框

这个交互不够一致。

原因不是功能做不到，而是当前系统同时维护了两套语义：

- 静止态语义是“现在选中的是 node”
- 拖动态语义却又退回“现在临时按 group 操作”

长期最优应该改成：

- `group selected` 就拖 group
- `node drilled` 就拖 node

不要在拖动开始时偷偷把 `node drilled` 临时 promote 回 group。

一句话：

- selection、overlay、drag target 必须始终表达同一个对象

## 为什么现在不合理

现在用户看到的是：

1. 第一次点击 group 内 node
   选中整个 group
2. 第二次点击同一个 node
   已经切换成只选中这个 node
3. 开始拖动
   蓝框突然又变成整个 group

这里的问题不在“可不可以拖整个 group”，而在：

- 视觉反馈和真实操作对象不一致

既然第二次点击已经明确表示“我要钻取到 node”，后续拖动就应当延续这个状态。

否则用户会看到：

- 选中的是 node
- 但拖拽反馈变成 group
- 实际移动目标也可能变成 group

这会直接破坏所见即所得。

## 当前实现的问题点

当前实现里，拖动开始时会临时把 selection 提升成 group selection。

关键链路：

- 在 `pressPolicy` 里，只要命中 node 且它属于 group，就可能 `promoteToGroup`
- 然后通过 `temporary move selection` 给 move interaction 一个临时 `visibleSelection`
- move 开始时把 runtime selection 替换成这个临时 selection
- overlay 又是完全基于当前 selection 计算的

结果就是：

- 静止时你看到 node selection
- 一拖动，selection 被临时替换成 group selection
- 蓝框立刻变成 group

这条链路从实现上讲是通的，但从交互上讲是错误分层：

- 内部为了复用 group move，把 selection 可视状态也一起改了

这不应该。

## 最终交互模型

## 两个明确模式

必须把 group 交互拆成两个明确模式：

### 1. Group 模式

含义：

- 当前真正选中的是整个 group

表现：

- 蓝框显示整个 group
- 拖动移动整个 group
- toolbar / menu 也按 group 语义展示

进入方式：

- 点击 group 本体
- 点击 group 内 node，但当前并未 drill
- 其他显式“返回 group”操作

### 2. Drill 模式

含义：

- 当前真正选中的是 group 内的某个 node

表现：

- 蓝框显示该 node
- 拖动只移动该 node
- resize/rotate/toolbar 都按 node 语义工作

进入方式：

- 当前 group 已选中时，再次点击其中某个 node

关键要求：

- 一旦进入 drill，拖动不能再自动 promote 回 group

## 核心规则

必须满足以下规则：

1. 当前蓝框框住谁，拖动默认就操作谁。
2. 当前 selection 是 group，就拖 group。
3. 当前 selection 是 drilled node，就拖 node。
4. 不允许在 `pointerdown -> drag start` 之间偷偷切换成另一种 selection 语义。

## overlay / drag / selection 的一致性要求

长期必须明确这三个概念：

- `selection`: 当前真正选中的对象
- `overlay`: 当前选中对象的视觉表达
- `drag target`: 当前拖动真正操作的对象

这三个对象在默认情况下必须一致。

也就是说：

- `selection = node`
- `overlay = node`
- `drag target = node`

或者：

- `selection = group`
- `overlay = group`
- `drag target = group`

不能再出现这种组合：

- `selection = node`
- `overlay = group`
- `drag target = group`

这种组合虽然实现上方便，但会让用户完全无法预测系统到底在操作谁。

## 推荐交互细节

## 默认行为

推荐采用下面这套：

1. 点击 group 内 node
   选中整个 group
2. 再点击该 node
   钻取为该 node
3. 进入 drill 后拖动
   只移动该 node
4. 要回到 group
   点击 group 外框、selection box、或空白后再点 group

这套规则的优点：

- 最符合你们已有的双击层级语义
- 不需要额外记快捷键
- 蓝框和拖动目标始终一致

## 可选增强

如果后续想保留“drill 后仍能方便拖整组”，建议只做显式入口，不要做隐式 promote。

可以考虑的增强：

- 点击 group selection box 回到 group 模式
- 在 drill 模式下显示一个淡的 group outline，但主蓝框仍然只跟 node
- 用修饰键临时切换到“拖整组”

这些都可以，但它们必须是显式的，不能默认抢走当前 node selection 的控制权。

## 不建议的方案

不建议保留当前这类 temporary promote：

- 静止时是 node
- 一拖动临时切回 group
- 结束后再恢复 node

原因：

- 视觉反馈不稳定
- selection 语义不稳定
- 用户很难建立心智模型
- 后续继续叠加 frame、mindmap、nested group 时复杂度会更高

## 实现原则

## 1. 删除 temporary visible selection promote

当前 move interaction 开始前，如果是 drilled node，不应该再写入 group 的 `visibleSelection`。

应当删除这类逻辑：

- “为了移动 group，临时把当前 selection 替换成 group selection”

默认行为应该改成：

- 现在选中谁，就移动谁

## 2. 显式区分 group selected 与 drilled node

长期最好把“drill”作为一个明确状态表达，而不是只靠当前 `SelectionTarget` 推断。

最小可行表达可以是：

- 当前 selection target 仍然是 node
- 但 session / interaction 层知道这个 node 属于哪个 group，且当前处于 drilled 状态

这样后续如果要做：

- 返回 group
- 轻提示外框
- 面包屑层级

都更容易扩展。

如果当前不想加状态，也至少要遵守一条：

- `SelectionTarget` 一旦是 node，就别在 drag start 时偷偷替换成 group

## 3. overlay 只能读真实 selection

selection overlay 必须只基于真实 selection 计算。

不能再依赖：

- 某个 move-only 的临时 visible selection

否则蓝框永远会泄露内部实现细节。

## 4. drag target 的提升必须显式触发

如果未来确实要支持：

- drilled node 状态下拖整组

也只能通过显式触发：

- 点击 group 框
- 特定修饰键
- 特定命令

不能在默认 drag 里自动触发。

## 最小改造路径

建议按这个顺序改：

1. 删除 `drilled node -> drag start -> temporary group visibleSelection` 这条链路。
2. 保证当前 selection 是 node 时，move interaction 的 target 也就是这个 node。
3. 保证 selection overlay 完全跟当前真实 selection 走，不吃 temporary promote。
4. 如有需要，再补一个“返回 group 模式”的显式入口。

## 最终判断

如果产品已经支持“再次点击 group 内 node 可钻取为 node”，那拖动时就应该尊重这个状态。

长期最优不是：

- 继续保留临时 promote 回 group

而是：

- 让 group 模式和 drill 模式成为两个明确、稳定、可预期的状态

最终规则应当非常简单：

- 你看到谁被选中，就拖谁。
