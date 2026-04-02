# PR-33: Write Runtime 按阶段重组目录（Stage-First Layout）

## 目标

把 `runtime/write` 的平铺文件改为“按写链路阶段分目录”，做到打开目录即可看清主流程：

`api -> plan -> commit -> invalidation`

本 PR 只做文件组织与 import 调整，不改行为。

## 现状问题

1. `runtime/write` 顶层平铺文件过多，阶段边界不明显。
2. `model/id/plan/writer/impact/readHints/bus/history` 分散在同层，阅读路径跳转成本高。
3. 新增同类能力时难以判断应放在哪个阶段。

## 设计

### A. 目录结构重组

1. `stages/plan`
   1. `draft.ts`（原 `model.ts`）
   2. `router.ts`（原 `plan/index.ts`）
   3. `domains/*`（原 `plan/{node,edge,viewport,mindmap}.ts`）
2. `stages/commit`
   1. `writer.ts`（原 `writer.ts`）
   2. `history.ts`（原 `history.ts`）
3. `stages/invalidation`
   1. `impact.ts`（原 `impact.ts`）
   2. `readHints.ts`（原 `readHints.ts`）
   3. `changeBus.ts`（原 `bus.ts`）
4. `shared`
   1. `identifiers.ts`（原 `id.ts`）

### B. 入口保持稳定

1. `runtime.ts` 继续作为写链路装配入口。
2. `write/index.ts` 继续导出 `runtime`/`Writer`/`History`/`impact`/`api`，仅调整导出路径。

## 约束

1. 不改变 public API 与命令行为。
2. 不改变链路时序（写规划、事务提交、readHints 发布顺序不变）。
3. 不新增功能，只重组代码位置。

## 验证

1. `pnpm -r lint`
2. `pnpm -r build`
3. 手工检查：
   1. `runtime/write/runtime.ts` 仍是一眼可读的主装配链。
   2. `api.ts`/`writer.ts`/`plan` 内部引用全部指向新目录。
