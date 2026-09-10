'use strict';

/* Official Teak Room quotation Excel / PDF export (matches the printed quote). */

const BRAND = {
  green: '1E4E3F',
  peach: 'F8CBAD',
  blue: '8FA9DB',
  grey: 'E7E6E6',
  gold: 'C4B28F'
};

const QUOTE_NOTES = [
  '1. Delivery Schedule   :    8 - 9 Weeks',
  '2. Installation   :      Included',
  '3. Prices validity period   :      30 Days From Date of Issue',
  '4.Warranty   :   As per Company policy.(15 years)',
  '5.Refund :  Cancellation of order placed will not be accepted if the material is already manufactured. Designing charges will not be refunded in any case',
  '6.Exclusion   :   Counter top/Dado tiles/Light fixtures/Electrical and Plumbing work/Any kind of Appliances/Any kind of Civil works are not part of our Offer.'
];

function getQuoteNotes() {
  const pack = (typeof catalogState !== 'undefined' && catalogState.data && catalogState.data.reusable_text) || {};
  const items = pack.notes;
  if (!Array.isArray(items) || !items.length) return QUOTE_NOTES;
  return items.map((t, i) => {
    const s = String(t).trim();
    if (/^\d+[\.\)]/.test(s)) return s;
    return (i + 1) + '. ' + s;
  });
}

function fmtQuoteDate(iso) {
  if (!iso) return '';
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[3] + '.' + m[2] + '.' + m[1];
  return String(iso);
}

function todayDotDate() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear();
}

function inr(n, decimals) {
  const v = Number(n) || 0;
  const d = decimals == null ? (Math.abs(v % 1) > 0.001 ? 2 : 0) : decimals;
  return '₹ ' + v.toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });
}

function itemExportRow(item) {
  const amt = computeAmount(item);
  const desc = item.desc || '';
  switch (item.type) {
    case 'area': {
      const area = areaOf(item);
      const dim = item.dim || (
        num(item.length) && num(item.height)
          ? fmtNum(item.length) + ' x ' + fmtNum(item.height)
          : ''
      );
      return { name: item.name, desc, dim, area: area || '', rate: item.rate, amount: amt };
    }
    case 'running':
      return {
        name: item.name, desc, dim: item.dim || 'Rft',
        area: item.length, rate: item.rate, amount: amt
      };
    case 'quantity':
      return {
        name: item.name, desc, dim: item.dim || '',
        area: (item.qty || 0) + 'Nos', rate: item.rate, amount: amt
      };
    case 'fixed':
    default:
      return {
        name: item.name, desc, dim: '',
        area: 'lumpsum', rate: '', amount: amt
      };
  }
}

function quoteSections() {
  return data.map(sec => {
    const items = (sec.items || []).map(itemExportRow);
    const total = items.reduce((s, it) => s + num(it.amount), 0);
    return { name: sec.name || 'SECTION', items, total };
  });
}

function quoteGrand(sections) {
  return sections.reduce((s, sec) => s + sec.total, 0);
}

async function loadAssetBase64(path) {
  try {
    const res = await fetch(path);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  } catch (e) {
    return null;
  }
}

function headerSvgDataUri() {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="1726" height="151" viewBox="0 0 1726 151">' +
    '<rect width="1726" height="151" fill="#1E4E3F"/>' +
    '<text x="863" y="70" text-anchor="middle" fill="#C4B28F" font-family="Georgia,serif" font-size="48">teak room</text>' +
    '<text x="863" y="108" text-anchor="middle" fill="#C4B28F" font-family="Georgia,serif" font-size="22">interiors</text>' +
    '</svg>';
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

function downloadBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}

function quoteFilename() {
  const name = [meta.client, meta.place].filter(Boolean).join(' ').trim();
  return (name || 'quotation').replace(/[/\\]/g, '-') + '.xlsx';
}

async function exportOfficialExcel() {
  if (typeof ExcelJS === 'undefined') throw new Error('Excel library failed to load');

  const sections = quoteSections();
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Teak Room Interiors';
  wb.title = [meta.client, meta.place].filter(Boolean).join(' - ').trim() || 'Quotation';
  const ws = wb.addWorksheet('Quotation', {
    pageSetup: {
      paperSize: 1,
      orientation: 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
      margins: { left: 0.25, right: 0.25, top: 0.35, bottom: 0.35, header: 0.1, footer: 0.1 }
    },
    views: [{ showGridLines: false }]
  });

  [16, 14, 32, 16, 14, 12, 16].forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  const thin = { style: 'thin', color: { argb: 'FF000000' } };
  const border = { top: thin, left: thin, bottom: thin, right: thin };
  const fill = hex => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + hex } });
  const font = (opts) => Object.assign({ name: 'Calibri', size: 8, color: { argb: 'FF000000' } }, opts);
  const align = (h) => ({ horizontal: h || 'center', vertical: 'middle', wrapText: true });

  const paint = (row, col, value, style) => {
    const cell = ws.getCell(row, col);
    if (value !== undefined && value !== null && value !== '') cell.value = value;
    cell.border = border;
    cell.alignment = style.alignment || align('center');
    cell.font = style.font || font();
    if (style.fill) cell.fill = style.fill;
    if (style.numFmt) cell.numFmt = style.numFmt;
    return cell;
  };

  const paintRange = (r1, r2, c1, c2, style) => {
    for (let rr = r1; rr <= r2; rr++) {
      for (let c = c1; c <= c2; c++) paint(rr, c, undefined, style || {});
    }
  };

  let r = 1;
  paintRange(r, r, 1, 7, {
    fill: fill(BRAND.green),
    font: font({ bold: true, color: { argb: 'FF' + BRAND.gold }, size: 16 }),
    alignment: align('center')
  });
  ws.mergeCells(r, 1, r, 7);
  ws.getRow(r).height = 38;

  const banner = await loadAssetBase64('assets/header_banner.png');
  if (banner) {
    const imgId = wb.addImage({ base64: banner, extension: 'png' });
    ws.addImage(imgId, { tl: { col: 0, row: 0 }, br: { col: 7, row: 1 } });
  } else {
    ws.getCell(r, 1).value = 'teak room interiors';
  }
  r++;

  const genDate = todayDotDate();
  const validDate = fmtQuoteDate(meta.validtill);
  paintRange(r, r, 1, 7, { alignment: align('left') });
  ws.mergeCells(r, 1, r, 3);
  paint(r, 1, 'Quotation No:' + (meta.qno || ''), { font: font(), alignment: align('left') });
  ws.mergeCells(r, 4, r, 6);
  paint(r, 4, 'DATE OF QUOTE GENERATED', { font: font(), alignment: align('center') });
  paint(r, 7, genDate, { font: font({ bold: true }) });
  ws.getRow(r).height = 16;
  r++;

  paintRange(r, r, 1, 7, { alignment: align('left') });
  ws.mergeCells(r, 1, r, 3);
  paint(r, 1, 'Client Name: ' + (meta.client || ''), { font: font(), alignment: align('left') });
  ws.mergeCells(r, 4, r, 6);
  paint(r, 4, 'QUOTE VALID TILL', { font: font(), alignment: align('center') });
  paint(r, 7, validDate, { font: font({ bold: true }) });
  ws.getRow(r).height = 16;
  r++;

  paintRange(r, r, 1, 7, { alignment: align('left') });
  ws.mergeCells(r, 1, r, 3);
  paint(r, 1, 'Place : ' + (meta.place || ''), { font: font(), alignment: align('left') });
  ws.mergeCells(r, 4, r, 7);
  ws.getRow(r).height = 16;
  r++;

  paintRange(r, r, 1, 7, { font: font({ bold: true }) });
  ws.mergeCells(r, 2, r, 3);
  paint(r, 2, 'Description', { font: font({ bold: true }) });
  paint(r, 4, 'LENGTH & HEIGHT', { font: font({ bold: true }) });
  paint(r, 5, 'Area,Sqft,Nos', { font: font({ bold: true }) });
  paint(r, 6, 'Rate/Sqft', { font: font({ bold: true }) });
  paint(r, 7, 'Amount', { font: font({ bold: true }) });
  ws.getRow(r).height = 16;
  r++;

  const inrFmt = '"₹"#,##,##0.00';

  sections.forEach(sec => {
    paintRange(r, r, 1, 7, {
      fill: fill(BRAND.green),
      font: font({ bold: true, color: { argb: 'FFFFFFFF' } })
    });
    ws.mergeCells(r, 1, r, 7);
    ws.getCell(r, 1).value = String(sec.name).toUpperCase();
    ws.getRow(r).height = 16;
    r++;

    sec.items.forEach(it => {
      paintRange(r, r, 1, 7, { alignment: align('center') });
      paint(r, 1, it.name, { font: font({ bold: true }), alignment: align('center') });
      ws.mergeCells(r, 2, r, 3);
      paint(r, 2, it.desc, { font: font(), alignment: align('left') });
      paint(r, 4, it.dim, { font: font() });
      const areaCell = paint(r, 5, it.area, { font: font() });
      if (typeof it.area === 'number') areaCell.numFmt = '0.##';
      const rateCell = paint(r, 6, it.rate === '' ? '' : it.rate, { font: font() });
      if (typeof it.rate === 'number') rateCell.numFmt = '0';
      paint(r, 7, it.amount, { font: font({ bold: true, size: 9 }), alignment: align('right'), numFmt: inrFmt });
      const descLen = String(it.desc || '').length;
      ws.getRow(r).height = descLen > 160 ? 48 : descLen > 80 ? 32 : 20;
      r++;
    });

    paintRange(r, r, 1, 7, {
      fill: fill(BRAND.peach),
      font: font({ bold: true, size: 10 }),
      alignment: align('right')
    });
    ws.mergeCells(r, 1, r, 6);
    ws.getCell(r, 1).value = 'TOTAL';
    paint(r, 7, sec.total, {
      fill: fill(BRAND.peach),
      font: font({ bold: true, size: 10 }),
      alignment: align('right'),
      numFmt: '"₹"#,##,##0'
    });
    ws.getRow(r).height = 18;
    r++;
  });

  const grand = quoteGrand(sections);
  paintRange(r, r, 1, 7, {
    fill: fill(BRAND.blue),
    font: font({ bold: true, size: 11 }),
    alignment: align('right')
  });
  ws.mergeCells(r, 1, r, 6);
  ws.getCell(r, 1).value = 'GRAND TOTAL';
  paint(r, 7, grand, {
    fill: fill(BRAND.blue),
    font: font({ bold: true, size: 11 }),
    alignment: align('right'),
    numFmt: '"₹"#,##,##0'
  });
  ws.getRow(r).height = 20;
  r++;

  const band = (title) => {
    paintRange(r, r, 1, 7, {
      fill: fill(BRAND.green),
      font: font({ bold: true, color: { argb: 'FFFFFFFF' } })
    });
    ws.mergeCells(r, 1, r, 7);
    ws.getCell(r, 1).value = title;
    ws.getRow(r).height = 16;
    r++;
  };

  band('CORE METERIAL BRAND');
  paintRange(r, r, 1, 7, { font: font({ bold: true }) });
  ws.mergeCells(r, 1, r, 7);
  ws.getCell(r, 1).value = '16MM GREENLAM MIKASA 710 MARINE PLYWOOD';
  ws.getRow(r).height = 16;
  r++;

  const mikasa = await loadAssetBase64('assets/mikasa_logos.png');
  paintRange(r, r, 1, 7, {});
  ws.mergeCells(r, 1, r, 7);
  ws.getRow(r).height = 42;
  if (mikasa) {
    const id = wb.addImage({ base64: mikasa, extension: 'png' });
    ws.addImage(id, { tl: { col: 0, row: r - 1 }, br: { col: 7, row: r } });
  }
  r++;

  band('HARDWARE METERIAL BRAND');
  const hw = await loadAssetBase64('assets/hardware_brands.png');
  paintRange(r, r, 1, 7, {});
  ws.mergeCells(r, 1, r, 7);
  ws.getRow(r).height = 40;
  if (hw) {
    const id = wb.addImage({ base64: hw, extension: 'png' });
    ws.addImage(id, { tl: { col: 0, row: r - 1 }, br: { col: 7, row: r } });
  }
  r++;

  band('NOTE');
  getQuoteNotes().forEach(note => {
    paintRange(r, r, 1, 7, { alignment: align('left') });
    ws.mergeCells(r, 2, r, 7);
    paint(r, 2, note, { font: font(), alignment: align('left') });
    ws.getRow(r).height = note.length > 90 ? 28 : 16;
    r++;
  });

  paintRange(r, r, 1, 7, {});
  paint(r, 1, 'BANK DETAILS', { font: font({ bold: true }) });
  ws.mergeCells(r, 2, r, 7);
  ws.getRow(r).height = 18;

  ws.pageSetup.printArea = 'A1:G' + r;

  const buf = await wb.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    quoteFilename()
  );
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function officialQuoteHTML(bannerSrc, mikasaSrc, hwSrc) {
  const sections = quoteSections();
  const grand = quoteGrand(sections);
  const genDate = todayDotDate();
  const validDate = fmtQuoteDate(meta.validtill);

  const sectionHtml = sections.map(sec => {
    const items = sec.items.map(it => {
      const area = it.area === '' || it.area == null ? '' : (typeof it.area === 'number' ? fmtNum(it.area) : escapeHtml(it.area));
      const rate = it.rate === '' || it.rate == null ? '' : fmtNum(it.rate);
      return '<tr class="item">' +
        '<td class="name">' + escapeHtml(it.name) + '</td>' +
        '<td class="desc" colspan="2">' + escapeHtml(it.desc) + '</td>' +
        '<td>' + escapeHtml(it.dim) + '</td>' +
        '<td>' + area + '</td>' +
        '<td>' + rate + '</td>' +
        '<td class="amt">' + inr(it.amount, 2) + '</td>' +
        '</tr>';
    }).join('');
    return '<tr class="sec"><td colspan="7">' + escapeHtml(String(sec.name).toUpperCase()) + '</td></tr>' +
      items +
      '<tr class="total"><td colspan="6">TOTAL</td><td class="amt">' + inr(sec.total, 0) + '</td></tr>';
  }).join('');

  const notes = getQuoteNotes().map(n =>
    '<tr class="note"><td></td><td colspan="6">' + escapeHtml(n) + '</td></tr>'
  ).join('');
  const banner = bannerSrc
    ? '<img src="' + bannerSrc + '" alt="teak room interiors">'
    : '<div class="banner-fallback">teak room interiors</div>';
  const mikasa = mikasaSrc ? '<img src="' + mikasaSrc + '" alt="Mikasa">' : '';
  const hw = hwSrc ? '<img src="' + hwSrc + '" alt="Hardware">' : '<div class="hw-fallback">Hettich &nbsp;&nbsp; HÄFELE</div>';

  const pdfName = [meta.client, meta.place].filter(Boolean).join(' ').trim() || 'Quotation';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(pdfName)}</title>
<style>
  @page { size: letter portrait; margin: 10mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Calibri, Arial, sans-serif; font-size: 8.5pt; color: #000; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  td { border: 1px solid #000; padding: 3px 5px; vertical-align: middle; text-align: center; }
  .banner td { padding: 0; background: #1E4E3F; height: 52px; }
  .banner img { display: block; width: 100%; height: 52px; object-fit: cover; }
  .banner-fallback { color: #C4B28F; font-size: 18pt; letter-spacing: 0.04em; padding: 12px; }
  .meta td { text-align: left; }
  .meta .right { text-align: center; font-weight: 700; }
  .cols td { font-weight: 700; }
  .sec td { background: #1E4E3F; color: #fff; font-weight: 700; letter-spacing: 0.04em; }
  .item .name { font-weight: 700; }
  .item .desc { text-align: left; font-weight: 400; }
  .item .amt { font-weight: 700; text-align: right; white-space: nowrap; }
  .total td { background: #F8CBAD; font-weight: 700; text-align: right; }
  .grand td { background: #8FA9DB; font-weight: 700; text-align: right; font-size: 11pt; }
  .band td { background: #1E4E3F; color: #fff; font-weight: 700; }
  .brand td { font-weight: 700; }
  .logo-row td { padding: 4px; height: 48px; }
  .logo-row img { max-height: 44px; width: 100%; object-fit: contain; }
  .note td { text-align: left; font-weight: 400; }
  .hw-fallback { padding: 12px; font-weight: 700; letter-spacing: 0.08em; }
  col.c1 { width: 14%; } col.c2 { width: 12%; } col.c3 { width: 28%; }
  col.c4 { width: 14%; } col.c5 { width: 11%; } col.c6 { width: 9%; } col.c7 { width: 12%; }
</style>
</head>
<body>
<table>
  <colgroup>
    <col class="c1"><col class="c2"><col class="c3"><col class="c4">
    <col class="c5"><col class="c6"><col class="c7">
  </colgroup>
  <tr class="banner"><td colspan="7">${banner}</td></tr>
  <tr class="meta">
    <td colspan="3">Quotation No:${escapeHtml(meta.qno || '')}</td>
    <td colspan="3">DATE OF QUOTE GENERATED</td>
    <td class="right">${escapeHtml(genDate)}</td>
  </tr>
  <tr class="meta">
    <td colspan="3">Client Name: ${escapeHtml(meta.client || '')}</td>
    <td colspan="3">QUOTE VALID TILL</td>
    <td class="right">${escapeHtml(validDate)}</td>
  </tr>
  <tr class="meta">
    <td colspan="3">Place : ${escapeHtml(meta.place || '')}</td>
    <td colspan="4"></td>
  </tr>
  <tr class="cols">
    <td></td>
    <td colspan="2">Description</td>
    <td>LENGTH &amp; HEIGHT</td>
    <td>Area,Sqft,Nos</td>
    <td>Rate/Sqft</td>
    <td>Amount</td>
  </tr>
  ${sectionHtml}
  <tr class="grand"><td colspan="6">GRAND TOTAL</td><td class="amt">${inr(grand, 0)}</td></tr>
  <tr class="band"><td colspan="7">CORE METERIAL BRAND</td></tr>
  <tr class="brand"><td colspan="7">16MM GREENLAM MIKASA 710 MARINE PLYWOOD</td></tr>
  <tr class="logo-row"><td colspan="7">${mikasa}</td></tr>
  <tr class="band"><td colspan="7">HARDWARE METERIAL BRAND</td></tr>
  <tr class="logo-row"><td colspan="7">${hw}</td></tr>
  <tr class="band"><td colspan="7">NOTE</td></tr>
  ${notes}
  <tr><td>BANK DETAILS</td><td colspan="6"></td></tr>
</table>
</body>
</html>`;
}

async function exportOfficialPdf() {
  const toDataUri = async (path, mime) => {
    const b64 = await loadAssetBase64(path);
    return b64 ? 'data:' + mime + ';base64,' + b64 : '';
  };
  const banner = (await toDataUri('assets/header_banner.png', 'image/png')) || headerSvgDataUri();
  const mikasa = await toDataUri('assets/mikasa_logos.png', 'image/png');
  const hw = await toDataUri('assets/hardware_brands.png', 'image/png');
  const html = officialQuoteHTML(banner, mikasa, hw);
  const w = window.open('', '_blank');
  if (!w) throw new Error('Pop-up blocked — allow pop-ups to export PDF');
  w.document.open();
  w.document.write(html);
  w.document.close();
  const printNow = () => { w.focus(); w.print(); };
  if (w.document.readyState === 'complete') setTimeout(printNow, 250);
  else w.onload = () => setTimeout(printNow, 250);
}
