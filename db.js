/* ============================================
   NexusAI - LocalStorage Database Layer (db.js)
   ============================================
   This module manages all persistent data using
   the browser's localStorage API.
   ============================================ */

const NexusDB = (() => {
    const KEYS = {
        savedPapers: 'nexus_saved_papers',
        searchHistory: 'nexus_search_history',
        plagReports: 'nexus_plag_reports',
        summaries: 'nexus_summaries',
    };

    function _get(key) {
        try {
            const data = localStorage.getItem(key);
            return data ? JSON.parse(data) : [];
        } catch (e) {
            return [];
        }
    }

    function _set(key, data) {
        try {
            localStorage.setItem(key, JSON.stringify(data));
        } catch (e) {
            console.warn('NexusDB: Storage quota exceeded or unavailable.');
        }
    }

    function _generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    }

    function _timestamp() {
        return new Date().toLocaleString();
    }

    // ---- Saved Papers ----
    function savePaper(paper) {
        const papers = _get(KEYS.savedPapers);
        // Avoid duplicates by title
        if (papers.some(p => p.title === paper.title)) return false;
        papers.unshift({ ...paper, id: _generateId(), savedAt: _timestamp() });
        _set(KEYS.savedPapers, papers);
        return true;
    }

    function getSavedPapers() { return _get(KEYS.savedPapers); }

    function removeSavedPaper(id) {
        const papers = _get(KEYS.savedPapers).filter(p => p.id !== id);
        _set(KEYS.savedPapers, papers);
    }

    function isPaperSaved(title) {
        return _get(KEYS.savedPapers).some(p => p.title === title);
    }

    // ---- Search History ----
    function addSearch(query, resultCount) {
        const history = _get(KEYS.searchHistory);
        history.unshift({ id: _generateId(), query, resultCount, timestamp: _timestamp() });
        if (history.length > 50) history.pop();
        _set(KEYS.searchHistory, history);
    }

    function getSearchHistory() { return _get(KEYS.searchHistory); }

    // ---- Plagiarism Reports ----
    function addPlagReport(textPreview, originalPercent, plagPercent, sources) {
        const reports = _get(KEYS.plagReports);
        reports.unshift({
            id: _generateId(),
            textPreview: textPreview.substring(0, 150) + '...',
            originalPercent,
            plagPercent,
            sources,
            timestamp: _timestamp()
        });
        if (reports.length > 30) reports.pop();
        _set(KEYS.plagReports, reports);
    }

    function getPlagReports() { return _get(KEYS.plagReports); }

    // ---- Summaries ----
    function addSummary(sourcePreview, summaryHtml) {
        const summaries = _get(KEYS.summaries);
        summaries.unshift({
            id: _generateId(),
            sourcePreview: sourcePreview.substring(0, 150) + '...',
            summaryHtml,
            timestamp: _timestamp()
        });
        if (summaries.length > 30) summaries.pop();
        _set(KEYS.summaries, summaries);
    }

    function getSummaries() { return _get(KEYS.summaries); }

    // ---- Delete single & clear all ----
    function deleteItem(category, id) {
        const key = KEYS[category];
        if (!key) return;
        const data = _get(key).filter(item => item.id !== id);
        _set(key, data);
    }

    function clearAll() {
        Object.values(KEYS).forEach(k => localStorage.removeItem(k));
    }

    function clearSearchHistory() {
        _set(KEYS.searchHistory, []);
    }

    return {
        savePaper, getSavedPapers, removeSavedPaper, isPaperSaved,
        addSearch, getSearchHistory, clearSearchHistory,
        addPlagReport, getPlagReports,
        addSummary, getSummaries,
        deleteItem, clearAll
    };
})();
