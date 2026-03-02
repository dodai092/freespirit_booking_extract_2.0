document.addEventListener('DOMContentLoaded', () => {

  const PLATFORMS = [
    { id: 'btn-airbnb', script: 'airbnb.js', domains: ['airbnb.com', 'airbnb.co.uk'] },
    { id: 'btn-freetour', script: 'freetour.js', domains: ['freetour.com'] },
    { id: 'btn-gyg', script: 'getyourguide.js', domains: ['getyourguide.com'] },
    { id: 'btn-google', script: 'google.js', domains: ['google.com/maps', 'maps.google'] },
    { id: 'btn-guruwalk', script: 'guruwalk.js', domains: ['guruwalk.com'] },
    { id: 'btn-viator', script: 'viator.js', domains: ['viator.com'] },
  ];

  const statusDiv = document.getElementById('status');
  const monthSelect = document.getElementById('month-select');

  // ─── Auto-Populate the Month Dropdown (Last 6 Months) ───────────────────────
  if (monthSelect) {
    const now = new Date();
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    
    for (let i = 1; i <= 6; i++) {
      let d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      let option = document.createElement('option');
      // We store the month index (0-11) and year in a JSON string
      option.value = JSON.stringify({ month: d.getMonth(), year: d.getFullYear() });
      option.text = `${monthNames[d.getMonth()]} ${d.getFullYear()}`;
      monthSelect.appendChild(option);
    }
  }

  // ─── Inject common.js then platform script ──────────────────────────────────
  const injectScript = (scriptFile) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0] || !tabs[0].id) return;
      const tabId = tabs[0].id;
      statusDiv.innerText = 'Scraping…';

      // 1. Get the selected target month/year from the dropdown
      const targetData = monthSelect ? JSON.parse(monthSelect.value) : null;

      // 2. Inject a tiny script to save the target month to the window object FIRST
      if (targetData) {
        chrome.scripting.executeScript({
          target: { tabId },
          func: (m, y) => { window.__targetMonth = m; window.__targetYear = y; },
          args: [targetData.month, targetData.year]
        });
      }

      // 3. Inject common.js
      chrome.scripting.executeScript(
        { target: { tabId }, files: ['scripts/common.js'] },
        () => {
          if (chrome.runtime.lastError) {
            statusDiv.innerText = 'Error (Check Console)';
            console.error(chrome.runtime.lastError);
            return;
          }
          // 4. Inject the actual scraper script
          chrome.scripting.executeScript(
            { target: { tabId }, files: [`scripts/${scriptFile}`] },
            (results) => {
              if (chrome.runtime.lastError) {
                statusDiv.innerText = 'Error (Check Console)';
                console.error(chrome.runtime.lastError);
                return;
              }
              const result = results?.[0]?.result;
              if (result?.success) {
                statusDiv.innerText = `Done! ${result.count} reviews sent to Sheets.`;
              } else if (result) {
                statusDiv.innerText = `No reviews found.`;
              } else {
                statusDiv.innerText = 'Done! Sent to Sheets.';
              }
              setTimeout(() => (statusDiv.innerText = 'Ready'), 4000);
            }
          );
        }
      );
    });
  };

  // ─── Auto-detect platform from current tab URL ───────────────────────────────
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const url = tabs[0]?.url || '';
    for (const platform of PLATFORMS) {
      if (platform.domains.some(domain => url.includes(domain))) {
        const btn = document.getElementById(platform.id);
        if (btn) btn.classList.add('active');
        break;
      }
    }
  });

  // ─── Register click handlers ─────────────────────────────────────────────────
  for (const platform of PLATFORMS) {
    const btn = document.getElementById(platform.id);
    if (btn) {
      btn.addEventListener('click', () => injectScript(platform.script));
    }
  }
});