"""
Sentinel — Service Status Dashboard — EUDA Technical Documentation v1.0 generator.

Produces dist/Sentinel_EUDA_v1.pdf, a multi-page PDF in the same visual language as
the application itself (dark cover, indigo/violet accents, clean tables, monospace
code blocks, and illustrative dark-theme screen mocks).

Run with:
    pip install -r python-tools/requirements.txt
    python python-tools/build_euda_pdf.py

The Sentinel brand mark is fetched from the public logo URL at build time and cached
under dist/. If it cannot be downloaded (offline / TLS-inspected network), the cover
falls back to a drawn indigo tile — the build never fails on the logo.
"""
from __future__ import annotations

import ssl
import urllib.request
from pathlib import Path

from reportlab.lib.colors import HexColor, white
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm, mm
from reportlab.platypus import (
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

# The Sentinel brand mark.
# Preference order: the locally exported golden master (so the cover is correct even
# before it is uploaded to the hosting URL), then a cached download, then a fresh fetch.
LOGO_URL = 'https://uvzfnheuaduyivtddfba.supabase.co/storage/v1/object/public/app-logo/logo-sentinel-dashboard.png'
LOCAL_LOGO = Path(__file__).resolve().parent.parent / 'logo-prototypes' / 'final' / 'logo-sentinel-dashboard.png'
LOGO_CACHE = Path(__file__).resolve().parent / 'dist' / '.logo-sentinel-dashboard.png'


def ensure_logo() -> str | None:
    """Return a local path to the Sentinel logo, downloading + caching it if needed.

    Returns None if the logo cannot be obtained — the cover then draws a fallback
    tile instead, so the document still builds on an offline / locked-down machine.
    """
    if LOCAL_LOGO.exists() and LOCAL_LOGO.stat().st_size > 0:
        return str(LOCAL_LOGO)
    if LOGO_CACHE.exists() and LOGO_CACHE.stat().st_size > 0:
        return str(LOGO_CACHE)
    LOGO_CACHE.parent.mkdir(parents=True, exist_ok=True)
    # Try a normal verified download first, then fall back to an unverified context
    # (corporate SSL inspection re-signs HTTPS with a root CA Python may not trust).
    for ctx in (None, ssl._create_unverified_context()):
        try:
            req = urllib.request.Request(LOGO_URL, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=15, context=ctx) as resp:
                data = resp.read()
            if data:
                LOGO_CACHE.write_bytes(data)
                return str(LOGO_CACHE)
        except Exception:
            continue
    return None


LOGO_PNG = ensure_logo()


# ---------------------------------------------------------------------------
# Palette — golden / amber accents (matches the Sentinel logo) on a dark shell
# ---------------------------------------------------------------------------

AMBER         = HexColor('#b45309')   # accent — deep amber (matches the golden logo), legible on white & dark
AMBER_DARK    = HexColor('#92400e')   # deepest amber — labels / page header text
AMBER_BRIGHT  = HexColor('#f59e0b')   # bright amber — decorative accents on the dark cover
GOLD          = HexColor('#fbbf24')   # mid gold — decorative gradient
GOLD_LIGHT    = HexColor('#fde047')   # light gold — decorative gradient end
DARK_BG       = HexColor('#0a0f1c')
DARK_PANEL    = HexColor('#0f172a')
TEXT_PRIMARY  = HexColor('#1e293b')
TEXT_MUTED    = HexColor('#64748b')
RED           = HexColor('#ef4444')
GREEN         = HexColor('#22c55e')
LIGHT_BG      = HexColor('#fffbeb')   # amber-50
ALT_ROW       = HexColor('#f8fafc')
BORDER        = HexColor('#cbd5e1')


# ---------------------------------------------------------------------------
# Styles
# ---------------------------------------------------------------------------

base = getSampleStyleSheet()

H1 = ParagraphStyle('H1', parent=base['Heading1'],
    fontSize=20, textColor=AMBER, spaceAfter=14, spaceBefore=0,
    fontName='Helvetica-Bold', leading=24,
)
H2 = ParagraphStyle('H2', parent=base['Heading2'],
    fontSize=13, textColor=AMBER, spaceAfter=8, spaceBefore=14,
    fontName='Helvetica-Bold', leading=16,
)
H3 = ParagraphStyle('H3', parent=base['Heading3'],
    fontSize=11, textColor=TEXT_PRIMARY, spaceAfter=6, spaceBefore=10,
    fontName='Helvetica-Bold', leading=14,
)
BODY = ParagraphStyle('BODY', parent=base['Normal'],
    fontSize=9.5, textColor=TEXT_PRIMARY, spaceAfter=7,
    fontName='Helvetica', leading=13,
)
BODY_J = ParagraphStyle('BODY_J', parent=BODY, alignment=TA_JUSTIFY)
SMALL = ParagraphStyle('SMALL', parent=BODY, fontSize=8.5, leading=11, textColor=TEXT_MUTED)
CODE = ParagraphStyle('CODE', parent=BODY,
    fontName='Courier', fontSize=8.5, textColor=TEXT_PRIMARY,
    backColor=LIGHT_BG, borderPadding=8, leading=12,
    spaceBefore=4, spaceAfter=4,
)
TABLE_HEADER = ParagraphStyle('TABLE_HEADER', parent=BODY,
    fontSize=9, textColor=white, fontName='Helvetica-Bold',
)
TABLE_CELL = ParagraphStyle('TABLE_CELL', parent=BODY,
    fontSize=9, textColor=TEXT_PRIMARY, leading=12, spaceAfter=0,
)
DECL_BULLET = ParagraphStyle('DECL_BULLET', parent=BODY,
    leftIndent=14, bulletIndent=0, spaceAfter=5,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def section_title(text: str, new: bool = False):
    """Heading 1 with an optional gold (NEW) badge after the title."""
    if new:
        return Paragraph(f'{text} <font color="#f59e0b" size="11"><b>(NEW)</b></font>', H1)
    return Paragraph(text, H1)


def kv_table(rows, col_widths=(5.5 * cm, 11.0 * cm)):
    """Two-column key/value table with indigo label cells."""
    data = [[Paragraph(f'<b>{k}</b>', TABLE_CELL), Paragraph(v, TABLE_CELL)] for k, v in rows]
    t = Table(data, colWidths=col_widths)
    t.setStyle(TableStyle([
        ('VALIGN',     (0, 0), (-1, -1), 'TOP'),
        ('BACKGROUND', (0, 0), (0, -1),  LIGHT_BG),
        ('TEXTCOLOR',  (0, 0), (0, -1),  AMBER_DARK),
        ('GRID',       (0, 0), (-1, -1), 0.4, BORDER),
        ('LEFTPADDING',(0, 0), (-1, -1), 6),
        ('RIGHTPADDING',(0, 0), (-1, -1), 6),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING',(0, 0), (-1, -1), 5),
    ]))
    return t


def data_table(headers, rows, col_widths=None):
    """Multi-column table with an indigo header row + alternating light rows."""
    header_row = [Paragraph(f'<b>{h}</b>', TABLE_HEADER) for h in headers]
    body_rows = [[Paragraph(str(c) if c is not None else '', TABLE_CELL) for c in r] for r in rows]
    data = [header_row] + body_rows
    t = Table(data, colWidths=col_widths, repeatRows=1)
    style = [
        ('BACKGROUND', (0, 0), (-1, 0),  AMBER),
        ('TEXTCOLOR',  (0, 0), (-1, 0),  white),
        ('VALIGN',     (0, 0), (-1, -1), 'TOP'),
        ('GRID',       (0, 0), (-1, -1), 0.4, BORDER),
        ('LEFTPADDING',(0, 0), (-1, -1), 6),
        ('RIGHTPADDING',(0, 0), (-1, -1), 6),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING',(0, 0), (-1, -1), 5),
    ]
    for i in range(1, len(data)):
        if i % 2 == 0:
            style.append(('BACKGROUND', (0, i), (-1, i), ALT_ROW))
    t.setStyle(TableStyle(style))
    return t


def signoff_block(role_title: str, name_prefilled: str = ''):
    """One signature block. role_title in an indigo header, then 4 fields."""
    title_row = Paragraph(f'<b>{role_title}</b>', ParagraphStyle(
        'SO_TITLE', parent=BODY, fontSize=10, textColor=white, fontName='Helvetica-Bold'
    ))
    name = Paragraph(f'<b>Name:</b> {name_prefilled}', BODY)
    title_field = Paragraph('<b>Title:</b> ___________________________________', BODY)
    sig = Paragraph('<b>Signature:</b> ______________________________', BODY)
    date = Paragraph('<b>Date:</b> ______ / ______ / __________', BODY)
    inner = [[title_row], [Spacer(1, 4)], [name], [title_field], [sig], [date]]
    t = Table(inner, colWidths=[16.0 * cm])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, 0), AMBER),
        ('LEFTPADDING',(0, 0), (-1, -1), 8),
        ('RIGHTPADDING',(0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING',(0, 0), (-1, -1), 4),
        ('BOX',        (0, 0), (-1, -1), 0.4, BORDER),
    ]))
    return t


def code_block(text: str):
    """Dark-style code block. Multi-line monospace text."""
    safe = text.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
    safe = safe.replace('\n', '<br/>')
    return Paragraph(f'<font face="Courier" size="8.5">{safe}</font>', ParagraphStyle(
        'CODE_BLOCK', parent=BODY,
        backColor=DARK_PANEL, borderColor=BORDER, borderWidth=0.5,
        textColor=HexColor('#cbd5e1'), borderPadding=10,
        leading=11, spaceBefore=4, spaceAfter=8,
    ))


# ---------------------------------------------------------------------------
# Mock "screenshots" — stylised dark-theme UI illustrations with FAKE data, used
# to fill the page tails. Built from nested reportlab tables (no real PNGs). All
# values are illustrative; nothing here is real configuration data.
# ---------------------------------------------------------------------------

SCREEN_W  = 16.0 * cm
CHROME_BG = HexColor('#111827')
PANEL_BG  = HexColor('#0f172a')
ROW_ALT   = HexColor('#0b1220')
LINE_DK   = HexColor('#1e293b')
INK_FIELD = HexColor('#0a0f1c')

DCELL   = ParagraphStyle('DCELL',   parent=BODY, textColor=HexColor('#cbd5e1'), fontSize=8.5, leading=11, spaceAfter=0)
DMUTED  = ParagraphStyle('DMUTED',  parent=DCELL, textColor=HexColor('#64748b'))
DHEAD   = ParagraphStyle('DHEAD',   parent=DCELL, textColor=HexColor('#94a3b8'), fontName='Helvetica-Bold', fontSize=7.5)
DACCENT = ParagraphStyle('DACCENT', parent=DCELL, textColor=HexColor('#fcd34d'), fontName='Helvetica-Bold')


def _mono(text: str, color: str = '#fcd34d') -> str:
    """Inline monospace + coloured span for a mock cell (e.g. a URL or path)."""
    return f'<font face="Courier" color="{color}">{text}</font>'


def _pill(text: str, color: str) -> str:
    """A coloured status word (mimics the level badge colour)."""
    return f'<font color="{color}"><b>{text}</b></font>'


def screen_mock(title, inner, caption):
    """Wrap inner content in faux window chrome (dark title bar + indigo underline + frame) + caption."""
    bar = Table([[Paragraph(f'<font color="#cbd5e1"><b>{title}</b></font>', DCELL)]], colWidths=[SCREEN_W])
    bar.setStyle(TableStyle([
        ('BACKGROUND',  (0, 0), (-1, -1), CHROME_BG),
        ('LINEBELOW',   (0, 0), (-1, -1), 1.2, AMBER),
        ('LEFTPADDING', (0, 0), (-1, -1), 10), ('RIGHTPADDING', (0, 0), (-1, -1), 10),
        ('TOPPADDING',  (0, 0), (-1, -1), 6), ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]))
    frame = Table([[bar], [inner]], colWidths=[SCREEN_W])
    frame.setStyle(TableStyle([
        ('LEFTPADDING', (0, 0), (-1, -1), 0), ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING',  (0, 0), (-1, -1), 0), ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
        ('BOX',         (0, 0), (-1, -1), 0.8, HexColor('#334155')),
    ]))
    return KeepTogether([Spacer(1, 0.35 * cm), frame, Spacer(1, 0.12 * cm), Paragraph(f'<i>{caption}</i>', SMALL)])


def _dark_table(data, col_widths, header=True, zebra=True):
    """A dark inner table for a mock; optional grey header row + zebra striping."""
    t = Table(data, colWidths=col_widths)
    style = [
        ('BACKGROUND',  (0, 0), (-1, -1), PANEL_BG),
        ('VALIGN',      (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 10), ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING',  (0, 0), (-1, -1), 4.5), ('BOTTOMPADDING', (0, 0), (-1, -1), 4.5),
        ('LINEBELOW',   (0, 0), (-1, -1), 0.3, LINE_DK),
    ]
    if header:
        style.append(('BACKGROUND', (0, 0), (-1, 0), HexColor('#1e293b')))
    if zebra:
        start = 1 if header else 0
        for i in range(start, len(data)):
            if (i - start) % 2 == 1:
                style.append(('BACKGROUND', (0, i), (-1, i), ROW_ALT))
    t.setStyle(TableStyle(style))
    return t


def mock_dashboard():
    """Dashboard — status hero + service cards (Figure 1)."""
    hero = Table([[
        Paragraph('<font color="#fbbf24"><b>MINOR INCIDENT IN PROGRESS</b></font>', DCELL),
        Paragraph('<font color="#86efac">21 healthy</font> &nbsp; <font color="#fdba74">3 degraded</font>', DMUTED),
    ]], colWidths=[9.0 * cm, 7.0 * cm])
    hero.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), HexColor('#422006')),
        ('LEFTPADDING', (0, 0), (-1, -1), 12), ('RIGHTPADDING', (0, 0), (-1, -1), 12),
        ('TOPPADDING', (0, 0), (-1, -1), 9), ('BOTTOMPADDING', (0, 0), (-1, -1), 9),
        ('ALIGN', (1, 0), (1, 0), 'RIGHT'),
    ]))
    head = [Paragraph(h, DHEAD) for h in ['Service', 'Group', 'Status', 'Message']]
    rows = [
        ('GitHub',         'Dev',            _pill('Operational', '#22c55e'),     'All systems operational'),
        ('Cloudflare',     'Infrastructure', _pill('Minor incident', '#f97316'),  'Re-routing in WEU - investigating'),
        ('AWS Services',   'Infrastructure', _pill('Operational', '#22c55e'),     'No active incidents (last 24h)'),
        ('Datadog',        'Observability',  _pill('Operational', '#22c55e'),     'All systems operational'),
        ('Salesforce UK',  'Business Apps',  _pill('Operational', '#22c55e'),     '49 instances - all OK'),
        ('ICE',            'Market Data',    _pill('Degraded', '#eab308'),        '1 of 7 feeds affected'),
    ]
    data = [head] + [[Paragraph(r[0], DACCENT), Paragraph(r[1], DMUTED), Paragraph(r[2], DCELL), Paragraph(r[3], DCELL)] for r in rows]
    grid = _dark_table(data, [3.6 * cm, 3.0 * cm, 3.4 * cm, 6.0 * cm])
    inner = Table([[hero], [grid]], colWidths=[SCREEN_W])
    inner.setStyle(TableStyle([
        ('LEFTPADDING', (0, 0), (-1, -1), 0), ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 0), ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
    ]))
    return screen_mock('Dashboard', inner,
                       'Figure 1 - The dashboard: a colour-coded status hero over the live service grid (illustrative data).')


def mock_service_form():
    """Service form — config + live JSON tree (Figure 2)."""
    left = _dark_table([
        [Paragraph('Name', DHEAD),       Paragraph('Cloudflare', DCELL)],
        [Paragraph('URL', DHEAD),        Paragraph(_mono('https://www.cloudflarestatus.com/api/v2/summary.json'), DCELL)],
        [Paragraph('Adapter', DHEAD),    Paragraph(_pill('Atlassian Statuspage', '#fcd34d'), DCELL)],
        [Paragraph('Interval', DHEAD),   Paragraph('300 s', DCELL)],
        [Paragraph('Status', DHEAD),     Paragraph(_pill('Operational', '#22c55e') + ' &nbsp; "All systems operational"', DCELL)],
    ], [3.2 * cm, 12.8 * cm], header=False)
    return screen_mock('Add / edit a service', left,
                       'Figure 2 - The service form: paste a URL, pick an adapter, Test, then click a node in the JSON tree '
                       'to bind statusPath / messagePath (illustrative data).')


def mock_composite():
    """Composite detail — children sorted by severity (Figure 3)."""
    head = [Paragraph(h, DHEAD) for h in ['Sub-service', 'Status', 'Last update']]
    rows = [
        ('low-latency-emea',        _pill('Critical issue', '#7f1d1d'),  '08 Jun 2026 09:14'),
        ('data-and-analytics',      _pill('Degraded', '#eab308'),        '08 Jun 2026 08:40'),
        ('Consolidated (global)',   _pill('Operational', '#22c55e'),     '08 Jun 2026 09:12'),
        ('ice-chat',                _pill('Operational', '#22c55e'),     '08 Jun 2026 09:12'),
        ('BondEdge',                _pill('Operational', '#22c55e'),     '08 Jun 2026 09:10'),
    ]
    data = [head] + [[Paragraph(r[0], DACCENT), Paragraph(r[1], DCELL), Paragraph(r[2], DMUTED)] for r in rows]
    return screen_mock('Composite detail - ICE (7 feeds)',
                       _dark_table(data, [7.0 * cm, 5.0 * cm, 4.0 * cm]),
                       'Figure 3 - A composite groups many URLs under one card; its overall level is the worst among its '
                       'children, listed worst-first (illustrative data).')


def mock_levels():
    """Settings - status level configuration (Figure 4)."""
    head = [Paragraph(h, DHEAD) for h in ['Level', 'Label', 'Colour', 'Meaning']]
    rows = [
        ('operational', 'Operational',       _pill('#22c55e', '#22c55e'), 'Everything is working normally'),
        ('leger',       'Degraded',          _pill('#eab308', '#eab308'), 'Partial, non-critical degradation'),
        ('mineur',      'Minor incident',    _pill('#f97316', '#f97316'), 'Partial impact on the service'),
        ('majeur',      'Major incident',    _pill('#ef4444', '#ef4444'), 'Outage or strong impact'),
        ('critique',    'Critical incident', _pill('#7f1d1d', '#b91c1c'), 'Total outage or critical interruption'),
        ('inconnu',     'Action required',   _pill('#9ca3af', '#9ca3af'), 'Undetermined status / missing auth'),
    ]
    data = [head] + [[Paragraph(_mono(r[0]), DCELL), Paragraph(r[1], DCELL), Paragraph(r[2], DCELL), Paragraph(r[3], DMUTED)] for r in rows]
    return screen_mock('Settings - status levels',
                       _dark_table(data, [2.8 * cm, 3.4 * cm, 2.6 * cm, 7.2 * cm]),
                       'Figure 4 - Labels and colours of all eight levels are editable and shared across the deployment (illustrative data).')


def mock_login():
    """Access gate - password or SSO (Figure 5)."""
    def field(label, value):
        box = Table([[Paragraph(value, DCELL)]], colWidths=[SCREEN_W - 2.4 * cm])
        box.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), INK_FIELD), ('BOX', (0, 0), (-1, -1), 0.5, HexColor('#334155')),
            ('LEFTPADDING', (0, 0), (-1, -1), 9), ('RIGHTPADDING', (0, 0), (-1, -1), 9),
            ('TOPPADDING', (0, 0), (-1, -1), 6), ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ]))
        return [Paragraph(label, DHEAD), Spacer(1, 2), box]
    btn = Table([[Paragraph('<font color="#ffffff"><b>Unlock</b></font>', DCELL)]], colWidths=[SCREEN_W - 2.4 * cm])
    btn.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), AMBER), ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('TOPPADDING', (0, 0), (-1, -1), 7), ('BOTTOMPADDING', (0, 0), (-1, -1), 7),
    ]))
    sso = Table([[Paragraph('<font color="#fcd34d"><b>Sign in with SSO</b></font>', DCELL)]], colWidths=[SCREEN_W - 2.4 * cm])
    sso.setStyle(TableStyle([
        ('BOX', (0, 0), (-1, -1), 0.7, AMBER), ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('TOPPADDING', (0, 0), (-1, -1), 6), ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]))
    rows = [
        [[Paragraph('<font color="#fcd34d"><b>Sentinel</b></font> &nbsp; <font color="#cbd5e1">Restricted area</font>', DCELL),
          Paragraph('Management pages require access', DMUTED)]],
        [field('PASSWORD', '............')],
        [[btn]],
        [[Paragraph('<font color="#64748b">or</font>', DMUTED)]],
        [[sso]],
        [[Paragraph('SSO via OpenID Connect (PKCE) - Entra ID / Okta / Keycloak.', DMUTED)]],
    ]
    inner = Table(rows, colWidths=[SCREEN_W])
    inner.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), PANEL_BG),
        ('LEFTPADDING', (0, 0), (-1, -1), 12), ('RIGHTPADDING', (0, 0), (-1, -1), 12),
        ('TOPPADDING', (0, 0), (-1, -1), 7), ('BOTTOMPADDING', (0, 0), (-1, -1), 7),
        ('ALIGN', (0, 3), (0, 3), 'CENTER'),
    ]))
    return screen_mock('Access gate', inner,
                       'Figure 5 - The management pages (/services, /settings) sit behind a password or SSO gate (illustrative data).')


def mock_history():
    """History modal for a simple service (Figure 6)."""
    head = [Paragraph(h, DHEAD) for h in ['When', 'Level', 'Message']]
    rows = [
        ('08 Jun 2026 09:14', _pill('Minor incident', '#f97316'),  'Re-routing in WEU - investigating'),
        ('08 Jun 2026 07:02', _pill('Degraded', '#eab308'),        'Elevated error rates in WEU'),
        ('07 Jun 2026 22:31', _pill('Operational', '#22c55e'),     'All systems operational'),
        ('06 Jun 2026 14:08', _pill('Maintenance', '#3b82f6'),     'Scheduled maintenance completed'),
    ]
    data = [head] + [[Paragraph(r[0], DMUTED), Paragraph(r[1], DCELL), Paragraph(r[2], DCELL)] for r in rows]
    return screen_mock('History - Cloudflare',
                       _dark_table(data, [4.2 * cm, 3.4 * cm, 8.4 * cm]),
                       'Figure 6 - Per-service history keeps the last 50 state changes; a new row is added only when the level '
                       'or message actually changes (illustrative data).')


# ---------------------------------------------------------------------------
# Page templates
# ---------------------------------------------------------------------------

def cover_page(canvas, doc):
    """Dark cover with gradient bars, Sentinel logo, title, badge, info card."""
    w, h = A4

    canvas.setFillColor(DARK_BG)
    canvas.rect(0, 0, w, h, fill=1, stroke=0)

    # Top gradient bar (amber -> gold -> light gold, simulated via 3 segments)
    bar_h = 8 * mm
    seg_w = w / 3
    for i, color in enumerate([AMBER_BRIGHT, GOLD, GOLD_LIGHT]):
        canvas.setFillColor(color)
        canvas.rect(i * seg_w, h - bar_h, seg_w, bar_h, fill=1, stroke=0)
    # Bottom gradient bar (mirrored)
    for i, color in enumerate([GOLD_LIGHT, GOLD, AMBER_BRIGHT]):
        canvas.setFillColor(color)
        canvas.rect(i * seg_w, 0, seg_w, bar_h, fill=1, stroke=0)

    # App logo — centred, as the cover hero above the title
    logo_size = 3.4 * cm
    logo_x = (w - logo_size) / 2
    logo_y = h / 2 + 4.3 * cm
    drawn = False
    if LOGO_PNG:
        try:
            canvas.drawImage(LOGO_PNG, logo_x, logo_y, logo_size, logo_size,
                             mask='auto', preserveAspectRatio=True)
            drawn = True
        except Exception:
            drawn = False
    if not drawn:
        canvas.setFillColor(AMBER)
        canvas.roundRect(logo_x, logo_y, logo_size, logo_size, 16, fill=1, stroke=0)
        canvas.setFillColor(white)
        canvas.setFont('Helvetica-Bold', 26)
        canvas.drawCentredString(logo_x + logo_size / 2, logo_y + logo_size / 2 - 9, 'S')

    # INTERNAL — CONFIDENTIAL badge (top-right)
    badge_w, badge_h = 6.0 * cm, 0.85 * cm
    badge_x, badge_y = w - 2 * cm - badge_w, h - 4 * cm
    canvas.setFillColor(RED)
    canvas.roundRect(badge_x, badge_y, badge_w, badge_h, 4, fill=1, stroke=0)
    canvas.setFillColor(white)
    canvas.setFont('Helvetica-Bold', 10)
    canvas.drawCentredString(badge_x + badge_w / 2, badge_y + badge_h / 2 - 3, 'INTERNAL — CONFIDENTIAL')

    # Title block (centered)
    canvas.setFillColor(white)
    canvas.setFont('Helvetica-Bold', 30)
    canvas.drawCentredString(w / 2, h / 2 + 2.5 * cm, 'Sentinel')
    canvas.setFillColor(AMBER_BRIGHT)
    canvas.setFont('Helvetica', 15)
    canvas.drawCentredString(w / 2, h / 2 + 1.6 * cm, 'Service Status Dashboard')
    canvas.setFillColor(HexColor('#94a3b8'))
    canvas.setFont('Helvetica', 12)
    canvas.drawCentredString(w / 2, h / 2 + 1.0 * cm, 'EUDA Technical Documentation v1.0')

    # Info card (centered, below title)
    info_x, info_y = (w - 12 * cm) / 2, h / 2 - 3.6 * cm
    info_w, info_h = 12 * cm, 4 * cm
    canvas.setFillColor(DARK_PANEL)
    canvas.setStrokeColor(AMBER_BRIGHT)
    canvas.setLineWidth(0.6)
    canvas.roundRect(info_x, info_y, info_w, info_h, 8, fill=1, stroke=1)
    label_x = info_x + 1.5 * cm
    value_x = info_x + 5.5 * cm
    rows = [
        ('APPLICATION', 'Sentinel — Service Status Dashboard'),
        ('VERSION', '1.0 (Nuxt 3 / Nitro)'),
        ('DATE', 'June 2026'),
        ('CLASSIFICATION', 'EUDA — Low-Medium Risk Tier'),
    ]
    line_h = 0.7 * cm
    start_y = info_y + info_h - 1 * cm
    for i, (label, value) in enumerate(rows):
        canvas.setFillColor(TEXT_MUTED)
        canvas.setFont('Helvetica-Bold', 8)
        canvas.drawString(label_x, start_y - i * line_h, label)
        canvas.setFillColor(white)
        canvas.setFont('Helvetica', 10)
        canvas.drawString(value_x, start_y - i * line_h, value)

    # Footer author block
    canvas.setFillColor(AMBER_BRIGHT)
    canvas.setFont('Helvetica-Bold', 12)
    canvas.drawCentredString(w / 2, 3 * cm, 'Prepared by Adrien Luce')
    canvas.setFillColor(HexColor('#cbd5e1'))
    canvas.setFont('Helvetica', 9.5)
    canvas.drawCentredString(w / 2, 2.5 * cm, 'End User Support Engineer')
    canvas.drawCentredString(w / 2, 2.1 * cm, 'Paris IT · End User Services Europe')


def standard_page(canvas, doc):
    """Header (amber underline + title), footer (credit + page number)."""
    w, h = A4
    canvas.setStrokeColor(AMBER)
    canvas.setLineWidth(0.6)
    canvas.line(2 * cm, h - 1.6 * cm, w - 2 * cm, h - 1.6 * cm)
    canvas.setFillColor(AMBER_DARK)
    canvas.setFont('Helvetica-Bold', 8)
    canvas.drawString(2 * cm, h - 1.3 * cm, 'Sentinel — Service Status Dashboard — EUDA v1')
    canvas.setFillColor(RED)
    canvas.setFont('Helvetica-Bold', 7.5)
    canvas.drawRightString(w - 2 * cm, h - 1.3 * cm, 'INTERNAL — CONFIDENTIAL')
    canvas.setFillColor(AMBER)
    canvas.setFont('Helvetica-Bold', 8)
    canvas.drawString(2 * cm, 1.2 * cm, 'Developed by Adrien Luce · Paris IT · End User Services Europe')
    canvas.setFillColor(TEXT_MUTED)
    canvas.setFont('Helvetica', 8)
    canvas.drawRightString(w - 2 * cm, 1.2 * cm, f'Page {doc.page}')


# ---------------------------------------------------------------------------
# Content
# ---------------------------------------------------------------------------

def build_story():
    s = []

    # ---- PAGE 1 — Cover (drawn by onFirstPage) ------------------------------
    s.append(Spacer(1, 1 * cm))
    s.append(PageBreak())

    # ---- PAGE 2 — Document Control ------------------------------------------
    s.append(section_title('Document Control'))
    s.append(kv_table([
        ('Document Title',      'Sentinel — Service Status Dashboard — EUDA Technical Documentation'),
        ('Application',         'Sentinel (internal codename: dashboard-concentrateur-status)'),
        ('Version',             '1.0 (Nuxt 3 / Nitro)'),
        ('Status',              'For Review'),
        ('Owner',               'Adrien Luce — End User Support Engineer'),
        ('Classification',      'EUDA — End User Developed Application'),
        ('Risk Tier',           'LOW-MEDIUM'),
        ('Data Classification', 'Internal — Restricted'),
        ('Date of Issue',       'June 2026'),
        ('Next Review',         'June 2027'),
        ('Distribution',        'Paris IT — End User Services Europe'),
    ]))
    s.append(Spacer(1, 0.6 * cm))
    s.append(Paragraph('Version History', H2))
    s.append(data_table(
        ['Version', 'Date', 'Author', 'Description'],
        [
            ['0.9', 'May 2026', 'Adrien Luce',
             'Internal prototype (French UI): server-side scheduler, WebSocket fan-out, built-in adapters '
             '(GitHub, Atlassian Statuspage, AWS, Azure DevOps, RSS/Atom, Ping) and the visual custom-mapping '
             'editor with the interactive JSON tree. Config persisted in Nitro fs storage.'],
            ['1.0', 'June 2026', 'Adrien Luce',
             'First reviewed release. Full English migration (UI + code comments) and a modernised interface '
             '(glass header with the Sentinel brand mark, gradient status hero, indigo/violet accent system, '
             'light/dark themes). Incident detail in the history modal + per-incident mapping '
             '(incidentsPath / title / level / message). Optional RSS filtering (time window / keywords / '
             'exclude-resolved) to tame high-volume feeds such as AWS. Hardened outbound fetch via undici '
             '(browser headers, real transport-error reporting, corporate proxy / CA / SSL-inspection support). '
             'Server-assisted SSO (OIDC PKCE) with an httpOnly session cookie. A curated set of 26 status sources '
             '(80 monitored endpoints) for a finance-firm IT department.'],
        ],
        col_widths=[2 * cm, 2.4 * cm, 3 * cm, 9.1 * cm],
    ))
    s.append(PageBreak())

    # ---- PAGE 3 — Table of Contents -----------------------------------------
    s.append(section_title('Table of Contents'))
    toc_rows = [
        ['1.',  'Executive Summary',                       '4'],
        ['2.',  'EUDA Classification & Compliance',        '5'],
        ['3.',  'System Overview',                         '6'],
        ['4.',  'Technical Architecture',                  '7'],
        ['5.',  'Adapters & Data Processing',              '8'],
        ['6.',  'Monitored Services',                      '10'],
        ['7.',  'Authentication & Access Control',         '11'],
        ['8.',  'Configuration & Persistence',             '12'],
        ['9.',  'Features & Functionality',                '13'],
        ['10.', 'Security Considerations',                 '14'],
        ['11.', 'Deployment & Operations',                 '15'],
        ['12.', 'Testing & Validation',                    '16'],
        ['13.', 'Change Management',                       '17'],
        ['14.', 'Backup, Recovery & Business Continuity',  '18'],
        ['15.', 'Risk Assessment',                         '19'],
        ['16.', 'Roadmap',                                 '20'],
        ['17.', 'Glossary & Acronyms',                     '21'],
        ['A.',  'Appendix A — Application Screens',        '22'],
        ['18.', 'Declaration & Sign-off',                  '24'],
    ]
    t = Table(toc_rows, colWidths=[1.3 * cm, 12.7 * cm, 2.5 * cm])
    t.setStyle(TableStyle([
        ('VALIGN',     (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING',(0, 0), (-1, -1), 4),
        ('RIGHTPADDING',(0, 0), (-1, -1), 4),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING',(0, 0), (-1, -1), 4),
        ('TEXTCOLOR',  (0, 0), (0, -1),  AMBER),
        ('FONTNAME',   (0, 0), (0, -1),  'Helvetica-Bold'),
        ('FONTSIZE',   (0, 0), (-1, -1), 10),
        ('TEXTCOLOR',  (1, 0), (1, -1),  TEXT_PRIMARY),
        ('TEXTCOLOR',  (2, 0), (2, -1),  TEXT_MUTED),
        ('ALIGN',      (2, 0), (2, -1),  'RIGHT'),
        ('LINEBELOW',  (0, 0), (-1, -1), 0.3, HexColor('#e2e8f0')),
    ]))
    s.append(t)
    s.append(Spacer(1, 0.5 * cm))
    s.append(Paragraph(
        'Illustrative application screens (Figures 1-6) are collected in Appendix A. '
        'All values shown in the figures are fictitious sample data.', SMALL))
    s.append(PageBreak())

    # ---- PAGE 4 — Executive Summary -----------------------------------------
    s.append(section_title('1. Executive Summary'))
    s.append(Paragraph(
        '<b>Sentinel</b> is a self-hosted web application that consolidates the operational status of the '
        'external services and platforms the firm depends on - public vendor status pages, RSS / Atom incident '
        'feeds, and any custom JSON or HTTP endpoint - into a single, real-time pane of glass. A server-side '
        'scheduler polls each source on its own interval, normalises the result through a small library of '
        '<i>adapters</i> into a common status model, and pushes every change to all connected browsers over a '
        'WebSocket. Ten people watching the dashboard generate <b>one</b> outbound call per source, not ten - '
        'which keeps the firm well clear of vendor rate limits.', BODY_J))
    s.append(Spacer(1, 0.3 * cm))
    s.append(Paragraph('Key Metrics', H2))
    s.append(data_table(
        ['Metric', 'Value'],
        [
            ['Status sources configured',     '26 (24 simple services + 2 composites)'],
            ['Monitored endpoints',           '80 (24 simple + 7 ICE feeds + 49 Salesforce UK instances)'],
            ['Built-in adapters',             '8 (GitHub, Atlassian Statuspage, AWS, Azure DevOps, Bloomberg, RSS/Atom, Ping, Custom)'],
            ['Status levels',                 '8, with fully customisable labels and colours'],
            ['Transport',                     'WebSocket push (server polls; the browser never polls)'],
            ['Poll interval',                 'Per source, 60 s - 1200 s (1-20 min), capped server-side'],
            ['Persistence',                   'Nitro fs storage (./data) - configuration shared across all users'],
            ['Access control',                'None / Password (SHA-256) / SSO (OIDC PKCE) on the management pages'],
            ['Outbound',                      'HTTPS only, via undici; corporate proxy / CA / SSL-inspection aware'],
            ['Sensitive data handled',        'None of the firm\'s business data; only public status + any per-source API tokens'],
        ],
        col_widths=[6 * cm, 10.5 * cm],
    ))
    s.append(Spacer(1, 0.35 * cm))
    s.append(Paragraph('Business Justification', H2))
    s.append(Paragraph('Sentinel replaces a slow, manual routine the team was stuck with:', BODY))
    for txt in [
        '<b>1.</b>&nbsp;Checking a dozen vendor status pages by hand (GitHub, AWS, Cloudflare, Salesforce, ICE, '
        'Microsoft 365...) to answer "is it them or is it us?" during an incident.',
        '<b>2.</b>&nbsp;No shared, always-on view - each engineer re-discovered the same outage independently, and '
        'there was no single place to glance at before escalating.',
        '<b>3.</b>&nbsp;No way to fold the firm\'s own internal or custom endpoints into the same picture as the '
        'public vendors.',
    ]:
        s.append(Paragraph(txt, DECL_BULLET))
    s.append(PageBreak())

    # ---- PAGE 5 — EUDA Classification ---------------------------------------
    s.append(section_title('2. EUDA Classification & Compliance'))
    s.append(Paragraph(
        'Sentinel meets the criteria of an <b>End User Developed Application (EUDA)</b>: built outside the formal '
        'IT development lifecycle by a member of the operations team, used for internal operational support, and '
        'not part of any regulatory reporting chain.', BODY_J))
    s.append(Spacer(1, 0.3 * cm))
    s.append(Paragraph('Risk Tier — LOW-MEDIUM', H2))
    s.append(data_table(
        ['Criterion', 'Assessment'],
        [
            ['Data type',            'Public service-status information; no customer, financial or market data.'],
            ['Secrets handled',      'Some sources carry an API token in a per-service header (e.g. Microsoft Graph, LSEG). '
                                     'These are stored server-side in ./data and proxied server-to-server - they never reach the browser.'],
            ['Persistence',          'Local filesystem (Nitro fs storage). No external database.'],
            ['Write operations',     'Configuration only (services, mapping, levels, theme) - performed by authorised users.'],
            ['Authentication',       'Optional gate on the management pages: password (SHA-256) or SSO (OIDC PKCE).'],
            ['Network exposure',     'Outbound HTTPS to public status APIs; inbound the dashboard + WebSocket on the host.'],
            ['Customer / market data', 'None.'],
        ],
        col_widths=[4.5 * cm, 12 * cm],
    ))
    s.append(Spacer(1, 0.3 * cm))
    s.append(Paragraph(
        'The LOW-MEDIUM tier reflects two things: the application makes authenticated outbound calls on the firm\'s '
        'behalf (so a leaked per-source token is the main sensitivity), and it is an always-on web service. Both are '
        'contained by compensating controls - secrets confined to the server, SSRF protection on the proxy, an '
        'access gate on configuration, and no handling of any business data - keeping residual risk well below the '
        'threshold for a HIGH classification.', BODY_J))
    s.append(PageBreak())

    # ---- PAGE 6 — System Overview -------------------------------------------
    s.append(section_title('3. System Overview'))
    s.append(Paragraph('Data Flow (real-time path)', H2))
    s.append(data_table(
        ['Step', 'Stage', 'Description'],
        [
            ['1', 'Schedule',  'On server start, the Nitro scheduler plugin reads the config and starts one timer per enabled service (and per composite child).'],
            ['2', 'Fetch',     'At each tick it fetches the source URL directly via undici, with browser-like headers and any per-service auth header.'],
            ['3', 'Adapt',     'runAdapter() normalises the raw response (JSON or XML) into an AdapterResult { level, message, incidents, entries }.'],
            ['4', 'Snapshot',  'The result becomes a StatusSnapshot, stored in an in-memory map (lastSnapshots) as the current state.'],
            ['5', 'Broadcast', 'broadcast() pushes the snapshot to every connected WebSocket peer.'],
            ['6', 'Render',    'In the browser, useRealtimeStatus receives the snapshot and updates the matching ServiceCard - no client polling.'],
            ['7', 'New client','On connect, the server replays all known snapshots + the full config so a fresh tab is instantly populated.'],
            ['8', 'Reconfig',  'POST /api/config writes the change, calls reloadSchedulers() (start/stop timers) and broadcasts the new config to all clients.'],
        ],
        col_widths=[1 * cm, 3 * cm, 12.5 * cm],
    ))
    s.append(Spacer(1, 0.3 * cm))
    s.append(Paragraph('Key Design Choices', H2))
    s.append(Paragraph(
        '<b>WebSocket fan-in.</b> The server is the single client of each external API. N viewers = one call per '
        'interval, not N - this is the core defence against vendor rate limits (HTTP 429).', BODY_J))
    s.append(Paragraph(
        '<b>Adapters.</b> Every source is reduced to the same small contract (level, message, incidents, entries). '
        'Adding a vendor is a parsing problem, not an architecture problem; most are covered by the generic Custom '
        'adapter with no code at all.', BODY_J))
    s.append(Paragraph(
        '<b>Transport errors are not red.</b> If the status source itself is unreachable (DNS / TLS / timeout / '
        'proxy), Sentinel shows the card as "Action required" (grey) with the real cause - never a red "major '
        'incident", which would falsely imply the monitored service is down.', BODY_J))
    s.append(Paragraph(
        '<b>Server-side persistence.</b> Configuration lives on the server (Nitro fs storage), so it is shared by '
        'everyone who opens the dashboard rather than trapped in one browser\'s local storage.', BODY_J))
    s.append(PageBreak())

    # ---- PAGE 7 — Technical Architecture ------------------------------------
    s.append(section_title('4. Technical Architecture'))
    s.append(Paragraph('Technology Stack', H2))
    s.append(data_table(
        ['Component', 'Choice', 'Notes'],
        [
            ['Framework',      'Nuxt 3 (^3.13)',         'Full-stack Vue 3; Nitro server engine; SSR effectively client-rendered for the SPA shell.'],
            ['Server engine',  'Nitro',                  'HTTP + API routes, WebSocket (experimental flag), fs storage driver (base ./data).'],
            ['UI',             'Vue 3 + TypeScript',     '&lt;script setup&gt; single-file components, typed end to end.'],
            ['Styling',        'Tailwind CSS v4',        'Vite plugin, no config file; design tokens + dark theme in assets/css/main.css.'],
            ['HTTP client',    'undici 8',               'All server-side fetches; supports a global dispatcher for proxy / CA / TLS settings.'],
            ['Real-time',      'WebSocket (Nitro)',      'server/routes/_ws.ts - a peers Set + broadcast(); 3 s client auto-reconnect.'],
            ['State (client)', 'Module-level singletons','Composables hold global refs - no Pinia, no Vuex.'],
            ['Build',          'Vite',                   'Bundled by Nuxt; pnpm with onlyBuiltDependencies for @parcel/watcher + esbuild.'],
            ['Persistence',    'Nitro fs storage',       'Plain files under ./data (services, composites, levels, order, theme, accessControl...).'],
        ],
        col_widths=[3.0 * cm, 4.0 * cm, 9.5 * cm],
    ))
    s.append(Spacer(1, 0.3 * cm))
    s.append(Paragraph('Project Structure', H2))
    s.append(code_block(
        'EUS-Dashboard-v1/\n'
        '├── nuxt.config.ts            # Tailwind Vite plugin, Nitro fs storage (./data), WebSocket\n'
        '├── types/index.ts            # All shared types + constants (StatusLevel, worstLevel, ...)\n'
        '├── adapters/                 # One file per source format + the registry\n'
        '│   ├── index.ts              # runAdapter(), ADAPTER_META, PRESET_SERVICES, AdapterKey\n'
        '│   ├── github / atlassian / aws / azuredevops / bloomberg.ts\n'
        '│   ├── rss.ts                # RSS/Atom parsing + optional window/keyword filtering\n'
        '│   ├── ping.ts               # HTTP status code -> level\n'
        '│   └── custom.ts             # Generic JSON-path + levelMap (wildcards / ~contains / /regex/)\n'
        '├── composables/              # Global state + client logic (useServerConfig, useRealtimeStatus, ...)\n'
        '├── server/\n'
        '│   ├── plugins/scheduler.ts  # Server scheduler: timers, lastSnapshots, reloadSchedulers()\n'
        '│   ├── plugins/outbound.ts   # Optional proxy / CA / TLS dispatcher for locked-down networks\n'
        '│   ├── routes/_ws.ts         # WebSocket handler: peers + broadcast()\n'
        '│   └── api/                  # proxy.post.ts, config.get/post.ts, sso/* (OIDC PKCE)\n'
        '├── middleware/auth.ts        # Guards /services and /settings\n'
        '├── pages/                    # index (dashboard), services, settings, auth/*\n'
        '├── components/               # ServiceCard, ServiceForm, CompositeForm, JsonTree, ...\n'
        '├── utils/summarize.ts        # Rule-based textual summary from incidents/entries\n'
        '└── data/                     # Nitro fs storage (created automatically)'
    ))
    s.append(PageBreak())

    # ---- PAGE 8-9 — Adapters & Data Processing ------------------------------
    s.append(section_title('5. Adapters & Data Processing'))
    s.append(Paragraph(
        'Each adapter takes a raw upstream response and returns the same AdapterResult: an overall <b>level</b>, '
        'a human <b>message</b>, a list of <b>incidents</b>, and optional informational <b>entries</b> (used by '
        'RSS feeds and wildcard mappings).', BODY))
    s.append(Spacer(1, 0.2 * cm))
    s.append(data_table(
        ['Adapter', 'Source format', 'What it reads'],
        [
            ['github',      'GitHub Statuspage',     'summary.status.indicator -> level; .description -> message.'],
            ['atlassian',   'Atlassian Statuspage',  'Standard /api/v2/summary.json; also used for Notion / Bloomberg.'],
            ['aws',         'AWS Health JSON feed',  'current_events[]; empty -> operational; status text mapped.'],
            ['azuredevops', 'Azure DevOps Health',   'status.health + per-service issues and degraded geographies.'],
            ['bloomberg',   'Bloomberg (Atlassian)', 'Alias of the Atlassian format.'],
            ['rss',         'RSS 2.0 / Atom 1.0',    'Parses raw XML; newest-first; optional window/keyword/exclude-resolved filter.'],
            ['ping',        'Any HTTP URL',          'Maps the HTTP status code to a level (2xx ok, 5xx major, ...).'],
            ['custom',      'Any JSON or XML',       'Generic JSON-path + levelMap; no code required.'],
        ],
        col_widths=[2.6 * cm, 4.4 * cm, 9.5 * cm],
    ))
    s.append(Spacer(1, 0.3 * cm))
    s.append(Paragraph('The Custom adapter', H2))
    s.append(Paragraph(
        'The Custom adapter monitors almost any API without code. It resolves a <font face="Courier">statusPath</font> '
        '(and optional <font face="Courier">messagePath</font>) inside the JSON, then converts the value to a level '
        'through a <font face="Courier">levelMap</font>. The same mapping also drives explicit incident extraction '
        '(<font face="Courier">incidentsPath</font> + title / level / message sub-paths). Paths support a '
        '<font face="Courier">*</font> wildcard to iterate arrays (overall level = worst across items).', BODY_J))
    s.append(Spacer(1, 0.15 * cm))
    s.append(Paragraph('levelMap pattern syntax', H3))
    s.append(data_table(
        ['Syntax', 'Example', 'Behaviour'],
        [
            ['Exact',    'none',          'Case-insensitive exact match'],
            ['Wildcard', 'healthy*',      'Glob - any value starting with "healthy"'],
            ['Contains', '~advisory',     'Any value containing "advisory"'],
            ['Regex',    '/^(ok|up)$/i',  'JavaScript regular expression with flags'],
        ],
        col_widths=[3 * cm, 4.5 * cm, 9 * cm],
    ))
    s.append(Spacer(1, 0.3 * cm))
    s.append(Paragraph('RSS filtering', H2))
    s.append(Paragraph(
        'High-volume feeds (e.g. the AWS <font face="Courier">all.rss</font> firehose) would otherwise sit '
        'permanently red. An optional per-source filter keeps only entries within a time window, matching at least '
        'one keyword, and not already resolved - turning the firehose into a relevant signal. Example: AWS is scoped '
        'to a 24-hour window and the regions eu-west-1, ap-southeast-1 and us-east-1.', BODY_J))
    s.append(Spacer(1, 0.2 * cm))
    s.append(Paragraph('Proxy, cache & SSRF', H2))
    s.append(Paragraph(
        'Manual tests from the UI go through <font face="Courier">POST /api/proxy</font>, which caches GET responses '
        'for ~120 s, blocks private-network targets (localhost, 127.0.0.1, 0.0.0.0, 10.*, 192.168.*) to prevent '
        'SSRF, and surfaces a real 502 with the upstream cause instead of a generic 500. The background scheduler '
        'fetches sources directly (not through the proxy) for efficiency.', BODY_J))
    s.append(PageBreak())

    # ---- PAGE 10 — Monitored Services ---------------------------------------
    s.append(section_title('6. Monitored Services'))
    s.append(Paragraph(
        'The shipped configuration curates 26 sources relevant to a finance-firm IT department. A selection is '
        'shown below; the Microsoft 365 / Graph sources are staged but disabled until a Graph token is supplied.', BODY))
    s.append(Spacer(1, 0.2 * cm))
    s.append(data_table(
        ['Source', 'Group', 'Adapter', 'Notes'],
        [
            ['GitHub',           'Dev',            'github',     'githubstatus.com summary.json'],
            ['Claude / Anthropic','Dev',           'atlassian',  'status.anthropic.com'],
            ['AWS Services',     'Infrastructure', 'rss',        '24h window, scoped to eu-west-1 / ap-southeast-1 / us-east-1'],
            ['Cloudflare',       'Infrastructure', 'atlassian',  'cloudflarestatus.com'],
            ['Microsoft Azure',  'Infrastructure', 'rss',        'azure.status.microsoft feed'],
            ['Google Cloud',     'Infrastructure', 'rss',        'status.cloud.google.com Atom feed'],
            ['Okta',             'Infrastructure', 'custom',     'FeedBurner RSS -> keyword levelMap'],
            ['Datadog',          'Observability',  'atlassian',  'status.datadoghq.com'],
            ['Snowflake',        'Data Platforms', 'atlassian',  'status.snowflake.com'],
            ['Atlassian',        'Collaboration',  'atlassian',  'status.atlassian.com'],
            ['Zoom',             'Collaboration',  'atlassian',  'zoomstatus.com'],
            ['Slack',            'Collaboration',  'custom',     'slack-status.com RSS -> keyword levelMap'],
            ['Nasdaq Data Link', 'Market Data',    'atlassian',  'status.data.nasdaq.com'],
            ['LSEG Workspace',   'Market Data',    'custom',     'liveservice.lseg.com'],
            ['ServiceNow',       'Business Apps',  'custom',     'datacenters API (Origin/Referer gated), per-DC incidents'],
            ['ICE (composite)',  'Market Data',    'custom',     '7 RSS feeds incl. the consolidated global feed'],
            ['Salesforce UK (composite)', 'Business Apps', 'custom', '49 GBR instances via the Salesforce Trust API'],
        ],
        col_widths=[4.4 * cm, 3.0 * cm, 2.2 * cm, 6.9 * cm],
    ))
    s.append(Spacer(1, 0.25 * cm))
    s.append(Paragraph(
        '<b>Composites.</b> ICE and Salesforce UK each group many URLs under one card; the card\'s level is the '
        'worst among its children, and a detail view lists the children worst-first. Both inherit a single shared '
        'mapping (defaultAdapter / defaultMapping) so every child is configured once.', BODY))
    s.append(PageBreak())

    # ---- PAGE 11 — Authentication & Access Control --------------------------
    s.append(section_title('7. Authentication & Access Control'))
    s.append(Paragraph(
        'The dashboard itself is read-only and open. The <b>management pages</b> (/services, /settings) are guarded '
        'by the <font face="Courier">auth</font> middleware, with three selectable modes:', BODY_J))
    s.append(Spacer(1, 0.2 * cm))
    s.append(data_table(
        ['Mode', 'How it works', 'Session'],
        [
            ['None',     'Anyone can view and edit the configuration (default for a trusted internal network).', 'n/a'],
            ['Password', 'A SHA-256 hash of the password is stored server-side; the entered password is hashed and compared.',
             'sessionStorage (lasts for the browser tab).'],
            ['SSO (OIDC PKCE)',
             'Authentication is delegated to a corporate IdP. The Authorization Code + PKCE flow runs with no client '
             'secret; the server exchanges the code for tokens and sets an httpOnly session cookie.',
             'httpOnly cookie (1 h by default).'],
        ],
        col_widths=[3.4 * cm, 9.6 * cm, 3.5 * cm],
    ))
    s.append(Spacer(1, 0.3 * cm))
    s.append(Paragraph('SSO endpoints', H2))
    s.append(Paragraph(
        'Server-side helpers keep the flow safe and provider-agnostic: '
        '<font face="Courier">GET /api/sso/discover</font> reads the IdP\'s '
        '<font face="Courier">.well-known/openid-configuration</font>; '
        '<font face="Courier">POST /api/sso/callback</font> exchanges the authorization code + PKCE verifier for '
        'tokens and sets the httpOnly cookie; <font face="Courier">GET /api/sso/session</font> reports whether a '
        'valid session exists; <font face="Courier">POST /api/sso/logout</font> clears it. Compatible with Entra ID, '
        'Okta, Keycloak, Auth0 and Google Workspace.', BODY_J))
    s.append(Paragraph(
        'Because the code-for-token exchange happens on the server and the resulting token is stored in an httpOnly '
        'cookie, the access token is never exposed to client-side JavaScript.', BODY))
    s.append(PageBreak())

    # ---- PAGE 12 — Configuration & Persistence ------------------------------
    s.append(section_title('8. Configuration & Persistence'))
    s.append(Paragraph(
        'All configuration is persisted by the Nitro fs storage driver as plain files under '
        '<font face="Courier">./data</font>, so it is shared by every user of the deployment. Writes are partial: '
        'saving a level change touches only the <font face="Courier">levels</font> key.', BODY_J))
    s.append(Spacer(1, 0.2 * cm))
    s.append(data_table(
        ['File (./data)', 'Holds', 'Shape'],
        [
            ['services',      'Simple services',                 'ServiceConfig[]'],
            ['composites',    'Composite services + children',   'CompositeServiceConfig[]'],
            ['order',         'Drag-and-drop display order',     'string[] (ordered IDs)'],
            ['levels',        'Per-level label + colour',        'LevelConfig[]'],
            ['theme',         'UI theme',                        "'light' | 'dark'"],
            ['pageStyle',     'Card layout',                     "'box' | 'large'"],
            ['accessControl', 'Access mode + password hash / SSO settings', '{ mode, passwordHash?, sso* }'],
        ],
        col_widths=[3.4 * cm, 7.6 * cm, 5.5 * cm],
    ))
    s.append(Spacer(1, 0.3 * cm))
    s.append(Paragraph(
        '<font face="Courier">GET /api/config</font> returns the whole set; '
        '<font face="Courier">POST /api/config</font> writes one key at a time. When '
        '<font face="Courier">services</font> or <font face="Courier">composites</font> change, the server calls '
        '<font face="Courier">reloadSchedulers()</font> (so timers start/stop immediately) and broadcasts the new '
        'config to every connected client. On first boot, a one-time migration imports any pre-existing '
        'localStorage configuration into the server store.', BODY_J))
    s.append(PageBreak())

    # ---- PAGE 13 — Features & Functionality ---------------------------------
    s.append(section_title('9. Features & Functionality'))
    s.append(data_table(
        ['Area', 'Description'],
        [
            ['Real-time dashboard',
             'Service cards grouped by section, a colour-coded status hero summarising the worst active level, and '
             'live healthy / degraded counts. Updates arrive over WebSocket with no client polling.'],
            ['Service management',
             'Add / edit / enable / disable simple services from a two-column form: configure on the left, Test live '
             'against the source on the right. Two save buttons - "Save" (keep open) and "Save & close".'],
            ['Composites',
             'Group many URLs under one logical card with a shared inherited mapping. A detail modal lists children '
             'worst-first with up/down keyboard navigation; children are drag-and-drop reorderable.'],
            ['Custom mapping + JSON tree',
             'After a Test, the response renders as an interactive JSON tree; clicking a leaf offers to bind it as '
             'statusPath or messagePath (with a wildcard suggestion when the value is inside an array).'],
            ['Status levels',
             'Eight levels with editable labels and hex colours, applied across the deployment. Badges use inline '
             'styles derived from the chosen colour.'],
            ['History',
             'Per-service history of the last 50 state changes; a new entry is recorded only when the level or '
             'message actually changes. The detail modal shows the current state plus the incident list.'],
            ['Display',
             'Compact (dense multi-column) or normal layout; light / dark theme; drag-and-drop ordering of services '
             'and sub-services; toast confirmations on every save.'],
            ['Resilience',
             'Unreachable sources are shown grey ("Action required") with the real cause, not red; auto-reconnecting '
             'WebSocket; graceful fallback to localStorage if the server is briefly unreachable.'],
        ],
        col_widths=[3.6 * cm, 12.9 * cm],
    ))
    s.append(PageBreak())

    # ---- PAGE 14 — Security Considerations ----------------------------------
    s.append(section_title('10. Security Considerations'))
    s.append(data_table(
        ['Control', 'Implementation'],
        [
            ['Secrets stay server-side',
             'Per-source API tokens live in ./data and are sent only from the server when polling. They are never '
             'shipped to the browser, and the proxy keeps credentials server-to-server.'],
            ['SSRF protection',
             'The proxy rejects private / loopback targets (localhost, 127.0.0.1, 0.0.0.0, 10.*, 192.168.*) so it '
             'cannot be turned into a probe of the internal network.'],
            ['Outbound hardening',
             'undici with browser-like headers; an optional global dispatcher (server/plugins/outbound.ts) adds '
             'corporate proxy support, a custom root CA (merged with Node\'s defaults), or - as a last resort on a '
             'trusted SSL-inspection network - disables TLS verification, all via environment variables and off by default.'],
            ['Access gate',
             'Management pages require password (SHA-256) or SSO (OIDC PKCE) when enabled; the SSO token is held in '
             'an httpOnly cookie, never readable by client JavaScript.'],
            ['Honest error states',
             'A transport failure is reported as "Action required" (grey) with the cause, so an unreachable status '
             'source is never mistaken for a real outage of the monitored service.'],
            ['No telemetry',
             'Sentinel makes no analytics or third-party calls beyond the status sources it is configured to poll.'],
            ['Code signing / TLS termination',
             'Production deployments should sit behind the corporate reverse proxy / TLS terminator; the secure CA '
             'option (STATUS_CA_FILE) is preferred over disabling verification.'],
        ],
        col_widths=[4 * cm, 12.5 * cm],
    ))
    s.append(PageBreak())

    # ---- PAGE 15 — Deployment & Operations ----------------------------------
    s.append(section_title('11. Deployment & Operations'))
    s.append(Paragraph('Requirements', H2))
    s.append(Paragraph(
        'Node.js 20+ (or Docker) and a host with a <b>persistent filesystem</b> - the Nitro fs storage needs a '
        'durable disk. Sentinel is therefore <b>not</b> suited to Vercel / Netlify; a VPS, dedicated server or a '
        'container with a mounted volume is the right home.', BODY_J))
    s.append(Spacer(1, 0.2 * cm))
    s.append(Paragraph('Build & run', H2))
    s.append(code_block(
        'pnpm install\n'
        'pnpm build\n'
        'node .output/server/index.mjs        # or: pm2 start .output/server/index.mjs --name sentinel\n'
        '\n'
        '# Docker: mount a volume at /app/.data so configuration survives restarts\n'
        'docker run -d -p 3000:3000 -v /srv/sentinel-data:/app/.data --name sentinel sentinel'
    ))
    s.append(Spacer(1, 0.2 * cm))
    s.append(Paragraph('Environment variables', H2))
    s.append(data_table(
        ['Variable', 'Purpose', 'Default'],
        [
            ['PORT',               'Listen port',                                        '3000'],
            ['NITRO_HOST',         'Listen interface',                                   '0.0.0.0'],
            ['HTTPS_PROXY / HTTP_PROXY', 'Route outbound status fetches via a corporate proxy (NO_PROXY honoured)', '(unset)'],
            ['STATUS_CA_FILE',     'Path to the corporate root CA (PEM) - secure fix for SSL inspection', '(unset)'],
            ['STATUS_INSECURE_TLS','Disable outbound TLS verification - quick fix, trusted networks only', '(unset)'],
        ],
        col_widths=[4.2 * cm, 9.3 * cm, 3 * cm],
    ))
    s.append(PageBreak())

    # ---- PAGE 16 — Testing & Validation -------------------------------------
    s.append(section_title('12. Testing & Validation'))
    s.append(Paragraph('Build-time checks', H2))
    s.append(data_table(
        ['Stage', 'Check', 'Command'],
        [
            ['Build',      'Nuxt + Nitro compile cleanly to .output/', 'pnpm build'],
            ['Types',      'TypeScript types resolve across app + server', 'nuxt typecheck (vue-tsc)'],
            ['Post-build', 'The server boots and the scheduler logs "active"', 'node .output/server/index.mjs'],
        ],
        col_widths=[2.6 * cm, 9.4 * cm, 4.5 * cm],
    ))
    s.append(Spacer(1, 0.3 * cm))
    s.append(Paragraph('Source validation', H2))
    s.append(Paragraph(
        'New or changed sources are validated against the live endpoint before going in: the URL must return HTTP '
        '200 and the chosen adapter must produce the expected level and message. Mapping logic for the trickier '
        'sources (ServiceNow, Slack, Okta, Salesforce, the AWS RSS filter) was checked with small offline Node '
        'scripts that feed a captured payload through the real adapter, so the parsing is verified independently of '
        'network reachability.', BODY_J))
    s.append(Spacer(1, 0.2 * cm))
    s.append(Paragraph('Smoke tests (manual)', H2))
    s.append(data_table(
        ['Area', 'Test'],
        [
            ['Boot',        'Start the server -> the dashboard loads and cards populate from replayed snapshots.'],
            ['Real-time',   'Open two tabs -> a status change appears in both within one poll interval.'],
            ['Add source',  'Add a service, Test -> a green 200 with the mapped level and message; Save -> a card appears.'],
            ['Composite',   'Open a composite -> children are listed worst-first; the card shows the worst level.'],
            ['Access gate', 'Enable Password -> /services and /settings require the password; wrong password is rejected.'],
            ['Resilience',  'Point a source at an unreachable host -> the card goes grey with the cause, not red.'],
        ],
        col_widths=[2.8 * cm, 13.7 * cm],
    ))
    s.append(PageBreak())

    # ---- PAGE 17 — Change Management ----------------------------------------
    s.append(section_title('13. Change Management'))
    s.append(Paragraph('Change categories', H2))
    s.append(data_table(
        ['Category', 'Examples', 'Approval'],
        [
            ['Config change',  'Add / edit a source, change a level label or colour, reorder cards', 'Self (authorised user)'],
            ['UI tweak',       'Style change, copy edit',                                            'Self'],
            ['New adapter',    'Add a parser for a new source format',                               'Self + smoke test'],
            ['Auth change',    'Switch access mode, configure SSO',                                  'Self + Compliance review'],
            ['Major release',  'New external dependency, change in data scope or exposure',          'Self + Line Manager + Compliance'],
        ],
        col_widths=[3 * cm, 8 * cm, 5.5 * cm],
    ))
    s.append(Spacer(1, 0.3 * cm))
    s.append(Paragraph('Change process', H2))
    for n, txt in enumerate([
        'Edit on a feature branch; commit to git.',
        'Run <font face="Courier">pnpm build</font> (and typecheck) locally.',
        'For a new source, validate it returns HTTP 200 with the expected mapped level/message.',
        'Smoke test in dev (<font face="Courier">pnpm dev</font>): real-time update, access gate, resilience.',
        'Merge to main and redeploy (restart the Node process / container).',
    ], start=1):
        s.append(Paragraph(f'<b>{n}.</b>&nbsp;{txt}', DECL_BULLET))
    s.append(Spacer(1, 0.2 * cm))
    s.append(Paragraph('Rollback', H2))
    s.append(Paragraph(
        'Roll back by checking out the previous git commit and redeploying. Configuration is data, not code: the '
        './data files are unaffected by a code rollback, and a bad config change can be reverted in the UI or by '
        'restoring the relevant ./data file from backup.', BODY_J))
    s.append(PageBreak())

    # ---- PAGE 18 — Backup, Recovery & BCP -----------------------------------
    s.append(section_title('14. Backup, Recovery & Business Continuity'))
    s.append(Paragraph('Backup strategy', H2))
    s.append(data_table(
        ['Asset', 'Backup mechanism', 'Frequency'],
        [
            ['Source code',     'git (mirror to corporate Git recommended)',          'Continuous (commits)'],
            ['Configuration',   'The ./data folder (plain files) - include in the host backup or a volume snapshot', 'Daily recommended'],
            ['Runtime state',   'In-memory snapshots - rebuilt automatically on restart from the next poll',         'n/a'],
        ],
        col_widths=[3.5 * cm, 9.5 * cm, 3.5 * cm],
    ))
    s.append(Spacer(1, 0.3 * cm))
    s.append(Paragraph('Recovery targets', H2))
    s.append(data_table(
        ['Metric', 'Target'],
        [
            ['RTO', '< 1 hour - redeploy from git and restore the ./data folder.'],
            ['RPO', 'Last ./data backup. Configuration changes are infrequent, so a daily backup is sufficient.'],
            ['During a source outage', 'Only that one card is affected (grey, with the cause); the rest of the dashboard is unaffected.'],
        ],
        col_widths=[3.5 * cm, 13 * cm],
    ))
    s.append(Spacer(1, 0.3 * cm))
    s.append(Paragraph('Business continuity', H2))
    s.append(Paragraph(
        '<b>Author absence.</b> Sentinel is a standard Nuxt 3 application with no proprietary tooling; a successor '
        'can run, configure and extend it from this document and the source code alone.', BODY_J))
    s.append(Paragraph(
        '<b>Host loss.</b> Redeploy the container/process on any Node 20+ host and restore the ./data folder - the '
        'dashboard repopulates itself from the next poll cycle.', BODY_J))
    s.append(PageBreak())

    # ---- PAGE 19 — Risk Assessment ------------------------------------------
    s.append(section_title('15. Risk Assessment'))
    s.append(data_table(
        ['Risk', 'Likelihood', 'Impact', 'Mitigation', 'Residual'],
        [
            ['Vendor rate-limiting (429)',
             'Low', 'Low',
             'Server-side polling + WebSocket fan-in (one call per source regardless of viewers); proxy cache; per-source intervals.',
             'LOW'],
            ['Status source unreachable read as an outage',
             'Medium', 'Low',
             'Transport failures are classified as "Action required" (grey) with the cause, never a red incident.',
             'LOW'],
            ['Per-source API token leak',
             'Low', 'Medium',
             'Tokens stay server-side (./data) and are proxied server-to-server; never sent to the browser. Rotatable at the source.',
             'LOW'],
            ['SSRF via the proxy',
             'Low', 'Medium',
             'Private / loopback targets are blocked in proxy.post.ts; only outbound public HTTPS is permitted.',
             'LOW'],
            ['Corporate TLS inspection breaks fetches',
             'Medium', 'Low',
             'outbound.ts supports a corporate proxy and a custom root CA (secure), with an insecure-TLS escape hatch for trusted networks only.',
             'LOW'],
            ['Unauthorised config change',
             'Low', 'Low',
             'Optional access gate (password / SSO) on the management pages; changes are reversible (config is data).',
             'LOW'],
            ['Configuration loss (host failure)',
             'Low', 'Low',
             './data backups / volume snapshots; redeploy from git; runtime state self-heals on restart.',
             'LOW'],
            ['Dependency vulnerability',
             'Low', 'Medium',
             'Small dependency surface (Nuxt, undici, Tailwind); routine pnpm updates; no business data at risk.',
             'LOW'],
        ],
        col_widths=[4 * cm, 1.6 * cm, 1.6 * cm, 7.0 * cm, 1.7 * cm],
    ))
    s.append(Spacer(1, 0.3 * cm))
    s.append(Paragraph('Overall rating', H2))
    s.append(Paragraph(
        'The aggregate residual risk is <b>LOW-MEDIUM</b>, driven mainly by the handling of per-source API tokens '
        'and the always-on nature of the service. No single risk has a residual rating above MEDIUM, and all are '
        'offset by compensating controls (server-side secrets, SSRF protection, an access gate, honest error '
        'states, and the complete absence of business data).', BODY_J))
    s.append(PageBreak())

    # ---- PAGE 20 — Roadmap --------------------------------------------------
    s.append(section_title('16. Roadmap'))
    s.append(Paragraph(
        'The following are under consideration and are <b>not</b> part of the v1.0 release. Some configuration keys '
        'for them already exist in the data model but are not yet wired to runtime behaviour:', BODY_J))
    s.append(Spacer(1, 0.15 * cm))
    s.append(data_table(
        ['Item', 'Idea', 'Status'],
        [
            ['Pre-detection',
             'Surface early community signal (e.g. a spike of Reddit posts) before a vendor updates its own status page.',
             'Config field present (preDetection); not implemented'],
            ['DownDetector cross-check',
             'Corroborate a suspected incident against a public outage-reporting site.',
             'Config field present (downDetector); not implemented'],
            ['Alerting',
             'Push a Teams / email alert (via Power Automate) when a source crosses a chosen severity.',
             'Planned'],
            ['Microsoft 365 sources',
             'Enable the staged Graph-based M365 / Entra / Defender sources once a token is provisioned.',
             'Staged (disabled)'],
        ],
        col_widths=[3.4 * cm, 8.6 * cm, 4.5 * cm],
    ))
    s.append(PageBreak())

    # ---- PAGE 21 — Glossary -------------------------------------------------
    s.append(section_title('17. Glossary & Acronyms'))
    s.append(data_table(
        ['Term', 'Definition'],
        [
            ['Adapter',     'A small function that turns one source format into the common AdapterResult model.'],
            ['AdapterResult','The contract every adapter returns: level, message, incidents, optional entries.'],
            ['Atlassian Statuspage', 'The widely used /api/v2/summary.json status format (GitHub, Cloudflare, Atlassian, ...).'],
            ['Composite',   'A service made of several child URLs; its level is the worst among the children.'],
            ['EUDA',        'End User Developed Application - software built outside the formal IT delivery cycle by an end user.'],
            ['levelMap',    'A value->level table in the Custom adapter (exact / wildcard / ~contains / /regex/).'],
            ['Nitro',       'The server engine inside Nuxt 3 (HTTP, API routes, storage, WebSocket).'],
            ['Nuxt 3',      'The full-stack Vue 3 framework Sentinel is built on.'],
            ['OIDC / PKCE', 'OpenID Connect with Proof Key for Code Exchange - the secret-less SSO flow used here.'],
            ['Ping',        'An adapter that maps an HTTP status code to a level (2xx ok, 5xx major, ...).'],
            ['RSS / Atom',  'XML feed formats parsed by the rss adapter; supports window / keyword filtering.'],
            ['Snapshot',    'A StatusSnapshot - the current state of one service at a point in time.'],
            ['SSRF',        'Server-Side Request Forgery - mitigated by blocking private / loopback targets in the proxy.'],
            ['StatusLevel', 'One of the eight levels (operational, leger, mineur, majeur, critique, maintenance, information, inconnu).'],
            ['undici',      'The Node HTTP client used for all server-side fetches; supports a global dispatcher.'],
            ['WebSocket',   'The push channel from server to every browser; the browser never polls.'],
            ['worstLevel()','Utility returning the most severe level from a list, by LEVEL_ORDER.'],
        ],
        col_widths=[3.4 * cm, 13.1 * cm],
    ))
    s.append(PageBreak())

    # ---- Appendix A — Application Screens (illustrative) --------------------
    s.append(section_title('Appendix A — Application Screens'))
    s.append(Paragraph(
        'Illustrative dark-theme renderings of the main screens, to convey the look and layout of the application. '
        '<b>All values shown are fictitious sample data</b> - no real configuration, token or incident information '
        'appears here.', BODY))
    s.append(Spacer(1, 0.25 * cm))
    s.append(mock_dashboard())
    s.append(mock_service_form())
    s.append(mock_composite())
    s.append(mock_levels())
    s.append(mock_login())
    s.append(mock_history())
    s.append(PageBreak())

    # ---- PAGE 24 — Declaration ----------------------------------------------
    s.append(section_title('18. Declaration & Sign-off'))
    s.append(Paragraph('Developer declaration', H2))
    s.append(Paragraph('I, the undersigned, declare that:', BODY))
    for txt in [
        'This document accurately describes Sentinel (Service Status Dashboard) v1.0 as deployed.',
        'The application is built and maintained outside the formal IT software delivery lifecycle and is therefore classified as an EUDA.',
        'No customer, financial, market or sensitive personal data is handled by the application.',
        'Per-source API tokens are stored server-side and are never transmitted to the browser.',
        'Outbound calls are limited to the public status sources the application is configured to poll.',
        'The proxy blocks private / loopback targets to prevent SSRF.',
        'Configuration is persisted server-side and shared across users; it is data, separable from the code.',
        'When enabled, access to the management pages is gated by password (SHA-256) or SSO (OIDC PKCE).',
        'The application contains no third-party telemetry or analytics.',
    ]:
        s.append(Paragraph(f'-&nbsp;{txt}', DECL_BULLET))
    s.append(Spacer(1, 0.3 * cm))
    s.append(Paragraph(
        'Material changes (new external dependencies, a change in data scope or exposure, or a change to the '
        'authentication model) require a fresh review by Line Management and Compliance / Risk prior to '
        'distribution.', BODY_J))
    s.append(PageBreak())

    # ---- PAGE 25 — Sign-off blocks ------------------------------------------
    s.append(section_title('Sign-off'))
    s.append(Paragraph(
        'Each signatory acknowledges they have reviewed this document and the application referenced, and approve '
        'the distribution as described.', BODY_J))
    s.append(Spacer(1, 0.4 * cm))
    s.append(signoff_block('1. Developer / Author', name_prefilled='Adrien Luce'))
    s.append(Spacer(1, 0.5 * cm))
    s.append(signoff_block('2. Line Manager — End User Services Europe'))
    s.append(Spacer(1, 0.5 * cm))
    s.append(signoff_block('3. Compliance / Risk Officer'))
    s.append(Spacer(1, 0.5 * cm))
    s.append(signoff_block('4. Information Security'))
    s.append(Spacer(1, 0.5 * cm))
    s.append(Paragraph('<b>End of document.</b>', ParagraphStyle(
        'END', parent=BODY, alignment=TA_CENTER, fontSize=10, textColor=AMBER_DARK)))

    return s


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> int:
    out_dir = Path(__file__).parent / 'dist'
    out_dir.mkdir(exist_ok=True)
    out_path = out_dir / 'Sentinel_EUDA_v1.pdf'

    doc = SimpleDocTemplate(
        str(out_path),
        pagesize=A4,
        leftMargin=2 * cm, rightMargin=2 * cm,
        topMargin=2.2 * cm, bottomMargin=2 * cm,
        title='Sentinel — Service Status Dashboard — EUDA Technical Documentation v1.0',
        author='Adrien Luce',
        subject='EUDA Technical Documentation',
        creator='build_euda_pdf.py',
    )
    story = build_story()
    doc.build(story, onFirstPage=cover_page, onLaterPages=standard_page)
    print(f'OK — wrote {out_path}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
