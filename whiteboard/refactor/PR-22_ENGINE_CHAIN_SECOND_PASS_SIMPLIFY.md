# PR-22: Engine Chain 二次收敛（一步到位）

## 目标

在不改变外部功能与命令语义的前提下，落地第二轮链路拉直：

1. 去除文档双通道，收敛为单一文档源。
2. readHints 由写侧一次生成，读侧直接消费。
3. Writer 提交流程收敛为单事务入口。
4. Engine 装配去掉临时空壳与多余 facade。
5. Reactions 从 class 改为函数式 wiring。

## 改动范围

### A. Document 单源收敛

1. `engine.ts` 不再使用 `createDocumentStore`。
2. `instance.document.get/replace` 直接基于 `runtimeStore + stateAtoms.document`。
3. `Writer` 不再手动写 `documentAtom`，只通过 `instance.document.replace` 提交文档。

### B. ReadHints 单次映射

1. `Change` 增加 `readHints` 字段（stage-ready hints）。
2. 写侧在 publish change 时直接生成 `readHints`。
3. 读侧 kernel 直接应用 `readHints.index/readHints.edge`，删除二次映射。
4. 删除不再需要的 read-side adapter/planner 中间层。

### C. Writer 事务收口

1. 新增统一事务提交函数 `commitTransaction`（apply/replace 共用）。
2. `applyDraft` 直接走事务提交，不再串联多层方法。
3. history capture 仍保持在写成功后执行，语义不变。

### D. Engine 装配简化

1. 去掉 `commands: null` 临时占位。
2. 删除 `instance/facade/runtimePort.ts`，将 `applyConfig/dispose` 内联到 `engine.ts`。
3. write runtime 依赖改为最小实例视图，降低对完整 `InternalInstance` 的耦合。

### E. Reactions 函数化

1. `Reactions` class 改为 `createReactions` 函数。
2. 启动订阅在创建时完成，返回 `{ nodeMeasured, dispose }`。
3. `createCommands` 只依赖该最小 reactions 接口。

## 行为不变约束

1. 外部 API 仍是 `instance.commands` 单写入口。
2. `CommandGateway` 默认启用逻辑保持不变。
3. `undo/redo` 仍通过 writer 回放并触发同一读侧同步链路。
4. Measure/Autofit 仍通过 `source: 'system'` 命令写入。

## 验证

1. `pnpm -r lint`
2. `pnpm -r build`
3. 手工链路验证：
   1. 普通命令写入 -> read 数据刷新
   2. host `nodeMeasured` -> size 更新
   3. undo/redo -> 读侧一致更新

