#!/usr/bin/env python3
"""Generate the self-contained, offline Russian launch guide. Python stdlib only."""
from pathlib import Path
import html
import re

root = Path(__file__).resolve().parent.parent
source = (root / 'START_HERE_RU.md').read_text()

def inline(text):
    text = html.escape(text)
    text = re.sub(r'`([^`]+)`', r'<code>\1</code>', text)
    text = re.sub(r'\*\*([^*]+)\*\*', r'<strong>\1</strong>', text)
    text = re.sub(r'(https?://[^\s<]+)', lambda m: '<a href="'+m[0].rstrip('.')+'">'+m[0].rstrip('.')+'</a>'+('.' if m[0].endswith('.') else ''), text)
    return text

out, nav, paragraph, code = [], [], [], None
in_table = False

def flush():
    if paragraph:
        out.append('<p>' + inline(' '.join(paragraph)) + '</p>')
        paragraph.clear()

for line in source.splitlines():
    if line.startswith('```'):
        flush()
        if code is None:
            code = []
        else:
            out.append('<pre><code>' + html.escape('\n'.join(code)) + '</code></pre>')
            code = None
        continue
    if code is not None:
        code.append(line)
        continue
    if line.startswith('|'):
        flush()
        if not in_table:
            out.append('<div class="scroll"><table>')
            in_table = True
        if re.match(r'^\|[\s|:-]+$', line):
            continue
        out.append('<tr>' + ''.join('<td>'+inline(c.strip())+'</td>' for c in line.strip('|').split('|')) + '</tr>')
        continue
    if in_table:
        out.append('</table></div>')
        in_table = False
    heading = re.match(r'^(#{1,3}) (.+)$', line)
    if heading:
        flush()
        level, title = len(heading[1]), heading[2]
        anchor = 'section-' + str(len(nav)+1) if level == 2 else ''
        if level == 2:
            nav.append('<a href="#'+anchor+'">'+inline(title)+'</a>')
        out.append(f'<h{level} id="{anchor}">'+inline(title)+f'</h{level}>')
    elif not line.strip():
        flush()
    elif re.match(r'^(\d+\. |\- )', line):
        flush()
        out.append('<p class="step">'+inline(line)+'</p>')
    else:
        paragraph.append(line)
flush()
page = '''<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>INNOSIGHT — подробная инструкция запуска</title><style>
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:#f3f5f5;color:#243139;font:16px/1.7 system-ui,sans-serif}header{background:#202b30;color:#eef4f1;padding:26px max(24px,calc((100vw - 1160px)/2));font-size:20px;font-weight:600;letter-spacing:1px}header small{display:block;font-size:12px;letter-spacing:0;color:#b5c4c8;font-weight:400}.layout{display:grid;grid-template-columns:235px minmax(0,860px);gap:44px;max-width:1200px;margin:40px auto;padding:0 24px}nav{position:sticky;top:24px;align-self:start;display:grid;gap:10px;font-size:13px}nav a{color:#52636b;text-decoration:none}nav a:hover{color:#286f63}main{min-width:0;background:#fff;border:1px solid #dfe5e7;border-radius:8px;padding:38px 42px}h1{font-size:34px;letter-spacing:-1px;line-height:1.2;margin-top:0}h2{font-size:24px;line-height:1.35;border-top:1px solid #e2e8e9;padding-top:30px;margin-top:42px;scroll-margin-top:20px}h3{font-size:18px;margin-top:28px}p{margin:14px 0}.step{padding-left:12px;border-left:2px solid #dfebe5}a{color:#286f63;overflow-wrap:anywhere}code{font-family:ui-monospace,Consolas,monospace;background:#f1f5f4;padding:2px 4px;border-radius:3px;font-size:.85em;overflow-wrap:anywhere}pre{overflow:auto;background:#202b30;color:#e4efed;padding:20px;border-radius:5px;font-size:13px;line-height:1.65}pre code{background:none;padding:0;font-size:inherit;overflow-wrap:normal}table{border-collapse:collapse;width:100%;font-size:14px}td{border:1px solid #e2e7e8;padding:10px}tr:first-child{background:#f1f5f4;font-weight:600}.scroll{overflow:auto}footer{text-align:center;color:#6c7b82;font-size:12px;padding:15px 24px 36px}@media(max-width:900px){.layout{display:block;margin:20px auto}nav{position:static;margin-bottom:24px;grid-template-columns:1fr 1fr;gap:12px}main{padding:26px 22px}h1{font-size:29px}}@media(max-width:520px){body{font-size:14px}.layout{padding:0 12px}nav{grid-template-columns:1fr}main{padding:24px 16px}pre{font-size:11px;padding:14px}h2{font-size:21px}}@media print{header,nav,footer{display:none}.layout{display:block;margin:0;padding:0}main{border:0;padding:0}body{background:white;font-size:11pt}pre{white-space:pre-wrap;background:#f3f5f5;color:#222}h2{break-after:avoid}a{color:inherit}}
</style><header>INNOSIGHT<small>Версия 1.1 · Инструкция для локального запуска</small></header><div class="layout"><nav aria-label="Содержание">'''+''.join(nav)+'</nav><main>'+''.join(out)+'</main></div><footer>Инструкция входит в поставку. Для запуска приложения откройте http://localhost:3000 после запуска Docker Compose.</footer></html>'
for target in [root / 'START_HERE.html', root / 'apps/web/public/START_HERE.html']:
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(page)
print('Generated START_HERE.html and apps/web/public/START_HERE.html')
