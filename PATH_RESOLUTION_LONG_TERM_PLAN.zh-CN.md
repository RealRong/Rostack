# Path Resolution Long-Term Plan

## 目标

这个仓库的长期目标不是继续维护一套更复杂的 `tsconfig.paths`，而是把“导入路径的单一事实来源”切到 workspace package 和 `package.json` 声明上。

最终状态应满足下面几条：

- 跨包导入只依赖真实 workspace 包名和 `exports`。
- 包内导入只依赖 `imports` 的 `#...` 前缀。
- Vite 不再手写 `resolve.alias`。
- `tsconfig.paths` 不再承担主路由职责，只保留极少数兼容用途，最终可以清空或删除。
- 编辑器、TypeScript、Vite、Node、构建脚本解析同一套导入规则。

## 当前问题

当前仓库里有三套并行规则：

- 根层在 `tsconfig.base.json` 里维护了一批 `paths`。
- `apps/dataview/vite.config.ts` 和 `apps/whiteboard/vite.config.ts` 又各自手写了一遍 alias。
- `whiteboard/packages/*/tsconfig.json` 里还重复维护了一层局部 `paths`。

这会带来几个稳定问题：

- 同一条路径要改三处甚至更多处。
- IDE 能跳转，不代表 Vite、测试、发布构建一定能解析。
- alias 很容易脱离真实包边界，导致“看起来像包导入，实际上只是源码直连”。
- 一旦包结构调整，跨包 alias 和包内 alias 会一起失真。

## 最终方案

### 1. 跨包导入

跨包导入统一使用真实 workspace 包名。

推荐保留或收敛到以下命名族：

- `@shared/core`
- `@shared/dom`
- `@shared/react`
- `@shared/ui`
- `@whiteboard/core`
- `@whiteboard/engine`
- `@whiteboard/editor`
- `@whiteboard/react`
- `@whiteboard/collab`
- `@dataview/core` 或其他最终确定的 dataview 包名

关键点：

- 外部包不再通过 `../../..` 或根 `paths` 访问另一个包的 `src`。
- 每个包只暴露自己在 `exports` 中声明的入口和子路径。
- demo app、业务包、测试、构建脚本都走同一套包解析规则。

### 2. 包内导入

包内短路径统一使用 `package.json#imports`，并且只用 `#` 前缀。

示例：

- `#internal/*`
- `#react/*`
- `#types/*`
- `#runtime/*`

关键点：

- 包内私有路径不用再放进根 `tsconfig.paths`。
- `imports` 明确表达“这是包内私有导入，不是对外 API”。
- `#` 前缀是 Node 和 TypeScript 原生支持的方向，长期维护成本最低。

### 3. Vite 和 TypeScript 的职责

最终职责应当非常清晰：

- `package.json.exports` 负责跨包公开入口。
- `package.json.imports` 负责包内私有短路径。
- TypeScript 只负责类型检查和理解这些规则。
- Vite 直接跟随包解析，不再手写 alias 镜像。

这意味着最终不需要“根目录写一次 paths，然后让所有工具再同步一遍”的方案。长期最优解是根本不再让 `paths` 成为主配置中心。

## 命名决策

### `@shared/ui -> @ui` 的处理

这里需要明确一个语义和规范约束：

- `@ui` 不是合法的 npm scoped package 名。
- 真实包名如果以 `@` 开头，必须是 `@scope/name` 形式。

因此，`@shared/ui -> @ui` 不能作为“真实 workspace 包名”的最终方案落地。

长期最优、并且和 `shared` 命名风格对齐的方案是：

- 把当前 `@shared/ui` 收敛为 `@shared/ui`

这套命名和现有的 `@shared/core`、`@shared/dom`、`@shared/react` 一致，语义也更贴近现在 `ui` 在仓库里的角色：它是多个产品共享的 UI 基础层，而不是 rostack 根包的专属私有模块。

### 为什么不保留 `@ui`

如果强行保留 `@ui` 这个字面量，有两种路径，但都不是当前仓库的长期最优：

- 继续把 `@ui` 当 alias。
  这会保留现在“工具间重复同步配置”的根问题。
- 把 UI 拆成一组真实包，例如 `@shared/ui/button`、`@shared/ui/color`、`@shared/ui/utils`。
  这 technically 可行，但意味着从“一个 UI 包带多个子路径导出”切成“一个 scope 下的多个包”，改造面远大于收益，也不和现有 `shared` 体系对齐。

因此，本方案的正式结论是：

- 长期真实包名使用 `@shared/ui`
- `@ui` 只允许作为临时兼容 alias 存在，迁移完成后删除

## 目录和导入边界

### `shared/*`

`shared/*` 继续作为共享基础层，保持 `@shared/*` 族命名。

建议边界：

- `@shared/core` 放纯逻辑、数据结构、store、比较器、通用工具。
- `@shared/dom` 放 DOM、pointer、selection、layout observer 这类浏览器辅助能力。
- `@shared/react` 放 React hooks、React store adapter、跨产品 React 基础设施。
- `@shared/ui` 放可复用 UI primitives、surface、menu、panel、picker、tokens、CSS 资产。

### `whiteboard/*`

`whiteboard/packages/*` 继续保持 `@whiteboard/*`。

这部分已经比较接近长期目标，主要问题不是命名，而是内部还有过多源码直连和额外 `paths`。

### `dataview`

`dataview` 当前 package 名还是无 scope 的 `dataview`，这和其他包族不一致。

长期建议二选一：

- 如果它会稳定作为产品域包存在，改为 `@dataview/core`、`@dataview/react` 等明确结构。
- 如果它只是仓库内部主包，也至少应当统一到一个稳定的 scope 方案里，而不是继续混用无 scope 包名和 scoped 包名。

这个决策不阻塞本次 path 方案，但应该在同一轮命名治理里定下来。

## 迁移原则

- 先收敛命名，再删除 alias，避免“边迁移边改名”导致噪音叠加。
- 先治理跨包导入，再治理包内导入。
- 先补齐 `exports` 和 `imports`，再拆除 `vite.resolve.alias`。
- 任一阶段都保证 TypeScript、Vite、测试至少有一条稳定可运行路径。
- 迁移期间允许存在兼容层，但兼容层必须有明确删除目标。

## 推荐迁移顺序

### 阶段 1

确定命名并冻结规则。

本阶段只做决策，不做大规模替换：

- 确认 `@shared/ui` 作为 UI 包最终名称。
- 确认 `shared`、`whiteboard`、`dataview` 三个命名族的 scope 规则。
- 明确“跨包只能走包名，包内只能走 `#imports`”。

### 阶段 2

把真实包入口补齐。

本阶段目标是让每个包都能独立表达自己的公共 API：

- 给共享包和产品包补全 `exports`。
- 需要子路径导出的包，统一用 `exports` 明确列出子路径。
- 包内常用短路径改用 `imports` 的 `#...`。

### 阶段 3

把消费方导入迁移到真实包名。

重点变化：

- `@shared/ui` 迁到 `@shared/ui`
- `@shared/ui/*` 迁到 `@shared/ui/*`
- 直接指向其他包 `src` 的 alias 改成包入口或子路径导出
- whiteboard 内部局部 `paths` 改成 `#imports` 或真实包名

### 阶段 4

删除兼容 alias。

本阶段才能做清理：

- 删除根 `tsconfig.base.json` 中服务于历史 alias 的 `paths`
- 删除 app 级 `vite.config.ts` 里的手写 alias
- 删除包级 `tsconfig.json` 中重复的 `paths`

### 阶段 5

做构建图治理。

这一步不是 path 方案的核心，但做完收益很大：

- 按需要补 project references
- 统一 TypeScript 版本
- 统一 Vite 版本
- 统一 demo app 的解析策略

## 仓库内的直接落点

这个仓库最值得优先治理的几处是：

- 根 `tsconfig.base.json` 目前承担了跨包 alias 中心的角色，长期要退位。
- `apps/dataview/vite.config.ts` 和 `apps/whiteboard/vite.config.ts` 的手写 alias 最终应删除。
- `whiteboard/packages/*/tsconfig.json` 里重复定义的 `paths` 需要迁回 `exports` 或 `imports`。
- `ui/package.json` 当前真实包名是 `@shared/ui`，长期建议改为 `@shared/ui`。
- `whiteboard/packages/whiteboard-react` 中已经存在大量 `@shared/ui` 使用点，这会是第一批批量迁移对象。

## 不做的事

本方案明确不把下面这些路径当长期目标：

- 不继续扩大根 `tsconfig.paths` 的规模。
- 不让 Vite 继续充当 alias 真相来源。
- 不把 `@ui` 保留为永久 alias。
- 不通过“所有包都直连别的包的 `src`”来换取短期方便。

## 最终结论

这个仓库的长期最优 path 方案是：

- 跨包使用真实 workspace 包名
- 包内使用 `package.json#imports`
- 对外 API 使用 `package.json#exports`
- 删除 Vite 和 tsconfig 中重复维护的 alias
- UI 命名从 `@shared/ui` 收敛到 `@shared/ui`

如果只保留一条结论，那就是这句：

不要再试图找一个“在根目录写一次 alias，其他工具自动继承”的中心化 alias 工具；长期最优方案是让 alias 退出主舞台，让 package boundary 成为唯一真相来源。
