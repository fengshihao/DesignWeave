# Markdown 所见即所得编辑器选型调研

> 状态：调研记录 · 2026-08-10  
> 背景：文档以 Markdown 目录为真相源（见 [04-文档存储原则.md](./04-文档存储原则.md)），Web UI 需要可嵌入的编辑器。

## 1. 选型约束（DesignWeave）

- 落盘必须是 **可 Git / 可 Obsidian 打开的 Markdown**（优先 GFM）
- 技术栈：React / Next.js，内网小服务器，多人浏览器
- 用户：软件设计师为主，中文优先；不要求人人会写 md 语法
- 许可：优先 MIT/开源，避免强依赖商业云编辑器

## 2. 三类方案

### A. Markdown 原生（推荐优先评估）

| 方案 | 编辑体验 | 与 md 往返 | 备注 |
|------|----------|------------|------|
| [Vditor](https://github.com/Vanessa219/vditor) | WYSIWYG / 即时渲染(IR，类 Typora) / 分屏(SV) | 直接 md | 中文社区成熟；公式、任务列表、图表等齐全；有 React 封装 |
| [Milkdown](https://milkdown.dev/)（含 Crepe） | WYSIWYG，现代文档风 | md 一等公民（Remark） | MIT；插件化；偏国际 React 生态 |
| [MDXEditor](https://mdxeditor.dev/) | 工具栏式 WYSIWYG | md / mdx | 上手快；包体偏大 |
| [ByteMD](https://github.com/bytedance/bytemd) | 分屏+预览为主 | md | 轻量；严格 WYSIWYG 较弱 |
| Cherry Markdown（腾讯） | 分屏为主 | md | 国内文档场景常见 |

### B. Notion 块编辑器（体验好，md 多为导出）

| 方案 | 特点 |
|------|------|
| [BlockNote](https://www.blocknotejs.org/) | slash 菜单开箱即用；底层 Tiptap；React 友好 |
| [Novel](https://novel.sh/) | Notion 风模板向 |
| [Tiptap](https://tiptap.dev/) | 无头、最灵活；UI 需自建；md 靠扩展双向转换 |

风险：内部模型常为 JSON/HTML，转 md 可能丢细节（注释、部分表格/扩展语法）。与「文件即真相」略拧。

### C. 底层框架 / 传统富文本（成本高或 HTML 中心）

- Lexical、Plate/Slate：能力强，md 桥接与产品 UI 需自建  
- CKEditor / TinyMCE：企业富文本成熟，默认 HTML 中心，授权与内网部署更重  

## 3. 结论倾向

1. **首选 POC：Vditor**（默认 IR 或 WYSIWYG，保留 SV/源码入口）  
   - 与中文用户、md 落盘、三模式切换最合  
2. **对照 POC：Milkdown**  
   - 若更看重现代 React 插件体系与长期定制，再比一轮  
3. **暂不作为主编辑器：纯 BlockNote / 无头 Tiptap**  
   - 除非接受「内部块模型 + 保存时转 md」并单独验收保真度  

可并存策略：Web 默认所见即所得；高级用户可源码模式；也可用 Obsidian 直接改同一 vault 文件。

## 4. POC 验收清单（Vditor vs Milkdown）

用同一篇样例 PRD（含：多级标题、列表、任务列表、表格、代码块、链接、引用）验证：

- [ ] 加载 md → 编辑 → 保存后的 diff 是否干净、可预期  
- [ ] 外部用 Obsidian/VS Code 改同一文件后，刷新能否正确重载  
- [ ] 中文输入、IME 是否顺畅  
- [ ] Next.js 客户端组件集成成本（动态 import、SSR）  
- [ ] 包体与首屏性能是否可接受  
- [ ] 许可证与内网离线（CDN/本地静态资源）是否可行  

## 5. 相关链接

- Vditor：https://github.com/Vanessa219/vditor  
- Milkdown：https://milkdown.dev/  
- MDXEditor：https://mdxeditor.dev/  
- BlockNote：https://www.blocknotejs.org/  
- 存储原则：[04-文档存储原则.md](./04-文档存储原则.md)
