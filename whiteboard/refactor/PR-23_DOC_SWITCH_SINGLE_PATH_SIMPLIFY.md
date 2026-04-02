# PR-23: Doc 切换单路径收敛（去除 runtime.docId 语义）

## 目标

把 `docId 变化` 与 `doc reset` 的职责从“双通道”收敛为“单通道写路径”，减少语义分裂与重复副作用。

当前问题：

1. `runtime.applyConfig` 里包含 `docId`，并承担 history clear 语义。
2. `commands.doc.reset` 也承担文档替换与 history clear。
3. React 层同时触发 `doc.reset` 与 `runtime.applyConfig`，逻辑重叠，容易让流程显得别扭。

## 设计原则

1. 文档切换只走写路径：`commands.doc.reset -> Writer.commitTransaction(kind='replace')`。
2. `runtime.applyConfig` 降级为纯运行时配置，不再承载文档身份语义。
3. 历史清理从“config 驱动”改为“replace 驱动”。
4. React 适配层避免把引擎自身产出的 doc 回灌成一次额外 reset（避免回声 replace）。

## 具体改动

### A. runtime 配置去掉 docId

1. `types/instance/runtime.ts` 删除 `Config.docId`。
2. `config/index.ts` 的 `toRuntimeConfig` 去掉 `docId` 入参与出参。
3. `instance/engine.ts` 的 `runtime.applyConfig` 删除基于 `docId` 的 history clear 逻辑。

结果：`runtime.applyConfig` 只负责 `tool/viewport/history(shortcuts)/mindmapLayout` 等运行态设置。

### B. history clear 绑定 doc replace 语义

1. `Writer.resetDoc` 从“无条件 clear”改为“仅 doc 身份变化时 clear”。
2. 文档身份以 `currentDoc.id !== nextDoc.id` 判断。

结果：

1. 真实跨文档切换时清理 history。
2. 同文档外部覆盖不强制清理，避免不必要历史丢失。

### C. Whiteboard 侧去掉回声 reset

1. 增加 `lastOutboundDocRef`，记录引擎最近一次向外发布的文档快照引用。
2. 在 `doc` 同步 effect 内，先判断当前 `doc` 是否仅为引擎回传镜像；若是则跳过 `commands.doc.reset`。
3. 仅对“外部真实注入”的 doc 触发 replace。

结果：避免每次本地写入后再触发一次 full replace。

## 预期链路

1. 外部切文档：`props.doc` 变化（非引擎镜像） -> `commands.doc.reset` -> replace -> change(readHints: full) -> read 全量同步。
2. 引擎本地写入：`onDocumentChange` 向外通知 -> React 回传 doc 时被识别为镜像 -> 不触发 reset。
3. runtime config 变化：只调整运行参数，不影响文档 identity 与 history 归属。

## 风险与边界

1. 镜像识别基于结构引用对齐（浅层引用语义）；如果宿主每次深拷贝 doc，仍会触发 replace。
2. `resetDoc` 改为按 doc.id 判断 history clear，要求宿主在跨文档场景提供稳定且可区分的 `doc.id`。

## 验证

1. `pnpm -r lint`
2. `pnpm -r build`
3. 手工验证：
   1. 同文档本地编辑，history 不被意外清空。
   2. 切换到新 `doc.id`，history 清空且读侧 full 同步。
   3. 仅调整 runtime 配置（tool/shortcut/viewport），不触发文档替换语义。
