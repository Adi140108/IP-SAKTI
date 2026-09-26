'use client';

import { useState, useEffect } from 'react';
import { fetchDiagnostics } from '@/lib/api';
import { DiagnosticsStatus, ServiceStatus } from '@/types';

export default function DiagnosticsPage() {
  const [diag, setDiag] = useState<DiagnosticsStatus | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    fetchDiagnostics()
      .then((res) => setDiag(res))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
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
      <div>
        <h1 className="text-3xl font-black text-white">IP-SAKTI System Diagnostics</h1>
        <p className="text-slate-400 text-sm mt-1">
          Live connection matrix for FastAPI Gateway, Firebase Firestore, Backblaze B2, Gemma 4 12B, BHASHINI API, and Vector DB.
        </p>
      </div>

      {loading ? (
        <div className="text-slate-400 text-sm">Querying system diagnostic matrix...</div>
      ) : diag ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {Object.entries(diag).map(([key, service]) => {
            if (key === 'timestamp') return null;
            const s = service as ServiceStatus;
            return (
              <div key={key} className="glass-panel p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-base text-white">{s.name}</h3>
                  {renderStatusBadge(s.status)}
                </div>
                <p className="text-xs text-slate-400 font-mono bg-slate-950 p-3 rounded-lg border border-slate-900 leading-relaxed">
                  {s.details || 'No additional status details.'}
                </p>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-rose-400 text-sm">Unable to connect to backend diagnostics endpoint.</div>
      )}
    </div>
  );
}
