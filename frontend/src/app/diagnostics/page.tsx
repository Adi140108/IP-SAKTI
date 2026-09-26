'use client';

import { useState, useEffect, useCallback } from 'react';
import { fetchDiagnostics } from '@/lib/api';
import { DiagnosticsStatus, ServiceStatus } from '@/types';

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

  const renderStatusBadge = (status: ServiceStatus['status']) => {
    switch (status) {
      case 'CONNECTED':
        return <span className="px-3 py-1 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800 text-xs font-bold">✓ CONNECTED</span>;
      case 'NOT_CONFIGURED':
        return <span className="px-3 py-1 rounded-full bg-amber-950 text-amber-400 border border-amber-800 text-xs font-bold">⚠ DEV / UNCONFIGURED</span>;
      case 'DISCONNECTED':
      case 'ERROR':
        return <span className="px-3 py-1 rounded-full bg-rose-950 text-rose-400 border border-rose-800 text-xs font-bold">✖ DISCONNECTED</span>;
    }
  };

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 dark:text-white">IP-SAKTI System Diagnostics</h1>
          <p className="text-slate-600 dark:text-slate-400 text-sm mt-1">
            Live connection matrix for FastAPI Gateway, Groq LLM, Firebase Firestore, Backblaze B2, BHASHINI API, and Statutory Vector DB.
          </p>
        </div>
        <button
          onClick={loadDiagnostics}
          disabled={loading}
          className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-slate-700 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 text-xs font-bold transition-all self-start sm:self-auto border border-slate-200 dark:border-slate-700 cursor-pointer shadow-xs flex items-center gap-2"
        >
          {loading ? 'Testing Matrix...' : '🔄 Refresh Diagnostics'}
        </button>
      </div>

      {loading ? (
        <div className="p-8 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center text-slate-500 dark:text-slate-400 text-sm">
          Querying system diagnostic matrix...
        </div>
      ) : diag ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {Object.entries(diag).map(([key, service]) => {
            if (key === 'timestamp') return null;
            const s = service as ServiceStatus;
            return (
              <div key={key} className="glass-panel p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-base text-slate-900 dark:text-white">{s.name}</h3>
                  {renderStatusBadge(s.status)}
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 font-mono bg-slate-100 dark:bg-slate-950 p-3 rounded-lg border border-slate-200 dark:border-slate-900 leading-relaxed">
                  {s.details || 'No additional status details.'}
                </p>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="p-6 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 space-y-2">
          <div className="flex items-center gap-2 text-rose-700 dark:text-rose-400 font-bold text-sm">
            <span>✖</span> Unable to connect to backend diagnostics endpoint.
          </div>
          <p className="text-xs text-rose-600 dark:text-rose-300 leading-relaxed">
            The service is currently unavailable or waking up. Please click &quot;Refresh Diagnostics&quot; in a few moments.
          </p>
        </div>
      )}
    </div>
  );
}
