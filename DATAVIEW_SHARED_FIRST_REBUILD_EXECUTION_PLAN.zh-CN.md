# Dataview Shared-First 重建实施方案

## 1. 文档目的

本文不是最终架构原则说明，而是基于：

- `SHARED_MUTATION_DELTA_DATAVIEW_FINAL_TARGET.zh-CN.md`
- 当前仓库实现现状

给出的实际重建计划。

本文默认：

- 不考虑兼容成本
- 不保留旧 API
- 不做长期过渡层
- 可以修改 `shared`、`dataview-core`、`dataview-engine`

目标只有一个：

把 dataview 完整重建为：

`shared/mutation` 负责执行与 canonical delta  
`shared/delta` 负责 derived delta 工具  
`dataview-core` 只负责领域语义  
`dataview-engine` 只负责 typed delta consumption 与 projection

## 2. 当前现状判断

## 2.1 现有结构已经“半迁移”

现在 dataview 已经做对的部分：

- `dataview-engine` 已经直接实例化 `MutationEngine`
- `dataview-core` 已经有 `compile / entities / custom / op`
- `dataview-engine` 已经有 package-local typed mutation delta facade
- 旧 `mutation.ts / trace.ts / impact.ts` 这类明显旧 runtime 文件已基本不在

现在还没做完的部分：

- `dataview-core/src/operations` 仍然是事实上的架构中心
- `compile` 仍然依赖 `operations/internal/compile/*` 旧 runtime
- 顶层公开 API 还没有完全收口
- custom reducer 还在手工拼 raw delta 字面量
- `shared/mutation` 与 `dataview-core` 之间还缺少更强的 shared-first helper
- engine 侧 typed delta facade 仍然是 package 手写 schema，和 core entities 没形成正式桥接

## 2.2 本次重建不做“小修”

如果只修当前报错，会陷入下面这种错误路径：

- 修一点 `fields.ts` 类型
- 修一点 `patch.ts` 泛型
- 修一点 `custom.ts` delta 写法
- 继续保留 `operations/internal/compile/*`

这样做能让代码变绿，但不会让架构到位。

本方案不走这个路线。

## 3. 最终目录边界

## 3.1 `dataview-core` 最终保留的顶层文件

最终顶层稳定入口只保留：

- `src/intent.ts`
- `src/op.ts`
- `src/entities.ts`
- `src/custom.ts`
- `src/compile.ts`

允许继续存在的领域模块：

- `src/document/*`
- `src/field/*`
- `src/view/*`
- `src/types/*`

这些模块是纯领域语义模块，不是 mutation runtime。

## 3.2 `dataview-core/src/operations` 的最终命运

最终 `src/operations` 不再作为稳定目录存在。

它下面的文件按三类处理：

### A. 直接删除

- `src/operations/compile.ts`
- `src/operations/internal/compile/base.ts`
- `src/operations/internal/compile/fields.ts`
- `src/operations/internal/compile/records.ts`
- `src/operations/internal/compile/views.ts`
- `src/operations/internal/compile/patch.ts`

原因：

- 这整组文件就是旧 compile runtime
- 它们不是最终架构里应该存在的层
- 顶层 `compile.ts` 不应该再只是这套 runtime 的转发

### B. 迁出后删除旧路径

- `src/operations/custom.ts`
- `src/operations/entities.ts`
- `src/operations/contracts.ts`
- `src/operations/internal/read.ts`
- `src/operations/internal/validateField.ts`
- `src/operations/internal/draft.ts`
- `src/operations/internal/recordFieldDraft.ts`
- `src/operations/plan.ts`

这些文件里有些能力要保留，但位置不对。

处理方式：

- `custom.ts` 内容迁到顶层 `src/custom.ts`
- `entities.ts` 内容迁到顶层 `src/entities.ts`
- `contracts.ts` 若仍需要，迁入 `src/compile.ts` 或 `src/types/*`
- `read.ts` 若仍需要，迁到领域 reader 或 compile 局部 helper
- `validateField.ts` 迁到 `src/field/*`
- `draft.ts`、`recordFieldDraft.ts` 迁到 record/document/value 相关领域模块
- `plan.ts` 要么迁到明确的 `record-create` 领域模块，要么直接删除

### C. 删除测试与调用方后清空目录

当上述迁移完成后：

- 删除 `src/operations` 整个目录
- 删除所有对 `operations/*` 的内部导入
- 删除测试中对 `operations/plan` 这类旧路径的引用

## 4. shared 层先行工作

重建顺序上，shared 必须先动，否则 dataview 会继续手工拼 shared 协议对象。

## 4.0 `MutationDeltaInput` 的建设原则

本次重建中，shared 层关于 delta 的设计原则必须先定死：

- 不把 `MutationDeltaInput` 本体升级成系统中心泛型
- 不让 `MutationEngine` 主链 API 依赖 `TSchema`
- typed 化放在 helper 与 typed read facade

换句话说：

- raw protocol 继续是 `MutationDeltaInput`
- typed authoring 由 builder/helper 负责
- typed reading 由 `createTypedMutationDelta` 负责

如果后续确实需要额外的 authoring type，可以补：

- `MutationDeltaInputOf<TSchema>`

但这只能作为 helper 的约束类型存在，不能成为 engine/runtime 主协议。

否则会造成：

- `MutationCustomReduceResult`
- `MutationEngine`
- `normalizeMutationDelta`
- `mergeMutationDeltas`
- `coerceMutationDelta`

这整条 shared 主链被 schema 泛型扩散污染。

## 4.1 `@shared/mutation` 需要新增的能力

### A. delta builder helper

新增官方 helper，替代 package 手写：

- `flagChange(key)`
- `idsChange(key, ids)`
- `pathsChange(key, paths)`
- `orderChange(key)`
- `mergeDeltaInputs(...)`

目标：

- custom reducer 不再直接手写 `changes: { ... }`
- package 不再自己写 `appendIdsChange` / `appendPathsChange` / `appendFlagChange`

直接影响：

- `dataview-core/src/operations/custom.ts` 当前那套 delta 拼装函数应消失
- whiteboard 未来也可复用同一套 helper

长期推荐不是只有无类型 helper，而是直接提供 schema-aware builder，例如概念上：

```ts
const delta = createDeltaBuilder(schema)

delta.flag('document.activeViewId')
delta.ids('field.create', ['field_status'])
delta.paths('record.values', {
  record_1: ['status', 'owner']
})
```

其输出仍然是普通 `MutationDeltaInput`。

这样可以同时满足：

- 写侧有类型约束
- shared 主协议保持简单
- package reducer 不再手工拼 raw object

### B. custom signal schema

现在 `external.version` 这类 key 是隐式约定。

shared 应支持 package 声明：

- entity-derived keys
- custom signal keys

最终 schema 应是：

- entity spec 派生的 key
- package 声明的额外 signal key

这样 `createTypedMutationDelta` 的 schema 不再靠各 package 手工维护一份裸字符串表。

### C. entity spec 到 typed schema 的桥接 helper

shared 需要提供新的桥接层，例如概念上类似：

- `defineEntityMutationSchema(entities, extraSignals)`
- `readEntityLifecycleKeys(entities)`
- `readEntityChangeKeys(entities)`

目标不是完全自动生成 path codec，而是减少重复声明：

- lifecycle keys 由 entity family 自动生成
- change bucket keys 由 entity spec 自动生成
- package 只补 path codec 和 custom signal

### D. compile helper 最小化

shared 不需要替 dataview 保留 compile runtime，但可以补最小 helper：

- typed issue helper
- handler factory
- compile result normalization helper

原则：

- 允许 package 写更薄的 compile
- 不要鼓励 package 再建一棵 `internal/compile/*`

## 4.2 `@shared/delta` 需要强化的能力

`@shared/delta` 不需要升级为协议层，但应强化为 engine/projection 的标准工具层。

优先增强方向：

- 更稳定的 `entityDelta` / `idDelta` 组合模式
- 面向 projection 的 merge/union/helper
- 面向 set/remove/order patch 的常用构造函数

不需要做的事：

- 不要在这里定义 commit delta
- 不要在这里定义 mutation engine schema

## 5. Dataview Core 重建计划

## 5.1 第一步：先重写顶层 API 文件

先直接重写：

- `src/compile.ts`
- `src/custom.ts`
- `src/entities.ts`

要求：

- 不再只是转发 `operations/*`
- 直接承载最终实现
- 彻底切断“顶层薄封装 + operations 实现体”这种旧关系

## 5.2 第二步：compile 从 runtime 子系统改成普通领域 lowering

目标：

- `compile.ts` 直接按 intent type 分发
- 每类 lowering 是普通领域函数
- lowering 输出 op

最终 compile 内部结构建议：

- `src/compile.ts`
- `src/compile/record.ts`
- `src/compile/field.ts`
- `src/compile/view.ts`

或者全部收在一个文件也可以。

关键要求不是目录名，而是：

- 不允许再出现 `operations/internal/compile/base.ts`
- 不允许再把 compile helper 组织成一个独立 runtime 子系统

## 5.3 第三步：把字段/记录/视图校验下沉到领域模块

当前 compile 里混着很多领域校验，例如：

- field shape 校验
- option 变更校验
- view patch 合法性校验

这些逻辑最终应下沉到：

- `field/*`
- `view/*`
- `document/*`

compile 只负责调用，不负责拥有这套规则。

结果是：

- compile 体积变薄
- 领域规则回到领域模块
- `validateField.ts` 这类文件自然消失

## 5.4 第四步：custom reducer 只保留领域联动

最终 custom reducer 文件建议拆成：

- `src/custom.ts`
- `src/custom/record.ts`
- `src/custom/field.ts`
- `src/custom/view.ts`
- `src/custom/external.ts`

每个 reducer 只做：

- 领域联动写入
- 逆操作生成
- canonical `MutationDeltaInput`

禁止保留的旧模式：

- dataview 自己定义 impact payload
- dataview 自己定义 activeView.before/after 这类专用包装
- dataview 自己定义 historyMode 字段语义

## 5.5 第五步：entity spec 成为唯一 delta 语义源

`src/entities.ts` 最终应直接定义 dataview entity families。

同时要求：

- view query/layout/calc 三桶语义固定
- document/record/field/view 生命周期 key 全部稳定
- `record.patch` 这种旧总桶 key 彻底不存在

最终 engine 的 typed delta schema 必须从这个 spec 出发，而不是 package 再随意约定。

## 5.6 第六步：处理 `plan.ts`

`plan.ts` 不属于 mutation runtime 主链。

这里有两个可接受方向：

### 方向 A：保留功能，迁到领域模块

如果 record create defaults / group / filter 衍生仍是 dataview core 的合法能力，则迁到例如：

- `src/record/createPlan.ts`
- 或 `src/view/recordCreate.ts`

### 方向 B：直接删除

如果这块只是 UI/engine convenience 逻辑，不属于 core 的最终边界，则直接删掉，让 engine/UI 自己组合。

长期最优上，我更倾向于：

- 若这逻辑是“view context 下的 record create intent 推导”，它更像 engine/API 层能力，而不是 core mutation 层能力

也就是说，它大概率不该继续留在 core。

## 6. Dataview Engine 重建计划

## 6.1 engine 只依赖顶层 core API

最终 `dataview-engine` 只允许依赖：

- `@dataview/core/intent`
- `@dataview/core/op`
- `@dataview/core/entities`
- `@dataview/core/custom`
- `@dataview/core/compile`
- 以及纯领域模块 `document/field/view`

不允许 engine 依赖：

- `@dataview/core/operations/*`

## 6.2 typed delta facade 改成“shared-first schema”

当前 `dataview-engine/src/mutation/delta.ts` 的方向是正确的，但来源还不够 shared-first。

最终目标：

- schema 由 `entities + extraSignals` 生成
- path codec 由 engine 补充
- facade 本身只承载 dataview-specific reader convenience

建议最终结构：

- schema key 来源：core entities + `external.version`
- codec 来源：engine
- facade 来源：`createTypedMutationDelta`

也就是说，engine 只补“怎么解释 path”，不再补“有哪些 key”。

## 6.3 active/index/publish 统一使用 `@shared/delta`

当前 dataview-engine 已经在多处使用 `@shared/delta`，这个方向要彻底化。

最终要求：

- touched ids 聚合统一走 `idDelta`
- set/remove/order 统一走 `entityDelta`
- publish/stage/source patch 统一走 `change` 或 `entityDelta`
- 任何自定义 `{ added, removed, changed, orderChanged }` 结构都要审查并统一

目标：

- engine 内部不再有多套局部增量格式
- projection slice 之间的差异表达统一

## 6.4 删除二次转译层

最终 engine 内严禁出现：

- `MutationDelta -> DataviewImpact`
- `MutationDelta -> DirtyPayload`
- `MutationDelta -> TracePayload`

允许出现：

- `MutationDelta -> typed delta facade`
- `typed delta facade -> local derived delta`

前者是 shared 标准读层，后者是 engine 局部计算。

## 7. 测试重建计划

## 7.1 必须删除的旧测试

以下类型的测试都应删除：

- 断言 compile 最终会因未知 operation 失败的测试
- 断言旧 delta key 的测试
- 断言旧 payload 结构的测试
- 断言 `operations/*` 路径存在的测试

例如当前这类思路：

- `field.create` execute 结果应为 unknown operation

这已经和 shared-first 最终方向相反。

## 7.2 应新增的测试

核心测试应改成：

- compile 将 intent lowering 成预期 op
- canonical op 在 `MutationEngine` 中可执行
- custom op 返回 shared 合法 delta
- entity spec 变化能被 typed delta facade 正确识别
- engine dirty/projection 完全由 `MutationDelta` 驱动

## 8. 文件级动作清单

## 8.1 `shared/mutation`

需要新增或重写：

- `src/deltaBuilder.ts` 或等价 helper
- entity spec 到 typed schema 的桥接 helper
- custom signal schema 支持

需要清理：

- 当前类型只允许传必填 `entities` 的位置与对外可选 API 不一致的问题
- 内部若有只读写入类型错误，统一收敛

## 8.2 `shared/delta`

需要增强：

- projection 常用组合 helper
- entity/order/set/remove 更完整的 merge helper

不需要大规模改目录结构。

## 8.3 `dataview-core`

直接删除：

- `src/operations/compile.ts`
- `src/operations/internal/compile/base.ts`
- `src/operations/internal/compile/fields.ts`
- `src/operations/internal/compile/records.ts`
- `src/operations/internal/compile/views.ts`
- `src/operations/internal/compile/patch.ts`

迁出后删除：

- `src/operations/custom.ts`
- `src/operations/entities.ts`
- `src/operations/contracts.ts`
- `src/operations/internal/read.ts`
- `src/operations/internal/validateField.ts`
- `src/operations/internal/draft.ts`
- `src/operations/internal/recordFieldDraft.ts`
- `src/operations/plan.ts`

重写：

- `src/compile.ts`
- `src/custom.ts`
- `src/entities.ts`
- `src/index.ts`
- `package.json` exports

## 8.4 `dataview-engine`

重写重点：

- `src/mutation/delta.ts`
- 所有依赖 typed delta key 列表的地方
- 所有内部 custom dirty struct

清理重点：

- 与 core `operations/*` 的任何耦合
- 与旧 delta key 语义的任何耦合

## 9. 推荐实施顺序

## Phase 1：Shared 先收口

1. 在 `shared/mutation` 增加 delta builder helper
2. 在 `shared/mutation` 增加 entity spec -> typed schema bridge
3. 在 `shared/mutation` 增加 custom signal schema 支持
4. 让 `shared/delta` 补齐 projection 侧常用 helper

输出标准：

- package 不再需要手工拼 raw delta object
- package 不再需要手工重复声明所有 schema key

## Phase 2：Core 边界重写

1. 重写 `src/entities.ts`
2. 重写 `src/custom.ts`
3. 重写 `src/compile.ts`
4. 调整 `src/index.ts` 与 `package.json`
5. 删掉 `src/operations/internal/compile/*`

输出标准：

- `dataview-core` 顶层实现不再依赖 `operations/*`
- compile 只做 intent -> op

## Phase 3：Engine schema 收口

1. 重写 `dataview-engine/src/mutation/delta.ts`
2. schema keys 改为来自 `entities + signals`
3. path codec 保留在 engine
4. 脏判断统一基于 typed delta facade

输出标准：

- engine 不再手工维护 package-local key 清单
- engine 不再引入 dataview 私有 delta 协议

## Phase 4：Projection delta 统一

1. active/index/publish/source patch 的局部 delta 统一审查
2. 全部改用 `@shared/delta`
3. 清理重复结构与重复 helper

输出标准：

- engine 内部只有一套 derived delta 工具语言

## Phase 5：删除旧结构

1. 删除 `src/operations` 整树
2. 删除旧测试
3. 删除旧文档
4. 删除兼容导出

输出标准：

- 仓库中不再存在 dataview 私有 mutation runtime 痕迹

## 10. 最终验收标准

重建完成后，必须满足以下条件：

### A. `dataview-core`

- 顶层只保留 `intent/op/entities/custom/compile`
- `src/operations` 不再存在
- compile 只负责 lowering
- custom 只负责不可 canonical 化的领域联动

### B. `shared/mutation`

- 是唯一 commit/delta 协议来源
- 是唯一 typed mutation delta schema/read 来源

### C. `shared/delta`

- 是唯一 derived delta 工具箱
- projection/runtime 不再各造一套增量表达

### D. `dataview-engine`

- 只消费 shared commit
- 只基于 typed delta facade 做 dirty/projection
- 不依赖任何 dataview 私有 impact/trace/delta payload

## 11. 最后结论

这次重建的本质，不是“把 dataview 迁到 shared 上一点点”，而是：

- shared 决定 mutation 协议
- core 退化成纯领域定义层
- engine 退化成纯消费层
- delta 的二次推导统一交给 `@shared/delta`

也就是说，最终要删掉的不是几份文件，而是 dataview 曾经拥有过的那套“自带 mutation runtime 的架构地位”。

只有把这个地位彻底拿掉，shared-first 才算真正完成。
