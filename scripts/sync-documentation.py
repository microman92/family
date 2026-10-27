"""Synchronize the bundled HTML documentation after PRD/SPEC/TASKS edits.

Requires markdown-it-py (pip install markdown-it-py).
"""

import re
from pathlib import Path
from markdown_it import MarkdownIt

root = Path(__file__).resolve().parent.parent
path = root / 'Documentation.html'
html = path.read_text(encoding='utf-8')
renderer = MarkdownIt('commonmark').enable('table')
for name in ['prd', 'spec', 'tasks']:
    content = renderer.render((root / f'{name.upper()}.md').read_text(encoding='utf-8'))
    content = content.replace('<li>[ ] ', '<li class="task-list-item"><input class="task-list-item-checkbox" type="checkbox" disabled/>')
    content = content.replace('<li>[x] ', '<li class="task-list-item"><input class="task-list-item-checkbox" type="checkbox" checked disabled/>')
    replacement = f'<section id="{name}"><div class="section-kicker">Family Space 2.0</div>{content}</section>'
    html, count = re.subn(rf'<section id="{name}">.*?</section>', lambda _: replacement, html, flags=re.S)
    if count != 1:
        raise ValueError(f'Expected one HTML section: {name}')
path.write_text(html, encoding='utf-8')
print('PRD / SPEC / TASKS synchronized to Documentation.html')
