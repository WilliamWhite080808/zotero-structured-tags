# Changelog

## 1.0.4 - 2026-11-03

### 中文

- 自定义列改为普通文本，移除蓝色胶囊背景、边框和悬停底色
- 多值以顿号分隔，按整格宽度省略，继承列表字体和选中行文字颜色
- 保留单击编辑及完整值悬停提示

### English

- Render custom columns as plain text without blue pills, borders, or hover backgrounds
- Separate multiple values with an ideographic comma and truncate at the cell width, inheriting list typography and selection colors
- Preserve click-to-edit and full-value tooltips

## 1.0.3 - 2026-11-03

### 中文

- 修复镜像库存在 WAL 日志时，Zotero 10 启动后一直显示“正在检查数据库完整性”的问题
- 使用绝对路径以外部数据库模式打开原有镜像库，并独立检查完整性；不再触发主库恢复遮罩
- Zotero 退出时等待镜像写入完成并关闭连接；初始化失败时释放连接
- 列和菜单先于可选镜像初始化；保留现有原生标签、字段配置和镜像历史
- 增加数据库打开方式、故障降级和应用退出的回归测试

### English

- Fixes a persistent Zotero 10 integrity-check overlay when the mirror has an existing WAL
- Opens the existing mirror by absolute path in external-database mode and checks its integrity independently, avoiding main-library recovery UI
- Drains mirror writes and closes the connection on application exit; releases failed connections
- Registers columns and menus before optional mirror initialization, preserving native tags, field settings, and mirror history
- Adds regression coverage for database opening, failure fallback, and application shutdown

## 1.0.2 - 2026-10-22

### 中文

- 在 Zotero 数据目录中增加独立的 `structured-tags.sqlite` 本地镜像数据库
- 插件内修改及 Zotero 原生标签变化会实时写入镜像数据库和变更历史
- 版本升级前扫描现有字段与数据，并通过稳定 ID、规范化名称、历史别名、字段类型、候选选项重合度和名称相似度进行多层匹配
- 仅自动执行高置信度迁移；中低置信度结果保守记录，不覆盖原数据
- README、发布说明和发布流程改为中英双语

### English

- Adds a separate `structured-tags.sqlite` mirror database in the Zotero data directory
- Mirrors plugin edits and native Zotero tag changes in real time with an audit history
- Scans fields and data before version migration and matches them using stable IDs, normalized names, recorded aliases, field types, option overlap, and name similarity
- Automatically migrates only high-confidence matches; uncertain results are logged without overwriting source data
- Makes the README, release notes, and publishing guide bilingual

## 1.0.1 - 2026-10-22

### 中文

- 修复“字段与选项设置”菜单无法打开的问题
- 修复“编辑所选文献”菜单无法打开的问题
- 编辑窗口改用 Zotero 10 支持的受信任插件地址加载
- 窗口打开失败时显示明确错误信息

### English

- Fixes the Field and Options Settings window in Zotero 10
- Fixes the Edit Selected Items window in Zotero 10
- Loads editor windows through a registered privileged plugin URL
- Shows an explicit error when an editor window cannot be opened

## 1.0.0 - 2026-10-21

### 中文

- 首次公开发布
- 支持可配置的结构化标签列
- 支持单选、多选、数值和文本字段
- 支持单元格编辑、批量编辑和字段配置
- 使用通用默认字段，不包含特定研究领域内容

### English

- First public release
- Provides configurable structured-tag columns
- Supports single-choice, multiple-choice, numeric, and text fields
- Supports cell editing, batch editing, and field configuration
- Uses general-purpose defaults without exposing a specific research topic
