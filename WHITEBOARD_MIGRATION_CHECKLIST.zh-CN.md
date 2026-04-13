# Whiteboard Core / Engine / Editor 代码审计与迁移清单

## 审计范围

- `whiteboard/packages/whiteboard-core`
- `whiteboard/packages/whiteboard-engine`
- `whiteboard/packages/whiteboard-editor`

本次审计重点回答 4 个问题：

1. `core`、`engine`、`editor` 三层里，哪些类型定义重复了。
2. 哪些重复定义应该只保留 `core` 作为单一来源。
3. 哪些类型只是中间翻译层，应该直接删除或收敛。
4. 哪些重复实现逻辑可以抽成复用能力，减少三层漂移。

## 当前分层判断

- `core` 已经承担了领域模型、几何、选择、边路径、mindmap 规划、kernel reduce 等真正的“领域源头”职责。
- `engine` 应该只承担“运行时读写、缓存、索引、提交历史”，但当前混入了一层与 `core` 高度同构的命令类型和 mindmap 输入类型包装。
- `editor` 应该只承担“展示态、交互态、局部会话态”，但当前又重复定义了一批 registry、命令 facade、别名类型和输入适配层。

结论：当前最主要的问题不是“功能缺失”，而是“同一语义在三层被命名两次到三次”，导致类型边界越来越模糊，迁移成本不断累积。

## 一、建议收敛为 Core 单一来源的类型

### 1. Mindmap 命令输入族应由 `core` 单独提供

证据：

- `core` 已经定义了 `MindmapCreateInput`、`MindmapInsertInput`、`MindmapMoveSubtreeInput`、`MindmapRemoveSubtreeInput`、`MindmapCloneSubtreeInput`、`MindmapUpdateNodeInput`
  - `whiteboard/packages/whiteboard-core/src/types/model.ts:219`
  - `whiteboard/packages/whiteboard-core/src/mindmap/types.ts:86`
  - `whiteboard/packages/whiteboard-core/src/mindmap/types.ts:111`
  - `whiteboard/packages/whiteboard-core/src/mindmap/types.ts:118`
  - `whiteboard/packages/whiteboard-core/src/mindmap/types.ts:122`
  - `whiteboard/packages/whiteboard-core/src/mindmap/types.ts:129`
- `engine` 又定义了一套几乎等价的 `MindmapCreateOptions` / `MindmapInsertOptions` / `MindmapMoveSubtreeInput` / `MindmapRemoveSubtreeInput` / `MindmapCloneSubtreeInput` / `MindmapUpdateNodeInput`
  - `whiteboard/packages/whiteboard-engine/src/types/mindmap.ts:15`
  - `whiteboard/packages/whiteboard-engine/src/types/mindmap.ts:21`
  - `whiteboard/packages/whiteboard-engine/src/types/mindmap.ts:23`
  - `whiteboard/packages/whiteboard-engine/src/types/mindmap.ts:50`
  - `whiteboard/packages/whiteboard-engine/src/types/mindmap.ts:60`
  - `whiteboard/packages/whiteboard-engine/src/types/mindmap.ts:62`
- `editor` 公开 API 再继续依赖 `engine` 的这一套类型
  - `whiteboard/packages/whiteboard-editor/src/types/commands.ts:34`
  - `whiteboard/packages/whiteboard-editor/src/types/commands.ts:193`

判断：

- `MindmapCreateOptions` 与 `MindmapCreateInput` 实质重复，应该直接删掉 engine 版本，统一使用 core 版本。
- `MindmapCloneSubtreeInput` / `MindmapRemoveSubtreeInput` / `MindmapUpdateNodeInput` 目前已经只是 core 别名，属于纯中间层，应该删除 engine 别名，改为 editor 直接从 core 引用。
- `MindmapInsertOptions` 与 `MindmapMoveSubtreeInput` 存在“core 有基础版、engine 有增强版”的分裂。
  - 建议把 richer version 上移到 `core`，形成唯一公共输入类型。
  - 然后 engine/editor 都只消费 core。

建议落点：

- 在 `core` 新建或补齐统一的 mindmap command input exports。
- 删除 `whiteboard-engine/src/types/mindmap.ts` 中所有纯别名型定义。
- editor 的 `MindmapCommands` 直接从 core 引入命令输入类型，不再经由 engine 转手。

### 2. `OrderMode` 应统一为一个领域类型

证据：

- engine 定义 `OrderMode = 'set' | 'front' | 'back' | 'forward' | 'backward'`
  - `whiteboard/packages/whiteboard-engine/src/types/command.ts:51`
- editor 再定义一套不含 `set` 的 `OrderMode`
  - `whiteboard/packages/whiteboard-editor/src/types/commands.ts:62`
- editor 的 document/group facade 又把这套 mode 翻译成 `engine.execute(...)`
  - `whiteboard/packages/whiteboard-editor/src/command/document.ts:15`
  - `whiteboard/packages/whiteboard-editor/src/command/document.ts:88`

判断：

- 这是标准的领域枚举漂移。
- `order` 语义属于文档/画布操作，不属于 editor 私有展示逻辑。
- 最合理的归属是 `core`，由 `core` 输出 `CanvasOrderMode` 或 `OrderMode`。

建议落点：

- 在 `core` 导出唯一 `OrderMode`。
- `engine` 直接复用。
- `editor` 如果不需要 `'set'`，只导出 `Exclude<OrderMode, 'set'>` 之类的 UI 子集，而不是重新写一份字符串联合。

### 3. `NodeRole` 应提升为 core 层类型

证据：

- editor 定义了 `NodeRole = 'content' | 'frame'`
  - `whiteboard/packages/whiteboard-editor/src/types/node/registry.ts:14`
- core 的选择逻辑已经在用同样语义，但靠 callback 手动注入
  - `whiteboard/packages/whiteboard-core/src/selection/model.ts:308`
  - `whiteboard/packages/whiteboard-core/src/selection/model.ts:316`

判断：

- 这不是 UI metadata，而是 core selection / frame 行为依赖的领域语义。
- 类型本身应该由 core 提供，editor 只负责把具体 node type 映射到 role。

建议落点：

- 在 `core` 提供 `NodeRole` 类型。
- editor registry 中的 `role?: NodeRole` 直接复用 core 类型。
- core selection 相关 API 的 callback 参数也改成引用 core 的 `NodeRole`。

### 4. Mindmap 中的几何原语应统一复用 `Point` / `Size` / `Rect`

证据：

- core 基础几何类型已存在
  - `whiteboard/packages/whiteboard-core/src/types/model.ts:13`
  - `whiteboard/packages/whiteboard-core/src/types/model.ts:14`
  - `whiteboard/packages/whiteboard-core/src/types/model.ts:15`
- mindmap 类型里仍大量内联 `{ x, y }` / `{ width, height }` / `{ x, y, width, height }`
  - `whiteboard/packages/whiteboard-core/src/mindmap/types.ts:33`
  - `whiteboard/packages/whiteboard-core/src/mindmap/types.ts:38`
  - `whiteboard/packages/whiteboard-core/src/mindmap/types.ts:39`
  - `whiteboard/packages/whiteboard-core/src/mindmap/types.ts:55`
- layout 实现里又局部声明 `LayoutNode` 和 `Size`
  - `whiteboard/packages/whiteboard-core/src/mindmap/layout.ts:3`
  - `whiteboard/packages/whiteboard-core/src/mindmap/layout.ts:4`
- editor `MindmapView` 再次把 rootPosition / bbox / ghost / line 内联成匿名对象
  - `whiteboard/packages/whiteboard-editor/src/query/mindmap/read.ts:24`
  - `whiteboard/packages/whiteboard-editor/src/query/mindmap/read.ts:27`
  - `whiteboard/packages/whiteboard-editor/src/query/mindmap/read.ts:33`
  - `whiteboard/packages/whiteboard-editor/src/query/mindmap/read.ts:41`
  - `whiteboard/packages/whiteboard-editor/src/query/mindmap/read.ts:47`
  - `whiteboard/packages/whiteboard-editor/src/query/mindmap/read.ts:53`

判断：

- mindmap 是当前最明显的“匿名几何对象扩散区”。
- 这些匿名对象降低了可读性，也让等值判断、复用 helper、序列化约束更难统一。

建议落点：

- `MindmapTree.meta.position` 改为 `Point`。
- `MindmapLayout.node[...]` 和 `bbox` 改为 `Rect`。
- `GetNodeSize` 改为返回 `Size`。
- `MindmapView.rootPosition` / `bbox` / `ghost` / `connectionLine` / `insertLine` 统一改成命名类型或复用 core 类型。

### 5. `HorizontalResizeEdge` / `VerticalResizeEdge` 只保留一份

证据：

- `core/node/snap.ts` 内部声明一次
  - `whiteboard/packages/whiteboard-core/src/node/snap.ts:3`
  - `whiteboard/packages/whiteboard-core/src/node/snap.ts:4`
- `core/node/transform.ts` 再导出一次
  - `whiteboard/packages/whiteboard-core/src/node/transform.ts:24`
  - `whiteboard/packages/whiteboard-core/src/node/transform.ts:25`
- editor snap 运行时又围绕这两个类型再包一层 `ResizeSnapSource`
  - `whiteboard/packages/whiteboard-editor/src/input/core/snap.ts:29`

判断：

- 这是 core 内部就已经出现的重复定义。
- 这两个类型应该成为 node transform/snap 共用的基础类型，放在单一文件导出。

建议落点：

- 把这两个类型移动到 `core/node` 的共享 type 文件。
- `snap.ts` 与 `transform.ts` 都引用同一份。
- editor 的 `ResizeSnapSource` 直接引用 core 现成结构，或直接使用 `TransformResizeSnapInput['source']`。

### 6. `NodeDefinition` 与 `NodeTypeDefinition` 应拆成“共享基座 + editor 扩展”

证据：

- core 定义 `NodeTypeDefinition`
  - `whiteboard/packages/whiteboard-core/src/types/registry.ts:9`
- editor 定义 `NodeDefinition`
  - `whiteboard/packages/whiteboard-editor/src/types/node/registry.ts:24`
- 两者重复字段包括：
  - `type`
  - `geometry`
  - `defaultData`
  - `schema`

同时：

- editor 额外扩展了 presentation / interaction 字段：
  - `meta`
  - `describe`
  - `role`
  - `hit`
  - `connect`
  - `canRotate`
  - `canResize`
  - `autoMeasure`
  - `enter`
  - `edit.fields`

判断：

- editor 的整份 `NodeDefinition` 不适合原样搬到 core，因为其中大量字段明显属于 UI / 交互层。
- 但 core/editor 现在各自维护一半 schema/geometry/defaultData，已经开始漂移。

建议落点：

- 在 core 定义 `BaseNodeDefinition` 或扩展现有 `NodeTypeDefinition`，至少统一：
  - `type`
  - `geometry`
  - `defaultData`
  - `schema`
- editor 的 `NodeDefinition` 改为：
  - `type EditorNodeDefinition = BaseNodeDefinition & EditorNodePresentationDefinition`
- `NodeRole` 如果上移到 core，则 editor 只保留 `NodeMeta` / `NodeFamily` / `ControlId` / `NodeHit` 等 UI 扩展。

### 7. `ControlId` 至少应复用 `ShapeControlId`

证据：

- core 有 `ShapeControlId = 'fill' | 'stroke' | 'text'`
  - `whiteboard/packages/whiteboard-core/src/node/shape.ts:50`
- editor 有 `ControlId = 'fill' | 'stroke' | 'text' | 'group'`
  - `whiteboard/packages/whiteboard-editor/src/types/node/registry.ts:13`

判断：

- editor 的 `ControlId` 没必要完整重写一遍。
- 更合理的方式是基于 core 的 `ShapeControlId` 扩展 `'group'`。

建议落点：

- `type ControlId = ShapeControlId | 'group'`

## 二、不必要的中间翻译层

### 1. Engine 的 `EngineCommand` 与 `WriteCommandMap` 基本同构

证据：

- `WriteCommandMap` / `WriteInput` 定义
  - `whiteboard/packages/whiteboard-engine/src/types/command.ts:58`
  - `whiteboard/packages/whiteboard-engine/src/types/command.ts:181`
  - `whiteboard/packages/whiteboard-engine/src/types/command.ts:189`
- `EngineCommand` 再定义一套平行命令
  - `whiteboard/packages/whiteboard-engine/src/types/command.ts:263`
- `createEngine.execute` 里的大 `switch` 基本只是把 `EngineCommand` 重新包装为 `WriteInput`
  - `whiteboard/packages/whiteboard-engine/src/instance/engine.ts:124`
  - `whiteboard/packages/whiteboard-engine/src/instance/engine.ts:133`
  - `whiteboard/packages/whiteboard-engine/src/instance/engine.ts:199`
  - `whiteboard/packages/whiteboard-engine/src/instance/engine.ts:255`

典型例子：

- `document.insert`:
  - 公共层：`{ type: 'document.insert', slice, options }`
  - 内部层：`{ domain: 'document', command: { type: 'insert', slice, options } }`
- `node.patch`:
  - 公共层：`{ type: 'node.patch', updates }`
  - 内部层：`{ domain: 'node', command: { type: 'updateMany', updates } }`

判断：

- 这一层不是“抽象”，而是“重复建模”。
- 维护成本高，收益很低。
- 每次加命令都要同时改：
  - `EngineCommand`
  - `WriteCommandMap`
  - `ExecuteResult`
  - `execute` switch
  - translate/write 层

建议收敛方式二选一：

- 方案 A：公开 `WriteInput`，删除 `EngineCommand`。
- 方案 B：保留 `EngineCommand` 作为唯一公共命令类型，`WriteCommandMap` 改为从 `EngineCommand` 派生，而不是手写第二套。

建议优先级：最高。

### 2. Engine 的 mindmap 类型文件大部分是纯别名层

证据：

- `MindmapCloneSubtreeInput = CoreMindmapCloneSubtreeInput`
  - `whiteboard/packages/whiteboard-engine/src/types/mindmap.ts:21`
- `MindmapRemoveSubtreeInput = CoreMindmapRemoveSubtreeInput`
  - `whiteboard/packages/whiteboard-engine/src/types/mindmap.ts:60`
- `MindmapUpdateNodeInput = CoreMindmapUpdateNodeInput`
  - `whiteboard/packages/whiteboard-engine/src/types/mindmap.ts:62`
- `MindmapCreateOptions` 又复制 core 的 `MindmapCreateInput`
  - `whiteboard/packages/whiteboard-engine/src/types/mindmap.ts:15`
  - `whiteboard/packages/whiteboard-core/src/types/model.ts:219`

判断：

- 这整个文件应该被压缩成极小的一层，甚至删除。
- 真正值得保留在 engine 的只有“运行时返回值”和“与 writer 直接相关的内部类型”，不是领域输入。

### 3. Editor 的 `Editor*` 别名层过厚

证据：

- `EditorClipboardTarget = ClipboardTarget`
  - `whiteboard/packages/whiteboard-editor/src/types/editor.ts:52`
- `EditorClipboardOptions = ClipboardOptions`
  - `whiteboard/packages/whiteboard-editor/src/types/editor.ts:53`
- `EditorRead = RuntimeRead`
  - `whiteboard/packages/whiteboard-editor/src/types/editor.ts:96`
- `EditorConfig = AppConfig`
  - `whiteboard/packages/whiteboard-editor/src/types/editor.ts:100`
- `EditorStore = EditorState`
  - `whiteboard/packages/whiteboard-editor/src/types/editor.ts:102`
- `EditorAppActions = AppActions`
  - `whiteboard/packages/whiteboard-editor/src/types/editor.ts:125`
- `EditorToolActions = ToolActions`
  - `whiteboard/packages/whiteboard-editor/src/types/editor.ts:127`
- `EditorInteractionActions = EditorInput`
  - `whiteboard/packages/whiteboard-editor/src/types/editor.ts:149`
- `MindmapNodePatch = Parameters<MindmapCommands['updateNode']>[1]`
  - `whiteboard/packages/whiteboard-editor/src/types/editor.ts:98`

判断：

- 这些导出并没有提供新的语义，只是换一个前缀。
- 它们会让 public surface 看起来很完整，但实际增加的是心智负担，不是能力。

建议落点：

- 删除纯别名导出。
- 对外 API 如果确实需要统一命名，优先在 `index.ts` 做 re-export，而不是在 `types/editor.ts` 再定义一层。
- `MindmapNodePatch` 这种基于 `Parameters<>` 的影子类型应直接删掉，调用点直接用 `MindmapUpdateNodeInput`。

### 4. Editor command facade 的类型层比实现层更重

证据：

- `DocumentCommands` 只是把 `engine.execute` 转发一遍
  - `whiteboard/packages/whiteboard-editor/src/command/document.ts:17`
  - `whiteboard/packages/whiteboard-editor/src/command/document.ts:52`
- `MindmapCommands` 的 core 部分也只是转发 `engine.execute`
  - `whiteboard/packages/whiteboard-editor/src/command/mindmap.ts:24`
- 真正有价值的只有 editor 专属便捷命令：
  - `insertByPlacement`
  - `moveByDrop`
  - `moveRoot`
  - `group.order.bringToFront` 这类 UI 语义方法

判断：

- 保留 facade 函数没有问题。
- 但不应该再手写一套完整 public type，把 engine 命令一比一复制出来。

建议落点：

- facade 保留实现。
- 对应 type 改为从 engine 命令返回类型自动派生，或者压缩成更小的 editor-specific surface。

### 5. Read 层命名冲突本身就是一种翻译层

证据：

- engine 已有 `NodeRead` / `EdgeRead` / `MindmapRead`
  - `whiteboard/packages/whiteboard-engine/src/types/instance.ts:65`
  - `whiteboard/packages/whiteboard-engine/src/types/instance.ts:116`
  - `whiteboard/packages/whiteboard-engine/src/types/instance.ts:123`
- editor 又定义了不同语义的 `NodeRead` / `EdgeRead` / `MindmapRead`
  - `whiteboard/packages/whiteboard-editor/src/query/node/read.ts:77`
  - `whiteboard/packages/whiteboard-editor/src/query/edge/read.ts:143`
  - `whiteboard/packages/whiteboard-editor/src/query/mindmap/read.ts:61`
- `RuntimeRead` 通过 `Omit<EngineRead, 'node' | 'edge' | 'index'> & { ... }` 重新拼一遍
  - `whiteboard/packages/whiteboard-editor/src/query/index.ts:94`

判断：

- editor 的 read 层是必要的，但不应该继续沿用 engine 同名类型。
- 这会让“engine read source-of-truth”和“editor presentation read”在认知上混在一起。

建议落点：

- editor 改名：
  - `NodeRead` -> `NodePresentationRead`
  - `EdgeRead` -> `EdgePresentationRead`
  - `MindmapRead` -> `MindmapPresentationRead`
- `RuntimeRead` 改为 `EditorQueryRead` 或 `EditorRuntimeRead`
- `EditorRead = RuntimeRead` 这类别名一并删除

## 三、重复可复用逻辑

### 1. `readNodeRotation` 已经重复扩散

证据：

- `core`
  - `whiteboard/packages/whiteboard-core/src/edge/connect.ts:37`
- `engine`
  - `whiteboard/packages/whiteboard-engine/src/read/store/index.ts:72`
  - `whiteboard/packages/whiteboard-engine/src/read/store/edge.ts:110`
- `editor`
  - `whiteboard/packages/whiteboard-editor/src/query/node/projection.ts:16`
  - `whiteboard/packages/whiteboard-editor/src/input/transform/start.ts:17`

全仓搜索可见该模式反复出现：

- `typeof node.rotation === 'number' ? node.rotation : 0`

判断：

- 这是最典型的“应该只有一个 helper 却被写了十多遍”的逻辑。

建议落点：

- 在 `core/node` 或 `core/types` 暴露 `readNodeRotation(node): number`。
- 所有调用点统一切过去。

### 2. `readPresentValues` 重复实现

证据：

- engine 局部实现
  - `whiteboard/packages/whiteboard-engine/src/read/store/index.ts:138`
- editor 公共 util 再实现一次
  - `whiteboard/packages/whiteboard-editor/src/query/utils.ts:16`

判断：

- 这是纯工具逻辑，完全没有 editor-specific 语义。

建议落点：

- 放入共享 util，或者直接上移到 `@shared/core`。

### 3. `EMPTY_GUIDES` / guide 归一化逻辑重复

证据：

- editor input snap
  - `whiteboard/packages/whiteboard-editor/src/input/core/snap.ts:23`
- editor local feedback selection
  - `whiteboard/packages/whiteboard-editor/src/local/feedback/selection.ts:19`

判断：

- 这类空常量如果不统一，很容易破坏引用相等优化。
- 目前 selection feedback 已经依赖 `guides === EMPTY_GUIDES` 做短路判断
  - `whiteboard/packages/whiteboard-editor/src/local/feedback/selection.ts:80`

建议落点：

- 在 editor 层集中定义一个 `EMPTY_GUIDES`。
- 所有 guide 产生方都共享同一引用。

### 4. snap 输入/输出适配层可以进一步向 core 靠拢

证据：

- editor snap runtime 又定义了 `MoveSnapInput` / `ResizeSnapInput` / `ResizeSnapResult`
  - `whiteboard/packages/whiteboard-editor/src/input/core/snap.ts:34`
  - `whiteboard/packages/whiteboard-editor/src/input/core/snap.ts:41`
  - `whiteboard/packages/whiteboard-editor/src/input/core/snap.ts:54`
- 但它内部调用的本体已经在 core：
  - `computeSnap`
  - `computeResizeSnap`
  - `resolveSnapThresholdWorld`
  - `Guide`
  - `ResizeUpdate`

判断：

- 这里不是必须删除 editor runtime，而是建议把输入/输出结构与 core 对齐，减少 editor 自己定义的新壳。
- 尤其 `ResizeSnapSource` 可以直接复用 core 的 transform snap source 结构。

### 5. Edge / Node 投影层已经出现“engine 一次、editor 再一次”的二次投影

证据：

- engine 先投影 `EdgeItem`
  - `whiteboard/packages/whiteboard-engine/src/types/projection.ts:24`
  - `whiteboard/packages/whiteboard-engine/src/read/store/edge.ts:167`
- editor 再在 `EdgeItem` 上叠加 overlay/edit session，生成新的 `EdgeView`
  - `whiteboard/packages/whiteboard-editor/src/query/edge/projection.ts:49`
  - `whiteboard/packages/whiteboard-editor/src/query/edge/read.ts:55`
- node 侧同样存在：
  - engine 输出 `NodeItem`
    - `whiteboard/packages/whiteboard-engine/src/types/projection.ts:42`
  - editor 再做 `projectNodeItem`
    - `whiteboard/packages/whiteboard-editor/src/query/node/projection.ts:55`

判断：

- 这类二次投影是合理的，但当前边界还不够清晰。
- engine 应只负责 committed/runtime projection。
- editor 应只做 overlay/session patch，不应再重新承担“基础几何解释器”的职责。

建议落点：

- 保留二次投影架构。
- 但把 editor 层的 patch/apply 函数抽成明确的 `presentation overlay` helper，避免散落在 `query/*/projection.ts` 中继续增长。

## 四、哪些类型应该继续留在 Editor，而不是下沉到 Core

以下类型明显属于 editor 的展示/交互层，不建议下沉：

- `NodeMeta`
- `NodeFamily`
- `ControlId`
- `NodeHit`
- `Tool`
- `EditorPick`
- `PointerInput` / `ContextMenuInput` / `KeyboardInput`
- `SelectionOverlay`
- `NodeToolbarContext`
- `EdgeToolbarContext`
- `EditorInteractionState`
- `DrawState`
- 各类 `feedback` / `overlay` / `presentation` 类型

原因：

- 这些类型绑定了 UI 呈现、命中策略、输入设备、编辑状态或局部 runtime。
- 它们不应污染 core 的领域模型。

需要注意的是：

- `NodeRole` 不应再与这些 editor-only 类型混在一起，它更接近领域能力标签，建议独立上移。

## 五、迁移优先级

### P0：先做，不做会继续放大重复

1. 收敛 mindmap 命令输入类型到 core 单一来源。
2. 折叠 engine 的 `EngineCommand` / `WriteCommandMap` 双层命令模型。
3. 统一 `OrderMode`。
4. 把 `NodeRole` 上移到 core。

### P1：高收益清理

1. 删除 editor 中纯别名型 `Editor*` 导出。
2. 重命名 editor query read 类型，消除与 engine 同名冲突。
3. 统一 mindmap 几何原语到 `Point` / `Size` / `Rect`。
4. 统一 `HorizontalResizeEdge` / `VerticalResizeEdge`。

### P2：优化与防漂移

1. 提取 `readNodeRotation`。
2. 提取 `readPresentValues`。
3. 统一 `EMPTY_GUIDES`。
4. 清理 projection overlay helper 的散落实现。

## 六、完整迁移 Checklist

### Phase 1：类型归属收敛

- [ ] 在 `core` 新增或整理唯一的 mindmap command input exports。
- [ ] 用 `core` 的 `MindmapCreateInput` 替换 `engine` 的 `MindmapCreateOptions`。
- [ ] 删除 `engine` 中纯别名 mindmap 输入类型，editor 直接引用 core。
- [ ] 在 `core` 新增唯一 `OrderMode`（或 `CanvasOrderMode`）。
- [ ] 在 `editor` 用 `Exclude<OrderMode, 'set'>` 等方式表达 UI 子集，不再重写字符串联合。
- [ ] 在 `core` 导出 `NodeRole`。
- [ ] 将 `editor` registry 的 `role` 字段改为复用 core 的 `NodeRole`。

### Phase 2：命令模型瘦身

- [ ] 选定 `EngineCommand` 和 `WriteInput` 的唯一公开模型。
- [ ] 删除另一套手写同构命令类型，避免并行维护。
- [ ] 收敛 `ExecuteResult`，让返回值从单一命令模型派生。
- [ ] 精简 `whiteboard-engine/src/instance/engine.ts` 中的 repackaging `switch`。

### Phase 3：registry 分层修复

- [ ] 在 `core` 抽出 `BaseNodeDefinition` 或扩展 `NodeTypeDefinition`。
- [ ] 把 `type` / `geometry` / `defaultData` / `schema` 从 editor registry 收敛到 core 基座。
- [ ] editor 仅保留 presentation / interaction 扩展字段。
- [ ] 将 `ControlId` 改为 `ShapeControlId | 'group'`。

### Phase 4：read / projection 命名修复

- [ ] `editor/query/node/read.ts` 中的 `NodeRead` 重命名为 `NodePresentationRead`。
- [ ] `editor/query/edge/read.ts` 中的 `EdgeRead` 重命名为 `EdgePresentationRead`。
- [ ] `editor/query/mindmap/read.ts` 中的 `MindmapRead` 重命名为 `MindmapPresentationRead`。
- [ ] `RuntimeRead` 重命名为 `EditorQueryRead` 或 `EditorRuntimeRead`。
- [ ] 删除 `EditorRead = RuntimeRead` 这类别名。

### Phase 5：几何类型统一

- [ ] mindmap 类型中的匿名 `{ x, y }` 全部替换为 `Point`。
- [ ] mindmap 类型中的匿名 `{ width, height }` 全部替换为 `Size`。
- [ ] mindmap 类型中的匿名 `{ x, y, width, height }` 全部替换为 `Rect`。
- [ ] `mindmap/layout.ts` 删除局部 `Size` / `LayoutNode` 重复类型。
- [ ] `MindmapView` 中的 `rootPosition` / `bbox` / `ghost` / line 结构改为命名类型或复用 core。

### Phase 6：重复 helper 收口

- [ ] 在 `core` 提供 `readNodeRotation(node)`。
- [ ] 替换 engine/editor 里所有 `typeof node.rotation === 'number' ? node.rotation : 0`。
- [ ] 把 `readPresentValues` 收敛到共享 util。
- [ ] 统一 editor 层的 `EMPTY_GUIDES` 常量来源。
- [ ] 评估是否把 `ResizeSnapSource` 改为复用 core 结构。

### Phase 7：回归验证

- [ ] `pnpm --dir whiteboard lint`
- [ ] `pnpm --dir whiteboard test`
- [ ] 验证 `apps/whiteboard` demo 的以下行为未回归：
  - 选择框与单节点变换
  - edge route 编辑
  - frame/selection affordance
  - clipboard / duplicate / order
  - mindmap insert / move / drag-drop / root move

## 七、建议的最终边界

### Core 应拥有

- 领域模型
- 操作类型
- 几何基础类型
- selection / transform / snap 的基础类型
- mindmap command input 与布局类型
- registry 的共享基座
- order / role 等领域枚举

### Engine 应拥有

- 读模型缓存
- 索引
- projection item
- commit / history / result
- writer draft / translate 内部类型

### Editor 应拥有

- 输入事件
- 工具状态
- pick
- overlay / feedback
- toolbar / panel / selection presentation
- editor-specific registry 扩展

## 总结

当前 whiteboard 最大的可维护性问题不是算法实现本身，而是“同一语义被 core、engine、editor 各自重复定义”。  
本次审计里，最值得立刻清理的是：

1. mindmap 输入类型的三层漂移
2. engine 命令模型的双轨并存
3. editor 大量纯别名 `Editor*` 类型
4. 几何基础类型在 mindmap 中的匿名扩散

先完成这些，再做 helper 抽取和 read 命名整理，迁移成本最低，收益也最大。
