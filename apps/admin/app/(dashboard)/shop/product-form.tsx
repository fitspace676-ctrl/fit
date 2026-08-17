'use client';

import { useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as stylex from '@stylexjs/stylex';
import {
  MAX_PRODUCT_CATEGORY_NAME,
  MAX_PRODUCT_IMAGES,
  DEFAULT_LOW_STOCK_THRESHOLD,
  MAX_PRODUCT_VARIANTS,
  type AdminProductCategory,
  type ProductStatus,
  type ProductVariant,
} from '@fit/types';
import { Button } from '@fit/ui-kit';
import { useGymCurrency } from '@/components/gym-currency';
import { inputToMinor, minorToInput } from './format-price';
import {
  createProductAction,
  createProductCategoryAction,
  requestProductImageUploadAction,
  updateProductAction,
} from './actions';

/** Selectable initial statuses when creating (lifecycle change is a separate action). */
const CREATE_STATUSES: ReadonlyArray<{ value: ProductStatus; label: string }> = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INACTIVE', label: 'Inactive' },
];

/** Accepted image MIME types for the gallery, matching the storage service map. */
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
/** Client-side size ceiling (bytes) — a friendly guard before the signed PUT. */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const styles = stylex.create({
  form: {
    display: 'flex',
    maxWidth: '42rem',
    flexDirection: 'column',
    gap: '1rem',
    borderRadius: 'var(--radius-container)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-surface)',
    padding: '1.25rem',
  },
  // In a drawer the host already supplies the surface, padding, and width, so the
  // form drops its own card chrome and grows to fill the height (letting the footer
  // stick to the bottom on short forms).
  formInDrawer: {
    minHeight: '100%',
    maxWidth: 'none',
    borderRadius: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
    padding: 0,
  },
  galleryGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  label: {
    fontSize: '0.875rem',
    fontWeight: 500,
    color: 'var(--color-text-primary)',
  },
  optional: {
    fontWeight: 400,
    color: 'var(--color-text-secondary)',
  },
  galleryRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.75rem',
  },
  galleryItem: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.25rem',
  },
  galleryImg: {
    height: '5rem',
    width: '5rem',
    borderRadius: 'var(--radius-container)',
    objectFit: 'cover',
    boxShadow: '0 0 0 1px var(--color-border)',
  },
  galleryControls: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    fontSize: '0.75rem',
  },
  primaryTag: {
    fontWeight: 500,
    color: 'var(--color-text-accent)',
  },
  makePrimaryBtn: {
    borderStyle: 'none',
    backgroundColor: 'transparent',
    padding: 0,
    fontSize: '0.75rem',
    fontWeight: 500,
    cursor: 'pointer',
    color: {
      default: 'var(--color-text-secondary)',
      ':hover': 'var(--color-text-accent)',
    },
  },
  removeBtn: {
    borderStyle: 'none',
    backgroundColor: 'transparent',
    padding: 0,
    fontSize: '0.75rem',
    fontWeight: 500,
    cursor: 'pointer',
    color: {
      default: 'var(--color-text-secondary)',
      ':hover': 'var(--color-error)',
    },
  },
  galleryEmpty: {
    display: 'flex',
    height: '5rem',
    width: '100%',
    maxWidth: '20rem',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 'var(--radius-container)',
    backgroundColor: 'var(--color-accent-muted)',
    fontSize: '0.75rem',
    fontWeight: 600,
    color: 'var(--color-text-accent)',
  },
  fileGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  fileInput: {
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
    opacity: {
      default: 1,
      ':disabled': 0.5,
    },
    '::file-selector-button': {
      marginRight: '0.75rem',
      borderStyle: 'none',
      borderWidth: 0,
      borderRadius: 'var(--radius-element)',
      backgroundColor: 'var(--color-accent-muted)',
      paddingInline: '0.75rem',
      paddingBlock: '0.375rem',
      fontSize: '0.875rem',
      fontWeight: 500,
      color: 'var(--color-text-accent)',
      cursor: 'pointer',
    },
  },
  fileHint: {
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  uploadBanner: {
    margin: 0,
    borderRadius: 'var(--radius-inner)',
    backgroundColor: 'var(--color-warning-muted)',
    paddingInline: '0.75rem',
    paddingBlock: '0.5rem',
    fontSize: '0.875rem',
    color: 'var(--color-warning)',
  },
  input: {
    height: '2.75rem',
    width: '100%',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: {
      default: 'var(--color-border)',
      ':focus': 'var(--color-accent)',
    },
    backgroundColor: {
      default: 'var(--color-background-surface)',
      ':disabled': 'var(--color-background-muted)',
    },
    paddingInline: '0.875rem',
    fontSize: '0.875rem',
    color: {
      default: 'var(--color-text-primary)',
      ':disabled': 'var(--color-text-secondary)',
    },
    outline: 'none',
    '::placeholder': {
      color: 'var(--color-text-secondary)',
    },
  },
  /**
   * A value this form shows but does not own — an existing variant's count, which
   * moves through the product page's ledger. Read-only rather than disabled so it
   * still reads as data (and stays selectable), just not as an editable field.
   */
  inputReadOnly: {
    backgroundColor: 'var(--color-background-muted)',
    color: 'var(--color-text-secondary)',
    cursor: 'not-allowed',
  },
  textarea: {
    width: '100%',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: {
      default: 'var(--color-border)',
      ':focus': 'var(--color-accent)',
    },
    backgroundColor: 'var(--color-background-surface)',
    paddingInline: '0.875rem',
    paddingBlock: '0.625rem',
    fontSize: '0.875rem',
    color: 'var(--color-text-primary)',
    outline: 'none',
    '::placeholder': {
      color: 'var(--color-text-secondary)',
    },
  },
  priceRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '1rem',
  },
  labelOptional: {
    fontWeight: 400,
    color: 'var(--color-text-secondary)',
  },
  marginHint: {
    margin: 0,
    fontSize: '0.8125rem',
    color: 'var(--color-text-secondary)',
  },
  // The picker and its "New category" escape hatch share a row, so creating a
  // shelf reads as part of choosing one rather than a separate errand.
  categoryRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  categorySelect: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  categoryError: {
    margin: 0,
    fontSize: '0.8125rem',
    color: 'var(--color-error)',
  },
  priceGroup: {
    display: 'flex',
    flexGrow: 1,
    flexBasis: 0,
    flexDirection: 'column',
    gap: '0.25rem',
  },
  currencyGroup: {
    display: 'flex',
    width: '8rem',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  currencyValue: {
    margin: 0,
    display: 'flex',
    height: '2.5rem',
    alignItems: 'center',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  stockHint: {
    margin: 0,
    fontSize: '0.8125rem',
    color: 'var(--color-text-secondary)',
  },
  fieldset: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    margin: 0,
    borderWidth: 0,
    borderStyle: 'none',
    padding: 0,
    minInlineSize: 0,
  },
  legend: {
    padding: 0,
    fontSize: '0.875rem',
    fontWeight: 500,
    color: 'var(--color-text-primary)',
  },
  variantsWrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  variantHeadRow: {
    display: {
      default: 'none',
      '@media (min-width: 640px)': 'grid',
    },
    gridTemplateColumns: '1fr 1fr 7rem 5rem auto',
    gap: '0.5rem',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.6875rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.15em',
    color: 'var(--color-text-secondary)',
  },
  variantRow: {
    display: 'grid',
    gridTemplateColumns: {
      default: '1fr',
      '@media (min-width: 640px)': '1fr 1fr 7rem 5rem auto',
    },
    gap: '0.5rem',
    alignItems: {
      default: 'stretch',
      '@media (min-width: 640px)': 'center',
    },
  },
  variantRemoveBtn: {
    justifySelf: {
      default: 'start',
      '@media (min-width: 640px)': 'auto',
    },
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'transparent',
    paddingInline: '0.75rem',
    paddingBlock: '0.5rem',
    fontSize: '0.875rem',
    fontWeight: 500,
    cursor: 'pointer',
    color: {
      default: 'var(--color-text-secondary)',
      ':hover': 'var(--color-error)',
    },
  },
  noVariants: {
    margin: 0,
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  srOnly: {
    position: 'absolute',
    width: '1px',
    height: '1px',
    padding: 0,
    margin: '-1px',
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
    borderWidth: 0,
  },
  errorBanner: {
    margin: 0,
    borderRadius: 'var(--radius-inner)',
    backgroundColor: 'var(--color-error-muted)',
    paddingInline: '0.75rem',
    paddingBlock: '0.5rem',
    fontSize: '0.875rem',
    color: 'var(--color-error)',
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
  },
  footer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  actionsInDrawer: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: '0.75rem',
    width: '100%',
  },
  // Keeps Save/Cancel reachable without scrolling to the end of a long product.
  drawerFooter: {
    position: 'sticky',
    bottom: 0,
    zIndex: 1,
    marginTop: 'auto',
    paddingBlockStart: '1rem',
    paddingBlockEnd: '0.25rem',
    backgroundColor: 'var(--color-background-body)',
  },
  actionButton: {
    width: '100%',
    height: '3rem',
  },
  cancelLink: {
    fontSize: '0.875rem',
    fontWeight: 500,
    textDecoration: 'none',
    color: {
      default: 'var(--color-text-secondary)',
      ':hover': 'var(--color-text-primary)',
    },
  },
});

/** A variant row as the form edits it — prices are major-unit input strings here. */
interface VariantDraft {
  name: string;
  sku: string;
  /** Major-unit price string (blank = inherit the product's base price). */
  price: string;
  /** Stock as an input string. */
  stock: string;
}

type Initial = {
  name: string;
  description: string;
  priceAmount: number;
  costAmount: number | null;
  currency: string;
  images: string[];
  variants: ProductVariant[];
  /** Base-position count for a product with no variants; `null` is untracked. */
  stock: number | null;
  /** Per-product reorder cushion; `null` uses the shared default. */
  lowStockThreshold: number | null;
  categoryId: string | null;
};

/**
 * `onSuccess` / `onCancel` are the drawer contract (mirroring `MemberForm`): pass
 * them and the form reports completion to its host instead of navigating, and lays
 * itself out for a drawer (full-height, sticky footer, Cancel as a button rather
 * than a link back to a page). Omit them and it behaves as a standalone page form.
 */
type Props = {
  /**
   * The gym's category shelves, fetched by the hosting page. Empty is normal — a
   * gym that hasn't organised its catalogue — and the picker says so rather than
   * rendering a select with nothing in it.
   */
  categories: AdminProductCategory[];
} & (
  | {
      mode: 'create';
      onSuccess?: () => void;
      onCancel?: () => void;
    }
  | {
      mode: 'edit';
      productId: string;
      initial: Initial;
      onSuccess?: () => void;
      onCancel?: () => void;
    }
);

/** Map a stored variant to its editable draft (minor units → major-unit strings). */
function toDraft(variant: ProductVariant): VariantDraft {
  return {
    name: variant.name,
    sku: variant.sku,
    price: minorToInput(variant.priceAmount),
    stock: String(variant.stock),
  };
}

/** A blank variant draft for the "Add variant" button. */
function blankVariant(): VariantDraft {
  return { name: '', sku: '', price: '', stock: '0' };
}

/**
 * The create / edit product form (T4.6), rebuilt on brand-tokened StyleX (T11.22).
 * One component serves both flows. Beyond the profile fields (name, description,
 * base price, currency) it owns two richer editors:
 *
 *  • An image gallery — each chosen image is uploaded straight to R2 via a
 *    presigned `PUT` (minted by {@link requestProductImageUploadAction}); only the
 *    resulting public URLs are persisted, as an ordered list (the first is the
 *    primary). Images can be removed or promoted to primary. Upload failure (e.g.
 *    storage not configured) is non-fatal — the product can still be saved.
 *  • A variants editor — a dynamic list of `{ name, sku, price, stock }` rows; a
 *    blank price inherits the product's base price.
 *
 * On success it navigates to the product's detail page — unless hosted in a drawer
 * (see {@link Props}), where it hands control back to the host instead. The
 * discriminated `ActionResult` surfaces any API error inline without throwing
 * across the Server Action boundary.
 */
export function ProductForm(props: Props) {
  const router = useRouter();
  const gymCurrency = useGymCurrency();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isEdit = props.mode === 'edit';
  const initial: Initial = isEdit
    ? props.initial
    : {
        name: '',
        description: '',
        priceAmount: 0,
        costAmount: null,
        currency: gymCurrency,
        images: [],
        variants: [],
        stock: null,
        lowStockThreshold: null,
        categoryId: null,
      };

  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [price, setPrice] = useState(initial.priceAmount ? minorToInput(initial.priceAmount) : '');
  const [cost, setCost] = useState(
    initial.costAmount === null ? '' : minorToInput(initial.costAmount),
  );
  // A saved product keeps the currency it was created in; a new one is priced in
  // the gym's configured currency. Either way it is displayed, never edited.
  const currency = isEdit ? initial.currency : gymCurrency;
  const [images, setImages] = useState<string[]>(initial.images);
  const [variants, setVariants] = useState<VariantDraft[]>(initial.variants.map(toDraft));
  // Both kept as strings so an empty field stays empty — '' means "not tracked" /
  // "use the default", which is a different statement from the number 0.
  const [stock, setStock] = useState(initial.stock === null ? '' : String(initial.stock));
  const [threshold, setThreshold] = useState(
    initial.lowStockThreshold === null ? '' : String(initial.lowStockThreshold),
  );
  const [status, setStatus] = useState<ProductStatus>('ACTIVE');
  /**
   * How many variants this product already had when the form opened. Their counts
   * are the ledger's to move, not this form's — the save carries them over from
   * the record — so those cells are shown read-only. A row added here is a new
   * position with no history yet, so its opening count *is* set here.
   */
  const [countedVariants] = useState(initial.variants.length);
  // '' is the "No category" option; the submit maps it back to null. A product whose
  // category was deleted while this form was open falls back to '' rather than
  // submitting a dangling id.
  const [categoryId, setCategoryId] = useState<string>(
    initial.categoryId && props.categories.some((c) => c.id === initial.categoryId)
      ? initial.categoryId
      : '',
  );
  // The shelves start as the page fetched them and grow as one is created here, so
  // a category invented mid-form is selectable without abandoning what is typed.
  const [shelves, setShelves] = useState<AdminProductCategory[]>(props.categories);
  const [namingShelf, setNamingShelf] = useState(false);
  const [shelfName, setShelfName] = useState('');
  const [shelfError, setShelfError] = useState<string | null>(null);
  const [savingShelf, setSavingShelf] = useState(false);

  /**
   * Create a shelf from inside the form and select it.
   *
   * Without this the form is a dead end: the picker is empty, the only way out is
   * the manager on the catalog page, and getting there means losing everything
   * typed so far — which is how products end up uncategorised. A duplicate name
   * comes back as the API's `409` message and is shown inline; nothing else about
   * the form is touched either way.
   */
  async function createShelf(): Promise<void> {
    const name = shelfName.trim();
    if (!name) {
      return;
    }
    setSavingShelf(true);
    setShelfError(null);
    const result = await createProductCategoryAction({ name });
    setSavingShelf(false);
    if (!result.ok) {
      setShelfError(result.error);
      return;
    }
    setShelves((current) => [...current, result.data].sort((a, b) => a.name.localeCompare(b.name)));
    setCategoryId(result.data.id);
    setShelfName('');
    setNamingShelf(false);
  }

  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /** Upload the chosen image(s) to R2 via presigned PUTs, appending each public URL. */
  async function onImagesChange(event: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;
    setUploadError(null);

    const room = MAX_PRODUCT_IMAGES - images.length;
    if (room <= 0) {
      setUploadError(`A product can have at most ${MAX_PRODUCT_IMAGES} images.`);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setUploading(true);
    const uploaded: string[] = [];
    try {
      for (const file of files.slice(0, room)) {
        if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
          setUploadError('Choose JPEG, PNG, WebP, or GIF images.');
          continue;
        }
        if (file.size > MAX_IMAGE_BYTES) {
          setUploadError(`“${file.name}” is larger than 5 MB. Choose a smaller file.`);
          continue;
        }
        const signed = await requestProductImageUploadAction({
          contentType: file.type,
          contentLength: file.size,
          fileName: file.name,
        });
        if (!signed.ok) {
          setUploadError(signed.error);
          continue;
        }
        const put = await fetch(signed.data.url, {
          method: 'PUT',
          headers: { 'content-type': signed.data.contentType },
          body: file,
        });
        if (!put.ok) {
          setUploadError(`Upload failed (${put.status}). Please try again.`);
          continue;
        }
        if (!signed.data.publicUrl) {
          setUploadError('Images uploaded but no public URL is configured for storage.');
          continue;
        }
        uploaded.push(signed.data.publicUrl);
      }
      if (uploaded.length > 0) {
        setImages((prev) => [...prev, ...uploaded].slice(0, MAX_PRODUCT_IMAGES));
      }
    } catch {
      setUploadError('Could not upload an image. Check your connection and try again.');
    } finally {
      setUploading(false);
      // Allow re-selecting the same file(s) after an error.
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function removeImage(url: string): void {
    setImages((prev) => prev.filter((image) => image !== url));
    setUploadError(null);
  }

  /** Promote an image to primary (move it to the front of the gallery). */
  function makePrimary(url: string): void {
    setImages((prev) => [url, ...prev.filter((image) => image !== url)]);
  }

  function setVariant(index: number, patch: Partial<VariantDraft>): void {
    setVariants((prev) =>
      prev.map((variant, i) => (i === index ? { ...variant, ...patch } : variant)),
    );
  }

  function addVariant(): void {
    setVariants((prev) => (prev.length >= MAX_PRODUCT_VARIANTS ? prev : [...prev, blankVariant()]));
  }

  function removeVariant(index: number): void {
    setVariants((prev) => prev.filter((_, i) => i !== index));
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setError(null);

    // Drop fully-blank variant rows; map the rest to the wire shape (major → minor).
    const cleanedVariants = variants
      .filter((variant) => variant.name.trim().length > 0)
      .map((variant) => ({
        name: variant.name.trim(),
        sku: variant.sku.trim(),
        priceAmount: inputToMinor(variant.price),
        stock: Number(variant.stock.trim() || '0'),
      }));

    const profile = {
      name,
      description,
      priceAmount: inputToMinor(price) ?? 0,
      costAmount: cost.trim() === '' ? null : inputToMinor(cost),
      images,
      variants: cleanedVariants,
      // A product that carries variants counts per variant, so its base figure is
      // dropped rather than sent alongside — two counts would be two answers to
      // "how many do I have?". The API enforces the same rule.
      stock: cleanedVariants.length > 0 || stock.trim() === '' ? null : Number(stock.trim()),
      lowStockThreshold: threshold.trim() === '' ? null : Number(threshold.trim()),
      categoryId: categoryId === '' ? null : categoryId,
    };

    startTransition(async () => {
      const result = isEdit
        ? await updateProductAction(props.productId, profile)
        : await createProductAction({ ...profile, status });
      if (result.ok) {
        if (props.onSuccess) {
          props.onSuccess();
        } else {
          router.push(`/shop/${result.data.id}`);
        }
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  const cancelHref = isEdit ? `/shop/${props.productId}` : '/shop';
  const atImageLimit = images.length >= MAX_PRODUCT_IMAGES;
  const atVariantLimit = variants.length >= MAX_PRODUCT_VARIANTS;

  // Live profit margin from the entered base price + cost, shown as the operator
  // types (parity with the reference product editor's margin readout).
  const priceMinor = inputToMinor(price);
  const costMinor = cost.trim() === '' ? null : inputToMinor(cost);
  const marginPct =
    priceMinor && priceMinor > 0 && costMinor !== null
      ? Math.round(((priceMinor - costMinor) / priceMinor) * 100)
      : null;

  return (
    <form onSubmit={onSubmit} {...stylex.props(styles.form, props.onCancel && styles.formInDrawer)}>
      {/* Image gallery. */}
      <div {...stylex.props(styles.galleryGroup)}>
        <span {...stylex.props(styles.label)}>
          Image gallery <span {...stylex.props(styles.optional)}>(first is the primary)</span>
        </span>
        {images.length > 0 ? (
          <div {...stylex.props(styles.galleryRow)}>
            {images.map((url, index) => (
              <div key={url} {...stylex.props(styles.galleryItem)}>
                <img src={url} alt="" {...stylex.props(styles.galleryImg)} />
                <div {...stylex.props(styles.galleryControls)}>
                  {index === 0 ? (
                    <span {...stylex.props(styles.primaryTag)}>Primary</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => makePrimary(url)}
                      {...stylex.props(styles.makePrimaryBtn)}
                    >
                      Make primary
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => removeImage(url)}
                    {...stylex.props(styles.removeBtn)}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <span {...stylex.props(styles.galleryEmpty)}>No images yet</span>
        )}
        <div {...stylex.props(styles.fileGroup)}>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPTED_IMAGE_TYPES.join(',')}
            onChange={(event) => void onImagesChange(event)}
            disabled={uploading || pending || atImageLimit}
            {...stylex.props(styles.fileInput)}
          />
          <span {...stylex.props(styles.fileHint)}>
            {uploading
              ? 'Uploading…'
              : atImageLimit
                ? `Maximum of ${MAX_PRODUCT_IMAGES} images reached.`
                : `JPEG, PNG, WebP or GIF, up to 5 MB each (max ${MAX_PRODUCT_IMAGES}).`}
          </span>
        </div>
        {uploadError ? (
          <p role="alert" {...stylex.props(styles.uploadBanner)}>
            {uploadError}
          </p>
        ) : null}
      </div>

      <div {...stylex.props(styles.fieldGroup)}>
        <label htmlFor="product-name" {...stylex.props(styles.label)}>
          Name
        </label>
        <input
          id="product-name"
          name="name"
          type="text"
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoComplete="off"
          {...stylex.props(styles.input)}
        />
      </div>

      <div {...stylex.props(styles.fieldGroup)}>
        <label htmlFor="product-description" {...stylex.props(styles.label)}>
          Description <span {...stylex.props(styles.optional)}>(optional)</span>
        </label>
        <textarea
          id="product-description"
          name="description"
          rows={3}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="A short description of the product."
          {...stylex.props(styles.textarea)}
        />
      </div>

      <div {...stylex.props(styles.priceRow)}>
        <div {...stylex.props(styles.priceGroup)}>
          <label htmlFor="product-price" {...stylex.props(styles.label)}>
            Base price ({currency})
          </label>
          <input
            id="product-price"
            name="price"
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            placeholder="0.00"
            {...stylex.props(styles.input)}
          />
        </div>
        <div {...stylex.props(styles.priceGroup)}>
          <label htmlFor="product-cost" {...stylex.props(styles.label)}>
            Cost <span {...stylex.props(styles.labelOptional)}>(optional)</span>
          </label>
          <input
            id="product-cost"
            name="cost"
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={cost}
            onChange={(event) => setCost(event.target.value)}
            placeholder="0.00"
            {...stylex.props(styles.input)}
          />
        </div>
        <div {...stylex.props(styles.currencyGroup)}>
          <span {...stylex.props(styles.label)}>Currency</span>
          {/* Read-only: the gym prices in one currency, set in Settings → General.
              A per-product override is what let a GEL gym create USD products. */}
          <p {...stylex.props(styles.currencyValue)}>{currency}</p>
        </div>
      </div>

      {marginPct !== null ? (
        <p {...stylex.props(styles.marginHint)}>Profit margin: {marginPct}%</p>
      ) : null}

      {/* Inventory. Only meaningful for a product sold as-is: once it carries
          variants each one holds its own count, edited in the rows above. */}
      <fieldset {...stylex.props(styles.fieldset)}>
        <legend {...stylex.props(styles.legend)}>
          Inventory <span {...stylex.props(styles.optional)}>(optional)</span>
        </legend>
        <div {...stylex.props(styles.priceRow)}>
          {variants.length === 0 ? (
            <div {...stylex.props(styles.priceGroup)}>
              <label htmlFor="product-stock" {...stylex.props(styles.label)}>
                On hand
              </label>
              <input
                id="product-stock"
                name="stock"
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                value={stock}
                onChange={(event) => setStock(event.target.value)}
                placeholder="Not tracked"
                {...stylex.props(styles.input)}
              />
            </div>
          ) : null}
          <div {...stylex.props(styles.priceGroup)}>
            <label htmlFor="product-threshold" {...stylex.props(styles.label)}>
              Low-stock alert at
            </label>
            <input
              id="product-threshold"
              name="lowStockThreshold"
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              value={threshold}
              onChange={(event) => setThreshold(event.target.value)}
              placeholder={String(DEFAULT_LOW_STOCK_THRESHOLD)}
              {...stylex.props(styles.input)}
            />
          </div>
        </div>
        <p {...stylex.props(styles.stockHint)}>
          {variants.length > 0
            ? countedVariants > 0
              ? 'This product counts stock per variant. Counts already being kept are moved from the product page, so every change is logged with a reason; a variant added here starts from the count you type for it.'
              : 'This product counts stock per variant — set each opening count in the rows above. After that, restock from the product page so every change is logged.'
            : 'Leave “On hand” empty to sell this product without counting it. Correcting it here is recorded in the product’s history; day-to-day restocking belongs on the product page, where you say why.'}
        </p>
      </fieldset>

      {/* Variants. */}
      <fieldset {...stylex.props(styles.fieldset)}>
        <legend {...stylex.props(styles.legend)}>
          Variants <span {...stylex.props(styles.optional)}>(optional)</span>
        </legend>
        {variants.length > 0 ? (
          <div {...stylex.props(styles.variantsWrap)}>
            <div {...stylex.props(styles.variantHeadRow)}>
              <span>Name</span>
              <span>SKU</span>
              <span>Price</span>
              <span>Stock</span>
              <span {...stylex.props(styles.srOnly)}>Remove</span>
            </div>
            {variants.map((variant, index) => (
              <div key={index} {...stylex.props(styles.variantRow)}>
                <input
                  type="text"
                  aria-label={`Variant ${index + 1} name`}
                  value={variant.name}
                  onChange={(event) => setVariant(index, { name: event.target.value })}
                  placeholder="e.g. Small / Black"
                  {...stylex.props(styles.input)}
                />
                <input
                  type="text"
                  aria-label={`Variant ${index + 1} SKU`}
                  value={variant.sku}
                  onChange={(event) => setVariant(index, { sku: event.target.value })}
                  placeholder="SKU"
                  {...stylex.props(styles.input)}
                />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  aria-label={`Variant ${index + 1} price`}
                  value={variant.price}
                  onChange={(event) => setVariant(index, { price: event.target.value })}
                  placeholder="Base"
                  {...stylex.props(styles.input)}
                />
                <input
                  type="number"
                  min="0"
                  step="1"
                  inputMode="numeric"
                  aria-label={`Variant ${index + 1} stock`}
                  value={variant.stock}
                  readOnly={index < countedVariants}
                  title={
                    index < countedVariants
                      ? 'Counted on the product page, where every change is logged with a reason.'
                      : undefined
                  }
                  onChange={(event) => setVariant(index, { stock: event.target.value })}
                  {...stylex.props(styles.input, index < countedVariants && styles.inputReadOnly)}
                />
                <button
                  type="button"
                  onClick={() => removeVariant(index)}
                  {...stylex.props(styles.variantRemoveBtn)}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p {...stylex.props(styles.noVariants)}>
            No variants. Add sizes, colours, or flavours as purchasable options.
          </p>
        )}
        <div>
          <Button
            variant="secondary"
            size="inline"
            onClick={addVariant}
            disabled={atVariantLimit}
            label={atVariantLimit ? `Maximum of ${MAX_PRODUCT_VARIANTS} variants` : 'Add variant'}
          />
        </div>
      </fieldset>

      <div {...stylex.props(styles.fieldGroup)}>
        <label htmlFor="product-category" {...stylex.props(styles.label)}>
          Category <span {...stylex.props(styles.optional)}>(optional)</span>
        </label>
        <div {...stylex.props(styles.categoryRow)}>
          <select
            id="product-category"
            name="categoryId"
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
            disabled={shelves.length === 0}
            {...stylex.props(styles.input, styles.categorySelect)}
          >
            <option value="">No category</option>
            {shelves.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
          {!namingShelf ? (
            <Button
              variant="secondary"
              size="card"
              type="button"
              onClick={() => setNamingShelf(true)}
              label="New category"
            />
          ) : null}
        </div>

        {namingShelf ? (
          <div {...stylex.props(styles.categoryRow)}>
            <label htmlFor="product-new-category" {...stylex.props(styles.srOnly)}>
              New category name
            </label>
            <input
              id="product-new-category"
              type="text"
              autoFocus
              maxLength={MAX_PRODUCT_CATEGORY_NAME}
              value={shelfName}
              placeholder="Drinks"
              onChange={(event) => setShelfName(event.target.value)}
              // The form around this one is the product's — Enter here must add the
              // shelf, not submit a half-filled product.
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void createShelf();
                } else if (event.key === 'Escape') {
                  setNamingShelf(false);
                  setShelfError(null);
                }
              }}
              {...stylex.props(styles.input, styles.categorySelect)}
            />
            <Button
              variant="primary"
              size="card"
              type="button"
              onClick={() => void createShelf()}
              disabled={savingShelf || shelfName.trim() === ''}
              label={savingShelf ? 'Adding…' : 'Add'}
            />
            <Button
              variant="secondary"
              size="card"
              type="button"
              onClick={() => {
                setNamingShelf(false);
                setShelfError(null);
              }}
              label="Cancel"
            />
          </div>
        ) : null}

        {shelfError ? (
          <p role="alert" {...stylex.props(styles.categoryError)}>
            {shelfError}
          </p>
        ) : null}
        {shelves.length === 0 && !namingShelf ? (
          <p {...stylex.props(styles.marginHint)}>
            No categories yet — “New category” adds one without leaving this form.
          </p>
        ) : null}
      </div>

      {!isEdit ? (
        <div {...stylex.props(styles.fieldGroup)}>
          <label htmlFor="product-status" {...stylex.props(styles.label)}>
            Status
          </label>
          <select
            id="product-status"
            name="status"
            value={status}
            onChange={(event) => setStatus(event.target.value as ProductStatus)}
            {...stylex.props(styles.input)}
          >
            {CREATE_STATUSES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div {...stylex.props(styles.footer, props.onCancel && styles.drawerFooter)}>
        {error ? (
          <p role="alert" {...stylex.props(styles.errorBanner)}>
            {error}
          </p>
        ) : null}

        <div {...stylex.props(styles.actions, props.onCancel && styles.actionsInDrawer)}>
          <Button
            type="submit"
            variant="primary"
            size={props.onCancel ? 'page' : 'block'}
            disabled={uploading}
            loading={pending}
            xstyle={props.onCancel ? styles.actionButton : undefined}
            label={pending ? 'Saving…' : isEdit ? 'Save changes' : 'Create product'}
          />
          {props.onCancel ? (
            <Button
              type="button"
              variant="secondary"
              size="page"
              onClick={props.onCancel}
              disabled={pending}
              xstyle={styles.actionButton}
              label="Cancel"
            />
          ) : (
            <Link href={cancelHref} {...stylex.props(styles.cancelLink)}>
              Cancel
            </Link>
          )}
        </div>
      </div>
    </form>
  );
}
