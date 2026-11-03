import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Plus, ScrollText, Trash2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { api } from '../../lib/api';
import { Badge, Button, Card, EmptyState, Input, LoadingBlock, Modal, SectionTitle, Select } from '../../components/ui';

export default function OnboardingTemplates() {
  const navigate = useNavigate();
  const toast = useToast();
  const { can } = useAuth();
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name: '',
    type: 'full_time',
    description: '',
    tasks: [
      { title: 'Personal Details Form', category: 'PERSONAL INFORMATION', due_days: 2, is_mandatory: 1 },
      { title: 'Government ID Submission', category: 'DOCUMENT VERIFICATION', due_days: 3, is_mandatory: 1 },
      { title: 'Employment Agreement', category: 'EMPLOYMENT FORMALITIES', due_days: 2, is_mandatory: 1 },
    ],
  });

  const load = () => {
    setLoading(true);
    api
      .get('/onboarding/templates')
      .then((res) => setTemplates(res.templates || []))
      .catch((err) => toast.error(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreate = async () => {
    if (!form.name) return toast.error('Template name is required.');
    setSaving(true);
    try {
      await api.post('/onboarding/templates', form);
      toast.success('Onboarding template created successfully.');
      setModalOpen(false);
      setForm({
        name: '',
        type: 'full_time',
        description: '',
        tasks: [{ title: 'Personal Details Verification', category: 'PERSONAL INFORMATION', due_days: 2, is_mandatory: 1 }],
      });
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const addTask = () => {
    setForm({
      ...form,
      tasks: [...form.tasks, { title: '', category: 'DOCUMENT VERIFICATION', due_days: 3, is_mandatory: 1 }],
    });
  };

  const updateTask = (index, field, val) => {
    const updated = [...form.tasks];
    updated[index][field] = val;
    setForm({ ...form, tasks: updated });
  };

  const removeTask = (index) => {
    setForm({ ...form, tasks: form.tasks.filter((_, i) => i !== index) });
  };

  if (loading) return <LoadingBlock label="Loading onboarding templates…" />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="secondary" icon={ArrowLeft} onClick={() => navigate('/onboarding')} className="!p-2.5" />
          <div>
            <h1 className="font-display text-xl font-bold tracking-tight text-ink-900">Onboarding Templates</h1>
            <p className="mt-1 text-[13px] text-slate-500">
              Standardized role checklists for Interns, Full-Time hires, Contractors, and Freshers.
            </p>
          </div>
        </div>
        <Button variant="primary" icon={Plus} onClick={() => setModalOpen(true)}>
          Create Template
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {templates.map((tpl) => (
          <Card key={tpl.id} className="p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-ink-900 text-[14px]">{tpl.name}</span>
                <Badge tone="sky">{tpl.type.replace('_', ' ').toUpperCase()}</Badge>
              </div>
              <p className="mt-2 text-[12px] text-slate-500 leading-relaxed">
                {tpl.description || 'Standard onboarding checklist.'}
              </p>
            </div>
            <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-[12px] text-slate-400">
              <span>{tpl.task_count || 0} checklist items</span>
              <span className="font-medium text-emerald-600">Active</span>
            </div>
          </Card>
        ))}
      </div>

      {/* Create Template Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Create Onboarding Template"
        subtitle="Define tasks and required documents for this profile type."
        icon={ScrollText}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button variant="primary" loading={saving} icon={CheckCircle2} onClick={handleCreate}>Save Template</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Template Name"
            placeholder="e.g. Senior Engineering Onboarding"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
          <Select
            label="Template Type"
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}
          >
            <option value="full_time">Full-Time Employee</option>
            <option value="internship">Internship Onboarding</option>
            <option value="contract">Contractor Compliance</option>
            <option value="fresher">Fresher / Graduate</option>
          </Select>
          <Input
            label="Description"
            placeholder="Brief purpose of this template"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />

          <div className="pt-2">
            <div className="flex items-center justify-between mb-2">
              <label className="text-[12px] font-semibold text-slate-700">Checklist Tasks</label>
              <Button variant="secondary" size="sm" icon={Plus} onClick={addTask}>Add Task</Button>
            </div>
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {form.tasks.map((task, idx) => (
                <div key={idx} className="flex items-center gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                  <Input
                    placeholder="Task Title"
                    value={task.title}
                    onChange={(e) => updateTask(idx, 'title', e.target.value)}
                    className="flex-1"
                  />
                  <select
                    className="text-[12px] rounded-lg border border-slate-200 bg-white px-2 py-1.5"
                    value={task.category}
                    onChange={(e) => updateTask(idx, 'category', e.target.value)}
                  >
                    <option value="PERSONAL INFORMATION">Personal Info</option>
                    <option value="DOCUMENT VERIFICATION">Document</option>
                    <option value="EMPLOYMENT FORMALITIES">Formalities</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => removeTask(idx)}
                    className="p-1.5 text-slate-400 hover:text-rose-500 rounded-lg hover:bg-rose-50"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}

