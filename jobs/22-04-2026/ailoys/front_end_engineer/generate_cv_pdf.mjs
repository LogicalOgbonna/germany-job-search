import puppeteer from "puppeteer";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function generatePDF() {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  const htmlPath = path.join(__dirname, "cv.html");
  const pdfPath = path.join(__dirname, "ogbonna_arinze_cv.pdf");

  await page.goto(`file://${htmlPath}`, { waitUntil: "networkidle0" });

  await page.pdf({
    path: pdfPath,
    format: "A4",
    printBackground: true,
    margin: {
      top: "12mm",
      bottom: "12mm",
      left: "14mm",
      right: "14mm",
    },
  });

  await browser.close();
  console.log(`PDF written to ${pdfPath}`);
}

generatePDF().catch((err) => {
  console.error(err);
  process.exit(1);
});
