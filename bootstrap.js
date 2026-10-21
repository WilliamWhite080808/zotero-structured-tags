var StructuredTags;

async function startup({ id, version, rootURI }, reason) {
  await Zotero.initializationPromise;
  Services.scriptloader.loadSubScript(rootURI + "content/structured-tags.js");
  StructuredTags.setRootURI(rootURI);
  await StructuredTags.startup();
}

async function shutdown({ id, version, rootURI }, reason) {
  if (reason === APP_SHUTDOWN) return;
  if (StructuredTags) {
    await StructuredTags.shutdown();
    StructuredTags = null;
  }
}

function install() {}
function uninstall() {}

function onMainWindowLoad({ window }) {
  StructuredTags?.addToWindow(window);
}

function onMainWindowUnload({ window }) {
  StructuredTags?.removeFromWindow(window);
}
