# PR-65 写链路注释与总览文档同步

## 背景

近期已连续完成链路收敛（selection 单事务、document set/notify 显式化、command 类型拆分、read context 直通）。

`ENGINE_CURRENT_CHAIN_FLOW.md` 仍包含部分“未落地项”与旧语义描述，`runtime/write/runtime.ts` 也缺少主链路注释，阅读入口不够直接。

## 目标

1. 同步 `ENGINE_CURRENT_CHAIN_FLOW.md` 到当前真实实现。
2. 在 `runtime/write/runtime.ts` 增加简洁链路注释，降低跨文件心智跳转。

## 方案

1. 文档更新：
   - 主链路改为当前真实路径（含 `selection` 单事务 domain）。
   - reset 链路改为 `document.set` 显式语义。
   - read 链路改为 `context.state + context.snapshot` 直通。
   - 删除已完成项的“remaining”描述，改为新的可选后续优化。

2. 代码注释：
   - 在 `runtime/write/runtime.ts` 添加 8~10 行调用图注释，明确：
     `runtime -> execution(writer+planner) -> commands(semantic API)`。

## 风险

仅文档与注释更新，无运行时行为变更。

## 验证

1. `pnpm -r lint`
2. `pnpm -r build`
