# 目标
- 移除 `instance.query.config.get`，将配置读取下沉到 read 层。
- 保持 query 只做参数化查询。

# 背景
`config` 是稳定配置，不属于参数化查询范畴。
继续放在 `query` 会扩大 API 面积，偏离“最简查询层”。

# 方案
- 删除 `Query.config`。
- 在 `read.state` 增加 `config`（只读，返回实例配置）。
- 调用方改用 `instance.read.state.config`。

# 接口变更
- 移除：`instance.query.config.get()`。
- 新增：`instance.read.state.config`。

# 实现要点
- `EngineReadState` 增加 `config` 字段。
- `read/kernel.ts` 内联 getter 返回 `readContext.config`。
- 更新所有使用点与依赖数组。

# 风险与验证
- 风险：调用点遗漏导致类型错误。
- 验证：`pnpm -r lint`、`pnpm -r build`。
