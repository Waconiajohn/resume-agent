import type { ContactInfo } from '@/types/resume';

export function exportPdf(contactInfo?: ContactInfo, companyName?: string): void {
  const originalTitle = document.title;
  const parts: string[] = [];
  if (contactInfo?.name) {
    parts.push(contactInfo.name.replace(/\s+/g, '_'));
  }
  if (companyName) {
    parts.push(companyName.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_'));
  }
  parts.push('Resume');
  document.title = parts.join('_');
  window.print();
  document.title = originalTitle;
}
