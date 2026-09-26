'use client';

import { useState, useEffect } from 'react';
import { fetchDiagnostics, getApiBaseUrl, setCustomApiUrl } from '@/lib/api';
import { DiagnosticsStatus, ServiceStatus } from '@/types';

export default function DiagnosticsPage() {
  const [diag, setDiag] = useState<DiagnosticsStatus | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [currentUrl, setCurrentUrl] = useState<string>('');
  const [inputUrl, setInputUrl] = useState<string>('');
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);

  const loadDiagnostics = () => {
    setLoading(true);
    const activeUrl = getApiBaseUrl();
    setCurrentUrl(activeUrl);
    fetchDiagnostics()
      .then((res) => setDiag(res))
      .catch((err) => {
        console.error(err);
        setDiag(null);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadDiagnostics();
  }, []);

  const handleApplyCustomUrl = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputUrl.trim()) {
      setCustomApiUrl(inputUrl.trim());
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      loadDiagnostics();
    }
  };

  const handleResetDefaultUrl = () => {
    setCustomApiUrl('');
    setInputUrl('');
    loadDiagnostics();
  };

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
        <h1 className="text-3xl font-black text-slate-900 dark:text-white">IP-SAKTI System Diagnostics</h1>
        <p className="text-slate-600 dark:text-slate-400 text-sm mt-1">
          Live connection matrix for FastAPI Gateway, Groq LLM, Firebase Firestore, Backblaze B2, BHASHINI API, and Statutory Vector DB.
        </p>
      </div>

      {/* GATEWAY CONNECTION CONTROLLER */}
      <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div>
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Active Gateway Target URL</span>
            <div className="font-mono text-sm font-semibold text-emerald-600 dark:text-emerald-400 break-all mt-0.5">
              {currentUrl || 'Detecting...'}
            </div>
          </div>
          <button
            onClick={loadDiagnostics}
            disabled={loading}
            className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-slate-700 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 text-xs font-bold transition-all self-start sm:self-auto border border-slate-200 dark:border-slate-700 cursor-pointer"
          >
            {loading ? 'Testing...' : '🔄 Test / Refresh Gateway'}
          </button>
        </div>

        {/* CUSTOM URL OVERRIDE FORM */}
        <form onSubmit={handleApplyCustomUrl} className="space-y-2">
          <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            Connect Live Render Backend URL (Direct Browser Link):
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="url"
              placeholder="https://your-render-backend.onrender.com/api/v1"
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              className="flex-1 px-3 py-2 rounded-xl text-xs font-mono bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
            />
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-sm transition-all cursor-pointer"
            >
              Connect & Save
            </button>
            <button
              type="button"
              onClick={handleResetDefaultUrl}
              className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold transition-all cursor-pointer"
            >
              Reset Default
            </button>
          </div>
          {saveSuccess && (
            <p className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
              ✓ Custom Gateway URL saved and connected!
            </p>
          )}
        </form>
      </div>

      {loading ? (
        <div className="p-8 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center text-slate-500 dark:text-slate-400 text-sm">
          Querying system diagnostic matrix from <span className="font-mono text-xs">{currentUrl}</span>...
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
        <div className="p-6 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 space-y-3">
          <div className="flex items-center gap-2 text-rose-700 dark:text-rose-400 font-bold text-sm">
            <span>✖</span> Unable to connect to backend at <code className="font-mono text-xs bg-rose-100 dark:bg-rose-900/60 px-2 py-0.5 rounded">{currentUrl}</code>
          </div>
          <p className="text-xs text-rose-600 dark:text-rose-300 leading-relaxed">
            If your Render service was just started or is waking up from sleep, please wait 30–45 seconds and click <strong>&quot;Test / Refresh Gateway&quot;</strong>. You can also paste your live Render URL into the box above to link it immediately.
          </p>
        </div>
      )}
    </div>
  );
}

