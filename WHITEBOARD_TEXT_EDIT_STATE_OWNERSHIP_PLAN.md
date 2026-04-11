# Whiteboard Text Edit State Ownership Plan

## 背景

当前 whiteboard 的文本编辑在交互上已经接近目标形态:

- 每个 node 自己就是编辑器
- 不再使用全局覆盖层输入框
- toolbar 在编辑态也继续显示
- 样式改动默认 direct commit 到文档

但这套实现里，文本内容在编辑态仍然同时存在于多个层次:

1. `contenteditable` DOM 当前内容
2. `edit session.draft.text`
3. 文档里的 committed `node.data.text`
4. runtime read overlay 后的 `read.node.item`

这导致当前实现虽然多数时候可用，但状态归属并不稳定。只要发生一次会触发 rerender 的外部动作，比如点击 toolbar 修改 `bold`，就有机会把尚未 commit 的输入内容用旧值覆盖回去。


## 已确认的问题链路

### 1. 编辑态文本存在多个真源

当前 `EditableSlot` 在编辑过程中会把 DOM 与 `value` 做同步:

- `EditableSlot` 通过 `onInput` 把 DOM 内容写入 `editor.actions.edit.input(...)`
- 同时 `useLayoutEffect` 又会执行 `syncEditableDraft(element, value)`

这本身并没有问题，前提是 `value` 必须稳定地来自当前编辑草稿。

但现在 `value` 的来源并不直接:

- `text.tsx` / `shape.tsx` / `frame.tsx` 传给 `EditableSlot` 的仍然是 `node.data[field]`
- 只是因为 `read.node.item` 当前会把 `edit.draft.text` overlay 进去，所以很多场景下看起来像是在读 draft

也就是说，组件层依赖了一个隐式约定:

- “只要 runtime read 正确 overlay，组件拿 `node.data.text` 也等价于拿 draft”

这不是长期稳态。


### 2. toolbar 样式改动与文本编辑属于两条并发链路

当前 toolbar 的 bold / italic / color / align 等操作是直接 patch 文档:

- 不经过 edit draft
- 不等待 edit commit
- 直接走 `editor.actions.node.patch(...)`

这符合我们已经确认的产品方向:

- 不做局部富文本
- toolbar 改动就是 commit

但这意味着编辑态下点击 toolbar 时，会同时发生两类事情:

1. 文档样式发生 committed update
2. React rerender
3. 可能还伴随 editable blur 与 commit

如果编辑器视图并没有严格只从 draft 读文本，rerender 时就可能把旧 committed text 再喂回 DOM。


### 3. 现在的稳定性建立在“隐式 overlay”上，不够长期最优

目前 runtime 已经有一层正确方向的能力:

- `read.node.item` 会把 `edit.draft.text` overlay 到 node item 上
- `read.edge.item` 也会把 `edit.draft.text` overlay 到 edge label 上

这说明方向是对的:

- 编辑态应该看到“文档基底 + 编辑 draft”的合成结果

但问题在于:

- 这层能力没有被提升为整个编辑系统的唯一显式契约
- 组件层、toolbar 层、blur/commit 时序仍然部分依赖 committed node

结果就是系统里有两种思维模型同时存在:

1. 编辑态内容由 `edit session` 驱动
2. 编辑态内容由 `node.data.text` 驱动，只是 runtime 恰好替换了它

这两种模型混用，最终就会出现文本回退、composition 被打断、blur 顺序竞争等问题。


## 长期最优原则

长期最优应该把编辑态模型明确收敛成下面这套规则。

### 1. 编辑态只有一个文本真源

编辑期间，文本内容的唯一真源是:

- `edit.draft.text`

不是:

- DOM 本身
- committed `node.data.text`
- 组件局部 `useState`

DOM 只是输入载体，不是状态真源。


### 2. 文档文本在编辑期间只作为 base，不参与回灌

编辑态下:

- committed `node.data.text` 只表示编辑开始前或最近一次 commit 后的基底值
- 视图渲染时必须优先使用 `draft.text`

任何 rerender 都不能把 committed text 重新写回 DOM，除非编辑 session 已结束。


### 3. 样式与文本分属两套归属

长期最优不是把样式也塞进 edit draft。

应该明确分工:

- `text / caret / composition / live measure / wrap width candidate` 归 `edit session`
- `fontWeight / fontStyle / color / textAlign / fill / stroke` 归 committed document

这样有两个好处:

- 继续保持 toolbar 改样式就是 commit，语义简单
- 不会重新引入 style draft 与双 toolbar 的复杂度


### 4. 编辑态渲染读“编辑投影”，不是直接读 node 原始字段

所有编辑 UI 都应该统一读取一个明确的编辑投影:

- node: `node.item` 或 `node.view` 中的 edit-projected text
- edge label: `edge.item` 中的 edit-projected label text

但组件层不能再假设“拿 `node.data.text` 就一定等价于 draft”。

应该显式表达:

- 当前展示文本 `displayText`
- 当前编辑文本 `draftText`
- 当前 committed 文本 `committedText`

在编辑态，`EditableSlot.value` 必须明确来自 `draftText`。


### 5. toolbar 在编辑态是 edit chrome，不是外部点击

长期最优语义上，toolbar 不应被视为“编辑器外部区域”。

点击 toolbar 的样式按钮应该被看作:

- 编辑过程中的合法 side action

而不是:

- 先 blur 结束编辑
- 再做样式提交

这不一定要求浏览器焦点永远不离开 contenteditable，但在 editor runtime 的语义上必须做到:

- toolbar action 不会丢失当前 draft
- toolbar action 不会把编辑 session 置回 committed text
- toolbar action 后 caret / composition 能恢复或保持合理状态


## 最优架构

## A. Runtime 层

runtime 需要把“编辑投影”正式化，而不是只在个别 read store 里零散覆盖。

建议收敛成:

- `read.node.item`
  - committed item + overlay patch + edit draft text
- `read.node.view`
  - 基于 projected item 计算出的最终视图
- `read.edge.item`
  - committed edge + overlay patch + edit draft label

要求:

- selection summary / toolbar context / node render / edge render 全都只读这套 projected read
- 不允许某些链路绕回 `engine.read.node.item`


## B. React 渲染层

每个可编辑 node 都遵循同一模式:

1. 非编辑态:
   - 渲染 `displayText`
2. 编辑态:
   - 渲染 `EditableSlot`
   - `EditableSlot.value = draftText`
   - 样式仍从 node.style 读取

重点是:

- `EditableSlot` 不能再接收“看起来像 draft，实际是 node.data.text”的值
- 必须显式传入 draft


## C. Edit Session 层

`edit session` 长期最优应只承载与文本输入直接相关的临时状态:

- `draft.text`
- `caret`
- `composing`
- `liveSize`
- `wrapWidth`
- `status`
- `field`
- `target`

不应重新承载:

- `fontWeight`
- `fontStyle`
- `textAlign`
- `color`

这部分已经确认不需要 edit-aware draft。


## D. Toolbar 层

toolbar 的行为长期最优应是:

- 继续 direct commit 样式
- 但 action 前后都不破坏 `edit session`

可以接受:

- toolbar 导致 node style 更新
- 编辑区 rerender

不可以接受:

- rerender 把 DOM 内容重置成 committed text
- toolbar action 隐式清空或重建 edit session
- toolbar action 丢失 composition 状态


## 明确分工

下面这组分工是最终模型，不能模糊。

### 1. 哪些地方继续只看 `node.view`

这些地方必须继续只看 runtime projected view，不直接碰 `edit session`:

- scene 主渲染入口
- node 的展示态 renderer
- selection summary
- selection overlay
- node toolbar context
- 命中测试、几何、bounds、transform 相关读取

原因:

- 这些层表达的是“当前板面上这个 node 的最终可见状态”
- 它们不应该自己关心文本是来自 committed document 还是 draft overlay
- 统一只认 `node.view` / `edge.item` 才能避免多套视图模型并存


### 2. 哪些地方必须直接读 `edit session`

这些地方不能再只靠 `node.view.node.data[field]` 的隐式 overlay:

- `EditableSlot.value`
- caret 恢复
- composition 状态
- live measure
- 编辑态 placeholder 判断
- blur / submit / cancel 的输入生命周期

原因:

- 这些层表达的是“用户这一刻正在输入什么”
- 它们属于输入子系统，不属于文档投影子系统
- 这里必须显式只认 `edit session`


### 3. 哪些地方绝对不能再回读 committed text

编辑 session 活着时，下面这些行为都必须禁止:

- 用 committed `node.data.text` 重置 `contenteditable`
- toolbar rerender 后把旧 text 回灌到 DOM
- 在 blur 过程中先按 committed text 重绘，再去 commit draft
- 用 `engine.read.node.item` 重新构造编辑态 value

原则:

- committed text 只在 `startEdit` 时作为 base
- 一旦进入编辑态，本轮输入期间 committed text 不再拥有 UI 主导权


## 必须删除的旧思维

长期最优下，下面这些思路都应该彻底删除:

### 1. “编辑态 value 可以直接传 node.data.text”

这是当前问题的根源之一。它只有在 overlay 恰好命中时才成立，不是稳定契约。


### 2. “点击 toolbar 导致 blur 也没关系，反正会 commit”

这在文本输入场景下不稳，因为:

- commit 可能和 style patch 竞争
- composition 可能尚未结束
- blur 可能先于 draft flush


### 3. “只要 runtime 某处 overlay 了 draft，别的地方就可以随便读 committed node”

长期最优必须禁止这类隐式依赖。


## 最终实现方案

这里给出一步到位的最终实现方案，不保留兼容，不在乎改造成本。

### 一. 明确唯一数据流

最终数据流固定为:

1. `startEdit`
   - 从 projected item 读取初始文本
   - 初始化 `edit session`
2. 输入期间
   - DOM `onInput` / `onComposition*` 只写 `edit session`
3. 编辑态渲染
   - 可见 node 样式来自 `node.view`
   - 编辑框文本来自 `edit session.draft.text`
4. toolbar 样式改动
   - 直接 patch committed document
   - 不触碰 `edit session.draft.text`
5. `commitEdit`
   - 把 `edit session.draft.text` 写回文档
   - 清理 session

这条链路里不允许出现“重新从 committed node 拿 text 回灌 DOM”的旁路。


### 二. Runtime 最终结构

runtime 层保留两套能力，但职责完全分离:

- `read.node.view`
  - 板面最终可见 node
  - 包含 overlay / preview / edit projection
- `runtime.state.edit`
  - 输入过程中的临时状态

最终要求:

- 所有展示类 UI 读 `read.node.view`
- 所有输入类 UI 读 `runtime.state.edit`
- 不允许组件既把 `node.view.node.data.text` 当显示值，又把它当编辑态真源


### 三. React 最终结构

React 层最终收敛成两个概念:

- `displayText`
  - 来自 `node.view`
- `draftText`
  - 来自 `edit session`

编辑组件规则:

1. 非编辑态:
   - 渲染 `displayText`
2. 编辑态:
   - 渲染 `EditableSlot`
   - `EditableSlot.value = draftText`
   - `EditableSlot` 不再从 `node.data.text` 兜底

也就是说:

- `node.view` 负责板面内容
- `edit session` 负责输入内容

这两个概念都必须显式存在，不能再通过“恰好 overlay 成功”来偷渡。


### 四. Toolbar 最终语义

toolbar 的最终语义必须是:

- 属于 editing chrome
- 允许在 active edit session 内操作
- 样式改动 direct commit
- 文本 draft 不受影响

是否保焦点不是核心目标，核心目标是语义稳定:

- 即便浏览器焦点暂时离开 editable
- editor runtime 也不能因此丢 draft
- 也不能因此回滚成 committed text

长期最优实现上，toolbar action 应优先做到:

- 不触发编辑 session 重建
- 不依赖 blur 顺序
- 不通过 DOM 当前文本反推出 committed update


### 五. Edge Label 与 Node 文本统一模型

最终不允许 node 和 edge label 维持两套文本编辑模型。

统一要求:

- node text
- frame title
- shape label
- sticky text
- edge label

都共享同一套原则:

- projected item 负责展示
- edit session 负责输入
- toolbar 样式 direct commit
- commit 时只把 `draft.text` 写回文档


## 必须删除的旧实现

下面这些旧实现思路必须删除，不保留兼容。

### 1. 编辑态 `value` 从 `node.data[field]` 传入

必须删除这种做法，即使它当前多数时候“看起来可用”。

原因:

- 它依赖 runtime overlay 的隐式结果
- 一旦 rerender 时机变化，就会重新喂入旧 committed text


### 2. 组件自行判断 “当前 text 是 display 还是 draft”

必须删除组件内部这种模糊逻辑:

- 展示态和编辑态共用同一个 `text` 变量
- 然后默认认为 editing 时它自然就是 draft

最终必须拆成显式命名:

- `displayText`
- `draftText`


### 3. 任何 committed text -> DOM 的回灌 effect

必须删掉所有在 active edit session 期间仍可能把 committed text 写回 editable DOM 的路径。

允许存在的唯一同步方向是:

- `edit session draft -> EditableSlot.value -> DOM`


### 4. toolbar 依赖 blur commit 的正确时序

必须删除这种假设:

- “点击 toolbar 会 blur，但反正 blur 会先 commit，所以没问题”

长期最优不能把正确性建立在浏览器事件顺序上。


## API 设计

最终 API 不做兼容，命名保持简短清晰。

### Runtime Read

- `editor.select.node.view()`
  - 板面最终 node 视图
- `editor.select.edge.item()`
  - 板面最终 edge 视图
- `editor.select.edit()`
  - 当前 edit session


### Edit Session

保留:

- `editor.actions.edit.input(text)`
- `editor.actions.edit.caret(caret)`
- `editor.actions.edit.measure(patch)`
- `editor.actions.edit.commit()`
- `editor.actions.edit.cancel()`

不新增:

- `editor.actions.edit.style(...)`
- `editor.actions.edit.format(...)`

因为样式不属于 edit draft。


### React 组件 Props

最终编辑组件只接受显式输入，不接受模糊文本来源:

- `displayText`
- `draftText`
- `editing`
- `caret`
- `style`
- `measure`

如果组件处于编辑态，却没有 `draftText`，视为实现错误，不再做 committed text 兜底。


## 一步到位实施顺序

这里给出最终的一步到位顺序，不做阶段兼容。

### 第一步

把所有可编辑 renderer 改成显式区分:

- `displayText`
- `draftText`

并保证 `EditableSlot.value` 只吃 `draftText`。


### 第二步

把编辑态渲染辅助逻辑统一抽成一个共享读取器，例如:

- `resolveNodeEditText(view.node, edit, field)`
- `resolveEdgeLabelEditText(edge, edit, labelId)`

要求:

- 组件不再自行拼装 draft 来源
- 统一由共享函数决定编辑态文本


### 第三步

检查并清理所有 committed text 回灌 DOM 的 effect:

- `syncEditableDraft(...)` 仍然保留
- 但它的 `value` 只能来自 `draftText`


### 第四步

把 toolbar 编辑态语义固定下来:

- toolbar style action 不清 edit session
- toolbar style action 不依赖 blur commit
- toolbar style action 后 renderer 仍然继续吃当前 `draftText`


### 第五步

对 node / edge / frame / shape / sticky 全量统一验证:

- 输入后点 bold 不丢字
- 输入后点 italic 不丢字
- 输入后改字号不丢字
- composition 中点 toolbar 不丢 draft
- blur / submit / cancel 都只影响 draft -> document 的收尾，不影响样式 direct commit


## 分阶段实施方案

### 阶段 1. 明确编辑态文本来源

目标:

- 所有 `EditableSlot.value` 显式改为读取当前 `edit.draft.text`
- 不再依赖 `node.data[field]` 间接等于 draft

结果:

- rerender 时 DOM 同步源明确
- toolbar patch 不会把旧 committed text 回灌


### 阶段 2. 统一编辑投影入口

目标:

- 把 node / edge 的 edit projection 明确为 runtime read 的正式契约
- selection / toolbar / render 全部只读 projected read

结果:

- 不同模块不再各自猜测是否正处于 editing
- 同一 target 在任何 UI 上看到的文本都一致


### 阶段 3. toolbar 语义收敛为 edit chrome

目标:

- toolbar action 在编辑态不再依赖 blur 驱动 commit
- 允许 style patch 与 active edit session 并存

结果:

- 点击 bold / italic / color 时不会丢 draft
- 后续 composition 与 caret 恢复也更容易稳定


### 阶段 4. 清理隐式回灌逻辑

目标:

- 删除所有“从 committed text 回写 DOM”的隐式路径
- 只保留一条明确同步:
  - `edit.draft.text -> EditableSlot.value -> DOM`

结果:

- 文本编辑系统的 source-of-truth 彻底单一化


## 最终结论

这次“输入新文字后点击 bold，文本回到初始状态”的 bug，不只是局部事件顺序问题。

它说明当前系统在编辑态下仍然存在状态归属混乱:

- 文本 draft 归属还不够显式
- toolbar action 与 edit session 的并发语义还不够稳定
- React 渲染层仍然部分依赖 committed node 字段

长期最优不是加更多补丁，而是把模型明确收敛成:

- 文本输入只归 `edit session draft`
- 样式只归 committed document
- 编辑态渲染统一读 edit-projected runtime read
- toolbar 在编辑态被视为 edit chrome，而不是外部点击

只有这样，text / shape / sticky / frame / edge label 才能共享一套稳定模型，不会在别的交互上继续反复出现“旧值回灌”的问题。
