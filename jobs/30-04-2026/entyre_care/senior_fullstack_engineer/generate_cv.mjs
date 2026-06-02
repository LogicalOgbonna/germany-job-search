import puppeteer from 'puppeteer';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function generatePDF() {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  
  const htmlPath = path.join(__dirname, 'ogbonna_arinze_cv.html');
  const pdfPath = path.join(__dirname, 'ogbonna_arinze_cv.pdf');

  await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle0' });
  
  await page.pdf({
    path: pdfPath,
    format: 'A4',
    margin: { top: '0px', right: '0px', bottom: '0px', left: '0px' },
    printBackground: true,
    preferCSSPageSize: true,
  });

  await browser.close();
  console.log(`PDF generated at ${pdfPath}`);
}

generatePDF().catch(console.error);
