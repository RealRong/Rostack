# shared/mutation 长期最优重构方案

## 结论

`shared/mutation` 需要重写，但不是重写它的核心语义，而是**重写它的公共抽象边界与内部分层**。

当前的问题不是功能不够，而是：

1. 同一套 mutation 能力被表达了两遍：
   - `MutationModel`
   - `MutationRegistry` / `MutationPorts`
2. runtime 同时兼容两套输入形态，导致：
   - 类型参数过多
   - `apply/runtime/structural/entity` 到处双分支
   - 很多 public API 只是历史残留
3. 一些 primitive 已经没有真实使用价值，但仍然挂在公共面上。

长期最优目标不是继续修补，而是收敛成：

- **一套 schema**
- **一套 typed writer / reader / delta**
- **一套 low-level program**
- **一套 runtime**

除此之外都删掉。

---

## 一、当前问题

### 1.1 双体系并存

现在 shared mutation 同时维护：

- model 体系
  - `defineMutationModel`
  - `createMutationWriter`
  - `createMutationReader`
  - `createMutationDelta`
- registry 体系
  - `MutationRegistry`
  - `defineMutationRegistry`
  - `createMutationPorts`

而 runtime 又同时支持：

- `model`
- `registry`
- `createWriter`
- `createReader`

这直接导致：

- [shared/mutation/src/engine/runtime.ts](/Users/realrong/Rostack/shared/mutation/src/engine/runtime.ts) 有大量 fallback 分支
- [shared/mutation/src/engine/program/apply.ts](/Users/realrong/Rostack/shared/mutation/src/engine/program/apply.ts) 同时维护 access-based 与 path-based 两套 apply 路径
- [shared/mutation/src/engine/structural.ts](/Users/realrong/Rostack/shared/mutation/src/engine/structural.ts) 依赖 registry 风格结构 spec
- [shared/mutation/src/model.ts](/Users/realrong/Rostack/shared/mutation/src/model.ts) 又反过来把 model compile 成 registry

这是当前复杂度的第一来源。

### 1.2 类型系统过度泛化

当前公共 API 里存在大量“泛化了但没带来真实价值”的类型参数：

- `Op`
- `Tag extends string`
- `mapFamily` / `tableFamily`
- `MutationPorts<TRegistry, Tag>`
- commit 上多层 generic 套娃

其中最典型的问题是：

- `MutationCommit<Doc, Op, ...>` / `ApplyCommit<Doc, Op, ...>` 的 `Op` 本身并没有出现在 commit payload 字段里，只是在 type alias 上传递复杂度。
- `Tag` 在真实使用里基本都是 `string`。
- `mapFamily` / `tableFamily` 在 access.read/write 已经完全显式的前提下，不该继续作为核心概念存在。

### 1.3 低价值 public primitive 过多

研究现有使用方后，以下公共能力几乎没有真实外部价值：

- `createMutationPorts`
- `defineMutationRegistry`
- `MutationPorts`
- `entity.patchMany`
- `writer.signal(...)`
- `unset()`
- public `tree.restore(...)`

这些能力要么没有外部调用，要么只是内部实现细节，要么已经被更好的 typed writer 取代。

### 1.4 核心文件过大，职责混杂

当前核心文件规模已经明显失控：

- `model.ts`: 2180 行
- `structural.ts`: 1255 行
- `runtime.ts`: 859 行
- `program/apply.ts`: 772 行
- `entity.ts`: 683 行

问题不是“文件长”本身，而是每个文件同时承担了：

- public type DSL
- schema compile
- writer generation
- reader generation
- typed delta generation
- entity/path patch lowering
- structural reducer

这会让任何后续修改都牵一发动全身。

---

## 二、必须删除的能力

以下能力在长期最优设计中必须删除，不保留兼容层。

### 2.1 删除 registry / ports 公共体系

删除：

- `MutationRegistry`
- `MutationEntityRegistrySpec`
- `MutationOrderedRegistrySpec`
- `MutationTreeRegistrySpec`
- `defineMutationRegistry(...)`
- `MutationPorts`
- `createMutationPorts(...)`

原因：

1. 这是历史第一套表达体系。
2. 现有 dataview / whiteboard 已经可以统一到 model schema。
3. runtime / apply / structural 因为兼容这套体系变得更复杂。

最终 shared mutation 只接受 **schema**，不再接受 registry。

### 2.2 删除 `mapFamily` / `tableFamily` 二分

统一改成单一 `collection(...)`。

原因：

1. 现在 family 的真实存取语义已经完全由 `access.read/write` 决定。
2. `map` 和 `table` 的差异，本质上只是文档存储形态，不应该成为 mutation kernel 的核心类型分叉。
3. 一旦移除 registry/path fallback，`table` 特有的 `ids/byId` 根路径逻辑也应该消失。

最终 family 只保留：

- `singleton`
- `collection`

### 2.3 删除 path-based entity apply fallback

删除 [shared/mutation/src/engine/program/apply.ts](/Users/realrong/Rostack/shared/mutation/src/engine/program/apply.ts) 与 [shared/mutation/src/engine/entity.ts](/Users/realrong/Rostack/shared/mutation/src/engine/entity.ts) 中所有“不走 access、直接按 root path / byId path 写 document”的分支。

原因：

1. schema family 已经强制要求 `access.read/write`。
2. path fallback 只是为了兼容 registry / raw entity spec。
3. 这套分支让 `entity.ts` / `apply.ts` 复杂度翻倍。

最终所有 entity apply 都走：

- `access.read(document)`
- `access.write(document, next)`

### 2.4 删除 `entity.patchMany`

删除：

- `MutationProgramWriter.entity.patchMany`
- `MutationWriter.collection.patchMany`
- 对应 program step `entity.patchMany`

原因：

1. 外部几乎没有使用。
2. 它不是 primitive，只是批量 convenience。
3. compile 层完全可以自己展开成多次 `patch`。

### 2.5 删除 public `writer.signal(...)`

删除：

- `MutationProgramWriter.signal`
- `MutationWriter.signal`
- `signal` program step

原因：

1. 现有业务没有真实使用。
2. delta 不应通过“额外手工发信号”修补 schema 表达不足。
3. 这会鼓励绕过 schema，继续制造隐式协议。

### 2.6 删除 public `unset()`

删除 `unset()` public helper。

原因：

1. 外部没有真实使用。
2. 语义上应该直接通过更明确的 patch / remove / delete API 表达。
3. 这个 helper 会把“字段删除”和“字段置空”继续混在一起。

### 2.7 删除 public `tree.restore(...)`

`tree.restore` 可以保留为 **内部 inverse primitive**，但不再出现在 public typed writer 上。

原因：

1. 业务侧没有直接使用。
2. 它本质上是 runtime/history 的恢复语义，不是 compile 层的常规写入原语。

### 2.8 删除 commit / engine 上无价值的泛型

删除：

- commit 系列类型上的 `Op`
- program / writer / commit 上公开的 `Tag extends string` 泛型

原因：

1. `Op` 没有进入 commit payload。
2. `Tag` 当前实际都退化为 `string`。
3. 这两套 generic 只是在整条类型链上放大复杂度。

---

## 三、最终保留的核心能力

shared mutation 最终只保留下面四层。

### 3.1 Schema

唯一配置入口：

```ts
const schema = defineMutationSchema<Document>()({
  document: singleton<Document>()({...}),
  node: collection<NodeId, Node>()({...}),
  ui: namespace({
    preview: collection<NodeId, PreviewNode>()({...})
  })
})
```

建议命名统一为：

- `defineMutationSchema`
- `namespace`，替代 `group`
- `singleton`
- `collection`，替代 `mapFamily` / `tableFamily`
- `value`
- `object`，替代 `record`
- `dictionary`，替代 `keyed`
- `sequence`，替代 `ordered`
- `tree`

这里的命名必须服务于“语义明确”，而不是延续历史名词。

### 3.2 Typed writer / reader / delta

围绕同一个 schema 自动生成：

```ts
const writer = createMutationWriter(schema, program)
const reader = createMutationReader(schema, readDocument)
const delta = createMutationDelta(schema, rawDelta)
```

这里仍然保留 typed API，但不再同时维护第二套 ports facade。

### 3.3 Low-level program

保留 `MutationProgram` 和 `createMutationProgramWriter()`，但角色要收窄为：

- low-level immutable step batch
- history / collab / serialization 的统一载体

program primitive 最终只保留：

- `entity.create`
- `entity.patch`
- `entity.delete`
- `ordered.insert`
- `ordered.move`
- `ordered.splice`
- `ordered.patch`
- `ordered.delete`
- `tree.insert`
- `tree.move`
- `tree.patch`
- `tree.delete`
- `tree.restore`（内部 inverse 专用）

### 3.4 Runtime

`MutationEngine` 只接受：

- `schema`
- `document`
- `normalize`
- `compile`
- `history`

不再接受：

- `registry`
- `createReader`
- `createWriter`

### 3.5 Compile context

`reader` / `writer` 仍然存在，但它们应该由 engine 基于 `schema` 自动生成，不应该再作为 `MutationEngine` 顶层注入点暴露出来。

真正需要允许业务自定义的不是：

- `createReader`
- `createWriter`

而是 compile 自己的 domain context / query 组装。

最终语义应该是：

1. engine 内部固定使用 `createMutationReader(schema, readDocument)`
2. engine 内部固定使用 `createMutationWriter(schema, program)`
3. compile 如果需要更高层 query facade，就在自己的 `createContext(...)` 里包装

这样职责边界才清楚：

- `engine` 负责 mutation runtime
- `compile` 负责 domain context
- `query` / `expect` 是 compile 局部能力，不是 engine 核心协议

---

## 四、最终 API 设计

```ts
const schema = defineMutationSchema<Document>()({
  document: singleton<Document>()({
    access: {...},
    members: {
      activeViewId: value<ViewId | undefined>(),
      meta: object<Record<string, unknown> | undefined>()
    },
    changes: ({ value, object }) => ({
      activeViewId: [value('activeViewId')],
      meta: [object('meta').deep()]
    })
  }),

  node: collection<NodeId, Node>()({
    access: {...},
    members: {
      geometry: object<NodeGeometry>(),
      data: object<NodeData>(),
      meta: object<NodeMeta | undefined>()
    },
    changes: ({ object }) => ({
      geometry: [object('geometry').deep()],
      data: [object('data').deep()],
      meta: [object('meta').deep()]
    }),
    sequence: {
      ports: sequence<NodePort>()({
        read: ...,
        write: ...,
        identify: (port) => port.id,
        emits: 'ports'
      })
    }
  }),

  preview: namespace({
    node: collection<NodeId, PreviewNode>()({...})
  })
})

type Writer = MutationWriter<typeof schema>
type Reader = MutationReader<typeof schema>
type Delta = MutationDeltaOf<typeof schema>
```

```ts
const compile = defineMutationCompile({
  createContext: ({ document, reader, writer, tools, services }) => ({
    document,
    reader,
    writer,
    query: createDataviewQuery(reader),
    expect: createDataviewExpect(reader, tools),
    services,
    ...tools
  }),
  handlers
})

const engine = new MutationEngine({
  schema,
  document,
  normalize,
  compile,
  history
})
```

这个 API 的关键点：

1. 一处定义。
2. writer / reader / delta 全部自动派生。
3. compile/runtime/history 都围绕同一份 schema。
4. 不再需要 registry 和 ports。
5. engine 顶层不再暴露 `createReader/createWriter` 这种第二套注入协议。

---

## 五、内部实现重排

最终目录应重排为下面这种结构：

```txt
shared/mutation/src/
  schema/
    index.ts
    compile.ts
    types.ts
  writer/
    index.ts
  reader/
    index.ts
  delta/
    index.ts
  program/
    index.ts
    types.ts
    writer.ts
    applyEntity.ts
    applyStructure.ts
  engine/
    index.ts
    runtime.ts
    compile.ts
  history/
    controller.ts
    port.ts
  index.ts
```

必须删除这些文件或将其内容吸收到新的分层里：

- `engine/registry.ts`
- `engine/ports.ts`
- `engine/entity.ts` 当前形态
- `engine/structural.ts` 当前形态

其中：

- `entity.ts` 应拆成 schema compile + entity reducer helper
- `structural.ts` 应拆成 ordered reducer / tree reducer
- `model.ts` 不再同时承载 schema DSL、writer、reader、delta、compile 五件事

---

## 六、历史能力的最终边界

history 核心本身保留，但要收边界。

### 保留

- undo / redo / clear
- remote footprint invalidation
- publish confirm / cancel

### 移出 shared/mutation kernel

- `withPolicy(...)`
- `confirmOnSuccess`
- `cancelOnFailure`

这些更适合放到：

- `shared/collab`
- UI/runtime wrapper

原因：

1. 它们是调用策略，不是 mutation kernel 核心。
2. 把它们留在 `localHistory.ts` 会让 history public API 比真正需要的更重。

---

## 七、实施方案

不保留兼容，不做双轨。

### 阶段 1：先重建公共 API

1. 引入 `defineMutationSchema`
2. `group -> namespace`
3. `mapFamily/tableFamily -> collection`
4. `record -> object`
5. `keyed -> dictionary`
6. `ordered -> sequence`
7. compile 增加 `createContext(...)`

这一阶段完成后，所有业务 schema 先切到新命名。

### 阶段 2：收紧 engine 顶层 API

1. `MutationEngine` 删除 `createReader`
2. `MutationEngine` 删除 `createWriter`
3. engine 内部固定：
   - `createMutationReader(schema, readDocument)`
   - `createMutationWriter(schema, program)`
4. dataview / whiteboard compile 改为通过 `createContext(...)` 注入 query / expect

### 阶段 3：删除 registry / ports

1. 删除 `MutationRegistry`
2. 删除 `defineMutationRegistry`
3. 删除 `createMutationPorts`
4. runtime 删除 `registry` 入口
5. apply / structural 删除 registry 依赖

### 阶段 4：删除 path fallback

1. 所有 family 只走 `access.read/write`
2. 删除 `rootKey/byId/ids path` 逻辑
3. `entity.ts` / `apply.ts` 只保留 access-based reducer

### 阶段 5：精简 low-level primitive

1. 删除 `entity.patchMany`
2. 删除 public `signal`
3. 删除 public `unset`
4. `tree.restore` 降为内部 inverse primitive

### 阶段 6：压缩类型链

1. 删除 commit 上的 `Op`
2. 删除 public `Tag` generic
3. 收缩 `MutationEngine` generic 参数
4. `compileMutationModel` 改为内部实现细节，不再 public export

### 阶段 7：拆文件

1. 拆 `model.ts`
2. 拆 `structural.ts`
3. 拆 `entity.ts`
4. 收敛 `runtime.ts`

---

## 八、最终判断

`shared/mutation` 不是“局部整理一下就会顺”的状态，而是已经到了应该**收掉历史抽象、重新定义最小内核**的时候。

长期最优不是继续在现有 API 上叠加，而是明确收成下面这套：

1. `schema`
2. `typed writer`
3. `typed reader`
4. `typed delta`
5. `low-level program`
6. `runtime`
7. `compile context`
8. `history core`

除此之外：

- registry 删除
- ports 删除
- engine 顶层 `createReader/createWriter` 删除
- path fallback 删除
- patchMany 删除
- signal 删除
- unset 删除
- 多余 generic 删除

这才是 shared mutation 可以长期稳定演进的形态。
