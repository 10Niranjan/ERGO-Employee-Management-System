'use strict';

const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

/**
 * Generates a professional payslip PDF buffer.
 */
function generatePayslipPDF(data) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 40 });
      const buffers = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfData = Buffer.concat(buffers);
        resolve(pdfData);
      });

      const { employee, year, month, summary, days } = data;
      const monthName = MONTH_NAMES[month - 1] || `Month ${month}`;

      // Header Banner
      doc
        .fontSize(20)
        .font('Helvetica-Bold')
        .fillColor('#1e293b')
        .text('ERGO MANAGEMENT SYSTEMS', 40, 40);

      doc
        .fontSize(10)
        .font('Helvetica')
        .fillColor('#64748b')
        .text('EMPLOYEE SALARY STATEMENT / PAYSLIP', 40, 65);

      doc
        .fontSize(10)
        .font('Helvetica-Bold')
        .fillColor('#4338ca')
        .text(`PAY PERIOD: ${monthName.toUpperCase()} ${year}`, 350, 45, { align: 'right' });

      doc.moveTo(40, 85).lineTo(555, 85).strokeColor('#e2e8f0').lineWidth(1).stroke();

      // Employee Information Box
      doc.rect(40, 95, 515, 65).fillAndStroke('#f8fafc', '#cbd5e1');

      doc.font('Helvetica').fontSize(9).fillColor('#64748b');
      doc.text('Employee Name:', 55, 105);
      doc.text('Employee ID:', 55, 122);
      doc.text('Designation:', 55, 139);

      doc.font('Helvetica-Bold').fontSize(9).fillColor('#0f172a');
      doc.text(employee.name, 145, 105);
      doc.text(employee.employee_id, 145, 122);
      doc.text(employee.designation || 'Staff', 145, 139);

      doc.font('Helvetica').fontSize(9).fillColor('#64748b');
      doc.text('Base Per-Day Rate:', 320, 105);
      doc.text('Working Days in Month:', 320, 122);
      doc.text('Payment Currency:', 320, 139);

      doc.font('Helvetica-Bold').fontSize(9).fillColor('#0f172a');
      doc.text(`INR ${parseFloat(summary.per_day_salary).toFixed(2)} / day`, 440, 105);
      doc.text(`${summary.working_days} days`, 440, 122);
      doc.text('INR (₹)', 440, 139);

      // Attendance & Leave Summary Section
      doc.fontSize(11).font('Helvetica-Bold').fillColor('#1e293b').text('Attendance & Leave Units Summary', 40, 175);

      const tableTop = 195;
      doc.rect(40, tableTop, 515, 20).fill('#e0e7ff');
      doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#312e81');
      doc.text('CATEGORY', 50, tableTop + 5);
      doc.text('DAYS', 180, tableTop + 5, { width: 60, align: 'center' });
      doc.text('RATE FACTOR', 280, tableTop + 5, { width: 90, align: 'center' });
      doc.text('PAYABLE UNITS', 420, tableTop + 5, { width: 100, align: 'right' });

      const rows = [
        ['Present (Full Day)', summary.present_days, '100%', `${summary.present_days} days`],
        ['On Duty / Travel', summary.travel_days, '100%', `${summary.travel_days} days`],
        ['Half-Day', summary.half_days, '50%', `${summary.half_days * 0.5} days`],
        ['Paid Leaves (Casual/Sick/Earned)', summary.paid_leave_days, '100%', `${summary.paid_leave_days} days`],
        ['Unpaid Leaves', summary.unpaid_leave_days, '0%', '0.0 days'],
        ['Absent / Unmarked', summary.absent_days, '0%', '0.0 days'],
        ['Holidays & Weekends (Exempt)', summary.holiday_count + summary.weekend_count, 'Non-Working', 'Excluded'],
      ];

      let currentY = tableTop + 20;
      doc.font('Helvetica').fontSize(8.5).fillColor('#334155');

      rows.forEach((r, idx) => {
        if (idx % 2 === 1) {
          doc.rect(40, currentY, 515, 18).fill('#f8fafc');
        }
        doc.fillColor('#334155');
        doc.text(String(r[0]), 50, currentY + 4);
        doc.text(String(r[1]), 180, currentY + 4, { width: 60, align: 'center' });
        doc.text(String(r[2]), 280, currentY + 4, { width: 90, align: 'center' });
        doc.text(String(r[3]), 420, currentY + 4, { width: 100, align: 'right' });
        currentY += 18;
      });

      doc.moveTo(40, currentY).lineTo(555, currentY).strokeColor('#cbd5e1').lineWidth(0.5).stroke();

      // Net Salary Highlight Box
      currentY += 15;
      doc.rect(40, currentY, 515, 45).fillAndStroke('#f1f5f9', '#94a3b8');

      doc.fontSize(11).font('Helvetica-Bold').fillColor('#0f172a').text('NET PAYABLE SALARY:', 55, currentY + 16);
      doc
        .fontSize(15)
        .font('Helvetica-Bold')
        .fillColor('#166534')
        .text(`INR ${parseFloat(summary.net_salary).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, 300, currentY + 14, {
          align: 'right',
          width: 240,
        });

      // Footer
      doc
        .fontSize(8)
        .font('Helvetica-Oblique')
        .fillColor('#94a3b8')
        .text('This is a system-generated salary slip and does not require a signature. Generated by Ergo Management System.', 40, 750, {
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
  sheet.mergeCells('A1:N1');
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
    'Base Rate (₹)',
    'Working Days',
    'Present Days',
    'Half-Days',
    'Travel Days',
    'Paid Leave Days',
    'Unpaid Leave Days',
    'Absent Days',
    'Holidays & Weekends',
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
      parseFloat(item.summary.per_day_salary),
      item.summary.working_days,
      item.summary.present_days,
      item.summary.half_days,
      item.summary.travel_days,
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
      if (colNumber === 5 || colNumber === 14) {
        cell.numFmt = '₹#,##0.00';
        cell.alignment = { horizontal: 'right' };
      } else if (colNumber >= 6 && colNumber <= 13) {
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
    grandTotal,
  ]);
  totalRow.height = 24;
  sheet.mergeCells(`A${totalRow.number}:M${totalRow.number}`);
  const totalLabelCell = sheet.getCell(`A${totalRow.number}`);
  totalLabelCell.value = 'GRAND TOTAL PAYROLL (INR)';
  totalLabelCell.font = { name: 'Arial', size: 10, bold: true };
  totalLabelCell.alignment = { horizontal: 'right', vertical: 'middle' };

  const totalValueCell = sheet.getCell(`N${totalRow.number}`);
  totalValueCell.numFmt = '₹#,##0.00';
  totalValueCell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF166534' } };
  totalValueCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0FDF4' } };

  // Set column widths
  sheet.columns = [
    { width: 14 },
    { width: 22 },
    { width: 20 },
    { width: 24 },
    { width: 16 },
    { width: 14 },
    { width: 14 },
    { width: 12 },
    { width: 14 },
    { width: 16 },
    { width: 18 },
    { width: 14 },
    { width: 20 },
    { width: 22 },
  ];

  return await workbook.xlsx.writeBuffer();
}

module.exports = {
  generatePayslipPDF,
  generateConsolidatedExcel,
};
