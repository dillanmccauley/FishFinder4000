import { useState } from 'react';
import type { SpotCandidate } from '../types';
import type { FishingRegion } from '../data/regions';
import type { SpeciesOutlook } from '../hooks/useRegionForecast';
import type { DemGrid } from '../utils/spotDiscovery';
import {
  buildSpotsGpx,
  canShareFiles,
  downloadGpx,
  gpxFilename,
  shareGpx,
  spotsForScope,
  type GpxOptions,
} from '../utils/gpxExport';

interface Props {
  region: FishingRegion;
  spots: SpotCandidate[];
  outlooks: SpeciesOutlook[];
  dem: DemGrid;
  targetDate: Date;
  selectedOutlook: SpeciesOutlook | null;
  onClose: () => void;
}

const SPECIES_LIMIT = 10;

export function GarminExportModal({ region, spots, outlooks, dem, targetDate, selectedOutlook, onClose }: Props) {
  const [scope, setScope] = useState<GpxOptions['scope']>('all');
  const [status, setStatus] = useState<string | null>(null);

  const shareAvailable = canShareFiles();
  const opts: GpxOptions = { scope, outlook: selectedOutlook, limit: SPECIES_LIMIT };
  const count = spotsForScope(spots, opts).length;

  const build = () => buildSpotsGpx(spots, outlooks, region, dem, targetDate, opts);

  async function handleShare() {
    const filename = gpxFilename(region);
    const result = await shareGpx(filename, build());
    if (result === 'unsupported') {
      downloadGpx(filename, build());
      setStatus('Sharing unavailable — downloaded the file instead.');
    } else {
      setStatus(`Sent ${count} waypoint${count === 1 ? '' : 's'}. Open ActiveCaptain to import, then sync to your unit.`);
    }
  }

  function handleDownload() {
    const filename = gpxFilename(region);
    downloadGpx(filename, build());
    setStatus(`Downloaded ${filename} — ${count} waypoint${count === 1 ? '' : 's'}.`);
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: '#020617cc', zIndex: 10000,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        backdropFilter: 'blur(3px)',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#0f172a', border: '1px solid #334155', borderRadius: 14,
          width: '100%', maxWidth: 420, maxHeight: '86vh', overflowY: 'auto',
          boxShadow: '0 12px 48px rgba(0,0,0,0.7)',
        }}
      >
        {/* Header */}
        <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid #1e293b', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 800, fontSize: 15, color: '#f1f5f9' }}>📤 Send spots to Garmin</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>

        <div style={{ padding: '12px 16px 16px' }}>
          {/* Scope */}
          <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
            What to send
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <ScopeButton
              active={scope === 'all'}
              onClick={() => { setScope('all'); setStatus(null); }}
              label="All structure spots"
              sub={`${spots.length} waypoints`}
            />
            <ScopeButton
              active={scope === 'species'}
              onClick={() => { setScope('species'); setStatus(null); }}
              disabled={!selectedOutlook}
              label={selectedOutlook ? `Best for ${selectedOutlook.species.commonName}` : 'Best for species'}
              sub={selectedOutlook ? `top ${Math.min(SPECIES_LIMIT, spots.length)}` : 'select a species first'}
            />
          </div>

          {/* Actions */}
          {shareAvailable && (
            <button onClick={handleShare} style={primaryBtn}>
              📲 Send to ActiveCaptain
            </button>
          )}
          <button onClick={handleDownload} style={shareAvailable ? secondaryBtn : primaryBtn}>
            💾 Download .gpx
          </button>

          {status && (
            <div style={{
              marginTop: 10, padding: '8px 10px', borderRadius: 8,
              background: '#16a34a1a', border: '1px solid #16a34a55',
              color: '#4ade80', fontSize: 11, lineHeight: 1.5,
            }}>
              {status}
            </div>
          )}

          {/* Instructions */}
          <div style={{ marginTop: 16, borderTop: '1px solid #1e293b', paddingTop: 12 }}>
            {shareAvailable && (
              <Section title="Via ActiveCaptain (easiest)">
                <Step n={1}>Tap <b>Send to ActiveCaptain</b> and pick ActiveCaptain in the share sheet.</Step>
                <Step n={2}>ActiveCaptain imports the waypoints into its user data.</Step>
                <Step n={3}>Connect to your ECHOMAP's Wi-Fi in ActiveCaptain — user data syncs to the unit.</Step>
              </Section>
            )}

            <Section title={shareAvailable ? 'Via microSD card' : 'Getting the file onto your ECHOMAP'}>
              {!shareAvailable && (
                <Step n={0}>
                  <b>On a phone:</b> email or AirDrop the file to yourself, then open it in ActiveCaptain
                  and sync to the unit over Wi-Fi.
                </Step>
              )}
              <Step n={1}>Copy the .gpx into a <b>Garmin</b> folder at the card's root (if the unit says
                "no files found", try the card root instead).</Step>
              <Step n={2}>Insert the card, then set <b>Nav Info → User Data → Data Transfer → File Type</b> to <b>GPX</b>.</Step>
              <Step n={3}>Choose <b>Nav Info → Manage Data → Data Transfer → Merge from Card</b>.</Step>
            </Section>

            <div style={{
              marginTop: 10, padding: '8px 10px', borderRadius: 8,
              background: '#f59e0b14', border: '1px solid #f59e0b44',
              color: '#fbbf24', fontSize: 10.5, lineHeight: 1.55,
            }}>
              ⓘ The structure (holes, ledges, reefs) is permanent and always worth having aboard.
              The species grades in each waypoint name are a <b>snapshot</b> from right now — re-export
              when you're planning a new trip.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ScopeButton({ active, onClick, label, sub, disabled }: {
  active: boolean; onClick: () => void; label: string; sub: string; disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        flex: 1, textAlign: 'left', padding: '8px 10px', borderRadius: 9, cursor: disabled ? 'not-allowed' : 'pointer',
        background: active ? '#0ea5e91f' : '#1e293b66',
        border: `1px solid ${active ? '#0ea5e9' : '#334155'}`,
        opacity: disabled ? 0.45 : 1,
      }}
    >
      <div style={{ fontSize: 11.5, fontWeight: 700, color: active ? '#38bdf8' : '#e2e8f0', lineHeight: 1.3 }}>{label}</div>
      <div style={{ fontSize: 9.5, color: '#64748b', marginTop: 2 }}>{sub}</div>
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 7, marginBottom: 5, fontSize: 11, color: '#cbd5e1', lineHeight: 1.5 }}>
      {n > 0 && (
        <span style={{
          flexShrink: 0, width: 15, height: 15, borderRadius: '50%', background: '#1e293b',
          border: '1px solid #334155', color: '#94a3b8', fontSize: 9, fontWeight: 700,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginTop: 1,
        }}>{n}</span>
      )}
      <span>{children}</span>
    </div>
  );
}

const primaryBtn: React.CSSProperties = {
  width: '100%', padding: '10px 14px', borderRadius: 10, marginBottom: 8,
  background: '#0ea5e9', border: '1px solid #0ea5e9', color: '#082f49',
  fontSize: 13, fontWeight: 800, cursor: 'pointer',
};

const secondaryBtn: React.CSSProperties = {
  width: '100%', padding: '10px 14px', borderRadius: 10, marginBottom: 8,
  background: '#1e293b', border: '1px solid #475569', color: '#e2e8f0',
  fontSize: 13, fontWeight: 700, cursor: 'pointer',
};
