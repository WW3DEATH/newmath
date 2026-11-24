import { AlertTriangle, X } from 'lucide-react';

export interface ConfirmDialogState {
  title: string;
  description: string;
  details?: string[];
  confirmLabel: string;
  tone: 'danger' | 'primary';
  onConfirm: () => Promise<void> | void;
}

interface ConfirmationModalProps {
  dialog: ConfirmDialogState | null;
  isBusy: boolean;
  onClose: () => void;
}

export function ConfirmationModal({
  dialog,
  isBusy,
  onClose,
}: ConfirmationModalProps) {
  if (!dialog) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
    >
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                dialog.tone === 'danger'
                  ? 'bg-red-50 text-red-600'
                  : 'bg-blue-50 text-blue-700'
              }`}
            >
              <AlertTriangle className="h-5 w-5" />
            </div>
            <h2
              id="confirm-modal-title"
              className="text-base font-semibold text-slate-900"
            >
              {dialog.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isBusy}
            className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-blue-700"
            aria-label="Close confirmation dialog"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-3 text-sm leading-relaxed text-slate-600">
          {dialog.description}
        </p>

        {dialog.details && dialog.details.length > 0 && (
          <ul className="mt-3 space-y-1.5 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
            {dialog.details.map((item, idx) => (
              <li key={idx} className="truncate">
                {item}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isBusy}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-blue-700 whitespace-nowrap shrink-0"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isBusy}
            onClick={async () => {
              await dialog.onConfirm();
            }}
            className={`rounded-lg px-4 py-2 text-xs font-semibold text-white transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 whitespace-nowrap shrink-0 disabled:opacity-60 ${
              dialog.tone === 'danger'
                ? 'bg-red-600 hover:bg-red-700 focus-visible:outline-red-600'
                : 'bg-blue-700 hover:bg-blue-800 focus-visible:outline-blue-700'
            }`}
          >
            {isBusy ? 'Processing...' : dialog.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
