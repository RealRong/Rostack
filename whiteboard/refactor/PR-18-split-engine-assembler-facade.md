# PR-18 设计文档：engine.ts 拆分 assembler/facade

## 背景

`instance/engine.ts` 目前承担了过多实现细节（命令装配、runtime 端口策略、实例拼装），可读性和演进性都受限。

## 目标

1. 抽离命令门面构建逻辑到 `instance/facade/commands.ts`。
2. 抽离 runtime 端口逻辑到 `instance/facade/runtimePort.ts`。
3. `engine.ts` 以组合和 wiring 为主。

## 设计原则

1. 单文件职责单一。
2. 保持现有 API 与行为不变。
3. 先拆装配，不做语义重写。

## 文件落点

1. `packages/whiteboard-engine/src/instance/facade/commands.ts`（新增）
2. `packages/whiteboard-engine/src/instance/facade/runtimePort.ts`（新增）
3. `packages/whiteboard-engine/src/instance/engine.ts`

## 非目标

1. 不改变命令语义。
2. 不调整 read/write runtime 生命周期。

## 验收标准

1. `engine.ts` 行数和职责下降。
2. facade 文件可独立复用与测试。
3. 行为保持一致。

## 回滚方案

1. 将 facade 逻辑内联回 `engine.ts`。
