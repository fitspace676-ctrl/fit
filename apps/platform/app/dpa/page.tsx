import type { Metadata } from 'next';
import { LegalPage } from '@/components/marketing/legal-page';

export const metadata: Metadata = {
  title: 'Data Processing Agreement - FormaCore',
  description:
    "FormaCore's Data Processing Agreement: how FormaCore processes Member personal data on a gym's behalf under the Law of Georgia on Personal Data Protection.",
};

/** The Subprocessors in Section 6. Section 6 commits to keeping this list current here. */
const SUBPROCESSORS = [
  {
    category: 'Hosting of Services',
    name: 'Railway',
    site: 'www.railway.com',
    address: '548 Market St Suite 68956, San Francisco, California 94104',
  },
  {
    category: 'Hosting of Services',
    name: 'Hetzner Online GmbH',
    site: 'www.hetzner.com',
    address: 'Industriestr. 25, 91710 Gunzenhausen, Germany',
  },
  {
    category: 'Hosting of Services',
    name: 'Vercel Inc.',
    site: 'www.vercel.com',
    address: '201 Mission St #300, San Francisco, CA 94105, United States.',
  },
  {
    category: 'Communication tools with Members',
    name: 'Resend',
    site: 'www.resend.com',
    address: '2261 Market Street #5039 San Francisco, CA 94114',
  },
  {
    category: 'Payment processing',
    name: 'Bank of Georgia/TBC Bank (JSC)',
    site: null,
    address:
      '29a Gagarini Street, Tbilisi, 0160. 7 K. Marjanishvili Street, Chugureti District, Tbilisi, 0102, Georgia.',
  },
];

/** The DPA text as supplied by FormaCore; keep the wording verbatim. */
export default function Page() {
  return (
    <LegalPage
      title="FormaCore Data Processing Agreement (DPA)"
      updated="Effective Date: 01.09.2026"
    >
      <p>
        This Data Processing Agreement (&quot;DPA&quot;) forms part of the Terms of Service between
        FormaCore LLC (registration ID 405872854), registered at Georgia, Tbilisi, Zaza
        Panaskertel-Tsitsishvili Street, Building 1, Apartment 180 (&quot;Processor,&quot;
        &quot;FormaCore,&quot; &quot;we&quot;) and the Customer (&quot;Controller&quot;), and
        applies to FormaCore&apos;s processing of Personal Data of the Controller&apos;s Members on
        the Controller&apos;s behalf, under the Law of Georgia &quot;On Personal Data
        Protection.&quot;
      </p>

      <h2>1. Definitions</h2>
      <p>
        <strong>&quot;Personal Data&quot;</strong> — any information relating to an identified or
        identifiable natural person processed by FormaCore on behalf of the Controller through the
        Service.
      </p>
      <p>
        <strong>&quot;Processing&quot;</strong> — has the meaning given under the Law of Georgia
        &quot;On Personal Data Protection.&quot;
      </p>
      <p>
        <strong>&quot;Data Subjects&quot;</strong> — the Controller&apos;s Members, staff, or other
        individuals whose Personal Data is processed through the Service.
      </p>
      <p>
        <strong>&quot;Subprocessor&quot;</strong> — any third party engaged by FormaCore to process
        Personal Data on the Controller&apos;s behalf.
      </p>

      <h2>2. Roles and Statutory Compliance</h2>
      <p>
        Each party shall comply with its respective obligations under the Law of Georgia &quot;On
        Personal Data Protection.&quot; FormaCore acts as Data Processor; Controller acts as Data
        Controller for Member data processed through the Service. FormaCore&apos;s obligations are
        limited to operating the Service; Controller remains responsible for the lawfulness of its
        data collection, the information and consent it obtains from Data Subjects, and the content
        it submits, uploads, or sends through the Service.
      </p>

      <h2>3. Subject Matter, Duration, and Nature of Processing</h2>
      <p>
        <strong>Subject matter:</strong> Provision of the FormaCore platform for management of
        Controller&apos;s fitness/wellness business, including membership, scheduling, payments, and
        Member communications.
      </p>
      <p>
        <strong>Duration:</strong> For the term of the subscription, plus the post-termination
        export/retention period described in Section 8.
      </p>
      <p>
        <strong>Nature and purpose:</strong> Storage, retrieval, organization, and transmission of
        Personal Data as directed by Controller through the Service&apos;s features (member
        management, bookings, payment tracking, email communications via Resend, reporting).
      </p>

      <h2>4. Categories of Data Subjects and Personal Data</h2>
      <p>
        <strong>Data Subjects:</strong> Members of Controller&apos;s business; Controller&apos;s
        staff users where applicable.
      </p>
      <p>
        <strong>Categories of Personal Data:</strong> identification data (name, date of birth,
        contact details); membership and attendance records; payment and billing history related to
        memberships; email communications sent or received through the platform; data voluntarily
        submitted by Members via the Member Portal or mobile app.
      </p>
      <p>
        Controller determines what Personal Data is submitted and is responsible for its accuracy
        and the lawful basis for its collection.
      </p>

      <h2>5. Processor Obligations</h2>
      <p>FormaCore shall:</p>
      <ul className="list-disc space-y-2 pl-6">
        <li>
          Process Personal Data only on Controller&apos;s documented instructions, including as set
          out in the Terms of Service and this DPA, unless otherwise required by law — and will
          inform Controller if an instruction appears to conflict with applicable law;
        </li>
        <li>
          Ensure personnel authorized to process Personal Data are bound by confidentiality
          obligations;
        </li>
        <li>Implement appropriate technical and organizational security measures (Section 7);</li>
        <li>
          Assist Controller, so far as reasonably possible, in responding to Data Subject requests;
        </li>
        <li>
          Notify Controller without undue delay, and in any event within 48 hours of becoming aware,
          of a Personal Data breach affecting Controller&apos;s data — so Controller can meet its
          own 72-hour notification obligation to the Personal Data Protection Service;
        </li>
        <li>
          Make available information reasonably necessary to demonstrate compliance with this DPA;
        </li>
        <li>
          Delete or return Personal Data to Controller at the end of the subscription per Section 8,
          unless retention is required by law.
        </li>
      </ul>

      <h2>6. Subprocessors</h2>
      <p>
        Controller authorizes FormaCore to engage the following Subprocessors, and any additional
        Subprocessors reasonably necessary to provide the Service:
      </p>
      <div className="overflow-x-auto rounded-card border border-overlay/10">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="bg-overlay/[0.04] text-xs uppercase tracking-wide text-faint">
            <tr>
              <th className="px-4 py-3 font-semibold">Category</th>
              <th className="px-4 py-3 font-semibold">Company Name</th>
              <th className="px-4 py-3 font-semibold">Addresses</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-overlay/10">
            {SUBPROCESSORS.map((s) => (
              <tr key={s.name} className="align-top">
                <td className="px-4 py-3 text-muted">{s.category}</td>
                <td className="px-4 py-3">
                  <span className="font-semibold text-fg">{s.name}</span>
                  {s.site && <span className="block text-muted">{s.site}</span>}
                </td>
                <td className="px-4 py-3 text-muted">{s.address}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        FormaCore will notify Controller of any new Subprocessor materially involved in processing
        Personal Data, or of a change to an existing one, at least 7 days before the change takes
        effect, allowing Controller to raise a reasonable objection on data-protection grounds.
        Continued use of the Service after that period constitutes acceptance. FormaCore remains
        responsible for each Subprocessor&apos;s compliance with obligations equivalent to those in
        this DPA. FormaCore will keep this table current and publish it at www.formacore.io for
        reference by Controllers and Members.
      </p>

      <h2>7. Security Measures</h2>
      <p>
        FormaCore implements measures including encryption of data in transit, access controls
        limiting data access to authorized personnel, secure hosting infrastructure, and periodic
        review of these measures as risks evolve.
      </p>

      <h2>8. Data Return and Deletion</h2>
      <p>Upon termination or expiration of the subscription:</p>
      <ul className="list-disc space-y-2 pl-6">
        <li>Controller may export its Personal Data for 3 months following termination.</li>
        <li>
          After this period, FormaCore will delete or anonymize remaining Personal Data from active
          systems within a reasonable timeframe, except where retention is required by law (e.g.,
          financial/accounting records).
        </li>
        <li>Backup copies are purged per FormaCore&apos;s standard backup rotation schedule.</li>
      </ul>

      <h2>9. International Transfers</h2>
      <p>
        Where Personal Data is transferred outside Georgia via a Subprocessor, FormaCore will ensure
        the destination country offers an adequate level of protection, or that appropriate
        contractual safeguards are in place, consistent with the Law of Georgia &quot;On Personal
        Data Protection.&quot;
      </p>

      <h2>10. Audit Rights</h2>
      <p>
        Upon reasonable written request, no more than once per year (unless required by a
        supervisory authority or following a security incident, and with at least 30 days&apos;
        advance notice), FormaCore will provide Controller with information reasonably necessary to
        demonstrate compliance with this DPA — which may include relevant documentation or a written
        questionnaire response — in lieu of an on-site audit.
      </p>

      <h2>11. Liability and Precedence</h2>
      <p>
        Liability under this DPA is subject to the limitations set out in the Terms of Service,
        except where such limitation is not permitted under the Law of Georgia &quot;On Personal
        Data Protection.&quot; In the event of a conflict between this DPA and the Terms of Service
        regarding the processing of Personal Data, this DPA prevails.
      </p>

      <h2>12. Contact</h2>
      <p>
        FormaCore
        <br />
        Georgia, Tbilisi, Zaza Panaskertel-Tsitsishvili Street, Building 1, Apartment 180
        <br />
        Data Protection Contact: <a href="mailto:info@formacore.io">info@formacore.io</a>
      </p>
    </LegalPage>
  );
}
