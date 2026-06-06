'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  buildRRule,
  parseRRule,
  recurrenceSchema,
  type ClassTemplateStatus,
  type Recurrence,
} from '@fit/types';
import { createClassTemplateAction, updateClassTemplateAction } from './actions';
import { RecurrenceEditor } from './recurrence-editor';

/** A trainer / location option the default-assignment selects offer. */
export interface RelationOption {
  id: string;
  name: string;
}

/** Selectable initial statuses when creating (lifecycle change is a separate action). */
const CREATE_STATUSES: ReadonlyArray<{ value: ClassTemplateStatus; label: string }> = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'PAUSED', label: 'Paused' },
];

/** Shared field styling so create + edit render identically. */
const FIELD_CLASS =
  'w-full rounded-card border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400 disabled:bg-slate-50 disabled:text-slate-500';

/** The default recurrence a new template starts on — a weekly Monday class. */
const DEFAULT_RECURRENCE: Recurrence = {
  freq: 'WEEKLY',
  interval: 1,
  weekdays: ['MO'],
  end: { type: 'never' },
};

type Initial = {
  title: string;
  description: string;
  category: string;
  trainerId: string | null;
  locationId: string | null;
  room: string | null;
  capacity: number;
  durationMinutes: number;
  rrule: string;
  color: string;
  validFrom: string;
  validUntil: string | null;
};

type Props = {
  trainers: RelationOption[];
  locations: RelationOption[];
} & (
  | { mode: 'create' }
  | {
      mode: 'edit';
      templateId: string;
      initial: Initial;
    }
);

/** Today's date as `YYYY-MM-DD`, the default validity start for a new template. */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * The create / edit class-template form (T5.2). One component serves both flows.
 * Beyond the profile fields (title, description, category, capacity, duration,
 * color) it owns:
 *
 *  • The visual {@link RecurrenceEditor} — the structured cadence the stored
 *    RFC-5545 `rrule` string is derived from on submit (and re-parsed into on
 *    edit).
 *  • A validity window (`validFrom` required, `validUntil` optional/open-ended).
 *  • Optional default trainer / location selects, populated from the gym's active
 *    rosters.
 *
 * On success it navigates to the template's detail page; the discriminated
 * `ActionResult` surfaces any API error inline without throwing across the Server
 * Action boundary.
 */
export function ClassTemplateForm(props: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isEdit = props.mode === 'edit';
  const initial: Initial = isEdit
    ? props.initial
    : {
        title: '',
        description: '',
        category: '',
        trainerId: null,
        locationId: null,
        room: null,
        capacity: 12,
        durationMinutes: 60,
        rrule: buildRRule(DEFAULT_RECURRENCE),
        color: '#2563eb',
        validFrom: todayIso(),
        validUntil: null,
      };

  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [category, setCategory] = useState(initial.category);
  const [trainerId, setTrainerId] = useState(initial.trainerId ?? '');
  const [locationId, setLocationId] = useState(initial.locationId ?? '');
  const [room, setRoom] = useState(initial.room ?? '');
  const [capacity, setCapacity] = useState(String(initial.capacity));
  const [durationMinutes, setDurationMinutes] = useState(String(initial.durationMinutes));
  const [color, setColor] = useState(initial.color);
  const [validFrom, setValidFrom] = useState(initial.validFrom);
  const [validUntil, setValidUntil] = useState(initial.validUntil ?? '');
  const [status, setStatus] = useState<ClassTemplateStatus>('ACTIVE');
  // Seed the recurrence from the stored rrule (edit), falling back to the default.
  const [recurrence, setRecurrence] = useState<Recurrence>(
    () => parseRRule(initial.rrule) ?? DEFAULT_RECURRENCE,
  );

  function onSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setError(null);

    // The recurrence must be valid before we can derive an rrule for the wire.
    const parsedRecurrence = recurrenceSchema.safeParse(recurrence);
    if (!parsedRecurrence.success) {
      setError(parsedRecurrence.error.issues[0]?.message ?? 'Finish the recurrence');
      return;
    }

    const profile = {
      title,
      description,
      category,
      trainerId: trainerId === '' ? null : trainerId,
      locationId: locationId === '' ? null : locationId,
      room: room.trim() === '' ? null : room.trim(),
      capacity: Number(capacity),
      durationMinutes: Number(durationMinutes),
      rrule: buildRRule(parsedRecurrence.data),
      color,
      validFrom,
      validUntil: validUntil === '' ? null : validUntil,
    };

    startTransition(async () => {
      const result = isEdit
        ? await updateClassTemplateAction(props.templateId, profile)
        : await createClassTemplateAction({ ...profile, status });
      if (result.ok) {
        router.push(`/classes/${result.data.id}`);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  const cancelHref = isEdit ? `/classes/${props.templateId}` : '/classes';

  return (
    <form onSubmit={onSubmit} className="flex max-w-2xl flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="class-title" className="text-sm font-medium text-slate-700">
          Title
        </label>
        <input
          id="class-title"
          name="title"
          type="text"
          required
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          autoComplete="off"
          placeholder="e.g. Morning HIIT"
          className={FIELD_CLASS}
        />
      </div>

      <div className="flex flex-wrap gap-4">
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor="class-category" className="text-sm font-medium text-slate-700">
            Category <span className="font-normal text-slate-400">(optional)</span>
          </label>
          <input
            id="class-category"
            name="category"
            type="text"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            autoComplete="off"
            placeholder="e.g. Cardio"
            className={FIELD_CLASS}
          />
        </div>
        <div className="flex w-32 flex-col gap-1">
          <label htmlFor="class-color" className="text-sm font-medium text-slate-700">
            Color
          </label>
          <input
            id="class-color"
            name="color"
            type="color"
            value={color}
            onChange={(event) => setColor(event.target.value)}
            className="h-[38px] w-full rounded-card border border-slate-200 px-1 shadow-sm"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="class-description" className="text-sm font-medium text-slate-700">
          Description <span className="font-normal text-slate-400">(optional)</span>
        </label>
        <textarea
          id="class-description"
          name="description"
          rows={3}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="A short description of the class."
          className={FIELD_CLASS}
        />
      </div>

      <div className="flex flex-wrap gap-4">
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor="class-capacity" className="text-sm font-medium text-slate-700">
            Capacity
          </label>
          <input
            id="class-capacity"
            name="capacity"
            type="number"
            min="1"
            step="1"
            inputMode="numeric"
            required
            value={capacity}
            onChange={(event) => setCapacity(event.target.value)}
            placeholder="12"
            className={FIELD_CLASS}
          />
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor="class-duration" className="text-sm font-medium text-slate-700">
            Duration (minutes)
          </label>
          <input
            id="class-duration"
            name="durationMinutes"
            type="number"
            min="1"
            max="1440"
            step="1"
            inputMode="numeric"
            required
            value={durationMinutes}
            onChange={(event) => setDurationMinutes(event.target.value)}
            placeholder="60"
            className={FIELD_CLASS}
          />
        </div>
      </div>

      {/* The visual recurrence editor — produces the stored rrule on submit. */}
      <RecurrenceEditor value={recurrence} onChange={setRecurrence} />

      {/* Validity window. */}
      <div className="flex flex-wrap gap-4">
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor="class-valid-from" className="text-sm font-medium text-slate-700">
            Starts
          </label>
          <input
            id="class-valid-from"
            name="validFrom"
            type="date"
            required
            value={validFrom}
            onChange={(event) => setValidFrom(event.target.value)}
            className={FIELD_CLASS}
          />
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor="class-valid-until" className="text-sm font-medium text-slate-700">
            Ends <span className="font-normal text-slate-400">(blank = open-ended)</span>
          </label>
          <input
            id="class-valid-until"
            name="validUntil"
            type="date"
            min={validFrom}
            value={validUntil}
            onChange={(event) => setValidUntil(event.target.value)}
            className={FIELD_CLASS}
          />
        </div>
      </div>

      {/* Default trainer / location / room. */}
      <div className="flex flex-wrap gap-4">
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor="class-trainer" className="text-sm font-medium text-slate-700">
            Trainer <span className="font-normal text-slate-400">(optional)</span>
          </label>
          <select
            id="class-trainer"
            name="trainerId"
            value={trainerId}
            onChange={(event) => setTrainerId(event.target.value)}
            className={FIELD_CLASS}
          >
            <option value="">No default trainer</option>
            {props.trainers.map((trainer) => (
              <option key={trainer.id} value={trainer.id}>
                {trainer.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor="class-location" className="text-sm font-medium text-slate-700">
            Location <span className="font-normal text-slate-400">(optional)</span>
          </label>
          <select
            id="class-location"
            name="locationId"
            value={locationId}
            onChange={(event) => setLocationId(event.target.value)}
            className={FIELD_CLASS}
          >
            <option value="">No default location</option>
            {props.locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="class-room" className="text-sm font-medium text-slate-700">
          Room <span className="font-normal text-slate-400">(optional)</span>
        </label>
        <input
          id="class-room"
          name="room"
          type="text"
          value={room}
          onChange={(event) => setRoom(event.target.value)}
          autoComplete="off"
          placeholder="e.g. Studio A"
          className={FIELD_CLASS}
        />
      </div>

      {!isEdit ? (
        <div className="flex flex-col gap-1">
          <label htmlFor="class-status" className="text-sm font-medium text-slate-700">
            Status
          </label>
          <select
            id="class-status"
            name="status"
            value={status}
            onChange={(event) => setStatus(event.target.value as ClassTemplateStatus)}
            className={FIELD_CLASS}
          >
            {CREATE_STATUSES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="rounded-card bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-card bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {pending ? 'Saving…' : isEdit ? 'Save changes' : 'Create class'}
        </button>
        <Link href={cancelHref} className="text-sm font-medium text-slate-500 hover:text-slate-700">
          Cancel
        </Link>
      </div>
    </form>
  );
}
