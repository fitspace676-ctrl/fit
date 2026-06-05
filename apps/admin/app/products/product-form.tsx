'use client';

import { useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  MAX_PRODUCT_IMAGES,
  MAX_PRODUCT_VARIANTS,
  type ProductStatus,
  type ProductVariant,
} from '@fit/types';
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

/** Shared field styling so create + edit render identically. */
const FIELD_CLASS =
  'w-full rounded-card border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400 disabled:bg-slate-50 disabled:text-slate-500';

/** Accepted image MIME types for the gallery, matching the storage service map. */
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
/** Client-side size ceiling (bytes) — a friendly guard before the signed PUT. */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

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
 * The create / edit product form (T4.6). One component serves both flows. Beyond
 * the profile fields (name, description, base price, currency) it owns two richer
 * editors:
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
        router.push(`/products/${result.data.id}`);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  const cancelHref = isEdit ? `/products/${props.productId}` : '/products';
  const atImageLimit = images.length >= MAX_PRODUCT_IMAGES;
  const atVariantLimit = variants.length >= MAX_PRODUCT_VARIANTS;

  return (
    <form onSubmit={onSubmit} className="flex max-w-2xl flex-col gap-4">
      {/* Image gallery. */}
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-slate-700">
          Image gallery <span className="font-normal text-slate-400">(first is the primary)</span>
        </span>
        {images.length > 0 ? (
          <div className="flex flex-wrap gap-3">
            {images.map((url, index) => (
              <div key={url} className="flex flex-col items-center gap-1">
                <img src={url} alt="" className="h-20 w-20 rounded-card object-cover" />
                <div className="flex items-center gap-2 text-xs">
                  {index === 0 ? (
                    <span className="font-medium text-brand-700">Primary</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => makePrimary(url)}
                      className="font-medium text-slate-500 hover:text-brand-700"
                    >
                      Make primary
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => removeImage(url)}
                    className="font-medium text-slate-500 hover:text-red-600"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <span className="flex h-20 w-full max-w-xs items-center justify-center rounded-card bg-brand-50 text-xs font-semibold text-brand-700">
            No images yet
          </span>
        )}
        <div className="flex flex-col gap-1">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPTED_IMAGE_TYPES.join(',')}
            onChange={(event) => void onImagesChange(event)}
            disabled={uploading || pending || atImageLimit}
            className="text-sm text-slate-600 file:mr-3 file:rounded-card file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-brand-700 hover:file:bg-brand-100 disabled:opacity-50"
          />
          <span className="text-xs text-slate-400">
            {uploading
              ? 'Uploading…'
              : atImageLimit
                ? `Maximum of ${MAX_PRODUCT_IMAGES} images reached.`
                : `JPEG, PNG, WebP or GIF, up to 5 MB each (max ${MAX_PRODUCT_IMAGES}).`}
          </span>
        </div>
        {uploadError ? (
          <p role="alert" className="rounded-card bg-amber-50 px-3 py-2 text-sm text-amber-700">
            {uploadError}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="product-name" className="text-sm font-medium text-slate-700">
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
          className={FIELD_CLASS}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="product-description" className="text-sm font-medium text-slate-700">
          Description <span className="font-normal text-slate-400">(optional)</span>
        </label>
        <textarea
          id="product-description"
          name="description"
          rows={3}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="A short description of the product."
          className={FIELD_CLASS}
        />
      </div>

      <div className="flex flex-wrap gap-4">
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor="product-price" className="text-sm font-medium text-slate-700">
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
            className={FIELD_CLASS}
          />
        </div>
        <div className="flex w-32 flex-col gap-1">
          <label htmlFor="product-currency" className="text-sm font-medium text-slate-700">
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
            className={`${FIELD_CLASS} uppercase`}
          />
        </div>
      </div>

      {/* Variants. */}
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-slate-700">
          Variants <span className="font-normal text-slate-400">(optional)</span>
        </legend>
        {variants.length > 0 ? (
          <div className="flex flex-col gap-2">
            <div className="hidden grid-cols-[1fr_1fr_7rem_5rem_auto] gap-2 text-xs uppercase tracking-wide text-slate-400 sm:grid">
              <span>Name</span>
              <span>SKU</span>
              <span>Price</span>
              <span>Stock</span>
              <span className="sr-only">Remove</span>
            </div>
            {variants.map((variant, index) => (
              <div
                key={index}
                className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_7rem_5rem_auto] sm:items-center"
              >
                <input
                  type="text"
                  aria-label={`Variant ${index + 1} name`}
                  value={variant.name}
                  onChange={(event) => setVariant(index, { name: event.target.value })}
                  placeholder="e.g. Small / Black"
                  className={FIELD_CLASS}
                />
                <input
                  type="text"
                  aria-label={`Variant ${index + 1} SKU`}
                  value={variant.sku}
                  onChange={(event) => setVariant(index, { sku: event.target.value })}
                  placeholder="SKU"
                  className={FIELD_CLASS}
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
                  className={FIELD_CLASS}
                />
                <input
                  type="number"
                  min="0"
                  step="1"
                  inputMode="numeric"
                  aria-label={`Variant ${index + 1} stock`}
                  value={variant.stock}
                  onChange={(event) => setVariant(index, { stock: event.target.value })}
                  className={FIELD_CLASS}
                />
                <button
                  type="button"
                  onClick={() => removeVariant(index)}
                  className="justify-self-start rounded-card border border-slate-200 px-3 py-2 text-sm font-medium text-slate-500 hover:text-red-600 sm:justify-self-auto"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-400">
            No variants. Add sizes, colours, or flavours as purchasable options.
          </p>
        )}
        <div>
          <button
            type="button"
            onClick={addVariant}
            disabled={atVariantLimit}
            className="rounded-card border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {atVariantLimit ? `Maximum of ${MAX_PRODUCT_VARIANTS} variants` : 'Add variant'}
          </button>
        </div>
      </fieldset>

      {!isEdit ? (
        <div className="flex flex-col gap-1">
          <label htmlFor="product-status" className="text-sm font-medium text-slate-700">
            Status
          </label>
          <select
            id="product-status"
            name="status"
            value={status}
            onChange={(event) => setStatus(event.target.value as ProductStatus)}
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
          disabled={pending || uploading}
          className="rounded-card bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {pending ? 'Saving…' : isEdit ? 'Save changes' : 'Create product'}
        </button>
        <Link href={cancelHref} className="text-sm font-medium text-slate-500 hover:text-slate-700">
          Cancel
        </Link>
      </div>
    </form>
  );
}
