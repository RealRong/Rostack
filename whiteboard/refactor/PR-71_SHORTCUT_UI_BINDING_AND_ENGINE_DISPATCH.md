# PR-71 快捷键改为 UI 绑定 + Engine Action Dispatcher

## 背景

当前 shortcut 链路存在职责错位：

1. engine 内部创建了 `runtime/shortcut`，但没有任何真实 DOM 事件输入。
2. React 侧只把 `config.shortcuts` 传入 `runtime.applyConfig`，没有把 `keydown/pointer` 喂给 engine。
3. 实际上 shortcut 是 UI 输入归一化问题，不应挂在 write runtime 生命周期中。

## 目标

1. engine 只保留语义动作入口：`commands.shortcut.dispatch(action)`。
2. React 统一负责 `keydown` 监听与 key 归一化，再调用 dispatcher。
3. 移除 engine 中未被使用的 `runtime/shortcut/*` 装配与生命周期代码。
4. 保留 `config.shortcuts` 可配置能力，但收敛为 `key -> action` 覆盖语义。

## 方案

1. **Engine 命令面收口**
   - `Commands` 增加：
     - `shortcut.dispatch(action): boolean`
   - 写侧 `shortcut` API 从 `execute` 改名为 `dispatch`。
   - `dispatch` 内做最小可执行条件判定（例如输入焦点、选择数量），返回是否处理。

2. **Engine 运行时去 shortcut 生命周期**
   - 删除 `instance/engine.ts` 中：
     - `bindShortcuts(...)`
     - `runtime.applyConfig` 的 `setShortcuts`
     - `runtime.dispose` 的 `shortcuts.dispose`
   - `runtime.applyConfig` 配置项移除 `shortcuts` 字段。

3. **快捷键配置模型简化**
   - 定义 `ShortcutBinding`：`{ key, action }`。
   - `ShortcutOverrides` 语义：
     - 数组直接替换默认列表；
     - 或函数 `(defaults) => next`。
   - 默认绑定放在 engine（语义归 engine 所有），React 只消费。

4. **React 接管输入绑定**
   - 新增统一快捷键 hook（window `keydown`）：
     - 限制触发范围在 whiteboard 容器内。
     - 跳过输入框/可编辑区。
     - 归一化 chord（支持 `Mod`）。
     - 命中后调用 `instance.commands.shortcut.dispatch(action)`。
   - `Whiteboard` 中移除 runtimeConfig 对 `shortcuts` 的透传。

5. **清理无效实现**
   - 删除 engine 的旧 `runtime/shortcut/*` 与不再使用的 manager/context 类型。
   - 更新链路文档 `ENGINE_CURRENT_CHAIN_FLOW.md`。

## 风险

1. `config.shortcuts` 类型会从“完整 shortcut 对象”收敛为“键位绑定”，属于 API 收敛改动。
2. 默认快捷键在 `keydown` 监听下触发，若宿主有全局热键，需按容器范围过滤避免冲突。
3. 历史 `pointer` shortcut 能力会移除（当前默认未使用）。

## 验证

1. `pnpm -r lint`
2. `pnpm -r build`
3. 手工链路检查：
   - `Mod+A / Delete / Mod+D / Mod+Z / Shift+Mod+Z` 能命中 dispatcher。
   - 输入框内按键不触发快捷键。
