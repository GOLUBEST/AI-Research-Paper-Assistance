/* ============================================
   ResearchHub - Main Application Logic
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {
    const API_BASE = window.location.protocol === 'file:' ? 'http://localhost:3000' : '';
    const stopWords = new Set([
        'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
        'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'shall', 'can',
        'this', 'that', 'these', 'those', 'it', 'its', 'i', 'we', 'you', 'he', 'she', 'they',
        'me', 'him', 'her', 'us', 'them', 'my', 'your', 'his', 'our', 'their', 'what', 'which',
        'who', 'whom', 'where', 'when', 'why', 'how', 'in', 'on', 'at', 'to', 'for', 'with', 'by',
        'from', 'of', 'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'between',
        'under', 'about', 'and', 'but', 'or', 'nor', 'not', 'no', 'so', 'if', 'then', 'than', 'too',
        'very', 'just', 'also', 'some', 'any', 'all', 'each', 'every', 'both', 'few', 'more', 'most',
        'other', 'such', 'only', 'own', 'same', 'here', 'there', 'again', 'further', 'once', 'over',
        'out', 'up', 'off', 'down', 'away', 'back'
    ]);

    // ============ UTILITIES ============
    function showLoader(el) { el.classList.add('visible'); }
    function hideLoader(el) { el.classList.remove('visible'); }
    function showBlock(el) { el.classList.add('visible'); }
    function hideBlock(el) { el.classList.remove('visible'); }
    function showToast(msg) {
        const toast = document.getElementById('toast');
        toast.textContent = msg;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 2600);
    }

    function normalizeText(text) {
        return (text || '').replace(/\s+/g, ' ').trim();
    }

    function splitWords(text) {
        return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
    }

    function splitSentences(text) {
        return text
            .replace(/([.!?])\s+/g, '$1|')
            .split('|')
            .map(s => s.trim())
            .filter(s => s.length > 0);
    }

    function escapeHtml(text) {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function downloadTextFile(fileName, content) {
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function sanitizeFileNamePart(text) {
        return (text || 'report')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 40);
    }

    // ============ PDF TEXT EXTRACTION ============
    if (window.pdfjsLib) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }

    async function extractTextFromPDF(file) {
        if (!window.pdfjsLib) {
            throw new Error('PDF library is unavailable. Please check internet connection and reload.');
        }

        const arrayBuffer = await file.arrayBuffer();
        const typedArray = new Uint8Array(arrayBuffer);
        const loadingTask = pdfjsLib.getDocument({ data: typedArray });
        const pdf = await loadingTask.promise;

        const pages = [];
        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            const content = await page.getTextContent();
            const pageText = content.items.map(item => item.str).join(' ');
            pages.push(pageText);
        }

        return normalizeText(pages.join(' '));
    }

    async function handlePdfUpload(fileInput, targetTextarea, statusEl, onLoadedMessage, sourceTag = 'pdf') {
        const file = fileInput.files && fileInput.files[0];
        if (!file) return;

        if (file.type !== 'application/pdf') {
            showToast('Please upload a valid PDF file.');
            fileInput.value = '';
            return;
        }

        statusEl.textContent = 'Reading PDF...';
        statusEl.classList.add('reading');

        try {
            const text = await extractTextFromPDF(file);
            if (!text || text.length < 30) {
                statusEl.textContent = 'Unable to extract readable text from this PDF.';
                statusEl.classList.remove('reading');
                showToast('Could not read enough text from this PDF.');
                return;
            }

            targetTextarea.value = text;
            targetTextarea.dataset.source = sourceTag;
            targetTextarea.dispatchEvent(new Event('input'));
            statusEl.textContent = `${file.name} loaded (${text.length} chars)`;
            statusEl.classList.remove('reading');
            showToast(onLoadedMessage);
        } catch (error) {
            console.error('PDF extraction failed:', error);
            statusEl.textContent = 'Failed to read PDF. Try another file.';
            statusEl.classList.remove('reading');
            showToast('Failed to read PDF.');
        }
    }

    function setupDropZone(dropZoneEl, fileInput, targetTextarea, statusEl, loadedMessage) {
        if (!dropZoneEl) return;

        const stop = (e) => {
            e.preventDefault();
            e.stopPropagation();
        };

        ['dragenter', 'dragover'].forEach(eventName => {
            dropZoneEl.addEventListener(eventName, (e) => {
                stop(e);
                dropZoneEl.classList.add('drag-active');
            });
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropZoneEl.addEventListener(eventName, (e) => {
                stop(e);
                dropZoneEl.classList.remove('drag-active');
            });
        });

        dropZoneEl.addEventListener('drop', async (e) => {
            const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
            if (!file) return;

            const dt = new DataTransfer();
            dt.items.add(file);
            fileInput.files = dt.files;
            await handlePdfUpload(fileInput, targetTextarea, statusEl, loadedMessage, 'pdf');
        });
    }

    // ============ TEXT QUALITY MODEL ============
    const TextQualityModel = {
        getFeatures(text) {
            const normalized = normalizeText(text);
            const words = splitWords(normalized);
            const sentences = splitSentences(normalized);
            const lexicalSet = new Set(words);
            const lexicalDiversity = words.length ? lexicalSet.size / words.length : 0;
            const avgWordLength = words.length
                ? words.reduce((sum, w) => sum + w.length, 0) / words.length
                : 0;
            const longWords = words.filter(w => w.length >= 6).length;
            const meaningfulWords = words.filter(w => w.length > 2 && !stopWords.has(w)).length;

            let maxRun = 1;
            let run = 1;
            for (let i = 1; i < words.length; i++) {
                if (words[i] === words[i - 1]) {
                    run += 1;
                    maxRun = Math.max(maxRun, run);
                } else {
                    run = 1;
                }
            }

            return {
                normalized,
                words,
                sentences,
                lexicalDiversity,
                avgWordLength,
                longWords,
                meaningfulWords,
                maxRun
            };
        },

        validateMeaningfulText(text, options = {}) {
            const mode = options.mode || 'summary';
            const source = options.source || 'manual';
            const f = this.getFeatures(text);

            const minChars = mode === 'plagiarism' ? 90 : (source === 'search' ? 40 : 70);
            const minWords = mode === 'plagiarism' ? 18 : (source === 'search' ? 8 : 16);
            const minSentences = mode === 'plagiarism' ? 2 : (source === 'search' ? 1 : 2);
            const minDiversity = source === 'search' ? 0.18 : 0.24;
            const minMeaningfulWords = source === 'search' ? 5 : 9;
            const minLongWords = source === 'search' ? 2 : 4;

            const hasEnoughCharacters = f.normalized.length >= minChars;
            const hasEnoughWords = f.words.length >= minWords;
            const hasEnoughSentences = f.sentences.length >= minSentences;
            const hasReasonableDiversity = f.lexicalDiversity >= minDiversity;
            const hasMeaningfulVocabulary = f.meaningfulWords >= minMeaningfulWords;
            const hasWordVariety = f.longWords >= minLongWords;
            const noExcessiveRepetition = f.maxRun < 8;

            const isMeaningful =
                hasEnoughCharacters &&
                hasEnoughWords &&
                hasEnoughSentences &&
                hasReasonableDiversity &&
                hasMeaningfulVocabulary &&
                hasWordVariety &&
                noExcessiveRepetition;

            const checks = [
                { label: `Enough characters (>= ${minChars})`, passed: hasEnoughCharacters },
                { label: `Enough words (>= ${minWords})`, passed: hasEnoughWords },
                { label: `Sentence count (>= ${minSentences})`, passed: hasEnoughSentences },
                { label: `Lexical diversity (>= ${(minDiversity * 100).toFixed(0)}%)`, passed: hasReasonableDiversity },
                { label: `Meaningful terms (>= ${minMeaningfulWords})`, passed: hasMeaningfulVocabulary },
                { label: `Word variety (>= ${minLongWords} long words)`, passed: hasWordVariety },
                { label: 'No heavy repetition', passed: noExcessiveRepetition }
            ];

            const confidence = Math.round((checks.filter(c => c.passed).length / checks.length) * 100);

            return {
                isMeaningful,
                features: f,
                message: "It doesn't make any sense. Please enter some meaningful text.",
                checks,
                confidence
            };
        }
    };

    function renderValidationFeedback(container, validation) {
        if (!container) return;
        const scoreClass = validation.confidence >= 70 ? 'good' : validation.confidence >= 45 ? 'warn' : 'bad';
        container.innerHTML = `
            <div class="validation-head">
                <strong>${validation.message}</strong>
                <span class="validation-badge ${scoreClass}">Confidence ${validation.confidence}%</span>
            </div>
            <ul class="validation-list">
                ${validation.checks.map(check => `<li>${check.passed ? '✅' : '❌'} ${escapeHtml(check.label)}</li>`).join('')}
            </ul>
        `;
        container.style.display = 'block';
    }

    function hideValidationFeedback(container) {
        if (!container) return;
        container.innerHTML = '';
        container.style.display = 'none';
    }

    // ============ START BUTTON ============
    document.getElementById('start-btn').addEventListener('click', () => {
        const landing = document.getElementById('landing-screen');
        landing.classList.add('hide');
        setTimeout(() => {
            document.getElementById('main-nav').classList.remove('app-hidden');
            document.getElementById('main-container').classList.remove('app-hidden');
        }, 420);
    });

    // ============ NAVIGATION ============
    const navLinks = document.querySelectorAll('.nav-links li');
    const views = document.querySelectorAll('.view');

    function switchView(targetId) {
        navLinks.forEach(l => l.classList.toggle('active', l.getAttribute('data-target') === targetId));
        views.forEach(v => v.classList.toggle('active-view', v.id === targetId));
        if (targetId === 'history-view') renderLibrary();
    }

    navLinks.forEach(link => {
        link.addEventListener('click', () => switchView(link.getAttribute('data-target')));
    });

    // ============ PAPER DATABASE (LOCAL FALLBACK) ============
    const paperDatabase = [
        { title: 'A Survey on the State of Artificial Intelligence in 2025', authors: 'S. Russell, P. Norvig, Y. Bengio', year: 2025, abstract: 'This comprehensive survey provides an in-depth analysis of the current state of artificial intelligence research, covering advances in reasoning, perception, natural language understanding, and autonomous decision-making.', source: 'Nature Reviews AI', tags: ['artificial intelligence', 'ai', 'survey', 'reasoning'] },
        { title: 'Big Data Analytics for Real-Time Business Intelligence', authors: 'H. Chen, R. Chiang, V. Storey', year: 2024, abstract: 'This paper introduces a scalable big data analytics platform capable of processing petabyte-scale datasets for real-time business intelligence and decision support.', source: 'MIS Quarterly', tags: ['data analytics', 'big data', 'business intelligence'] },
        { title: 'Climate Change Impacts on Global Food Security', authors: 'D. Lobell, W. Schlenker, M. Burke', year: 2025, abstract: 'Using satellite imagery and climate models combined with machine learning, we project the impacts of climate change on global crop yields.', source: 'Nature Climate Change', tags: ['climate change', 'food security', 'machine learning'] },
        { title: 'Federated Learning for Privacy-Preserving Healthcare Analytics', authors: 'B. McMahan, H. Brendan, K. Bonawitz', year: 2024, abstract: 'We propose a federated learning framework enabling multiple hospitals to collaboratively train diagnostic models without sharing patient data.', source: 'Journal of Biomedical Informatics', tags: ['federated learning', 'privacy', 'healthcare'] },
        { title: 'Vision Transformers for Real-Time Object Detection', authors: 'A. Dosovitskiy, L. Beyer, A. Kolesnikov', year: 2025, abstract: 'We present an efficient vision transformer architecture for real-time object detection while reducing computational cost significantly.', source: 'CVPR Proceedings', tags: ['computer vision', 'transformer', 'object detection'] },
        { title: 'AI-Powered Cybersecurity: Threat Detection and Autonomous Response', authors: 'K. Li, D. Kirat, D. Freeman', year: 2025, abstract: 'We present an AI-driven cybersecurity platform that combines anomaly detection with language models for automated threat analysis.', source: 'USENIX Security Symposium', tags: ['cybersecurity', 'security', 'ai'] }
    ];

    // ============ SEARCH ============
    const searchBtn = document.getElementById('search-btn');
    const searchInput = document.getElementById('search-input');
    const searchLoader = document.getElementById('search-loader');
    const searchResults = document.getElementById('search-results');
    const noResults = document.getElementById('no-results');
    const recentSearchesBox = document.getElementById('recent-searches');
    const searchDiagnostics = document.getElementById('search-diagnostics');

    function renderSearchDiagnosticsBlock(diag) {
        if (!searchDiagnostics || !diag || !diag.sources) return;
        searchDiagnostics.innerHTML = `
            <h4>API Diagnostics (Server-Side)</h4>
            <div class="diag-grid">
                ${diag.sources.map(s => `
                    <div class="diag-item">
                        <div><strong>${escapeHtml(s.source)}</strong> <span class="status-chip ${escapeHtml(s.status)}">${escapeHtml(s.status)}</span></div>
                        <div>Count: ${s.count}</div>
                        <div>Latency: ${s.latencyMs} ms</div>
                        <div>Cache: ${s.fromCache ? 'yes' : 'no'}</div>
                        ${s.error ? `<div>Error: ${escapeHtml(s.error)}</div>` : ''}
                    </div>
                `).join('')}
            </div>
        `;
        searchDiagnostics.style.display = 'block';
    }

    async function searchViaBackend(query) {
        const response = await fetch(`${API_BASE}/api/search?q=${encodeURIComponent(query)}`);
        if (!response.ok) throw new Error(`Backend search failed with ${response.status}`);
        return await response.json();
    }

    async function fetchBackendHealth() {
        try {
            const res = await fetch(`${API_BASE}/api/health`);
            if (!res.ok) return;
            const health = await res.json();
            if (searchDiagnostics) {
                searchDiagnostics.innerHTML = `<h4>Backend Health</h4><div class="diag-item">Cache entries: ${health.cache.activeEntries} / ${health.cache.totalEntries} • Index topic: ${health.plagiarismIndex.topic || 'not built'}</div>`;
                searchDiagnostics.style.display = 'block';
            }
        } catch (error) {
            console.warn('Health endpoint unavailable:', error.message);
        }
    }

    function getRecentUniqueQueries() {
        const history = NexusDB.getSearchHistory();
        return [...new Set(history.map(h => h.query))].slice(0, 10);
    }

    function highlightText(text, query) {
        if (!query || !text) return text;
        const words = query.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 2 && !stopWords.has(w));
        if (words.length === 0) return text;
        const pattern = words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
        const regex = new RegExp('(' + pattern + ')', 'gi');
        return escapeHtml(text).replace(regex, '<mark>$1</mark>');
    }

    function renderSearchSuggestions(rawInput = '') {
        const uniqueQueries = getRecentUniqueQueries();
        if (uniqueQueries.length === 0) {
            recentSearchesBox.classList.remove('visible');
            return;
        }

        const query = rawInput.trim().toLowerCase();
        const recommended = query.length >= 2
            ? uniqueQueries.filter(q => q.toLowerCase().startsWith(query)).slice(0, 4)
            : [];

        const baseRecent = uniqueQueries.slice(0, 6);
        const listToShow = recommended.length > 0
            ? [...recommended, ...baseRecent.filter(q => !recommended.includes(q))].slice(0, 8)
            : baseRecent;

        recentSearchesBox.innerHTML = `
            <div class="recent-header">
                <span>${recommended.length > 0 ? 'Recommended + Recent Searches' : 'Recent Searches'}</span>
                <button id="clear-recent">Clear</button>
            </div>
            ${listToShow.map(q => {
                const isRecommended = recommended.includes(q);
                return `<div class="recent-item ${isRecommended ? 'recommend' : ''}" data-value="${escapeHtml(q)}"><span>${isRecommended ? '✨' : '🕐'}</span> ${escapeHtml(q)} ${isRecommended ? '<em class="suggest-pill">match</em>' : ''}</div>`;
            }).join('')}
        `;
        recentSearchesBox.classList.add('visible');

        recentSearchesBox.querySelectorAll('.recent-item').forEach(item => {
            item.addEventListener('click', () => {
                searchInput.value = item.dataset.value || item.textContent.trim();
                recentSearchesBox.classList.remove('visible');
                searchBtn.click();
            });
        });

        document.getElementById('clear-recent').addEventListener('click', (e) => {
            e.stopPropagation();
            NexusDB.clearSearchHistory();
            recentSearchesBox.classList.remove('visible');
        });
    }

    searchInput.addEventListener('focus', () => renderSearchSuggestions(searchInput.value));
    searchInput.addEventListener('input', () => renderSearchSuggestions(searchInput.value));
    document.addEventListener('click', (e) => {
        if (!recentSearchesBox.contains(e.target) && e.target !== searchInput) {
            recentSearchesBox.classList.remove('visible');
        }
    });

    document.querySelectorAll('.tag').forEach(tag => {
        tag.addEventListener('click', () => {
            searchInput.value = tag.getAttribute('data-query');
            recentSearchesBox.classList.remove('visible');
            searchBtn.click();
        });
    });

    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            recentSearchesBox.classList.remove('visible');
            searchBtn.click();
        }
    });

    function renderPaperCard(paper, query = '') {
        const isSaved = NexusDB.isPaperSaved(paper.title);
        const card = document.createElement('div');
        card.className = 'paper-card';

        const displayTitle = highlightText(paper.title, query);
        const abstractPreview = paper.abstract ? paper.abstract.substring(0, 180) : 'No abstract available';
        const displayAbstract = highlightText(abstractPreview, query);

        card.innerHTML = `
            <div class="paper-title">${displayTitle}</div>
            <div class="paper-authors">${escapeHtml(paper.authors || 'Unknown Authors')}</div>
            <div class="paper-meta">${escapeHtml(paper.source || 'Research')} • ${paper.year || 'N/A'}</div>
            <div class="paper-abstract">${displayAbstract}${abstractPreview.length >= 180 ? '...' : ''}</div>
            <div class="paper-footer">
                <button class="card-btn save-btn ${isSaved ? 'saved' : ''}">${isSaved ? '⭐ Saved' : '☆ Save'}</button>
                <button class="card-btn summarize-btn">📝 Summarize</button>
                ${paper.url ? `<a href="${paper.url}" target="_blank" class="card-btn link-btn" style="text-decoration:none; display:flex; align-items:center; justify-content:center;">🔗 Open</a>` : ''}
            </div>
        `;

        card.querySelector('.save-btn').addEventListener('click', function () {
            if (NexusDB.savePaper(paper)) {
                this.textContent = '⭐ Saved';
                this.classList.add('saved');
                showToast('Paper saved to library!');
            } else {
                showToast('Paper already in library.');
            }
        });

        card.querySelector('.summarize-btn').addEventListener('click', () => {
            if (!paper.abstract || paper.abstract.trim().toLowerCase() === 'no abstract available') {
                showToast('This paper has no abstract to summarize.');
                return;
            }
            switchView('summary-view');
            const summaryInputEl = document.getElementById('summary-input');
            summaryInputEl.value = paper.abstract;
            summaryInputEl.dataset.source = 'search';
            summaryInputEl.dispatchEvent(new Event('input'));
            hideValidationFeedback(document.getElementById('summary-validation-feedback'));
        });

        return card;
    }

    async function fetchFromSemanticScholar(query) {
        try {
            const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&limit=12&fields=title,authors,year,abstract,venue,url`;
            const response = await fetch(url);
            if (!response.ok) throw new Error('Semantic Scholar API error');
            const data = await response.json();
            return (data.data || []).map(p => ({
                title: p.title,
                authors: p.authors ? p.authors.map(a => a.name).join(', ') : 'Unknown Authors',
                year: p.year,
                abstract: p.abstract || 'No abstract available',
                source: p.venue || 'Semantic Scholar',
                url: p.url,
                tags: []
            }));
        } catch (error) {
            console.error('Semantic Scholar Fetch Error:', error);
            return [];
        }
    }

    async function fetchFromArxiv(query) {
        try {
            const url = `https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(query)}&max_results=8`;
            const response = await fetch(url);
            if (!response.ok) throw new Error('arXiv API error');
            const text = await response.text();
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(text, 'text/xml');
            const entries = xmlDoc.getElementsByTagName('entry');

            const results = [];
            for (let entry of entries) {
                const authors = Array.from(entry.getElementsByTagName('author'))
                    .map(a => a.getElementsByTagName('name')[0].textContent)
                    .join(', ');
                results.push({
                    title: entry.getElementsByTagName('title')[0].textContent.trim(),
                    authors,
                    year: new Date(entry.getElementsByTagName('published')[0].textContent).getFullYear(),
                    abstract: entry.getElementsByTagName('summary')[0].textContent.trim(),
                    source: 'arXiv',
                    url: entry.getElementsByTagName('id')[0].textContent,
                    tags: []
                });
            }
            return results;
        } catch (error) {
            console.error('arXiv Fetch Error:', error);
            return [];
        }
    }

    async function fetchFromOpenAlex(query) {
        try {
            const url = `https://api.openalex.org/works?search=${encodeURIComponent(query)}&per-page=12&sort=relevance_score:desc`;
            const response = await fetch(url);
            if (!response.ok) throw new Error('OpenAlex API error');
            const data = await response.json();

            return (data.results || []).map(item => {
                const authors = (item.authorships || [])
                    .map(a => a.author && a.author.display_name)
                    .filter(Boolean)
                    .slice(0, 8)
                    .join(', ');

                const abstract = item.abstract_inverted_index
                    ? Object.entries(item.abstract_inverted_index)
                        .flatMap(([word, positions]) => positions.map(pos => ({ word, pos })))
                        .sort((a, b) => a.pos - b.pos)
                        .map(x => x.word)
                        .join(' ')
                    : 'No abstract available';

                return {
                    title: item.title || 'Untitled',
                    authors: authors || 'Unknown Authors',
                    year: item.publication_year,
                    abstract,
                    source: item.primary_location && item.primary_location.source && item.primary_location.source.display_name
                        ? item.primary_location.source.display_name
                        : 'OpenAlex',
                    url: item.id ? item.id.replace('https://openalex.org/', 'https://openalex.org/') : '',
                    tags: []
                };
            });
        } catch (error) {
            console.error('OpenAlex Fetch Error:', error);
            return [];
        }
    }

    function dedupePapersByTitle(papers) {
        const seen = new Set();
        const deduped = [];
        papers.forEach(paper => {
            const key = normalizeText((paper.title || '').toLowerCase());
            if (!key || seen.has(key)) return;
            seen.add(key);
            deduped.push(paper);
        });
        return deduped;
    }

    function localSearch(query) {
        const queryWords = query.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 2 && !stopWords.has(w));
        if (queryWords.length === 0) return [];

        return paperDatabase
            .map(paper => {
                const searchable = `${paper.title} ${(paper.tags || []).join(' ')} ${paper.abstract}`.toLowerCase();
                let score = 0;
                queryWords.forEach(word => {
                    if (searchable.includes(word)) score += 2;
                });
                return { paper, score };
            })
            .filter(s => s.score >= Math.max(2, queryWords.length))
            .sort((a, b) => b.score - a.score)
            .map(s => s.paper);
    }

    searchBtn.addEventListener('click', async () => {
        const query = searchInput.value.trim();
        if (!query) return;

        recentSearchesBox.classList.remove('visible');
        searchResults.innerHTML = '';
        noResults.style.display = 'none';
        showLoader(searchLoader);

        try {
            if (searchDiagnostics) searchDiagnostics.style.display = 'none';

            const backendData = await searchViaBackend(query);
            hideLoader(searchLoader);
            const combinedResults = (backendData.papers || []).slice(0, 24);
            if (backendData.diagnostics) renderSearchDiagnosticsBlock(backendData.diagnostics);

            if (combinedResults.length === 0) {
                noResults.style.display = 'block';
                NexusDB.addSearch(query, 0);
                return;
            }

            NexusDB.addSearch(query, combinedResults.length);
            combinedResults.forEach(paper => searchResults.appendChild(renderPaperCard(paper, query)));
            return;
        } catch (backendError) {
            console.warn('Backend search unavailable, using direct APIs:', backendError.message);
        }

        try {
            const [ssResults, arxivResults, openAlexResults] = await Promise.all([
                fetchFromSemanticScholar(query),
                fetchFromArxiv(query),
                fetchFromOpenAlex(query)
            ]);

            let combinedResults = dedupePapersByTitle([...ssResults, ...arxivResults, ...openAlexResults]);
            if (combinedResults.length === 0) {
                combinedResults = localSearch(query);
            }

            hideLoader(searchLoader);

            if (combinedResults.length === 0) {
                noResults.style.display = 'block';
                NexusDB.addSearch(query, 0);
                return;
            }

            NexusDB.addSearch(query, combinedResults.length);
            combinedResults.slice(0, 24).forEach(paper => searchResults.appendChild(renderPaperCard(paper, query)));
        } catch (error) {
            console.error('Search Unified Error:', error);
            hideLoader(searchLoader);
            const localResults = localSearch(query);
            if (localResults.length > 0) {
                localResults.forEach(paper => searchResults.appendChild(renderPaperCard(paper, query)));
            } else {
                noResults.style.display = 'block';
            }
        }
    });

    // ============ MODEL: PLAGIARISM + AI WRITING DETECTOR ============
    const PlagiarismModel = {
        cosineSimilarity(textA, textB) {
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
        },

        jaccardSimilarity(textA, textB) {
            const setA = new Set(splitWords(textA).filter(w => w.length > 2));
            const setB = new Set(splitWords(textB).filter(w => w.length > 2));
            if (setA.size === 0 || setB.size === 0) return 0;
            let intersection = 0;
            setA.forEach(w => { if (setB.has(w)) intersection += 1; });
            const union = setA.size + setB.size - intersection;
            return union > 0 ? intersection / union : 0;
        },

        overlapModel(text, dbPapers) {
            const inputWords = splitWords(text).filter(w => w.length > 2);
            const inputNgrams = new Set();
            for (let i = 0; i < inputWords.length - 2; i++) {
                inputNgrams.add(`${inputWords[i]} ${inputWords[i + 1]} ${inputWords[i + 2]}`);
            }

            const sourceMatches = [];
            let totalMatchedNgrams = 0;

            dbPapers.forEach(paper => {
                const absWords = splitWords(paper.abstract || '').filter(w => w.length > 2);
                const absNgrams = new Set();
                for (let i = 0; i < absWords.length - 2; i++) {
                    absNgrams.add(`${absWords[i]} ${absWords[i + 1]} ${absWords[i + 2]}`);
                }

                let matches = 0;
                inputNgrams.forEach(ng => { if (absNgrams.has(ng)) matches += 1; });
                const ngramScore = inputNgrams.size > 0 ? (matches / inputNgrams.size) : 0;
                const cosine = this.cosineSimilarity(text, paper.abstract || '');
                const jaccard = this.jaccardSimilarity(text, paper.abstract || '');
                const hybridScore = (ngramScore * 0.55) + (cosine * 0.3) + (jaccard * 0.15);

                if ((matches > 0 && inputNgrams.size > 0) || hybridScore > 0.1) {
                    sourceMatches.push({
                        title: paper.title,
                        source: paper.source,
                        percent: Math.round(hybridScore * 100)
                    });
                    totalMatchedNgrams += hybridScore;
                }
            });

            sourceMatches.sort((a, b) => b.percent - a.percent);
            const rawPlag = Math.round(Math.min(1, totalMatchedNgrams / Math.max(1, dbPapers.length * 0.2)) * 100);
            return {
                plagPercent: Math.min(95, rawPlag),
                originalPercent: 100 - Math.min(95, rawPlag),
                topSources: sourceMatches.slice(0, 5)
            };
        },

        aiPatternModel(text) {
            const sentences = splitSentences(text).filter(s => s.length > 10);
            let score = 0;
            const flags = [];
            const textLow = text.toLowerCase();

            if (sentences.length >= 3) {
                const lengths = sentences.map(s => s.split(/\s+/).length);
                const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;
                const variance = lengths.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / lengths.length;
                const cv = Math.sqrt(variance) / Math.max(avg, 1);
                if (cv < 0.24) { score += 22; flags.push('Very uniform sentence lengths'); }
                else if (cv < 0.34) { score += 12; flags.push('Moderately uniform sentence structure'); }
            }

            const transitions = [
                'furthermore', 'moreover', 'additionally', 'consequently', 'nevertheless',
                'in addition', 'as a result', 'in contrast', 'this study', 'this paper', 'we examine'
            ];
            let transCount = 0;
            transitions.forEach(t => { if (textLow.includes(t)) transCount += 1; });
            const transDensity = transCount / Math.max(sentences.length, 1);
            if (transDensity > 0.5) { score += 20; flags.push(`High transition phrase density (${transCount})`); }
            else if (transDensity > 0.25) { score += 10; flags.push(`Moderate transition phrase density (${transCount})`); }

            const passivePatterns = /\b(is|are|was|were|been|being)\s+(achieved|demonstrated|shown|found|observed|obtained|reported|considered|examined|assessed|evaluated|applied|implemented|proposed|presented|introduced|designed|developed|conducted|analyzed|investigated|established)\b/gi;
            const passiveMatches = (text.match(passivePatterns) || []).length;
            if (passiveMatches >= 3) { score += 14; flags.push(`Heavy passive voice (${passiveMatches})`); }
            else if (passiveMatches >= 1) { score += 7; flags.push('Some passive voice usage'); }

            const buzzwords = ['comprehensive', 'scalable', 'innovative', 'robust', 'framework', 'paradigm', 'optimization', 'holistic'];
            let buzzCount = 0;
            buzzwords.forEach(b => { if (textLow.includes(b)) buzzCount += 1; });
            if (buzzCount >= 4) { score += 18; flags.push(`High buzzword density (${buzzCount})`); }
            else if (buzzCount >= 2) { score += 9; flags.push('Moderate buzzword usage'); }

            const numbers = text.match(/\d+(\.\d+)?(%| percent| million| billion)?/g) || [];
            if (numbers.length === 0 && text.length > 220) {
                score += 10;
                flags.push('No specific numeric evidence found');
            }

            return {
                aiScore: Math.min(95, score),
                aiFlags: flags
            };
        }
    };

    // ============ MODEL: SUMMARIZER ============
    const SummarizerModel = {
        generate(text) {
            const sentences = splitSentences(text).filter(s => s.length > 30);
            if (sentences.length === 0) return null;

            if (sentences.length === 1) {
                const oneSentence = sentences[0];
                const keyTerms = splitWords(oneSentence)
                    .filter(w => w.length > 5 && !stopWords.has(w))
                    .slice(0, 6)
                    .map(w => w.charAt(0).toUpperCase() + w.slice(1));

                return `
                    <div class="summary-content-wrapper">
                        <div class="summary-section"><strong>Main Objective and Focus:</strong><p>${escapeHtml(oneSentence)}</p></div>
                        <div class="summary-section"><strong>Quick Insight:</strong><p>This abstract is brief, so a concise summary is shown directly from the available sentence.</p></div>
                        ${keyTerms.length > 0 ? `<div class="summary-tag-cloud"><strong>Core Topics:</strong> ${keyTerms.map(k => `<span class="s-tag">${escapeHtml(k)}</span>`).join('')}</div>` : ''}
                    </div>
                `;
            }

            const freq = {};
            splitWords(text).forEach(w => {
                if (w.length > 5 && !stopWords.has(w)) {
                    freq[w] = (freq[w] || 0) + 1;
                }
            });

            const topKeywords = Object.entries(freq)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 8)
                .map(([w]) => w);

            const scored = sentences.map((sentence, i) => {
                const low = sentence.toLowerCase();
                let score = 0;

                topKeywords.forEach(kw => { if (low.includes(kw)) score += 2.2; });
                if (i === 0) score += 4.5;
                if (i === sentences.length - 1) score += 3.8;

                const markers = ['result', 'finding', 'conclude', 'demonstrate', 'show', 'suggest', 'study', 'research'];
                markers.forEach(m => { if (low.includes(m)) score += 1.9; });

                const wc = sentence.split(/\s+/).length;
                if (wc < 8) score -= 4;
                if (wc > 45) score -= 2;

                return { sentence, score };
            });

            scored.sort((a, b) => b.score - a.score);
            const topCount = Math.min(6, Math.max(3, Math.ceil(sentences.length * 0.4)));
            const selected = scored.slice(0, topCount).map(item => item.sentence);
            const finalSentences = sentences.filter(s => selected.includes(s));

            let html = '<div class="summary-content-wrapper">';
            html += `<div class="summary-section"><strong>Main Objective and Focus:</strong><p>${escapeHtml(finalSentences[0])}</p></div>`;

            if (finalSentences.length > 1) {
                html += '<div class="summary-section"><strong>Key Highlights:</strong><ul class="summary-list">';
                finalSentences.slice(1).forEach(s => {
                    html += `<li>${escapeHtml(s)}</li>`;
                });
                html += '</ul></div>';
            }

            if (topKeywords.length > 0) {
                html += `<div class="summary-tag-cloud"><strong>Core Topics:</strong> ${topKeywords.map(k => `<span class="s-tag">${escapeHtml(k.charAt(0).toUpperCase() + k.slice(1))}</span>`).join('')}</div>`;
            }

            html += '</div>';
            return html;
        }
    };

    // ============ PLAGIARISM CONTROLS ============
    const plagInput = document.getElementById('plagiarism-input');
    const plagBtn = document.getElementById('check-plag-btn');
    const plagLoader = document.getElementById('plag-loader');
    const plagResult = document.getElementById('plag-result');
    const plagCharCount = document.getElementById('plag-char-count');
    const plagPdfInput = document.getElementById('plag-pdf-input');
    const plagPdfStatus = document.getElementById('plag-pdf-status');
    const plagDropZone = document.getElementById('plag-drop-zone');
    const plagValidationFeedback = document.getElementById('plag-validation-feedback');
    const exportPlagBtn = document.getElementById('export-plag-report');

    let latestPlagiarismReportText = '';
    let latestPlagiarismSummary = null;

    async function analyzePlagiarismViaBackend(text) {
        const topic = searchInput && searchInput.value.trim() ? searchInput.value.trim() : text.split(/\s+/).slice(0, 4).join(' ');
        const response = await fetch(`${API_BASE}/api/plagiarism/analyze`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, topic })
        });
        if (!response.ok) throw new Error(`Backend plagiarism failed with ${response.status}`);
        return await response.json();
    }

    plagInput.addEventListener('input', () => {
        plagCharCount.textContent = `${plagInput.value.length} characters`;
        hideValidationFeedback(plagValidationFeedback);
    });

    plagInput.addEventListener('keydown', () => {
        plagInput.dataset.source = 'manual';
    });

    plagPdfInput.addEventListener('change', () => {
        handlePdfUpload(plagPdfInput, plagInput, plagPdfStatus, 'PDF loaded into plagiarism checker.', 'pdf');
    });

    setupDropZone(plagDropZone, plagPdfInput, plagInput, plagPdfStatus, 'PDF loaded into plagiarism checker.');

    plagBtn.addEventListener('click', () => {
        const text = normalizeText(plagInput.value);
        const source = plagInput.dataset.source || 'manual';
        const validation = TextQualityModel.validateMeaningfulText(text, { mode: 'plagiarism', source });

        if (!validation.isMeaningful) {
            showToast(validation.message);
            renderValidationFeedback(plagValidationFeedback, validation);
            return;
        }

        hideValidationFeedback(plagValidationFeedback);
        exportPlagBtn.disabled = true;

        hideBlock(plagResult);
        showLoader(plagLoader);

        setTimeout(() => {
            hideLoader(plagLoader);

            Promise.resolve()
                .then(async () => {
                    let overlap;
                    let sentenceLinks = [];
                    try {
                        const backendResult = await analyzePlagiarismViaBackend(text);
                        overlap = {
                            plagPercent: backendResult.plagPercent,
                            originalPercent: backendResult.originalPercent,
                            topSources: backendResult.topSources || []
                        };
                        sentenceLinks = backendResult.sentenceLinks || [];
                    } catch (backendErr) {
                        console.warn('Backend plagiarism unavailable, using local model:', backendErr.message);
                        overlap = PlagiarismModel.overlapModel(text, paperDatabase);
                    }

                    const aiAnalysis = PlagiarismModel.aiPatternModel(text);

                    let aiColor = '#2d9f75';
                    if (aiAnalysis.aiScore > 30) aiColor = '#b67e1f';
                    if (aiAnalysis.aiScore > 55) aiColor = '#c64646';

                    let dbColor = '#2d9f75';
                    if (overlap.plagPercent > 20) dbColor = '#b67e1f';
                    if (overlap.plagPercent > 40) dbColor = '#c64646';

                    const sourceHTML = overlap.topSources.length > 0
                        ? `<div class="source-list"><h4>Matched Papers</h4><ul>${overlap.topSources.map(s => `<li><strong>${escapeHtml(s.title)}</strong> - ${s.percent}% overlap</li>`).join('')}</ul></div>`
                        : `<div class="source-list"><h4>Database Check</h4><p style="font-size:0.85rem;color:#6a737d;">No significant text overlap found in currently indexed sources.</p></div>`;

                    const sentenceLinkHTML = sentenceLinks.length > 0
                        ? `<div class="source-list" style="margin-bottom:1rem;"><h4>Sentence-Level Source Linking</h4><ul>${sentenceLinks.slice(0, 6).map(link => `<li><strong>${escapeHtml(link.sentence.slice(0, 110))}${link.sentence.length > 110 ? '...' : ''}</strong><br>↳ ${escapeHtml(link.sourceTitle)} (${escapeHtml(link.source)}) • Confidence: ${link.confidence}% [${link.confidenceLow}-${link.confidenceHigh}]</li>`).join('')}</ul></div>`
                        : '';

                    plagResult.innerHTML = `
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:1.5rem; text-align:center; margin-bottom:1.5rem;">
                    <div>
                        <div class="score-ring" style="border-color:${aiColor}; color:${aiColor}">${aiAnalysis.aiScore}%</div>
                        <div class="result-label">AI Writing Probability</div>
                        <p style="color:#6a737d; font-size:0.8rem; margin-top:0.3rem;">
                            ${aiAnalysis.aiScore > 55 ? 'Strong AI-like patterns detected' : aiAnalysis.aiScore > 30 ? 'Some AI-like patterns detected' : 'Looks naturally human-written'}
                        </p>
                    </div>
                    <div>
                        <div class="score-ring" style="border-color:${dbColor}; color:${dbColor}">${overlap.plagPercent}%</div>
                        <div class="result-label">Database Match</div>
                        <p style="color:#6a737d; font-size:0.8rem; margin-top:0.3rem;">
                            ${overlap.plagPercent > 20 ? 'Text overlaps with local paper database' : `No major overlap in ${paperDatabase.length} local papers`}
                        </p>
                    </div>
                </div>

                <div class="source-list" style="margin-bottom:1rem;">
                    <h4>Trust Note</h4>
                    <ul>
                        <li>Backend index uses Crossref and OpenAlex metadata/abstract pipelines, with sentence-level matching confidence intervals.</li>
                        <li>This remains a strong screening signal, not final legal proof of plagiarism.</li>
                    </ul>
                </div>

                ${sentenceLinkHTML}

                ${aiAnalysis.aiFlags.length > 0 ? `
                <div class="source-list" style="margin-bottom:1rem;">
                    <h4>Why The AI Score Increased</h4>
                    <ul>${aiAnalysis.aiFlags.map(f => `<li>${escapeHtml(f)}</li>`).join('')}</ul>
                </div>` : ''}

                <div style="margin-bottom:1rem;">
                    <small style="color:#6a737d">AI Pattern Confidence</small>
                    <div class="plag-bar"><div class="plag-bar-fill" style="width:${aiAnalysis.aiScore}%; background:${aiColor}"></div></div>
                </div>
                <div style="margin-bottom:1rem;">
                    <small style="color:#6a737d">Database Similarity</small>
                    <div class="plag-bar"><div class="plag-bar-fill" style="width:${overlap.plagPercent}%; background:${dbColor}"></div></div>
                </div>

                ${sourceHTML}
            `;

                    showBlock(plagResult);
                    NexusDB.addPlagReport(text, overlap.originalPercent, overlap.plagPercent, overlap.topSources.map(s => ({ url: s.title, match: s.percent })));

                    latestPlagiarismReportText = text;
                    latestPlagiarismSummary = {
                        aiScore: aiAnalysis.aiScore,
                        plagPercent: overlap.plagPercent,
                        originalPercent: overlap.originalPercent,
                        topSources: overlap.topSources,
                        aiFlags: aiAnalysis.aiFlags
                    };
                    exportPlagBtn.disabled = false;
                    showToast('Plagiarism and AI analysis complete.');
                })
                .catch(err => {
                    console.error('Plagiarism flow error:', err);
                    showToast('Could not complete plagiarism analysis.');
                });
        }, 1200);
    });

    exportPlagBtn.addEventListener('click', () => {
        if (!latestPlagiarismSummary || !latestPlagiarismReportText) return;

        const lines = [
            'ResearchHub - Plagiarism and AI Report',
            `Generated: ${new Date().toLocaleString()}`,
            '',
            `AI Writing Probability: ${latestPlagiarismSummary.aiScore}%`,
            `Database Match: ${latestPlagiarismSummary.plagPercent}%`,
            `Estimated Originality: ${latestPlagiarismSummary.originalPercent}%`,
            '',
            'AI Pattern Notes:'
        ];

        if (latestPlagiarismSummary.aiFlags.length === 0) {
            lines.push('- No strong AI-like patterns detected.');
        } else {
            latestPlagiarismSummary.aiFlags.forEach(flag => lines.push(`- ${flag}`));
        }

        lines.push('', 'Top Matched Sources:');
        if (latestPlagiarismSummary.topSources.length === 0) {
            lines.push('- No major overlaps found in local database.');
        } else {
            latestPlagiarismSummary.topSources.forEach(src => {
                lines.push(`- ${src.title} (${src.percent}% overlap)`);
            });
        }

        lines.push('', 'Input Preview:', latestPlagiarismReportText.slice(0, 2000));

        const fileName = `plagiarism-report-${new Date().toISOString().slice(0, 10)}.txt`;
        downloadTextFile(fileName, lines.join('\n'));
        showToast('Plagiarism report exported.');
    });

    // ============ SUMMARIZER CONTROLS ============
    const sumInput = document.getElementById('summary-input');
    const sumBtn = document.getElementById('summarize-btn');
    const sumLoader = document.getElementById('summary-loader');
    const sumContent = document.getElementById('summary-content');
    const summaryPdfInput = document.getElementById('summary-pdf-input');
    const summaryPdfStatus = document.getElementById('summary-pdf-status');
    const summaryDropZone = document.getElementById('summary-drop-zone');
    const summaryValidationFeedback = document.getElementById('summary-validation-feedback');
    const exportSummaryBtn = document.getElementById('export-summary-report');

    let latestSummarySourceText = '';
    let latestSummaryText = '';

    sumInput.addEventListener('input', () => {
        hideValidationFeedback(summaryValidationFeedback);
    });

    sumInput.addEventListener('keydown', () => {
        sumInput.dataset.source = 'manual';
    });

    summaryPdfInput.addEventListener('change', () => {
        handlePdfUpload(summaryPdfInput, sumInput, summaryPdfStatus, 'PDF loaded into summarizer.', 'pdf');
    });

    setupDropZone(summaryDropZone, summaryPdfInput, sumInput, summaryPdfStatus, 'PDF loaded into summarizer.');

    sumBtn.addEventListener('click', () => {
        const text = normalizeText(sumInput.value);
        const source = sumInput.dataset.source || 'manual';
        const validation = TextQualityModel.validateMeaningfulText(text, { mode: 'summary', source });

        if (!validation.isMeaningful) {
            showToast(validation.message);
            renderValidationFeedback(summaryValidationFeedback, validation);
            return;
        }

        hideValidationFeedback(summaryValidationFeedback);
        exportSummaryBtn.disabled = true;

        sumContent.innerHTML = '';
        showLoader(sumLoader);

        setTimeout(() => {
            hideLoader(sumLoader);
            const summaryHtml = SummarizerModel.generate(text);

            if (!summaryHtml) {
                showToast("It doesn't make any sense. Please enter some meaningful text.");
                return;
            }

            sumContent.innerHTML = summaryHtml;
            NexusDB.addSummary(text, summaryHtml);
            latestSummarySourceText = text;
            latestSummaryText = sumContent.textContent.replace(/\s+/g, ' ').trim();
            exportSummaryBtn.disabled = false;
            showToast('Summary generated successfully.');
        }, 1000);
    });

    exportSummaryBtn.addEventListener('click', () => {
        if (!latestSummaryText) return;
        const topicHint = sanitizeFileNamePart(splitWords(latestSummarySourceText).slice(0, 6).join('-'));
        const fileName = `summary-${topicHint || 'report'}-${new Date().toISOString().slice(0, 10)}.txt`;
        const payload = [
            'ResearchHub - Summary Report',
            `Generated: ${new Date().toLocaleString()}`,
            '',
            'Summary:',
            latestSummaryText,
            '',
            'Source Preview:',
            latestSummarySourceText.slice(0, 2500)
        ].join('\n');

        downloadTextFile(fileName, payload);
        showToast('Summary exported.');
    });

    // ============ LIBRARY ============
    const libTabs = document.querySelectorAll('.tab');
    const libContent = document.getElementById('library-content');
    let activeLibTab = 'saved';

    libTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            libTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            activeLibTab = tab.getAttribute('data-lib');
            renderLibrary();
        });
    });

    function renderLibrary() {
        let items = [];
        let emptyMsg = '';

        switch (activeLibTab) {
            case 'saved':
                items = NexusDB.getSavedPapers();
                emptyMsg = 'No saved papers yet. Use the Save button on search results.';
                libContent.innerHTML = items.length === 0
                    ? `<div class="empty-msg"><p>⭐ ${emptyMsg}</p></div>`
                    : items.map(p => `
                        <div class="lib-item">
                            <div class="lib-item-info">
                                <div class="lib-item-title">${escapeHtml(p.title)}</div>
                                <div class="lib-item-meta">${escapeHtml(p.authors || '')} • ${p.year || 'N/A'} • Saved: ${escapeHtml(p.savedAt || '')}</div>
                            </div>
                            <button class="del-btn" data-category="savedPapers" data-id="${p.id}">🗑️</button>
                        </div>
                    `).join('');
                break;

            case 'searches':
                items = NexusDB.getSearchHistory();
                emptyMsg = 'No search history yet.';
                libContent.innerHTML = items.length === 0
                    ? `<div class="empty-msg"><p>🔍 ${emptyMsg}</p></div>`
                    : items.map(s => `
                        <div class="lib-item">
                            <div class="lib-item-info">
                                <div class="lib-item-title">"${escapeHtml(s.query)}"</div>
                                <div class="lib-item-meta">${s.resultCount} results • ${escapeHtml(s.timestamp)}</div>
                            </div>
                            <button class="del-btn" data-category="searchHistory" data-id="${s.id}">🗑️</button>
                        </div>
                    `).join('');
                break;

            case 'reports':
                items = NexusDB.getPlagReports();
                emptyMsg = 'No plagiarism reports yet.';
                libContent.innerHTML = items.length === 0
                    ? `<div class="empty-msg"><p>🛡️ ${emptyMsg}</p></div>`
                    : items.map(r => `
                        <div class="lib-item">
                            <div class="lib-item-info">
                                <div class="lib-item-title">${r.originalPercent}% Original / ${r.plagPercent}% Matched</div>
                                <div class="lib-item-meta">${escapeHtml(r.timestamp)}</div>
                                <div class="lib-item-preview">${escapeHtml(r.textPreview)}</div>
                            </div>
                            <button class="del-btn" data-category="plagReports" data-id="${r.id}">🗑️</button>
                        </div>
                    `).join('');
                break;

            case 'summaries':
                items = NexusDB.getSummaries();
                emptyMsg = 'No summaries yet.';
                libContent.innerHTML = items.length === 0
                    ? `<div class="empty-msg"><p>📝 ${emptyMsg}</p></div>`
                    : items.map(s => `
                        <div class="lib-item">
                            <div class="lib-item-info">
                                <div class="lib-item-title">Summary</div>
                                <div class="lib-item-meta">${escapeHtml(s.timestamp)}</div>
                                <div class="lib-item-preview">${escapeHtml(s.sourcePreview)}</div>
                            </div>
                            <button class="del-btn" data-category="summaries" data-id="${s.id}">🗑️</button>
                        </div>
                    `).join('');
                break;
        }

        libContent.querySelectorAll('.del-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                NexusDB.deleteItem(btn.dataset.category, btn.dataset.id);
                renderLibrary();
                showToast('Item removed.');
            });
        });
    }

    document.getElementById('clear-library-btn').addEventListener('click', () => {
        if (confirm('Are you sure you want to clear all saved data? This cannot be undone.')) {
            NexusDB.clearAll();
            renderLibrary();
            showToast('All data cleared.');
        }
    });

    fetchBackendHealth();
});