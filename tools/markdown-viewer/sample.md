# 墨览示例文档

> 用本文件验证代码、流程图、公式与表格渲染。

## 行内与强调

这是一段带 **加粗**、*斜体*、`行内代码` 和 [链接](https://example.com) 的文字。

任务列表：

- [x] 选择本地文件夹
- [x] 列出 Markdown
- [ ] 继续写下一篇文档

## 表格

| 元素 | 引擎 | 说明 |
| --- | --- | --- |
| 代码高亮 | highlight.js | 常见语言着色 |
| 流程图 | Mermaid | mermaid 代码块 |
| 数学公式 | KaTeX | 行内与块级公式 |
| 表格 | GFM | 管道表格 |

## 代码

```typescript
type Doc = { path: string; text: string };

function open(doc: Doc): string {
  return doc.text.slice(0, 80);
}

console.log(open({ path: "readme.md", text: "# Hello" }));
```

## 流程图

```mermaid
flowchart LR
  A[选择文件夹] --> B[扫描 .md]
  B --> C{是否有文档}
  C -->|有| D[侧栏列表]
  C -->|无| E[提示为空]
  D --> F[渲染阅读]
```

## 数学公式

行内公式：质能方程 $E = mc^2$，以及欧拉公式 $e^{i\pi} + 1 = 0$。

块级公式：

$$
\int_{-\infty}^{\infty} e^{-x^2}\,dx = \sqrt{\pi}
$$

$$
\begin{aligned}
\nabla \cdot \mathbf{E} &= \frac{\rho}{\varepsilon_0} \\
\nabla \times \mathbf{B} &= \mu_0\mathbf{J} + \mu_0\varepsilon_0\frac{\partial\mathbf{E}}{\partial t}
\end{aligned}
$$

## 引用

> 文档应就近可读，不必先上传云端。
>
> —— 墨览设计备忘
