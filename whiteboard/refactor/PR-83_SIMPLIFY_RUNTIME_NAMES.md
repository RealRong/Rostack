# 目标
- 统一简化 runtime 相关变量命名：
  - `runtimeStore` -> `store`
  - `readRuntime` -> `read`
  - `writeRuntime` -> `write`
- 保持接口语义不变，仅调整命名噪音。

# 背景
当前 runtime 相关变量命名冗长，且重复语义（如 `writeRuntime`）。
简化后链路更直、更易读。

# 方案
- 变量与参数命名统一简化。
- 相关结构体字段同步改名（如 `createReactions`/`createCommands` 参数）。
- 不改动公开 API 形态，仅调整内部命名。

# 风险与验证
- 风险：重命名遗漏导致类型错误。
- 验证：`pnpm -r lint`、`pnpm -r build`。
