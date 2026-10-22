# GitHub 发布步骤 / GitHub Publishing Guide

## 1. 选择版本号 / Choose a Version

- 修复问题使用补丁版本，例如 `1.0.1 → 1.0.2`。 / Use a patch version for fixes, such as `1.0.1 → 1.0.2`.
- 增加兼容功能使用次版本，例如 `1.0.2 → 1.1.0`。 / Use a minor version for compatible features, such as `1.0.2 → 1.1.0`.
- 不兼容变更使用主版本。 / Use a major version for incompatible changes.

## 2. 更新所有版本文件 / Update Every Versioned File

1. 修改 `manifest.json` 中的 `version`。 / Change `version` in `manifest.json`.
2. 在 `CHANGELOG.md` 顶部添加中英双语更新说明。 / Add bilingual notes at the top of `CHANGELOG.md`.
3. 构建完成后，在 `updates.json` 最前面加入版本号、Release 下载地址和 SHA-256。 / After building, prepend the version, Release URL, and SHA-256 to `updates.json`.
4. 如功能或使用方式变化，同步更新中英双语 `README.md`。 / Update the bilingual `README.md` when behavior or usage changes.

## 3. 测试与构建 / Test and Build

```powershell
node .\tests\validate-manifest.mjs
node .\tests\test-structured-tags.mjs
.\build.ps1
```

计算校验值 / Calculate the checksum:

```powershell
(Get-FileHash .\dist\structured-tags-VERSION.xpi -Algorithm SHA256).Hash.ToLower()
```

## 4. 提交源码 / Commit the Source

```powershell
git add .
git commit -m "Release version VERSION"
git push origin main
```

## 5. 创建 Release / Create the Release

1. 打开仓库的 **Releases → Draft a new release**。 / Open **Releases → Draft a new release**.
2. 创建标签 `vVERSION`，例如 `v1.0.2`。 / Create tag `vVERSION`, for example `v1.0.2`.
3. 标题必须清楚包含版本号：`Structured Tags for Zotero VERSION`。 / The title must clearly include the version: `Structured Tags for Zotero VERSION`.
4. Release 正文必须包含“中文说明”和“English Notes”。 / The body must contain both “中文说明” and “English Notes”.
5. 上传 `dist/structured-tags-VERSION.xpi`。 / Upload `dist/structured-tags-VERSION.xpi`.
6. 发布后核对标签、文件名、下载链接、版本号和哈希完全一致。 / After publishing, verify the tag, filename, URL, version, and hash all match.

## 6. Release 正文模板 / Release Notes Template

```markdown
# VERSION / Version VERSION

## 中文说明

- 本版本的主要变化

## English Notes

- Main changes in this release

## 安装 / Installation

下载 `structured-tags-VERSION.xpi`，在 Zotero 中选择“工具 → 插件 → Install Plugin From File…”，然后重启 Zotero。

Download `structured-tags-VERSION.xpi`, choose **Tools → Plugins → Install Plugin From File…**, and restart Zotero.
```

## 7. 验证自动更新 / Verify Automatic Updates

- [updates.json](https://raw.githubusercontent.com/WilliamWhite080808/zotero-structured-tags/main/updates.json)
- [GitHub Releases](https://github.com/WilliamWhite080808/zotero-structured-tags/releases)

Zotero 读取 `manifest.json` 中的 `update_url`，因此 `updates.json` 必须先推送，Release 中也必须存在对应的 XPI。 / Zotero reads `update_url` from `manifest.json`, so `updates.json` must be pushed and the matching XPI must exist in the Release.
