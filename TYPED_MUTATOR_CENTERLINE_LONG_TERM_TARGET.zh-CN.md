# Typed Mutator 中轴长期最优形态

## 1. 目标

本文不是过渡 checklist，而是 dataview / whiteboard mutation compile 体系的长期目标态说明。

目标只有三条：

- compile 只负责“读当前状态、做领域决策、产出目标状态或写入 recipe”。
- typed mutator 只负责“把稳定的领域写入语义编码成 program step”。
- shared 只负责“跨 domain 通用能力”，绝不承接 dataview / whiteboard 的领域语义。

最终不保留第二套实现，不保留桥接层，不保留过渡 helper。

## 2. 三层中轴

长期最优形态必须稳定分成三层：

### 2.1 shared

`@shared/core` 与 `@shared/mutation` 只提供跨 domain 通用能力：

- JSON-like clone / equal / diff
- generic mutation writer / ports / handler table
- compile context control API
- compile reader tools 协议

shared 不知道：

- dataview 的 `title` / `values.<fieldId>`
- dataview 的 view finalize / validate 规则
- whiteboard 的 canvas ref 编码
- whiteboard 的 edge anchor 语义
- mindmap / lock / layout / aggregate ownership

### 2.2 domain typed mutator

每个 domain 在 shared ports 之上再包一层“typed mutator 中轴”。

它负责：

- 领域 path 编码
- 领域 anchor 编码
- 领域 ref 编码
- 稳定的多步 lowering recipe
- compile 不该重复知道的写入协议

它不负责：

- 读取 document
- 查找实体
- 业务校验
- lock decision
- layout 计算
- compile orchestration

### 2.3 compile local orchestration

compile handler 只保留下面几类事情：

- 从 `ctx.reader` 读取当前状态
- 调用 layout / registry / service 做领域决策
- 校验 intent 与实体关系
- 生成 `next entity` 或组装 typed mutator recipe 入参
- 调 `ctx.program` 发写入

compile 不再保留：

- 第二套 require helper
- 第二套 issue / fail helper
- 第二套 custom planner bridge
- 对 raw ordered anchor / raw ref key / raw patch path 的散落编码

## 3. 最终 API 骨架

每个 domain compile 都应该对齐成同一骨架：

```ts
export const compile = {
  createReader,
  createProgram,
  handlers
} as const
```

其中：

- `createReader(readDocument, tools?)` 返回 compile reader facade
- `createProgram(writer)` 返回 domain typed mutator
- `handlers` 只收 `ctx`

compile handler 内部最终只允许稳定依赖四类入口：

```ts
ctx.intent
ctx.reader
ctx.program
ctx.issue / ctx.invalid / ctx.cancelled / ctx.fail
```

如果 handler 还需要：

- `requireXxx(...)`
- `reportIssues(...)`
- `failInvalid(...)`
- `runCustomPlanner(...)`
- `canvasRefKey(...)`
- `toOrderedAnchor(...)`

说明中轴还没收拢完。

## 4. shared 最终承接边界

### 4.1 `@shared/core`

shared core 长期只承接纯数据能力：

- `json.clone(value)`
- `json.equal(left, right)`
- `json.diff(base, next)`

其中 `json.diff(base, next)` 的语义应该保持通用：

- plain object 递归 diff
- array 默认整值替换
- primitive 直接替换
- 删除字段用 `undefined` 表达

不允许把下面这些塞进 shared `json.diff(...)`：

- dataview 的 `id` 忽略规则
- whiteboard 的 edge / node 特判
- schema comparator
- domain exclude list

### 4.2 `@shared/mutation`

shared mutation 长期承接 generic compile / writer 体系：

- `MutationProgramWriter`
- `MutationProgram`
- `createMutationPorts(registry, writer)`
- `MutationCompileHandlerTable`
- `MutationCompileHandlerInput`
- `MutationCompileReaderTools`

以及 compile control API：

```ts
ctx.issue(issue)
ctx.issue(...issues)
ctx.invalid(message, details?, path?)
ctx.cancelled(message, details?, path?)
ctx.fail(issue)
ctx.stop()
```

shared 不应继续扩张到：

- `updateView(...)`
- `updateNode(...)`
- `updateMindmap(...)`
- `requireNode(...)`
- `requireView(...)`
- `writeRecordValuesMany(...)`

这些都已经带 domain 语义，不属于 shared。

### 4.3 shared 不必承接的东西

shared 虽然可以进一步提供一些“看起来通用”的 builder，但长期并不值得承接：

- 通用 `ctx.require(...)`
- 通用 entity update helper
- 通用 ordered aggregate patch helper

原因很简单：

- 真正稳定的调用面是 `ctx.reader.<namespace>.require(...)`
- 真正复杂的 update 流程都绑定 domain finalize / validate / ownership 规则
- 抽成 shared 只会制造新的伪抽象

## 5. `ctx.reader` 的最终形态

reader 中轴的目标不是把 document reader 变复杂，而是让 compile 看到的 facade 一次到位。

底层 document reader 保持纯读：

- `get`
- `has`
- `list`
- `ids`
- domain-specific read helper

compile reader facade 额外提供：

- `ctx.reader.records.require(targetOrId, path?)`
- `ctx.reader.fields.require(id, path?)`
- `ctx.reader.views.require(id, path?)`
- `ctx.reader.nodes.require(id, path?)`
- `ctx.reader.edges.require(id, path?)`
- `ctx.reader.groups.require(id, path?)`
- `ctx.reader.mindmaps.require(id, path?)`

长期原则：

- namespace 上统一只叫 `require(...)`
- 不发明 `requireValue(...)`
- 不发明 `requireTarget(...)`
- 不发明 `requireNode(...)`
- 不发明 `requireView(...)`

对象类型由 namespace 表达，参数类型由签名表达，不再靠 helper 名字重复一遍。

## 6. typed mutator 的最终定义

typed mutator 不是“program 的别名”，而是 domain write centerline。

它的判断标准是：

- 如果这是稳定写入协议，应收进 typed mutator。
- 如果这是读取、校验、决策，不应收进 typed mutator。

### 6.1 应收进 typed mutator 的能力

- `FieldId -> record patch path`
- `CanvasItemRef -> canvas ordered item key`
- domain anchor -> shared ordered anchor
- `current entity + next entity -> mutation steps`

### 6.2 不应收进 typed mutator 的能力

- 从 `ctx.document` 找实体
- 检查实体是否存在
- 检查 lock
- 执行 layout
- 选择“应该删整个 mindmap 还是删 topic”
- 选择“这次更新是否合法”

### 6.3 最关键的区分

如果一个 helper 只是“把 compile 已经决定好的写入语义编码到 program”，它就该下沉到 typed mutator。

如果一个 helper 还在替 compile 做业务判断，它就不该下沉。

## 7. Dataview 的长期最优形态

### 7.1 Dataview shared 承接项

shared 已经承接或应继续承接：

- `json.diff(base, next)`
- compile control API
- generic compile handler table

### 7.2 Dataview typed mutator 应承接的项

dataview typed mutator 的长期中轴应该承接：

- `record.writeValuesMany(...)`
- `view.applyUpdate(current, next)`

其中：

- `record.writeValuesMany(...)` 负责把字段写入编码成 `title` / `values.<fieldId>`
- `view.applyUpdate(current, next)` 负责把 view diff lowering 成 filter / sort / group / display / order / options 等 program ops

这两类都属于稳定写入协议，不应该继续散在 compile helper 里。

### 7.3 Dataview compile local 应保留的项

dataview compile 还应保留 domain 决策层：

- `finalizeView(reader, view)`
- `validateView(reader, source, view)`
- `updateView(...)`
- `updateTypedView(...)`
- `updateGroupedView(...)`

这一层非常像 React `setState`，但它不是 shared primitive，而是 dataview view aggregate 的 compile primitive。

长期目标写法：

```ts
const updateView = (
  ctx,
  recipe: (view: View) => View | undefined
) => {
  const current = ctx.reader.views.require(ctx.intent.id)
  if (!current) {
    return
  }

  const drafted = recipe(current)
  if (!drafted) {
    return
  }

  const next = finalizeView(ctx.reader, drafted)
  ctx.issue(...validateView(ctx.reader, ctx.source, next))
  ctx.program.view.applyUpdate(current, next)
}
```

在这个形态里，call site 只表达领域 patch：

```ts
updateView(ctx, (view) => ({
  ...view,
  group: viewApi.group.clear(view.group)
} as View))
```

### 7.4 Dataview 可以直接替换掉的旧 helper

应永久消失的旧 helper / 旧分层：

- `compile/base.ts`
- `requireValue(...)`
- `resolveTarget(...)`
- `issue(...)`
- `reportIssues(...)`
- `createEntityPatch(...)`
- `writeViewDisplayInsert(...)`
- `writeViewOrderInsert(...)`
- compile 里的大 switch 分发桥接

### 7.5 Dataview 最终最简 compile 形态

最终 dataview compile 只有三类东西：

#### 1. 读取

```ts
ctx.reader.records.require(...)
ctx.reader.fields.require(...)
ctx.reader.views.require(...)
```

#### 2. 决策

```ts
finalizeView(...)
validateView(...)
updateView(...)
updateTypedView(...)
updateGroupedView(...)
```

#### 3. 发写入

```ts
ctx.program.record.writeValuesMany(...)
ctx.program.view.applyUpdate(current, next)
ctx.program.view.create(...)
ctx.program.document.patch(...)
```

除此之外不再保留第二层 helper 墙。

## 8. Whiteboard 的长期最优形态

### 8.1 Whiteboard shared 承接项

shared 只承接：

- compile control API
- generic handler table
- generic program writer / ports

不承接：

- lock
- layout
- mindmap aggregate
- canvas order ref 编码
- edge ordered anchor 适配

### 8.2 Whiteboard typed mutator 应承接的项

whiteboard typed mutator 的长期中轴应该承接：

- `canvasOrder().moveRef(ref, to)`
- `canvasOrder().spliceRefs(refs, to)`
- `canvasOrder().deleteRef(ref)`
- `edgeLabels(edgeId).insert(value, to?)`
- `edgeLabels(edgeId).move(itemId, to?)`
- `edgeRoute(edgeId).insert(value, to?)`
- `edgeRoute(edgeId).move(itemId, to?)`

也就是：

- `CanvasItemRef -> key`
- `EdgeLabelAnchor / EdgeRoutePointAnchor -> MutationOrderedAnchor`

这些都是稳定编码协议，compile 不该知道细节。

### 8.3 Whiteboard 不应硬追求一个通用 `updateEntity(...)`

whiteboard 和 dataview 不同。

它的 compile 决策层天然更重，原因包括：

- layout service 参与
- lock decision 参与
- aggregate ownership 参与
- mindmap root / member 规则参与
- node / edge / canvas / mindmap 的行为边界不同

所以 whiteboard 不应为了“形式统一”硬做一个假的全局：

```ts
updateEntity(ctx, entity => next)
```

这会把真实的领域差异抹平，最后只剩一层抽象噪音。

whiteboard 更合理的长期形态是：

- compile 继续按 aggregate 分文件
- 每个 aggregate 只保留少量 compile-local recipe helper
- 所有纯写入编码都沉到 typed mutator
- 所有 custom planner bridge 彻底删除

### 8.4 Whiteboard compile local 应保留的项

长期应该保留在 compile 层的，是这些“仍然在做业务决策”的 recipe：

- `emitMindmapDelete(...)`
- `emitMindmapMove(...)`
- `emitMindmapTopicInsert(...)`
- `emitMindmapTopicPatch(...)`
- `emitEdgeRouteDiffOps(...)`
- `compileCanvasDelete(...)`
- `compileCanvasDuplicate(...)`

它们不适合 shared，也不适合 raw typed mutator，原因是：

- 它们依赖 `ctx.reader`
- 它们依赖 `ctx.services`
- 它们会做 ownership / aggregate / lock / layout 决策
- 它们不是单纯编码

但它们应保持为 compile-local helper，而不是再套一层 planner 桥。

### 8.5 Whiteboard 应直接删除的旧层

应永久消失：

- `runCustomPlanner(...)`
- `WhiteboardCustomPlanContext`
- `WhiteboardCustomOperation`
- planner bridge entry
- `compile/write.ts` 中纯 `program.xxx` 转发 helper

如果一个 helper 只是：

```ts
ctx.program.node.create(node)
```

换了个名字再包一层，它就不该存在。

### 8.6 Whiteboard 最终最简 compile 形态

最终 whiteboard compile 只保留三类东西：

#### 1. 读取

```ts
ctx.reader.nodes.require(id)
ctx.reader.edges.require(id)
ctx.reader.groups.require(id)
ctx.reader.mindmaps.require(id)
```

#### 2. 决策

```ts
resolveLockDecision(...)
layout.commit(...)
mindmap ownership / aggregate routing
compile-local emitXxx recipe
```

#### 3. 发写入

```ts
ctx.program.node.create/patch/delete(...)
ctx.program.edge.create/patch/delete(...)
ctx.program.canvasOrder().moveRef(...)
ctx.program.edgeLabels(edgeId).insert/move(...)
ctx.program.edgeRoute(edgeId).insert/move(...)
ctx.program.mindmap.create/patch/delete(...)
ctx.program.mindmapTree(id).insert/move/delete/patch(...)
```

## 9. 哪些能力可以一同下沉

### 9.1 可以一同下沉到 shared 的

- compile control API
- `json.diff(...)`
- `MutationCompileReaderTools`
- generic handler table / generic ports / generic writer

### 9.2 可以一同下沉到各自 domain typed mutator 的

Dataview：

- `writeRecordValuesMany` -> `record.writeValuesMany`
- `writeViewUpdate` -> `view.applyUpdate`

Whiteboard：

- `canvasRefKey(...)` -> `canvasOrder().moveRef/spliceRefs/deleteRef`
- `toOrderedAnchor(...)` for edge label / route -> `edgeLabels/edgeRoute` namespace

### 9.3 不该一起下沉的

- `updateView(...)`
- `finalizeView(...)`
- `validateView(...)`
- `emitMindmapDelete(...)`
- `emitMindmapMove(...)`
- `resolveLockDecision(...)`
- `layout.commit(...)`

它们不是编码层，而是 compile 决策层。

## 10. 统一命名约束

长期最优形态下，命名必须统一，不再多套并存。

### 10.1 读取

- 统一使用 `ctx.reader.<namespace>.require(...)`

### 10.2 控制流

- 统一使用 `ctx.issue(...)`
- 统一使用 `ctx.invalid(...)`
- 统一使用 `ctx.cancelled(...)`
- 统一使用 `ctx.fail(...)`

### 10.3 写入

- raw entity write 直接用 `ctx.program.<namespace>.<verb>(...)`
- 领域编码写入用 `ctx.program.<namespace>.<domainVerb>(...)`
- 不再保留 `writeXxx(...)` 这类 compile helper 名字，除非它真的是 compile-local recipe

### 10.4 compile recipe

- dataview 倾向 `updateView(...)`
- whiteboard 倾向 `emitXxx(...)` / `compileXxx(...)`

不要反过来：

- dataview 不要发明一堆 `emitViewXxx(...)`
- whiteboard 不要硬凑一个假的全局 `updateEntity(...)`

## 11. 长期最优的最简分层图

```txt
shared/core
  json.clone / json.equal / json.diff

shared/mutation
  MutationProgramWriter
  createMutationPorts
  MutationCompileHandlerInput
  ctx.issue / ctx.invalid / ctx.cancelled / ctx.fail

domain/compile/reader
  ctx.reader.<namespace>.get/has/list/require

domain/mutation/program
  ctx.program raw typed ports
  + domain typed mutator methods

domain/compile
  aggregate-local decision
  finalize / validate / lock / layout / routing
  emit to ctx.program
```

如果某层出现下面这些反向依赖，就说明设计退化了：

- shared 知道 domain path / ref / anchor
- compile 自己编码 domain patch path / ordered anchor
- planner 只是 compile 的跳板
- document reader 直接长成 compile helper 仓库

## 12. 最终结论

长期最优形态不是“把所有 helper 都上提”，而是只上提真正稳定的写入协议。

最终边界应当是：

- shared 承接通用能力
- domain typed mutator 承接稳定写入编码
- compile 承接领域决策

对 dataview 来说，最关键的是形成：

- `ctx.reader.*.require(...)`
- `updateView(...)`
- `ctx.program.record.writeValuesMany(...)`
- `ctx.program.view.applyUpdate(current, next)`

对 whiteboard 来说，最关键的是形成：

- `ctx.reader.*.require(...)`
- 无 planner bridge
- `ctx.program.canvasOrder().moveRef(...)`
- `ctx.program.edgeLabels/edgeRoute` 吞掉 anchor 适配
- compile 只保留 aggregate-local decision helper

这就是长期最优、最薄、没有第二套实现的 typed mutator 中轴形态。
