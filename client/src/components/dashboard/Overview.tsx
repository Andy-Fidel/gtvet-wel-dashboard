
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip, Cell } from "recharts"

const data = [
  {
    name: "2024 S1",
    total: 180,
  },
  {
    name: "2024 S2",
    total: 235,
  },
  {
    name: "2025 S1",
    total: 260,
  },
  {
    name: "2025 S2",
    total: 320,
  },
]

export function Overview() {
  return (
    <ResponsiveContainer width="100%" height={350}>
      <BarChart data={data}>
        <XAxis
          dataKey="name"
          stroke="#888888"
          fontSize={12}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          stroke="#888888"
          fontSize={12}
          tickLine={false}
          axisLine={false}
          tickFormatter={(value) => `${value}`}
        />
        <Tooltip 
           cursor={{fill: 'transparent'}}
           contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
        />
        <Bar dataKey="total" fill="#4f46e5" radius={[4, 4, 0, 0]} >
            {data.map((_, index) => (
                <Cell key={`cell-${index}`} fill={index % 2 === 0 ? '#4f46e5' : '#8b5cf6'} />
            ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
