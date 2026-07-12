/// <reference types="node" />

import { readFileSync } from 'node:fs';
import path from 'node:path';

const workflowPath = path.resolve(
  __dirname,
  '../../.github/workflows/deploy-pages.yml',
);

describe('GitHub Pages deployment workflow', () => {
  it('mirrors the Expo build to gh-pages and deploys the same Pages artifact', () => {
    const workflow = readFileSync(workflowPath, 'utf8');

    expect(workflow).toContain('branches: [main]');
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain('contents: write');
    expect(workflow).toContain('pages: write');
    expect(workflow).toContain('id-token: write');
    expect(workflow).toContain('npm run typecheck');
    expect(workflow).toContain('npm test');
    expect(workflow).toContain('npm run predeploy');
    expect(workflow).toContain('npx gh-pages');
    expect(workflow).toContain('actions/upload-pages-artifact@v4');
    expect(workflow).toContain('actions/deploy-pages@v4');
    expect(workflow).toContain('needs: build');
  });
});
