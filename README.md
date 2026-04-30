# ResearchHub

A simple, practical research-assistance project built for student use.

This app helps with 4 day-to-day tasks:
- searching research papers,
- checking text similarity,
- generating quick summaries,
- saving useful history in one place.

The goal is not to pretend this is a full enterprise product. It is a clean, working prototype that is easy to understand, demo, and improve.

---

## What This Project Does

### 1) Paper Search
- Searches live sources (Semantic Scholar, arXiv, OpenAlex, Crossref) through a backend API.
- Merges and de-duplicates results.
- Shows source diagnostics (which source responded, latency, result count, cache hit).
- Falls back gracefully if a source is slow/unavailable.

### 2) Plagiarism and AI-Writing Risk Check
- Uses backend indexing from OpenAlex/Crossref metadata + abstract text where available.
- Performs sentence-level matching and links each matched sentence to likely source.
- Includes confidence ranges for sentence-level matches.
- Also runs local writing-pattern checks for AI-like text style.

### 3) Summarizer
- Accepts typed/pasted text or PDF text extraction.
- Rejects meaningless repetitive input with clear feedback.
- Generates compact, readable summary blocks (objective, highlights, keywords).

### 4) Personal Library
- Saves papers, searches, summaries, and plagiarism reports in browser localStorage.
- Simple tabs to review and delete old items.

---

## Tech Stack

### Frontend
- HTML
- CSS
- Vanilla JavaScript
- pdf.js (for PDF text extraction)

### Backend
- Node.js
- Express
- CORS
- fast-xml-parser (for arXiv XML)

---

## Project Structure

- `index.html` - UI layout
- `styles.css` - styling
- `app.js` - frontend logic
- `db.js` - localStorage layer
- `server.js` - backend APIs (search, plagiarism index/analyze, health)
- `package.json` - backend dependencies and scripts

---

## How to Run

### 1) Install dependencies
Open terminal in project folder and run:

```bash
npm install
```

### 2) Start backend

```bash
npm start
```

Expected backend URL:
- `http://localhost:3000`

### 3) Open app
Use browser and open:
- `http://localhost:3000`

Tip: Avoid opening `index.html` directly as `file://...` when testing backend features.

---

## API Endpoints (Backend)

- `GET /api/search?q=your_topic`
  - Multi-source search + diagnostics.

- `GET /api/health`
  - Source health stats + cache stats + index status.

- `POST /api/plagiarism/index`
  - Builds plagiarism index for a topic.
  - JSON body example:
  ```json
  { "topic": "machine learning" }
  ```

- `POST /api/plagiarism/analyze`
  - Sentence-level plagiarism analysis with confidence intervals.
  - JSON body example:
  ```json
  {
    "text": "Your input text...",
    "topic": "machine learning"
  }
  ```

---

## Honest Notes (Important)

- This project is a strong academic prototype, not a legal-grade plagiarism judge.
- Similarity scores are best treated as screening signals.
- Final plagiarism decisions should still include manual review.
- External API availability can affect live results.

---

## Future Improvements

- Persist backend cache/index to disk so it survives restarts.
- Add background re-index scheduler for popular topics.
- Add user authentication and cloud sync for library history.
- Add citation generator (APA/MLA/IEEE).

---

## Why This README Is Written This Way

This project is built for real student demos and viva discussions. So the README is intentionally direct and honest: clear features, clear limitations, clear run steps.
