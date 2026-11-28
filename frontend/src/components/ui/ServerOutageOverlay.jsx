import { useEffect, useState } from 'react';
import { ServerOff, RefreshCw, AlertTriangle, ShieldAlert } from 'lucide-react';
import { checkServersHealth, SERVER_ENDPOINTS, getActiveEndpoint } from '../../services/api';
import Button from './Button';

/**
 * Fullscreen resilient overlay displayed when all backend/database nodes are unreachable.
 * Features automatic countdown retry, candidate node health-probing, and manual "Try Again" trigger.
 */
export default function ServerOutageOverlay() {
  const [retrying, setRetrying] = useState(false);
  const [countdown, setCountdown] = useState(12);
  const [activeNode, setActiveNode] = useState(getActiveEndpoint());

  const handleRetry = async () => {
    setRetrying(true);
    try {
      const result = await checkServersHealth();
      if (result.online) {
        // Servers back online! Screen will automatically unmount via onServerOutageChange listener
        window.location.reload();
      }
    } finally {
      setRetrying(false);
      setCountdown(12);
    }
  };

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          handleRetry();
          return 12;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-lg rounded-2xl border border-rose-500/30 bg-white p-7 text-center shadow-2xl dark:border-rose-500/20 dark:bg-[#15171C]">
        {/* Pulsing Alert Icon */}
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-500 ring-8 ring-rose-500/5">
          <ServerOff className="h-8 w-8 animate-pulse" />
        </div>

        {/* Status Badge */}
        <div className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-xs font-semibold text-rose-600 dark:text-rose-400 mb-3">
          <span className="h-2 w-2 rounded-full bg-rose-500 animate-ping" />
          Infrastructure Unreachable
        </div>

        {/* Main Heading */}
        <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
          All servers are down
        </h1>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
          The application is currently unable to establish a secure connection with any backend or database nodes.
          Please try again later or check your local mini PC and network status.
        </p>

        {/* Configured Nodes Probe Status */}
        <div className="my-5 rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-left text-xs dark:border-[#26282D] dark:bg-[#1E2025]">
          <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
            <span>Configured Failover Nodes</span>
            <span>Status</span>
          </div>
          <div className="space-y-1.5 font-mono text-[11px]">
            {SERVER_ENDPOINTS.map((endpoint, idx) => (
              <div key={endpoint} className="flex items-center justify-between truncate">
                <span className="truncate text-slate-600 dark:text-slate-300">
                  Node {idx + 1}: {endpoint}
                </span>
                <span className="text-rose-500 font-semibold ml-2 shrink-0">Offline</span>
              </div>
            ))}
          </div>
        </div>

        {/* Actions & Auto-retry countdown */}
        <div className="space-y-3">
          <Button
            type="button"
            className="w-full flex items-center justify-center gap-2"
            disabled={retrying}
            onClick={handleRetry}
          >
            <RefreshCw className={`h-4 w-4 ${retrying ? 'animate-spin' : ''}`} />
            {retrying ? 'Connecting to servers…' : 'Try Again Now'}
          </Button>

          <p className="text-[11px] text-slate-400">
            Automatically checking for server recovery in <strong className="text-slate-600 dark:text-slate-200">{countdown}s</strong>
          </p>
        </div>
      </div>
    </div>
  );
}
