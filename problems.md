 你觉得我想尽量做到spec+plain object+字符串配置来实现装配，shared下面这些基础设施以及上层
  使用方还能进一步简化做到长期最优吗，全面研究后在根目录生成一份文档，尽量把能覆盖的都覆盖
  掉

  dataview/packages/dataview-runtime/src/source/patch.ts 你觉得这个可以下沉吗，先不要写代码

  帮我扫一轮现在的实现，找找有没有这些问题： 1. 类型上因为shared暴露过少导致上层频繁的自己定义或者强转，unknown，any，或者泛型很复杂 2. 还是没有做到spec+plain object+字符串化+callback，而是仍然暴露helper让上层去构建和解析 3. 类似patch的问题，因为重构而导致退化，只能用parse来兜底，delta和类型传递不畅 4. 还存在中间层或者兼容过渡层 总之是尽可能减少helpers和过多的类型，让上层最大化利用底层设施，基于底层设施来构建代码，能统一和复用的就尽量统一，比如 dataview/packages/dataview-core/src/operations/definitions.ts和dataview/packages/dataview-core/src/operations/compile.ts等等这些issues还有compile，你把whiteboard和dataview都扫一遍，然后整理成一份根目录文档