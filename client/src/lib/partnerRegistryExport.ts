import type { HQPartnerRecord } from '@/components/HQPartnerDetailsDialog'

const approvalLabel = (partner: HQPartnerRecord) => partner.approvalStatus === 'PendingHQApproval'
  ? 'Pending HQ Approval' : partner.approvalStatus || 'Approved'
const typeLabel = (partner: HQPartnerRecord) => partner.partnerType === 'MasterCraftPerson'
  ? 'Master Craft Person' : (partner.partnerType || 'RegisteredCompany').replace(/([a-z])([A-Z])/g, '$1 $2')

function csvCell(value: unknown) {
  const text = String(value ?? '')
  // Prevent partner-supplied values from becoming spreadsheet formulas.
  const safe = /^[\s]*[=+@-]/.test(text) ? `'${text}` : text
  return `"${safe.replace(/"/g, '""')}"`
}

export function partnerRegistryCsv(partners: HQPartnerRecord[]) {
  const rows = [
    ['Partner ID', 'Partner Name', 'Partner Type', 'Sector', 'Trade Area', 'Region', 'District', 'Town', 'Location', 'Contact Person', 'Contact Phone', 'Contact Email', 'Approval Status', 'Status', 'Total Slots', 'Used Slots', 'Submitted By', 'Submitting Institution'],
    ...partners.map(partner => [
      partner._id, partner.name, typeLabel(partner), partner.sector, partner.tradeArea,
      partner.region, partner.district, partner.town, partner.location, partner.contactPerson,
      partner.contactPhone, partner.contactEmail, approvalLabel(partner), partner.status,
      partner.totalSlots ?? 0, partner.usedSlots ?? 0, partner.addedBy?.name, partner.addedBy?.institution,
    ]),
  ]
  return '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n')
}

export async function partnerRegistryPdf(partners: HQPartnerRecord[], filters: { query: string; status: string }, generatedAt = new Date()) {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  doc.setFontSize(17)
  doc.text('HQ Industry Partner Registry', 14, 18)
  doc.setFontSize(9)
  const description = `Generated: ${generatedAt.toISOString().replace('T', ' ').slice(0, 19)} UTC | Partners: ${partners.length}\nApproval: ${filters.status === 'PendingHQApproval' ? 'Pending HQ Approval' : filters.status} | Search: ${filters.query || 'All partners'}`
  const lines = doc.splitTextToSize(description, 269)
  doc.text(lines, 14, 25)
  autoTable(doc, {
    startY: 29 + lines.length * 4,
    margin: { top: 14, right: 14, bottom: 16, left: 14 },
    head: [['Partner / Type', 'Sector', 'Region / Location', 'Contact', 'Approval', 'Status', 'Total Slots', 'Used Slots']],
    body: partners.map(partner => [
      `${partner.name}\n${typeLabel(partner)}`, partner.sector,
      [partner.region, partner.district, partner.town, partner.location].filter(Boolean).join('\n'),
      [partner.contactPerson, partner.contactPhone, partner.contactEmail].filter(Boolean).join('\n'),
      approvalLabel(partner), partner.status, partner.totalSlots ?? 0, partner.usedSlots ?? 0,
    ]),
    styles: { fontSize: 8, cellPadding: 2.5, overflow: 'linebreak', valign: 'top' },
    headStyles: { fillColor: [31, 41, 55] },
    columnStyles: { 0: { cellWidth: 47 }, 1: { cellWidth: 29 }, 2: { cellWidth: 49 }, 3: { cellWidth: 55 }, 4: { cellWidth: 30 }, 5: { cellWidth: 21 }, 6: { cellWidth: 19 }, 7: { cellWidth: 19 } },
    rowPageBreak: 'avoid',
  })
  const pages = doc.getNumberOfPages()
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page)
    doc.setFontSize(8)
    doc.text(`Page ${page} of ${pages}`, 283, 202, { align: 'right' })
  }
  return doc.output('blob')
}

export function downloadPartnerRegistry(blob: Blob, format: 'csv' | 'pdf') {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `industry-partners-${new Date().toISOString().slice(0, 10)}.${format}`
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
