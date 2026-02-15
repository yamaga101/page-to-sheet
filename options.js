const gasUrlInput = document.getElementById("gasUrl");
const saveUrlBtn = document.getElementById("saveUrl");
const urlStatus = document.getElementById("urlStatus");
const catList = document.getElementById("catList");
const newCatInput = document.getElementById("newCat");
const addCatBtn = document.getElementById("addCat");
const catStatus = document.getElementById("catStatus");

// --- GAS URL ---

chrome.storage.sync.get("gasUrl", ({ gasUrl }) => {
  if (gasUrl) gasUrlInput.value = gasUrl;
});

saveUrlBtn.addEventListener("click", () => {
  chrome.storage.sync.set({ gasUrl: gasUrlInput.value.trim() }, () => {
    showStatus(urlStatus, "保存しました");
  });
});

// --- Categories ---

function renderCategories(categories) {
  catList.innerHTML = "";
  categories.forEach((cat, i) => {
    const chip = document.createElement("span");
    chip.className = "cat-chip";
    chip.innerHTML = `${cat}<span class="remove" data-index="${i}">&times;</span>`;
    catList.appendChild(chip);
  });

  catList.querySelectorAll(".remove").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.dataset.index);
      categories.splice(idx, 1);
      saveCategories(categories);
    });
  });
}

function saveCategories(categories) {
  chrome.storage.sync.set({ categories }, () => {
    renderCategories(categories);
    showStatus(catStatus, "更新しました");
  });
}

chrome.storage.sync.get("categories", ({ categories }) => {
  renderCategories(categories || []);
});

addCatBtn.addEventListener("click", addCategory);
newCatInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") addCategory();
});

function addCategory() {
  const name = newCatInput.value.trim();
  if (!name) return;

  chrome.storage.sync.get("categories", ({ categories }) => {
    const cats = categories || [];
    if (cats.includes(name)) {
      showStatus(catStatus, "既に存在します", true);
      return;
    }
    cats.push(name);
    newCatInput.value = "";
    saveCategories(cats);
  });
}

// --- Utility ---

function showStatus(el, text, isError) {
  el.textContent = text;
  el.style.color = isError ? "#d32f2f" : "#0d9";
  setTimeout(() => { el.textContent = ""; }, 2000);
}
