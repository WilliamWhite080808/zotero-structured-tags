# 数据镜像与迁移规则 / Data Mirroring and Migration Rules

## 数据位置与主数据 / Storage Location and Source of Truth

结构化字段继续保存为 Zotero 原生标签，这是用于 Zotero 同步的主数据。插件另行在 Zotero 数据目录中维护 `structured-tags.sqlite`，保存字段目录、当前值镜像、变更历史、版本信息和迁移日志。安装目录不会保存用户数据。

Structured fields remain native Zotero tags, which are the source of truth used by Zotero Sync. The plugin additionally maintains `structured-tags.sqlite` in the Zotero data directory for the field catalog, mirrored values, change history, version metadata, and migration logs. No user data is stored in the application installation directory.

## 实时同步 / Real-Time Mirroring

- 插件单元格或批量编辑保存成功后，立即写入镜像。 / Successful cell and batch edits are mirrored immediately.
- 插件监听 Zotero 的 `item` 与 `item-tag` 通知；从标签面板、同步或其他插件产生的标签变化也会进入串行写入队列。 / The plugin observes Zotero `item` and `item-tag` notifications, so changes from the tag pane, Zotero Sync, or other plugins enter a serialized write queue.
- 每次变化记录旧值、新值、条目、字段、来源和时间。 / Each change records old and new values, item, field, source, and time.
- 镜像失败不会阻止 Zotero 原生标签保存；原生标签始终优先。 / A mirror failure never blocks native Zotero tag saving; native tags always take priority.

## 升级前扫描 / Pre-Upgrade Scan

检测到插件版本变化时，注册界面列之前依次执行：读取上一版本字段目录、采样每个字段最近 500 个非空值、计算候选匹配、记录全部判定、执行高置信度迁移、扫描所有文献并重建镜像，最后才记录新版本号。

When a version change is detected, the plugin performs the following before registering UI columns: load the previous field catalog, sample up to 500 recent non-empty values per field, score candidate matches, log every decision, apply high-confidence migrations, scan all items to rebuild the mirror, and only then record the new version.

## 匹配证据 / Matching Evidence

1. 稳定字段 ID：直接判为最高置信度。 / Stable field ID: immediate highest-confidence match.
2. 规范化名称完全一致：权重 `0.55`。规范化会统一 Unicode、大小写并移除空白和标点。 / Exact normalized name: weight `0.55`; normalization unifies Unicode and case and removes whitespace and punctuation.
3. 历史别名命中：权重 `0.48`。每次重命名都会保留旧名称。 / Recorded alias match: weight `0.48`; previous names are retained after renaming.
4. 名称编辑距离相似度：最高 `0.15`。 / Edit-distance name similarity: up to `0.15`.
5. 名称双字符片段重合度：最高 `0.12`，适合没有空格的中文名称。 / Character-bigram overlap: up to `0.12`, useful for unspaced Chinese names.
6. 字段类型：相同类型 `0.12`；单选与多选之间的兼容转换 `0.05`。 / Field type: `0.12` for identical types and `0.05` for compatible single/multiple-choice conversion.
7. 候选选项重合度：最高 `0.18`。 / Candidate-option overlap: up to `0.18`.
8. 实际值分布：数值比例、单值/多值基数和实际值对新选项的覆盖率，按样本量加权。 / Observed value distribution: numeric ratio, single/multiple-value cardinality, and coverage of new options, weighted by sample count.

## 决策阈值 / Decision Thresholds

- 稳定 ID：自动迁移。 / Stable ID: migrate automatically.
- 综合得分至少 `0.84`、领先次优候选至少 `0.12`、且字段类型兼容：自动迁移。 / Score at least `0.84`, lead over runner-up at least `0.12`, and compatible type: migrate automatically.
- 得分至少 `0.70`、领先至少 `0.18`：仅记录为保守复核，不自动修改。 / Score at least `0.70` with a lead of at least `0.18`: log for conservative review without automatic modification.
- 多个旧字段指向同一新字段：只保留稳定 ID 或最高分候选，其余降级为冲突复核。 / Multiple old fields targeting one new field: keep only the stable-ID or highest-scoring candidate and downgrade the others to collision review.
- 低于阈值或类型不兼容：不匹配、不覆盖。 / Below threshold or incompatible type: no match and no overwrite.

## 安全边界 / Safety Boundaries

自动迁移只重命名能够明确识别的结构化标签前缀，并保留标签值。数据库镜像不会在原生标签为空时擅自恢复旧值，以免把用户有意删除的数据重新写回。所有中低置信度结果只进入 `migration_log`。

Automatic migration renames only clearly identified structured-tag prefixes and preserves their values. The mirror never restores an old value merely because the native tag is empty, avoiding resurrection of intentionally deleted data. All medium- and low-confidence results are written only to `migration_log`.
