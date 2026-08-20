import api from './axiosClient';

export const computeSalary = (params = {}) =>
  api.get('/reports/salary/compute', { params }).then((r) => r.data);

export const generatePayslip = (body) =>
  api.post('/reports/payslips/generate', body).then((r) => r.data);

export const listPayslips = (params = {}) =>
  api.get('/reports/payslips', { params }).then((r) => r.data);

export const getPayslipById = (id) =>
  api.get(`/reports/payslips/${id}`).then((r) => r.data);

export async function downloadPayslipPDF(id, filename = 'payslip.pdf') {
  const response = await api.get(`/reports/payslips/${id}/download`, {
    responseType: 'blob',
  });
  const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export async function downloadLiveSalaryPDF(params = {}, filename = 'payslip_provisional.pdf') {
  const response = await api.get('/reports/salary/compute/download', {
    params,
    responseType: 'blob',
  });
  const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export async function downloadConsolidatedExcel(params = {}, filename = 'payroll_report.xlsx') {
  const response = await api.get('/reports/consolidated/excel', {
    params,
    responseType: 'blob',
  });
  const url = window.URL.createObjectURL(
    new Blob([response.data], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
  );
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}
