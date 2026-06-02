import puppeteer from 'puppeteer';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function generatePDF() {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  const htmlPath = `file://${path.join(__dirname, 'cover_letter.html')}`;
  await page.goto(htmlPath, { waitUntil: 'networkidle0' });
  
  const pdfPath = path.join(__dirname, 'cover_letter.pdf');
  await page.pdf({
    path: pdfPath,
    format: 'A4',
    printBackground: true,
    margin: {
      top: '0',
      right: '0',
      bottom: '0',
      left: '0'
    },
    preferCSSPageSize: true
  });

  console.log(`PDF generated: ${pdfPath}`);
  await browser.close();
}

generatePDF().catch(console.error);