#!/usr/bin/env python3
"""Build the Mr. Sanal / Kasaragod furniture quotation Excel to match the original PDF."""

from __future__ import annotations

from pathlib import Path

from openpyxl import Workbook
from openpyxl.cell.rich_text import CellRichText, TextBlock
from openpyxl.cell.text import InlineFont
from openpyxl.drawing.image import Image as XLImage
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.page import PageMargins

ROOT = Path(__file__).resolve().parent
ASSETS = ROOT / "assets"
OUT = ROOT / "Mr_Sanal_Kasaragod_Furniture.xlsx"

GREEN = "1E4E3F"
PEACH = "F8CBAD"
BLUE = "8FA9DB"
GREY = "E7E6E6"
WHITE = "FFFFFF"
BLACK = "000000"
CLIENT_BLUE = "528DD4"

thin = Side(style="thin", color=BLACK)
BORDER = Border(left=thin, right=thin, top=thin, bottom=thin)
FILL_GREEN = PatternFill("solid", fgColor=GREEN)
FILL_PEACH = PatternFill("solid", fgColor=PEACH)
FILL_BLUE = PatternFill("solid", fgColor=BLUE)
FILL_GREY = PatternFill("solid", fgColor=GREY)
FILL_WHITE = PatternFill("solid", fgColor=WHITE)

FONT_BODY = Font(name="Calibri", size=7, color=BLACK)
FONT_BOLD = Font(name="Calibri", size=7, bold=True, color=BLACK)
FONT_WHITE = Font(name="Calibri", size=7, bold=True, color=WHITE)
FONT_AMT = Font(name="Calibri", size=8, bold=True, color=BLACK)
FONT_TOTAL = Font(name="Calibri", size=9, bold=True, color=BLACK)
FONT_META = Font(name="Calibri", size=7, color=BLACK)
FONT_CLIENT = Font(name="Calibri", size=7, color=CLIENT_BLUE, bold=True)
FONT_HEADER = Font(name="Calibri", size=7, bold=True, color=BLACK)

ALIGN_C = Alignment(horizontal="center", vertical="center", wrap_text=True)
ALIGN_L = Alignment(horizontal="left", vertical="center", wrap_text=True)
ALIGN_R = Alignment(horizontal="right", vertical="center", wrap_text=True)

INR = r'₹#,##,##0.00'
INR_INT = r'₹#,##,##0'

BOLD_PHRASES = sorted(
    [
        "GREENLAM MIKASA 710 MARINE PLYWOOD",
        "16MM GREENLAM MIKASA 710 MARINE PLYWOOD",
        "16 MM GREENLAM MIKASA 710 MARINE PLYWOOD",
        "16MM GREENLAM MIKASA 710",
        "LAMINATE KITCHEN",
        "LAMINATE WORK AREA",
        "LAMINATED  SHUTTERS FOR BASE AND WALL UNITS",
        "LAMINATED SHUTTERS FOR BASE AND WALL UNITS",
        "HAFELE  AUTO Close",
        "HAFELE AUTO Close",
        "HETTICH GERMAN",
        "HETTICH BRAND AUTO CLOSE HINGES(Soft close)",
        "Hettich  AUTO Close",
        "Hettich AUTO Close",
        "WALL PANELING",
        "WPC Wooden finish PANEL BOARD",
        "TV UNIT BASE",
        "LIVING PARTITON",
        "POOJA BASE UNIT",
        "HINGED WARDROBE",
        "WARDROBE LOFT (FRAME AND SHUTTER)",
        "BED COT KING SIZE",
        "BED COT QUEEN SIZE",
        "BAY WALL COVERING PANELING",
        "BAY WINDOW SITTING",
        "WASH UNIT",
        "17MM PVC .7 Density Sheet",
        "16 MM PVC .6 Density Sheet",
        "12 MM PVC .6 Density Sheet",
        "LAMINATED FOILED REGULAR GLOSSY RANGE",
        "PROFILE HANDLE FOR BASE AND WALL UNIT",
        "PROFILE HANDLE FOR CABINET SHUTTER AND DRAWER",
        "MERINO/GREEN LAM/CENTURY Laminate",
        "ROUND SHAPE SLIDING KEY HOLDER",
        "STAIR UNDER COVERING",
        "STAIR UNDER STUDY TABLE",
        "FOLDING IRONING TABLE and BODER",
        "OPEN LEDGE",
        "WALL UNIT",
        "SIDE TABLE",
        "STUDY TABLE",
        "STUDY WITH SIDE TABLE",
        "6MM Mirror",
        "6MM mirror",
    ],
    key=len,
    reverse=True,
)

IF_NORMAL = InlineFont(rFont="Calibri", sz=7)
IF_BOLD = InlineFont(rFont="Calibri", sz=7, b=True)


def rich(text: str):
    if not text:
        return text
    parts = []
    i = 0
    n = len(text)
    while i < n:
        matched = None
        for p in BOLD_PHRASES:
            if text.startswith(p, i):
                matched = p
                break
        if matched:
            parts.append(TextBlock(IF_BOLD, matched))
            i += len(matched)
        else:
            nxt = n
            for p in BOLD_PHRASES:
                j = text.find(p, i)
                if j != -1:
                    nxt = min(nxt, j)
            chunk = text[i:nxt]
            if chunk:
                parts.append(TextBlock(IF_NORMAL, chunk))
            i = nxt
    if not parts:
        return text
    return CellRichText(*parts)


def style_cell(cell, font=None, fill=None, align=None, num=None, border=True):
    cell.font = font or FONT_BODY
    cell.fill = fill or FILL_WHITE
    cell.alignment = align or ALIGN_C
    if border:
        cell.border = BORDER
    if num:
        cell.number_format = num


def merge(ws, rng):
    ws.merge_cells(rng)


def paint(ws, r1, r2, c1=1, c2=7, fill=FILL_WHITE, font=FONT_BODY, align=ALIGN_C):
    for rr in range(r1, r2 + 1):
        for cc in range(c1, c2 + 1):
            cell = ws.cell(rr, cc)
            style_cell(cell, font=font, fill=fill, align=align)


def put_amount(cell, value, integer=False):
    if value is None or value == "":
        style_cell(cell, font=FONT_AMT, align=ALIGN_R)
        return
    if isinstance(value, str) and value.startswith("="):
        cell.value = value
        style_cell(cell, font=FONT_AMT, align=ALIGN_R, num=INR_INT if integer else INR)
        return
    cell.value = value
    style_cell(cell, font=FONT_AMT, align=ALIGN_R, num=INR_INT if integer else INR)


def put_qty(cell, value):
    style_cell(cell, font=FONT_BODY, align=ALIGN_C)
    if value is None or value == "":
        return
    if isinstance(value, str):
        cell.value = value
        cell.font = Font(name="Times New Roman", size=7) if value.lower().endswith("nos") else FONT_BODY
        return
    cell.value = value
    if isinstance(value, float) and not value.is_integer():
        cell.number_format = "0.00" if abs(value) >= 10 else "0.##"
    else:
        cell.number_format = "0"


def put_rate(cell, value):
    style_cell(cell, font=FONT_BODY, align=ALIGN_C)
    if value is None or value == "":
        return
    if isinstance(value, str):
        cell.value = value
        return
    cell.value = value
    cell.number_format = "0"


def col_width_px(widths):
    return int(sum(7 * w + 5 for w in widths))


class Sheet:
    def __init__(self, ws):
        self.ws = ws
        self.r = 1
        self.section_cells = []
        self.grand_cells = []

    def blank_row_cells(self, r, fill=FILL_WHITE, font=FONT_BODY, align=ALIGN_C):
        paint(self.ws, r, r, 1, 7, fill=fill, font=font, align=align)

    def section(self, title):
        r = self.r
        self.blank_row_cells(r, fill=FILL_GREEN, font=FONT_WHITE, align=ALIGN_C)
        merge(self.ws, f"A{r}:G{r}")
        self.ws[f"A{r}"] = title
        self.ws[f"A{r}"].font = FONT_WHITE
        self.ws[f"A{r}"].alignment = ALIGN_C
        self.ws.row_dimensions[r].height = 16
        self.r += 1
        return r

    def grey_sub(self, title, start_col=2):
        r = self.r
        self.blank_row_cells(r, fill=FILL_WHITE)
        for c in range(start_col, 8):
            style_cell(self.ws.cell(r, c), font=FONT_BOLD, fill=FILL_GREY, align=ALIGN_C)
        merge(self.ws, f"{get_column_letter(start_col)}{r}:G{r}")
        cell = self.ws.cell(r, start_col)
        cell.value = title
        cell.font = FONT_BOLD
        cell.alignment = ALIGN_C
        cell.fill = FILL_GREY
        self.ws.row_dimensions[r].height = 16
        self.r += 1
        return r

    def spec(self, letter, label, text, amount=None):
        r = self.r
        self.blank_row_cells(r)
        self.ws.cell(r, 1).value = letter
        style_cell(self.ws.cell(r, 1), font=FONT_BOLD, align=ALIGN_C)
        self.ws.cell(r, 2).value = label
        style_cell(self.ws.cell(r, 2), font=FONT_BODY, align=ALIGN_L)
        self.ws.cell(r, 3).value = rich(text)
        style_cell(self.ws.cell(r, 3), font=FONT_BODY, align=ALIGN_L)
        merge(self.ws, f"C{r}:D{r}")
        put_qty(self.ws.cell(r, 5), None)
        put_rate(self.ws.cell(r, 6), None)
        put_amount(self.ws.cell(r, 7), amount)
        lines = text.count("\n") + 1
        self.ws.row_dimensions[r].height = 14 if lines == 1 else 22
        self.r += 1
        return r

    def total(self, amount_formula, integer=True, fill=FILL_PEACH):
        r = self.r
        self.blank_row_cells(r, fill=fill, font=FONT_TOTAL, align=ALIGN_R)
        merge(self.ws, f"A{r}:F{r}")
        self.ws[f"A{r}"] = "TOTAL"
        self.ws[f"A{r}"].font = FONT_TOTAL
        self.ws[f"A{r}"].alignment = ALIGN_R
        self.ws[f"A{r}"].fill = fill
        put_amount(self.ws.cell(r, 7), amount_formula, integer=integer)
        self.ws.cell(r, 7).fill = fill
        self.ws.cell(r, 7).font = FONT_TOTAL
        self.ws.row_dimensions[r].height = 18
        self.section_cells.append(f"G{r}")
        self.r += 1
        return r

    def blue_total(self, label, formula, integer=True):
        r = self.r
        self.blank_row_cells(r, fill=FILL_BLUE, font=FONT_TOTAL, align=ALIGN_R)
        merge(self.ws, f"A{r}:F{r}")
        self.ws[f"A{r}"] = label
        self.ws[f"A{r}"].font = FONT_TOTAL
        self.ws[f"A{r}"].alignment = ALIGN_R
        self.ws[f"A{r}"].fill = FILL_BLUE
        put_amount(self.ws.cell(r, 7), formula, integer=integer)
        self.ws.cell(r, 7).fill = FILL_BLUE
        self.ws.cell(r, 7).font = FONT_TOTAL
        self.ws.row_dimensions[r].height = 18
        self.grand_cells.append(f"G{r}")
        self.r += 1
        return r

    def item(self, name, desc, dim="", area=None, rate=None, amount=None, height=None):
        r = self.r
        self.blank_row_cells(r)
        self.ws.cell(r, 1).value = name
        style_cell(self.ws.cell(r, 1), font=FONT_BOLD, align=ALIGN_C)
        self.ws.cell(r, 2).value = rich(desc) if desc else None
        style_cell(self.ws.cell(r, 2), font=FONT_BODY, align=ALIGN_L)
        merge(self.ws, f"B{r}:C{r}")
        self.ws.cell(r, 4).value = dim or None
        style_cell(self.ws.cell(r, 4), font=FONT_BODY, align=ALIGN_C)
        put_qty(self.ws.cell(r, 5), area)
        put_rate(self.ws.cell(r, 6), rate)
        if amount is None and isinstance(area, (int, float)) and isinstance(rate, (int, float)):
            put_amount(self.ws.cell(r, 7), f"=E{r}*F{r}")
        else:
            put_amount(self.ws.cell(r, 7), amount)
        if height is None:
            dlen = len(desc or "")
            height = 18 if dlen < 80 else 28 if dlen < 160 else 40 if dlen < 280 else 52
        self.ws.row_dimensions[r].height = height
        self.r += 1
        return r

    def group(self, name, desc, items, height_each=16):
        start = self.r
        n = len(items)
        end = start + n - 1
        for i, it in enumerate(items):
            r = start + i
            self.blank_row_cells(r)
            label = it.get("label", "")
            area = it.get("area")
            rate = it.get("rate")
            amount = it.get("amount")
            self.ws.cell(r, 4).value = label or None
            style_cell(self.ws.cell(r, 4), font=FONT_BOLD, align=ALIGN_C)
            put_qty(self.ws.cell(r, 5), area)
            put_rate(self.ws.cell(r, 6), rate)
            if amount is None and isinstance(area, (int, float)) and isinstance(rate, (int, float)):
                put_amount(self.ws.cell(r, 7), f"=E{r}*F{r}")
            else:
                put_amount(self.ws.cell(r, 7), amount)
            self.ws.row_dimensions[r].height = height_each
        merge(self.ws, f"A{start}:A{end}")
        merge(self.ws, f"B{start}:C{end}")
        self.ws.cell(start, 1).value = name
        style_cell(self.ws.cell(start, 1), font=FONT_BOLD, align=ALIGN_C)
        self.ws.cell(start, 2).value = rich(desc)
        style_cell(self.ws.cell(start, 2), font=FONT_BODY, align=ALIGN_L)
        self.r = end + 1
        return start, end

    def multi(self, name, lines):
        start = self.r
        n = len(lines)
        end = start + n - 1
        for i, line in enumerate(lines):
            r = start + i
            self.blank_row_cells(r)
            self.ws.cell(r, 2).value = rich(line.get("desc", ""))
            style_cell(self.ws.cell(r, 2), font=FONT_BODY, align=ALIGN_L)
            merge(self.ws, f"B{r}:C{r}")
            self.ws.cell(r, 4).value = line.get("dim") or None
            style_cell(self.ws.cell(r, 4), font=FONT_BODY, align=ALIGN_C)
            put_qty(self.ws.cell(r, 5), line.get("area"))
            put_rate(self.ws.cell(r, 6), line.get("rate"))
            amount = line.get("amount")
            area, rate = line.get("area"), line.get("rate")
            if amount is None and isinstance(area, (int, float)) and isinstance(rate, (int, float)):
                put_amount(self.ws.cell(r, 7), f"=E{r}*F{r}")
            else:
                put_amount(self.ws.cell(r, 7), amount)
            dlen = len(line.get("desc") or "")
            self.ws.row_dimensions[r].height = 22 if dlen < 120 else 32
        merge(self.ws, f"A{start}:A{end}")
        self.ws.cell(start, 1).value = name
        style_cell(self.ws.cell(start, 1), font=FONT_BOLD, align=ALIGN_C)
        self.r = end + 1
        return start, end

    def page_break(self):
        self.ws.row_breaks.append(self.r - 1)


def build():
    wb = Workbook()
    wb.properties.title = "Mr Sanal Kasaragod A"
    wb.properties.creator = "Teak Room Interiors"
    ws = wb.active
    ws.title = "Quotation"

    widths = [14.6, 13.4, 29.0, 11.4, 12.2, 10.2, 14.0]
    for i, w in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(i)].width = w

    sheet_px = col_width_px(widths)

    ws.page_setup.paperSize = ws.PAPERSIZE_LETTER
    ws.page_setup.orientation = "portrait"
    ws.page_setup.fitToPage = True
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws.page_margins = PageMargins(left=0.25, right=0.25, top=0.35, bottom=0.35, header=0.1, footer=0.1)
    ws.page_setup.horizontalCentered = True
    ws.print_options.horizontalCentered = True
    ws.sheet_view.showGridLines = False
    ws.sheet_view.zoomScale = 90

    s = Sheet(ws)

    # ----- Header banner -----
    r = s.r
    paint(ws, r, r, fill=FILL_GREEN)
    merge(ws, f"A{r}:G{r}")
    ws.row_dimensions[r].height = 50
    banner = ASSETS / "header_banner.png"
    img = XLImage(str(banner))
    img.width = sheet_px
    img.height = 67
    img.anchor = "A1"
    ws.add_image(img)
    s.r += 1

    # ----- Meta -----
    r = s.r
    paint(ws, r, r)
    merge(ws, f"A{r}:C{r}")
    ws[f"A{r}"] = "Quotation No:QNBR/2025/10/109/01"
    style_cell(ws[f"A{r}"], font=FONT_META, align=ALIGN_L)
    merge(ws, f"D{r}:F{r}")
    ws[f"D{r}"] = "DATE OF QUOTE GENERATED"
    style_cell(ws[f"D{r}"], font=FONT_META, align=ALIGN_C)
    ws[f"G{r}"] = "18.09.2025"
    style_cell(ws[f"G{r}"], font=FONT_BOLD, align=ALIGN_C)
    ws.row_dimensions[r].height = 16
    s.r += 1

    r = s.r
    paint(ws, r, r)
    merge(ws, f"A{r}:C{r}")
    # Client name in blue
    ws[f"A{r}"].value = CellRichText(
        TextBlock(InlineFont(rFont="Calibri", sz=7), "Client Name: "),
        TextBlock(InlineFont(rFont="Calibri", sz=7, color=CLIENT_BLUE), "MR.Sanal"),
    )
    style_cell(ws[f"A{r}"], font=FONT_META, align=ALIGN_L)
    merge(ws, f"D{r}:F{r}")
    ws[f"D{r}"] = "QUOTE VALID TILL"
    style_cell(ws[f"D{r}"], font=FONT_META, align=ALIGN_C)
    ws[f"G{r}"] = "18.10.2025"
    style_cell(ws[f"G{r}"], font=FONT_BOLD, align=ALIGN_C)
    ws.row_dimensions[r].height = 16
    s.r += 1

    r = s.r
    paint(ws, r, r)
    merge(ws, f"A{r}:C{r}")
    ws[f"A{r}"] = "Place : Kasaragod"
    style_cell(ws[f"A{r}"], font=FONT_META, align=ALIGN_L)
    merge(ws, f"D{r}:G{r}")
    ws.row_dimensions[r].height = 16
    s.r += 1

    # ----- Column headers -----
    r = s.r
    paint(ws, r, r, font=FONT_HEADER)
    ws[f"A{r}"] = ""
    merge(ws, f"B{r}:C{r}")
    ws[f"B{r}"] = "Description"
    style_cell(ws[f"B{r}"], font=FONT_HEADER, align=ALIGN_C)
    ws[f"D{r}"] = "LENGTH & HEIGHT"
    style_cell(ws[f"D{r}"], font=FONT_HEADER, align=ALIGN_C)
    ws[f"E{r}"] = "Area,Sqft,Nos"
    style_cell(ws[f"E{r}"], font=FONT_HEADER, align=ALIGN_C)
    ws[f"F{r}"] = "Rate/Sqft"
    style_cell(ws[f"F{r}"], font=FONT_HEADER, align=ALIGN_C)
    ws[f"G{r}"] = "Amount"
    style_cell(ws[f"G{r}"], font=FONT_HEADER, align=ALIGN_C)
    ws.row_dimensions[r].height = 16
    s.r += 1

    # ========== KITCHEN ==========
    s.section("KITCHEN")
    s.spec("A", "Carcass Materials :", "16mm Laminate finish GREENLAM MIKASA 710 MARINE PLYWOOD cabinets with\n0.8mm matching PVC edge banding")
    s.spec("B", "Carcass Finish :", "In side .8mm and out side 1mm MERINO/GREEN LAM/CENTURY Laminate (base\ncabinet considered as 720 height)")
    s.spec("C", "Shutter Details :", "16MM GREENLAM MIKASA 710 MARINE PLYWOOD 1mm LAMINATED 2mm PVC\nEDGE BAND SHUTTERS FOR BASE AND WALL")
    s.spec("D", "Hinges Details :", "HETTICH BRAND AUTO CLOSE HINGES(Soft close)")
    s.spec("E", "Drawers Details :", "HETTICH GERMAN(soft close)")
    handle_k = s.spec("F", "Handle Details :", "PROFILE HANDLE FOR BASE AND WALL UNIT", amount=10300)

    kit_desc = (
        "Supply and Installation of LAMINATE KITCHEN with 16MM GREENLAM MIKASA 710 "
        "MARINE PLYWOOD, LAMINATED  SHUTTERS FOR BASE AND WALL UNITS. Hinges are of "
        "HAFELE  AUTO Close & Drawers are of HETTICH GERMAN. Handles are Normal metal "
        "finish & Base Unit,Wall unit and  Tall unit. Loft storage aframe and shutter only."
    )
    k_start, k_end = s.group("KITCHEN", kit_desc, [
        {"label": "BASE UNIT", "area": 46, "rate": 2000},
        {"label": "WALL UNIT", "area": 33.16, "rate": 1800},
        {"label": "FRIDGE COVERING", "area": 13, "rate": 1300},
        {"label": "TALL UNIT", "area": 21.84, "rate": 2000},
        {"label": "LOFT", "area": 70, "rate": 1300},
    ], height_each=14)

    acc = (
        "1)DRAWER UNIT (900MM) -HETTICH GERMAN 3 nos\n"
        "2) PULL OUT UNIT (300, 200 MM) -hettich 1.nos\n"
        "3) PVC CUTLERY TRAY(900MM) - EBCO 1.nos\n"
        "4) GTPT(600MM) WITH SINGLE LIFT UP 1.nos\n"
        "5) TANDEM DRAWER (600MM)- HETTICH 4.nos  \n"
        "6)WASTE BIN 1.nos  \n"
        "7)DETERGENT HOLDER  1.nos  \n"
        "8) ROLL UP SHUTTER 1 nos\n"
        "9) WIKKER BASKET 1 nos"
    )
    acc_row = s.item("PRICE  INCLUDED\nACCESSORIES", acc, "", area="16Nos", rate=None, amount=48000, height=88)
    style_cell(ws.cell(acc_row, 1), font=FONT_BOLD, align=ALIGN_C)
    kit_total = s.total(f"=G{handle_k}+SUM(G{k_start}:G{k_end})+G{acc_row}")

    # ========== WORK AREA ==========
    s.section("WORK AREA")
    s.spec("A", "Carcass Materials :", "16mm Laminate finish GREENLAM MIKASA 710 MARINE PLYWOOD cabinets with\n0.8mm matching PVC edge banding")
    s.spec("B", "Carcass Finish :", "In side .8mm and out side 1mm MERINO/GREEN LAM/CENTURY Laminate (base\ncabinet considered as 720 height)")
    s.spec("C", "Shutter Details :", "16MM GREENLAM MIKASA 710 MARINE PLYWOOD 1mm LAMINATED 2mm PVC\nEDGE BAND SHUTTERS FOR BASE AND WALL")
    s.spec("D", "Hinges Details :", "HETTICH BRAND AUTO CLOSE HINGES(Soft close)")
    s.spec("E", "Drawers Details :", "HETTICH GERMAN(soft close)")
    handle_w = s.spec("F", "Handle Details :", "PROFILE HANDLE FOR BASE AND WALL UNIT", amount=8500)

    work_desc = (
        "Supply and Installation of LAMINATE WORK AREA with 16MM GREENLAM MIKASA 710 "
        "MARINE PLYWOOD, LAMINATED  SHUTTERS FOR BASE AND WALL UNITS. Hinges are of "
        "HAFELE  AUTO Close & Drawers are of HETTICH GERMAN. Handles are Normal metal "
        "finish & Base Unit,Wall unit and  Tall unit. Loft storage aframe and shutter only."
    )
    w_start, w_end = s.group("WORK AREA", work_desc, [
        {"label": "BASE UNIT", "area": 27.44, "rate": 2000},
        {"label": "WALL UNIT", "area": 14.82, "rate": 1800},
        {"label": "TALL UNIT", "area": 20, "rate": 2000},
    ], height_each=16)
    work_total = s.total(f"=G{handle_w}+SUM(G{w_start}:G{w_end})")

    # ========== LIVING AREA ==========
    s.section("LIVING AREA")
    living_first = s.r
    s.item(
        "TV UNIT",
        "Supply and Installation of TV UNIT BASE with 16MM GREENLAM MIKASA 710 MARINE PLYWOOD finished with  "
        "0.8mm both side white colour laminate.Shutters are made with 16 MM  GREENLAM MIKASA 710 MARINE "
        "PLYWOOD finished with both side 1mm Merino/Green laminate.",
        "", area=11.7, rate=2000, height=40,
    )
    s.item(
        "DOUBLE HEIGHT WALL\nPANELING",
        "Supply and Installation of WALL PANELING with WPC Wooden finish PANEL BOARD. (Design Not Finalised)",
        "", area="lumpsum", rate=None, amount=75600, height=28,
    )
    s.item(
        "TV UNIT SIDE SHELF",
        "Supply and Installation of TV UNIT BASE with 16MM GREENLAM MIKASA 710 MARINE "
        "PLYWOOD finished with  0.8mm both side white colour laminate.Shutters are made "
        "with 16 MM  GREENLAM MIKASA 710 MARINE PLYWOOD finished with both side 1mm "
        "Merino/Green laminate.",
        "80 W x 240 H", area=40, rate=1800, height=48,
    )
    s.page_break()

    s.item(
        "PARTITION",
        "Supply and Installation of  LIVING PARTITON  are made with 16 MM  GREENLAM "
        "MIKASA 710 MARINE PLYWOOD finished with both side 1mm Merino/Green laminate.",
        "100 W x 270 H", area=28.1, rate=1550, height=32,
    )
    s.item(
        "ARCHITRAVE",
        "Supply and Installation of WALL PANELING  with 12 MM PVC .6 Density Sheet,  finished with  1mm "
        "Merino/Green laminate.(Rate Not including light). Rft",
        "", area=23, rate=1450, height=28,
    )
    living_total = s.total(f"=SUM(G{living_first}:G{s.r - 1})")

    # ========== POOJA AREA ==========
    s.section("POOJA AREA")

    # Pooja base unit with nested A/B
    start = s.r
    desc_p = (
        "Supply and Installation of  POOJA BASE UNIT  with 16 MM  GREENLAM MIKASA 710 MARINE PLYWOOD finished "
        "with  0.8mm both side white colour laminate.Shutters are made with 16 MM  GREENLAM MIKASA 710 MARINE "
        "PLYWOOD finished with both side 1mm Merino/Green laminate. Price of CNC Back panel also included."
    )
    for i in range(3):
        s.blank_row_cells(start + i)
        ws.row_dimensions[start + i].height = 16 if i else 36
    merge(ws, f"A{start}:A{start+2}")
    merge(ws, f"B{start}:D{start}")
    merge(ws, f"G{start}:G{start+2}")
    ws.cell(start, 1).value = "POOJA BASE UNIT"
    style_cell(ws.cell(start, 1), font=FONT_BOLD, align=ALIGN_C)
    ws.cell(start, 2).value = rich(desc_p)
    style_cell(ws.cell(start, 2), font=FONT_BODY, align=ALIGN_L)
    put_qty(ws.cell(start, 5), 8.5)
    put_rate(ws.cell(start, 6), 1800)
    put_amount(ws.cell(start, 7), f"=E{start}*F{start}")
    # nested A/B
    merge(ws, f"C{start+1}:D{start+1}")
    merge(ws, f"C{start+2}:D{start+2}")
    ws.cell(start + 1, 2).value = "A"
    style_cell(ws.cell(start + 1, 2), font=FONT_BOLD, align=ALIGN_C)
    ws.cell(start + 1, 3).value = "PROFILE HANDLE FOR CABINET SHUTTER AND DRAWER"
    style_cell(ws.cell(start + 1, 3), font=FONT_BODY, align=ALIGN_L)
    ws.cell(start + 2, 2).value = "B"
    style_cell(ws.cell(start + 2, 2), font=FONT_BOLD, align=ALIGN_C)
    ws.cell(start + 2, 3).value = "Granite top( Rate not include)"
    style_cell(ws.cell(start + 2, 3), font=FONT_BODY, align=ALIGN_L)
    put_qty(ws.cell(start + 1, 5), None)
    put_qty(ws.cell(start + 2, 5), None)
    put_rate(ws.cell(start + 1, 6), None)
    put_rate(ws.cell(start + 2, 6), None)
    pooja_base = start
    s.r = start + 3

    s.item("CARVING PILLAR", "Supply and Installation of  POOJA Teak solid wood carve pillar", "", area="4nos", rate=13750, amount=55000, height=20)
    s.item("POOJA SWING", "4 feet Teak wood swing", "", area="1nos", rate=18000, amount=18000, height=18)
    s.item(
        "CORTIYARD WALL STONE\nCLADING",
        "Laying Natural Stone clading As per Design (Stone rate 90Rs/sft)",
        "158 W x 300 H", area=51, rate=250, height=28,
    )
    s.item(
        "CORTIYARD WALL BUDHA\nARTWORK",
        "Using 4 FT Radius Round shape Acrylic Printed Board With Back lighting",
        "", area=None, rate=5200, amount=5200, height=24,
    )
    pooja_total = s.total(f"=G{pooja_base}+SUM(G{pooja_base+3}:G{s.r-1})")

    # ========== DINING AREA ==========
    s.section("DINING AREA")
    dining_first = s.r
    s.multi("BAY WINDOW", [
        {
            "desc": "Supply and Installation of BAY WALL COVERING PANELING with 16 MM PVC .6 Density Sheet,  finished with  1mm Merino/Green laminate.(Rate Not including light)",
            "dim": "", "area": 46, "rate": 650,
        },
        {
            "desc": "Supply and Installation of BAY WINDOW SITTING with Solid wood finish.(Rate Not including light)",
            "dim": "206 W x 83 L", "area": 19, "rate": 950,
        },
    ])
    s.item(
        "WASH UNIT",
        "Supply and Installation of WASH UNIT with 17MM PVC .7 Density Sheet, LAMINATED FOILED REGULAR "
        "GLOSSY RANGE SHUTTERS FOR BASE AND WALL UNITS. Hinges are of Hettich  AUTO Close & Drawers are of "
        "HETTICH GERMAN. Handles are Normal metal finish",
        "", area=13, rate=2200, height=40,
    )
    s.item("MIRROR", "Supply and Installation of 6MM mirror fixing on wall with 12mm ply back paneling", "", area=12, rate=850, height=22)
    s.item(
        "WASH SIDE WALL UNIT",
        "Supply and Installation of WASH UNIT with 17MM PVC .7 Density Sheet finished with  "
        "1mm Merino/Green laminate., Aluminium With Fluted glass  Shutters. Hinges are of "
        "Hettich  AUTO Close & Drawers are of HETTICH GERMAN. Handles are Normal metal "
        "finish",
        "30 W x 135 H", area=6, rate=2200, height=48,
    )
    s.item("DINING WALL DESIGN", "Decorative Wall Moulding with fabric printing  mural paintings ./rft", "", area=159, rate=190, height=20)
    s.item(
        "STAIRS UNDER SHOE RACK\nAND INVERTER STORAGE",
        "Supply and Installation of STAIR UNDER COVERING made out of  16MM GREENLAM MIKASA 710 MARINE "
        "PLYWOOD finished with  0.8mm both side white colour laminate.Shutters are made with 16 MM  GREENLAM "
        "MIKASA 710 MARINE PLYWOOD finished with both side 1mm Merino/Green laminate.",
        "", area=20, rate=1800, height=40,
    )
    s.item(
        "STAIRS UNDER STUDY TABLE\nWITH WALL SHELF",
        "Supply and Installation of STAIR UNDER STUDY TABLE made out of  16MM GREENLAM MIKASA 710 MARINE "
        "PLYWOOD finished with  0.8mm both side white colour laminate.Shutters are made with 16 MM  GREENLAM "
        "MIKASA 710 MARINE PLYWOOD finished with both side 1mm Merino/Green laminate.",
        "", area=14, rate=950, height=40,
    )
    s.item(
        "STAIR BOTTOM AND SIDE\nPANELING",
        "Supply and Installation of WALL PANELING  with 12 MM PVC .6 Density Sheet,  finished with  1mm "
        "Merino/Green laminate.",
        "", area=82, rate=550, height=28,
    )
    s.item(
        "KEY HOLDER",
        "Supply and Installation of  ROUND SHAPE SLIDING KEY HOLDER6MM made out of  16MM GREENLAM MIKASA "
        "710 MARINE PLYWOOD finished with  0.8mm both side white colour laminate. 6MM mirror fixing on Shutter.",
        "", area=16, rate=950, height=32,
    )
    dining_total = s.total(f"=SUM(G{dining_first}:G{s.r-1})")

    # ========== GF MASTER BEDROOM ==========
    s.section("GF MASTER BEDROOM")
    s.grey_sub("HINGED WARDROBE")
    s.spec("A", "Carcass Materials :", "16mm Laminate finish GREENLAM MIKASA 710 MARINE PLYWOOD cabinets with\n0.8mm matching PVC edge banding")
    s.spec("B", "Carcass Finish :", "In side .8mm and out side 1mm MERINO/GREEN LAM/CENTURY Laminate")
    s.spec("C", "Shutter Details :", "16MM GREENLAM MIKASA 710 MARINE PLYWOOD 1mm LAMINATED 2mm PVC\nEDGE BAND SHUTTERS FOR BASE AND WALL")
    s.spec("E", "Drawers Details :", "HETTICH GERMAN(Soft close)")
    s.spec("F", "Handle Details :", "NORMAL HANDLE")
    s.page_break()

    master_first = s.r
    s.item(
        "4 DOOR+SIDE DOOR HINGED\nWARDROBE",
        "Supply and Installation of HINGED WARDROBE with 16 MM GREENLAM MIKASA 710 "
        "MARINE PLYWOOD finished with  0.8mm both side white colour laminate.Shutters are "
        "made with 16 MM GREENLAM MIKASA 710 MARINE PLYWOOD finished with both side "
        "1mm Merino/Green laminate.",
        "L230cm X H210cm", area=52, rate=1800, height=52,
    )
    s.item(
        "WARDROBE LOFT (FRAME\nAND SHUTTER)",
        "Supply and Installation of WARDROBE LOFT (FRAME AND SHUTTER) with 16 MM "
        "GREENLAM MIKASA 710 MARINE PLYWOOD finished with  0.8mm both side white "
        "colour laminate.Shutters are made with 16 MM GREENLAM MIKASA 710 MARINE "
        "PLYWOOD finished with both side 1mm Merino/Green laminate.",
        "L230cm X H90cm", area=22.5, rate=1300, height=52,
    )
    s.grey_sub("BED COT KING SIZE")
    s.spec("A", "COT Boxing Materials :", "16mm Laminate finish GREENLAM MIKASA 710 MARINE PLYWOOD with 0.8mm\nmatching PVC edge banding")
    s.item(
        "BED COT",
        "Supply and Installation of BED COT KING SIZE with 16 MM GREENLAM MIKASA 710 "
        "MARINE PLYWOOD finished with  0.8mm both side white colour laminate. Finished with "
        "both side 1mm Merino/Green laminate. (Mattress not include)",
        "W187cm X L200cm", area=None, rate=None, amount=34000, height=40,
    )
    s.item(
        "HEAD BOARD",
        "16mm Laminate finish GREENLAM MIKASA 710 MARINE PLYWOOD with 0.8mm "
        "matching PVC edge banding with 1mm Merino/Green laminate and Cushion fabric "
        "finish( As per design)",
        "W187cm X H100cm", area=20, rate=1000, height=40,
    )
    s.item(
        "HEAD BOARD WALL\nPANELING",
        "Supply and Installation of WALL NICHE  with 12 MM PVC .6 Density Sheet,  finished with "
        "1mm Merino/Green laminate.(Rate Not including light). Rft",
        "W1.5cm X H190cm", area=18.6, rate=950, height=36,
    )
    s.item("WALLPAPER", "Customaized premium quality wallpaper", "", area=83, rate=85, height=18)
    s.item(
        "SIDE TABLE",
        "Supply and Installation of SIDE TABLE with 16 MM GREENLAM MIKASA 710 MARINE "
        "PLYWOOD finished with  0.8mm both side white colour laminate.Shutters are made "
        "with 16 MM  GREENLAM MIKASA 710 MARINE PLYWOOD finished with both side 1mm "
        "Merino/Green laminate. Hinges are of HETTICH GERMAN Close & Drawers are of "
        "HETTICH GERMAN. Handles are Normal metal finish",
        "W45cm X H45cm", area=1, rate=None, amount=5500, height=56,
    )
    s.item(
        "DRESSING TABLE",
        "Supply and Installation of STUDY WITH SIDE TABLE with 16 MM GREENLAM MIKASA "
        "710 MARINE PLYWOOD finished with  0.8mm both side white colour laminate.Shutters "
        "are made with 16 MM GREENLAM MIKASA 710 MARINE PLYWOOD finished with both "
        "side 1mm Merino/Green laminate. Hinges are of OLIVE  AUTO Close & Drawers are of "
        "HETTICH GERMAN. Handles are Normal metal finish.",
        "W64cm X H210cm", area=14.69, rate=1800, height=56,
    )
    s.item("MIRROR", "Supply and Installation of 6MM Mirror", "W64m X H135cm", area=10, rate=750, height=20)
    s.item(
        "STUDY TABLE",
        "Supply and Installation of STUDY TABLE made out of  16MM GREENLAM MIKASA 710 "
        "MARINE PLYWOOD finished with  0.8mm both side white colour laminate.Shutters are "
        "made with 16 MM  GREENLAM MIKASA 710 MARINE PLYWOOD finished with both side "
        "1mm Merino/Green laminate.",
        "W114m X H75cm", area=9.2, rate=1800, height=48,
    )
    master_total = s.total(f"=SUM(G{master_first}:G{s.r-1})")

    # ========== GF GUEST BEDROOM ==========
    s.section("GF GUEST BEDROOM")
    s.grey_sub("HINGED WARDROBE")
    s.spec("A", "Carcass Materials :", "16mm Laminate finish GREENLAM MIKASA 710 MARINE PLYWOOD grade cabinets\nwith 0.8mm matching PVC edge banding")
    s.spec("B", "Carcass Finish :", "In side .8mm and out side 1mm MERINO/GREEN LAM/CENTURY Laminate")
    s.spec("C", "Shutter Details :", "16MM GREENLAM MIKASA 710 MARINE PLYWOOD 1mm LAMINATED 2mm PVC\nEDGE BAND SHUTTERS FOR BASE AND WALL")
    s.spec("D", "Drawers Details :", "HETTICH GERMAN(Rate not included)")
    s.spec("E", "Handle Details :", "NORMAL HANDLE")
    guest_first = s.r
    s.item(
        "4 DOOR HINGED WARDROBE",
        "Supply and Installation of HINGED WARDROBE with 16 MM GREENLAM MIKASA 710 "
        "MARINE PLYWOOD finished with  0.8mm both side white colour laminate.Shutters are "
        "made with 16 MM GREENLAM MIKASA 710 MARINE PLYWOOD finished with both side "
        "1mm Merino/Green laminate.",
        "L200cm X H210cm", area=46.2, rate=1800, height=52,
    )
    s.item(
        "WARDROBE LOFT (FRAME\nAND SHUTTER)",
        "Supply and Installation of  WARDROBE LOFT (FRAME AND SHUTTER) with 16 MM "
        "GREENLAM MIKASA 710 MARINE PLYWOOD finished with  0.8mm both side white "
        "colour laminate.Shutters are made with 16 MM GREENLAM MIKASA 710 MARINE "
        "PLYWOOD finished with both side 1mm Merino/Green laminate.",
        "L200cm X H90cm", area=19.8, rate=1300, height=52,
    )
    s.grey_sub("BED COT QUEEN SIZE")
    s.spec("A", "COT Boxing Materials :", "16mm Laminate finish GREENLAM MIKASA 710 MARINE PLYWOOD with 0.8mm\nmatching PVC edge banding")
    s.item(
        "BED COT",
        "Supply and Installation of BED COT QUEEN SIZE with 16 MM GREENLAM MIKASA 710 "
        "MARINE PLYWOOD finished with  0.8mm both side white colour laminate. Finished with "
        "both side 1mm Merino/Green laminate.(Mattress not include)",
        "W155cm X L200cm", area=None, rate=None, amount=31000, height=40,
    )
    s.item(
        "HEAD BOARD",
        "16mm Laminate finish GREENLAM MIKASA 710 MARINE PLYWOOD with 0.8mm "
        "matching PVC edge banding with 1mm Merino/Green laminate and Cushion fabric "
        "finish( As per design)",
        "W155cm X H100cm", area=17, rate=900, height=40,
    )
    s.item("WALLPAPER", "Customaized premium quality wallpaper", "", area=113, rate=85, height=18)
    s.page_break()
    s.item(
        "SIDE TABLE",
        "Supply and Installation of SIDE TABLE with  16 MM GREENLAM MIKASA 710 MARINE "
        "PLYWOOD finished with  0.8mm both side white colour laminate.Shutters are made "
        "with 16 MM GREENLAM MIKASA 710 MARINE PLYWOOD finished with both side 1mm "
        "Merino/Green laminate. Hinges are of OLIVE  AUTO Close & Drawers are of HETTICH "
        "GERMAN. Handles are Normal metal finish",
        "W45cm X H45cm", area="2Nos.", rate=None, amount=11000, height=56,
    )
    guest_total = s.total(f"=SUM(G{guest_first}:G{s.r-1})")

    # ========== FF COMMON AREA ==========
    s.section("FF  COMMON AREA")
    ff_first = s.r
    s.multi("BAY WINDOW", [
        {
            "desc": "Supply and Installation of BAY WALL COVERING PANELING with 16 MM PVC .6 Density Sheet,  finished with  1mm Merino/Green laminate.(Rate Not including light)",
            "dim": "", "area": 46, "rate": 650,
        },
        {
            "desc": "Supply and Installation of BAY WINDOW SITTING with Solid wood finish.(Rate Not including light)",
            "dim": "206 W x 83 L", "area": 19, "rate": 950,
        },
    ])
    s.item(
        "FOLDING IRONING TABLE\nwith PANELING",
        "Supply and Installation of FOLDING IRONING TABLE and BODER with 16 MM "
        "GREENLAM MIKASA 710 MARINE PLYWOOD finished with  0.8mm both side white "
        "colour laminate. Ebco folding hardware is using.",
        "W206cm X H150cm", area=33, rate=650, height=40,
    )
    s.item(
        "WALL UNIT FOR HANGER",
        "Supply and Installation of WALL UNIT with 16 MM GREENLAM MIKASA 710 MARINE "
        "PLYWOOD finished with  0.8mm both side white colour laminate.Shutters are made "
        "with 16 MM GREENLAM MIKASA 710 MARINE PLYWOOD finished with both side 1mm "
        "Merino/Green laminate.",
        "L206cm X H110cm", area=24, rate=1800, height=48,
    )
    s.item("HANGER", "EBCO Wardrobe Lift Side Mount – 12", "", area=None, rate=1, amount=5000, height=18)
    s.item(
        "OPEN LEDGE SHELF",
        "Supply and Installation of OPEN LEDGE with 16 MM GREENLAM MIKASA 710 MARINE "
        "PLYWOOD finished with  0.8mm both side white colour laminate. 4 NOS",
        "L75cm X W15cm", area=4, rate=2300, height=28,
    )
    ff_total = s.total(f"=SUM(G{ff_first}:G{s.r-1})")

    furniture_total = s.blue_total("TOTAL", f"=G{kit_total}+G{work_total}+G{living_total}+G{pooja_total}+G{dining_total}+G{master_total}+G{guest_total}+G{ff_total}")

    # ========== HANDRAIL ==========
    s.section("HANDRAIL WORKS")
    rail_desc = (
        "Supply and Installation of Hand Railing work with 12mm Toughened Glass with "
        "Nesesery Hardware fitting, 3 Inch X 3inch  Teak wood Toprailing.(Wooden Polish Will be Extra)"
    )
    s.item("UPER LIVING HANDRAIL", "Supply and Installation of Hand Railing work with 12mmToughened Glass with Nesesery Hardware fitting, 3 Inch X 3inch  Teak wood Toprailing.(Wooden Polish Will be Extra)", "Rft", area=16.27, rate=2750, height=28)
    s.item("STAIR HANDRAIL", rail_desc, "Rft", area=25, rate=2750, height=32)
    s.item("BALCONY HANDRAIL", rail_desc, "Rft", area=13, rate=2750, height=32)
    rail_total = s.total(f"=ROUND(SUM(G{furniture_total+2}:G{s.r-1}),0)")
    s.blue_total("GRAND TOTAL", f"=G{furniture_total}+G{rail_total}")

    # ========== BRANDS / NOTES ==========
    def header_row(title):
        r = s.r
        s.blank_row_cells(r, fill=FILL_GREEN, font=FONT_WHITE, align=ALIGN_C)
        merge(ws, f"A{r}:G{r}")
        ws[f"A{r}"] = title
        ws[f"A{r}"].font = FONT_WHITE
        ws[f"A{r}"].alignment = ALIGN_C
        ws.row_dimensions[r].height = 16
        s.r += 1

    header_row("CORE METERIAL BRAND")
    r = s.r
    s.blank_row_cells(r)
    merge(ws, f"A{r}:G{r}")
    ws[f"A{r}"] = "16MM GREENLAM MIKASA 710 MARINE PLYWOOD"
    style_cell(ws[f"A{r}"], font=FONT_BOLD, align=ALIGN_C)
    ws.row_dimensions[r].height = 16
    s.r += 1

    r = s.r
    s.blank_row_cells(r)
    merge(ws, f"A{r}:G{r}")
    ws.row_dimensions[r].height = 52
    mikasa = XLImage(str(ASSETS / "mikasa_logos.png"))
    mikasa.width = sheet_px
    mikasa.height = 70
    mikasa.anchor = f"A{r}"
    ws.add_image(mikasa)
    s.r += 1

    header_row("HARDWARE METERIAL BRAND")
    r = s.r
    s.blank_row_cells(r)
    merge(ws, f"A{r}:G{r}")
    ws.row_dimensions[r].height = 48
    hw = XLImage(str(ASSETS / "hardware_brands.png"))
    hw.width = sheet_px
    hw.height = 64
    hw.anchor = f"A{r}"
    ws.add_image(hw)
    s.r += 1

    header_row("NOTE")
    notes = [
        "1. Delivery Schedule   :    8 - 9 Weeks",
        "2. Installation   :      Included",
        "3. Prices validity period   :      30 Days From Date of Issue",
        "4.Warranty   :   As per Company policy.(15 years)",
        "5.Refund :  Cancellation of order placed will not be accepted if the material is already manufactured. Designing charges will not be refunded in any case",
        "6.Exclusion   :   Counter top/Dado tiles/Light fixtures/Electrical and Plumbing work/Any kind of Appliances/Any kind of Civil works are not part of our Offer.",
    ]
    for note in notes:
        r = s.r
        s.blank_row_cells(r, align=ALIGN_L)
        merge(ws, f"B{r}:G{r}")
        ws[f"B{r}"] = note
        style_cell(ws[f"B{r}"], font=FONT_BODY, align=ALIGN_L)
        ws.row_dimensions[r].height = 16 if len(note) < 90 else 28
        s.r += 1

    r = s.r
    s.blank_row_cells(r)
    ws[f"A{r}"] = "BANK DETAILS"
    style_cell(ws[f"A{r}"], font=FONT_BOLD, align=ALIGN_C)
    merge(ws, f"B{r}:G{r}")
    ws.row_dimensions[r].height = 18

    last_row = s.r
    ws.print_area = f"A1:G{last_row}"
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0

    wb.save(OUT)
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    build()
