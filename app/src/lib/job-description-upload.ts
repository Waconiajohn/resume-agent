type JobUploadExt = 'txt' | 'docx' | 'pdf' | 'html' | 'htm' | 'doc';

const MAX_JOB_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

function getExtension(fileName: string): JobUploadExt | '' {
  const ext = fileName.toLowerCase().split('.').pop();
  if (ext === 'txt' || ext === 'docx' || ext === 'pdf' || ext === 'html' || ext === 'htm' || ext === 'doc') {
    return ext;
  }
  return '';
}

function normalizeText(text: string): string {
  return text
    .replace(/\u0000/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function extractFromTxt(file: File): Promise<string> {
  return normalizeText(await file.text());
}

async function extractFromDocx(file: File): Promise<string> {
  const { default: mammoth } = await import('mammoth');
  const buffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer: buffer });
  return normalizeText(result.value ?? '');
}

async function extractFromPdf(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const worker = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;

  const buffer = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buffer) });
  const pdf = await loadingTask.promise;
  const pages: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = (content.items as Array<{ str?: string }>)
      .map((item) => item.str ?? '')
      .join(' ');
    pages.push(text);
  }

  return normalizeText(pages.join('\n'));
}

async function extractFromHtml(file: File): Promise<string> {
  const html = await file.text();
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const text = doc.body?.innerText ?? doc.documentElement?.textContent ?? html;
    return normalizeText(text);
  } catch {
    return normalizeText(html.replace(/<[^>]+>/g, ' '));
  }
}

export async function extractJobDescriptionTextFromUpload(file: File): Promise<string> {
  if (file.size > MAX_JOB_UPLOAD_BYTES) {
    throw new Error('File too large. Please upload a job description under 10 MB.');
  }

  const ext = getExtension(file.name);
  if (ext === 'doc') {
    throw new Error('Legacy .doc files are not supported. Please upload .docx, .pdf, .txt, or .html.');
  }
  if (ext === 'txt') return extractFromTxt(file);
  if (ext === 'docx') return extractFromDocx(file);
  if (ext === 'pdf') return extractFromPdf(file);
  if (ext === 'html' || ext === 'htm') return extractFromHtml(file);

  throw new Error('Unsupported file type. Please upload .txt, .docx, .pdf, or .html.');
}
