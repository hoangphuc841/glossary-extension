import test from "node:test";
import assert from "node:assert/strict";
import matcher from "../core/matcher.js";
import storageMod from "../core/storage.js";

function createMemoryStorage() {
  const store = {};
  return {
    async get(keys) {
      const out = {};
      for (const k of keys) {
        if (k in store) out[k] = structuredClone(store[k]);
      }
      return out;
    },
    async set(obj) {
      for (const [k, v] of Object.entries(obj)) {
        store[k] = structuredClone(v);
      }
    }
  };
}

test("strict matcher respects word boundaries and longest term first", () => {
  const terms = [
    { id: "t1", name: "Orb", description: "Computation jewel" },
    { id: "t2", name: "Type 95", description: "Four-core orb" },
    { id: "t3", name: "Type 95 Orb", description: "Full experimental orb" }
  ];
  const m = matcher.buildTermMatcher(terms);
  const matches = matcher.findStrictMatches(
    "Orbiting the Type 95 Orb and another type 95 plus an orb.",
    m
  );
  assert.equal(matches.length, 3);
  assert.equal(matches[0].termId, "t3");
  assert.equal(matches[0].text, "Type 95 Orb");
  assert.equal(matches[1].termId, "t2");
  assert.equal(matches[2].termId, "t1");
});

test("loose similarity search ranks partial and typo queries", () => {
  const terms = [
    { id: "1", name: "Tanya Degurechaff", description: "Commander" },
    { id: "2", name: "Viktoriya Ivanovna Serebryakov", description: "Adjutant" },
    { id: "3", name: "Elenium Type 95", description: "Artifact" }
  ];
  const results = matcher.searchSimilarTerms("Degurechaf", terms);
  assert.ok(results.length >= 1);
  assert.equal(results[0].id, "1");
});

test("storage CRUD, duplicate upsert, series linking, and JSON backup", async () => {
  const client = storageMod.createStorageClient(createMemoryStorage());
  const book1 = "Youjo_Senki_Vol_01.pdf";
  const book2 = "Youjo_Senki_Vol_02.pdf";

  await client.ensureBookGlossary(book1);
  const t1 = await client.upsertTerm(book1, {
    name: "Being X",
    description: "Self-proclaimed God"
  });
  assert.equal(t1.name, "Being X");

  // Duplicate name updates existing term instead of duplicating
  const t1Updated = await client.upsertTerm(book1, {
    name: "being x",
    description: "Antagonist entity"
  });
  assert.equal(t1Updated.id, t1.id);

  // Link volume 2 to volume 1 glossary
  const g1 = (await client.ensureBookGlossary(book1)).glossary;
  const linked = await client.linkBookToGlossary(book2, g1.id);
  assert.equal(Object.values(linked.terms).length, 1);

  // Export and import into another book
  const exported = await client.exportGlossaryJson(book1);
  const book3 = "Other_Series.pdf";
  const importedCount = await client.importGlossaryJson(book3, exported);
  assert.equal(importedCount, 1);

  // Reject invalid JSON
  await assert.rejects(() => client.importGlossaryJson(book3, "{bad json"), /Invalid JSON/);
});
