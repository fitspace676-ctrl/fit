// Astryx primitives demo (T11.3) — the acceptance route for the @fit/ui-web
// rebuild on Astryx. It renders EVERY primitive the library exports, straight
// from `@fit/ui-web`, so a reviewer can eyeball that each one resolves the Fit
// brand tokens (electric-indigo accent, ink neutrals) in both light and dark —
// toggle the portal theme and the whole board re-skins — and that the formacore
// prop APIs (`v`, `size`, `tone`, `glow`, `ring`, `invalid`, controlled Tabs …)
// still drive them unchanged.
//
// Btn / Badge / Card now render Astryx `Button` / `Badge` / `Card` underneath
// (Fit theme, T11.1). Icon, Progress, Dot, SkipLink, Avatar and the Field stack
// (Field/Input/Select/Textarea) stay brand-token equivalents during coexistence
// — the form controls keep their native, react-hook-form-compatible contract
// until the Astryx Form kit lands (T11.4).

import {
  Avatar,
  Badge,
  Btn,
  Card,
  Dot,
  Field,
  Icon,
  Input,
  Progress,
  Select,
  SkipLink,
  Textarea,
  type IconName,
  type Tone,
} from '@fit/ui-web';
import { PrimitivesTabs } from './primitives-tabs';

export const metadata = {
  title: 'Astryx primitives - FormaCore web',
  robots: { index: false, follow: false },
};

const TONES: Tone[] = ['ink', 'brand', 'success', 'warning', 'danger', 'accent', 'iris', 'flame'];
const ICONS: IconName[] = [
  'home',
  'calendar',
  'dumbbell',
  'bolt',
  'bell',
  'search',
  'star',
  'settings',
];

/** A titled section wrapper so the board reads top-to-bottom. */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold text-ink-900 dark:text-white">{title}</h2>
      {children}
    </section>
  );
}

export default function AstryxPrimitivesPage() {
  return (
    <main
      id="main-content"
      className="mx-auto flex max-w-5xl flex-col gap-12 px-6 py-12 text-ink-900 dark:text-white"
    >
      <SkipLink />

      <header className="flex flex-col gap-2">
        <h1 className="font-display text-3xl font-bold">@fit/ui-web on Astryx</h1>
        <p className="max-w-2xl text-sm text-ink-600 dark:text-ink-300">
          Every shared primitive, rendered from the package on the Astryx-themed portal. Buttons,
          badges and cards are Astryx components under the Fit brand theme; the rest are brand-token
          equivalents. Switch the portal light/dark toggle to check both skins.
        </p>
      </header>

      <Section title="Btn — variants">
        <div className="flex flex-wrap items-center gap-3">
          <Btn v="primary">Primary</Btn>
          <Btn v="white">White</Btn>
          <Btn v="glass">Glass</Btn>
          <Btn v="outline">Outline</Btn>
          <Btn v="ghost">Ghost</Btn>
          <Btn v="ink">Ink</Btn>
          <Btn v="danger">Danger</Btn>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Btn size="sm">Small</Btn>
          <Btn size="md">Medium</Btn>
          <Btn size="lg">Large</Btn>
          <Btn v="primary" icon="plus">
            With icon
          </Btn>
          <Btn v="outline" iconRight="arrow">
            Trailing
          </Btn>
          <Btn v="ink" size="icon" icon="settings" aria-label="Settings" />
          <Btn v="primary" disabled>
            Disabled
          </Btn>
        </div>
      </Section>

      <Section title="Badge — tones">
        <div className="flex flex-wrap items-center gap-2">
          {TONES.map((tone) => (
            <Badge key={tone} tone={tone}>
              {tone}
            </Badge>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="success" icon="check">
            Active
          </Badge>
          <Badge tone="warning" icon="bolt">
            Pending
          </Badge>
          <Badge tone="brand" icon="star">
            Featured
          </Badge>
        </div>
      </Section>

      <Section title="Card">
        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="p-5">
            <h3 className="font-semibold">Plain card</h3>
            <p className="mt-1 text-sm text-ink-600 dark:text-ink-300">
              An Astryx surface with the Fit border, radius and background tokens.
            </p>
          </Card>
          <Card glow className="p-5">
            <h3 className="font-semibold">Glow card</h3>
            <p className="mt-1 text-sm text-ink-600 dark:text-ink-300">
              The dark-panel hairline sheen (`glow`) still renders on top.
            </p>
          </Card>
        </div>
      </Section>

      <Section title="Avatar">
        <div className="flex flex-wrap items-center gap-4">
          <Avatar src="https://i.pravatar.cc/80?img=1" alt="A" size="h-8 w-8" />
          <Avatar src="https://i.pravatar.cc/80?img=2" alt="B" size="h-11 w-11" />
          <Avatar src="https://i.pravatar.cc/80?img=3" alt="C" ring size="h-14 w-14" />
        </div>
      </Section>

      <Section title="Progress & Dot">
        <div className="flex max-w-md flex-col gap-3">
          <Progress value={28} label="Onboarding" />
          <Progress value={64} tone="bg-success-500" label="Goal" />
          <Progress value={92} tone="bg-warning-500" label="Storage" />
          <div className="flex items-center gap-4 text-sm">
            <span className="inline-flex items-center gap-1.5">
              <Dot c="bg-success-500" /> Online
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Dot c="bg-warning-500" /> Away
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Dot c="bg-danger-500" /> Offline
            </span>
          </div>
        </div>
      </Section>

      <Section title="Icon">
        <div className="flex flex-wrap items-center gap-4 text-ink-700 dark:text-ink-200">
          {ICONS.map((name) => (
            <Icon key={name} name={name} />
          ))}
        </div>
      </Section>

      <Section title="Field / Input / Select / Textarea">
        <div className="grid max-w-xl gap-4">
          <Field label="Full name" hint="As it appears on your ID.">
            {(id, meta) => (
              <Input id={id} placeholder="Ada Lovelace" aria-describedby={meta.describedById} />
            )}
          </Field>
          <Field label="Membership" htmlFor="demo-plan">
            <Select id="demo-plan" defaultValue="monthly">
              <option value="monthly">Monthly</option>
              <option value="annual">Annual</option>
              <option value="day-pass">Day pass</option>
            </Select>
          </Field>
          <Field label="Email" error="Enter a valid email address.">
            {(id, meta) => (
              <Input
                id={id}
                type="email"
                defaultValue="not-an-email"
                invalid={meta.invalid}
                aria-describedby={meta.describedById}
              />
            )}
          </Field>
          <Field label="Notes">
            {(id) => <Textarea id={id} placeholder="Anything the trainer should know…" />}
          </Field>
        </div>
      </Section>

      <Section title="Tabs">
        <PrimitivesTabs />
      </Section>
    </main>
  );
}
