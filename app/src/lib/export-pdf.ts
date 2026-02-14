export function exportPdf(userName?: string): void {
  const originalTitle = document.title;
  document.title = userName ? `Resume-${userName.replace(/\s+/g, '-')}` : 'Resume-Export';
  window.print();
  document.title = originalTitle;
}
