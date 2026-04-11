# Whiteboard 文本编辑降复杂度方案

## 目标

这份方案只回答一件事：

- 文本编辑是否过度建模
- 哪些能力应该继续放在 `editor runtime`
- 哪些能力应该交还给 DOM
- 当前实现里哪些链路应该删掉

结论很明确：

- 现在的文本编辑链路对 `text / sticky / shape / frame title / edge label` 来说已经偏复杂
- 不需要改 document schema
- 不需要把编辑状态下放到各 renderer 私有 state
- 需要把一部分“浏览器原生擅长”的能力交还给 DOM
- runtime 只保留会话、规则、提交、持久化、工具栏能力

一句话：

- 统一 `EditSession`
- 下放编辑态排版给 DOM
- runtime 不再尝试接管每一层文本布局细节

## 当前问题的本质

这几类问题都说明了同一个事实：

- `shape` 进入编辑态文本跳位置
- `sticky` 进入编辑态字号突变
- `text` 长大后删文字不回缩
- 输入法 composition 期间不换行或布局冻结

根因不是一个具体 hook 或一条 CSS，而是当前分工不合理：

- runtime 在管理编辑会话
- React renderer 在管理宿主切换
- `EditableSlot` 在管理输入生命周期
- 测量工具还在试图复刻浏览器的文本流结果

这样会带来两个问题：

1. 浏览器本来能稳定处理的事，我们又自己做了一遍
2. 编辑态真实 DOM 和 runtime 的布局推导开始相互竞争

结果就是：

- caret / IME / composition 依赖真实 editable DOM
- auto-size / sticky fit / centered label 又依赖我们自己的测量回写
- 两边只要有一点不同步，布局就会跳

所以这里真正要简化的，不是“去掉编辑状态机”，而是：

- 让 DOM 负责编辑时的真实文本排版
- 让 runtime 只负责编辑协议和业务规则

## 最终分工

## runtime 保留的能力

以下能力必须继续由 `editor runtime` 管：

- 当前谁在编辑
- 编辑的是 `node.text`、`node.title` 还是 `edge.label`
- `commit / cancel / clear`
- 空文本保留、替换默认值、删除 edge label 之类的业务规则
- 文本样式草稿与工具栏交互
- 最终写回 document
- 历史记录与 selection/tool 联动

这些能力统一通过：

- `editor.select.edit()`
- `editor.select.panel().textToolbar`
- `editor.actions.edit.*`

来暴露。

runtime 不应该再做的事：

- 试图精确模拟浏览器编辑中的每一步文本流布局
- 依赖“当前预览 rect”反向决定下一轮测量最小宽度
- 在 composition 期间不断用 runtime draft 回写 DOM

## DOM 接管的能力

以下能力应该明确交给 DOM：

- 真实 `contentEditable` 的输入行为
- caret 与 selection 的实际位置
- IME composition 生命周期
- 编辑态的即时换行
- 编辑态的文本流布局
- 编辑态宿主的真实内容尺寸

具体说法是：

- 用户正在编辑时，看到的文本就应该是浏览器真实正在编辑的那份 DOM
- 编辑态排版结果优先由 editable 自己决定
- 需要宽高时，优先读取 live DOM 的结果，而不是平行测量一份“猜出来的文本流”

这不是让 DOM 接管业务逻辑，而是让 DOM 回到它原本最擅长的位置：

- 输入
- 排版
- caret
- composition

## 设计原则

### 1. 统一会话，不统一布局实现

继续保留统一 `EditSession`，但不要求所有节点共享同一种布局策略。

统一的是：

- 编辑状态
- 生命周期
- 提交协议
- 样式草稿

不统一的是：

- `text` 的 auto-width
- `sticky` 的 fit-font
- `shape` 的有界 label box
- `frame title` 的单行规则
- `edge label` 的旋转容器

### 2. editable 必须是真实内容宿主，不是布局壳子

当前很多问题都来自把同一个元素同时当成：

- 定位壳子
- 对齐壳子
- editable 本体

长期应改成：

- 外层壳子负责定位、inset、旋转、对齐
- 内层真实 editable 只负责文本流

也就是说：

- `shape` label 不能把绝对定位 + flex 居中容器直接变成 `contentEditable`
- `edge label` 的旋转容器也不应该直接承担过多文本流职责

### 3. runtime 只接收“必要的测量结果”

runtime 不应维护一整套浏览器级文本布局模型，只接收它真正需要的数据：

- 当前 live size
- 当前 wrap width
- 当前是否 composing

并且这些数据应当来自真实 editable DOM，而不是来自另一套脱离现场的推导。

### 4. composition 期间以 DOM 为准

必须接受一个事实：

- document 真相在 runtime
- 但 composition 期间，输入态真相更接近 live editable DOM

因此规则应该是：

- `composing = true` 时，不从 runtime 反向强制覆盖 editable 文本
- 允许 DOM 在 composition 期间自然换行、扩展、收缩
- `compositionend` 后再把结果统一收口到 runtime / document

## 推荐架构

## 1. `EditableSlot` 收缩成裸输入桥

`EditableSlot` 不再承担布局策略，只负责：

- 挂载 `contentEditable`
- focus / blur
- `input`
- `compositionstart / compositionend`
- `escape / enter / submit`
- 把 live DOM 文本上送到 `editor.actions.edit.input`
- 把 live DOM 尺寸上送到 `editor.actions.edit.measure`

它不再负责：

- 猜节点应该如何排版
- 同时兼顾 display 和 edit 两种布局语义
- 把某个复杂容器本身直接变成 editor

`EditableSlot` 的定位应该接近：

- 一个输入桥
- 一个生命周期桥

而不是：

- 文本布局中心

## 2. 每种节点 renderer 自己提供 content box

每种可编辑类型都应该自己提供一个稳定的内容框：

- `text`: 文本本身所在的块
- `sticky`: 带 padding 的内容框
- `shape`: label inset 对应的内容框
- `frame title`: header 内的单行文本框
- `edge label`: 旋转容器内的文本框

统一规则：

- 内容框负责位置和边界
- editable 只放在内容框内部

这样进入编辑态时：

- 文本不会因为宿主语义切换而跳位
- sticky 的字体测量可以基于稳定 content box
- shape 的对齐逻辑不会因为 `contentEditable` 改变

## 3. 文本测量改成“读 live DOM”，不是“猜文本流”

建议把文本测量拆成两类：

### A. live DOM measure

用于编辑态：

- 从当前 editable 直接读取 `scrollWidth / scrollHeight / getBoundingClientRect()`
- 结果用于 runtime 的 live layout state

这类测量是首选。

### B. pure utility measure

用于非编辑态初始化、插入预估、fallback：

- 没有真实 DOM 时的近似估算
- 作为首次创建节点的默认值

这类测量只能是 fallback，不能再做编辑态主路径。

## 4. `EditSession` 增加最小 layout 状态

当前只保留 `draft.measure` 不够，因为它会被下一轮测量反向污染。

长期建议把编辑态 layout 明确出来，最少应有：

```ts
type EditLayout = {
  baseRect?: Rect
  liveSize?: Size
  wrapWidth?: number
  composing: boolean
}
```

其中：

- `baseRect` 表示开始编辑时的稳定基线
- `liveSize` 表示当前 editable 的真实尺寸
- `wrapWidth` 表示当前内容框允许换行的宽度
- `composing` 表示当前是否处于输入法预编辑阶段

关键原则：

- 下一轮测量不能再拿上一轮 preview rect 当作新的最小宽度基线
- `text` 删除内容后是否缩回，应该基于 `baseRect` 和 live DOM 重新计算

## 5. 各类型的长期策略

### `text`

`text` 是最需要 runtime 与 DOM 分工清晰的类型。

长期策略：

- 编辑态换行和宽高变化由 live editable DOM 决定
- runtime 只维护 `baseRect + liveSize + widthMode`
- commit 时再落成最终 node size

如果继续保留 `auto | fixed` 两态：

- `auto` 下允许 grow 和 shrink
- shrink 不能再被当前 preview width 锁死

如果后续想进一步简化，甚至可以考虑把 `text` 宽度策略改成更直白的：

- `auto`
- `wrap`

而不是现在这种依赖历史 rect 的 `auto | fixed`。

### `sticky`

`sticky` 的自动字号是业务规则，不应完全下放给 DOM。

但它的测量输入必须来自真实内容框，而不是依赖当前 source DOM 的父节点结构。

长期策略：

- `sticky` renderer 提供稳定 content box
- fit-font 基于这个 content box 和 live text 计算
- 编辑态字号尽量保持稳定，不因为 display/edit host 切换而重新取错参照框

### `shape`

`shape` 不需要复杂 runtime 测量，但必须修正结构。

长期策略：

- 绝对定位 + inset + flex 对齐的是 shell
- 真正 editable 是 shell 内部的 text flow child
- 这样进入编辑态不会改变文本位置

### `frame title`

`frame title` 是单行输入，不需要复杂测量。

长期策略：

- DOM 负责单行输入和 caret
- runtime 只负责默认值策略

### `edge label`

`edge label` 不需要水平编辑态降级。

长期策略：

- 保持旋转容器
- 内部文本框负责真实编辑
- runtime 只管 label session 与 commit/remove 规则

## 需要删除的旧实现

以下实现应该逐步删除，不再作为长期主路径：

### 1. “用复杂壳子本身做 editable” 的模式

应删除这类思路：

- 把 `shape` 的 label 壳子直接切成 editable
- 把承担定位和居中的复杂容器直接当 editor host

### 2. 编辑态主路径依赖纯测量工具猜浏览器换行

应删除这类主路径依赖：

- 用脱离现场的文本测量结果替代 live editable 实际布局
- 用 preview rect 再喂回下一轮测量，形成自锁

纯测量工具只能保留为：

- 初始估算
- fallback

### 3. composition 期间 runtime 强同步 DOM

应删除这类行为：

- 输入法预编辑期间反向覆盖 editable 内容
- 让 runtime draft 在 composition 中持续主导布局

### 4. sticky fit 依赖 source DOM 邻近层级推断内容框

应删除这类结构耦合：

- 通过 `source.parentElement` 猜 frame
- 让 renderer DOM 结构变化影响字号测量语义

内容框必须显式、稳定。

## 新 API 方向

API 不需要大改，只需要更明确职责。

继续保留：

```ts
editor.actions.edit.startNode(nodeId, field, options?)
editor.actions.edit.startEdgeLabel(edgeId, labelId, options?)
editor.actions.edit.input(text)
editor.actions.edit.caret(caret)
editor.actions.edit.style(patch)
editor.actions.edit.measure(layout)
editor.actions.edit.commit()
editor.actions.edit.cancel()
editor.actions.edit.clear()
```

推荐把 `measure(size)` 提升成更稳定的 layout 写入口：

```ts
type EditLayoutPatch = {
  liveSize?: Size
  wrapWidth?: number
  composing?: boolean
}

editor.actions.edit.measure(patch)
```

这样 runtime 接收的是：

- 编辑态现场信息

而不是：

- 假装已经得到最终 node size

`editor.select.panel().textToolbar` 继续保留 runtime 汇总，不下放给 React renderer 猜。

## 对复杂度的最终判断

如果目标是长期最优且尽量简单，那么最合适的边界不是：

- 全部交给 runtime

也不是：

- 全部交给 DOM

而是：

- DOM 负责输入、caret、composition、编辑态排版、现场尺寸
- runtime 负责会话、规则、样式草稿、提交、持久化

这条边界的直接收益是：

- `shape` 不再因为宿主语义切换而跳位
- `sticky` 的字号不会因为编辑态结构变化而突变
- `text` 的 grow / shrink 逻辑可以建立在稳定基线上
- IME 期间的换行、caret、候选框都更容易正确

## 实施顺序

建议按这个顺序落地：

1. 先把各 renderer 改成“shell + inner editable”的结构，不再把复杂壳子本身当 editable。
2. 把 `EditableSlot` 收缩成输入桥，只保留输入生命周期和 live measure 上送。
3. 给 `EditSession` 增加最小 layout 状态，尤其是 `baseRect` 与 `composing`。
4. 把 `text` 的 auto-size 改成基于 live DOM + stable base rect 的逻辑，去掉宽度自锁。
5. 把 `sticky` fit-font 的内容框改成显式 content box，去掉 DOM 邻接层级推断。
6. 清理旧的纯测量主路径，只保留 fallback。

## 最终判断

当前文本编辑系统确实有一部分能力放错层了。

最优解不是继续加更多同步、更多测量、更多补丁，而是主动降复杂度：

- 让 DOM 处理它擅长的编辑现场
- 让 runtime 只处理它必须负责的编辑协议

这样才能把文本编辑从“持续修边角”拉回到一个稳定、可维护的结构上。
