import puppeteer from 'puppeteer';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlFile = path.resolve(__dirname, 'ogbonna_arinze_cv.html');
const pdfFile = path.resolve(__dirname, 'ogbonna_arinze_cv.pdf');

async function generatePDF() {
  const browser = await puppeteer.launch({ headless: true });
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
  await browser.close();
  console.log(`PDF generated: ${pdfFile}`);
}

generatePDF().catch(console.error);