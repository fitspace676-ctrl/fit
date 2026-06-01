import type { ParsedArgs } from '../args';
import { stringFlag } from '../args';
import { CommandError, type CommandResult } from '../output';
import { delegate } from '../util/exec';

/** Where each app deploys, and thus which vendor CLI `fit` wraps for it. */
export const APP_VENDORS = {
  web: 'vercel',
  admin: 'vercel',
  platform: 'vercel',
  superadmin: 'vercel',
  api: 'railway',
  mobile: 'eas',
} as const;

export type AppName = keyof typeof APP_VENDORS;
export type Vendor = (typeof APP_VENDORS)[AppName];

export function vendorForApp(app: string): Vendor | undefined {
  return (APP_VENDORS as Record<string, Vendor>)[app];
}

const APPS = Object.keys(APP_VENDORS).join(', ');

function requireApp(positionals: string[]): { app: AppName; vendor: Vendor } {
  const app = positionals[0];
  if (!app) {
    throw new CommandError('Missing <app>', { code: 'BAD_ARGUMENT', detail: `apps: ${APPS}` });
  }
  const vendor = vendorForApp(app);
  if (!vendor) {
    throw new CommandError(`Unknown app '${app}' (expected one of ${APPS})`, {
      code: 'BAD_ARGUMENT',
    });
  }
  return { app: app as AppName, vendor };
}

/** Build the vendor argv for a deploy of `app` to the given target env. */
export function deployArgs(vendor: Vendor, prod: boolean): string[] {
  switch (vendor) {
    case 'vercel':
      return prod ? ['deploy', '--prod'] : ['deploy'];
    case 'railway':
      return ['up'];
    case 'eas':
      return ['build', '--platform', 'all', '--profile', prod ? 'production' : 'preview'];
  }
}

/** Build the vendor argv for tailing `app` logs. */
export function logsArgs(vendor: Vendor): string[] {
  switch (vendor) {
    case 'vercel':
      return ['logs'];
    case 'railway':
      return ['logs'];
    case 'eas':
      return ['build:list'];
  }
}

/** `fit deploy <app> [--env preview|prod]` — wraps the app's vendor CLI. */
export async function runDeploy(args: ParsedArgs): Promise<CommandResult> {
  const { app, vendor } = requireApp(args.positionals);
  const prod = (stringFlag(args.flags, 'env') ?? 'preview') === 'prod';
  const vendorArgs = deployArgs(vendor, prod);
  const code = await delegate(vendor, vendorArgs);
  return {
    data: { app, vendor, command: `${vendor} ${vendorArgs.join(' ')}`, exitCode: code },
    exitCode: code,
  };
}

/** `fit logs <app>` — wraps the app's vendor CLI log stream. */
export async function runLogs(args: ParsedArgs): Promise<CommandResult> {
  const { app, vendor } = requireApp(args.positionals);
  const vendorArgs = logsArgs(vendor);
  const code = await delegate(vendor, vendorArgs);
  return {
    data: { app, vendor, command: `${vendor} ${vendorArgs.join(' ')}`, exitCode: code },
    exitCode: code,
  };
}
