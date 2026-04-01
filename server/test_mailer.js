import { sendPlacementApprovalEmail, sendReportStatusEmail } from './utils/mailer.js';

async function test() {
    console.log("Testing Placement Email...");
    await sendPlacementApprovalEmail("test@gtvet.edu.gh", "John Doe", "Tech Innovators Inc", "TRK-1234");
    
    console.log("Testing Report Email...");
    await sendReportStatusEmail("test@gtvet.edu.gh", "First Semester", "2026/2027", "HQ_Approved");
}

test();
