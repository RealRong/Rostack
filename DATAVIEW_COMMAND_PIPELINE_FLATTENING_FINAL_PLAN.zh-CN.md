# Dataview Command Pipeline 打平最终方案

## 1. 目标

这份文档只回答两个问题：

1. `dataview/src/engine/command/commands/index.ts` 这一条 resolve 分发线，能否进一步简化，并通过类型系统把内部命令线彻底打平。
2. `dataview/src/engine/command/field/effects.ts` 这类副作用解析，应该依赖什么读接口，才能减少跨层跳转，同时不破坏 command pipeline 的正确性。

本文只给最终方案，不涉及代码实现。


## 2. 结论摘要

我的结论是：

- `resolve` 线还能明显更简单。
- 真正该打平的不是 `switch` 语法本身，而是“命令体系的层次”。
- 当前最大的结构问题是：今天同一个 `Command` union 同时承担了高层意图和底层执行指令。
- `field/effects.ts` 里直接拿 `document` 再去 `core/document` 查 view，方向确实还能优化。
- 但优化方向不是改成 `engine.read.xxx`，而是引入基于 `workingDocument` 的 command snapshot read API。

一句话总结就是：

- `Action` 先 lowering 成 primitive `Command`。
- resolve 阶段只处理 primitive `Command`。
- 所有 resolver/effect 只读 `command ctx.read`，不直接碰 `engine.read`。


## 3. 当前问题到底在哪

## 3.1 `resolveCommand` 当前在处理混合层级命令

看现在的链路：

- facade/UI 产生 `Command`
- `write/translate.ts` 几乎不做 lowering
- `resolveWriteBatch.ts` 直接逐条 resolve
- `commands/index.ts` 再按 `command.type` 分发
- 一部分 resolver 内部还会继续 `deriveCommand(...)` 生成别的命令再 resolve

这代表当前 `Command` union 实际上混着两层东西：

- 高层意图 action
- 底层执行 command

例如这些命令：

- `customField.convert`
- `customField.duplicate`
- `customField.option.update`
- `view.patch`

它们都不是纯 primitive instruction，而是“还带业务语义”的高层命令。

所以现在 `resolve` 阶段其实在做三件事：

- validate
- lower
- resolve to operations

这三件事混在一起，就会让 `commands/index.ts` 看起来像总分发器，让 `field/resolve.ts`、`commands/view.ts` 看起来像半业务编排层。


## 3.2 `deriveCommand(...)` 说明内部命令线没有打平

`context.ts` 里的：

- `deriveIndexedCommand`
- `commands/shared.ts` 里的 `deriveCommand`

本质上是在 resolver 内继续制造新的命令。

这本身不是错，但它暴露了一个更深的问题：

- 当前 resolve 阶段面对的命令，还不是最终内部形态。

也就是说，当前 pipeline 是：

- 一边 resolve
- 一边继续 lower

这就天然不够平。


## 3.3 `field/effects.ts` 现在的读取方向不够好，但不能接 `engine.read`

`field/effects.ts` 当前像这样工作：

- 接收 `document`
- 直接用 `getDocumentViews(document)`
- 遍历全部 view
- 产出 `document.view.put` operations

阅读上确实会让人觉得：

- 逻辑分散
- resolver/effect 文件自己决定怎么读 document
- 需要不断跳去 `core/document`

但如果把它改成 `engine.read.views` 或 `engine.read.view`，问题会更大。

原因是：

- command pipeline 当前是基于 `workingDocument` 的纯解析
- `resolveWriteBatch.ts` 每处理一条命令，都会把 operation 应用到临时文档，再继续下一条命令
- `engine.read.xxx` 读的是运行时 engine store，不是这条 batch 里的临时快照

所以 command resolver/effect 接 `engine.read` 会破坏这条关键前提：

- resolver 不再是纯 snapshot 函数
- 同一批命令里的后续命令可能读不到刚刚 speculative apply 的中间态

这不是简化，是层次错误。


## 4. 最终目标结构

## 4.1 命令体系拆成 `Action` 和 `Command`

我建议直接把今天这套混合 `Command` 拆成两种概念，而且术语就用：

### 第一层：`Action`

用途：

- 给 facade / UI / 调用方使用
- 表达用户意图
- 保持 ergonomics

这里不建议继续叫 `ExternalCommand`，原因很直接：

- “external/internal” 强调的是来源
- 但这里真正要区分的是职责
- 高层那层本质上不是执行指令，而是意图描述

所以 `Action` 更准确，也更稳定。

例如保留：

- `record.create`
- `record.apply`
- `field.convert`
- `field.duplicate`
- `field.option.update`
- `view.patch`
- `view.create`

这些都更适合作为 `Action`，因为它们携带的是领域语义，不是 primitive execution unit。


### 第二层：`Command`

用途：

- 只给 command pipeline 内部使用
- 只表达 canonical mutation instruction
- 不再承载高层业务意图

这里也不建议继续叫 `InternalCommand`。

原因是：

- 一旦 pipeline 内最终只剩这一层可执行指令，它就是“真正的 command”
- 反而高层那层不该继续占着 `Command` 这个词

所以长期命名应该反过来：

- 高层叫 `Action`
- 底层叫 `Command`

建议长期只保留这类 primitive instruction：

- `record.insert`
- `record.patch`
- `record.remove`
- `value.set`
- `value.clear`
- `value.patch`
- `field.put`
- `field.patch`
- `field.remove`
- `view.put`
- `view.remove`
- `activeView.set`
- `external.bumpVersion`

这里的关键不是命名一定要照抄，而是原则：

- 内部命令必须足够 primitive
- 一个 resolver 只做一件基础解析工作
- 不允许在 resolver 内继续把高层命令 lower 成另一种高层命令


## 4.2 `lowerActions` 变成真正的 lowering 边界

当前 `write/translate.ts` 基本只是包装。

长期最优应该是：

- facade/UI 产出 `Action`
- `lowerActions(document, actions)` 把它们 lowering 成 `Command[]`
- `runCommands(document, commands)` 只接受 `Command[]`

也就是明确形成这条线：

```text
Action
  -> lower
Command[]
  -> run
BaseOperation[]
  -> apply
CommitDelta
```

这样之后：

- `resolveCommand` 的分发表会大幅变小
- `field/resolve.ts`、`commands/view.ts` 不再承担一半 lowering 工作
- `deriveCommand(...)` 的存在价值会明显下降，最终可以基本消失


## 5. 这条线如何通过类型系统打平

## 5.1 类型系统应该约束什么

我建议类型系统只做以下约束：

1. `Action` 和 `Command` 必须彻底分离。
2. `lowerActions` 的返回值只能是 `Command[]`。
3. `runCommands` 的输入只能是 `Command[]`。
4. 每种 `Command['type']` 必须有且只有一个 resolver。
5. resolver 的输入类型必须和 `type` 一一对应。

也就是说，类型系统要确保：

- 高层命令不能越过 `lowerActions` 直接进入 `runCommands`
- 内部命令集合是闭合的
- resolver 分发表对内部命令集合是穷尽的


## 5.2 类型系统不该承担什么

我不建议让类型系统去表达这类运行时语义：

- “field.convert 之后所有 view 一定都修复了”
- “option.remove 之后所有 record value 一定都更新了”
- “某类命令一定只生成某几种 operation”

这些约束应该放在：

- lowering policy
- resolve policy
- tests

而不是放在复杂的条件类型里。

否则打平了一层命令线，却会引入另一层类型体操复杂度，得不偿失。


## 5.3 最优形态不是“更花的 switch”，而是 resolver registry

当内部命令足够 primitive 后，`resolveCommand` 就不必继续维持现在这种大 switch 结构。

长期可以变成：

- 一个 `commandResolverMap`
- key 为 `Command['type']`
- value 为对应 resolver

类型上要求：

- resolver map 对 `Command['type']` 是穷尽的
- 每个 resolver 只接受对应 subtype

但这里有一个前提：

- 只有在 `Command` 已经被打平成 primitive 之后，这种 registry 才是净简化。

如果继续拿今天这种混合命令 union 去做 resolver map，只会把问题从 switch 换成对象表，不是本质优化。


## 6. `field/effects.ts` 的最终方向

## 6.1 不接 `engine.read`

这点我建议定死。

原因：

- `engine.read` 是运行时 store read API
- command resolver 需要的是 batch 内 `workingDocument` 的 snapshot read
- 两者语义不同

一旦 command/effect 接入 `engine.read`，就会让 pipeline：

- 不再纯函数化
- 不再对 batch 中间态稳定
- 更难测试

所以：

- `engine.read` 只能属于 facade/UI/runtime
- 不能属于 command pipeline


## 6.2 引入 `CommandReadApi`

我建议在 command 层引入一个专用 snapshot read API。

概念上类似：

```text
CommandContext
  index
  doc
  read
```

其中 `read` 只基于当前 `workingDocument`，不带订阅，不依赖 store。

最小接口建议包括：

- `read.records.list()`
- `read.records.get(recordId)`
- `read.records.has(recordId)`
- `read.fields.list()`
- `read.fields.get(fieldId)`
- `read.fields.has(fieldId)`
- `read.views.list()`
- `read.views.get(viewId)`
- `read.views.has(viewId)`
- `read.views.activeId()`
- `read.views.active()`

这层 API 的目标不是增加抽象，而是把今天散落在各 resolver/effect 里的：

- `getDocumentViews`
- `getDocumentViewById`
- `getDocumentFields`
- `getDocumentFieldById`
- `hasDocumentXxx`

统一收进一个 snapshot facade。


## 6.3 `field/effects.ts` 该依赖什么

最终它不应该长成：

- 给我整个 `document`
- 我自己去 `core/document` 扫 `getDocumentViews`

更好的形态应该是：

- 给我 `ctx.read.views.list()`
- 或给我 `ctx.read.views`
- 我只关心 views 集合和当前变更 field

也就是说：

- effect 函数依赖“读能力”
- 不依赖“整份 document 数据结构”

这样带来的收益很直接：

- resolver/effect 文件不需要知道底层 document helper 分布
- 读路径集中
- 测试时可更容易 mock
- 未来如果 document 访问策略变化，不需要全量改 effect 文件


## 6.4 最终不建议把 effect 当成 document traversal owner

再往前一步看，我认为：

- `field.create/remove/convert` 的 view repair
- `field option remove` 的 record value rewrite

本质上都属于“field mutation 后的派生 rewrite policy”。

长期最优可以继续收成统一结构：

- `field/rewrites/view.ts`
- `field/rewrites/value.ts`
- 或更泛化的 `field/policies/*`

但这一步属于第二阶段。

第一阶段只需要做到：

- 不直接读 `document`
- 统一通过 `ctx.read`


## 7. 推荐的最终分层

## 7.1 facade 层

职责：

- 面向外部 API
- 读取 engine runtime context
- 生成 `Action`

不负责：

- primitive lowering
- operation resolving


## 7.2 lowering 层

职责：

- `Action -> Command[]`
- 做高层命令展开
- 做结构归一化

应该负责的典型事情：

- `field.convert` 展开为 field patch + rewrite instruction
- `field.duplicate` 展开为 field put + value copy + view repair instruction
- `field.option.remove` 展开为 field patch + affected value rewrite instruction
- `view.patch` 展开为更细粒度 primitive view mutation instruction，或者至少归一化为 canonical `view.put`

不负责：

- 最终 operation 生成
- batch 内 snapshot 迭代


## 7.3 resolve 层

职责：

- 只处理 `Command`
- 基于 `CommandContext` 产出 `BaseOperation[]`
- 不再继续 lower 高层命令

应该具备的特征：

- 每个 resolver 只对应一个 primitive command subtype
- resolver 本身纯函数化
- effect 只依赖 `ctx.read`


## 7.4 apply 层

职责：

- operation apply
- semantic draft
- commit delta

这层保持现在的方向即可，不是当前问题中心。


## 8. 对现有文件的具体建议

## 8.1 `command/commands/index.ts`

长期建议：

- 不再直接分发今天的完整 `Command`
- 改成只分发 primitive `Command`
- 最终从大 switch 收成 typed resolver registry

在那之前的过渡顺序应该是：

1. 先拆 `Action` / `Command`
2. 再把 `lowerActions` 做实
3. 再收 `resolveCommand`

不要反过来做。


## 8.2 `command/context.ts`

长期建议升级为真正的 `CommandContext` 提供者：

- `index`
- `doc`
- `read`

当前的 `indexCommand/deriveIndexedCommand` 只是很薄的一层，还不够。

最终 `deriveIndexedCommand` 的目标不是继续变复杂，而是直接消失。


## 8.3 `command/runCommands.ts`

长期建议：

- 输入改成 `Command[]`
- 在循环里每一步构造新的 `CommandContext`
- 每个 resolver 只读 `ctx.read`

这会让它成为真正稳定的 snapshot-based command execution pipeline。


## 8.4 `command/field/effects.ts`

长期建议：

- 改依赖 `ctx.read.views.list()`
- 不再直接依赖 `DataDoc`
- 进一步与 field rewrite policy 合并


## 8.5 `core/document`

我不建议把它继续做成更厚的 runtime-like API。

它更适合保持：

- 纯 document snapshot helper
- 无 store、无订阅、无 engine 语义

然后由 `engine/command` 自己把这些 helper 组织成 `CommandReadApi`。

这样职责边界更稳：

- `core/document` 是基础读写 helper
- `engine/command ctx.read` 是 command 专用 snapshot facade


## 8.6 哪些函数应该直接内联或删除

这里我不建议走“继续拆更多 helper”的方向。

当前 command 线已经有一些明显过薄的包装函数，它们只是在制造跳转，不在制造语义。

### 应该直接删除的

- `write/translate.ts` 里的 `translateCommands`
- `command/context.ts` 里的 `deriveIndexedCommand`
- `command/commands/shared.ts` 里的 `deriveCommand`

原因：

- `translateCommands` 现在只是执行主线的薄包装，没有形成真正的 lowering 边界。
- `deriveIndexedCommand` / `deriveCommand` 的存在，本质上是在纵容 resolver 内继续派生高层命令。
- 一旦 `Action -> Command[]` 下沉到独立 lowering 层，这三者都不再有长期价值。

长期最优里应直接变成：

- `lowerActions(document, actions)`
- `runCommands(document, commands)`

中间不再保留今天这种“看起来在翻译、实际上在继续 resolve”的空层。


### 应该直接内联进流水线的

- `command/context.ts` 里的 `indexCommand`
- `field/effects.ts` 里的 `buildViewPutOperation`
- `command/commands/view.ts` 里的 `buildViewPutOperation`
- `command/commands/shared.ts` 里的 `hasRecord`
- `command/commands/shared.ts` 里的 `hasView`
- `command/commands/shared.ts` 里的 `hasCustomField`

原因：

- `indexCommand` 只是在循环里补一个 `commandIndex`，更适合并进 `createCommandContext` 或 `runCommands` 的 loop。
- 两个 `buildViewPutOperation` 都只是一个 object literal 包装，不值得各自占一个 helper。
- `hasRecord` / `hasView` / `hasCustomField` 只是对 `core/document` 的再转发，等 `ctx.read` 形成后，应直接替换成：
  - `ctx.read.records.has(...)`
  - `ctx.read.views.has(...)`
  - `ctx.read.fields.has(...)`

这类“再包一层再换名字”的 helper，要么收进真正的 read api，要么直接内联，不要散落在 shared。


### 应该合并而不是继续分散的

- `cloneSearch`
- `cloneFilter`
- `cloneSorters`
- `cloneGroup`
- `cloneCalc`
- `cloneDisplay`

这些函数不是完全错误，但它们现在把 `applyViewPatch(...)` 切得过碎，阅读上会不断跳出主线。

长期建议不是保留六七个微型 clone helper，而是统一成两步：

- `applyViewPatch(view, patch)`
- `normalizeView(view, read)`

如果某一段 clone 逻辑只在 `applyViewPatch` 内用一次，就直接内联；
如果未来会被 `view.create` / `view.patch` 共同复用，再提成真正共享的 normalize helper。


## 8.7 哪些地方应该收成统一流水线

### `runCommands` 应该成为唯一执行流水线

今天 `resolveWriteBatch.ts` 里已经隐约有一条主线：

- 给命令编号
- resolve
- apply operations
- build delta draft
- 累加 issues

长期建议把这条线明确成一个稳定 pipeline：

```text
runCommands
  -> createCommandContext
  -> runCommand
  -> applyCommand
  -> collectDelta
```

这里关键不是多拆几个函数，而是明确：

- loop 只存在一处
- snapshot 推进只存在一处
- delta draft 构造只存在一处
- 失败短路只存在一处

也就是说，不要再让别的地方半路参与“继续执行下一条命令”的流程。


### `field` 相关命令应统一成两条派生流水线

现在 `field/resolve.ts` 里混着四种事情：

- 读 field
- 改 field schema
- 修 view
- 改 record values

长期更适合收成两条稳定流水线：

第一条：field schema 流水线

- `loadField`
- `buildNextField`
- `validateField`
- `emitFieldCommand`

第二条：field rewrite 流水线

- `repairFieldViews`
- `rewriteFieldValues`

这样之后：

- `field.create`
- `field.convert`
- `field.duplicate`
- `field.remove`
- `field.option.*`

都不必各自重新组织一遍 view/value 修补逻辑。


### `field.option.*` 应统一成一个 option patch 流水线

现在：

- `option.create`
- `option.update`
- `option.reorder`
- `option.remove`

都有自己的一段：

- 读 field
- 校验 option 支持
- 算 next options
- 走 `field.patch`
- 某些情况再补 value rewrite

这明显应该统一成：

```text
loadOptionField
  -> buildNextOptions
  -> patchFieldOptions
  -> rewriteOptionValues
```

也就是说：

- `option.create` / `update` / `reorder` / `remove`
- 不应该各自再调一次 `resolvePropertyPatchCommand`
- 更不应该再通过 `deriveCommand(...)` 伪装成另一条命令

它们要么在 `Action` lowering 阶段直接展开成 primitive `Command[]`，
要么在 command 层共用一套局部 pipeline，但不要一条条手写串接。


### `view.create` 和 `view.patch` 应共享同一套 normalize 流水线

这两类行为的共同点很强：

- 都要拿字段集合
- 都要规范化 query / calc / display / options
- 都要做完整 validate
- 最后都落到 `view.put`

所以长期建议统一成：

```text
buildViewInput
  -> normalizeView
  -> validateView
  -> emitViewPut
```

差异只在输入来源：

- `view.create` 从默认值和输入构造初始 view
- `view.patch` 从现有 view 和 patch 构造 next view

最终都汇到同一条 `normalizeView(...)` 主线，而不是一边走 create helper，一边走 patch helper。


### `record.apply` 和 `value.apply` 应共用 target 展开能力

它们今天都在做：

- 校验 target
- 把 target 展开成 record ids
- 为每个 record 生成 operation

这里不需要两套逻辑。

长期应保留一个非常直接的 helper：

- `listTargetRecordIds(read, target)`

剩下的差异只留在“生成哪种 operation”这一步。


## 9. 详细 API 设计

## 9.1 命名规则

这条线后续所有命名，我建议遵守几条硬规则：

- 用 `action` 表示高层意图。
- 用 `command` 表示 primitive 执行指令。
- 用 `lower` 表示从高层到低层的展开，不再用 `translate`。
- 用 `run` 表示整条执行流水线，不再把最外层叫 `resolveWriteBatch`。
- 用 `read` 表示 snapshot 读取能力。
- 用 `put` / `patch` / `remove` / `set` / `clear` 这类直接动词，不用过度抽象的词。

另外两条命名取舍我建议定死：

- 如果没有语义歧义，命令名优先用 `field.*`，不要继续用更长的 `customField.*`
- 文件名和函数名优先短而直白，例如 `runCommands`、`lowerActions`、`createCommandRead`，不要再引入 `executor`、`processor`、`handlerChain`、`manager` 这类泛词


## 9.2 建议的类型边界

长期建议把契约拆成两份：

- `core/contracts/actions.ts`
- `core/contracts/commands.ts`

其中：

- `actions.ts` 放对外意图层
- `commands.ts` 只放 primitive 命令层

建议形态：

```ts
export type Action =
  | { type: 'record.create'; input: RowCreateInput }
  | { type: 'record.apply'; target: EditTarget; patch: Partial<Omit<Row, 'id'>> }
  | { type: 'field.create'; input: FieldCreateInput }
  | { type: 'field.convert'; fieldId: FieldId; input: { kind: FieldKind } }
  | { type: 'field.duplicate'; fieldId: FieldId }
  | { type: 'field.option.create'; fieldId: FieldId; input?: { name?: string } }
  | { type: 'view.create'; input: ViewCreateInput }
  | { type: 'view.patch'; viewId: ViewId; patch: ViewPatch }
  | { type: 'view.open'; viewId: ViewId }
```

```ts
export type Command =
  | { type: 'record.insert'; records: Row[]; target?: RowInsertTarget }
  | { type: 'record.patch'; recordId: RecordId; patch: Partial<Omit<Row, 'id'>> }
  | { type: 'record.remove'; recordIds: RecordId[] }
  | { type: 'value.set'; recordId: RecordId; field: FieldId; value: unknown }
  | { type: 'value.patch'; recordId: RecordId; patch: Record<string, unknown> }
  | { type: 'value.clear'; recordId: RecordId; field: FieldId }
  | { type: 'field.put'; field: Field }
  | { type: 'field.patch'; fieldId: FieldId; patch: Partial<Omit<Field, 'id'>> }
  | { type: 'field.remove'; fieldId: FieldId }
  | { type: 'view.put'; view: View }
  | { type: 'view.remove'; viewId: ViewId }
  | { type: 'activeView.set'; viewId: ViewId }
  | { type: 'external.bumpVersion'; source: string }
```

重点不是字面必须完全一致，而是：

- `Action` 可以带语义
- `Command` 只能带执行
- `Command` 必须能单条 resolve，不再继续派生命令


## 9.3 建议的 engine 对外 API

长期建议把今天的 `engine.command(...)` 直接改成：

```ts
engine.action(action)
engine.action([action1, action2])
```

返回值继续保留：

- `issues`
- `applied`
- `changes`

如果还需要实体创建结果，也继续保留 `created`，但它属于 action 层结果，而不是 command 层结果。

原因很简单：

- facade/UI 发起的是意图，不是 primitive command
- 对外暴露 `command(...)` 这个名字，会持续混淆两层职责


## 9.4 建议的 lowering API

这一层建议非常简单：

```ts
export interface LowerActionsOptions {
  document: DataDoc
  actions: readonly Action[]
}

export const lowerActions = (options: LowerActionsOptions): Command[]
```

如果内部需要按条 lowering，再保留：

```ts
export const lowerAction = (
  document: DataDoc,
  action: Action
): Command[]
```

这里不建议再引入：

- `translator`
- `builder`
- `plannerFactory`

这些名字都会把简单的问题讲复杂。


## 9.5 建议的 command read API

建议形态：

```ts
export interface CommandRead {
  records: {
    list(): readonly Row[]
    get(recordId: RecordId): Row | undefined
    has(recordId: RecordId): boolean
  }
  fields: {
    list(): readonly Field[]
    get(fieldId: FieldId): Field | undefined
    has(fieldId: FieldId): boolean
  }
  views: {
    list(): readonly View[]
    get(viewId: ViewId): View | undefined
    has(viewId: ViewId): boolean
    activeId(): ViewId | undefined
    active(): View | undefined
  }
}
```

创建函数建议就叫：

```ts
export const createCommandRead = (document: DataDoc): CommandRead
```

不要缩成：

- `createCmdRead`
- `buildCtxRead`
- `makeResolverRead`

因为这些缩写既不短很多，也不更清楚。


## 9.6 建议的 command context API

建议形态：

```ts
export interface CommandContext {
  index: number
  doc: DataDoc
  read: CommandRead
}
```

创建函数：

```ts
export interface CreateCommandContextOptions {
  index: number
  doc: DataDoc
}

export const createCommandContext = (
  options: CreateCommandContextOptions
): CommandContext
```

这里不建议继续保留：

- `IndexedCommand`
- `indexCommand`

因为 `commandIndex` 只是执行时上下文，不是命令本体的一部分。
把 index 塞回命令对象，会让命令契约变脏。


## 9.7 建议的 resolve API

建议形态：

```ts
export interface CommandResult {
  issues: ValidationIssue[]
  operations: BaseOperation[]
}

export const runCommands = (
  document: DataDoc,
  commands: readonly Command[]
): ResolvedWriteBatch

export const runCommand = (
  ctx: CommandContext,
  command: Command
): CommandResult
```

然后由一个非常直接的 resolver map 承担分发：

```ts
export const commandResolvers: {
  [K in Command['type']]: (
    ctx: CommandContext,
    command: Extract<Command, { type: K }>
  ) => CommandResult
}
```

这里的重点是：

- `runCommands` 负责整条流水线
- `runCommand` 只负责单条命令
- resolver 只负责领域解析

三层边界一眼能看清，不需要再夹 `resolveWriteBatch -> resolveCommand -> deriveCommand -> resolveXxxCommand` 这种折返。


## 9.8 建议保留的少量共享 helper

不是所有 helper 都该删。

长期应该只保留真正跨命令复用、而且能明显缩短主线阅读的 helper，例如：

- `listTargetRecordIds(read, target)`
- `validateTarget(read, command, target)`
- `repairFieldViews(read, field)`
- `repairRemovedFieldViews(read, fieldId)`
- `rewriteFieldOptionValues(read, field, removedOptionId)`
- `normalizeView(view, read)`
- `validateView(view, read, command)`

这些 helper 的共同点是：

- 复用强
- 语义完整
- 不只是 object literal 包装

反过来，下面这些就不值得存在：

- 再包一层 `hasXxx`
- 再包一层 `buildXxxOperation`
- 再包一层 `deriveXxxCommand`


## 10. 分阶段实施方案

这里的“分阶段”不是为了保留兼容层，而是为了控制改动面和验证顺序。

每个阶段完成后都应该直接删掉旧实现，不保留双轨。


## 10.1 第一阶段：拆 `Action` / `Command`

目标：

- 新建 `core/contracts/actions.ts`
- 把高层命令迁移成 `Action`
- 把 `core/contracts/commands.ts` 收成 primitive `Command`

同时做的清理：

- `customField.*` 命令名统一改成 `field.*`
- public facade 和 engine API 只产出 / 接收 `Action`

这一阶段结束的判断标准：

- 对外只剩 `Action`
- 对内只剩 primitive `Command`
- 旧的混合 `Command` union 完全删除


## 10.2 第二阶段：建立真正的 lowering 层

目标：

- 新建 `engine/action/lower.ts`
- 提供 `lowerAction` / `lowerActions`
- 把高层业务展开从 resolver 里挪出去

优先迁移：

- `field.convert`
- `field.duplicate`
- `field.option.*`
- `view.patch`
- `record.apply`
- `value.apply`

同时删除：

- `write/translate.ts` 当前的空包装实现
- `deriveIndexedCommand`
- `deriveCommand`

这一阶段结束的判断标准：

- resolver 内不再派生新命令
- `resolveCommand` 只吃 primitive `Command`


## 10.3 第三阶段：接入 `CommandReadApi`

目标：

- 新建 `createCommandRead`
- 新建 `createCommandContext`
- resolver/effect 全部改读 `ctx.read`

优先替换：

- `field/effects.ts`
- `field/resolve.ts`
- `commands/view.ts`
- `commands/record.ts`

同时删除：

- `shared.ts` 里对 `core/document` 的薄包装读取函数
- resolver/effect 里直接散落的 `getDocumentXxx(...)`

这一阶段结束的判断标准：

- command 层不再直接 import `core/document` 读取 helper
- 全部 snapshot 读取统一走 `ctx.read`


## 10.4 第四阶段：收 resolver 结构

目标：

- `commands/index.ts` 从大 switch 收成 `commandResolvers`
- `runCommands` 成为唯一执行主线
- `indexCommand` 内联进 context 创建过程

同时整理目录：

- `command/commands/*` 改成 `command/resolvers/*`
- `field/effects.ts` 改成 `command/rewrites/fieldViews.ts` 或类似短名

这一阶段结束的判断标准：

- 一条命令只进一个 resolver
- resolver 文件不再承担 lowering
- 执行主线只剩一处 loop


## 10.5 第五阶段：合并 rewrite 流水线

目标：

- 把 field view repair 统一成一套
- 把 field option value rewrite 统一成一套
- 把 view create / patch normalize 统一成一套
- 把 record/value target 展开统一成一套

建议收成的函数只有这些级别：

- `repairFieldViews`
- `rewriteFieldOptionValues`
- `normalizeView`
- `listTargetRecordIds`

而不是继续拆出一堆 `build` / `apply` / `derive` / `effect` 小函数。

这一阶段结束的判断标准：

- field / view / record 三条线的重复流程明显收敛
- 领域 helper 数量下降，但单个 helper 语义更完整


## 10.6 第六阶段：清理命名和旧文件

目标：

- 统一 `action` / `command` / `read` / `run` / `lower`
- 删掉所有历史名词：
  - `translate`
  - `derive`
  - `effects`（如果只是 rewrite）
  - `ExternalCommand`
  - `InternalCommand`

同时检查：

- 文件名是否短而直白
- 函数名是否直接表达动作
- 有没有新的缩写和抽象词回流

这一阶段结束的判断标准：

- 目录一眼能看出层次
- 函数名一眼能看出职责
- 不再需要靠文档解释“这个 helper 到底在第几层”


## 11. 最终判断

如果完全按长期最优来做，我的建议非常明确：

- 不要再让一套 `Command` 同时承担高层意图和内部 primitive 指令。
- 不要让 resolver 内继续承担 lowering。
- 不要让 command 层继续堆薄包装函数。
- 不要把 `engine.read` 引进 command pipeline。
- 应该引入基于 `workingDocument` 的 `CommandReadApi`，作为 resolver/effect 唯一读入口。

也就是说，最优解不是：

- “把 `resolveCommand` 换一种写法”
- “再拆几个 helper”
- “再补一层抽象名词”

而是：

- 重新定义 `Action` / `Command`
- 把 `lowerActions` 做实
- 把 `runCommands` 收成唯一执行主线
- 用 `ctx.read` 替代 document helper 直读
- 把 field / view / record 的重复修补逻辑收成少量完整 helper

只有这样，这条线才算真正打平，而且不会把复杂度从控制流转移到命名和跳转上。
