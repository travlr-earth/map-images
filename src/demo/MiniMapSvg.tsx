interface ThemeColors {
  land: string;
  water: string;
  parks: string;
  buildings: string;
  roadMajor: string;
  roadMinor: string;
}

export function MiniMapSvg({ colors, size = 200 }: { colors: ThemeColors; size?: number }) {
  const s = size;
  const r = s / 200; // scale ratio

  return (
    <svg
      viewBox={`0 0 200 200`}
      width={s}
      height={s}
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: "block", borderRadius: 6 }}
    >
      {/* Land */}
      <rect width="200" height="200" fill={colors.land} />

      {/* Water body – lower right */}
      <path
        d="M 200 130 C 180 118, 162 108, 155 125 C 148 140, 158 155, 145 165 C 132 175, 110 170, 105 185 C 102 195, 110 200, 200 200 Z"
        fill={colors.water}
        opacity="0.9"
      />
      {/* Water body – top right corner */}
      <path
        d="M 160 0 C 168 8, 180 6, 190 15 C 200 22, 200 0, 200 0 Z"
        fill={colors.water}
        opacity="0.7"
      />

      {/* Parks */}
      <ellipse cx="38" cy="42" rx="26" ry="20" fill={colors.parks} opacity="0.85" />
      <ellipse cx="62" cy="28" rx="14" ry="10" fill={colors.parks} opacity="0.75" />
      <ellipse cx="90" cy="155" rx="18" ry="12" fill={colors.parks} opacity="0.8" />

      {/* Road grid – minor roads */}
      {[40, 72, 104, 136].map((y) => (
        <line
          key={`h${y}`}
          x1="0" y1={y} x2="148" y2={y}
          stroke={colors.roadMinor}
          strokeWidth="0.8"
          opacity="0.6"
        />
      ))}
      {[30, 62, 94, 126].map((x) => (
        <line
          key={`v${x}`}
          x1={x} y1="0" x2={x} y2="168"
          stroke={colors.roadMinor}
          strokeWidth="0.8"
          opacity="0.6"
        />
      ))}

      {/* Major diagonal road */}
      <line
        x1="0" y1="95" x2="200" y2="78"
        stroke={colors.roadMajor}
        strokeWidth="2.8"
        opacity="0.9"
      />
      {/* Major vertical road */}
      <line
        x1="78" y1="0" x2="78" y2="175"
        stroke={colors.roadMajor}
        strokeWidth="2.2"
        opacity="0.85"
      />

      {/* Building clusters */}
      {[
        [32,50,10,8], [46,50,8,8], [32,62,10,6], [44,62,12,6],
        [65,50,8,10], [65,64,8,8],
        [96,46,9,8], [96,58,9,8], [108,46,9,12],
        [32,104,8,8], [44,104,10,8], [32,116,10,6],
        [96,108,9,8], [108,108,8,10],
        [128,50,9,8], [128,62,9,8], [140,52,8,10],
        [128,108,10,8], [140,108,8,8],
      ].map(([x, y, w, h], i) => (
        <rect
          key={i}
          x={x} y={y} width={w} height={h}
          fill={colors.buildings}
          opacity="0.75"
          rx="0.5"
        />
      ))}
    </svg>
  );
}
