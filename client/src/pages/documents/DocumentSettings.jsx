import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { BellRing, Check, FileText, Save, ShieldCheck, SlidersHorizontal, Tag } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { api } from '../../lib/api';
import { Button, Card, Input, LoadingBlock, SectionTitle } from '../../components/ui';

function Toggle({ checked, onChange, label, description }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 px-4 py-3.5">
      <span className={clsx('mt-0.5 flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition', checked ? 'bg-brand-600' : 'bg-slate-200')}>
        <span className={clsx('h-4 w-4 rounded-full bg-white shadow transition', checked && 'translate-x-4')} />
      </span>
      <input type="checkbox" className="hidden" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="block text-[12.5px] font-semibold text-ink-800">{label}</span>
        <span className="block text-[11px] text-slate-400">{description}</span>
      </span>
    </label>
  );
}

export default function DocumentSettings() {
  const toast = useToast();
  const { can } = useAuth();
  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .get('/documents/settings')
      .then((res) => setSettings(res.settings || {}))
      .catch((err) => toast.error(err.message));
  }, [toast]);

  const update = (key, value) => setSettings((prev) => ({ ...prev, [key]: value }));
  const flag = (key) => String(settings?.[key] ?? '1') === '1';

  const save = async () => {
    setSaving(true);
    try {
      const res = await api.put('/documents/settings', settings);
      setSettings(res.settings || settings);
      toast.success(res.message || 'Document settings saved.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!settings) return <LoadingBlock label="Loading document settings…" />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-500">Documents</p>
          <h1 className="mt-1 font-display text-[24px] font-extrabold tracking-tight text-ink-900">Document settings</h1>
          <p className="mt-1 text-[13px] text-slate-500">Upload policy, verification defaults, expiry windows and reminder behaviour.</p>
        </div>
        <Button variant="primary" icon={Save} loading={saving} onClick={save}>Save settings</Button>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          <Card className="p-5">
            <SectionTitle title="Module & upload policy" description="Applied to every new document upload" />
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                label="Maximum upload size (MB)"
                type="number"
                min="1"
                max="25"
                value={settings.max_upload_mb ?? '15'}
                onChange={(e) => update('max_upload_mb', e.target.value)}
                hint="Hard server limit is 25 MB."
              />
              <Input
                label="Allowed formats"
                value={settings.allowed_extensions ?? 'pdf,jpg,jpeg,png,doc,docx'}
                onChange={(e) => update('allowed_extensions', e.target.value)}
                hint="Comma-separated. Supported: pdf, jpg, jpeg, png, doc, docx."
              />
              <Input
                label="Expiry warning period (days)"
                type="number"
                min="0"
                max="365"
                value={settings.expiry_warning_days ?? '30'}
                onChange={(e) => update('expiry_warning_days', e.target.value)}
                hint="Documents inside this window are marked expiring soon."
              />
              <Input
                label="Reminder intervals (days)"
                value={settings.expiry_reminder_days ?? '30,15,7,0'}
                onChange={(e) => update('expiry_reminder_days', e.target.value)}
                hint="Comma-separated. 0 means the expiry day."
              />
              <Input
                label="Retention period (years)"
                type="number"
                min="1"
                max="50"
                value={settings.retention_years ?? '7'}
                onChange={(e) => update('retention_years', e.target.value)}
                hint="Reference value for document retention policy."
              />
              <div className="flex items-end">
                <div className="flex w-full items-center gap-2 rounded-xl bg-emerald-50 px-3.5 py-2.5 text-[11.5px] text-emerald-700">
                  <ShieldCheck size={15} /> Files are validated by extension, MIME type and content signature.
                </div>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Toggle checked={flag('documents_enabled')} onChange={(v) => update('documents_enabled', v ? '1' : '0')} label="Enable document management" description="When disabled, uploads and document APIs are blocked." />
              <Toggle checked={flag('default_requires_verification')} onChange={(v) => update('default_requires_verification', v ? '1' : '0')} label="Default verification requirement" description="Applied to new categories that require verification." />
            </div>
          </Card>

          <Card className="p-5">
            <SectionTitle title="Notifications & reminders" description="Reuses the existing notification bell and reminder scheduler" />
            <div className="mt-4 space-y-3">
              <Toggle checked={flag('notify_employee')} onChange={(v) => update('notify_employee', v ? '1' : '0')} label="Notify employees" description="Expiry, missing document and verification updates." />
              <Toggle checked={flag('notify_hr')} onChange={(v) => update('notify_hr', v ? '1' : '0')} label="Notify HR & verifiers" description="Expiring, expired and newly uploaded documents." />
              <Toggle checked={flag('missing_document_reminders')} onChange={(v) => update('missing_document_reminders', v ? '1' : '0')} label="Missing document reminders" description="One reminder per employee, category and day." />
            </div>
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3.5 py-3 text-[11.5px] leading-relaxed text-slate-500">
              <BellRing size={15} className="mt-0.5 shrink-0 text-brand-500" />
              Reminder runs are deduplicated in the database, so repeating a run never creates duplicate notifications. Use the expiring page to trigger a run manually.
            </div>
          </Card>

          <div className="flex justify-end">
            <Button variant="primary" icon={Check} loading={saving} onClick={save}>Save settings</Button>
          </div>
        </div>

        <div className="space-y-5">
          <Card className="p-5">
            <SectionTitle title="Secure storage" description="Private by design" />
            <ul className="mt-4 space-y-2.5 text-[11.5px] leading-relaxed text-slate-500">
              <li className="flex gap-2"><FileText size={14} className="mt-0.5 shrink-0 text-brand-500" /> Files are stored in a private Backblaze B2 bucket when configured.</li>
              <li className="flex gap-2"><ShieldCheck size={14} className="mt-0.5 shrink-0 text-emerald-500" /> Every preview and download requires authentication and an ownership or permission check.</li>
              <li className="flex gap-2"><FileText size={14} className="mt-0.5 shrink-0 text-brand-500" /> Stored names are generated identifiers; original names are sanitised metadata only.</li>
              <li className="flex gap-2"><ShieldCheck size={14} className="mt-0.5 shrink-0 text-emerald-500" /> Path traversal and unsupported content signatures are rejected before storage.</li>
            </ul>
          </Card>

          <Card className="p-5">
            <SectionTitle title="Related configuration" description="Categories and reporting" />
            <div className="mt-4 flex flex-wrap gap-2">
              {can('documents.categories.manage') && <Link to="/documents/categories" className="btn-secondary px-3 py-2 text-[12px]"><Tag size={13} className="mr-1.5 inline" /> Categories</Link>}
              {can('documents.reports') && <Link to="/documents/reports" className="btn-secondary px-3 py-2 text-[12px]"><SlidersHorizontal size={13} className="mr-1.5 inline" /> Reports</Link>}
              {can('roles.manage') && <Link to="/access" className="btn-secondary px-3 py-2 text-[12px]">Permissions</Link>}
            </div>
          </Card>

          <Card className="p-5">
            <p className="text-[12px] font-bold text-ink-900">Role access</p>
            <div className="mt-3 space-y-2 text-[11px] text-slate-500">
              {[
                ['Super Admin', 'Full document access, settings and audit'],
                ['CEO', 'Overview, reports and authorised read'],
                ['Administration', 'Manage documents where authorised'],
                ['HR', 'Manage, upload, verify, remind and report'],
                ['Employee', 'Own documents, upload and replace'],
              ].map(([role, desc]) => (
                <div key={role} className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2">
                  <p className="text-[11.5px] font-semibold text-ink-800">{role}</p>
                  <p className="text-[10.5px] text-slate-500">{desc}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
