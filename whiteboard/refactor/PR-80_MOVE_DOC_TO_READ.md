# 目标
- 将 `doc.get` 从 `query` 移到 `read.doc`。
- 让 query 只保留参数化查询，read 承载稳定读取。

# 背景
`doc` 不是参数化查询，而是稳定数据读取。
放在 `query` 会让语义混淆，且与 `config` 下沉方向不一致。

# 方案
- 移除 `Query.doc`。
- `EngineRead` 增加 `doc: { get: () => Readonly<Document> }`。
- 内部使用 `runtimeStore.get(stateAtoms.document)` 构造 doc getter。
- 调用方从 `instance.query.doc.get()` 改为 `instance.read.doc.get()`。

# 风险与验证
- 风险：调用点遗漏导致类型错误。
- 验证：`pnpm -r lint`、`pnpm -r build`。
