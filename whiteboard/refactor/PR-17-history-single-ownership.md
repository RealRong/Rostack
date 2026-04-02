# PR-17 设计文档：history 所有权收口（engine 主栈）

## 背景

当前存在 engine history 与 core history 两套能力。虽然 kernel reduce 路径主要使用 engine history，但 core history 在内核实例中仍默认启用，职责边界不够明确。

## 目标

1. 在 kernel 路径显式关闭 core history。
2. 明确 engine write history 为唯一主历史系统。
3. 保留 core history 供 core 独立模式使用（不删除能力）。

## 文件落点

1. `packages/whiteboard-core/src/kernel/internal.ts`

## 实施方式

1. kernel 创建/复用 core 实例后立即 `history.configure({ enabled: false })`。
2. 不影响 `createCore` 直接使用场景。

## 验收标准

1. kernel 路径 core history 不再捕获。
2. undo/redo 主路径仍由 engine history 管理。

## 回滚方案

1. 删除 kernel 层的 history disable 配置。
