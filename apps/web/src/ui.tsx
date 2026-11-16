import { useState, useEffect, useRef, type ReactNode } from 'react';
import {
  ArrowUpRight,
  LoaderCircle,
  Search,
  X,
  Check,
  AlertTriangle,
  Copy,
  ChevronRight,
} from 'lucide-react';
import type { FieldStat } from '../../../packages/shared/src/index.js';
export function Button({
  children,
  onClick,
  variant = 'default',
  disabled = false,
  small = false,
  className = '',
  type = 'button',
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'default' | 'primary' | 'ghost' | 'danger';
  disabled?: boolean;
  small?: boolean;
  className?: string;
  type?: 'button' | 'submit';
  title?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`button ${variant} ${small ? 'small' : ''} ${className}`}
    >
      {children}
    </button>
  );
}
export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: string }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
export function Panel({
  children,
  title,
  eyebrow,
  action,
  className = '',
  subtitle,
}: {
  children: ReactNode;
  title?: ReactNode;
  eyebrow?: string;
  action?: ReactNode;
  className?: string;
  subtitle?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      {(title || action) && (
        <div className="panel-head">
          <div>
            {eyebrow && <div className="eyebrow">{eyebrow}</div>}
            <h3>{title}</h3>
            {subtitle && <p className="muted panel-subtitle">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
export function PageTitle({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="page-actions">{actions}</div>
    </div>
  );
}
export function Empty({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-orbit">
        <Search size={24} />
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function Loading() {
  return (
    <div className="loading">
      <LoaderCircle className="spin" /> Загружаем реальные данные…
    </div>
  );
}
export function SearchBox({
  value,
  onChange,
  placeholder = 'Поиск…',
}: {
  value: string;
  onChange: (s: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="search-box">
      <Search size={16} />
      <input
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <button aria-label="Очистить поиск" onClick={() => onChange('')}>
          <X size={14} />
        </button>
      )}
    </label>
  );
}
export function FieldDot({ field }: { field: Pick<FieldStat, 'errors' | 'verified' | 'observed'> }) {
  return (
    <span
      className={`field-dot ${field.errors ? 'error' : field.verified ? 'verified' : field.observed ? 'observed' : 'unseen'}`}
    />
  );
}
export function Legend() {
  return (
    <div className="legend">
      <span>
        <i className="field-dot verified" />
        Verified
      </span>
      <span>
        <i className="field-dot observed" />
        Observed
      </span>
      <span>
        <i className="field-dot error" />
        Errors
      </span>
      <span>
        <i className="field-dot unseen" />
        Unobserved
      </span>
    </div>
  );
}
export function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <Button
      small
      variant="ghost"
      title={
        failed ? 'Не удалось скопировать. Выделите текст вручную.' : copied ? 'Скопировано' : 'Скопировать'
      }
      onClick={async () => {
        try {
          if (navigator.clipboard) await navigator.clipboard.writeText(value);
          else {
            const area = document.createElement('textarea');
            area.value = value;
            area.style.position = 'fixed';
            area.style.opacity = '0';
            document.body.append(area);
            area.select();
            const success = document.execCommand('copy');
            area.remove();
            if (!success) throw new Error('Clipboard unavailable');
          }
          setFailed(false);
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        } catch {
          setFailed(true);
        }
      }}
    >
      {failed ? <AlertTriangle size={14} /> : copied ? <Check size={14} /> : <Copy size={14} />}
    </Button>
  );
}
export function Drawer({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.querySelector<HTMLElement>('button')?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        closeRef.current();
      }
      if (event.key === 'Tab') {
        const focusable = [
          ...(ref.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled),a[href],input,select,textarea,[tabindex="0"]',
          ) || []),
        ];
        const first = focusable[0],
          last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('keydown', key);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);
  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside
        ref={ref}
        role="dialog"
        aria-label={title}
        aria-modal="true"
        className="drawer"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="drawer-head">
          <h2>{title}</h2>
          <Button variant="ghost" onClick={onClose} title="Закрыть">
            <X size={20} />
          </Button>
        </div>
        {children}
      </aside>
    </div>
  );
}
export function ErrorBox({ message }: { message: string }) {
  return (
    <div role="alert" className="error-box">
      <AlertTriangle size={18} />
      {message}
    </div>
  );
}
export function LinkAction({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button className="link-action" onClick={onClick}>
      {children}
      <ArrowUpRight size={15} />
    </button>
  );
}
export function Breadcrumb({ current }: { current: string }) {
  return (
    <div className="breadcrumb">
      Workspace <ChevronRight size={12} /> <span>{current}</span>
    </div>
  );
}
