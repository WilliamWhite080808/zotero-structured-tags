var StructuredTags;
var chromeHandle;

async function startup({ id, version, rootURI }, reason) {
  await Zotero.initializationPromise;

  // Register a privileged chrome:// URL for the editor window. Opening an
  // XHTML window directly from the XPI's jar:file: URL is blocked by Zotero
  // 10, which made both management menu commands appear to do nothing.
  let addonManagerStartup = Components.classes[
    "@mozilla.org/addons/addon-manager-startup;1"
  ].getService(Components.interfaces.amIAddonManagerStartup);
  let manifestURI = Services.io.newURI(rootURI + "manifest.json");
  chromeHandle = addonManagerStartup.registerChrome(manifestURI, [
    ["content", "structuredtags", rootURI + "content/"]
  ]);

  Services.scriptloader.loadSubScript(rootURI + "content/structured-tags.js");
  StructuredTags.setRootURI(rootURI);
  StructuredTags.setAddonVersion(version);
  await StructuredTags.startup();
}

async function shutdown({ id, version, rootURI }, reason) {
  if (reason === APP_SHUTDOWN) return;
  if (StructuredTags) {
    await StructuredTags.shutdown();
    StructuredTags = null;
  }
  if (chromeHandle) {
    chromeHandle.destruct();
    chromeHandle = null;
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
