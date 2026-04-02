# 目标
- 将 `config` 从 `read.state` 中拆出，独立为 `read.config`。
- 保持 state 只包含可变状态，语义更纯。

# 背景
`config` 是稳定配置，不是状态。
放在 `read.state` 会混淆语义，且不参与订阅。

# 方案
- `EngineRead` 增加 `config: InstanceConfig`。
- `EngineReadState` 删除 `config`。
- `read/kernel.ts` 构造 `read.config = readContext.config`。
- 调用方从 `instance.read.state.config` 改为 `instance.read.config`。

# 风险与验证
- 风险：调用点遗漏导致类型错误。
- 验证：`pnpm -r lint`、`pnpm -r build`。
