(() => {
  "use strict";
  const args = window.arguments?.[0];
  const api = args?.api;
  const itemIDs = args?.itemIDs || [];
  const focusFieldID = args?.focusFieldID || null;
  let config = [];

  const $ = id => document.getElementById(id);

  function showTab(tab) {
    $("panel-edit").hidden = tab !== "edit";
    $("panel-settings").hidden = tab !== "settings";
    $("tab-edit").classList.toggle("active", tab === "edit");
    $("tab-settings").classList.toggle("active", tab === "settings");
  }

  function input(type, attrs = {}) {
    let el = document.createElement("input");
    el.type = type;
    for (let [key, value] of Object.entries(attrs)) el[key] = value;
    return el;
  }

  function renderEditor() {
    let state = api.getSelectionData(itemIDs);
    $("selection-summary").textContent = state.count ? `已选择 ${state.count} 个条目。勾选左侧复选框的字段才会被修改。` : "未选择条目";
    $("empty-selection").hidden = !!state.count;
    $("save-edit").disabled = !state.count;
    let host = $("field-editor");
    host.replaceChildren();

    for (let field of config) {
      let row = document.createElement("div");
      row.className = "field-row";
      row.dataset.fieldId = field.id;
      let enabled = input("checkbox");
      enabled.className = "field-enabled";
      enabled.checked = state.count === 1;
      let label = document.createElement("div");
      label.className = "field-name";
      label.textContent = field.name;
      let control = document.createElement("div");
      control.className = "control";
      let current = state.values[field.id] || { values: [], mixed: false };

      if (field.type === "multi") {
        let checks = document.createElement("div");
        checks.className = "checks";
        for (let option of field.options) {
          let wrap = document.createElement("label");
          let cb = input("checkbox", { value: option });
          cb.className = "value-option";
          cb.checked = current.values.includes(option);
          wrap.append(cb, document.createTextNode(option));
          checks.appendChild(wrap);
        }
        let otherValues = current.values.filter(v => !field.options.includes(v));
        let otherWrap = document.createElement("div");
        otherWrap.className = "other-wrap";
        let otherToggle = input("checkbox");
        otherToggle.className = "other-toggle";
        otherToggle.checked = !!otherValues.length;
        let otherText = input("text", { value: otherValues.join("、"), placeholder: "其他值，多个值用顿号或逗号分隔" });
        otherText.className = "other-value";
        otherText.disabled = !otherToggle.checked;
        otherToggle.addEventListener("change", () => {
          otherText.disabled = !otherToggle.checked;
          if (otherToggle.checked) otherText.focus();
        });
        let otherLabel = document.createElement("label");
        otherLabel.append(otherToggle, document.createTextNode("其他"));
        otherWrap.append(otherLabel, otherText);
        control.append(checks, otherWrap);
      }
      else if (field.type === "single") {
        let select = document.createElement("select");
        select.className = "single-value";
        select.appendChild(new Option("— 清空 —", ""));
        for (let option of field.options) select.appendChild(new Option(field.id === "importance" ? `${"★".repeat(Number(option) || 0)}（${option}）` : option, option));
        let custom = current.values[0] && !field.options.includes(current.values[0]);
        if (custom) select.appendChild(new Option(current.values[0], current.values[0]));
        select.appendChild(new Option("其他…", "__other__"));
        select.value = current.values[0] || "";
        let customInput = input("text", { placeholder: "输入自定义值" });
        customInput.className = "custom-single";
        customInput.hidden = true;
        select.addEventListener("change", () => {
          customInput.hidden = select.value !== "__other__";
          if (!customInput.hidden) customInput.focus();
        });
        control.append(select, customInput);
      }
      else if (field.type === "number") {
        let number = input("number", { value: current.values[0] || "", min: "0", step: "1", placeholder: "例如：44" });
        number.className = "number-value";
        control.appendChild(number);
      }
      else {
        let text = document.createElement("textarea");
        text.className = "text-value";
        text.value = current.values[0] || "";
        text.placeholder = "输入文本";
        control.appendChild(text);
      }

      if (current.mixed) {
        let mixed = document.createElement("div");
        mixed.className = "mixed";
        mixed.textContent = "所选条目的当前值不一致；勾选后将统一覆盖。";
        control.appendChild(mixed);
      }
      row.append(enabled, label, control);
      host.appendChild(row);
    }
  }

  function splitOther(value) {
    return value.split(/[、,，;；]/).map(v => v.trim()).filter(Boolean);
  }

  async function saveEditor() {
    let updates = {};
    for (let row of document.querySelectorAll(".field-row")) {
      if (!row.querySelector(".field-enabled").checked) continue;
      let field = config.find(x => x.id === row.dataset.fieldId);
      let values = [];
      if (field.type === "multi") {
        values = [...row.querySelectorAll(".value-option:checked")].map(el => el.value);
        if (row.querySelector(".other-toggle").checked) values.push(...splitOther(row.querySelector(".other-value").value));
      }
      else if (field.type === "single") {
        let selected = row.querySelector(".single-value").value;
        values = selected === "__other__" ? [row.querySelector(".custom-single").value] : [selected];
      }
      else if (field.type === "number") values = [row.querySelector(".number-value").value];
      else values = [row.querySelector(".text-value").value];
      updates[field.id] = values;
    }
    $("save-edit").disabled = true;
    try {
      let changed = await api.applyValues(itemIDs, updates);
      window.alert(`已更新 ${changed} 个条目。`);
      window.close();
    }
    catch (e) {
      window.alert(`保存失败：${e.message || e}`);
      $("save-edit").disabled = false;
    }
  }

  function renderSettings() {
    let host = $("settings-list");
    host.replaceChildren();
    let head = document.createElement("div");
    head.className = "settings-head";
    for (let text of ["展示", "字段名称", "字段类型", "选项（逗号分隔）", "顺序 / 删除"]) {
      let cell = document.createElement("div");
      cell.textContent = text;
      head.appendChild(cell);
    }
    host.appendChild(head);
    for (let field of config) addSettingsRow(field);
  }

  function addSettingsRow(field = null) {
    let row = document.createElement("div");
    row.className = "settings-row";
    row.dataset.id = field?.id || "";
    let visibleWrap = document.createElement("label");
    visibleWrap.className = "setting-visible-wrap";
    let visible = input("checkbox");
    visible.className = "setting-visible";
    visible.checked = field?.visible !== false;
    visibleWrap.appendChild(visible);
    let name = input("text", { value: field?.name || "", placeholder: "字段名称" });
    name.className = "setting-name";
    let type = document.createElement("select");
    type.className = "setting-type";
    for (let [value, label] of [["single", "单选"], ["multi", "多选"], ["number", "数值"], ["text", "文本"]]) type.appendChild(new Option(label, value));
    type.value = field?.type || "single";
    let options = input("text", { value: (field?.options || []).join("，"), placeholder: "选项一，选项二，选项三" });
    options.className = "setting-options";
    let controls = document.createElement("div");
    controls.className = "setting-row-controls";
    let up = document.createElement("button");
    up.type = "button";
    up.textContent = "↑";
    up.title = "上移";
    up.addEventListener("click", () => {
      let previous = row.previousElementSibling;
      if (previous?.classList.contains("settings-row")) row.parentNode.insertBefore(row, previous);
    });
    let down = document.createElement("button");
    down.type = "button";
    down.textContent = "↓";
    down.title = "下移";
    down.addEventListener("click", () => {
      let next = row.nextElementSibling;
      if (next) row.parentNode.insertBefore(next, row);
    });
    let del = document.createElement("button");
    del.className = "danger";
    del.textContent = "×";
    del.title = "移除字段（不会删除已有原生标签）";
    del.addEventListener("click", () => row.remove());
    controls.append(up, down, del);
    row.append(visibleWrap, name, type, options, controls);
    $("settings-list").appendChild(row);
  }

  async function saveSettings() {
    let fields = [...document.querySelectorAll(".settings-row")].map(row => ({
      id: row.dataset.id,
      visible: row.querySelector(".setting-visible").checked,
      name: row.querySelector(".setting-name").value,
      type: row.querySelector(".setting-type").value,
      options: splitOther(row.querySelector(".setting-options").value)
    }));
    $("save-settings").disabled = true;
    try {
      config = await api.saveConfig(fields);
      window.alert("字段设置已保存，相关原生标签已完成重命名。重新打开列选择器即可看到新列名。");
      window.close();
    }
    catch (e) {
      window.alert(`保存失败：${e.message || e}`);
      $("save-settings").disabled = false;
    }
  }

  window.addEventListener("DOMContentLoaded", () => {
    if (!api) {
      document.body.textContent = "插件接口不可用。";
      return;
    }
    config = api.getConfig();
    renderEditor();
    renderSettings();
    $("tab-edit").addEventListener("click", () => showTab("edit"));
    $("tab-settings").addEventListener("click", () => showTab("settings"));
    $("cancel-edit").addEventListener("click", () => window.close());
    $("cancel-settings").addEventListener("click", () => window.close());
    $("save-edit").addEventListener("click", saveEditor);
    $("save-settings").addEventListener("click", saveSettings);
    $("add-field").addEventListener("click", () => addSettingsRow());
    showTab(args.initialTab === "settings" ? "settings" : "edit");
    if (focusFieldID && args.initialTab !== "settings") {
      let row = document.querySelector(`.field-row[data-field-id="${CSS.escape(focusFieldID)}"]`);
      if (row) {
        row.querySelector(".field-enabled").checked = true;
        row.scrollIntoView({ block: "center" });
        row.querySelector("select, input:not(.field-enabled), textarea")?.focus();
      }
    }
  });
})();
