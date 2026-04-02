# 目标
- 在 read kernel 中内联 `query` 与 `readApi` 的构造，减少无意义的中间变量。

# 背景
`queryApi` 与 `read` 仅被构造一次并立即返回，保留变量没有额外价值。

# 方案
- 移除 `const queryApi` 与 `const read` 变量。
- 直接在 `return` 中调用 `query(...)` 与 `readApi(...)`。

# 影响范围
- 仅 `createReadKernel` 内部代码结构调整。

# 风险与验证
- 风险极低，仅是代码结构变化。
- 验证：`pnpm -r lint`、`pnpm -r build`。
