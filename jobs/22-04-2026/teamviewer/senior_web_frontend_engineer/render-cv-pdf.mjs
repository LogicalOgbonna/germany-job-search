import puppeteer from "puppeteer";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(__dirname, "cv.html");
const pdfPath = path.join(__dirname, "ogbonna_arinze_cv.pdf");

const fileUrl = pathToFileURL(htmlPath).href;

async function main() {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(fileUrl, { waitUntil: "networkidle0" });
  await page.pdf({
    path: pdfPath,
    format: "A4",
    printBackground: true,
    margin: { top: "12mm", bottom: "12mm", left: "14mm", right: "14mm" },
  });
  await browser.close();
  console.log("Wrote", pdfPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
