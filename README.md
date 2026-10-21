# Structured Tags for Zotero

一个面向 Zotero 10 的可配置结构化标签插件。它使用 Zotero 原生标签保存数据，并将字段显示为文献列表中的独立列。

## 功能

- 在文献列表中显示自定义标签列
- 支持单选、多选、数值和文本字段
- 单击自定义单元格直接编辑
- 批量修改所选文献
- 自定义列名、候选选项、显示状态和排列顺序
- 重命名字段时自动迁移已有原生标签
- 数据仍是 Zotero 原生标签，可随 Zotero 正常同步

默认字段仅作为通用示例，包括重要程度、阅读状态、文献类型、关键数值、用途、复现状态、数据可用性和备注。所有字段都可以修改或删除。

## 安装

1. 从 GitHub Releases 下载最新的 `.xpi` 文件。
2. 在 Zotero 中打开“工具 → 插件”。
3. 点击右上角齿轮，选择“Install Plugin From File…”。
4. 选择下载的 `.xpi` 文件。

## 使用

- 单击自定义字段单元格，直接修改该文献的对应值。
- 在顶部菜单栏打开“标签管理 → 编辑所选文献…”，批量编辑所选文献。
- 打开“标签管理 → 字段与选项设置…”，修改列名、类型、选项、顺序和显示状态。
- 双击自定义列表头，可以直接重命名该列。

## 本地构建

```powershell
.\build.ps1
```

构建产物位于 `dist/`。构建脚本会先运行清单验证。

运行测试：

```powershell
node .\tests\validate-manifest.mjs
node .\tests\test-structured-tags.mjs
```

## 发布

完整步骤见 [PUBLISHING.md](PUBLISHING.md)。

## License

[MIT](LICENSE)
