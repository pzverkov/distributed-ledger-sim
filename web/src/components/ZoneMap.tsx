import { ZONES } from "../zones";
import { MAP_H, MAP_W, WORLD_PATH } from "../worldPath";

type Status = "OK" | "DEGRADED" | "DOWN";
type Zone = { id: string; name: string; status: Status; updated_at?: string };

type Props = {
  zones: Zone[];
  selectedId?: string;
  highlightIds?: string[];
  incidentCounts?: Map<string, { info: number; warn: number; crit: number }>;
  onSelect: (id: string) => void;
};

// Status is encoded by color AND glyph so it survives color blindness and grayscale.
const STATUS: Record<Status | "UNKNOWN", { color: string; glyph: string; word: string }> = {
  OK: { color: "rgba(34,197,94,.95)", glyph: "", word: "ok" },
  DEGRADED: { color: "rgba(245,158,11,.95)", glyph: "!", word: "degraded" },
  DOWN: { color: "rgba(239,68,68,.95)", glyph: "×", word: "down" },
  UNKNOWN: { color: "rgba(107,114,128,.8)", glyph: "?", word: "unknown" },
};

function statusOf(s?: string): Status | "UNKNOWN" {
  const u = s?.toUpperCase();
  return u === "OK" || u === "DEGRADED" || u === "DOWN" ? u : "UNKNOWN";
}

const LAT_LINES = [-30, 0, 30, 60];
const LON_LINES = [-120, -60, 0, 60, 120];

export default function ZoneMap(props: Props) {
  const lookup = new Map(props.zones.map(z => [z.id, z]));
  const highlight = new Set(props.highlightIds || []);

  const counts = { OK: 0, DEGRADED: 0, DOWN: 0, UNKNOWN: 0 };
  for (const m of ZONES) counts[statusOf(lookup.get(m.id)?.status)]++;
  const summary = (["DOWN", "DEGRADED", "OK", "UNKNOWN"] as const)
    .filter(k => counts[k] > 0)
    .map(k => `${counts[k]} ${STATUS[k].word}`)
    .join(", ");

  return (
    <div>
      <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} className="zmap" role="group" aria-label="Zone status map">
        <defs>
          <linearGradient id="zm-sea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="rgba(74,222,128,.10)" />
            <stop offset="1" stopColor="rgba(14,21,17,.40)" />
          </linearGradient>
        </defs>
        <rect width={MAP_W} height={MAP_H} rx="14" fill="url(#zm-sea)" stroke="rgba(36,48,71,.7)" />
        {LAT_LINES.map(la => {
          const y = Math.round(((85 - la) / 145) * MAP_H);
          return <line key={`a${la}`} x1="0" x2={MAP_W} y1={y} y2={y} stroke="rgba(148,163,184,.07)" />;
        })}
        {LON_LINES.map(lo => {
          const x = Math.round(((lo + 180) / 360) * MAP_W);
          return <line key={`o${lo}`} y1="0" y2={MAP_H} x1={x} x2={x} stroke="rgba(148,163,184,.07)" />;
        })}
        <path d={WORLD_PATH} fill="rgba(36,54,43,.85)" stroke="rgba(130,165,140,.4)" strokeWidth=".5" />

        {ZONES.map(meta => {
          const z = lookup.get(meta.id);
          const st = statusOf(z?.status);
          const { color, glyph, word } = STATUS[st];
          const selected = props.selectedId === meta.id;
          const inRadius = highlight.has(meta.id);
          const select = () => props.onSelect(meta.id);
          // Only actionable incidents (warn, crit) badge the map; info stays in the tiles.
          const ic = props.incidentCounts?.get(meta.id);
          const crit = ic?.crit ?? 0;
          const open = crit + (ic?.warn ?? 0);
          const badgeColor = crit > 0 ? "rgba(239,68,68,1)" : "rgba(245,158,11,1)";
          const incidentLabel = open > 0 ? `, ${open} open ${crit > 0 ? "incidents including critical" : "incidents"}` : "";
          // keep the label inside the frame near the map edges
          const tipW = meta.label.length * 6.2 + 34;
          const tipX = Math.max(4 - meta.x, Math.min(MAP_W - 4 - tipW - meta.x, -tipW / 2));
          const tipY = meta.y < 50 ? 22 : -46;

          return (
            <g
              key={meta.id}
              className={`zone${selected ? " sel" : ""}`}
              transform={`translate(${meta.x},${meta.y})`}
              role="button"
              tabIndex={0}
              aria-pressed={selected}
              aria-label={`${meta.label}, zone ${meta.n}, ${word}${incidentLabel}${inRadius ? ", in blast radius" : ""}`}
              onClick={select}
              onKeyDown={e => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  select();
                }
              }}
            >
              <circle className="hit" r={22} />
              {st === "DOWN" ? <circle className="pulse" r={13} fill={color} /> : null}
              {inRadius ? (
                <circle r={22} fill="rgba(245,158,11,.10)" stroke="rgba(245,158,11,.7)" strokeWidth="1.5" strokeDasharray="4 3" />
              ) : null}
              <circle
                className="ring"
                r={selected ? 15 : 13}
                fill="rgba(15,23,42,.95)"
                stroke={selected ? "rgba(143,227,181,.95)" : "rgba(71,85,105,.9)"}
                strokeWidth={selected ? 2.5 : 1.5}
              />
              <circle className="core" r={8} fill={color} />
              <text textAnchor="middle" y="3.5" fill="rgba(0,0,0,.9)" fontSize="10" fontWeight="800" pointerEvents="none">
                {glyph || meta.n}
              </text>
              {open > 0 ? (
                <g transform="translate(11,-11)" pointerEvents="none">
                  <circle r="7.5" fill={badgeColor} stroke="rgba(15,23,42,1)" strokeWidth="1.5" />
                  <text textAnchor="middle" y="3" fill="rgba(0,0,0,.92)" fontSize="9" fontWeight="800">
                    {open > 9 ? "9+" : open}
                  </text>
                </g>
              ) : null}
              <g className="tip" transform={`translate(${tipX},${tipY})`}>
                <rect width={tipW} height="24" rx="7" fill="rgba(2,6,23,.94)" stroke="rgba(71,85,105,.8)" />
                <circle cx="12" cy="12" r="4" fill={color} />
                <text x="22" y="16" fill="rgba(226,232,240,.97)" fontSize="11" fontWeight="600">
                  {meta.label}
                </text>
              </g>
            </g>
          );
        })}
      </svg>

      <div className="zlegend">
        <span role="status" aria-live="polite" style={{ color: "var(--text, inherit)" }}>{summary}</span>
        {(["OK", "DEGRADED", "DOWN"] as const).map(s => (
          <span key={s}>
            <i style={{ background: STATUS[s].color }} />
            {STATUS[s].word}
            {STATUS[s].glyph ? ` (${STATUS[s].glyph})` : ""}
          </span>
        ))}
        <span>
          <i style={{ background: "rgba(239,68,68,1)", width: 10, height: 10 }} />
          open incidents (badge)
        </span>
        <span>
          <i style={{ border: "1.5px dashed rgba(245,158,11,.8)" }} />
          blast radius
        </span>
      </div>
    </div>
  );
}
