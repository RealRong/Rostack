# Whiteboard 非兼容重建执行清单

## 目标

这份清单只服务一个目标：

- 不考虑兼容
- 不考虑迁移成本
- 不保留过渡层
- 直接把 whiteboard 重建到长期最清晰、最稳定、最少噪音的形态

结论先行：

- `engine` 只保留一个写入口：`execute`
- `editor` 只保留一个公开产品边界：`document / session / view / input`
- `collab` 只同步 `operations`
- 删除所有仅用于转发、兼容、借类型、方法树包装的中间层

## 最终目标

最终系统只保留两层真实边界：

1. `engine`
   - committed document
   - history
   - read projection
   - execute
   - applyOperations

2. `editor`
   - interaction
   - selection
   - view
   - preview
   - clipboard
   - product-level patch api

明确删除的中间世界：

- `engine.commands.*`
- `EngineCommands`
- `EngineInstance` 作为 editor 依赖
- `editor.write.*`
- `runtime host` 作为伪公共 API
- `patch -> command -> pseudo-command tree` 的重复表达

## 执行原则

1. 先删结构，再改命名。
2. 不做兼容别名，不保留 deprecated 路径。
3. 任何类型如果只是 `Pick`、`Omit`、转发别名、装配胶水，就不应该继续存在。
4. editor 只能依赖 engine 的公开边界，不允许再穿透 engine 内部实现。
5. collab 只能认 `operations`，不认 patch，不认 command tree。

## Phase 1: 删除 Engine 命令树

### 目标

彻底删除 `engine.commands.*` 这套 facade，让 engine 回到单写入口模型。

### 要做的事

1. 删除 `EngineCommands` 类型。
   文件：
   - `/Users/realrong/Rostack/whiteboard/packages/whiteboard-engine/src/types/command.ts`

2. 删除 `EngineInstance.commands` 字段。
   文件：
   - `/Users/realrong/Rostack/whiteboard/packages/whiteboard-engine/src/types/instance.ts`

3. 删除 `src/commands/*` 目录剩余实现。
   文件：
   - `/Users/realrong/Rostack/whiteboard/packages/whiteboard-engine/src/commands/index.ts`
   - `/Users/realrong/Rostack/whiteboard/packages/whiteboard-engine/src/commands/document.ts`
   - `/Users/realrong/Rostack/whiteboard/packages/whiteboard-engine/src/commands/node.ts`
   - `/Users/realrong/Rostack/whiteboard/packages/whiteboard-engine/src/commands/edge.ts`
   - `/Users/realrong/Rostack/whiteboard/packages/whiteboard-engine/src/commands/group.ts`
   - `/Users/realrong/Rostack/whiteboard/packages/whiteboard-engine/src/commands/mindmap.ts`

4. 删除 engine 内部对命令树类型的装配依赖。
   文件：
   - `/Users/realrong/Rostack/whiteboard/packages/whiteboard-engine/src/types/write.ts`
   - `/Users/realrong/Rostack/whiteboard/packages/whiteboard-engine/src/instance/engine.ts`

5. 让 engine 内部所有写操作都直接围绕：
   - `EngineCommand`
   - `ExecuteResult`
   - `WriteInput`
   - `WriteOutput`
   - `applyOperations`

### 完成标准

- `whiteboard-engine` 内不再出现 `EngineCommands`
- `whiteboard-engine` 内不再出现 `commands:` 作为 engine 公开能力
- `createCommands` 整个概念被删除
- engine 公开 API 只剩：
  - `read`
  - `history`
  - `commit`
  - `execute`
  - `applyOperations`
  - `configure`
  - `dispose`

## Phase 2: Editor 只依赖公开 Engine

### 目标

让 editor 完全站在 engine 公开边界上，不再依赖 `EngineInstance`，不再依赖任何 engine 内部实现形状。

### 要做的事

1. 删除 `whiteboard-editor` 中所有 `EngineInstance` 引用。
   重点检查：
   - `/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/editor/createEditor.ts`
   - `/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/editor/host.ts`
   - `/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/internal/types.ts`
   - `/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/node/text.ts`

2. editor 内部所有 committed write 都改成：
   - `engine.execute({ type: ... })`

3. editor 内部所有 committed read 都改成：
   - `engine.read.*`
   - `engine.history`
   - `engine.commit`

4. editor 不再从 `@engine-types/instance` 借类型。
   优先从：
   - `@whiteboard/engine`
   - `@engine-types/command`
   - `@engine-types/result`
   直接拿最小必要类型。

5. 如果某些类型只有 `EngineInstance` 提供，就说明 engine 公开边界还不干净。
   直接把这些类型提升到 engine 公开导出，不保留 instance-only 模型。

### 完成标准

- `whiteboard-editor` 内不再出现 `EngineInstance`
- `whiteboard-editor` 内不再出现 `EngineInstance['commands']`
- `createEditor` 的 `engine` 参数只需要 `Engine`
- editor 的实现不再知道 engine 是否内部有命令树

## Phase 3: 拆散 Editor 装配中心

### 目标

删除 `internal/types.ts` 这种集中式实现类型仓库，防止 editor 内部重新长出第二套伪公共 API。

### 要做的事

1. 把 `internal/types.ts` 里的类型按模块下沉。

建议拆分方向：

- `runtime/document/types.ts`
- `runtime/session/types.ts`
- `runtime/view/types.ts`
- `runtime/node/types.ts`
- `runtime/actions/types.ts`

2. 删除所有只在单文件或单模块局部使用的集中导出类型。

3. 删除所有仅用于装配的别名。
   典型危险信号：
   - `DocumentRuntime`
   - `SessionRuntime`
   - `PreviewRuntime`
   - `EditorRuntimeChannels`
   - `ClipboardRuntime`

不是这些名字一定要删，而是要审查：

- 它是不是跨多个模块稳定共享的真实概念？
- 如果不是，就下沉回使用文件。

4. `runtime/editor/host.ts` 继续收缩。
   目标不是维护一个更漂亮的 host，而是最终把它拆成更直接的 runtime slice：
   - document runtime
   - session runtime
   - view runtime
   - preview runtime

5. `write` 这个词逐步从 editor 实现层移除。
   替换为更真实的角色名：
   - `runtime`
   - `document`
   - `session`
   - `view`
   - `preview`

### 完成标准

- `internal/types.ts` 被极度收缩或直接删除
- editor 内部类型和实现文件共址
- 不再存在一个大的“内部 API 文件”

## Phase 4: 统一 Editor 动作模型

### 目标

把 editor 内部动作模型继续压成两类，而不是继续分裂：

- product-level action
- document mutation compiler

### 要做的事

1. 明确 `runtime/actions/*` 的职责：
   - 只处理产品语义
   - 不承担 engine facade 职责

2. 明确 `runtime/node/*` 的职责：
   - 只处理 node patch/mutation 编译与提交
   - 不变成另一套“node command tree”

3. 审查以下文件是否还能继续合并或删除：
   - `/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/actions/canvas.ts`
   - `/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/actions/group.ts`
   - `/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/actions/frame.ts`
   - `/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/actions/clipboard.ts`
   - `/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/actions/edge.ts`
   - `/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/actions/mindmap.ts`

4. 合并那些只为了把多个 engine.execute 包装成更短路径的薄层。

判断规则：

- 如果文件只是在转发参数，删掉
- 如果文件只是在做轻微重命名，删掉
- 如果文件只是为了“命令分组好看”，删掉
- 只有在承担产品语义编排时才保留

### 完成标准

- editor 内部动作文件数量明显下降
- 动作文件只保留真正的产品语义组合
- mutation 编译和 action 编排边界清楚

## Phase 5: Collab 固定为 Operation-First

### 目标

让 collab 完全从 editor patch / engine command tree 里脱耦，唯一货币变成 `operations`。

### 要做的事

1. 明确 collab 的输入输出边界：
   - 本地：从 engine commit 获取 operations
   - 远端：向 engine.applyOperations 回灌 operations

2. 删除 collab 对下列概念的依赖：
   - editor patch
   - engine.commands.*
   - replace-first 同步模型

3. 把 collab session API 收缩成最小闭包：
   - bind engine
   - observe local operations
   - apply remote operations
   - awareness / selection sync

4. 如果当前有 “把 command 翻译成协同消息” 的逻辑，直接删掉。

### 完成标准

- collab 不依赖 `EngineInstance`
- collab 不依赖 `EngineCommands`
- collab 只处理 operations 和 awareness

## Phase 6: 最终目录重排

### 目标

让目录结构本身表达架构，不再保留历史包袱。

### engine 目标目录

```text
whiteboard-engine/src/
  command/
  execute/
  operations/
  read/
  types/
```

删除：

- `commands/`
- 任何 facade 风格目录

### editor 目标目录

```text
whiteboard-editor/src/
  runtime/
    document/
    session/
    view/
    preview/
    node/
    actions/
  interactions/
  types/
```

删除：

- `write`
- `host`
- 任何集中式 internal api 目录

### 完成标准

- 文件路径本身就能解释职责
- 目录名不再承载历史兼容概念
- 新人不需要先理解旧世界才能定位代码

## 删除优先级

按收益排序，推荐严格按这个顺序执行：

1. 删 `engine.commands`
2. 删 `EngineInstance` 在 editor 的依赖
3. 删 `internal/types.ts` 集中装配模式
4. 删 collab 的 command/patch 语义
5. 最后做目录和命名统一

原因：

- 前三步是在砍结构复杂度
- 第四步是在固定协同边界
- 第五步才是外观整理

## 每阶段验证

每完成一个阶段，都只做最小必要验证：

1. `whiteboard-engine`
   - `../../node_modules/.bin/tsc -p tsconfig.json --noEmit`

2. `whiteboard-editor`
   - `../../node_modules/.bin/tsc -p tsconfig.json --noEmit`

3. `whiteboard-collab`
   - `../../node_modules/.bin/tsc -p tsconfig.json --noEmit`

4. `whiteboard-react`
   - `../../node_modules/.bin/tsc -p tsconfig.json --noEmit`

不做额外兼容验证，不保留旧 API 快照，不为旧调用点写过渡逻辑。

## 一句话执行策略

不是“在旧架构上继续清理”，而是：

先定义最终边界，
再删掉所有不属于最终边界的东西，
最后让实现去适配最终边界。

## 文件级执行版

这一节不讲原则，只讲落地顺序。

每一批都遵守同一条规则：

- 先删类型
- 再删装配
- 再改调用
- 最后跑四包 `tsc`

## Batch 1: Engine 公开边界收口

### 目标

让 `engine` 公开边界彻底只剩 `execute` 模型，不再公开命令树方法。

### 文件动作

1. `/Users/realrong/Rostack/whiteboard/packages/whiteboard-engine/src/types/command.ts`
   动作：
   - 删除 `EngineCommands`
   - 保留 `EngineCommand`
   - 保留 `ExecuteResult`
   - 保留 `WriteCommandMap`
   - 把命令树式 method 签名全部移出

2. `/Users/realrong/Rostack/whiteboard/packages/whiteboard-engine/src/types/instance.ts`
   动作：
   - 删除 `EngineInstance = Engine & { commands: EngineCommands }`
   - 直接让内部也回到 `Engine`
   - 如果还有 instance-only 类型，提升为公开 engine 类型或删除

3. `/Users/realrong/Rostack/whiteboard/packages/whiteboard-engine/src/index.ts`
   动作：
   - 确保导出的是 command union、mindmap input types、order mode
   - 不再导出任何命令树相关类型

### 预期结果

- 任何包都不能再从 engine 公开面得到 `commands.*`
- engine 的公开类型系统不再暗示“方法树 API”

## Batch 2: Engine 内部命令树装配删除

### 目标

删除 engine 内部为了兼容命令树存在的装配层。

### 文件动作

1. `/Users/realrong/Rostack/whiteboard/packages/whiteboard-engine/src/commands/index.ts`
   动作：
   - 删除整个文件
   - 任何 createCommands 装配逻辑全部移除

2. `/Users/realrong/Rostack/whiteboard/packages/whiteboard-engine/src/commands/document.ts`
   动作：
   - 删除文件
   - document command method tree 不再存在

3. `/Users/realrong/Rostack/whiteboard/packages/whiteboard-engine/src/commands/node.ts`
   动作：
   - 删除文件

4. `/Users/realrong/Rostack/whiteboard/packages/whiteboard-engine/src/commands/edge.ts`
   动作：
   - 删除文件

5. `/Users/realrong/Rostack/whiteboard/packages/whiteboard-engine/src/commands/group.ts`
   动作：
   - 删除文件

6. `/Users/realrong/Rostack/whiteboard/packages/whiteboard-engine/src/commands/mindmap.ts`
   动作：
   - 删除文件

7. `/Users/realrong/Rostack/whiteboard/packages/whiteboard-engine/src/types/write.ts`
   动作：
   - 删除对 `EngineCommands` 的依赖
   - `Write` 只依赖 `apply`
   - `replace` 和 `history` 改成显式签名，而不是从命令树借型

8. `/Users/realrong/Rostack/whiteboard/packages/whiteboard-engine/src/instance/engine.ts`
   动作：
   - 删除 `commands` 字段创建
   - 删除命令树装配 import
   - engine 返回值只保留最终公开边界

### 预期结果

- `whiteboard-engine/src/commands/` 目录整体消失
- engine 内部不再维护第二套 imperative API

## Batch 3: Editor 去除 EngineInstance

### 目标

让 editor 真正只依赖公开 `Engine`。

### 文件动作

1. `/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/editor/createEditor.ts`
   动作：
   - 删除 `engine as EngineInstance`
   - 仅通过 `engine.read / history / commit / execute / configure / dispose` 获取能力
   - 如果某个地方当前只能通过 instance 能拿到，说明 engine 公开面缺东西，要么补公开导出，要么改实现

2. `/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/editor/host.ts`
   动作：
   - 删除 `EngineInstance` 类型依赖
   - 所有写操作改成显式 `engine.execute({ type: ... })`
   - 删除任何 `EngineInstance['commands']` 派生类型

3. `/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/node/text.ts`
   动作：
   - 删除 `EngineInstance['commands']['node']['deleteCascade']` 这类借型
   - 用显式函数签名替代

4. `/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/internal/types.ts`
   动作：
   - 删除 `type EngineApi = EngineInstance['commands']`
   - 删除所有由它派生出来的内部 runtime 类型依赖

### 预期结果

- `whiteboard-editor` 全仓不再出现 `EngineInstance`
- editor 成为 engine 公开 API 的正常消费者

## Batch 4: Editor 公开类型彻底独立

### 目标

让 `editor` 公开类型文件只描述 editor 自己的产品边界，不再借 engine 内部结构。

### 文件动作

1. `/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/types/editor.ts`
   动作：
   - 删除所有从 `@engine-types/instance` 或 `EngineInstance['commands']` 派生的类型
   - `EditorDocumentApi` 改成显式函数签名
   - `EditorNodesApi` 改成显式函数签名
   - `EditorEdgesApi` 改成显式函数签名
   - `EditorMindmapCommands` 改成显式函数签名
   - `EditorHistoryApi` 独立成 editor 自己的边界定义

2. `/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/index.ts`
   动作：
   - 审查导出，确保只导出 public editor boundary types
   - 不导出任何 implementation-specific type

### 预期结果

- `editor.ts` 读起来像产品边界定义，而不是 engine 类型转发表

## Batch 5: Editor 内部类型下沉

### 目标

拆掉内部大一统类型仓库，让类型和实现共址。

### 文件动作

1. `/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/internal/types.ts`
   动作：
   - 标记每个类型的真实使用点
   - 对只在单模块使用的类型，迁回实现文件
   - 对只在同目录使用的类型，迁到局部 `types.ts`
   - 最终把这个文件收缩到非常小，或者直接删除

2. `/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/editor/host.ts`
   动作：
   - 不再承担大量 shared type 聚合职责
   - 只保留必要的 runtime 组装逻辑

3. `/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/actions/*.ts`
   动作：
   - 每个 action 文件自带自己的局部 host/input 类型

4. `/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/node/*.ts`
   动作：
   - 每个 node runtime 文件自带自己的局部 mutation/input 类型

### 预期结果

- `internal/types.ts` 不再是 editor 的第二个“内部公共 API”

## Batch 6: Editor runtime 再拆一次

### 目标

删掉集中式 runtime host 思维，改成按运行时切片组织。

### 文件动作

1. `/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/editor/host.ts`
   动作：
   - 先拆出 `runtime/document/`
   - 再拆出 `runtime/session/`
   - 再拆出 `runtime/view/`
   - 再拆出 `runtime/preview/`
   - 最终这个文件只保留薄装配层，或者直接删除

2. `/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/editor/input.ts`
   动作：
   - 改成只消费更小的 runtime slice
   - 不再依赖大对象 runtime

3. `/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/interactions/context.ts`
   动作：
   - 让 `InteractionContext` 只拿必要的 slice
   - 不再把整个 runtime 通道一次性塞进去

### 预期结果

- interaction、input、action 依赖的对象更窄
- 单个 runtime slice 可以独立理解

## Batch 7: Action 文件逐个审判

### 目标

不是默认保留 `runtime/actions/*`，而是逐个判断是否真的有存在价值。

### 文件动作

1. `/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/actions/canvas.ts`
   判断：
   - 如果只是在 selection target 和 document.order/delete/duplicate 之间转发，考虑直接并回 `createEditor.ts` 或 `document.selection`

2. `/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/actions/group.ts`
   判断：
   - 如果只是在做 selection fallback，保留
   - 如果只是 group.execute 包装，删除

3. `/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/actions/frame.ts`
   判断：
   - 如果只负责 frame 创建语义，可能直接并入 `document.selection.frame`

4. `/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/actions/clipboard.ts`
   判断：
   - 如果承担 copy/cut/paste 产品语义，保留
   - 但不要再持有多余 runtime host 层

5. `/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/actions/edge.ts`
   判断：
   - 如果只是 edge patch 辅助，可继续并入 `compileEdgePatch` 或 `document.edges`
   - 只有 label editing 协调逻辑值得保留

6. `/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/actions/mindmap.ts`
   判断：
   - 如果只是在 engine execute 上做薄封装，删除
   - 只有 insert placement / move root / drop resolution 这类产品语义应保留

### 预期结果

- `runtime/actions/` 里只剩真正的产品语义文件

## Batch 8: Node runtime 再扁平

### 目标

防止 `runtime/node/*` 长成新的“node command tree”。

### 文件动作

1. `/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/node/document.ts`
   动作：
   - 如果它本质只是 patch helper，重命名为更具体的 `patch.ts` 或 `update.ts`
   - 删除泛化的“document”命名

2. `/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/node/appearance.ts`
   动作：
   - 判断是否可以并回 node patch compiler

3. `/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/node/shape.ts`
   动作：
   - 判断是否可以并回 node patch compiler

4. `/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/node/lock.ts`
   动作：
   - 判断是否可以并回 node patch compiler

5. `/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/node/text.ts`
   动作：
   - 保留文本编辑特殊语义
   - 但拆掉与普通 style/data patch 混在一起的部分

6. `/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/compile/nodePatch.ts`
   动作：
   - 逐步变成 node patch 的单一入口

### 预期结果

- node 层只保留一个通用 patch compiler
- 文本编辑特殊行为单独保留

## Batch 9: Collab operation 化

### 目标

把 collab 从 command 驱动彻底改成 operation 驱动。

### 文件动作

1. `/Users/realrong/Rostack/whiteboard/packages/whiteboard-collab/src/session.ts`
   动作：
   - 只保留：
     - 监听 engine commit operations
     - 回灌 remote operations
     - awareness / selection 协调
   - 删除任何 command-level sync 语义

2. `/Users/realrong/Rostack/whiteboard/packages/whiteboard-collab/src/types/session.ts`
   动作：
   - session 类型只围绕 operations 和 awareness
   - 不要暴露 command transport 概念

3. `/Users/realrong/Rostack/whiteboard/packages/whiteboard-collab/test/yjs-session.test.mjs`
   动作：
   - 测试围绕 operations 收发与重放
   - 不再围绕 command tree 行为写测试

### 预期结果

- collab 成为 engine operation layer 的薄同步适配器

## Batch 10: 最终目录裁剪

### 目标

让文件结构直接表达最后的模型。

### 文件动作

1. `whiteboard-engine`
   动作：
   - 把 `types/command.ts` 按 domain 拆开
   - 建立：
     - `src/command/document.ts`
     - `src/command/node.ts`
     - `src/command/edge.ts`
     - `src/command/group.ts`
     - `src/command/mindmap.ts`
     - `src/command/index.ts`

2. `whiteboard-editor`
   动作：
   - 建立：
     - `src/runtime/document/`
     - `src/runtime/session/`
     - `src/runtime/view/`
     - `src/runtime/preview/`
   - 删除：
     - `host.ts`
     - 大而泛的 internal 目录

### 预期结果

- 目录本身就是架构图

## 每个 Batch 的执行格式

每次真正落地时，严格按下面格式做：

1. 先列出本批次要删除的文件
2. 再列出本批次要改签名的文件
3. 再列出本批次要改调用点的文件
4. 执行代码修改
5. 跑四包 `tsc`
6. 如果编译通过，再进入下一批

## 停止条件

只有满足下面全部条件，才算这轮重建真正结束：

- engine 不再有命令树 facade
- editor 不再依赖 EngineInstance
- collab 不再理解 command tree
- editor 内部没有新的集中式装配类型仓库
- public type 文件不再从内部实现借型
- 目录名和文件名不再携带兼容时代的概念包袱
