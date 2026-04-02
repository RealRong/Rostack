# PR-63 command 类型模块拆分（保持 api 导出兼容）

## 背景

`packages/whiteboard-engine/src/types/command/api.ts` 当前承载 mindmap、interaction、write、public command 全部类型，文件过大且职责混合，阅读与维护成本高。

## 目标

1. 按职责拆分 command 类型文件。
2. 保持 `@engine-types/command/api` 的导出兼容，不影响调用方 import。
3. 不改动任何运行时逻辑，仅做类型组织重构。

## 方案

1. 新增类型文件：
   - `types/command/mindmap.ts`
   - `types/command/interaction.ts`
   - `types/command/write.ts`
   - `types/command/public.ts`

2. `types/command/api.ts` 收敛为聚合导出：
   - `export * from './mindmap'`
   - `export * from './interaction'`
   - `export * from './write'`
   - `export * from './public'`

3. 类型归属原则：
   - mindmap command/option 类型 -> `mindmap.ts`
   - drag/resize/transform 输入类型 -> `interaction.ts`
   - write domain 与 write input 映射 -> `write.ts`
   - 外部 Commands 接口 -> `public.ts`

## 风险

1. 若拆分时漏导出，可能导致编译错误。
2. 若发生重名冲突，可能影响 API 聚合导出。

## 验证

1. `pnpm -r lint`
2. `pnpm -r build`
3. `rg` 检查仓内 `@engine-types/command/api` 引用无需修改即可通过。
