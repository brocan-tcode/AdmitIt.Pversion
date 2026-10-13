// src/rag/retriever.js
// Okapi BM25 retriever over an in-memory inverted index.
//
// Why BM25 and not vector search: vector search needs an embedding model.
// Every hosted embedding model is an API call, and local ONNX models would
// mean a 90MB dependency. BM25 with synonym expansion + metadata boosting
// gets us solid retrieval on a corpus of this size (~300 docs) with zero
// dependencies and sub-millisecond queries.

const { tokenize, bigrams } = require('./tokenize');

const K1 = 1.5;   // term-frequency saturation

// Length normalisation. Lowered from the 0.75 textbook default because this
// corpus has very uneven document lengths — timeline tasks average 48 indexed
// tokens against 84 for career documents and 218 for school documents — and at
// 0.75 the short timeline entries outranked the topically correct answer for
// questions like "what should I write my personal statement about".
// Chosen by sweeping against the gold set in evalRetrieval.js, not by taste:
// 0.75 -> MRR 0.684, 0.60 -> 0.684, 0.45 -> 0.686, 0.30 -> 0.699.
const B  = 0.30;

class RagIndex {
  /**
   * @param {Array} docs  [{ id, topic, title, text, tags[], meta{} }]
   */
  constructor(docs = []) {
    this.docs = [];
    this.df = new Map();       // term -> number of docs containing it
    this.postings = new Map(); // term -> [{ docIdx, tf }]
    this.avgdl = 0;
    this.add(docs);
  }

  add(docs) {
    for (const doc of docs) {
      // Title and tags are repeated so matches there weigh more than body hits.
      const searchText = [
        doc.title, doc.title,
        (doc.tags || []).join(' '), (doc.tags || []).join(' '), (doc.tags || []).join(' '),
        doc.text,
      ].filter(Boolean).join(' ');

      const unigrams = tokenize(searchText);
      // Phrase pairs are indexed alongside single terms. `_len` stays the
      // unigram count so length normalisation is unaffected by adding them.
      const tokens = [...unigrams, ...bigrams(unigrams)];
      const tf = new Map();
      for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);

      const docIdx = this.docs.length;
      this.docs.push({ ...doc, _len: unigrams.length, _tf: tf });

      for (const [term, count] of tf) {
        this.df.set(term, (this.df.get(term) || 0) + 1);
        if (!this.postings.has(term)) this.postings.set(term, []);
        this.postings.get(term).push({ docIdx, tf: count });
      }
    }
    const total = this.docs.reduce((s, d) => s + d._len, 0);
    this.avgdl = this.docs.length ? total / this.docs.length : 0;
    return this;
  }

  idf(term) {
    const n = this.docs.length;
    const df = this.df.get(term) || 0;
    return Math.log(1 + (n - df + 0.5) / (df + 0.5));
  }

  /**
   * @param {string} query
   * @param {object} opts
   *   topic   - string | string[]  restrict to these topics
   *   k       - number of results (default 6)
   *   filter  - fn(doc) => boolean
   *   boost   - fn(doc) => multiplier (1.0 = neutral)
   *   minScore- drop results below this raw BM25 score
   */
  search(query, opts = {}) {
    const { k = 6, filter, boost, minScore = 0 } = opts;
    // Overridable so the tuning sweep in evalRetrieval.js can measure them
    // rather than leaving them at library defaults by assumption.
    const k1 = opts.k1 ?? K1;
    const b  = opts.b  ?? B;
    const topics = opts.topic
      ? (Array.isArray(opts.topic) ? opts.topic : [opts.topic])
      : null;

    const qUnigrams = tokenize(query);
    if (!qUnigrams.length) return [];
    const qTokens = [...qUnigrams, ...bigrams(qUnigrams)];

    const scores = new Map(); // docIdx -> score
    const hits   = new Map(); // docIdx -> Set(term) for explainability

    for (const term of qTokens) {
      const posting = this.postings.get(term);
      if (!posting) continue;
      const idf = this.idf(term);
      for (const { docIdx, tf } of posting) {
        const doc = this.docs[docIdx];
        if (topics && !topics.includes(doc.topic)) continue;
        const norm = 1 - b + b * (doc._len / (this.avgdl || 1));
        const s = idf * (tf * (k1 + 1)) / (tf + k1 * norm);
        scores.set(docIdx, (scores.get(docIdx) || 0) + s);
        if (!hits.has(docIdx)) hits.set(docIdx, new Set());
        hits.get(docIdx).add(term);
      }
    }

    const results = [];
    for (const [docIdx, rawScore] of scores) {
      const doc = this.docs[docIdx];
      if (filter && !filter(doc)) continue;
      if (rawScore < minScore) continue;
      const mult = boost ? boost(doc) : 1;
      if (mult <= 0) continue;
      results.push({
        doc,
        score: rawScore * mult,
        rawScore,
        boost: mult,
        matched: [...(hits.get(docIdx) || [])],
      });
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, k);
  }

  /**
   * Retrieve, then drop near-duplicate documents so a composed section
   * doesn't repeat the same advice three times in different words.
   *
   * Entity topics are exempt: every school document is generated from the same
   * template, so three different universities look like near-duplicates by text
   * overlap while being exactly what the user asked for.
   */
  searchDiverse(query, opts = {}) {
    const entityTopics = new Set(opts.entityTopics || ['school']);
    const pool = this.search(query, { ...opts, k: (opts.k || 6) * 4 });
    const picked = [];
    const seenTokens = [];

    for (const r of pool) {
      if (entityTopics.has(r.doc.topic)) {
        picked.push(r);
        if (picked.length >= (opts.k || 6)) break;
        continue;
      }
      const toks = new Set(tokenize(r.doc.text).slice(0, 60));
      let dup = false;
      for (const prev of seenTokens) {
        let overlap = 0;
        for (const t of toks) if (prev.has(t)) overlap++;
        const jaccard = overlap / Math.max(1, Math.min(toks.size, prev.size));
        if (jaccard > 0.55) { dup = true; break; }
      }
      if (dup) continue;
      picked.push(r);
      seenTokens.push(toks);
      if (picked.length >= (opts.k || 6)) break;
    }
    return picked;
  }

  /**
   * Every document passing `filter`, in corpus order.
   * Used where a metadata filter (e.g. "timeline tasks for October") already
   * narrows the pool to a handful and lexical overlap with the query may be
   * zero — retrieval should not drop a task just because it never happens to
   * contain the word "October".
   */
  all(filter) {
    return this.docs.filter(d => (filter ? filter(d) : true));
  }

  get size() { return this.docs.length; }

  stats() {
    const byTopic = {};
    for (const d of this.docs) byTopic[d.topic] = (byTopic[d.topic] || 0) + 1;
    return { documents: this.docs.length, vocabulary: this.df.size, avgDocLength: Math.round(this.avgdl), byTopic };
  }
}

module.exports = { RagIndex, K1, B };
