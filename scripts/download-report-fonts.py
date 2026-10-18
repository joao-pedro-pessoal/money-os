"""Vendor OFL Noto fonts for offline, Unicode PDF exports (no user data)."""
from pathlib import Path
import urllib.request

target = Path(__file__).resolve().parent.parent / 'assets' / 'fonts'
target.mkdir(parents=True, exist_ok=True)
base = 'https://raw.githubusercontent.com/notofonts/noto-fonts/main/'
files = {name + '.ttf': base + 'hinted/ttf/' + family + '/' + name + '.ttf' for family, name in [
    ('NotoSans', 'NotoSans-Regular'), ('NotoSans', 'NotoSans-Bold'),
    ('NotoSansArabic', 'NotoSansArabic-Regular'),
    ('NotoSansDevanagari', 'NotoSansDevanagari-Regular'),
    ('NotoSansBengali', 'NotoSansBengali-Regular')]}
files['NotoSansCJKsc-Regular.otf'] = 'https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf'
files['NotoSansCJKjp-Regular.otf'] = 'https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/Japanese/NotoSansCJKjp-Regular.otf'
files['LICENSE'] = base + 'LICENSE'
files['LICENSE-CJK'] = 'https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/LICENSE'
for name, url in files.items():
    path = target / name
    if not path.exists():
        with urllib.request.urlopen(url, timeout=90) as response:
            path.write_bytes(response.read())
    print(name, path.stat().st_size, flush=True)
