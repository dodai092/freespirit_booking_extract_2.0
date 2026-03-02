# Reviews Extract — Codebase Analysis

---

## 1. App Overview

**Reviews Extract** is a Chrome Extension (Manifest V3) used by the **Free Spirit** tour company to scrape customer reviews from six platforms — **Airbnb, Freetour.com, GetYourGuide, Google Maps, Guruwalk, and Viator** — and copy them as **tab-separated values (TSV)** ready to paste into Google Sheets or Excel.

### Target Use Case

A tour company employee opens a review page on one of the supported platforms, clicks the extension popup, selects the platform, and the extension injects a content script that:

1. Optionally expands "Show more" / truncated review buttons.
2. Scrapes each review card for: **Date, Time, Guide, Rating, Tour name, City, Language, Platform, Review text**.
3. Matches guide names from review text against a hard-coded registry (with alias/misspelling support).
4. Copies the resulting TSV to the clipboard.

### How It Currently Works

```
popup.html  →  popup.js  →  chrome.scripting.executeScript()
                                 ├── scripts/common.js   (shared utilities on window.__re)
                                 └── scripts/<platform>.js  (scraping logic)
```

`popup.js` first injects `common.js` (which exposes `window.__re`), then injects the platform-specific script. The platform script reads the DOM, builds row objects, calls `window.__re.buildTSV()` and `window.__re.copyToClipboard()`.

---

## 2. Architecture Breakdown

### manifest.json
- Manifest V3 configuration.
- Permissions: `activeTab`, `scripting`, `clipboardWrite`.
- Defines the popup as the extension's action.
- **No** `default_icon` set — the extension has no icon in the toolbar.

### popup.html / popup.js
- **popup.html**: Clean, minimal UI with 6 platform buttons and a status line. All CSS is inlined in a `<style>` block.
- **popup.js**: Defines a `PLATFORMS` registry mapping button IDs to script filenames and domain patterns. On load, it auto-detects the current platform by matching the tab URL against domain patterns and highlights the matching button. Click handlers inject `common.js` then the platform script via `chrome.scripting.executeScript()`.

### scripts/common.js
- Shared utility library injected before every platform script.
- Exposes `window.__re` namespace with:
  - `extractGuideName(text)` — matches review text against a hard-coded `GUIDES` registry (13 guides with regex patterns and aliases).
  - `guessCity(text)` — returns a 2-letter city code from a `CITY_MAP` of 6 Croatian cities.
  - `formatDate(value)` — converts dates to `DD/Mon/YYYY` format.
  - `formatTime(value)` — converts to `HH:MM` 24-hour format.
  - `copyToClipboard(text)` — Async Clipboard API with `execCommand` fallback.
  - `buildTSV(rows)` — Constructs TSV string from row objects.

### scripts/airbnb.js
- Scrapes reviews from Airbnb experience pages.
- Has its own `mapTourName()` (3 hard-coded mappings) and `formatTime12()` (12-hr → 24-hr converter).
- Uses `prompt()` to confirm city abbreviation.
- Relies on **obfuscated CSS class names** (`.d1ylbvwr`, `.scbur3z`, `.cwk6og9`) that will break when Airbnb changes them.

### scripts/freetour.js
- Uses a heuristic `findBestContainer()` that scans **every** `div`, `ul`, and `section` on the page looking for the container with the most children containing the star colour `#fba749`.
- Has its own `parseDashDate()` to avoid timezone issues with `YYYY-MM-DD` dates.
- Parses review cards by splitting text on newlines and searching for specific patterns.

### scripts/getyourguide.js
- Clicks "Show details" expand buttons, waits 500ms, then scrapes.
- Uses `data-testid` selectors (more stable than class names).
- Has its own `formatGYGDate()` and `mapTourName()`.

### scripts/google.js
- Converts Google's relative dates ("2 weeks ago") to ISO strings.
- Clicks "More" buttons to expand truncated reviews, waits 1500ms.
- Hard-codes city as `"zg"` (Zagreb) — **broken for non-Zagreb listings**.
- Uses Google-specific class selectors (`.jftiEf`, `.wiI7pd`, `.rsqaWe`) that can change.

### scripts/guruwalk.js
- Most complex scraper. Finds review cards by filtering all `<div>` elements for text containing "Content visible only for gurus" and "Guided by".
- De-duplicates to keep only leaf-most matching nodes.
- Has its own `LANG_MAP` for language code formatting.
- Extracts guide from "Guided by …" line rather than review text.

### scripts/viator.js
- **Only async script** — uses `async/await` with a `wait()` helper.
- Expands "Show all" buttons with a 2-second wait.
- Hard-codes city as `"zg"` (Zagreb) — same issue as Google.
- Uses `class*=` attribute selectors which are more resilient than exact class names.

---

## 3. What Works Well

1. **Clean separation of concerns**: `common.js` centralizes shared logic (guide matching, city guessing, date formatting, clipboard, TSV building). Platform scripts only handle platform-specific DOM parsing.

2. **`window.__re` namespace pattern**: Avoids global pollution while making utilities accessible across injected scripts. The IIFE wrapping in each script is clean.

3. **Guide registry design**: The `GUIDES` array with regex patterns and aliases is well-thought-out. It handles common misspellings and ordering (e.g., "Ivana" before "Iva") is documented with comments.

4. **Auto-detect platform**: `popup.js` highlights the correct button based on the current tab URL — good UX touch.

5. **Clipboard fallback**: `copyToClipboard()` handles both modern Async Clipboard API and legacy `execCommand`, with proper error logging.

6. **TSV builder**: `buildTSV()` properly handles quoting cells with newlines or double-quotes, and the header row is auto-generated from a single `TSV_HEADERS` constant.

7. **Popup UI**: Minimal, clean design. Consistent styling. Status feedback ("Scraping…", "Done! Copied.", "Ready").

---

## 4. Bugs & Issues

### 4.1 Premature "Done! Copied." Status

**File:** `popup.js` — lines 37-39

```js
} else {
    statusDiv.innerText = 'Done! Copied.';
    setTimeout(() => (statusDiv.innerText = 'Ready'), 3000);
}
```

The status shows "Done! Copied." as soon as the script is *injected*, not when scraping actually finishes. Since scraping is asynchronous (some scripts use `setTimeout` internally, Viator uses `async/await`), this fires before the clipboard is populated. **The user sees "Done!" but the data may not be copied yet.**

### 4.2 Hard-coded City in Google & Viator

**File:** `google.js` — line 94: `City: "zg"`
**File:** `viator.js` — line 81: `City: "zg"`

Both scripts hard-code the city as Zagreb. If the user scrapes reviews from a Dubrovnik or Split listing, the city will be wrong. Unlike `airbnb.js` (which prompts the user) or `freetour.js` / `guruwalk.js` (which guess from the tour name), these two scripts have **no city detection at all**.

### 4.3 Fragile CSS Selectors (Airbnb, Google)

**File:** `airbnb.js` — lines 59, 68, 72: `.d1ylbvwr`, `.scbur3z`, `.cwk6og9`
**File:** `google.js` — lines 52, 59, 63, 72: `.jftiEf`, `.wiI7pd`, `.rsqaWe`, `.w8nwRe.kyuRq`

These are obfuscated/generated class names that **will break** whenever the platform updates their CSS build. There is no fallback or error reporting when selectors find zero matches.

### 4.4 Re-injection of `common.js` on Every Button Click

**File:** `popup.js` — lines 23-24

Every button click re-injects `common.js`, which re-runs the entire IIFE and overwrites `window.__re`. If the user clicks a button twice rapidly, both `common.js` and the platform script run twice, producing duplicate data and clipboard race conditions.

### 4.5 No User Feedback on Empty Results (Some Scripts)

- **`getyourguide.js`** — line 44: Logs `console.warn` but shows **no user-facing alert** when zero reviews are found.
- **`google.js`** — No check at all; silently copies an empty TSV.
- **`viator.js`** — No check at all; silently copies empty TSV.

Contrast with `airbnb.js` (line 29) and `freetour.js` (line 117) which correctly show `alert()`.

### 4.6 Fixed `setTimeout` Delays Are Unreliable

**File:** `getyourguide.js` — line 37: `setTimeout(scrapeData, 500)`
**File:** `google.js` — line 85: `setTimeout(() => { ... }, 1500)`

These fixed delays assume the DOM will update within 500ms or 1500ms. On slow connections or heavy pages, reviews may not be expanded yet when scraping begins. There is no retry or DOM mutation observer.

### 4.7 Rating Defaults to 5 When Missing

**File:** `airbnb.js` — line 69: `const rating = ratingContainer ? ... : 5;`
**File:** `viator.js` — line 54: `const rating = ... || 5;`

When the rating container isn't found, the code defaults to 5 stars instead of leaving it empty or flagging it. This **silently introduces incorrect data**.

### 4.8 `formatTime12` Bug — Hours Not Zero-Padded

**File:** `airbnb.js` — lines 14-21

```js
if (hours === "12") hours = "00";
if (modifier === "PM") hours = parseInt(hours, 10) + 12;
return `${hours}:${minutes}`;
```

- When input is `"12:30 PM"`, hours becomes `"00"`, then PM adds 12 → `12:30` ✓ but is a number, not a string.
- When input is `"1:00 PM"`, hours is `"1"`, PM → `13:00` ✓ but morning `"1:00 AM"` → `"1:00"` — **not zero-padded** (`"01:00"` expected).
- The function returns inconsistent types (string "00" vs number 13) concatenated into the template literal.

### 4.9 Freetour Date Parsing Bypasses `common.js`

**File:** `freetour.js` — lines 32-43: `parseDashDate()`

This function duplicates `MONTH_NAMES` from `common.js` and reimplements date formatting. The comment says it avoids timezone issues, but `common.js` `formatDate()` already handles the same format. If the output format ever changes, this function must be updated separately.

### 4.10 `findBestContainer()` Is Very Expensive

**File:** `freetour.js` — lines 13-29

This function queries **every** `div`, `ul`, and `section` on the entire page, then for each one, queries all children for a specific inline style. On a complex page, this could scan thousands of elements. There is no short-circuit or scoping.

### 4.11 Missing `default_icon` in manifest.json

**File:** `manifest.json`

There is no `default_icon` defined in the `action` field or at the top level. Chrome will show a generic puzzle-piece icon instead of the `logo.png` that exists in the project root.

---

## 5. Code Quality & Structure

### 5.1 Duplicated Tour Name Mappers

Every platform script has its own `mapTourName()` / `formatTour()` function:

| File | Function | Hard-coded Mappings |
|---|---|---|
| `airbnb.js` | `mapTourName()` | 3 mappings |
| `freetour.js` | `formatTour()` | 1 mapping |
| `getyourguide.js` | `mapTourName()` | 3 mappings |
| `guruwalk.js` | `mapTour()` | 1 mapping |
| `viator.js` | `mapTourName()` | 5 mappings |

Each maps different variations of the same tours (e.g., "communism" → "war", "free spirit" → "free"). Adding a new tour requires editing **every file**. This should be a centralized registry in `common.js`, similar to `GUIDES`.

### 5.2 Duplicated Date Formatters

| File | Function | Purpose |
|---|---|---|
| `common.js` | `formatDate()` | Generic date → `DD/Mon/YYYY` |
| `freetour.js` | `parseDashDate()` | `YYYY-MM-DD` → `DD/Mon/YYYY` |
| `getyourguide.js` | `formatGYGDate()` | `"January 1, 2025"` → `DD/Jan/2025` |
| `google.js` | `parseRelativeDate()` | `"2 weeks ago"` → ISO string |
| `airbnb.js` | `formatTime12()` | `"1:00 PM"` → `"13:00"` |

Each platform has its own date/time parsing quirks, but some could be consolidated into `common.js` with named strategies (e.g., `parseLongDate()`, `parseRelativeDate()`).

### 5.3 No Error Communication Back to Popup

When a scraping script fails silently (no alert, just console.error), the popup still shows "Done! Copied." because the injection succeeded even though the scraping didn't work. There is **no communication channel** between the injected content script and the popup. Options:

- Use `chrome.runtime.sendMessage()` to report results back.
- Return a value from `chrome.scripting.executeScript()` (MV3 supports this).

### 5.4 Inline CSS in popup.html

100 lines of CSS are embedded directly in `popup.html`. This works but makes it harder to maintain. Should be moved to a separate `popup.css` file.

### 5.5 No Consistent Logging

Some scripts use `console.log`, some use emoji prefixes (`🚀`, `✅`), some use `[RE]` prefix. There is no consistent logging convention.

---

## 6. Missing or Weak Functionality

### 6.1 No Progress Feedback During Long Scrapes

The popup shows "Scraping…" and then "Done!" — but some scrapers take several seconds (Viator waits 2s, Google waits 1.5s). There is no progress indicator, no count of reviews found, and no way to know if the scrape is still running.

### 6.2 No Pagination Handling

None of the scrapers handle pagination. They only scrape what is currently visible on the page. For platforms like GetYourGuide or Guruwalk, which paginate reviews, the user must manually navigate to each page and run the scraper multiple times, re-copying and pasting each batch.

### 6.3 No Duplicate Detection

If the user runs the scraper twice on the same page, the same reviews are copied again. There is no de-duplication mechanism — the TSV just gets pasted twice into the spreadsheet.

### 6.4 `Language` Field Almost Never Populated

Only `getyourguide.js` and `guruwalk.js` extract a language. The other four scripts always set `Language: ""`. There is no attempt to detect language from review text (e.g., using basic heuristics or the `lang` attribute on elements).

### 6.5 No Support for Non-Croatian Cities

The `CITY_MAP` only contains 6 Croatian cities. If the company expands to other countries, the entire city-guessing system breaks. Additionally, `google.js` and `viator.js` hard-code `"zg"` regardless.

### 6.6 No Icon Sizes for Chrome Toolbar

`manifest.json` has no `icons` field at all. Chrome recommends providing icons at 16, 32, 48, and 128px sizes. The extension currently shows no icon.

### 6.7 Review Count Not Shown After Scraping

`getyourguide.js`, `google.js`, and `viator.js` do not alert the user with the count of reviews scraped. The user has no idea how many reviews were captured until they paste the data.

### 6.8 No Freetour Month/Page Selection

The `freetour.js` scraper only scrapes reviews visible on the current page. There's no mechanism to select a specific month or navigate between review pages — the user must navigate to the correct review page manually before running the scraper.

---

## 7. Suggested Improvements

### 7.1 Centralize Tour Name Mapping in `common.js`

Create a `TOUR_MAP` registry in `common.js`:

```js
const TOUR_MAP = [
  { keywords: ["communism", "homeland war", "croatian homeland war"], shortName: "war" },
  { keywords: ["free spirit walking tour", "free spirit"], shortName: "free" },
  { keywords: ["zagreb food tour", "food"], shortName: "food" },
  { keywords: ["best zagreb", "zagreb must-sees", "guided city tour with wwii tunnels"], shortName: "best" },
  { keywords: ["big zagreb private"], shortName: "big" },
  { keywords: ["old zagreb private"], shortName: "old" },
];

function mapTourName(rawName) { ... }
```

Expose it on `window.__re.mapTourName()`. Delete all per-script copies.

### 7.2 Fix Status Reporting with Script Return Values

`chrome.scripting.executeScript()` in MV3 can capture the return value of the injected script. Modify the platform scripts to return a result object:

```js
// End of each platform script:
return { success: true, count: rows.length, platform: "Airbnb" };
```

Then in `popup.js`:

```js
chrome.scripting.executeScript(
  { target: { tabId }, files: [`scripts/${scriptFile}`] },
  (results) => {
    const result = results?.[0]?.result;
    if (result?.success) {
      statusDiv.innerText = `Done! ${result.count} reviews copied.`;
    } else {
      statusDiv.innerText = 'No reviews found.';
    }
  }
);
```

### 7.3 Replace Fixed `setTimeout` with MutationObserver

Instead of waiting a fixed 500ms or 1500ms after expanding reviews, use a `MutationObserver` to wait for the DOM to settle:

```js
function waitForDOMSettle(timeout = 3000) {
  return new Promise(resolve => {
    let timer;
    const observer = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => { observer.disconnect(); resolve(); }, 300);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    timer = setTimeout(() => { observer.disconnect(); resolve(); }, timeout);
  });
}
```

### 7.4 Add Guard Against Re-injection

In `common.js`, skip re-initialization if already loaded:

```js
if (window.__re) {
  console.log("[RE] common.js already loaded, skipping.");
  return;
}
```

### 7.5 Fix Hard-coded Cities

In `google.js` and `viator.js`, replace `City: "zg"` with:

```js
City: window.__re.guessCity(tourText) || window.__re.guessCity(document.title)
```

Or add a `prompt()` fallback like `airbnb.js` does when no city can be guessed.

### 7.6 Fix Rating Defaults

In `airbnb.js` line 69 and `viator.js` line 54, change the default from `5` to `""`:

```diff
- const rating = ratingContainer ? ratingContainer.querySelectorAll("svg").length : 5;
+ const rating = ratingContainer ? ratingContainer.querySelectorAll("svg").length : "";
```

### 7.7 Add `default_icon` to manifest.json

```json
{
  "action": {
    "default_popup": "popup.html",
    "default_title": "Reviews Extract",
    "default_icon": "logo.png"
  },
  "icons": {
    "48": "logo.png",
    "128": "logo.png"
  }
}
```

Ideally generate properly sized icon files (16, 32, 48, 128px).

### 7.8 Extract CSS from popup.html

Move the `<style>` block content to `popup.css` and link it:

```html
<link rel="stylesheet" href="popup.css">
```

### 7.9 Consistent Empty-Result Alerts

Ensure every platform script checks `rows.length === 0` and shows an alert, not just a console warning. Currently missing in: `getyourguide.js`, `google.js`, `viator.js`.

### 7.10 Consolidate Date Parsing in common.js

Move `parseDashDate()`, `formatGYGDate()`, `parseRelativeDate()`, and `formatTime12()` into `common.js` as named helpers:

```js
window.__re = {
  ...existing,
  parseDashDate,       // "2025-01-15" → "15/Jan/2025"
  parseLongDate,       // "January 15, 2025" → "15/Jan/2025"
  parseRelativeDate,   // "2 weeks ago" → ISO string
  formatTime12,        // "1:00 PM" → "13:00"
};
```

---

## 8. Recommended Next Steps (Prioritized)

### 🔴 Priority 1 — Fix Bugs (Data Integrity)

| # | Action | Files |
|---|--------|-------|
| 1 | Fix premature "Done! Copied." status — use script return values | `popup.js`, all platform scripts |
| 2 | Fix hard-coded `City: "zg"` — add `guessCity()` or `prompt()` | `google.js`, `viator.js` |
| 3 | Fix rating defaulting to 5 when missing | `airbnb.js:69`, `viator.js:54` |
| 4 | Fix `formatTime12()` zero-padding bug | `airbnb.js:14-21` |
| 5 | Add empty-result alerts to all scrapers | `getyourguide.js`, `google.js`, `viator.js` |

### 🟡 Priority 2 — Reduce Duplication & Improve Maintainability

| # | Action | Files |
|---|--------|-------|
| 6 | Centralize tour name mapping in `common.js` | `common.js`, all platform scripts |
| 7 | Move platform-specific date parsers to `common.js` | `common.js`, `freetour.js`, `getyourguide.js`, `google.js`, `airbnb.js` |
| 8 | Add re-injection guard to `common.js` | `common.js` |
| 9 | Extract inline CSS to `popup.css` | `popup.html` |

### 🟢 Priority 3 — Improve Robustness

| # | Action | Files |
|---|--------|-------|
| 10 | Replace fixed `setTimeout` with `MutationObserver` | `getyourguide.js`, `google.js` |
| 11 | Add fallback selectors for Airbnb/Google obfuscated classes | `airbnb.js`, `google.js` |
| 12 | Optimize `findBestContainer()` — scope the search, add early exit | `freetour.js` |

### 🔵 Priority 4 — Enhance Functionality

| # | Action | Files |
|---|--------|-------|
| 13 | Add `default_icon` and sized icons to manifest | `manifest.json` |
| 14 | Show review count in popup status after scraping | `popup.js`, all platform scripts |
| 15 | Add basic language detection for platforms that don't provide it | `common.js` |
| 16 | Consider pagination support for GYG / Guruwalk | `getyourguide.js`, `guruwalk.js` |
| 17 | Add simple duplicate detection (hash-based) | `common.js` |
