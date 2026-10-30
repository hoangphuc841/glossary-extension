(async function () {
  const isPdf =
    document.contentType === "application/pdf" ||
    Boolean(document.querySelector('embed[type="application/pdf"]')) ||
    location.pathname.toLowerCase().endsWith(".pdf");

  if (!isPdf) {
    return;
  }

  const { extractBookKey, createStorageClient } = globalThis.GlossaryStorage;
  const { buildTermMatcher, findStrictMatches } = globalThis.GlossaryMatcher;
  const { createGlossaryUI } = globalThis.GlossaryUI;

  const storage = createStorageClient();
  const bookKey = extractBookKey(location.href);
  const scrollKey = `pg_scroll_${bookKey}`;
  const zoomKey = `pg_zoom_${bookKey}`;
  const BASE_SCALE = 1.45;

  let currentGlossary = { id: "", name: "", terms: {} };
  let allGlossaries = [];
  let termsList = [];
  let termsById = new Map();
  let currentMatcher = { regex: null, byLower: new Map() };

  function syncInMemoryTerms(glossary, glossariesList) {
    currentGlossary = glossary;
    allGlossaries = glossariesList || [glossary];
    termsList = Object.values(glossary.terms || {}).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
    termsById = new Map(termsList.map((t) => [t.id, t]));
    currentMatcher = buildTermMatcher(termsList);
  }

  function applyMarksToSpan(span, ui) {
    const raw = span.dataset.raw ?? span.textContent ?? "";
    if (span.dataset.raw === undefined) {
      span.dataset.raw = raw;
    }
    if (!raw.trim()) {
      span.style.pointerEvents = "none";
      return;
    }
    const matches = findStrictMatches(raw, currentMatcher);
    if (matches.length === 0) {
      if (span.querySelector("mark.glossary-term")) {
        span.textContent = raw;
      }
      return;
    }

    const frag = document.createDocumentFragment();
    let cursor = 0;
    for (const m of matches) {
      if (m.start > cursor) {
        frag.appendChild(document.createTextNode(raw.slice(cursor, m.start)));
      }
      const mark = document.createElement("mark");
      mark.className = "glossary-term";
      mark.dataset.termId = m.termId;
      mark.textContent = m.text;
      mark.addEventListener("mouseenter", () => ui.showHoverForMark(mark));
      mark.addEventListener("mouseleave", () => ui.scheduleHideHover());
      frag.appendChild(mark);
      cursor = m.end;
    }
    if (cursor < raw.length) {
      frag.appendChild(document.createTextNode(raw.slice(cursor)));
    }
    span.replaceChildren(frag);
  }

  function rescanAllRenderedPages(ui) {
    const spans = document.querySelectorAll(
      ".pg-text-layer span:not(.markedContent)"
    );
    for (const span of spans) {
      applyMarksToSpan(span, ui);
    }
  }

  async function refreshStateAndRescan(ui) {
    const loaded = await storage.ensureBookGlossary(bookKey);
    syncInMemoryTerms(loaded.glossary, loaded.allGlossaries);
    rescanAllRenderedPages(ui);
    ui.renderDrawer();
  }

  async function fetchPdfBytes(url) {
    try {
      const direct = await fetch(url);
      if (direct.ok) {
        return new Uint8Array(await direct.arrayBuffer());
      }
    } catch {
      // Direct fetch may be blocked on file:// or cross-origin URLs
    }
    const response = await chrome.runtime.sendMessage({
      type: "FETCH_PDF_BYTES",
      url
    });
    if (!response || !response.ok) {
      throw new Error(
        response && response.error
          ? response.error
          : "Blocked from reading local PDF bytes."
      );
    }
    return new Uint8Array(response.bytes);
  }

  function removeNativePdfElements() {
    for (const el of document.querySelectorAll("embed, object, iframe")) {
      el.remove();
    }
  }

  // Replace Chrome's native PDF body entirely so no shadow-root or plugin remains
  removeNativePdfElements();
  document.documentElement.removeAttribute("style");
  document.documentElement.classList.add("pg-pdf-active-root");
  const freshBody = document.createElement("body");
  freshBody.className = "pg-pdf-active";
  if (document.body) {
    document.documentElement.replaceChild(freshBody, document.body);
  } else {
    document.documentElement.appendChild(freshBody);
  }

  const embedKiller = new MutationObserver(() => {
    removeNativePdfElements();
  });
  embedKiller.observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  const topbar = document.createElement("header");
  topbar.id = "pg-topbar";
  topbar.innerHTML = `
    <div class="pg-topbar-title" title="${bookKey}">${bookKey}</div>
    <div class="pg-topbar-controls">
      <span class="pg-page-indicator" id="pg-page-indicator">Loading...</span>
      <button class="pg-btn" id="pg-zoom-out" title="Zoom Out (Ctrl+-)">−</button>
      <button class="pg-btn pg-zoom-readout" id="pg-zoom-reset" title="Reset Zoom (Ctrl+0)">100%</button>
      <button class="pg-btn" id="pg-zoom-in" title="Zoom In (Ctrl++)">+</button>
      <button class="pg-btn" id="pg-zoom-fit" title="Fit Page Width">Fit Width</button>
    </div>
  `;
  document.body.appendChild(topbar);

  const container = document.createElement("main");
  container.id = "pg-viewer-container";
  document.body.appendChild(container);

  window.addEventListener("mouseup", () => {
    for (const layer of document.querySelectorAll(
      ".pg-text-layer.pg-selecting"
    )) {
      layer.classList.remove("pg-selecting");
    }
  });

  const initial = await storage.ensureBookGlossary(bookKey);
  syncInMemoryTerms(initial.glossary, initial.allGlossaries);

  const ui = createGlossaryUI({
    getState: () => ({
      glossary: currentGlossary,
      allGlossaries,
      termsList,
      termsById
    }),
    onSaveTerm: async (payload) => {
      const saved = await storage.upsertTerm(bookKey, payload);
      await refreshStateAndRescan(ui);
      return saved;
    },
    onDeleteTerm: async (termId) => {
      await storage.deleteTerm(bookKey, termId);
      await refreshStateAndRescan(ui);
    },
    onSwitchGlossary: async (targetId) => {
      await storage.linkBookToGlossary(bookKey, targetId);
      await refreshStateAndRescan(ui);
    },
    onExportJson: async () => {
      const json = await storage.exportGlossaryJson(bookKey);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${currentGlossary.name || "glossary"}-glossary.json`;
      a.click();
      URL.revokeObjectURL(url);
    },
    onImportJson: async (jsonText) => {
      const count = await storage.importGlossaryJson(bookKey, jsonText);
      await refreshStateAndRescan(ui);
      return count;
    }
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && (changes.glossaries || changes.bookMap)) {
      refreshStateAndRescan(ui);
    }
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg) return;
    if (msg.type === "GLOSSARY_LOOSE_SEARCH") {
      ui.openLooseSearch(msg.query || "");
    } else if (msg.type === "GLOSSARY_LOOSE_SEARCH_FROM_SELECTION") {
      const sel = window.getSelection();
      ui.openLooseSearch(sel ? sel.toString().trim() : "");
    }
  });

  let pdfBytes;
  try {
    pdfBytes = await fetchPdfBytes(location.href);
  } catch (err) {
    container.innerHTML = `
      <div class="pg-banner-error">
        <strong>Cannot read local PDF file (${err.message}).</strong><br/><br/>
        Open <code>chrome://extensions</code>, click <strong>Details</strong> on <em>PDF Book Quick Glossary</em>, and toggle <strong>"Allow access to file URLs"</strong> ON, then reload this tab.
      </div>
    `;
    return;
  }

  const pdfjsLib = await import(chrome.runtime.getURL("vendor/pdf.mjs"));
  pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL(
    "vendor/pdf.worker.mjs"
  );

  const pdfDoc = await pdfjsLib.getDocument({ data: pdfBytes }).promise;
  const savedZoom = Number(localStorage.getItem(zoomKey) || 1);
  let currentZoom =
    Number.isFinite(savedZoom) && savedZoom >= 0.4 && savedZoom <= 3.5
      ? savedZoom
      : 1;
  let currentScale = BASE_SCALE * currentZoom;
  let renderGen = 0;
  let zoomDebounceTimer = null;
  const renderedPages = new Set();
  const pageHolders = [];

  const pageIndicatorEl = topbar.querySelector("#pg-page-indicator");
  const zoomResetBtn = topbar.querySelector("#pg-zoom-reset");
  const zoomInBtn = topbar.querySelector("#pg-zoom-in");
  const zoomOutBtn = topbar.querySelector("#pg-zoom-out");
  const zoomFitBtn = topbar.querySelector("#pg-zoom-fit");

  function updateZoomReadout() {
    zoomResetBtn.textContent = `${Math.round(currentZoom * 100)}%`;
  }

  function updatePageIndicator() {
    if (!pageHolders.length) return;
    const midY = container.scrollTop + container.clientHeight * 0.35;
    let currentPageNum = 1;
    for (let i = 0; i < pageHolders.length; i++) {
      const h = pageHolders[i];
      if (h.offsetTop <= midY) {
        currentPageNum = i + 1;
      } else {
        break;
      }
    }
    pageIndicatorEl.textContent = `Page ${currentPageNum} / ${pdfDoc.numPages}`;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const pageNum = Number(entry.target.dataset.pageNumber);
        if (!renderedPages.has(pageNum)) {
          renderedPages.add(pageNum);
          renderPage(
            pdfDoc,
            pageNum,
            entry.target,
            currentScale,
            pdfjsLib,
            ui,
            renderGen
          );
        }
      }
    },
    { root: container, rootMargin: "800px 0px" }
  );

  const firstPage = await pdfDoc.getPage(1);
  const baseViewport = firstPage.getViewport({ scale: BASE_SCALE });
  let defaultViewport = firstPage.getViewport({ scale: currentScale });

  for (let i = 1; i <= pdfDoc.numPages; i++) {
    const pageHolder = document.createElement("div");
    pageHolder.className = "pg-page";
    pageHolder.dataset.pageNumber = String(i);
    pageHolder.style.width = `${Math.floor(defaultViewport.width)}px`;
    pageHolder.style.height = `${Math.floor(defaultViewport.height)}px`;
    container.appendChild(pageHolder);
    pageHolders.push(pageHolder);
    observer.observe(pageHolder);
  }

  updateZoomReadout();
  updatePageIndicator();

  function applyZoom(targetZoom) {
    const clamped = Math.min(
      3.5,
      Math.max(0.4, Math.round(targetZoom * 100) / 100)
    );
    if (Math.abs(clamped - currentZoom) < 0.005) return;

    const prevMaxScroll = Math.max(
      1,
      container.scrollHeight - container.clientHeight
    );
    const scrollRatio = container.scrollTop / prevMaxScroll;

    currentZoom = clamped;
    currentScale = BASE_SCALE * currentZoom;
    localStorage.setItem(zoomKey, String(currentZoom));
    updateZoomReadout();

    defaultViewport = firstPage.getViewport({ scale: currentScale });
    const wPx = `${Math.floor(defaultViewport.width)}px`;
    const hPx = `${Math.floor(defaultViewport.height)}px`;

    for (const holder of pageHolders) {
      holder.style.width = wPx;
      holder.style.height = hPx;
      const existingCanvas = holder.querySelector("canvas");
      if (existingCanvas) {
        existingCanvas.style.width = wPx;
        existingCanvas.style.height = hPx;
      }
      const existingText = holder.querySelector(".pg-text-layer");
      if (existingText) {
        existingText.style.setProperty("--scale-factor", String(currentScale));
      }
    }

    const newMaxScroll = Math.max(
      0,
      container.scrollHeight - container.clientHeight
    );
    container.scrollTop = Math.round(scrollRatio * newMaxScroll);
    updatePageIndicator();

    clearTimeout(zoomDebounceTimer);
    zoomDebounceTimer = setTimeout(() => {
      renderGen += 1;
      renderedPages.clear();
      for (const holder of pageHolders) {
        observer.unobserve(holder);
        observer.observe(holder);
      }
    }, 140);
  }

  zoomInBtn.addEventListener("click", () => applyZoom(currentZoom + 0.15));
  zoomOutBtn.addEventListener("click", () => applyZoom(currentZoom - 0.15));
  zoomResetBtn.addEventListener("click", () => applyZoom(1.0));
  zoomFitBtn.addEventListener("click", () => {
    const availableWidth = Math.max(320, container.clientWidth - 48);
    applyZoom(availableWidth / baseViewport.width);
  });

  const savedScroll = Number(localStorage.getItem(scrollKey) || 0);
  if (savedScroll > 0) {
    container.scrollTo(0, savedScroll);
  }

  container.addEventListener(
    "scroll",
    () => {
      localStorage.setItem(scrollKey, String(container.scrollTop));
      updatePageIndicator();
    },
    { passive: true }
  );

  window.addEventListener(
    "wheel",
    (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const step = e.deltaY < 0 ? 0.1 : -0.1;
        applyZoom(currentZoom + step);
        return;
      }
      // If wheel occurs outside container (e.g. on topbar), scroll the container
      if (
        !container.contains(e.target) &&
        !(e.target && e.target.closest && e.target.closest("#pg-drawer"))
      ) {
        container.scrollBy({ top: e.deltaY, left: e.deltaX, behavior: "auto" });
      }
    },
    { passive: false }
  );

  window.addEventListener("keydown", (e) => {
    const tag = document.activeElement
      ? document.activeElement.tagName.toLowerCase()
      : "";
    if (tag === "input" || tag === "textarea" || tag === "select") return;

    if ((e.ctrlKey || e.metaKey) && !e.altKey) {
      if (e.key === "=" || e.key === "+") {
        e.preventDefault();
        applyZoom(currentZoom + 0.15);
        return;
      }
      if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        applyZoom(currentZoom - 0.15);
        return;
      }
      if (e.key === "0") {
        e.preventDefault();
        applyZoom(1.0);
        return;
      }
    }

    if (e.key === "PageDown" || (e.key === " " && !e.shiftKey)) {
      e.preventDefault();
      container.scrollBy({
        top: container.clientHeight * 0.85,
        behavior: "smooth"
      });
    } else if (e.key === "PageUp" || (e.key === " " && e.shiftKey)) {
      e.preventDefault();
      container.scrollBy({
        top: -container.clientHeight * 0.85,
        behavior: "smooth"
      });
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      container.scrollBy({ top: 120, behavior: "smooth" });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      container.scrollBy({ top: -120, behavior: "smooth" });
    } else if (e.key === "Home") {
      e.preventDefault();
      container.scrollTo({ top: 0, behavior: "smooth" });
    } else if (e.key === "End") {
      e.preventDefault();
      container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
    }
  });

  async function renderPage(
    doc,
    pageNum,
    holder,
    pageScale,
    lib,
    uiInstance,
    gen
  ) {
    const page = await doc.getPage(pageNum);
    if (gen !== renderGen) return;

    const viewport = page.getViewport({ scale: pageScale });
    holder.style.width = `${Math.floor(viewport.width)}px`;
    holder.style.height = `${Math.floor(viewport.height)}px`;

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(viewport.width * dpr);
    canvas.height = Math.floor(viewport.height * dpr);
    canvas.style.width = `${Math.floor(viewport.width)}px`;
    canvas.style.height = `${Math.floor(viewport.height)}px`;
    ctx.scale(dpr, dpr);

    const textLayerDiv = document.createElement("div");
    textLayerDiv.className = "pg-text-layer";
    textLayerDiv.style.setProperty("--scale-factor", String(pageScale));
    textLayerDiv.addEventListener("mousedown", () => {
      textLayerDiv.classList.add("pg-selecting");
    });

    await page.render({ canvasContext: ctx, viewport }).promise;
    if (gen !== renderGen) return;

    const textContent = await page.getTextContent();
    if (gen !== renderGen) return;

    if (typeof lib.TextLayer === "function") {
      const textLayer = new lib.TextLayer({
        textContentSource: textContent,
        container: textLayerDiv,
        viewport
      });
      await textLayer.render();
    } else {
      for (const item of textContent.items) {
        if (!item.str) continue;
        const tx = lib.Util.transform(viewport.transform, item.transform);
        const fontHeight = Math.hypot(tx[2], tx[3]);
        const span = document.createElement("span");
        span.textContent = item.str;
        span.style.left = `${tx[4]}px`;
        span.style.top = `${tx[5] - fontHeight}px`;
        span.style.fontSize = `${fontHeight}px`;
        textLayerDiv.appendChild(span);
      }
    }
    if (gen !== renderGen) return;

    const endOfContent = document.createElement("div");
    endOfContent.className = "pg-end-of-content";
    textLayerDiv.appendChild(endOfContent);

    holder.replaceChildren(canvas, textLayerDiv);

    const spans = textLayerDiv.querySelectorAll("span:not(.markedContent)");
    for (const span of spans) {
      applyMarksToSpan(span, uiInstance);
    }
  }
})();
