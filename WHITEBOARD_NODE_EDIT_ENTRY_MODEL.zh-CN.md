# WHITEBOARD_NODE_EDIT_ENTRY_MODEL.zh-CN

## 目标

把 whiteboard 里“节点如何进入编辑模式”收敛成一套长期稳定、低歧义、可预测的交互协议。

这份文档重点回答五件事：

- 当前设计实际上是什么
- 为什么现在会让人感觉“点了也进不去编辑”
- group 内节点和普通节点的点击阶段应该如何统一
- `enter`、`field`、selection 三者的职责应该如何拆分
- `frame.title` 这类 shell 字段应不应该走 `enter`

---

## 当前实现

当前进入编辑模式不是靠原生 `dblclick`，也不是靠一个显式“双击计数器”。

当前实现本质上是：

- 在 `select` 工具下
- pointer down / up 形成一次 tap
- 如果 tap 命中的是 node body
- 且这个 node 当前已经是单选状态
- 且这次点击还带着可编辑 `field`
- 才把 tap 解释成 `edit`

也就是：

```ts
repeat tap on selected node + field hit -> edit
```

不是：

```ts
repeat tap on selected node -> edit
```

---

## 当前 group 阶段

当前代码里已经存在一套 group 内 child 的阶段化选择逻辑：

- 第一次点 group 内 child，不一定直接选中 child
- 在 replace 模式下，如果命中的是 group 内普通 child，系统会优先把 press target 提升到 group
- group 已经被选中后，再点 child，才会把目标落到 child 本身
- child 已经成为单选后，再次 repeat tap，才可能进入编辑

所以当前实际点击阶段是：

### 1. 普通节点

- 第一下：选中 node
- 第二下：如果命中了可编辑 `field`，进入编辑

### 2. group 内节点

- 第一下：选中 group
- 第二下：选中 child node
- 第三下：如果命中了可编辑 `field`，进入编辑

这和用户直觉里“普通 node 两下，group child 三下”的节奏已经接近。  
真正不稳定的地方在于最后一下还强依赖 `field` 命中。

---

## 当前问题

## 1. 进入编辑被错误地绑定到 `field hit`

当前协议里，`field` 同时承担了两件事：

- 决定用户点击的是不是“可编辑内容区”
- 决定这次 repeat tap 能不能升级成 `edit`

这会造成明显问题：

- 用户已经选中了 node
- 再点 node 一下
- 但如果没有恰好点在 `text/title` 那块区域上
- 就不会进入编辑

这和用户心智不一致。

用户想的是：

- “这个 node 已经被我选中了”
- “我再点一下，就是要进去编辑它”

而不是：

- “我还得猜这一下是不是落在某个 DOM field 上”

---

## 2. `enter` 能力没有真正成为协议入口

whiteboard 里已经有 `NodeDefinition.enter` 这个能力位，但当前 edit 进入决策并没有真正围绕它展开。

结果是：

- 定义层有 `enter`
- DOM 层有 `data-node-editable-field`
- selection press 里又单独看 `field`

三者没有形成明确分工。

最终表现就是：

- “这个节点到底能不能 enter”
- “点哪里才能 enter”
- “field 是选哪个字段，还是决定能不能 enter”

都不够清楚。

---

## 3. DOM 命中细节泄漏到了交互协议层

`data-node-editable-field` 本来应该只是：

- 当系统决定进入编辑后
- 用来解析默认编辑字段

它不应该上升成主协议条件。

否则协议会被 DOM 布局绑架：

- 文字区域小一点，编辑就更难触发
- 视觉结构一变，进入编辑的稳定性也变
- overlay / chrome / transform frame 如果遮住命中链，编辑入口就会漂移

长期这会持续制造噪音。

更关键的是：

- `data-node-editable-field` 现在还是 DOM attribute 协议
- 它没有进入 whiteboard 正式的 pick / input 协议
- 所以字段编辑入口仍然依赖 `closest(...)` 这类 DOM 扫描

这不适合作为长期模型。

---

## 长期目标

whiteboard 的长期最优模型应该是：

- selection 决定“当前逻辑焦点在哪个 node 上”
- `enter` 决定“这个内容节点是否支持通过 repeat tap 进入编辑”
- `field` 决定“用户是否明确点击了某个显式字段”

三者严格分工。

也就是：

```ts
selection -> focus node
enter -> implicit edit entry for content node
field pick -> explicit field edit target
```

而不是：

```ts
field -> whether user can edit at all
```

---

## 最终交互模型

## 1. 普通节点

### 支持编辑的 node

- 第一下：选中 node
- 第二下：进入编辑

### 不支持编辑的 node

- 第一下：选中 node
- 第二下：保持选中，不进入编辑

---

## 2. group 内节点

### 支持编辑的 child node

- 第一下：选中 group
- 第二下：选中 child node
- 第三下：进入编辑

### 不支持编辑的 child node

- 第一下：选中 group
- 第二下：选中 child node
- 第三下：保持选中，不进入编辑

---

## 3. container shell 与显式字段

frame / group 这类 container shell 的规则应和内容节点明确分开：

- 点 shell：只做 selection / move / resize
- 不因为重复点击 shell 自动进入内容编辑

如果 container 自己有可编辑字段，例如 frame title：

- 点到字段本身才进入该字段编辑
- 点 shell 本身不进入字段编辑
- 即使该字段视觉上位于 frame rect 内部，也不改变这条协议
- 未来字段移到 frame 左上角外部，这条协议仍然成立

换句话说：

- shell 负责结构交互
- `enter` 只负责内容节点的隐式进入
- `field click` 负责显式字段编辑

不要混在一起。

---

## 最终规则

## 1. 进入编辑只依赖“逻辑 repeat tap”

长期协议应改成：

### 条件

- tool 必须是 `select`
- mode 必须是 `replace`
- 当前 press target 必须是最终逻辑 node
- 当前该 node 必须已经是单选焦点
- 该 node definition 必须 `enter === true`

满足这些条件后：

- repeat tap on selected logical node -> edit

这里“不再要求这一下必须命中 field DOM”。

---

## 2. `field` 的职责收敛为“显式字段编辑入口”

`field` 未来只负责：

- 如果这次 tap 命中了正式 `field pick`
- 那么直接进入该字段的编辑

`field` 不再负责：

- 决定 repeat tap 能不能 enter
- 为内容节点提供默认编辑字段推断

所以长期应该是：

```ts
repeat tap on selected content node + enter === true -> edit content
field hit -> edit that field
```

这里的 `field hit` 不应再由 DOM attribute 临时解析得到。  
长期应直接升级成正式 pick：

```ts
type EditorPick =
  | { kind: 'node', id: NodeId, part: 'body' | 'shell' | 'connect' | 'transform' }
  | { kind: 'node', id: NodeId, part: 'field', field: 'text' | 'title' }
```

也就是：

- 字段点击属于正式输入协议
- 不是 DOM attribute 的旁路补丁

---

## 3. `enter` 必须成为 definition 级内容能力

长期应把是否支持进入编辑完全收敛到 definition：

- `enter: true` 表示该内容 node 支持通过 repeat tap 进入编辑
- `enter: false | undefined` 表示该 node 不支持

这里不建议再引入 `enterField`。

原因：

- `enter` 只需要回答“内容节点能不能通过 repeat tap 进入编辑”
- 显式字段例如 `frame.title` 走字段点击入口，不该并入 `enter`
- 如果再引入 `enterField`，很容易把 shell 字段和内容 enter 混回一条线

所以长期最小协议就是：

```ts
type NodeDefinition = {
  enter?: boolean
}
```

---

## 4. group 阶段与编辑阶段必须分离

group child 的三击模型本质上是两个阶段：

### 阶段 A: 结构导航

- group 内 child 第一次点击，焦点落到 group
- 再点 child，焦点下钻到 child

### 阶段 B: 内容进入

- 焦点已经落到 child 后
- 再次 repeat tap，才尝试 enter

这两个阶段不能混。

尤其不能出现：

- group 还没成为焦点
- 但用户只是点到了 child 文本区域
- 系统就直接进入编辑

这会破坏 group 结构导航的一致性。

---

## 命名建议

为了降低噪音，长期命名建议只保留下面这些词：

- `enter`
- `focus node`
- `repeat tap`
- `logical target`
- `field click`

不建议继续使用模糊词：

- `doubleClickEdit`
- `editable hit`
- `text click`
- `content click`

因为这些词要么过于依赖 DOM，要么和浏览器双击事件语义耦合过深。

---

## 状态机

长期推荐把 press -> tap 的结果整理成下面这个状态机。

## 1. 普通 node

```ts
idle
  -> tap node
  -> selected(node)

selected(node)
  -> repeat tap same logical node && node.enter
  -> editing(node)
```

## 2. group child

```ts
idle
  -> tap child-in-group
  -> selected(group)

selected(group)
  -> tap same child logical path
  -> selected(child)

selected(child)
  -> repeat tap same logical child && child.enter
  -> editing(child)
```

---

## field 解析规则

进入编辑时字段解析规则应固定如下：

### 1. 内容节点

- `repeat tap + enter === true` 进入该节点的主内容编辑
- 不依赖 `field hit`

### 2. 显式字段

- `field hit` 直接进入对应字段编辑
- 适用于 `frame.title` 这类 shell 字段

所以这里不是“优先级覆盖”关系，而是两条独立入口：

```ts
implicit enter for content nodes
explicit field click for field nodes
```

并且这里的 `explicit field click` 指的是：

- `pick.part === 'field'`

不是：

- `closest('[data-node-editable-field]')`

---

## chrome / overlay 约束

进入编辑协议不能被 overlay 命中细节破坏。

长期应保证：

- selection frame
- transform handles
- node overlay

这些层不会阻断“已选中 node 的 repeat tap -> enter”这条主链。

协议上应以“逻辑 target”优先，而不是以“最表层 DOM 命中”优先。

也就是说：

- 正式 `field pick` 只触发显式字段编辑
- 不能反过来否决内容节点的 `enter`

长期不应继续让 DOM attribute 决定字段命中。

---

## 默认节点建议

长期建议默认节点定义明确如下：

- `text`: `enter: true`
- `sticky`: `enter: true`
- `shape`: `enter: true`
- `frame`: `enter: false`
- `group`: `enter: false`
- `draw`: `enter: false`
- `mindmap`: 视具体交互单独定义，但不能隐式继承

补充说明：

- `frame.title` 仍然可编辑
- 但它只通过显式字段点击进入，不通过 shell repeat tap 进入

这样最清楚，也最符合你希望对齐的 Miro 语义。

---

## 实施方案

## 第一阶段: 固化协议

目标：

- 明确“进入编辑”和“命中 field”不是同一件事

动作：

- 在根目录固定这份文档
- 明确 group child 是三阶段，普通 node 是两阶段
- 明确 `field` 只负责字段选择，不负责 enter 准入

退出条件：

- 团队对最终交互语义达成一致

---

## 第二阶段: 收敛 definition 能力

目标：

- 让 `enter` 成为 node definition 的正式能力

动作：

- 给默认节点补齐 `enter`
- 明确 shell 字段只走 `field click`
- 不再把是否能编辑藏在 DOM 命中里

退出条件：

- 所有默认节点的 enter 行为可从 definition 直接读出

---

## 第三阶段: 重写 selection tap 判定

目标：

- 让 repeat tap 只依赖逻辑焦点，不依赖 field hit

动作：

- selection press 判定里先确认 logical target
- 如果 logical target 已单选且 `enter === true`，直接进入 edit
- `field hit` 改成独立的显式字段入口

退出条件：

- 普通 node 两下进编辑
- group child 三下进编辑
- frame shell 不会因重复点击进入 title 编辑

---

## 第四阶段: 清理 DOM 依赖

目标：

- 删除 `data-node-editable-field`
- 把字段编辑入口升级成正式 `field pick`

动作：

- 在 pick 协议里新增 `part: 'field'`
- text / shape / frame title 等字段直接注册 field pick
- `resolvePoint` 不再通过 `closest('[data-node-editable-field]')` 读字段
- pointer input 不再保留从 DOM attribute 解析出的 `field`
- overlay 不再阻断 repeat tap enter 主链

退出条件：

- whiteboard 交互协议里不再出现 `data-node-editable-field`
- 字段编辑完全通过正式 pick 协议驱动

### 一步到位要求

这一阶段不做兼容桥接。

明确要求：

- 不保留 `data-node-editable-field` 和 `pick.part === 'field'` 双轨
- 不保留 attribute -> field pick 的临时映射层
- 不保留旧 `PointerInput.field` 的 DOM 解析路径

也就是：

- 一次性切到正式 `field pick`
- 一次性删掉 DOM attribute 协议

---

## 不应做的事

### 1. 不要把编辑模式继续绑在文本小区域命中上

这会持续制造“明明选中了 node 但还是进不去编辑”的感受。

### 1.5 不要把 `data-node-editable-field` 升格成长期协议

它可以作为历史过渡实现存在，但不应该保留到最终模型里。

长期正式协议必须是 pick 层的 `part: 'field'`。

### 2. 不要改成依赖浏览器原生 `dblclick`

whiteboard 里已有完整 press / move / hold 状态机。  
继续依赖原生 `dblclick` 会让 selection / drag / touch / pen 的一致性变差。

### 3. 不要让 group child 绕过结构阶段

group 内 child 直接两下进编辑会跳过 group 结构导航，长期会让层级交互不稳定。

---

## 最终结论

长期最优模型应明确为：

- 普通 node：点两下进入编辑
- group 内 node：点三下进入编辑
- 内容节点的“进入编辑”由逻辑 repeat tap + definition `enter` 决定
- 显式字段例如 `frame.title` 只通过字段点击进入编辑
- 显式字段点击由正式 `field pick` 驱动，不再依赖 `data-node-editable-field`

最终协议应是：

```ts
repeat tap on selected logical node
  + node.enter === true
  -> edit(node)
```

而不是：

```ts
repeat tap on selected shell node
  -> maybe edit title
```

只有这样，whiteboard 的编辑入口才会足够稳定、可预测、长期低噪音。
