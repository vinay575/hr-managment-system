import PDFDocument from 'pdfkit';

/**
 * Generates an Offer Letter PDF stream/buffer.
 */
export function generateOfferLetterPdf(offer) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const buffers = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfData = Buffer.concat(buffers);
        resolve(pdfData);
      });

      // Header Brand
      doc.fillColor('#0f172a').fontSize(22).font('Helvetica-Bold').text('Aurora Labs', 50, 50);
      doc.fillColor('#64748b').fontSize(10).font('Helvetica').text('People, beautifully managed', 50, 75);

      // Offer metadata right aligned
      doc.fillColor('#334155').fontSize(10).font('Helvetica-Bold').text('OFFER LETTER', 350, 50, { align: 'right' });
      doc.fillColor('#64748b').font('Helvetica').text(`Ref: ${offer.offer_number || 'OFF-DRAFT'}`, 350, 65, { align: 'right' });
      doc.text(`Date: ${new Date(offer.created_at || Date.now()).toLocaleDateString()}`, 350, 80, { align: 'right' });

      // Line divider
      doc.moveTo(50, 105).lineTo(545, 105).strokeColor('#e2e8f0').lineWidth(1).stroke();

      // Recipient
      doc.moveDown(2);
      doc.fillColor('#0f172a').fontSize(11).font('Helvetica-Bold').text('Private & Confidential');
      doc.moveDown(0.3);
      doc.font('Helvetica-Bold').text(offer.candidate_name || offer.full_name || 'Candidate');
      if (offer.candidate_email) doc.font('Helvetica').text(offer.candidate_email);
      if (offer.candidate_phone) doc.font('Helvetica').text(offer.candidate_phone);
      if (offer.candidate_address) doc.font('Helvetica').text(offer.candidate_address);

      doc.moveDown(1.5);
      doc.font('Helvetica').text(`Dear ${offer.candidate_name || 'Candidate'},`);
      doc.moveDown(0.8);
      doc.text(
        `We are thrilled to extend an offer of employment to you for the position of ` +
        `${offer.job_title} at Aurora Labs${offer.department_name ? ` in the ${offer.department_name} team` : ''}. ` +
        `We were thoroughly impressed by your background, professional accomplishments, and the energy you shared during the interview process.`,
        { align: 'justify', lineGap: 3 }
      );

      doc.moveDown(1.2);
      doc.font('Helvetica-Bold').text('Summary of Employment Terms:');
      doc.moveDown(0.5);

      // Key Terms Box
      const startX = 50;
      const startY = doc.y;
      doc.rect(startX, startY, 495, 105).fillAndStroke('#f8fafc', '#e2e8f0');

      doc.fillColor('#0f172a').fontSize(10);
      const col1 = 65;
      const col2 = 310;
      let rowY = startY + 12;

      doc.font('Helvetica-Bold').text('Designation:', col1, rowY);
      doc.font('Helvetica').text(offer.job_title || 'N/A', col1 + 80, rowY);

      doc.font('Helvetica-Bold').text('Annual Salary:', col2, rowY);
      doc.font('Helvetica').text(offer.annual_salary ? `$${Number(offer.annual_salary).toLocaleString()}` : '$0', col2 + 90, rowY);

      rowY += 22;
      doc.font('Helvetica-Bold').text('Department:', col1, rowY);
      doc.font('Helvetica').text(offer.department_name || 'General', col1 + 80, rowY);

      doc.font('Helvetica-Bold').text('Employment:', col2, rowY);
      doc.font('Helvetica').text(offer.employment_type ? offer.employment_type.toUpperCase() : 'FULL-TIME', col2 + 90, rowY);

      rowY += 22;
      doc.font('Helvetica-Bold').text('Joining Date:', col1, rowY);
      doc.font('Helvetica').text(offer.joining_date ? String(offer.joining_date).slice(0, 10) : 'To be confirmed', col1 + 80, rowY);

      doc.font('Helvetica-Bold').text('Probation:', col2, rowY);
      doc.font('Helvetica').text(`${offer.probation_months ?? 3} Months`, col2 + 90, rowY);

      rowY += 22;
      doc.font('Helvetica-Bold').text('Work Location:', col1, rowY);
      doc.font('Helvetica').text(offer.work_location || 'Headquarters / Hybrid', col1 + 80, rowY);

      doc.font('Helvetica-Bold').text('Validity Until:', col2, rowY);
      doc.font('Helvetica').text(offer.expiry_date ? String(offer.expiry_date).slice(0, 10) : '14 Days from issue', col2 + 90, rowY);

      doc.y = startY + 120;

      // Salary Structure
      if (offer.salary_structure) {
        doc.moveDown(0.8);
        doc.font('Helvetica-Bold').text('Compensation & Benefits Structure:');
        doc.moveDown(0.3);
        doc.font('Helvetica').text(offer.salary_structure, { lineGap: 2 });
      }

      // Terms & Conditions
      if (offer.terms) {
        doc.moveDown(0.8);
        doc.font('Helvetica-Bold').text('Terms and Conditions:');
        doc.moveDown(0.3);
        doc.font('Helvetica').text(offer.terms, { lineGap: 2 });
      }

      // Signatures
      doc.moveDown(1.5);
      if (doc.y > 680) doc.addPage();

      doc.font('Helvetica').text('Sincerely,');
      doc.moveDown(1.8);
      doc.font('Helvetica-Bold').text('Aurora Labs People Operations Team');
      doc.font('Helvetica').text('HR & Talent Acquisition Group');

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Generates an Exit Document PDF (Experience letter, Relieving letter, etc.)
 */
export function generateExitDocPdf(record) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const buffers = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));

      doc.fillColor('#0f172a').fontSize(22).font('Helvetica-Bold').text('Aurora Labs', 50, 50);
      doc.fillColor('#64748b').fontSize(10).font('Helvetica').text('People, beautifully managed', 50, 75);

      doc.fillColor('#334155').fontSize(11).font('Helvetica-Bold').text(String(record.title || record.doc_type).toUpperCase(), 300, 50, { align: 'right' });
      doc.fillColor('#64748b').font('Helvetica').text(`Doc No: ${record.document_number}`, 300, 65, { align: 'right' });
      doc.text(`Date: ${new Date().toLocaleDateString()}`, 300, 80, { align: 'right' });

      doc.moveTo(50, 105).lineTo(545, 105).strokeColor('#e2e8f0').lineWidth(1).stroke();

      doc.moveDown(2.5);
      doc.fillColor('#0f172a').fontSize(12).font('Helvetica-Bold').text('TO WHOMSOEVER IT MAY CONCERN', { align: 'center' });
      doc.moveDown(1.5);

      const empName = `${record.first_name || ''} ${record.last_name || ''}`.trim() || record.employee_name || 'The Employee';
      const designation = record.designation || 'Staff Member';
      const dept = record.department_name ? ` in the ${record.department_name} department` : '';
      const joinDate = record.join_date ? new Date(record.join_date).toLocaleDateString() : 'N/A';
      const exitDate = record.approved_last_working_day || record.exit_date ? new Date(record.approved_last_working_day || record.exit_date).toLocaleDateString() : 'N/A';

      if (record.doc_type === 'relieving_letter') {
        doc.fontSize(11).font('Helvetica').text(
          `This is to certify that ${empName} (Employee Code: ${record.employee_code || 'N/A'}) was employed with Aurora Labs as ${designation}${dept} from ${joinDate} to ${exitDate}.`,
          { align: 'justify', lineGap: 4 }
        );
        doc.moveDown(1);
        doc.text(
          `We confirm that ${empName} has been formally relieved of their duties and responsibilities effective the close of business hours on ${exitDate}. All company assets and obligations have been cleared in accordance with company policy.`,
          { align: 'justify', lineGap: 4 }
        );
      } else if (record.doc_type === 'experience_letter') {
        doc.fontSize(11).font('Helvetica').text(
          `This letter serves to certify the employment history and performance of ${empName} (Employee Code: ${record.employee_code || 'N/A'}). ` +
          `${empName} was an integral member of our team serving as ${designation}${dept} from ${joinDate} through ${exitDate}.`,
          { align: 'justify', lineGap: 4 }
        );
        doc.moveDown(1);
        doc.text(
          `During their tenure with us, ${empName} exhibited high standards of professional diligence, integrity, and dedication. We appreciate their contributions and wish them the best in their future endeavors.`,
          { align: 'justify', lineGap: 4 }
        );
      } else {
        doc.fontSize(11).font('Helvetica').text(
          record.content_html || `This document confirms the exit formalities and settlement for ${empName} with Aurora Labs on ${exitDate}.`,
          { align: 'justify', lineGap: 4 }
        );
      }

      doc.moveDown(2.5);
      doc.font('Helvetica-Bold').text('For Aurora Labs,');
      doc.moveDown(2);
      doc.font('Helvetica-Bold').text('Authorized Signatory');
      doc.font('Helvetica').text('Human Resources & People Operations');

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

