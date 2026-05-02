# Whiteboard Editor Transient State 长期最优 API 设计与重构方案

## 1. 目标与结论

本文只讨论 `whiteboard/packages/whiteboard-editor` 中 **本地 transient state** 的长期最优架构，不讨论 document / engine 写路径。

结论：

- `editor transient state` 不再保留 `intent system`
- 不再保留 `compileHandlers`
- 不再保留 `dispatch -> applyCommand -> engine.execute(commands)` 这条本地状态写链
- 统一改为 `local state store + local writer + semantic facade`
- document / engine 侧仍然保留 `intent -> compile -> writer`

这里的核心判断不是“是否使用 writer”，而是“本地 transient state 是否值得继续维护一套 command / intent 编译系统”。

长期最优答案是否定的。

transient state 的本质是：

- editor session state
- hover state
- preview state
- 交互过程中只在本地存在、不会成为持久文档协议的一类状态

这类状态需要的是：

- 高频更新下的直接写入
- 明确的局部 API
- 尽量少的抽象层
- 易于维护和推导的状态边界

而不是一套与 engine 写路径相似、但语义上并不等价的小型 mutation command system。

## 2. 当前问题

当前 transient state 实际同时存在三套表达：

1. `EditorStateIntent`
2. `applyCommand`
3. `compileHandlers`

这三者描述的是同一件事：本地 editor state 如何变化。

这会带来几个长期问题。

### 2.1 抽象层次错位

当前 `EditorStateIntent` 多数只是：

- `tool.set`
- `selection.set`
- `hover.set`
- `preview.node.set`
- `preview.reset`

这些并不是高层领域命令，只是本地状态写入动作。

也就是说，它们没有像 engine intent 那样承载真正的“语义编译”职责。

### 2.2 同一逻辑被实现多次

同一份本地状态变更同时出现在：

- command 定义
- staged state 推导
- compile 到 writer patch

结果是：

- 维护成本高
- 容易漂移
- API 看起来比实际需求更复杂

### 2.3 dispatch 与 writer 双轨并存

当前很多高频 transient 更新已经直接使用 `state.write(({ writer }) => ...)`。

这说明输入系统已经自然地偏向 writer 模式，而不是 intent 模式。

继续保留完整 intent system，只会使架构边界越来越模糊：

- 一部分 transient 走 dispatch
- 一部分 transient 走 writer
- 维护者需要不断判断“这里到底该不该发 intent”

### 2.4 概念污染

当前系统里 `intent`、`mutation`、`writer` 这些术语在 engine 层和 editor transient 层都存在，但承担的职责完全不同。

这会造成长期认知负担：

- engine intent 是 document semantic intent
- editor intent 只是 local state setter command

两者同名但不同义，不利于后续系统继续演化。

## 3. 长期最优架构原则

长期最优架构应满足以下原则。

### 3.1 document 与 transient 必须严格分层

必须明确区分两类写路径：

- document write
- editor transient write

document write：

- 保留 semantic intent
- 进入 engine compile
- 统一处理 layout / lock / history / collab / replay

transient write：

- 不走 intent system
- 不走 compile pipeline
- 直接写 local state store

### 3.2 transient state 只保留一套真实写模型

对于本地状态，“状态如何变化”只能在一个地方描述。

长期最优实现中，这个地方就是：

- local writer

而不是：

- command 定义一遍
- reducer / applyCommand 定义一遍
- compileHandlers 再定义一遍

### 3.3 facade 与 writer 分层

长期最优并不意味着“所有地方都裸写 schema patch”。

需要保留两层：

- semantic facade
- local writer

其中：

- facade 负责对外语义 API 与 policy 组合
- writer 负责 editor-local 状态落地

这能避免两个极端：

- 过度抽象成 intent engine
- 过度裸露成全局到处 patch

### 3.4 按生命周期而不是按技术实现组织 state

transient state 的组织方式应该围绕生命周期与更新频率，而不是围绕“是否能塞进一个 mutation engine”。

最合理的划分是：

- session store
- hover store
- preview store

## 4. 目标架构总览

长期最优结构如下：

```text
editor
  ├─ document writes
  │    └─ engine.execute(intent)
  │
  └─ transient writes
       ├─ session facade
       ├─ hover facade
       ├─ preview facade
       └─ local state stores
            └─ write(writer)
```

其中最重要的边界是：

- `engine.execute(intent)` 只服务 document state
- `editor.state.write(writer)` 只服务 transient state

两者不共享 intent 协议。

## 5. 目标 API 设计

### 5.1 顶层 API 原则

目标 API 应满足以下要求：

- 对调用方清晰区分 document 与 transient
- 不暴露不必要的 schema 细节
- 高频更新可直接进入 writer
- 语义较强的编辑器操作通过 facade 组织

### 5.2 顶层 Editor API 形态

建议目标形态：

```ts
interface Editor {
  document: EditorDocumentFacade
  session: EditorSessionFacade
  hover: EditorHoverFacade
  preview: EditorPreviewFacade
  state: EditorLocalStateFacade
}
```

其中：

- `document` 对应持久文档读写
- `session / hover / preview` 对应 transient semantic facade
- `state` 是底层 local store 访问入口

### 5.3 document facade

document facade 不在本文重构范围内，但边界需要明确：

```ts
editor.document.write.node.move(...)
editor.document.write.group.merge(...)
editor.document.write.node.text.commit(...)
```

这些调用长期仍然走：

```ts
engine.execute(intent)
```

### 5.4 session facade

`session` 负责稳定但本地的编辑器会话状态。

建议包含：

```ts
interface EditorSessionFacade {
  tool: {
    get(): Tool
    set(tool: Tool): void
  }
  selection: {
    get(): SelectionTarget
    set(selection: SelectionTarget): void
    clear(): void
  }
  edit: {
    get(): EditSession
    set(edit: EditSession): void
    clear(): void
    startNode(input: {
      nodeId: string
      field: EditField
      caret?: CaretTarget
    }): void
    startEdgeLabel(input: {
      edgeId: string
      labelId: string
      caret?: CaretTarget
    }): void
  }
  interaction: {
    get(): EditorStableInteractionState
    set(state: EditorStableInteractionState): void
    clear(): void
  }
}
```

特点：

- facade 层允许集中 policy
- 但底层不依赖 intent
- 所有实现直接调用 local store writer

### 5.5 hover facade

`hover` 单独抽离，因为它具有更高频率和更短生命周期。

```ts
interface EditorHoverFacade {
  get(): EditorHoverState
  set(state: EditorHoverState): void
  clear(): void
  edgeGuide: {
    get(): EdgeGuideValue
    set(value: EdgeGuideValue): void
    clear(): void
  }
}
```

特点：

- pointer move 期间更新频繁
- 与 selection / edit 的生命周期不同
- 应避免和其它状态共用过重的调度模型

### 5.6 preview facade

`preview` 负责拖拽、变换、边连线、mindmap draft 等纯本地草稿态。

```ts
interface EditorPreviewFacade {
  node: {
    get(): PreviewInput['node']
    replace(next: PreviewInput['node']): void
    clear(): void
  }
  edge: {
    get(): PreviewInput['edge']
    replace(next: PreviewInput['edge']): void
    clear(): void
  }
  mindmap: {
    get(): PreviewInput['mindmap']
    replace(next: PreviewInput['mindmap']): void
    clear(): void
  }
  selection: {
    get(): PreviewInput['selection']
    set(next: PreviewInput['selection']): void
    clear(): void
  }
  draw: {
    get(): PreviewInput['draw']
    set(next: PreviewInput['draw']): void
    clear(): void
  }
  reset(): void
}
```

特点：

- `node / edge / mindmap` 主要是 replace 型 API
- collection diff 是 preview 子系统内部细节，不应泄漏给上层
- `reset()` 是高频常用能力，保留明确语义入口

### 5.7 local state facade

`state` 是唯一底层 local state 访问入口。

```ts
interface EditorLocalStateFacade {
  read(): EditorLocalSnapshot
  write(
    run: (ctx: {
      writer: EditorLocalWriter
      snapshot: EditorLocalSnapshot
    }) => void
  ): void
  subscribe(listener: (commit: EditorLocalCommit) => void): () => void
}
```

要求：

- `write()` 是 transient state 唯一底层写通道
- facade 层最终都委托给 `write()`
- 高频输入逻辑也可以直接用 `write()`

## 6. Local Writer 设计

### 6.1 设计原则

`EditorLocalWriter` 不是底层 schema patch 原语的直接暴露，而是面向 transient state 领域的本地 writer。

也就是说，writer 的设计目标是：

- 足够低成本
- 语义边界清晰
- 避免重复 patch 代码外溢

### 6.2 目标接口

```ts
interface EditorLocalWriter {
  session: {
    tool: {
      set(tool: Tool): void
    }
    selection: {
      set(selection: SelectionTarget): void
      clear(): void
    }
    edit: {
      set(edit: EditSession): void
      clear(): void
    }
    interaction: {
      set(state: EditorStableInteractionState): void
      clear(): void
    }
  }

  hover: {
    set(state: EditorHoverState): void
    clear(): void
    edgeGuide: {
      set(value: EdgeGuideValue): void
      clear(): void
    }
  }

  preview: {
    node: {
      replace(next: PreviewInput['node']): void
      clear(): void
    }
    edge: {
      replace(next: PreviewInput['edge']): void
      clear(): void
    }
    mindmap: {
      replace(next: PreviewInput['mindmap']): void
      clear(): void
    }
    selection: {
      set(next: PreviewInput['selection']): void
      clear(): void
    }
    draw: {
      set(next: PreviewInput['draw']): void
      clear(): void
    }
    reset(): void
  }
}
```

### 6.3 replace 与 patch 的边界

长期最优架构里，应尽量减少调用方自己拼 patch。

推荐边界：

- 对外 API 以 `set / replace / clear / reset` 为主
- collection diff 与最小 patch 计算由 writer 内部负责

原因：

- 调用方关心的是“我要的 next state”
- writer 负责决定最优落地方式

这能避免当前很多零散 preview 更新逻辑复制同样的 create / patch / delete diff。

### 6.4 批量写与事务

`state.write()` 默认就是事务边界：

```ts
editor.state.write(({ writer, snapshot }) => {
  writer.hover.clear()
  writer.preview.reset()
  writer.session.selection.set(nextSelection)
})
```

要求：

- 单次 `write()` 内产生一次 commit
- 中间态不对外泄漏
- 内部自动做 equality short-circuit

## 7. Store 划分方案

### 7.1 长期最优拆分

长期最优建议拆成三份 store：

1. `session store`
2. `hover store`
3. `preview store`

### 7.2 session store

包含：

- tool
- selection
- edit
- interaction

特点：

- 更新频率相对较低
- 有较多 UI policy
- 与 command / selection / editing 生命周期强关联

### 7.3 hover store

包含：

- hover target
- edge guide

特点：

- 更新频率最高
- 生命周期最短
- 适合极轻量 commit 模型

### 7.4 preview store

包含：

- preview.node
- preview.edge
- preview.mindmap
- preview.selection
- preview.draw

特点：

- 高频
- 结构复杂
- 经常需要 replace / clear / reset
- 应有独立优化空间

### 7.5 为什么不是一个大 store

一个大 store 当然也可行，但不是长期最优。

拆分的好处：

- 高频 hover 不影响其它状态订阅
- preview diff 策略可以独立优化
- session API 更稳定清晰
- 更容易针对不同生命周期做性能调优

### 7.6 过渡期策略

如果重构初期希望控制范围，可以先保留一个 unified local store，再逐步拆成三份。

也就是说：

- 短期迁移路径可以保守
- 长期目标仍应是三类 store 分离

## 8. 订阅与提交模型

### 8.1 目标 commit 模型

transient state store 仍然需要 commit / subscribe，但不再依赖 mutation intent engine。

建议：

```ts
interface EditorLocalCommit<TSnapshot, TDelta> {
  snapshot: TSnapshot
  delta: TDelta
}
```

### 8.2 delta 的职责

delta 只服务本地订阅优化与 scene 更新，不承担跨层协议职责。

因此：

- 不需要像 document operation 那样稳定可回放
- 不需要语义兼容承诺
- 只需要足够支撑本地增量刷新

### 8.3 subscribe 目标

订阅模型需要支持：

- React/UI 读状态
- scene projection 更新
- 输入系统联动

但这些订阅都只面对 local state commit，而不是 command intent。

## 9. 对外 API 语义边界

### 9.1 应暴露什么

推荐暴露：

- semantic facade
- `state.read()`
- `state.write()`

### 9.2 不应暴露什么

不推荐继续对外暴露：

- `EditorStateIntent`
- `dispatch(command)`
- `dispatch(updater)`
- compile handler 概念
- 直接 schema patch writer

### 9.3 为什么不保留 dispatch

`dispatch` 的核心价值通常是：

- action / reducer 风格 API
- 通过 command 对状态演进建模

但 transient state 不需要这套模式：

- 它不是跨端协议
- 它不需要 replay contract
- 它不需要 command history

保留 dispatch 只会在 writer 之外再维持一套平行写模型。

## 10. Policy 放置原则

长期最优架构中，policy 不放在 intent compile，而放在 facade。

例如：

- `tool.set()` 时是否顺手清 hover
- `selection.set()` 时是否清 preview
- `edit.startNode()` 时如何同步 selection
- `hover.clear()` 时是否清 edge guide

这类逻辑属于：

- editor interaction policy
- local UX policy

而不是：

- local state command compilation

推荐规则：

- 纯状态落地放 writer
- 组合行为与 UX 规则放 facade

## 11. 迁移后的目录结构建议

建议目标目录结构：

```text
whiteboard/packages/whiteboard-editor/src/state
  ├─ local/
  │   ├─ types.ts
  │   ├─ store.ts
  │   ├─ commit.ts
  │   ├─ writer.ts
  │   ├─ session.ts
  │   ├─ hover.ts
  │   └─ preview.ts
  ├─ facade/
  │   ├─ session.ts
  │   ├─ hover.ts
  │   └─ preview.ts
  └─ index.ts
```

如果采用三份 store，进一步演化为：

```text
whiteboard/packages/whiteboard-editor/src/state
  ├─ session/
  ├─ hover/
  ├─ preview/
  ├─ facade/
  └─ index.ts
```

明确移除：

- `state/intents.ts`
- 当前的 `compileHandlers`
- `applyCommand`
- transient `dispatch` 体系

## 12. 分阶段重构方案

以下按“长期最优、但执行上可控”的顺序给出重构方案。

### Phase 1: 建立新的 local writer 边界

目标：

- 保持现有 state schema 不变
- 新建 `EditorLocalWriter`
- 所有新的 transient 写逻辑统一走 `state.write()`

动作：

- 抽出 `session / hover / preview` writer API
- 把 collection diff 逻辑收进 writer 内部
- 禁止新增 `EditorStateIntent`

阶段结果：

- writer 成为唯一推荐底层入口
- intent system 进入冻结状态

### Phase 2: 用 facade 替换 dispatch API

目标：

- 用 semantic facade 取代 `dispatch(command)`

动作：

- 提供 `editor.session.*`
- 提供 `editor.hover.*`
- 提供 `editor.preview.*`
- 调用侧逐步迁移

阶段结果：

- 大部分调用侧不再依赖 `dispatch`
- facade 与 writer 分层建立完成

### Phase 3: 删除 EditorStateIntent 依赖

目标：

- 所有调用侧停止构造 transient intent object

动作：

- 下线 `EditorStateIntent`
- 下线 `EditorDispatchInput`
- 删除所有仅为 dispatch 存在的 helper

阶段结果：

- transient state 不再存在 command 协议

### Phase 4: 删除 compileHandlers 与 applyCommand

目标：

- 去掉重复状态描述

动作：

- 删除 compileHandlers
- 删除 applyCommand
- 将 staged state 逻辑收敛到 local store 本身

阶段结果：

- “状态如何变化”只在 writer 中定义一次

### Phase 5: 拆分 session / hover / preview stores

目标：

- 达到长期最优 store 形态

动作：

- 从 unified local store 拆出三类 store
- 保持 facade API 稳定
- scene / UI 订阅改为按 store 订阅

阶段结果：

- 生命周期分层彻底完成
- 性能调优边界更清晰

## 13. 迁移约束与实现原则

### 13.1 facade API 稳定优先

即使底层 store 继续演进，也应尽量保持：

- `session.*`
- `hover.*`
- `preview.*`

这些 facade 的对外稳定性。

### 13.2 writer 是唯一真实写模型

长期必须坚持：

- transient 的真实变更逻辑只写一遍
- 位置就在 writer

### 13.3 不把 schema patch 外溢到业务侧

避免让输入层、action 层到处显式写：

- create / patch / delete diff
- state subtree patch
- reset 细节

这些都应由 writer 或 facade 吸收。

### 13.4 preview diff 内聚

`preview.node.replace(next)` 等 API 背后所需的：

- create
- patch
- delete
- equality skip

都应只由 preview writer 负责。

### 13.5 local delta 不上升为协议

transient commit delta 只服务本地订阅优化。

不要把它设计成：

- operation protocol
- replay contract
- 对外部系统暴露的长期兼容接口

## 14. 重构后的最终形态示例

```ts
editor.session.tool.set(tool)
editor.session.selection.set({
  nodeIds: [nodeId],
  edgeIds: []
})

editor.hover.set(nextHover)
editor.hover.edgeGuide.set(nextGuide)

editor.preview.node.replace(nextPreviewNode)
editor.preview.edge.clear()
editor.preview.reset()

editor.state.write(({ writer, snapshot }) => {
  if (snapshot.session.edit) {
    writer.session.edit.clear()
  }
  writer.hover.clear()
  writer.preview.reset()
})
```

而不是：

```ts
editor.dispatch({ type: 'tool.set', tool })
editor.dispatch({ type: 'hover.set', hover })
editor.dispatch({ type: 'preview.reset' })
```

也不是：

```ts
writer.state.patch(...)
writer.preview.node.create(...)
writer.preview.node.delete(...)
```

直接散落在全局各处。

## 15. 最终结论

如果不考虑兼容，`whiteboard-editor` 的 transient state 长期最优方案是：

- 废弃本地 `intent system`
- 废弃 transient `compileHandlers`
- 废弃 transient `dispatch` 模型
- 建立 `local state store + local writer + semantic facade`
- 长期按 `session / hover / preview` 拆分 store

最终的架构边界应被固定为：

- document semantic write: `engine.execute(intent)`
- editor transient write: `state.write(writer)`

前者面向领域语义与持久状态，后者面向本地会话态与高频预览态。

这条边界越清晰，whiteboard editor 的长期复杂度就越可控。
