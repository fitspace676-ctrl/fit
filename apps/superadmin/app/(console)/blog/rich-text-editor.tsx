'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import { Button } from '@fit/ui-kit';
import { IMAGE_ACCEPT, uploadBlogImage } from './upload';

const styles = stylex.create({
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  label: {
    fontSize: '0.875rem',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  },
  shell: {
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-surface)',
    overflow: 'hidden',
  },
  toolbar: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.25rem',
    paddingInline: '0.5rem',
    paddingBlock: '0.5rem',
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--color-border)',
  },
  divider: {
    width: '1px',
    marginInline: '0.25rem',
    backgroundColor: 'var(--color-border)',
  },
  body: {
    paddingInline: '1rem',
    paddingBlock: '0.75rem',
    minHeight: '18rem',
  },
  hidden: {
    display: 'none',
  },
});

/** Links the API keeps: anything else is stripped on save anyway. */
const SAFE_LINK = /^(https?:\/\/|mailto:)/i;

const EXTENSIONS = [
  StarterKit.configure({
    heading: { levels: [2, 3] },
    // Configured below with the blog's own rules.
    link: false,
  }),
  Link.configure({
    openOnClick: false,
    autolink: true,
    protocols: ['mailto'],
    HTMLAttributes: { rel: 'noopener noreferrer', target: null },
  }),
  Image.configure({ inline: false }),
];

/**
 * The post body, as WYSIWYG. Tiptap writes HTML; the API sanitises it to the
 * blog's allow-list on save, so the toolbar offers exactly what survives:
 * headings, emphasis, lists, quotes, links and uploaded images.
 *
 * Content is read once on mount — the form remounts the editor per language
 * tab — and every edit is reported back as HTML (`''` when empty).
 */
export function RichTextEditor({
  label,
  value,
  onChange,
  onError,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (html: string) => void;
  onError: (message: string | null) => void;
  disabled?: boolean;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  // Every option is held stable: `useEditor` compares them on each render and
  // pushes any change into the live view, which costs a re-layout per keystroke.
  const [initialContent] = useState(value);
  const changeRef = useRef(onChange);
  changeRef.current = onChange;
  const editorProps = useMemo(
    () => ({ attributes: { 'aria-label': label, class: 'blog-prose blog-editor' } }),
    [label],
  );

  const editor = useEditor({
    // Rendered on the server first; creating the view there would mismatch.
    immediatelyRender: false,
    extensions: EXTENSIONS,
    content: initialContent,
    editorProps,
    onUpdate: ({ editor: current }) => {
      changeRef.current(current.isEmpty ? '' : current.getHTML());
    },
  });

  useEffect(() => {
    editor?.setEditable(!disabled, false);
  }, [editor, disabled]);

  const active = useEditorState({
    editor,
    selector: ({ editor: current }) =>
      current
        ? {
            h2: current.isActive('heading', { level: 2 }),
            h3: current.isActive('heading', { level: 3 }),
            bold: current.isActive('bold'),
            italic: current.isActive('italic'),
            bullet: current.isActive('bulletList'),
            ordered: current.isActive('orderedList'),
            quote: current.isActive('blockquote'),
            link: current.isActive('link'),
          }
        : null,
  });

  function setLink() {
    if (!editor) return;
    const previous = (editor.getAttributes('link').href as string | undefined) ?? '';
    const url = window.prompt('Link URL (https://… or mailto:…). Leave empty to remove.', previous);
    if (url === null) return;
    const trimmed = url.trim();
    if (trimmed === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    if (!SAFE_LINK.test(trimmed)) {
      onError('Links must start with https://, http:// or mailto:.');
      return;
    }
    onError(null);
    editor.chain().focus().extendMarkRange('link').setLink({ href: trimmed }).run();
    // Collapse to the link's end, so the next insert (an image) doesn't replace it.
    editor.commands.setTextSelection(editor.state.selection.to);
  }

  async function insertImage(file: File | undefined) {
    if (!editor || !file) return;
    onError(null);
    setUploading(true);
    try {
      const src = await uploadBlogImage(file);
      const alt = window.prompt('Describe the image (alt text, optional)', '') ?? '';
      editor.chain().focus().setImage({ src, alt: alt.trim() }).run();
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Upload failed.');
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  const off = disabled || !editor;
  const tool = (
    key: string,
    text: string,
    isActive: boolean | undefined,
    run: () => void,
    title?: string,
  ) => (
    <Button
      key={key}
      type="button"
      size="inline"
      variant={isActive ? 'secondary' : 'ghost'}
      label={text}
      title={title ?? text}
      aria-label={title ?? text}
      aria-pressed={isActive ?? false}
      disabled={off}
      onClick={run}
    />
  );

  return (
    <div {...stylex.props(styles.field)}>
      <span {...stylex.props(styles.label)}>{label}</span>
      <div {...stylex.props(styles.shell)}>
        <div
          role="toolbar"
          aria-label={`${label} formatting`}
          // Keep focus (and the selection) in the editor while a tool is clicked.
          onMouseDown={(event) => event.preventDefault()}
          {...stylex.props(styles.toolbar)}
        >
          {tool('h2', 'H2', active?.h2, () =>
            editor?.chain().focus().toggleHeading({ level: 2 }).run(),
          )}
          {tool('h3', 'H3', active?.h3, () =>
            editor?.chain().focus().toggleHeading({ level: 3 }).run(),
          )}
          <span aria-hidden {...stylex.props(styles.divider)} />
          {tool(
            'bold',
            'B',
            active?.bold,
            () => editor?.chain().focus().toggleBold().run(),
            'Bold',
          )}
          {tool(
            'italic',
            'I',
            active?.italic,
            () => editor?.chain().focus().toggleItalic().run(),
            'Italic',
          )}
          <span aria-hidden {...stylex.props(styles.divider)} />
          {tool(
            'bullet',
            '• List',
            active?.bullet,
            () => editor?.chain().focus().toggleBulletList().run(),
            'Bulleted list',
          )}
          {tool(
            'ordered',
            '1. List',
            active?.ordered,
            () => editor?.chain().focus().toggleOrderedList().run(),
            'Numbered list',
          )}
          {tool('quote', 'Quote', active?.quote, () =>
            editor?.chain().focus().toggleBlockquote().run(),
          )}
          <span aria-hidden {...stylex.props(styles.divider)} />
          {tool('link', 'Link', active?.link, setLink)}
          <Button
            type="button"
            size="inline"
            variant="ghost"
            label="Image"
            title="Upload and insert an image"
            loading={uploading}
            disabled={off}
            onClick={() => fileInput.current?.click()}
          />
        </div>
        <div {...stylex.props(styles.body)}>
          <EditorContent editor={editor} />
        </div>
      </div>
      <input
        ref={fileInput}
        type="file"
        accept={IMAGE_ACCEPT}
        aria-label={`${label} image file`}
        onChange={(event) => void insertImage(event.target.files?.[0])}
        {...stylex.props(styles.hidden)}
      />
    </div>
  );
}
