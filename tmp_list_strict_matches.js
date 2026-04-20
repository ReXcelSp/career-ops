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
  return (list || []).map((keyword) => String(keyword).toLowerCase().trim()).filter(Boolean);
}

function buildTitleFilter(titleFilter) {
  const positive = normalizeKeywords(titleFilter?.positive);
  const negative = normalizeKeywords(titleFilter?.negative);
  return (title) => {
    const lower = String(title || '').toLowerCase();
    const hasPositive = positive.length === 0 || positive.some((keyword) => lower.includes(keyword));
    const hasNegative = negative.some((keyword) => lower.includes(keyword));
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
    if (negativeKeywords.some((keyword) => haystack.includes(keyword))) return false;

    const hasGlobal = globalKeywords.some((keyword) => locationText.includes(keyword));
    const hasRemote = remoteKeywords.some((keyword) => locationText.includes(keyword));
    const companyFeelsRemote = companyRemoteKeywords.some((keyword) => companyText.includes(keyword));
    const hasRegion = regionKeywords.some((keyword) => locationText.includes(keyword));

    return hasGlobal || (hasRemote && hasRegion) || (companyFeelsRemote && hasRegion);
  };
}

function normalizeDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseGreenhouse(json, companyName) {
  return (json.jobs || []).map((job) => ({
    title: job.title || '',
    url: job.absolute_url || '',
    company: companyName,
    location: job.location?.name || '',
    postedAt: normalizeDate(job.updated_at || job.created_at || job.first_published),
  }));
}

function parseAshby(json, companyName) {
  return (json.jobs || []).map((job) => ({
    title: job.title || '',
    url: job.jobUrl || '',
    company: companyName,
    location: typeof job.location === 'string' ? job.location : (job.location?.locationName || ''),
    postedAt: normalizeDate(job.publishedAt || job.createdAt || job.updatedAt),
  }));
}

const titleFilter = buildTitleFilter(config.title_filter);
const locationFilter = buildLocationFilter(config.location_filter);
const companies = (config.tracked_companies || [])
  .filter((company) => company.enabled !== false)
  .map((company) => ({ ...company, _api: detectApi(company) }))
  .filter((company) => company._api !== null);

const parsers = {
  greenhouse: parseGreenhouse,
  ashby: parseAshby,
};

for (const company of companies) {
  try {
    const response = await fetch(company._api.url, { signal: AbortSignal.timeout(45000) });
    if (!response.ok) continue;
    const json = await response.json();
    const jobs = parsers[company._api.type]?.(json, company.name) || [];
    for (const job of jobs) {
      if (!titleFilter(job.title)) continue;
      if (!locationFilter(job.location, company)) continue;
      const date = job.postedAt ? job.postedAt.toISOString().slice(0, 10) : 'unknown-date';
      console.log(`${date} | ${job.company} | ${job.title} | ${job.location || 'N/A'} | ${job.url}`);
    }
  } catch {
    // Best-effort helper script.
  }
}