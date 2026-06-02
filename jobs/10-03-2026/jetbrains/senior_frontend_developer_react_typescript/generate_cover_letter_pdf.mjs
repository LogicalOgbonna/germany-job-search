import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const htmlFile = path.join(__dirname, 'cover_letter.html');
const pdfFile = path.join(__dirname, 'cover_letter.pdf');

(async () => {
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
  await browser.close();
  console.log(`Cover letter PDF generated: ${pdfFile}`);
})();
