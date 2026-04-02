# PR-43: 移除 PlanInput 桥接，planner 直接接收 WriteInput

## 目标

进一步拉直 write 主链路，去掉 `execution.ts` 中的 `toPlanInput` 类型桥接与强转。

1. planner 直接接收 `WriteInput`。
2. 删除 `PlanInput` 类型与 `toPlanInput` 适配函数。
3. 保持行为不变，仅收敛类型桥接层。

## 现状问题

1. `execution.ts` 里存在 `toPlanInput(payload as PlanInput)` 样板。
2. `PlanInput` 与 `WriteInput` 在 domain/command 语义上重复。
3. 该桥接不提供业务能力，只增加类型噪音。

## 设计

### A. 类型收敛

1. `stages/plan/draft.ts` 删除 `PlanInput`。
2. 保留 `Apply` 与 `Draft` 作为 write 执行核心类型。

### B. 路由收敛

1. `stages/plan/router.ts` 入参改为 `WriteInput`。
2. 按 `payload.domain` 分派不变。

### C. 执行收敛

1. `execution.ts` 删除 `toPlanInput`。
2. `apply` 直接调用 `planner(payload)`。

## 约束

1. 不改变写事务行为。
2. 不改变 gateway 协议。
3. 不改变命令语义与 read invalidation。

## 验证

1. `pnpm -r lint`
2. `pnpm -r build`
3. 手工检查：
   1. 代码中无 `PlanInput` 与 `toPlanInput`。
   2. write 主链路仍是 `applyWrite -> gateway -> planner -> writer`。
