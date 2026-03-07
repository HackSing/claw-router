import { resolveConfig } from './src/config';
import { route } from './src/router/engine';

async function run() {
    const config = resolveConfig();
    const shortMsg = '怎么修？';
    const noHistoryDecision = await route(shortMsg, config);

    const heavyHistory = [
        '```typescript\n' + 'export class MyFramework {\n  //...\n'.repeat(50) + '```\n',
        'This error occurred: System.OutOfMemoryException during scaling across 5 Kubernetes pods.',
    ];
    const historyDecision = await route(shortMsg, config, heavyHistory);

    console.log('No history calibrated:', noHistoryDecision.score.calibrated);
    console.log('With history calibrated:', historyDecision.score.calibrated);
    console.log('No history tier:', noHistoryDecision.tier);
    console.log('With history tier:', historyDecision.tier);
}
run();
