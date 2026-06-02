import puppeteer from 'puppeteer';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  const htmlPath = `file://${path.join(__dirname, 'ogbonna_arinze_cv.html')}`;
  await page.goto(htmlPath, { waitUntil: 'networkidle0' });
  
  await page.pdf({
    path: path.join(__dirname, 'ogbonna_arinze_cv.pdf'),
    format: 'A4',
    printBackground: true,
    preferCSSPageSize: true,
    margin: {
      top: 0,
      right: 0,
      bottom: 0,
      left: 0
    }
  });
  
  await browser.close();
  console.log('PDF generated successfully!');
})();
