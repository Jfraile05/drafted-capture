import { Play } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { sendMessage } from '../shared/hooks';
import {
  type AvailableWorkflow,
  type WorkflowAccess,
  annotationAvailable,
  selectedWorkflow,
  workflowRateLabel,
} from '../shared/workflows';

export default function WorkflowPicker({
  uid,
  busy,
  onStart,
}: {
  uid: string;
  busy: boolean;
  onStart: (workflowId: string, annotationOptIn: boolean) => void;
}) {
  const [workflows, setWorkflows] = useState<AvailableWorkflow[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [retry, setRetry] = useState(0);
  const [annotationOptIn, setAnnotationOptIn] = useState(false);
  const selectedDefinition = workflows.find((workflow) => workflow.id === selected);

  // biome-ignore lint/correctness/useExhaustiveDependencies: Retry requests a fresh server access check.
  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    void Promise.all([sendMessage<WorkflowAccess>('GET_WORKFLOWS'), selectedWorkflow(uid)])
      .then(([access, previous]) => {
        if (cancelled) return;
        if (access.uid !== uid) throw new Error('Account changed');
        setWorkflows(access.workflows);
        setSelected(access.workflows.some((item) => item.id === previous) ? previous : null);
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [uid, retry]);

  return (
    <div className="mt-4 space-y-3">
      {status === 'loading' ? (
        <output className="block py-3 text-sm text-text-muted">Loading your workflows...</output>
      ) : status === 'error' ? (
        <div className="space-y-2 py-2">
          <p className="text-sm text-text-muted" role="alert">
            Couldn't load your workflows.
          </p>
          <button
            type="button"
            className="btn-ghost w-full"
            onClick={() => setRetry((value) => value + 1)}
          >
            Try again
          </button>
        </div>
      ) : workflows.length === 0 ? (
        <p className="py-3 text-sm leading-relaxed text-text-muted">
          No workflows assigned yet. Drafted will assign your first task here.
        </p>
      ) : (
        <fieldset className="space-y-2" disabled={busy}>
          <legend className="sr-only">Choose a workflow</legend>
          {workflows.map((workflow) => (
            <label key={workflow.id} className="block cursor-pointer">
              <input
                type="radio"
                name="workflow"
                value={workflow.id}
                checked={selected === workflow.id}
                onChange={() => {
                  setSelected(workflow.id);
                  setAnnotationOptIn(false);
                }}
                className="peer sr-only"
              />
              <span className="flex min-h-12 items-center justify-between gap-3 rounded-card border border-white/10 px-3.5 py-3 transition-colors peer-checked:border-white/40 peer-checked:bg-white/[0.07] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-text-muted hover:bg-white/[0.04]">
                <span className="text-sm font-medium text-text">{workflow.name}</span>
                <span className="shrink-0 text-xs tabular-nums text-text-muted">
                  {workflowRateLabel(workflow.hourly_rate_cents)}
                  {annotationAvailable(workflow) && (
                    <span className="block text-[10px]">
                      +{workflowRateLabel(workflow.annotation_rate_cents)} annotation
                    </span>
                  )}
                </span>
              </span>
            </label>
          ))}
        </fieldset>
      )}
      {selectedDefinition && annotationAvailable(selectedDefinition) && (
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <input
            type="checkbox"
            checked={annotationOptIn}
            disabled={busy}
            onChange={(event) => setAnnotationOptIn(event.target.checked)}
          />
          Annotation bonus (+{workflowRateLabel(selectedDefinition.annotation_rate_cents)})
        </label>
      )}
      <button
        type="button"
        onClick={() => selected && onStart(selected, annotationOptIn)}
        disabled={busy || status !== 'ready' || !selected}
        className="btn-primary w-full"
      >
        <Play size={16} weight="fill" />
        {busy ? 'Starting...' : 'Start a task'}
      </button>
    </div>
  );
}
