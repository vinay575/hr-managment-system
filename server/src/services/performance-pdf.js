import PDFDocument from 'pdfkit';

const label = (s) =>
  String(s || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * Performance report PDF — generated from live database rows supplied by the
 * reports endpoint. Supports a summary strip and one or more tables.
 */
export function generatePerformanceReportPdf({
  title = 'Performance report',
  subtitle = '',
  summary = [],
  sections = [],
  footer = 'Aurora Labs · People, beautifully managed',
  generatedBy = '',
  filters = '',
}) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 36, size: 'A4', layout: 'landscape', bufferPages: true });
      const buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));

      const left = 36;
      const pageWidth = 770;

      const header = () => {
        doc.fillColor('#0f172a').fontSize(18).font('Helvetica-Bold').text('Aurora Labs', left, 36);
        doc.fillColor('#64748b').fontSize(8.5).font('Helvetica').text('People, beautifully managed', left, 58);
        doc.fillColor('#334155').fontSize(10).font('Helvetica-Bold').text(String(title).toUpperCase(), 360, 38, { width: 446, align: 'right' });
        doc.fillColor('#64748b').font('Helvetica').fontSize(8);
        doc.text(`Generated: ${new Date().toLocaleString()}`, 360, 54, { width: 446, align: 'right' });
        if (generatedBy) doc.text(`Prepared by: ${generatedBy}`, 360, 68, { width: 446, align: 'right' });
        if (filters) doc.text(filters, 360, 82, { width: 446, align: 'right', ellipsis: true });
        doc.moveTo(left, 100).lineTo(left + pageWidth, 100).strokeColor('#e2e8f0').lineWidth(1).stroke();
      };

      header();

      let y = 112;
      if (subtitle) {
        doc.fillColor('#475569').fontSize(9).font('Helvetica').text(subtitle, left, y, { width: pageWidth });
        y += 18;
      }

      if (summary.length) {
        const gap = 8;
        const boxWidth = Math.floor((pageWidth - gap * (summary.length - 1)) / summary.length);
        summary.forEach((item, index) => {
          const x = left + index * (boxWidth + gap);
          doc.roundedRect(x, y, boxWidth, 46, 6).fillAndStroke('#f8fafc', '#e2e8f0');
          doc.fillColor('#64748b').fontSize(7.5).font('Helvetica');
          doc.text(String(item.label), x + 10, y + 9, { width: boxWidth - 20, ellipsis: true });
          doc.fillColor('#0f172a').fontSize(14).font('Helvetica-Bold');
          doc.text(String(item.value ?? '—'), x + 10, y + 22, { width: boxWidth - 20, ellipsis: true });
        });
        y += 60;
      }

      for (const section of sections) {
        if (y > 500) {
          doc.addPage();
          y = 50;
        }
        doc.fillColor('#0f172a').fontSize(11).font('Helvetica-Bold').text(section.title, left, y);
        y += 18;

        const columns = section.columns || [];
        const totalWidth = columns.reduce((sum, c) => sum + Number(c.width || 0), 0) || pageWidth;
        const scale = pageWidth / totalWidth;
        const widths = columns.map((c) => Number(c.width || 0) * scale);

        const drawHead = () => {
          doc.fillColor('#64748b').fontSize(7.5).font('Helvetica-Bold');
          let x = left;
          columns.forEach((col, i) => {
            doc.text(String(col.header || '').toUpperCase(), x, y, { width: widths[i] - 6, ellipsis: true });
            x += widths[i];
          });
          y += 12;
          doc.moveTo(left, y).lineTo(left + pageWidth, y).strokeColor('#e2e8f0').stroke();
          y += 4;
        };

        drawHead();

        const rows = section.rows || [];
        if (!rows.length) {
          doc.fillColor('#94a3b8').fontSize(8.5).font('Helvetica').text('No records found for the selected filters.', left, y);
          y += 20;
        } else {
          doc.fontSize(7.5).font('Helvetica');
          for (const row of rows) {
            if (y > 540) {
              doc.addPage();
              y = 50;
              drawHead();
              doc.fontSize(7.5).font('Helvetica');
            }
            let x = left;
            doc.fillColor('#334155');
            columns.forEach((col, i) => {
              let value = row[col.key];
              if (Array.isArray(value)) value = value.join(', ');
              doc.text(value == null || value === '' ? '—' : String(value), x, y, { width: widths[i] - 6, ellipsis: true });
              x += widths[i];
            });
            y += 14;
          }
        }
        y += 14;
      }

      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i += 1) {
        doc.switchToPage(i);
        doc.moveTo(left, 556).lineTo(left + pageWidth, 556).strokeColor('#e2e8f0').stroke();
        doc.fillColor('#94a3b8').fontSize(7).font('Helvetica');
        const text = footer ? `${footer} · Page ${i + 1} of ${range.count}` : `Page ${i + 1} of ${range.count}`;
        doc.text(text, left, 562, { width: pageWidth, align: 'center', ellipsis: true });
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

export const performanceLabel = label;
