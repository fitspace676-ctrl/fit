# Multi-branch deploy runbook (PR #327)

PR #327-ის (`feat/multi-branch-location-filter`) production-ზე გაშვების, შემოწმების
და უკან დაბრუნების ინსტრუქცია ოპერატორისთვის. ზოგადი deploy/rollback კონვენცია
აღწერილია [`ROLLBACK.md`](../../ROLLBACK.md)-ში; ეს დოკუმენტი მხოლოდ ამ release-ის
სპეციფიკას ამატებს.

> **მოკლედ:** merge-ამდე ხელით `pg_dump` (CI snapshot prod-ზე არ ეშვება — §6.1).
> merge-ის შემდეგ Railway API container-ის startup-ზე 8 migration გაედება (წამები —
> prod-ის ცხრილები პატარაა). შემდეგ §4-ის SQL, smoke და stock-take. `downtown`-ზე
> default ფილიალი **Rustaveli Branch** გახდება, თუმცა მისი რეალური data **Main
> Floor**-ზეა — ეს merge-ამდე უნდა გადაწყდეს (§2.3).

ქვემოთ prod-ის ყველა ციფრი read-only query-ებიდანაა, 2026-09-15, migration-ამდე.

---

## 1. Migration-ების რიგი

### 1.1 რა არის prod-ზე

`prisma migrate status` prod-ის წინააღმდეგ (2026-09-15) — **8 pending**:

| #   | migration                                          | წყარო                  |
| --- | -------------------------------------------------- | ---------------------- |
| 1   | `20260830120000_location_default_branch_backfill`  | #327                   |
| 2   | `20260830130000_gym_member_home_branch`            | #327                   |
| 3   | `20260831120000_check_in_location_branch`          | #327                   |
| 4   | `20260831130000_product_stock_per_branch`          | #327                   |
| 5   | `20260831140000_money_location_branch`             | #327                   |
| 6   | `20260901120000_people_scheduling_location_branch` | #327                   |
| 7   | `20260901130000_catalogue_location_exclusivity`    | #327                   |
| 8   | `20260909195523_home_banners`                      | #327 (main-ზე არ არის) |

main-იდან მოსული `20260831120000_payment_method_bank_transfer`,
`20260902160000_service_schedule_removed`, `20260902180000_service_categories` და
`20260913180000_refresh_token_gym` prod-ზე **უკვე applied-ია**, და მათი checksum-ები
local ფაილებს ემთხვევა (შემოწმებულია) — თავიდან არ გაედება.

**Out-of-order:** pending migration-ებს applied `20260913180000`-ზე ძველი timestamp
აქვთ. `prisma migrate deploy` ამას არ ბლოკავს — ყველა unapplied-ს სახელის რიგით
გაედებ. `_prisma_migrations`-ში failed/unfinished ჩანაწერი 0-ია (P3009-ის რისკი არ
არის).

### 1.2 თითო migration

**Lock და ხანგრძლივობა.** prod-ზე ყველა შეხებული ცხრილი 400 kB-ზე ნაკლებია
(`refresh_tokens` 121 row, `class_instances` 170, `gym_members` 74, დანარჩენი 50-ზე
ნაკლები), ასე რომ 8-ვე migration ერთად წამებს სჭირდება. `CONCURRENTLY` არსად არ
არის. `ALTER TABLE` / `ADD CONSTRAINT` `ACCESS EXCLUSIVE` lock-ს იღებს, მაგრამ ამ
ზომაზე — მილიწამებით.

| #   | რას აკეთებს                                                                                                                             | backfill-ის წყარო                                                                                                                                                                 | re-runnable                                                       | rollback |
| --- | --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | -------- |
| 1   | `locations.isDefault` + partial unique `locations_gymId_default_key`; ფილიალის არმქონე gym-ს `Main` ფილიალი; composite index-ები        | default = ყველაზე ძველი ACTIVE ფილიალი; `class_templates` / `class_instances` / `orders` / `leads`-ის NULL → default                                                              | data — კი (`NOT EXISTS` / `IS NULL`); DDL — არა (guard-ის გარეშე) | R1       |
| 2   | `gym_members.locationId` + FK (SET NULL) + index                                                                                        | ყველა membership (staff-ი და trashed-ი ჩათვლით) → default                                                                                                                         | data — კი; DDL — არა                                              | R2       |
| 3   | FK + index უკვე არსებული `check_ins.locationId`-ზე                                                                                      | missing / cross-gym id → NULL, NULL → default                                                                                                                                     | კი                                                                | R3       |
| 4   | ახალი `product_stock`; `stock_movements.locationId`; `stock_movements.orderId` FK                                                       | მთელი `products.stock` / variants → **default ფილიალი**, სხვა ფილიალებს row არ ეძლევა; movement → order-ის ფილიალი, თორემ default                                                 | კი (`IF NOT EXISTS`, `ON CONFLICT`)                               | R4       |
| 5   | `payments` / `refunds` / `invoices.locationId` + FK + index                                                                             | payment, refund ← order; invoice ← member-ის home branch; default-ზე fallback **არ არის**                                                                                         | data — კი; DDL — არა                                              | R5       |
| 6   | ახალი `location_staff`; `pt_sessions` / `service_sessions` / `shift_slots.locationId`; trainers-ის index swap                           | `assignedLocationIds` → `location_staff`; ფილიალის არმქონე live staff → default; PT/service session → default; `shift_slots` — მხოლოდ ტექსტის ზუსტი ემთხვევით, **default-ზე არა** | კი                                                                | R6       |
| 7   | 6 exclusivity სვეტი (`subscription_plans`, `package_plans`, `products`, `class_types`, `promo_codes`, `loyalty_rewards`) + 4 index swap | **backfill არ არის** — NULL = ყველა ფილიალი                                                                                                                                       | კი                                                                | R7       |
| 8   | ახალი `banners` ცხრილი                                                                                                                  | —                                                                                                                                                                                 | არა                                                               | R8       |

**Forward-compatibility** (ძველი API ახალ schema-ზე, deploy-ის ფანჯარაში): ყველა ახალი
სვეტი nullable-ია, `assignedLocationIds` არ იშლება, წაშლილი index-ები მხოლოდ prefix-ებია.
ერთადერთი რეალური ნაკლი: ფანჯარაში ძველი API-ს POS sale `products.stock`-ს აკლებს,
`product_stock`-ს — არა. ეს §4.3-ის drift query-ში გამოჩნდება.

---

## 2. Prod-ის data-ზე გავლენა

### 2.1 Gym-ები და ფილიალები

| gym         | ფილიალები (ACTIVE) | products (tracked) | base units | members | check-ins | orders |
| ----------- | -----------------: | -----------------: | ---------: | ------: | --------: | -----: |
| `downtown`  |              4 (3) |             12 (4) |       1555 |      54 |         9 |     32 |
| `demo`      |                  0 |                  0 |          0 |       1 |         0 |      0 |
| `riverside` |                  0 |                  0 |          0 |       1 |         0 |      0 |
| `tornike`   |                  0 |                  0 |          0 |       0 |         0 |      0 |

- 2+ ფილიალი მხოლოდ **`downtown`**-ს აქვს — ერთადერთი gym, სადაც stock-take საჭიროა.
- `demo`, `riverside`, `tornike`-ს ფილიალი არ აქვთ → migration 1 თითოეულს `Main`-ს
  შექმნის (3 ახალი `locations` row).
- `product_stock` და `location_staff` prod-ზე ჯერ **არ არსებობენ**.

### 2.2 NULL `locationId` (migration-ამდე) და მოსალოდნელი backfill

| ცხრილი                             | rows | NULL / სვეტი                 | migration-ის შემდეგ                          |
| ---------------------------------- | ---: | ---------------------------- | -------------------------------------------- |
| `class_templates`                  |   15 | 2                            | 2 → default                                  |
| `class_instances`                  |  170 | 170                          | 170 → default                                |
| `orders`                           |   32 | 25                           | 25 → default (7 უკვე Main Floor-ზეა)         |
| `leads`                            |    1 | 0                            | —                                            |
| `check_ins`                        |    9 | 0 (5 Main Floor, 4 Studio A) | repair 0, backfill 0                         |
| `gym_members`                      |   74 | სვეტი არ არის                | 74 → თითოეული gym-ის default                 |
| `payments`                         |   31 | სვეტი არ არის                | 31 ← order                                   |
| `refunds`                          |    0 | სვეტი არ არის                | —                                            |
| `invoices`                         |   10 | სვეტი არ არის                | 10 ← member                                  |
| `stock_movements`                  |    4 | სვეტი არ არის                | ← order ან default; bad `orderId` 0          |
| `pt_sessions` / `service_sessions` |  2/1 | სვეტი არ არის                | → default                                    |
| `shift_slots`                      |   43 | ტექსტური `location` 0        | **43-ვე NULL რჩება** (default-ზე არ იწერება) |
| `products` (tracked)               |    4 | —                            | 4 `product_stock` row, 1555 unit → default   |

**Staff.** `downtown`: OWNER 1, MANAGER 3, RECEPTIONIST 1, TRAINER 9. სამს explicit
`assignedLocationIds` = **Main Floor** (MANAGER ×2, RECEPTIONIST). დანარჩენ 11-ს
(OWNER, MANAGER, 9 TRAINER) migration 6 default ფილიალზე roster-ში ჩასვამს, და deploy-ის
log-ში WARNING გამოჩნდება. `riverside`-ის TRAINER-ი და `tornike` / `demo`-ს OWNER-ები
თავიანთ `Main`-ზე მოხვდებიან.

### 2.3 ⚠️ Checkpoint: `downtown`-ის default ფილიალი

Election-ის წესი: ყველაზე ძველი ACTIVE ფილიალი. `downtown`-ზე:

| ფილიალი          | status   | createdAt  | default? |
| ---------------- | -------- | ---------- | -------- |
| Rustaveli Branch | ACTIVE   | 2026-06-23 | **კი**   |
| Main Floor       | ACTIVE   | 2026-07-02 | არა      |
| Studio A         | ACTIVE   | 2026-07-02 | არა      |
| Tbilisi          | INACTIVE | 2026-08-19 | არა      |

მაგრამ `downtown`-ის რეალური attribution-ები Main Floor-ზე და Studio A-ზეა (7 order,
9 check-in, 3 explicit staff, 9 class template). Deploy-ის შემდეგ Rustaveli Branch-ზე
აღმოჩნდება: 25 order და მათი payment-ები, 170 class instance, ყველა member, 1555 stock
unit და 11 თანამშრომლის roster.

`/locations`-ზე «make default» (`POST /admin/locations/:id/make-default`) deploy-ის
შემდეგ flag-ს გადაიტანს, **მაგრამ backfill-ით ჩაწერილ row-ებს არ გადაიტანს**, და
migration-ის შემდეგ backfilled row-ები Rustaveli-ს ორიგინალური row-ებისგან (მაგ. 4
class template) აღარ გამოირჩევიან. ამიტომ merge-ამდე ერთ-ერთი:

- **(a)** მიიღეთ, როგორცაა — deploy-ის შემდეგ stock-take და roster review (§3).
- **(b)** merge-ამდე შეცვალეთ migration 1-ის election `downtown`-ის Main Floor-ზე
  (კოდის ცვლილება — ამ runbook-ის scope-ის გარეთაა).

---

## 3. Stock-take პროცედურა

**ვინ:** gym-ის OWNER ან MANAGER (`inventoryAdjust` permission; ორივე role default-ზე
`branchScope: 'all'`-ია). prod-ზე საჭიროა მხოლოდ **`downtown`**-ზე — 4 tracked product,
ყველა variant-ის გარეშე: Coca Cola 500, ბაკურიანის წყალი 500, ენერჯი დრინქი 500,
ზურგჩანთა 55.

**როდის:** deploy-ის შემდეგ, Main Floor-ზე და Studio A-ზე **პირველ გაყიდვამდე** (ან
default-ის გარდა ყველა ფილიალზე, თუ §2.3-ზე (b) აირჩიეთ).

**რა ხდება, სანამ stock-take არ გაკეთდა:**

- non-default ფილიალზე POS sale **სრულდება**, მაგრამ stock **არ იკლებს** და movement
  არ იწერება (`claimBranchBase` აბრუნებს `null`-ს —
  `apps/api/src/products/order-stock.ts:208`). roll-up `products.stock`-იც უცვლელი
  რჩება, ასე რომ gym-wide ციფრი გადაჭარბებულია;
- non-default ფილიალის inventory / low-stock გვერდები 0-ს ან «out»-ს აჩვენებენ;
- default ფილიალი მთელ 1555 unit-ს აჩვენებს.

Refund non-default ფილიალზე `upsert`-ს აკეთებს — დაბრუნებული unit-ებით row-ს შექმნის.

**UI:**

1. Admin → **Shop → Inventory** (`/shop/inventory`).
2. Header-ის ფილიალის switcher-ზე ფილიალი აირჩიეთ (adjust ფილიალს ყოველთვის
   მოითხოვს — `adjustStockSchema.locationId` სავალდებულოა).
3. თითო position → **Adjust** → reason **Recount** → დათვლილი რაოდენობა.
4. **Rustaveli Branch-ზეც** recount-ით 500/500/500/55-ს რეალურ ციფრზე ჩამოიყვანეთ,
   თორემ gym-wide total ორმაგად ჩაითვლება.
5. ალტერნატივა: პროდუქტის გვერდის stock panel (`/shop/[id]`) ან `/shop/low-stock`.

API: `POST /admin/products/:id/stock`, body `{ locationId, reason: 'RECOUNT', setTo }`.

**Roster review (იმავე დღეს):** RECEPTIONIST-ს და TRAINER-ს default-ზე
`branchScope: 'assigned'` აქვთ. Deploy-ის შემდეგ `downtown`-ის 9 TRAINER-ი მხოლოდ
default ფილიალზე იქნება roster-ში, და Main Floor / Studio A-ზე `403 BRANCH_FORBIDDEN`
მიიღებს; RECEPTIONIST-ი — მხოლოდ Main Floor-ზე. თანამშრომლების ფილიალები admin →
Staff-ზე გადაანაწილეთ. `shift_slots`-ის 43 row ფილიალის გარეშე რჩება — rota-ში
ფილიალი ხელით მიუთითეთ.

---

## 4. Backfill-ის შემოწმება deploy-ის შემდეგ

ყველა query read-only-ია. გაშვება:

```bash
railway run --service "Pod Database" -- sh -c \
  'psql "$DATABASE_PUBLIC_URL" -X -A -f verify.sql'
```

### 4.1 Migration-ები

```sql
-- 8 row, ყველა finished_at-ით
SELECT migration_name, finished_at
FROM _prisma_migrations
WHERE migration_name IN (
  '20260830120000_location_default_branch_backfill',
  '20260830130000_gym_member_home_branch',
  '20260831120000_check_in_location_branch',
  '20260831130000_product_stock_per_branch',
  '20260831140000_money_location_branch',
  '20260901120000_people_scheduling_location_branch',
  '20260901130000_catalogue_location_exclusivity',
  '20260909195523_home_banners'
)
ORDER BY migration_name;

-- მოსალოდნელი: 0
SELECT count(*) FROM _prisma_migrations
WHERE finished_at IS NULL AND rolled_back_at IS NULL;
```

### 4.2 Default ფილიალი

```sql
-- თითო gym-ს ზუსტად ერთი default; მოსალოდნელი: 0 row
SELECT g.slug, count(l.id) FILTER (WHERE l."isDefault") AS defaults
FROM gyms g LEFT JOIN locations l ON l."gymId" = g.id
GROUP BY g.slug
HAVING count(l.id) FILTER (WHERE l."isDefault") <> 1;

-- ვინ გახდა default; მოსალოდნელი: downtown → Rustaveli Branch, demo/riverside/tornike → Main
SELECT g.slug, l.name, l.status
FROM locations l JOIN gyms g ON g.id = l."gymId"
WHERE l."isDefault"
ORDER BY g.slug;
```

### 4.3 NULL-ები, drift, cross-tenant

```sql
-- backfill-ის ცხრილები; მოსალოდნელი: ყველა 0 (deploy-ის ფანჯარაში ჩაწერილი row-ები → §4.4)
SELECT 'class_templates' t, count(*) FROM class_templates  WHERE "locationId" IS NULL UNION ALL
SELECT 'class_instances',   count(*) FROM class_instances  WHERE "locationId" IS NULL UNION ALL
SELECT 'orders',            count(*) FROM orders           WHERE "locationId" IS NULL UNION ALL
SELECT 'leads',             count(*) FROM leads            WHERE "locationId" IS NULL UNION ALL
SELECT 'gym_members',       count(*) FROM gym_members      WHERE "locationId" IS NULL UNION ALL
SELECT 'check_ins',         count(*) FROM check_ins        WHERE "locationId" IS NULL UNION ALL
SELECT 'stock_movements',   count(*) FROM stock_movements  WHERE "locationId" IS NULL UNION ALL
SELECT 'pt_sessions',       count(*) FROM pt_sessions      WHERE "locationId" IS NULL UNION ALL
SELECT 'service_sessions',  count(*) FROM service_sessions WHERE "locationId" IS NULL;

-- «permanent null» ცხრილები: ახლა მოსალოდნელი 0. მომავალში non-zero = order-ი ან
-- member-ი ფილიალის გარეშე (მაგ. retired ფილიალი, purged member-ის invoice) — ბაგი არ არის.
SELECT 'payments' t, count(*) FROM payments WHERE "locationId" IS NULL UNION ALL
SELECT 'refunds',    count(*) FROM refunds  WHERE "locationId" IS NULL UNION ALL
SELECT 'invoices',   count(*) FROM invoices WHERE "locationId" IS NULL;

-- default-ზე განზრახ არ backfill-დება (ინფორმაციული): მოსალოდნელი 43 / 0.
-- Exclusivity სვეტები (products, subscription_plans, ...) — ყველა row NULL = ყველა ფილიალი.
SELECT count(*) FILTER (WHERE "locationId" IS NULL)  AS branchless,
       count(*) FILTER (WHERE location IS NOT NULL) AS unresolved_text
FROM shift_slots;

-- product_stock-ის roll-up drift (schema.prisma, Product.stock); მოსალოდნელი: 0 row
SELECT p.id, p.name, p.stock, SUM(s.stock) AS branches
FROM products p LEFT JOIN product_stock s ON s."productId" = p.id
GROUP BY p.id, p.name, p.stock
HAVING p.stock IS DISTINCT FROM SUM(s.stock);

-- stock-ის განლაგება; მოსალოდნელი: downtown / Rustaveli Branch — 4 line, 1555 unit
SELECT g.slug, l.name, count(*) AS lines, sum(s.stock) AS units
FROM product_stock s
JOIN locations l ON l.id = s."locationId"
JOIN gyms g ON g.id = s."gymId"
GROUP BY g.slug, l.name
ORDER BY 1, 2;

-- cross-tenant: row-ის gymId ≠ მისი ფილიალის gymId; მოსალოდნელი: ყველა 0
SELECT 'check_ins' t, count(*) FROM check_ins x       JOIN locations l ON l.id = x."locationId" WHERE l."gymId" <> x."gymId" UNION ALL
SELECT 'orders',      count(*) FROM orders x          JOIN locations l ON l.id = x."locationId" WHERE l."gymId" <> x."gymId" UNION ALL
SELECT 'gym_members', count(*) FROM gym_members x     JOIN locations l ON l.id = x."locationId" WHERE l."gymId" <> x."gymId" UNION ALL
SELECT 'class_templates', count(*) FROM class_templates x JOIN locations l ON l.id = x."locationId" WHERE l."gymId" <> x."gymId" UNION ALL
SELECT 'class_instances', count(*) FROM class_instances x JOIN locations l ON l.id = x."locationId" WHERE l."gymId" <> x."gymId" UNION ALL
SELECT 'payments',    count(*) FROM payments x        JOIN locations l ON l.id = x."locationId" WHERE l."gymId" <> x."gymId" UNION ALL
SELECT 'refunds',     count(*) FROM refunds x         JOIN locations l ON l.id = x."locationId" WHERE l."gymId" <> x."gymId" UNION ALL
SELECT 'invoices',    count(*) FROM invoices x        JOIN locations l ON l.id = x."locationId" WHERE l."gymId" <> x."gymId" UNION ALL
SELECT 'product_stock',   count(*) FROM product_stock x   JOIN locations l ON l.id = x."locationId" WHERE l."gymId" <> x."gymId" UNION ALL
SELECT 'stock_movements', count(*) FROM stock_movements x JOIN locations l ON l.id = x."locationId" WHERE l."gymId" <> x."gymId" UNION ALL
SELECT 'location_staff',  count(*) FROM location_staff x  JOIN locations l ON l.id = x."locationId" WHERE l."gymId" <> x."gymId" UNION ALL
SELECT 'pt_sessions', count(*) FROM pt_sessions x     JOIN locations l ON l.id = x."locationId" WHERE l."gymId" <> x."gymId" UNION ALL
SELECT 'service_sessions', count(*) FROM service_sessions x JOIN locations l ON l.id = x."locationId" WHERE l."gymId" <> x."gymId" UNION ALL
SELECT 'shift_slots', count(*) FROM shift_slots x     JOIN locations l ON l.id = x."locationId" WHERE l."gymId" <> x."gymId";

-- live staff roster-ის გარეშე; მოსალოდნელი: 0
SELECT count(*) FROM gym_members m
WHERE m.role <> 'MEMBER' AND m."deletedAt" IS NULL
  AND NOT EXISTS (SELECT 1 FROM location_staff ls WHERE ls."staffId" = m.id);
```

### 4.4 თუ deploy-ის ფანჯარაში NULL-ები გაჩნდნენ

ძველი API migration-იდან new container-ის health-ამდე `locationId`-ს არ წერს.
Migration-ის backfill `UPDATE`-ები idempotent-ია (`IS NULL` guard), ასე რომ მათ ხელახლა
გაშვება უსაფრთხოა. **ეს write-ია — gym owner-ის ნებართვით:**

```sql
BEGIN;
UPDATE check_ins c       SET "locationId" = d.id FROM locations d WHERE d."gymId" = c."gymId" AND d."isDefault" AND c."locationId" IS NULL;
UPDATE gym_members m     SET "locationId" = d.id FROM locations d WHERE d."gymId" = m."gymId" AND d."isDefault" AND m."locationId" IS NULL;
UPDATE orders o          SET "locationId" = d.id FROM locations d WHERE d."gymId" = o."gymId" AND d."isDefault" AND o."locationId" IS NULL;
UPDATE class_instances i SET "locationId" = d.id FROM locations d WHERE d."gymId" = i."gymId" AND d."isDefault" AND i."locationId" IS NULL;
UPDATE payments p SET "locationId" = o."locationId" FROM orders o
 WHERE o.id = p."orderId" AND o."gymId" = p."gymId" AND o."locationId" IS NOT NULL AND p."locationId" IS NULL;
UPDATE invoices i SET "locationId" = m."locationId" FROM gym_members m
 WHERE m.id = i."memberId" AND m."gymId" = i."gymId" AND m."locationId" IS NOT NULL AND i."locationId" IS NULL;
COMMIT;
```

ფანჯარაში ძველი API-ს sale-ებიდან გამოსული stock drift SQL-ით **არ** ისწორდება —
default ფილიალზე §3-ის recount-ი ორივე ციფრს ერთად გაასწორებს.

---

## 5. Rollback

### 5.1 რომელი გზა

`ROLLBACK.md` §2-ის მიხედვით — ყოველთვის ყველაზე ვიწრო:

| სიმპტომი                           | ქმედება                                                                                                    |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Admin/web UI broken, API და DB ok  | Vercel promote (`ROLLBACK.md` §3)                                                                          |
| API error, schema ok               | Railway redeploy წინა deployment-ზე (`ROLLBACK.md` §4). Schema ახალი რჩება — ძველი API მასზე მუშავს (§1.2) |
| Migration-ის შემდეგ data არასწორია | §5.2-ის down SQL, **ან** §6.1-ის dump-ის restore (`ROLLBACK.md` §5)                                        |

Restore deploy-ის შემდეგ ჩაწერილ **ყველა** data-ს კარგავს; down SQL — მხოლოდ
multi-branch ინფორმაციას. prod-ის ამჟამინდელი API deployment:
`daaac6f5-4308-4e8a-8280-cbeaceae62a9` (commit `0a4d3ac9`) — merge-ის დღეს
`railway deployment list --service api --json`-ით გადაამოწმეთ.

**თუ migration startup-ზე fail-და:** `startCommand` = `migrate deploy && node …`,
ასე რომ container არ ჩაირთვება, healthcheck fail-დება, და Railway traffic-ს ძველ
deployment-ზე ტოვებს. `_prisma_migrations`-ში failed row დარჩება, და ყოველი შემდეგი
deploy P3009-ზე შეჩერდება. Failed ფაილი შეიძლება ნაწილობრივ applied იყოს:

- migration 3, 4, 6, 7 re-runnable-ია — გასწორეთ მიზეზი, მერე
  `prisma migrate resolve --rolled-back <name>` და redeploy;
- migration 1, 2, 5, 8-ზე `ADD COLUMN` / `CREATE INDEX` / `CREATE TABLE` guard-ის
  გარეშეა — resolve-ამდე ხელით წაშალეთ, რაც უკვე შეიქმნა (§5.2-ის შესაბამისი block).

### 5.2 Down SQL (reverse რიგით)

**Write-ია.** მანამდე API-ს წინა deployment-ზე დაბრუნეთ (ახალი კოდს ეს სვეტები
სჭირდება). ერთ transaction-ში. `DROP COLUMN` შესაბამის FK-ებსა და index-ებს თავად
წაშლს.

```sql
BEGIN;

-- R8 home_banners. იკარგება: banner-ები.
DROP TABLE IF EXISTS banners;

-- R7 catalogue exclusivity. იკარგება: ფილიალზე exclusive plan/package/product/class type/promo/reward.
CREATE INDEX IF NOT EXISTS "subscription_plans_gymId_idx" ON subscription_plans("gymId");
CREATE INDEX IF NOT EXISTS "package_plans_gymId_idx"      ON package_plans("gymId");
CREATE INDEX IF NOT EXISTS "products_gymId_idx"           ON products("gymId");
CREATE INDEX IF NOT EXISTS "class_types_gymId_idx"        ON class_types("gymId");
ALTER TABLE subscription_plans DROP COLUMN IF EXISTS "locationId";
ALTER TABLE package_plans      DROP COLUMN IF EXISTS "locationId";
ALTER TABLE products           DROP COLUMN IF EXISTS "locationId";
ALTER TABLE class_types        DROP COLUMN IF EXISTS "locationId";
ALTER TABLE promo_codes        DROP COLUMN IF EXISTS "locationId";
ALTER TABLE loyalty_rewards    DROP COLUMN IF EXISTS "locationId";

-- R6 people & scheduling. იკარგება: location_staff (deploy-ის შემდეგ roster-ის ცვლილებები),
-- PT/service session-ის ფილიალი. shift_slots-ის ფილიალი ტექსტზე ბრუნდება.
UPDATE shift_slots s SET location = l.name
FROM locations l WHERE l.id = s."locationId" AND s.location IS NULL;
DROP TABLE IF EXISTS location_staff;
ALTER TABLE shift_slots      DROP COLUMN IF EXISTS "locationId";
ALTER TABLE service_sessions DROP COLUMN IF EXISTS "locationId";
ALTER TABLE pt_sessions      DROP COLUMN IF EXISTS "locationId";
CREATE INDEX IF NOT EXISTS "trainers_gymId_idx" ON trainers("gymId");
DROP INDEX IF EXISTS "trainers_gymId_status_name_idx";

-- R5 money. იკარგება: payment/refund/invoice-ის frozen ფილიალი (order-იდან/member-იდან derivable).
ALTER TABLE payments DROP COLUMN IF EXISTS "locationId";
ALTER TABLE refunds  DROP COLUMN IF EXISTS "locationId";
ALTER TABLE invoices DROP COLUMN IF EXISTS "locationId";

-- R4 product_stock. იკარგება: per-branch counts (recount-ები). products.stock roll-up-ია და
-- gym-wide total-ად რჩება; non-default ფილიალზე sale-ები, რომ stock-ს არ აკლდნენ, ჭარბად დარჩებიან.
DROP TABLE IF EXISTS product_stock;
ALTER TABLE stock_movements DROP CONSTRAINT IF EXISTS "stock_movements_orderId_fkey";
ALTER TABLE stock_movements DROP COLUMN IF EXISTS "locationId";

-- R3 check_in. სვეტი migration-ამდე არსებობდა და რჩება; მხოლოდ FK და index.
ALTER TABLE check_ins DROP CONSTRAINT IF EXISTS "check_ins_locationId_fkey";
DROP INDEX IF EXISTS "check_ins_gymId_locationId_checkedInAt_idx";

-- R2 gym_member home branch. იკარგება: member-ის home branch.
ALTER TABLE gym_members DROP COLUMN IF EXISTS "locationId";

-- R1 default branch. orders / class_* / leads-ის backfilled locationId რჩება —
-- ძველი კოდი ამას იტანს, და backfilled row-ები ორიგინალებსგან არ გამოირჩევიან.
DROP INDEX IF EXISTS "class_templates_gymId_locationId_idx";
DROP INDEX IF EXISTS "class_instances_gymId_locationId_startsAt_idx";
DROP INDEX IF EXISTS "orders_gymId_locationId_createdAt_idx";
DROP INDEX IF EXISTS "orders_gymId_locationId_status_idx";
DROP INDEX IF EXISTS "leads_gymId_locationId_status_idx";
CREATE INDEX IF NOT EXISTS "class_templates_locationId_idx" ON class_templates("locationId");
ALTER TABLE locations DROP COLUMN IF EXISTS "isDefault";
-- არჩევითი: migration-ის შექმნილი `Main` ფილიალები (demo/riverside/tornike), მხოლოდ თუ არაფერი ბმია:
-- DELETE FROM locations l USING gyms g
-- WHERE g.id = l."gymId" AND g.slug IN ('demo', 'riverside', 'tornike')
--   AND l.name = 'Main' AND l.address = ''
--   AND NOT EXISTS (SELECT 1 FROM orders o          WHERE o."locationId" = l.id)
--   AND NOT EXISTS (SELECT 1 FROM class_templates t WHERE t."locationId" = l.id)
--   AND NOT EXISTS (SELECT 1 FROM class_instances i WHERE i."locationId" = l.id)
--   AND NOT EXISTS (SELECT 1 FROM check_ins c       WHERE c."locationId" = l.id);

-- Prisma-ს ჩანაწერები, რომ ხელახლა deploy-ზე migration-ები ისევ გაედეს.
DELETE FROM _prisma_migrations WHERE migration_name IN (
  '20260830120000_location_default_branch_backfill',
  '20260830130000_gym_member_home_branch',
  '20260831120000_check_in_location_branch',
  '20260831130000_product_stock_per_branch',
  '20260831140000_money_location_branch',
  '20260901120000_people_scheduling_location_branch',
  '20260901130000_catalogue_location_exclusivity',
  '20260909195523_home_banners'
);

COMMIT;
```

`stock_movements.orderId`-ის repair (prod-ზე 0 row) უკან არ ბრუნდება.

Down SQL-ის შემდეგ: API — **ძველი** deployment (`railway redeploy <id>`), Vercel —
ძველი admin/web promote, და `pnpm db:status` 8 pending-ს უნდა აჩვენს.

---

## 6. Deploy-ის თანმიმდევრობა

### 6.1 Merge-ამდე

1. §2.3-ის checkpoint გადაწყვეტილია.
2. **ხელით snapshot.** `.github/workflows/deploy.yml` prod-ზე **skip-დება**: ბოლო
   run-ებზე (მაგ. `34946261200`, 2026-09-15) guard-ი success-ია, და snapshot / migrate /
   deploy job-ები skipped — deploy secrets არ არის. ანუ CI snapshot არ ხდება. prod
   Postgres 18.6-ია, local `pg_dump` 17.9 — ძველი client 18-ის server-ს არ დამპს:

   ```bash
   brew install postgresql@18
   railway run --service "Pod Database" -- sh -c \
     '/opt/homebrew/opt/postgresql@18/bin/pg_dump "$DATABASE_PUBLIC_URL" -Fc -f fit-pre-327.dump'
   ls -lh fit-pre-327.dump   # repo-ს გარეთ შეინახეთ
   ```

3. Pending-ის სია ისევ 8-ია:

   ```bash
   railway run --service "Pod Database" -- sh -c \
     'cd packages/db && DATABASE_URL="$DATABASE_PUBLIC_URL" pnpm exec prisma migrate status'
   ```

4. დრო: gym-ის ყველაზე ნაკლები დატვირტვის საათებში — ფანჯარაში POS sale stock drift-ს
   იწვევს (§1.2).

### 6.2 Merge და deploy

1. PR #327 → `main`.
2. **Railway GitHub auto-deploy** (`api` service, branch `main`). Build:
   `prisma generate`; start (`railway.json`):
   `prisma migrate deploy && node … src/main.ts` — **migration-ები container-ის
   startup-ზე გაედება**. Healthcheck `/health`, timeout 300 s; წარმატემამდე traffic
   ძველ deployment-ზე რჩება.
3. Vercel-ის apps (admin/web/platform/superadmin) Git integration-ით ცალკე
   deploy-დებიან. Admin API-ზე ადრე შეიძლება live გახდეს; ამ წუთებზე ფილიალის ფილტრი
   ძველ API-ზე არ იმუშავს — ეს მოსალოდნელია.
4. Deploy-ის log-ში (`railway logs --service api --lines 400 --json <deploymentId>`)
   მოსალოდნელია:
   - `STOCK-TAKE REQUIRED — gym "…"` (downtown-ის სახელით);
   - `location_staff: gym downtown has 11 employee(s) rostered onto "Rustaveli Branch" only …`.

   `check_ins` / `stock_movements` repair-ის NOTICE-ები **არ** უნდა ჩანდნენ.

### 6.3 Smoke (downtown, OWNER-ის login)

1. `curl -fsS "$PROD_API_URL/health"` → 200.
2. §4-ის SQL — ყველა «მოსალოდნელი» ემთხვევა.
3. **Admin-ის ფილიალის switcher:** «ყველა ფილიალი» და თითო ფილიალი; members /
   dashboard-ის ციფრები იცვლებიან; `?locationId=` reload-ზე რჩება.
4. **POS sale Rustaveli Branch-ზე** (tracked product) → `product_stock` −1 და
   `products.stock` −1; §4.3-ის drift = 0. Sale Main Floor-ზე → სრულდება, stock
   უცვლელია (stock-take-ამდე — მოსალოდნელი).
5. **Check-in Main Floor-ზე** → `check_ins."locationId"` = Main Floor.
6. **Report ფილიალით** (მაგ. sales / revenue) → ციფრი gym-wide-ზე ≤.
7. **Tenant:** სხვა gym-ის `locationId` downtown-ის subdomain-ზე → 404/403 ან ცარიელი,
   არა სხვა gym-ის data.
8. TRAINER-ის login-ით Main Floor → `403 BRANCH_FORBIDDEN` (roster review-ამდე —
   მოსალოდნელი).

### 6.4 Deploy-ის შემდეგ

1. **Stock-take** (§3) — Main Floor-ზე და Studio A-ზე პირველ sale-ამდე.
2. **Roster review** (§3) — staff-ის ფილიალები, `shift_slots`-ის ფილიალი.
3. §4.3-ის drift query stock-take-ის შემდეგ ისევ — 0 row.
