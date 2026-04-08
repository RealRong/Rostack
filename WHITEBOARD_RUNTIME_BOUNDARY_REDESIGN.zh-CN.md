# Whiteboard Runtime Boundary Redesign

## 结论

`whiteboard/packages/whiteboard-react/src/runtime/commands.ts` 和
`whiteboard/packages/whiteboard-react/src/runtime/selection.ts`
都存在边界偏移。

但两者性质不一样：

- `runtime/commands.ts` 是明显越界
- `runtime/selection.ts` 是轻度越界

原因不是“实现错了”，而是它们处在错误的层。

当前这两个文件做的事情，本质上分别是：

1. 应用级命令编排
2. selection 语义推导

它们都不是 `whiteboard-react/runtime` 这一层最应该承载的职责。

长期最优目标不是简单挪文件，而是把三层边界彻底明确：

- `engine` 负责纯文档语义与只读投影
- `editor` 负责会话态、交互态和应用级命令编排
- `react` 负责 UI 组合、菜单、快捷键、事件接线，不负责业务规则归档

---

## 当前问题

### 1. `whiteboard-react/runtime/commands.ts` 的问题

这个文件现在承担的是“高层动作编排”，而不是 runtime 基础设施。

它做了这些事情：

- 将 `canvas/group/node/selection` 多个命令串起来
- 为操作附加 selection 后处理
- 为 UI 场景提供一次性动作入口

典型函数：

- `duplicateSelectionAndSelect`
- `deleteSelectionAndClear`
- `orderSelection`
- `mergeGroupSelectionAndSelect`
- `ungroupSelectionAndSelect`
- `createFrameAndSelect`

这些函数的共同特征是：

- 需要 `editor.commands.*`
- 同时又需要 `editor.read.*`
- 还会写入 `editor.commands.selection.*`
- 语义上是“执行某个动作，并顺带刷新当前 UI 选择态”

这已经不是 runtime plumbing，而是 editor application service。

### 2. `whiteboard-react/runtime/selection.ts` 的问题

这个文件比 `commands.ts` 干净得多，它是纯函数，没有副作用。

但它在做的是 selection 语义判断，而不是 react runtime 基础设施。

当前提供的核心能力：

- `readSelectionWholeGroupIds`
- `readSelectionExactGroupIds`

它们回答的是：

- 当前 target 是否完整覆盖某些 group
- 当前 target 是否“精确等于”某些 group 的成员集合

这属于“selection 语义模型”，不是 react runtime bootstrapping，也不是 DOM bridge。

所以它虽然不脏，但归属仍然不对。

---

## 长期最优分层

## 一、Engine 层

### Engine 应该负责什么

`engine` 应只负责与 UI 无关、可复用、可预测的文档语义：

- 文档读模型
- 几何索引
- group/frame/mindmap 的只读投影
- 原子写命令
- 命令翻译与 normalize

判断标准：

- 不依赖 session selection/tool/edit
- 不依赖 React
- 不依赖 UI 菜单/快捷键上下文
- 输入明确，输出明确

### 适合下沉到 Engine 的内容

`runtime/selection.ts` 里的 group-selection 语义，长期最适合下沉到 engine read。

原因：

- 它依赖的是文档和 group membership
- 不依赖 React，也不依赖 editor session
- 它是稳定的领域语义，不是 UI 小工具

建议落点：

- `whiteboard-engine/src/read/store/index.ts`
- `whiteboard-engine/src/types/instance.ts`

推荐 API 形态：

- `read.group.wholeIds(target)`
- `read.group.exactIds(target)`

其中 `target` 应直接使用 core/editor 已有的 selection target 结构，而不是 react 自定义的 `SelectionTargetLike`。

### 不建议放到 Engine 的内容

下面这些不该进 engine：

- `duplicateSelectionAndSelect`
- `deleteSelectionAndClear`
- `mergeGroupSelectionAndSelect`
- `ungroupSelectionAndSelect`
- `createFrameAndSelect`
- `orderSelection`

原因很简单：

- 它们都包含“执行后如何修改当前 selection”这类 session/UI 后处理
- `selection` 在 engine 里不是 session 状态，而是外部传入或 editor 托管
- engine 不应该知道“操作后要不要自动选中结果”

换句话说：

- “怎么改文档”是 engine
- “改完以后 UI 选中什么”不是 engine

---

## 二、Editor 层

### Editor 应该负责什么

`editor` 是真正的应用运行时。

它一手拿着：

- `engine`
- session state
- overlay state
- viewport state
- selection/tool/edit/write/read

所以 editor 的天然职责就是：

- 将 engine 原子命令编组成“用户可直接触发的应用动作”
- 负责动作之后的 session 收口
- 暴露给上层 UI 一个稳定、语义化、非 React 特定的 API

### 最应该放到 Editor 的内容

`whiteboard-react/runtime/commands.ts` 里的大部分逻辑，长期都应该进入 editor 层。

更准确地说，它们不该继续存在于 react 包中，而应成为 `@whiteboard/editor` 提供的高层命令。

建议归位如下：

#### 1. Nodes / Selection 应用动作

适合进 editor：

- `duplicateSelectionAndSelect`
- `deleteSelectionAndClear`
- `orderSelection`

推荐落点：

- `whiteboard-editor/src/runtime/commands/nodes.ts`
- 或 `whiteboard-editor/src/runtime/editor/commands.ts` 组合层

推荐 API：

- `editor.commands.nodes.duplicate(target, options?)`
- `editor.commands.nodes.delete(target, options?)`
- `editor.commands.nodes.order(target, mode)`

如果你们想进一步语义化，也可以直接是：

- `editor.commands.selection.duplicateCurrent()`
- `editor.commands.selection.deleteCurrent()`
- `editor.commands.selection.orderCurrent(mode)`

但长期我更偏向“显式 target 入参”的版本，因为：

- 更可测试
- 更不依赖当前 session
- 可复用于上下文菜单、快捷键、外部 host

同时我不建议保留 `Target` 后缀。

长期更好的命名规则是：

- 动词放在命令名里
- 操作对象放在参数里

也就是：

- `duplicate(target)`
- `delete(target)`
- `order(target, mode)`

而不是：

- `duplicateTarget(target)`
- `deleteTarget(target)`
- `orderTarget(target, mode)`

原因是 `target` 只是输入形态，不是业务语义本身。把它写进命令名里，会把 API 绑死在当前参数模型上。

#### 2. Group 应用动作

适合进 editor：

- `mergeGroupSelectionAndSelect`
- `ungroupSelectionAndSelect`

推荐落点：

- `whiteboard-editor/src/runtime/commands/group.ts`

推荐 API：

- `editor.commands.group.merge(target, options?)`
- `editor.commands.group.ungroup(target, options?)`

其中 `options` 里可以包含：

- `selectResult?: boolean`
- `fallbackSelection?: 'members' | 'none'`

这样“是否自动改 selection”由 editor command 自己定义，而不是 react UI 额外补一层。

这里我也不建议长期保留 `Ids` 后缀。

`ungroupIds(groupIds)` 这种形态暴露了过低层的输入模型，等于要求上层先理解并解析“哪些 group 才能被 ungroup”。

长期更好的主入口是：

- `ungroup(target, options?)`

由 editor 内部自己调用 `read.group.exactIds(target)` 做语义收口。

#### 3. Frame 创建型应用动作

适合进 editor：

- `createFrameAndSelect`

原因：

- 这是一个纯应用动作，不是 react-only 行为
- 它依赖 node create 和 selection replace 的组合
- 任何 host 都可能想要“围绕一个 bounds 创建 frame 并选中它”

推荐落点：

- `whiteboard-editor/src/runtime/commands/node/frame.ts`
- 或 `whiteboard-editor/src/runtime/commands/frame.ts`

推荐 API：

- `editor.commands.node.frame.createAt(rect, options?)`
- `editor.commands.frame.createFromBounds(bounds, options?)`

如果以后还会有：

- `frameFromSelection`
- `frameFromTarget`

那就更应该单独成一个 `frame` command 域，而不是挂在 `canvas` 下。

### Editor 最佳设计原则

Editor 层的高层命令应遵循这几个原则：

#### 1. 输入是显式 target，不偷读 UI

不要把“当前选区”藏在命令内部默认读取，至少底层 API 不要这样设计。

好的形态：

- `duplicate(target)`
- `merge(target)`
- `ungroup(target)`
- `order(target, mode)`

而不是：

- `duplicateSelectionAndSelect(editor)`

后者太依赖“此刻 UI 恰好选了什么”，不利于复用和测试。

#### 2. session 后处理属于 editor，不属于 engine

像这些逻辑：

- duplicate 后选 roots
- group merge 后改成 group selection
- ungroup 后改回成员 selection
- create frame 后选中新 frame

应该属于 editor command 的合同，而不是散在 react feature 中。

#### 3. 读语义和写语义都在 editor 统一暴露

如果 `exactGroupIds / wholeGroupIds` 下沉到了 engine read，那么 editor 只负责把它们原样暴露或轻度封装：

- `editor.read.group.wholeIds(target)`
- `editor.read.group.exactIds(target)`

不要再让 react 包自己定义一套平行语义。

---

## 三、React 层

### React 层应该负责什么

`whiteboard-react` 应只承担：

- hooks
- components
- menu / toolbar / shortcut 组合
- DOM / pointer / clipboard host bridge
- runtime lifecycle 绑定

它不应该沉淀领域规则。

### React 层不该长期保存的内容

不应长期保留在 react 的内容：

- selection exact/whole group 推导
- duplicate/delete/order/group/frame-create 业务动作编排

React 层应该只做：

- 读取 editor state/read
- 调用 editor.commands.*
- 渲染 UI

也就是说，像 [SelectionActionMenu.tsx](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/features/selection/chrome/panels/SelectionActionMenu.tsx) 和 [shortcut.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/canvas/shortcut.ts) 这种文件，长期最好直接调用 editor 层暴露好的动作，不再引用 `#react/runtime/commands`。

---

## 最终推荐归属

### A. 应下沉到 Engine

当前 react 文件中的这部分逻辑，长期最适合进 engine read：

- `readSelectionWholeGroupIds`
- `readSelectionExactGroupIds`

推荐 API：

- `engine.read.group.wholeIds(target)`
- `engine.read.group.exactIds(target)`

### B. 应下沉到 Editor

当前 react 文件中的这部分逻辑，长期最适合进 editor commands：

- `duplicateSelectionAndSelect`
- `deleteSelectionAndClear`
- `orderSelection`
- `mergeGroupSelectionAndSelect`
- `ungroupSelectionAndSelect`
- `createFrameAndSelect`

推荐以 editor 高层命令暴露：

- `editor.commands.nodes.duplicate(target, options?)`
- `editor.commands.nodes.delete(target, options?)`
- `editor.commands.nodes.order(target, mode)`
- `editor.commands.group.merge(target, options?)`
- `editor.commands.group.ungroup(target, options?)`
- `editor.commands.frame.createFromBounds(bounds, options?)`

### C. 应留在 React

React 层只保留：

- 菜单点击后决定调用哪个 editor command
- 快捷键映射到哪个 editor command
- hooks 里读取 selection capability 并渲染

也就是说，React 只保留调用，不保留规则和编排。

---

## 推荐的最终 API 结构

下面是长期最优的结构，不代表要一次性全改完，但方向应稳定。

### Engine

- `engine.read.group.wholeIds(target)`
- `engine.read.group.exactIds(target)`

如果确实需要单 group 成员查询，再额外提供：

- `engine.read.group.memberIds(groupId)`

但不建议提供：

- `engine.read.group.selection(groupId)`
- `engine.read.group.isSelected(groupId, target)`

因为这两个名字都带 UI 语义歧义，不适合作为 engine 的长期公开接口。

### Editor

- `editor.commands.nodes.duplicate(target, options?)`
- `editor.commands.nodes.delete(target, options?)`
- `editor.commands.nodes.order(target, mode)`
- `editor.commands.group.merge(target, options?)`
- `editor.commands.group.ungroup(target, options?)`
- `editor.commands.frame.createFromBounds(bounds, options?)`

### React

- `useSelectionCapability()`
- `SelectionActionMenu`
- `shortcut.ts`

这些只负责把 UI intent 映射到 editor API。

---

## 迁移顺序建议

### 第一阶段

先动 `editor`，不动 `engine` 语义。

做法：

- 把 `whiteboard-react/runtime/commands.ts` 的高层动作迁到 `whiteboard-editor`
- react UI 改为调用 editor commands
- `whiteboard-react/runtime/commands.ts` 删除

这是收益最大、风险最小的一步。

### 第二阶段

再把 selection group 推导下沉到 engine read。

做法：

- 在 engine `group` read 上增加 `wholeIds/exactIds`
- editor / react 改为读取 engine/editor 暴露的新 read API
- `whiteboard-react/runtime/selection.ts` 删除

### 第三阶段

最后收口 editor API 命名。

目标：

- 不再出现 `AndSelect` 这类散落 helper 名字
- 用统一的 command contract 表达“是否改 selection”的策略

例如：

- `merge(..., { selectResult: true })`
- `ungroup(..., { fallbackSelection: 'members' })`
- `duplicate(..., { selectInserted: true })`

这样 editor command 会更统一，也更适合继续扩展。

---

## 最终判断

如果只给一句结论：

- `whiteboard-react/runtime/commands.ts` 应整体迁到 `editor`
- `whiteboard-react/runtime/selection.ts` 应最终迁到 `engine read`
- `whiteboard-react` 自己不应长期承载这两类逻辑

这是当前代码基于长期最优分层最合理的落点。
