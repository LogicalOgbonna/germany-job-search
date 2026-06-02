import puppeteer from 'puppeteer';
import { readdirSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function generatePDFs() {
  const browser = await puppeteer.launch({ headless: true });
  const companies = readdirSync(__dirname, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  for (const company of companies) {
    const companyDir = path.join(__dirname, company);
    const roles = readdirSync(companyDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);

    for (const role of roles) {
      const roleDir = path.join(companyDir, role);
      const htmlFile = path.join(roleDir, 'cv.html');
      const pdfFile = path.join(roleDir, 'ogbonna_arinze_cv.pdf');

      if (!existsSync(htmlFile)) {
        console.log(`SKIP (no cv.html): ${company}/${role}`);
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
