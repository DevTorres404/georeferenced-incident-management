import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const HTML_DIRECTORY = 'app/html';

describe('global loading screen contracts', () => {
  it('uses the location icon on every page loader', () => {
    const pagesWithLoader = readdirSync(HTML_DIRECTORY)
      .filter((file) => file.endsWith('.html'))
      .map((file) => ({
        file,
        html: readFileSync(`${HTML_DIRECTORY}/${file}`, 'utf8'),
      }))
      .filter(({ html }) => html.includes('id="pageLoader"'));

    expect(pagesWithLoader.length).toBeGreaterThan(0);

    pagesWithLoader.forEach(({ file, html }) => {
      const loaderMarkup = html.match(/<div id="pageLoader"[\s\S]*?<\/div>\s*<\/div>/)?.[0] || '';
      expect(loaderMarkup, file).toContain('class="fas fa-map-marker-alt"');
      expect(loaderMarkup.match(/<i class="fas fa-map-marker-alt"><\/i>/g), file).toHaveLength(1);
    });
  });
});
