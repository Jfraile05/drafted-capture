import Brand from '../shared/Brand';

// Terms from Drafted (Rodrigo Pecchio), November 17, 2026, reworded on
// November 18, 2026 so students can read them easily. Section 4(c) was changed
// on November 18, 2026 to allow quality reviews of submitted sessions. Change the
// meaning only with Drafted's sign-off, and update LAST_UPDATED when it changes.
const LAST_UPDATED = 'November 18, 2026';

type Section = { title: string; lead?: string; points: string[]; note?: string };

const SECTIONS: Section[] = [
  {
    title: 'What Sidekick does',
    points: [
      "Sidekick is a browser extension. Once the user turns it on, it records work activity inside the Customer's organization: page content, clicks, keystrokes in work fields, and screenshots.",
      'The Customer uses these recordings to build workflows and train its own models.',
      'Sidekick does nothing until it is turned on. The user can pause it or turn it off at any time.',
    ],
  },
  {
    title: 'Who the agreement is with',
    points: [
      'These terms are an agreement between Drafted and the Customer.',
      "Users are covered by the Customer's authority and by the User notice in section 4.",
    ],
  },
  {
    title: 'The Customer owns its data',
    points: [
      'The Customer owns all Customer Data.',
      'Drafted gets a limited license to process Customer Data, only to provide the service to that Customer.',
      'Drafted does not use Customer Data to train models for anyone else, does not sell it, and does not share it with third parties.',
      "The one exception is the subprocessors listed in the Customer's order form. They are bound by terms that are equal or stricter.",
    ],
  },
  {
    title: "Notice and consent (the Customer's responsibility)",
    lead: 'Before turning Sidekick on for any User, the Customer must:',
    points: [
      '(a) give clear written notice of what is captured and why,',
      '(b) get any consent or works council approval the law requires where the User is located, and',
      '(c) not use Sidekick for covert monitoring or to score individual performance. This does not cover quality reviews of sessions a User chooses to record and submit, when the User has been told about them (for example, to give feedback on those sessions or to decide pay for them).',
    ],
    note: 'Sidekick shows a visible indicator while it is recording.',
  },
  {
    title: 'Protections built in',
    points: [
      'Capture is off by default, with a visible on/off indicator.',
      "Password fields, payment fields, and sites on the Customer's blocklist are never captured.",
      'Where configured, sensitive values are redacted on the device before upload.',
      "Data is encrypted while it is sent and while it is stored (in transit and at rest). It is kept in the Customer's designated boundary or region.",
      'Only Drafted staff who need access for support can see the data. They are under confidentiality duties, and their access is logged.',
    ],
  },
  {
    title: 'What the Customer must not capture',
    points: [
      "Protected health information, payment card data, government ID numbers, or children's data.",
      'The only exception is when a separate written addendum (for example a BAA) is signed.',
      'The Customer is responsible for setting up blocklists to keep that data out.',
    ],
  },
  {
    title: 'Security incidents',
    points: [
      'If Drafted confirms an incident affecting Customer Data, it will notify the Customer without undue delay, and within 72 hours.',
      'The notice will include the details Drafted has and the steps it is taking.',
    ],
  },
  {
    title: 'Retention and deletion',
    points: [
      'Customer Data is kept for the term, and for a retention period the Customer sets.',
      'Drafted deletes it on request, or within 30 days after termination, and confirms the deletion in writing.',
      'Copies in backups are removed within 90 days.',
    ],
  },
];

const TERMS: [string, string][] = [
  ['Drafted', 'Drafted, Inc.'],
  ['Customer', 'the organization that deploys Sidekick.'],
  ['Users', "the employees and contractors who use Sidekick on the Customer's behalf."],
  [
    'Customer Data',
    'all data captured by Sidekick, plus any models, workflows, and outputs trained on it.',
  ],
];

export function Terms() {
  return (
    <div className="min-h-screen px-6 py-10">
      <article className="mx-auto max-w-2xl">
        <header className="space-y-3">
          <Brand size="text-[28px]" flat />
          <h1 className="pt-4 text-2xl font-semibold text-text">Sidekick Terms of Use</h1>
          <p className="text-sm text-text-muted">Last updated: {LAST_UPDATED}</p>
        </header>

        <section className="mt-8 rounded-xl border border-white/[0.08] p-4">
          <h2 className="text-sm font-semibold text-text">Words used on this page</h2>
          <dl className="mt-2 space-y-1.5 text-sm leading-relaxed text-text-muted">
            {TERMS.map(([term, meaning]) => (
              <div key={term}>
                <dt className="inline font-medium text-text">{term}</dt>
                <dd className="inline">: {meaning}</dd>
              </div>
            ))}
          </dl>
        </section>

        <ol className="mt-8 space-y-6">
          {SECTIONS.map((section, i) => (
            <li key={section.title}>
              <h2 className="text-base font-semibold text-text">
                {i + 1}. {section.title}
              </h2>
              {section.lead && (
                <p className="mt-2 text-sm leading-relaxed text-text-muted">{section.lead}</p>
              )}
              <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-text-muted">
                {section.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
              {section.note && (
                <p className="mt-2 text-sm leading-relaxed text-text-muted">{section.note}</p>
              )}
            </li>
          ))}
        </ol>
      </article>
    </div>
  );
}
