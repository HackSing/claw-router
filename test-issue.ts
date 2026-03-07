import { computeSemanticScores } from './src/router/semantic';

async function run() {
    const msg = '帮我构思一套支持跨城异地多活的电商秒杀交易系统，并考虑到熔断和降级机制';
    const res = await computeSemanticScores(msg);
    console.log(JSON.stringify(res, null, 2));
}
run();
