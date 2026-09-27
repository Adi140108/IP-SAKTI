'use client';

import { useState, useEffect, useCallback } from 'react';
import { fetchDiagnostics } from '@/lib/api';
import { DiagnosticsStatus, ServiceStatus } from '@/types';
import { RefreshIcon } from '@/components/Icons';

export default function DiagnosticsPage() {
  const [diag, setDiag] = useState<DiagnosticsStatus | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const loadDiagnostics = useCallback(() => {
    setLoading(true);
    fetchDiagnostics()
      .then((res) => setDiag(res))
      .catch((err) => {
        console.error(err);
        setDiag(null);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    let isMounted = true;
    fetchDiagnostics()
      .then((res) => {
        if (isMounted) setDiag(res);
      })
      .catch((err) => {
        console.error(err);
        if (isMounted) setDiag(null);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const statusMeta: Record<
    ServiceStatus['status'],
    { label: string; chip: string; dot: string }
  > = {
    CONNECTED: { label: 'Connected', chip: 'chip-ok', dot: 'status-dot-ok' },
    NOT_CONFIGURED: { label: 'Dev / Unconfigured', chip: 'chip-warn', dot: 'status-dot-warn' },
    DISCONNECTED: { label: 'Disconnected', chip: 'chip-danger', dot: 'status-dot-danger' },
    ERROR: { label: 'Error', chip: 'chip-danger', dot: 'status-dot-danger' },
  };

  const renderStatusBadge = (status: ServiceStatus['status']) => {
    const meta = statusMeta[status] ?? statusMeta.ERROR;
    return (
      <span className={`chip ${meta.chip}`}>
        <span className={`status-dot ${meta.dot}`} aria-hidden="true" />
        {meta.label}
      </span>
    );
  };

  return (
    <div className="pb-10">
      <div className="flex flex-wrap items-end justify-between gap-5 border-b border-line pb-6">
        <div>
          <h1 className="font-display text-[clamp(1.75rem,3.5vw,2.5rem)] leading-tight text-ink">
            IP-SAKTI System Diagnostics
          </h1>
          <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-muted">
            Live connection matrix for FastAPI Gateway, Groq LLM, Firebase Firestore, Backblaze B2,
            BHASHINI API, and Statutory Vector DB.
          </p>
        </div>

        <button
          onClick={loadDiagnostics}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-md border border-line-strong px-3 py-2 text-[12px] font-medium text-ink transition-colors hover:bg-subtle disabled:opacity-50"
        >
          <RefreshIcon size={13} className={loading ? 'animate-spin' : undefined} />
          {loading ? 'Testing Matrix...' : 'Refresh Diagnostics'}
        </button>
      </div>

      {loading ? (
        <p className="py-10 text-[13px] text-muted">Querying system diagnostic matrix...</p>
      ) : diag ? (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left">
            <thead>
              <tr className="border-b border-line">
                <th className="eyebrow py-4 pr-4 font-semibold">Service</th>
                <th className="eyebrow w-44 py-4 pr-4 font-semibold">Status</th>
                <th className="eyebrow py-4 font-semibold">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-subtle">
              {Object.entries(diag).map(([key, service]) => {
                if (key === 'timestamp') return null;
                const s = service as ServiceStatus;
                return (
                  <tr key={key} className="align-top">
                    <td className="py-4 pr-4 text-[13.5px] font-medium text-ink">{s.name}</td>
                    <td className="py-4 pr-4">
                      {renderStatusBadge(s.status)}
                    </td>
                    <td className="py-4 text-[12.5px] leading-relaxed text-muted">
                      {s.details || 'No additional status details.'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mt-6 space-y-2 rounded-lg border border-danger-line bg-danger-soft p-4">
          <div className="text-[13px] font-medium text-danger">
            Unable to connect to backend diagnostics endpoint.
          </div>
          <p className="text-[12px] leading-relaxed text-danger opacity-80">
            The service is currently unavailable or waking up. Please click &quot;Refresh
            Diagnostics&quot; in a few moments.
          </p>
        </div>
      )}
    </div>
  );
}
