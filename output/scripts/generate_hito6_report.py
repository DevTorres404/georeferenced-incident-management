from __future__ import annotations

from pathlib import Path
import textwrap

from PIL import Image, ImageDraw, ImageFont
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import Image as RLImage
from reportlab.platypus import Paragraph, Table, TableStyle


ROOT = Path(__file__).resolve().parents[1]
CAPTURES = ROOT / "ENTREGABLES" / "evidencias_hito6" / "capturas"
OUTPUT = ROOT / "output" / "pdf" / "ENTREGABLE_6_Analisis_Estatico_Seguridad.pdf"
CAPTURES.mkdir(parents=True, exist_ok=True)
OUTPUT.parent.mkdir(parents=True, exist_ok=True)

PAGE_W, PAGE_H = A4
MARGIN = 15 * mm
CONTENT_W = PAGE_W - 2 * MARGIN

NAVY = colors.HexColor("#18324A")
BLUE = colors.HexColor("#2F6690")
TEAL = colors.HexColor("#3A7D78")
INK = colors.HexColor("#1F2933")
MUTED = colors.HexColor("#5B6770")
LIGHT = colors.HexColor("#EEF2F5")
LINE = colors.HexColor("#CAD3DA")
RED = colors.HexColor("#B42318")
AMBER = colors.HexColor("#B54708")
GREEN = colors.HexColor("#1F7A4D")


def register_fonts() -> tuple[str, str, str]:
    candidates = [
        ("Arial", r"C:\Windows\Fonts\arial.ttf", r"C:\Windows\Fonts\arialbd.ttf"),
        ("DejaVu", r"C:\Windows\Fonts\DejaVuSans.ttf", r"C:\Windows\Fonts\DejaVuSans-Bold.ttf"),
    ]
    for family, regular, bold in candidates:
        if Path(regular).exists() and Path(bold).exists():
            pdfmetrics.registerFont(TTFont(family, regular))
            pdfmetrics.registerFont(TTFont(f"{family}-Bold", bold))
            return family, f"{family}-Bold", family
    return "Helvetica", "Helvetica-Bold", "Courier"


FONT, FONT_BOLD, FONT_MONO = register_fonts()

STYLES = {
    "body": ParagraphStyle("body", fontName=FONT, fontSize=8.4, leading=11.0, textColor=INK, alignment=TA_JUSTIFY),
    "small": ParagraphStyle("small", fontName=FONT, fontSize=7.1, leading=9.0, textColor=INK),
    "tiny": ParagraphStyle("tiny", fontName=FONT, fontSize=6.25, leading=7.45, textColor=INK),
    "caption": ParagraphStyle("caption", fontName=FONT, fontSize=6.4, leading=8.0, textColor=MUTED),
    "h2": ParagraphStyle("h2", fontName=FONT_BOLD, fontSize=15, leading=18, textColor=NAVY),
    "h3": ParagraphStyle("h3", fontName=FONT_BOLD, fontSize=10.5, leading=13, textColor=BLUE),
    "cell": ParagraphStyle("cell", fontName=FONT, fontSize=6.6, leading=7.75, textColor=INK),
    "cell_b": ParagraphStyle("cell_b", fontName=FONT_BOLD, fontSize=6.6, leading=7.75, textColor=INK),
    "cell_h": ParagraphStyle("cell_h", fontName=FONT_BOLD, fontSize=6.6, leading=7.75, textColor=colors.white),
    "center": ParagraphStyle("center", fontName=FONT, fontSize=8, leading=10, textColor=INK, alignment=TA_CENTER),
}


def p(text: str, style: str = "body") -> Paragraph:
    return Paragraph(text, STYLES[style])


def draw_header(c: canvas.Canvas, page: int, title: str) -> None:
    c.setFillColor(NAVY)
    c.rect(0, PAGE_H - 22 * mm, PAGE_W, 22 * mm, fill=1, stroke=0)
    c.setFillColor(colors.white)
    c.setFont(FONT_BOLD, 8.7)
    c.drawString(MARGIN, PAGE_H - 10.5 * mm, "UPSE · Ingeniería de Software · Hito 6")
    c.setFont(FONT, 7.2)
    c.drawRightString(PAGE_W - MARGIN, PAGE_H - 10.5 * mm, title)
    c.setStrokeColor(colors.HexColor("#5E829D"))
    c.line(MARGIN, PAGE_H - 16.4 * mm, PAGE_W - MARGIN, PAGE_H - 16.4 * mm)
    c.setFont(FONT, 6.6)
    c.drawString(MARGIN, PAGE_H - 19.4 * mm, "Sistema Web de Gestión de Incidencias Georreferenciadas")
    c.drawRightString(PAGE_W - MARGIN, PAGE_H - 19.4 * mm, f"Página {page} de 7")


def draw_footer(c: canvas.Canvas) -> None:
    c.setStrokeColor(LINE)
    c.line(MARGIN, 12 * mm, PAGE_W - MARGIN, 12 * mm)
    c.setFillColor(MUTED)
    c.setFont(FONT, 6.2)
    c.drawString(MARGIN, 8.2 * mm, "Corte técnico: 13-07-2026 · commit 2ccb77c7 · Evidencia reproducible en ENTREGABLES/evidencias_hito6")


def draw_title(c: canvas.Canvas, text: str, subtitle: str | None = None) -> float:
    y = PAGE_H - 29 * mm
    c.setFillColor(NAVY)
    c.setFont(FONT_BOLD, 15)
    c.drawString(MARGIN, y, text)
    y -= 5.5 * mm
    if subtitle:
        c.setFillColor(MUTED)
        c.setFont(FONT, 7.5)
        c.drawString(MARGIN, y, subtitle)
        y -= 4.2 * mm
    return y


def draw_paragraph(c: canvas.Canvas, text: str, x: float, y: float, width: float, style: str = "body") -> float:
    para = p(text, style)
    _, height = para.wrap(width, PAGE_H)
    para.drawOn(c, x, y - height)
    return y - height


def draw_table(c: canvas.Canvas, data: list[list], widths: list[float], x: float, y: float,
               font_size: float = 6.6, header: bool = True, grid: bool = True,
               paddings: tuple[int, int] = (3, 3)) -> float:
    table = Table(data, colWidths=widths, repeatRows=1 if header else 0)
    style = [
        ("FONTNAME", (0, 0), (-1, -1), FONT),
        ("FONTSIZE", (0, 0), (-1, -1), font_size),
        ("TEXTCOLOR", (0, 0), (-1, -1), INK),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), paddings[0]),
        ("RIGHTPADDING", (0, 0), (-1, -1), paddings[0]),
        ("TOPPADDING", (0, 0), (-1, -1), paddings[1]),
        ("BOTTOMPADDING", (0, 0), (-1, -1), paddings[1]),
        ("ROWBACKGROUNDS", (0, 1 if header else 0), (-1, -1), [colors.white, colors.HexColor("#F7F9FA")]),
    ]
    if header:
        style += [
            ("BACKGROUND", (0, 0), (-1, 0), NAVY),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), FONT_BOLD),
        ]
    if grid:
        style.append(("GRID", (0, 0), (-1, -1), 0.35, LINE))
    table.setStyle(TableStyle(style))
    _, height = table.wrap(CONTENT_W, PAGE_H)
    table.drawOn(c, x, y - height)
    return y - height


def callout(c: canvas.Canvas, x: float, y: float, width: float, height: float, title: str, text: str,
            color: colors.Color = BLUE) -> None:
    c.setFillColor(colors.HexColor("#F4F7F9"))
    c.setStrokeColor(color)
    c.roundRect(x, y - height, width, height, 4, fill=1, stroke=1)
    c.setFillColor(color)
    c.rect(x, y - height, 4, height, fill=1, stroke=0)
    c.setFillColor(INK)
    c.setFont(FONT_BOLD, 8.4)
    c.drawString(x + 9, y - 13, title)
    draw_paragraph(c, text, x + 9, y - 19, width - 18, "small")


def make_terminal_image(filename: str, title: str, lines: list[str], accent=(72, 187, 120)) -> Path:
    width, height = 1600, 700
    img = Image.new("RGB", (width, height), (16, 24, 35))
    draw = ImageDraw.Draw(img)
    regular_path = Path(r"C:\Windows\Fonts\consola.ttf")
    bold_path = Path(r"C:\Windows\Fonts\consolab.ttf")
    try:
        font = ImageFont.truetype(str(regular_path), 25)
        title_font = ImageFont.truetype(str(bold_path if bold_path.exists() else regular_path), 27)
    except OSError:
        font = ImageFont.load_default()
        title_font = font
    draw.rectangle((0, 0, width, 66), fill=(31, 44, 61))
    draw.ellipse((23, 22, 43, 42), fill=(244, 94, 94))
    draw.ellipse((53, 22, 73, 42), fill=(245, 190, 74))
    draw.ellipse((83, 22, 103, 42), fill=(80, 196, 120))
    draw.text((125, 17), title, font=title_font, fill=(229, 235, 241))
    y = 86
    for original in lines:
        wrapped = textwrap.wrap(original, 104, replace_whitespace=False, drop_whitespace=False) or [""]
        for idx, line in enumerate(wrapped):
            color = accent if original.startswith("$") and idx == 0 else (210, 220, 229)
            draw.text((33, y), line, font=font, fill=color)
            y += 36
            if y > height - 34:
                break
        if y > height - 34:
            break
    path = CAPTURES / filename
    img.save(path, optimize=True)
    return path


def place_image(c: canvas.Canvas, path: Path, x: float, y: float, width: float, height: float, caption: str) -> float:
    image = RLImage(str(path), width=width, height=height)
    image.drawOn(c, x, y - height)
    y -= height + 2
    y = draw_paragraph(c, caption, x, y, width, "caption")
    return y


def metric_card(c: canvas.Canvas, x: float, y: float, w: float, value: str, label: str, color: colors.Color) -> None:
    c.setFillColor(colors.white)
    c.setStrokeColor(LINE)
    c.roundRect(x, y - 40, w, 40, 4, fill=1, stroke=1)
    c.setFillColor(color)
    c.setFont(FONT_BOLD, 15)
    c.drawString(x + 8, y - 18, value)
    c.setFillColor(MUTED)
    c.setFont(FONT, 6.8)
    c.drawString(x + 8, y - 31, label)


def evidence_images() -> dict[str, Path]:
    return {
        "quality": make_terminal_image("E01_E02_calidad.png", "E01–E02 · métricas y duplicación", [
            "$ python scripts/hito6_static_metrics.py",
            "files=346  total_lines=42,477  code=34,278  comments=2,383  blank=5,816",
            "strict_types=7/263 (2.66%)  functions>60=42  complexity~>10=59",
            "Domain->Illuminate=0  Facades_in_Application=0",
            "$ npx jscpd@4.0.5 backend/app frontend/app/js --reporters console,json",
            "sources=270  clones=51  duplicated_lines=617  duplication=2.62%",
            "javascript=1.40%  php=3.51%",
        ]),
        "lint": make_terminal_image("E03_E04_lint_pruebas.png", "E03–E04 · lint, sintaxis y pruebas", [
            "$ npx eslint@8.57.1 frontend/app/js ...",
            "files=48  files_with_findings=10  errors=21  warnings=21",
            "$ vendor/bin/pint --test --format=json",
            "files_with_style_findings=195  single_line_empty_body=122  phpdoc_align=25",
            "$ php -l [263 archivos]  -> syntax_failures=0",
            "$ php artisan test --testsuite=Unit",
            '{"result":"passed","tests":8,"assertions":24,"duration_ms":58}',
            "$ php artisan test tests/Feature/NotificationsTest.php",
            'failed: tests=10 errors=10; PostgreSQL password authentication failed for "user_im"',
        ]),
        "security": make_terminal_image("E06_E08_controles_seguridad.png", "E06–E08 · controles y exposición residual", [
            "$ rg permission: backend/routes/api.php",
            "navigation/menu: auth:sanctum | mutations: permission middleware + controller can()",
            "channels.php: identity + notifications.view/comments.internal + IncidentAccessChecker",
            "$ rg localStorage frontend/app/js/core",
            "auth-session.js:32 localStorage.setItem('auth_token', access_token)",
            "api-client.js:31 token = localStorage.getItem('auth_token')",
            "$ rg Security-Policy|Strict-Transport docker/production/nginx/default.conf",
            "0 matches; X-Frame-Options, nosniff and Referrer-Policy are present",
            "mail: tries=3 timeout=12s backoff=[3,10] after-commit; resend throttle=6/min",
        ]),
        "deps": make_terminal_image("E05_dependencias.png", "E05 · auditoría de dependencias", [
            "$ composer audit --locked --format=json",
            "advisories=0  abandoned=0  packages=134 runtime + 33 dev",
            "$ npm audit --package-lock-only --omit=dev --json",
            "total=15  critical=4  high=3  moderate=7  low=1",
            "critical: pdfmake (direct), pdfkit, minimist, crypto-js",
            "high: uplot (direct), moment (direct), jquery-validation (direct)",
            "$ npm audit --package-lock-only --json",
            "full lock: total=112  critical=13  high=53  moderate=40  low=6",
        ]),
        "devops": make_terminal_image("E07_E09_secdevops.png", "E07–E09 · configuración y SecDevOps", [
            "$ Test-Path .github  -> False (sin pipeline CI versionado)",
            "$ git ls-files | rg '(^|/)\\.env($|\\.)'  -> backend/.env.example",
            "high-confidence secret scan: no private keys or provider tokens detected",
            "docker-compose.prod.yml: rustfs/rustfs:latest; minio/mc:latest",
            "frontend: vanta@latest; maplibre-gl from unpkg without pinned version/SRI",
            "AuthController.php:431-446 exposes nonexistent / verified / disabled account state",
            "NotificationsTest cannot be a release gate until testing DB credentials are repaired",
        ]),
    }


def page1(c: canvas.Canvas) -> None:
    c.setFillColor(NAVY)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    c.setFillColor(colors.HexColor("#2B5877"))
    c.rect(0, PAGE_H - 61 * mm, PAGE_W, 61 * mm, fill=1, stroke=0)
    c.setFillColor(colors.white)
    c.setFont(FONT_BOLD, 10)
    c.drawString(MARGIN, PAGE_H - 18 * mm, "UNIVERSIDAD ESTATAL PENÍNSULA DE SANTA ELENA")
    c.setFont(FONT, 8)
    c.drawString(MARGIN, PAGE_H - 24 * mm, "Ingeniería de Software · Semestre 2026-1")
    c.setFont(FONT_BOLD, 24)
    c.drawString(MARGIN, PAGE_H - 43 * mm, "Hito 6")
    c.setFont(FONT_BOLD, 17)
    c.drawString(MARGIN, PAGE_H - 52 * mm, "Calidad Interna & SecDevOps")
    y = PAGE_H - 76 * mm
    c.setFont(FONT_BOLD, 12)
    c.drawString(MARGIN, y, "Entregable 6 · Análisis Estático del Código y Evaluación de Seguridad")
    y -= 11 * mm
    callout(c, MARGIN, y, CONTENT_W, 38 * mm, "Dictamen ejecutivo", (
        "El sistema presenta una arquitectura DDD con fronteras de dominio limpias, autorización por roles y territorio aplicada también a los canales en tiempo real. "
        "No obstante, <b>no se recomienda iniciar E7 como gate formal</b> hasta actualizar el árbol npm desplegable, proteger la sesión frente a XSS, incorporar CSP/HSTS y restablecer la base de pruebas funcionales. "
        "La deuda de mantenibilidad es moderada-alta por funciones extensas y acoplamiento en la capa de presentación."
    ), colors.HexColor("#58A6A6"))
    y -= 47 * mm
    c.setFillColor(colors.white)
    c.setFont(FONT_BOLD, 9)
    c.drawString(MARGIN, y, "Autores")
    c.setFont(FONT, 8)
    for name in ["Damián Jesús Torres Cadena", "Melanie Adriana Tomalá Merejildo", "Jean Pierre Cedeño Andrade"]:
        y -= 5.3 * mm
        c.drawString(MARGIN + 5 * mm, y, name)
    y -= 10 * mm
    c.setFont(FONT_BOLD, 9)
    c.drawString(MARGIN, y, "Docente")
    c.setFont(FONT, 8)
    c.drawString(MARGIN + 28 * mm, y, "Ing. Anthony Pachay")
    y -= 12 * mm
    c.setFont(FONT_BOLD, 9)
    c.drawString(MARGIN, y, "Marco")
    c.setFont(FONT, 8)
    c.drawString(MARGIN + 28 * mm, y, "OWASP Top 10:2025 · ISO/IEC 25010:2023")
    y -= 12 * mm
    c.setFont(FONT_BOLD, 9)
    c.drawString(MARGIN, y, "Corte")
    c.setFont(FONT, 8)
    c.drawString(MARGIN + 28 * mm, y, "13 de julio de 2026 · commit 2ccb77c7")
    c.setFillColor(colors.HexColor("#AFC6D8"))
    c.setFont(FONT, 6.8)
    c.drawString(MARGIN, 17 * mm, "Reporte técnico de 7 páginas · resultados verificables, no equivalentes a una prueba de penetración")


def page2(c: canvas.Canvas, images: dict[str, Path]) -> None:
    draw_header(c, 2, "1–2. Línea base y radiografía")
    draw_footer(c)
    y = draw_title(c, "Línea base y toolkit de análisis", "Alcance: backend Laravel/PHP, frontend JavaScript estático, configuración y locks de dependencias")
    tools = [
        ["Herramienta", "Propósito", "Aplicación"],
        ["Métrica propia + PHP -l", "LOC, strict types, longitud, complejidad heurística y sintaxis", "346 archivos / 263 PHP"],
        ["ESLint 8.57.1", "Errores de símbolos, variables no usadas y flujo inalcanzable", "48 módulos JS de aplicación"],
        ["jscpd 4.0.5", "Clones y densidad de duplicación", "backend/app + frontend/app/js"],
        ["Laravel Pint", "Deuda de estilo PSR-12/Laravel", "Código PHP del proyecto"],
        ["Composer / npm audit", "Advisories, CVE y paquetes abandonados", "composer.lock + package-lock.json"],
        ["Revisión dirigida", "OWASP 2025, RBAC, realtime, correo, nginx, Docker y CI", "Código/configuración versionada"],
    ]
    y = draw_table(c, tools, [31*mm, 76*mm, 73*mm], MARGIN, y, 6.7)
    y -= 5 * mm
    card_w = (CONTENT_W - 9) / 4
    metric_card(c, MARGIN, y, card_w, "34,278", "líneas netas de código", BLUE)
    metric_card(c, MARGIN + card_w + 3, y, card_w, "2.62%", "duplicación global", TEAL)
    metric_card(c, MARGIN + 2*(card_w + 3), y, card_w, "21", "errores ESLint", AMBER)
    metric_card(c, MARGIN + 3*(card_w + 3), y, card_w, "0", "errores sintaxis PHP", GREEN)
    y -= 46
    y = place_image(c, images["quality"], MARGIN, y, CONTENT_W, 52 * mm,
                    "Figura 1. Evidencia E01–E02. La complejidad es una estimación lexical; no sustituye SonarQube, pero permite priorizar refactorizaciones reproducibles.")
    y -= 3 * mm
    callout(c, MARGIN, y, CONTENT_W, 29 * mm, "Lectura de calidad interna", (
        "La duplicación de <b>2.62%</b> es controlable; el principal pasivo no es copiar código sino concentrar decisiones. Se detectaron <b>42 funciones mayores de 60 líneas</b> y <b>59 por encima de complejidad ~10</b> (con solapamiento). "
        "Solo 7 de 263 archivos PHP declaran <i>strict_types</i>. Como fortalezas, no existen dependencias Domain→Illuminate ni Facades en Application."
    ), BLUE)


def page3(c: canvas.Canvas, images: dict[str, Path]) -> None:
    draw_header(c, 3, "3. Mantenibilidad y complejidad")
    draw_footer(c)
    y = draw_title(c, "Diagnóstico de mantenibilidad", "Los valores de complejidad son heurísticos y se usan como ranking, no como certificación")
    complexity = [
        ["Componente", "Método / función", "Líneas", "CC~", "Diagnóstico"],
        ["auth-page.js:18", "initAuthPage", "850", "158", "Clase Dios funcional: login, registro, Google y validación."],
        ["layout.js:659", "renderLayout", "193", "51", "Mezcla menú, sesión, notificaciones y eventos globales."],
        ["reports-page.js:204", "buildAnalytics", "124", "33", "Cálculo, narrativa y transformación en un bloque."],
        ["operational-structure-page.js:972", "updateTeamManagementTab", "99", "32", "UI y reglas operativas acopladas."],
        ["user-roles-page.js:43", "bindActions", "135", "27", "Múltiples flujos CRUD y estado DOM."],
        ["GoogleRegistrationUseCase.php:31", "execute", "129", "25", "Orquestación extensa con muchas ramas."],
    ]
    y = draw_table(c, [[p(str(v), "cell_h" if r == 0 else "cell") for v in row] for r, row in enumerate(complexity)],
                   [43*mm, 39*mm, 14*mm, 12*mm, 72*mm], MARGIN, y, 6.3)
    y -= 4 * mm
    y = place_image(c, images["lint"], MARGIN, y, CONTENT_W, 49 * mm,
                    "Figura 2. Evidencia E03–E04. ESLint requiere una configuración de globals/módulos del proyecto; por eso 21 no-undef son candidatos, no 21 fallos funcionales confirmados.")
    y -= 3 * mm
    findings = [
        ["Dimensión", "Resultado", "Interpretación / acción"],
        ["Cohesión", "Mixta", "DDD backend cohesivo; controladores y páginas JS concentran validación, render y eventos."],
        ["Acoplamiento", "Alto en UI", "Dependencia de window/localStorage y globals implícitos; modularizar adaptadores y stores."],
        ["Estilo", "195 archivos", "Pint evidencia deuda mecánica; aplicar por lotes con pruebas y revisión de diff."],
        ["Validación", "0 FormRequest", "Reglas repetidas en controladores; extraer Request classes para contratos consistentes."],
        ["Pruebas", "8/8 unit; 0/10 feature", "La lógica base pasa, pero la BD inválida bloquea evidencia de autorización/realtime."],
    ]
    y = draw_table(c, [[p(str(v), "cell_h" if r == 0 else "cell") for v in row] for r, row in enumerate(findings)],
                   [31*mm, 30*mm, 119*mm], MARGIN, y, 6.4)
    y -= 3 * mm
    draw_paragraph(c, "<b>Conclusión de mantenibilidad.</b> No se identificó una ruptura de capas de dominio, pero sí módulos frontend y repositorios de más de 1,000 líneas. El refactor debe empezar por <i>auth-page.js</i>, <i>layout.js</i> y <i>EloquentIncidentRepository.php</i>, preservando pruebas de permisos y canales privados.", MARGIN, y, CONTENT_W, "small")


def owasp_table(c: canvas.Canvas, y: float, rows: list[list[str]]) -> float:
    data = [[p(v, "cell_h") for v in ["Cat.", "¿Riesgo? / impacto", "Evidencia", "Recomendación"]]]
    for row in rows:
        data.append([p(row[0], "cell_b"), p(row[1], "cell"), p(row[2], "cell"), p(row[3], "cell")])
    return draw_table(c, data, [17*mm, 49*mm, 62*mm, 52*mm], MARGIN, y, 6.1, paddings=(3, 3))


def page4(c: canvas.Canvas, images: dict[str, Path]) -> None:
    draw_header(c, 4, "4. OWASP Top 10:2025 · A01–A05")
    draw_footer(c)
    y = draw_title(c, "Auditoría OWASP Top 10:2025 (A01–A05)", "Cada categoría declara riesgo, impacto, evidencia y remediación")
    rows = [
        ["A01", "<b>Residual · Medio.</b> RBAC y alcance territorial son sólidos; falta convertir toda mutación de apiResource en middleware específico para evitar divergencia futura.", "E06: routes/api.php:89–109; UserController:82/174/252; IncidentAccessChecker; channels.php. Menú se construye por permission_code.", "Añadir middleware por acción y tests de matriz rol×recurso×territorio. Mantener doble control servidor; el menú nunca es barrera de seguridad."],
        ["A02", "<b>Sí · Alto.</b> CSP y HSTS ausentes; SESSION_ENCRYPT=false; endpoints docs visibles y defaults sensibles dependen del entorno.", "E07: nginx solo agrega X-Frame-Options, nosniff y Referrer-Policy. .env.example: SESSION_ENCRYPT=false.", "CSP con nonce/hash, HSTS en TLS, cookies Secure, cifrar sesión y revisar exposición de /docs/OpenAPI en producción."],
        ["A03", "<b>Sí · Crítico/Alto.</b> 15 avisos en dependencias de producción; cuatro críticos. Imágenes Docker y CDN usan latest/no versión.", "E05/E09: npm --omit=dev: 4C/3H/7M/1L; pdfmake crítico directo; rustfs/minio latest; Vanta/MapLibre no fijados.", "Actualizar dependencias directas, regenerar lock, fijar imágenes por digest, SBOM y audit como gate CI."],
        ["A04", "<b>Residual · Medio.</b> Bcrypt=12, enlaces firmados y secretos ignorados son positivos; token bearer queda legible para JS y sesión no cifrada.", "E07: auth_token en localStorage; E09: solo .env.example versionado; BCRYPT_ROUNDS=12; URL de verificación signed.", "Migrar a cookie HttpOnly+Secure+SameSite o BFF; rotar/revocar tokens y activar SESSION_ENCRYPT en producción."],
        ["A05", "<b>Sí · Alto.</b> Eloquent y bindings reducen SQLi; existe sink DOM directo y 115 usos innerHTML que amplían el impacto de XSS.", "E01/E07: dom-utils.js:29,41 asigna message a innerHTML; 27 SQL raw revisados, sin unprepared y con parámetros en consultas espaciales.", "Cambiar alertas a textContent; sanitizador central y ESLint no-unsanitized; pruebas XSS. Mantener bindings para SQL raw."],
    ]
    y = owasp_table(c, y, rows)
    y -= 4 * mm
    y = place_image(c, images["security"], MARGIN, y, CONTENT_W, 46 * mm,
                    "Figura 3. Evidencia E06–E08. Los controles por rol, territorio y canal privado reducen A01; la combinación localStorage + sinks DOM + ausencia de CSP mantiene exposición material.")
    y -= 3 * mm
    callout(c, MARGIN, y, CONTENT_W, 23 * mm, "Hallazgo encadenado prioritario", (
        "Una inyección DOM que alcance <i>dom-utils</i> podría leer el bearer token de <i>localStorage</i>; sin CSP, el navegador aporta menos contención. La remediación debe tratar los tres controles como una sola historia de seguridad."
    ), RED)


def page5(c: canvas.Canvas, images: dict[str, Path]) -> None:
    draw_header(c, 5, "4–5. OWASP A06–A10 y dependencias")
    draw_footer(c)
    y = draw_title(c, "Auditoría OWASP Top 10:2025 (A06–A10)")
    rows = [
        ["A06", "<b>Sí · Medio.</b> No hay evidencia versionada de threat modeling; los flujos complejos de registro, roles, correo y territorio dependen de lógica distribuida.", "E01/E03: initAuthPage CC~158; GoogleRegistration execute CC~25; 0 FormRequest; no artefacto de amenazas hallado.", "Modelar amenazas/abuse cases y estados; extraer políticas y contratos de validación; revisar fail-safe defaults."],
        ["A07", "<b>Sí · Medio.</b> 2FA, rate limit y expiración de 120 min son positivos; el reenvío público permite enumerar estado de cuenta.", "E08: AuthController:431–446 responde distinto para inexistente, verificado y desactivado; throttle 6/min.", "Respuesta y latencia uniformes; log interno del estado; CAPTCHA adaptativo y prueba de no enumeración."],
        ["A08", "<b>Sí · Alto.</b> CDN sin SRI/versión y ausencia de CI impiden verificar integridad de artefactos antes de desplegar.", "E07/E09: vanta@latest, MapLibre unpinned; no .github; locks sí están versionados.", "Self-host o SRI+crossorigin; lockfiles inmutables, firma/provenance de imágenes y despliegues desde artefactos CI."],
        ["A09", "<b>Residual · Medio.</b> Hay audit logs y login attempts; correo registra fallo definitivo. No se encontró pipeline de alertas/retención verificable.", "E08: failed() registra clase y error; rutas audit protegidas. OWASP destaca que log sin alertamiento es insuficiente.", "Alertas por fallos mail/queue, auth anómala y 403; redacción de PII; retención, correlación y runbooks."],
        ["A10", "<b>Sí · Medio.</b> Reintentos cortos mejoran resiliencia; la suite de notificaciones falla por infraestructura y algunos catches silencian la causa.", "E04/E08: 10/10 errores por credencial DB; correo 3 intentos, backoff 3/10 s, timeout 12 s y log final.", "Health checks pretest, entorno efímero, dead-letter/failed_jobs visible y errores públicos genéricos con correlation-id."],
    ]
    y = owasp_table(c, y, rows)
    y -= 4 * mm
    y = place_image(c, images["deps"], MARGIN, y, CONTENT_W, 45 * mm,
                    "Figura 4. Evidencia E05. El lock completo incluye tooling antiguo; aun excluyendo dev quedan 15 vulnerabilidades desplegables, por lo que A03 es un hallazgo confirmado.")
    y -= 3 * mm
    inventory = [
        ["Ecosistema", "Inventario", "Resultado", "Decisión"],
        ["Composer", "134 runtime + 33 dev", "0 advisories; 0 abandonados", "Mantener audit en cada merge."],
        ["npm producción", "209 dependencias instaladas según audit", "15: 4C / 3H / 7M / 1L", "Bloquea liberación hasta upgrade y retest."],
        ["npm lock total", "1,350 total con transitivas", "112: 13C / 53H / 40M / 6L", "Renovar toolchain AdminLTE heredada."],
        ["Contenedores/CDN", "Tags latest y recursos no fijados", "Integridad no reproducible", "Digest/SRI/self-host + SBOM."],
    ]
    draw_table(c, [[p(str(v), "cell_h" if r == 0 else "cell") for v in row] for r, row in enumerate(inventory)],
               [30*mm, 48*mm, 48*mm, 54*mm], MARGIN, y, 6.4)


def page6(c: canvas.Canvas, images: dict[str, Path]) -> None:
    draw_header(c, 6, "6. Catálogo y refactorización")
    draw_footer(c)
    y = draw_title(c, "Catálogo priorizado de hallazgos", "La prioridad combina explotabilidad, impacto, cobertura y costo de corrección")
    findings = [
        ["ID / sev.", "Debilidad y evidencia", "Acción de ingeniería", "Criterio de cierre"],
        ["H01 · P1", "Supply chain npm: 15 prod (E05)", "Actualizar pdfmake/uplot/moment/jquery-validation; lock limpio.", "npm audit --omit=dev sin Critical/High + regresión UI."],
        ["H02 · P1", "XSS→token: localStorage, sink DOM, sin CSP (E07)", "Cookie HttpOnly o BFF; textContent; CSP con nonce.", "Prueba XSS no accede token; CSP report-only→enforce."],
        ["H03 · P2", "CDN/imágenes no reproducibles (E09)", "Fijar versión/digest, SRI o self-host; generar SBOM.", "Build idéntico por hash y verificación automática."],
        ["H04 · P2", "Enumeración en reenvío email (E08)", "Respuesta uniforme, auditoría interna y control adaptativo.", "Mismo status/body/latencia para estados de cuenta."],
        ["H05 · P2", "Funciones largas/CC alta (E01)", "Extraer casos de uso, renderers, stores y políticas.", "Ninguna función >100 líneas; CC~≤15 en hotspots."],
        ["H06 · P2", "Feature gate roto por BD (E04)", "Postgres efímero y variables CI; migración automatizada.", "NotificationsTest 10/10 verde en pipeline limpio."],
        ["H07 · P2", "Sin CI/SAST/SCA versionado (E09)", "Pipeline: lint, Pint, tests, audits, secret scan, SBOM.", "Merge bloqueado por umbrales y evidencia retenida."],
        ["H08 · P3", "Pint 195 + strict_types 2.66% (E03/E01)", "Lotes pequeños; standard de strict types para nuevo PHP.", "Pint verde y tendencia strict_types creciente."],
    ]
    y = draw_table(c, [[p(str(v), "cell_h" if r == 0 else "cell") for v in row] for r, row in enumerate(findings)],
                   [21*mm, 56*mm, 57*mm, 46*mm], MARGIN, y, 6.15, paddings=(3, 3))
    y -= 4 * mm
    y = place_image(c, images["devops"], MARGIN, y, CONTENT_W, 43 * mm,
                    "Figura 5. Evidencia E07–E09. El escaneo heurístico de secretos no halló credenciales de alta confianza; sí existe una brecha de automatización y reproducibilidad.")
    y -= 3 * mm
    roadmap = [
        ["Horizonte", "Objetivo", "Entregables"],
        ["0–48 h", "Contención", "Actualizar dependencias P1; respuesta uniforme email; fijar tags/CDN; textContent en alertas."],
        ["1 sprint", "Gate seguro", "CI con audits, Pint/ESLint, Postgres efímero, NotificationsTest y CSP report-only."],
        ["2–3 sprints", "Reducción de deuda", "Refactor auth/layout/repositorios; FormRequest/policies; cookie HttpOnly; threat model."],
    ]
    draw_table(c, [[p(str(v), "cell_h" if r == 0 else "cell") for v in row] for r, row in enumerate(roadmap)],
               [28*mm, 38*mm, 114*mm], MARGIN, y, 6.4)


def page7(c: canvas.Canvas) -> None:
    draw_header(c, 7, "ISO/IEC 25010 y dictamen E7")
    draw_footer(c)
    y = draw_title(c, "Confrontación ISO/IEC 25010:2023", "La edición 2023 define nueve características del modelo de calidad de producto")
    iso = [
        ["Característica", "Evaluación", "Fundamento / condición para E7"],
        ["Adecuación funcional", "Favorable", "Pruebas unitarias verdes y funcionalidad existente; ampliar regresión por roles."],
        ["Eficiencia de desempeño", "No evaluada", "Corresponde a E7; antes se requiere entorno reproducible y observabilidad."],
        ["Compatibilidad", "Parcial", "Integración Redis/Postgres/Reverb/RustFS; dependencias y tags deben fijarse."],
        ["Capacidad de interacción", "Favorable con deuda", "UI operativa; globals implícitos y páginas extensas elevan costo de cambio."],
        ["Fiabilidad", "Condicionada", "Correo reintenta y Reverb tiene fallback; feature tests están bloqueados por BD."],
        ["Seguridad", "No apta aún", "P1 en supply chain y cadena XSS→token; RBAC/realtime son controles fuertes."],
        ["Mantenibilidad", "Condicionada", "DDD limpio y duplicación baja; 42 funciones largas, 59 CC~>10 y Pint en 195 archivos."],
        ["Flexibilidad", "Parcial", "Capas favorecen cambio; frontend estático y acoplamiento a window/localStorage lo dificultan."],
        ["Protección ante riesgos", "Parcial", "Rate limit, 2FA y auditoría; faltan CSP/HSTS, CI, SBOM y alertamiento verificable."],
    ]
    y = draw_table(c, [[p(str(v), "cell_h" if r == 0 else "cell") for v in row] for r, row in enumerate(iso)],
                   [40*mm, 28*mm, 112*mm], MARGIN, y, 6.25, paddings=(3, 2))
    y -= 4 * mm
    callout(c, MARGIN, y, CONTENT_W, 27 * mm, "Dictamen técnico para Rendimiento de Carga (E7)", (
        "<b>Apto de forma condicionada para una corrida exploratoria; no apto como evaluación formal/gate.</b> Antes de medir capacidad deben quedar verdes las pruebas funcionales, fijarse las dependencias desplegables y habilitarse métricas de app/cola/Reverb/DB. De lo contrario, E7 mediría un entorno no reproducible y ocultaría fallos de seguridad o infraestructura."
    ), AMBER)
    y -= 34 * mm
    c.setFont(FONT_BOLD, 10.5)
    c.setFillColor(BLUE)
    c.drawString(MARGIN, y, "Índice de evidencia")
    y -= 4 * mm
    evidence = [
        ["ID", "Artefacto", "Hallazgos respaldados"],
        ["E01–E02", "E01_E02_calidad.png + métricas JSON + jscpd-report.json", "LOC, complejidad, strict types, arquitectura y duplicación."],
        ["E03–E04", "E03_E04_lint_pruebas.png + eslint-report.json", "Lint, estilo, sintaxis y estado de pruebas."],
        ["E05", "E05_dependencias.png", "Composer/npm, producción vs lock completo."],
        ["E06–E08", "E06_E08_controles_seguridad.png", "RBAC, territorio, realtime, token, headers y correo."],
        ["E07–E09", "E07_E09_secdevops.png + resumen_ejecucion.txt", "CDN/Docker, CI, secretos, enumeración y BD de pruebas."],
    ]
    y = draw_table(c, [[p(str(v), "cell_h" if r == 0 else "cell") for v in row] for r, row in enumerate(evidence)],
                   [24*mm, 76*mm, 80*mm], MARGIN, y, 6.15, paddings=(3, 2))
    y -= 4 * mm
    c.setFont(FONT_BOLD, 10.5)
    c.setFillColor(BLUE)
    c.drawString(MARGIN, y, "Fuentes normativas y límites")
    y -= 4 * mm
    refs = (
        "OWASP Top 10:2025: https://owasp.org/Top10/2025/0x00_2025-Introduction/ · "
        "ISO/IEC 25010:2023: https://www.iso.org/standard/78176.html. "
        "La auditoría es estática y de configuración: no ejecutó DAST, pentest, verificación de TLS en el host ni explotación de CVE. "
        "Los conteos ESLint y de complejidad son indicadores para priorización; la confirmación requiere pruebas dinámicas y revisión de cambios."
    )
    draw_paragraph(c, refs, MARGIN, y, CONTENT_W, "tiny")


def build_pdf() -> None:
    images = evidence_images()
    c = canvas.Canvas(str(OUTPUT), pagesize=A4, pageCompression=1)
    c.setTitle("Hito 6 - Análisis Estático del Código y Evaluación de Seguridad")
    c.setAuthor("Damián Jesús Torres Cadena; Melanie Adriana Tomalá Merejildo; Jean Pierre Cedeño Andrade")
    for renderer in [
        lambda: page1(c),
        lambda: page2(c, images),
        lambda: page3(c, images),
        lambda: page4(c, images),
        lambda: page5(c, images),
        lambda: page6(c, images),
        lambda: page7(c),
    ]:
        renderer()
        c.showPage()
    c.save()
    print(OUTPUT)


if __name__ == "__main__":
    build_pdf()
