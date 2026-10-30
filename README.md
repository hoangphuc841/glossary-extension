# PDF Book Quick Glossary (Chrome Extension)

A lightweight Manifest V3 Chrome extension that automatically highlights glossary terms inside PDF tabs with inline superscript badges, shows definitions on hover with inline edit/delete, adds terms via mouse text selection, and offers a slide-out glossary drawer with loose similarity search and JSON backup.

## Installation into Chrome

1. Open Google Chrome and navigate to `chrome://extensions`.
2. Toggle **Developer mode** in the top-right corner.
3. Click **Load unpacked**.
4. Select the directory:
   `\glossary-extension`
5. On the *PDF Book Quick Glossary* card in `chrome://extensions`, click **Details**.
6. Turn **ON** the toggle for **Allow access to file URLs** (essential for reading local PDF light novels).

## How to Use

- **Open a PDF:** Open any local PDF (e.g. from `../Pdf/`) in Chrome. The extension automatically loads the PDF.js text layer.
- **Add term from text:** Highlight any name or phrase on the page. A floating `+ Glossary` pill appears. Click it to set a short definition and press `Enter`.
- **Inline badges:** Every occurrence of any active glossary term is automatically marked with a subtle dotted underline and a `✦` superscript badge.
- **Hover definition:** Hover your mouse over any marked word to view its definition. Click **Edit** to modify it inline or **Delete** (with confirmation) to remove it.
- **Live updates:** All updates reflect immediately across the rendered pages without reloading or moving your scroll position.
- **Glossary drawer:** Press `Alt+G` or click `✦ Glossary` in the top right to open the slide-out drawer.
- **Loose similarity search:** Select text and press `Ctrl+Shift+F` (or `Cmd+Shift+F` on macOS) or right-click and choose **Search similar terms in Glossary** to open the drawer with similar terms ranked at the top.
- **Series linking:** Use the dropdown at the top of the drawer to link multiple volumes to the same shared series glossary.
- **Backup:** Click **Export** to save a `.json` backup file or **Import** to restore terms.
