#!/usr/bin/env node

/**
 * discover-matches.mjs — Comprehensive match discovery
 *
 * Fetches Greenhouse, Ashby, and Lever APIs directly, keeps all jobs that
 * match the configured title families, and classifies them into:
 * - strict: title + explicit compatible location
 * - reviewable: title match + ambiguous but potentially compatible location
 *
 * This script is designed for broader candidate discovery than scan.mjs.
 * It does not write into pipeline.md. It writes a dated markdown shortlist.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import yaml from 'js-yaml';

const PORTALS_PATH = 'portals.yml';
const SHORTLIST_DIR = 'data/shortlists';
const FETCH_TIMEOUT_MS = 45000;

function normalizeKeywords(list) {
  return (list || []).map((item) => String(item).toLowerCase().trim()).filter(Boolean);
}

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

  const greenhouseMatch = url.match(/job-boards(?:\.eu)?\.greenhouse\.io\/([^/?#]+)/);
  if (greenhouseMatch && !company.api) {
    return {
      type: 'greenhouse',
      url: `https://boards-api.greenhouse.io/v1/boards/${greenhouseMatch[1]}/jobs`,
    };
  }

  return null;
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

function parseLever(json, companyName) {
  if (!Array.isArray(json)) return [];
  return json.map((job) => ({
    title: job.text || '',
    url: job.hostedUrl || '',
    company: companyName,
    location: job.categories?.location || '',
    postedAt: normalizeDate(job.createdAt),
  }));
}

function normalizeDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
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

function classifyLocation(locationFilter, location, company) {
  const remoteKeywords = normalizeKeywords(locationFilter?.remote_keywords);
  const regionKeywords = normalizeKeywords(locationFilter?.region_keywords);
  const globalKeywords = normalizeKeywords(locationFilter?.global_keywords);
  const negativeKeywords = normalizeKeywords(locationFilter?.negative);
  const companyRemoteKeywords = ['remote-first', 'distributed'];

  const locationText = String(location || '').toLowerCase();
  const companyText = [company?.notes || '', company?.name || ''].join(' ').toLowerCase();
  const haystack = `${locationText} ${companyText}`.trim();

  if (!haystack) {
    return { bucket: 'reviewable', reason: 'missing location metadata' };
  }

  if (negativeKeywords.some((keyword) => haystack.includes(keyword))) {
    return { bucket: 'reject', reason: 'explicitly incompatible location metadata' };
  }

  const hasGlobal = globalKeywords.some((keyword) => locationText.includes(keyword));
  const hasRemote = remoteKeywords.some((keyword) => locationText.includes(keyword));
  const companyFeelsRemote = companyRemoteKeywords.some((keyword) => companyText.includes(keyword));
  const hasRegion = regionKeywords.some((keyword) => locationText.includes(keyword));

  if (hasGlobal || (hasRemote && hasRegion) || (hasRemote && companyFeelsRemote) || (companyFeelsRemote && hasRegion)) {
    return { bucket: 'strict', reason: 'explicit remote and compatible region/global scope' };
  }

  if (hasRegion || hasRemote || companyFeelsRemote) {
    return { bucket: 'reviewable', reason: 'title fit with ambiguous or partially compatible location' };
  }

  return { bucket: 'reject', reason: 'location does not indicate compatible remote/region policy' };
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function formatDate(date) {
  return date ? date.toISOString().slice(0, 10) : 'unknown-date';
}

function renderSection(title, jobs) {
  if (jobs.length === 0) {
    return `## ${title}\n\nNo matches.\n`;
  }

  const lines = jobs.map((job, index) => {
    return `${index + 1}. ${formatDate(job.postedAt)} | ${job.company} | ${job.title} | ${job.location || 'N/A'}\n   ${job.url}\n   Reason: ${job.reason}`;
  });

  return `## ${title}\n\n${lines.join('\n\n')}\n`;
}

async function main() {
  const args = process.argv.slice(2);
  const daysArg = args.find((arg) => arg.startsWith('--days='));
  const days = daysArg ? Number(daysArg.split('=')[1]) : 90;

  const config = yaml.load(readFileSync(PORTALS_PATH, 'utf-8'));
  const titleFilter = buildTitleFilter(config.title_filter);
  const companies = (config.tracked_companies || [])
    .filter((company) => company.enabled !== false)
    .map((company) => ({ ...company, _api: detectApi(company) }))
    .filter((company) => company._api !== null);

  const parsers = {
    greenhouse: parseGreenhouse,
    ashby: parseAshby,
    lever: parseLever,
  };

  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const strictMatches = [];
  const reviewableMatches = [];
  const errors = [];
  let totalJobs = 0;
  let titleMatches = 0;

  for (const company of companies) {
    try {
      const json = await fetchJson(company._api.url);
      const jobs = parsers[company._api.type](json, company.name);
      totalJobs += jobs.length;

      for (const job of jobs) {
        if (job.postedAt && job.postedAt < cutoff) continue;
        if (!titleFilter(job.title)) continue;

        titleMatches++;
        const locationResult = classifyLocation(config.location_filter, job.location, company);
        const enrichedJob = { ...job, reason: locationResult.reason };

        if (locationResult.bucket === 'strict') strictMatches.push(enrichedJob);
        if (locationResult.bucket === 'reviewable') reviewableMatches.push(enrichedJob);
      }
    } catch (error) {
      errors.push({ company: company.name, error: error.message });
    }
  }

  strictMatches.sort((left, right) => (right.postedAt?.getTime() || 0) - (left.postedAt?.getTime() || 0));
  reviewableMatches.sort((left, right) => (right.postedAt?.getTime() || 0) - (left.postedAt?.getTime() || 0));

  mkdirSync(SHORTLIST_DIR, { recursive: true });

  const today = new Date().toISOString().slice(0, 10);
  const filePath = resolve(SHORTLIST_DIR, `${today}-comprehensive-matches.md`);
  const content = [
    '# Comprehensive Matches',
    '',
    `Date generated: ${today}`,
    `Window: last ${days} days`,
    'Logic: keep all title-matching roles, then separate them into strict and reviewable location buckets.',
    '',
    '## Summary',
    '',
    `- Companies scanned: ${companies.length}`,
    `- Total jobs fetched: ${totalJobs}`,
    `- Title matches: ${titleMatches}`,
    `- Strict matches: ${strictMatches.length}`,
    `- Reviewable matches: ${reviewableMatches.length}`,
    errors.length ? `- Errors: ${errors.length}` : '- Errors: 0',
    '',
    renderSection('Strict Matches', strictMatches),
    renderSection('Reviewable Matches', reviewableMatches),
  ].join('\n');

  writeFileSync(filePath, content, 'utf-8');

  console.log(`Comprehensive matches saved to ${filePath}`);
  console.log(`Companies scanned: ${companies.length}`);
  console.log(`Total jobs fetched: ${totalJobs}`);
  console.log(`Title matches: ${titleMatches}`);
  console.log(`Strict matches: ${strictMatches.length}`);
  console.log(`Reviewable matches: ${reviewableMatches.length}`);

  if (errors.length > 0) {
    console.log(`Errors (${errors.length}):`);
    for (const error of errors) {
      console.log(`  - ${error.company}: ${error.error}`);
    }
  }
}

main().catch((error) => {
  console.error('Fatal:', error.message);
  process.exit(1);
});