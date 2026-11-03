import PDFDocument from 'pdfkit';

const money = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const label = (s) => String(s || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * Employee expense statement — generated from live database records.
 */
export function generateExpenseStatementPdf({
  employee,
  claims = [],
  reimbursements = [],
  from,
  to,
  statementFooter = 'Aurora Labs · People, beautifully managed',
}) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 40, size: 'A4', bufferPages: true });
      const buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));

      const pageWidth = 515;
      const left = 40;

      const header = () => {
        doc.fillColor('#0f172a').fontSize(20).font('Helvetica-Bold').text('Aurora Labs', left, 40);
        doc.fillColor('#64748b').fontSize(9).font('Helvetica').text('People, beautifully managed', left, 64);
        doc.fillColor('#334155').fontSize(10).font('Helvetica-Bold').text('EXPENSE STATEMENT', 300, 42, { align: 'right' });
        doc.fillColor('#64748b').font('Helvetica').text(`Generated: ${new Date().toLocaleDateString()}`, 300, 58, { align: 'right' });
        if (from || to) doc.text(`Period: ${from || 'Start'} → ${to || 'Today'}`, 300, 72, { align: 'right' });
        doc.moveTo(left, 92).lineTo(left + pageWidth, 92).strokeColor('#e2e8f0').lineWidth(1).stroke();
      };

      header();

      doc.fillColor('#0f172a').fontSize(12).font('Helvetica-Bold').text(`${employee.first_name} ${employee.last_name}`);
      doc.fontSize(9).font('Helvetica').fillColor('#475569');
      doc.text(`Employee code: ${employee.employee_code || '—'}`);
      if (employee.department_name) doc.text(`Department: ${employee.department_name}`);
      if (employee.designation) doc.text(`Designation: ${employee.designation}`);
      if (employee.email) doc.text(`Email: ${employee.email}`);

      const approvedTotal = claims
        .filter((c) => ['approved', 'reimbursement_pending', 'partially_reimbursed', 'reimbursed'].includes(c.approval_status))
        .reduce((sum, c) => sum + Number(c.approved_amount || 0), 0);
      const paidTotal = reimbursements
        .filter((r) => r.payment_status === 'paid')
        .reduce((sum, r) => sum + Number(r.amount || 0), 0);

      let y = 190;
      doc.roundedRect(left, y, pageWidth, 58, 8).fillAndStroke('#f8fafc', '#e2e8f0');
      doc.fillColor('#0f172a').fontSize(9).font('Helvetica-Bold');
      doc.text('Claims', left + 16, y + 12);
      doc.text('Approved amount', left + 150, y + 12);
      doc.text('Reimbursed', left + 300, y + 12);
      doc.fontSize(14).fillColor('#1e293b');
      doc.text(String(claims.length), left + 16, y + 30);
      doc.text(`$${money(approvedTotal)}`, left + 150, y + 30);
      doc.text(`$${money(paidTotal)}`, left + 300, y + 30);
      y += 78;

      const columns = [
        { title: 'Date', x: left, width: 58 },
        { title: 'Claim', x: left + 58, width: 80 },
        { title: 'Title', x: left + 138, width: 130 },
        { title: 'Category', x: left + 268, width: 82 },
        { title: 'Amount', x: left + 350, width: 55 },
        { title: 'Approval', x: left + 405, width: 55 },
        { title: 'Payment', x: left + 460, width: 55 },
      ];

      const tableHead = () => {
        doc.fillColor('#64748b').fontSize(7.5).font('Helvetica-Bold');
        for (const col of columns) doc.text(col.title.toUpperCase(), col.x, y, { width: col.width });
        y += 14;
        doc.moveTo(left, y).lineTo(left + pageWidth, y).strokeColor('#e2e8f0').stroke();
        y += 6;
      };

      tableHead();

      doc.fontSize(7.5).font('Helvetica');
      for (const c of claims) {
        if (y > 760) {
          doc.addPage();
          y = 50;
          tableHead();
          doc.fontSize(7.5).font('Helvetica');
        }
        const cells = [
          String(c.expense_date || '').slice(0, 10),
          c.expense_code,
          c.title,
          c.category_name,
          `${money(c.amount)} ${c.currency || ''}`,
          label(c.approval_status),
          label(c.reimbursement_status),
        ];
        doc.fillColor('#334155');
        columns.forEach((col, i) => doc.text(String(cells[i] ?? '—'), col.x, y, { width: col.width, ellipsis: true }));
        y += 16;
      }

      if (!claims.length) {
        doc.fillColor('#94a3b8').fontSize(9).text('No expense claims found for this period.', left, y);
        y += 20;
      }

      y += 18;
      if (y > 640) {
        doc.addPage();
        y = 50;
      }
      doc.fillColor('#0f172a').fontSize(11).font('Helvetica-Bold').text('Reimbursement history', left, y);
      y += 20;
      doc.fillColor('#64748b').fontSize(7.5).font('Helvetica-Bold');
      doc.text('DATE', left, y);
      doc.text('CLAIM', left + 70, y);
      doc.text('METHOD', left + 190, y);
      doc.text('REFERENCE', left + 280, y);
      doc.text('AMOUNT', left + 390, y);
      doc.text('STATUS', left + 455, y);
      y += 14;
      doc.moveTo(left, y).lineTo(left + pageWidth, y).strokeColor('#e2e8f0').stroke();
      y += 6;
      doc.font('Helvetica').fontSize(7.5).fillColor('#334155');
      for (const r of reimbursements) {
        if (y > 770) {
          doc.addPage();
          y = 50;
        }
        doc.text(String(r.payment_date || '').slice(0, 10) || '—', left, y, { width: 66 });
        doc.text(r.expense_code, left + 70, y, { width: 115 });
        doc.text(label(r.payment_method), left + 190, y, { width: 85 });
        doc.text(r.transaction_reference || '—', left + 280, y, { width: 105, ellipsis: true });
        doc.text(money(r.amount), left + 390, y, { width: 60 });
        doc.text(label(r.payment_status), left + 455, y, { width: 60 });
        y += 16;
      }
      if (!reimbursements.length) {
        doc.fillColor('#94a3b8').fontSize(9).text('No reimbursement records.', left, y);
        y += 20;
      }

      const footerY = 800;
      doc.moveTo(left, footerY).lineTo(left + pageWidth, footerY).strokeColor('#e2e8f0').stroke();
      doc.fillColor('#94a3b8').fontSize(7.5).font('Helvetica');
      const footer = String(statementFooter || '').trim();
      doc.text(`${footer ? `${footer} · ` : ''}This statement is system generated.`, left, footerY + 8, {
        width: pageWidth,
        height: 10,
        align: 'center',
        ellipsis: true,
      });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
