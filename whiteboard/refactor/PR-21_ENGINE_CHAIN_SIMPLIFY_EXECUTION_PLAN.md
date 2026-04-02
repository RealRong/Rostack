# PR-21: Engine Chain Simplify（不改业务功能）

## 目标

在不改变外部业务行为的前提下，继续收敛 engine 执行链路，减少中间层和兼容分支。

## 本次收敛范围

1. 读侧只保留单路径：`Change -> ReadInvalidation -> Index/EdgeProjection`。
2. 移除 `read planner` 中间层（`runtime/read/planner.ts`），将执行计划映射收口到 `read kernel`。
3. 移除 `applyChange` 兼容入口，统一使用 `applyInvalidation`。
4. 移除 `runtime/read/orchestrator.ts` 透传层，直接使用 `createReadKernel`。
5. 写入口去掉 gateway mixed-version fallback（不再二次回落到 `apply(payload)` 旁路）。
6. 清理无实际行为意义的 feature flags，仅保留仍参与行为分支的 flag。

## 保持不变的行为

1. 所有写命令仍经过 `write.apply` 统一入口。
2. `CommandGateway` 仍保留并作为默认写执行入口。
3. `Writer -> Core Reduce -> ChangeBus` 的语义与数据结构保持一致。
4. `ReadInvalidation` 语义保持兼容（字段命名不变），仅减少中间转换层。
5. Measure/Autofit 继续走 system write 命令，不引入旁路 mutate。

## 风险与控制

1. 风险：删除 `applyChange` 可能影响隐藏调用方。  
   控制：全仓 `rg` 搜索调用点并统一替换。
2. 风险：去除 write fallback 可能暴露 gateway 协议异常。  
   控制：协议异常返回明确 `invalid` 错误而非重复执行。
3. 风险：feature flags 精简可能影响自定义配置。  
   控制：仅删除当前仓内未消费的 flags，保留 `commandGatewayEnabled`。

## 验证

1. `pnpm -r lint`
2. `pnpm -r build`
3. 关键手动检查：
   1. `instance.commands.write.apply` 正常执行
   2. 写入后 read 侧索引/边投影同步更新
   3. history undo/redo 仍贯通写读链路

