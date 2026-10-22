import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const prefs = new Map();
const registered = [];
const renamed = [];
const tagCatalog = new Map([[1, [{ tag: "文献类型：理论研究" }, { tag: "文献类型：综述" }]]]);

const Zotero = {
  Prefs: {
    get(key) { return prefs.get(key); },
    set(key, value) { prefs.set(key, value); }
  },
  ItemTreeManager: {
    async registerColumn(options) { registered.push(options); return options.dataKey; },
    async unregisterColumn() {}
  },
  Libraries: { getAll: () => [{ libraryID: 1 }] },
  Tags: {
    async getAll(libraryID) { return tagCatalog.get(libraryID) || []; },
    async rename(libraryID, oldTag, newTag) { renamed.push({ libraryID, oldTag, newTag }); }
  },
  Items: { get: () => null },
  debug() {},
  logError(error) { throw error; }
};

const Services = { wm: { getEnumerator: () => [] } };
const context = vm.createContext({ Zotero, Services, structuredClone, console });
const source = fs.readFileSync(new URL("../content/structured-tags.js", import.meta.url), "utf8");
vm.runInContext(source, context);
const api = vm.runInContext("StructuredTags", context);

prefs.set(api.prefKey, JSON.stringify(api.defaultFields));
await api.registerColumns();
assert.equal(registered.length, api.defaultFields.length + 1, "registers one column per field plus aggregate");
assert.ok(registered.slice(0, api.defaultFields.length).every(column => column.minWidth === 4), "custom fields have an effective 20px minimum width including Zotero padding");
assert.equal(api.columnFieldMap.size, api.defaultFields.length, "maps each editable header to its field");

const fakeItem = {
  id: 123,
  isRegularItem: () => true,
  getTags: () => [
    { tag: "文献类型：理论研究" },
    { tag: "文献类型：综述" },
    { tag: "关键数值：44" },
    { tag: "unrelated" }
  ]
};
const literatureType = api.getConfig().find(field => field.id === "literatureType");
const keyMetric = api.getConfig().find(field => field.id === "keyMetric");
assert.deepEqual([...api.getValues(fakeItem, literatureType)], ["理论研究", "综述"]);
assert.deepEqual([...api.getValues(fakeItem, keyMetric)], ["44"]);
assert.equal(api.selectionToRegularItems([fakeItem, fakeItem]).map(item => item.id).join(","), "123");
const packed = api.packCellData(fakeItem, "理论研究\u001f综述");
assert.equal(api.unpackCellData(packed).display, "理论研究\u001f综述");
assert.equal(api.unpackCellData(packed).itemID, 123);
const fakeDoc = {
  defaultView: {},
  createElement() {
    return {
      className: "",
      style: { cssText: "" },
      dataset: {},
      addEventListener() {},
      appendChild() {}
    };
  }
};
const firstCell = registered[0].renderCell(0, "\u001e123", { className: "exact-column-width" }, false, fakeDoc);
assert.match(firstCell.className, /\bcell\b/);
assert.match(firstCell.className, /\bexact-column-width\b/);

let openedDialog = null;
const fakeWindow = {
  ZoteroPane: { getSelectedItems: () => [fakeItem] },
  openDialog(...args) {
    openedDialog = args;
    return { focus() {} };
  },
  alert() {}
};
api.openEditor(fakeWindow, "settings");
assert.equal(openedDialog[0], "chrome://structuredtags/content/editor.xhtml", "opens the editor through the registered privileged URL");
assert.equal(openedDialog[1], "structured-tags-settings");
assert.equal([...openedDialog[3].itemIDs].join(","), "123");

const renamedConfig = api.getConfig();
renamedConfig.find(field => field.id === "literatureType").name = "资料类型";
await api.saveConfig(renamedConfig);
assert.deepEqual(renamed, [
  { libraryID: 1, oldTag: "文献类型：理论研究", newTag: "资料类型：理论研究" },
  { libraryID: 1, oldTag: "文献类型：综述", newTag: "资料类型：综述" }
]);

console.log("Structured Tags tests passed");
