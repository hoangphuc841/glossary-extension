(function (root) {
  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function normalizeText(str) {
    return String(str || "").trim().replace(/\s+/g, " ");
  }

  function buildTermMatcher(termsList) {
    const valid = (termsList || [])
      .filter((t) => t && normalizeText(t.name).length > 0)
      .map((t) => ({
        id: t.id,
        name: normalizeText(t.name),
        nameLower: normalizeText(t.name).toLowerCase(),
        description: t.description || ""
      }))
      .sort((a, b) => b.name.length - a.name.length);

    if (valid.length === 0) {
      return { regex: null, byLower: new Map() };
    }

    const byLower = new Map();
    for (const item of valid) {
      if (!byLower.has(item.nameLower)) {
        byLower.set(item.nameLower, item);
      }
    }

    const pattern = Array.from(byLower.values())
      .map((item) => escapeRegex(item.name))
      .join("|");

    // Word boundary check that handles ASCII letters/digits and punctuation boundaries
    const regex = new RegExp(`(?<![\\p{L}\\p{N}_])(${pattern})(?![\\p{L}\\p{N}_])`, "giu");
    return { regex, byLower };
  }

  function findStrictMatches(text, matcher) {
    if (!text || !matcher || !matcher.regex) return [];
    const results = [];
    matcher.regex.lastIndex = 0;
    let match;
    while ((match = matcher.regex.exec(text)) !== null) {
      const matchedText = match[1];
      const term = matcher.byLower.get(matchedText.toLowerCase());
      if (term) {
        results.push({
          start: match.index,
          end: match.index + matchedText.length,
          text: matchedText,
          termId: term.id
        });
      }
    }
    return results;
  }

  function getBigrams(str) {
    const s = str.toLowerCase();
    if (s.length < 2) return [s];
    const out = [];
    for (let i = 0; i < s.length - 1; i++) {
      out.push(s.slice(i, i + 2));
    }
    return out;
  }

  function diceCoefficient(a, b) {
    if (!a || !b) return 0;
    if (a === b) return 1;
    const bgA = getBigrams(a);
    const bgB = getBigrams(b);
    const counts = new Map();
    for (const bg of bgA) {
      counts.set(bg, (counts.get(bg) || 0) + 1);
    }
    let intersection = 0;
    for (const bg of bgB) {
      const c = counts.get(bg) || 0;
      if (c > 0) {
        intersection++;
        counts.set(bg, c - 1);
      }
    }
    return (2 * intersection) / (bgA.length + bgB.length);
  }

  function levenshteinSimilarity(a, b) {
    const s1 = a.toLowerCase();
    const s2 = b.toLowerCase();
    const maxLen = Math.max(s1.length, s2.length);
    if (maxLen === 0) return 1;
    const dp = Array.from({ length: s2.length + 1 }, (_, i) => i);
    for (let i = 1; i <= s1.length; i++) {
      let prev = dp[0];
      dp[0] = i;
      for (let j = 1; j <= s2.length; j++) {
        const temp = dp[j];
        const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
        dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost);
        prev = temp;
      }
    }
    return 1 - dp[s2.length] / maxLen;
  }

  function scoreTermSimilarity(query, termName) {
    const q = normalizeText(query).toLowerCase();
    const t = normalizeText(termName).toLowerCase();
    if (!q || !t) return 0;
    if (q === t) return 1;
    let substringScore = 0;
    if (t.includes(q) || q.includes(t)) {
      const shorter = Math.min(q.length, t.length);
      const longer = Math.max(q.length, t.length);
      substringScore = 0.65 + 0.35 * (shorter / longer);
    }
    const dice = diceCoefficient(q, t);
    const edit = levenshteinSimilarity(q, t);
    return Math.max(substringScore, dice * 0.6 + edit * 0.4);
  }

  function searchSimilarTerms(query, termsList, threshold = 0.25) {
    const q = normalizeText(query);
    if (!q) return [...(termsList || [])];
    return (termsList || [])
      .map((term) => ({
        term,
        score: Math.max(
          scoreTermSimilarity(q, term.name),
          ...normalizeText(term.name)
            .split(" ")
            .map((word) => scoreTermSimilarity(q, word) * 0.9)
        )
      }))
      .filter((entry) => entry.score >= threshold)
      .sort((a, b) => b.score - a.score)
      .map((entry) => entry.term);
  }

  const api = {
    normalizeText,
    buildTermMatcher,
    findStrictMatches,
    scoreTermSimilarity,
    searchSimilarTerms
  };

  root.GlossaryMatcher = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
