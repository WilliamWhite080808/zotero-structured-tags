/* global Zotero, Services */

var StructuredTags = {
  pluginID: "structured-tags@williamwhite.github.io",
  prefKey: "extensions.zoteroStructuredTags.fields",
  versionPrefKey: "extensions.zoteroStructuredTags.lastStorageVersion",
  rootURI: "",
  addonVersion: "0.0.0",
  db: null,
  notifierID: null,
  storageQueue: Promise.resolve(),
  registeredColumns: [],
  columnFieldMap: new Map(),
  windows: new Set(),

  defaultFields: [
    { id: "importance", name: "重要程度", type: "single", options: ["1", "2", "3", "4", "5"] },
    { id: "reading", name: "阅读状态", type: "single", options: ["未读", "粗读", "精读", "已总结"] },
    { id: "literatureType", name: "文献类型", type: "multi", options: ["理论研究", "实验研究", "方法研究", "综述"] },
    { id: "keyMetric", name: "关键数值", type: "number", options: [] },
    { id: "usage", name: "用途", type: "multi", options: ["背景资料", "方法参考", "数据来源", "结果讨论"] },
    { id: "reproduction", name: "复现状态", type: "single", options: ["未尝试", "进行中", "成功", "失败"] },
    { id: "dataAvailability", name: "数据可用性", type: "single", options: ["正文提供", "补充材料", "公开仓库", "需申请", "不可得"] },
    { id: "remark", name: "备注", type: "text", options: [] }
  ],

  setRootURI(rootURI) {
    this.rootURI = rootURI;
  },

  setAddonVersion(version) {
    this.addonVersion = String(version || "0.0.0");
  },

  async startup() {
    if (!Zotero.Prefs.get(this.prefKey, true)) {
      Zotero.Prefs.set(this.prefKey, JSON.stringify(this.defaultFields), true);
    }
    await this.initializeStorage();
    if (this.db) {
      try {
        await this.reconcileForVersionChange();
        this.registerStorageObserver();
      }
      catch (error) {
        // The native Zotero tags remain usable even if the optional local
        // mirror cannot be reconciled. Never block the main plugin UI.
        Zotero.logError(error);
      }
    }
    await this.registerColumns();
    for (let win of Services.wm.getEnumerator("navigator:browser")) {
      this.addToWindow(win);
    }
  },

  async shutdown() {
    if (this.notifierID) {
      Zotero.Notifier.unregisterObserver(this.notifierID);
      this.notifierID = null;
    }
    await this.storageQueue.catch(() => {});
    for (let win of [...this.windows]) this.removeFromWindow(win);
    await this.unregisterColumns();
    if (this.db) {
      await this.db.closeDatabase();
      this.db = null;
    }
  },

  getConfig() {
    try {
      let parsed = JSON.parse(Zotero.Prefs.get(this.prefKey, true) || "[]");
      if (Array.isArray(parsed) && parsed.length) return parsed;
    }
    catch (e) {
      Zotero.logError(e);
    }
    return structuredClone(this.defaultFields);
  },

  async initializeStorage() {
    if (!Zotero.DBConnection) return;
    try {
      this.db = new Zotero.DBConnection("structured-tags");
      let statements = [
        `CREATE TABLE IF NOT EXISTS metadata (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS fields (
          field_id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          normalized_name TEXT NOT NULL,
          type TEXT NOT NULL,
          options_json TEXT NOT NULL,
          aliases_json TEXT NOT NULL,
          active INTEGER NOT NULL DEFAULT 1,
          updated_at INTEGER NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS item_values (
          library_id INTEGER NOT NULL,
          item_key TEXT NOT NULL,
          item_id INTEGER NOT NULL,
          field_id TEXT NOT NULL,
          field_name TEXT NOT NULL,
          values_json TEXT NOT NULL,
          source TEXT NOT NULL,
          updated_at INTEGER NOT NULL,
          PRIMARY KEY (library_id, item_key, field_id)
        )`,
        `CREATE TABLE IF NOT EXISTS change_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          library_id INTEGER NOT NULL,
          item_key TEXT NOT NULL,
          item_id INTEGER NOT NULL,
          field_id TEXT NOT NULL,
          old_values_json TEXT NOT NULL,
          new_values_json TEXT NOT NULL,
          source TEXT NOT NULL,
          changed_at INTEGER NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS migration_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          from_version TEXT NOT NULL,
          to_version TEXT NOT NULL,
          old_field_id TEXT,
          old_field_name TEXT,
          new_field_id TEXT,
          new_field_name TEXT,
          score REAL NOT NULL,
          decision TEXT NOT NULL,
          details_json TEXT NOT NULL,
          created_at INTEGER NOT NULL
        )`,
        "CREATE INDEX IF NOT EXISTS item_values_item_id ON item_values(item_id)",
        "CREATE INDEX IF NOT EXISTS change_history_item_id ON change_history(item_id)"
      ];
      for (let statement of statements) await this.db.queryAsync(statement);
      Zotero.debug(`Structured Tags: local mirror database ready at ${this.db.path}`);
    }
    catch (error) {
      Zotero.logError(error);
      this.db = null;
    }
  },

  async getStorageMeta(key) {
    if (!this.db) return null;
    return this.db.valueQueryAsync("SELECT value FROM metadata WHERE key=?", [key]);
  },

  async setStorageMeta(key, value) {
    if (!this.db) return;
    await this.db.queryAsync("INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)", [key, String(value)]);
  },

  normalizeMatchText(value) {
    return String(value || "")
      .normalize("NFKC")
      .toLocaleLowerCase()
      .replace(/[\p{P}\p{S}\s]+/gu, "")
      .trim();
  },

  matchTokens(value) {
    let normalized = this.normalizeMatchText(value);
    if (!normalized) return new Set();
    if (normalized.length < 2) return new Set([normalized]);
    let tokens = new Set();
    for (let i = 0; i < normalized.length - 1; i++) tokens.add(normalized.slice(i, i + 2));
    return tokens;
  },

  setSimilarity(left, right) {
    let a = left instanceof Set ? left : new Set(left || []);
    let b = right instanceof Set ? right : new Set(right || []);
    if (!a.size && !b.size) return 1;
    let intersection = [...a].filter(value => b.has(value)).length;
    return intersection / Math.max(1, a.size + b.size - intersection);
  },

  stringSimilarity(left, right) {
    left = this.normalizeMatchText(left);
    right = this.normalizeMatchText(right);
    if (left === right) return left ? 1 : 0;
    if (!left || !right) return 0;
    let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
    for (let i = 1; i <= left.length; i++) {
      let current = [i];
      for (let j = 1; j <= right.length; j++) {
        current[j] = Math.min(
          current[j - 1] + 1,
          previous[j] + 1,
          previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1)
        );
      }
      previous = current;
    }
    return Math.max(0, 1 - previous[right.length] / Math.max(left.length, right.length));
  },

  typesCompatible(oldType, newType) {
    if (oldType === newType) return true;
    return new Set([oldType, newType]).size === 2 && [oldType, newType].every(type => ["single", "multi"].includes(type));
  },

  scoreFieldMatch(oldField, newField) {
    if (oldField.id && oldField.id === newField.id) {
      return { score: 1, reasons: ["stable-id"] };
    }
    let score = 0;
    let reasons = [];
    let oldName = this.normalizeMatchText(oldField.name);
    let newName = this.normalizeMatchText(newField.name);
    let aliases = [...(oldField.aliases || []), ...(newField.aliases || [])].map(value => this.normalizeMatchText(value));
    if (oldName && oldName === newName) {
      score += 0.55;
      reasons.push("exact-normalized-name");
    }
    else if (aliases.includes(oldName) || aliases.includes(newName)) {
      score += 0.48;
      reasons.push("recorded-alias");
    }
    let lexical = this.stringSimilarity(oldName, newName);
    let tokenOverlap = this.setSimilarity(this.matchTokens(oldName), this.matchTokens(newName));
    score += lexical * 0.15 + tokenOverlap * 0.12;
    if (lexical >= 0.75) reasons.push("similar-name");
    if (oldField.type === newField.type) {
      score += 0.12;
      reasons.push("same-type");
    }
    else if (this.typesCompatible(oldField.type, newField.type)) {
      score += 0.05;
      reasons.push("compatible-type");
    }
    let oldOptions = new Set((oldField.options || []).map(value => this.normalizeMatchText(value)).filter(Boolean));
    let newOptions = new Set((newField.options || []).map(value => this.normalizeMatchText(value)).filter(Boolean));
    if (oldOptions.size || newOptions.size) {
      let optionOverlap = this.setSimilarity(oldOptions, newOptions);
      score += optionOverlap * 0.18;
      if (optionOverlap >= 0.5) reasons.push("option-overlap");
    }
    else if (["number", "text"].includes(oldField.type) && oldField.type === newField.type) {
      score += 0.06;
      reasons.push("value-shape-compatible");
    }
    let profile = oldField.valueProfile;
    if (profile?.samples) {
      let confidence = Math.min(1, profile.samples / 5);
      if (newField.type === "number" && profile.numericRatio >= 0.9) {
        score += 0.08 * confidence;
        reasons.push("numeric-value-distribution");
      }
      if (newField.type === "single" && profile.multiRatio === 0) {
        score += 0.04 * confidence;
        reasons.push("single-value-cardinality");
      }
      if (newField.type === "multi" && profile.multiRatio >= 0.2) {
        score += 0.04 * confidence;
        reasons.push("multi-value-cardinality");
      }
      if (newOptions.size && profile.values?.length) {
        let matchingValues = profile.values.filter(value => newOptions.has(this.normalizeMatchText(value))).length;
        let coverage = matchingValues / profile.values.length;
        score += coverage * 0.10 * confidence;
        if (coverage >= 0.5) reasons.push("observed-value-option-coverage");
      }
    }
    return { score: Math.min(0.99, score), reasons };
  },

  matchStoredFields(oldFields, newFields) {
    let matches = oldFields.map(oldField => {
      let candidates = newFields.map(newField => ({
        field: newField,
        ...this.scoreFieldMatch(oldField, newField)
      })).sort((a, b) => b.score - a.score);
      let best = candidates[0] || null;
      let second = candidates[1] || { score: 0 };
      let margin = best ? best.score - second.score : 0;
      let decision = "unmatched";
      if (best?.reasons.includes("stable-id")) decision = "auto-stable-id";
      else if (best && best.score >= 0.84 && margin >= 0.12 && this.typesCompatible(oldField.type, best.field.type)) decision = "auto-high-confidence";
      else if (best && best.score >= 0.70 && margin >= 0.18 && this.typesCompatible(oldField.type, best.field.type)) decision = "review-conservative";
      return { oldField, best, margin, decision };
    });
    let automatic = matches.filter(match => match.decision.startsWith("auto-") && match.best);
    for (let newField of newFields) {
      let competing = automatic.filter(match => match.best.field.id === newField.id);
      if (competing.length < 2) continue;
      competing.sort((a, b) => {
        let stableDifference = Number(b.decision === "auto-stable-id") - Number(a.decision === "auto-stable-id");
        return stableDifference || b.best.score - a.best.score;
      });
      for (let conflict of competing.slice(1)) conflict.decision = "review-candidate-collision";
    }
    return matches;
  },

  async loadStoredFields() {
    if (!this.db) return [];
    let rows = await this.db.queryAsync("SELECT * FROM fields WHERE active=1");
    let fields = [];
    for (let row of rows) {
      let valueRows = await this.db.queryAsync(
        "SELECT values_json FROM item_values WHERE field_id=? ORDER BY updated_at DESC LIMIT 500",
        [row.field_id]
      );
      let samples = valueRows.map(valueRow => {
        try { return JSON.parse(valueRow.values_json || "[]"); }
        catch (error) { return []; }
      }).filter(values => Array.isArray(values) && values.length);
      let flattened = samples.flat().map(String).filter(Boolean);
      fields.push({
        id: row.field_id,
        name: row.name,
        type: row.type,
        options: JSON.parse(row.options_json || "[]"),
        aliases: JSON.parse(row.aliases_json || "[]"),
        valueProfile: {
          samples: samples.length,
          numericRatio: flattened.length ? flattened.filter(value => Number.isFinite(Number(value))).length / flattened.length : 0,
          multiRatio: samples.length ? samples.filter(values => values.length > 1).length / samples.length : 0,
          values: [...new Set(flattened)].slice(0, 200)
        }
      });
    }
    return fields;
  },

  async persistFieldCatalog(fields) {
    if (!this.db) return;
    let now = Date.now();
    await this.db.queryAsync("UPDATE fields SET active=0");
    for (let field of fields) {
      await this.db.queryAsync(
        `INSERT OR REPLACE INTO fields
          (field_id, name, normalized_name, type, options_json, aliases_json, active, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
        [field.id, field.name, this.normalizeMatchText(field.name), field.type,
          JSON.stringify(field.options || []), JSON.stringify(field.aliases || []), now]
      );
    }
  },

  async logMigration(fromVersion, match) {
    if (!this.db) return;
    await this.db.queryAsync(
      `INSERT INTO migration_log
        (from_version, to_version, old_field_id, old_field_name, new_field_id, new_field_name, score, decision, details_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [fromVersion || "unknown", this.addonVersion, match.oldField.id || null, match.oldField.name || null,
        match.best?.field.id || null, match.best?.field.name || null, match.best?.score || 0, match.decision,
        JSON.stringify({ margin: match.margin, reasons: match.best?.reasons || [] }), Date.now()]
    );
  },

  async migrateMatchedField(oldField, newField) {
    if (!oldField?.name || !newField?.name || oldField.name === newField.name) return;
    let oldPrefix = `${oldField.name}：`;
    for (let library of Zotero.Libraries.getAll()) {
      try {
        let tags = await Zotero.Tags.getAll(library.libraryID);
        for (let tagData of tags) {
          if (!tagData.tag.startsWith(oldPrefix)) continue;
          let value = tagData.tag.slice(oldPrefix.length);
          if (value) await Zotero.Tags.rename(library.libraryID, tagData.tag, `${newField.name}：${value}`);
        }
      }
      catch (error) {
        Zotero.logError(error);
      }
    }
  },

  async reconcileForVersionChange() {
    if (!this.db) return;
    let previousVersion = await this.getStorageMeta("addon_version")
      || Zotero.Prefs.get(this.versionPrefKey, true)
      || "none";
    let currentFields = this.getConfig();
    if (previousVersion !== this.addonVersion) {
      let storedFields = await this.loadStoredFields();
      for (let match of this.matchStoredFields(storedFields, currentFields)) {
        await this.logMigration(previousVersion, match);
        if (["auto-stable-id", "auto-high-confidence"].includes(match.decision)) {
          await this.migrateMatchedField(match.oldField, match.best.field);
        }
      }
      await this.persistFieldCatalog(currentFields);
      await this.scanAllLibraries(`version-scan:${previousVersion}->${this.addonVersion}`);
      await this.setStorageMeta("addon_version", this.addonVersion);
      await this.setStorageMeta("last_reconciliation_at", Date.now());
      Zotero.Prefs.set(this.versionPrefKey, this.addonVersion, true);
    }
    else {
      await this.persistFieldCatalog(currentFields);
    }
  },

  async scanAllLibraries(source = "startup-scan") {
    if (!this.db || !Zotero.Items.getAll) return;
    for (let library of Zotero.Libraries.getAll()) {
      try {
        let items = await Zotero.Items.getAll(library.libraryID, true, false);
        for (let item of items) {
          if (item?.isRegularItem?.()) await this.syncItemToStorage(item, source);
        }
      }
      catch (error) {
        Zotero.logError(error);
      }
    }
  },

  async syncItemToStorage(item, source = "notifier") {
    if (!this.db) return;
    item = this.resolveRegularItem(item);
    if (!item) return;
    let fields = this.getConfig();
    let libraryID = Number(item.libraryID || 0);
    let itemKey = String(item.key || item.id);
    let now = Date.now();
    await this.db.executeTransaction(async () => {
      for (let field of fields) {
        let valuesJSON = JSON.stringify(this.getValues(item, field));
        let existing = await this.db.rowQueryAsync(
          "SELECT values_json FROM item_values WHERE library_id=? AND item_key=? AND field_id=?",
          [libraryID, itemKey, field.id]
        );
        let oldJSON = existing?.values_json || "[]";
        if (oldJSON === valuesJSON) continue;
        await this.db.queryAsync(
          `INSERT OR REPLACE INTO item_values
            (library_id, item_key, item_id, field_id, field_name, values_json, source, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [libraryID, itemKey, item.id, field.id, field.name, valuesJSON, source, now]
        );
        await this.db.queryAsync(
          `INSERT INTO change_history
            (library_id, item_key, item_id, field_id, old_values_json, new_values_json, source, changed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [libraryID, itemKey, item.id, field.id, oldJSON, valuesJSON, source, now]
        );
      }
    });
  },

  registerStorageObserver() {
    if (!this.db || !Zotero.Notifier?.registerObserver || this.notifierID) return;
    this.notifierID = Zotero.Notifier.registerObserver({
      notify: (event, type, ids) => {
        let itemIDs = type === "item-tag"
          ? ids.map(value => Number(String(value).split("-")[0])).filter(Boolean)
          : ids.map(Number).filter(Boolean);
        if (!itemIDs.length) return;
        this.storageQueue = this.storageQueue.then(async () => {
          for (let itemID of new Set(itemIDs)) {
            let item = await Zotero.Items.getAsync(itemID);
            if (item) await this.syncItemToStorage(item, `notifier:${type}:${event}`);
            else await this.db.queryAsync("DELETE FROM item_values WHERE item_id=?", [itemID]);
          }
        }).catch(error => Zotero.logError(error));
      }
    }, ["item", "item-tag"], "structured-tags-storage", 101);
  },

  normalizeName(value) {
    return String(value || "").replace(/[：:\r\n]/g, " ").replace(/\s+/g, " ").trim().slice(0, 240);
  },

  prefix(field) {
    return `${field.name}：`;
  },

  getValues(item, field) {
    item = this.resolveRegularItem(item);
    if (!item) return [];
    let prefix = this.prefix(field);
    return item.getTags()
      .map(x => x.tag)
      .filter(tag => tag.startsWith(prefix))
      .map(tag => tag.slice(prefix.length))
      .filter(Boolean);
  },

  resolveRegularItem(item) {
    if (!item) return null;
    if (item.isRegularItem?.()) return item;
    let parentID = item.parentItemID;
    if (!parentID && item.getSource) {
      try { parentID = item.getSource(); }
      catch (e) {}
    }
    let parent = parentID ? Zotero.Items.get(parentID) : null;
    return parent?.isRegularItem?.() ? parent : null;
  },

  selectionToRegularItems(items) {
    let unique = new Map();
    for (let item of items || []) {
      let regular = this.resolveRegularItem(item);
      if (regular) unique.set(regular.id, regular);
    }
    return [...unique.values()];
  },

  displayValue(field, values) {
    if (field.id === "importance" && values[0]) {
      let n = Math.max(0, Math.min(5, Number(values[0]) || 0));
      return "★".repeat(n);
    }
    return values.join("\u001f");
  },

  packCellData(item, display) {
    let regular = this.resolveRegularItem(item);
    return regular ? `${display || ""}\u001e${regular.id}` : "";
  },

  unpackCellData(rawData) {
    let parts = String(rawData || "").split("\u001e");
    return { display: parts[0] || "", itemID: Number(parts[1]) || 0 };
  },

  escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, char => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
    })[char]);
  },

  makeCell(doc, field, rawData, aggregate = false, onEdit = null, column = null) {
    let root = doc.createElement("div");
    root.className = `cell ${column?.className || ""}`.trim();
    root.style.cssText = "display:flex;align-items:center;justify-content:center;gap:4px;overflow:hidden;white-space:nowrap;height:100%;min-width:0;padding-inline:2px;box-sizing:border-box;";
    if (onEdit) {
      root.dataset.structuredCell = "true";
      root.dataset.empty = rawData ? "false" : "true";
      root.title = field ? `单击编辑“${field.name}”` : "单击编辑结构化标签";
      root.style.cursor = "pointer";
      for (let eventName of ["mousedown", "dblclick"]) {
        root.addEventListener(eventName, event => event.stopPropagation());
      }
      root.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        onEdit(root, event);
      });
    }
    if (!rawData) return root;
    for (let value of String(rawData).split("\u001f")) {
      let chip = doc.createElement("span");
      chip.textContent = value;
      chip.title = value;
      chip.style.cssText = [
        "display:inline-block",
        "max-width:180px",
        "overflow:hidden",
        "text-overflow:ellipsis",
        "padding:1px 6px",
        "border-radius:9px",
        "font-size:0.92em",
        "line-height:1.35",
        "background:color-mix(in srgb, AccentColor 17%, transparent)",
        "border:1px solid color-mix(in srgb, AccentColor 36%, transparent)",
        "color:inherit"
      ].join(";");
      root.appendChild(chip);
    }
    return root;
  },

  async registerColumns() {
    await this.unregisterColumns();
    let fields = this.getConfig().filter(field => field.visible !== false);
    let plugin = this;
    for (let field of fields) {
      let dataKey = await Zotero.ItemTreeManager.registerColumn({
        dataKey: `structured-tags-${field.id}`,
        label: field.name,
        htmlLabel: `<span style="display:block;text-align:center;width:100%">${this.escapeHTML(field.name)}</span>`,
        pluginID: this.pluginID,
        showInColumnPicker: true,
        defaultIn: ["*"],
        flex: field.type === "text" ? 1.5 : 1,
        minWidth: 4,
        zoteroPersist: ["width", "hidden", "sortDirection"],
        dataProvider: item => this.packCellData(item, this.displayValue(field, this.getValues(item, field))),
        renderCell: (index, data, column, isFirstColumn, doc) => {
          let packed = plugin.unpackCellData(data);
          return plugin.makeCell(doc, field, packed.display, false, anchor => {
            if (packed.itemID) plugin.openInlineEditor(doc.defaultView, packed.itemID, field, anchor);
          }, column);
        }
      });
      this.registeredColumns.push(dataKey);
      this.columnFieldMap.set(dataKey, field.id);
    }

    let allKey = await Zotero.ItemTreeManager.registerColumn({
      dataKey: "structured-tags-all",
      label: "全部自定义标签",
      pluginID: this.pluginID,
      showInColumnPicker: true,
      flex: 2,
      minWidth: 4,
      zoteroPersist: ["width", "hidden", "sortDirection"],
      dataProvider: item => this.packCellData(item, fields.flatMap(field =>
        this.getValues(item, field).map(value => `${field.name}：${value}`)
      ).join("\u001f")),
      renderCell: (index, data, column, isFirstColumn, doc) => {
        let packed = plugin.unpackCellData(data);
        return plugin.makeCell(doc, null, packed.display, true, () => {
          if (packed.itemID) plugin.openEditor(doc.defaultView, "edit", [packed.itemID]);
        }, column);
      }
    });
    this.registeredColumns.push(allKey);

  },

  async unregisterColumns() {
    this.columnFieldMap.clear();
    for (let dataKey of this.registeredColumns.splice(0)) {
      try {
        await Zotero.ItemTreeManager.unregisterColumn(dataKey);
      }
      catch (e) {
        Zotero.debug(`Structured Tags: unable to unregister ${dataKey}: ${e}`);
      }
    }
  },

  addToWindow(win) {
    if (!win || this.windows.has(win)) return;
    this.windows.add(win);
    let doc = win.document;

    let addMenuItem = (popupID, elementID, label, handler) => {
      let popup = doc.getElementById(popupID);
      if (!popup || doc.getElementById(elementID)) return;
      let item = doc.createXULElement("menuitem");
      item.id = elementID;
      item.setAttribute("label", label);
      item.addEventListener("command", handler);
      popup.appendChild(item);
    };

    addMenuItem("menu_ToolsPopup", "structured-tags-tools-edit", "编辑结构化标签…", () => this.openEditor(win, "edit"));
    addMenuItem("menu_ToolsPopup", "structured-tags-tools-settings", "结构化标签设置…", () => this.openEditor(win, "settings"));
    addMenuItem("zotero-itemmenu", "structured-tags-item-edit", "编辑结构化标签…", () => this.openEditor(win, "edit"));

    let menubar = doc.getElementById("main-menubar");
    let toolsMenu = doc.getElementById("toolsMenu");
    if (menubar && toolsMenu && !doc.getElementById("structured-tags-main-menu")) {
      let menu = doc.createXULElement("menu");
      menu.id = "structured-tags-main-menu";
      menu.setAttribute("label", "标签管理");
      menu.setAttribute("accesskey", "B");
      let popup = doc.createXULElement("menupopup");
      let settings = doc.createXULElement("menuitem");
      settings.setAttribute("label", "字段与选项设置…");
      settings.addEventListener("command", () => this.openEditor(win, "settings"));
      let edit = doc.createXULElement("menuitem");
      edit.setAttribute("label", "编辑所选文献…");
      edit.addEventListener("command", () => this.openEditor(win, "edit"));
      popup.append(settings, edit);
      menu.appendChild(popup);
      menubar.insertBefore(menu, toolsMenu.nextSibling);
    }

    if (!doc.getElementById("structured-tags-window-style")) {
      let style = doc.createElement("style");
      style.id = "structured-tags-window-style";
      style.textContent = `
        #zotero-items-tree .virtualized-table-header .cell[class*="structured-tags"] {
          min-width:0 !important;
          padding-inline:2px !important;
        }
        [data-structured-cell="true"] { border-radius:4px; }
        [data-structured-cell="true"]:hover { background:color-mix(in srgb, AccentColor 12%, transparent); }
        [data-structured-cell="true"][data-empty="true"]::after { content:"点击编辑"; opacity:0; font-size:11px; }
        [data-structured-cell="true"][data-empty="true"]:hover::after { opacity:.48; }
      `;
      doc.documentElement.appendChild(style);
    }

    let tree = doc.getElementById("zotero-items-tree");
    if (tree && !win.__structuredTagsHeaderRename) {
      let handler = event => {
        let cell = event.target.closest?.(".virtualized-table-header .cell");
        if (!cell) return;
        let match = [...this.columnFieldMap].find(([dataKey]) => cell.classList.contains(dataKey));
        if (!match) return;
        event.preventDefault();
        event.stopPropagation();
        this.openHeaderEditor(win, cell, match[1]);
      };
      tree.addEventListener("dblclick", handler, true);
      win.__structuredTagsHeaderRename = handler;
    }

    let toolbar = doc.getElementById("zotero-items-toolbar");
    if (toolbar && !doc.getElementById("structured-tags-toolbar-button")) {
      let button = doc.createXULElement("toolbarbutton");
      button.id = "structured-tags-toolbar-button";
      button.className = "zotero-tb-button";
      button.setAttribute("tabindex", "-1");
      button.setAttribute("tooltiptext", "打开结构化标签管理器");
      button.style.listStyleImage = `url('${this.rootURI}icon.svg')`;
      button.addEventListener("command", () => this.openEditor(win, "settings"));
      let spacer = toolbar.querySelector("spacer[flex='1']");
      toolbar.insertBefore(button, spacer || null);
    }
  },

  removeFromWindow(win) {
    if (!win) return;
    let tree = win.document.getElementById("zotero-items-tree");
    if (tree && win.__structuredTagsHeaderRename) {
      tree.removeEventListener("dblclick", win.__structuredTagsHeaderRename, true);
      delete win.__structuredTagsHeaderRename;
    }
    for (let id of ["structured-tags-tools-edit", "structured-tags-tools-settings", "structured-tags-item-edit", "structured-tags-main-menu", "structured-tags-toolbar-button", "structured-tags-window-style", "structured-tags-inline-editor", "structured-tags-header-editor"]) {
      win.document.getElementById(id)?.remove();
    }
    this.windows.delete(win);
  },

  openEditor(win, initialTab = "edit", explicitItemIDs = null, focusFieldID = null) {
    try {
      let selected = win.ZoteroPane?.getSelectedItems?.() || [];
      let itemIDs = explicitItemIDs || this.selectionToRegularItems(selected).map(item => item.id);
      let dialog = win.openDialog(
        "chrome://structuredtags/content/editor.xhtml",
        initialTab === "settings" ? "structured-tags-settings" : `structured-tags-editor-${Date.now()}`,
        "chrome,centerscreen,resizable,dialog=no,width=780,height=720",
        { api: this, itemIDs, initialTab, focusFieldID }
      );
      dialog?.focus?.();
      return dialog;
    }
    catch (error) {
      Zotero.logError(error);
      win.alert(`无法打开结构化标签管理器：${error.message || error}`);
      return null;
    }
  },

  openInlineEditor(win, itemID, field, anchor = null) {
    let doc = win.document;
    doc.getElementById("structured-tags-inline-editor")?.remove();
    let item = Zotero.Items.get(itemID);
    if (!item) return;
    let current = this.getValues(item, field);
    let panel = doc.createElement("div");
    panel.id = "structured-tags-inline-editor";
    panel.style.cssText = [
      "position:fixed", "z-index:2147483647", "top:90px", "left:20px",
      "width:min(420px,calc(100vw - 40px))", "padding:14px", "border:1px solid color-mix(in srgb, CanvasText 24%, transparent)",
      "border-radius:9px", "background:Canvas", "color:CanvasText", "box-shadow:0 10px 34px rgba(0,0,0,.28)", "font:message-box"
    ].join(";");
    let title = doc.createElement("div");
    title.textContent = `编辑：${field.name}`;
    title.style.cssText = "font-weight:600;font-size:15px;margin-bottom:10px";
    let control = doc.createElement("div");
    let makeInput = type => {
      let input = doc.createElement("input");
      input.type = type;
      return input;
    };
    let valueReader;
    if (field.type === "single") {
      let select = doc.createElement("select");
      select.style.cssText = "width:100%;padding:7px";
      select.appendChild(new win.Option("— 清空 —", ""));
      for (let option of field.options) select.appendChild(new win.Option(option, option));
      let custom = makeInput("text");
      custom.placeholder = "其他值（可选）";
      custom.style.cssText = "width:100%;padding:7px;margin-top:8px";
      if (current[0] && field.options.includes(current[0])) select.value = current[0];
      else custom.value = current[0] || "";
      control.append(select, custom);
      valueReader = () => [custom.value.trim() || select.value];
    }
    else if (field.type === "multi") {
      let checks = [];
      let list = doc.createElement("div");
      list.style.cssText = "display:flex;flex-wrap:wrap;gap:8px 14px";
      for (let option of field.options) {
        let label = doc.createElement("label");
        let cb = makeInput("checkbox");
        cb.value = option;
        cb.checked = current.includes(option);
        checks.push(cb);
        label.append(cb, doc.createTextNode(option));
        label.style.cssText = "display:flex;align-items:center;gap:4px";
        list.appendChild(label);
      }
      let custom = makeInput("text");
      custom.placeholder = "其他值，多个值用逗号分隔";
      custom.value = current.filter(value => !field.options.includes(value)).join("，");
      custom.style.cssText = "width:100%;padding:7px;margin-top:10px";
      control.append(list, custom);
      valueReader = () => [
        ...checks.filter(cb => cb.checked).map(cb => cb.value),
        ...custom.value.split(/[、,，;；]/).map(value => value.trim()).filter(Boolean)
      ];
    }
    else {
      let input = field.type === "text" ? doc.createElement("textarea") : makeInput("number");
      input.value = current[0] || "";
      input.placeholder = field.type === "number" ? "输入数值" : "输入文本";
      input.style.cssText = `width:100%;padding:7px;${field.type === "text" ? "min-height:72px;resize:vertical" : ""}`;
      control.appendChild(input);
      valueReader = () => [input.value];
    }
    let actions = doc.createElement("div");
    actions.style.cssText = "display:flex;justify-content:flex-end;gap:8px;margin-top:12px";
    let cancel = doc.createElement("button");
    cancel.textContent = "取消";
    let save = doc.createElement("button");
    save.textContent = "保存";
    save.style.cssText = "background:AccentColor;color:AccentColorText;border-color:AccentColor";
    for (let button of [cancel, save]) button.style.padding = "6px 14px";
    cancel.addEventListener("click", () => panel.remove());
    save.addEventListener("click", async () => {
      save.disabled = true;
      try {
        await this.applyValues([itemID], { [field.id]: valueReader() });
        panel.remove();
      }
      catch (e) {
        win.alert(`保存失败：${e.message || e}`);
        save.disabled = false;
      }
    });
    panel.addEventListener("mousedown", event => event.stopPropagation());
    panel.addEventListener("dblclick", event => event.stopPropagation());
    panel.addEventListener("keydown", event => {
      if (event.key === "Escape") {
        event.preventDefault();
        panel.remove();
      }
      else if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        save.click();
      }
    });
    actions.append(cancel, save);
    panel.append(title, control, actions);
    doc.documentElement.appendChild(panel);
    if (anchor) {
      let rect = anchor.getBoundingClientRect();
      let panelRect = panel.getBoundingClientRect();
      let left = Math.min(rect.left, win.innerWidth - panelRect.width - 12);
      let top = rect.bottom + 4;
      if (top + panelRect.height > win.innerHeight - 12) top = Math.max(12, rect.top - panelRect.height - 4);
      panel.style.left = `${Math.max(12, left)}px`;
      panel.style.top = `${Math.max(12, top)}px`;
    }
    panel.querySelector("select,input,textarea")?.focus();
  },

  openHeaderEditor(win, headerCell, fieldID) {
    let doc = win.document;
    doc.getElementById("structured-tags-header-editor")?.remove();
    let field = this.getConfig().find(value => value.id === fieldID);
    if (!field) return;
    let rect = headerCell.getBoundingClientRect();
    let input = doc.createElement("input");
    input.id = "structured-tags-header-editor";
    input.type = "text";
    input.value = field.name;
    input.title = "Enter 保存，Esc 取消";
    input.style.cssText = [
      "position:fixed", "z-index:2147483647", `left:${rect.left}px`, `top:${rect.top}px`,
      `width:${rect.width}px`, `height:${rect.height}px`, "min-width:0", "box-sizing:border-box",
      "padding:0 2px", "margin:0", "border:2px solid AccentColor", "border-radius:2px",
      "background:Field", "color:FieldText", "font:message-box", "font-weight:600", "text-align:center"
    ].join(";");
    let finished = false;
    let saving = false;
    let commit = async () => {
      if (finished || saving) return;
      let name = input.value.trim();
      if (!name || name === field.name) {
        finished = true;
        input.remove();
        return;
      }
      try {
        saving = true;
        let config = this.getConfig();
        let target = config.find(value => value.id === fieldID);
        if (!target) throw new Error("字段不存在");
        target.name = name;
        await this.saveConfig(config);
        finished = true;
        input.remove();
      }
      catch (e) {
        finished = false;
        saving = false;
        win.alert(`列名保存失败：${e.message || e}`);
        input.focus();
        input.select();
      }
    };
    input.addEventListener("mousedown", event => event.stopPropagation());
    input.addEventListener("dblclick", event => event.stopPropagation());
    input.addEventListener("keydown", event => {
      if (event.key === "Escape") {
        event.preventDefault();
        finished = true;
        input.remove();
      }
      else if (event.key === "Enter") {
        event.preventDefault();
        commit();
      }
    });
    input.addEventListener("blur", commit);
    doc.documentElement.appendChild(input);
    input.focus();
    input.select();
  },

  getSelectionData(itemIDs) {
    let items = itemIDs.map(id => Zotero.Items.get(id)).filter(Boolean);
    let fields = this.getConfig();
    let values = {};
    for (let field of fields) {
      let perItem = items.map(item => this.getValues(item, field));
      let first = JSON.stringify(perItem[0] || []);
      values[field.id] = {
        values: perItem[0] || [],
        mixed: perItem.some(v => JSON.stringify(v) !== first)
      };
    }
    return { count: items.length, values };
  },

  async applyValues(itemIDs, updates) {
    let items = itemIDs.map(id => Zotero.Items.get(id)).filter(Boolean);
    let fieldsByID = new Map(this.getConfig().map(field => [field.id, field]));
    let changed = 0;
    for (let item of items) {
      let touched = false;
      for (let [fieldID, rawValues] of Object.entries(updates)) {
        let field = fieldsByID.get(fieldID);
        if (!field) continue;
        let prefix = this.prefix(field);
        for (let tag of item.getTags().map(x => x.tag)) {
          if (tag.startsWith(prefix)) {
            item.removeTag(tag);
            touched = true;
          }
        }
        let values = Array.isArray(rawValues) ? rawValues : [rawValues];
        if (field.type !== "multi") values = values.slice(0, 1);
        for (let value of values) {
          value = this.normalizeName(value);
          if (!value) continue;
          item.addTag(prefix + value, 0);
          touched = true;
        }
      }
      if (touched) {
        await item.saveTx();
        await this.syncItemToStorage(item, "plugin-edit");
        changed++;
      }
    }
    await this.refreshWindows();
    return changed;
  },

  async saveConfig(newFields) {
    let oldFields = this.getConfig();
    let oldByID = new Map(oldFields.map(field => [field.id, field]));
    let clean = [];
    let usedIDs = new Set();
    let usedNames = new Set();
    for (let field of newFields) {
      let name = this.normalizeName(field.name);
      if (!name) continue;
      if (usedNames.has(name)) throw new Error(`字段名称不能重复：${name}`);
      usedNames.add(name);
      let id = String(field.id || `field-${Date.now()}-${Math.random().toString(16).slice(2)}`);
      if (usedIDs.has(id)) id += `-${Math.random().toString(16).slice(2)}`;
      usedIDs.add(id);
      let type = ["single", "multi", "number", "text"].includes(field.type) ? field.type : "text";
      let options = [...new Set((field.options || []).map(v => this.normalizeName(v)).filter(Boolean))];
      let old = oldByID.get(id);
      let aliases = [...new Set([
        ...(old?.aliases || []),
        ...(field.aliases || []),
        ...(old?.name && old.name !== name ? [old.name] : [])
      ].map(value => this.normalizeName(value)).filter(value => value && value !== name))];
      clean.push({ id, name, type, options, aliases, visible: field.visible !== false });
    }
    if (!clean.length) throw new Error("至少需要保留一个字段");

    let libraries = Zotero.Libraries.getAll();
    for (let field of clean) {
      let old = oldByID.get(field.id);
      if (!old) continue;
      let fieldRenamed = old.name !== field.name;
      let optionMap = new Map();
      let sameOptionCount = (old.options?.length || 0) === (field.options?.length || 0);
      let limit = sameOptionCount ? (old.options?.length || 0) : 0;
      for (let i = 0; i < limit; i++) {
        if (old.options[i] !== field.options[i]) optionMap.set(old.options[i], field.options[i]);
      }
      if (!fieldRenamed && !optionMap.size) continue;
      for (let library of libraries) {
        try {
          let tags = await Zotero.Tags.getAll(library.libraryID);
          for (let tagData of tags) {
            let tag = tagData.tag;
            let oldPrefix = `${old.name}：`;
            if (!tag.startsWith(oldPrefix)) continue;
            let oldValue = tag.slice(oldPrefix.length);
            let newValue = optionMap.get(oldValue) || oldValue;
            let newTag = `${field.name}：${newValue}`;
            if (newTag !== tag) await Zotero.Tags.rename(library.libraryID, tag, newTag);
          }
        }
        catch (e) {
          Zotero.debug(`Structured Tags: skipped tag migration for library ${library.libraryID}: ${e}`);
        }
      }
    }

    Zotero.Prefs.set(this.prefKey, JSON.stringify(clean), true);
    await this.persistFieldCatalog(clean);
    await this.setStorageMeta("config_updated_at", Date.now());
    await this.registerColumns();
    await this.refreshWindows();
    return clean;
  },

  async refreshWindows() {
    for (let win of this.windows) {
      try {
        await win.ZoteroPane?.itemsView?.refresh?.();
      }
      catch (e) {
        Zotero.debug(`Structured Tags refresh failed: ${e}`);
      }
    }
  }
};
