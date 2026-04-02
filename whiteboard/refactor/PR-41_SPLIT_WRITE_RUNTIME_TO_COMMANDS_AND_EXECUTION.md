# PR-41: 拆分 write runtime 为 commands + execution，runtime.ts 纯组装

## 目标

把 `runtime/write/runtime.ts` 从“组装 + 执行细节 + 命令装配”混合体，收敛为纯组装层。

1. `execution.ts` 承载写执行主链（planner + writer + gateway + applyWrite）。
2. `commands.ts` 承载语义命令组装（node/edge/viewport/... + selection/shortcut）。
3. `runtime.ts` 只做 compose，不再直接承载 stage 细节。

## 现状问题

1. `runtime.ts` 同时包含 gateway 封装、pipeline 创建、命令 builder 注册等多个职责。
2. stage 细节与装配逻辑耦合，阅读路径长，定位成本高。
3. 命令组装与执行组装耦在一个文件中，不符合漏斗式分层。

## 设计

### A. execution 模块

新增 `runtime/write/execution.ts`：

1. 导出 `createWriteExecution(deps)`。
2. 返回内容：
   1. `gateway`
   2. `applyWrite`
   3. `history`
   4. `resetDoc`
   5. `changeBus`
   6. `apply`（供命令层注入）

### B. commands 模块

新增 `runtime/write/commands.ts`：

1. 导出 `createWriteCommands({ instance, apply, history })`。
2. 直接组装语义命令，不再保留 builder 注册表中间层。

### C. runtime 纯组装

`runtime/write/runtime.ts` 仅做：

1. 调用 `createWriteExecution`。
2. 调用 `createWriteCommands`。
3. 返回 `WriteRuntime`。

## 约束

1. 不改变写链路行为与协议。
2. 不新增写路径。
3. 不改变对外 runtime 结构。

## 验证

1. `pnpm -r lint`
2. `pnpm -r build`
3. 手工检查：
   1. `runtime.ts` 不再直接 import `stages/*`。
   2. `createWriteExecution` 与 `createWriteCommands` 职责清晰。
   3. `ENGINE_CURRENT_CHAIN_FLOW.md` 与代码一致。
