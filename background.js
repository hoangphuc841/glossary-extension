const CONTEXT_MENU_ID = "glossary-search-similar";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: CONTEXT_MENU_ID,
    title: 'Search similar terms in Glossary for "%s"',
    contexts: ["selection"]
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === CONTEXT_MENU_ID && tab && tab.id) {
    chrome.tabs.sendMessage(tab.id, {
      type: "GLOSSARY_LOOSE_SEARCH",
      query: info.selectionText || ""
    });
  }
});

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === "search-similar-terms" && tab && tab.id) {
    chrome.tabs.sendMessage(tab.id, {
      type: "GLOSSARY_LOOSE_SEARCH_FROM_SELECTION"
    });
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message && message.type === "FETCH_PDF_BYTES") {
    fetch(message.url)
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const buffer = await res.arrayBuffer();
        const bytes = Array.from(new Uint8Array(buffer));
        sendResponse({ ok: true, bytes });
      })
      .catch((err) => {
        sendResponse({
          ok: false,
          error: String(err && err.message ? err.message : err)
        });
      });
    return true;
  }
});
