# Whiteboard Core / Engine / Editor 当前代码审计与迁移清单

## 审计范围

- `whiteboard/packages/whiteboard-core`
- `whiteboard/packages/whiteboard-engine`
- `whiteboard/packages/whiteboard-editor`

本次审计基于当前代码状态重新扫描，不沿用旧的历史结论。重点回答 4 个问题：

1. `core`、`engine`、`editor` 之间还剩哪些重复类型定义。
2. 哪些类型应该继续收敛为 `core` 单一来源。
3. 哪些类型或字段已经退化成不必要的中间翻译层。
4. 哪些重复逻辑还可以继续抽成复用能力。

## 总结

当前这三层最重的重复建模问题已经基本收敛完毕：

- `mindmap` 命令输入类型已经由 `core` 提供单一来源，`engine` 不再维护第二套 `types/mindmap.ts`。
- `engine` 的旧 `WriteCommandMap / WriteInput / WriteOutput` 并行命令模型已经删除，写入层统一使用单一 `EngineCommand`。
- `NodeRole`、`OrderMode`、`BaseNodeDefinition`、`ShapeControlId` 等共享领域/基础类型已经收回到 `core`。
- `editor` 的查询读模型已经改名为展示态语义名：
  - `EditorQueryRead`
  - `NodePresentationRead`
  - `EdgePresentationRead`
  - `MindmapPresentationRead`
- 纯中间别名如 `EditorRead`、`EditorStore`、`EditorClipboardTarget`、`EditorClipboardOptions`、`MindmapNodePatch` 已删除。
- 重复逻辑 `readNodeRotation`、`presentValues`、`EMPTY_GUIDES` 已基本完成单点收敛。

结论：

- 目前已经不存在之前那种“同一领域语义在三层各维护一份”的大块重复模型。
- 剩余问题主要集中在 `editor` 内部的小型展示态包装和少量局部 helper。
- 后续迁移已经不再是“重构命令/类型体系”，而是“消灭残余中间层、统一展示态几何命名、进一步压缩局部重复逻辑”。

## 已完成收敛项

### 1. 已完成的 Core 单一来源类型

- `NodeRole`
  - 来源：`whiteboard/packages/whiteboard-core/src/types/model.ts`
  - `editor` 已直接复用。
- `OrderMode`
  - 来源：`whiteboard/packages/whiteboard-core/src/types/model.ts`
  - `engine` 与 `editor` 已直接复用。
- `MindmapCreateInput`
- `MindmapInsertInput`
- `MindmapMoveSubtreeInput`
- `MindmapRemoveSubtreeInput`
- `MindmapCloneSubtreeInput`
- `MindmapUpdateNodeInput`
  - 来源：`whiteboard/packages/whiteboard-core/src/types/model.ts`
  - 来源：`whiteboard/packages/whiteboard-core/src/mindmap/types.ts`
  - `engine` 与 `editor` 已直接复用。
- `BaseNodeDefinition`
  - 来源：`whiteboard/packages/whiteboard-core/src/types/registry.ts`
  - `editor` 的 `NodeDefinition` 已改为在此基础上扩展展示/交互字段。
- `ShapeControlId`
  - 来源：`whiteboard/packages/whiteboard-core/src/node/shape.ts`
  - `editor` 的 `ControlId` 已改为 `ShapeControlId | 'group'`。

### 2. 已删除的不必要中间翻译层

- `whiteboard/packages/whiteboard-engine/src/types/mindmap.ts`
  - 已删除。
  - 原先这一层只是把 `core` 的 `mindmap` 输入重新包装成 engine 版本，当前已无必要。
- `engine` 内部旧写入命令模型
  - `WriteCommandMap`
  - `WriteInput`
  - `WriteOutput`
  - 对应平行的 document/node/edge/group/mindmap write command 家族
  - 当前已删除，仅保留 `Draft` / `Writer` 运行时概念。
- `editor` 中已删除的纯别名层
  - `EditorRead`
  - `EditorStore`
  - `EditorClipboardTarget`
  - `EditorClipboardOptions`
  - `MindmapNodePatch`

### 3. 已收敛的重复逻辑

- `readNodeRotation`
  - 单一来源：`whiteboard/packages/whiteboard-core/src/node/geometry.ts`
  - `core` / `engine` / `editor` 主要消费方已切到统一实现。
- `presentValues`
  - 单一来源：`shared/core/src/collection.ts`
  - `engine` 与 `editor` 已复用。
- `EMPTY_GUIDES`
  - 单一来源：`whiteboard/packages/whiteboard-editor/src/local/feedback/selection.ts`
  - `editor/input/core/snap.ts` 已改为复用，不再重复声明。

## 当前仍然存在的问题

下面这些问题，是本轮审计确认还存在、且值得继续收敛的项。

### A. `MindmapPresentationRead.snapshot` 是纯别名中间层

证据：

- `whiteboard/packages/whiteboard-editor/src/query/mindmap/read.ts`
  - `snapshot: EngineRead['mindmap']['item']`
  - 返回时直接赋值 `snapshot: read.item`
- 调用方：
  - `whiteboard/packages/whiteboard-editor/src/input/mindmap/drag/start.ts`

判断：

- 这不是新的语义层，只是把 `read.item` 改了一个名字再暴露一次。
- 它没有提供额外约束、额外缓存、额外投影，也没有消除任何实现细节。
- 这是当前最明确的一处“纯中间翻译字段”。

建议：

- 删除 `MindmapPresentationRead['snapshot']`。
- 调用方统一改读 `mindmap.item`。

优先级：高

### B. `editor` 的 `MindmapView` 仍在重复内联几何对象结构

证据：

- `whiteboard/packages/whiteboard-editor/src/query/mindmap/read.ts`
  - `rootPosition: { x; y }`
  - `bbox: { width; height }`
  - `ghost: { width; height; x; y }`
  - `connectionLine: { x1; y1; x2; y2 }`
  - `insertLine: { x1; y1; x2; y2 }`

而 `core` 已经有：

- `Point`
- `Rect`
- `MindmapConnectionLine`

判断：

- 这里已经不是跨层重复定义第二套命令模型，但仍然是重复的几何 shape。
- 这种匿名对象会让等值判断、序列化、跨模块传递变得更脆弱。
- `MindmapView` 仍然是当前 `editor` 中最明显的“结构匿名化扩散点”。

建议：

- `rootPosition` 直接使用 `Point`
- `ghost` 直接使用 `Rect`
- `connectionLine` / `insertLine` 直接使用 `MindmapConnectionLine` 或共享 `MindmapLine`
- `bbox` 至少抽成命名类型；如果语义允许，直接统一为 `Rect`

优先级：高

### C. `editor/input/edge/connect/start.ts` 还保留了一个局部 `readNodeRotation` 包装

证据：

- `whiteboard/packages/whiteboard-editor/src/input/edge/connect/start.ts`

当前实现：

- `const readNodeRotation = (entry: ConnectNodeEntry) => entry.node.rotation ?? 0`

判断：

- 这已经不是跨模块大量复制，但本质仍是对 `core.readNodeRotation(entry.node)` 的局部重写。
- 逻辑很小，但属于典型的“迁移后残留 wrapper”。
- 继续保留这种 wrapper，长期会让团队误以为这层有特殊规则。

建议：

- 直接复用 `@whiteboard/core/node` 的 `readNodeRotation`
- 在使用处传 `entry.node`

优先级：中

### D. `MindmapView` 与 `MindmapNodeView` 仍是 editor 自有展示类型，尚未形成共享展示契约

证据：

- `whiteboard/packages/whiteboard-editor/src/query/mindmap/read.ts`
  - `MindmapNodeView`
  - `MindmapView`

判断：

- 这不是错误。
- 但它说明 `mindmap` 的展示态结构目前仍由 `editor` 自己局部决定，没有抽成更稳定的 presentation contract。
- 如果未来 `react`、其他 renderer、或协作 overlay 继续消费 mindmap 展示态，这里会再次演化出第二份 view model。

建议：

- 先不急着上移到 `core`
- 但建议在 `editor` 内部先把 `MindmapView` 拆成更稳定的命名子类型：
  - `MindmapNodeView`
  - `MindmapGhostView`
  - `MindmapLineView`
  - `MindmapViewportView` 或类似命名
- 避免把匿名对象嵌在单个大类型里继续膨胀

优先级：中

## 当前不建议再动的部分

这些类型虽然看起来像“包装层”，但当前不属于无价值中间层，不建议为了收敛而继续折腾。

### 1. `engine` 中的命令辅助类型

文件：

- `whiteboard/packages/whiteboard-engine/src/types/command.ts`

包括：

- `DocumentCommand`
- `NodeCommand`
- `GroupCommand`
- `EdgeCommand`
- `MindmapCommand`
- `TranslateCommand`
- `CommandOutput`

判断：

- 这组类型当前只是对单一 `EngineCommand` 做 `Extract` 和输出映射。
- 它们不再构成第二套运行时命令模型。
- 当前主要价值是给 translate/plan 层提供类型收窄和输出推断。

结论：

- 保留。
- 不属于“应删除的中间翻译层”。

### 2. `editor` 的 `NodeDefinition`

文件：

- `whiteboard/packages/whiteboard-editor/src/types/node/registry.ts`

判断：

- 当前已经正确地改成 `BaseNodeDefinition & editor-specific fields`
- 其中 `meta` / `describe` / `hit` / `connect` / `canRotate` / `canResize` / `edit.fields` 明显属于 editor 展示和交互层
- 不应继续上移到 `core`

结论：

- 保留当前结构。
- 这属于“合理分层”，不是重复定义问题。

### 3. `EditorQueryRead`

文件：

- `whiteboard/packages/whiteboard-editor/src/query/index.ts`

判断：

- 它不是旧式纯别名。
- 它是在 `EngineRead` 基础上组合出 `editor` 所需的本地反馈态、工具态、viewport 态、selection presentation 态。
- 这是 editor 自己的真实运行时读模型。

结论：

- 保留。

## 迁移清单

下面是基于当前代码状态得到的完整迁移清单。由于大块重复模型已经完成收敛，当前 checklist 主要由 3 个阶段组成。

### 阶段 1：删除纯别名中间层

- [ ] 删除 `whiteboard/packages/whiteboard-editor/src/query/mindmap/read.ts` 中的 `snapshot`
- [ ] 将 `whiteboard/packages/whiteboard-editor/src/input/mindmap/drag/start.ts` 全部改为直接读取 `mindmap.item`
- [ ] 重新跑 `whiteboard-editor`、`whiteboard-react`、`apps/whiteboard` 的类型检查

阶段目标：

- mindmap 展示读模型不再保留纯别名字段

### 阶段 2：统一 mindmap 展示态几何类型

- [ ] 在 `editor` 内为 `MindmapView` 中的匿名几何对象建立命名类型，优先复用 `core` 的 `Point` / `Rect` / `MindmapConnectionLine`
- [ ] 将 `rootPosition` 改成 `Point`
- [ ] 将 `ghost` 改成 `Rect`
- [ ] 将 `connectionLine` / `insertLine` 改成 `MindmapConnectionLine` 或共享 line 类型
- [ ] 将 `bbox` 从匿名 `{ width; height }` 改成更稳定的命名类型
- [ ] 更新 `isMindmapViewEqual` 和所有相关调用点

阶段目标：

- mindmap 展示态不再继续散落匿名几何 shape

### 阶段 3：清理残余局部 helper

- [ ] 删除 `whiteboard/packages/whiteboard-editor/src/input/edge/connect/start.ts` 中的本地 `readNodeRotation`
- [ ] 改为直接复用 `@whiteboard/core/node` 的 `readNodeRotation`
- [ ] 再次扫描 `core` / `engine` / `editor` 中是否还存在局部 rotation fallback wrapper

阶段目标：

- `rotation` 读取逻辑彻底只保留一个来源

## 验证建议

完成上面 3 个阶段后，至少执行以下校验：

- `pnpm --dir whiteboard lint`
- `pnpm --dir whiteboard test`
- `pnpm exec tsc --noEmit -p whiteboard/packages/whiteboard-core/tsconfig.json`
- `pnpm exec tsc --noEmit -p whiteboard/packages/whiteboard-engine/tsconfig.json`
- `pnpm exec tsc --noEmit -p whiteboard/packages/whiteboard-editor/tsconfig.json`
- `pnpm exec tsc --noEmit -p whiteboard/packages/whiteboard-react/tsconfig.json`
- `pnpm exec tsc --noEmit -p apps/whiteboard/tsconfig.json`

## 本轮审计结论

如果只看 `core` / `engine` / `editor` 三层当前代码：

- 大型重复类型族已经基本消失。
- 当前剩余问题不再是“领域模型双轨维护”，而是“editor 展示层少量匿名结构与纯别名残留”。
- 后续最值得继续做的，不是再重构命令体系，而是把 `mindmap` 展示态结构和少量局部 helper 再压平一轮。
