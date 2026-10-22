# GitHub 发布步骤

以下示例使用仓库名 `zotero-structured-tags`。

## 1. 核对 GitHub 用户名

当前公开版按 GitHub 用户名 `WilliamWhite080808` 配置。如果实际用户名不同，请先替换以下文件中的 `WilliamWhite080808`：

- `manifest.json`
- `updates.json`
- `LICENSE`

## 2. 创建仓库

1. 登录 GitHub。
2. 点击右上角 `+`，选择 **New repository**。
3. Repository name 填写 `zotero-structured-tags`。
4. 选择 **Public**。
5. 不要勾选自动添加 README、`.gitignore` 或 License。
6. 点击 **Create repository**。

## 3. 上传源码

在本目录打开 PowerShell，执行：

```powershell
git init -b main
git config user.name "WilliamWhite080808"
git config user.email "你的 GitHub no-reply 邮箱"
git add .
git commit -m "Initial public release"
git remote add origin https://github.com/WilliamWhite080808/zotero-structured-tags.git
git push -u origin main
```

GitHub no-reply 邮箱可在 GitHub 的 **Settings → Emails** 中查看。不要直接使用电脑当前的全局 Git 邮箱，否则该邮箱会写入公开提交历史。

首次推送时，GitHub 可能要求通过浏览器登录或使用 Personal Access Token。

## 4. 创建 1.0.0 Release

1. 打开仓库页面，进入 **Releases**。
2. 点击 **Create a new release**。
3. 新建 tag：`v1.0.0`。
4. Release title 填写 `Structured Tags for Zotero 1.0.0`。
5. 上传 `dist/structured-tags-1.0.0.xpi`。
6. 点击 **Publish release**。

## 5. 验证自动更新文件

发布完成后，确认以下两个地址可以直接打开：

- `https://raw.githubusercontent.com/WilliamWhite080808/zotero-structured-tags/main/updates.json`
- `https://github.com/WilliamWhite080808/zotero-structured-tags/releases/download/v1.0.0/structured-tags-1.0.0.xpi`

以后发布新版本时，需要同步更新：

1. `manifest.json` 中的版本号。
2. `updates.json` 中的版本号、下载地址和 SHA-256。
3. GitHub Release 的 tag 和 `.xpi` 文件。
