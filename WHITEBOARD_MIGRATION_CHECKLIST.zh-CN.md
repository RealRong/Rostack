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
- 但重新白板式复扫后，仍然能定位到 2 处审计范围内的微型重复，以及 1 处紧邻 `react` 层的一致性缺口。
- 后续迁移已经不再是“重构命令/类型体系”，而是“收掉残余局部重复定义，彻底完成最后一轮收敛”。

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

## 本轮最终收敛结果

本轮已经把上一个审计版本里剩余的 3 个收尾项全部落地：

- `MindmapPresentationRead.snapshot`
  - 已删除。
  - `mindmap` 拖拽流程现在直接读取 `mindmap.item`，不再保留纯别名中间层。
- `editor` 的 `MindmapView`
  - 已统一复用共享几何类型：
    - `rootPosition -> Point`
    - `bbox -> Rect`
    - `ghost -> Rect`
    - `connectionLine -> MindmapLine`
    - `insertLine -> MindmapLine`
- `editor/input/edge/connect/start.ts`
  - 本地 `readNodeRotation` wrapper 已删除。
  - 已直接复用 `@whiteboard/core/node` 的 `readNodeRotation`。

额外完成的外层收敛：

- `whiteboard-react/src/types/mindmap.ts`
  - mindmap 展示类型也已同步改为复用共享几何类型，避免在 `react` 层再次复制一份匿名结构。

当前结论：

- 在 `core` / `engine` / `editor` 的审计范围内，历史上的大型重复类型族和中间翻译层已经清理完毕。
- 但仍有少量“局部重复定义”没有收干净，规模不大，却应该纳入最终收尾清单。
- 当前大部分剩余包装类型仍然属于合理分层表达，而不是历史遗留的双轨模型。

## 本轮新增发现

### 1. `engine` 节点索引的重建状态重复定义

文件：

- `whiteboard/packages/whiteboard-engine/src/read/indexes/snap.ts`
- `whiteboard/packages/whiteboard-engine/src/read/indexes/nodeRect.ts`

重复点：

- 两个文件都定义了同一套 `Rebuild = 'none' | 'dirty' | 'full'`
- 两个文件都复制了同样的 `resolveRebuild(impact: KernelReadImpact)` 逻辑

判断：

- 这不是 `core` 领域类型，不应该上移到 `core`
- 但它已经形成 `engine` 内部的局部重复 helper，应该抽到 `engine/read/indexes` 的共享内部工具中

结论：

- 应继续收敛
- 目标是 `engine` 内部单一来源，而不是再造新的跨层类型

### 2. `editor` 文本变换模式重复定义

文件：

- `whiteboard/packages/whiteboard-editor/src/input/transform/session.ts`
- `whiteboard/packages/whiteboard-editor/src/input/transform/text.ts`

重复点：

- 两个文件都定义了 `TextTransformMode = 'reflow' | 'scale'`

判断：

- 这是 `editor` 输入交互层自己的局部语义，不应上移到 `core`
- 当前重复定义没有带来行为分叉，但属于可以直接消掉的重复类型

结论：

- 应继续收敛
- 建议只保留一处导出，另一个文件直接复用

### 3. `editor` / `react` 文本字段类型仍有一层重复

文件：

- `whiteboard/packages/whiteboard-editor/src/local/session/edit.ts`
- `whiteboard/packages/whiteboard-react/src/features/node/dom/textSourceRegistry.ts`
- `whiteboard/packages/whiteboard-react/src/features/node/registry/default/shared.tsx`

重复点：

- `editor` 已有 `EditField = 'text' | 'title'`
- `react` 里仍然保留本地 `TextField = 'text' | 'title'`
- `createTextField` 也仍然直接写 `'title' | 'text'`

判断：

- 这不是 `core` 类型
- 但它已经属于不必要的相邻层重复，应该直接复用 `editor` 已存在的 `EditField`

结论：

- 这项不属于本次主审计范围的核心阻塞项
- 但如果目标是“最后的收敛”，应一并纳入清理

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

已完成项：

- [x] 删除 `MindmapPresentationRead.snapshot` 纯别名中间层
- [x] 将 mindmap 拖拽调用点改为直接读取 `mindmap.item`
- [x] 统一 `MindmapView` 的几何类型到共享 `Point` / `Rect` / `MindmapLine`
- [x] 删除 `editor/input/edge/connect/start.ts` 中本地 `readNodeRotation`
- [x] 统一 `react` 层 mindmap 展示类型，避免再次复制匿名几何结构
- [x] 重新通过 `editor` / `react` / `apps/whiteboard` 类型检查
- [x] 重新通过整套 `whiteboard` lint / test

剩余必做项：

- [ ] 提取 `whiteboard/packages/whiteboard-engine/src/read/indexes/snap.ts` 与 `whiteboard/packages/whiteboard-engine/src/read/indexes/nodeRect.ts` 共用的 `Rebuild` / `resolveRebuild`
- [ ] 删除 `whiteboard/packages/whiteboard-editor/src/input/transform/session.ts` 与 `whiteboard/packages/whiteboard-editor/src/input/transform/text.ts` 中重复的 `TextTransformMode` 定义，统一为单一来源

相邻包一致性项：

- [ ] 将 `whiteboard/packages/whiteboard-react/src/features/node/dom/textSourceRegistry.ts` 的 `TextField` 改为直接复用 `editor` 的 `EditField`
- [ ] 将 `whiteboard/packages/whiteboard-react/src/features/node/registry/default/shared.tsx` 的 `createTextField(path: 'title' | 'text')` 改为复用同一个 `EditField`

## 验证建议

本轮收敛完成后，已执行以下校验：

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
- 历史遗留的中间翻译层已经基本清理完毕。
- 但最后一轮复扫仍能确认 2 处应继续收掉的微型重复：
  - `engine` 索引内部的 `Rebuild` / `resolveRebuild`
  - `editor` 文本变换的 `TextTransformMode`
- 如果把紧邻消费层也算进“whiteboard 最后收敛”，还应顺手统一 `react` 对 `EditField` 的重复声明。
