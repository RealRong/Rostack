# PR-60 清理 legacy CQRS 类型导出

## 背景

当前 engine 运行时已不再使用 legacy `CommandGateway / ProjectionRuntime / ReadFacade` 链路，但 `src/index.ts` 仍对外导出 `types/cqrs`，造成心智噪音。

## 目标

1. 对外导出与真实运行时保持一致。
2. 删除仓内未使用的 CQRS 类型文件。

## 方案

1. 从 `packages/whiteboard-engine/src/index.ts` 移除 `./types/cqrs` 相关导出。
2. 删除 `packages/whiteboard-engine/src/types/cqrs/*` 文件。

## 风险

中等（类型层 breaking），但仓内无引用。

## 验证

1. `pnpm -r lint`
2. `pnpm -r build`
