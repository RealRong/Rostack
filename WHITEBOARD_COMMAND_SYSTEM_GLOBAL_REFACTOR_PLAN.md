# WHITEBOARD_COMMAND_SYSTEM_GLOBAL_REFACTOR_PLAN

## 目标

从全局视角重构 `whiteboard-editor` 的 commands 体系，重点回答:

- 写侧能力应该如何分层
- `commands` / `actions` / `runtime` / `context` 各自应该承担什么职责
- 是否应该引入“中轴”
- 应该引入多大的中轴
- 哪些旧的工厂和薄层应该删除

本方案不考虑兼容，不考虑迁移成本，只讨论长期最优结构。

## 当前问题

当前写侧的主要问题不是“功能不够”，而是“语义层次不稳定”。

具体表现为:

- 同样是写侧能力，命名混用了:
  - `createXRuntime`
  - `createXActions`
  - `createXCommands`
- 有的模块返回业务命令
- 有的模块返回状态操作
- 有的模块同时做装配和实现
- `createEditor.ts` 里仍然残留局部业务逻辑，导致它既像 facade，又像 command compiler
- `document/runtime.ts` 已经在变薄，但仍然承担过多命令映射和子域装配
- `node` 子域已经开始收口，但仍然存在:
  - 多个子工厂
  - 零散 host 参数
  - 底层 store 暴露给 helper

一句话总结:

- 当前问题不是“没有 commands”
- 而是“commands 没有形成清晰体系”

## 长期最优原则

### 1. 内部写侧统一用 `commands`

内部凡是“执行写入、产生副作用、改变文档或本地交互状态”的能力，统一命名为 `commands`。

不再在内部混用:

- `actions`
- `runtime`
- `mutations`

这几个词。

长期规则:

- `commands`: 写侧语义
- `read`: 读侧语义
- `state`: 本地状态容器
- `context`: 某个子域的语义化依赖中轴
- `facade`: 对外 API 装配层

### 2. `actions` 只保留给 editor 最外层公开 API

也就是用户最终看到的:

- `editor.actions.node.xxx`
- `editor.actions.edge.xxx`
- `editor.actions.selection.xxx`

内部不再继续使用 `createSelectionActions`、`createClipboardActions` 这类命名。

内部统一改成:

- `createSelectionCommands`
- `createClipboardCommands`
- `createEdgeLabelCommands`
- `createEditCommands`

### 3. 不使用全局 God Context

不应该传一个超级中轴，里面什么都有:

- `engine`
- `read`
- `write`
- `session`
- `preview`
- `runtime`

这种做法只会把参数碎片化问题，替换成更难控制的依赖污染问题。

### 4. 使用“子域级中轴”

长期最优不是“没有中轴”，也不是“一个全局中轴”，而是:

- 每个子域有自己的小 context
- 这个 context 只暴露语义化 reader / writer
- helper 不直接接触底层 store 结构

也就是:

- 有中轴
- 但中轴是小的
- 且中轴是语义化的

## 全局写侧分层

长期最优的写侧分层应该是:

### 第一层: `editor facade`

职责:

- 暴露最终公开 API
- 把多个内部 commands 组织成 `editor.actions.*`
- 不承载具体业务逻辑

这一层只做:

- 命名整理
- 参数转发
- 少量跨域编排

不做:

- patch 编译
- 文本 commit 逻辑
- edge label merge
- selection target 解析

### 第二层: domain commands

这是写侧的核心层。

建议长期收成这些主域:

- `appCommands`
- `toolCommands`
- `viewportCommands`
- `drawCommands`
- `sessionCommands`
- `editCommands`
- `documentCommands`
- `selectionCommands`
- `clipboardCommands`
- `nodeCommands`
- `edgeCommands`
- `edgeLabelCommands`
- `mindmapCommands`

每个 commands 都只表达一个子域的写语义。

### 第三层: domain context

每个复杂子域都有自己的 `context`，负责把外部系统依赖编译成稳定的语义接口。

例如:

- `nodeContext`
- `selectionContext`
- `edgeLabelContext`
- `mindmapContext`
- `editContext`

### 第四层: low-level primitives

这层只保留纯基础能力，例如:

- patch builder
- update merge
- geometry helper
- selection normalize

这层不应该承载业务语义。

## 命名统一方案

### 内部统一规则

- `createXCommands`: 创建写侧能力
- `createXContext`: 创建子域中轴
- `createXState`: 创建本地状态
- `createXRead`: 创建读侧
- `createEditor`: 创建公开 facade

### 不再推荐的内部命名

- `createXRuntime`
- `createXActions`
- `createXMutations`

这些命名的问题是:

- `runtime` 过宽
- `actions` 和公开 API 冲突
- `mutations` 容易把“机械 patch 映射”误当成稳定子域

### 例外

如果某层确实不是 command，而是本地状态容器或交互调度器，可以保留:

- `state`
- `controller`

但不要继续叫 `runtime`。

## commands 体系的最终全局结构

建议最终目录大致收成这样:

```text
whiteboard/packages/whiteboard-editor/src/
  editor/
    createEditor.ts
    facade.ts
    types.ts

  commands/
    app.ts
    tool.ts
    viewport.ts
    draw.ts
    session.ts
    edit.ts
    selection.ts
    clipboard.ts
    document.ts
    node.ts
    edge.ts
    edgeLabel.ts
    mindmap.ts

  context/
    node.ts
    selection.ts
    edgeLabel.ts
    mindmap.ts
    edit.ts

  read/
    ...

  state/
    ...

  patch/
    node.ts
    edge.ts
```

如果不想动太多目录，也可以保守一点保留 `runtime/` 目录，但内部原则仍然一样:

- `runtime/document/commands.ts`
- `runtime/node/commands.ts`
- `runtime/selection/commands.ts`
- `runtime/editor/facade.ts`

重点不在目录名字，而在职责是否稳定。

## 各子域的长期最优形态

### 1. `node`

#### 当前问题

- `createNodeMutations`
- `createNodeTextMutations`
- `createNodePatchWriter`

这三层同时存在，装配点分散。

并且 `text` 子域当前依赖传参很别扭，例如:

- `committedNode: engine.read.node.item`
- `appearance`
- `deleteCascade`

这些都暴露了底层结构或不必要的跨子域依赖。

#### 长期最优

对外:

- 只保留 `createNodeCommands`

对内:

- 保留 `patch.ts` 作为基础能力
- `text.ts` 退化为 node commands 的私有 helper
- 删除 `createNodeMutations`
- 删除 `createNodeTextMutations` 这个公开装配概念

#### `node context`

长期最优的 `node context` 应该只暴露语义接口，不暴露底层 store:

- `read.committed(id)`
- `read.live(id)`
- `write.update(id, update)`
- `write.updateMany(updates, options)`
- `write.deleteCascade(ids)`
- `preview.text.set(nodeId, patch)`
- `preview.text.clear(nodeId)`
- `preview.text.clearSize(nodeId)`
- `edit.clear()`
- `selection.clear()`

也就是说:

- 不直接传 `engine.read.node.item`
- 不直接传 `session`
- 不直接传 `preview`
- 不直接传 `appearance`

#### `node commands` 的最终职责

- `create`
- `patch`
- `move`
- `align`
- `distribute`
- `delete`
- `deleteCascade`
- `duplicate`
- `lock.set`
- `lock.toggle`
- `shape.set`
- `style.fill`
- `style.stroke`
- `style.opacity`
- `text.commit`
- `text.preview`
- `text.cancel`
- `text.color`
- `text.size`
- `text.weight`
- `text.italic`
- `text.align`

### 2. `edge`

#### 当前问题

- `edge` 文档命令
- `edgeLabel` 局部业务

已经开始分离，但还没有完全形成稳定结构。

#### 长期最优

- `edgeCommands` 负责 edge 本体:
  - `create`
  - `patch`
  - `move`
  - `reconnect`
  - `delete`
  - `route.*`
- `edgeLabelCommands` 负责 label 子域:
  - `add`
  - `patch`
  - `setText`
  - `remove`

#### `edge label context`

应只暴露:

- `read.edge(id)`
- `write.edgeUpdate(id, patch)`
- `edit.current()`
- `edit.clear()`
- `selection.replace(...)`

不要让 label helper 直接知道更大的 `document runtime`。

### 3. `selection`

#### 当前问题

selection 已经相对清楚，但它仍然被放在 `document` 邻近位置，容易被误认为是文档底层命令的一部分。

#### 长期最优

selection 应该被视为独立 commands 子域，而不是 document 附属 helper。

因为它做的是:

- duplicate
- delete
- order
- group
- ungroup
- frame

这些都不是纯文档底层命令，而是“selection 驱动的业务命令”。

#### 最终结构

- `selectionCommands`
- `selectionContext`

而不是 `document/selection.ts` 这种位置关系。

### 4. `clipboard`

clipboard 也应该成为独立 commands 子域。

原因:

- copy / cut / paste
- selection target 解析
- inserted roots selection 回填

这是一整块业务语义，不是 document helper。

#### 最终结构

- `clipboardCommands`
- `clipboardContext`

### 5. `mindmap`

#### 当前问题

mindmap 目前已经比之前清楚，但仍然混有:

- engine command 映射
- placement/drop/root 业务 helper

#### 长期最优

保留一个对外 `mindmapCommands`，内部再分:

- `createMindmapContext`
- `createMindmapCoreCommands`
- `insertByPlacement`
- `moveByDrop`
- `moveRoot`

也就是说:

- 对外还是一个 `mindmapCommands`
- 对内不要继续混“命令映射”和“业务策略”

### 6. `document`

#### 当前问题

`document/runtime.ts` 仍然像一个大装配表。

#### 长期最优

`documentCommands` 只保留 document 本体级写入:

- `replace`
- `insert`
- `delete`
- `duplicate`
- `order`
- `background.set`
- `history.*`
- `group.*`

但注意:

- `selection`
- `clipboard`
- `node`
- `edge`
- `mindmap`

这些不应该都继续算在 `document` 的内部实现里。

长期最优是:

- `documentCommands` 变窄
- `selectionCommands` / `clipboardCommands` / `nodeCommands` / `edgeCommands` / `mindmapCommands` 作为平级子域存在

### 7. `session`

#### 当前问题

`createSessionRuntime` 同时处理:

- tool
- selection
- edit start

它是写侧，但名字还叫 `runtime`。

#### 长期最优

改成:

- `createSessionCommands`

内部职责:

- `tool.set`
- `selection.replace/add/remove/toggle/selectAll/clear`
- `edit.startNode`
- `edit.startEdgeLabel`
- `edit.input`
- `edit.caret`
- `edit.measure`
- `edit.clear`

如果以后 edit 生命周期继续变复杂:

- `sessionCommands`
- `editCommands`

可以继续拆开。

### 8. `view`

#### 当前问题

`view` 现在其实也是写侧命令:

- viewport
- pointer
- space
- draw

但它还叫 `createViewRuntime`。

#### 长期最优

改成:

- `createViewCommands`

其中:

- `viewportCommands`
- `pointerCommands`
- `spaceCommands`
- `drawCommands`

可以是内部子集。

### 9. `editor`

#### 当前问题

`createEditor.ts` 目前仍然承担:

- facade 组装
- 局部编排
- 局部 command glue

虽然已经比之前干净，但仍然不够纯。

#### 长期最优

`createEditor.ts` 只做两件事:

1. 创建内部服务:
   - read
   - state
   - commands
2. 暴露最终 facade:
   - `editor.actions.*`
   - `editor.select.*`
   - `editor.events.*`

它不再做:

- patch compile
- edit commit/cancel 具体实现
- edge label text merge

这些都应该在各自 commands 中完成。

## 全局中轴方案

## 结论

应该使用 context 中轴，但必须是“子域级中轴”，不是“全局中轴”。

### 不推荐

- 一个全局 `editorContext`

问题:

- 依赖污染
- 很难看出模块真实依赖
- helper 越写越容易越界

### 推荐

- `nodeContext`
- `edgeLabelContext`
- `selectionContext`
- `clipboardContext`
- `mindmapContext`
- `editContext`

每个 context 只给本子域 helper 用。

### context 的设计规则

1. 只暴露语义 reader / writer
2. 不暴露底层 store 结构
3. 不暴露比当前子域更大的 runtime 对象
4. 命名直接表达语义，而不是结构

例如推荐:

- `read.committed(id)`
- `read.live(id)`
- `write.update(id, patch)`
- `edit.clear()`

不推荐:

- `engine.read.node.item`
- `document`
- `session`
- `preview`

## 命名空间设计

最终公开 API 继续保持短而清楚:

- `editor.actions.app.*`
- `editor.actions.tool.*`
- `editor.actions.viewport.*`
- `editor.actions.draw.*`
- `editor.actions.selection.*`
- `editor.actions.edit.*`
- `editor.actions.node.*`
- `editor.actions.edge.*`
- `editor.actions.mindmap.*`
- `editor.actions.clipboard.*`
- `editor.actions.history.*`

内部命令层则按同样命名空间分组:

- `appCommands`
- `toolCommands`
- `viewportCommands`
- `drawCommands`
- `selectionCommands`
- `editCommands`
- `nodeCommands`
- `edgeCommands`
- `edgeLabelCommands`
- `mindmapCommands`
- `clipboardCommands`

## 必须删除的旧实现

如果按长期最优落地，下面这些旧概念最终都应该消失:

- `createNodeMutations`
- `createNodeTextMutations`
- `createSelectionActions`
- `createClipboardActions`
- `createEdgeLabelActions`
- `createSessionRuntime`
- `createViewRuntime`
- `createDocumentRuntime`

这里的意思不是功能消失，而是“命名和职责形态”消失。

对应长期替换为:

- `createNodeCommands`
- `createSelectionCommands`
- `createClipboardCommands`
- `createEdgeLabelCommands`
- `createSessionCommands`
- `createViewCommands`
- `createDocumentCommands`

## 建议实施顺序

### 第一阶段: 命名和边界定型

目标:

- 先把“什么叫 commands”这件事统一

步骤:

1. 把内部 `Actions` / `Runtime` 写侧命名统一成 `Commands`
2. 明确 `editor facade` 只是对外 API
3. 明确 `context` 只服务子域 helper

### 第二阶段: node 子域收口

目标:

- 让 `node` 成为第一块完整按新模型重构的子域

步骤:

1. 引入 `nodeContext`
2. `createNodeMutations` 并入 `createNodeCommands`
3. `createNodeTextMutations` 退化为私有 text helper
4. 去掉 `committedNode: engine.read.node.item` 这类底层暴露

### 第三阶段: edge / selection / clipboard 收口

目标:

- 把当前还依赖 `document` 装配关系的几个业务子域改成平级 commands

步骤:

1. `edgeCommands`
2. `edgeLabelCommands`
3. `selectionCommands`
4. `clipboardCommands`

### 第四阶段: session / view 命名统一

目标:

- 消除剩余的 `Runtime` 命名歧义

步骤:

1. `createSessionRuntime` -> `createSessionCommands`
2. `createViewRuntime` -> `createViewCommands`
3. `createEditorRuntime` 收窄为内部 services assembler，或直接删掉

### 第五阶段: editor facade 最终瘦身

目标:

- `createEditor.ts` 只剩 facade 装配

步骤:

1. 把剩余局部 glue 全部下沉到 commands
2. `editor.actions.*` 直接绑定各 commands
3. 让 `createEditor.ts` 不再持有任何业务 helper

## 最终判断

长期最优的 commands 体系，不是把所有写逻辑塞进一个大文件，也不是继续保持“到处 createXRuntime / createXActions / createXCommands 并存”。

真正稳定的结构应该是:

- 对外只有一个 editor facade
- 内部写侧统一叫 `commands`
- 每个复杂子域都有自己的小 `context`
- `context` 只暴露语义 reader / writer
- patch / geometry / normalize 这类纯基础逻辑留在底层 primitive

一句话总结:

- 不要全局大中轴
- 要子域小中轴
- 不要内部混用 runtime/actions/commands
- 要把整个写侧统一成一套 commands 体系
