chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "copyToSheet",
    title: "タイトルとURLをスプレッドシートにコピー",
    contexts: ["page", "link"],
  });
});

// Check if tab is scriptable based on callback tab object
function isTabAccessible(tab) {
  if (!tab?.id) return false;
  const url = tab.url || "";
  // Cannot inject scripts into chrome:// or extension pages
  return url !== "" && !url.startsWith("chrome://") && !url.startsWith("chrome-extension://");
}

// Execute script on tab with graceful error handling
async function safeExecuteScript(tabId, func, args = []) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func,
      args,
    });
    return results[0]?.result ?? null;
  } catch (err) {
    console.warn("executeScript failed:", err.message);
    return null;
  }
}

// Copy to clipboard and send to GAS, then show toast
async function sendToSheet(tab, title, url) {
  const tabAccessible = isTabAccessible(tab);

  // Copy to clipboard
  const clipboardText = `${title}\t${url}`;
  if (tabAccessible) {
    await safeExecuteScript(tab.id, (text) => {
      navigator.clipboard.writeText(text).catch(() => {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.cssText = "position:fixed;opacity:0;";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      });
    }, [clipboardText]);
  }

  // Send to GAS Web App
  const { gasUrl } = await chrome.storage.sync.get("gasUrl");
  let sheetResult = false;

  if (gasUrl) {
    try {
      const response = await fetch(gasUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, url }),
        redirect: "follow",
      });
      sheetResult = response.ok;
    } catch (err) {
      console.error("GAS request failed:", err);
    }
  }

  // Show toast notification
  if (tabAccessible) {
    const message = sheetResult
      ? "コピー & スプレッドシートに追記しました"
      : gasUrl
        ? "コピーしました（スプレッドシート追記に失敗）"
        : "コピーしました（GAS URLが未設定）";

    await safeExecuteScript(tab.id, (msg) => {
      const toast = document.createElement("div");
      toast.textContent = msg;
      toast.style.cssText =
        "position:fixed;top:20px;right:20px;background:#333;color:#fff;" +
        "padding:12px 24px;border-radius:8px;z-index:2147483647;" +
        "font-size:14px;font-family:sans-serif;box-shadow:0 4px 12px rgba(0,0,0,0.3);" +
        "transition:opacity 0.3s;";
      document.body.appendChild(toast);
      setTimeout(() => {
        toast.style.opacity = "0";
        setTimeout(() => toast.remove(), 300);
      }, 2000);
    }, [message]);
  }
}

// Context menu handler
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "copyToSheet") return;

  let title;
  let url;

  const tabAccessible = isTabAccessible(tab);

  try {
    if (info.linkUrl) {
      // Right-clicked on a link
      url = info.linkUrl;

      if (tabAccessible) {
        const linkText = await safeExecuteScript(tab.id, (targetUrl) => {
          for (const link of document.querySelectorAll("a")) {
            if (link.href === targetUrl) {
              const text =
                link.textContent.trim() ||
                link.title ||
                link.querySelector("img")?.alt ||
                "";
              if (text) return text;
            }
          }
          return null;
        }, [info.linkUrl]);
        title = linkText || info.linkUrl;
      } else {
        title = info.linkUrl;
      }
    } else {
      // Right-clicked on page
      title = tab?.title || "Untitled";
      url = tab?.url || info.pageUrl;
    }

    await sendToSheet(tab, title, url);
  } catch (err) {
    console.error("Context menu action failed:", err);
  }
});

// Keyboard shortcut handler
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "send-page-to-sheet") return;

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    const title = tab.title || "Untitled";
    const url = tab.url;

    await sendToSheet(tab, title, url);
  } catch (err) {
    console.error("Keyboard shortcut action failed:", err);
  }
});
