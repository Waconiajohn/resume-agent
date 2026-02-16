import type { FinalResume } from '@/types/resume';

interface WYSIWYGResumeProps {
  resume: FinalResume;
}

const DEFAULT_SECTION_ORDER = ['summary', 'selected_accomplishments', 'skills', 'experience', 'education', 'certifications'];

/** Strip HTML tags to prevent XSS if content is ever rendered with innerHTML in future refactors. */
function stripHtml(text: string): string {
  return text.replace(/<[^>]*>/g, '');
}

function ContactHeader({ resume }: { resume: FinalResume }) {
  const ci = resume.contact_info;
  if (!ci?.name) return null;

  const contactParts: string[] = [];
  if (ci.email) contactParts.push(ci.email);
  if (ci.phone) contactParts.push(ci.phone);
  if (ci.linkedin) contactParts.push(ci.linkedin);
  if (ci.location) contactParts.push(ci.location);

  return (
    <div className="mb-4 text-center">
      <h1 className="text-xl font-bold text-gray-900">{ci.name}</h1>
      {contactParts.length > 0 && (
        <p className="mt-1 text-xs text-gray-500">{contactParts.join(' | ')}</p>
      )}
      <hr className="mt-2 border-gray-400" />
    </div>
  );
}

function SummarySection({ resume }: { resume: FinalResume }) {
  if (!resume.summary) return null;
  return (
    <section className="mb-5">
      <h2 className="mb-2 border-b border-gray-300 pb-1 text-sm font-bold uppercase tracking-wider text-gray-700">
        Professional Summary
      </h2>
      <p className="text-sm leading-relaxed text-gray-800 whitespace-pre-wrap">{stripHtml(resume.summary)}</p>
    </section>
  );
}

function AccomplishmentsSection({ resume }: { resume: FinalResume }) {
  if (!resume.selected_accomplishments) return null;
  return (
    <section className="mb-5">
      <h2 className="mb-2 border-b border-gray-300 pb-1 text-sm font-bold uppercase tracking-wider text-gray-700">
        Selected Accomplishments
      </h2>
      <div className="text-sm leading-relaxed text-gray-800 whitespace-pre-wrap">{stripHtml(resume.selected_accomplishments)}</div>
    </section>
  );
}

function SkillsSection({ resume }: { resume: FinalResume }) {
  const skillsIsObject = resume.skills && typeof resume.skills === 'object' && !Array.isArray(resume.skills);

  if (skillsIsObject && Object.keys(resume.skills).length > 0) {
    return (
      <section className="mb-5">
        <h2 className="mb-2 border-b border-gray-300 pb-1 text-sm font-bold uppercase tracking-wider text-gray-700">
          Core Competencies
        </h2>
        <div className="space-y-1">
          {Object.entries(resume.skills).map(([category, items]) => (
            <div key={category} className="text-sm">
              <span className="font-semibold text-gray-700">{category}: </span>
              <span className="text-gray-800">
                {Array.isArray(items) ? items.join(', ') : String(items)}
              </span>
            </div>
          ))}
        </div>
      </section>
    );
  }
  if (!skillsIsObject && resume.skills) {
    return (
      <section className="mb-5">
        <h2 className="mb-2 border-b border-gray-300 pb-1 text-sm font-bold uppercase tracking-wider text-gray-700">
          Core Competencies
        </h2>
        <p className="text-sm leading-relaxed text-gray-800 whitespace-pre-wrap">{String(resume.skills)}</p>
      </section>
    );
  }
  return null;
}

function ExperienceSection({ resume }: { resume: FinalResume }) {
  const experienceIsArray = Array.isArray(resume.experience);

  if (experienceIsArray && resume.experience.length > 0) {
    return (
      <section className="mb-5">
        <h2 className="mb-2 border-b border-gray-300 pb-1 text-sm font-bold uppercase tracking-wider text-gray-700">
          Professional Experience
        </h2>
        <div className="space-y-4">
          {resume.experience.map((exp, i) => (
            <div key={i}>
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-bold text-gray-900">{exp.title}</span>
                <span className="text-xs text-gray-500">{exp.start_date} – {exp.end_date}</span>
              </div>
              <div className="text-sm text-gray-600">{exp.company}{exp.location ? ` | ${exp.location}` : ''}</div>
              {exp.bullets?.length > 0 && (
                <ul className="mt-1.5 space-y-0.5 pl-4">
                  {exp.bullets.map((b, j) => (
                    <li key={j} className="text-sm text-gray-800 list-disc">{stripHtml(b.text)}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </section>
    );
  }
  if (!experienceIsArray && resume.experience) {
    return (
      <section className="mb-5">
        <h2 className="mb-2 border-b border-gray-300 pb-1 text-sm font-bold uppercase tracking-wider text-gray-700">
          Professional Experience
        </h2>
        <p className="text-sm leading-relaxed text-gray-800 whitespace-pre-wrap">{String(resume.experience)}</p>
      </section>
    );
  }
  return null;
}

function EducationSection({ resume }: { resume: FinalResume }) {
  const educationIsArray = Array.isArray(resume.education);

  if (educationIsArray && resume.education.length > 0) {
    return (
      <section className="mb-5">
        <h2 className="mb-2 border-b border-gray-300 pb-1 text-sm font-bold uppercase tracking-wider text-gray-700">
          Education
        </h2>
        {resume.education.map((edu, i) => (
          <div key={i} className="text-sm text-gray-800">
            <span className="font-semibold">{edu.degree}</span> in {edu.field}, {edu.institution}
            {edu.year ? ` (${edu.year})` : ''}
          </div>
        ))}
      </section>
    );
  }
  if (!educationIsArray && resume.education) {
    return (
      <section className="mb-5">
        <h2 className="mb-2 border-b border-gray-300 pb-1 text-sm font-bold uppercase tracking-wider text-gray-700">
          Education
        </h2>
        <p className="text-sm leading-relaxed text-gray-800 whitespace-pre-wrap">{String(resume.education)}</p>
      </section>
    );
  }
  return null;
}

function CertificationsSection({ resume }: { resume: FinalResume }) {
  const certificationsIsArray = Array.isArray(resume.certifications);

  if (certificationsIsArray && resume.certifications.length > 0) {
    return (
      <section>
        <h2 className="mb-2 border-b border-gray-300 pb-1 text-sm font-bold uppercase tracking-wider text-gray-700">
          Certifications
        </h2>
        {resume.certifications.map((cert, i) => (
          <div key={i} className="text-sm text-gray-800">
            <span className="font-semibold">{cert.name}</span> — {cert.issuer}
            {cert.year ? ` (${cert.year})` : ''}
          </div>
        ))}
      </section>
    );
  }
  if (!certificationsIsArray && resume.certifications) {
    return (
      <section>
        <h2 className="mb-2 border-b border-gray-300 pb-1 text-sm font-bold uppercase tracking-wider text-gray-700">
          Certifications
        </h2>
        <p className="text-sm leading-relaxed text-gray-800 whitespace-pre-wrap">{String(resume.certifications)}</p>
      </section>
    );
  }
  return null;
}

const sectionComponents: Record<string, React.ComponentType<{ resume: FinalResume }>> = {
  summary: SummarySection,
  selected_accomplishments: AccomplishmentsSection,
  skills: SkillsSection,
  experience: ExperienceSection,
  education: EducationSection,
  certifications: CertificationsSection,
};

export function WYSIWYGResume({ resume }: WYSIWYGResumeProps) {
  const order = resume.section_order ?? DEFAULT_SECTION_ORDER;
  const rendered = new Set<string>();

  const orderedSections: React.ReactNode[] = [];

  for (const sectionName of order) {
    const Component = sectionComponents[sectionName];
    if (Component) {
      orderedSections.push(<Component key={sectionName} resume={resume} />);
      rendered.add(sectionName);
    }
  }

  // Render any remaining sections not in the order list
  for (const sectionName of DEFAULT_SECTION_ORDER) {
    if (!rendered.has(sectionName)) {
      const Component = sectionComponents[sectionName];
      if (Component) {
        orderedSections.push(<Component key={sectionName} resume={resume} />);
      }
    }
  }

  return (
    <div
      id="resume-print-target"
      className="mx-auto my-6 max-w-[8.5in] rounded-lg bg-white px-10 py-8 shadow-2xl shadow-black/40 text-gray-900"
      style={{ fontFamily: 'Calibri, "Segoe UI", system-ui, sans-serif' }}
    >
      <ContactHeader resume={resume} />
      {orderedSections}
    </div>
  );
}
