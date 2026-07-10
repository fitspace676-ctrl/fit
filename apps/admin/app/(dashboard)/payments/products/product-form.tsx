'use client';

import { useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as stylex from '@stylexjs/stylex';
import {
  MAX_PRODUCT_IMAGES,
  MAX_PRODUCT_VARIANTS,
  type ProductStatus,
  type ProductVariant,
} from '@fit/types';
import { Btn } from '@/components/ui';
import { inputToMinor, minorToInput } from './format-price';
import {
  createProductAction,
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
  uppercase: {
    textTransform: 'uppercase',
  },
  priceRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '1rem',
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
  currency: string;
  images: string[];
  variants: ProductVariant[];
};

type Props =
  | { mode: 'create' }
  | {
      mode: 'edit';
      productId: string;
      initial: Initial;
    };

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
 * On success it navigates to the product's detail page; the discriminated
 * `ActionResult` surfaces any API error inline without throwing across the Server
 * Action boundary.
 */
export function ProductForm(props: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isEdit = props.mode === 'edit';
  const initial: Initial = isEdit
    ? props.initial
    : { name: '', description: '', priceAmount: 0, currency: 'USD', images: [], variants: [] };

  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [price, setPrice] = useState(initial.priceAmount ? minorToInput(initial.priceAmount) : '');
  const [currency, setCurrency] = useState(initial.currency);
  const [images, setImages] = useState<string[]>(initial.images);
  const [variants, setVariants] = useState<VariantDraft[]>(initial.variants.map(toDraft));
  const [status, setStatus] = useState<ProductStatus>('ACTIVE');

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
      currency,
      images,
      variants: cleanedVariants,
    };

    startTransition(async () => {
      const result = isEdit
        ? await updateProductAction(props.productId, profile)
        : await createProductAction({ ...profile, status });
      if (result.ok) {
        router.push(`/payments/products/${result.data.id}`);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  const cancelHref = isEdit ? `/payments/products/${props.productId}` : '/payments/products';
  const atImageLimit = images.length >= MAX_PRODUCT_IMAGES;
  const atVariantLimit = variants.length >= MAX_PRODUCT_VARIANTS;

  return (
    <form onSubmit={onSubmit} {...stylex.props(styles.form)}>
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
            Base price
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
        <div {...stylex.props(styles.currencyGroup)}>
          <label htmlFor="product-currency" {...stylex.props(styles.label)}>
            Currency
          </label>
          <input
            id="product-currency"
            name="currency"
            type="text"
            maxLength={3}
            value={currency}
            onChange={(event) => setCurrency(event.target.value.toUpperCase())}
            placeholder="USD"
            autoComplete="off"
            {...stylex.props(styles.input, styles.uppercase)}
          />
        </div>
      </div>

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
                  onChange={(event) => setVariant(index, { stock: event.target.value })}
                  {...stylex.props(styles.input)}
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
          <Btn v="outline" size="sm" onClick={addVariant} disabled={atVariantLimit}>
            {atVariantLimit ? `Maximum of ${MAX_PRODUCT_VARIANTS} variants` : 'Add variant'}
          </Btn>
        </div>
      </fieldset>

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

      {error ? (
        <p role="alert" {...stylex.props(styles.errorBanner)}>
          {error}
        </p>
      ) : null}

      <div {...stylex.props(styles.actions)}>
        <Btn type="submit" v="primary" size="md" disabled={pending || uploading}>
          {pending ? 'Saving…' : isEdit ? 'Save changes' : 'Create product'}
        </Btn>
        <Link href={cancelHref} {...stylex.props(styles.cancelLink)}>
          Cancel
        </Link>
      </div>
    </form>
  );
}
