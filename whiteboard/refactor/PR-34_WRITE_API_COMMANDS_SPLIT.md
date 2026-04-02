# PR-34: Write API 按命令职责拆分（api/commands）

## 目标

把 `runtime/write/api.ts` 的多职责大文件拆为按命令职责的子文件，提升可读性与维护性，同时保持外部行为与导出不变。

## 现状问题

1. `api.ts` 单文件体积大（600+ 行），同时承载 `write/node/edge/interaction/selection/mindmap/viewport/shortcut`。
2. 单文件修改冲突概率高，审查粒度粗。
3. 新增命令时难以定位合理落点。

## 设计

### A. 新增 `api/commands` 目录

1. `api/commands/write.ts`
2. `api/commands/node.ts`
3. `api/commands/edge.ts`
4. `api/commands/interaction.ts`
5. `api/commands/selection.ts`
6. `api/commands/mindmap.ts`
7. `api/commands/viewport.ts`
8. `api/commands/shortcut.ts`
9. `api/commands/index.ts`

### B. 兼容导出层

1. `runtime/write/api.ts` 改为 barrel：`export * from './api/commands'`。
2. 对外 API 名称保持不变。

### C. 运行时装配引用对齐

1. `runtime.ts` 改为直接从 `./api/commands` 导入命令构造函数。

## 约束

1. 不改变命令签名。
2. 不改变命令行为。
3. 不改变写链路时序。

## 验证

1. `pnpm -r lint`
2. `pnpm -r build`
3. 手工检查：
   1. `runtime.ts` 仍可直接看清命令装配顺序。
   2. `write/index.ts` 的导出保持兼容。
