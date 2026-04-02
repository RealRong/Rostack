# 目标
- 从 `createReadKernel` 中移除 `readDoc` 依赖。
- 在 kernel 内部直接基于 `runtimeStore + stateAtoms.document` 构造 doc getter。

# 背景
`readDoc` 只是对 `runtimeStore.get(stateAtoms.document)` 的透传包装，参数冗余。

# 方案
- `ReadDeps` 删除 `readDoc`。
- `createReadKernel` 内部直接定义 `const readDoc = () => runtimeStore.get(stateAtoms.document)`。
- engine 侧调用移除 `readDoc` 传参。

# 风险与验证
- 风险：低，仅参数收敛。
- 验证：`pnpm -r lint`、`pnpm -r build`。
