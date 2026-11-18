import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { LegalPage } from '@/components/marketing/legal-page';
import { pageMetadata } from '@/src/i18n/metadata';
import { Link } from '@/src/i18n/navigation';

type Params = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'legal' });
  return pageMetadata({
    locale,
    path: '/delete-account',
    title: t('deleteAccount.meta.title'),
    description: t('deleteAccount.meta.description'),
  });
}

/**
 * The public account-deletion page that the app stores link to. Google Play
 * requires it to name the apps, show the steps first, and say what is erased
 * and what is kept, so keep it in step with `MeAccountService.deleteMyAccount`.
 */
export default async function Page({ params }: Params) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('legal');
  return (
    <LegalPage title={t('deleteAccount.heading')} updated={t('deleteAccount.updated')}>
      {locale === 'ka' ? <DeleteAccountKa /> : <DeleteAccountEn />}
    </LegalPage>
  );
}

function DeleteAccountEn() {
  return (
    <>
      <p>
        This page applies to member accounts in the mobile apps published by FormaCore LLC,
        including <strong>Synergy</strong> and <strong>FormaCore Gym</strong>, and in the member
        portals of gyms that use FormaCore.
      </p>

      <h2>Delete your account in the app</h2>
      <ol className="list-decimal space-y-2 pl-6">
        <li>Open the app and sign in.</li>
        <li>
          Open the <strong>Profile</strong> tab.
        </li>
        <li>
          Scroll to the bottom and tap <strong>Delete account</strong>.
        </li>
        <li>Confirm. The account is deleted immediately and you are signed out.</li>
      </ol>

      <h2>Request deletion by email</h2>
      <p>
        If you cannot sign in, write to <a href="mailto:info@formacore.io">info@formacore.io</a>{' '}
        from the email address of your account, with the subject &quot;Delete my account&quot; and
        the name of your gym. We answer within 10 business days and may ask you to confirm that the
        account is yours.
      </p>

      <h2>What is deleted</h2>
      <ul className="list-disc space-y-2 pl-6">
        <li>Your name, email address, phone number and password.</li>
        <li>Sign-in links with Apple or Google, and every active session.</li>
        <li>
          Your profile photo, date of birth, gender, address, personal ID number, emergency contact
          and any notes the gym held on your profile.
        </li>
        <li>Push notification tokens, notification settings and your shop cart.</li>
      </ul>
      <p>Active subscriptions stop renewing at the end of the period already paid for.</p>

      <h2>What is kept</h2>
      <p>
        Payment, invoice, order and visit records stay with your gym without your name or contact
        details, because the gym has to keep its financial and accounting records for the period
        Georgian law requires. Copies in backups are removed on the regular backup rotation.
      </p>

      <h2>Staff and owner accounts</h2>
      <p>
        Accounts of gym staff and owners cannot be deleted from the app. Ask the administrator of
        your gym to remove you, or write to us.
      </p>

      <p>
        More on how personal data is handled is in our <Link href="/privacy">Privacy Policy</Link>.
      </p>
    </>
  );
}

function DeleteAccountKa() {
  return (
    <>
      <p>
        ეს გვერდი ეხება წევრის ანგარიშებს შპს „ფორმაქორის“ მიერ გამოქვეყნებულ მობილურ აპებში, მათ
        შორის <strong>Synergy</strong>-სა და <strong>FormaCore Gym</strong>-ში, და იმ დარბაზების
        წევრის პორტალებში, რომლებიც FormaCore-ს იყენებენ.
      </p>

      <h2>ანგარიშის წაშლა აპში</h2>
      <ol className="list-decimal space-y-2 pl-6">
        <li>გახსენით აპი და შედით ანგარიშში.</li>
        <li>
          გახსენით <strong>პროფილის</strong> ჩანართი.
        </li>
        <li>
          ჩამოდით ბოლოში და დააჭირეთ ღილაკს <strong>ანგარიშის წაშლა</strong>.
        </li>
        <li>დაადასტურეთ. ანგარიში მაშინვე წაიშლება და აპიდან გამოხვალთ.</li>
      </ol>

      <h2>წაშლის მოთხოვნა ელფოსტით</h2>
      <p>
        თუ ანგარიშში ვერ შედიხართ, მოგვწერეთ მისამართზე{' '}
        <a href="mailto:info@formacore.io">info@formacore.io</a> თქვენი ანგარიშის ელფოსტიდან,
        სათაურით „ანგარიშის წაშლა“, და მიუთითეთ თქვენი დარბაზის სახელი. გიპასუხებთ 10 სამუშაო დღის
        ვადაში და შესაძლოა გთხოვოთ დაადასტუროთ, რომ ანგარიში თქვენია.
      </p>

      <h2>რა იშლება</h2>
      <ul className="list-disc space-y-2 pl-6">
        <li>თქვენი სახელი, ელფოსტა, ტელეფონის ნომერი და პაროლი.</li>
        <li>Apple-ით ან Google-ით შესვლის კავშირები და ყველა აქტიური სესია.</li>
        <li>
          პროფილის ფოტო, დაბადების თარიღი, სქესი, მისამართი, პირადი ნომერი, საგანგებო საკონტაქტო
          პირი და დარბაზის მიერ თქვენს პროფილზე შენახული ჩანაწერები.
        </li>
        <li>შეტყობინებების ტოკენები, შეტყობინებების პარამეტრები და მაღაზიის კალათა.</li>
      </ul>
      <p>აქტიური გამოწერების განახლება წყდება უკვე გადახდილი პერიოდის ბოლოს.</p>

      <h2>რა რჩება</h2>
      <p>
        გადახდების, ინვოისების, შეკვეთებისა და ვიზიტების ჩანაწერები რჩება თქვენს დარბაზთან თქვენი
        სახელისა და საკონტაქტო მონაცემების გარეშე, რადგან დარბაზი ვალდებულია ფინანსური და საბუღალტრო
        ჩანაწერები შეინახოს საქართველოს კანონმდებლობით დადგენილი ვადით. სარეზერვო ასლებიდან
        მონაცემები იშლება სარეზერვო ასლების ჩვეულებრივი როტაციის შესაბამისად.
      </p>

      <h2>თანამშრომლისა და მფლობელის ანგარიშები</h2>
      <p>
        დარბაზის თანამშრომლისა და მფლობელის ანგარიშები აპიდან არ იშლება. სთხოვეთ თქვენი დარბაზის
        ადმინისტრატორს, რომ ამოგშალოთ, ან მოგვწერეთ.
      </p>

      <p>
        პერსონალური მონაცემების დამუშავებაზე მეტი იხილეთ{' '}
        <Link href="/privacy">კონფიდენციალურობის პოლიტიკაში</Link>.
      </p>
    </>
  );
}
