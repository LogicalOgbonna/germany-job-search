import puppeteer from 'puppeteer';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(__dirname, 'cv.html');
const pdfPath = path.join(__dirname, 'ogbonna_arinze_cv.pdf');

async function generatePDF() {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle0' });
  await page.pdf({
    path: pdfPath,
    format: 'A4',
    margin: { top: '0px', right: '0px', bottom: '0px', left: '0px' },
    printBackground: true,
    preferCSSPageSize: true,
  });
  await browser.close();
  console.log(`PDF written to ${pdfPath}`);
}

generatePDF().catch((err) => {
  console.error(err);
  process.exit(1);
});
