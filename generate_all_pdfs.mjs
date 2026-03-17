import puppeteer from 'puppeteer';
import { readdirSync, existsSync } from 'fs';
import path from 'path';

const jobsDir = path.resolve('jobs/11-03-2026');

async function generatePDFs() {
  const browser = await puppeteer.launch({ headless: true });
  const companies = readdirSync(jobsDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  for (const company of companies) {
    const companyDir = path.join(jobsDir, company);
    const roles = readdirSync(companyDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);

    for (const role of roles) {
      const roleDir = path.join(companyDir, role);
      const htmlFile = path.join(roleDir, `${role}.html`);
      const pdfFile = path.join(roleDir, `${role}.pdf`);

      if (!existsSync(htmlFile)) {
        console.log(`SKIP (no HTML): ${company}/${role}`);
        continue;
      }
      if (existsSync(pdfFile)) {
        console.log(`SKIP (PDF exists): ${company}/${role}`);
        continue;
      }

      const page = await browser.newPage();
      await page.goto(`file://${htmlFile}`, { waitUntil: 'networkidle0' });
      await page.pdf({
        path: pdfFile,
        format: 'A4',
        margin: { top: '0px', right: '0px', bottom: '0px', left: '0px' },
        printBackground: true,
        preferCSSPageSize: true,
      });
      await page.close();
      console.log(`PDF generated: ${company}/${role}`);
    }
  }

  await browser.close();
  console.log('All PDFs generated.');
}

generatePDFs().catch(console.error);
