const gasUrlInput = document.getElementById("gasUrl");
const saveUrlBtn = document.getElementById("saveUrl");
const urlStatus = document.getElementById("urlStatus");
const groupsContainer = document.getElementById("groupsContainer");
const newGroupNameInput = document.getElementById("newGroupName");
const addGroupBtn = document.getElementById("addGroup");

// --- GAS URL ---

chrome.storage.sync.get("gasUrl", ({ gasUrl }) => {
  if (gasUrl) gasUrlInput.value = gasUrl;
});

saveUrlBtn.addEventListener("click", () => {
  chrome.storage.sync.set({ gasUrl: gasUrlInput.value.trim() }, () => {
    flash(urlStatus, "保存しました");
  });
});

// --- Tag Groups ---

let tagGroups = [];

function loadGroups() {
  chrome.storage.sync.get("tagGroups", ({ tagGroups: groups }) => {
    tagGroups = groups || [];
    render();
  });
}

function saveGroups(cb) {
  chrome.storage.sync.set({ tagGroups }, () => {
    render();
    if (cb) cb();
  });
}

function render() {
  groupsContainer.innerHTML = "";
  tagGroups.forEach((group, gi) => {
    const card = document.createElement("div");
    card.className = "group-card";

    // Header: group name + delete button
    const header = document.createElement("div");
    header.className = "group-header";

    const nameSpan = document.createElement("span");
    nameSpan.className = "group-name";
    nameSpan.textContent = group.name;
    nameSpan.addEventListener("click", () => {
      nameSpan.style.display = "none";
      const input = document.createElement("input");
      input.type = "text";
      input.className = "group-name-input";
      input.value = group.name;
      header.insertBefore(input, nameSpan);
      input.focus();
      input.select();

      const commit = () => {
        const val = input.value.trim();
        if (val) tagGroups[gi].name = val;
        input.remove();
        nameSpan.style.display = "";
        saveGroups();
      };
      input.addEventListener("blur", commit);
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") { input.remove(); nameSpan.style.display = ""; }
      });
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "btn-sm btn-danger";
    deleteBtn.textContent = "削除";
    deleteBtn.addEventListener("click", () => {
      tagGroups.splice(gi, 1);
      saveGroups();
    });

    header.appendChild(nameSpan);
    header.appendChild(deleteBtn);
    card.appendChild(header);

    // Tag chips
    const tagList = document.createElement("div");
    tagList.className = "tag-list";
    group.tags.forEach((tag, ti) => {
      const chip = document.createElement("span");
      chip.className = "tag-chip";
      chip.innerHTML = `${esc(tag)}<span class="remove">&times;</span>`;
      chip.querySelector(".remove").addEventListener("click", () => {
        tagGroups[gi].tags.splice(ti, 1);
        saveGroups();
      });
      tagList.appendChild(chip);
    });
    card.appendChild(tagList);

    // Add tag input
    const addRow = document.createElement("div");
    addRow.className = "add-row";
    const tagInput = document.createElement("input");
    tagInput.type = "text";
    tagInput.placeholder = "タグを追加";
    const addBtn = document.createElement("button");
    addBtn.className = "btn-sm";
    addBtn.textContent = "追加";

    const addTag = () => {
      const val = tagInput.value.trim();
      if (!val) return;
      if (tagGroups[gi].tags.includes(val)) {
        tagInput.value = "";
        return;
      }
      tagGroups[gi].tags.push(val);
      tagInput.value = "";
      saveGroups();
    };
    addBtn.addEventListener("click", addTag);
    tagInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") addTag();
    });

    addRow.appendChild(tagInput);
    addRow.appendChild(addBtn);
    card.appendChild(addRow);

    groupsContainer.appendChild(card);
  });
}

// Add new group
addGroupBtn.addEventListener("click", addGroup);
newGroupNameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") addGroup();
});

function addGroup() {
  const name = newGroupNameInput.value.trim();
  if (!name) return;
  if (tagGroups.some((g) => g.name === name)) return;
  tagGroups.push({ name, tags: [] });
  newGroupNameInput.value = "";
  saveGroups();
}

// --- Utility ---

function flash(el, text, isError) {
  el.textContent = text;
  el.style.color = isError ? "#d32f2f" : "#0d9";
  setTimeout(() => { el.textContent = ""; }, 2000);
}

function esc(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Init
loadGroups();
