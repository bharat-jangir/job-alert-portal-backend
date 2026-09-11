// backend/scripts/seedJobs.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app/app.module';
import { JobsService } from '../src/app/jobs/jobs.service';
import { JobType, ExperienceLevel, QualificationLevel } from '../src/app/jobs/schemas/job.schema';

const BASE_DATE = new Date();
const future = (days: number) => new Date(BASE_DATE.getTime() + days * 24 * 3600 * 1000).toISOString();

const seedJobs = [
  // ───── JOB ─────
  {
    title: 'SSC CGL 2025 Online Form',
    slug: 'ssc-cgl-2025-online-form',
    type: JobType.JOB,
    organization: 'Staff Selection Commission (SSC)',
    location: 'All India',
    salary: '₹25,500 – ₹81,100',
    qualification: QualificationLevel.BACHELORS,
    experience: ExperienceLevel.ENTRY,
    lastDate: future(30),
    applyLink: 'https://ssc.nic.in',
    description: 'SSC CGL 2025 recruitment for Combined Graduate Level posts across central government departments.',
    eligibility: 'Any graduate from a recognized university. Age 18-32 years.',
    totalVacancy: '17,727',
    ageLimit: '18-32 Years',
    isActive: true,
    tags: ['SSC', 'CGL', 'Government', 'All India'],
    metaTitle: 'SSC CGL 2025 Online Form – Apply Now',
    metaDescription: 'SSC CGL 2025 notification released. Apply online for 17,727 posts. Last date, eligibility, syllabus, exam date.',
    sourceUrl: 'https://ssc.nic.in',
    importantDates: [
      { label: 'Application Start', date: future(-5) },
      { label: 'Last Date to Apply', date: future(30) },
      { label: 'Exam Date', date: future(90) },
    ],
    htmlContent: `
<h2>SSC CGL 2025 – Important Details</h2>
<table>
  <thead><tr><th>Detail</th><th>Info</th></tr></thead>
  <tbody>
    <tr><td>Organization</td><td>Staff Selection Commission</td></tr>
    <tr><td>Post Name</td><td>CGL Various Posts</td></tr>
    <tr><td>Total Vacancy</td><td>17,727</td></tr>
    <tr><td>Salary</td><td>₹25,500 – ₹81,100</td></tr>
    <tr><td>Apply Mode</td><td>Online</td></tr>
    <tr><td>Last Date</td><td>${future(30).split('T')[0]}</td></tr>
  </tbody>
</table>
<h3>Eligibility Criteria</h3>
<ul>
  <li>Educational Qualification: Any Bachelor's Degree from a recognized university.</li>
  <li>Age Limit: 18 to 32 years (relaxation as per govt. norms).</li>
  <li>Nationality: Indian citizen.</li>
</ul>
<h3>How to Apply</h3>
<ol>
  <li>Visit the official SSC website: ssc.nic.in</li>
  <li>Click on "Apply" link for SSC CGL 2025.</li>
  <li>Fill the registration form and upload documents.</li>
  <li>Pay the application fee and submit.</li>
</ol>
<h3>Selection Process</h3>
<ul>
  <li>Tier I – Computer Based Examination</li>
  <li>Tier II – Computer Based Examination</li>
  <li>Document Verification</li>
</ul>`,
  },

  // ───── RESULT ─────
  {
    title: 'UPSC Civil Services Prelims Result 2025',
    slug: 'upsc-civil-services-prelims-result-2025',
    type: JobType.RESULT,
    organization: 'Union Public Service Commission (UPSC)',
    location: 'All India',
    salary: 'N/A',
    qualification: QualificationLevel.BACHELORS,
    experience: ExperienceLevel.ENTRY,
    lastDate: future(5),
    applyLink: 'https://upsc.gov.in',
    description: 'UPSC CSE Prelims 2025 result declared. Check your roll number in the PDF.',
    eligibility: 'N/A',
    totalVacancy: '979',
    isActive: true,
    tags: ['UPSC', 'IAS', 'Result', 'Civil Services'],
    metaTitle: 'UPSC Prelims Result 2025 – Check Now',
    metaDescription: 'UPSC Civil Services Preliminary Exam 2025 result released. Download PDF and check cut-off marks.',
    sourceUrl: 'https://upsc.gov.in',
    importantDates: [
      { label: 'Result Declared', date: future(-1) },
      { label: 'Mains Application Last Date', date: future(15) },
    ],
    htmlContent: `
<h2>UPSC Civil Services Prelims Result 2025</h2>
<p>The Union Public Service Commission has declared the result of the Civil Services (Preliminary) Examination 2025. Candidates who appeared in the exam can check their result below.</p>
<table>
  <thead><tr><th>Exam</th><th>UPSC CSE Prelims 2025</th></tr></thead>
  <tbody>
    <tr><td>Result Status</td><td>Declared</td></tr>
    <tr><td>Total Qualified</td><td>~14,000+</td></tr>
    <tr><td>Cut-off (General)</td><td>~98.66 marks</td></tr>
    <tr><td>Next Stage</td><td>Mains Examination</td></tr>
  </tbody>
</table>
<h3>How to Check Result</h3>
<ol>
  <li>Go to upsc.gov.in</li>
  <li>Click on "What's New" → CSE Prelims 2025 Result</li>
  <li>Download the PDF and search your roll number.</li>
</ol>`,
  },

  // ───── ANSWER KEY ─────
  {
    title: 'SSC CHSL Answer Key 2025',
    slug: 'ssc-chsl-answer-key-2025',
    type: JobType.ANSWERKEY,
    organization: 'Staff Selection Commission (SSC)',
    location: 'All India',
    salary: 'N/A',
    qualification: QualificationLevel.HIGH_SCHOOL,
    experience: ExperienceLevel.ENTRY,
    lastDate: future(10),
    applyLink: 'https://ssc.nic.in',
    description: 'SSC CHSL Tier I 2025 Official Answer Key released. Download and raise objections if any.',
    eligibility: 'N/A',
    totalVacancy: '3712',
    isActive: true,
    tags: ['SSC', 'CHSL', 'Answer Key', '2025'],
    metaTitle: 'SSC CHSL Answer Key 2025 – Download PDF',
    metaDescription: 'SSC CHSL Tier I 2025 official answer key available. Challenge window open till ' + future(10).split('T')[0],
    sourceUrl: 'https://ssc.nic.in',
    importantDates: [
      { label: 'Answer Key Released', date: future(-2) },
      { label: 'Objection Last Date', date: future(10) },
    ],
    htmlContent: `
<h2>SSC CHSL Answer Key 2025 – Details</h2>
<p>Staff Selection Commission has released the official Answer Key for CHSL Tier I 2025. Candidates can download the answer key and raise objections within the window.</p>
<table>
  <thead><tr><th>Detail</th><th>Info</th></tr></thead>
  <tbody>
    <tr><td>Exam</td><td>SSC CHSL Tier I 2025</td></tr>
    <tr><td>Answer Key Status</td><td>Released</td></tr>
    <tr><td>Objection Fee</td><td>₹100 per question</td></tr>
    <tr><td>Mode</td><td>Online</td></tr>
  </tbody>
</table>
<h3>How to Download</h3>
<ol>
  <li>Visit ssc.nic.in</li>
  <li>Click "Answer Key" under CHSL 2025</li>
  <li>Login with Registration Number and DOB</li>
  <li>Download and verify answers</li>
</ol>`,
  },

  // ───── ADMIT CARD ─────
  {
    title: 'RRB NTPC Admit Card 2025',
    slug: 'rrb-ntpc-admit-card-2025',
    type: JobType.ADMITCARD,
    organization: 'Railway Recruitment Board (RRB)',
    location: 'All India',
    salary: 'N/A',
    qualification: QualificationLevel.HIGH_SCHOOL,
    experience: ExperienceLevel.ENTRY,
    lastDate: future(20),
    applyLink: 'https://indianrailways.gov.in',
    description: 'RRB NTPC CBT-1 2025 Admit Card released. Download your hall ticket from the official website.',
    eligibility: 'N/A',
    totalVacancy: '11,558',
    isActive: true,
    tags: ['RRB', 'NTPC', 'Admit Card', 'Railway'],
    metaTitle: 'RRB NTPC Admit Card 2025 – Download Hall Ticket',
    metaDescription: 'RRB NTPC CBT1 2025 Admit Card is out. Download your hall ticket from your regional RRB website.',
    sourceUrl: 'https://indianrailways.gov.in',
    importantDates: [
      { label: 'Admit Card Released', date: future(-3) },
      { label: 'Exam Date', date: future(20) },
    ],
    htmlContent: `
<h2>RRB NTPC Admit Card 2025</h2>
<p>Railway Recruitment Board has released the Admit Card for NTPC CBT-1 2025 exam. Candidates must download their admit card before the exam date.</p>
<table>
  <thead><tr><th>Detail</th><th>Info</th></tr></thead>
  <tbody>
    <tr><td>Exam Name</td><td>RRB NTPC CBT-1 2025</td></tr>
    <tr><td>Admit Card Status</td><td>Released</td></tr>
    <tr><td>Exam Mode</td><td>Computer Based Test (CBT)</td></tr>
    <tr><td>Exam Date</td><td>${future(20).split('T')[0]}</td></tr>
  </tbody>
</table>
<h3>How to Download Admit Card</h3>
<ol>
  <li>Visit your Regional RRB Website</li>
  <li>Click on "Download Admit Card" link</li>
  <li>Enter Registration Number and Date of Birth</li>
  <li>Download and print the admit card</li>
</ol>
<h3>Documents to Carry</h3>
<ul>
  <li>Printed Admit Card</li>
  <li>Any Government Photo ID (Aadhaar/PAN/Passport)</li>
  <li>Recent passport size photograph</li>
</ul>`,
  },

  // ───── ONLINE FORM ─────
  {
    title: 'Bihar Police Constable Online Form 2025',
    slug: 'bihar-police-constable-online-form-2025',
    type: JobType.ONLINEFORM,
    organization: 'Bihar Police Subordinate Services Commission (BPSSC)',
    location: 'Bihar',
    salary: '₹21,700 – ₹69,100',
    qualification: QualificationLevel.HIGH_SCHOOL,
    experience: ExperienceLevel.ENTRY,
    lastDate: future(25),
    applyLink: 'https://bpssc.bih.nic.in',
    description: 'Bihar Police Constable 2025 online form. Apply for 21,391 constable posts.',
    eligibility: 'Candidates with 12th pass or equivalent. Age 18-25 years.',
    totalVacancy: '21,391',
    ageLimit: '18-25 Years',
    isActive: true,
    tags: ['Bihar Police', 'Constable', 'Online Form', '12th Pass'],
    metaTitle: 'Bihar Police Constable Online Form 2025 – Apply',
    metaDescription: 'Bihar Police Constable recruitment 2025 – 21,391 vacancies. Apply online before ' + future(25).split('T')[0],
    sourceUrl: 'https://bpssc.bih.nic.in',
    importantDates: [
      { label: 'Form Start Date', date: future(-10) },
      { label: 'Last Date to Apply', date: future(25) },
      { label: 'Exam Date', date: future(80) },
    ],
    htmlContent: `
<h2>Bihar Police Constable 2025 – Vacancy Details</h2>
<table>
  <thead><tr><th>Category</th><th>Vacancies</th></tr></thead>
  <tbody>
    <tr><td>General</td><td>8,500</td></tr>
    <tr><td>OBC</td><td>5,721</td></tr>
    <tr><td>SC</td><td>4,278</td></tr>
    <tr><td>ST</td><td>892</td></tr>
    <tr><td>EWS</td><td>2,000</td></tr>
    <tr><td><strong>Total</strong></td><td><strong>21,391</strong></td></tr>
  </tbody>
</table>
<h3>Application Fee</h3>
<ul>
  <li>General / OBC: ₹675</li>
  <li>SC / ST: ₹180</li>
  <li>Payment Mode: Online (Net Banking / UPI / Debit Card)</li>
</ul>
<h3>Selection Process</h3>
<ol>
  <li>Written Examination</li>
  <li>Physical Efficiency Test (PET)</li>
  <li>Medical Examination</li>
  <li>Document Verification</li>
</ol>`,
  },

  // ───── ADMISSION ─────
  {
    title: 'JEE Main 2025 Session 2 Admission Notification',
    slug: 'jee-main-2025-session-2-admission',
    type: JobType.ADMISSION,
    organization: 'National Testing Agency (NTA)',
    location: 'All India',
    salary: 'N/A',
    qualification: QualificationLevel.HIGH_SCHOOL,
    experience: ExperienceLevel.ENTRY,
    lastDate: future(15),
    applyLink: 'https://jeemain.nta.ac.in',
    description: 'JEE Main 2025 Session 2 registration open. Apply for B.Tech admissions across NITs, IIITs and GFTIs.',
    eligibility: 'Candidates who have passed/appearing in Class XII with PCM subjects.',
    totalVacancy: 'N/A',
    isActive: true,
    tags: ['JEE', 'NTA', 'Admission', 'Engineering', 'B.Tech'],
    metaTitle: 'JEE Main 2025 Session 2 – Apply Online',
    metaDescription: 'JEE Main 2025 Session 2 registration open at jeemain.nta.ac.in. Check eligibility, schedule and apply online.',
    sourceUrl: 'https://jeemain.nta.ac.in',
    importantDates: [
      { label: 'Registration Start', date: future(-7) },
      { label: 'Last Date to Register', date: future(15) },
      { label: 'Admit Card', date: future(30) },
      { label: 'Exam Date', date: future(45) },
    ],
    htmlContent: `
<h2>JEE Main 2025 Session 2 – Key Information</h2>
<table>
  <thead><tr><th>Detail</th><th>Info</th></tr></thead>
  <tbody>
    <tr><td>Conducting Body</td><td>National Testing Agency (NTA)</td></tr>
    <tr><td>Exam Name</td><td>JEE Main 2025 Session 2</td></tr>
    <tr><td>Application Mode</td><td>Online</td></tr>
    <tr><td>Exam Mode</td><td>Computer Based Test (CBT)</td></tr>
    <tr><td>Subjects</td><td>Physics, Chemistry, Mathematics</td></tr>
  </tbody>
</table>
<h3>Eligibility Criteria</h3>
<ul>
  <li>Passed Class XII (or appearing) with Physics, Chemistry and Mathematics.</li>
  <li>Minimum 75% marks (65% for SC/ST) in qualifying exam.</li>
  <li>No age limit as per NTA norms.</li>
</ul>`,
  },

  // ───── SYLLABUS ─────
  {
    title: 'IBPS PO 2025 Syllabus & Exam Pattern',
    slug: 'ibps-po-2025-syllabus-exam-pattern',
    type: JobType.SYLLABUS,
    organization: 'Institute of Banking Personnel Selection (IBPS)',
    location: 'All India',
    salary: 'N/A',
    qualification: QualificationLevel.BACHELORS,
    experience: ExperienceLevel.ENTRY,
    lastDate: future(60),
    applyLink: 'https://ibps.in',
    description: 'IBPS PO 2025 complete syllabus with detailed exam pattern for Prelims and Mains.',
    eligibility: 'N/A',
    totalVacancy: '4,455',
    isActive: true,
    tags: ['IBPS', 'PO', 'Banking', 'Syllabus', '2025'],
    metaTitle: 'IBPS PO 2025 Syllabus – Prelims & Mains PDF',
    metaDescription: 'Download IBPS PO 2025 syllabus for Prelims and Mains. Check topic-wise syllabus, marking scheme and exam pattern.',
    sourceUrl: 'https://ibps.in',
    importantDates: [],
    htmlContent: `
<h2>IBPS PO 2025 – Exam Pattern</h2>
<h3>Prelims Exam</h3>
<table>
  <thead><tr><th>Section</th><th>Questions</th><th>Marks</th><th>Time</th></tr></thead>
  <tbody>
    <tr><td>English Language</td><td>30</td><td>30</td><td>20 min</td></tr>
    <tr><td>Numerical Ability</td><td>35</td><td>35</td><td>20 min</td></tr>
    <tr><td>Reasoning Ability</td><td>35</td><td>35</td><td>20 min</td></tr>
    <tr><td><strong>Total</strong></td><td><strong>100</strong></td><td><strong>100</strong></td><td><strong>60 min</strong></td></tr>
  </tbody>
</table>
<h3>Mains Exam</h3>
<table>
  <thead><tr><th>Section</th><th>Questions</th><th>Marks</th><th>Time</th></tr></thead>
  <tbody>
    <tr><td>Reasoning & Computer</td><td>45</td><td>60</td><td>60 min</td></tr>
    <tr><td>English Language</td><td>35</td><td>40</td><td>40 min</td></tr>
    <tr><td>Data Analysis</td><td>35</td><td>60</td><td>45 min</td></tr>
    <tr><td>General Economy & Banking</td><td>40</td><td>40</td><td>35 min</td></tr>
    <tr><td><strong>Total</strong></td><td><strong>155</strong></td><td><strong>200</strong></td><td><strong>3 hrs</strong></td></tr>
  </tbody>
</table>`,
  },

  // ───── UPCOMING ─────
  {
    title: 'UPSC NDA II 2025 Upcoming Notification',
    slug: 'upsc-nda-ii-2025-upcoming',
    type: JobType.UPCOMING,
    organization: 'Union Public Service Commission (UPSC)',
    location: 'All India',
    salary: '₹15,600 – ₹39,100',
    qualification: QualificationLevel.HIGH_SCHOOL,
    experience: ExperienceLevel.ENTRY,
    lastDate: future(45),
    applyLink: 'https://upsc.gov.in',
    description: 'UPSC NDA II 2025 notification expected soon. Check tentative dates, eligibility and preparation tips.',
    eligibility: '12th pass with Physics and Mathematics (for Army/Navy/Air Force). Age: 16.5 – 19.5 years.',
    totalVacancy: '395',
    ageLimit: '16.5-19.5 Years',
    isActive: true,
    tags: ['UPSC', 'NDA', 'Defence', 'Upcoming', '2025'],
    metaTitle: 'UPSC NDA II 2025 – Expected Date, Eligibility & Vacancy',
    metaDescription: 'UPSC NDA II 2025 notification coming soon. Check expected date, 395 vacancies, eligibility criteria and how to prepare.',
    sourceUrl: 'https://upsc.gov.in',
    importantDates: [
      { label: 'Expected Notification Date', date: future(20) },
      { label: 'Expected Last Date', date: future(45) },
      { label: 'Expected Exam Date', date: future(120) },
    ],
    htmlContent: `
<h2>UPSC NDA II 2025 – Expected Details</h2>
<p>The Union Public Service Commission (UPSC) is expected to release the NDA II 2025 notification. Below are the tentative details based on previous year's pattern.</p>
<table>
  <thead><tr><th>Detail</th><th>Expected Info</th></tr></thead>
  <tbody>
    <tr><td>Total Vacancy</td><td>~395</td></tr>
    <tr><td>Army</td><td>208</td></tr>
    <tr><td>Navy</td><td>42</td></tr>
    <tr><td>Air Force</td><td>120 (including 25 for Women)</td></tr>
    <tr><td>Naval Academy</td><td>25</td></tr>
  </tbody>
</table>
<h3>Preparation Tips</h3>
<ul>
  <li>Focus on Mathematics (Algebra, Trigonometry, Calculus)</li>
  <li>General Ability (English + GK)</li>
  <li>Practice previous year papers</li>
  <li>Join SSB coaching for interview preparation</li>
</ul>`,
  },

  // ───── VERIFICATION ─────
  {
    title: 'SSC CGL 2023 Document Verification 2025',
    slug: 'ssc-cgl-2023-document-verification-2025',
    type: JobType.VERIFICATION,
    organization: 'Staff Selection Commission (SSC)',
    location: 'All India',
    salary: '₹25,500 – ₹81,100',
    qualification: QualificationLevel.BACHELORS,
    experience: ExperienceLevel.ENTRY,
    lastDate: future(12),
    applyLink: 'https://ssc.nic.in',
    description: 'SSC CGL 2023 qualified candidates called for Document Verification. Download DV letter.',
    eligibility: 'Only SSC CGL 2023 qualified candidates.',
    totalVacancy: '7,500',
    isActive: true,
    tags: ['SSC', 'CGL', 'Document Verification', '2023'],
    metaTitle: 'SSC CGL 2023 Document Verification – Download DV Letter',
    metaDescription: 'SSC CGL 2023 Document Verification schedule released. Download DV call letter and check list of required documents.',
    sourceUrl: 'https://ssc.nic.in',
    importantDates: [
      { label: 'DV Letter Released', date: future(-4) },
      { label: 'DV Schedule', date: future(5) },
      { label: 'DV Last Date', date: future(12) },
    ],
    htmlContent: `
<h2>SSC CGL 2023 Document Verification 2025</h2>
<p>SSC has issued Document Verification (DV) call letters for candidates who qualified in SSC CGL 2023. Candidates must bring all original documents on the scheduled date.</p>
<h3>Documents Required</h3>
<ul>
  <li>Printed DV Call Letter</li>
  <li>Class X Certificate (DOB proof)</li>
  <li>Degree / Graduation Certificate</li>
  <li>Caste Certificate (if applicable) – issued by Competent Authority</li>
  <li>Discharge Certificate (Ex-Servicemen)</li>
  <li>EWS / PH Certificate (if applicable)</li>
  <li>8 Passport Size Photos</li>
  <li>Aadhaar Card / Valid Photo ID</li>
</ul>
<h3>Important Points</h3>
<ul>
  <li>Candidates must report 30 minutes before the scheduled time.</li>
  <li>Original documents are mandatory; photocopies alone will not be accepted.</li>
  <li>Failure to produce required documents will result in disqualification.</li>
</ul>`,
  },

  // ───── SARKARI YOJANA ─────
  {
    title: 'PM Kisan Samman Nidhi Yojana – 18th Installment 2025',
    slug: 'pm-kisan-samman-nidhi-yojana-18th-installment-2025',
    type: JobType.SARKARIYOJANA,
    organization: 'Ministry of Agriculture, Govt. of India',
    location: 'All India',
    salary: '₹6,000/year',
    qualification: QualificationLevel.OTHER,
    experience: ExperienceLevel.ENTRY,
    lastDate: future(30),
    applyLink: 'https://pmkisan.gov.in',
    description: 'PM Kisan 18th installment released. Check beneficiary status and verify your bank details.',
    eligibility: 'Small and marginal farmers holding up to 2 hectares of cultivable land.',
    totalVacancy: 'N/A',
    isActive: true,
    tags: ['PM Kisan', 'Sarkari Yojana', 'Farmer', '2025', 'Installment'],
    metaTitle: 'PM Kisan 18th Installment 2025 – Check Status',
    metaDescription: 'PM Kisan Samman Nidhi 18th installment released. Check your payment status at pmkisan.gov.in. ₹2,000 directly to bank.',
    sourceUrl: 'https://pmkisan.gov.in',
    importantDates: [
      { label: '18th Installment Released', date: future(-2) },
      { label: 'e-KYC Last Date', date: future(30) },
    ],
    htmlContent: `
<h2>PM Kisan Samman Nidhi – 18th Installment 2025</h2>
<p>The Prime Minister has released the 18th installment of PM Kisan Samman Nidhi Yojana, benefiting crores of farmers across India. ₹2,000 has been directly transferred to eligible farmers' bank accounts.</p>
<table>
  <thead><tr><th>Detail</th><th>Info</th></tr></thead>
  <tbody>
    <tr><td>Scheme Name</td><td>PM Kisan Samman Nidhi Yojana</td></tr>
    <tr><td>Annual Benefit</td><td>₹6,000 (in 3 installments of ₹2,000)</td></tr>
    <tr><td>18th Installment Amount</td><td>₹2,000</td></tr>
    <tr><td>Total Beneficiaries</td><td>9.4 Crore Farmers</td></tr>
    <tr><td>Mode of Transfer</td><td>DBT (Direct Bank Transfer)</td></tr>
  </tbody>
</table>
<h3>How to Check Beneficiary Status</h3>
<ol>
  <li>Go to pmkisan.gov.in</li>
  <li>Click "Beneficiary Status"</li>
  <li>Enter Aadhaar / Mobile / Account Number</li>
  <li>Check payment history and status</li>
</ol>
<h3>Who is Eligible?</h3>
<ul>
  <li>Small and marginal farmers with cultivable land up to 2 hectares</li>
  <li>Farmers must have valid Aadhaar linked to bank account</li>
  <li>e-KYC must be completed</li>
</ul>`,
  },

  // ───── UPDATE ─────
  {
    title: 'RRB Group D Recruitment 2025 – Latest Update',
    slug: 'rrb-group-d-recruitment-2025-latest-update',
    type: JobType.UPDATE,
    organization: 'Railway Recruitment Board (RRB)',
    location: 'All India',
    salary: '₹18,000 – ₹56,900',
    qualification: QualificationLevel.HIGH_SCHOOL,
    experience: ExperienceLevel.ENTRY,
    lastDate: future(20),
    applyLink: 'https://indianrailways.gov.in',
    description: 'RRB Group D 2025 official update: New exam date announced. Check revised schedule.',
    eligibility: '10th pass or ITI equivalent. Age: 18-36 years.',
    totalVacancy: '32,438',
    ageLimit: '18-36 Years',
    isActive: true,
    tags: ['RRB', 'Group D', 'Railway', 'Update', '2025'],
    metaTitle: 'RRB Group D 2025 – Latest Update & Exam Date',
    metaDescription: 'RRB Group D 2025 latest update: New exam schedule announced. 32,438 vacancies. Check revised dates here.',
    sourceUrl: 'https://indianrailways.gov.in',
    importantDates: [
      { label: 'Update Issued', date: future(-1) },
      { label: 'New Exam Date', date: future(60) },
    ],
    htmlContent: `
<h2>RRB Group D 2025 – Official Update</h2>
<p>Railway Recruitment Board has issued an important update regarding the RRB Group D 2025 recruitment. A new exam date has been announced following the revision of the schedule.</p>
<table>
  <thead><tr><th>Detail</th><th>Revised Info</th></tr></thead>
  <tbody>
    <tr><td>Exam Name</td><td>RRB Group D CBT 2025</td></tr>
    <tr><td>Previous Exam Date</td><td>Cancelled</td></tr>
    <tr><td>New Exam Date</td><td>${future(60).split('T')[0]}</td></tr>
    <tr><td>Total Vacancies</td><td>32,438</td></tr>
  </tbody>
</table>
<h3>Key Changes</h3>
<ul>
  <li>Exam date revised due to scheduling conflicts.</li>
  <li>Admit card will be released 15 days before the exam.</li>
  <li>Candidates should keep checking their regional RRB website for updates.</li>
</ul>`,
  },
];

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] });
  const jobsService = app.get(JobsService);

  console.log(`\n🌱 Seeding ${seedJobs.length} jobs...\n`);

  for (const jobDto of seedJobs) {
    try {
      await jobsService.create(jobDto as any);
      console.log(`  ✅  [${jobDto.type.padEnd(14)}] ${jobDto.title}`);
    } catch (err: any) {
      if (err?.code === 11000) {
        console.log(`  ⚠️  [${jobDto.type.padEnd(14)}] SKIP (duplicate slug): ${jobDto.slug}`);
      } else {
        console.error(`  ❌  [${jobDto.type.padEnd(14)}] FAILED: ${jobDto.title} →`, err?.message);
      }
    }
  }

  console.log('\n✅ Seeding complete!\n');
  await app.close();
  process.exit(0);
}

bootstrap();
