# PR-19 设计文档：Viewport API 读写拆分

## 背景

当前 `ViewportApi` 读写能力混在一个接口里，read 侧可以获得写能力，边界不清晰。

## 目标

1. 拆分为 `ViewportReadApi` 与 `ViewportWriteApi`。
2. read 相关依赖只使用读接口。
3. 保持运行时实现不变。

## 文件落点

1. `packages/whiteboard-engine/src/types/viewport/api.ts`
2. `packages/whiteboard-engine/src/types/read/deps.ts`
3. `packages/whiteboard-engine/src/runtime/Viewport.ts`

## 非目标

1. 不改 viewport 行为和计算逻辑。
2. 不改上层命令语义。

## 验收标准

1. 类型层明确读写边界。
2. read deps 不再依赖写接口。
3. 编译通过。

## 回滚方案

1. 恢复单一 `ViewportApi`。
