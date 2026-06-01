import type { InfraEnv } from '@fit/env';
import type { ParsedArgs } from '../args';
import { stringFlag } from '../args';
import { CommandError, type CommandResult } from '../output';
import { loadInfraEnv } from '../env-source';

const USAGE = 'usage: fit r2 <config | sign <key> [--content-type <type>]>';

/**
 * Build the non-secret view of the R2 configuration. The access key id and
 * secret are deliberately excluded — `r2 config` reports *whether* storage is
 * configured and the public surface, never the credentials.
 */
export function describeConfig(env: InfraEnv): {
  configured: boolean;
  accountId: string | null;
  bucket: string | null;
  publicUrl: string | null;
  endpoint: string | null;
  signedUrlTtlSeconds: number;
} {
  const configured = Boolean(
    env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_BUCKET,
  );
  return {
    configured,
    accountId: env.R2_ACCOUNT_ID ?? null,
    bucket: env.R2_BUCKET ?? null,
    publicUrl: env.R2_PUBLIC_URL ?? null,
    endpoint: env.R2_ACCOUNT_ID ? `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : null,
    signedUrlTtlSeconds: env.R2_SIGNED_URL_TTL,
  };
}

export async function run(args: ParsedArgs): Promise<CommandResult> {
  const [sub, key] = args.positionals;
  const env = loadInfraEnv('local');

  switch (sub) {
    case 'config':
      return { data: describeConfig(env) };

    case 'sign': {
      if (!key) {
        throw new CommandError('Missing object key', { code: 'BAD_ARGUMENT', detail: USAGE });
      }
      // Presigning is owned by the API's storage service (single source of the
      // SigV4 logic). Delegate to `POST /uploads` rather than re-implementing it.
      const contentType = stringFlag(args.flags, 'content-type') ?? 'application/octet-stream';
      const endpoint = `${env.API_URL.replace(/\/$/, '')}/uploads`;
      let res: Response;
      try {
        res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ contentType, fileName: key }),
        });
      } catch (err) {
        throw new CommandError(`Could not reach the API at ${endpoint}`, {
          code: 'API_UNREACHABLE',
          detail: { endpoint, cause: err instanceof Error ? err.message : String(err) },
        });
      }
      if (!res.ok) {
        throw new CommandError(`API returned HTTP ${res.status} signing '${key}'`, {
          code: 'SIGN_FAILED',
          detail: { endpoint, status: res.status },
        });
      }
      return { data: await res.json() };
    }

    default:
      throw new CommandError(`Unknown 'r2' subcommand '${sub ?? ''}'`, {
        code: 'BAD_ARGUMENT',
        detail: USAGE,
      });
  }
}
