'use client';

import { type FormEvent, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import * as stylex from '@stylexjs/stylex';
import {
  BLOG_SLUG_PATTERN,
  type AdminBlogPost,
  type BlogAuthor,
  type BlogCategory,
  type BlogLang,
  type CreateBlogPostInput,
} from '@fit/types';
import {
  Badge,
  Banner,
  Button,
  Card,
  ConfirmDialog,
  Field,
  SelectField,
  Tabs,
  TextareaField,
} from '@fit/ui-kit';
import { ButtonLink } from '@/components/button-link';
import {
  createBlogPostAction,
  deleteBlogPostAction,
  publishBlogPostAction,
  unpublishBlogPostAction,
  updateBlogPostAction,
} from './actions';
import { ImageField } from './image-field';
import { RichTextEditor } from './rich-text-editor';
import { VISIBILITY, formatWhen } from './shared';

const styles = stylex.create({
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.25rem',
  },
  stack: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  sectionTitle: {
    margin: 0,
    fontSize: '1rem',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
  },
  hint: {
    margin: 0,
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(16rem, 1fr))',
    gap: '1rem',
  },
  saveBar: {
    position: 'sticky',
    bottom: 0,
    zIndex: 1,
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.75rem',
    paddingBlock: '0.75rem',
    backgroundColor: 'var(--color-background-body)',
    borderTopWidth: '1px',
    borderTopStyle: 'solid',
    borderTopColor: 'var(--color-border)',
  },
  row: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '0.5rem',
  },
  status: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '0.5rem',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  when: {
    fontFamily: 'var(--font-family-code)',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  schedule: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    gap: '0.5rem',
  },
  dirty: {
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
});

interface LangFields {
  title: string;
  excerpt: string;
  content: string;
  metaTitle: string;
  metaDescription: string;
}

interface FormState {
  ka: LangFields;
  en: LangFields;
  slug: string;
  categoryId: string;
  authorId: string;
  tags: string;
  coverImageUrl: string | null;
  ogImageUrl: string | null;
}

function fromPost(post: AdminBlogPost | null): FormState {
  return {
    ka: {
      title: post?.titleKa ?? '',
      excerpt: post?.excerptKa ?? '',
      content: post?.contentHtmlKa ?? '',
      metaTitle: post?.metaTitleKa ?? '',
      metaDescription: post?.metaDescriptionKa ?? '',
    },
    en: {
      title: post?.titleEn ?? '',
      excerpt: post?.excerptEn ?? '',
      content: post?.contentHtmlEn ?? '',
      metaTitle: post?.metaTitleEn ?? '',
      metaDescription: post?.metaDescriptionEn ?? '',
    },
    slug: post?.slug ?? '',
    categoryId: post?.categoryId ?? '',
    authorId: post?.authorId ?? '',
    tags: post?.tags.join(', ') ?? '',
    coverImageUrl: post?.coverImageUrl ?? null,
    ogImageUrl: post?.ogImageUrl ?? null,
  };
}

/** The request body for this form's state; blanks become `null` (cleared). */
function toBody(state: FormState): CreateBlogPostInput {
  const blank = (value: string) => (value.trim() === '' ? null : value.trim());
  return {
    slug: state.slug.trim(),
    titleKa: state.ka.title.trim(),
    excerptKa: blank(state.ka.excerpt),
    contentHtmlKa: state.ka.content,
    metaTitleKa: blank(state.ka.metaTitle),
    metaDescriptionKa: blank(state.ka.metaDescription),
    titleEn: blank(state.en.title),
    excerptEn: blank(state.en.excerpt),
    contentHtmlEn: state.en.content || null,
    metaTitleEn: blank(state.en.metaTitle),
    metaDescriptionEn: blank(state.en.metaDescription),
    coverImageUrl: state.coverImageUrl,
    ogImageUrl: state.ogImageUrl,
    tags: state.tags
      .split(',')
      .map((tag) => tag.trim().toLowerCase())
      .filter(Boolean),
    categoryId: state.categoryId || null,
    authorId: state.authorId || null,
  };
}

/** Georgian → Latin, so a slug can be drawn from the Georgian title. */
const GEORGIAN: Record<string, string> = {
  ა: 'a',
  ბ: 'b',
  გ: 'g',
  დ: 'd',
  ე: 'e',
  ვ: 'v',
  ზ: 'z',
  თ: 't',
  ი: 'i',
  კ: 'k',
  ლ: 'l',
  მ: 'm',
  ნ: 'n',
  ო: 'o',
  პ: 'p',
  ჟ: 'zh',
  რ: 'r',
  ს: 's',
  ტ: 't',
  უ: 'u',
  ფ: 'p',
  ქ: 'k',
  ღ: 'gh',
  ყ: 'q',
  შ: 'sh',
  ჩ: 'ch',
  ც: 'ts',
  ძ: 'dz',
  წ: 'ts',
  ჭ: 'ch',
  ხ: 'kh',
  ჯ: 'j',
  ჰ: 'h',
};

function slugify(title: string): string {
  return Array.from(title.toLowerCase())
    .map((char) => GEORGIAN[char] ?? char)
    .join('')
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)
    .replace(/-+$/, '');
}

/** An ISO instant as a `datetime-local` value in the reader's own zone. */
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

const LANG_TABS = [
  { value: 'ka' as const, label: 'Georgian (KA)' },
  { value: 'en' as const, label: 'English (EN)' },
];

/**
 * Create or edit one post. Both languages sit behind tabs; everything outside
 * the tabs is shared. A new post saves as a draft and moves to its own edit
 * screen, where the publishing panel appears.
 *
 * Publishing saves unsaved edits first, so "Publish now" never puts an older
 * version live than the one on screen.
 */
export function PostForm({
  post: initial,
  categories,
  authors,
}: {
  post: AdminBlogPost | null;
  categories: BlogCategory[];
  authors: BlogAuthor[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [post, setPost] = useState(initial);
  const [state, setState] = useState(() => fromPost(initial));
  const [saved, setSaved] = useState(() => JSON.stringify(toBody(fromPost(initial))));
  // An existing post keeps its slug: it is a live URL once published.
  const [slugTouched, setSlugTouched] = useState(initial !== null);
  const [lang, setLang] = useState<BlogLang>('ka');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [scheduleAt, setScheduleAt] = useState(() =>
    initial?.visibility === 'scheduled' ? toLocalInput(initial.publishAt) : '',
  );
  const [confirmDelete, setConfirmDelete] = useState(false);

  const body = useMemo(() => toBody(state), [state]);
  const dirty = JSON.stringify(body) !== saved;
  const slugInvalid = state.slug !== '' && !BLOG_SLUG_PATTERN.test(state.slug);

  function setLangField(which: BlogLang, field: keyof LangFields, value: string) {
    setState((prev) => {
      const next = { ...prev, [which]: { ...prev[which], [field]: value } };
      if (which === 'ka' && field === 'title' && !slugTouched) next.slug = slugify(value);
      return next;
    });
  }

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setState((prev) => ({ ...prev, [key]: value }));
  }

  /** Save the form; returns the saved post, or `null` after showing the error. */
  async function save(): Promise<AdminBlogPost | null> {
    if (body.titleKa === '') {
      setLang('ka');
      setError('The Georgian title is required.');
      return null;
    }
    if (!BLOG_SLUG_PATTERN.test(body.slug)) {
      setError('Slug: use lowercase Latin letters, digits and single hyphens.');
      return null;
    }
    const result = post
      ? await updateBlogPostAction(post.id, body)
      : await createBlogPostAction(body);
    if (!result.ok) {
      setError(result.error);
      return null;
    }
    setPost(result.data);
    setSaved(JSON.stringify(body));
    return result.data;
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const wasNew = post === null;
      const result = await save();
      if (!result) return;
      if (wasNew) {
        router.push(`/blog/${result.id}`);
      } else {
        setNotice('Saved.');
        router.refresh();
      }
    });
  }

  function publish(at?: string) {
    if (!post) return;
    setError(null);
    setNotice(null);
    startTransition(async () => {
      if (dirty && !(await save())) return;
      const result = await publishBlogPostAction(post.id, at);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setPost(result.data);
      setNotice(
        result.data.visibility === 'scheduled'
          ? `Scheduled for ${formatWhen(result.data.publishAt)}.`
          : 'Published.',
      );
      router.refresh();
    });
  }

  function schedule() {
    if (!scheduleAt) {
      setError('Pick a date and time to schedule.');
      return;
    }
    const when = new Date(scheduleAt);
    if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now()) {
      setError('The schedule must be in the future. Use Publish now to go live immediately.');
      return;
    }
    publish(when.toISOString());
  }

  function unpublish() {
    if (!post) return;
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await unpublishBlogPostAction(post.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setPost(result.data);
      setScheduleAt('');
      setNotice('Moved back to draft.');
      router.refresh();
    });
  }

  function remove() {
    if (!post) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteBlogPostAction(post.id);
      if (!result.ok) {
        setError(result.error);
        setConfirmDelete(false);
        return;
      }
      router.push('/blog');
    });
  }

  const fields = state[lang];
  const isKa = lang === 'ka';

  return (
    <form onSubmit={onSubmit} {...stylex.props(styles.form)}>
      {error ? <Banner tone="error">{error}</Banner> : null}
      {notice ? <Banner tone="success">{notice}</Banner> : null}

      <Card>
        <Tabs
          label="Post language"
          idPrefix="post-lang"
          value={lang}
          onChange={setLang}
          items={LANG_TABS}
        >
          {/* Keyed so the editor remounts with the other language's content. */}
          <div key={lang} {...stylex.props(styles.stack)}>
            {isKa ? null : (
              <p {...stylex.props(styles.hint)}>
                English is optional. Leave the title empty and the post appears only on the Georgian
                blog.
              </p>
            )}
            <Field
              label={isKa ? 'Title (required)' : 'Title'}
              size="field"
              value={fields.title}
              onChange={(event) => setLangField(lang, 'title', event.target.value)}
              required={isKa}
              maxLength={200}
              disabled={pending}
            />
            <TextareaField
              label="Excerpt"
              hint="One or two sentences for the blog list and as the default meta description."
              rows={2}
              value={fields.excerpt}
              onChange={(event) => setLangField(lang, 'excerpt', event.target.value)}
              maxLength={500}
              disabled={pending}
            />
            <RichTextEditor
              label="Content"
              value={fields.content}
              onChange={(html) => setLangField(lang, 'content', html)}
              onError={setError}
              disabled={pending}
            />
            <div {...stylex.props(styles.grid)}>
              <Field
                label="Meta title"
                hint="Search result title. Defaults to the title."
                value={fields.metaTitle}
                onChange={(event) => setLangField(lang, 'metaTitle', event.target.value)}
                maxLength={120}
                disabled={pending}
              />
              <TextareaField
                label="Meta description"
                hint="Search result snippet. Defaults to the excerpt."
                rows={2}
                value={fields.metaDescription}
                onChange={(event) => setLangField(lang, 'metaDescription', event.target.value)}
                maxLength={320}
                disabled={pending}
              />
            </div>
          </div>
        </Tabs>
      </Card>

      <Card>
        <div {...stylex.props(styles.stack)}>
          <h2 {...stylex.props(styles.sectionTitle)}>Details</h2>
          <div {...stylex.props(styles.grid)}>
            <Field
              label="Slug"
              hint={
                slugInvalid
                  ? 'Lowercase Latin letters, digits and single hyphens only.'
                  : `formacore.io/blog/${state.slug || '…'}`
              }
              invalid={slugInvalid}
              value={state.slug}
              onChange={(event) => {
                setSlugTouched(true);
                set('slug', event.target.value.toLowerCase());
              }}
              required
              maxLength={120}
              disabled={pending}
            />
            <Field
              label="Tags"
              hint="Comma-separated, e.g. training, nutrition"
              value={state.tags}
              onChange={(event) => set('tags', event.target.value)}
              disabled={pending}
            />
            <SelectField
              label="Category"
              value={state.categoryId}
              onChange={(event) => set('categoryId', event.target.value)}
              options={[
                { value: '', label: 'No category' },
                ...categories.map((category) => ({
                  value: category.id,
                  label: `${category.nameEn} · ${category.nameKa}`,
                })),
              ]}
              disabled={pending}
            />
            <SelectField
              label="Author"
              value={state.authorId}
              onChange={(event) => set('authorId', event.target.value)}
              options={[
                { value: '', label: 'No author' },
                ...authors.map((author) => ({ value: author.id, label: author.name })),
              ]}
              disabled={pending}
            />
          </div>
          <div {...stylex.props(styles.grid)}>
            <ImageField
              label="Cover image"
              hint="Shown on the blog list and at the top of the post."
              value={state.coverImageUrl}
              onChange={(url) => set('coverImageUrl', url)}
              onError={setError}
              disabled={pending}
            />
            <ImageField
              label="Social image (OG)"
              hint="Used when the post is shared. Defaults to the cover. 1200×630 works best."
              value={state.ogImageUrl}
              onChange={(url) => set('ogImageUrl', url)}
              onError={setError}
              disabled={pending}
            />
          </div>
        </div>
      </Card>

      {post ? (
        <Card>
          <div {...stylex.props(styles.stack)}>
            <h2 {...stylex.props(styles.sectionTitle)}>Publishing</h2>
            <div {...stylex.props(styles.status)}>
              <Badge
                label={VISIBILITY[post.visibility].label}
                tone={VISIBILITY[post.visibility].tone}
              />
              {post.visibility === 'scheduled' ? (
                <span>
                  goes live <span {...stylex.props(styles.when)}>{formatWhen(post.publishAt)}</span>
                </span>
              ) : null}
              {post.visibility === 'published' ? (
                <span>
                  live since{' '}
                  <span {...stylex.props(styles.when)}>{formatWhen(post.publishAt)}</span>
                </span>
              ) : null}
            </div>
            <div {...stylex.props(styles.row)}>
              {post.visibility === 'published' ? null : (
                <Button
                  type="button"
                  variant="primary"
                  size="card"
                  label="Publish now"
                  loading={pending}
                  onClick={() => publish()}
                />
              )}
              {post.status === 'PUBLISHED' ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="card"
                  label="Unpublish"
                  loading={pending}
                  onClick={unpublish}
                />
              ) : null}
            </div>
            <div {...stylex.props(styles.schedule)}>
              <Field
                label="Schedule for"
                type="datetime-local"
                hint="Your local time."
                value={scheduleAt}
                onChange={(event) => setScheduleAt(event.target.value)}
                disabled={pending}
              />
              <Button
                type="button"
                variant="secondary"
                size="card"
                label={post.visibility === 'scheduled' ? 'Reschedule' : 'Schedule'}
                loading={pending}
                onClick={schedule}
              />
            </div>
            <div {...stylex.props(styles.row)}>
              <Button
                type="button"
                variant="ghost"
                size="inline"
                label="Delete post"
                disabled={pending}
                onClick={() => setConfirmDelete(true)}
              />
            </div>
          </div>
        </Card>
      ) : null}

      <div {...stylex.props(styles.saveBar)}>
        <span {...stylex.props(styles.dirty)}>
          {post
            ? dirty
              ? 'Unsaved changes'
              : 'All changes saved'
            : 'New posts are saved as drafts.'}
        </span>
        <div {...stylex.props(styles.row)}>
          {post ? (
            <ButtonLink href={`/blog/${post.id}/preview`} label="Preview" variant="ghost" />
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="card"
              label="Cancel"
              disabled={pending}
              onClick={() => router.push('/blog')}
            />
          )}
          <Button
            type="submit"
            variant="primary"
            size="card"
            label={post ? 'Save' : 'Create draft'}
            loading={pending}
            disabled={post !== null && !dirty}
          />
        </div>
      </div>

      {post ? (
        <ConfirmDialog
          open={confirmDelete}
          onClose={() => setConfirmDelete(false)}
          title={`Delete “${post.titleKa}”?`}
          description="The post is removed in both languages. If it is live, its URL stops working. This cannot be undone."
          cancelLabel="Cancel"
          confirmLabel="Delete"
          confirmVariant="destructive"
          loading={pending}
          onConfirm={remove}
        />
      ) : null}
    </form>
  );
}
