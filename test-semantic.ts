import { computeSemanticScores } from './src/router/semantic';

async function run() {
    console.log("Loading model and extracting anchors...");
    const t0 = Date.now();
    const res1 = await computeSemanticScores("帮我写一个高并发的微服务架构包含数据库读写分离");
    console.log("First request took:", Date.now() - t0, "ms");
    console.log(res1);

    const t1 = Date.now();
    const res2 = await computeSemanticScores("怎么修这个 Python 的报错");
    console.log("Second request took:", Date.now() - t1, "ms");
    console.log(res2);
}

run();
