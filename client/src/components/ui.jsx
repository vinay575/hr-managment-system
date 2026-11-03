import { useEffect, useId } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { ChevronLeft, ChevronRight, Inbox, Loader2, Search, X } from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Design tokens                                                      */
/* ------------------------------------------------------------------ */
export const TONE = {
  indigo: { soft: 'bg-indigo-50 text-indigo-700 border-indigo-100', dot: 'bg-indigo-500', grad: 'from-indigo-500 to-violet-500', text: 'text-indigo-600', bar: 'bg-indigo-500', light: 'bg-indigo-100' },
  violet: { soft: 'bg-violet-50 text-violet-700 border-violet-100', dot: 'bg-violet-500', grad: 'from-violet-500 to-fuchsia-500', text: 'text-violet-600', bar: 'bg-violet-500', light: 'bg-violet-100' },
  sky: { soft: 'bg-sky-50 text-sky-700 border-sky-100', dot: 'bg-sky-500', grad: 'from-sky-400 to-blue-500', text: 'text-sky-600', bar: 'bg-sky-500', light: 'bg-sky-100' },
  emerald: { soft: 'bg-emerald-50 text-emerald-700 border-emerald-100', dot: 'bg-emerald-500', grad: 'from-emerald-400 to-teal-500', text: 'text-emerald-600', bar: 'bg-emerald-500', light: 'bg-emerald-100' },
  amber: { soft: 'bg-amber-50 text-amber-700 border-amber-100', dot: 'bg-amber-500', grad: 'from-amber-400 to-orange-500', text: 'text-amber-600', bar: 'bg-amber-500', light: 'bg-amber-100' },
  rose: { soft: 'bg-rose-50 text-rose-700 border-rose-100', dot: 'bg-rose-500', grad: 'from-rose-400 to-pink-500', text: 'text-rose-600', bar: 'bg-rose-500', light: 'bg-rose-100' },
  teal: { soft: 'bg-teal-50 text-teal-700 border-teal-100', dot: 'bg-teal-500', grad: 'from-teal-400 to-cyan-500', text: 'text-teal-600', bar: 'bg-teal-500', light: 'bg-teal-100' },
  orange: { soft: 'bg-orange-50 text-orange-700 border-orange-100', dot: 'bg-orange-500', grad: 'from-orange-400 to-red-500', text: 'text-orange-600', bar: 'bg-orange-500', light: 'bg-orange-100' },
  slate: { soft: 'bg-slate-100 text-slate-600 border-slate-200', dot: 'bg-slate-400', grad: 'from-slate-400 to-slate-500', text: 'text-slate-600', bar: 'bg-slate-400', light: 'bg-slate-100' },
};

export const STATUS_STYLE = {
  active: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/15',
  present: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/15',
  paid: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/15',
  approved: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/15',
  remote: 'bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-600/15',
  probation: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/15',
  pending: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/15',
  late: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/15',
  'half-day': 'bg-orange-50 text-orange-700 ring-1 ring-inset ring-orange-600/15',
  'on-leave': 'bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-600/15',
  absent: 'bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-600/15',
  inactive: 'bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-500/15',
  rejected: 'bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-600/15',
  cancelled: 'bg-slate-100 text-slate-500 ring-1 ring-inset ring-slate-500/15',
};

export const capitalize = (s) =>
  String(s || '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

/* ------------------------------------------------------------------ */
/*  Avatar                                                             */
/* ------------------------------------------------------------------ */
const AVATAR_SIZES = {
  xs: 'h-7 w-7 text-[10px]',
  sm: 'h-9 w-9 text-xs',
  md: 'h-11 w-11 text-sm',
  lg: 'h-14 w-14 text-base',
  xl: 'h-20 w-20 text-2xl',
};

export function Avatar({ name, color = 'indigo', size = 'md', className, ring = false }) {
  const initials = name
    ? name
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((p) => p[0])
        .join('')
        .toUpperCase()
    : '?';
  const tone = TONE[color] || TONE.indigo;
  return (
    <div
      className={clsx(
        'flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br font-bold text-white shadow-sm',
        tone.grad,
        AVATAR_SIZES[size],
        ring && 'ring-2 ring-white',
        className
      )}
      title={name}
    >
      {initials}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Button                                                             */
/* ------------------------------------------------------------------ */
const BTN_SIZES = {
  sm: 'px-3 py-2 text-[13px] rounded-lg gap-1.5',
  md: '',
  lg: 'px-5 py-3 text-[15px] rounded-xl',
  icon: 'h-9 w-9 p-0 rounded-xl',
};

export function Button({
  children,
  variant = 'secondary',
  size = 'md',
  icon: Icon,
  loading = false,
  className,
  type = 'button',
  ...props
}) {
  const variants = {
    primary: 'btn-primary',
    secondary: 'btn-secondary',
    ghost: 'btn-ghost',
    danger: 'btn-danger',
    soft: 'btn-soft',
  };
  return (
    <button
      type={type}
      className={clsx(variants[variant] || variants.secondary, BTN_SIZES[size], className)}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading ? <Loader2 size={16} className="animate-spin" /> : Icon ? <Icon size={size === 'sm' ? 15 : 17} /> : null}
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Cards / Badges                                                     */
/* ------------------------------------------------------------------ */
export function Card({ children, className, hover = false }) {
  return <div className={clsx('card', hover && 'card-hover', className)}>{children}</div>;
}

export function Badge({ children, status, tone, dot = true, className }) {
  const cls = status ? STATUS_STYLE[status] : tone ? TONE[tone]?.soft : 'bg-slate-100 text-slate-600';
  return (
    <span className={clsx('badge', cls, className)}>
      {dot && <span className={clsx('h-1.5 w-1.5 rounded-full', status ? (STATUS_STYLE[status]?.includes('emerald') ? 'bg-emerald-500' : STATUS_STYLE[status]?.includes('rose') ? 'bg-rose-500' : STATUS_STYLE[status]?.includes('amber') ? 'bg-amber-500' : STATUS_STYLE[status]?.includes('sky') ? 'bg-sky-500' : STATUS_STYLE[status]?.includes('violet') ? 'bg-violet-500' : 'bg-slate-400') : 'bg-current opacity-60')} />}
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Form                                                               */
/* ------------------------------------------------------------------ */
export function Field({ label, hint, error, required, children, className, htmlFor }) {
  return (
    <div className={className}>
      {label && (
        <label className="label" htmlFor={htmlFor}>
          {label} {required && <span className="text-rose-500">*</span>}
        </label>
      )}
      {children}
      {error ? <p className="mt-1.5 text-xs font-medium text-rose-600">{error}</p> : hint ? <p className="mt-1.5 text-xs text-slate-400">{hint}</p> : null}
    </div>
  );
}

export function Input({ label, icon: Icon, error, hint, required, className, wrapperClass, ...props }) {
  const generatedId = useId();
  const id = props.id || generatedId;
  return (
    <Field label={label} error={error} hint={hint} required={required} className={wrapperClass} htmlFor={id}>
      <div className="relative">
        {Icon && <Icon size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />}
        <input id={id} className={clsx('input', Icon && 'pl-10', error && 'border-rose-300 focus:border-rose-400 focus:ring-rose-500/10', className)} {...props} />
      </div>
    </Field>
  );
}

export function Select({ label, children, error, required, className, wrapperClass, ...props }) {
  const generatedId = useId();
  const id = props.id || generatedId;
  return (
    <Field label={label} error={error} required={required} className={wrapperClass} htmlFor={id}>
      <div className="relative">
        <select id={id} className={clsx('input appearance-none pr-9', error && 'border-rose-300', className)} {...props}>
          {children}
        </select>
        <ChevronDownIcon />
      </div>
    </Field>
  );
}

function ChevronDownIcon() {
  return (
    <svg className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
    </svg>
  );
}

export function Textarea({ label, error, className, ...props }) {
  const generatedId = useId();
  const id = props.id || generatedId;
  return (
    <Field label={label} error={error} htmlFor={id}>
      <textarea id={id} className={clsx('input min-h-[96px] resize-y', error && 'border-rose-300', className)} {...props} />
    </Field>
  );
}

/* ------------------------------------------------------------------ */
/*  Search / Modal / Tabs                                              */
/* ------------------------------------------------------------------ */
export function SearchInput({ value, onChange, placeholder = 'Search…', className }) {
  return (
    <div className={clsx('relative', className)}>
      <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
      <input className="input pl-10" placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

const MODAL_SIZES = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  full: 'max-w-6xl',
};

export function Modal({ open, onClose, title, subtitle, children, footer, size = 'md', icon: Icon }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center p-0 sm:items-center sm:p-6">
      <div className="absolute inset-0 bg-ink-900/45 backdrop-blur-sm" onClick={onClose} />
      <div
        className={clsx(
          'relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl animate-scale-in sm:rounded-3xl',
          MODAL_SIZES[size]
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
          <div className="flex items-start gap-3">
            {Icon && (
              <div className="mt-0.5 grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand-600">
                <Icon size={19} />
              </div>
            )}
            <div>
              <h2 className="font-display text-lg font-bold tracking-tight text-ink-900">{title}</h2>
              {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
            </div>
          </div>
          <button onClick={onClose} className="icon-btn -mr-2 -mt-1" aria-label="Close">
            <X size={19} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-6">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-100 bg-slate-50/60 px-6 py-4">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

export function Tabs({ items, value, onChange, className }) {
  return (
    <div className={clsx('flex items-center gap-1 overflow-x-auto rounded-xl bg-slate-100/80 p-1 no-scrollbar', className)}>
      {items.map((item) => (
        <button
          key={item.key}
          onClick={() => onChange(item.key)}
          className={clsx(
            'flex items-center gap-2 whitespace-nowrap rounded-lg px-3.5 py-2 text-[13px] font-semibold transition',
            value === item.key ? 'bg-white text-ink-900 shadow-sm' : 'text-slate-500 hover:text-ink-700'
          )}
        >
          {item.label}
          {item.count !== undefined && (
            <span className={clsx('rounded-md px-1.5 py-0.5 text-[10px]', value === item.key ? 'bg-brand-50 text-brand-600' : 'bg-slate-200/70 text-slate-500')}>{item.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

export function Segmented({ options, value, onChange }) {
  return (
    <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={clsx(
            'rounded-lg px-3 py-1.5 text-xs font-semibold transition',
            value === o.value ? 'bg-ink-900 text-white shadow-sm' : 'text-slate-500 hover:text-ink-800'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Feedback                                                           */
/* ------------------------------------------------------------------ */
export function Spinner({ className }) {
  return <Loader2 className={clsx('animate-spin text-brand-500', className)} size={22} />;
}

export function LoadingBlock({ label = 'Loading…', className }) {
  return (
    <div className={clsx('flex flex-col items-center justify-center gap-3 py-20 text-sm text-slate-400', className)}>
      <Spinner />
      {label}
    </div>
  );
}

export function EmptyState({ icon: Icon = Inbox, title = 'Nothing here yet', description, action, className }) {
  return (
    <div className={clsx('flex flex-col items-center justify-center px-6 py-16 text-center', className)}>
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-slate-100 text-slate-400">
        <Icon size={24} />
      </div>
      <h3 className="mt-4 font-display text-base font-bold text-ink-900">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function StatCard({ label, value, sub, icon: Icon, tone = 'indigo', trend, loading }) {
  const t = TONE[tone] || TONE.indigo;
  return (
    <Card hover className="relative overflow-hidden p-5">
      <div className={clsx('pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-gradient-to-br opacity-[0.09]', t.grad)} />
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[12.5px] font-medium text-slate-500">{label}</p>
          {loading ? (
            <div className="skeleton mt-2 h-8 w-20" />
          ) : (
            <p className="mt-1.5 font-display text-[26px] font-bold leading-none tracking-tight text-ink-900 tabular">{value}</p>
          )}
          {sub && <p className="mt-2 text-[11.5px] font-medium text-slate-400">{sub}</p>}
        </div>
        <div className={clsx('grid h-11 w-11 shrink-0 place-items-center rounded-xl border', t.soft)}>
          <Icon size={19} />
        </div>
      </div>
      {trend && (
        <div className="mt-3 inline-flex items-center gap-1 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-600">
          {trend}
        </div>
      )}
    </Card>
  );
}

export function Progress({ value = 0, tone = 'indigo', className, height = 'h-2' }) {
  const t = TONE[tone] || TONE.indigo;
  return (
    <div className={clsx('w-full overflow-hidden rounded-full bg-slate-100', height, className)}>
      <div className={clsx('h-full rounded-full bg-gradient-to-r transition-all duration-700', t.grad)} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

export function Pagination({ page, pages, total, limit, onChange, className }) {
  if (!pages || pages <= 1) return null;
  const from = (page - 1) * limit + 1;
  const to = Math.min(total, page * limit);
  return (
    <div className={clsx('flex flex-col items-center justify-between gap-3 sm:flex-row', className)}>
      <p className="text-xs text-slate-500">
        Showing <span className="font-semibold text-ink-700">{from}–{to}</span> of <span className="font-semibold text-ink-700">{total}</span>
      </p>
      <div className="flex items-center gap-2">
        <button className="icon-btn border border-slate-200 disabled:opacity-40" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Previous page">
          <ChevronLeft size={16} />
        </button>
        {Array.from({ length: Math.min(pages, 5) }, (_, i) => {
          const start = Math.max(1, Math.min(page - 2, pages - 4));
          const p = start + i;
          if (p > pages) return null;
          return (
            <button
              key={p}
              onClick={() => onChange(p)}
              className={clsx('h-9 min-w-9 rounded-lg px-2 text-xs font-semibold transition', p === page ? 'bg-ink-900 text-white' : 'text-slate-500 hover:bg-slate-100')}
            >
              {p}
            </button>
          );
        })}
        <button className="icon-btn border border-slate-200 disabled:opacity-40" disabled={page >= pages} onClick={() => onChange(page + 1)} aria-label="Next page">
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

export function SectionTitle({ title, description, action, className }) {
  return (
    <div className={clsx('flex flex-wrap items-end justify-between gap-3', className)}>
      <div>
        <h2 className="font-display text-[17px] font-bold tracking-tight text-ink-900">{title}</h2>
        {description && <p className="mt-0.5 text-[13px] text-slate-500">{description}</p>}
      </div>
      {action}
    </div>
  );
}
