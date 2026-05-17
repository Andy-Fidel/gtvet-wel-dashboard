import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"
import gtvetsLogo from "@/assets/gtvets_logo.png"

export interface WELLogbookPdfEntry {
  entryType: "Daily" | "Weekly"
  periodStart: string
  periodEnd: string
  startTime?: string
  endTime?: string
  hoursWorked: number
  tasksCompleted: string
  skillsDemonstrated?: string
  notes?: string
  learnerSignatureName?: string
  facilitatorComment?: string
  facilitatorName?: string
  facilitatorSignatureName?: string
  facilitatorSignedAt?: string
  supervisorSignatureName?: string
  status: "Pending" | "SignedOff" | "Rejected"
  supervisorComment?: string
  submittedSource: "Institution" | "Partner"
  signedOffBy?: {
    name: string
  } | null
  signedOffAt?: string | null
}

export interface WELLogbookPdfData {
  learnerName: string
  learnerTrackingId?: string
  institution?: string
  companyName: string
  location?: string
  program?: string
  studyYear?: string
  startDate?: string | null
  endDate?: string | null
  evaluationSubmitted?: boolean
  evaluationScore?: number | null
  evaluationStrengths?: string
  evaluationImprovements?: string
  entries: WELLogbookPdfEntry[]
}

const sanitizeFilenamePart = (value: string) => value.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase()

const formatDate = (value?: string | null) => {
  if (!value) return "Not available"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "Not available"
  return date.toLocaleDateString()
}

const formatMonthYear = (value?: string | null) => {
  if (!value) return "Not available"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "Not available"
  return date.toLocaleDateString(undefined, { month: "long", year: "numeric" })
}

const formatDateRange = (start?: string | null, end?: string | null) => {
  if (!start || !end) return "Not available"
  const startDate = new Date(start)
  const endDate = new Date(end)
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return "Not available"
  return `${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`
}

const loadLogoImage = async () => {
  const img = new Image()
  img.src = gtvetsLogo
  await new Promise((resolve, reject) => {
    img.onload = resolve
    img.onerror = reject
  })
  return img
}

const drawField = (doc: jsPDF, x: number, y: number, width: number, label: string, value: string) => {
  doc.setDrawColor(203, 213, 225)
  doc.setFillColor(248, 250, 252)
  doc.roundedRect(x, y, width, 34, 4, 4, "FD")
  doc.setFont("helvetica", "bold")
  doc.setFontSize(7.5)
  doc.setTextColor(100, 116, 139)
  doc.text(label.toUpperCase(), x + 8, y + 10)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(9.5)
  doc.setTextColor(15, 23, 42)
  const lines = doc.splitTextToSize(value || "Not available", width - 16)
  doc.text(lines.slice(0, 2), x + 8, y + 22)
}

export const downloadWELLogbookPdf = async (data: WELLogbookPdfData) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const doc = new (jsPDF as any)("l", "mm", "a4")

  try {
    const img = await loadLogoImage()
    doc.addImage(img, "PNG", 12, 10, 20, 20)
  } catch (error) {
    console.warn("Could not load logo for PDF", error)
  }

  doc.setFont("helvetica", "bold")
  doc.setFontSize(16)
  doc.setTextColor(30, 41, 59)
  doc.text("WORKPLACE EXPERIENCE LEARNING LOGBOOK", 38, 18)
  doc.setFontSize(10)
  doc.setTextColor(100, 116, 139)
  doc.text("Learners' weekly training logsheet", 38, 24)
  doc.text(`Generated on ${new Date().toLocaleDateString()}`, 38, 29)

  const latestEntry = [...data.entries].sort((a, b) => new Date(a.periodEnd).getTime() - new Date(b.periodEnd).getTime()).pop()

  const summaryX = 12
  const summaryY = 36
  const summaryGap = 4
  const summaryColumnWidth = (273 - summaryGap * 2) / 3
  const secondRowY = summaryY + 38

  drawField(doc, summaryX, summaryY, summaryColumnWidth, "Learner's Name", data.learnerName)
  drawField(doc, summaryX + summaryColumnWidth + summaryGap, summaryY, summaryColumnWidth, "TVET Provider", data.institution || "Not available")
  drawField(doc, summaryX + (summaryColumnWidth + summaryGap) * 2, summaryY, summaryColumnWidth, "Company & Region", [data.companyName, data.location].filter(Boolean).join(" · "))
  drawField(doc, summaryX, secondRowY, summaryColumnWidth, "Qualification Level", [data.program, data.studyYear ? `Year ${data.studyYear}` : ""].filter(Boolean).join(" · "))
  drawField(doc, summaryX + summaryColumnWidth + summaryGap, secondRowY, summaryColumnWidth, "WEL Period", formatDateRange(data.startDate, data.endDate))
  drawField(doc, summaryX + (summaryColumnWidth + summaryGap) * 2, secondRowY, summaryColumnWidth, "Month & Year", formatMonthYear(latestEntry?.periodEnd || latestEntry?.periodStart || data.startDate))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(autoTable as any)(doc, {
    startY: 96,
    head: [[
      "Week",
      "Dates",
      "Time",
      "Type",
      "Total Time",
      "Describe key tasks / activities performed",
      "Skills demonstrated",
      "Remarks",
    ]],
    body: data.entries.length
      ? [...data.entries]
          .sort((a, b) => new Date(a.periodStart).getTime() - new Date(b.periodStart).getTime())
          .map((entry, index) => ([
            `Week ${index + 1}`,
            formatDateRange(entry.periodStart, entry.periodEnd),
            `${entry.startTime || "--:--"} - ${entry.endTime || "--:--"}`,
            entry.entryType,
            `${entry.hoursWorked} hrs`,
            entry.tasksCompleted || "Not recorded",
            entry.skillsDemonstrated || entry.notes || "No skills captured",
            [
              `Status: ${entry.status}`,
              `Source: ${entry.submittedSource}`,
              entry.notes ? `Notes: ${entry.notes}` : "",
              entry.supervisorComment ? `Supervisor: ${entry.supervisorComment}` : "",
              entry.signedOffBy?.name ? `Reviewed by ${entry.signedOffBy.name} on ${formatDate(entry.signedOffAt)}` : "",
            ].filter(Boolean).join("\n"),
          ]))
      : [[
          "Week 1",
          "Not available",
          "--:-- - --:--",
          "Weekly",
          "0 hrs",
          "No attendance entries have been recorded for this placement yet.",
          "No skills captured",
          "No review trail available",
        ]],
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 8,
      cellPadding: 2.2,
      overflow: "linebreak",
      textColor: [31, 41, 55],
      lineColor: [203, 213, 225],
      lineWidth: 0.2,
      valign: "top",
    },
    headStyles: {
      fillColor: [255, 184, 0],
      textColor: [17, 24, 39],
      fontStyle: "bold",
      halign: "left",
    },
    columnStyles: {
      0: { cellWidth: 18 },
      1: { cellWidth: 35 },
      2: { cellWidth: 24 },
      3: { cellWidth: 15 },
      4: { cellWidth: 18 },
      5: { cellWidth: 64 },
      6: { cellWidth: 44 },
      7: { cellWidth: 60 },
    },
    margin: { left: 12, right: 12 },
  })

  const finalY = (doc as jsPDF & { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? 140
  const signedOffCount = data.entries.filter((entry) => entry.status === "SignedOff").length
  const pendingCount = data.entries.filter((entry) => entry.status === "Pending").length
  const rejectedCount = data.entries.filter((entry) => entry.status === "Rejected").length
  const latestSignatureEntry = [...data.entries].sort((a, b) => new Date(b.periodEnd).getTime() - new Date(a.periodEnd).getTime())[0]

  doc.setFillColor(248, 250, 252)
  doc.setDrawColor(203, 213, 225)
  doc.roundedRect(12, finalY + 6, 273, 44, 4, 4, "FD")
  doc.setFont("helvetica", "bold")
  doc.setFontSize(10)
  doc.setTextColor(30, 41, 59)
  doc.text("POST-WEL ASSESSMENT COMPANION", 15, finalY + 14)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(8.5)
  doc.setTextColor(71, 85, 105)
  const assessmentIntro = doc.splitTextToSize(
    "This section maps the original template to evidence already stored in the portal. It does not invent checklist answers that the system does not capture directly.",
    267
  )
  doc.text(assessmentIntro, 15, finalY + 20)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(autoTable as any)(doc, {
    startY: finalY + 34,
    head: [["Assessment Area", "System Evidence"]],
    body: [
      [
        "Attendance compliance",
        data.entries.length === 0
          ? "No weekly evidence submitted yet."
          : pendingCount === 0
            ? "All current attendance entries have been reviewed or signed off."
            : `${pendingCount} attendance entr${pendingCount === 1 ? "y is" : "ies are"} still awaiting review.`,
      ],
      [
        "Supervisor review trail",
        signedOffCount > 0
          ? `${signedOffCount} log entr${signedOffCount === 1 ? "y has" : "ies have"} a recorded sign-off trail.`
          : "No signed-off attendance entry has been recorded yet.",
      ],
      [
        "Rejected entries",
        rejectedCount > 0
          ? `${rejectedCount} entr${rejectedCount === 1 ? "y has" : "ies have"} been rejected and may need correction.`
          : "No rejected entries recorded.",
      ],
      [
        "Employer evaluation",
        data.evaluationSubmitted
          ? `Submitted${data.evaluationScore ? ` with overall score ${data.evaluationScore} / 5` : ""}`
          : "Not submitted yet",
      ],
      ["Latest strengths", data.evaluationStrengths || "No evaluation strengths recorded yet."],
      ["Improvement areas", data.evaluationImprovements || "No improvement areas recorded yet."],
    ],
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 8,
      cellPadding: 2.2,
      overflow: "linebreak",
      textColor: [31, 41, 55],
      lineColor: [203, 213, 225],
      lineWidth: 0.2,
      valign: "top",
    },
    headStyles: {
      fillColor: [226, 232, 240],
      textColor: [17, 24, 39],
      fontStyle: "bold",
    },
    columnStyles: {
      0: { cellWidth: 48, fontStyle: "bold" },
      1: { cellWidth: 225 },
    },
    margin: { left: 12, right: 12, bottom: 12 },
  })

  const signatureY = ((doc as jsPDF & { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? (finalY + 90)) + 8
  doc.setFont("helvetica", "bold")
  doc.setFontSize(10)
  doc.setTextColor(30, 41, 59)
  doc.text("SIGNATURE BLOCKS", 12, signatureY)

  const drawSignatureBlock = (x: number, title: string, name: string, signature: string, date: string, comments?: string) => {
    doc.setFillColor(248, 250, 252)
    doc.setDrawColor(203, 213, 225)
    doc.roundedRect(x, signatureY + 4, 88, comments ? 32 : 24, 3, 3, "FD")
    doc.setFont("helvetica", "bold")
    doc.setFontSize(8)
    doc.setTextColor(100, 116, 139)
    doc.text(title.toUpperCase(), x + 3, signatureY + 9)
    doc.setFont("helvetica", "normal")
    doc.setTextColor(31, 41, 55)
    doc.text(`Name: ${name || "Not captured"}`, x + 3, signatureY + 14)
    doc.text(`Signature: ${signature || "Not captured"}`, x + 3, signatureY + 19)
    doc.text(`Date: ${date || "Not captured"}`, x + 3, signatureY + 24)
    if (comments) {
      const lines = doc.splitTextToSize(`Comments: ${comments}`, 82)
      doc.text(lines.slice(0, 2), x + 3, signatureY + 29)
    }
  }

  drawSignatureBlock(
    12,
    "Learner",
    data.learnerName,
    latestSignatureEntry?.learnerSignatureName || data.learnerName,
    formatDate(latestSignatureEntry?.periodEnd || data.endDate),
  )
  drawSignatureBlock(
    104,
    "WEL Facilitator",
    latestSignatureEntry?.facilitatorName || "",
    latestSignatureEntry?.facilitatorSignatureName || "",
    formatDate(latestSignatureEntry?.facilitatorSignedAt),
    latestSignatureEntry?.facilitatorComment,
  )
  drawSignatureBlock(
    196,
    "WEL Supervisor",
    latestSignatureEntry?.signedOffBy?.name || "",
    latestSignatureEntry?.supervisorSignatureName || "",
    formatDate(latestSignatureEntry?.signedOffAt),
    latestSignatureEntry?.supervisorComment,
  )

  const learnerToken = sanitizeFilenamePart(data.learnerName || "learner")
  const companyToken = sanitizeFilenamePart(data.companyName || "placement")
  doc.save(`wel-logbook-${learnerToken}-${companyToken}.pdf`)
}
