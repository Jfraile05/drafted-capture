import Brand from '../shared/Brand';

// Text from Drafted (Rodrigo Pecchio), November 17, 2026. Change it only with
// their sign-off, and update LAST_UPDATED when it changes.
const LAST_UPDATED = 'November 17, 2026';

const SECTIONS: { title: string; body: string | string[] }[] = [
  {
    title: 'What Sidekick does',
    body: "Sidekick is a browser extension that, once the user turns it on, records work activity (page content, clicks, keystrokes in work fields, screenshots) inside the customer's organization so the customer can build workflows and train its own models. Sidekick does nothing until it is turned on, and the user can pause or turn it off at any time.",
  },
  {
    title: 'Who the agreement is with',
    body: 'These terms are between Drafted, Inc. ("Drafted") and the organization that deploys Sidekick (the "Customer"). Employees and contractors who use it on the Customer\'s behalf ("Users") are covered by the Customer\'s authority and by the User notice in section 4.',
  },
  {
    title: 'Customer owns its data',
    body: 'The Customer owns all data captured by Sidekick, plus any models, workflows, and outputs trained on it ("Customer Data"). Drafted gets a limited license to process Customer Data only to provide the service to that Customer. Drafted does not use Customer Data to train models for anyone else, sell it, or share it with third parties, except the subprocessors listed in the Customer\'s order form, who are bound by equal or stricter terms.',
  },
  {
    title: 'Notice and consent (Customer responsibility)',
    body: 'The Customer must, before turning Sidekick on for any User: (a) give clear written notice of what is captured and why, (b) get any consent or works council approval the law requires where the User is located, and (c) not use Sidekick for covert monitoring or to score individual performance. Sidekick shows a visible indicator while recording.',
  },
  {
    title: 'Protections built in',
    body: [
      'Capture is off by default, with a visible on/off indicator.',
      "Password fields, payment fields, and sites on the Customer's blocklist are never captured.",
      'Sensitive values are redacted on the device before upload where configured.',
      "Data is encrypted in transit and at rest and kept in the Customer's designated boundary or region.",
      'Access is limited to Drafted staff who need it for support, under confidentiality duties, and logged.',
    ],
  },
  {
    title: 'Customer must not capture',
    body: "Protected health information, payment card data, government ID numbers, or children's data, unless a separate written addendum (for example a BAA) is signed. Customer is responsible for configuring blocklists to keep that data out.",
  },
  {
    title: 'Security incidents',
    body: 'Drafted will notify the Customer without undue delay, and within 72 hours of confirming an incident affecting Customer Data, with the details we have and the steps we are taking.',
  },
  {
    title: 'Retention and deletion',
    body: 'Customer Data is kept for the term and a retention period the Customer sets. On request, or within 30 days of termination, Drafted deletes it and confirms in writing. Backups roll off within 90 days.',
  },
];

export function Terms() {
  return (
    <div className="min-h-screen px-6 py-10">
      <article className="mx-auto max-w-2xl">
        <header className="space-y-3">
          <Brand size="text-[28px]" />
          <h1 className="pt-4 text-2xl font-semibold text-text">Sidekick Terms of Use</h1>
          <p className="text-sm text-text-muted">Last updated: {LAST_UPDATED}</p>
        </header>
        <ol className="mt-8 space-y-6">
          {SECTIONS.map((section, i) => (
            <li key={section.title}>
              <h2 className="text-base font-semibold text-text">
                {i + 1}. {section.title}
              </h2>
              {Array.isArray(section.body) ? (
                <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-text-muted">
                  {section.body.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm leading-relaxed text-text-muted">{section.body}</p>
              )}
            </li>
          ))}
        </ol>
      </article>
    </div>
  );
}
