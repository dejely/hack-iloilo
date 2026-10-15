// Elevations of the dryer, storage silo and mill for the plant view.
// Classes are styled in `plant-view.css`; `PlantDefs` must render once on the page.

import { formatTonnes } from "@/lib/format";

const fill = (v: string) => ({ fill: v });
const f = {
  metal: fill("var(--metal)"),
  metal2: fill("var(--metal-2)"),
  window: fill("var(--window)"),
  grain: fill("var(--grain)"),
  card: fill("var(--card)"),
};
const url = {
  cyl: "url(#plant-cyl)",
  flat: "url(#plant-flat)",
  tube: "url(#plant-tube)",
  grain: "url(#plant-grain)",
  ground: "url(#plant-ground)",
  corr: "url(#plant-corr)",
  siding: "url(#plant-siding)",
  louver: "url(#plant-louver)",
};

/** Gradients and hatches the drawings share. */
export function PlantDefs() {
  const stop = (offset: string, v: string) => (
    <stop offset={offset} style={{ stopColor: `var(--${v})` }} />
  );
  const hatch = (id: string, w: number, h: number, d: string, sw = 0.45) => (
    <pattern id={id} width={w} height={h} patternUnits="userSpaceOnUse">
      <path d={d} style={{ stroke: "var(--metal-dk)" }} strokeWidth={sw} />
    </pattern>
  );
  return (
    <svg
      width="0"
      height="0"
      className="absolute"
      aria-hidden
      focusable="false"
    >
      <defs>
        <linearGradient id="plant-cyl" x1="0" x2="1" y1="0" y2="0">
          {stop("0", "metal-dk")}
          {stop(".3", "metal-hi")}
          {stop(".6", "metal")}
          {stop("1", "metal-dk")}
        </linearGradient>
        <linearGradient id="plant-flat" x1="0" x2="0" y1="0" y2="1">
          {stop("0", "metal-hi")}
          {stop("1", "metal")}
        </linearGradient>
        <linearGradient id="plant-tube" x1="0" x2="0" y1="0" y2="1">
          {stop("0", "metal-dk")}
          {stop(".35", "metal-hi")}
          {stop("1", "metal-dk")}
        </linearGradient>
        <pattern
          id="plant-grain"
          width="5"
          height="4"
          patternUnits="userSpaceOnUse"
        >
          <ellipse
            cx="1.5"
            cy="1"
            rx="1.2"
            ry=".5"
            style={fill("var(--grain-dk)")}
          />
          <ellipse
            cx="4"
            cy="3"
            rx="1.2"
            ry=".5"
            transform="rotate(25 4 3)"
            style={fill("var(--grain-dk)")}
          />
        </pattern>
        <pattern
          id="plant-ground"
          width="5"
          height="5"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M0 5 L5 0"
            style={{ stroke: "var(--muted-foreground)" }}
            strokeWidth=".5"
          />
        </pattern>
        {hatch("plant-corr", 6, 3, "M0 .5 H6")}
        {hatch("plant-siding", 4, 6, "M.5 0 V6")}
        {hatch("plant-louver", 6, 5, "M0 4 L4 1", 0.7)}
      </defs>
    </svg>
  );
}

/** Break line along the top of a cutaway, from x1 to x2 at y. */
function zig(x1: number, x2: number, y: number, a = 3.5, s = 6) {
  const p: string[] = [];
  for (let x = x1, k = 0; x < x2; x += s, k++) {
    p.push(`${x},${k % 2 ? y - a : y}`);
  }
  p.push(`${x2},${y}`);
  return p.join(" ");
}

function Ground({ x1, x2 }: { x1: number; x2: number }) {
  return (
    <>
      <rect x={x1} y="220" width={x2 - x1} height="7" fill={url.ground} />
      <line className="o" x1={x1} y1="220" x2={x2} y2="220" />
    </>
  );
}

/** Grain inside a cutaway, level `yL`, heaped in the middle. */
function Grain(p: {
  x1: number;
  x2: number;
  yL: number;
  bot: number;
  heap: number;
}) {
  const top = `M${p.x1} ${p.yL} Q${(p.x1 + p.x2) / 2} ${p.yL - p.heap} ${p.x2} ${p.yL}`;
  const d = `M${p.x1} ${p.bot} V${p.yL} Q${(p.x1 + p.x2) / 2} ${p.yL - p.heap} ${p.x2} ${p.yL} V${p.bot} Z`;
  return (
    <>
      <path d={d} style={f.grain} />
      <path d={d} fill={url.grain} />
      <path className="d" d={top} />
    </>
  );
}

/** Palay that doesn't fit, piled on the ground. */
function Pile({ x1, x2, label }: { x1: number; x2: number; label: string }) {
  const d = `M${x1} 220 Q${(x1 + x2) / 2} 192 ${x2} 220 Z`;
  return (
    <>
      <path d={d} style={f.grain} />
      <path d={d} fill={url.grain} />
      <path className="ovl" d={d} />
      <text className="lbl ov" x={(x1 + x2) / 2} y="190" textAnchor="middle">
        {label}
      </text>
    </>
  );
}

function Spin({
  x,
  y,
  children,
}: {
  x: number;
  y: number;
  children: React.ReactNode;
}) {
  return (
    <g className="spin" style={{ transformOrigin: `${x}px ${y}px` }}>
      {children}
    </g>
  );
}

const pctOf = (level: number) => Math.round(level * 100);

/** Recirculating batch dryer, front elevation. */
export function DryerDrawing({
  level,
  overKg,
}: {
  /** Expected load over capacity. */
  level: number;
  overKg: number;
}) {
  const top = 59;
  const bot = 114;
  const yL = bot - (bot - top) * Math.min(level, 1);
  const rungs = Array.from(
    { length: 30 },
    (_, i) => `M219 ${36 + i * 6} H225`,
  ).join(" ");
  const screw = "M146 192" + " l3 7 l3 -7".repeat(10);
  const seams = [46, 70, 94, 118, 142, 166, 190]
    .map((y) => `M200 ${y} H212`)
    .join(" ");
  return (
    <svg
      viewBox="0 0 320 240"
      role="img"
      aria-label={`Dryer, ${pctOf(level)}% loaded`}
    >
      <Ground x1={14} x2={306} />
      <rect
        className="o"
        x="114"
        y="184"
        width="4"
        height="30"
        style={f.metal2}
      />
      <rect
        className="o"
        x="182"
        y="184"
        width="4"
        height="30"
        style={f.metal2}
      />
      <path className="d" d="M118 190 L182 212 M118 212 L182 190" />
      <polygon
        className="o"
        points="110,170 190,170 158,192 142,192"
        fill={url.flat}
      />
      <path className="d" d="M130 170 L146 192 M170 170 L154 192" />
      <rect
        className="o"
        x="110"
        y="120"
        width="80"
        height="50"
        style={f.metal}
      />
      <rect x="110.5" y="120.5" width="79" height="49" fill={url.louver} />
      <path className="d" d="M130 120 V170 M150 120 V170 M170 120 V170" />
      <rect
        className="o"
        x="110"
        y="44"
        width="80"
        height="76"
        fill={url.flat}
      />
      <path
        className="d"
        d="M110 63 H122 M178 63 H190 M110 82 H122 M178 82 H190 M110 101 H122 M178 101 H190"
      />
      <path
        className="bolt"
        d="M113.5 48 V117 M186.5 48 V117 M114 122.5 H188"
      />
      <polygon
        className="o"
        points={`${zig(122, 178, 57)} 178,114 122,114`}
        style={f.window}
      />
      <Grain x1={122} x2={178} yL={yL} bot={bot} heap={5} />
      <text className="lvl" x="126" y={Math.min(yL + 11, 111)}>
        {pctOf(level)}%
      </text>
      <polygon className="o" points="106,44 150,30 194,44" style={f.metal2} />
      <rect
        className="o"
        x="164"
        y="31"
        width="12"
        height="9"
        style={f.metal}
      />
      <rect
        className="o"
        x="200"
        y="22"
        width="12"
        height="192"
        fill={url.cyl}
      />
      <path className="d" d={seams} />
      <path
        className="o"
        d="M196 26 V14 Q206 4 216 14 V26 Z"
        style={f.metal2}
      />
      <Spin x={206} y={16}>
        <circle className="d" cx="206" cy="16" r="4" />
        <path className="d" d="M202 16 H210 M206 12 V20" />
      </Spin>
      <polygon
        className="o"
        points="197,18 197,25 176,38 172,33"
        fill={url.tube}
      />
      <path className="flow" d="M196 21 L174 35" />
      <rect
        className="o"
        x="142"
        y="192"
        width="68"
        height="7"
        fill={url.tube}
      />
      <path className="d" d={screw} />
      <rect
        className="o"
        x="196"
        y="196"
        width="20"
        height="18"
        style={f.metal2}
      />
      <path className="d" d={`M219 30 V214 M225 30 V214 ${rungs}`} />
      <rect
        className="o"
        x="100"
        y="214"
        width="128"
        height="6"
        style={f.metal2}
      />
      <circle className="o" cx="66" cy="150" r="16" fill={url.flat} />
      <Spin x={66} y={150}>
        <circle className="d" cx="66" cy="150" r="10" />
        <path
          className="d"
          d="M56 150 H76 M66 140 V160 M59 143 L73 157 M73 143 L59 157"
        />
      </Spin>
      <rect
        className="o"
        x="38"
        y="142"
        width="12"
        height="16"
        style={f.metal2}
      />
      <rect
        className="o"
        x="80"
        y="136"
        width="30"
        height="10"
        fill={url.tube}
      />
      <path className="flow" d="M84 141 H108" />
      <rect
        className="o"
        x="40"
        y="166"
        width="40"
        height="24"
        style={f.metal2}
      />
      <circle className="o" cx="52" cy="178" r="5" style={f.window} />
      <path
        className="flame"
        d="M52 182 C48.5 179 50.5 176 52 173 C53.5 176 55.5 179 52 182 Z"
      />
      <path className="d" d="M62 172 H76 M62 176 H76 M62 180 H76 M62 184 H76" />
      <path className="o" d="M46 190 V220 M74 190 V220" />
      {overKg > 0 && (
        <Pile x1={234} x2={296} label={`OVERFLOW +${formatTonnes(overKg)}`} />
      )}
    </svg>
  );
}

/** Steel silo, elevation with cutaway. */
export function SiloDrawing({
  level,
  overKg,
}: {
  level: number;
  overKg: number;
}) {
  const top = 78;
  const bot = 206;
  const yL = bot - (bot - top) * Math.min(level, 1);
  const rungs = Array.from(
    { length: 25 },
    (_, i) => `M57 ${64 + i * 6} H63`,
  ).join(" ");
  const truss = Array.from({ length: 7 }, (_, i) => {
    const x = 150 + i * 12;
    const y = 31 + i * 12 * (38 / 84);
    return `M${x} ${y} L${x + 6} ${y + 8.7}`;
  }).join(" ");
  return (
    <svg
      viewBox="0 0 320 240"
      role="img"
      aria-label={`Storage, ${pctOf(level)}% full`}
    >
      <Ground x1={6} x2={314} />
      <rect
        className="o"
        x="214"
        y="92"
        width="56"
        height="122"
        fill={url.cyl}
      />
      <rect x="214.5" y="92.5" width="55" height="121" fill={url.corr} />
      <path className="d" d="M226 92 V214 M258 92 V214" />
      <polygon className="o" points="210,92 242,72 274,92" fill={url.flat} />
      <path className="d" d="M242 72 L224 92 M242 72 L260 92" />
      <rect
        className="o"
        x="206"
        y="214"
        width="72"
        height="6"
        style={f.metal2}
      />
      <path className="o" d="M150 28 L238 68 M150 36 L238 76" fill="none" />
      <path className="d" d={truss} />
      <rect
        className="o"
        x="62"
        y="210"
        width="116"
        height="10"
        style={f.metal2}
      />
      <rect
        className="o"
        x="70"
        y="62"
        width="100"
        height="148"
        fill={url.cyl}
      />
      <rect x="70.5" y="62.5" width="99" height="147" fill={url.corr} />
      <path className="d" d="M84 62 V210 M156 62 V210" />
      <path className="bolt" d="M71 110 H169 M71 160 H169" />
      <rect
        className="o"
        x="67"
        y="58"
        width="106"
        height="5"
        style={f.metal2}
      />
      <polygon className="o" points="66,58 120,26 174,58" fill={url.flat} />
      <path
        className="d"
        d="M120 26 L84 58 M120 26 L102 58 M120 26 L138 58 M120 26 L156 58"
      />
      <rect
        className="o"
        x="114"
        y="18"
        width="12"
        height="9"
        style={f.metal}
      />
      <polygon className="o" points="110,19 120,12 130,19" style={f.metal2} />
      <circle className="o" cx="78" cy="198" r="5" style={f.metal2} />
      <Spin x={78} y={198}>
        <path className="d" d="M74 198 H82 M78 194 V202" />
      </Spin>
      <polygon
        className="o"
        points={`${zig(94, 146, top - 4)} 146,${bot} 94,${bot}`}
        style={f.window}
      />
      <Grain x1={94} x2={146} yL={yL} bot={bot} heap={9} />
      <text className="lvl" x="98" y={Math.min(yL + 12, bot - 3)}>
        {pctOf(level)}%
      </text>
      <path className="d" d={`M57 58 V210 M63 58 V210 ${rungs}`} />
      <path className="ldr" d={`M183 ${top} V${bot}`} />
      {[0, 25, 50, 75, 100].map((t) => {
        const y = bot - ((bot - top) * t) / 100;
        return (
          <g key={t}>
            <path className="d" d={`M181 ${y} H185`} />
          </g>
        );
      })}
      <polygon
        className="ptr"
        points={`181,${yL} 175,${yL - 3.5} 175,${yL + 3.5}`}
      />
      {overKg > 0 && <Pile x1={8} x2={54} label={`+${formatTonnes(overKg)}`} />}
    </svg>
  );
}

/** Rice mill, building section showing the process line. */
export function MillDrawing({ level }: { level: number }) {
  const sacks = Math.round(Math.min(level, 1) * 8);
  const elev = (x: number, w: number) => (
    <>
      <rect className="o" x={x} y="100" width={w} height="112" fill={url.cyl} />
      <path
        className="o"
        d={`M${x - 2} 104 V98 Q${x + w / 2} 91 ${x + w + 2} 98 V104 Z`}
        style={f.metal2}
      />
    </>
  );
  return (
    <svg
      viewBox="0 0 320 240"
      role="img"
      aria-label={`Mill, ${pctOf(level)}% of daily throughput`}
    >
      <Ground x1={8} x2={312} />
      <rect
        className="o"
        x="18"
        y="72"
        width="284"
        height="148"
        fill={url.flat}
      />
      <rect x="18.5" y="72.5" width="283" height="147" fill={url.siding} />
      <polygon className="o" points="12,74 160,40 308,74" style={f.metal2} />
      <rect
        className="o"
        x="136"
        y="36"
        width="48"
        height="10"
        style={f.metal}
      />
      <path
        className="d"
        d="M140 38 V44 M148 38 V44 M156 38 V44 M164 38 V44 M172 38 V44 M180 38 V44"
      />
      <polygon className="o" points="132,37 160,28 188,37" style={f.metal2} />
      <polygon
        className="o"
        points={`${zig(30, 290, 90)} 290,212 30,212`}
        style={f.window}
      />
      {elev(40, 8)}
      <path className="spout" d="M50 99 L74 146" />
      <path className="flow" d="M50 99 L74 146" />
      <polygon
        className="o"
        points="56,212 56,154 92,146 92,212"
        fill={url.flat}
      />
      <path
        className="d"
        d="M60 162 L88 156 M60 172 L88 166 M60 182 L88 176 M60 192 L88 186"
      />
      {elev(98, 7)}
      <path className="spout" d="M107 100 L126 138" />
      <path className="flow" d="M107 100 L126 138" />
      <polygon
        className="o"
        points="112,138 144,138 134,156 122,156"
        style={f.metal}
      />
      <rect
        className="o"
        x="112"
        y="156"
        width="32"
        height="56"
        fill={url.flat}
      />
      <circle className="o" cx="122" cy="174" r="5.5" style={f.metal2} />
      <circle className="o" cx="134" cy="174" r="5.5" style={f.metal2} />
      <Spin x={122} y={174}>
        <path className="d" d="M118 174 H126 M122 170 V178" />
      </Spin>
      <Spin x={134} y={174}>
        <path className="d" d="M130 174 H138 M134 170 V178" />
      </Spin>
      <path className="d" d="M116 196 H140 M116 200 H140" />
      <rect
        className="o"
        x="150"
        y="166"
        width="38"
        height="46"
        fill={url.flat}
      />
      <path
        className="d"
        d="M154 174 L184 180 M154 184 L184 190 M154 194 L184 200"
      />
      {elev(194, 7)}
      <path className="spout" d="M203 100 L222 156" />
      <path className="flow" d="M203 100 L222 156" />
      <polygon
        className="o"
        points="214,152 232,152 227,164 219,164"
        style={f.metal}
      />
      <rect
        className="o"
        x="206"
        y="164"
        width="40"
        height="18"
        rx="9"
        fill={url.tube}
      />
      <path className="o" d="M212 182 V212 M240 182 V212" fill="none" />
      <circle className="o" cx="226" cy="173" r="4" style={f.metal2} />
      <Spin x={226} y={173}>
        <path className="d" d="M223 173 H229 M226 170 V176" />
      </Spin>
      <path className="d" d="M223 176 L232 198 M229 176 L240 198" />
      <rect
        className="o"
        x="228"
        y="196"
        width="16"
        height="12"
        style={f.metal2}
      />
      <polygon
        className="o"
        points="252,140 284,140 272,166 264,166"
        style={f.metal}
      />
      <rect
        className="o"
        x="265"
        y="166"
        width="6"
        height="14"
        style={f.metal2}
      />
      <path className="flow" d="M268 168 V180" />
      {Array.from({ length: sacks }, (_, i) => (
        <rect
          key={i}
          className="o"
          x={250 + (i % 4) * 9}
          y={204 - Math.floor(i / 4) * 7}
          width="8"
          height="7"
          rx="2"
          style={f.grain}
        />
      ))}
      <line className="o" x1="30" y1="212" x2="290" y2="212" />
    </svg>
  );
}
