# 目标
- 将 `query` 与 `readApi` 的实现代码直接内联进 `read/kernel.ts`。
- 删除无必要的中间层文件，缩短链路与依赖。

# 背景
`query` 与 `readApi` 仅在 `createReadKernel` 内被使用，抽到独立文件没有复用价值。
内联可以降低跳转与维护成本，符合“拉直链路”目标。

# 方案
- 在 `createReadKernel` 中直接构造 `Query` 与 `EngineRead`。
- 删除 `runtime/read/api/query.ts` 与 `runtime/read/api/read.ts`。

# 影响范围
- `read/kernel.ts` 内部结构调整。
- 删除仅内部使用的 read api 文件。

# 风险与验证
- 风险：低，仅代码位置变化。
- 验证：`pnpm -r lint`、`pnpm -r build`。
