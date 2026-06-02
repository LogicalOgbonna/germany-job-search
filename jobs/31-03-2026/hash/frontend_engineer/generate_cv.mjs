import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const htmlFile = join(__dirname, 'ogbonna_arinze_cv.html');
const pdfFile = join(__dirname, 'ogbonna_arinze_cv.pdf');

const browser = await puppeteer.launch();
const page = await browser.newPage();
await page.goto(`file://${htmlFile}`, { waitUntil: 'networkidle0' });
await page.pdf({
  path: pdfFile,
  format: 'A4',
  margin: { top: 0, right: 0, bottom: 0, left: 0 },
  printBackground: true,
  preferCSSPageSize: true,
});
await browser.close();
console.log(`PDF generated: ${pdfFile}`);
