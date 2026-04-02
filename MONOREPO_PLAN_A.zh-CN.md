# Monorepo 方案 A

## 结论

采用方案 A：

- 保留 `dataview/` 作为独立项目根
- 保留 `whiteboard/` 作为独立项目根
- 保留 `whiteboard/packages/*` 现有拆包结构
- 根目录只负责 workspace 治理
- `ui/` 作为跨项目共享层单独存在

这个方案的目标不是把所有内容压进同一个 `packages/`，而是把仓库根变成真正的 monorepo root。

## 目标结构

```text
Rostack/
  package.json
  pnpm-workspace.yaml
  tsconfig.base.json

  dataview/
    package.json
    src/
    demo/

  whiteboard/
    package.json
    packages/
      whiteboard-core/
      whiteboard-engine/
      whiteboard-editor/
      whiteboard-react/
      whiteboard-collab/
    demo/

  ui/
    package.json
    css/
    react/
    tailwind/
```

## 为什么选这个方案

### 1. 项目边界清晰

仓库一眼就能看出三类东西：

- `dataview/` 是一个项目
- `whiteboard/` 是另一个项目
- `ui/` 是共享基础设施

这样比把 `dataview` 和 `whiteboard-*` 全塞进根 `packages/` 更符合语义。

### 2. 不破坏 `whiteboard` 现有设计

`whiteboard/packages/*` 目前就是合理的内部拆包结构，不应该为了仓库统一而打平。

这个方案下可以继续保留：

- `@whiteboard/core`
- `@whiteboard/engine`
- `@whiteboard/editor`
- `@whiteboard/react`
- `@whiteboard/collab`

### 3. `dataview` 不需要为了“对称”被过早拆包

`dataview` 现在还是单项目结构，这本身没有问题。

如果未来确实需要拆成多包，再在 `dataview/` 内部演进，不必现在为了 monorepo 先做一次无收益拆分。

### 4. 共享层有明确身份

`ui/` 不再只是“根目录一个裸文件夹”，而是会成为真正受 workspace 管理的共享包。

## 根目录职责

根目录成为 monorepo root 之后，应该只承担这些职责：

- workspace 管理
- 统一依赖提升策略
- 根级 TypeScript 基础配置
- 根级任务入口
- 跨项目共享层治理

根目录不承担：

- `dataview` 业务源码归属
- `whiteboard` 业务源码归属

## workspace 成员建议

建议根级 `pnpm-workspace.yaml` 后续纳入这些成员：

```yaml
packages:
  - 'apps/*'
  - 'dataview'
  - 'whiteboard'
  - 'whiteboard/packages/*'
  - 'ui'
```

这表示：

- `apps/*` 承担根级 demo / app 容器
- `dataview` 是一个 workspace package
- `whiteboard` 本身是项目根，内部 packages 继续保留
- `ui` 是共享 package

不需要强制把目录改成根级 `packages/` 才能成为 monorepo。

## 根级 TypeScript 设计

建议根目录新增统一 [tsconfig.base.json](/Users/realrong/Rostack/tsconfig.base.json)。

它只放跨项目共享的基础规则，例如：

- `target`
- `module`
- `moduleResolution`
- `strict`
- `esModuleInterop`
- `skipLibCheck`
- `resolveJsonModule`
- `isolatedModules`

各子项目再各自扩展：

- [dataview/tsconfig.json](/Users/realrong/Rostack/dataview/tsconfig.json)
- [whiteboard/tsconfig.base.json](/Users/realrong/Rostack/whiteboard/tsconfig.base.json)
- [apps/dataview/tsconfig.json](/Users/realrong/Rostack/apps/dataview/tsconfig.json)
- [apps/whiteboard/tsconfig.json](/Users/realrong/Rostack/apps/whiteboard/tsconfig.json)
- [whiteboard/packages/whiteboard-react/tsconfig.json](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/tsconfig.json)

后续最好把 `whiteboard` 内部 `tsconfig.base.json` 的职责也收敛，变成“继承根 base，再补充 whiteboard 特有项”。

## 别名策略

### 总原则

路径别名要分成两类：

- 仓库共享别名
- 现有 package scope

这两者不能互相覆盖。

### 推荐保留

保留 `whiteboard` 当前 package 语义：

- `@whiteboard/react`
- `@whiteboard/core`
- `@whiteboard/editor`
- `@whiteboard/engine`
- `@whiteboard/collab`

这套已经是稳定 package 协议，不建议打乱。

### 推荐新增

推荐新增这两个仓库级别名：

- `@ui/*` -> `ui/*`
- `@dataview/*` -> `dataview/src/*`

### 不推荐

不建议把：

- `@whiteboard/*`

重新定义成“根目录 whiteboard 子树源码通配别名”。

原因是这会和现有 `@whiteboard/*` package scope 冲突。

如果以后真的需要一个仓库级 whiteboard 根入口，建议只考虑裸别名：

- `@whiteboard`

而不要动 `@whiteboard/*` 的既有含义。

## `ui/` 的定位

`ui/` 是方案 A 下最应该优先正式化的共享层。

它的职责应该明确为：

- 跨 `dataview` 和 `whiteboard` 共享的 CSS
- 跨项目共享的 React primitives
- 共享 Tailwind preset

不应该让 `ui/` 承担：

- 白板专有业务逻辑
- dataview 专有业务逻辑

## Demo 的处理建议

现在已经进入第二阶段，demo 直接落到根级 `apps/` 更合理。

当前建议保持：

- `apps/dataview`
- `apps/whiteboard`

原因：

- 根目录明确区分“库”与“应用”
- `dataview/` 和 `whiteboard/` 可以继续作为各自项目根
- `whiteboard/packages/*` 不需要因为 demo 迁移而打散
- 共享样式和根级别名可以直接被两个 app 复用

## 推荐迁移顺序

### Phase 1

让根目录成为真正的 workspace root：

1. 新增根级 `package.json`
2. 新增根级 `pnpm-workspace.yaml`
3. 新增根级 `tsconfig.base.json`

这一阶段不做大搬家。

### Phase 2

让 `ui/` 正式包化：

1. 给 `ui/` 增加 `package.json`
2. 确定 `exports`
3. 确定 `types`
4. 明确 `@ui/*` 的别名语义

### Phase 3

统一 alias contract：

1. `@ui/*`
2. `@dataview/*`
3. 保留 `@whiteboard/*` 作为 package scope

### Phase 4

再决定是否要进一步整理 demo/app 结构。

## 这个方案的好处

### 对 `dataview`

- 不需要立刻拆包
- 仍然保持单项目心智
- 但已经能被统一 workspace 管理

### 对 `whiteboard`

- 现有 `packages` 结构不动
- 现有 package scope 语义不动
- 只是在更高一层接入根治理

### 对共享层

- `ui/` 获得正式工程身份
- 根级 alias 和共享配置可以有稳定落点

## 风险点

### 1. 双层 tsconfig 体系要收口

现在根目录和 `whiteboard/` 内部都有“基础配置”诉求，后续需要明确：

- 根 base 放什么
- `whiteboard` 内部 base 放什么

### 2. 不要把 alias 和 package name 混成一套

尤其是 `@whiteboard/*`，必须保留为 package scope，不要再重定义成源码路径别名。

### 3. `ui/react` 的源码消费边界要设计清楚

如果跨项目直接 import TS 源码，容易踩到各项目自己的 `rootDir` / `include` 边界。

后续要明确：

- 哪些通过 alias 指向源码
- 哪些通过 package exports 消费

## 最终建议

方案 A 是当前最合适的 monorepo 方向：

- 不打平 `whiteboard/packages`
- 不强行把所有项目塞进根 `packages/`
- 先把根目录升级成统一治理层
- 再把 `ui/`、alias、tsconfig、workspace 这几件基础设施做对

这条路最稳，也最符合现有仓库的真实边界。
