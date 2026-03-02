(async function () {
    window.__re.log("Freetour Scraper Started…");

    const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

    // ─── Auto-detect best review container ─────────────────────────────────────
    function findBestContainer() {
        const knownContainer = document.querySelector('[data-reviews], .sc-eCImPb');
        if (knownContainer) return knownContainer;

        const allDivs = document.querySelectorAll("div, ul, section");
        let bestContainer = null;
        let maxScore = 0;

        for (const div of allDivs) {
            if (div.children.length < 3) continue;
            let score = 0;
            for (const child of div.children) {
                if (child.querySelector('[style*="fba749"]')) score++;
            }
            if (score >= 5) return div; 
            if (score > maxScore) { maxScore = score; bestContainer = div; }
        }

        return bestContainer || document.body;
    }

    // ─── 1. Calculate Target Dates (Month Picker Integration) ───────────────────
    let targetMonth, targetYear;

    if (typeof window.__targetMonth !== 'undefined' && typeof window.__targetYear !== 'undefined') {
        targetMonth = window.__targetMonth;
        targetYear = window.__targetYear;
        window.__re.log(`Using target date from popup UI: Month ${targetMonth}, Year ${targetYear}`);
    } else {
        const now = new Date();
        targetMonth = now.getMonth() - 1;
        targetYear = now.getFullYear();
        if (targetMonth < 0) {
            targetMonth = 11; // December
            targetYear--;
        }
    }
    
    // The cutoff date is the 1st of the target month.
    const cutoffDate = new Date(targetYear, targetMonth, 1); 

    // ─── State ────────────────────────────────────────────────────────────────
    const allRows = [];
    let hasMorePages = true;

    // ─── 2. Main Pagination Loop ────────────────────────────────────────────────
    while (hasMorePages) {
        const container = findBestContainer();
        const cards = Array.from(container.children);
        
        let oldestDateOnPage = new Date(); 
        let pageExtractedCount = 0;

        cards.forEach(card => {
            const text = card.innerText.trim();
            if (!text) return;
            if (text.startsWith("«") || text.startsWith("»") || text.length < 10) return;

            let rating = "";
            const starSpan = card.querySelector('[style*="fba749"]');
            if (starSpan) {
                rating = starSpan.innerText.length;
                if (rating === 0 && starSpan.children.length > 0) rating = starSpan.children.length;
            }

            const lines = text.split("\n").map(l => l.trim()).filter(l => l);
            let title = "";
            if (lines.length > 0) title = lines[0].replace(/^"|"$/g, "");

            let date = "", time = "", tour = "", city = "";
            let parsedDateObj = null;
            const infoLineIdx = lines.findIndex(l => l.match(/\d{4}-\d{2}-\d{2}/) && l.includes("/"));

            if (infoLineIdx > -1) {
                const full = lines[infoLineIdx];
                const parts = full.split(" / ");
                if (parts.length >= 3) {
                    const rawTourName = parts[0].trim();
                    city = window.__re.guessCity(rawTourName);
                    tour = window.__re.mapTourName(rawTourName);
                    date = window.__re.parseDashDate(parts[1].trim()); // DD/Mon/YYYY
                    time = parts[2].replace(/(AM|PM)/i, "").trim();
                    
                    // Parse string to date object for comparison
                    const dateParts = date.split('/');
                    if (dateParts.length === 3) {
                        const day = parseInt(dateParts[0], 10);
                        const monthIdx = MONTH_NAMES.indexOf(dateParts[1]);
                        const year = parseInt(dateParts[2], 10);
                        parsedDateObj = new Date(year, monthIdx, day);
                        
                        if (!isNaN(parsedDateObj.getTime()) && parsedDateObj < oldestDateOnPage) {
                            oldestDateOnPage = parsedDateObj;
                        }
                    }
                }
            }

            if (!date && !tour) return;

            let review = "";
            const replyIndex = lines.indexOf("Reply");
            if (replyIndex > -1) {
                review = lines.slice(replyIndex + 1).join("\n").replace(/Report$/, "").trim();
            }

            const guide = window.__re.extractGuideName(`${title} ${review}`);

            allRows.push({
                Date: date, 
                Time: time, 
                Guide: guide, 
                Rating: rating, 
                Tour: tour, 
                City: city, 
                Language: "", 
                Platform: "freetour com", 
                Review: review,
                _rawDateObj: parsedDateObj // Temp storage for final exact filtering
            });
            pageExtractedCount++;
        });

        window.__re.log(`Extracted ${pageExtractedCount} Freetour reviews. Oldest visible date: ${window.__re.formatDate(oldestDateOnPage)}`);

        // 3. Check if we've hit the cutoff date
        if (oldestDateOnPage < cutoffDate) {
            window.__re.log(`Reached reviews older than target month (Cutoff: ${window.__re.formatDate(cutoffDate)}). Stopping pagination.`);
            break;
        }

        // 4. Find and click "Next" button
        const nextBtn = Array.from(document.querySelectorAll('a, button, li')).find(el => {
            const t = el.innerText.trim().toLowerCase();
            return (t === '»' || t === 'next' || t === 'next page') && el.closest('ul') !== null;
        });

        if (nextBtn && !nextBtn.hasAttribute('disabled') && !nextBtn.className.includes('disabled')) {
            window.__re.log("Clicking 'Next' page...");
            nextBtn.click();
            await window.__re.waitForDOMSettle(3000); 
        } else {
            window.__re.log("No more pages found or next button is disabled.");
            hasMorePages = false;
        }
    }

    // ─── 5. Strict Filtering & Output ───────────────────────────────────────────
    // Only keep reviews from the EXACT selected month and year
    const validRows = allRows.filter(r => {
        if (!r._rawDateObj || isNaN(r._rawDateObj.getTime())) return true; 
        return r._rawDateObj.getFullYear() === targetYear && r._rawDateObj.getMonth() === targetMonth;
    }).map(r => {
        delete r._rawDateObj; 
        return r;
    });

    if (validRows.length === 0) {
        window.__re.warn("No reviews found for the strictly selected month.");
        return { success: false, count: 0, platform: "Freetour" };
    }

    // Send directly to webhook
    window.__re.sendDataToWebhook(validRows, "Freetour");
    window.__re.log(`Dispatched ${validRows.length} strictly filtered Freetour reviews to webhook.`);
    return { success: true, count: validRows.length, platform: "Freetour" };
})();