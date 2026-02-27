/**
 * ai.js — FlowState AI Classifier
 *
 * Uses facebook/bart-large-mnli via the HuggingFace Inference API
 * for zero-shot text classification.
 *
 * API endpoint: https://router.huggingface.co/hf-inference/models/facebook/bart-large-mnli
 */

const HF_API_URL =
    'https://router.huggingface.co/hf-inference/models/facebook/bart-large-mnli';

// In-memory cache: key = `${text}||${labels.join(',')}` → result
const _cache = new Map();

/**
 * Classify `text` against `candidateLabels` using BART-MNLI.
 *
 * @param {string}   text            - Text to classify (URL + page title)
 * @param {string[]} candidateLabels - Labels to score against
 * @param {string}   apiKey          - HuggingFace API key (hf_...)
 * @returns {Promise<{labels: string[], scores: number[]}>}
 */
export async function classify(text, candidateLabels, apiKey) {
    if (!apiKey) throw new Error('No HuggingFace API key set.');
    if (!text || !candidateLabels?.length) throw new Error('Invalid input.');

    const cacheKey = `${text}||${candidateLabels.join(',')}`;
    if (_cache.has(cacheKey)) return _cache.get(cacheKey);

    const res = await fetch(HF_API_URL, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            inputs: text,
            parameters: {
                candidate_labels: candidateLabels,
                multi_label: false,
            },
        }),
    });

    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`HF API error ${res.status}: ${errText}`);
    }

    const data = await res.json();
    const result = { labels: data.labels, scores: data.scores };
    _cache.set(cacheKey, result);
    return result;
}

/**
 * Classify a website by its URL + title.
 * Returns the top label and its confidence score.
 *
 * @param {string} url
 * @param {string} title
 * @param {string} apiKey
 * @returns {Promise<{topLabel: string, topScore: number, labels: string[], scores: number[]}>}
 */
export async function classifySite(url, title, apiKey) {
    let host = url;
    try { host = new URL(url).hostname.replace('www.', ''); } catch { }

    const text = title ? `${host} — ${title}` : host;

    const result = await classify(text, [
        'productive work',
        'entertainment and distraction',
        'social media',
        'neutral browsing',
    ], apiKey);

    return {
        topLabel: result.labels[0],
        topScore: result.scores[0],
        labels: result.labels,
        scores: result.scores,
    };
}

/**
 * Score a user's intent unlock reason.
 * Returns true if the reason is considered legitimate.
 *
 * @param {string} reason  - User-typed reason
 * @param {string} apiKey
 * @returns {Promise<{allowed: boolean, label: string, score: number}>}
 */
export async function scoreIntentReason(reason, apiKey) {
    const result = await classify(reason, [
        'legitimate work reason',
        'distraction or procrastination excuse',
    ], apiKey);

    const topLabel = result.labels[0];
    const topScore = result.scores[0];
    const allowed = topLabel === 'legitimate work reason' && topScore > 0.65;

    return { allowed, label: topLabel, score: topScore };
}

/**
 * Clear the in-memory cache (useful for testing).
 */
export function clearCache() {
    _cache.clear();
}
