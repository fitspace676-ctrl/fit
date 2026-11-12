import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { LegalPage } from '@/components/marketing/legal-page';
import { pageMetadata } from '@/src/i18n/metadata';
import { Link } from '@/src/i18n/navigation';
import { TermsKa } from './terms-ka';

type Params = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'legal' });
  return pageMetadata({
    locale,
    path: '/terms',
    title: t('terms.meta.title'),
    description: t('terms.meta.description'),
  });
}

/**
 * The Terms of Service text as supplied by FormaCore; keep the wording verbatim.
 * Each language has its own FormaCore-supplied text (Georgian in
 * `terms-ka.tsx`), never a machine translation.
 */
export default async function Page({ params }: Params) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('legal');
  return (
    <LegalPage title={t('terms.heading')} updated={t('terms.updated')}>
      {locale === 'ka' ? <TermsKa /> : <TermsEn />}
    </LegalPage>
  );
}

function TermsEn() {
  return (
    <>
      <p>
        These Terms of Service (&quot;Terms&quot;) govern access to and use of the FormaCore
        platform, including the admin panel, Member Portal, mobile applications, and related
        services (collectively, the &quot;Service&quot;), provided by FormaCore LLC (registration ID
        405872854), registered at Georgia, Tbilisi, Zaza Panaskertel-Tsitsishvili Street, Building
        1, Apartment 180 (&quot;FormaCore,&quot; &quot;we,&quot; &quot;us,&quot; &quot;our&quot;).
      </p>
      <p>
        By creating an account or using the Service, you (&quot;Customer,&quot; &quot;you&quot;)
        agree to be bound by these Terms. If you are entering into these Terms on behalf of a
        business, you represent that you have authority to bind that business. If you have signed a
        service agreement with FormaCore, that agreement forms part of these Terms and prevails over
        them in case of conflict.
      </p>

      <h2>1. The Service</h2>
      <p>
        FormaCore is a multi-tenant Wellness &amp; Leisure Management SaaS platform for gyms,
        fitness studios, spas, salons, and similar businesses. The Service includes an admin panel
        (member management, class scheduling, payments, POS, staff management, CRM, automation,
        marketing, and reporting modules), a self-service Member Portal, and - once released -
        mobile applications for iOS and Android.
      </p>
      <p>
        Features available to a given Customer depend on the subscription plan purchased. We may
        add, modify, or discontinue features over time; we will not materially reduce core
        functionality of a paid plan during an active subscription term without notice.
      </p>

      <h2>2. Accounts</h2>
      <p>
        You must provide accurate registration information; you are responsible for the
        confidentiality of login credentials for your account and all staff accounts created under
        it, and for all activity under your account. Notify us promptly of any unauthorized use.
      </p>

      <h2>3. Subscription, Billing, and Pricing</h2>
      <ul className="list-disc space-y-2 pl-6">
        <li>
          FormaCore is offered on a per-location subscription pricing model. The plan, locations,
          fees and billing period are set out in the service agreement signed with Customer.
        </li>
        <li>
          Subscriptions are concluded for a term of 12 months, unless the service agreement states
          otherwise, and renew automatically for the same term unless either party gives written
          notice at least 30 days before the end of the current term.
        </li>
        <li>
          Fees are invoiced in advance at the start of each billing period and are payable within 14
          days of the invoice date.
        </li>
        <li>
          Fees are stated in GEL and exclude VAT and other applicable taxes, unless stated
          otherwise.
        </li>
        <li>
          Accepted payment methods are bank transfer and online payment. For online payments, you
          authorize us (or our payment processor) to charge your designated payment method.
        </li>
        <li>
          If an invoice is not paid within 14 days, access to the Service is blocked until payment
          is received. Customer data is retained unchanged during this period. Blocking does not
          release Customer from its payment obligations.
        </li>
        <li>
          Upon renewal, fees may be indexed by up to 10%, no more than once every 12 months, with at
          least 30 days&apos; written notice. No other price increases apply during a subscription
          term. Additional locations, add-ons or services requested by Customer are charged
          separately at the price agreed at the time of the request.
        </li>
        <li>
          If Customer terminates or stops using the Service before the end of the subscription term,
          the fees for the remaining term remain payable in full.
        </li>
        <li>
          Except as required by law or expressly stated in the service agreement, fees are
          non-refundable.
        </li>
      </ul>

      <h2>4. Customer Data and Member Data</h2>
      <ul className="list-disc space-y-2 pl-6">
        <li>
          As between the parties, Customer retains ownership of data it uploads or generates through
          the Service, including Member data.
        </li>
        <li>
          We process Member data solely on Customer&apos;s behalf and instructions, per our{' '}
          <Link href="/dpa">Data Processing Agreement (DPA)</Link>, which forms part of these Terms.
        </li>
        <li>
          Customer is responsible for ensuring it has the necessary rights and legal basis to submit
          Member data to the Service and to use its communication and automation features (including
          email marketing via Resend) to contact its Members.
        </li>
        <li>
          Upon termination, Customer may export its data for 3 months, after which we will delete or
          anonymize retained data, subject to legal retention requirements.
        </li>
      </ul>

      <h2>5. Acceptable Use</h2>
      <p>
        You agree not to: use the Service unlawfully or in violation of these Terms; send
        unsolicited communications in violation of applicable law; attempt unauthorized access to
        the Service, other accounts, or underlying infrastructure; reverse engineer or attempt to
        extract source code, except as permitted by law; interfere with or disrupt the Service;
        transmit malicious code; or resell, sublicense, or white-label the Service without our prior
        written consent.
      </p>
      <p>
        We may suspend accounts that violate this section, with notice where reasonably practicable.
      </p>

      <h2>6. Intellectual Property</h2>
      <p>
        We retain all rights in the Service, including software, design, trademarks, and underlying
        technology. Customer receives a limited, non-exclusive, non-transferable license to use the
        Service during the subscription term for its internal business purposes. Feedback you
        provide may be used by us without restriction or obligation.
      </p>

      <h2>7. Third-Party Services</h2>
      <p>
        The Service integrates with third-party providers, including payment processing and
        AI-assisted features. Use of these integrated features may be subject to the applicable
        third party&apos;s own terms, to the extent disclosed to you. Outputs of AI-assisted
        features are suggestions only; Customer should review them before acting on them.
      </p>

      <h2>8. Mobile Applications</h2>
      <p>
        Once released, use of FormaCore&apos;s iOS and Android applications is also governed by
        these Terms and by the applicable app store&apos;s terms of use. Certain features may
        require permissions (e.g., camera, push notifications) as described in our{' '}
        <Link href="/privacy">Privacy Policy</Link>; you may decline these permissions, though some
        features may then be unavailable.
      </p>

      <h2>9. Service Availability</h2>
      <p>
        We aim to provide reliable access but do not guarantee uninterrupted or error-free
        operation. Planned maintenance will be communicated in advance where practicable.
      </p>

      <h2>10. Term and Termination</h2>
      <p>
        These Terms remain in effect for as long as you maintain an active subscription. Either
        party may terminate for the other&apos;s material breach if not cured within a reasonable
        period after notice. We may suspend or terminate immediately for violations of Section 5 or
        non-payment. Termination or discontinued use by Customer, other than for our uncured
        material breach, does not release Customer from paying the fees for the remaining
        subscription term under Section 3. Upon termination, Customer&apos;s access ends; data
        export/deletion follows Section 4 and the DPA.
      </p>

      <h2>11. Disclaimers</h2>
      <p>
        THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE.&quot; TO THE MAXIMUM
        EXTENT PERMITTED BY LAW, WE DISCLAIM ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING
        MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.
      </p>

      <h2>12. Limitation of Liability</h2>
      <p>
        TO THE MAXIMUM EXTENT PERMITTED BY LAW, FORMACORE&apos;S AGGREGATE LIABILITY ARISING OUT OF
        OR RELATED TO THESE TERMS SHALL NOT EXCEED THE FEES PAID BY CUSTOMER IN THE TWELVE (12)
        MONTHS PRECEDING THE CLAIM. IN NO EVENT SHALL EITHER PARTY BE LIABLE FOR INDIRECT,
        INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES.
      </p>

      <h2>13. Indemnification</h2>
      <p>
        Customer agrees to indemnify and hold us harmless from claims arising out of its misuse of
        the Service, violation of these Terms, or violation of applicable law in connection with
        Member data it submits to the Service.
      </p>

      <h2>14. Governing Law and Disputes</h2>
      <p>
        These Terms are governed by the laws of Georgia. Any disputes arising under these Terms are
        subject to the jurisdiction of Tbilisi City Court.
      </p>

      <h2>15. Changes to These Terms</h2>
      <p>
        We may update these Terms from time to time. Material changes will be communicated via email
        or in-app notice at least 30 days before taking effect. Continued use after changes take
        effect constitutes acceptance.
      </p>

      <h2>16. Confidentiality</h2>
      <p>
        Each party will keep confidential any non-public business, technical or financial
        information received from the other party in connection with the Service, including pricing,
        discounts, business figures and product information, and will use it only to perform these
        Terms. This does not apply to information that is public, already known to the recipient,
        independently developed, or required to be disclosed by law. These obligations continue for
        3 years after termination. Personal data of Members is governed by the{' '}
        <Link href="/dpa">DPA</Link>.
      </p>

      <h2>17. Force Majeure</h2>
      <p>
        Neither party is liable for delays or failures caused by events beyond its reasonable
        control.
      </p>

      <h2>18. General Provisions</h2>
      <p>
        If any provision of these Terms is found invalid, the remaining provisions stay in force.
        Customer may not assign its rights or obligations without our prior written consent; we may
        assign them to a successor in connection with a merger, acquisition or sale of our business.
        All notices and communication under these Terms are made by email. FormaCore&apos;s address
        is <a href="mailto:info@formacore.io">info@formacore.io</a>; Customer&apos;s address is the
        one stated in the service agreement or account. A notice is considered received on the
        business day after it is sent. These Terms are published in Georgian and English; if the
        versions differ, the Georgian version prevails.
      </p>

      <h2>19. Contact</h2>
      <p>
        FormaCore LLC
        <br />
        Email (for all communication): <a href="mailto:info@formacore.io">info@formacore.io</a>
        <br />
        Registered address: Georgia, Tbilisi, Zaza Panaskertel-Tsitsishvili Street, Building 1,
        Apartment 180
      </p>
    </>
  );
}
