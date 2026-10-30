(function (root) {
  function extractBookKey(urlOrPath) {
    try {
      const decoded = decodeURIComponent(String(urlOrPath || ""));
      const clean = decoded.split("?")[0].split("#")[0].replace(/\\/g, "/");
      const filename = clean.slice(clean.lastIndexOf("/") + 1);
      return filename || "default_book.pdf";
    } catch {
      return "default_book.pdf";
    }
  }

  function makeGlossaryId(bookKey) {
    const slug = bookKey
      .replace(/\.pdf$/i, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "");
    return `glossary_${slug || "book"}`;
  }

  function createStorageClient(storageArea) {
    const area =
      storageArea ||
      (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local);

    async function getRawState() {
      const data = await area.get(["bookMap", "glossaries"]);
      return {
        bookMap: data.bookMap || {},
        glossaries: data.glossaries || {}
      };
    }

    async function saveRawState(state) {
      await area.set({
        bookMap: state.bookMap,
        glossaries: state.glossaries
      });
    }

    async function ensureBookGlossary(bookKey) {
      const state = await getRawState();
      let glossaryId = state.bookMap[bookKey];
      if (!glossaryId || !state.glossaries[glossaryId]) {
        glossaryId = makeGlossaryId(bookKey);
        state.bookMap[bookKey] = glossaryId;
        if (!state.glossaries[glossaryId]) {
          state.glossaries[glossaryId] = {
            id: glossaryId,
            name: bookKey.replace(/\.pdf$/i, ""),
            terms: {}
          };
        }
        await saveRawState(state);
      }
      return {
        bookKey,
        glossary: state.glossaries[glossaryId],
        allGlossaries: Object.values(state.glossaries)
      };
    }

    async function upsertTerm(bookKey, { id, name, description }) {
      const cleanName = String(name || "").trim().replace(/\s+/g, " ");
      const cleanDesc = String(description || "").trim();
      if (!cleanName) {
        throw new Error("Term name is required");
      }

      const state = await getRawState();
      const { glossary } = await ensureBookGlossary(bookKey);
      const targetGlossary = state.glossaries[glossary.id] || glossary;

      let targetId = id;
      if (!targetId) {
        const existing = Object.values(targetGlossary.terms).find(
          (t) => t.name.toLowerCase() === cleanName.toLowerCase()
        );
        if (existing) {
          targetId = existing.id;
        } else {
          targetId = `term_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        }
      }

      targetGlossary.terms[targetId] = {
        id: targetId,
        name: cleanName,
        description: cleanDesc,
        updatedAt: Date.now()
      };

      state.glossaries[targetGlossary.id] = targetGlossary;
      state.bookMap[bookKey] = targetGlossary.id;
      await saveRawState(state);
      return targetGlossary.terms[targetId];
    }

    async function deleteTerm(bookKey, termId) {
      const state = await getRawState();
      const glossaryId = state.bookMap[bookKey];
      if (!glossaryId || !state.glossaries[glossaryId]) return false;
      delete state.glossaries[glossaryId].terms[termId];
      await saveRawState(state);
      return true;
    }

    async function linkBookToGlossary(bookKey, targetGlossaryId) {
      const state = await getRawState();
      if (!state.glossaries[targetGlossaryId]) {
        throw new Error(`Glossary ${targetGlossaryId} does not exist`);
      }
      state.bookMap[bookKey] = targetGlossaryId;
      await saveRawState(state);
      return state.glossaries[targetGlossaryId];
    }

    async function exportGlossaryJson(bookKey) {
      const { glossary } = await ensureBookGlossary(bookKey);
      return JSON.stringify(
        {
          version: 1,
          exportedAt: new Date().toISOString(),
          glossaryName: glossary.name,
          terms: Object.values(glossary.terms)
        },
        null,
        2
      );
    }

    async function importGlossaryJson(bookKey, jsonString) {
      let parsed;
      try {
        parsed = JSON.parse(jsonString);
      } catch {
        throw new Error("Invalid JSON file");
      }

      const rawTerms = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed && parsed.terms)
        ? parsed.terms
        : null;

      if (!rawTerms) {
        throw new Error("JSON must contain a terms array");
      }

      const state = await getRawState();
      const { glossary } = await ensureBookGlossary(bookKey);
      const targetGlossary = state.glossaries[glossary.id] || glossary;

      let count = 0;
      for (const item of rawTerms) {
        if (!item || typeof item.name !== "string" || !item.name.trim()) {
          throw new Error("Each imported term must have a non-empty string name");
        }
        const cleanName = item.name.trim().replace(/\s+/g, " ");
        const cleanDesc = typeof item.description === "string" ? item.description.trim() : "";
        const existing = Object.values(targetGlossary.terms).find(
          (t) => t.name.toLowerCase() === cleanName.toLowerCase()
        );
        const termId = existing
          ? existing.id
          : item.id || `term_${Date.now()}_${count}`;
        targetGlossary.terms[termId] = {
          id: termId,
          name: cleanName,
          description: cleanDesc,
          updatedAt: Date.now()
        };
        count++;
      }

      state.glossaries[targetGlossary.id] = targetGlossary;
      state.bookMap[bookKey] = targetGlossary.id;
      await saveRawState(state);
      return count;
    }

    return {
      getRawState,
      ensureBookGlossary,
      upsertTerm,
      deleteTerm,
      linkBookToGlossary,
      exportGlossaryJson,
      importGlossaryJson
    };
  }

  const api = {
    extractBookKey,
    makeGlossaryId,
    createStorageClient
  };

  root.GlossaryStorage = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
