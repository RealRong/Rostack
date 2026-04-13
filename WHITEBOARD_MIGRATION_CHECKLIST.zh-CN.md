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

- 在 `core` / `engine` / `editor` 的审计范围内，本轮已经没有明确的“必须继续迁移”的重复类型族或中间翻译层。
- 当前剩余的类型包装都属于合理的分层表达，而不是历史遗留的双轨模型。

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

当前迁移清单已经全部完成。

已完成项：

- [x] 删除 `MindmapPresentationRead.snapshot` 纯别名中间层
- [x] 将 mindmap 拖拽调用点改为直接读取 `mindmap.item`
- [x] 统一 `MindmapView` 的几何类型到共享 `Point` / `Rect` / `MindmapLine`
- [x] 删除 `editor/input/edge/connect/start.ts` 中本地 `readNodeRotation`
- [x] 统一 `react` 层 mindmap 展示类型，避免再次复制匿名几何结构
- [x] 重新通过 `editor` / `react` / `apps/whiteboard` 类型检查
- [x] 重新通过整套 `whiteboard` lint / test

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
- 历史遗留的中间翻译层已经清理完毕。
- 当前代码已经进入“可维护的单一来源状态”，后续如果继续优化，优先级应放在新功能抽象，而不是继续做类型体系去重。
