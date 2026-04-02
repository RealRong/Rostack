# PR-09 设计文档：read kernel 新增 applyInvalidation

## 背景

read kernel 当前只接收 `Change`，读侧无法独立于写侧契约演进。为了平滑迁移到 CQRS，需要先让 kernel 支持失效协议入口。

## 目标

1. 在 read runtime 暴露 `applyInvalidation`。
2. 旧 `applyChange` 不移除，内部改为 `Change -> ReadInvalidation -> applyInvalidation`。
3. 保持读侧行为一致。

## 设计原则

1. 先加新入口，再迁移调用方。
2. 旧接口保留以降低迁移风险。
3. 显式桥接，避免隐式耦合。

## 文件落点

1. `packages/whiteboard-engine/src/runtime/read/kernel.ts`
2. `packages/whiteboard-engine/src/runtime/read/orchestrator.ts`
3. `packages/whiteboard-engine/src/runtime/read/planner.ts`

## 非目标

1. 本 PR 不删除 `applyChange`。
2. 本 PR 不清理所有 `write/impact` 依赖（下一 PR 完成）。

## 验收标准

1. read kernel 同时支持 `applyChange` 和 `applyInvalidation`。
2. 现有订阅链路无需改动即可工作。

## 回滚方案

1. 删除 `applyInvalidation` 入口并恢复旧逻辑。
