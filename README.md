# Reviews Extract — Chrome Extension

A Chrome extension that scrapes and exports customer reviews from popular platforms into tab-separated values (TSV), ready to paste into Google Sheets or Excel.

## Supported Platforms

Airbnb · Freetour.com · GetYourGuide · Google Maps · Guruwalk · Viator

## Extracted Fields

Date · Time · Rating · Review text · Tour/product name · Guide name · City · Language · Platform

## Installation

1. Download or clone this repo and unzip it.
2. Go to `chrome://extensions` in Chrome.
3. Enable **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select the project folder.

> Optionally, pin the extension via the puzzle piece icon in your toolbar.

## Usage

1. Navigate to a supported platform's review page.
2. Click the **Reviews Extract** icon in your toolbar.
3. Click the button for the current platform.
4. Wait for **"Done! Copied."** — the TSV data is now in your clipboard.
5. Paste (`Ctrl+V` / `Cmd+V`) directly into your spreadsheet.

The extension automatically expands "Show more" buttons where needed and may prompt you to confirm a city abbreviation for certain platforms.

## Project Structure

```text
manifest.json       Extension config, permissions, and popup definition
popup.html          Popup UI
popup.css           Popup UI styles
popup.js            Button logic and script injection
logo.png            Extension icon
scripts/
  common.js
  airbnb.js
  freetour.js
  getyourguide.js
  google.js
  guruwalk.js
  viator.js
```

Each script handles element selection, field extraction, and copying TSV data to the clipboard.

## License

TODO