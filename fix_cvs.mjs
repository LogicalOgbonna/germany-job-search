import fs from 'fs';
import path from 'path';
import * as cheerio from 'cheerio';

const baseHtmlPath = path.resolve('./cv/base_cv_with_contact.html');
const baseHtmlContent = fs.readFileSync(baseHtmlPath, 'utf8');

const jobsDir = path.resolve('./jobs/22-04-2026');
const jobFolders = fs.readdirSync(jobsDir).filter(f => fs.statSync(path.join(jobsDir, f)).isDirectory());

jobFolders.forEach(folder => {
  const jobPath = path.join(jobsDir, folder);
  const subfolders = fs.readdirSync(jobPath).filter(f => fs.statSync(path.join(jobPath, f)).isDirectory());
  
  subfolders.forEach(subfolder => {
    const targetDir = path.join(jobPath, subfolder);
    const cvHtmlPath = path.join(targetDir, 'cv.html');
    
    if (fs.existsSync(cvHtmlPath)) {
      console.log(`Processing ${cvHtmlPath}...`);
      const generatedHtml = fs.readFileSync(cvHtmlPath, 'utf8');
      const $gen = cheerio.load(generatedHtml);
      const $base = cheerio.load(baseHtmlContent);
      
      // 1. Extract Summary
      let summaryText = '';
      $gen('h2').each((i, el) => {
        if ($gen(el).text().toLowerCase().includes('summary')) {
          summaryText = $gen(el).next('p').text().trim() || $gen(el).next('div').text().trim();
        }
      });
      if (summaryText) {
        $base('p.summary').text(summaryText);
      }
      
      // 2. Extract Core Competencies
      let competenciesHtml = '';
      $gen('h2').each((i, el) => {
        if ($gen(el).text().toLowerCase().includes('competencies')) {
          const nextEl = $gen(el).next();
          if (nextEl.hasClass('skills-grid') || nextEl.is('div')) {
            nextEl.children('div').each((j, child) => {
              const html = $gen(child).html();
              competenciesHtml += `<div class="competency-item">${html}</div>\n`;
            });
          }
        }
      });
      if (competenciesHtml) {
        $base('div.competencies').html(competenciesHtml);
      }
      
      // 3. Extract Work Experience
      let experienceHtml = '';
      $gen('h2').each((i, el) => {
        if ($gen(el).text().toLowerCase().includes('experience')) {
          let current = $gen(el).next();
          while (current.length && !current.is('h2') && !current.is('section')) {
            if (current.hasClass('role') || current.is('article')) {
              // Extract from structured role
              let title = '', company = '', location = '', dates = '';
              const textContent = current.text();
              
              // Try to find title
              const titleEl = current.find('.role-title, .title-line, h3').first();
              title = titleEl.text().trim();
              
              // Try to find company
              const companyEl = current.find('.company, .role-company').first();
              company = companyEl.text().trim();
              
              // Try to find dates
              const datesEl = current.find('.dates, .role-date, .role-meta, .meta').first();
              dates = datesEl.text().trim();
              
              // Clean up company and location
              if (company.includes(',')) {
                const parts = company.split(',');
                company = parts[0].trim();
                location = parts.slice(1).join(',').trim();
              } else if (company.includes('(') && company.includes(')')) {
                 // sometimes location is in parens or after
              }
              
              // If title is missing, try to parse from meta
              if (!title && current.find('h3').length) {
                title = current.find('h3').text().trim();
                const meta = current.find('.meta').text().trim();
                const metaParts = meta.split('·').map(s => s.trim());
                if (metaParts.length >= 3) {
                  company = metaParts[0];
                  dates = metaParts[2];
                  location = metaParts[3] || '';
                } else if (meta.includes('|')) {
                  const metaParts = meta.split('|').map(s => s.trim());
                  dates = metaParts[0];
                  location = metaParts[1] || '';
                }
              }
              
              // Bullets
              const bullets = current.find('ul').html();
              
              experienceHtml += `
<div class="job-header">
  <span class="company">${company}</span>
  <span class="location">${location}</span>
</div>
<div class="title-row">
  <span class="job-title">${title}</span>
  <span class="dates">${dates}</span>
</div>
<ul>
${bullets}
</ul>
`;
            } else if (current.is('h3')) {
              // Flat structure like TeamViewer or Solactive
              let title = current.text().trim();
              let meta = current.next('.meta').text().trim();
              let bullets = current.nextAll('ul').first().html();
              
              let company = '', location = '', dates = '';
              if (meta.includes('·')) {
                const parts = meta.split('·').map(s => s.trim());
                company = parts[0];
                dates = parts.find(p => p.match(/\d{4}/)) || '';
                location = parts[parts.length - 1] !== dates ? parts[parts.length - 1] : '';
              } else if (meta.includes('|')) {
                const parts = meta.split('|').map(s => s.trim());
                company = parts[0];
                dates = parts.find(p => p.match(/\d{4}/)) || '';
                location = parts[parts.length - 1] !== dates ? parts[parts.length - 1] : '';
              }
              
              experienceHtml += `
<div class="job-header">
  <span class="company">${company}</span>
  <span class="location">${location}</span>
</div>
<div class="title-row">
  <span class="job-title">${title}</span>
  <span class="dates">${dates}</span>
</div>
<ul>
${bullets}
</ul>
`;
              current = current.nextAll('ul').first(); // skip to ul
            }
            current = current.next();
          }
        }
      });
      
      if (experienceHtml) {
        // Replace everything between Work Experience h2 and Projects h2
        const workExpH2 = $base('h2').filter((i, el) => $base(el).text().toLowerCase().includes('work experience'));
        const projectsH2 = $base('h2').filter((i, el) => $base(el).text().toLowerCase().includes('project'));
        
        let curr = workExpH2.next();
        while (curr.length && !curr.is('h2')) {
          const next = curr.next();
          curr.remove();
          curr = next;
        }
        
        workExpH2.after(experienceHtml);
      }
      
      // 4. Extract Projects
      let projectsHtml = '';
      $gen('h2').each((i, el) => {
        if ($gen(el).text().toLowerCase().includes('project')) {
          let current = $gen(el).next();
          while (current.length && !current.is('h2') && !current.is('section')) {
            if (current.hasClass('role') || current.is('article')) {
              let title = current.find('.role-title, .title-line, h3').first().text().trim();
              let company = current.find('.company, .role-company').first().text().trim();
              let dates = current.find('.dates, .role-date, .role-meta, .meta').first().text().trim();
              let desc = current.find('p').first().text().trim();
              let bullets = current.find('ul').html();
              
              if (!title && current.find('h3').length) {
                title = current.find('h3').text().trim();
                const meta = current.find('.meta').text().trim();
                const metaParts = meta.split('·').map(s => s.trim());
                if (metaParts.length >= 2) {
                  company = metaParts[0];
                  dates = metaParts[1];
                } else if (meta.includes('|')) {
                  const metaParts = meta.split('|').map(s => s.trim());
                  company = metaParts[0];
                  dates = metaParts[1];
                }
              }
              
              // Cleanup
              if (title.includes('—')) {
                const parts = title.split('—').map(s => s.trim());
                title = parts[0];
                company = parts[1];
              } else if (title.includes('|')) {
                const parts = title.split('|').map(s => s.trim());
                title = parts[0];
                company = parts[1];
              }
              
              projectsHtml += `
<div class="project-header">
  <span class="project-name">${company || 'OurNigeria'}</span>
  <span class="project-link"><a href="https://ournigeria.ng">ournigeria.ng</a></span>
</div>
<div class="title-row">
  <span class="job-title">${title}</span>
  <span class="dates">${dates}</span>
</div>
${desc && !desc.includes('ournigeria.ng') ? `<p class="project-desc">${desc}</p>` : ''}
<ul>
${bullets}
</ul>
`;
            } else if (current.is('h3')) {
              let title = current.text().trim();
              let meta = current.next('.meta').text().trim();
              let bullets = current.nextAll('ul').first().html();
              
              let company = 'OurNigeria', dates = meta;
              if (meta.includes('·')) {
                const parts = meta.split('·').map(s => s.trim());
                dates = parts[0];
              } else if (meta.includes('|')) {
                const parts = meta.split('|').map(s => s.trim());
                company = parts[0];
                dates = parts[1];
              }
              
              projectsHtml += `
<div class="project-header">
  <span class="project-name">${company}</span>
  <span class="project-link"><a href="https://ournigeria.ng">ournigeria.ng</a></span>
</div>
<div class="title-row">
  <span class="job-title">${title}</span>
  <span class="dates">${dates}</span>
</div>
<ul>
${bullets}
</ul>
`;
              current = current.nextAll('ul').first();
            }
            current = current.next();
          }
        }
      });
      
      if (projectsHtml) {
        const projectsH2 = $base('h2').filter((i, el) => $base(el).text().toLowerCase().includes('project'));
        const eduH2 = $base('h2').filter((i, el) => $base(el).text().toLowerCase().includes('education'));
        
        if (projectsH2.length) {
          let curr = projectsH2.next();
          while (curr.length && !curr.is('h2')) {
            const next = curr.next();
            curr.remove();
            curr = next;
          }
          projectsH2.after(projectsHtml);
        }
      }
      
      // Write back
      fs.writeFileSync(cvHtmlPath, $base.html(), 'utf8');
      console.log(`Updated ${cvHtmlPath}`);
    }
  });
});
