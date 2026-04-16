# Whiteboard Mindmap Edit 与 Text Toolbar 纠偏方案

## 1. 结论

当前 mindmap root topic 的编辑问题，不是因为 root topic 不是 `text`，而是因为：

- root topic 虽然是一个真实 `text` node
- 但它仍然挂在 `mindmap` 的特殊渲染岛里
- 进入编辑态时，React 侧的 source element 切换又触发了一次 `layout.sync`
- 这个 `sync` 会把 `node.size` 写回 document
- 而 `mindmapId` 节点一旦写回 `size`，engine 又会立刻整树 relayout，并把整棵树的 `position` 再写一遍

结果就是：

- 点击进入编辑的那一拍，root topic 的宿主 DOM / 几何 / 位置被再次改动
- focus、caret、IME、显示态与编辑态之间的切换不稳定
- 表面看像“没进编辑”或“caret 消失”，本质上是编辑启动时发生了错误的 document 同步

另一条被带偏的线是 `text` 的 selection / toolbar 模型。

正确语义一直应该是：

- `text` / `sticky` / `shape` 进入 node edit 时，仍然保持 selected
- selection box 仍然存在
- toolbar 仍然存在
- 只需要收起 transform handles，不应该把整个 toolbar 或 overlay 一刀切隐藏

也就是说，本轮要纠偏的不是某个 CSS 细节，而是两条中轴语义：

1. `node edit` 不能因为 source element 切换而立即回写 document
2. `node edit` 不等于 “隐藏 toolbar / 清掉 selection chrome”

---

## 2. 现状诊断

## 2.1 root topic 当前的真实模型

当前 root topic 并不是 `mindmap` 容器本体，而是一个真实 `text` node。

创建时的语义是：

- `mindmap` root container: `type: 'mindmap'`
- root topic: `type: 'text'`, `mindmapId = mindmap container id`
- child topics: 也都是 document 里的真实 node

所以从数据模型看，root topic 本来就应该和普通 `text` 一样支持：

- select
- edit
- toolbar
- selection box
- text layout

唯一应该不同的是：

- drag root topic body 时，语义是拖整棵树，而不是只移动一个 node

除了这个拖拽策略差异，其他行为都应该和普通 `text` 完全一致。

## 2.2 当前 root edit 失稳的真实原因

当前启动编辑的链路大致是：

1. 第二次点击 root topic
2. selection press 判断为 `edit-node`
3. `local.edit.startNode(rootId, 'text')`
4. text renderer 从 display `<div>` 切换成 `EditableSlot`
5. 新的 editable/source element 绑定到 `textSources`
6. 绑定过程中调用 `editor.actions.node.layout.sync([nodeId])`
7. `layout.sync` 根据当前 DOM 测量并 patch `node.size`
8. `node.patch` 命中 `mindmapId` 节点
9. engine 对整个 mindmap 重新 layout，并把 subtree `position` 全部再写回一次

这个行为对普通 text 也偏重，但对 root topic 最致命，因为 root topic 正好处于整树渲染岛内部的锚点位置。

所以现象会变成：

- DOM 刚切到编辑态，又被新的几何/位置更新冲一次
- caret 可能建立失败或瞬间失效
- IME 一度拿到焦点，但用户看不到稳定的编辑 UI
- 文字确认后也可能因为 display/editor host 的重建而表现异常

## 2.3 为什么这不是单纯 CSS 问题

如果只是 CSS 问题，通常会表现为：

- caret 不明显
- 文字颜色不对
- contentEditable 高度不对

但现在的症状是：

- 输入法可以输入
- 可视 caret 不稳定
- 文本确认后也看不到稳定结果
- root topic 在编辑启动时像是被“打断”了一次

这说明问题更靠近：

- focus 生命周期
- host remount
- 文档 patch 时机
- mindmap relayout 时机

而不是简单的样式错误。

---

## 3. 最终目标

最终要达到的行为非常简单：

## 3.1 普通 `text`

- 单击：选中
- 再次点击：进入编辑
- 编辑中：保持蓝框与 toolbar
- 编辑中：隐藏 resize/rotate handles
- 输入时：本地 draft 布局稳定
- commit 后：document 得到最终 `text` 与 `size`

## 3.2 mindmap root topic

- 行为与普通 `text` 完全一致
- 唯一差异：拖 root body 时移动整棵树
- 进入编辑时绝不因为 host 切换触发整树 relayout

## 3.3 mindmap child topic

- 行为与普通 `text` 完全一致
- 拖拽 subtree 时仍然由 mindmap drag 策略接管
- 编辑、toolbar、selection box 不应再出现任何 child 特判

## 3.4 edge label

这是唯一需要继续当作特殊编辑对象处理的类型。

edge label 编辑态下可以独立隐藏：

- edge toolbar
- route handles
- source/target handles

但这套特殊逻辑不能外溢到普通 node edit。

---

## 4. 正确的 Text 模型

## 4.1 `text` 的中轴语义

`text` 的 authored inputs 只有：

- `data.text`
- `style.fontSize`
- `style.fontWeight`
- `style.fontStyle`
- `data.widthMode`
- `data.wrapWidth`
- `position`
- `rotation`

`text` 的 computed output 只有：

- `size`

这里必须再次明确：

- 把 computed `size` 写回 document 是正常的
- 但“何时写回”必须由 editor 中轴控制
- React renderer 不能因为 source element 切换就顺手 patch document

## 4.2 `text` 编辑态的正确模型

进入 node edit 后，应该有两层状态：

### committed

- `document.nodes[nodeId]`
- 里面保存 committed `text`、`size`

### local draft

- `edit session`
- 里面保存 draft `text`
- 以及 editor 根据 layout backend 算出的 draft `size`

渲染时：

- `CanvasNodeSceneItem` / `NodeProjection` 读取 committed node
- 如果当前 node 正在 edit，则叠加 local draft 的 `text` 与 `size`

也就是说：

- draft 期的可见布局来自 editor local state
- committed document 只在合适时机被写回

## 4.3 哪些时机允许写回 committed `size`

允许：

- 文本 commit
- toolbar 改变字号、字重、斜体、wrapWidth 等 authored 输入后，editor 主动触发同步
- resize / transform 结束后，editor 以统一布局结果写回
- 非编辑态下，显式执行 `node.layout.sync`

不允许：

- display DOM 与 editable DOM 切换的那一拍
- 只是 bind 新 source element 时
- 只是为了让 layout backend 拿到一个新 element 时

一句话：

`source host changed` 不等于 `document geometry changed`

---

## 5. 正确的 Toolbar / Selection 模型

## 5.1 node edit 不应隐藏 toolbar

对 `text` / `sticky` / `shape` / `frame title` 这类 node field edit，正确模型是：

- node 仍然 selected
- selection box 仍然保留
- toolbar 仍然保留
- 只隐藏 transform handles

原因很简单：

- toolbar 是 selection 的投影，不是 transform mode 的附属物
- 编辑文本时用户仍然可能继续改字号、颜色、对齐、粗细
- 如果进入编辑就把 toolbar 整个撤掉，会让文本编辑退化成一条特殊分支

## 5.2 只有哪些情况应该隐藏 toolbar

应该单独收起 toolbar 的场景应非常少：

- edge label edit
- edge drag / route / connect
- 其他明确的 interaction chrome 占用模式

不应该做：

- `edit !== null -> toolbar = undefined`

这是错误模型。

## 5.3 selection box 的正确语义

node edit 时的 selection box 正确语义：

- box 继续存在，便于用户理解当前编辑对象
- transform handles 可隐藏，避免误操作
- box 的几何应基于当前 draft 投影，而不是旧 committed rect

所以：

- `overlay` 不应因 `node edit` 整体消失
- 只应当把 `handles` 关掉

## 5.4 纠偏原则

以后凡是看到下面这种逻辑，都应优先怀疑是错误方向：

- `if (edit) return undefined`
- `if (node is editing) hide toolbar`
- `if (node is editing) clear selection`
- `EditableSlot mounted -> patch document`

正确方向始终是：

- selection 仍然成立
- toolbar 仍然成立
- draft layout 由 editor local state 承担
- committed patch 由 editor 明确驱动

---

## 6. Mindmap Root / Child 的最终行为约束

## 6.1 root topic

root topic 必须满足：

- pick path 与普通 node 相同
- select 语义与普通 node 相同
- repeat click enter edit 与普通 node 相同
- toolbar 与普通 node 相同
- selection box 与普通 node 相同

唯一特例：

- root topic body drag -> tree move

除此之外不允许再有：

- root edit 特判
- root toolbar 特判
- root selection 特判
- root text source 特判

## 6.2 child topic

child topic 也一样：

- 本质上就是普通 node
- 只是 ownership 为 `mindmapId`
- drag subtree 时由 editor 的 drag policy 接管

不应再出现：

- child 专用 renderer 语义
- child 专用 edit session
- child 专用 toolbar context

## 6.3 branch

branch 的最终语义要继续保持简单：

- 纯视觉
- 不可点击
- 不可选中
- 不参与 toolbar
- 不参与 edit

---

## 7. 需要纠正的错误实现方向

## 7.1 React source binding 不应隐式写文档

当前最危险的一条旁路就是：

- source element 绑定成功
- 立即 `node.layout.sync(nodeId)`

这会把“DOM host 已就绪”和“几何应该提交”错误地绑定在一起。

最终应改成：

- source binding 只负责把 element 注册给 layout backend
- 不负责 document patch
- editor 需要同步时，自己在明确时机调用 layout

## 7.2 mindmap relayout 不应被编辑 host 切换触发

只要是下面这种场景，都不应该立即整树 relayout：

- 进入编辑
- display 切 editable
- editable 切 display
- source ref 重绑

真正允许整树 relayout 的是：

- committed `size` 真的变了
- committed `text style` 真的变了
- committed `wrapWidth` 真的变了
- subtree 结构变了

## 7.3 toolbar / overlay 不能围绕 `edit !== null` 建模

toolbar / overlay 的条件应围绕“当前 interaction 是否要求收起 chrome”建模，而不是围绕“是否存在 edit session”建模。

正确优先级应当是：

1. edge special editing / routing / dragging
2. transform / drag interaction
3. node edit

其中 node edit 只影响：

- handle visibility
- 局部 draft projection

不影响：

- selection existence
- toolbar existence
- overlay existence

---

## 8. 最终中轴设计

## 8.1 editor 是唯一布局协调者

最终职责边界：

### core

- 定义 node layout 语义
- 定义 text width mode / wrap width
- 定义 mindmap layout 算法

### editor

- 持有 edit session
- 在 edit / transform / toolbar / command 中统一调用 layout backend
- 决定何时只更新 local draft
- 决定何时写回 committed document
- 决定 mindmap child size 变化后何时整树 relayout

### react

- 提供 DOM text source
- 提供 measurement backend
- 不直接决定 document patch 时机

## 8.2 需要长期保留的最小规则

规则 1：

- `Node edit` 期间，布局变化优先写 local draft，不要立即写 committed document

规则 2：

- `Selection` 与 `Edit` 是正交状态，不互相覆盖

规则 3：

- `Mindmap drag` 只接管 drag policy，不接管 edit / toolbar / text layout 语义

规则 4：

- `React host lifecycle` 不是业务语义事件，不能直接驱动 document patch

---

## 9. 建议落地顺序

## Phase 1：先纠正 selection / toolbar 模型

- 明确 node edit 不隐藏 toolbar
- 明确 node edit 不隐藏 selection box
- node edit 时只隐藏 transform handles
- edge label edit 继续单独隐藏 edge chrome

这个阶段只是在 selection presentation 中轴纠偏。

## Phase 2：切断 source binding -> layout.sync 的隐式链路

- text source 注册只做注册
- 不在 bind 时自动 patch document
- editor 在明确时机显式 sync

这是 root edit 稳定性的关键。

## Phase 3：把 node edit 期间的 text size 完全收敛到 editor draft layout

- input/change 时只更新 local draft layout
- render 从 projection 叠加 draft size
- commit 时再统一写 document

这一步能把普通 text 与 root topic 行为统一。

## Phase 4：mindmap 只保留 drag / structure / branch 的特化

- root/child 编辑完全复用普通 node
- root/child toolbar 完全复用普通 node
- mindmap 只对 drag、layout、branch 树结构负责

做到这一步后，mindmap 才算真正回到“扁平 owned-node”模型。

---

## 10. 作为实现依据的硬约束

以下约束建议直接当作后续代码重构的实现依据：

1. root topic 是真实 `text` node，不是特殊编辑对象。
2. child topic 是真实 node，不是 virtual node。
3. node edit 不得隐藏 toolbar。
4. node edit 不得隐藏 selection box。
5. node edit 只隐藏 transform handles。
6. edge label edit 才允许单独隐藏 edge chrome。
7. React source host 切换不得直接触发 committed document patch。
8. `mindmapId` node 的 committed size 变化，才允许驱动整树 relayout。
9. root topic 除拖拽策略外，行为必须与普通 text 完全一致。
10. 任何围绕 `edit !== null` 的全局 chrome 抑制逻辑，默认都应视为错误方向。

---

## 11. 一句话总结

最终正确模型不是：

- “mindmap root 是特殊文本”
- “编辑文本时把 toolbar 隐藏掉”
- “React mount 一个 editable 就顺手同步 size 回 document”

最终正确模型是：

- root/child 都是普通 node
- mindmap 只接管树结构与拖拽策略
- selection 与 edit 并行成立
- toolbar 在 node edit 时继续存在
- document 的 computed layout 写回由 editor 明确驱动，而不是由 React host 切换偷偷触发

只有这样，mindmap root edit、普通 text toolbar、selection box、IME/caret 稳定性才能一起回到正确轨道。
