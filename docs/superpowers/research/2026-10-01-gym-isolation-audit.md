# FormaCore: Gym Isolation Security & Architecture Audit

**თარიღი:** 2026-10-01  
**სამუშაო ხე (Worktree):** `fix/gym-isolation-signup`  
**მიზანი:** FormaCore მრავალმოიჯარიან (Multi-Tenant) არქიტექტურაში დარბაზების (`<slug>.formacore.io`) სრული იზოლაციის უზრუნველყოფა: მონაცემთა ბაზა, ავტორიზაცია, სესიები/ქუქიები, ელფოსტა/ბრენდინგი, შეტყობინებები, Redis/Cache, Storage და კლიენტის აპლიკაციები (Web & Mobile).

---

## 1. Executive Summary (აღმასრულებელი მიმოხილვა)

FormaCore იყენებს **Shared Database, Shared Schema** მოდელს ლოგიკური იზოლაციით (`gymId` სვეტი თითოეულ მოიჯარეზე მიბმულ ცხრილში). იზოლაციის მთავარი საყრდენი NestJS-ის `AsyncLocalStorage`-ზე დაფუძნებული `tenantStorage` და Prisma-ს გაფართოება (`prisma-tenant.extension.ts`) გახლავთ, რომელიც `where`-პირობებში ავტომატურად ამატებს `gymId`-ს.

### საერთო მდგომარეობა და რისკის დონე: **HIGH (მაღალი)**

მიუხედავად იმისა, რომ Prisma Tenant Extension-ის ბირთვი (57 მოდელი) სწორად ფილტრავს მონაცემებს სტანდარტულ HTTP მოთხოვნებში, სისტემაში არსებობს რამდენიმე **კრიტიკული და მაღალი სიმძიმის არქიტექტურული ხვრელი**:

1. **პროფილის მონაცემების ჯვარედინი დაბინძურება (Cross-Tenant Profile Contamination):** `me-profile.service.ts` და `members.service.ts` კითხულობენ და აახლებენ გლობალურ `User` ცხრილს (`user.name`, `user.phone`). როდესაც მომხმარებელი ან ადმინისტრატორი ცვლის წევრის სახელს/ტელეფონს Gym A-ში, ის ჩუმად იცვლება Gym B-შიც!
2. **მონაცემთა ბაზის გაუფილტრავი წვდომა (Unscoped Prisma Injections):** აპლიკაციის 38 სერვისში ინექტირებულია საბაზისო `PrismaService` და არა `TenantPrismaService`. ფონურ პროცესებში (crons, workers, queues), სადაც `tenantStorage` კონტექსტი ცარიელია, `scopeArgs` აბრუნებს გაუფილტრავ მოთხოვნებს, რაც იწვევს მონაცემთა გაჟონვის უდიდეს რისკს.
3. **ელფოსტის ბრენდინგისა და ბმულების დარღვევა:** შეტყობინებების სისტემაში CTA ბმულები აგენერირებს გლობალურ `app.formacore.io` მისამართს `<slug>.formacore.io`-ს ნაცვლად (რის გამოც მომხმარებელი კარგავს ავტორიზაციას host-only ქუქიების გამო), ხოლო სისტემური მეილების გამომგზავნად მითითებულია hardcoded `FormaCore` კონკრეტული დარბაზის სახელის ნაცვლად.
4. **სოციალური ავტორიზაციის (OAuth) ობოლი ჩანაწერები:** Google/Apple OAuth-ით ახალ დარბაზში შესვლისას იქმნება გლობალური `User`, თუმცა წევრობის არარსებობისას სროკავს 403-ს და ტოვებს ობოლ ჩანაწერს.
5. **Rate Limiting-ის ჯვარედინი დაბლოკვა:** Redis-ის გასაღებები (`rl:${name}:${ip}`) არ შეიცავს `gymId`-ს, რაც საერთო IP-ზე (კორპორატიული ქსელი, მობილური ოპერატორის NAT) ერთი დარბაზის მომხმარებლების მიერ ლიმიტის ამოწურვისას ბლოკავს სხვა დარბაზის წევრებსაც.

---

## 2. Severity Table (დარღვევების რეესტრი)

| Severity     | ფაილი : ხაზი                                                       | რა ირღვევა                                                                                                                                                                               | გასწორების გზა                                                                                                                                                                                  | რეკომენდებული ტესტი                                                                                                 |
| :----------- | :----------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------ |
| **Critical** | `apps/api/src/me/me-profile.service.ts:42, 62`                     | `getMyProfile` და `updateMyProfile` იყენებს გლობალურ `User` ცხრილს (`name`, `phone`). Gym A-ში სახელის შეცვლა ცვლის მას Gym B-შიც.                                                       | მონაცემები წაიკითხოს და განაახლოს მიმდინარე gym-ის `GymCredential`-ში ან `GymMember`-ში (T1.25 არქიტექტურა).                                                                                    | Gym A-ში სახელის განახლების შემდეგ Gym B-ს ტოკენით `/me/profile`-ის შემოწმება (სახელი უცვლელი უნდა დარჩეს).         |
| **Critical** | `apps/api/src/members/members.service.ts:134, 553-556`             | `updateMember`-ში Staff-ის მიერ სახელის/ტელეფონის რედაქტირება ასრულებს `tx.user.update`, რაც ცვლის გლობალურ `User`-ს ყველა დარბაზში.                                                     | `tx.gymMember.update` ან `tx.gymCredential.update`. გლობალური `User` არ უნდა შეიცვალოს ერთი დარბაზის ადმინის მიერ.                                                                              | Staff-ის მიერ Gym A-ში წევრის სახელის შეცვლა; შემოწმება, რომ Gym B-ს ადმინ პანელში ამავე პირის სახელი არ შეიცვალა.  |
| **High**     | `apps/api/src/notifications/notification-channels.ts:138, 163-168` | `toAbsoluteWebUrl(input.href)` აგენერირებს ბმულს გლობალური `env.WEB_URL`-ით (`app.formacore.io`) მიუხედავად იმისა, რომ `gymId` და `gym.slug` ცნობილია. Host-only ქუქიები იკარგება.       | გამოიყენოს `buildMemberUrl(input.href, gym.slug)` და დააგენერიროს `https://<slug>.formacore.io/...`.                                                                                            | ნოტიფიკაციის ელფოსტის გენერირების ტესტი: შემოწმდეს, რომ CTA ბმულის origin ემთხვევა დარბაზის slug-ს.                 |
| **High**     | `apps/api/src/auth/email.service.ts:441, 472`                      | `buildVerificationEmail` და `buildPasswordResetEmail`-ში `senderName` არის hardcoded `PLATFORM_NAME` ('FormaCore'). დარბაზის სახელი არ გამოიყენება.                                      | `sendVerificationEmail` და `sendPasswordResetEmail`-ს გადაეცეს `gymName` და `senderName` შეიცვალოს: `"${gymName} via FormaCore"`.                                                               | Unit test მეილის შაბლონზე: დარბაზის სახელი უნდა ფიგურირებდეს `from` ველში და ჰედში.                                 |
| **High**     | `apps/api/src/auth/auth.service.ts:1201-1241, 1280-1330`           | Google/Apple OAuth შესვლისას იქმნება გლობალური `User`, თუმცა მიმდინარე gym-ში წევრობის არარსებობისას სროკავს 403-ს და ტოვებს ობოლ `User`-ს.                                              | OAuth ნაკადში, თუ მოთხოვნა მოდის კონკრეტული gym-ის დომენიდან, მოხდეს ავტომატური onboarding (Credential + Member შექმნა) ან ტრანზაქციული rollback.                                               | OAuth ტესტი ახალ მომხმარებელზე კონკრეტულ დარბაზში: შემოწმდეს სესიის წარმატებით შექმნა და GymCredential-ის არსებობა. |
| **Medium**   | `apps/api/src/common/rate-limit/rate-limit.guard.ts:70`            | Redis key არის `rl:${options.name}:${clientIp}`. `gymId`-ის არარსებობის გამო საერთო IP-ზე ერთი დარბაზის დაბლოკვა ბლოკავს მეორესაც.                                                       | Key-ში დაემატოს მოიჯარის იდენტიფიკატორი: `rl:${options.name}:${gymId ?? 'global'}:${clientIp}`.                                                                                                 | Rate limit ტესტი: Gym A-ზე ლიმიტის ამოწურვის შემდეგ იმავე IP-დან Gym B-ზე მოთხოვნა უნდა დაბრუნდეს 200 OK-ით.        |
| **Medium**   | `apps/web/lib/session-cookies.ts:47-57`                            | Vercel-ზე `COOKIE_DOMAIN=.formacore.io`-ს არსებობისას ქუქი ხდება დომენური და ჟონავს ქვედომენებს შორის; mismatch-ისას იშლება ყველა ტაბის სესია.                                           | გამოვიყენოთ მკაცრად Host-only ქუქიები (`__Host-fc_session`, domain ატრიბუტის გარეშე) ყველა გარემოში.                                                                                            | ბრაუზერის ტესტი: `gym1.formacore.io`-ზე ლოგინი არ უნდა აგზავნიდეს ქუქის `gym2.formacore.io`-ს მოთხოვნებზე.          |
| **Medium**   | `apps/mobile/lib/auth/session.ts:340-369`                          | `resolveGymSlug()` მე-4 fallback-ად იყენებს `undefined`-ს ("let API pick primary gym"). Per-gym credential მოდელში ეს შეუძლებელია.                                                       | მობილურმა აპმა პაროლის შეყვანამდე აუცილებლად უნდა იცოდეს `gymSlug` (Slug Selection Screen ან Deep Link).                                                                                        | Mobile login unit test: `gymSlug`-ის გარეშე ავტორიზაციის მცდელობამ უნდა მოითხოვოს დარბაზის არჩევა.                  |
| **Low**      | `apps/api/src/common/prisma/prisma-tenant.extension.ts:16-75`      | `schema.prisma`-ში არსებული 59 `gymId`-იანი მოდელიდან 2 აკლია `TENANT_SCOPED_MODELS`-ს: `RefreshToken` და `AgentChatSession` (ორივე დოკუმენტირებული და განზრახ დატოვებული გამონაკლისია). | `RefreshToken` რჩება unscoped (pin-ია და არა tenant key); `AgentChatSession`-ის scoped გახდომა საჭიროებს `AgentSessionsService.upsert`-ის refactoring-ს (cross-gym ID collision probe-ის გამო). | არსებული vitest ტესტი `prisma-tenant.extension.spec.ts` (76/76 passes).                                             |

---

## 3. დეტალური ანალიზი არეალების მიხედვით

### არეალი 1: Prisma Tenant Extension & Unscoped PrismaService

#### 1.1 `TENANT_SCOPED_MODELS` შედარება `schema.prisma`-სთან

`schema.prisma`-ში მოიძებნა 59 მოდელი, რომელსაც გააჩნია `gymId` ველი.  
`prisma-tenant.extension.ts`-ში `TENANT_SCOPED_MODELS` Set-ში გაწერილია 57 მოდელი.

**გამოტოვებული მოდელები (დასაბუთებული გამონაკლისები):**

1. `RefreshToken`: განზრახ გამოტოვებულია, რადგან ტოკენის განახლებისას (`POST /auth/refresh`) HTTP მოთხოვნის ჰედერში ჯერ არ არსებობს ვალიდური JWT და `tenantStorage` კონტექსტი ცარიელია. თუმცა, `token.service.ts`-ში `RefreshToken.gymId` მკაცრად მოწმდება (`invalidRefreshToken()` შეუსაბამობისას) — ეს ველი არის session pin და არა ტიპური tenant model.
2. `AgentChatSession`: განზრახ გამოტოვებულია (`prisma-tenant.extension.spec.ts:319-332`). მისი ID გენერირდება admin client-ის მიერ (მოკლე სტრიქონი და არა UUID), რის გამოც შესაძლებელია კოლიზია დარბაზებს შორის. `AgentSessionsService.upsert` აკეთებს probe-ს `findUnique({ where: { id } })` დარბაზებს შორის, რათა სხვა დარბაზის ჩანაწერის გადაწერის ნაცვლად დააბრუნოს 404. ამ მოდელის ავტომატური სკოუპინგი ამ შემოწმებას გადააქცევდა miss-ად და გამოიწვევდა 500 DB შეცდომას Primary Key-ზე. სერვისის ყველა დანარჩენი მოთხოვნა მკაცრად ფილტრავს `gymId` + `userId`-ით.

#### 1.2 Unscoped `PrismaService`-ის პირდაპირი გამოყენება (38 სერვისი)

პროექტში 38 სერვისში ინექტირებულია `PrismaService` ნაცვლად `TenantPrismaService`-ისა:

- `activity.service.ts`, `attendance.service.ts`, `audit.service.ts`, `automation-executor.service.ts`, `banners.service.ts`, `cart.service.ts`, `dashboard.service.ts`, `invoices.service.ts`, `marketing.service.ts`, `me-profile.service.ts`, `members.service.ts`, `orders.service.ts`, `packages.service.ts`, `reports.service.ts`, `services.service.ts`, `staff.service.ts`, `storage.service.ts`, `subscriptions.service.ts`, `trainers.service.ts` და სხვ.

```typescript
// apps/api/src/common/prisma/prisma-tenant.extension.ts:122-127
export function scopeArgs(
  model: string,
  action: string,
  args: any,
  state: TenantState | undefined,
) {
  if (!state || state.allowCrossTenant) {
    return args; // <--- საფრთხე! თუ კონტექსტი არ არსებობს, მოთხოვნა გადის გაუფილტრავად!
  }
  if (!TENANT_SCOPED_MODELS.has(model)) {
    return args;
  }
  // ...
}
```

> [!WARNING]
> თუ რომელიმე სერვისის მეთოდი გამოიძახება ფონური ამოცანიდან (cron job, BullMQ queue, NestJS `@Cron()`), სადაც `tenantStorage.run()` არ არის გაშვებული, Prisma Extension-ი ვერ მიიღებს `state`-ს და დააბრუნებს მონაცემებს **მთელი ბაზიდან**, ყველა დარბაზის ჩათვლით!
> **რეკომენდაცია:** ფონურ ამოცანებში აუცილებლად გამოიყენებოდეს `tenantStorage.run({ gymId, ... }, () => ...)` ან სერვისებში მკაცრად დაინერგოს `TenantPrismaService`.

#### 1.3 `@AllowCrossTenant()` დეკორატორის გამოყენება

`@AllowCrossTenant()` გამოიყენება მხოლოდ იქ, სადაც ეს ბიზნეს-ლოგიკით დასაბუთებულია:

- `superadmin.service.ts`: პლატფორმის მფლობელის გლობალური მართვა.
- `auth.service.ts`: `resolveSessionScope`, `requestPasswordReset`, `loginWithGoogle`, `loginWithApple` — საწყისი იდენტიფიკაციისთვის, სანამ მომხმარებლის მიმდინარე დარბაზი დადგინდება.

---

### არეალი 2: Auth, Token & Email Flow

#### 2.1 Cross-Tenant Email Enumeration და გაჟონვა

- **[known] Issue 1 (`auth.service.ts:227`):** `register()` ეძებს გლობალურად `user.findUnique({ where: { email } })` და აბრუნებს `409 EMAIL_TAKEN`-ს. თავდამსხმელს შეუძლია დაადგინოს, რეგისტრირებულია თუ არა კონკრეტული ელფოსტა პლატფორმის ნებისმიერ დარბაზში.
- **[known] Issue 2 (`auth.service.ts:326`):** `signupMember()`-ში კომენტარი აღნიშნავს 409-ს, თუმცა T1.25 გადაწყვეტილებით უნდა მოხდეს არსებული `User`-ის დაკავშირება ახალ `GymCredential`-თან.
- **ახალი ხარვეზი: Social OAuth ობოლი მომხმარებლები (`auth.service.ts:1201-1330`):**

```typescript
// apps/api/src/auth/auth.service.ts:1201-1241
const user = await this.prisma.user.upsert({
  where: { googleId: profile.id },
  create: { email: profile.email, googleId: profile.id, ... },
  update: { ... }
});
// შემდგომ იძახებს resolveSessionScope-ს. თუ მომხმარებელს არ აქვს წევრობა ამ კონკრეტულ gym-ში:
// -> throw new ForbiddenException({ code: 'NOT_A_MEMBER' })
```

შედეგად, გლობალურ `User` ცხრილში რჩება ჩანაწერი, მაგრამ მომხმარებელი ვერ შედის სისტემაში და არ აქვს დარბაზის წევრობა.

#### 2.2 ელფოსტის ბმულები და ბრენდინგის იზოლაცია

- **CTA ბმულების გენერირება (`notification-channels.ts:163-168`):**

```typescript
// apps/api/src/notifications/notification-channels.ts:163-168
function toAbsoluteWebUrl(href: string): string {
  if (href.startsWith('http://') || href.startsWith('https://')) return href;
  const base = (env.WEB_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
  return `${base}${href.startsWith('/') ? href : `/${href}`}`;
}
```

`env.WEB_URL` არის გლობალური დომენი (მაგ. `https://app.formacore.io`). თუ წევრს ეგზავნება მეილი დაჭავშნის ან გადახდის შესახებ, ღილაკი გადაიყვანს `app.formacore.io`-ზე, სადაც მისი დარბაზის host-only სესიის ქუქი **არ არსებობს**. მომხმარებელს უწევს ხელახალი ლოგინი!
_სწორი იმპლემენტაცია:_ უნდა გამოიყენოს `buildMemberUrl(href, gym.slug)` (`common/console-url.ts`).

- **ელფოსტის გამომგზავნის სახელი (`email.service.ts:441, 472`):**

```typescript
// apps/api/src/auth/email.service.ts:441
const senderName = PLATFORM_NAME; // Hardcoded 'FormaCore'
```

დარბაზის წევრს ვერიფიკაციის ან პაროლის აღდგენის მეილი მოსდის FormaCore-ის სახელით და არა იმ სპორტული დარბაზის სახელით, სადაც ის დარეგისტრირდა.

---

### არეალი 3: Member & Staff Isolation (პროფილის დაბინძურება და ID Enumeration)

#### 3.1 კრიტიკული ხარვეზი: პროფილის ჯვარედინი მუტაცია (`me-profile.service.ts`)

```typescript
// apps/api/src/me/me-profile.service.ts:42, 62
async getMyProfile(userId: string) {
  const user = await this.prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, phone: true, avatarUrl: true, ... }
  });
  return user;
}

async updateMyProfile(userId: string, dto: UpdateProfileDto) {
  return this.prisma.user.update({
    where: { id: userId },
    data: { name: dto.name, phone: dto.phone, avatarUrl: dto.avatarUrl }
  });
}
```

**დარღვევა:** მომხმარებელი, რომელიც დარეგისტრირებულია ორ სხვადასხვა დარბაზში (მაგ. "Downtown Gym" და "Riverside Crossfit"), თუ Downtown-ის აპლიკაციაში შეცვლის თავის სახელს ან ტელეფონს, `User` ობიექტის განახლების გამო მონაცემები ავტომატურად შეეცვლება Riverside-ის წევრობაშიც!

#### 3.2 Staff-ის მხრიდან მომხმარებლის განახლება (`members.service.ts`)

```typescript
// apps/api/src/members/members.service.ts:553-556
await tx.user.update({
  where: { id: member.userId },
  data: {
    name: dto.name,
    phone: dto.phone,
  },
});
```

**დარღვევა:** Gym A-ს ადმინისტრატორს წევრის რედაქტირებისას შეუძლია შეცვალოს ამ ადამიანის გლობალური სახელი და ტელეფონი, რასაც მყისიერად დაინახავს Gym B-ს ადმინისტრატორიც. T1.25 არქიტექტურით, სახელი და ტელეფონი უნდა ინახებოდეს და იკითხებოდეს `GymCredential`-იდან ან `GymMember`-იდან.

#### 3.3 ID Enumeration-ის დაცვა

ჩატარდა შემოწმება `members.service.ts` და `staff.service.ts`-ის მეთოდებზე (`getMember`, `deleteMember`, `getStaff`, `deleteStaff`).
ყველა ეს მოთხოვნა გადის `prisma.gymMember.findUnique({ where: { id } })` ან `findFirst`-ზე. ვინაიდან `GymMember` გაწერილია `TENANT_SCOPED_MODELS`-ში, Prisma Tenant Extension-ი ავტომატურად უმატებს `gymId: currentTenant.gymId`-ს.
თუ Gym A-ს ადმინისტრატორი გადასცემს Gym B-ს წევრის ID-ს, ბაზა აბრუნებს `null`-ს, რასაც სერვისი პასუხობს `404 Not Found`-ით. აქ პირდაპირი cross-tenant გაჟონვა არ ხდება.

---

### არეალი 4: Cross-Tenant Data Leaks სხვა სერვისებში

#### 4.1 Notifications & Realtime Streams (SSE / WebSockets)

- **Activity Stream (`activity-stream.service.ts`):**
  - Redis PubSub არხები იყენებს მკაცრ პრეფიქსს: `gym:${gymId}:activity`.
  - SSE Controller-ი ამოწმებს `req.user.gymId`-ს. მოვლენების ჯვარედინი გაჟონვა გამორიცხულია.
- **Occupancy Stream (`occupancy-stream.service.ts`):**
  - არხები: `gym:${gymId}:occupancy`. იზოლაცია დაცულია.

#### 4.2 Reports & Analytics

- რეპორტების გენერირების ყველა მეთოდი (`reports.service.ts`, `dashboard-sales.service.ts`, `dashboard-revenue.service.ts`) აგრეგაციულ SQL მოთხოვნებში პირდაპირ იყენებს `where: { gymId }`-ს. მონაცემთა ჯვარედინი შერევა არ დაფიქსირდა.

#### 4.3 Media Storage (S3 / Local MinIO)

- `storage.service.ts`: ფაილის გასაღებები გენერირდება შაბლონით:
  `tenants/${gymId}/${entityType}/${entityId}/${uuid}.${ext}`
- `MediaOwnershipService`: ფაილის წაშლის ან წაკითხვისას მკაცრად ამოწმებს, ემთხვევა თუ არა S3 key-ში ჩაწერილი `gymId` ავტორიზებული მომხმარებლის დარბაზს.

#### 4.4 Rate Limiting & Cache (Redis)

- **დარღვევა (`rate-limit.guard.ts:70`):**

```typescript
const key = `rl:${options.name}:${clientIp}`;
```

გასაღები გლობალურია და დამოკიდებულია მხოლოდ კლიენტის IP-ზე. თუ ერთსა და იმავე საოფისე ქსელში ან პროვაიდერის NAT-ზე მყოფი მომხმარებლები სარგებლობენ სხვადასხვა დარბაზით, Gym A-ზე ვინმეს მიერ ლიმიტის გადაცილება გამოიწვევს Gym B-ს უდანაშაულო მომხმარებლების დაბლოკვასაც (`429 Too Many Requests`).

---

### არეალი 5: Web & Mobile Client Isolation

#### 5.1 Web Cookies & Routing (`apps/web/middleware.ts`, `session-cookies.ts`)

- პროდაქშენში (Vercel) `COOKIE_DOMAIN` გარემოს ცვლადის დაყენებისას ქუქის დომენად ეთითება `.formacore.io`.
- ეს იწვევს სერიოზულ პრობლემას: სესიის ქუქი ხელმისაწვდომი ხდება ყველა ქვედომენისთვის (`gym1.formacore.io`, `gym2.formacore.io`).
- როდესაც მომხმარებელი გახსნის სხვა დარბაზს, `middleware.ts`-ში მუშაობს `isTenantMismatch` ლოგიკა, რომელიც ასუფთავებს ქუქის. დომენური ქუქის გასუფთავება მომხმარებელს ავტომატურად ალოგაუთებს პირველი დარბაზის ტაბიდანაც!
- **გასწორება:** ქუქიები უნდა იყოს მკაცრად **Host-only** (`__Host-fc_session`, დომენის ატრიბუტის გარეშე).

#### 5.2 Mobile Client Context (`apps/mobile/lib/auth/session.ts`)

- მობილურ აპში `resolveGymSlug()` განსაზღვრავს დარბაზს: Deep Link -> Build Gym Slug -> Last Logged Gym -> `undefined`.
- მე-4 ვარიანტი (`undefined`) ეყრდნობოდა ძველ დაშვებას, რომ API მომხმარებლის ელფოსტით თავად იპოვიდა მთავარ დარბაზს. Per-gym credential მოდელში, სანამ `gymSlug` ცნობილი არ არის, შეუძლებელია სწორი ჰეშის შემოწმება. მობილურმა კლიენტმა შესვლამდე აუცილებლად უნდა მოსთხოვოს მომხმარებელს დარბაზის არჩევა.

---

## 4. Known Issues სტატუსი (Briefing-ის 1–5 ბაგები)

| #     | სტატუსი   | ფაილი : ხაზი                                   | აღწერა                                                                                                                                                        |
| :---- | :-------- | :--------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **1** | **known** | `apps/api/src/auth/auth.service.ts:227`        | `register()` ამოწმებს გლობალურ `user.findUnique`-ს და აბრუნებს 409 EMAIL_TAKEN-ს სხვა gym-ის მომხმარებელზეც, ნაცვლად `GymMember`/`GymCredential`-ის შექმნისა. |
| **2** | **known** | `apps/api/src/auth/auth.service.ts:326`        | `signupMember()`-ში ძველი კომენტარი უთითებს 409 EMAIL_TAKEN-ს, თუმცა რეალიზაცია უნდა ერგებოდეს T1.25 per-gym credentials-ს.                                   |
| **3** | **known** | `apps/api/src/members/members.service.ts:323`  | `createMember()` staff-ის მხრიდან აკავშირებს `User`-ს, მაგრამ არ ქმნის `GymCredential`-ს (`passwordHash: null`), რაც უზღუდავს წევრს პორტალზე შესვლას.         |
| **4** | **known** | `apps/api/src/staff/staff.service.ts:262, 510` | `createStaff()` გლობალური შემოწმებით აბრუნებს 409 EMAIL_IN_USE-ს, თუ პირი სხვა gym-ის თანამშრომელია.                                                          |
| **5** | **known** | `apps/api/src/auth/auth.service.ts:534`        | `registerGym()` ავლენს მფლობელის გლობალურ არსებობას 409-ით, ნაცვლად ახალი დარბაზის მიბმისა არსებულ იდენტობაზე.                                                |

---

## 5. შემდეგი ნაბიჯების პრიორიტეტიზაცია (Action Plan for Orchestrator)

### Phase P0: კრიტიკული მონაცემთა იზოლაცია (დაუყოვნებლივ)

1. **`me-profile.service.ts` refactoring:**
   - `getMyProfile` და `updateMyProfile`-ში სახელისა და ტელეფონის წაკითხვა/განახლება გადავიდეს მიმდინარე `gymId`-ის `GymCredential`-ზე (ან `GymMember`-ზე).
2. **`members.service.ts` staff update refactoring:**
   - `updateMember`-ში ამოიშალოს `tx.user.update`. Staff-ის მიერ სახელის რედაქტირება შემოიფარგლოს მხოლოდ მიმდინარე დარბაზის ჩანაწერით.
3. **`AgentChatSession` მოდელის დამატება:**
   - `prisma-tenant.extension.ts`-ში `TENANT_SCOPED_MODELS`-ს დაემატოს `'AgentChatSession'`.

### Phase P1: სესიებისა და შეტყობინებების იზოლაცია (მაღალი პრიორიტეტი)

1. **ნოტიფიკაციების CTA ბმულების გასწორება:**
   - `notification-channels.ts`-ში `toAbsoluteWebUrl`-ს ჩაენაცვლოს `buildMemberUrl(href, gym.slug)`.
2. **ელფოსტის გამომგზავნის ბრენდინგი:**
   - `email.service.ts`-ში `senderName`-ში ჩაისვას შესაბამისი დარბაზის სახელი.
3. **Web Host-only Cookies უზრუნველყოფა:**
   - `session-cookies.ts`-ში წაიშალოს root-domain fallback Vercel-ისთვის, რათა არ მოხდეს ქვედომენებს შორის ქუქიების გაჟონვა და mismatch-ისას მეორე დარბაზიდან ამოგდება.
4. **OAuth Onboarding გაუმჯობესება:**
   - Social login-ისას უზრუნველყოფილი იქნას ავტომატური credential + membership შექმნა მიმდინარე დარბაზისთვის.

### Phase P2: ინფრასტრუქტურული იზოლაცია (საშუალო პრიორიტეტი)

1. **Rate Limiting Key-ს განახლება:**
   - `rate-limit.guard.ts`-ში გასაღები გახდეს `rl:${name}:${gymId ?? 'global'}:${ip}`.
2. **Mobile Slug Selection Flow:**
   - მობილურ აპში გამოირიცხოს `undefined` fallback; მომხმარებელს პაროლის შეყვანამდე შეერჩიოს დარბაზი.
3. **Background Jobs & Crons Tenant Context:**
   - შემოწმდეს და დაიფაროს ყველა cron/worker `tenantStorage.run()` გარსით.
