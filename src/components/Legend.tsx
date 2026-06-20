import type { Grade } from '../types';
import { GRADE_COLORS, GRADE_LABELS } from '../utils/scoring';

const GRADES: Grade[] = ['A', 'B', 'C', 'D', 'E', 'F'];

interface Props {
  visible: boolean;
  onToggle: () => void;
}

export function Legend({ visible, onToggle }: Props) {
  return (
    <div
      className="absolute bottom-36 right-3 z-50"
      style={{ fontFamily: 'system-ui, sans-serif' }}
    >
      <button
        onClick={onToggle}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold mb-1"
        style={{
          background: '#1e293b',
          border: '1px solid #334155',
          color: '#94a3b8',
          cursor: 'pointer',
          marginLeft: 'auto',
        }}
      >
        <span>◉</span> Legend
      </button>
      {visible && (
        <div
          className="rounded-xl p-3 text-xs"
          style={{
            background: '#1e293bef',
            border: '1px solid #334155',
            backdropFilter: 'blur(8px)',
            minWidth: 160,
          }}
        >
          <div style={{ color: '#64748b', fontWeight: 700, letterSpacing: '0.05em', marginBottom: 8 }}>
            BITE GRADE
          </div>
          {GRADES.map(g => (
            <div key={g} className="flex items-center gap-2 mb-1.5">
              <div
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  background: GRADE_COLORS[g],
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                  color: 'white',
                  fontSize: 11,
                  flexShrink: 0,
                  border: '2px solid rgba(255,255,255,0.2)',
                }}
              >
                {g}
              </div>
              <span style={{ color: '#e2e8f0' }}>{GRADE_LABELS[g]}</span>
            </div>
          ))}
          <div style={{ color: '#475569', fontSize: 10, marginTop: 8, borderTop: '1px solid #334155', paddingTop: 8 }}>
            Score = Bites (40%) + Conditions (35%) + Season (25%)
          </div>
        </div>
      )}
    </div>
  );
}
