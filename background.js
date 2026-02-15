const DEFAULT_CATEGORIES = ["仕事", "学習", "趣味", "あとで読む", "参考資料"];

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "copyToSheet",
    title: "タイトルとURLをスプレッドシートにコピー",
    contexts: ["page", "link"],
  });

  // Initialize default categories if not set
  chrome.storage.sync.get("categories", ({ categories }) => {
    if (!categories) {
      chrome.storage.sync.set({ categories: DEFAULT_CATEGORIES });
    }
  });
});

// Check if tab is scriptable
function isTabAccessible(tab) {
  if (!tab?.id) return false;
  const url = tab.url || "";
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

// Show toast notification on page
async function showToast(tab, message) {
  if (!isTabAccessible(tab)) return;
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

// Copy to clipboard
async function copyToClipboard(tab, title, url) {
  if (!isTabAccessible(tab)) return;
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
  }, [`${title}\t${url}`]);
}

// Send data to GAS Web App
async function postToGas(title, url, category, tags) {
  const { gasUrl } = await chrome.storage.sync.get("gasUrl");
  if (!gasUrl) return { ok: false, configured: false };

  try {
    const response = await fetch(gasUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, url, category, tags }),
      redirect: "follow",
    });
    if (!response.ok) return { ok: false, configured: true };
    const result = await response.json();
    return { ok: true, configured: true, duplicate: result.duplicate };
  } catch (err) {
    console.error("GAS request failed:", err);
    return { ok: false, configured: true };
  }
}

// Inject tag/category panel into page
async function showPanel(tab) {
  if (!isTabAccessible(tab)) return;

  const { categories } = await chrome.storage.sync.get("categories");
  const cats = categories || DEFAULT_CATEGORIES;

  await safeExecuteScript(tab.id, (pageTitle, pageUrl, categoryList) => {
    // Remove existing panel if any
    const existing = document.getElementById("__pts_panel_host");
    if (existing) existing.remove();

    const host = document.createElement("div");
    host.id = "__pts_panel_host";
    host.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;z-index:2147483647;";
    const shadow = host.attachShadow({ mode: "closed" });

    shadow.innerHTML = `
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .overlay {
          position: fixed; top: 0; left: 0; width: 100%; height: 100%;
          background: rgba(0,0,0,0.3); display: flex; align-items: flex-start;
          justify-content: center; padding-top: 80px;
        }
        .panel {
          background: #fff; border-radius: 12px; padding: 20px; width: 420px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.2); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          color: #333; font-size: 14px;
        }
        .panel-title { font-size: 16px; font-weight: 700; margin-bottom: 16px; }
        .field { margin-bottom: 12px; }
        .field-label { font-weight: 600; margin-bottom: 4px; font-size: 12px; color: #666; }
        .page-info {
          background: #f5f5f5; border-radius: 6px; padding: 8px 10px;
          font-size: 13px; line-height: 1.4; word-break: break-all;
        }
        .page-info-title { font-weight: 600; }
        .page-info-url { color: #666; font-size: 12px; }
        .cat-grid {
          display: flex; flex-wrap: wrap; gap: 6px;
        }
        .cat-btn {
          padding: 6px 14px; border-radius: 20px; border: 1.5px solid #ddd;
          background: #fff; font-size: 13px; cursor: pointer; color: #333;
          transition: all 0.15s;
        }
        .cat-btn:hover { border-color: #4285f4; color: #4285f4; }
        .cat-btn.selected { background: #4285f4; color: #fff; border-color: #4285f4; }
        input[type="text"] {
          width: 100%; padding: 8px 10px; border: 1.5px solid #ddd; border-radius: 6px;
          font-size: 13px; outline: none; font-family: inherit;
        }
        input[type="text"]:focus { border-color: #4285f4; }
        .actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px; }
        .btn {
          padding: 8px 20px; border-radius: 6px; font-size: 14px; cursor: pointer;
          border: none; font-family: inherit;
        }
        .btn-primary { background: #4285f4; color: #fff; }
        .btn-primary:hover { background: #3367d6; }
        .btn-secondary { background: #f0f0f0; color: #333; }
        .btn-secondary:hover { background: #e0e0e0; }
      </style>
      <div class="overlay">
        <div class="panel">
          <div class="panel-title">Page to Sheet</div>
          <div class="field">
            <div class="field-label">ページ</div>
            <div class="page-info">
              <div class="page-info-title">${pageTitle.replace(/</g, "&lt;")}</div>
              <div class="page-info-url">${pageUrl.replace(/</g, "&lt;")}</div>
            </div>
          </div>
          <div class="field">
            <div class="field-label">カテゴリ</div>
            <div class="cat-grid" id="catGrid"></div>
          </div>
          <div class="field">
            <div class="field-label">タグ（カンマ区切り）</div>
            <input type="text" id="tagsInput" placeholder="例: API, React, 後で試す">
          </div>
          <div class="actions">
            <button class="btn btn-secondary" id="cancelBtn">キャンセル</button>
            <button class="btn btn-primary" id="sendBtn">送信</button>
          </div>
        </div>
      </div>
    `;

    // Build category buttons
    const catGrid = shadow.getElementById("catGrid");
    let selectedCategory = "";
    categoryList.forEach((cat) => {
      const btn = document.createElement("button");
      btn.className = "cat-btn";
      btn.textContent = cat;
      btn.addEventListener("click", () => {
        shadow.querySelectorAll(".cat-btn").forEach((b) => b.classList.remove("selected"));
        if (selectedCategory === cat) {
          selectedCategory = "";
        } else {
          btn.classList.add("selected");
          selectedCategory = cat;
        }
      });
      catGrid.appendChild(btn);
    });

    const tagsInput = shadow.getElementById("tagsInput");

    // Send handler
    const send = () => {
      const tags = tagsInput.value.trim();
      chrome.runtime.sendMessage({
        action: "sendFromPanel",
        title: pageTitle,
        url: pageUrl,
        category: selectedCategory,
        tags: tags,
      });
      host.remove();
    };

    // Cancel handler
    const cancel = () => host.remove();

    shadow.getElementById("sendBtn").addEventListener("click", send);
    shadow.getElementById("cancelBtn").addEventListener("click", cancel);
    shadow.querySelector(".overlay").addEventListener("click", (e) => {
      if (e.target === e.currentTarget) cancel();
    });

    // Keyboard: Enter to send, Escape to cancel
    shadow.addEventListener("keydown", (e) => {
      if (e.key === "Escape") cancel();
      if (e.key === "Enter" && e.target.tagName !== "BUTTON") send();
    });

    document.body.appendChild(host);
    tagsInput.focus();
  }, [tab.title || "Untitled", tab.url, cats]);
}

// Listen for messages from injected panel
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.action !== "sendFromPanel") return;

  (async () => {
    const tab = sender.tab;
    await copyToClipboard(tab, msg.title, msg.url);
    const result = await postToGas(msg.title, msg.url, msg.category, msg.tags);

    let message;
    if (result.ok && result.duplicate) {
      message = "コピー & 既存エントリを最下部に移動しました";
    } else if (result.ok) {
      message = "コピー & スプレッドシートに追記しました";
    } else if (!result.configured) {
      message = "コピーしました（GAS URLが未設定）";
    } else {
      message = "コピーしました（スプレッドシート追記に失敗）";
    }
    await showToast(tab, message);
  })();

  return true; // async response
});

// Context menu handler (quick send without panel)
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "copyToSheet") return;

  let title;
  let url;
  const tabAccessible = isTabAccessible(tab);

  try {
    if (info.linkUrl) {
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
      title = tab?.title || "Untitled";
      url = tab?.url || info.pageUrl;
    }

    await copyToClipboard(tab, title, url);
    const result = await postToGas(title, url, "", "");

    let message;
    if (result.ok) {
      message = result.duplicate
        ? "コピー & 既存エントリを最下部に移動しました"
        : "コピー & スプレッドシートに追記しました";
    } else if (!result.configured) {
      message = "コピーしました（GAS URLが未設定）";
    } else {
      message = "コピーしました（スプレッドシート追記に失敗）";
    }
    await showToast(tab, message);
  } catch (err) {
    console.error("Context menu action failed:", err);
  }
});

// Extension icon click → show panel
chrome.action.onClicked.addListener(async (tab) => {
  try {
    await showPanel(tab);
  } catch (err) {
    console.error("Icon click action failed:", err);
  }
});

// Keyboard shortcut → show panel
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "send-page-to-sheet") return;

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;
    await showPanel(tab);
  } catch (err) {
    console.error("Keyboard shortcut action failed:", err);
  }
});
