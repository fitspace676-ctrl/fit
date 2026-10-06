import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage } from '@/components/marketing/legal-page';

export const metadata: Metadata = {
  title: 'Privacy policy - FormaCore',
  description:
    'How FormaCore collects, uses and protects personal data, as Controller for its Customers and as Processor for their Members, under the Law of Georgia on Personal Data Protection.',
};

/** The Privacy Policy text as supplied by FormaCore; keep the wording verbatim. */
export default function Page() {
  return (
    <LegalPage
      title="FormaCore Privacy Policy"
      updated="Effective Date: 01.09.2026 · Last Updated: 14.09.2026"
    >
      <h2>1. Who We Are</h2>
      <p>
        FormaCore LLC (registration ID 405872854), registered at Georgia, Tbilisi, Zaza
        Panaskertel-Tsitsishvili Street, Building 1, Apartment 180 (&quot;FormaCore,&quot;
        &quot;we,&quot; &quot;us,&quot; &quot;our&quot;), provides a multi-tenant Wellness &amp;
        Leisure Management SaaS platform for gyms, fitness studios, spas, salons, and similar
        businesses (&quot;Customers&quot;), including an admin panel, a self-service Member Portal,
        and mobile applications (collectively, the &quot;Service&quot;).
      </p>
      <p>
        This Privacy Policy is interpreted in line with the Law of Georgia &quot;On Personal Data
        Protection,&quot; and terms used here (Controller, Processor, Data Subject, Personal Data)
        carry the meaning given under that Law.
      </p>

      <h2>2. Two Relationships, Two Roles</h2>
      <p>
        <strong>FormaCore as Controller</strong> — for data about our Customers themselves (the
        businesses that sign up) and their staff users: account details, billing, support history.
        We decide how this data is used, for our own operational purposes.
      </p>
      <p>
        <strong>FormaCore as Processor</strong> — for data about a Customer&apos;s own Members
        (gym-goers, clients), which the Customer submits to or generates on the platform. Here, the
        Customer is the Controller; we process this data only on their instructions, under the terms
        of our <Link href="/dpa">Data Processing Agreement</Link> (Annex to this policy).
      </p>
      <p>
        If you are a Member of a business that uses FormaCore, that business is responsible for
        informing you how your data is used — please also check their own privacy notice.
      </p>

      <h2>3. What We Collect</h2>
      <p>
        <strong>From Customers directly:</strong> business and account registration details, staff
        user accounts, billing information, support correspondence.
      </p>
      <p>
        <strong>Processed on behalf of Customers (Member data):</strong> Member profile data (name,
        contact details, date of birth, membership status), attendance/check-in records, payment and
        subscription history tied to memberships, data submitted via the Member Portal, and
        communications sent through the platform&apos;s email automation.
      </p>
      <p>
        <strong>Collected automatically:</strong> usage and log data, device/browser information,
        and — once mobile apps are live — mobile-specific data described in Section 9.
      </p>
      <p>
        <strong>AI-assisted features:</strong> certain features are supported by a third-party AI
        language-processing service. Interactions with these features may be processed by that
        provider strictly to generate the requested output; this data is not used to train external
        models beyond what a single request requires.
      </p>

      <h2>4. Why We Process It</h2>
      <p>
        To operate and maintain the Service; process subscription billing; provide support; send
        administrative communications; monitor security and performance; prevent fraud and abuse;
        and comply with legal obligations (including Georgian tax and accounting requirements). We
        do not sell Personal Data, and we do not use Member data for our own marketing purposes.
      </p>

      <h2>5. Legal Basis</h2>
      <p>
        Depending on the processing activity: performance of a contract with the Customer, our
        legitimate interests (security, fraud prevention, service improvement), your consent (e.g.,
        direct marketing — see Section 8), or compliance with a legal obligation.
      </p>

      <h2>6. Who We Share Data With</h2>
      <ul className="list-disc space-y-2 pl-6">
        <li>
          Infrastructure and service providers, currently: Railway and Hetzner (application/database
          hosting), Vercel (application hosting), Bank of Georgia and/or TBC Bank (card/bank payment
          processing — integration not yet live; cash payments are also accepted and are not
          processed through this channel), and Resend (email delivery for Member communications).
        </li>
        <li>Professional advisors (legal, accounting) as needed.</li>
        <li>Regulatory or law enforcement authorities where legally required.</li>
        <li>
          A successor entity in the event of a merger, acquisition, or asset sale, subject to
          equivalent protections.
        </li>
      </ul>
      <p>
        We do not sell or rent Personal Data to third parties for their own marketing purposes. A
        current subprocessor list is available on request or at{' '}
        <Link href="/dpa">www.formacore.io</Link>.
      </p>

      <h2>7. International Transfers</h2>
      <p>
        Where our infrastructure providers process data outside Georgia, we only do so where the
        destination country is recognized as offering an adequate level of protection, or where
        appropriate contractual safeguards are in place, consistent with the Law of Georgia &quot;On
        Personal Data Protection.&quot;
      </p>

      <h2>8. Direct Marketing (Email)</h2>
      <p>
        Where a Member or Customer contact has agreed to receive marketing communications via email
        (sent through Resend), we process their name and email address for that purpose only. You
        may unsubscribe at any time using the link in any marketing email; we will stop processing
        your data for direct marketing purposes within 7 business days of your request.
      </p>

      <h2>9. Cookies and Tracking Technologies</h2>
      <p>
        Our marketing website uses cookies and similar technologies, including Google Analytics
        and/or similar analytics tools, to:
      </p>
      <ul className="list-disc space-y-2 pl-6">
        <li>
          Enable core site functionality (strictly necessary — set without consent, as they are
          required for the site to work)
        </li>
        <li>
          Analyze site traffic and usage patterns (analytics/performance — set only with your
          consent)
        </li>
        <li>
          Measure the effectiveness of marketing activity (functionality/advertising — set only with
          your consent)
        </li>
      </ul>
      <p>
        Where required under the Law of Georgia &quot;On Personal Data Protection,&quot; we obtain
        your consent via a cookie banner before setting non-essential cookies, and you may withdraw
        that consent at any time through your cookie settings or browser controls. Disabling certain
        cookies may affect site functionality. Analytics data collected through these tools is used
        in aggregate and is not linked to Member data processed within the Service itself.
      </p>

      <h2>10. Mobile Applications</h2>
      <p>
        FormaCore&apos;s iOS and Android applications (in development at the time of writing) are
        expected to request some or all of the following permissions, used only for the stated
        purpose:
      </p>
      <ul className="list-disc space-y-2 pl-6">
        <li>Camera — for QR-code check-in and profile photo capture</li>
        <li>Push notifications — for booking confirmations, reminders, and account alerts</li>
        <li>Device identifiers — for session security and app diagnostics</li>
      </ul>
      <p>
        Device-level biometric login (Face ID / fingerprint), if offered, is handled entirely by the
        device operating system — FormaCore does not receive or store biometric data in this case.
        Before the apps go live, this section will be finalized to match the actual permissions
        requested, and a corresponding disclosure will be filed with Apple&apos;s App Store and
        Google Play as required.
      </p>

      <h2>11. Data Retention</h2>
      <ul className="list-disc space-y-2 pl-6">
        <li>
          Customer account data is retained for the duration of the subscription and for a
          reasonable period afterward for legal, accounting, and dispute-resolution purposes, in
          line with Georgian statutory retention requirements.
        </li>
        <li>
          Member data is retained per the Customer&apos;s instructions. On termination, the Customer
          has 3 months to export their data before we delete or anonymize it, except where longer
          retention is required by law (e.g., financial records).
        </li>
        <li>
          Backup copies are purged on our standard backup rotation schedule following deletion from
          active systems.
        </li>
      </ul>

      <h2>12. Security</h2>
      <p>
        We apply technical and organizational measures designed to protect Personal Data, including
        encryption in transit, access controls limiting data access to authorized personnel, and
        secure hosting infrastructure. No system is guaranteed to be 100% secure.
      </p>

      <h2>13. Your Rights</h2>
      <p>
        Subject to the Law of Georgia &quot;On Personal Data Protection,&quot; you may have the
        right to: obtain information about data processed about you; request correction, update,
        blocking, or deletion of your data; object to processing for direct marketing; and withdraw
        consent at any time. We aim to respond to such requests within 10 business days. If you are
        a Member, please first contact the business you are a member of, as they are the Controller
        for that data; if you are a Customer, contact us using the details in Section 15. You may
        also lodge a complaint with the Personal Data Protection Service of Georgia.
      </p>

      <h2>14. Minors</h2>
      <p>
        FormaCore accounts are intended for business use by adults. FormaCore&apos;s Services are
        not directed at, and we do not knowingly collect data directly from, individuals under 18
        for account-holder purposes. Where a Customer&apos;s own business involves minors (e.g.,
        youth sports programs), the Customer is responsible as Controller for obtaining any
        necessary parental/guardian consent for that Member data.
      </p>

      <h2>15. Changes to This Policy</h2>
      <p>
        We may update this Privacy Policy from time to time; the current version is always available
        on our website, with the &quot;Last Updated&quot; date reflecting the most recent revision.
        Material changes will be communicated to Customers via email or in-app notice where
        appropriate.
      </p>

      <h2>16. Contact</h2>
      <p>
        FormaCore
        <br />
        Georgia, Tbilisi, Zaza Panaskertel-Tsitsishvili Street, Building 1, Apartment 180
        <br />
        Email: <a href="mailto:info@formacore.io">info@formacore.io</a>
      </p>
    </LegalPage>
  );
}
