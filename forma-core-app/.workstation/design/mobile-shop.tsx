// @device: mobile
import React, { useState } from 'react';

/* ==========================================================================
   FormaCore mobile — მაღაზია · app/(tabs)/shop/index.tsx + shop/cart.tsx
   Catalogue is DEMO_PRODUCTS from prisma/seed.ts (GEL minor units, real
   variant counts and stock; the INACTIVE hoodie is not listed). Prices are
   what `formatMoney(amount, 'GEL', 'ka')` renders. Copy verbatim from
   @fit/i18n ka.json (shop.*). Art direction "Lime Block".
   ========================================================================== */

/* The signature shape: two corners rounded, two cut on the diagonal — the same
   move as the membership block, scaled down for controls. */
const CUT_SM =
  '[clip-path:polygon(9px_0,calc(100%_-_9px)_0,100%_9px,100%_calc(100%_-_9px),calc(100%_-_9px)_100%,9px_100%,0_calc(100%_-_9px),0_9px)]';
const CUT_MD =
  '[clip-path:polygon(11px_0,calc(100%_-_11px)_0,100%_11px,100%_calc(100%_-_11px),calc(100%_-_11px)_100%,11px_100%,0_calc(100%_-_11px),0_11px)]';
const CUT_LG =
  '[clip-path:polygon(30px_0,calc(100%_-_30px)_0,100%_30px,100%_calc(100%_-_30px),calc(100%_-_30px)_100%,30px_100%,0_calc(100%_-_30px),0_30px)]';

const P = {
  home: 'M3 10.5 12 3l9 7.5M5.5 9.5V20a1 1 0 0 0 1 1h4v-6h3v6h4a1 1 0 0 0 1-1V9.5',
  calendar:
    'M7 3v3M17 3v3M3.5 9.5h17M5 6h14a1.5 1.5 0 0 1 1.5 1.5v12A1.5 1.5 0 0 1 19 21H5a1.5 1.5 0 0 1-1.5-1.5v-12A1.5 1.5 0 0 1 5 6Z',
  bag: 'M6 8h12l1 12.5H5L6 8ZM9 8V6a3 3 0 0 1 6 0v2',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4.5 20.5a7.5 7.5 0 0 1 15 0',
  qr: 'M4 4h6v6H4V4ZM14 4h6v6h-6V4ZM4 14h6v6H4v-6ZM14 14h2.5v2.5H14V14ZM20 14v6h-3.5M17 20h-.5',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  close: 'm6 6 12 12M18 6 6 18',
  trash:
    'M4 7h16M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M6.5 7l.8 12.1a1.5 1.5 0 0 0 1.5 1.4h6.4a1.5 1.5 0 0 0 1.5-1.4L17.5 7',
  bolt: 'M13.5 3 5 13.5h6L10.5 21 19 10.5h-6L13.5 3Z',
};

function Icon({ d, className = 'h-5 w-5' }: { d: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

/** GEL minor units → what `formatMoney(amount, 'GEL', 'ka')` renders. */
const money = (minor: number) => `${(minor / 100).toFixed(2).replace('.', ',')} ₾`;

/* -------------------------------- real data ------------------------------- */

type Product = {
  id: string;
  name: string;
  /** Base price in GEL minor units. */
  minor: number;
  /** Variants that may price above the base — drives shop.browse.fromPrice. */
  variants: number;
  /** Lowest variant stock; the catalogue flags low stock. */
  stock: number;
  initial: string;
};

const PRODUCTS: Product[] = [
  { id: 'p-whey', name: 'Whey Protein 1kg', minor: 8900, variants: 2, stock: 17, initial: 'W' },
  { id: 'p-tee', name: 'Branded Training Tee', minor: 4500, variants: 4, stock: 43, initial: 'T' },
  {
    id: 'p-bands',
    name: 'Resistance Bands Set',
    minor: 3900,
    variants: 0,
    stock: 24,
    initial: 'R',
  },
  {
    id: 'p-shaker',
    name: 'Insulated Shaker Bottle',
    minor: 2500,
    variants: 0,
    stock: 31,
    initial: 'S',
  },
  { id: 'p-towel', name: 'Microfibre Gym Towel', minor: 1800, variants: 1, stock: 4, initial: 'M' },
];

/** Product thumbs are neutral tiles — lime never labels merchandise. */
const THUMB = 'bg-ink-800 text-ink-200';

export default function MobileShop() {
  const [cart, setCart] = useState<Record<string, number>>({ 'p-whey': 1, 'p-shaker': 1 });
  const [cartOpen, setCartOpen] = useState(false);

  const lines = PRODUCTS.filter((p) => cart[p.id] > 0);
  const count = lines.reduce((n, p) => n + cart[p.id], 0);
  const subtotal = lines.reduce((n, p) => n + p.minor * cart[p.id], 0);

  const add = (id: string) => setCart((c) => ({ ...c, [id]: (c[id] ?? 0) + 1 }));
  const sub = (id: string) => setCart((c) => ({ ...c, [id]: Math.max((c[id] ?? 0) - 1, 0) }));
  const remove = (id: string) => setCart((c) => ({ ...c, [id]: 0 }));

  return (
    <div className="relative min-h-[900px] w-full bg-ink-950 pb-52 font-sans text-white">
      {/* ------------------------------- app bar ---------------------------- */}
      <header className="flex items-start justify-between px-5 pb-6 pt-14">
        <div className="min-w-0">
          <h1 className="text-[28px] font-extrabold leading-none tracking-tight">მაღაზია</h1>
          <p className="mt-2.5 max-w-[240px] text-[13px] leading-relaxed text-ink-400">
            აღჭურვილობა, დანამატები და საჭირო ნივთები შენი დარბაზიდან.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCartOpen(true)}
          aria-label="კალათის გახსნა"
          className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ink-900 text-ink-200 transition-colors hover:bg-ink-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
        >
          <Icon d={P.bag} className="h-[19px] w-[19px]" />
          {count > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-brand-300 font-mono text-[10px] font-bold text-ink-950 ring-2 ring-ink-950">
              {count}
            </span>
          ) : null}
        </button>
      </header>

      {/* ------------------------------ member perk -------------------------- */}
      <section className="px-5">
        <div className="flex items-center gap-3 rounded-[26px] bg-brand-300 p-4 text-ink-950">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink-950 text-brand-300">
            <Icon d={P.bolt} className="h-[18px] w-[18px]" />
          </span>
          <div className="min-w-0">
            <p className="text-[15px] font-extrabold leading-tight">წევრებს −10%</p>
            <p className="mt-0.5 text-[12px] font-medium text-ink-800">
              Premium ფასდაკლება გადახდისას ჩაითვლება
            </p>
          </div>
        </div>
      </section>

      {/* ------------------------------- catalogue --------------------------- */}
      <section className="mt-6">
        <div className="flex items-baseline justify-between px-5">
          <h2 className="text-[20px] font-extrabold tracking-tight">პროდუქტები</h2>
          <span className="font-mono text-[12px] tabular-nums text-ink-500">{PRODUCTS.length}</span>
        </div>

        <div className="mt-4 space-y-3 px-5">
          {PRODUCTS.map((p) => {
            const qty = cart[p.id] ?? 0;
            return (
              <article key={p.id} className="flex items-center gap-4 rounded-[26px] bg-ink-900 p-4">
                <div
                  className={`relative flex h-[72px] w-[72px] shrink-0 items-center justify-center overflow-hidden rounded-[22px] ${THUMB}`}
                >
                  <span className="font-mono text-[30px] font-bold leading-none opacity-80">
                    {p.initial}
                  </span>
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold leading-tight text-white">{p.name}</p>
                  <p className="mt-1 truncate text-[12px] text-ink-400">
                    {p.variants > 0 ? `${p.variants} ვარიანტი` : 'ერთი ვარიანტი'}
                    {p.stock <= 5 ? (
                      <span className="text-ink-300"> · მარაგში {p.stock}</span>
                    ) : null}
                  </p>
                  <p className="mt-2 whitespace-nowrap font-mono text-[15px] font-bold tabular-nums text-brand-300">
                    {p.variants > 1 ? `${money(p.minor)}-დან` : money(p.minor)}
                  </p>
                </div>

                {qty > 0 ? (
                  <div className="flex shrink-0 items-center gap-1 rounded-pill bg-ink-800 p-1">
                    <button
                      type="button"
                      aria-label="რაოდენობის შემცირება"
                      onClick={() => sub(p.id)}
                      className="flex h-9 w-9 items-center justify-center rounded-full text-ink-300 transition-colors hover:bg-ink-700 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
                    >
                      <Icon d={P.minus} className="h-4 w-4" />
                    </button>
                    <span className="w-5 text-center font-mono text-[15px] font-bold tabular-nums text-white">
                      {qty}
                    </span>
                    <button
                      type="button"
                      aria-label="რაოდენობის გაზრდა"
                      onClick={() => add(p.id)}
                      className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-300 text-ink-950 transition-colors hover:bg-brand-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
                    >
                      <Icon d={P.plus} className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    aria-label="კალათაში დამატება"
                    onClick={() => add(p.id)}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-300 text-ink-950 transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
                  >
                    <Icon d={P.plus} className="h-5 w-5" />
                  </button>
                )}
              </article>
            );
          })}
        </div>
      </section>

      {/* ------------------------------ cart bar ----------------------------- */}
      {count > 0 ? (
        <div className="absolute inset-x-0 bottom-[108px] z-10 px-5">
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className={`flex w-full items-center gap-3 ${CUT_SM} bg-brand-300 py-3 pl-5 pr-3 text-ink-950 transition-colors hover:bg-brand-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-white`}
          >
            <span className="min-w-0 flex-1 text-left">
              <span className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-800">
                ჯამი
              </span>
              <span className="mt-0.5 block font-mono text-[18px] font-bold tabular-nums">
                {money(subtotal)}
              </span>
            </span>
            <span className="shrink-0 rounded-pill bg-ink-950 px-5 py-2.5 text-[14px] font-bold text-brand-300">
              კალათა · {count}
            </span>
          </button>
        </div>
      ) : null}

      {/* ------------------------- floating capsule nav ---------------------- */}
      <nav className="absolute inset-x-0 bottom-6 z-10 flex justify-center px-5">
        <div className="flex w-full items-center justify-between rounded-pill bg-ink-900 p-2">
          {[
            { key: 'home', label: 'მთავარი', icon: P.home },
            { key: 'classes', label: 'გაკვეთილები', icon: P.calendar },
            { key: 'qr', label: 'გამოცხადება', icon: P.qr },
            { key: 'shop', label: 'მაღაზია', icon: P.bag },
            { key: 'profile', label: 'პროფილი', icon: P.user },
          ].map((t) => {
            const active = t.key === 'shop';
            return (
              <button
                key={t.key}
                type="button"
                aria-label={t.label}
                aria-current={active ? 'page' : undefined}
                className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-900 ${
                  active ? 'bg-brand-300 text-ink-950' : 'text-ink-500 hover:text-white'
                }`}
              >
                <Icon d={t.icon} className={active ? 'h-[23px] w-[23px]' : 'h-[21px] w-[21px]'} />
              </button>
            );
          })}
        </div>
      </nav>

      {/* ------------------------------ cart sheet --------------------------- */}
      {cartOpen ? (
        <div className="absolute inset-0 z-20">
          <button
            type="button"
            aria-label="დახურვა"
            onClick={() => setCartOpen(false)}
            className="absolute inset-0 bg-ink-950/85"
          />
          <div className="absolute inset-x-0 bottom-0 rounded-t-[32px] bg-ink-900 px-5 pb-8 pt-3">
            <div className="mx-auto mb-5 h-1 w-10 rounded-pill bg-ink-700" />

            <div className="flex items-start justify-between gap-3">
              <p className="text-[22px] font-extrabold tracking-tight text-white">კალათა</p>
              <button
                type="button"
                aria-label="დახურვა"
                onClick={() => setCartOpen(false)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink-800 text-ink-300 transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
              >
                <Icon d={P.close} className="h-4 w-4" />
              </button>
            </div>

            {lines.length === 0 ? (
              <div className="py-10 text-center">
                <p className="text-[17px] font-bold text-white">შენი კალათა ცარიელია</p>
                <p className="mt-2 text-[13px] leading-relaxed text-ink-400">
                  დაათვალიერე მაღაზია და დაამატე რამდენიმე ნივთი დასაწყებად.
                </p>
                <button
                  type="button"
                  onClick={() => setCartOpen(false)}
                  className={`mt-5 h-[52px] ${CUT_MD} bg-brand-300 px-7 text-[15px] font-bold text-ink-950 transition-colors hover:bg-brand-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-white`}
                >
                  პროდუქტების დათვალიერება
                </button>
              </div>
            ) : (
              <>
                <div className="mt-5 space-y-3">
                  {lines.map((p) => (
                    <div key={p.id} className="flex items-center gap-3">
                      <div
                        className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-[18px] ${THUMB}`}
                      >
                        <span className="font-mono text-[22px] font-bold opacity-80">
                          {p.initial}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[14px] font-semibold leading-tight text-white">
                          {p.name}
                        </p>
                        <p className="mt-1 font-mono text-[12px] tabular-nums text-ink-400">
                          {money(p.minor)} თითო
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1 rounded-pill bg-ink-800 p-1">
                        <button
                          type="button"
                          aria-label="რაოდენობის შემცირება"
                          onClick={() => sub(p.id)}
                          className="flex h-8 w-8 items-center justify-center rounded-full text-ink-300 transition-colors hover:bg-ink-700 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
                        >
                          <Icon d={P.minus} className="h-3.5 w-3.5" />
                        </button>
                        <span className="w-5 text-center font-mono text-[14px] font-bold tabular-nums text-white">
                          {cart[p.id]}
                        </span>
                        <button
                          type="button"
                          aria-label="რაოდენობის გაზრდა"
                          onClick={() => add(p.id)}
                          className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-300 text-ink-950 transition-colors hover:bg-brand-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
                        >
                          <Icon d={P.plus} className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <button
                        type="button"
                        aria-label="წაშლა"
                        onClick={() => remove(p.id)}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-500 transition-colors hover:bg-ink-800 hover:text-danger-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-danger-400"
                      >
                        <Icon d={P.trash} className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="mt-6 flex items-end justify-between border-t border-ink-800 pt-5">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-400">
                      ჯამი
                    </p>
                    <p className="mt-1.5 font-mono text-[26px] font-bold leading-none tabular-nums text-white">
                      {money(subtotal)}
                    </p>
                  </div>
                  <p className="font-mono text-[12px] tabular-nums text-ink-500">{count} ნივთი</p>
                </div>

                <button
                  type="button"
                  onClick={() => setCartOpen(false)}
                  className={`mt-5 h-[52px] w-full ${CUT_MD} bg-brand-300 text-[15px] font-bold text-ink-950 transition-colors hover:bg-brand-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-white`}
                >
                  შეკვეთის განთავსება
                </button>
                <p className="mt-3 text-center text-[12px] leading-relaxed text-ink-500">
                  გადახდა ჯერ სიმულირებულია — ბარათი არ ჩამოიჭრება.
                </p>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
