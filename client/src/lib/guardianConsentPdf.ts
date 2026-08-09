import jsPDF from "jspdf"
import gtvetsLogo from "@/assets/gtvets_logo.png"

export interface GuardianConsentPdfData {
  learnerName: string
  trackingId?: string
  dateOfBirth?: string
  institution?: string
  program?: string
  studyYear?: string
  industryName?: string
  startDate?: string | null
  endDate?: string | null
  guardianName?: string
  guardianPhone?: string
  relationship?: string
}

const formatDate = (value?: string | null) => {
  if (!value) return "Not provided"
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "Not provided" : date.toLocaleDateString()
}

const filenamePart = (value: string) => value
  .replace(/[^a-z0-9]+/gi, "-")
  .replace(/^-+|-+$/g, "")
  .toLowerCase()

export const downloadGuardianConsentPdf = async (data: GuardianConsentPdfData) => {
  const doc = new jsPDF({ unit: "pt", format: "a4" })
  const left = 48
  const pageWidth = doc.internal.pageSize.getWidth()
  const contentWidth = pageWidth - left * 2
  let y = 50

  const line = (text: string, options?: { bold?: boolean; size?: number; gap?: number }) => {
    const size = options?.size ?? 10
    doc.setFont("helvetica", options?.bold ? "bold" : "normal")
    doc.setFontSize(size)
    doc.setTextColor(31, 41, 55)
    const lines = doc.splitTextToSize(text, contentWidth)
    doc.text(lines, left, y)
    y += lines.length * (size + 4) + (options?.gap ?? 5)
  }

  try {
    const image = new Image()
    image.src = gtvetsLogo
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error("Logo could not be loaded"))
    })
    doc.addImage(image, "PNG", left, y - 8, 34, 34)
    doc.setFont("helvetica", "bold")
    doc.setFontSize(16)
    doc.text("Parent / Guardian WEL Consent Form", left + 44, y + 7)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(9)
    doc.setTextColor(75, 85, 99)
    doc.text("For learners under 18 years of age", left + 44, y + 23)
    y += 46
  } catch {
    line("Parent / Guardian WEL Consent Form", { bold: true, size: 16, gap: 12 })
  }

  line("LEARNER AND PLACEMENT DETAILS", { bold: true, size: 11 })
  line(`Learner: ${data.learnerName}`)
  line(`Tracking ID: ${data.trackingId || "Not provided"}`)
  line(`Date of birth: ${formatDate(data.dateOfBirth)}`)
  line(`Institution: ${data.institution || "Not provided"}`)
  line(`Course / Program: ${data.program || "Not provided"}`)
  line(`Study year: ${data.studyYear || "Not provided"}`)
  line(`Business / Industry: ${data.industryName || "Not provided"}`)
  line(`Placement period: ${formatDate(data.startDate)} to ${formatDate(data.endDate)}`, { gap: 14 })

  line("LEARNER DECLARATION", { bold: true, size: 11 })
  ;[
    "I understand the purpose and expectations of the Workplace Experience Learning (WEL) Program.",
    "I will follow workplace rules, safety instructions, and reasonable directions.",
    "I will act respectfully and responsibly throughout the placement.",
    "I will report any problem, injury, harassment, or unsafe condition promptly.",
  ].forEach((item) => line(`[   ] ${item}`, { gap: 7 }))

  y += 4
  line("PARENT / GUARDIAN CONSENT", { bold: true, size: 11 })
  line("I hereby give my consent for my child to participate in the Workplace Experience Learning (WEL) Program as required by their institution. I understand that my child will be in a real working environment and must follow all safety and conduct rules.", { gap: 14 })

  line(`Parent / Guardian full name: ${data.guardianName || "________________________________________"}`, { gap: 10 })
  line(`Relationship to learner: ${data.relationship || "________________________________________"}`, { gap: 10 })
  line(`Contact number: ${data.guardianPhone || "________________________________________"}`, { gap: 10 })
  line("Signature: ________________________________________", { gap: 10 })
  line("Date signed: ______________________________________")

  doc.setDrawColor(203, 213, 225)
  doc.line(left, 785, pageWidth - left, 785)
  doc.setFontSize(8)
  doc.setTextColor(100, 116, 139)
  doc.text("After signing, upload a clear PDF or photo of every completed page through the guardian dashboard.", left, 802)

  doc.save(`wel-guardian-consent-${filenamePart(data.learnerName || "learner")}.pdf`)
}
