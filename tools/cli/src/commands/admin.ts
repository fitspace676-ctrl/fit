import { PrismaClient } from '@fit/db';
import type { ParsedArgs } from '../args';
import { stringFlag } from '../args';
import { CommandError, type CommandResult } from '../output';
import { loadInfraEnv } from '../env-source';

const USAGE = 'usage: fit admin <grant --email <email> | revoke --email <email> | list>';

/**
 * Platform SUPER_ADMIN bootstrap. SUPER_ADMIN is the only platform-wide role and
 * lives on `User.isSuperAdmin` (not a gym membership), so promoting an account is
 * a single flag flip — this command is how the *first* operator is created, and
 * how access is granted/revoked thereafter.
 *
 * Operates directly on the database (the user must already exist — register them
 * through the normal flow first), so it needs `DATABASE_URL`; it is an operator
 * tool, never reachable over the API (which would be a privilege-escalation
 * hole). Connects with the local-target connection string from the shared env.
 */
export async function run(args: ParsedArgs): Promise<CommandResult> {
  const [sub] = args.positionals;
  const env = loadInfraEnv('local');
  const prisma = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } });

  try {
    switch (sub) {
      case 'grant':
      case 'revoke': {
        const email = stringFlag(args.flags, 'email')?.trim().toLowerCase();
        if (!email) {
          throw new CommandError('--email is required', { code: 'BAD_ARGUMENT', detail: USAGE });
        }
        const user = await prisma.user.findUnique({
          where: { email },
          select: { id: true, isSuperAdmin: true },
        });
        if (!user) {
          throw new CommandError(`No user with email '${email}'`, {
            code: 'USER_NOT_FOUND',
            detail: 'Register the user through the normal sign-up flow first, then grant.',
          });
        }
        const isSuperAdmin = sub === 'grant';
        await prisma.user.update({ where: { id: user.id }, data: { isSuperAdmin } });
        return { data: { email, userId: user.id, isSuperAdmin } };
      }

      case 'list': {
        const admins = await prisma.user.findMany({
          where: { isSuperAdmin: true },
          select: { id: true, email: true, name: true },
          orderBy: { createdAt: 'asc' },
        });
        return { data: { superAdmins: admins } };
      }

      default:
        throw new CommandError(`Unknown 'admin' subcommand '${sub ?? ''}'`, {
          code: 'BAD_ARGUMENT',
          detail: USAGE,
        });
    }
  } finally {
    await prisma.$disconnect();
  }
}
