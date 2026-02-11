const gasUrlInput = document.getElementById("gasUrl");
const saveButton = document.getElementById("save");
const statusDiv = document.getElementById("status");

// Load saved URL
chrome.storage.sync.get("gasUrl", ({ gasUrl }) => {
  if (gasUrl) {
    gasUrlInput.value = gasUrl;
  }
});

saveButton.addEventListener("click", () => {
  const gasUrl = gasUrlInput.value.trim();
  chrome.storage.sync.set({ gasUrl }, () => {
    statusDiv.textContent = "保存しました";
    setTimeout(() => {
      statusDiv.textContent = "";
    }, 2000);
  });
});
