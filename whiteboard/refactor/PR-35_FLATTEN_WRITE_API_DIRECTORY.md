# PR-35: Flatten Write API Directory（移除 api/commands 嵌套）

## 目标

把 `runtime/write/api/commands/*` 扁平化到 `runtime/write/api/*`，并删除 `runtime/write/api.ts` 兼容层，降低目录嵌套深度。

## 现状问题

1. 存在两层 API 目录（`api.ts` + `api/commands/*`），路径冗余。
2. `runtime.ts` 需从 `./api/commands` 导入，不够直观。
3. 目录意图已经明确为 API 层，不需要再套一层 `commands`。

## 设计

1. 将 `api/commands/*.ts` 全部移动到 `api/*.ts`。
2. 新建 `api/index.ts` 作为 API 汇总导出。
3. 删除 `runtime/write/api.ts`。
4. `runtime.ts` 改为从 `./api` 导入命令构造函数。
5. 修正所有相对路径 import。

## 约束

1. 不改命令签名与行为。
2. 不改写链路时序。
3. 保持 `write/index.ts` 对外导出兼容。

## 验证

1. `pnpm -r lint`
2. `pnpm -r build`
3. 检查不再存在 `api/commands` 与 `runtime/write/api.ts`。
