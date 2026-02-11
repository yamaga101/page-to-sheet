chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "copyToSheet",
    title: "タイトルとURLをスプレッドシートにコピー",
    contexts: ["page", "link"],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "copyToSheet") return;

  let title;
  let url;

  try {
    if (info.linkUrl) {
      // Right-clicked on a link - get link text
      url = info.linkUrl;
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (targetUrl) => {
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
        },
        args: [info.linkUrl],
      });
      title = results[0]?.result || info.linkUrl;
    } else {
      // Right-clicked on page
      title = tab.title;
      url = tab.url;
    }

    // Copy to clipboard (tab-separated: title\tURL)
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (text) => {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      },
      args: [`${title}\t${url}`],
    });

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
    const message = sheetResult
      ? "コピー & スプレッドシートに追記しました"
      : gasUrl
        ? "コピーしました（スプレッドシート追記に失敗）"
        : "コピーしました（GAS URLが未設定）";

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (msg) => {
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
      },
      args: [message],
    });
  } catch (err) {
    console.error("Context menu action failed:", err);
  }
});
