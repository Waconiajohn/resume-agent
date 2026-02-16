import { Document, Packer, Paragraph, TextRun, HeadingLevel, BorderStyle, AlignmentType } from 'docx';
import { saveAs } from 'file-saver';
import type { FinalResume } from '@/types/resume';
import type { CoverLetterParagraph } from '@/types/panels';

function sectionHeading(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 240, after: 120 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' } },
    children: [
      new TextRun({ text: text.toUpperCase(), bold: true, size: 20, font: 'Calibri', color: '444444' }),
    ],
  });
}

function bulletParagraph(text: string): Paragraph {
  return new Paragraph({
    bullet: { level: 0 },
    spacing: { after: 60 },
    children: [new TextRun({ text, size: 20, font: 'Calibri' })],
  });
}

export async function exportDocx(resume: FinalResume): Promise<void> {
  const sections: Paragraph[] = [];

  // Summary
  if (resume.summary) {
    sections.push(sectionHeading('Professional Summary'));
    sections.push(
      new Paragraph({
        spacing: { after: 120 },
        children: [new TextRun({ text: resume.summary, size: 20, font: 'Calibri' })],
      }),
    );
  }

  // Selected Accomplishments
  if (resume.selected_accomplishments) {
    sections.push(sectionHeading('Selected Accomplishments'));
    const lines = resume.selected_accomplishments.split('\n').filter(l => l.trim());
    for (const line of lines) {
      const clean = line.replace(/^\s*[•\-\*]\s*/, '');
      sections.push(bulletParagraph(clean));
    }
  }

  // Skills
  if (resume.skills && typeof resume.skills === 'object' && !Array.isArray(resume.skills)) {
    sections.push(sectionHeading('Core Competencies'));
    for (const [category, items] of Object.entries(resume.skills)) {
      const itemText = Array.isArray(items) ? items.join(', ') : String(items);
      sections.push(
        new Paragraph({
          spacing: { after: 60 },
          children: [
            new TextRun({ text: `${category}: `, bold: true, size: 20, font: 'Calibri' }),
            new TextRun({ text: itemText, size: 20, font: 'Calibri' }),
          ],
        }),
      );
    }
  }

  // Experience
  if (Array.isArray(resume.experience) && resume.experience.length > 0) {
    sections.push(sectionHeading('Professional Experience'));
    for (const exp of resume.experience) {
      sections.push(
        new Paragraph({
          spacing: { before: 160, after: 40 },
          children: [
            new TextRun({ text: exp.title, bold: true, size: 20, font: 'Calibri' }),
          ],
        }),
      );
      sections.push(
        new Paragraph({
          spacing: { after: 40 },
          children: [
            new TextRun({
              text: `${exp.company}${exp.location ? ` | ${exp.location}` : ''} | ${exp.start_date} – ${exp.end_date}`,
              size: 18,
              font: 'Calibri',
              color: '666666',
            }),
          ],
        }),
      );
      for (const bullet of exp.bullets ?? []) {
        sections.push(bulletParagraph(bullet.text));
      }
    }
  }

  // Education
  if (Array.isArray(resume.education) && resume.education.length > 0) {
    sections.push(sectionHeading('Education'));
    for (const edu of resume.education) {
      sections.push(
        new Paragraph({
          spacing: { after: 60 },
          children: [
            new TextRun({
              text: `${edu.degree} in ${edu.field}, ${edu.institution}${edu.year ? ` (${edu.year})` : ''}`,
              size: 20,
              font: 'Calibri',
            }),
          ],
        }),
      );
    }
  }

  // Certifications
  if (Array.isArray(resume.certifications) && resume.certifications.length > 0) {
    sections.push(sectionHeading('Certifications'));
    for (const cert of resume.certifications) {
      sections.push(
        new Paragraph({
          spacing: { after: 60 },
          children: [
            new TextRun({
              text: `${cert.name} — ${cert.issuer}${cert.year ? ` (${cert.year})` : ''}`,
              size: 20,
              font: 'Calibri',
            }),
          ],
        }),
      );
    }
  }

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: { top: 720, right: 720, bottom: 720, left: 720 },
          },
        },
        children: sections,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, 'tailored-resume.docx');
}

export async function exportCoverLetterDocx(
  paragraphs: CoverLetterParagraph[],
  companyName?: string,
  roleTitle?: string,
): Promise<void> {
  const children: Paragraph[] = [];

  // Date
  children.push(
    new Paragraph({
      spacing: { after: 200 },
      children: [
        new TextRun({
          text: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
          size: 20,
          font: 'Calibri',
          color: '666666',
        }),
      ],
    }),
  );

  // Recipient
  if (companyName) {
    children.push(
      new Paragraph({
        spacing: { after: 40 },
        children: [new TextRun({ text: companyName, size: 20, font: 'Calibri' })],
      }),
    );
  }
  if (roleTitle) {
    children.push(
      new Paragraph({
        spacing: { after: 200 },
        children: [
          new TextRun({ text: `Re: ${roleTitle}`, size: 20, font: 'Calibri', italics: true }),
        ],
      }),
    );
  }

  // Body paragraphs
  for (const para of paragraphs) {
    children.push(
      new Paragraph({
        spacing: { after: 160 },
        alignment: AlignmentType.JUSTIFIED,
        children: [new TextRun({ text: para.content, size: 20, font: 'Calibri' })],
      }),
    );
  }

  const doc = new Document({
    sections: [
      {
        properties: {
          page: { margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 } },
        },
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, 'cover-letter.docx');
}
