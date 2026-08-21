'use strict';

const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const formatMoney = (v) => `INR ${(parseFloat(v) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
const formatAmt = (v) => (parseFloat(v) || 0).toFixed(2);

/**
 * Generates a payslip PDF buffer laid out to match the company's official
 * "ERGO ASIA INC. — SALARY SLIP" template: employee/bank/PAN identity,
 * date of joining, days-attended and CL+EL leave-ledger summary, a full
 * Income/Deductions component breakdown, and the net salary line.
 * @param {object} data
 * @param {object} [options]
 * @param {boolean} [options.provisional] - Stamp as a live, unfinalized calculation.
 */
function generatePayslipPDF(data, options = {}) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 40 });
      const buffers = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfData = Buffer.concat(buffers);
        resolve(pdfData);
      });

      const { employee, year, month, summary, components = {}, leave = {} } = data;
      const monthName = MONTH_NAMES[month - 1] || `Month ${month}`;

      let y = 40;

      // ─── Header Banner ──────────────────────────────────────────────────
      const bannerHeight = 55;
      doc.rect(40, y, 515, bannerHeight).fill('#0e7490');
      doc.fontSize(18).font('Helvetica-Bold').fillColor('#ffffff')
        .text('ERGO ASIA INC.', 40, y + 12, { align: 'center', width: 515 });
      doc.fontSize(11).font('Helvetica-Bold').fillColor('#e0f2fe')
        .text('SALARY SLIP', 40, y + 34, { align: 'center', width: 515 });
      y += bannerHeight + 8;

      if (options.provisional) {
        doc.rect(40, y, 515, 16).fill('#fef3c7');
        doc.fontSize(8).font('Helvetica-Bold').fillColor('#92400e')
          .text('PROVISIONAL — LIVE CALCULATION, SUBJECT TO CHANGE UNTIL FINALIZED BY ADMIN', 40, y + 4, {
            align: 'center',
            width: 515,
          });
        y += 16 + 8;
      }

      // ─── Month ──────────────────────────────────────────────────────────
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#1e293b')
        .text(`MONTH: ${monthName.toUpperCase()} ${year}`, 40, y);
      y += 18;

      // ─── Employee & Payroll Info Grid ───────────────────────────────────
      const totalDays = summary.working_days + summary.holiday_count + summary.weekend_count;
      const attendedDays = summary.present_days + summary.travel_days + summary.wfh_days + summary.half_days;
      const leavesThisMonth = summary.paid_leave_days + summary.unpaid_leave_days;

      const leftRows = [
        ['Employee Name', employee.name],
        ['Employee Code', employee.employee_id],
        ['Designation', employee.designation || 'Staff'],
        ['PAN Number', employee.pan || '—'],
        ['Bank Account Number', employee.bank_account_no || '—'],
        ['Bank Name', employee.bank_name || '—'],
      ];
      const rightRows = [
        ['Date of Joining', employee.date_of_joining ? new Date(employee.date_of_joining).toLocaleDateString('en-IN') : '—'],
        ['Total No. of Days', String(totalDays)],
        ['No. of Days Attended', String(attendedDays)],
        ['Leaves', String(leavesThisMonth)],
        ['Previous CL + EL', String(leave.previous ?? 0)],
        ['Leave Earned This Month', String(leave.earned_this_month ?? 0)],
        ['Leave Taken This Month', String(leave.taken_this_month ?? 0)],
        ['Net Balance', String(leave.net_balance ?? 0)],
      ];

      const infoRowH = 16;
      const infoBoxH = Math.max(leftRows.length, rightRows.length) * infoRowH + 10;
      doc.rect(40, y, 515, infoBoxH).fillAndStroke('#f8fafc', '#cbd5e1');

      let ly = y + 8;
      leftRows.forEach(([label, value]) => {
        doc.font('Helvetica').fontSize(8.5).fillColor('#64748b').text(label, 50, ly);
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#0f172a').text(String(value), 175, ly, { width: 105 });
        ly += infoRowH;
      });

      let ry = y + 8;
      rightRows.forEach(([label, value]) => {
        doc.font('Helvetica').fontSize(8.5).fillColor('#64748b').text(label, 300, ry, { width: 145 });
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#0f172a').text(value, 455, ry, { width: 90, align: 'right' });
        ry += infoRowH;
      });

      y += infoBoxH + 12;

      // ─── Income / Deductions Table ──────────────────────────────────────
      doc.fontSize(11).font('Helvetica-Bold').fillColor('#1e293b').text('Earnings & Deductions', 40, y);
      y += 18;

      const tableTop = y;
      doc.rect(40, tableTop, 515, 20).fill('#e0e7ff');
      doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#312e81');
      doc.text('INCOME PARTICULARS', 50, tableTop + 5, { width: 150 });
      doc.text('AMOUNT (INR)', 200, tableTop + 5, { width: 85, align: 'right' });
      doc.text('DEDUCTIONS PARTICULARS', 300, tableTop + 5, { width: 150 });
      doc.text('AMOUNT (INR)', 460, tableTop + 5, { width: 85, align: 'right' });

      const incomeRows = [
        ['Basic Pay', components.basic],
        ['House Rent Allowance', components.hra],
        ['Education Allowance', components.education_allowance],
        ['Conveyance Allowance', components.conveyance],
        ['Professional Development Allowance', components.professional_development],
        ['Other Allowance', components.other_allowance],
        ['Leave Travel Allowance (LTA)', components.lta],
        ['PF (Employer Contribution)', components.employer_pf],
        ['Bonus', components.bonus],
      ];
      const deductionRows = [
        ['PF', components.pf_deduction],
        ['Professional Tax', components.professional_tax],
        ['TDS', components.tds],
      ];
      const totalIncome = incomeRows.reduce((s, [, v]) => s + (parseFloat(v) || 0), 0);
      const totalDeductions = deductionRows.reduce((s, [, v]) => s + (parseFloat(v) || 0), 0);

      let cy = tableTop + 20;
      incomeRows.forEach((row, idx) => {
        if (idx % 2 === 1) doc.rect(40, cy, 515, 16).fill('#f8fafc');
        doc.font('Helvetica').fontSize(8.5).fillColor('#334155');
        doc.text(row[0], 50, cy + 3, { width: 150 });
        doc.text(formatAmt(row[1]), 200, cy + 3, { width: 85, align: 'right' });
        const ded = deductionRows[idx];
        if (ded) {
          doc.text(ded[0], 300, cy + 3, { width: 150 });
          doc.text(formatAmt(ded[1]), 460, cy + 3, { width: 85, align: 'right' });
        }
        cy += 16;
      });

      doc.moveTo(40, cy).lineTo(555, cy).strokeColor('#cbd5e1').lineWidth(0.5).stroke();
      doc.rect(40, cy, 515, 18).fill('#eef2ff');
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#1e1b4b');
      doc.text('Total', 50, cy + 4, { width: 150 });
      doc.text(formatAmt(totalIncome), 200, cy + 4, { width: 85, align: 'right' });
      doc.text('Total', 300, cy + 4, { width: 150 });
      doc.text(formatAmt(totalDeductions), 460, cy + 4, { width: 85, align: 'right' });
      y = cy + 18 + 12;

      // ─── Net Salary Highlight Box ───────────────────────────────────────
      doc.rect(40, y, 515, 40).fillAndStroke('#f1f5f9', '#94a3b8');
      doc.fontSize(11).font('Helvetica-Bold').fillColor('#0f172a').text('NET SALARY:', 55, y + 13);
      doc.fontSize(14).font('Helvetica-Bold').fillColor('#166534')
        .text(formatMoney(summary.net_salary), 300, y + 11, { align: 'right', width: 240 });
      y += 40 + 20;

      // ─── Footer ─────────────────────────────────────────────────────────
      doc
        .fontSize(8)
        .font('Helvetica-Oblique')
        .fillColor('#94a3b8')
        .text('This is a system-generated salary slip and does not require a signature. Generated by Ergo Management System.', 40, y, {
          align: 'center',
          width: 515,
        });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Generates an Excel (.xlsx) workbook buffer for monthly consolidated salary reports.
 */
async function generateConsolidatedExcel(reportData, year, month) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Ergo Management System';
  workbook.created = new Date();

  const monthName = MONTH_NAMES[month - 1] || `Month_${month}`;
  const sheet = workbook.addWorksheet(`Salary_${monthName}_${year}`);

  // Header Title Row
  sheet.mergeCells('A1:P1');
  const titleRow = sheet.getCell('A1');
  titleRow.value = `Ergo Management System — Consolidated Salary Report (${monthName} ${year})`;
  titleRow.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  titleRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF312E81' } };
  titleRow.alignment = { vertical: 'middle', horizontal: 'center' };
  sheet.getRow(1).height = 30;

  // Table Column Headers
  const headers = [
    'Employee ID',
    'Employee Name',
    'Designation',
    'Email',
    'Monthly Salary (₹)',
    'Per-Day Rate (₹)',
    'Working Days',
    'Present Days',
    'Half-Days',
    'Travel Days',
    'WFH Days',
    'Paid Leave Days',
    'Unpaid Leave Days',
    'Absent Days',
    'Holidays & Weekends (Paid)',
    'Net Payable Salary (₹)',
  ];

  const headerRow = sheet.addRow(headers);
  headerRow.height = 24;
  headerRow.eachCell((cell) => {
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4338CA' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    };
  });

  let grandTotal = 0;

  // Data Rows
  reportData.forEach((item) => {
    const net = parseFloat(item.summary.net_salary) || 0;
    grandTotal += net;

    const row = sheet.addRow([
      item.employee.employee_id,
      item.employee.name,
      item.employee.designation || '—',
      item.employee.email,
      parseFloat(item.summary.monthly_salary),
      parseFloat(item.summary.per_day_salary),
      item.summary.working_days,
      item.summary.present_days,
      item.summary.half_days,
      item.summary.travel_days,
      item.summary.wfh_days,
      item.summary.paid_leave_days,
      item.summary.unpaid_leave_days,
      item.summary.absent_days,
      item.summary.holiday_count + item.summary.weekend_count,
      net,
    ]);

    row.height = 20;
    row.eachCell((cell, colNumber) => {
      cell.font = { name: 'Arial', size: 9.5 };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      };
      if (colNumber === 5 || colNumber === 6 || colNumber === 16) {
        cell.numFmt = '₹#,##0.00';
        cell.alignment = { horizontal: 'right' };
      } else if (colNumber >= 7 && colNumber <= 15) {
        cell.alignment = { horizontal: 'center' };
      }
    });
  });

  // Total Summary Row
  const totalRow = sheet.addRow([
    'TOTAL',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    grandTotal,
  ]);
  totalRow.height = 24;
  sheet.mergeCells(`A${totalRow.number}:O${totalRow.number}`);
  const totalLabelCell = sheet.getCell(`A${totalRow.number}`);
  totalLabelCell.value = 'GRAND TOTAL PAYROLL (INR)';
  totalLabelCell.font = { name: 'Arial', size: 10, bold: true };
  totalLabelCell.alignment = { horizontal: 'right', vertical: 'middle' };

  const totalValueCell = sheet.getCell(`P${totalRow.number}`);
  totalValueCell.numFmt = '₹#,##0.00';
  totalValueCell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF166534' } };
  totalValueCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0FDF4' } };

  // Set column widths
  sheet.columns = [
    { width: 14 },
    { width: 22 },
    { width: 20 },
    { width: 24 },
    { width: 18 },
    { width: 16 },
    { width: 14 },
    { width: 14 },
    { width: 12 },
    { width: 14 },
    { width: 14 },
    { width: 16 },
    { width: 18 },
    { width: 14 },
    { width: 22 },
    { width: 22 },
  ];

  return await workbook.xlsx.writeBuffer();
}

module.exports = {
  generatePayslipPDF,
  generateConsolidatedExcel,
};
