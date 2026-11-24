import { readFileSync } from 'node:fs';
import { PrismaClient, gymRealm, realmForRole, type Prisma } from '@fit/db';
import { z } from 'zod';
import { boolFlag, stringFlag, type ParsedArgs } from '../args';
import { CommandError, type CommandResult } from '../output';
import { loadInfraEnv } from '../env-source';
import {
  aggregateWarnings,
  sourceChanges,
  isLiveSubscription,
  syncSaleDisposition,
  selectSubscriptionSales,
  packageSubscriptionDetails,
  soldSubscriptionDetails,
  instant,
  localWeekday,
  workoutRules,
  minorUnits,
  parseSmartCrm,
  paymentMethod,
  clientNoteText,
  saleNoteText,
  productDescriptionText,
  SECTIONS,
  sourceId,
  staffRole,
  syntheticEmail,
  visitIds,
  type Section,
} from './smartcrm-mapping';

export async function runImportSmartCrm(args: ParsedArgs): Promise<CommandResult> {
  const slug = stringFlag(args.flags, 'slug')?.trim().toLowerCase();
  const name = stringFlag(args.flags, 'name')?.trim();
  const path = stringFlag(args.flags, 'data');
  const ownerEmail = stringFlag(args.flags, 'owner-email')?.trim().toLowerCase();
  const dryRun = boolFlag(args.flags, 'dry-run');
  // Rewrite the staff-visible texts (notes, descriptions) of rows a previous run created.
  const sync = boolFlag(args.flags, 'sync');
  const refreshText = sync || boolFlag(args.flags, 'refresh-text');
  const stockChanges: Array<{ sourceId: string; before: number; after: number }> = [];
  if (!slug || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(slug) || !name || !path) {
    throw new CommandError('Required: --data <file> --slug <DNS label> --name <name>', {
      code: 'BAD_ARGUMENT',
    });
  }
  const only = stringFlag(args.flags, 'only')
    ?.split(',')
    .map((s) => s.trim());
  if (only?.some((s) => !SECTIONS.includes(s as Section)))
    throw new CommandError('Invalid --only section', { code: 'BAD_ARGUMENT', detail: SECTIONS });
  let input: string;
  try {
    input = readFileSync(path, 'utf8');
  } catch {
    throw new CommandError('Cannot read --data file', { code: 'BAD_IMPORT' });
  }
  const data = parseSmartCrm(input);
  // The source flags a paused package `expired` while the pause lasts (that is how it
  // keeps the door shut), yet lists it under paused memberships. It is a live, frozen
  // membership, not history.
  for (const sale of data.soldPackages) if (sale.pauseStatus === true) sale.expired = false;
  const selected = new Set<Section>((only as Section[] | undefined) ?? SECTIONS);
  const blockers: Array<{ code: string; count: number; sourceIds: string[] }> = [];
  const warnings: Array<{ section: Section; sourceId?: string; code: string }> = [];
  const warn = (section: Section, code: string, id?: string) =>
    warnings.push({ section, sourceId: id, code });
  // Dependencies are explicit in the summary, and use the same insert-only policy.
  const dependencies: Partial<Record<Section, Section[]>> = {
    clients: ['staff'],
    soldPackages: ['clients', 'packages', 'paymentTypes', 'discounts'],
    visits: ['clients'],
    workouts: ['staff', 'groups'],
    sessions: ['workouts', 'groups'],
    packages: ['services'],
  };
  function include(section: Section) {
    for (const dep of dependencies[section] ?? []) {
      selected.add(dep);
      include(dep);
    }
  }
  for (const section of [...selected]) include(section);
  selected.add('gym');
  const counts = Object.fromEntries(
    SECTIONS.map((s) => [s, { created: 0, updated: 0, skipped: 0 }]),
  ) as Record<Section, { created: number; updated: number; skipped: number }>;
  const id = (kind: string, source: string) => sourceId(slug, kind, source);
  const gymId = id('gym', '1');
  const locationId = id('location', '1');
  const prefix = `scrm_${slug}_`;
  const now = new Date();
  const protectedIds = new Set<string>();
  const env = loadInfraEnv('local');
  const db = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } });
  /** With --sync: how many rows change per table and column (names only, never values). */
  const fieldChanges: Record<string, number> = {};
  /** Changes not applied because of `--keep` or an unchanged source stock. */
  const keptChanges: Record<string, number> = {};
  const keep = new Set(
    (stringFlag(args.flags, 'keep') ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
  const previousPath = stringFlag(args.flags, 'previous');
  let previousStock: Map<string, number> | null = null;
  if (previousPath) {
    try {
      previousStock = new Map(
        parseSmartCrm(readFileSync(previousPath, 'utf8')).products.map((p) => [
          p.sourceId,
          p.stock,
        ]),
      );
    } catch {
      throw new CommandError('Cannot read --previous file', { code: 'BAD_IMPORT' });
    }
  }
  const writes: Array<{ section: Section; run: () => Promise<unknown> }> = [];
  // Reads and planning also run for --dry-run. No write closure executes until all planning succeeds.
  async function bulk<T extends { id: string }>(
    section: Section,
    rows: T[],
    existing: Promise<Array<{ id: string }>>,
    create: (rows: T[]) => Promise<unknown>,
    update?: (row: T, changes: Partial<T>) => Prisma.PrismaPromise<unknown>,
  ) {
    const previous = await existing;
    const present = new Set(previous.map((r) => r.id));
    if (sync && update) {
      const byId = new Map(previous.map((r) => [r.id, r]));
      for (const row of rows) {
        const old = byId.get(row.id);
        if (!old || protectedIds.has(row.id)) continue;
        // Identity, ownership and creation timestamps are never rewritten.
        const { id: _id, ...fields } = row;
        const desired = { ...fields } as Record<string, unknown>;
        for (const key of ['gymId', 'userId', 'memberId', 'createdAt']) delete desired[key];
        const changes = sourceChanges(old, desired) as Partial<T>;
        const table = row.id.slice(prefix.length).split('_')[0]!;
        // Columns edited in our product since the import stay ours (`--keep table.column`).
        for (const key of Object.keys(changes)) {
          if (!keep.has(`${table}.${key}`)) continue;
          delete (changes as Record<string, unknown>)[key];
          keptChanges[`${table}.${key}`] = (keptChanges[`${table}.${key}`] ?? 0) + 1;
        }
        // Stock follows the source only where the source itself moved since `--previous`;
        // otherwise the difference is our own sales and reservations.
        if (previousStock && 'stock' in changes) {
          const product = data.products.find(
            (p) =>
              id('product', p.sourceId) === row.id || id('productStock', p.sourceId) === row.id,
          );
          if (product && previousStock.get(product.sourceId) === product.stock) {
            delete (changes as Record<string, unknown>).stock;
            keptChanges[`${table}.stock`] = (keptChanges[`${table}.stock`] ?? 0) + 1;
          }
        }
        if (!Object.keys(changes).length) continue;
        counts[section].updated++;
        for (const key of Object.keys(changes)) {
          const name = `${table}.${key}`;
          fieldChanges[name] = (fieldChanges[name] ?? 0) + 1;
        }
        if (
          section === 'products' &&
          row.id.startsWith(`${prefix}product_`) &&
          'stock' in changes
        ) {
          const product = data.products.find((p) => id('product', p.sourceId) === row.id)!;
          stockChanges.push({
            sourceId: product.sourceId,
            before: (old as unknown as { stock: number }).stock,
            after: product.stock,
          });
        }
        writes.push({ section, run: () => update(row, changes) });
      }
    }
    const pending = rows.filter((r) => !present.has(r.id) && !(sync && protectedIds.has(r.id)));
    counts[section].skipped += rows.length - pending.length;
    counts[section].created += pending.length;
    for (let offset = 0; offset < pending.length; offset += 500) {
      const chunk = pending.slice(offset, offset + 500);
      writes.push({ section, run: () => create(chunk) });
    }
  }
  const scoped = { where: { gymId }, select: { id: true } } as const;
  /** With --refresh-text: overwrite one text column of already-imported rows, in chunks. */
  function refresh(
    section: Section,
    rows: Array<{ id: string; text: string }>,
    update: (row: { id: string; text: string }) => Prisma.PrismaPromise<unknown>,
  ) {
    if (!refreshText || sync) return;
    counts[section].updated += rows.length;
    for (let offset = 0; offset < rows.length; offset += 100) {
      const chunk = rows.slice(offset, offset + 100);
      writes.push({ section, run: () => db.$transaction(chunk.map(update)) });
    }
  }
  try {
    // Accounts are per gym and per staff/member (see `@fit/db` account-realm): the
    // owner is the gym's staff account, every imported person the gym's staff or
    // member account for their address. Accounts elsewhere are never linked.
    const ownerRealm = gymRealm(gymId, 'staff');
    const [gym, foundOwner] = await Promise.all([
      db.gym.findUnique({ where: { slug } }),
      ownerEmail
        ? db.user.findUnique({ where: { email_realm: { email: ownerEmail, realm: ownerRealm } } })
        : Promise.resolve(null),
    ]);
    // The owner of a migrated gym has not signed up yet and must not be contacted:
    // create a password-less, unverified account they later claim by password reset.
    // Unverified keeps them out of every owner/manager digest (ops + report delivery).
    let owner: { id: string } | null = foundOwner;
    if (ownerEmail && !owner) {
      const ownerUserId = id('ownerUser', '1');
      owner = { id: ownerUserId };
      counts.gym.created++;
      writes.push({
        section: 'gym',
        run: () =>
          db.user.create({
            data: {
              id: ownerUserId,
              email: ownerEmail,
              realm: ownerRealm,
              passwordHash: null,
              emailVerifiedAt: null,
            },
          }),
      });
    }
    if (gym && gym.id !== gymId)
      throw new CommandError('Slug belongs to a gym not created by this importer', {
        code: 'GYM_SCOPE_MISMATCH',
      });
    if (gym?.ownerId && owner && gym.ownerId !== owner.id)
      throw new CommandError('Gym has another owner', { code: 'OWNER_MISMATCH' });
    if (!gym) {
      counts.gym.created++;
      writes.push({
        section: 'gym',
        run: () =>
          db.gym.create({
            data: {
              id: gymId,
              slug,
              name,
              ownerId: owner?.id,
              settings: { locale: { language: 'ka', currency: 'GEL', timezone: 'Asia/Tbilisi' } },
            },
          }),
      });
    } else counts.gym.skipped++;
    if (!owner && !gym?.ownerId) warn('gym', 'OWNERLESS_GYM');
    if (gym && owner && !gym.ownerId) {
      counts.gym.updated++;
      writes.push({
        section: 'gym',
        run: () =>
          db.gym.update({ where: { id: gymId, ownerId: null }, data: { ownerId: owner.id } }),
      });
    }
    await bulk(
      'gym',
      [{ id: locationId, gymId, name: data.gym.branch, isDefault: true }],
      db.location.findMany(scoped),
      (rows) => db.location.createMany({ data: rows }),
    );
    // InvoiceSequence is lazily created by billing; never seed/reset live numbering.
    if (owner) {
      const existing = await db.gymMember.findUnique({
        where: { userId_gymId: { userId: owner.id, gymId } },
      });
      if (existing && existing.role !== 'OWNER')
        throw new CommandError('Owner membership already has another role', {
          code: 'OWNER_MISMATCH',
        });
      await bulk(
        'gym',
        existing
          ? []
          : [
              {
                id: id('owner', owner.id),
                gymId,
                userId: owner.id,
                role: 'OWNER' as const,
                locationId,
              },
            ],
        db.gymMember.findMany({ where: { gymId } }),
        (rows) => db.gymMember.createMany({ data: rows }),
      );
    }

    const people = [
      ...(selected.has('staff')
        ? data.staff.map((s) => ({
            source: s.sourceId,
            kind: 'staff',
            // An unmapped role is imported as a suspended MEMBER (below), so it is
            // a member account.
            realm: realmForRole(gymId, staffRole(s.roleName) ?? 'MEMBER'),
            name: s.name,
            phone: s.phone,
            email: null as string | null,
            date: null as Date | null,
          }))
        : []),
      ...(selected.has('clients')
        ? data.clients.map((s) => ({
            source: s.sourceId,
            kind: 'client',
            realm: gymRealm(gymId, 'member'),
            name: s.fullName,
            phone: s.phone,
            email: s.email?.trim().toLowerCase() ?? null,
            date: instant(s.registeredAt),
          }))
        : []),
    ];
    const personUsers = new Map<string, string>();
    const userRows: Prisma.UserCreateManyInput[] = [];
    const candidates = [
      ...new Set(
        people.flatMap((p) => [
          syntheticEmail(slug, p.kind, p.source),
          ...(p.email && z.string().email().safeParse(p.email).success ? [p.email] : []),
        ]),
      ),
    ];
    // Keyed by realm and address: the same address may hold one staff and one
    // member account in this gym.
    const users = new Map<string, string>();
    const userKey = (realm: string, email: string) => `${realm}\n${email}`;
    for (let offset = 0; offset < candidates.length; offset += 500) {
      for (const u of await db.user.findMany({
        where: {
          email: { in: candidates.slice(offset, offset + 500) },
          realm: { in: [gymRealm(gymId, 'staff'), gymRealm(gymId, 'member')] },
        },
        select: { id: true, email: true, realm: true },
      }))
        users.set(userKey(u.realm, u.email), u.id);
    }
    const memberships = await db.gymMember.findMany({
      where: { gymId },
      include: { user: true },
    });
    if (sync) {
      for (const c of selected.has('clients') ? data.clients : []) {
        const member = memberships.find((m) => m.id === id('client', c.sourceId));
        if (!member || (!member.user.passwordHash && !member.user.emailVerifiedAt)) continue;
        for (const kind of ['client', 'clientUser', 'clientCredential', 'clientNote'])
          protectedIds.add(id(kind, c.sourceId));
        warn('clients', 'SYNC_CLAIMED_MEMBER_SKIPPED', c.sourceId);
      }
      for (const [section, kind] of [
        ['clients', 'client'],
        ['staff', 'staff'],
      ] as const) {
        if (!selected.has(section)) continue;
        const current = new Set(data[section].map((p) => id(kind, p.sourceId)));
        for (const member of memberships)
          if (member.id.startsWith(`${prefix}${kind}_`) && !current.has(member.id))
            warn(section, `SYNC_REMOVED_${section.toUpperCase()}_PRESERVED`, member.id);
      }
    }
    const existingMembers = new Map(memberships.map((m) => [m.id, m.userId]));
    const claimed = new Set(memberships.map((m) => m.userId));
    if (owner) claimed.add(owner.id);
    for (const p of people) {
      const section = p.kind === 'staff' ? 'staff' : 'clients';
      const memberId = id(p.kind, p.source);
      const old = existingMembers.get(memberId);
      if (old) {
        personUsers.set(memberId, old);
        if (sync && !protectedIds.has(memberId) && old.startsWith(prefix)) {
          const user = memberships.find((m) => m.id === memberId)!.user;
          const changes =
            user.passwordHash || user.emailVerifiedAt || user.realm !== p.realm
              ? {}
              : sourceChanges(user, { name: p.name, phone: p.phone });
          if (Object.keys(changes).length) {
            counts[section].updated++;
            writes.push({
              section,
              run: () =>
                db.user.updateMany({
                  where: {
                    id: { equals: old, startsWith: prefix },
                    realm: p.realm,
                    memberships: { some: { gymId, id: memberId } },
                    passwordHash: null,
                    emailVerifiedAt: null,
                  },
                  data: changes,
                }),
            });
          }
        }
        continue;
      }
      let email =
        p.email && z.string().email().safeParse(p.email).success
          ? p.email
          : syntheticEmail(slug, p.kind, p.source);
      let userId = users.get(userKey(p.realm, email));
      if (userId && claimed.has(userId)) {
        // One user cannot represent two source people within one gym.
        warn(section, 'SHARED_EMAIL_SEPARATE_IDENTITY', p.source);
        email = syntheticEmail(slug, p.kind, p.source);
        userId = users.get(userKey(p.realm, email));
      }
      if (userId && claimed.has(userId))
        throw new CommandError('Import identity collision', {
          code: 'IDENTITY_COLLISION',
          detail: { section, sourceId: p.source },
        });
      if (!userId) {
        userId = id(`${p.kind}User`, p.source);
        userRows.push({
          id: userId,
          email,
          realm: p.realm,
          name: p.name,
          phone: p.phone,
          passwordHash: null,
          emailVerifiedAt: null,
          ...(p.date ? { createdAt: p.date } : {}),
        });
        users.set(userKey(p.realm, email), userId);
      }
      claimed.add(userId);
      personUsers.set(memberId, userId);
    }
    for (let offset = 0; offset < userRows.length; offset += 500) {
      const chunk = userRows.slice(offset, offset + 500);
      writes.push({ section: 'clients', run: () => db.user.createMany({ data: chunk }) });
    }
    const credentials: Array<Prisma.GymCredentialCreateManyInput & { id: string }> = [];
    for (const p of people)
      credentials.push({
        id: id(`${p.kind}Credential`, p.source),
        gymId,
        userId: personUsers.get(id(p.kind, p.source))!,
        name: p.name,
        phone: p.phone,
        ...(p.date ? { createdAt: p.date } : {}),
      });
    if (selected.has('staff')) {
      const rows = data.staff.map((s) => {
        const role = staffRole(s.roleName);
        if (!role) warn('staff', 'UNMAPPED_ROLE_SUSPENDED_MEMBER', s.sourceId);
        const [firstName, ...lastName] = s.name.trim().split(/\s+/);
        return {
          id: id('staff', s.sourceId),
          gymId,
          userId: personUsers.get(id('staff', s.sourceId))!,
          role: role ?? ('MEMBER' as const),
          status: s.active && role ? ('ACTIVE' as const) : ('SUSPENDED' as const),
          firstName,
          lastName: lastName.join(' ') || null,
          locationId,
        };
      });
      await bulk(
        'staff',
        rows,
        db.gymMember.findMany({ where: { gymId } }),
        (r) => db.gymMember.createMany({ data: r }),
        (r, changes) =>
          db.gymMember.updateMany({
            where: { gymId, id: { equals: r.id, startsWith: prefix } },
            data: changes,
          }),
      );
      await bulk(
        'staff',
        data.staff.map((s) => ({
          id: id('staffLocation', s.sourceId),
          gymId,
          staffId: id('staff', s.sourceId),
          locationId,
        })),
        db.locationStaff.findMany(scoped),
        (r) => db.locationStaff.createMany({ data: r }),
      );
      await bulk(
        'staff',
        data.staff
          .filter((s) => staffRole(s.roleName) === 'TRAINER')
          .map((s) => ({
            id: id('trainer', s.sourceId),
            gymId,
            staffId: id('staff', s.sourceId),
            name: s.name,
            status: s.active ? ('ACTIVE' as const) : ('INACTIVE' as const),
          })),
        db.trainer.findMany(scoped),
        (r) => db.trainer.createMany({ data: r }),
      );
      // No note for staff: the source adds nothing our staff record does not already hold.
      if (refreshText && !sync)
        writes.push({
          section: 'staff',
          run: () =>
            db.memberNote.deleteMany({
              where: { gymId, id: { in: data.staff.map((s) => id('staffNote', s.sourceId)) } },
            }),
        });
      warn('staff', 'NO_SOURCE_CREATED_AT_USING_IMPORT_TIME');
    }
    if (selected.has('clients')) {
      await bulk(
        'clients',
        data.clients.map((c) => ({
          id: id('client', c.sourceId),
          gymId,
          userId: personUsers.get(id('client', c.sourceId))!,
          locationId,
          role: 'MEMBER' as const,
          status: c.active && !c.blacklisted ? ('ACTIVE' as const) : ('SUSPENDED' as const),
          personalId: c.idNumber,
          dateOfBirth: c.birthDate ? new Date(`${c.birthDate.slice(0, 10)}T00:00:00Z`) : null,
          joinedAt: instant(c.registeredAt),
          tags: [
            'smartcrm',
            ...(c.blacklisted ? ['smartcrm:blacklisted'] : []),
            ...(!c.smsEnabled ? ['smartcrm:sms-disabled'] : []),
          ],
        })),
        db.gymMember.findMany({ where: { gymId } }),
        (r) => db.gymMember.createMany({ data: r }),
        (r, changes) =>
          db.gymMember.updateMany({
            where: { gymId, id: { equals: r.id, startsWith: prefix } },
            data: changes,
          }),
      );
      const staffNames = new Map(data.staff.map((s) => [s.sourceId, s.name]));
      await bulk(
        'clients',
        data.clients.map((c) => ({
          id: id('clientNote', c.sourceId),
          gymId,
          memberId: id('client', c.sourceId),
          authorName: 'Smart CRM import',
          body: clientNoteText(c, staffNames.get(c.trainerStaffSourceId ?? '') ?? null),
          createdAt: instant(c.registeredAt),
        })),
        db.memberNote.findMany({ where: { gymId } }),
        (r) => db.memberNote.createMany({ data: r }),
        (r, changes) =>
          db.memberNote.updateMany({
            where: { gymId, id: { equals: r.id, startsWith: prefix } },
            data: changes,
          }),
      );
      refresh(
        'clients',
        data.clients.map((c) => ({
          id: id('clientNote', c.sourceId),
          text: clientNoteText(c, staffNames.get(c.trainerStaffSourceId ?? '') ?? null),
        })),
        (r) => db.memberNote.update({ where: { id: r.id, gymId }, data: { body: r.text } }),
      );
      warn('clients', 'CARDS_TRAINER_SMS_RETAINED_IN_NOTES_NOT_OPERATIONAL');
    }
    await bulk(
      selected.has('clients') ? 'clients' : 'staff',
      credentials,
      db.gymCredential.findMany({ where: { gymId } }),
      (r) => db.gymCredential.createMany({ data: r }),
      (r, changes) =>
        db.gymCredential.updateMany({
          where: { gymId, id: { equals: r.id, startsWith: prefix } },
          data: changes,
        }),
    );
    if (selected.has('packages')) {
      await bulk(
        'packages',
        data.packages.map((p) => ({
          id: id('package', p.sourceId),
          gymId,
          locationId,
          name: p.name,
          priceAmount: minorUnits(p.price),
          currency: 'GEL',
          billingInterval: 'ONE_TIME' as const,
          sessionCount: p.visitCount,
          creditValidityDays: p.daysCount || null,
          status: 'INACTIVE' as const,
          description: packageSubscriptionDetails(p).description,
        })),
        db.packagePlan.findMany({ where: { gymId } }),
        (r) => db.packagePlan.createMany({ data: r }),
        (r, changes) =>
          db.packagePlan.updateMany({
            where: { gymId, id: { equals: r.id, startsWith: prefix } },
            data: changes,
          }),
      );
      refresh(
        'packages',
        data.packages.map((p) => ({
          id: id('package', p.sourceId),
          text: packageSubscriptionDetails(p).description,
        })),
        (r) => db.packagePlan.update({ where: { id: r.id, gymId }, data: { description: r.text } }),
      );
      await bulk(
        'packages',
        data.packages.map((p) => ({
          id: id('subscriptionPlan', p.sourceId),
          gymId,
          locationId,
          name: p.name,
          priceAmount: minorUnits(p.price),
          currency: 'GEL',
          status: 'INACTIVE' as const,
          ...packageSubscriptionDetails(p),
        })),
        db.subscriptionPlan.findMany({ where: { gymId } }),
        (r) => db.subscriptionPlan.createMany({ data: r }),
        (r, changes) =>
          db.subscriptionPlan.updateMany({
            where: { gymId, id: { equals: r.id, startsWith: prefix } },
            data: changes,
          }),
      );
      for (const p of data.packages)
        warn('packages', 'CATALOGUE_INACTIVE_DOOR_VISITS_AND_WINDOWS_UNSUPPORTED', p.sourceId);
    }
    if (selected.has('soldPackages')) {
      const methods = new Map(data.paymentTypes.map((p) => [p.sourceId, p.name]));
      const discounts = new Map(data.discounts.map((d) => [d.sourceId, d]));
      // Preserve exact source facts alongside the explicitly approximate access subscription.
      const packageNames = new Map(data.packages.map((p) => [p.sourceId, p.name]));
      const saleText = (p: (typeof data.soldPackages)[number]) =>
        saleNoteText(
          p,
          packageNames.get(p.packageSourceId) ?? '—',
          p.paymentTypeSourceId ? (methods.get(p.paymentTypeSourceId) ?? null) : null,
          p.saleTypeSourceId ? (discounts.get(p.saleTypeSourceId)?.name ?? null) : null,
        );
      await bulk(
        'soldPackages',
        data.soldPackages.map((p) => ({
          id: id('saleNote', p.sourceId),
          gymId,
          memberId: id('client', p.clientSourceId),
          authorName: 'Smart CRM import',
          body: saleText(p),
          createdAt: instant(p.soldAt),
        })),
        db.memberNote.findMany({ where: { gymId } }),
        (r) => db.memberNote.createMany({ data: r }),
        (r, changes) =>
          db.memberNote.updateMany({
            where: { gymId, id: { equals: r.id, startsWith: prefix } },
            data: changes,
          }),
      );
      refresh(
        'soldPackages',
        data.soldPackages.map((p) => ({ id: id('saleNote', p.sourceId), text: saleText(p) })),
        (r) => db.memberNote.update({ where: { id: r.id, gymId }, data: { body: r.text } }),
      );
      const packages = new Map(data.packages.map((p) => [p.sourceId, p]));
      const subscriptionSales = selectSubscriptionSales(data.soldPackages);
      for (const sale of subscriptionSales.noteOnly)
        warn('soldPackages', 'SECOND_LIVE_PACKAGE_NOTE_ONLY', sale.sourceId);
      counts.soldPackages.skipped += subscriptionSales.noteOnly.length;
      const subscriptionRows = subscriptionSales.selected.map((sale) => ({
        id: id('subscription', sale.sourceId),
        gymId,
        memberId: id('client', sale.clientSourceId),
        planId: id('subscriptionPlan', sale.packageSourceId),
        ...soldSubscriptionDetails(sale, packages.get(sale.packageSourceId)!),
      }));
      const existingSubs = await db.subscription.findMany({ where: { gymId } });
      if (sync) {
        const byId = new Map(existingSubs.map((row) => [row.id, row]));
        const currentIds = new Set(
          data.soldPackages.map((sale) => id('subscription', sale.sourceId)),
        );
        const sourceSelected = new Set(subscriptionSales.selected.map((sale) => sale.sourceId));
        // Removed live rows cannot be demoted: preserve them and suppress new live access.
        const reservedLive = new Set(
          existingSubs
            .filter(
              (row) =>
                isLiveSubscription(row.status) &&
                (row.provider !== 'smartcrm-import' ||
                  !row.id.startsWith(prefix) ||
                  !currentIds.has(row.id)),
            )
            .map((row) => row.memberId),
        );
        const currentNotes = new Set(
          data.soldPackages.map((sale) => id('saleNote', sale.sourceId)),
        );
        const oldNotes = await db.memberNote.findMany({
          where: { gymId, id: { startsWith: `${prefix}saleNote_` } },
          select: { id: true },
        });
        const removedHashes = new Set<string>();
        for (const row of oldNotes)
          if (!currentNotes.has(row.id))
            removedHashes.add(row.id.slice(`${prefix}saleNote_`.length));
        for (const row of existingSubs)
          if (row.id.startsWith(`${prefix}subscription_`) && !currentIds.has(row.id))
            removedHashes.add(row.id.slice(`${prefix}subscription_`.length));
        for (const hash of removedHashes)
          warn('soldPackages', 'SYNC_REMOVED_SALES_PRESERVED', `${prefix}saleNote_${hash}`);
        const perMember = new Map<
          string,
          Array<{
            row: (typeof subscriptionRows)[number];
            changes: Partial<(typeof subscriptionRows)[number]>;
            exists: boolean;
          }>
        >();
        for (const sale of data.soldPackages) {
          const rowId = id('subscription', sale.sourceId);
          const old = byId.get(rowId);
          if (old && old.provider !== 'smartcrm-import') {
            warn('soldPackages', 'SYNC_NON_IMPORT_SUBSCRIPTION_PRESERVED', sale.sourceId);
            continue;
          }
          const memberId = id('client', sale.clientSourceId);
          const blocked = !sale.expired && reservedLive.has(memberId);
          if (blocked && sourceSelected.has(sale.sourceId))
            warn('soldPackages', 'SYNC_EXISTING_LIVE_SUBSCRIPTION_NOTE_ONLY', sale.sourceId);
          const disposition = syncSaleDisposition(
            sourceSelected.has(sale.sourceId),
            blocked,
            !!old,
          );
          if (disposition === 'note-only') continue;
          const row = {
            id: rowId,
            gymId,
            memberId,
            planId: id('subscriptionPlan', sale.packageSourceId),
            ...soldSubscriptionDetails(
              disposition === 'expired' ? { ...sale, expired: true } : sale,
              packages.get(sale.packageSourceId)!,
            ),
          };
          const {
            id: _id,
            gymId: _gymId,
            memberId: _memberId,
            createdAt: _createdAt,
            ...fields
          } = row;
          const changes = old ? sourceChanges(old, fields) : {};
          if (old && !Object.keys(changes).length) {
            counts.soldPackages.skipped++;
            continue;
          }
          if (old) counts.soldPackages.updated++;
          else counts.soldPackages.created++;
          const operations = perMember.get(memberId) ?? [];
          operations.push({ row, changes, exists: !!old });
          perMember.set(memberId, operations);
        }
        for (const operations of perMember.values()) {
          // Non-live updates first, then promotions and inserts, all in one transaction.
          operations.sort(
            (a, b) =>
              Number(isLiveSubscription(a.row.status)) - Number(isLiveSubscription(b.row.status)),
          );
          writes.push({
            section: 'soldPackages',
            run: () =>
              db.$transaction(
                operations.map(({ row, changes, exists }) =>
                  exists
                    ? db.subscription.updateMany({
                        where: {
                          gymId,
                          id: { equals: row.id, startsWith: prefix },
                          provider: 'smartcrm-import',
                        },
                        data: changes,
                      })
                    : db.subscription.create({ data: row }),
                ),
              ),
          });
        }
      } else {
        const existingIds = new Set(existingSubs.map((row) => row.id));
        const liveByMember = new Map<string, number>();
        for (const row of [
          ...existingSubs,
          ...subscriptionRows.filter((row) => !existingIds.has(row.id)),
        ]) {
          if (['ACTIVE', 'FROZEN', 'PAST_DUE', 'TRIAL'].includes(row.status))
            liveByMember.set(row.memberId, (liveByMember.get(row.memberId) ?? 0) + 1);
        }
        const conflicts = [...liveByMember].filter(([, count]) => count > 1);
        if (conflicts.length) {
          const members = new Set(conflicts.map(([memberId]) => memberId));
          blockers.push({
            code: 'MULTIPLE_LIVE_SUBSCRIPTIONS_DB_UNIQUE_CONSTRAINT',
            count: conflicts.length,
            sourceIds: data.soldPackages
              .filter((sale) => members.has(id('client', sale.clientSourceId)) && !sale.expired)
              .slice(0, 5)
              .map((sale) => sale.sourceId),
          });
        }
        await bulk('soldPackages', subscriptionRows, Promise.resolve(existingSubs), (r) =>
          db.subscription.createMany({ data: r }),
        );
      }
      warn('soldPackages', 'PERIOD_END_CANCEL_DISPATCHES_AUTOMATION');
      warn('soldPackages', 'AUTO_UNFREEZE_RUNNER_NOT_FOUND_MANUAL_RESUME_EXTENDS_EXPIRY');
      const orders: Array<Prisma.OrderCreateManyInput & { id: string }> = [];
      const payments: Array<Prisma.PaymentCreateManyInput & { id: string }> = [];
      for (const p of data.soldPackages) {
        warn('soldPackages', 'VISIT_BALANCE_AND_ACCESS_WINDOWS_NOT_ENFORCED', p.sourceId);
        const method = paymentMethod(
          p.paymentTypeSourceId ? (methods.get(p.paymentTypeSourceId) ?? '') : '',
        );
        if (minorUnits(p.paidAmount) === 0) {
          warn('soldPackages', 'ZERO_PAYMENT_NOTE_ONLY', p.sourceId);
          continue;
        }
        if (!method) {
          warn('soldPackages', 'PAYMENT_METHOD_UNMAPPED_NOTE_ONLY', p.sourceId);
          continue;
        }
        // `price` is the list price before the sale's discount; the money that changed hands is
        // `paidAmount`, so that is the order total (the discount stays in the sale note).
        if (minorUnits(p.paidAmount) !== minorUnits(p.price))
          warn(
            'soldPackages',
            'PAID_DIFFERS_FROM_LIST_PRICE_ORDER_TOTAL_IS_PAID_AMOUNT',
            p.sourceId,
          );
        orders.push({
          id: id('order', p.sourceId),
          gymId,
          locationId,
          packageId: id('package', p.packageSourceId),
          memberId: id('client', p.clientSourceId),
          total: minorUnits(p.paidAmount),
          currency: 'GEL',
          status: 'PAID',
          createdAt: instant(p.soldAt),
        });
        payments.push({
          id: id('payment', p.sourceId),
          gymId,
          locationId,
          orderId: id('order', p.sourceId),
          amount: minorUnits(p.paidAmount),
          currency: 'GEL',
          status: 'CAPTURED',
          method,
          provider: 'smartcrm-import',
          providerRef: p.sourceId,
          createdAt: instant(p.soldAt),
        });
        warn('soldPackages', 'PAYMENT_DATE_APPROXIMATED_FROM_SALE_DATE', p.sourceId);
      }
      await bulk('soldPackages', orders, db.order.findMany(scoped), (r) =>
        db.order.createMany({ data: r }),
      );
      await bulk('soldPackages', payments, db.payment.findMany(scoped), (r) =>
        db.payment.createMany({ data: r }),
      );
    }
    if (selected.has('visits')) {
      const ids = visitIds(slug, data.visits);
      await bulk(
        'visits',
        data.visits.map((v, i) => ({
          id: ids[i]!,
          gymId,
          gymMemberId: id('client', v.clientSourceId),
          locationId,
          checkedInAt: instant(v.checkInAt),
          method: 'MANUAL' as const,
        })),
        db.checkIn.findMany(scoped),
        (r) => db.checkIn.createMany({ data: r }),
      );
      warn('visits', 'NO_CHECKOUT_OR_SERVICE_COLUMNS_METHOD_APPROXIMATED_MANUAL');
    }
    const sessionCapacities = new Map<string, number>();
    for (const session of data.sessions) {
      sessionCapacities.set(
        session.workoutSourceId,
        Math.max(sessionCapacities.get(session.workoutSourceId) ?? 0, session.capacity),
      );
    }
    const groupCapacity = (groupId: string) => {
      const group = data.groups.find((g) => g.sourceId === groupId);
      return (
        group?.maxClients ||
        Math.max(
          0,
          ...data.workouts
            .filter((w) => w.groupSourceId === groupId)
            .map((w) => w.capacity || sessionCapacities.get(w.sourceId) || 0),
        )
      );
    };
    if (selected.has('groups')) {
      const rows: Array<Prisma.ClassTypeCreateManyInput & { id: string }> = [];
      for (const g of data.groups) {
        const capacity = groupCapacity(g.sourceId);
        if (!capacity) warn('groups', 'UNKNOWN_CAPACITY_INACTIVE_PLACEHOLDER_ONE', g.sourceId);
        rows.push({
          id: id('group', g.sourceId),
          gymId,
          locationId,
          name: g.name,
          capacity: capacity || 1,
          durationMinutes: 60,
          status: g.active && capacity ? 'ACTIVE' : 'INACTIVE',
        });
      }
      await bulk('groups', rows, db.classType.findMany(scoped), (r) =>
        db.classType.createMany({ data: r }),
      );
      warn('groups', 'DEFAULT_DURATION_60_MINUTES_PRICING_FREE_NO_SOURCE_PRICE');
    }
    const templateByWorkoutDay = new Map<string, string>();
    const trainerByWorkout = new Map<string, string | null>();
    if (selected.has('workouts')) {
      const rows: Array<Prisma.ClassTemplateCreateManyInput & { id: string }> = [];
      const trainers = new Set(
        data.staff.filter((s) => staffRole(s.roleName) === 'TRAINER').map((s) => s.sourceId),
      );
      for (const w of data.workouts) {
        const capacity =
          w.capacity || sessionCapacities.get(w.sourceId) || groupCapacity(w.groupSourceId);
        if (!capacity) {
          warn('workouts', 'NO_CAPACITY_SKIPPED', w.sourceId);
          counts.workouts.skipped++;
          continue;
        }
        const trainerId =
          w.trainerStaffSourceId && trainers.has(w.trainerStaffSourceId)
            ? id('trainer', w.trainerStaffSourceId)
            : null;
        trainerByWorkout.set(w.sourceId, trainerId);
        if (w.trainerStaffSourceId && !trainerId)
          warn('workouts', 'TRAINER_NOT_FOUND_CREATED_WITHOUT_TRAINER', w.sourceId);
        const recordDate =
          typeof w.raw.RecordDate === 'string' &&
          Number.isFinite(instant(w.raw.RecordDate).getTime())
            ? instant(w.raw.RecordDate)
            : instant(w.startsAt);
        for (const rule of workoutRules(w)) {
          const templateId = id('workoutTemplate', `${w.sourceId}:${rule.day}`);
          templateByWorkoutDay.set(`${w.sourceId}:${rule.day}`, templateId);
          rows.push({
            id: templateId,
            gymId,
            locationId,
            title: w.title,
            category: w.groupName ?? '',
            description: '',
            trainerId,
            capacity,
            durationMinutes: w.durationMinutes,
            startTime: rule.startTime,
            rrule: rule.rrule,
            validFrom: instant(w.startsAt),
            validUntil: w.recurrenceEndsAt ? instant(w.recurrenceEndsAt) : null,
            status: 'PAUSED',
            createdAt: recordDate,
          });
        }
        // Imported instances are authoritative. The global nightly generator must
        // not invent extra dates or recreate source cancellations outside this export.
        warn('workouts', 'RECURRENCE_PAUSED_EXPORTED_INSTANCES_AUTHORITATIVE', w.sourceId);
      }
      await bulk(
        'workouts',
        rows,
        db.classTemplate.findMany({ where: { gymId } }),
        (r) => db.classTemplate.createMany({ data: r }),
        (r, changes) =>
          db.classTemplate.updateMany({
            where: { gymId, id: { equals: r.id, startsWith: prefix } },
            data: changes,
          }),
      );
      if (refreshText && !sync)
        writes.push({
          section: 'workouts',
          run: () =>
            db.classTemplate.updateMany({
              where: { gymId, id: { in: rows.map((r) => r.id) } },
              data: { description: '' },
            }),
        });
    }
    if (selected.has('sessions')) {
      const rows: Array<Prisma.ClassInstanceCreateManyInput & { id: string }> = [];
      const workouts = new Map(data.workouts.map((w) => [w.sourceId, w]));
      for (const session of data.sessions) {
        const workout = workouts.get(session.workoutSourceId)!;
        const templateId = templateByWorkoutDay.get(
          `${session.workoutSourceId}:${localWeekday(session.start)}`,
        );
        // Off-rule source occurrences (reschedules) remain single classes of the
        // original group, without falsely assigning them to a recurring weekday.
        rows.push({
          id: id('session', session.sourceId),
          gymId,
          locationId,
          ...(templateId
            ? { templateId, ...(sync ? { classTypeId: null } : {}) }
            : {
                classTypeId: id('group', workout.groupSourceId),
                ...(sync ? { templateId: null } : {}),
              }),
          trainerId: trainerByWorkout.get(workout.sourceId) ?? null,
          startsAt: instant(session.start),
          endsAt: instant(session.end),
          capacityOverride: session.capacity,
          bookedCount: session.bookedCount,
          status: session.cancelled
            ? 'CANCELED'
            : instant(session.end) <= now
              ? 'COMPLETED'
              : 'SCHEDULED',
          createdAt: instant(session.start),
        });
        if (session.bookedCount)
          warn('sessions', 'RESERVED_COUNT_PRESERVED_WITHOUT_BOOKING_IDENTITIES', session.sourceId);
        if (!templateId)
          warn('sessions', 'OFF_RULE_OCCURRENCE_IMPORTED_AS_SINGLE_CLASS', session.sourceId);
      }
      await bulk(
        'sessions',
        rows,
        db.classInstance.findMany({ where: { gymId } }),
        (r) => db.classInstance.createMany({ data: r }),
        (r, changes) =>
          db.classInstance.updateMany({
            where: { gymId, id: { equals: r.id, startsWith: prefix } },
            data: changes,
          }),
      );
      warn('sessions', 'SOURCE_HAS_NO_OCCURRENCE_CREATED_AT_USING_START');
      warn('sessions', 'PRICING_FREE_NO_SOURCE_PRICE_REVIEW_BEFORE_MEMBER_ACCESS');
    }
    if (selected.has('products')) {
      await bulk(
        'products',
        data.products.map((p) => ({
          id: id('product', p.sourceId),
          gymId,
          locationId,
          name: p.name,
          priceAmount: minorUnits(p.salePrice),
          costAmount: minorUnits(p.purchasePrice),
          currency: 'GEL',
          stock: p.stock,
          status: p.active ? ('ACTIVE' as const) : ('INACTIVE' as const),
          description: productDescriptionText(p),
        })),
        db.product.findMany({ where: { gymId } }),
        (r) => db.product.createMany({ data: r }),
        (r, changes) =>
          db.product.updateMany({
            where: { gymId, id: { equals: r.id, startsWith: prefix } },
            data: changes,
          }),
      );
      refresh(
        'products',
        data.products.map((p) => ({
          id: id('product', p.sourceId),
          text: productDescriptionText(p),
        })),
        (r) => db.product.update({ where: { id: r.id, gymId }, data: { description: r.text } }),
      );
      await bulk(
        'products',
        data.products.map((p) => ({
          id: id('productStock', p.sourceId),
          gymId,
          locationId,
          productId: id('product', p.sourceId),
          stock: p.stock,
        })),
        db.productStock.findMany({ where: { gymId } }),
        (r) => db.productStock.createMany({ data: r }),
        (r, changes) =>
          db.productStock.updateMany({
            where: { gymId, id: { equals: r.id, startsWith: prefix } },
            data: changes,
          }),
      );
      warn('products', 'BARCODE_DESCRIPTION_ONLY_NO_BARCODE_COLUMN');
      warn('products', 'NO_SOURCE_CREATED_AT_USING_IMPORT_TIME');
    }
    for (const section of ['discounts', 'paymentTypes', 'services'] as const) {
      if (!selected.has(section)) continue;
      counts[section].skipped += data[section].length;
      warn(section, 'NO_STANDALONE_EQUIVALENT_REFERENCED_NAMES_PRESERVED_IN_NOTES');
    }
    const summary = {
      dryRun,
      ...(sync
        ? {
            sync,
            stockChanges,
            fieldChanges,
            keptChanges,
            removedIdFormat:
              'imported database id (original source ids were hashed and not stored)',
          }
        : {}),
      gymId,
      ownerless: !owner && !gym?.ownerId,
      sections: [...selected],
      counts,
      warnings: aggregateWarnings(warnings),
      blockers,
      policy: sync
        ? 'sync source columns of scoped imported rows; preserve removed rows and claimed clients'
        : 'insert-only; existing imported rows are never overwritten',
      countUnit: sync
        ? 'database rows (new users excluded; changed users included)'
        : 'database rows (users excluded)',
      liveEntitlementsPlanned: selected.has('soldPackages'),
      futureSessionsImported: selected.has('sessions'),
    };
    if (!dryRun && blockers.length)
      throw new CommandError('Import blocked by database constraints; no writes executed', {
        code: 'IMPORT_BLOCKED',
        detail: summary,
      });
    if (!dryRun) {
      for (const write of writes) {
        try {
          await write.run();
        } catch {
          // Prisma error strings may contain entire rows / personal data.
          throw new CommandError(
            'Import batch failed; earlier batches remain committed. Re-run after resolving the constraint.',
            { code: 'IMPORT_BATCH_FAILED', detail: { section: write.section, summary } },
          );
        }
      }
    }
    return { data: summary, exitCode: blockers.length ? 1 : 0 };
  } catch (error) {
    if (error instanceof CommandError) throw error;
    throw new CommandError(
      'Database planning failed; check connectivity and schema compatibility',
      { code: 'IMPORT_DATABASE_ERROR' },
    );
  } finally {
    await db.$disconnect();
  }
}
