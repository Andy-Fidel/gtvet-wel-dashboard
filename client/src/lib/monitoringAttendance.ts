export type VisitAttendance = 'Present' | 'Absent' | 'Late' | 'Excused'
export function attendanceFormState(status: string = 'Present', detail?: string) {
  const attendanceStatus: 'Present' | 'Absent' = status === 'Absent' || status === 'Excused' ? 'Absent' : 'Present'
  return { attendanceStatus, attendanceDetail: detail !== undefined ? detail : (status === 'Late' ? 'Late' : status === 'Excused' ? 'Yes' : status === 'Absent' ? 'No' : 'OnTime') }
}
export function storedAttendance(status: 'Present' | 'Absent', detail: string): VisitAttendance {
  return status === 'Present' ? detail === 'Late' ? 'Late' : 'Present' : detail === 'Yes' ? 'Excused' : 'Absent'
}
export const attendanceLabel = (status: string) => ({ Present: 'Present · On-time', Late: 'Present · Late', Absent: 'Absent · Not excused', Excused: 'Absent · Excused' }[status] || status)
