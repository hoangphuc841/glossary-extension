(function (root) {
  function createGlossaryUI({
    onSaveTerm,
    onDeleteTerm,
    onSwitchGlossary,
    onExportJson,
    onImportJson,
    getState
  }) {
    const hoverCard = document.createElement("div");
    hoverCard.id = "pg-hover-card";
    document.body.appendChild(hoverCard);

    const selectionPill = document.createElement("button");
    selectionPill.id = "pg-selection-pill";
    selectionPill.textContent = "+ Glossary";
    document.body.appendChild(selectionPill);

    const selectionPopover = document.createElement("div");
    selectionPopover.id = "pg-selection-popover";
    document.body.appendChild(selectionPopover);

    const drawerToggle = document.createElement("button");
    drawerToggle.id = "pg-drawer-toggle";
    drawerToggle.textContent = "✦ Glossary (Alt+G)";
    document.body.appendChild(drawerToggle);

    const drawer = document.createElement("aside");
    drawer.id = "pg-drawer";
    drawer.innerHTML = `
      <div class="pg-drawer-header">
        <div class="pg-drawer-top">
          <strong>Book Glossary</strong>
          <div class="pg-card-actions">
            <button class="pg-btn" id="pg-export-btn" title="Export JSON backup">Export</button>
            <button class="pg-btn" id="pg-import-btn" title="Import JSON backup">Import</button>
            <input type="file" id="pg-import-file" accept=".json" style="display:none" />
            <button class="pg-btn" id="pg-drawer-close">✕</button>
          </div>
        </div>
        <select class="pg-select" id="pg-glossary-select" title="Active glossary"></select>
        <input class="pg-input" id="pg-search-input" placeholder="Search or loose match terms..." />
        <details id="pg-new-term-details">
          <summary class="pg-btn" style="display:inline-block;margin-bottom:6px">+ New Term</summary>
          <input class="pg-input" id="pg-new-name" placeholder="Term name" />
          <textarea class="pg-textarea" id="pg-new-desc" placeholder="Short description"></textarea>
          <button class="pg-btn pg-btn-primary" id="pg-new-save">Save Term</button>
        </details>
        <div class="pg-status-msg" id="pg-drawer-status"></div>
      </div>
      <div class="pg-drawer-list" id="pg-drawer-list"></div>
    `;
    document.body.appendChild(drawer);

    let hideHoverTimer = null;
    let pendingSelection = null;
    let looseSearchMode = false;

    function setStatus(msg, isError = false) {
      const el = drawer.querySelector("#pg-drawer-status");
      el.textContent = msg;
      el.style.color = isError ? "#fca5a5" : "#fbbf24";
    }

    function scheduleHideHover() {
      clearTimeout(hideHoverTimer);
      hideHoverTimer = setTimeout(() => {
        hoverCard.classList.remove("pg-visible");
      }, 180);
    }

    hoverCard.addEventListener("mouseenter", () => clearTimeout(hideHoverTimer));
    hoverCard.addEventListener("mouseleave", scheduleHideHover);

    function positionFloating(el, rect) {
      const top = Math.max(8, rect.top - el.offsetHeight - 8);
      const left = Math.min(
        window.innerWidth - el.offsetWidth - 12,
        Math.max(8, rect.left)
      );
      el.style.top = `${top}px`;
      el.style.left = `${left}px`;
    }

    function renderHoverReadView(term, anchorRect) {
      hoverCard.innerHTML = "";
      const header = document.createElement("div");
      header.className = "pg-card-header";

      const title = document.createElement("div");
      title.className = "pg-card-title";
      title.textContent = term.name;

      const actions = document.createElement("div");
      actions.className = "pg-card-actions";

      const editBtn = document.createElement("button");
      editBtn.className = "pg-btn";
      editBtn.textContent = "Edit";
      editBtn.addEventListener("click", () => renderHoverEditView(term));

      const delBtn = document.createElement("button");
      delBtn.className = "pg-btn pg-btn-danger";
      delBtn.textContent = "Delete";
      delBtn.addEventListener("click", () => {
        if (delBtn.dataset.confirm === "1") {
          hoverCard.classList.remove("pg-visible");
          onDeleteTerm(term.id);
        } else {
          delBtn.dataset.confirm = "1";
          delBtn.textContent = "Confirm?";
        }
      });

      actions.append(editBtn, delBtn);
      header.append(title, actions);

      const desc = document.createElement("div");
      desc.className = "pg-card-desc";
      desc.textContent = term.description || "No description provided.";

      hoverCard.append(header, desc);
      hoverCard.classList.add("pg-visible");
      if (anchorRect) positionFloating(hoverCard, anchorRect);
    }

    function renderHoverEditView(term) {
      hoverCard.innerHTML = "";
      const nameInput = document.createElement("input");
      nameInput.className = "pg-input";
      nameInput.value = term.name;

      const descInput = document.createElement("textarea");
      descInput.className = "pg-textarea";
      descInput.value = term.description || "";

      const actions = document.createElement("div");
      actions.className = "pg-card-actions";

      const saveBtn = document.createElement("button");
      saveBtn.className = "pg-btn pg-btn-primary";
      saveBtn.textContent = "Save";
      saveBtn.addEventListener("click", async () => {
        const updated = await onSaveTerm({
          id: term.id,
          name: nameInput.value,
          description: descInput.value
        });
        renderHoverReadView(updated);
      });

      const cancelBtn = document.createElement("button");
      cancelBtn.className = "pg-btn";
      cancelBtn.textContent = "Cancel";
      cancelBtn.addEventListener("click", () => renderHoverReadView(term));

      actions.append(saveBtn, cancelBtn);
      hoverCard.append(nameInput, descInput, actions);
      nameInput.focus();
    }

    function showHoverForMark(markEl) {
      clearTimeout(hideHoverTimer);
      const state = getState();
      const term = state.termsById.get(markEl.dataset.termId);
      if (!term) return;
      renderHoverReadView(term, markEl.getBoundingClientRect());
    }

    function openSelectionPopover(selectedText, rect) {
      selectionPill.style.display = "none";
      const state = getState();
      const existing = state.termsList.find(
        (t) => t.name.toLowerCase() === selectedText.toLowerCase()
      );

      selectionPopover.innerHTML = "";
      const nameInput = document.createElement("input");
      nameInput.className = "pg-input";
      nameInput.value = existing ? existing.name : selectedText;

      const descInput = document.createElement("textarea");
      descInput.className = "pg-textarea";
      descInput.placeholder = "Short description (Enter to save)";
      descInput.value = existing ? existing.description : "";

      const actions = document.createElement("div");
      actions.className = "pg-card-actions";

      const saveBtn = document.createElement("button");
      saveBtn.className = "pg-btn pg-btn-primary";
      saveBtn.textContent = existing ? "Update" : "Add";

      const cancelBtn = document.createElement("button");
      cancelBtn.className = "pg-btn";
      cancelBtn.textContent = "Cancel";

      async function submit() {
        if (!nameInput.value.trim()) return;
        await onSaveTerm({
          id: existing ? existing.id : undefined,
          name: nameInput.value,
          description: descInput.value
        });
        selectionPopover.style.display = "none";
        window.getSelection().removeAllRanges();
      }

      saveBtn.addEventListener("click", submit);
      cancelBtn.addEventListener("click", () => {
        selectionPopover.style.display = "none";
      });
      descInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          submit();
        } else if (e.key === "Escape") {
          selectionPopover.style.display = "none";
        }
      });

      actions.append(saveBtn, cancelBtn);
      selectionPopover.append(nameInput, descInput, actions);
      selectionPopover.style.display = "block";
      positionFloating(selectionPopover, rect);
      descInput.focus();
    }

    selectionPill.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (pendingSelection) {
        openSelectionPopover(pendingSelection.text, pendingSelection.rect);
      }
    });

    document.addEventListener("mouseup", (e) => {
      if (
        hoverCard.contains(e.target) ||
        selectionPopover.contains(e.target) ||
        drawer.contains(e.target) ||
        e.target === selectionPill
      ) {
        return;
      }
      const sel = window.getSelection();
      const text = sel ? sel.toString().trim().replace(/\s+/g, " ") : "";
      if (text && text.length <= 120 && sel.rangeCount > 0) {
        const rect = sel.getRangeAt(0).getBoundingClientRect();
        pendingSelection = { text, rect };
        selectionPill.style.display = "block";
        positionFloating(selectionPill, rect);
      } else {
        selectionPill.style.display = "none";
      }
    });

    function renderDrawer() {
      const state = getState();
      const selectEl = drawer.querySelector("#pg-glossary-select");
      selectEl.innerHTML = "";
      for (const g of state.allGlossaries) {
        const opt = document.createElement("option");
        opt.value = g.id;
        opt.textContent = `Glossary: ${g.name}`;
        if (g.id === state.glossary.id) opt.selected = true;
        selectEl.appendChild(opt);
      }

      const query = drawer.querySelector("#pg-search-input").value.trim();
      let items = state.termsList;
      if (query) {
        items = looseSearchMode
          ? root.GlossaryMatcher.searchSimilarTerms(query, state.termsList, 0.2)
          : root.GlossaryMatcher.searchSimilarTerms(query, state.termsList, 0.25);
      }

      const listEl = drawer.querySelector("#pg-drawer-list");
      listEl.innerHTML = "";
      if (items.length === 0) {
        const empty = document.createElement("div");
        empty.className = "pg-card-desc";
        empty.textContent = query ? "No matching terms found." : "No terms added yet.";
        listEl.appendChild(empty);
        return;
      }

      for (const term of items) {
        const itemEl = document.createElement("div");
        itemEl.className = "pg-term-item";

        const header = document.createElement("div");
        header.className = "pg-card-header";

        const title = document.createElement("div");
        title.className = "pg-card-title";
        title.textContent = term.name;

        const actions = document.createElement("div");
        actions.className = "pg-card-actions";

        const editBtn = document.createElement("button");
        editBtn.className = "pg-btn";
        editBtn.textContent = "Edit";
        editBtn.addEventListener("click", () => {
          const details = drawer.querySelector("#pg-new-term-details");
          details.open = true;
          drawer.querySelector("#pg-new-name").value = term.name;
          drawer.querySelector("#pg-new-desc").value = term.description || "";
          drawer.querySelector("#pg-new-name").focus();
        });

        const delBtn = document.createElement("button");
        delBtn.className = "pg-btn pg-btn-danger";
        delBtn.textContent = "Delete";
        delBtn.addEventListener("click", () => onDeleteTerm(term.id));

        actions.append(editBtn, delBtn);
        header.append(title, actions);

        const desc = document.createElement("div");
        desc.className = "pg-card-desc";
        desc.textContent = term.description || "";

        itemEl.append(header, desc);
        listEl.appendChild(itemEl);
      }
    }

    function openLooseSearch(query) {
      looseSearchMode = true;
      drawer.classList.add("pg-open");
      const searchInput = drawer.querySelector("#pg-search-input");
      searchInput.value = query || "";
      setStatus(query ? `Showing similar terms for "${query}"` : "");
      renderDrawer();
      searchInput.focus();
    }

    drawerToggle.addEventListener("click", () => {
      drawer.classList.toggle("pg-open");
      if (drawer.classList.contains("pg-open")) {
        renderDrawer();
        drawer.querySelector("#pg-search-input").focus();
      }
    });

    drawer.querySelector("#pg-drawer-close").addEventListener("click", () => {
      drawer.classList.remove("pg-open");
    });

    drawer.querySelector("#pg-search-input").addEventListener("input", () => {
      looseSearchMode = false;
      setStatus("");
      renderDrawer();
    });

    drawer.querySelector("#pg-glossary-select").addEventListener("change", (e) => {
      onSwitchGlossary(e.target.value);
    });

    drawer.querySelector("#pg-new-save").addEventListener("click", async () => {
      const nameEl = drawer.querySelector("#pg-new-name");
      const descEl = drawer.querySelector("#pg-new-desc");
      if (!nameEl.value.trim()) return;
      await onSaveTerm({ name: nameEl.value, description: descEl.value });
      nameEl.value = "";
      descEl.value = "";
      drawer.querySelector("#pg-new-term-details").open = false;
    });

    drawer.querySelector("#pg-export-btn").addEventListener("click", onExportJson);

    const importFile = drawer.querySelector("#pg-import-file");
    drawer.querySelector("#pg-import-btn").addEventListener("click", () => {
      importFile.click();
    });
    importFile.addEventListener("change", async () => {
      const file = importFile.files && importFile.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const count = await onImportJson(text);
        setStatus(`Imported ${count} terms.`);
      } catch (err) {
        setStatus(err.message || "Import failed", true);
      }
      importFile.value = "";
    });

    document.addEventListener("keydown", (e) => {
      if (e.altKey && !e.ctrlKey && e.key.toLowerCase() === "g") {
        e.preventDefault();
        drawerToggle.click();
      } else if (
        ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "f") ||
        (e.ctrlKey && e.altKey && e.key.toLowerCase() === "f")
      ) {
        e.preventDefault();
        const sel = window.getSelection();
        const text = sel ? sel.toString().trim() : "";
        openLooseSearch(text);
      } else if (e.key === "Escape") {
        drawer.classList.remove("pg-open");
        hoverCard.classList.remove("pg-visible");
        selectionPopover.style.display = "none";
      }
    });

    return {
      showHoverForMark,
      scheduleHideHover,
      renderDrawer,
      openLooseSearch
    };
  }

  root.GlossaryUI = { createGlossaryUI };
})(typeof globalThis !== "undefined" ? globalThis : window);
