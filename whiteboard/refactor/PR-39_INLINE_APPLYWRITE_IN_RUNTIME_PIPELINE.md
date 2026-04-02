# PR-39: applyWrite 内联到 Runtime Pipeline，移除 api/write 层

## 目标

继续拉直 write 链路，把 `applyWrite` 的网关封装从 `runtime/write/api/write.ts` 内联到 `runtime/write/runtime.ts`，减少一层文件跳转与装配分散。

1. `applyWrite` 归属 `runtime` pipeline，本地可读可追踪。
2. `runtime/write/api` 仅保留语义命令（`node/edge/viewport/mindmap/selection/interaction/shortcut`）。
3. 不改变行为与协议：仍通过 `CommandGateway.dispatch('write.apply')` 进入唯一写漏斗。

## 现状问题

1. `applyWrite` 不是语义命令，但放在 `api/` 目录，和语义命令并列，认知边界不清。
2. 运行时链路跨文件来回跳（`runtime.ts -> api/write.ts -> gateway`），影响主链路可读性。
3. 前一轮已把 `applyWrite` 上提到 `WriteRuntime` 顶层，再保留 `api/write` 的收益很低。

## 设计

### A. 内联封装

1. 在 `runtime/write/runtime.ts` 新增本地 helper（例如 `createGatewayWriteApply`）。
2. helper 负责：
   1. 生成 command id。
   2. 构造 `write.apply` envelope（含 trace/source/meta）。
   3. 调用 gateway dispatch。
   4. 统一返回 `DispatchResult`。

### B. API 目录收敛

1. 删除 `runtime/write/api/write.ts`。
2. `runtime/write/api/index.ts` 移除 `applyWrite` 导出。

### C. 文档同步

1. `ENGINE_CURRENT_CHAIN_FLOW.md` 更新：
   1. `applyWrite` 在 `runtime.ts` 内联创建。
   2. `api/*` 仅表示语义命令层。

## 约束

1. 不改变外部 API。
2. 不改变 write/read/history 行为。
3. 不改变 gateway 协议。

## 验证

1. `pnpm -r lint`
2. `pnpm -r build`
3. 手工检查：
   1. 无 `runtime/write/api/write.ts`。
   2. `writeRuntime.applyWrite` 仍可被 reactions 使用。
   3. `ENGINE_CURRENT_CHAIN_FLOW.md` 与实现一致。
