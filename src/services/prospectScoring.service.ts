export type PreScoreLevel = "high" | "medium" | "low";

export interface PreScoreResult {
  score: number;
  level: PreScoreLevel;
  details: {
    role: boolean;
    industry: boolean;
    location: boolean;
    companySize: boolean;
    company: boolean;
    url: boolean;
    targetDescriptionOverlap: boolean;
  };
}

const STOP_WORDS = new Set([
  "avec",
  "chez",
  "dans",
  "des",
  "du",
  "est",
  "les",
  "leur",
  "leurs",
  "notre",
  "nous",
  "pour",
  "qui",
  "que",
  "sur",
  "une",
  "vous",
  "and",
  "the",
  "for",
  "with",
]);

function toArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item ?? "").trim()).filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(/[,;\n|]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function pickString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = normalizeText(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function tokens(value: string): string[] {
  return normalizeText(value)
    .split(" ")
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
}

function stem(token: string): string {
  return token.replace(/(ements|ement|ations|ation|iques|ique|trices|trice|teurs|teur|eurs|euses|euse|aux|eaux|es|s)$/i, "");
}

function tokenMatches(a: string, b: string): boolean {
  if (a === b) return true;

  const stemA = stem(a);
  const stemB = stem(b);
  if (stemA === stemB && stemA.length >= 4) return true;

  const prefixLength = Math.min(5, stemA.length, stemB.length);
  return prefixLength >= 4 && stemA.slice(0, prefixLength) === stemB.slice(0, prefixLength);
}

function matchesCriterion(text: string, criterion: string): boolean {
  const normalizedText = normalizeText(text);
  const normalizedCriterion = normalizeText(criterion);
  if (!normalizedText || !normalizedCriterion) return false;
  if (normalizedText.includes(normalizedCriterion)) return true;

  const criterionTokens = tokens(criterion);
  const textTokens = tokens(text);
  if (criterionTokens.length === 0 || textTokens.length === 0) return false;

  const matched = criterionTokens.filter((criterionToken) =>
    textTokens.some((textToken) => tokenMatches(textToken, criterionToken))
  ).length;

  const requiredMatches = criterionTokens.length <= 2
    ? criterionTokens.length
    : Math.ceil(criterionTokens.length * 0.6);

  return matched >= requiredMatches;
}

function matchesAnyCriterion(text: string, criteria: string[]): boolean {
  return criteria.some((criterion) => matchesCriterion(text, criterion));
}

function hasMeaningfulOverlap(text: string, reference: string, minimumMatches = 2): boolean {
  const textTokens = tokens(text);
  const referenceTokens = tokens(reference);
  if (!textTokens.length || !referenceTokens.length) return false;

  const matched = referenceTokens.filter((referenceToken) =>
    textTokens.some((textToken) => tokenMatches(textToken, referenceToken))
  ).length;

  return matched >= minimumMatches || matched / referenceTokens.length >= 0.25;
}

function objectToSearchableText(value: unknown, depth = 0): string {
  if (value == null || depth > 2) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => objectToSearchableText(item, depth + 1)).join(" ");
  }
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>)
      .map((item) => objectToSearchableText(item, depth + 1))
      .join(" ");
  }
  return "";
}

export function preScoreLevelFromScore(score: number): PreScoreLevel {
  if (score >= 70) return "high";
  if (score >= 40) return "medium";
  return "low";
}

export function preScoreProspect(prospect: any, campaign: any | null | undefined): PreScoreResult {
  const config = campaign?.config ?? {};
  const targetIcp = config.target_icp ?? {};
  const prospection = config.prospection ?? {};
  const extraData = prospect.extra_data ?? {};
  const rawData = prospect.raw_data ?? extraData.raw_data ?? extraData;
  const company = Array.isArray(prospect.company) ? prospect.company[0] ?? {} : prospect.company ?? {};
  const organization = rawData.organization ?? extraData.organization ?? {};

  const targetRoles = unique([
    ...toArray(campaign?.target_roles),
    ...toArray(config.target_roles),
    ...toArray(config.icp_roles),
    ...toArray(config.personas),
    ...toArray(config.roles),
    ...toArray(config.job_titles),
    ...toArray(targetIcp.roles),
    ...toArray(targetIcp.job_titles),
    ...toArray(targetIcp.personas),
    pickString(prospection.decision_maker),
  ]);

  const targetIndustries = unique([
    ...toArray(campaign?.target_industries),
    ...toArray(config.target_industries),
    ...toArray(config.icp_industries),
    ...toArray(config.industries),
    ...toArray(targetIcp.industries),
    ...toArray(targetIcp.sectors),
    pickString(prospection.sector),
  ]);

  const targetLocations = unique([
    ...toArray(campaign?.target_locations),
    ...toArray(config.target_locations),
    ...toArray(config.locations),
    ...toArray(targetIcp.locations),
    ...toArray(targetIcp.geographies),
    pickString(prospection.location),
  ]);

  const targetCompanySizes = unique([
    ...toArray(campaign?.target_company_size),
    ...toArray(config.target_company_size),
    ...toArray(config.company_sizes),
    ...toArray(targetIcp.company_size),
    ...toArray(targetIcp.company_sizes),
  ]);

  const targetDescription = pickString(
    campaign?.target_description,
    config.target_description,
    config.offer,
    campaign?.objective,
    campaign?.description
  );
  const roleTitle = pickString(prospect.role_title, prospect.role, prospect.title, extraData.original_headline);
  const companyName = pickString(
    prospect.company_name,
    prospect.company,
    company.name,
    rawData.company,
    rawData.company_name,
    rawData.companyName,
    organization.name
  );
  const companyDescription = pickString(
    prospect.company_description,
    company.description,
    extraData.company_description,
    extraData.companyDescription,
    extraData.about,
    extraData.original_headline,
    rawData.company_description,
    rawData.companyDescription,
    rawData.organizationDescription,
    rawData.organization_description,
    rawData.organizationMission,
    organization.description,
    organization.mission,
    prospect.role
  );
  const location = pickString(
    prospect.location,
    company.location,
    extraData.location,
    rawData.location,
    rawData.profileLocation,
    rawData.companyLocation,
    rawData.organizationLocation,
    organization.location
  );
  const companySize = pickString(
    prospect.company_size,
    prospect.company_size_range,
    prospect.size_range,
    company.size_range,
    company.company_size,
    extraData.company_size,
    extraData.companySize,
    extraData.size_range,
    rawData.company_size,
    rawData.companySize,
    rawData.size_range,
    organization.company_size,
    organization.companySize
  );
  const profileUrl = pickString(prospect.profile_url, prospect.linkedin_url, rawData.profileUrl, rawData.profile_url);
  const websiteUrl = pickString(
    prospect.website_url,
    prospect.website,
    rawData.website_url,
    rawData.companyWebsite,
    rawData.website,
    organization.website_url,
    organization.website
  );
  const rawText = [
    objectToSearchableText(rawData),
    objectToSearchableText(extraData),
    objectToSearchableText(company),
  ].join(" ");

  const roleText = [roleTitle, rawText].join(" ");
  const industryText = [roleTitle, companyName, companyDescription, rawText].join(" ");
  const locationText = [location, rawText].join(" ");
  const companySizeText = [companySize, rawText].join(" ");
  const fullProspectText = [prospect.decision_maker, roleTitle, companyName, companyDescription, location, rawText].join(" ");

  const targetDescriptionOverlap = Boolean(targetDescription)
    && hasMeaningfulOverlap(fullProspectText, targetDescription);

  const roleMatches = targetRoles.length > 0
    ? matchesAnyCriterion(roleText, targetRoles)
    : Boolean(targetDescription && hasMeaningfulOverlap(roleText, targetDescription, 1));

  const industryMatches = targetIndustries.length > 0
    ? matchesAnyCriterion(industryText, targetIndustries)
    : targetDescriptionOverlap;

  const locationMatches = targetLocations.length > 0
    ? matchesAnyCriterion(locationText, targetLocations)
    : Boolean(targetDescription && hasMeaningfulOverlap(locationText, targetDescription, 1));

  const companySizeMatches = targetCompanySizes.length > 0
    ? matchesAnyCriterion(companySizeText, targetCompanySizes)
    : false;

  const score = Math.min(100,
    (roleMatches ? 30 : 0) +
    (industryMatches ? 25 : 0) +
    (locationMatches ? 20 : 0) +
    (companySizeMatches ? 10 : 0) +
    (companyName ? 15 : 0) +
    (profileUrl || websiteUrl ? 10 : 0)
  );

  return {
    score,
    level: preScoreLevelFromScore(score),
    details: {
      role: roleMatches,
      industry: industryMatches,
      location: locationMatches,
      companySize: companySizeMatches,
      company: Boolean(companyName),
      url: Boolean(profileUrl || websiteUrl),
      targetDescriptionOverlap,
    },
  };
}
