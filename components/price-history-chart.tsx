'use client';

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export type ChartSeries = { name: string; color: string };

export type ChartDatum = {
  date: string;
  label: string;
  // Cada retailer aporta una propiedad dinámica con su precio.
  [retailerName: string]: number | string;
};

type Props = {
  data: ChartDatum[];
  series: ChartSeries[];
};

export function PriceHistoryChart({ data, series }: Props) {
  return (
    <div className="h-72 w-full sm:h-80">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgb(0 0 0 / 0.08)" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11 }}
            tickMargin={6}
            minTickGap={28}
            interval="preserveStartEnd"
            stroke="currentColor"
            opacity={0.6}
          />
          <YAxis
            tick={{ fontSize: 11 }}
            tickFormatter={(v: number) => `${v}€`}
            domain={['auto', 'auto']}
            width={48}
            stroke="currentColor"
            opacity={0.6}
          />
          <Tooltip
            formatter={(value) =>
              typeof value === 'number' ? `${value.toFixed(2)} €` : String(value)
            }
            contentStyle={{
              fontSize: 12,
              borderRadius: 6,
              border: '1px solid rgb(0 0 0 / 0.1)',
            }}
            labelStyle={{ fontWeight: 500 }}
          />
          <Legend
            wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
            iconType="circle"
            iconSize={8}
          />
          {series.map((s) => (
            <Line
              key={s.name}
              type="monotone"
              dataKey={s.name}
              stroke={s.color}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
              connectNulls
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
