import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  AUTOMATION_ASSIST_ERROR_CODES,
  DEFAULT_TIMEZONE,
  gymSettingsStoredSchema,
  type AutomationAssistOptions,
  type AutomationAssistRequest,
  type AutomationAssistResponse,
} from '@fit/types';
import { isoDateIn } from '../agent/agent-context.service';
import { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import { TenantContext } from '../common/tenant/tenant.context';
import { AutomationService } from './automation.service';

// The drafting runtime lives in `@fit/agent`, whose provider-SDK type graphs
// make the API's classic-resolution `tsc` blow up — the same reason the agent
// chat controller loads it through a hand-typed `require` boundary. SWC
// transpiles the package at runtime; @fit/agent type-checks itself.

/** The concrete model the runtime resolves (structurally its `AgentModel`). */
interface AssistModelRef {
  id: string;
  label: string;
  provider: string;
  modelId: string;
}

/** Structurally `@fit/agent`'s `AutomationAssistContext`. */
interface AssistContext {
  gym: { name: string; slug: string };
  locale: 'ka' | 'en';
  today: string;
}

export interface AutomationAssistRuntime {
  draftAutomationRule: (
    request: AutomationAssistRequest,
    options: AutomationAssistOptions,
    context: AssistContext,
    model: AssistModelRef,
    extra?: { onFallback?: (from: AssistModelRef, to: AssistModelRef, reason: string) => void },
  ) => Promise<AutomationAssistResponse>;
  resolveModel: (id?: string) => AssistModelRef | undefined;
}

let runtime: AutomationAssistRuntime | undefined;
/** The runtime, required on first use so this module loads without it (specs). */
function assistRuntime(): AutomationAssistRuntime {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  runtime ??= require('@fit/agent') as AutomationAssistRuntime;
  return runtime;
}

/**
 * `POST /automation/assist` — turns an operator's request into a rule draft.
 *
 * The branches, plans and tags the model may reference come only from this
 * gym's tenant-scoped catalog ({@link AutomationService.catalog}), never from
 * the request body, and the gym is {@link TenantContext.gymId}. Nothing is
 * saved: the draft goes back to the builder form.
 */
@Injectable()
export class AutomationAssistService {
  private readonly logger = new Logger(AutomationAssistService.name);

  constructor(
    private readonly automation: AutomationService,
    private readonly prisma: TenantPrismaService,
    private readonly tenant: TenantContext,
  ) {}

  /** The `@fit/agent` runtime — a method so a spec can stand in for it. */
  protected runtime(): AutomationAssistRuntime {
    return assistRuntime();
  }

  async assist(request: AutomationAssistRequest): Promise<AutomationAssistResponse> {
    const agent = this.runtime();
    const model = agent.resolveModel(request.model);
    if (!model) {
      this.logger.error(
        `automation assist not configured: no provider key is set (requested: ${request.model ?? 'default'})`,
      );
      throw new ServiceUnavailableException({
        message: AUTOMATION_ASSIST_ERROR_CODES.notConfigured,
        code: AUTOMATION_ASSIST_ERROR_CODES.notConfigured,
      });
    }

    const gymId = this.tenant.gymId;
    const [catalog, gym] = await Promise.all([
      this.automation.catalog(),
      // `Gym` is the tenant root, outside the scoped models — pin the id.
      this.prisma.client.gym.findUnique({
        where: { id: gymId },
        select: { name: true, slug: true, settings: true },
      }),
    ]);
    if (!gym) throw new Error(`Cannot assist: gym ${gymId} does not exist`);

    const settings = gymSettingsStoredSchema.safeParse(gym.settings ?? {});
    const timezone = settings.success ? settings.data.locale.timezone : DEFAULT_TIMEZONE;
    const context: AssistContext = {
      gym: { name: gym.name, slug: gym.slug },
      locale: request.locale,
      today: isoDateIn(timezone),
    };

    const onFallback = (from: AssistModelRef, to: AssistModelRef, reason: string): void => {
      this.logger.warn(
        `automation assist falling back from ${from.provider}/${from.modelId} to ${to.provider}/${to.modelId}: ${reason}`,
      );
    };

    try {
      return await agent.draftAutomationRule(request, catalog.conditionOptions, context, model, {
        onFallback,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `automation assist failed [${model.provider}/${model.modelId}]: ${message}`,
        err instanceof Error ? err.stack : undefined,
      );
      throw new BadGatewayException({
        message: AUTOMATION_ASSIST_ERROR_CODES.failed,
        code: AUTOMATION_ASSIST_ERROR_CODES.failed,
      });
    }
  }
}
