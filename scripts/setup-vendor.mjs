import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const vendorDir = path.resolve(__dirname, "../vendor");
const baseUrl = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.8.69/build";

async function download(filename) {
  console.log(`Downloading ${filename}...`);
  const res = await fetch(`${baseUrl}/${filename}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${filename}: ${res.status}`);
  }
  const text = await res.text();
  await fs.writeFile(path.join(vendorDir, filename), text, "utf8");
}

await fs.mkdir(vendorDir, { recursive: true });
await download("pdf.mjs");
await download("pdf.worker.mjs");
console.log("Downloaded vendor/pdf.mjs and vendor/pdf.worker.mjs");
