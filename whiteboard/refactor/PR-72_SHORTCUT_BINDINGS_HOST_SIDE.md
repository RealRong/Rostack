# PR-72 Shortcut Bindings 下沉到 Host/UI 侧

## 背景

在 PR-71 中已经将 shortcut 执行链路收敛为：

- UI: `key/chord -> action`
- engine: `commands.shortcut.dispatch(action)`

但默认 bindings 与 resolve 仍位于 `whiteboard-engine`，边界仍有残留耦合。

## 目标

1. `engine` 仅承担语义层：`ShortcutAction` + `dispatch(action)`。
2. 默认键位 bindings 与 bindings 合并策略完全下沉到 `whiteboard-react`（宿主层）。
3. 删除 engine 中仅服务于 UI 输入配置的导出与目录。

## 方案

1. 在 `whiteboard-react` 新增 `shortcutBindings.ts`：
   - `DEFAULT_SHORTCUT_BINDINGS`
   - `resolveShortcutBindings`

2. `useShortcutDispatch` 改为引用本地 bindings 模块，不再从 `@whiteboard/engine` 导入默认绑定。

3. 清理 `whiteboard-engine`：
   - 删除 `src/shortcut/` 目录。
   - 删除 `src/index.ts` 中 `DEFAULT_SHORTCUT_BINDINGS/resolveShortcutBindings` 导出。

4. 类型保持不变：
   - `ShortcutAction/ShortcutBinding/ShortcutOverrides` 继续由 engine 类型导出，避免影响现有 `config.shortcuts` 类型链路。

## 风险

1. 低风险，主要是导出路径变化（仅内部代码使用）。
2. 若有外部直接依赖 engine 的默认绑定导出，将产生破坏性变更（当前仓内未使用）。

## 验证

1. `pnpm -r lint`
2. `pnpm -r build`
3. 手工确认：`Mod+A/Delete/Mod+Z` 仍可触发 `commands.shortcut.dispatch`。
