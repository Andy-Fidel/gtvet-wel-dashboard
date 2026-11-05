export function overviewExportTable(rows: object[], filename: string) {
  const records = rows as Array<Record<string, unknown>>
  if (filename === 'regional-performance-league') return {
    headers: ['Region', 'Learners', 'Placed', 'Completed', 'Institutions', 'Placement rate (%)', 'Completion rate (%)', 'Current semester placements', 'Previous semester placements', 'Change (%)', 'Intervention reasons', 'Placement trend'],
    values: records.map(row => [row.region, row.totalLearners, row.placed, row.completed, row.institutionCount, row.placementRate, row.completionRate, row.currentSemesterPlacements, row.previousSemesterPlacements, row.semesterOverSemesterPercent, (row.interventionReasons as string[] || []).join('; '), (row.sparkline as Array<{ period: string; count: number }> || []).map(point => `${point.period}: ${point.count}`).join('; ')]),
  }
  return {
    headers: ['Institution', 'Learners', 'Placed', 'Pending', 'Completed', 'Dropped'],
    values: records.map(row => [row._id, row.totalLearners, row.placed, row.pending, row.completed, row.dropped]),
  }
}
