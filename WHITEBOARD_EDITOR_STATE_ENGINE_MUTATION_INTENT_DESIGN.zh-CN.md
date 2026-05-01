# Whiteboard Editor State Engine 剩余实施说明

## 1. 范围

这份文档只保留还没完成的部分。

已经完成的内容不再在这里展开，包括：

- `EditorStateEngine` 基础建立
- `tool / draw / selection / edit / interaction / preview / viewport` 进入 editor state engine
- `session/runtime.ts` 基本退化为适配层
- `binding.ts` 初步压薄
- scene bridge 开始消费 `editor delta`

后续实现只关注剩余重构工作，不再回头维护“阶段性兼容方案”。

---

## 2. 重构约束

这轮重构明确采用一次性收敛策略，约束如下：

- 不需要兼容旧接口
- 不需要保留过渡层
- 不需要分阶段双写
- 不需要为了中途可运行而维持旧路径
- 不需要为了局部 typecheck 通过而补临时胶水
- 允许在重构过程中暂时打断调用链，只要最终目标结构更干净

换句话说，这不是“边迁边兼容”的改造，而是“直接把主链改到目标形状”的重构。

判断标准只有三个：

- 最终主链是否更直接
- 真相中心是否唯一
- scene / input / action 是否改成围绕 `program + delta` 工作

---

## 3. 目标状态

剩余工作收敛后的目标状态如下：

```ts
WhiteboardIntent/Command
  -> whiteboard compile
  -> whiteboard program
  -> document delta

EditorCommand
  -> editor compile
  -> editor program
  -> editor delta

scene runtime
  <- current document
  <- current editor state
  <- document delta
  <- editor delta
  <- host view
```

这里有几个明确边界：

- editor 本地默认使用 thin command / setter-to-program
- 不追求完整的 editor intent 语言
- 只有跨状态规则和聚合命令才上升为 semantic intent
- 不新增单独的 `EditorRuntime`
- `Editor` 本身就是 editor 本地写入中轴
- editor 命令入口统一收敛到 `editor.dispatch(...)`
- editor 本地数组默认整体替换
- 不为本地态引入不必要的 `ids/byId`

---

## 4. EditorCommand 设计

### 4.1 基本原则

后续 editor 本地可观察状态的写入，统一使用 `EditorCommand`。

这里的 `EditorCommand` 有几个非常明确的原则：

- 命令默认要薄
- 命令默认直接表达“下一次写什么”
- 命令不追求完整业务语言
- 命令优先服务 `compile -> program -> delta`
- 命令入口尽量收敛到一个中轴

`EditorCommand` 不是为了做一套抽象层级很高的 DSL，而是为了把所有可观察状态写入统一收回主链。

### 4.2 中轴化要求

后续不要再继续扩散这类入口：

- `session.mutate.tool.set(...)`
- `session.mutate.selection.set(...)`
- `session.preview.write.set(...)`
- `session.interaction.write.setHover(...)`
- `session.viewport.commands.zoomTo(...)`
- 各种局部 helper 包一层再写 state

推荐直接收敛成一个中轴：

```ts
editor.dispatch(command)
```

原则上：

- 新逻辑不要再增加新的 write helper
- 不要按模块继续长出 `tool.set()`、`preview.set()`、`interaction.setHover()` 这种散入口
- 不要把 dispatch 再包成很多 feature 私有 adapter

后续代码的中心应该是：

- 谁要改 editor state
- 谁就组织 `EditorCommand`
- 然后直接 `dispatch`

### 4.3 EditorCommand 的边界

并不是所有运行期变量都要命令化。

必须走 `EditorCommand` 的是：

- 所有 editor 可观察状态
- 所有会影响 scene/runtime delta 的状态
- 所有最终属于 `EditorStateDocument` 的状态

不需要走 `EditorCommand` 的是：

- pointer sample
- gesture 私有过程态
- timer / frame job 引用
- input runtime 闭包里的临时计算变量

判断标准很简单：

- 如果它属于 editor 真相状态，就必须 dispatch command
- 如果它只是输入过程中的瞬时局部变量，就不必命令化

### 4.4 命令形状要求

`EditorCommand` 默认使用最薄的形状。

优先使用：

```ts
{ type: 'tool.set', tool }
{ type: 'selection.set', selection }
{ type: 'edit.set', edit }
{ type: 'interaction.set', interaction }
{ type: 'preview.set', preview }
{ type: 'viewport.set', viewport }
```

这里的重点不是 `set` 这个名字，而是：

- 不能直接 set store
- 只能 dispatch 一个 command

所以后续允许有很多 `*.set` command，但不允许再有“绕过 command 主链的直接 set”。

### 4.5 命令分层

第一层是薄命令，也是默认层：

```ts
type EditorCommand =
  | { type: 'tool.set'; tool: ToolState }
  | { type: 'draw.set'; state: DrawState }
  | { type: 'selection.set'; selection: SelectionTarget }
  | { type: 'edit.set'; edit: EditSession | null }
  | { type: 'interaction.set'; interaction: EditorInteractionStateValue }
  | { type: 'preview.set'; preview: EditorPreviewState }
  | { type: 'viewport.set'; viewport: Viewport }
```

第二层才是少量聚合命令，只在确实有固定规则时增加，例如：

```ts
type EditorCommand =
  | { type: 'tool.select' }
  | { type: 'selection.clear' }
  | { type: 'selection.apply'; mode: 'add' | 'subtract' | 'toggle'; input: SelectionInput }
  | { type: 'editor.reset' }
```

使用原则：

- 能用薄命令解决的，不上聚合命令
- 只有规则稳定重复出现时，才上聚合命令
- 聚合命令的价值是收敛规则，不是提高抽象层级

### 4.6 命令不要过度切碎

为了保持简单清晰，命令数量要受控。

不要把 editor 本地态过度切成大量碎命令，例如：

- `interaction.hover.set`
- `interaction.mode.set`
- `interaction.chrome.set`
- `interaction.space.set`
- `preview.guides.set`
- `preview.marquee.set`
- `preview.draw.set`
- `preview.edgeGuide.set`
- `preview.mindmap.set`

这些命令不是绝对不能有，但默认不应先设计成碎片化 API。

更优先的策略是：

- 先保留块级 command
- 让 compile/program 直接对整个状态块生效
- 只有在 delta 粒度或调用复杂度确实要求时，再拆成更细命令

也就是说，默认优先：

```ts
{ type: 'interaction.set', interaction }
{ type: 'preview.set', preview }
```

而不是一开始就发明很多局部写入口。

### 4.7 compile 的职责

`EditorCommand` 到 program 的转换应该尽量直。

对于薄命令，compile 的职责通常只是：

- normalize 输入
- patch 对应 entity
- 补必要的 semantic delta metadata

例如：

```ts
{ type: 'selection.set', selection }
```

compile 只需要：

- 读取旧 selection
- patch `selection.value`
- 产出 `selection` 相关 delta metadata

这里不应该再包第二层 helper 语言。

### 4.8 dispatch 形状建议

后续不新增单独的 `EditorRuntime`，而是直接把 dispatch 挂在现有 `Editor` 上：

```ts
interface Editor {
  dispatch(command: EditorCommand | readonly EditorCommand[]): void
}
```

如果还需要同时发文档侧 intent，也不需要额外发明一套 `WhiteboardCommand` 命名。

直接保持现有文档侧术语即可，例如：

```ts
interface Editor {
  dispatch(command: EditorCommand | readonly EditorCommand[]): void
  execute(intent: Intent | readonly Intent[]): void
}
```

但不要再继续长出：

- `toolService.setTool`
- `previewWriter.setGuides`
- `interactionStore.writeHover`
- `viewportCommands.zoomTo`

这些都会重新把主链打散。

### 4.9 推荐的最小命令集

如果按“尽量简单清晰”来收敛，建议先固定最小命令集：

```ts
type EditorCommand =
  | { type: 'tool.set'; tool: ToolState }
  | { type: 'draw.set'; state: DrawState }
  | { type: 'selection.set'; selection: SelectionTarget }
  | { type: 'edit.set'; edit: EditSession | null }
  | { type: 'interaction.set'; interaction: EditorInteractionStateValue }
  | { type: 'preview.set'; preview: EditorPreviewState }
  | { type: 'viewport.set'; viewport: Viewport }
  | { type: 'editor.reset' }
```

先用这组命令完成主链收口。

后续只有遇到以下情况才扩展：

- 某个调用点总在重复拼同一组状态变化
- 某块状态需要稳定的增量语义
- 某个规则明显属于 compile，而不该散在调用方

### 4.10 文档级结论

这轮重构对 `EditorCommand` 的要求不是“丰富”，而是“收口”。

最终应满足：

- 所有 editor 可观察状态写入都先形成 command
- command 统一从 `editor.dispatch(...)` 进入
- command 默认保持块级、薄、直接
- compile 默认直接把 command 变成 program patch
- 少 helper、少 adapter、少局部 writer
- 不再允许直接 set session/store

---

## 5. 剩余核心问题

### 5.1 scene 仍然没有直接吃双 delta

虽然 `binding.ts` 已经变薄，`editor delta` 也已经接进来了，但 scene 这一层还没有到最终形状。

当前仍然存在的问题：

- `whiteboard-editor-scene/src/contracts/source.ts` 还保留 `EditorSceneSourceChange`
- `whiteboard-editor-scene/src/projection/input.ts` 还保留 `createSourceRuntimeInputDelta(...)`
- `whiteboard-editor-scene/src/projection/runtimeFacts.ts` 仍然依赖旧的 source change 翻译结果
- scene 输入面仍然带有 editor 专属桥接协议，而不是直接围绕 `document delta + editor delta`

目标不是继续“优化这套协议”，而是直接删除这套协议。

### 5.2 input / action / service 还没有直接走 editor compile 主链

当前虽然很多写入最终已经落到 editor state engine，但调用入口仍然带着旧 session 适配思路。

剩余问题：

- `services/tool.ts`
- `action/index.ts`
- `action/edit.ts`
- `edit/runtime.ts`
- `tasks/mindmap.ts`
- `input/runtime.ts`
- `input/core/runtime.ts`
- `input/features/**/*`

这些地方仍然在通过：

- `session.mutate.*`
- `session.preview.write.*`
- `session.interaction.write.*`
- `session.viewport.*`

来间接写本地态。

目标不是继续包装这些 API，而是直接改成：

- 读取 document / scene / editor state
- 产出 editor command
- 必要时同时产出 whiteboard command

### 5.3 session 还没有彻底退出主链

当前 `session/runtime.ts` 虽然已经不是唯一真相中心，但仍然挂在很多入口中间，继续充当兼容壳。

最终目标是：

- `session` 不再作为主链抽象存在
- 如果还保留，只能是非常薄的装配辅助
- 所有真正的状态写入都直接面向 editor state engine

### 5.4 document -> editor 的桥还没有收敛成统一命令流

跨 domain 的 editor 侧收敛规则仍然需要保留，但不应该再表现成“事件到了以后直接改 session store”。

需要保留的能力包括：

- document replace 后 reset editor local state
- 当前编辑对象被删除后 clear edit
- 当前 selection 对象被删除后重算 selection

但这些都应该收敛成：

- document event
- 编译出 editor command
- 进入 editor compile/program/delta 主链

---

## 6. 接下来要做的事

### 6.1 直接删掉 scene source change 协议

目标文件：

- `whiteboard/packages/whiteboard-editor/src/scene/binding.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/contracts/source.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/projection/input.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/projection/runtimeFacts.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/projection/createRuntime.ts`

要做的事：

- 删除 `EditorSceneSourceChange`
- 删除 `createSourceRuntimeInputDelta(...)`
- 删除 editor 专属 source change 翻译逻辑
- 改成 scene runtime 直接接收：
  - current document
  - current editor state
  - document delta
  - editor delta
  - host view

这里不要再保留“为了兼容旧 scene runtime 的临时输入模型”。

### 6.2 直接把 binding 改成双 delta 发布器

`binding.ts` 的最终职责应该只剩：

- 读取当前 document snapshot
- 读取当前 editor state snapshot
- 监听 document engine commits
- 监听 editor state engine commits
- 把两类 commit 直接送到 scene runtime

它不应该继续承担：

- 自定义 change 协议编译
- session 语义桥接
- editor 专属 change 分类

如果某些 scene phase 需要额外 touched ids，应该从 `editor delta` 的 typed wrapper 或 compile metadata 里直接读，不再额外发一层 source change。

### 6.3 直接改写 input 为 command emitter

目标文件：

- `whiteboard/packages/whiteboard-editor/src/input/runtime.ts`
- `whiteboard/packages/whiteboard-editor/src/input/core/runtime.ts`
- `whiteboard/packages/whiteboard-editor/src/input/host.ts`
- `whiteboard/packages/whiteboard-editor/src/input/features/**/*`

要做的事：

- 删除 input 对 `session.preview.write`、`session.interaction.write`、`session.viewport` 的依赖
- 改成 input runtime 直接依赖：
- 改成 input runtime 直接依赖：
  - current document
  - current editor state
  - scene query
  - command dispatcher
- 各 feature 直接产出：
  - `EditorCommand`
  - 或 `readonly EditorCommand[]`
  - 必要时调用现有文档侧 `intent/execute` 主链

注意：

- 不要求 feature 先经过“兼容 host”
- 不要求保留旧 input host 形状
- 不要求 input feature 过渡期间可运行

如果旧 input runtime 结构挡路，就直接拆。

### 6.4 直接改写 action / service 层

目标文件：

- `whiteboard/packages/whiteboard-editor/src/services/tool.ts`
- `whiteboard/packages/whiteboard-editor/src/action/index.ts`
- `whiteboard/packages/whiteboard-editor/src/action/edit.ts`
- `whiteboard/packages/whiteboard-editor/src/edit/runtime.ts`
- `whiteboard/packages/whiteboard-editor/src/tasks/mindmap.ts`

要做的事：

- 删除对 `session.mutate.*` 的依赖
- 删除对 `session.preview.write.*` 的依赖
- 删除对 `session.viewport.*` 的依赖
- 直接改成调用 editor command dispatcher

这里不要求所有入口都上高语义 intent。

优先策略：

- 简单本地态写入：薄命令
- 跨状态聚合：语义 command

例如：

- `interaction.hover.set`
- `preview.guides.set`
- `viewport.set`

这些完全可以保持薄命令。

而这些适合聚合：

- `tool.set(select)` 同时清理 selection/edit/preview
- document replace 后 editor reset
- selection apply

### 6.5 直接拆掉 session 主链地位

目标文件：

- `whiteboard/packages/whiteboard-editor/src/session/runtime.ts`
- `whiteboard/packages/whiteboard-editor/src/editor/createEditor.ts`

要做的事：

- 把 editor 装配中心改成 engine-first
- action / input / scene 直接拿 editor state engine 能力
- `session` 如果继续存在，只保留最小读接口或纯装配辅助
- 删除所有“通过 session 再转发到 engine”的中间层

这里不需要做“session API 保持不变”的兼容承诺。

### 6.6 直接收敛 document -> editor bridge

目标文件：

- `whiteboard/packages/whiteboard-editor/src/editor/events.ts`
- 以及相关 document event 消费点

要做的事：

- 删除“document event 后直接改 session”逻辑
- 改成 document event -> editor command
- 统一走 editor compile/program/delta

这一步的目标不是减少规则，而是把规则放回主链。

---

## 7. 建议执行顺序

不采用兼容式迁移，建议按“先砍桥，再改入口”的顺序做。

### 第一步：先删 scene source change

先把 scene 输入协议砍掉，避免后续 input/action 改完以后还要继续喂旧桥。

交付标准：

- `EditorSceneSourceChange` 不再存在
- `createSourceRuntimeInputDelta(...)` 不再存在
- scene runtime 直接消费 document/editor 双 delta

### 第二步：再改 binding 和 scene runtime 输入

scene 的输入面收敛成最终形状：

- current document
- current editor state
- document delta
- editor delta
- host view

交付标准：

- `binding.ts` 不再编译 ad hoc editor change
- touched ids 等信息直接来自 delta wrapper / compile metadata

### 第三步：再整体改 input

直接把 input 从 session writer 改成 command emitter。

交付标准：

- input feature 不再写 `session.preview.write`
- input feature 不再写 `session.interaction.write`
- input feature 不再写 `session.viewport.*`
- input feature 直接 `dispatch(command)`，其中 `command` 可以是单个或多个

### 第四步：再改 action / service / tasks

把编辑器外围命令入口统一收回主链。

交付标准：

- `session.mutate.*` 不再是主写入入口
- action / service / task 直接走 command dispatcher

### 第五步：最后拆 session 和 document->editor bridge

交付标准：

- `session/runtime.ts` 不再承担主链职责
- document 侧收敛逻辑统一变成 editor command

---

## 8. 完成标准

这轮剩余工作完成时，至少应满足以下条件：

- scene 不再依赖 `EditorSceneSourceChange`
- scene 不再依赖 editor 专属 source change 翻译器
- input 不再写 session store
- action / service / task 不再写 session store
- session 不再是 editor 本地状态主入口
- document -> editor 收敛规则进入 editor command 主链
- editor 本地继续保持简单数据形状，数组默认整体替换
- 不为了“统一形式”引入新的本地 `ids/byId` 复杂度

如果以上条件没有同时满足，就说明这轮重构还没有真正收口。
