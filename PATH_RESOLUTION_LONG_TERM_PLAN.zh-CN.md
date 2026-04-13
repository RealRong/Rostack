# Path Resolution Long-Term Plan

> 注意：本文件已经被 [UNIFIED_IMPORT_TOOLCHAIN_FINAL_PLAN.zh-CN.md](/Users/realrong/Rostack/UNIFIED_IMPORT_TOOLCHAIN_FINAL_PLAN.zh-CN.md) 取代。  
> 后续 `shared`、`dataview`、`whiteboard` 的正式长期导入与工具链方案，统一以新文件为准。

## 目标

这个仓库的长期目标不是继续维护一套更复杂的 `tsconfig.paths`，而是把“导入路径的单一事实来源”切到 workspace package 与 `package.json` 声明上。

最终状态应满足下面几条：

- 跨包导入只依赖真实 workspace 包名和 `exports`。
- 包内导入只依赖 `imports` 的 `#...` 前缀。
- Vite 不再手写 `resolve.alias`。
- `tsconfig.paths` 不再承担主路由职责，最终应删除。
- 编辑器、TypeScript、Vite、Node、构建脚本解析同一套导入规则。
- 不保留第二套兼容实现，不保留过渡 alias，不保留“某些地方还能继续直连源码”的例外。

## 当前问题

历史上这个仓库同时维护过多套路由规则：

- 根层在 `tsconfig.base.json` 里维护 `paths`
- app 层在 Vite 配置里再维护一遍 alias
- 部分包的本地 `tsconfig.json` 里还重复维护局部 `paths`
- 少数测试或脚本又绕过包边界直接碰别的包源码

这会稳定带来几个问题：

- 同一条路径要改多处
- IDE 能跳转，不代表 Vite、测试、Node 运行时一定能解析
- alias 很容易脱离真实包边界，导致“看起来像包导入，实际上只是源码直连”
- 一旦目录变动，根 alias、局部 alias、脚本路径会一起失真

## 正式结论

这个仓库的正式长期方案只有一套：

- 跨包导入统一使用真实 package 名
- 包内导入统一使用 `package.json#imports` 的 `#...`
- 对外公开能力统一使用 `package.json#exports`
- 根级 `tsconfig.paths`、Vite alias、局部 alias 一律退出主舞台

如果只保留一句话，就是这句：

不要再寻找“根目录写一次 alias，所有地方自动继承”的中心化工具；长期最优解是让 package boundary 成为唯一真相来源。

## 最终方案

### 1. 跨包导入

跨包导入统一使用真实 workspace 包名。

正式命名族如下：

- `@shared/core`
- `@shared/dom`
- `@shared/react`
- `@shared/ui`
- `@whiteboard/core`
- `@whiteboard/engine`
- `@whiteboard/editor`
- `@whiteboard/react`
- `@whiteboard/collab`
- `@dataview/core`
- `@dataview/engine`
- `@dataview/meta`
- `@dataview/react`
- `@dataview/table`

关键点：

- 外部包不再通过 `../../..` 访问另一个包
- 外部包不再通过根 `paths` 访问别的包源码
- 每个包只暴露自己在 `exports` 中声明的入口和子路径
- demo app、业务包、测试、构建脚本都走同一套包解析规则

### 2. 包内导入

包内短路径统一使用 `package.json#imports`，并且只用 `#` 前缀。

示例：

- `#internal/*`
- `#core/*`
- `#react/*`
- `#types/*`
- `#runtime/*`

关键点：

- 包内私有路径不再放进根 `tsconfig.paths`
- `imports` 明确表达“这是包内私有导入，不是对外 API”
- `#` 前缀是 Node 与 TypeScript 原生支持的方向，长期维护成本最低

### 3. TypeScript、Vite、Node 的职责

最终职责应当非常清晰：

- `package.json.exports` 负责跨包公开入口
- `package.json.imports` 负责包内私有短路径
- TypeScript 只负责类型检查和理解这些规则
- Vite 直接跟随包解析，不再手写 alias 镜像
- Node 运行时也尽量复用同一套规则，不再额外补一套 alias resolver

这意味着最终不需要“根目录写一次 paths，然后让所有工具再同步一遍”的方案。长期最优解是根本不再让 `paths` 成为主配置中心。

## 命名决策

### `@rostack/ui` 与 `@ui`

这里需要明确两件事：

- `@ui` 不是合法的 npm scoped package 名
- 真实包名如果以 `@` 开头，必须是 `@scope/name`

因此：

- `@ui` 不能作为真实 workspace 包名
- `@rostack/ui` 不再作为长期方案保留
- 正式真实包名统一为 `@shared/ui`

本方案的正式结论是：

- UI 命名与 `shared` 对齐
- 所有旧写法直接收敛到 `@shared/ui`
- 不保留 `@ui` 作为永久 alias
- 不保留 `@rostack/ui` 作为过渡层

## 目录与包边界

### `shared/*`

`shared/*` 继续作为共享基础层，保持 `@shared/*` 族命名。

建议边界：

- `@shared/core` 放纯逻辑、数据结构、store、比较器、通用工具
- `@shared/dom` 放 DOM、pointer、selection、layout observer 这类浏览器辅助能力
- `@shared/react` 放 React hooks、React store adapter、跨产品 React 基础设施
- `@shared/ui` 放可复用 UI primitives、surface、menu、panel、picker、tokens、CSS 资产

目录组织的正式目标是：

- `ui/` 不再作为根目录下独立一级包长期存在
- UI 源码长期应并入 `shared/ui`
- 也就是说，最终目录组织应当让“包名”和“目录归属”一致

正式方向：

- 当前真实包名是 `@shared/ui`
- 长期目录也应对齐为 `shared/ui`
- 避免继续出现“目录叫 ui，但包名叫 @shared/ui”的分裂状态

### `whiteboard/*`

`whiteboard/packages/*` 保持 `@whiteboard/*`。

whiteboard 的长期目标不是改 scope，而是让内部不再依赖局部 `paths` 或源码直连。

### `dataview`

`dataview` 的长期方案不是继续把整个目录当成一个“靠 alias 切分”的大包，而是把它收敛成一组真实 workspace package，并让目录结构与包边界一致。

当前已经采用的包边界是：

- `dataview/src/core` -> `@dataview/core`
- `dataview/src/engine` -> `@dataview/engine`
- `dataview/src/meta` -> `@dataview/meta`
- `dataview/src/react` -> `@dataview/react`
- `dataview/src/table` -> `@dataview/table`

这在技术上是成立的，但不是长期推荐目录形态。

正式长期目标应进一步收敛为：

- `dataview/packages/dataview-core`
- `dataview/packages/dataview-engine`
- `dataview/packages/dataview-meta`
- `dataview/packages/dataview-react`
- `dataview/packages/dataview-table`

也就是：

- `dataview/src/*` 作为真实包根可以作为迁移阶段存在
- 但长期目录应平移到 `dataview/packages/*`
- 目录名应直接体现真实包身份，而不是继续复用源码语义的 `src/*`

这样做的原因是：

- `packages/*` 更符合 monorepo 的直觉
- 目录一眼就能看出哪些是包，哪些只是源码子目录
- 更适合后续继续扩包、拆包、独立测试与构建
- 可以避免“src 既是源码根又是包根”的语义混杂

包名规则也应同步统一。

长期正式规则：

- dataview 这组包都使用统一前缀
- 目录名也使用统一前缀
- 不再出现同级目录里既有通用名又有域名混用的情况

正式推荐目录名：

- `dataview-core`
- `dataview-engine`
- `dataview-meta`
- `dataview-react`
- `dataview-table`

这里的关键不是目录名必须和 npm name 完全字符一致，而是要满足两个原则：

- 同一眼就能看出它属于 dataview 包族
- 不和仓库内其他 `core`、`react`、`table` 之类通用词混淆

如果包名继续使用 scope 形式，则对应关系应保持清晰：

- 目录：`dataview/packages/dataview-core`
- 包名：`@dataview/core`

如果未来决定彻底取消 scope，也只能整族一起改，不能出现双轨命名。

这里的正式推荐仍然是保留 scope 包名：

- `@dataview/core`
- `@dataview/engine`
- `@dataview/meta`
- `@dataview/react`
- `@dataview/table`

目录再配合使用带前缀的包目录名：

- `dataview-core`
- `dataview-engine`
- `dataview-meta`
- `dataview-react`
- `dataview-table`

因此，“下面几个包加上 dataview 前缀”这件事，正式结论是：

- 目录名应加前缀
- 包族身份要更显式
- 包名本身继续统一在 `@dataview/*` 这一族下

如果这里说的是“希望 package name 也改成无 scope 的 `dataview-core` 这一类名字”，那不是当前推荐方案。原因是：

- 它会破坏与 `@shared/*`、`@whiteboard/*` 的命名一致性
- scoped package 更适合当前仓库已经形成的多包组织方式
- `@dataview/*` 与 `@shared/*`、`@whiteboard/*` 在风格上是统一的

所以正式长期方案应区分两层：

- 包名：保留 `@dataview/*`
- 目录名：改成 `dataview-*`

也就是说：

- 目录迁到 `packages/*`
- 目录名加 dataview 前缀
- 包名继续保持 `@dataview/*`

这比把 package name 也改成 `dataview-core` 更统一。

判断目录是否成立的关键仍然是：

- 这些目录已经是独立 workspace package
- 每个目录都有自己的 `package.json`
- 对外靠 `exports`
- 包内靠 `imports`

因此，长期结论不再是“`dataview/src/*` 也可以接受”。

正式长期方向已经收敛为：

- dataview 包目录迁到 `dataview/packages/*`
- 每个包目录使用 `dataview-*` 前缀
- `src` 回归为包内部源码目录，而不是包根目录

## 关于相对路径与“绝对路径”

这个仓库不再使用“根级 alias 代表绝对路径”的旧思路。

如果目标是尽量消灭 `../../..`，唯一推荐的统一方案是：

- 跨包相对路径全部改成真实包名导入
- 包内相对路径全部改成 `#imports`

也就是：

- 不用根级 `@/foo` 之类 alias
- 不用根级 `tsconfig.paths` 去模拟绝对路径
- 不用 Vite alias 再维护一份镜像规则

推荐写法示例：

- 跨包：`@shared/ui/menu`
- 跨包：`@dataview/core/view`
- 跨包：`@whiteboard/engine`
- 包内：`#core/view`
- 包内：`#types/command`
- 包内：`#react/runtime/hooks`

这套方案的本质不是“别名更多”，而是“只有两种合法短路径”：

- 真实包名
- 包内 `#imports`

## 关于 exports 与 imports 的粒度

`exports` 与 `imports` 不是越多越好。

要明确区分：

- `exports` 是对外 API 面
- `imports` 是包内短路径机制

它们都应该服务于“边界清晰”，而不是把整棵目录树原样搬进 `package.json`。

### 1. exports 的正式规则

`exports` 只应该暴露真正愿意长期维护的公共入口。

长期原则：

- 默认只暴露 `.`
- 只有在确实需要稳定子入口时，才增加 `./foo`
- 不把内部 feature、临时拼装层、目录细节全部暴露出去

推荐做法：

- 暴露少数稳定入口，例如 `.`、`./field`、`./views`、`./runtime`
- 通过 barrel file 收敛公共 API
- 不把 `./page/features/createView`、`./page/features/filter` 这类实现层路径轻易变成公共契约

判断标准：

- 如果一个入口希望被其他包长期依赖，它才应该进入 `exports`
- 如果一个入口只是当前实现方便，不应该进入 `exports`

### 2. imports 的正式规则

`imports` 的目标是消灭包内大量 `../../..`，不是把每个文件都注册一遍。

长期原则：

- `imports` 可以比 `exports` 多
- 但应优先使用少量命名空间级规则
- 不应把目录树一比一镜像到 `package.json`

推荐做法：

- 保留少数命名空间，例如 `#core/*`、`#react/*`、`#types/*`
- 通过统一目录约定，让大量内部导入自动落在这些命名空间内
- 尽量不要写几十条平铺的 `#react/foo/bar/baz`

判断标准：

- 如果一类内部模块经常被跨目录使用，给它一个 namespace
- 如果只是单点文件跳转，不要为了省一层相对路径就新增一条 imports

### 3. 什么不是长期最优

下面这种形态通常不是长期最优：

- `exports` 几乎把整个目录结构都列一遍
- `imports` 也把整个目录结构再列一遍
- 每新增一个 feature 文件夹，都要手动改 `package.json`

这种写法迁移阶段是可以接受的，因为它能快速把旧 alias 拆掉。

但作为最终态，它有明显问题：

- 维护成本高
- 目录一重构，`package.json` 跟着大面积变
- 包的公开边界会被实现细节污染
- 每个包都这么做时，会形成新的配置膨胀

### 4. dataview react package.json 的判断

对于 [package.json](/Users/realrong/Rostack/dataview/packages/dataview-react/package.json) 这类配置，如果把 `exports/imports` 几乎写成整棵目录树镜像，可以视为迁移收口阶段的显式状态，但不是理想终态。

正式判断是：

- 它不是错误的
- 作为迁移中间态是合理的
- 作为长期终态偏啰嗦
- 后续应继续收敛 `exports`
- 后续应继续模式化 `imports`

也就是说：

- 不应该要求每个包都写成这样
- `@dataview/react` 这类 feature 很重的包，规则会比纯逻辑包多一些
- 但也不应该让 `package.json` 永久承担“整棵目录树镜像”的职责

### 5. 最终推荐粒度

长期最优是：

- 大多数包只保留少数几个 `exports`
- 包内只保留少数几个 `imports` namespace
- 通过 barrel file 和目录规范吸收实现细节

换句话说，真正统一、最简单的方案不是：

- 每个包都手写几十条 `exports/imports`

而是：

- 每个包都遵守同一种目录约定
- `exports` 只描述公共 API 面
- `imports` 只描述少数内部命名空间

## 关于 noExternal

`noExternal` 不是路径解析方案的一部分。

它是 `tsup` 的打包选项，作用是：

- 某些 `dist` 产物在 Node 测试或纯运行时环境里需要直接执行时，不把指定依赖留作外部运行时 import，而是直接打进 bundle

这通常只在下面场景有意义：

- Node 直接执行 `dist`
- 测试直接 import `dist`
- 运行时不希望再回落到 workspace 源码导出

因此要明确区分两件事：

- path 方案：决定源码里的导入应该怎么写
- noExternal：决定构建产物在运行时要不要自包含

它们有关联，但不是同一层问题。

长期默认原则是：

- 路径解析只靠 package boundary
- `noExternal` 只在确有 Node runtime 需求的包上使用
- 不把 `noExternal` 当作 alias 方案或包边界方案的替代品

## 迁移原则

- 不保留兼容层，不保留双轨实现
- 先收敛命名，再统一导入，再删旧配置
- 先治理跨包导入，再治理包内导入
- 先补齐 `exports` 与 `imports`，再拆除 `vite.resolve.alias` 与 `tsconfig.paths`
- 任一阶段都保证 TypeScript、Vite、测试、Node 运行时只依赖同一套规则

## 推荐迁移顺序

### 阶段 1

确定命名并冻结规则。

- 确认 `@shared/ui` 作为 UI 包最终名称
- 确认 `shared`、`whiteboard`、`dataview` 三个命名族的 scope 规则
- 明确“跨包只能走包名，包内只能走 `#imports`”

### 阶段 2

把真实包入口补齐。

- 给共享包和产品包补全 `exports`
- 需要子路径导出的包，统一用 `exports` 明确列出子路径
- 包内常用短路径改用 `imports` 的 `#...`
- 把 `ui/` 收敛进 `shared/ui`
- 规划 `dataview/packages/*` 的正式落点与命名

### 阶段 3

把消费方导入迁移到正式写法。

- 旧 `@rostack/ui`、`@ui/*` 全部收敛到 `@shared/ui` 与 `@shared/ui/*`
- 直接指向其他包源码的 alias 改成包入口或子路径导出
- whiteboard 内部局部 `paths` 改成 `#imports` 或真实包名
- dataview 内部相对路径按边界改成 `#core/*`、`#react/*` 或真实包名
- dataview 包根从 `src/*` 平移到 `packages/dataview-*`
- `src` 目录只保留为每个包内部源码根

### 阶段 4

删除所有旧 alias 与重复配置。

- 删除根 `tsconfig.base.json` 中历史 `paths`
- 删除 app 级 `vite.config.ts` 中手写 alias
- 删除包级 `tsconfig.json` 中重复 `paths`
- 删除旧包名与旧导入写法的所有残留
- 删除测试、脚本、构建里对旧 alias 的特殊处理

### 阶段 5

做构建图治理。

- 按需要补 project references
- 统一 TypeScript 版本
- 统一 Vite 版本
- 统一 demo app、测试、Node 运行时的解析策略

## 仓库内的直接落点

这个仓库最值得优先治理的几处是：

- 根 `tsconfig.base.json` 历史上承担了跨包 alias 中心的角色，长期要退位
- `apps/dataview/vite.config.ts` 和 `apps/whiteboard/vite.config.ts` 的手写 alias 最终应删除
- `whiteboard/packages/*/tsconfig.json` 里重复定义的 `paths` 需要迁回 `exports` 或 `imports`
- `shared/ui/package.json` 的正式真实包名是 `@shared/ui`
- UI 真实目录已经收敛到 `shared/ui`
- `dataview` 的包根长期应迁到 `dataview/packages/dataview-*`

## 不做的事

本方案明确不把下面这些路径当长期目标：

- 不继续扩大根 `tsconfig.paths` 的规模
- 不让 Vite 继续充当 alias 真相来源
- 不把 `@ui` 保留为永久 alias
- 不通过“所有包都直连别的包的 `src`”来换取短期方便
- 不重新引入“根目录写一次 alias，全局继承”的新中心化方案

## 最终结论

这个仓库的长期最优 path 方案是：

- 跨包使用真实 workspace 包名
- 包内使用 `package.json#imports`
- 对外 API 使用 `package.json#exports`
- 删除 Vite 和 tsconfig 中重复维护的 alias
- UI 命名统一为 `@shared/ui`
- UI 目录长期并入 `shared/ui`
- dataview 包目录长期迁到 `dataview/packages/dataview-*`
- 所有相对路径的统一替代方案不是根 alias，而是“包名 + `#imports`”

如果只保留一条结论，那就是这句：

不要再试图找一个“在根目录写一次 alias，其他工具自动继承”的中心化 alias 工具；长期最优方案是让 package boundary 成为唯一真相来源。
