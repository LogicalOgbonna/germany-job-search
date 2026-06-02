import puppeteer from 'puppeteer';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function generatePDFs() {
  const browser = await puppeteer.launch({ headless: true });

  const files = [
    { html: 'senior_frontend_developer_react.html', pdf: 'senior_frontend_developer_react.pdf' },
  ];

  for (const { html, pdf } of files) {
    const htmlFile = path.resolve(__dirname, html);
    const pdfFile = path.resolve(__dirname, pdf);
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
    console.log(`Generated: ${pdf}`);
  }

  await browser.close();
}

generatePDFs().catch(console.error);
