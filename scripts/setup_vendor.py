import urllib.request
from pathlib import Path

vendor_dir = Path(__file__).resolve().parent.parent / "vendor"
vendor_dir.mkdir(parents=True, exist_ok=True)
base_url = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.8.69/build"

for filename in ["pdf.mjs", "pdf.worker.mjs"]:
    url = f"{base_url}/{filename}"
    print(f"Downloading {filename}...")
    urllib.request.urlretrieve(url, vendor_dir / filename)

print("Downloaded vendor/pdf.mjs and vendor/pdf.worker.mjs")
