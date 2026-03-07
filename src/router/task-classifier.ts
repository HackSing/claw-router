/**
 * @aiwaretop/claw-router — Task Type Classifier
 *
 * 基于关键词匹配的任务类型分类器。
 * 对每个 TaskType 计算匹配得分，取最高分类型。
 * 低于最小阈值则归为 OTHER。
 */

import { TaskType } from './types';

// ── 分类阈值 ──────────────────────────────────────────────────────────────

/** 最低分数阈值，低于此值归为 OTHER */
const MIN_SCORE_THRESHOLD = 0.15;

// ── 关键词定义 ──────────────────────────────────────────────────────────────

interface TaskKeyword {
    pattern: string;
    weight: number;
}

function tk(pattern: string, weight: number): TaskKeyword {
    return { pattern, weight };
}

const TASK_KEYWORDS: Record<TaskType, TaskKeyword[]> = {
    [TaskType.CODING]: [
        // 中文
        tk('代码', 0.60), tk('编程', 0.65), tk('函数', 0.50),
        tk('算法', 0.55), tk('调试', 0.60), tk('bug', 0.55),
        tk('报错', 0.55), tk('编译', 0.55), tk('重构', 0.50),
        tk('实现', 0.35), tk('开发', 0.40), tk('脚本', 0.50),
        tk('接口', 0.35), tk('组件', 0.40), tk('模块', 0.35),
        tk('部署', 0.35), tk('测试', 0.35),
        // 英文
        tk('code', 0.55), tk('coding', 0.60), tk('function', 0.45),
        tk('algorithm', 0.55), tk('debug', 0.60), tk('compile', 0.50),
        tk('refactor', 0.50), tk('implement', 0.40), tk('develop', 0.35),
        tk('script', 0.50), tk('component', 0.40), tk('module', 0.35),
        tk('deploy', 0.35), tk('unit test', 0.45),
        // 语言/框架名
        tk('python', 0.50), tk('javascript', 0.50), tk('typescript', 0.50),
        tk('java', 0.45), tk('rust', 0.50), tk('golang', 0.50),
        tk('react', 0.50), tk('vue', 0.50), tk('node', 0.40),
        tk('docker', 0.40), tk('kubernetes', 0.40),
        // 结构信号
        tk('```', 0.65), tk('import ', 0.40), tk('def ', 0.40),
        tk('class ', 0.35), tk('const ', 0.30),
    ],

    [TaskType.WRITING]: [
        // 中文
        tk('写一篇', 0.70), tk('写一个', 0.40), tk('帮我写', 0.55),
        tk('创作', 0.65), tk('故事', 0.55), tk('小说', 0.60),
        tk('诗', 0.60), tk('散文', 0.60), tk('文章', 0.50),
        tk('文案', 0.60), tk('文档', 0.35), tk('报告', 0.40),
        tk('邮件', 0.45), tk('信', 0.30), tk('评论', 0.35),
        tk('博客', 0.50), tk('剧本', 0.60), tk('歌词', 0.60),
        // 英文
        tk('write a', 0.50), tk('compose', 0.55), tk('draft', 0.50),
        tk('essay', 0.55), tk('article', 0.50), tk('story', 0.55),
        tk('poem', 0.60), tk('novel', 0.60), tk('blog', 0.50),
        tk('email', 0.45), tk('letter', 0.35), tk('copy', 0.35),
        tk('content', 0.30), tk('screenplay', 0.60), tk('lyrics', 0.60),
    ],

    [TaskType.CHAT]: [
        // 中文
        tk('你好', 0.70), tk('嗨', 0.65), tk('在吗', 0.65),
        tk('聊聊', 0.60), tk('闲聊', 0.65), tk('怎么样', 0.30),
        tk('好的', 0.50), tk('谢谢', 0.50), tk('再见', 0.55),
        tk('哈哈', 0.55), tk('有意思', 0.35), tk('无聊', 0.40),
        tk('开心', 0.35), tk('难过', 0.35),
        // 英文
        tk('hello', 0.65), tk('hi ', 0.60), tk('hey', 0.60),
        tk('thanks', 0.50), tk('thank you', 0.50), tk('bye', 0.55),
        tk('how are', 0.55), tk('what\'s up', 0.55), tk('lol', 0.50),
        tk('haha', 0.50), tk('chat', 0.40),
    ],

    [TaskType.ANALYSIS]: [
        // 中文
        tk('分析', 0.60), tk('推理', 0.60), tk('论证', 0.55),
        tk('评估', 0.50), tk('比较', 0.45), tk('对比', 0.45),
        tk('研究', 0.50), tk('调研', 0.55), tk('审查', 0.45),
        tk('优缺点', 0.50), tk('利弊', 0.50), tk('解释', 0.30),
        tk('原因', 0.35), tk('为什么', 0.30), tk('深入', 0.40),
        tk('策略', 0.40), tk('方案', 0.35),
        // 英文
        tk('analyze', 0.60), tk('analysis', 0.60), tk('evaluate', 0.50),
        tk('compare', 0.45), tk('research', 0.50), tk('assess', 0.50),
        tk('pros and cons', 0.55), tk('trade-off', 0.50), tk('explain', 0.30),
        tk('investigate', 0.50), tk('reasoning', 0.55), tk('deep dive', 0.55),
        tk('strategy', 0.40),
    ],

    [TaskType.TRANSLATION]: [
        // 中文
        tk('翻译', 0.85), tk('译成', 0.80), tk('翻成', 0.80),
        tk('中译英', 0.90), tk('英译中', 0.90), tk('日译中', 0.90),
        tk('翻为', 0.80),
        // 英文
        tk('translate', 0.85), tk('translation', 0.80),
        tk('translate to', 0.90), tk('in english', 0.40),
        tk('in chinese', 0.40), tk('to french', 0.50),
        tk('to japanese', 0.50), tk('to spanish', 0.50),
    ],

    [TaskType.MATH]: [
        // 中文
        tk('数学', 0.65), tk('公式', 0.60), tk('方程', 0.60),
        tk('微积分', 0.70), tk('概率', 0.55), tk('统计', 0.50),
        tk('线性代数', 0.65), tk('矩阵', 0.55), tk('向量', 0.45),
        tk('求解', 0.45), tk('证明', 0.40), tk('定理', 0.55),
        tk('几何', 0.55), tk('函数图像', 0.55),
        // 英文
        tk('math', 0.60), tk('equation', 0.60), tk('formula', 0.55),
        tk('calculus', 0.70), tk('probability', 0.55), tk('statistics', 0.50),
        tk('linear algebra', 0.65), tk('matrix', 0.50), tk('vector', 0.40),
        tk('theorem', 0.55), tk('proof', 0.45),
    ],

    [TaskType.RESEARCH]: [
        // 中文
        tk('调研', 0.65), tk('论文', 0.65), tk('文献', 0.60),
        tk('综述', 0.60), tk('学术', 0.55), tk('期刊', 0.55),
        tk('引用', 0.40), tk('参考文献', 0.60), tk('研究方法', 0.55),
        tk('实验设计', 0.50), tk('数据收集', 0.45),
        // 英文
        tk('paper', 0.55), tk('literature', 0.60), tk('survey', 0.50),
        tk('academic', 0.55), tk('journal', 0.55), tk('citation', 0.45),
        tk('methodology', 0.50), tk('experiment', 0.40),
    ],

    // OTHER 没有关键词，作为 fallback
    [TaskType.OTHER]: [],
};

// ── 公开接口 ────────────────────────────────────────────────────────────────

/**
 * 对消息进行任务类型分类。
 *
 * 匹配每个 TaskType 的关键词，使用 soft-max 累计得分，取最高分类型。
 * 最高分低于阈值时返回 GENERAL。
 */
export function classifyTask(message: string): TaskType {
    if (!message || !message.trim()) return TaskType.CHAT;

    const lower = message.toLowerCase();
    let bestType: TaskType = TaskType.OTHER;
    let bestScore = 0;

    for (const type of [
        TaskType.CODING,
        TaskType.WRITING,
        TaskType.CHAT,
        TaskType.ANALYSIS,
        TaskType.TRANSLATION,
        TaskType.MATH,
        TaskType.RESEARCH,
    ]) {
        const keywords = TASK_KEYWORDS[type];
        const score = scoreTaskKeywords(lower, keywords);
        if (score > bestScore) {
            bestScore = score;
            bestType = type;
        }
    }

    // 额外结构信号加成：代码块 → CODING
    const fenceCount = (message.match(/```/g) || []).length;
    if (fenceCount >= 2 && bestType !== TaskType.CODING) {
        const codingScore = scoreTaskKeywords(lower, TASK_KEYWORDS[TaskType.CODING]);
        if (codingScore + 0.3 > bestScore) {
            bestType = TaskType.CODING;
            bestScore = codingScore + 0.3;
        }
    }

    return bestScore >= MIN_SCORE_THRESHOLD ? bestType : TaskType.OTHER;
}

// ── 内部工具 ────────────────────────────────────────────────────────────────

/**
 * 对一组关键词计算匹配得分。
 * 使用 soft-max：score = 1 - ∏(1 - wᵢ)，自然饱和到 1。
 */
function scoreTaskKeywords(lowerMsg: string, keywords: TaskKeyword[]): number {
    let complement = 1;
    for (const kw of keywords) {
        if (lowerMsg.includes(kw.pattern.toLowerCase())) {
            complement *= (1 - kw.weight);
        }
    }
    return 1 - complement;
}
