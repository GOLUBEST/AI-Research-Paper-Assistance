const express = require('express');
const cors = require('cors');
const path = require('path');
const { XMLParser } = require('fast-xml-parser');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname)));

const CACHE_TTL_MS = 10 * 60 * 1000;
const SEARCH_LIMIT = 12;
const cache = new Map();
const xmlParser = new XMLParser({ ignoreAttributes: false });

const sourceHealth = {
    semanticscholar: { ok: 0, fail: 0, lastStatus: 'unknown', lastLatencyMs: null, lastCheckedAt: null, lastError: null },
    arxiv: { ok: 0, fail: 0, lastStatus: 'unknown', lastLatencyMs: null, lastCheckedAt: null, lastError: null },
    openalex: { ok: 0, fail: 0, lastStatus: 'unknown', lastLatencyMs: null, lastCheckedAt: null, lastError: null },
    crossref: { ok: 0, fail: 0, lastStatus: 'unknown', lastLatencyMs: null, lastCheckedAt: null, lastError: null }
};

let plagiarismIndex = {
    topic: null,
    builtAt: null,
    docs: [],
    sentences: []
};

function getCache(key) {
    const entry = cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
        cache.delete(key);
        return null;
    }
    return entry.data;
}

function setCache(key, data, ttlMs = CACHE_TTL_MS) {
    cache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

function normalizeText(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
}

function splitWords(text) {
    return normalizeText(text)
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(Boolean);
}

function splitSentences(text) {
    return normalizeText(text)
        .replace(/([.!?])\s+/g, '$1|')
        .split('|')
        .map(s => s.trim())
        .filter(s => s.length > 25);
}

function dedupePapers(papers) {
    const seen = new Set();
    const result = [];
    papers.forEach(p => {
        const key = normalizeText((p.title || '').toLowerCase());
        if (!key || seen.has(key)) return;
        seen.add(key);
        result.push(p);
    });
    return result;
}

function updateHealth(source, status, latencyMs, error = null) {
    const row = sourceHealth[source];
    if (!row) return;
    if (status === 'ok' || status === 'cache') row.ok += 1;
    if (status === 'error') row.fail += 1;
    row.lastStatus = status;
    row.lastLatencyMs = latencyMs;
    row.lastCheckedAt = new Date().toISOString();
    row.lastError = error;
}

async function fetchJsonWithTimeout(url, timeoutMs = 12000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'ResearchHub/1.0' } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    } finally {
        clearTimeout(timer);
    }
}

async function fetchTextWithTimeout(url, timeoutMs = 12000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'ResearchHub/1.0' } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.text();
    } finally {
        clearTimeout(timer);
    }
}

async function sourceSemanticScholar(query) {
    const source = 'semanticscholar';
    const cacheKey = `search:${source}:${query.toLowerCase()}`;
    const cached = getCache(cacheKey);
    if (cached) {
        updateHealth(source, 'cache', 0);
        return { source, status: 'cache', latencyMs: 0, fromCache: true, count: cached.length, papers: cached };
    }

    const t0 = Date.now();
    try {
        const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&limit=${SEARCH_LIMIT}&fields=title,authors,year,abstract,venue,url`;
        const data = await fetchJsonWithTimeout(url);
        const papers = (data.data || []).map(p => ({
            title: p.title,
            authors: p.authors ? p.authors.map(a => a.name).join(', ') : 'Unknown Authors',
            year: p.year,
            abstract: p.abstract || 'No abstract available',
            source: p.venue || 'Semantic Scholar',
            url: p.url || ''
        }));
        const latencyMs = Date.now() - t0;
        setCache(cacheKey, papers);
        updateHealth(source, 'ok', latencyMs);
        return { source, status: 'ok', latencyMs, fromCache: false, count: papers.length, papers };
    } catch (error) {
        const latencyMs = Date.now() - t0;
        updateHealth(source, 'error', latencyMs, error.message);
        return { source, status: 'error', latencyMs, fromCache: false, count: 0, papers: [], error: error.message };
    }
}

async function sourceArxiv(query) {
    const source = 'arxiv';
    const cacheKey = `search:${source}:${query.toLowerCase()}`;
    const cached = getCache(cacheKey);
    if (cached) {
        updateHealth(source, 'cache', 0);
        return { source, status: 'cache', latencyMs: 0, fromCache: true, count: cached.length, papers: cached };
    }

    const t0 = Date.now();
    try {
        const url = `https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(query)}&max_results=${SEARCH_LIMIT}`;
        const xml = await fetchTextWithTimeout(url);
        const parsed = xmlParser.parse(xml);
        const feed = parsed.feed || {};
        const entries = Array.isArray(feed.entry) ? feed.entry : (feed.entry ? [feed.entry] : []);
        const papers = entries.map(entry => {
            const authorsArr = Array.isArray(entry.author) ? entry.author : (entry.author ? [entry.author] : []);
            const authors = authorsArr.map(a => a.name).filter(Boolean).join(', ');
            return {
                title: normalizeText(entry.title || 'Untitled'),
                authors: authors || 'Unknown Authors',
                year: entry.published ? new Date(entry.published).getFullYear() : 'N/A',
                abstract: normalizeText(entry.summary || 'No abstract available'),
                source: 'arXiv',
                url: entry.id || ''
            };
        });

        const latencyMs = Date.now() - t0;
        setCache(cacheKey, papers);
        updateHealth(source, 'ok', latencyMs);
        return { source, status: 'ok', latencyMs, fromCache: false, count: papers.length, papers };
    } catch (error) {
        const latencyMs = Date.now() - t0;
        updateHealth(source, 'error', latencyMs, error.message);
        return { source, status: 'error', latencyMs, fromCache: false, count: 0, papers: [], error: error.message };
    }
}

function rebuildOpenAlexAbstract(indexObj) {
    if (!indexObj) return 'No abstract available';
    const words = Object.entries(indexObj)
        .flatMap(([word, positions]) => positions.map(pos => ({ word, pos })))
        .sort((a, b) => a.pos - b.pos)
        .map(w => w.word);
    return words.length > 0 ? words.join(' ') : 'No abstract available';
}

async function sourceOpenAlex(query) {
    const source = 'openalex';
    const cacheKey = `search:${source}:${query.toLowerCase()}`;
    const cached = getCache(cacheKey);
    if (cached) {
        updateHealth(source, 'cache', 0);
        return { source, status: 'cache', latencyMs: 0, fromCache: true, count: cached.length, papers: cached };
    }

    const t0 = Date.now();
    try {
        const url = `https://api.openalex.org/works?search=${encodeURIComponent(query)}&per-page=${SEARCH_LIMIT}&sort=relevance_score:desc`;
        const data = await fetchJsonWithTimeout(url);
        const papers = (data.results || []).map(item => ({
            title: item.title || 'Untitled',
            authors: (item.authorships || []).map(a => a.author && a.author.display_name).filter(Boolean).slice(0, 8).join(', ') || 'Unknown Authors',
            year: item.publication_year || 'N/A',
            abstract: rebuildOpenAlexAbstract(item.abstract_inverted_index),
            source: (item.primary_location && item.primary_location.source && item.primary_location.source.display_name) || 'OpenAlex',
            url: item.id || ''
        }));
        const latencyMs = Date.now() - t0;
        setCache(cacheKey, papers);
        updateHealth(source, 'ok', latencyMs);
        return { source, status: 'ok', latencyMs, fromCache: false, count: papers.length, papers };
    } catch (error) {
        const latencyMs = Date.now() - t0;
        updateHealth(source, 'error', latencyMs, error.message);
        return { source, status: 'error', latencyMs, fromCache: false, count: 0, papers: [], error: error.message };
    }
}

async function sourceCrossref(query) {
    const source = 'crossref';
    const cacheKey = `search:${source}:${query.toLowerCase()}`;
    const cached = getCache(cacheKey);
    if (cached) {
        updateHealth(source, 'cache', 0);
        return { source, status: 'cache', latencyMs: 0, fromCache: true, count: cached.length, papers: cached };
    }

    const t0 = Date.now();
    try {
        const url = `https://api.crossref.org/works?rows=${SEARCH_LIMIT}&query=${encodeURIComponent(query)}`;
        const data = await fetchJsonWithTimeout(url);
        const papers = ((data.message && data.message.items) || []).map(item => {
            const title = Array.isArray(item.title) ? item.title[0] : item.title;
            const authors = (item.author || []).map(a => [a.given, a.family].filter(Boolean).join(' ')).filter(Boolean).join(', ');
            const abstractRaw = item.abstract || '';
            const abstract = normalizeText(abstractRaw.replace(/<[^>]+>/g, ' ')) || 'No abstract available';
            const year = item.issued && item.issued['date-parts'] && item.issued['date-parts'][0] && item.issued['date-parts'][0][0]
                ? item.issued['date-parts'][0][0]
                : 'N/A';
            return {
                title: title || 'Untitled',
                authors: authors || 'Unknown Authors',
                year,
                abstract,
                source: 'Crossref',
                url: item.URL || ''
            };
        });

        const latencyMs = Date.now() - t0;
        setCache(cacheKey, papers);
        updateHealth(source, 'ok', latencyMs);
        return { source, status: 'ok', latencyMs, fromCache: false, count: papers.length, papers };
    } catch (error) {
        const latencyMs = Date.now() - t0;
        updateHealth(source, 'error', latencyMs, error.message);
        return { source, status: 'error', latencyMs, fromCache: false, count: 0, papers: [], error: error.message };
    }
}

function cosineSimilarity(textA, textB) {
    const wordsA = splitWords(textA).filter(w => w.length > 2);
    const wordsB = splitWords(textB).filter(w => w.length > 2);
    if (wordsA.length === 0 || wordsB.length === 0) return 0;

    const tfA = {};
    const tfB = {};
    wordsA.forEach(w => { tfA[w] = (tfA[w] || 0) + 1; });
    wordsB.forEach(w => { tfB[w] = (tfB[w] || 0) + 1; });

    const vocab = new Set([...Object.keys(tfA), ...Object.keys(tfB)]);
    let dot = 0;
    let normA = 0;
    let normB = 0;
    vocab.forEach(w => {
        const a = tfA[w] || 0;
        const b = tfB[w] || 0;
        dot += a * b;
        normA += a * a;
        normB += b * b;
    });
    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function jaccardSimilarity(textA, textB) {
    const setA = new Set(splitWords(textA).filter(w => w.length > 2));
    const setB = new Set(splitWords(textB).filter(w => w.length > 2));
    if (setA.size === 0 || setB.size === 0) return 0;
    let inter = 0;
    setA.forEach(w => { if (setB.has(w)) inter += 1; });
    const union = setA.size + setB.size - inter;
    return union > 0 ? inter / union : 0;
}

function trigramSimilarity(textA, textB) {
    const wordsA = splitWords(textA);
    const wordsB = splitWords(textB);
    if (wordsA.length < 3 || wordsB.length < 3) return 0;
    const nA = new Set();
    const nB = new Set();
    for (let i = 0; i < wordsA.length - 2; i++) nA.add(`${wordsA[i]} ${wordsA[i + 1]} ${wordsA[i + 2]}`);
    for (let i = 0; i < wordsB.length - 2; i++) nB.add(`${wordsB[i]} ${wordsB[i + 1]} ${wordsB[i + 2]}`);
    if (nA.size === 0 || nB.size === 0) return 0;
    let inter = 0;
    nA.forEach(ng => { if (nB.has(ng)) inter += 1; });
    return inter / Math.max(1, nA.size);
}

function extractTopic(text) {
    const stop = new Set(['the', 'and', 'for', 'with', 'from', 'this', 'that', 'are', 'was', 'were', 'have', 'has', 'had', 'into', 'between']);
    const words = splitWords(text).filter(w => w.length > 3 && !stop.has(w));
    return words.slice(0, 4).join(' ') || 'research';
}

async function buildPlagiarismIndex(topic) {
    const key = `plag:index:${topic.toLowerCase()}`;
    const cached = getCache(key);
    if (cached) {
        plagiarismIndex = cached;
        return { ...cached, fromCache: true };
    }

    const [openAlex, crossref] = await Promise.all([sourceOpenAlex(topic), sourceCrossref(topic)]);
    const docs = dedupePapers([...openAlex.papers, ...crossref.papers]).slice(0, 80);
    const sentences = [];
    docs.forEach(doc => {
        const blocks = splitSentences(`${doc.title}. ${doc.abstract}`);
        blocks.forEach(sentence => {
            sentences.push({
                sentence,
                source: doc.source,
                sourceTitle: doc.title,
                sourceUrl: doc.url,
                year: doc.year
            });
        });
    });

    plagiarismIndex = {
        topic,
        builtAt: new Date().toISOString(),
        docs,
        sentences
    };
    setCache(key, plagiarismIndex, 30 * 60 * 1000);
    return { ...plagiarismIndex, fromCache: false };
}

app.get('/api/search', async (req, res) => {
    const q = normalizeText(req.query.q || '');
    if (!q) return res.status(400).json({ error: 'Missing q parameter' });

    const [ss, ax, oa, cr] = await Promise.all([
        sourceSemanticScholar(q),
        sourceArxiv(q),
        sourceOpenAlex(q),
        sourceCrossref(q)
    ]);

    const papers = dedupePapers([...ss.papers, ...ax.papers, ...oa.papers, ...cr.papers]).slice(0, 40);
    return res.json({
        query: q,
        papers,
        diagnostics: {
            generatedAt: new Date().toISOString(),
            sources: [ss, ax, oa, cr].map(s => ({
                source: s.source,
                status: s.status,
                latencyMs: s.latencyMs,
                fromCache: s.fromCache,
                count: s.count,
                error: s.error || null
            }))
        }
    });
});

app.get('/api/health', (req, res) => {
    const cacheEntries = Array.from(cache.values());
    const activeCacheEntries = cacheEntries.filter(entry => entry.expiresAt > Date.now()).length;
    return res.json({
        status: 'ok',
        serverTime: new Date().toISOString(),
        sourceHealth,
        cache: {
            totalEntries: cacheEntries.length,
            activeEntries: activeCacheEntries,
            ttlMinutes: CACHE_TTL_MS / 60000
        },
        plagiarismIndex: {
            topic: plagiarismIndex.topic,
            builtAt: plagiarismIndex.builtAt,
            documents: plagiarismIndex.docs.length,
            indexedSentences: plagiarismIndex.sentences.length
        }
    });
});

app.post('/api/plagiarism/index', async (req, res) => {
    const topic = normalizeText((req.body && req.body.topic) || req.query.topic || 'research');
    try {
        const index = await buildPlagiarismIndex(topic);
        res.json({
            topic: index.topic,
            builtAt: index.builtAt,
            fromCache: index.fromCache,
            documents: index.docs.length,
            indexedSentences: index.sentences.length
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/plagiarism/analyze', async (req, res) => {
    const text = normalizeText(req.body && req.body.text);
    const topic = normalizeText((req.body && req.body.topic) || extractTopic(text));
    if (!text) return res.status(400).json({ error: 'Missing text' });

    try {
        if (!plagiarismIndex.topic || plagiarismIndex.topic !== topic || plagiarismIndex.sentences.length === 0) {
            await buildPlagiarismIndex(topic);
        }

        const inputSentences = splitSentences(text);
        const sentenceLinks = [];
        const sourceAgg = {};
        let confidenceSum = 0;

        inputSentences.forEach(sentence => {
            let best = null;
            for (const ref of plagiarismIndex.sentences) {
                const trigram = trigramSimilarity(sentence, ref.sentence);
                const cosine = cosineSimilarity(sentence, ref.sentence);
                const jaccard = jaccardSimilarity(sentence, ref.sentence);
                const score = (trigram * 0.5) + (cosine * 0.35) + (jaccard * 0.15);
                if (!best || score > best.score) {
                    best = { ref, score };
                }
            }

            if (best && best.score >= 0.2) {
                const confidence = Math.round(best.score * 100);
                const confidenceLow = Math.max(0, confidence - 8);
                const confidenceHigh = Math.min(100, confidence + 8);

                sentenceLinks.push({
                    sentence,
                    matchedSentence: best.ref.sentence,
                    sourceTitle: best.ref.sourceTitle,
                    source: best.ref.source,
                    sourceUrl: best.ref.sourceUrl,
                    confidence,
                    confidenceLow,
                    confidenceHigh
                });

                const key = `${best.ref.sourceTitle}||${best.ref.source}`;
                sourceAgg[key] = sourceAgg[key] || { title: best.ref.sourceTitle, source: best.ref.source, url: best.ref.sourceUrl, hits: 0, confidenceTotal: 0 };
                sourceAgg[key].hits += 1;
                sourceAgg[key].confidenceTotal += confidence;
                confidenceSum += confidence;
            }
        });

        const matchedCount = sentenceLinks.length;
        const totalSentences = Math.max(1, inputSentences.length);
        const avgConfidence = matchedCount > 0 ? confidenceSum / matchedCount : 0;
        const plagPercent = Math.min(95, Math.round(((matchedCount / totalSentences) * 0.55 + (avgConfidence / 100) * 0.45) * 100));

        const topSources = Object.values(sourceAgg)
            .map(s => ({
                title: s.title,
                source: s.source,
                url: s.url,
                percent: Math.min(100, Math.round((s.confidenceTotal / Math.max(1, matchedCount)) * (s.hits / Math.max(1, totalSentences)) * 2.2))
            }))
            .sort((a, b) => b.percent - a.percent)
            .slice(0, 8);

        res.json({
            topic,
            plagPercent,
            originalPercent: 100 - plagPercent,
            topSources,
            sentenceLinks,
            indexStats: {
                builtAt: plagiarismIndex.builtAt,
                documents: plagiarismIndex.docs.length,
                indexedSentences: plagiarismIndex.sentences.length
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`ResearchHub backend running on http://localhost:${PORT}`);
});
