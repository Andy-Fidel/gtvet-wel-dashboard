import jsPDF from "jspdf"
import gtvetsLogo from "@/assets/gtvets_logo.png"

export interface PlacementAgreementPdfData {
  learnerName: string
  learnerTrackingId?: string
  program?: string
  studyYear?: string
  institution?: string
  companyName: string
  location?: string
  startDate?: string | null
  endDate?: string | null
  supervisorName?: string
  supervisorPhone?: string
  supervisorEmail?: string
  employerAcknowledgement?: {
    signed: boolean
    signerName?: string
    businessName?: string
    signatureName?: string
    signedAt?: string | null
  }
  learnerAgreement?: {
    signed: boolean
    learnerName?: string
    signatureName?: string
    signedAt?: string | null
  }
}

const EMPLOYER_ACKNOWLEDGEMENT_ITEMS = [
  "I understand occupational health and safety legislation and standards relevant to the conduct of my undertaking WEL and will comply with these laws and standards with respect to the learner as if the learner were my employee.",
  "I will identify all hazards relevant to the conduct of my undertaking and will assess and control all related risks. If I have not controlled all related risks, I will inform the TVET Provider of this fact prior to the WEL period commencing.",
  "I will ensure that the required planning, induction/orientation, supervision and safe systems of work are provided for the learner to maintain a safe and healthy WEL programme at all times.",
  "I will consider the competency, maturity and physical capabilities of the learner in relation to all activities he or she will undertake. The learner’s programme of activities will be planned and carried out with these considerations in mind.",
  "I will nominate a supervisor (or supervisors) of the learner who will be responsible for ensuring that my obligations as the learner’s WEL provider are carried out.",
  "I will provide appropriate information, training, instruction and supervision to the learner in respect of occupational health and safety and will provide any equipment and/or clothing which is required to comply with my duty of care toward the learner.",
  "I will ensure that the WEL programme is undertaken in a non-discriminatory and harassment-free environment.",
  "I will permit access to the workplace and contact with the learner by the TVET Provider’s Head or their representative at any reasonable time during the WEL period.",
  "I will ensure that the WEL arrangement is not used as a substitute for the employment of learners.",
  "I will notify the staff-in-charge of the WEL programme as soon as possible if the learner is absent, injured or becomes ill in the course of undertaking the WEL programme.",
  "I will consult with the staff-in-charge of WEL programme if I consider it necessary to terminate the arrangement before the specified time.",
]

const LEARNER_AGREEMENT_ITEMS = [
  "Carry out all reasonable and lawful directions of the business/industry and perform my work to the best of my ability;",
  "Comply with all reasonable workplace rules and requirements governing safety and behaviour;",
  "Attend at the workplace on each day at the agreed time;",
  "Inform both my WEL supervisor and the staff-in-charge of my WEL programme as soon as possible if I am unable to attend work;",
  "Promptly inform the WEL supervisor of any accident, injury or incident that may occur;",
  "Dress appropriately for the workplace.",
]

const formatDate = (value?: string | null) => {
  if (!value) return "Pending"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "Pending"
  return date.toLocaleDateString()
}

const sanitizeFilenamePart = (value: string) => value.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase()

export const downloadPlacementAgreementPdf = async (data: PlacementAgreementPdfData) => {
  const doc = new jsPDF({ unit: "pt", format: "a4" })
  const pageHeight = doc.internal.pageSize.getHeight()
  const pageWidth = doc.internal.pageSize.getWidth()
  const left = 48
  const right = 48
  const width = pageWidth - left - right
  let y = 52

  const ensureSpace = (needed = 24) => {
    if (y + needed <= pageHeight - 52) return
    doc.addPage()
    y = 52
  }

  const writeLine = (text: string, opts?: { size?: number; color?: [number, number, number]; indent?: number; bold?: boolean }) => {
    const size = opts?.size ?? 10
    const indent = opts?.indent ?? 0
    const color = opts?.color ?? [31, 41, 55]
    const lineWidth = width - indent
    doc.setFont("helvetica", opts?.bold ? "bold" : "normal")
    doc.setFontSize(size)
    doc.setTextColor(...color)
    const lines = doc.splitTextToSize(text, lineWidth)
    const lineHeight = size + 4
    ensureSpace(lines.length * lineHeight + 8)
    doc.text(lines, left + indent, y)
    y += lines.length * lineHeight + 6
  }

  const writeLabelValue = (label: string, value?: string) => {
    writeLine(`${label}: ${value?.trim() ? value : "Not provided"}`, { size: 10 })
  }

  try {
    const img = new Image()
    img.src = gtvetsLogo
    await new Promise((resolve, reject) => {
      img.onload = resolve
      img.onerror = reject
    })
    doc.addImage(img, "PNG", left, y - 8, 30, 30)
    doc.setFont("helvetica", "bold")
    doc.setFontSize(16)
    doc.setTextColor(17, 24, 39)
    doc.text("WEL Placement Agreement", left + 40, y + 6)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(10)
    doc.setTextColor(75, 85, 99)
    doc.text(`Generated on ${new Date().toLocaleDateString()}`, left + 40, y + 21)
    y += 34
  } catch (error) {
    console.warn("Could not load logo for PDF", error)
    doc.setFont("helvetica", "bold")
    doc.setFontSize(16)
    doc.setTextColor(17, 24, 39)
    doc.text("WEL Placement Agreement", left, y)
    y += 22
  }

  writeLine("Employer acknowledgement and learner agreement for the current WEL placement.", { size: 10, color: [75, 85, 99] })

  writeLine("Placement Details", { size: 12, bold: true, color: [17, 24, 39] })
  writeLabelValue("Learner", data.learnerName)
  writeLabelValue("Tracking ID", data.learnerTrackingId)
  writeLabelValue("Program", data.program)
  writeLabelValue("Study Year", data.studyYear)
  writeLabelValue("Institution", data.institution)
  writeLabelValue("Business / Industry", data.companyName)
  writeLabelValue("Location", data.location)
  writeLabelValue("WEL Start Date", formatDate(data.startDate))
  writeLabelValue("WEL End Date", formatDate(data.endDate))
  writeLabelValue("Supervisor", data.supervisorName)
  writeLabelValue("Supervisor Contact", data.supervisorPhone || data.supervisorEmail)

  y += 4
  writeLine("EMPLOYER ACKNOWLEDGEMENT [Employer to sign]", { size: 12, bold: true, color: [17, 24, 39] })
  writeLine(`I, ${data.employerAcknowledgement?.signerName || "................................"} of ${data.employerAcknowledgement?.businessName || data.companyName || "................................"} agree that:`, { size: 10 })
  EMPLOYER_ACKNOWLEDGEMENT_ITEMS.forEach((item, index) => {
    writeLine(`${index + 1}. ${item}`, { size: 10, indent: 10 })
  })
  writeLine("I understand and accept the responsibilities set out above. Following the principal's review of these details, I understand that he or she can determine whether or not the learner will undertake the WEL programme proposed here.", { size: 10 })
  writeLabelValue("Employer signature", data.employerAcknowledgement?.signatureName || "Pending")
  writeLabelValue("Employer signed date", formatDate(data.employerAcknowledgement?.signedAt))

  y += 4
  writeLine("LEARNER AGREEMENT", { size: 12, bold: true, color: [17, 24, 39] })
  writeLine(`I ${data.learnerAgreement?.learnerName || data.learnerName || "................................"} agree to take part in this WEL arrangement and to:`, { size: 10 })
  LEARNER_AGREEMENT_ITEMS.forEach((item, index) => {
    writeLine(`${index + 1}. ${item}`, { size: 10, indent: 10 })
  })
  writeLine("I agree that the business/industry is not obliged to pay me any salary during WEL.", { size: 10 })
  writeLine("I acknowledge that prior to entering into this arrangement I have completed the occupational health and safety programme that is part of the accredited training programme that I am undertaking.", { size: 10 })
  writeLabelValue("Learner signature", data.learnerAgreement?.signatureName || "Pending")
  writeLabelValue("Learner signed date", formatDate(data.learnerAgreement?.signedAt))

  y += 6
  writeLine(
    `Agreement status: Employer ${data.employerAcknowledgement?.signed ? "signed" : "pending"} · Learner ${data.learnerAgreement?.signed ? "signed" : "pending"}`,
    { size: 10, bold: true, color: [180, 83, 9] }
  )

  const learnerToken = sanitizeFilenamePart(data.learnerName || "learner")
  const companyToken = sanitizeFilenamePart(data.companyName || "placement")
  doc.save(`wel-placement-agreement-${learnerToken}-${companyToken}.pdf`)
}
