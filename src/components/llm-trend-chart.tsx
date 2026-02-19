"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LLM_DISPLAY, LLM_NAMES } from "@/lib/llm-queries";
import type { LLMHistoryPoint } from "@/lib/llm-queries";

interface LLMTrendChartProps {
  history: LLMHistoryPoint[];
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

export function LLMTrendChart({ history }: LLMTrendChartProps) {
  if (history.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Tendance 30 jours</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-8">
            Pas encore de données historiques. Lancez un premier scan.
          </p>
        </CardContent>
      </Card>
    );
  }

  const chartData = history.map((point) => ({
    ...point,
    dateLabel: formatDate(point.date),
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">
          Taux de mention - 30 derniers jours
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={400}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis
              dataKey="dateLabel"
              tick={{ fontSize: 12 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              domain={[0, 100]}
              tickFormatter={(v) => `${v}%`}
              tick={{ fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              width={45}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--popover))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "8px",
                fontSize: 12,
              }}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(value: any, name: any) => [`${value ?? 0}%`, name || ""]}
              labelFormatter={(label) => `Date: ${label}`}
            />
            <Legend />
            {LLM_NAMES.map((llm) => (
              <Line
                key={llm}
                type="monotone"
                dataKey={llm}
                name={LLM_DISPLAY[llm].label}
                stroke={LLM_DISPLAY[llm].color}
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
