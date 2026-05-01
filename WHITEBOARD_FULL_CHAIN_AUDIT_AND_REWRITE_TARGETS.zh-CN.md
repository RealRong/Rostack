# Whiteboard 全链路审计与重构靶点

## 1. 结论

这条链目前已经没有早期那种“多套 delta / projection / runtime 明显并存”的大问题了，主轴基本成立：

- `whiteboard-core` 负责领域算法与 operation 编译
- `shared/mutation` 负责 mutation runtime / history / delta
- `whiteboard-engine` 负责 whiteboard 领域封装
- `editor-scene` 负责 projection
- `editor` 负责 session / interaction / write / actions
- `react` 负责 DOM / 生命周期 /渲染

但是整条链上仍然存在几类明显异味：

1. **shared/mutation 与 core custom op 仍然过厚，而且 custom 仍然太手工**
2. **editor-scene 的 projection 仍然有第二次解释过多的问题**
3. **editor 的 source binding / write / input 还没有完全统一到单一读写中轴**
4. **react 仍然存在两套装配路径和一个过厚的生命周期容器**

下面只写真正值得动的大点，不写局部小优化。

---

## 2. 整体判断

### 2.1 现在最别扭的，不是算法层

`whiteboard-core` 里像 `shape.ts`、`transform.ts`、`edge/path.ts` 这种大文件，很多属于**单域高复杂算法**，不一定是架构问题。

真正别扭的是：

- **中轴层重复解释**
- **装配层重复包裹**
- **custom / write / source 这几段没有被统一建模**

### 2.2 最该优先重写的，不是 UI 组件

`whiteboard-react` 组件里虽然也有一些大文件，但大多数是 UI 复杂度。

更值得重写的是：

- `shared/mutation/src/engine/runtime.ts`
- `whiteboard-core/src/operations/custom.ts`
- `whiteboard-editor/src/scene/binding.ts`
- `whiteboard-editor-scene/src/projection/plan.ts`
- `whiteboard-react/src/runtime/whiteboard/factory.ts`
- `whiteboard-react/src/runtime/whiteboard/services.ts`

---

## 3. Cross-cutting 异味

## 3.1 custom operation 仍然没有被真正驯服

最明显的信号：

- [whiteboard/packages/whiteboard-core/src/operations/custom.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/operations/custom.ts)
  2630 行
- [shared/mutation/src/engine/runtime.ts](/Users/realrong/Rostack/shared/mutation/src/engine/runtime.ts)
  1441 行

当前 custom op 的根问题不是“代码多”，而是：

- custom reducer 仍然以“手写 document reduce + 手写 delta + 手写 inverse + 手写 footprint”为主
- `shared/mutation` 只是对这些输出做约束与校验
- whiteboard 领域 custom 还要直接调用 structural helpers 去拼 ordered/tree 操作

这说明 **custom op 还不是声明式 effect program**，而只是“受约束的手写 reducer”。

### 这带来的异味

- shared 运行时很厚，因为它要兼容 entity / structural / custom 三种风格
- core custom 很厚，因为它要自己决定结构变化、逆操作、footprint
- 上下游都在“解释一次同一件事”

### 长期最优

shared/mutation 需要把 custom 降级成：

- 不是直接改文档
- 不是直接返回完整 inverse / footprint / delta
- 而是返回**声明式 mutation effects**

例如：

- entity create / patch / delete
- ordered move / insert / splice
- tree insert / move / delete / restore
- semantic change tags

然后由 shared 统一派生：

- next document
- inverse
- footprint
- normalized delta

只要这件事不做，`custom.ts` 和 `runtime.ts` 就都不会真正变薄。

---

## 3.2 读写中轴还没有完全统一

虽然 `MutationDelta -> projection -> scene query` 这一段已经统一很多，但整条链还是有几个读写入口并存：

- `engine.current()`
- `engine.doc()`
- `DocumentFrame`
- `EditorScene`
- `DocumentReader`

问题不在于这些名字多，而在于**同一层常常混用多个入口**。

最明显的是 editor write：

- [whiteboard/packages/whiteboard-editor/src/write/canvas.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/write/canvas.ts)
- [whiteboard/packages/whiteboard-editor/src/write/group.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/write/group.ts)

这里 `order.step` 直接用 `engine.doc()` 规划顺序。

而 node / edge write 又用：

- `DocumentFrame`
- `EditorScene`

这说明 write 层还没有一个统一的 query axis。

### 长期最优

写入链应该只允许一个规划读入口，例如：

```ts
interface EditorWriteQuery {
  doc(): Document
  node(id): Node | undefined
  edge(id): Edge | undefined
  scene: EditorScene
}
```

但真正热路径 document 读取应统一落到：

- `engine.current().doc`

也就是：

- 不要到处直接 `engine.doc()`
- 不要一部分 write 用 `DocumentFrame`，一部分自己摸 `engine`
- 统一从一个 query object 取

这样既保留热路径，也消除 write 层多入口。

---

## 4. shared/mutation

## 4.1 runtime 仍然是大一统调度器

文件：

- [shared/mutation/src/engine/runtime.ts](/Users/realrong/Rostack/shared/mutation/src/engine/runtime.ts)

当前它同时负责：

- custom op reduce
- entity canonical op apply
- structural op apply
- compile intent
- merge outputs/issues
- history capture
- commit emit
- current/watch

这已经不是“engine runtime”，而是**所有 mutation 语义的总装配器**。

### 异味

- 领域分支很多，职责面太宽
- entity / structural / custom 的 apply 逻辑仍然没有统一成同一层 effect interpreter
- `MutationEngine` 和 `MutationRuntime` 形成了重复壳

### 长期最优

拆成四层：

1. `compile`
2. `effect program`
3. `effect apply`
4. `commit/history/runtime shell`

也就是 runtime 最终只看 effect program，不再自己知道 entity / structural / custom 细节。

## 4.2 structural 仍然是单块低层大文件

文件：

- [shared/mutation/src/engine/structural.ts](/Users/realrong/Rostack/shared/mutation/src/engine/structural.ts)

问题不是结构算法复杂，而是：

- ordered/tree 两套结构逻辑
- operation parse / validation / inverse / footprint / apply
- 全都堆在同一文件

长期最优应该拆成：

- ordered model
- tree model
- inverse planner
- footprint builder
- apply

## 4.3 delta typed view 仍然比较厚

whiteboard 侧 typed delta：

- [whiteboard/packages/whiteboard-engine/src/mutation/delta.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-engine/src/mutation/delta.ts)

这里已经比以前好，但仍然暴露出一个问题：

- schema path 已经统一
- 但 domain 仍然要手写一层比较厚的 `node/edge/mindmap/group` typed facade

这不算错误，但说明 typed delta builder 还不够声明式。

长期最优应进一步支持：

- path family 批量定义
- touched / changed / ids 视图自动派生

让 `WhiteboardMutationDelta` 更像 schema 映射产物，而不是手写 facade。

---

## 5. whiteboard-core

## 5.1 真正的问题不是算法大，而是 custom 入口过于集中

`whiteboard-core` 大部分超大文件是领域算法。

这些大文件里，真正最突兀的是：

- [operations/custom.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/operations/custom.ts)

它同时在做：

- canvas order structural 映射
- edge route/label structural 映射
- mindmap tree structural 映射
- entity patch/inverse/footprint 相关决策
- custom table 组装

这说明 custom 不是 core 的一组独立子域，而是一个**领域后门总线**。

### 长期最优

不要再有一个 2600+ 行的 `custom.ts` 聚合所有特例。

应该拆成：

- `custom/canvas.ts`
- `custom/edge-label.ts`
- `custom/edge-route.ts`
- `custom/mindmap-tree.ts`
- `custom/topic.ts`
- `custom/table.ts`

更进一步，若 shared/mutation 的 effect program 足够强，其中很大一部分 custom 甚至可以退回 compile 层直接产出 effect，而不必继续通过“custom reduce”这条后门。

## 5.2 compile 与 custom 的边界仍然不完全干净

`operations/compile/*` 已经承担大部分 intent -> op 的规划。

但很多复杂结构更新仍然要绕去 custom。

这意味着 compile 产出的还不是统一 effect model，而是：

- 一部分产 canonical op
- 一部分产 custom op

长期最优依然应该是：

- compile 统一产 effect program
- custom op 仅保留极少数 truly custom 的 case

---

## 6. whiteboard-engine

## 6.1 engine 是薄封装，但仍然重复维护 current shell

文件：

- [whiteboard/packages/whiteboard-engine/src/runtime/engine.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-engine/src/runtime/engine.ts)
- [whiteboard/packages/whiteboard-engine/src/contracts/document.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-engine/src/contracts/document.ts)

现在 `engine` 做了这些事：

- 包一层 `MutationEngine`
- 维护自己的 `current`
- 把 `subscribe` 包成 current listener
- 包装 `execute/apply/replace`
- 做 whiteboard failure 映射

这层不算很厚，但还是有一个别扭点：

- `MutationEngine` 已经有 `current/watch/commit`
- `whiteboard-engine` 又维护一套 `current/currentListeners`

### 长期最优

`whiteboard-engine` 应尽量成为：

- whiteboard compile/custom/config facade
- 不再自己再包一层 current state runtime

可以保留：

- `engine.current()`

但它应尽量直接代理 shared runtime，而不是自己维护镜像缓存。

## 6.2 `doc()` / `current()` 语义仍然不够收敛

现在：

- `current()` 是热读
- `doc()` 返回 document

这个选择本身没错，但当 editor/write 层有人直接 `engine.doc()`，有人用 `current()`，有人用 scene/document frame，就会让上游重新分叉。

所以问题不是 `current()` 本身，而是：

- **没有明确规定哪条链必须读 `current().doc`**

---

## 7. whiteboard-editor-scene

## 7.1 projection plan 仍然在做第二次领域解释

文件：

- [whiteboard/packages/whiteboard-editor-scene/src/projection/plan.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor-scene/src/projection/plan.ts)

现在它要自己综合：

- `MutationDelta`
- runtime facts
- session draft/preview
- hover/edit/tool 状态
- graph phase 输出
- item/render/ui touched scope

然后推：

- graph
- spatial
- items
- ui
- render

这说明 projection 增量执行虽然已经统一到 phase graph，但 **scene domain facts 仍然是 projection 自己现拼的**。

### 异味

- `plan.ts` 过厚
- projection phase 之间还是要手工搬运 touched scope
- runtime preview / delta / graph lifecycle 这几类信息没有先收敛成统一 domain facts

### 长期最优

应该在 `editor-scene` 内部先生成一个单独的 `SceneFrame` / `SceneFacts`：

- document delta facts
- runtime preview facts
- touched entity facts
- render/ui execution facts

然后 phase 只消费 facts，不再各自重新拼作用域。

也就是说，scene 的问题不是 phase graph 本身，而是 **facts compile 还没成为单独一层**。

## 7.2 query object 仍然混了 public / internal / debug

文件：

- [whiteboard/packages/whiteboard-editor-scene/src/projection/query/index.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor-scene/src/projection/query/index.ts)

虽然 public scene API 已经收平，但 projection read 内部还是把这些揉在一起：

- public scene query
- `document/runtime`
- `capture`
- `source`

这说明 query object 仍然是：

- public API
- phase internal read
- debug surface

三者复合物。

### 长期最优

拆成三层：

1. `EditorScene`
2. `SceneInternalRead`
3. `SceneDebug`

不要继续在一个 query object 上叠加所有角色。

## 7.3 contracts/editor.ts 仍然是概念大杂烩

文件：

- [whiteboard/packages/whiteboard-editor-scene/src/contracts/editor.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor-scene/src/contracts/editor.ts)

当前它混在一起的内容包括：

- scene input
- runtime facts
- public scene API
- view model types
- render types
- stores
- runtime shell

这不是逻辑 bug，但会放大后续重构成本。

### 长期最优

至少拆为：

- `contracts/input.ts`
- `contracts/query.ts`
- `contracts/view.ts`
- `contracts/runtime.ts`
- `contracts/store.ts`

---

## 8. whiteboard-editor

## 8.1 scene binding 仍然是手工 source adapter

文件：

- [whiteboard/packages/whiteboard-editor/src/scene/binding.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/scene/binding.ts)

这里每次 `get()` 都要自己拼一份 source snapshot：

- `engine.current()`
- preview state
- selection/edit/tool
- hover / drag / chrome
- viewport
- node/edge preview patches
- mindmap preview

同时还手工发 change：

- document
- tool
- selection
- edit
- preview
- hover
- mode
- chrome
- viewport

### 异味

- `editor-scene` 的输入帧不是一等对象，而是 binding 现场拼装物
- 这层承担了过多 clone / normalize / change compile 工作
- `scene binding` 成了 editor -> scene 的二次解释层

### 长期最优

把它收敛成显式的 `EditorSceneSourceFrame`：

- frame build
- frame diff
- publish

也就是把现在 binding 里散落的：

- snapshot 拼装
- preview merge
- runtime delta emit

提升成单独基础设施。

## 8.2 input orchestration 仍然碎成很多层

当前链路大致是：

- react DOM input
- pointer bridge
- editor input host
- interaction runtime
- feature bindings
- feature session
- session preview
- scene binding
- editor-scene projection

这条链虽然方向是对的，但 `editor` 这层仍然比较碎。

关键文件：

- [whiteboard/packages/whiteboard-editor/src/input/core/runtime.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/input/core/runtime.ts)
- [whiteboard/packages/whiteboard-editor/src/input/host.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/input/host.ts)
- [whiteboard/packages/whiteboard-editor/src/input/features/selection/press.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/input/features/selection/press.ts)
- [whiteboard/packages/whiteboard-editor/src/input/features/edge/route.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/input/features/edge/route.ts)
- [whiteboard/packages/whiteboard-editor/src/input/features/edge/connect.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/input/features/edge/connect.ts)

### 异味

- binding list + 巨型 feature 文件，说明交互状态机复用度还不够
- 很多 feature 仍然在文件内自带完整 start / project / preview / commit 流程
- `EditorHostDeps` 还是偏大，feature 容易拿到过多能力

### 长期最优

把交互 feature 统一成同构 controller：

- `start`
- `step`
- `preview`
- `commit`
- `cancel`

并让 gesture runtime 只调 controller，不再让每个 feature 文件自己长成一套半框架。

## 8.3 write 层的查询源不统一

这点上面已经提过，重点文件：

- [write/canvas.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/write/canvas.ts)
- [write/group.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/write/group.ts)
- [write/node.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/write/node.ts)
- [write/edge/index.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/write/edge/index.ts)

现在：

- 有的直接 `engine.doc()`
- 有的读 `DocumentFrame`
- 有的读 `EditorScene`

长期最优必须统一。

## 8.4 session 本身不算厚，但 preview / interaction / edit / selection 仍然横切较多

文件：

- [whiteboard/packages/whiteboard-editor/src/session/runtime.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/session/runtime.ts)

session runtime 本身不算坏，但现在 editor 的真实交互状态被拆在：

- session state
- interaction runtime
- preview state
- scene binding

这几层里。

所以问题不是 session runtime 自己，而是 **session frame 没有统一出口**。

---

## 9. whiteboard-react

## 9.1 还存在两套装配路径

这是目前 react 侧最明显的异味。

文件：

- [whiteboard/packages/whiteboard-react/src/runtime/whiteboard/factory.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/runtime/whiteboard/factory.ts)
- [whiteboard/packages/whiteboard-react/src/runtime/whiteboard/services.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/runtime/whiteboard/services.ts)

这两处都在做：

- create engine
- create editor
- create layout backend
- create pointer bridge
- create clipboard bridge
- create insert bridge
- manage point state

这是明确的第二套装配实现。

### 长期最优

只能保留一套：

- `createWhiteboardServices`

而 `factory.ts` 如果还要保留 public imperative API，就只能做薄 wrapper，不能继续复制完整 wiring。

## 9.2 Whiteboard.tsx 生命周期职责过重

文件：

- [whiteboard/packages/whiteboard-react/src/Whiteboard.tsx](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/Whiteboard.tsx)

当前它同时负责：

- create services
- strict mode dispose workaround
- viewport limits sync
- inbound/outbound document mirror
- collab session wiring
- presence publish
- imperative ref

这已经不是单纯组件，而是 runtime container。

### 异味

- lifecycle 太厚
- collab / document mirror / services bootstrap 全堆在组件里
- `useEffect` 数量和职责都偏多

### 长期最优

应拆成：

- `useWhiteboardServices`
- `useWhiteboardDocumentSync`
- `useWhiteboardCollab`
- `useWhiteboardPresence`

组件本身只做 provider + surface render。

## 9.3 DOM host / runtime bridge 虽然合理，但仍有局部再解释

文件：

- [whiteboard/packages/whiteboard-react/src/dom/host/input.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/dom/host/input.ts)
- [whiteboard/packages/whiteboard-react/src/runtime/bridge/pointer.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/runtime/bridge/pointer.ts)

这里的问题不大，主要还是 DOM 适配职责。

但仍有一个小信号：

- DOM 层还要自己处理 selection-box 底下 pick / edge fallback hit

这说明 scene hit / DOM pick registry 的职责边界还没有绝对清晰。

这不是第一优先级，但值得后续收口。

---

## 10. 优先级排序

### 第一优先级

1. **shared/mutation custom/effect program 重构**
2. **react 双装配路径合一**
3. **editor scene binding 收敛成 source frame**
4. **editor write 查询源统一**

### 第二优先级

1. **editor-scene plan/facts compile 拆层**
2. **core custom.ts 拆域**
3. **engine current shell 变薄**

### 第三优先级

1. `contracts/editor.ts` 拆文件
2. input feature controller 统一化
3. react lifecycle hooks 分层

---

## 11. 最终判断

如果只看“有没有局部 helper 或长文件”，答案会是到处都有。

但如果从整条链路看，真正的异味主要集中在四个根因：

1. **custom 还不够声明式**
2. **source / facts / write query 还没有成为统一中轴**
3. **装配层还存在第二套实现**
4. **public / internal / debug surface 还偶有混层**

所以长期最优不是继续小修局部 helper，而是：

- shared/mutation：从“兼容多风格 apply”转向“统一 effect program”
- core：把 custom 从大总线拆成分域 effect producer
- engine：只保留薄 whiteboard facade
- editor-scene：引入单独 `SceneFacts` / `SceneSourceFrame`
- editor：统一 write query axis，统一 interaction controller shape
- react：统一 services/factory，组件只保留生命周期组合

这几件事做完以后，整条链才会真正从“现在已经能工作”进入“结构长期稳定、没有二次解释”的状态。
