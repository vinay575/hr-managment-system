import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Receipt, Save, ShieldCheck, SlidersHorizontal, Tag } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { api } from '../../lib/api';
import { Button, Card, Field, Input, LoadingBlock, SectionTitle, Select, Textarea } from '../../components/ui';

const CURRENCIES = ['USD', 'EUR', 'GBP', 'INR', 'AED', 'SGD', 'AUD', 'CAD', 'JPY'];

const Toggle = ({ checked, onChange, label, description }) => (
  <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 px-4 py-3.5">
    <span className={`mt-0.5 flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition ${checked ? 'bg-brand-600' : 'bg-slate-200'}`}>
      <span className={`h-4 w-4 rounded-full bg-white shadow transition ${checked ? 'translate-x-4' : ''}`} />
    </span>
    <input type="checkbox" className="hidden" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    <span>
      <span className="block text-[12.5px] font-semibold text-ink-800">{label}</span>
      <span className="block text-[11px] text-slate-400">{description}</span>
    </span>
  </label>
);

export default function ExpenseSettings() {
  const toast = useToast();
  const { can } = useAuth();
  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .get('/expenses/settings')
      .then((res) => setSettings(res.settings || {}))
      .catch((err) => toast.error(err.message));
  }, [toast]);

  const update = (key, value) => setSettings((prev) => ({ ...prev, [key]: value }));

  const save = async () => {
    setSaving(true);
    try {
      const res = await api.put('/expenses/settings', { settings });
      setSettings(res.settings || {});
      toast.success(res.message || 'Expense policy updated.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!settings) return <LoadingBlock label="Loading expense policy…" />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-500">Expenses</p>
          <h1 className="mt-1 font-display text-[24px] font-extrabold tracking-tight text-ink-900">Expense settings</h1>
          <p className="mt-1 text-[13px] text-slate-500">Policy defaults used by the submission form, receipt checks and reimbursement reminders.</p>
        </div>
        <Button variant="primary" icon={Save} loading={saving} onClick={save}>Save policy</Button>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          <Card className="p-5">
            <SectionTitle title="Claim defaults" description="Applied to every new expense claim" />
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Select label="Default currency" value={settings.default_currency || 'USD'} onChange={(e) => update('default_currency', e.target.value)}>
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
              <Input
                label="Receipt required above amount"
                type="number"
                min="0"
                step="0.01"
                value={settings.receipt_threshold_amount ?? '0'}
                onChange={(e) => update('receipt_threshold_amount', e.target.value)}
                hint="0 means receipts are only required by category rules."
              />
              <Input
                label="Maximum receipt size (MB)"
                type="number"
                min="1"
                max="10"
                value={settings.max_attachment_mb ?? '10'}
                onChange={(e) => update('max_attachment_mb', e.target.value)}
                hint="Hard limit is 10 MB per file."
              />
              <Input
                label="Receipts per claim"
                type="number"
                min="1"
                max="5"
                value={settings.max_attachments_per_expense ?? '5'}
                onChange={(e) => update('max_attachments_per_expense', e.target.value)}
                hint="Up to 5 receipts can be attached."
              />
              <Input
                label="Reimbursement reminder (days)"
                type="number"
                min="1"
                value={settings.reimbursement_reminder_days ?? '7'}
                onChange={(e) => update('reimbursement_reminder_days', e.target.value)}
                hint="Used for pending reimbursement reminders."
              />
              <div className="flex items-end">
                <div className="flex w-full items-center gap-2 rounded-xl bg-emerald-50 px-3.5 py-2.5 text-[11.5px] text-emerald-700">
                  <ShieldCheck size={15} /> All financial amounts use DECIMAL and are validated server-side.
                </div>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Toggle
                checked={String(settings.allow_draft_claims ?? '1') === '1'}
                onChange={(v) => update('allow_draft_claims', v ? '1' : '0')}
                label="Allow draft claims"
                description="Employees can save incomplete claims before submitting."
              />
              <Toggle
                checked={String(settings.require_manager_approval ?? '1') === '1'}
                label="Require approval before reimbursement"
                description="Non-approved claims are never eligible for reimbursement."
                onChange={(v) => update('require_manager_approval', v ? '1' : '0')}
              />
            </div>
          </Card>

          <Card className="p-5">
            <SectionTitle title="Statement branding" description="Shown on generated PDF expense statements" />
            <div className="mt-4">
              <Textarea
                label="Statement footer"
                rows={2}
                maxLength={240}
                value={settings.statement_footer || ''}
                onChange={(e) => update('statement_footer', e.target.value)}
              />
            </div>
          </Card>

          <div className="flex justify-end">
            <Button variant="primary" icon={Check} loading={saving} onClick={save}>Save policy</Button>
          </div>
        </div>

        <div className="space-y-5">
          <Card className="p-5">
            <SectionTitle title="Module access" description="Managed by the five-role permission system" />
            <div className="mt-4 space-y-2.5 text-[12px] text-slate-500">
              {[
                ['Super Admin', 'Full expense access, categories and policy'],
                ['CEO', 'Organisation dashboard and reports'],
                ['Administration', 'Approvals, reimbursements and reports'],
                ['HR', 'Claims review and reports'],
                ['Employee', 'Own claims and personal statement'],
              ].map(([role, desc]) => (
                <div key={role} className="rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2.5">
                  <p className="text-[12px] font-semibold text-ink-800">{role}</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">{desc}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {can('roles.manage') && <Link to="/access" className="btn-secondary px-3 py-2 text-[12px]">Manage permissions</Link>}
              {can('expenses.categories.manage') && <Link to="/expenses/categories" className="btn-secondary px-3 py-2 text-[12px]"><Tag size={13} className="mr-1.5 inline" /> Categories</Link>}
              <Link to="/expenses/reports" className="btn-secondary px-3 py-2 text-[12px]"><SlidersHorizontal size={13} className="mr-1.5 inline" /> Reports</Link>
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-2.5">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand-600"><Receipt size={18} /></div>
              <div>
                <p className="text-[13px] font-bold text-ink-900">Secure receipts</p>
                <p className="text-[11px] text-slate-400">Private by design</p>
              </div>
            </div>
            <ul className="mt-4 space-y-2 text-[11.5px] text-slate-500">
              <li>• Receipts are stored outside the public web root.</li>
              <li>• Every download requires authentication and ownership or approver access.</li>
              <li>• File types and sizes are validated on upload.</li>
              <li>• Duplicate receipts and duplicate claims are rejected.</li>
            </ul>
          </Card>

          <Card className="p-5">
            <Field label="Policy notes">
              <p className="text-[11.5px] leading-relaxed text-slate-500">
                Changing these values never alters existing claims. Receipt requirements are re-checked when a claim is submitted or resubmitted.
              </p>
            </Field>
          </Card>
        </div>
      </div>
    </div>
  );
}
