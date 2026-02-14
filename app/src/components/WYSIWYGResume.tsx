import type { FinalResume } from '@/types/resume';

interface WYSIWYGResumeProps {
  resume: FinalResume;
}

export function WYSIWYGResume({ resume }: WYSIWYGResumeProps) {
  const experienceIsArray = Array.isArray(resume.experience);
  const educationIsArray = Array.isArray(resume.education);
  const certificationsIsArray = Array.isArray(resume.certifications);
  const skillsIsObject = resume.skills && typeof resume.skills === 'object' && !Array.isArray(resume.skills);

  return (
    <div
      id="resume-print-target"
      className="mx-auto my-6 max-w-[8.5in] rounded-lg bg-white px-10 py-8 shadow-2xl shadow-black/40 text-gray-900"
      style={{ fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' }}
    >
      {/* Summary */}
      {resume.summary && (
        <section className="mb-5">
          <h2 className="mb-2 border-b border-gray-300 pb-1 text-sm font-bold uppercase tracking-wider text-gray-700">
            Professional Summary
          </h2>
          <p className="text-sm leading-relaxed text-gray-800 whitespace-pre-wrap">{resume.summary}</p>
        </section>
      )}

      {/* Selected Accomplishments */}
      {resume.selected_accomplishments && (
        <section className="mb-5">
          <h2 className="mb-2 border-b border-gray-300 pb-1 text-sm font-bold uppercase tracking-wider text-gray-700">
            Selected Accomplishments
          </h2>
          <div className="text-sm leading-relaxed text-gray-800 whitespace-pre-wrap">{resume.selected_accomplishments}</div>
        </section>
      )}

      {/* Skills */}
      {skillsIsObject && Object.keys(resume.skills).length > 0 && (
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
      )}
      {!skillsIsObject && resume.skills && (
        <section className="mb-5">
          <h2 className="mb-2 border-b border-gray-300 pb-1 text-sm font-bold uppercase tracking-wider text-gray-700">
            Core Competencies
          </h2>
          <p className="text-sm leading-relaxed text-gray-800 whitespace-pre-wrap">{String(resume.skills)}</p>
        </section>
      )}

      {/* Experience */}
      {experienceIsArray && resume.experience.length > 0 && (
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
                      <li key={j} className="text-sm text-gray-800 list-disc">{b.text}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
      {!experienceIsArray && resume.experience && (
        <section className="mb-5">
          <h2 className="mb-2 border-b border-gray-300 pb-1 text-sm font-bold uppercase tracking-wider text-gray-700">
            Professional Experience
          </h2>
          <p className="text-sm leading-relaxed text-gray-800 whitespace-pre-wrap">{String(resume.experience)}</p>
        </section>
      )}

      {/* Education */}
      {educationIsArray && resume.education.length > 0 && (
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
      )}
      {!educationIsArray && resume.education && (
        <section className="mb-5">
          <h2 className="mb-2 border-b border-gray-300 pb-1 text-sm font-bold uppercase tracking-wider text-gray-700">
            Education
          </h2>
          <p className="text-sm leading-relaxed text-gray-800 whitespace-pre-wrap">{String(resume.education)}</p>
        </section>
      )}

      {/* Certifications */}
      {certificationsIsArray && resume.certifications.length > 0 && (
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
      )}
      {!certificationsIsArray && resume.certifications && (
        <section>
          <h2 className="mb-2 border-b border-gray-300 pb-1 text-sm font-bold uppercase tracking-wider text-gray-700">
            Certifications
          </h2>
          <p className="text-sm leading-relaxed text-gray-800 whitespace-pre-wrap">{String(resume.certifications)}</p>
        </section>
      )}
    </div>
  );
}
