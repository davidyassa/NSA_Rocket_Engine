import type { ReactNode } from 'react';

export type PlotPoint = { sol: number; value: number | null };
type PlotLine = {
  id: string;
  points: readonly PlotPoint[];
  domain: readonly [number, number];
  color: string;
  dashed?: boolean;
  markers?: readonly (PlotPoint & { hollow?: boolean })[];
};

const plotWidth = 1000;
const plotHeight = 100;

export function TimelinePlot({ start, end, selectedSol, lines, leftTicks, rightTicks }: {
  start: number;
  end: number;
  selectedSol: number;
  lines: readonly PlotLine[];
  leftTicks: ReactNode;
  rightTicks?: ReactNode;
}) {
  const position = (sol: number) => (sol - start) / (end - start);
  const height = (value: number, [minimum, maximum]: PlotLine['domain']) =>
    (maximum - value) / (maximum - minimum);
  const dayLines = Array.from({ length: end - start - 1 }, (_, index) => start + index + 1);

  return (
    <div className="timeline-plot-layout" aria-hidden="true">
      <div className="timeline-ticks timeline-ticks-left">{leftTicks}</div>
      <div className="timeline-plot">
        <svg viewBox={`0 0 ${plotWidth} ${plotHeight}`} preserveAspectRatio="none" focusable="false">
          <rect
            x={position(selectedSol) * plotWidth}
            y="0"
            width={plotWidth / (end - start)}
            height={plotHeight}
            className="timeline-focus-band"
          />
          {dayLines.map((sol) => (
            <line
              key={sol}
              x1={position(sol) * plotWidth}
              x2={position(sol) * plotWidth}
              y1="0"
              y2={plotHeight}
              className="timeline-grid-line"
            />
          ))}
          <line x1="0" x2={plotWidth} y1={plotHeight / 2} y2={plotHeight / 2} className="timeline-grid-line" />
          {lines.map(({ id, points, domain, color, dashed }) => {
            let penDown = false;
            const segments = points.flatMap(({ sol, value }) => {
              if (value === null) {
                penDown = false;
                return [];
              }
              const command = penDown ? 'L' : 'M';
              penDown = true;
              return [`${command} ${position(sol) * plotWidth} ${height(value, domain) * plotHeight}`];
            });
            return (
              <path
                key={id}
                d={segments.join(' ')}
                fill="none"
                stroke={color}
                strokeWidth={2}
                strokeDasharray={dashed ? '5 4' : undefined}
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
        </svg>
        {lines.flatMap(({ id, domain, color, markers }) => markers?.map(({ sol, value, hollow }) =>
          value === null ? null : (
            <span
              key={`${id}-${sol}`}
              className="timeline-plot-dot"
              style={{
                left: `${position(sol) * 100}%`,
                top: `${height(value, domain) * 100}%`,
                borderColor: color,
                background: hollow ? 'var(--panel)' : color,
              }}
            />
          ),
        ) ?? [])}
      </div>
      <div className="timeline-ticks timeline-ticks-right">{rightTicks}</div>
    </div>
  );
}
