const DEFAULT_TAG_GROUPS = [
  { name: "種別", tags: ["仕事", "プライベート"] },
  { name: "相手", tags: [] },
  { name: "ステータス", tags: ["未着手", "進行中", "アーカイブ"] },
];

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "copyToSheet",
    title: "タイトルとURLをスプレッドシートにコピー",
    contexts: ["page", "link"],
  });

  // Initialize default tag groups if not set
  chrome.storage.sync.get("tagGroups", ({ tagGroups }) => {
    if (!tagGroups) {
      chrome.storage.sync.set({ tagGroups: DEFAULT_TAG_GROUPS });
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
async function postToGas(title, url, tagValues) {
  const { gasUrl } = await chrome.storage.sync.get("gasUrl");
  if (!gasUrl) return { ok: false, configured: false };

  try {
    const response = await fetch(gasUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, url, tagValues }),
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

// Build result message
function buildMessage(result) {
  if (result.ok && result.duplicate) return "コピー & 既存エントリを最下部に移動しました";
  if (result.ok) return "コピー & スプレッドシートに追記しました";
  if (!result.configured) return "コピーしました（GAS URLが未設定）";
  return "コピーしました（スプレッドシート追記に失敗）";
}

// Inject tag group panel into page
async function showPanel(tab) {
  if (!isTabAccessible(tab)) return;

  const { tagGroups } = await chrome.storage.sync.get("tagGroups");
  const groups = tagGroups || DEFAULT_TAG_GROUPS;

  await safeExecuteScript(tab.id, (pageTitle, pageUrl, groupsData) => {
    // Remove existing panel if any
    const existing = document.getElementById("__pts_panel_host");
    if (existing) existing.remove();

    const host = document.createElement("div");
    host.id = "__pts_panel_host";
    host.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;z-index:2147483647;";
    const shadow = host.attachShadow({ mode: "closed" });

    // Build tag group HTML
    const groupsHtml = groupsData.map((g, i) => {
      if (g.tags.length === 0) {
        return `
          <div class="field">
            <div class="field-label">${g.name}</div>
            <input type="text" class="group-input" data-index="${i}" placeholder="${g.name}を入力">
          </div>`;
      }
      return `
        <div class="field">
          <div class="field-label">${g.name}</div>
          <div class="tag-grid" data-index="${i}">
            ${g.tags.map((t) => `<button class="tag-btn">${t}</button>`).join("")}
          </div>
        </div>`;
    }).join("");

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
          box-shadow: 0 8px 32px rgba(0,0,0,0.2);
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
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
        .tag-grid { display: flex; flex-wrap: wrap; gap: 6px; }
        .tag-btn {
          padding: 6px 14px; border-radius: 20px; border: 1.5px solid #ddd;
          background: #fff; font-size: 13px; cursor: pointer; color: #333;
          transition: all 0.15s;
        }
        .tag-btn:hover { border-color: #4285f4; color: #4285f4; }
        .tag-btn.selected { background: #4285f4; color: #fff; border-color: #4285f4; }
        .group-input {
          width: 100%; padding: 8px 10px; border: 1.5px solid #ddd; border-radius: 6px;
          font-size: 13px; outline: none; font-family: inherit;
        }
        .group-input:focus { border-color: #4285f4; }
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
          ${groupsHtml}
          <div class="actions">
            <button class="btn btn-secondary" id="cancelBtn">キャンセル</button>
            <button class="btn btn-primary" id="sendBtn">送信</button>
          </div>
        </div>
      </div>
    `;

    // Track selections per group
    const selections = groupsData.map(() => "");

    // Wire up tag button clicks (chip toggle)
    shadow.querySelectorAll(".tag-grid").forEach((grid) => {
      const idx = parseInt(grid.dataset.index);
      grid.querySelectorAll(".tag-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const tag = btn.textContent;
          if (selections[idx] === tag) {
            selections[idx] = "";
            btn.classList.remove("selected");
          } else {
            grid.querySelectorAll(".tag-btn").forEach((b) => b.classList.remove("selected"));
            btn.classList.add("selected");
            selections[idx] = tag;
          }
        });
      });
    });

    // Send handler
    const send = () => {
      // Collect free-text inputs
      shadow.querySelectorAll(".group-input").forEach((input) => {
        const idx = parseInt(input.dataset.index);
        selections[idx] = input.value.trim();
      });

      chrome.runtime.sendMessage({
        action: "sendFromPanel",
        title: pageTitle,
        url: pageUrl,
        tagValues: selections,
      });
      host.remove();
    };

    const cancel = () => host.remove();

    shadow.getElementById("sendBtn").addEventListener("click", send);
    shadow.getElementById("cancelBtn").addEventListener("click", cancel);
    shadow.querySelector(".overlay").addEventListener("click", (e) => {
      if (e.target === e.currentTarget) cancel();
    });

    shadow.addEventListener("keydown", (e) => {
      if (e.key === "Escape") cancel();
      if (e.key === "Enter" && e.target.tagName !== "BUTTON") send();
    });

    document.body.appendChild(host);

    // Focus first input if exists, otherwise panel
    const firstInput = shadow.querySelector(".group-input");
    if (firstInput) firstInput.focus();
  }, [tab.title || "Untitled", tab.url, groups]);
}

// Listen for messages from injected panel
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.action !== "sendFromPanel") return;

  (async () => {
    const tab = sender.tab;
    await copyToClipboard(tab, msg.title, msg.url);
    const result = await postToGas(msg.title, msg.url, msg.tagValues);
    await showToast(tab, buildMessage(result));
  })();

  return true;
});

// Context menu handler (quick send without tags)
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
    const result = await postToGas(title, url, []);
    await showToast(tab, buildMessage(result));
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
