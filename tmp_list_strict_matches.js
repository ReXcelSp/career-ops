import { readFileSync } from 'fs';
import yaml from 'js-yaml';

const config = yaml.load(readFileSync('portals.yml', 'utf8'));

function detectApi(company) {
  if (company.api && company.api.includes('greenhouse')) {
    return { type: 'greenhouse', url: company.api };
  }
  const url = company.careers_url || '';
  const ashbyMatch = url.match(/jobs\.ashbyhq\.com\/([^/?#]+)/);
  if (ashbyMatch) {
    return {
      type: 'ashby',
      url: `https://api.ashbyhq.com/posting-api/job-board/${ashbyMatch[1]}?includeCompensation=true`,
    };
  }
  const leverMatch = url.match(/jobs\.lever\.co\/([^/?#]+)/);
  if (leverMatch) {
    return {
      type: 'lever',
      url: `https://api.lever.co/v0/postings/${leverMatch[1]}`,
    };
  }
  const ghEuMatch = url.match(/job-boards(?:\.eu)?\.greenhouse\.io\/([^/?#]+)/);
  if (ghEuMatch && !company.api) {
    return {
      type: 'greenhouse',
      url: `https://boards-api.greenhouse.io/v1/boards/${ghEuMatch[1]}/jobs`,
    };
  }
  return null;
}

function normalizeKeywords(list) {
  return (list || []).map(k => String(k).toLowerCase().trim()).filter(Boolean);
}

function buildTitleFilter(titleFilter) {
  const positive = normalizeKeywords(titleFilter?.positive);
  const negative = normalizeKeywords(titleFilter?.negative);
  return (title) => {
    const lower = String(title || '').toLowerCase();
    const hasPositive = positive.length === 0 || positive.some(k => lower.includes(k));
    const hasNegative = negative.some(k => lower.includes(k));
    return hasPositive && !hasNegative;
  };
}

function buildLocationFilter(locationFilter) {
  const remoteKeywords = normalizeKeywords(locationFilter?.remote_keywords);
  const regionKeywords = normalizeKeywords(locationFilter?.region_keywords);
  const globalKeywords = normalizeKeywords(locationFilter?.global_keywords);
  const negativeKeywords = normalizeKeywords(locationFilter?.negative);
  const companyRemoteKeywords = ['remote-first', 'distributed'];

  return (location, company) => {
    const locationText = String(location || '').toLowerCase();
    const companyText = [company?.notes || '', company?.name || ''].join(' ').toLowerCase();
    const haystack = `${locationText} ${companyText}`;
    if (!haystack.trim()) return false;
    if (negativeKeywords.some(k => haystack.includes(k))) return false;
    const hasGlobal = globalKeywords.some(k => locationText.includes(k));
    const hasRemote = remoteKeywords.some(k => locationText.includes(k)) || companyRemoteKeywords.some(k => companyText.includes(k));
    const hasRegion = regionKeywords.some(k => locationText.includes(k));
    return hasGlobal || (hasRemote && hasRegion);
  };
}

function normalizeDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseGreenhouse(json, companyName) {
  return (json.jobs || []).map(j => ({
    title: j.title || '',
    url: j.absolute_url || '',
    company: companyName,
    location: j.location?.name || '',
    postedAt: normalizeDate(j.updated_at || j.created_at || j.first_published),
  }));
}

function parseAshby(json, companyName) {
  return (json.jobs || []).map(j => ({
    title: j.title || '',
    url: j.jobUrl || '',
    company: companyName,
    location: typeof j.location === 'string' ? j.location : (j.location?.locationName || ''),
    postedAt: normalizeDate(j.publishedAt || j.createdAt || j.updatedAt),
  }));
}

function parseLever(json, companyName) {
  if (!Array.isArray(json)) return [];
  return json.map(j => ({
    title: j.text || '',
    url: j.hostedUrl || '',
    company: companyName,
    location: j.categories?.location || '',
    postedAt: normalizeDate(j.createdAt),
  }));
}

const parsers = { greenhouse: parseGreenhouse, ashby: parseAshby, lever: parseLever };
const titleFilter = buildTitleFilter(config.title_filter);
const locationFilter = buildLocationFilter(config.location_filter);
const companies = (config.tracked_companies || [])
  .filter(c => c.enabled !== false)
  .map(c => ({ ...c, _api: detectApi(c) }))
  .filter(c => c._api);

const matches = [];
for (const company of companies) {
  try {
    const response = await fetch(company._api.url, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) continue;
    const json = await response.json();
    const jobs = parsers[company._api.type](json, company.name);
    for (const job of jobs) {
      if (!titleFilter(job.title)) continue;
      if (!locationFilter(job.location, company)) continue;
      matches.push(job);
    }
  } catch {}
}

matches.sort((a, b) => {
  const left = a.postedAt ? a.postedAt.getTime() : 0;
  const right = b.postedAt ? b.postedAt.getTime() : 0;
  return right - left;
});

for (const job of matches) {
  const date = job.postedAt ? job.postedAt.toISOString().slice(0, 10) : 'unknown-date';
  console.log(`${date} | ${job.company} | ${job.title} | ${job.location || 'N/A'} | ${job.url}`);
}
