import Link from 'next/link';

/** A footer link column: a heading plus its links (in-page anchors or routes). */
interface FooterColumn {
  heading: string;
  links: { label: string; href: string }[];
}

const COLUMNS: FooterColumn[] = [
  {
    heading: 'Product',
    links: [
      { label: 'Features', href: '/#features' },
      { label: 'Pricing', href: '/#pricing' },
      { label: 'Start free', href: '/register-gym' },
    ],
  },
  {
    heading: 'Company',
    links: [
      { label: 'About', href: '/#features' },
      { label: 'Contact', href: 'mailto:hello@fit.ge' },
    ],
  },
];

/**
 * Marketing footer — brand line, link columns, and a copyright. The year is
 * computed on the server at render time. Deliberately light: this is the apex
 * acquisition surface, not a tenant site.
 */
export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-slate-100 bg-white">
      <div className="mx-auto grid max-w-6xl gap-10 px-gutter py-12 sm:grid-cols-3">
        <div className="max-w-xs">
          <span className="text-lg font-semibold text-brand-600">Fit</span>
          <p className="mt-3 text-sm text-slate-500">
            The all-in-one platform for gyms and fitness studios.
          </p>
        </div>
        {COLUMNS.map((column) => (
          <div key={column.heading}>
            <h3 className="text-sm font-semibold text-slate-900">{column.heading}</h3>
            <ul className="mt-4 flex flex-col gap-3 text-sm text-slate-500">
              {column.links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="hover:text-brand-600">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-slate-100 px-gutter py-6">
        <p className="mx-auto max-w-6xl text-sm text-slate-400">
          © {year} Fit. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
