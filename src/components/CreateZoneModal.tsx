import { useState } from 'react';
import type { LatLng } from '../types';
import { SPECIES } from '../data/species';
import type { NewZoneParams } from '../hooks/useCustomZones';

interface Props {
  location: LatLng;
  onConfirm: (params: NewZoneParams) => void;
  onCancel: () => void;
}

const ZONE_TYPES = [
  { value: 'pier', label: '🎣 Pier' },
  { value: 'inlet', label: '⚓ Inlet' },
  { value: 'flat', label: '🌊 Flat' },
  { value: 'reef', label: '🪸 Reef' },
  { value: 'pass', label: '🚢 Pass' },
] as const;

export function CreateZoneModal({ location, onConfirm, onCancel }: Props) {
  const [name, setName] = useState('');
  const [type, setType] = useState<NewZoneParams['type']>('pier');
  const [selectedSpecies, setSelectedSpecies] = useState<string[]>([]);
  const [notes, setNotes] = useState('');

  function toggle(id: string) {
    setSelectedSpecies(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !selectedSpecies.length) return;
    onConfirm({ location, name: name.trim(), type, activeSpeciesIds: selectedSpecies, notes: notes.trim() });
  }

  const canSubmit = name.trim().length > 0 && selectedSpecies.length > 0;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          background: '#1e293b',
          border: '1px solid #334155',
          borderRadius: 16,
          width: 360,
          maxHeight: '84vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #334155', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, color: '#f1f5f9' }}>📍 Create Custom Zone</div>
            <div style={{ color: '#475569', fontSize: 11, marginTop: 2 }}>
              {location.lat.toFixed(4)}°N, {Math.abs(location.lng).toFixed(4)}°W
            </div>
          </div>
          <button type="button" onClick={onCancel} style={{ color: '#64748b', background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, lineHeight: 1, padding: 0, marginTop: -2 }}>
            ×
          </button>
        </div>

        {/* Body */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Name */}
          <Field label="Zone Name *">
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. My Secret Spot"
              maxLength={50}
              autoFocus
              style={inputStyle}
            />
          </Field>

          {/* Type */}
          <Field label="Zone Type">
            <select value={type} onChange={e => setType(e.target.value as NewZoneParams['type'])} style={inputStyle}>
              {ZONE_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </Field>

          {/* Species */}
          <Field label="Target Species * (select all that apply)">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {SPECIES.map(sp => {
                const on = selectedSpecies.includes(sp.id);
                return (
                  <button
                    key={sp.id}
                    type="button"
                    onClick={() => toggle(sp.id)}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 999,
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: 'pointer',
                      background: on ? '#0ea5e920' : '#0f172a',
                      border: `1px solid ${on ? '#0ea5e9' : '#334155'}`,
                      color: on ? '#38bdf8' : '#94a3b8',
                      transition: 'all 0.12s',
                    }}
                  >
                    {sp.commonName}
                  </button>
                );
              })}
            </div>
          </Field>

          {/* Notes */}
          <Field label="Notes (optional)">
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Best times, local tips, structure details..."
              rows={3}
              maxLength={200}
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
            />
          </Field>
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 20px', borderTop: '1px solid #334155', display: 'flex', gap: 10 }}>
          <button
            type="button"
            onClick={onCancel}
            style={{ flex: 1, padding: '9px 0', borderRadius: 8, background: 'transparent', border: '1px solid #334155', color: '#94a3b8', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            style={{
              flex: 2, padding: '9px 0', borderRadius: 8, border: 'none',
              background: canSubmit ? '#0ea5e9' : '#1e293b',
              color: canSubmit ? '#0f172a' : '#475569',
              cursor: canSubmit ? 'pointer' : 'not-allowed',
              fontSize: 13, fontWeight: 700,
              transition: 'background 0.15s',
            }}
          >
            Create Zone
          </button>
        </div>
      </form>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: '#0f172a',
  border: '1px solid #334155',
  borderRadius: 8,
  padding: '8px 12px',
  color: '#f1f5f9',
  fontSize: 13,
  outline: 'none',
  boxSizing: 'border-box',
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
        {label}
      </div>
      {children}
    </div>
  );
}
