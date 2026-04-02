# 目标
- 将 `snapshotAtom` 创建下沉到 `createReadKernel` 内部。
- 进一步收敛 read kernel 的入参。

# 背景
`snapshotAtom` 仅在 `createReadKernel` 内使用，外部传参属于冗余。

# 方案
- `ReadDeps` 删除 `snapshotAtom`。
- `createReadKernel` 内部调用 `snapshot({ documentAtom, revisionAtom })`。
- `engine` 侧移除 `snapshot` 相关创建与传参。

# 风险与验证
- 风险：低，参数收敛。
- 验证：`pnpm -r lint`、`pnpm -r build`。
